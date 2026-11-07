# Milestone 2 Review and Adversarial Critique Handoff Report

## 1. Observation

### Source Code and Architecture Inspection
1. **`src/folder/captureTime.ts`**:
   - Lines 18–27 (`getDefaultCaptureTimezone`): Reads `import.meta.env.VITE_CAPTURE_TIMEZONE` and defaults to `'Asia/Kolkata'`.
   - Lines 29–77 (`parseDateComponents`): Robust parser supporting standard EXIF colon-separated formats (`2026:11:04 11:32:11`), ISO strings, and Date objects.
   - Lines 84–143 (`convertLocalToUtcIso`): Uses `Intl.DateTimeFormat` with two-pass offset computation to convert wall-clock time from `Asia/Kolkata` (+05:30) to UTC ISO 8601 strings ending in `Z`. Tested midnight roll-over across date boundaries (`02:00:00` local -> `20:30:00` UTC previous day).
   - Lines 157–236 (`extractMp4CreationTime`): Uses `mp4box.js` `createFile()`, streaming the MP4 file in 256 KB slices (`fileStart` offset tracked). Parses `mvhd` atom creation time, guards against uninitialized 1904/0 camera clocks (`info.created.getFullYear() > 1970`), and terminates early once `moov` atom is parsed (`settled = true`).
   - Lines 238–302 (`extractCaptureTime`): For images, reads initial 256 KB slice for EXIF `DateTimeOriginal` with `reviveValues: false` (preventing local browser timezone corruption) and tags output with `source: 'exif'`. For videos, calls `extractMp4CreationTime` tagging with `source: 'mp4box'`. All missing or failed metadata extraction falls back to `file.lastModified` formatted as UTC ISO `Z` string with `source: 'last_modified'`.
2. **`src/folder/sha256.ts`**:
   - Complete pure TypeScript FIPS 180-4 streaming engine (`StreamingSha256`). Pre-allocated 32-bit registers (`h` and `w`), standard constants `K`, bitwise operations (`rotr`, `ch`, `maj`, `sigma0/1`, `gamma0/1`), and 64-bit BigInt message length padding (`const totalBits = BigInt(this.bytesHashed) * 8n`). Constant ~8MB memory footprint regardless of file size, zero WASM dependencies, 100% compliant with strict CSP (`connect-src 'none'`, `script-src 'self'`).
3. **`src/folder/hashWorker.ts`**:
   - Dual-strategy Web Worker:
     - Files <= 8 MB: Fast native hardware-accelerated `crypto.subtle.digest`.
     - Files > 8 MB: Streaming `StreamingSha256` in 8 MB chunks with cooperative yielding (`setTimeout(0)`) between blocks.
   - Emits incremental `PROGRESS` messages with byte counts and percentages, handles cancellation (`CANCEL` message and `cancelledJobs` set), and reports completion `DONE` or `ERROR`.
4. **`src/folder/hashManager.ts`**:
   - Worker pool managing up to `maxConcurrency = 2` concurrent Web Workers with a FIFO queue.
   - Accurately tracks aggregate progress across queued, running, and completed files (`processedBytes = Math.min(this.completedBytes + activeBytes, this.totalBytes)`).
   - Graceful job and pool cancellation (`cancelJob`, `cancelAll`, `dispose`).
5. **`src/folder/classifier.ts` & `src/folder/scanner.ts`**:
   - 6-type classification (`image`, `video`, `audio`, `sensor`, `document`, `other`) covering all default extensions.
   - Root `dct-types.json` parsing with JSON syntax validation, normalization (missing dots, case insensitivity), and warning reporting.
   - Recursive directory traversal with forward-slash normalization (`normalizeAssetPath`), filtering out dotfiles (`.DS_Store`, `.git`, `.dct-progress.json`) and export CSVs (`asset_export_*.csv`), with deterministic natural sorting by `assetId`.
