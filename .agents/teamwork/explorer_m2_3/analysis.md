# Technical Analysis: Web Worker Streaming SHA-256 Hashing & Asset Immutability

**Component**: Milestone 2 Component 3 — `src/folder/hashWorker.ts` & `src/folder/hashManager.ts`  
**Author**: `explorer_m2_3`  
**Date**: 2026-11-07  

---

## 1. Executive Summary

This investigation analyzes the architecture, execution model, security compliance, and verification protocols for background streaming SHA-256 calculation and asset immutability within the Data Collection Tool (DCT).

### Core Findings
1. **CSP & WebAssembly Incompatibility in Chromium**:
   - The application enforces a strict Content Security Policy:
     `default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'`
   - Chromium strictly blocks runtime `WebAssembly.compile()` or `WebAssembly.instantiate()` calls from in-memory buffers under `script-src 'self'` without `'wasm-unsafe-eval'`.
   - Empirically verified via Playwright Chromium: `hash-wasm`'s `createSHA256()` throws:
     `CompileError: WebAssembly.compile(): Compiling or instantiating WebAssembly module violates the following Content Security policy directive because 'unsafe-eval' is not an allowed source of script in the following Content Security Policy directive: "script-src 'self'"`
   - Neither `'unsafe-eval'` nor `'wasm-unsafe-eval'` is permitted in CSP per `AGENTS.md` and `tests/unit/security/csp.test.ts`.
2. **Dual-Strategy Hashing Architecture**:
   - **Small files (≤ 8 MB)**: Execute via native Web Crypto `crypto.subtle.digest('SHA-256', buffer)` inside the worker. Native C++ execution in Chromium is near-instantaneous (< 1ms for sample files).
   - **Large files (> 8 MB, up to multi-gigabytes)**: Stream in 8 MB chunks using an in-worker pure TypeScript/JavaScript FIPS 180-4 compliant SHA-256 streaming engine (`StreamingSha256`). This eliminates all WebAssembly/CSP dependency while guaranteeing constant ~8 MB RAM consumption even for 4 GB video assets.
3. **Sample Collection Hash Accuracy**:
   - All 8 files in `docs/consent-tagging/examples/sample-collection/` were computed with chunked streaming and verified byte-for-byte against `docs/consent-tagging/examples/asset_export.sample.csv`. Verification passed 100%.
4. **Concurrency Pool Manager (`hashManager.ts`)**:
   - Maintains a fixed pool of **max 2 concurrent Web Workers** to prevent OS thread exhaustion and UI freezes during large folder ingestion (e.g. 1,000 files in T-14).
   - Manages a FIFO job queue with non-blocking lifecycle, per-file progress events, aggregate byte-level progress reporting, and graceful cancellation.
5. **Asset Immutability (Rule 4)**:
   - Asset ingestion and hashing strictly utilize read-only handles (`File.slice()`, `File.arrayBuffer()`). No file handle `createWritable()` is ever invoked on asset files.

---

## 2. Security & Runtime Architecture: Vite & CSP Compliance

### 2.1 Content Security Policy & Worker Origin
In `index.html`:
```html
<meta
  http-equiv="Content-Security-Policy"
  content="default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'"
/>
```
Key architectural considerations:
1. **Worker Source Directive**:
   - The CSP does not specify `worker-src`. Under W3C CSP Level 3, workers fall back to `child-src`, and then to `default-src 'self'`.
   - Workers loaded via `blob:` URLs (e.g., `new Worker(URL.createObjectURL(blob))`) are **strictly blocked** by the browser under this policy.
2. **Vite Worker Instantiation**:
   - Vite provides native ESM worker instantiation:
     ```typescript
     const worker = new Worker(
       new URL('./hashWorker.ts', import.meta.url),
       { type: 'module' }
     );
     ```
   - In `vite.config.ts`, `worker.format` is set to `'es'`:
     ```typescript
     worker: {
       format: 'es',
     },
     ```
   - In development mode (`npm run dev`), Vite serves the worker module directly from the same origin (`http://127.0.0.1:5173/src/folder/hashWorker.ts`).
   - In production preview/build (`npm run build`), Vite compiles the worker into a dedicated script chunk in `dist/assets/hashWorker-[hash].js`.
   - Both modes load the worker from `'self'`, complying 100% with `script-src 'self'` and `default-src 'self'`.

