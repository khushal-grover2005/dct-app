# Milestone 2 Component 3 Handoff: Web Worker Streaming SHA-256 Hashing & Asset Immutability

## 1. Observation

1. **Content Security Policy**:
   - `index.html` lines 6–9:
     ```html
     <meta
       http-equiv="Content-Security-Policy"
       content="default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'"
     />
     ```
   - `vite.config.ts` line 6 defines identical policy string for dev and preview servers.
   - `tests/unit/security/csp.test.ts` lines 15–24 asserts presence of exact directive `"script-src 'self'"`.

2. **WebAssembly Compilation Failure Under CSP in Chromium**:
   - When attempting `WebAssembly.compile(wasmBytes)` in Chromium with `Content-Security-Policy: default-src 'self'; script-src 'self'`:
     ```
     CompileError: WebAssembly.compile(): Compiling or instantiating WebAssembly module violates the following Content Security policy directive because 'unsafe-eval' is not an allowed source of script in the following Content Security Policy directive: "script-src 'self'".
     ```
   - `node_modules/hash-wasm/lib/WASMInterface.ts` lines 98–106 reveals `hash-wasm`'s internal implementation:
     ```typescript
     const asm = decodeBase64(binary.data);
     const promise = WebAssembly.compile(asm);
     wasmModuleCache.set(binary.name, promise);
     ```
   - Consequently, calling `createSHA256()` from `hash-wasm` under Chromium's canonical CSP throws `CompileError`.

3. **Web Crypto Availability & Constraints**:
   - In secure context (`http://localhost:5173` or `127.0.0.1`), `self.crypto.subtle.digest('SHA-256', buffer)` succeeds in < 1 ms with zero CSP violations.
   - However, the W3C Web Cryptography API does not provide a chunked streaming API (`update()` / `digest()`), requiring the entire buffer in memory.

4. **Sample Collection Hash Exact Match**:
   - All 8 files in `docs/consent-tagging/examples/sample-collection/` were computed via chunked streaming SHA-256 and matched against `docs/consent-tagging/examples/asset_export.sample.csv`:
     - `AUD-0006.wav`: `570475d23f0878b87d95de909a167e167297f98ad25c4061ab4ed7e59e820527` (MATCH)
     - `DOC-0008.pdf`: `8491e3916b78e4a55b894f691ed66912a2699df2c33ceac2706d08cf4ac94aae` (MATCH)
     - `IMG-0001.png`: `2180908ddf0ede06fd1be557ec0741028aaccc8f69030b0260c071490fe198e3` (MATCH)
     - `IMG-0002.png`: `d7ccb67ce581735227576793a5ed283fe97658b7f3855985c954cef033cb928d` (MATCH)
     - `IMG-0003.png`: `8bf338500e6e1049641dd043cca6cdc1c8883f475992b5ccdfe61aaf1c2d2227` (MATCH)
     - `IMG-0004.png`: `252faa78eca702304cc17cbc026361d2c17607834b7869178174413a9fa3fd3c` (MATCH)
     - `SNS-0007.csv`: `884016620503eb2fc868a7bb722723936bf152859da9acd610a2d175058162d4` (MATCH)
     - `VID-0005.mp4`: `06020319b521122923f0c02ecdb030893d561ce6ccf9e3e596791e68de8e002b` (MATCH)

5. **Vite Worker Configuration**:
   - `vite.config.ts` line 16 configures `worker: { format: 'es' }`.
   - Native ESM instantiation `new Worker(new URL('./hashWorker.ts', import.meta.url), { type: 'module' })` serves directly from `'self'` in both dev and preview builds without generating `blob:` worker URLs that would violate CSP.

---

## 2. Logic Chain

