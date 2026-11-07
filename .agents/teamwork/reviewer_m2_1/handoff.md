# Milestone 2 Review and Adversarial Critique Report

## 1. Observation

### Source Files Inspected
- `src/folder/types.ts` (lines 1–114): Core data structures (`AssetType`, `CustomTypeMap`, `CustomTypesFile`, `CaptureTimeSource`, `CaptureTimeResult`, `IngestedAsset`, `FolderScanResult`, `FolderScanOptions`), Web Worker message protocol (`WorkerInboundMessage`, `WorkerOutboundMessage`), `HashJob`, and `AggregateProgress`.
- `src/folder/classifier.ts` (lines 1–184):
  - `VALID_ASSET_TYPES` and `DEFAULT_TYPE_EXTENSIONS`: Implements exact 6-type mapping per `docs/consent-tagging/app-design.md` §3.1 (`image`, `video`, `audio`, `sensor`, `document`, `other`).
  - `parseDctTypesJson`: Safe parsing with object validation, type checking, lowercase/dot normalization, and non-fatal warnings collection.
  - `classifyAsset`: Case-insensitive extension matching, custom mapping overrides precedence, and `'other'` fallback for unknown or extensionless files.
  - `hasNativePreview`: Distinguishes formats with native browser preview vs. type icon/size fallback.
- `src/folder/scanner.ts` (lines 1–166):
  - `normalizeAssetPath`: Backslash to forward slash normalization, collapses consecutive slashes, strips leading `./` and `/`, strips trailing `/`.
  - `isIgnoredFile` and `isIgnoredDirectory`: Omits hidden entries starting with `.` (e.g. `.git`, `.DS_Store`, `.dct-progress.json`) and export CSVs matching `/^asset_export.*\.csv$/i`.
  - `scanFolder`: Recursive `FileSystemDirectoryHandle` traversal, root `dct-types.json` detection and exclusion from `assets[]`, per-file error encapsulation in `warnings[]`, and deterministic natural sorting by `assetId`.
- `src/folder/captureTime.ts` (lines 1–303):
  - EXIF `DateTimeOriginal` extraction using `exifr` with local timezone conversion (`VITE_CAPTURE_TIMEZONE` / default `'Asia/Kolkata'` -> UTC `Z`), falling back to `file.lastModified` (`source: 'last_modified'`).
  - MP4/MOV ISO BMFF `mvhd` header extraction using `mp4box` in 256 KB streaming chunks (`source: 'mp4box'`), verifying `06:40:00Z` on `VID-0005.mp4`.
  - Pure date arithmetic and timezone conversion with two-pass DST refinement using native `Intl.DateTimeFormat`.
- `src/folder/sha256.ts` (lines 1–237):
  - Pure TypeScript FIPS 180-4 streaming engine (`StreamingSha256`) operating in 8 MB chunks without WebAssembly or eval, 100% compliant with strict CSP (`script-src 'self'`).
  - Pre-allocated 32-bit registers for constant ~8 MB RAM consumption even on multi-GB assets.
- `src/folder/hashWorker.ts` (lines 1–164) & `src/folder/hashManager.ts` (lines 1–343):
  - Dual-strategy Web Worker: native `SubtleCrypto` for <=8 MB, `StreamingSha256` for >8 MB.
  - Strict concurrency pool capping at max 2 concurrent workers with FIFO queue.
  - Aggregate byte-level progress reporting and cancellation handling.
  - Rule 4 Immutability Guarantee: Assets are read via `getFile()` and `slice()` only; zero modifications, conversions, renaming, or writes.
- `tests/unit/folder/mockFileSystem.ts` (lines 1–113): Mock FSA Directory and File handles with jsdom Blob/File polyfills.
- Unit Test Suites:
  - `tests/unit/folder/classifier.test.ts`: 20 unit tests.
  - `tests/unit/folder/scanner.test.ts`: 10 unit tests.
  - `tests/unit/folder/captureTime.test.ts`: 12 unit tests.
  - `tests/unit/folder/hashing.test.ts`: 17 unit tests.

### Verbatim Verification Tool Execution
1. **ESLint (`npm run lint`)**:
   ```text
   > dct-app@0.1.0 lint
   > eslint . --max-warnings 0
   (Exited with code 0)
   ```
2. **TypeScript Strict Typecheck (`npx tsc --noEmit`)**:
   ```text
   (Exited with code 0, 0 errors)
   ```