### 2.2 Empirical Analysis of Hashing Engines Under CSP
We performed empirical tests inside headless Chromium (Playwright) enforcing the project's exact CSP.

| Hashing Engine | Implementation Mechanism | Behavior Under CSP `script-src 'self'` | Suitability for DCT |
|---|---|---|---|
| **`hash-wasm`** | Decodes embedded base64 WASM binary and calls `WebAssembly.compile(bytes)` | **FAILS**: Throws `CompileError: Compiling or instantiating WebAssembly module violates CSP because 'unsafe-eval' is not allowed in "script-src 'self'"` | ❌ Cannot be primary hasher under CSP without `'wasm-unsafe-eval'` |
| **`crypto.subtle.digest`** | Browser native C++ Web Crypto implementation | **PASSES**: Runs natively in secure context (`localhost` / `127.0.0.1`) without CSP violation | ⚠️ Single-shot only (no streaming API); cannot stream multi-GB files in 8MB chunks without loading full buffer |
| **Pure TS `StreamingSha256`** | 32-bit bitwise arithmetic (`Uint32Array`) in worker thread | **PASSES**: Zero WASM, zero `eval`, zero external fetches, 100% CSP compliant. Streams 8MB chunks with constant memory | ✅ Ideal for chunked streaming of files > 8MB |

### 2.3 Dual-Strategy Hashing Architecture in `hashWorker.ts`
To maximize both performance and security:
1. **Files ≤ 8 MB**:
   - Read via `file.arrayBuffer()` in a single read.
   - Digest using native `self.crypto.subtle.digest('SHA-256', buffer)`.
   - Convert `ArrayBuffer` to hex string:
     ```typescript
     const hashArray = Array.from(new Uint8Array(digestBuffer));
     const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
     ```
   - Speed: < 1 ms per file (native hardware-accelerated C++).
2. **Files > 8 MB (e.g., multi-gigabyte video/sensor captures)**:
   - Sliced into 8 MB chunks via `file.slice(offset, offset + CHUNK_SIZE)`.
   - Fed into `StreamingSha256.update(chunkBuffer)`.
   - After updating internal state `(h0..h7)`, the chunk ArrayBuffer is discarded for immediate garbage collection.
   - Emits incremental progress back to the main thread after each chunk.
   - Finalizes hash with `hasher.digest()`.
   - Peak memory usage remains strictly bounded at ~8 MB regardless of total file size (e.g., 4 GB file).

---

## 3. Hash Accuracy Verification: Sample Collection

The 8 sample files in `docs/consent-tagging/examples/sample-collection/` were verified against `docs/consent-tagging/examples/asset_export.sample.csv`.

| Asset File | Size | Expected SHA-256 (`asset_export.sample.csv`) | Computed SHA-256 (Chunked Streaming) | Match Status |
|---|---|---|---|---|
| `AUD-0006.wav` | 96,138 bytes | `570475d23f0878b87d95de909a167e167297f98ad25c4061ab4ed7e59e820527` | `570475d23f0878b87d95de909a167e167297f98ad25c4061ab4ed7e59e820527` | **EXACT MATCH** |
| `DOC-0008.pdf` | 1,616 bytes | `8491e3916b78e4a55b894f691ed66912a2699df2c33ceac2706d08cf4ac94aae` | `8491e3916b78e4a55b894f691ed66912a2699df2c33ceac2706d08cf4ac94aae` | **EXACT MATCH** |
| `IMG-0001.png` | 10,481 bytes | `2180908ddf0ede06fd1be557ec0741028aaccc8f69030b0260c071490fe198e3` | `2180908ddf0ede06fd1be557ec0741028aaccc8f69030b0260c071490fe198e3` | **EXACT MATCH** |
| `IMG-0002.png` | 10,876 bytes | `d7ccb67ce581735227576793a5ed283fe97658b7f3855985c954cef033cb928d` | `d7ccb67ce581735227576793a5ed283fe97658b7f3855985c954cef033cb928d` | **EXACT MATCH** |
| `IMG-0003.png` | 10,377 bytes | `8bf338500e6e1049641dd043cca6cdc1c8883f475992b5ccdfe61aaf1c2d2227` | `8bf338500e6e1049641dd043cca6cdc1c8883f475992b5ccdfe61aaf1c2d2227` | **EXACT MATCH** |
| `IMG-0004.png` | 9,141 bytes | `252faa78eca702304cc17cbc026361d2c17607834b7869178174413a9fa3fd3c` | `252faa78eca702304cc17cbc026361d2c17607834b7869178174413a9fa3fd3c` | **EXACT MATCH** |
| `SNS-0007.csv` | 4,849 bytes | `884016620503eb2fc868a7bb722723936bf152859da9acd610a2d175058162d4` | `884016620503eb2fc868a7bb722723936bf152859da9acd610a2d175058162d4` | **EXACT MATCH** |
| `VID-0005.mp4` | 87,103 bytes | `06020319b521122923f0c02ecdb030893d561ce6ccf9e3e596791e68de8e002b` | `06020319b521122923f0c02ecdb030893d561ce6ccf9e3e596791e68de8e002b` | **EXACT MATCH** |