6. **Rule 4 Immutability Guarantee**:
   - AST and grep searches confirm zero occurrences of `createWritable`, `write`, `rename`, or file mutation methods across `src/folder/`. All file interactions are strictly read-only (`file.slice()`, `file.arrayBuffer()`, `file.text()`).

### Integrity Check
- Searched `src/folder/` for hardcoded values:
  - `VID-0005`: 0 occurrences in source code.
  - Hashes (`2180908...`, `060203...`): 0 occurrences in source code.
  - Timestamps (`06:40:00Z`): 0 occurrences in source code.
- Verified absence of dummy/facade implementations: `StreamingSha256` and `mp4box` streaming are authentic implementations that parse real binary data.
- **Integrity Verdict**: Zero integrity violations detected.

### Live Verification Command Outputs
1. **`npm test`**:
   ```text
   RUN v2.1.9 C:/Users/pc/.gemini/antigravity/scratch/dct-app
   ✓ tests/unit/folder/classifier.test.ts (20 tests)
   ✓ tests/unit/folder/captureTime.test.ts (12 tests)
   ✓ tests/unit/folder/hashing.test.ts (17 tests)
   ✓ tests/unit/folder/scanner.test.ts (10 tests)
   ✓ tests/unit/folder/adversarial.test.ts (24 tests)
   ✓ tests/unit/browserGate.test.tsx (8 tests)
   ✓ tests/unit/folder/adversarial_m2.test.ts (13 tests)
   ✓ tests/unit/security/csp.test.ts (3 tests)

   Test Files  8 passed (8)
        Tests  107 passed (107)
     Duration  18.10s
   ```
2. **`npm run build`** (`tsc --noEmit && vite build`):
   ```text
   > dct-app@0.1.0 build
   > tsc --noEmit && vite build

   vite v5.4.21 building for production...
   transforming...
   ✓ 33 modules transformed.
   rendering chunks...
   computing gzip size...
   dist/index.html                   0.71 kB │ gzip:  0.42 kB
   dist/assets/index-D4LLHXuC.css    8.07 kB │ gzip:  2.35 kB
   dist/assets/index-BxgXx4m0.js   144.85 kB │ gzip: 46.70 kB
   ✓ built in 3.11s
   ```
   Exit code: 0.
3. **`npm run lint`** (`eslint . --max-warnings 0`):
   ```text
   > dct-app@0.1.0 lint
   > eslint . --max-warnings 0
   ```
   Exit code: 0 (0 errors, 0 warnings).
4. **`npx playwright test`**:
   ```text
   Running 34 tests using 4 workers
   4 skipped
   30 passed (44.8s)
   ```
   Exit code: 0 across Chromium and Firefox.
5. **`python -m unittest tools/test_validate_export.py`**:
   ```text
   ....................
   ----------------------------------------------------------------------
   Ran 20 tests in 0.104s

   OK
   ```
   Exit code: 0 (20/20 tests pass).

### Sample Collection & Contract Verification
- Hashed the 8 reference assets in `docs/consent-tagging/examples/sample-collection/`:
  - `AUD-0006.wav`: `570475d23f0878b87d95de909a167e167297f98ad25c4061ab4ed7e59e820527`
  - `DOC-0008.pdf`: `8491e3916b78e4a55b894f691ed66912a2699df2c33ceac2706d08cf4ac94aae`
  - `IMG-0001.png`: `2180908ddf0ede06fd1be557ec0741028aaccc8f69030b0260c071490fe198e3`
  - `IMG-0002.png`: `d7ccb67ce581735227576793a5ed283fe97658b7f3855985c954cef033cb928d`
  - `IMG-0003.png`: `8bf338500e6e1049641dd043cca6cdc1c8883f475992b5ccdfe61aaf1c2d2227`
  - `IMG-0004.png`: `252faa78eca702304cc17cbc026361d2c17607834b7869178174413a9fa3fd3c`
  - `SNS-0007.csv`: `884016620503eb2fc868a7bb722723936bf152859da9acd610a2d175058162d4`
  - `VID-0005.mp4`: `06020319b521122923f0c02ecdb030893d561ce6ccf9e3e596791e68de8e002b`
  All 8 SHA-256 hashes match `asset_export.sample.csv` byte-for-byte.