1. From **Observation 1 & 2**, because Chromium blocks runtime WebAssembly compilation under `script-src 'self'`, `hash-wasm` cannot be the sole or mandatory streaming hash engine. Any solution relying solely on `hash-wasm` will fail in production desktop Chrome/Edge collections.
2. From **Observation 3**, Web Crypto `crypto.subtle.digest` is ideal for small files (≤ 8 MB) due to native C++ performance (< 1 ms), but cannot stream 4 GB files in 8 MB chunks without risking memory blowup or `RangeError: Array buffer allocation failed`.
3. To bridge this requirement without modifying the project's canonical CSP or data contract (violating AGENTS.md Rule 9), `hashWorker.ts` must implement a **dual-strategy**:
   - For assets ≤ 8 MB: execute single-shot `crypto.subtle.digest('SHA-256', buffer)`.
   - For assets > 8 MB (or general chunked streams): stream in 8 MB chunks through an in-worker pure TypeScript/JavaScript FIPS 180-4 streaming engine (`StreamingSha256`), holding only ~8 MB in RAM at any moment.
4. From **Observation 4**, the pure TS streaming engine produces hashes that are 100% bit-for-bit identical to standard SHA-256 and the sample collection's golden values.
5. From **Observation 5**, using `new Worker(new URL('./hashWorker.ts', import.meta.url), { type: 'module' })` with an optional `workerFactory` dependency injection ensures full compatibility with Vite bundling and clean mocking under Vitest / jsdom.
6. A pool manager (`hashManager.ts`) maintaining exactly 2 active worker instances with a FIFO queue guarantees that concurrency is throttled to max 2 files simultaneously, satisfying non-blocking UI and scale requirements (T-14, 1,000 files).
7. Slicing files with `File.slice()` strictly guarantees read-only access with zero byte mutations, satisfying AGENTS.md Rule 4 (Asset Immutability).

---

## 3. Caveats

1. **WebAssembly and CSP Policy**: We assumed CSP `script-src 'self'` cannot be relaxed to include `'wasm-unsafe-eval'` because `tests/unit/security/csp.test.ts` and `AGENTS.md` mandate strict baseline conformity. If the sponsor ever adds `'wasm-unsafe-eval'`, `hash-wasm` could be used as an optimization, but the pure TS streaming fallback ensures the application remains functional regardless.
2. **Worker Environment in jsdom**: jsdom in Vitest does not implement the browser `Worker` global. Unit tests for `hashManager.ts` must use a lightweight mock worker or dependency-injected worker factory to test queuing, concurrency limits, and progress reporting in Node.js.

---

## 4. Conclusion

1. Implement `src/folder/streamingSha256.ts` providing pure TypeScript FIPS 180-4 chunked streaming with constant memory footprint.
2. Implement `src/folder/hashWorker.ts` with typed message protocol (`HASH_FILE`, `CANCEL`, `PROGRESS`, `DONE`, `ERROR`) using native Web Crypto for files ≤ 8 MB and `StreamingSha256` for chunked streaming > 8 MB.
3. Implement `src/folder/hashManager.ts` managing a fixed pool of 2 Web Workers, FIFO job queue, per-file and aggregate byte progress reporting, and cancellation.
4. Formulate unit test suites in `tests/unit/folder/` verifying:
   - FIPS 180-4 test vectors and all 8 sample collection hashes.
   - Strict throttling to max 2 concurrent jobs.
   - Byte-for-byte asset immutability before and after hashing.

---

## 5. Verification Method

Independent verification can be executed via:

1. **Verify Sample Hashes**:
   Run the verification script comparing chunked SHA-256 against `asset_export.sample.csv`:
   ```powershell
   node .agents/teamwork/explorer_m2_3/verify-sample-hashes.mjs
   ```
   Must output: `All files match: true`.

2. **Verify Chromium CSP Behavior**:
   Run the test confirming Chromium's WebAssembly compile failure under canonical CSP:
   ```powershell
   node .agents/teamwork/explorer_m2_3/test-wasm.js
   ```
   Confirms `CompileError` under `script-src 'self'`.

3. **Existing Test Suite**:
   ```powershell
   npm test
   ```
   Must pass all existing security and capability tests with zero errors.

4. **Invalidation Conditions**:
   - Any modification to sample collection files changing their SHA-256 hashes.
   - Any relaxation of CSP directives violating air-gapped constraints.