---

## 4. Concurrency Pool Manager Architecture (`hashManager.ts`)

### 4.1 Requirements & Concurrency Constraints
- Maximum concurrency: strictly **2 files at a time** (`maxConcurrency = 2`).
- Prevents CPU/thread starvation when scanning large collections (e.g. 1,000 files in T-14).
- Maintains UI responsiveness (< 200 ms keyboard/selection interaction).
- Reports real-time per-file progress (0–100%) and aggregate folder progress (total bytes / completed bytes).

### 4.2 Pool State & Scheduling Logic
`HashManager` manages:
1. **Worker Pool (`workers: WorkerSlot[]`)**:
   - Contains exactly 2 slots:
     ```typescript
     interface WorkerSlot {
       id: number;
       worker: Worker;
       currentJob: HashJob | null;
       isBusy: boolean;
     }
     ```
   - Workers are instantiated once on initialization (or lazily on first job) and reused across all files.
2. **Pending FIFO Queue (`queue: HashJob[]`)**:
   - Holds jobs waiting for an available worker slot.
3. **Dispatch Cycle**:
   - `dispatchNext()` finds the first idle worker slot and dequeues the next `HashJob`.
   - Sends `HASH_FILE` command with structured clone of `file`.
   - Updates `slot.isBusy = true`.
   - If both slots are busy, subsequent files wait in the FIFO queue.
4. **Aggregate Progress Tracking**:
   - `totalBytes = sum(file.size for all queued/active/completed files)`
   - `completedBytes = sum(size of all finished files)`
   - `activeBytes = sum(bytesProcessed of currently active 2 files)`
   - `aggregatePercent = Math.round(((completedBytes + activeBytes) / totalBytes) * 100)`
   - Emits `onAggregateProgress({ totalAssets, completedAssets, totalBytes, processedBytes, overallPercent })`.

### 4.3 Cancellation & Lifecycle Teardown
- `cancelJob(assetId)`: sends `CANCEL` message to the worker executing the asset, or removes it from `queue` if pending.
- `cancelAll()`: drains the pending queue, posts `CANCEL` to all active workers, and emits cancellation events.
- `dispose()`: terminates all Web Workers via `worker.terminate()`, releasing OS threads and clearing all state.

---

## 5. Pure TypeScript Streaming SHA-256 Engine (`src/folder/streamingSha256.ts`)

To ensure 100% CSP compliance and eliminate runtime compilation errors, the streaming hasher implements the standard FIPS 180-4 SHA-256 specification using 32-bit typed arrays:

```typescript
export class StreamingSha256 {
  private h: Uint32Array; // 8 x 32-bit state words
  private buffer: Uint8Array; // 64-byte block staging buffer
  private bufferLength: number;
  private bytesHashed: number;
  private w: Uint32Array; // 64-word schedule array

  constructor();
  public update(chunk: Uint8Array): this;
  public digest(): string; // 64-character lowercase hex string
}
```

### Key Engineering Attributes:
- **Zero Allocations in Loop**: Pre-allocated `Uint32Array(64)` for block expansion schedule `w`.
- **Bitwise Precision**: Uses unsigned 32-bit operations (`>>>`, `&`, `^`, `|`) with `| 0` truncation matching CPU register operations.
- **End-of-Stream Padding**: Conforms to FIPS 180-4 bit-length big-endian 64-bit length appending.
- **Constant Memory Footprint**: Keeps only the 64-byte residual block between 8 MB chunk ingestions.