- `VID-0005.mp4` creation time extracted: `2026-11-04T06:40:00Z` (`source: 'mp4box'`).
- PNG files without EXIF fall back to `lastModified` with `source: 'last_modified'`.

---

## 2. Logic Chain

1. **Integrity & Authenticity**: Observations 1 and 2 prove that `src/folder/` implements genuine streaming SHA-256 and metadata parsing logic without embedded answers, facades, or test-specific shortcuts.
2. **Contract Compliance**:
   - Timezone interpretation (Observation 1) converts `Asia/Kolkata` wall-clock time to UTC ISO 8601 strings ending in `Z` per ORIGINAL_REQUEST §R2 and PROJECT.md Feature 10.
   - MP4 header parsing via `mp4box.js` (Observation 1 and Sample Collection Verification) yields `2026-11-04T06:40:00Z` on `VID-0005.mp4` per PROJECT.md Feature 11.
   - Non-metadata files fall back to `file.lastModified` tagged with `source: 'last_modified'` per PROJECT.md Feature 12.
3. **Performance & Concurrency**:
   - Web Worker streaming in 8 MB chunks with BigInt message length padding (Observation 2 & 3) handles arbitrary file sizes (>4 GB) without memory bloat or integer overflow, keeping the main thread UI responsive.
   - The worker pool strictly enforces `maxConcurrency = 2` with FIFO queueing (Observation 4), validated under contention by both unit and adversarial test suites.
4. **Safety & Immutability**:
   - Zero file write handles or mutating operations are invoked (Observation 6), guaranteeing Rule 4 immutability.
5. **Quality Gates**:
   - All 107 unit/integration/adversarial tests pass (Observation: Live Verification 1).
   - TypeScript compilation under strict mode with `noUncheckedIndexedAccess` and Vite static production build pass with exit code 0 (Observation: Live Verification 2).
   - ESLint passes with 0 warnings (Observation: Live Verification 3).
   - 30 Playwright E2E tests pass under strict air-gapped CSP (Observation: Live Verification 4).
   - Python export validator tests pass 20/20 (Observation: Live Verification 5).

---

## 3. Caveats

- **moov Atom Location in Non-Fragmented MP4s**: When MP4/MOV files are not web-optimized (i.e. `moov` atom is at the physical end of the file rather than the beginning), `extractMp4CreationTime` reads 256 KB slices until the file end. For standard lab collection assets this is expected behavior, but very large un-optimized video files over slow storage may take proportional time to locate the atom.
- **HashManager Reuse**: In Milestone 2 `HashManager` is instantiated per folder scan. If a single instance is reused across multiple separate scan passes in Milestone 4, adding an explicit `.reset()` method is recommended so aggregate byte counters reset cleanly.
- No other caveats.

---

## 4. Conclusion

Milestone 2 implementation is thoroughly verified, robust against adversarial stress, and adheres strictly to all architectural constraints, data contracts, and integrity standards.

**Verdict**: **APPROVE**

---

## 5. Verification Method

To independently reproduce verification:
```bash
# 1. Run unit, integration, and adversarial tests
npm test

# 2. Run TypeScript strict typecheck & Vite static build
npm run build

# 3. Run ESLint zero-warning check
npm run lint

# 4. Run Playwright E2E test suite
npx playwright test

# 5. Run Python golden export validator tests
python -m unittest tools/test_validate_export.py
```

Invalidation conditions:
- Any TypeScript typecheck error under strict mode (`noUncheckedIndexedAccess: true`).
- Any failure in the 107 Vitest tests or 30 Playwright tests.
- Any hash discrepancy against `docs/consent-tagging/examples/asset_export.sample.csv`.
- Any mutation of input asset files.