3. **Unit Tests (`npm test`)**:
   ```text
   RUN  v2.1.9 C:/Users/pc/.gemini/antigravity/scratch/dct-app

   ✓ tests/unit/security/csp.test.ts (3 tests) 19ms
   ✓ tests/unit/folder/classifier.test.ts (20 tests) 26ms
   ✓ tests/unit/folder/scanner.test.ts (10 tests) 205ms
   ✓ tests/unit/folder/captureTime.test.ts (12 tests) 223ms
   ✓ tests/unit/folder/hashing.test.ts (17 tests) 285ms
   ✓ tests/unit/browserGate.test.tsx (8 tests) 173ms

   Test Files  6 passed (6)
        Tests  70 passed (70)
     Duration  6.27s
   ```
4. **Vite Production Build (`npm run build`)**:
   ```text
   ✓ 33 modules transformed.
   dist/index.html                   0.71 kB │ gzip:  0.42 kB
   dist/assets/index-D4LLHXuC.css    8.07 kB │ gzip:  2.35 kB
   dist/assets/index-BxgXx4m0.js   144.85 kB │ gzip: 46.70 kB
   ✓ built in 3.88s
   (Exited with code 0)
   ```
5. **Python Reference Validator Suite (`python -m unittest tools/test_validate_export.py`)**:
   ```text
   Ran 20 tests in 0.074s
   OK
   ```
6. **Playwright E2E Suite (`npx playwright test`)**:
   ```text
   4 skipped
   30 passed (46.4s)
   (Exited with code 0)
   ```

### Fixture and Integrity Verification
- Verified byte-for-byte SHA-256 calculations on all 8 assets in `docs/consent-tagging/examples/sample-collection/` matching `asset_export.sample.csv` exactly:
  - `AUD-0006.wav` (`570475d23f0878b87d95de909a167e167297f98ad25c4061ab4ed7e59e820527`)
  - `DOC-0008.pdf` (`8491e3916b78e4a55b894f691ed66912a2699df2c33ceac2706d08cf4ac94aae`)
  - `IMG-0001.png` (`2180908ddf0ede06fd1be557ec0741028aaccc8f69030b0260c071490fe198e3`)
  - `IMG-0002.png` (`d7ccb67ce581735227576793a5ed283fe97658b7f3855985c954cef033cb928d`)
  - `IMG-0003.png` (`8bf338500e6e1049641dd043cca6cdc1c8883f475992b5ccdfe61aaf1c2d2227`)
  - `IMG-0004.png` (`252faa78eca702304cc17cbc026361d2c17607834b7869178174413a9fa3fd3c`)
  - `SNS-0007.csv` (`884016620503eb2fc868a7bb722723936bf152859da9acd610a2d175058162d4`)
  - `VID-0005.mp4` (`06020319b521122923f0c02ecdb030893d561ce6ccf9e3e596791e68de8e002b`)
- Capture time for `VID-0005.mp4` accurately extracted as `2026-11-04T06:40:00Z` (`source: 'mp4box'`).
- Image files without EXIF (`IMG-0001.png`–`IMG-0004.png`) correctly fall back to `file.lastModified` (`source: 'last_modified'`).

---

## 2. Logic Chain

1. **Integrity & Authenticity Check**:
   - Examination of `src/folder/sha256.ts` shows full FIPS 180-4 64-round message schedule implementation without hardcoded test vectors or precomputed dictionary maps.
   - Examination of `src/folder/classifier.ts` shows generic parsing and lookup logic against constant extension sets and dynamic `CustomTypeMap`, with no hardcoded filename bypasses.
   - Examination of `src/folder/scanner.ts` shows genuine asynchronous generator iteration over `FileSystemDirectoryHandle.values()` with natural sort and ignore filters.
   - Independent execution of all test suites confirmed zero fabrications in test logs or worker handoff reports.

2. **Compliance with User Requirements & Acceptance Criteria (T-01)**:
   - **R2 Folder Ingestion & Recursive Traversal**: `scanFolder` recursively traverses directories, excludes hidden files (`.`), progress metadata (`.dct-progress.json`), export CSVs (`asset_export_*.csv`), and root `dct-types.json`.
   - **Forward-Slash Paths**: `normalizeAssetPath` strictly normalizes paths with forward slashes (`/`), matching data contract `asset_id` specification.
   - **6-Type Classification**: `classifyAsset` accurately categorizes files into `image`, `video`, `audio`, `sensor`, `document`, and `other`, verified against the sample collection breakdown (4 image, 1 video, 1 audio, 1 sensor, 1 document).
   - **Background Streaming SHA-256 Hashing**: Web Worker implementation uses 8 MB chunks with `StreamingSha256`, avoiding blocking the UI thread and enforcing a maximum concurrency of 2 workers via `HashManager`.
   - **Capture Time Extraction**: Correctly parses EXIF `DateTimeOriginal` with `Asia/Kolkata` -> UTC conversion, extracts `06:40:00Z` from `VID-0005.mp4` headers via `mp4box`, and gracefully falls back to `file.lastModified`.
   - **Rule 4 Immutability**: All operations treat `FileSystemFileHandle` and `File` as read-only. Unit tests verify file size, name, timestamp, and content remain byte-for-byte unchanged before and after hashing.