---

## 6. Worker Message Contract Specification

### 6.1 Main Thread → Worker (`WorkerInboundMessage`)
```typescript
export type WorkerInboundMessage =
  | {
      type: 'HASH_FILE';
      jobId: string;
      assetId: string;
      file: File | Blob;
      chunkSizeBytes?: number; // default: 8 * 1024 * 1024
    }
  | {
      type: 'CANCEL';
      jobId: string;
    };
```

### 6.2 Worker → Main Thread (`WorkerOutboundMessage`)
```typescript
export type WorkerOutboundMessage =
  | {
      type: 'PROGRESS';
      jobId: string;
      assetId: string;
      bytesProcessed: number;
      totalBytes: number;
      percent: number; // 0..100
    }
  | {
      type: 'DONE';
      jobId: string;
      assetId: string;
      sha256: string;
      totalBytes: number;
      durationMs: number;
    }
  | {
      type: 'ERROR';
      jobId: string;
      assetId: string;
      error: string;
    }
  | {
      type: 'CANCELLED';
      jobId: string;
      assetId: string;
    };
```

---

## 7. Asset Immutability Protocol (Rule 4)

AGENTS.md Rule 4 mandates:
> "never modify an asset file — no conversion, re-encoding, renaming or metadata writing. The sheet binds metadata to each file by path and SHA-256 (app-design.md §9)."

### Architectural Guarantees:
1. **Read-Only Ingestion**:
   - The worker receives a read-only `File` or `Blob` reference.
   - Only `file.slice()` and `file.arrayBuffer()` are called.
   - Slicing creates read-only sub-blobs without touching filesystem timestamps or file handles.
2. **Handle Isolation**:
   - Asset `FileSystemFileHandle` instances are stored in the asset catalog for reading only.
   - `fileHandle.createWritable()` is strictly prohibited for assets.
   - The application only opens write streams for `.dct-progress.json` and `asset_export_*.csv`.
3. **Immutability Verification Suite**:
   - Tests verify that `file.name`, `file.size`, `file.lastModified`, and binary contents are identical before and after scanning and hashing.

---

## 8. Vitest Test Environment & Mocking Strategy

In `vitest.config.ts`, tests run under `environment: 'jsdom'`. Because jsdom does not include a native `Worker` implementation:
1. **Dependency Injection**:
   - `HashManager` constructor accepts an optional `workerFactory?: () => Worker`.
   - In production browser runtime, defaults to:
     ```typescript
     () => new Worker(new URL('./hashWorker.ts', import.meta.url), { type: 'module' })
     ```
2. **Test Double / Mock Worker (`MockHashWorker`)**:
   - In unit tests, a mock worker simulates the message channel asynchronously via `queueMicrotask` or `setTimeout(0)`.
   - Simulates chunked progress messages (e.g. at 50% and 100%) and final `DONE` events.
   - Allows deterministic assertion of concurrency limits: asserts that `activeJobs.length <= 2` at all moments in time.
3. **Direct Worker Unit Testing**:
   - `StreamingSha256` is tested directly without workers across edge cases:
     - 0-byte file (empty string hash: `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`)
     - 1-byte file, 63-byte file, 64-byte file, 65-byte file (block boundary testing)
     - Standard test vectors ("abc", "abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")
     - Chunk sizes: 1 byte, 17 bytes, 1,024 bytes, 8 MB
     - Sample collection 8 assets exact match verification.

---

## 9. Implementation File Layout for Worker Subsystem

```
src/folder/
├── streamingSha256.ts   # Pure TS FIPS 180-4 streaming SHA-256 (zero WASM/CSP safe)
├── hashWorker.ts        # Web Worker entry point (dual strategy: subtle for <=8MB, streaming for >8MB)
├── hashManager.ts       # Concurrency pool manager (max 2 workers, FIFO queue, progress)
└── hashTypes.ts         # Shared TypeScript interfaces & message contracts
tests/unit/folder/
├── streamingSha256.test.ts # FIPS 180-4 vectors, boundary checks, chunking tests
├── hashWorker.test.ts      # Worker message protocol, cancellation, error events
└── hashManager.test.ts     # Max 2 concurrency, queue draining, progress aggregation, immutability
```