3. **Code Quality and Architecture**:
   - Zero ESLint warnings under `@typescript-eslint/no-explicit-any: error`.
   - Clean modular architecture under `src/folder/` with clear contracts defined in `types.ts`.
   - Air-gapped CSP compliance maintained: zero external network calls, zero eval or dynamic code execution in pure TS hashing.

---

## 3. Adversarial Analysis & Stress-Testing

### Assumption & Stress-Test 1: Memory Pressure on Multi-Gigabyte Video Assets
- **Hypothesis**: Processing 4K/8K video files could exhaust browser memory if loaded whole into ArrayBuffers.
- **Verification**: `src/folder/hashWorker.ts` and `sha256.ts` enforce 8 MB chunk streaming (`file.slice(offset, nextOffset)`). `src/folder/captureTime.ts` reads only 256 KB slices for EXIF and streams 256 KB chunks for `mp4box.js` until the `mvhd` atom is parsed, then terminates parsing immediately.
- **Result**: PASS. RAM footprint remains constant (~8 MB) regardless of total asset file size.

### Assumption & Stress-Test 2: Concurrency Flooding & Resource Contention
- **Hypothesis**: Enqueuing hundreds of files could launch uncontrolled Web Workers, freezing the browser.
- **Verification**: `HashManager` strictly caps worker instances at `maxConcurrency = 2`. Excess jobs remain in a FIFO queue. Unit test in `hashing.test.ts` verified that peak active workers never exceeded 2 during burst queuing.
- **Result**: PASS.

### Assumption & Stress-Test 3: Malformed / Zero-Byte / Corrupted Media Files
- **Hypothesis**: Corrupted MP4 headers, truncated EXIF, or empty files could cause unhandled promise rejections during folder scanning.
- **Verification**: Unit tests in `captureTime.test.ts` pass zero-byte files, corrupted text files disguised as `.mp4`, and random bytes disguised as `.jpg`. The extractor safely catches errors and cleanly falls back to `file.lastModified` with `source: 'last_modified'`.
- **Result**: PASS.

### Assumption & Stress-Test 4: Path Traversals & OS-Specific Separators
- **Hypothesis**: Windows paths with backslashes (`sub\nested\image.png`), leading slashes, or redundant slashes could generate invalid `asset_id` values.
- **Verification**: `normalizeAssetPath` replaces all `\\` with `/`, strips leading `./` and `/`, collapses multiple slashes (`//+`), and strips trailing slashes.
- **Result**: PASS.

### Finding 1 (Minor / Non-Blocking)
- **What**: In `PROJECT.md` line 68, Milestone 2 is listed with Status `PLANNED` rather than `DONE`.
- **Where**: `PROJECT.md:68`.
- **Why**: Worker M2 implemented all M2 code and verified it, but left the milestone status table update to the review / orchestrator phase.
- **Recommendation**: Project Orchestrator can mark Milestone 2 as `DONE` in `PROJECT.md`.

---

## 4. Caveats

- End-to-end UI interaction on the Start screen (file picker dialog and table rendering) belongs to Milestone 4 and will be validated when UI integration is complete.
- Web Worker testing in Vitest is executed via custom worker factories and mock FileSystem handles; real browser worker execution is verified under Playwright in full end-to-end suite.

---

## 5. Conclusion

Milestone 2 (Folder Scanning, Asset Classification, Capture Time Extraction, and Streaming SHA-256 Hashing) is implemented with exceptional quality, full architectural compliance, zero integrity violations, and robust test coverage.

**Verdict: APPROVE**

---

## 6. Verification Method

To independently verify the implementation:
```bash
# 1. Run ESLint (must exit 0 with 0 warnings)
npm run lint

# 2. Run TypeScript strict typecheck (must exit 0 with 0 errors)
npx tsc --noEmit

# 3. Run all unit tests (must pass all 70 tests across 6 files)
npm test

# 4. Verify production build
npm run build

# 5. Run Playwright E2E suite (must pass 30 tests, 4 skipped)
npx playwright test

# 6. Run Python reference export validator suite (must pass 20 tests)
python -m unittest tools/test_validate_export.py
```

Invalidation conditions:
- Any TypeScript compilation failure or lint warning.
- Any mismatch in the 8 sample collection SHA-256 hashes against `asset_export.sample.csv`.
- Non-conforming capture time or source extracted from `VID-0005.mp4`.
- Memory spikes or unhandled exceptions when processing large or malformed asset files.
