# Session Log

## 2026-11-13 — Increment 4: Resume, Corrections & Deletion Requests

### What Changed
- Added `.dct-progress.json` reading, Zod validation, folder reconciliation (`missing`, `untagged`, `changed — check tags`), active held asset resolution, and 7-day list deletion reminder computation in `src/folder/progressReader.ts`, `src/folder/fsHelpers.ts`, and `src/folder/sha256.ts`.
- Wired resume detection, `RESUME_MISMATCH` enforcement across both folder-first and list-first open orders, held-state tracking, and `ResumeBanner` on `src/ui/StartScreen.tsx` and `src/app/useAppPipeline.ts`.
- Updated `src/tagging/` (`types.ts`, `selectors.ts`, `reducer.ts`, `useTaggingWorkspace.ts`, `AssetListPane.tsx`, `PeoplePanel.tsx`, `TaggingWorkspace.tsx`) and `src/viewers/CenterViewerPane.tsx` to restore saved tags on resume, flag missing/changed/untagged assets, lock held bystander decrements above 0 until redaction or deletion (R-34), and exclude deleted assets from non-applicable review warnings.
- Implemented `src/corrections/` (`types.ts`, `correctionSheetWriter.ts`, `useCorrections.ts`, `CorrectionsScreen.tsx`, `index.ts`) and routed `/corrections` in `src/app/App.tsx`:
  - Held asset resolution: **I redacted it** re-hashes from disk via File System Access API, refuses unchanged SHA-256, and clears bystander count while keeping tagged people (R-31); **I deleted it** checks file removal or deletes after single confirmation and records `state = 'deleted'` (R-32).
  - Deletion requests: paste or load `asset_id`s, categorize found vs not found in folder, single-confirmation batch removal, and `deleted` correction rows (R-35, R-36).
  - Correction export: builds and validates a correction-only sheet with same `collection_ref`, new `export_id`, collision-safe filename, and `.dct-progress.json` `saves[]` tracking (R-33).
- Added unit tests (`tests/unit/folder/progressReader.test.ts`, `tests/unit/corrections/correctionSheetWriter.test.ts`, `tests/unit/corrections/useCorrections.test.tsx`, `tests/unit/tagging/resumeReducer.test.ts`) and Chromium E2E tests (`e2e/corrections-resume.spec.ts`) covering T-10, T-11, T-12, and R-37.

### Tests Passing
- `npm run lint` (`eslint . --max-warnings 0`): passes (0 errors, 0 warnings).
- `npx tsc --noEmit`: passes.
- `npm run build`: passes (`dist/` built cleanly).
- `npm test` (single worker): **350/350 tests pass** across **28/28 files**.
- `npx playwright test --project=chromium`: **31 passed, 1 skipped** (Firefox-only T-02.5 check skipped in Chromium), including T-10, T-11, T-12, and T-14 (R-37), with `tools/validate_export.py` reporting `VALID: 1 rows, 1 assets, 0 errors, 0 warnings` on saved redaction and deletion correction sheets.
- `python -m unittest tools/test_validate_export.py`: **20/20 pass**.

### Deferred
- Full multi-browser `npm run e2e` remains Chromium-only on this host because Playwright's Firefox executable is missing from the local browser cache.

### Questions Added
- None.

## 2026-11-13 — Increment 3 (Track B): Review & Save Sheet

### What Changed
- Added the review/export module: ordered CSV rows and RFC-compliant serialization, UUID v4 export IDs, sanitized sheet filenames, folder writing and download-copy support.
- Added the Review screen with validation/readiness errors, per-asset navigation, held/file-date/hash/filename warnings, summary counts, and save/download actions.
- Connected Review navigation to the tagging workspace and records each successful export in `.dct-progress.json` without storing participant names or contact hints.
- Added focused sheet-writer and review workflow tests, plus T-08/T-09 Playwright coverage including Python validation of the saved sample sheet.

### Tests Passing
- `npm test -- --maxWorkers=1 --minWorkers=1`: **334/334 tests pass** (24 files). In this environment the pre-existing untracked sample `.dct-progress.json` was temporarily moved out of the sample folder for the suite’s eight-file fixture assertion, then restored; Node 26 required `NODE_OPTIONS=--localstorage-file=...`, and serial workers avoided contention on that storage file.
- `npm run lint`: passes.
- `npm run typecheck`: passes.
- `npm run build`: passes (Vite reports the existing large-chunk advisory).
- `npm run e2e -- --project=chromium`: **27 passed, 1 skipped**, including T-08/T-09 and Python validation of the saved sample export.
- `python -m unittest tools/test_validate_export.py`: **20/20 pass**.

### Deferred
- Full `npm run e2e` could not complete because the host Playwright Firefox cache lacks `firefox.exe`; Chromium coverage passes. No project configuration was changed to hide this environment limitation.

### Questions Added
- None.

## 2026-11-11 — Increment 3 (Track A): TypeScript Export Validator Port & T-07 Golden Cases Parity Suite

### What Changed
- Implemented `src/validation/types.ts`: Typed data contract v1 interfaces (`ValidationFinding`, `ValidationReport`, `ValidationReportJson`, `ExportCsvRow`, `ExportRowType`, `ListRuleCode`, `ExportRuleCode`, `ExportWarningCode`, `InputErrorCode`, `LoadedListContext`, `LoadedListPersonEntry`) enforcing identifier-only validation contexts (`AGENTS.md` Rule 8).
- Implemented `src/validation/validateExport.ts`: Faithful rule-for-rule port of `tools/validate_export.py` covering:
  - Consented list rules `L01–L04` in short-circuit order (`loadListFromParsedCsv`) plus in-memory `ConsentedListResult` conversion (`createListContextFromConsentedList`).
  - Export rules `E01–E16` and warnings `W01–W02` across `validateExportCsv`, `validateExportWithConsentedList`, and `validateExportRowsWithConsentedList`.
  - Strict UTF-8 BOM rejection (`BOM_NOT_ALLOWED`), RFC 4180 CSV parsing with whitespace trimming and extra-column handling (`parseCsvStrict`), calendar-validated ISO 8601 UTC `Z` microsecond timestamp parsing (`parseExportTimestampMicroseconds` / `parseExportTimestamp`), and JSON report serialization (`toJson()`).
- Implemented `src/validation/index.ts`: Barrel export for the validation module.
- Added automated test suites:
  - `tests/unit/validation/goldenCases.test.ts` (**Acceptance Test T-07 / R-25**): Verifies all 18 golden cases in `docs/consent-tagging/examples/golden/expected.json` via both `validateExportCsv` and `validateExportWithConsentedList`, verifies zero participant PII in findings (`Rule 8`), and verifies field-for-field JSON output equality against `tools/validate_export.py --json`.
  - `tests/unit/validation/validateExport.test.ts`: Mirrors all sample and rule tests in `tools/test_validate_export.py` (`L01–L04`, `E01–E16`, `W01–W02`, BOM guards, calendar rollover dates, and microsecond boundaries).

### Tests Passing
- `npm test`: **325/325 unit & integration tests pass** (22/22 test files, including 56 tests in `goldenCases.test.ts` and 24 tests in `validateExport.test.ts`).
- `npm run e2e`: **39 passed, 13 skipped** (browser capability skips across Chromium & Firefox), 0 failed.
- `npm run lint`: Exits 0, **0 errors, 0 warnings** (`eslint . --max-warnings 0`).
- `npx tsc --noEmit`: Exits 0, **0 errors** (TypeScript strict mode).
- `npm run build`: Production static bundle in `dist/` builds cleanly.
- `python -m unittest tools/test_validate_export.py`: **20/20 test cases pass**.
- **Acceptance Tests Formally Passed**: **T-07** (plus Increment 1 & 2 regressions **T-01–T-06**, **T-15**).

### Deferred
- Increment 3 (Track B on `feat/increment-3-review-export`): Sheet writer (`src/review/sheetWriter.ts`), Review & Save screen (`src/review/ReviewScreen.tsx`), Workspace/App navigation wiring, and Acceptance Tests **T-08** & **T-09**.
- Increment 4: Resume from `.dct-progress.json` on Start Screen, missing/new/changed detection, redaction & deletion correction flows (**T-10–T-12**).
- Increment 5: Full accessibility audit (axe), 1,000-asset / 4 GB scale pass, filename PII warning, 7-day list-deletion reminder, and user guide (**T-13, T-14, T-16**).

### Questions Added
- None.

## 2026-11-10 — Increment 2 Complete: Tagging Workspace, Multi-Modal Viewers, Debounced Progress File & Full Acceptance Verification (T-04, T-05, T-06, T-15)

### What Changed
- Implemented three-pane **Tagging Workspace** (`src/tagging/`) with additive view switching from `src/app/App.tsx` (`'start' | 'workspace'`) and `Back to Start` flushing progress while preserving Increment 1 Start Screen:
  - `src/tagging/types.ts`, `src/tagging/selectors.ts`, `src/tagging/reducer.ts`, `src/tagging/useTaggingWorkspace.ts`: Immutable tagging state machine enforcing `R-10..R-21`, `R-40`, `R-41` — idempotent person selection (no duplicate IDs, zero manual ID inputs per `Rule 3`), per-asset minor/expired/`list_valid_until` selectability gating, bystander stepper `0..20`, `"bystander only — delete this file"` error state, mutually exclusive `"No person"` toggle, video/audio review-to-end & external confirmation tracking, and asset state/type/path filters.
  - `src/tagging/AssetListPane.tsx`: Left pane showing image and first-frame video thumbnails (or type icons), status/bystander badges, `X of Y done` counter & progress bar, status/type filters, path filter, and accessible selection.
  - `src/tagging/PeoplePanel.tsx`: Right pane showing modality-specific headings (incl. `"People heard in this recording"` for audio), live per-asset selectability evaluation (`minor`, `consent expired 3 Nov`, R-12 post-`list_valid_until` banner + newer-list trigger), name/contact-hint search (`/` focus, `Enter` select first match), removable chips, bystander stepper, and `"No person"` toggle.
  - `src/tagging/TaggingWorkspace.tsx`: Pointer-resizable 3-pane layout (`1280×720+`), subheader with background hashing & auto-save status, and global keyboard shortcuts (`↑`/`↓`/`←`/`→`, `Space`, `+`/`-`/`0`, `/`, `n`, `b`).
- Implemented **Multi-Modal Viewers** (`src/viewers/`):
  - `src/viewers/ImageViewer.tsx`: `blob:` image viewer with zoom (`25%..500%`, `+`/`-`/`0`, wheel), drag-to-pan, 90° rotation, and automatic decode-failure fallback.
  - `src/viewers/VideoViewer.tsx`: `<video>` player with scrubbing, speed (`0.5×`–`2×`), `±1f` (`1/30s`) frame stepping, furthest-played / play-to-end tracking, and external-review confirmation.
  - `src/viewers/AudioViewer.tsx`: Offline Web Audio API waveform canvas with click-to-scrub, playback speed (`0.5×`–`2×`), mute toggle, and review-to-end tracking.
  - `src/viewers/SensorViewer.tsx`: 512 KB chunked text preview displaying first 200 lines + total line count for `.csv`/`.tsv`/`.json`/`.jsonl`/`.txt`/`.log` (tested 200/202 on `SNS-0007.csv`) and binary metadata card for `.bin`/`.edf`/`.dat`.
  - `src/viewers/DocumentViewer.tsx` & `src/viewers/mimeTypes.ts`: Sandboxed `application/pdf` `blob:` iframe (`frame-src blob:`) and zero-copy typed `blob:` URL helper without mutating raw asset bytes (`Rule 4`).
  - `src/viewers/FallbackViewer.tsx` & `src/viewers/CenterViewerPane.tsx`: Header with `asset_id`, type, `captured_at`, source badge, size, duration, Prev/Next navigation, plus standardized fallback UI (`"No preview in app — view this file in your usual viewer, then tag it here"`, external-review toggle for unplayable media like `.mkv` or decode-failed files, direct tagging for `.heic`).
- Implemented identifiers-only debounced progress file writer (`src/folder/progressWriter.ts`) writing `.dct-progress.json` (`dct.progress` v1, temp file + atomic `move()` / fallback cleanup, serialized queue on `flush()`, zero names or contact hints per `Rule 8`).
- Updated `vite.config.ts` (`fs.realpathSync` canonical root resolution) for reliable Vite HTML bundling across symlinked/junctioned directories.
- Added automated test suites:
  - Unit tests: `tests/unit/tagging/reducer.test.ts`, `tests/unit/folder/progressWriter.test.ts`, `tests/unit/tagging/TaggingWorkspace.test.tsx`, `tests/unit/viewers/viewers.test.tsx`, plus updated transition assertion in `tests/unit/ui/StartScreen.test.tsx`.
  - Playwright E2E suite: `e2e/tagging-workspace.spec.ts` verifying **T-04, T-05, T-06, T-15**, **T-02** zero network requests, real video/audio playback to end, sensor/PDF/fallback viewers, keyboard shortcuts, `1280×720` resizable layout, and zero-PII `.dct-progress.json` persistence.

### Tests Passing
- `npm test`: **245/245 unit & integration tests pass** (20/20 test files).
- `npm run e2e`: **39 passed, 13 skipped** (browser capability skips across Chromium & Firefox), 0 failed.
- `npm run lint`: Exits 0, **0 errors, 0 warnings** (`eslint . --max-warnings 0`).
- `npx tsc --noEmit`: Exits 0, **0 errors** (TypeScript strict mode).
- `npm run build`: Production static bundle in `dist/` builds cleanly.
- `python -m unittest tools/test_validate_export.py`: **20/20 test cases pass**.
- **Acceptance Tests Formally Passed**: **T-04**, **T-05**, **T-06**, **T-15** (plus Increment 1 regression **T-01**, **T-02**, **T-03**).

### Deferred
- Increment 3: TypeScript validator port (`src/validation/validateExport.ts` + golden cases), review screen, and CSV sheet export.
- Increment 4: Resume from `.dct-progress.json` on Start Screen, missing/new/changed detection, redaction & deletion correction flows.
- Increment 5: Full accessibility audit (axe), 1,000-asset / 4 GB scale pass, filename PII warning, 7-day list-deletion reminder, and user guide.

### Questions Added
- None.

## 2026-11-08 — Increment 1 Complete: Shell, Ingestion, Streaming SHA-256, Consented List & Full Acceptance Verification (T-01, T-02, T-03)

### What Changed
- Validated complete implementation of Increment 1 across Milestones 1–5:
  - **App Shell & Browser Gate**: Enforces desktop Chrome/Edge (`window.showDirectoryPicker` check) with fallback screen for unsupported browsers (`R-05`). Strict CSP (`connect-src 'none'`) with zero external network calls.
  - **Collection Ingestion (UC-01)**: Recursive directory traversal with forward-slash relative `asset_id` paths (`R-01`, `R-02`). 6-category asset classification (`image`, `video`, `audio`, `sensor`, `document`, `other`) with `dct-types.json` overrides.
  - **Streaming Cryptographic Hashing**: Background Web Worker computing SHA-256 in 8 MB chunks via Web Crypto / FIPS 180-4 pure TS streaming, constant ~8 MB RAM ceiling (`R-04`). Computed hashes match sample collection exactly. Raw assets 100% byte-pristine (`R-38`).
  - **Capture Time Extraction**: EXIF `DateTimeOriginal` in `Asia/Kolkata` -> UTC `Z` for images, `mvhd` creation time (`06:40:00Z`) for `VID-0005.mp4`, and `lastModified` fallback (`R-03`).
  - **Consented List Parsing (UC-02)**: PapaParse + Zod schema validation enforcing rules L01–L04 with whole-list rejection. Dynamic selectability checking identifying minors (`is_minor == true`) and expired consents (`R-07`, `R-10`, `R-11`).
  - **Privacy Invariants**: Participant names and contact hints remain strictly in volatile RAM. Verified zero PII in `localStorage`, `sessionStorage`, `IndexedDB`, URLs, or console logs (`R-08`).
  - **Start Screen UI**: Interactive dashboard with folder picker, live asset table with status badges and hashing progress, consented list loader, summary cards, and participant table.
  - Fixed test time-boundary mocks in unit and E2E suites to pin reference evaluation time (`2026-11-05T12:00:00Z`).

### Tests Passing
- `npm test`: **227/227 unit and integration tests pass** (16/16 test suites) with zero failures.
- `npx playwright test`: **36 passed, 10 skipped** (browser capability skips) across Chromium and Firefox, 0 failed.
- `npm run lint`: Exits 0, **0 errors, 0 warnings** (`eslint . --max-warnings 0`).
- `npx tsc --noEmit`: Exits 0, **0 errors** under TypeScript strict mode.
- `npm run build`: Production static bundle succeeds cleanly in `dist/`.
- `python -m unittest tools/test_validate_export.py`: **20/20 test cases pass**.
- **Acceptance Tests Formally Passed**:
  - **T-01** (Folder loading & metadata): PASSED.
  - **T-02** (Browser gate & air-gapped zero network): PASSED.
  - **T-03** (Consented list loading & memory privacy): PASSED.

### Deferred
- Increment 2: Tagging workspace, multi-modal viewers (image zoom/pan, video/audio review-to-end tracking, sensor text, PDF), people panel with chips, bystander stepper (0–20), and "No Person" toggle.

### Questions Added
- None.

## 2026-11-07 — Milestone 4: Start Screen UI, Folder Ingestion & Consented List Flow (UC-01 & UC-02)

### What Changed
- Implemented `src/ui/types.ts`: Interface definitions for UI state contracts (`FolderUiState`, `ListUiState`, `AppPipeline`, `StartScreenProps`).
- Implemented `src/app/useAppPipeline.ts`: Reactive state management hook connecting folder scanning (`scanFolder`), background streaming SHA-256 Web Worker pool (`HashManager`), and consented list parsing (`loadConsentedList`) with selectability synchronization and memory safeguards.
- Implemented `src/ui/FolderSection.tsx`: Collection folder picker, folder name badge, asset count badge, 6-type breakdown badges, unclassified 'other' files warning, and aggregate SHA-256 hashing progress bar.
- Implemented `src/ui/AssetTable.tsx`: Tabular view of ingested assets with monospace forward-slash paths (`/`), semantic type badges, capture timestamps, source badges (`EXIF`, `MP4 header`, `capture time from file date`), and streaming full SHA-256 hash display.
- Implemented `src/ui/ListSection.tsx`: Consented list file loader supporting file picker uploads and programmatic test automation with reset after change.
- Implemented `src/ui/ListErrorBanner.tsx`: Whole-list error banner displaying rule codes (`[L01]`, `[L02]`, `[L03]`, `[L04]`, `[BOM_NOT_ALLOWED]`) and descriptive messages without leaking personal data.
- Implemented `src/ui/ListSummary.tsx`: Summary metric cards for project name, project ID (read-only), total participants, selectable count, non-selectable count, and `list_valid_until`.
- Implemented `src/ui/ParticipantTable.tsx`: In-memory participant table preview showing person ID, display name, contact hint, consent expiry, status chips, and selectability reasons (`minor`, `consent expired 3 Nov`).
- Implemented `src/ui/StartScreen.tsx`: Top-level 3-step Start screen coordinator with collection reference input prefilled from folder name and "Start tagging" action button enabled when collection is verified.
- Implemented `src/ui/index.ts`: Barrel export for all UI components and types.
- Integrated `src/app/App.tsx`: Wired with `useAppPipeline` and `StartScreen` while preserving `#app-shell`, heading, "Air-Gapped" badge, and browser capability verification.
- Implemented Vitest integration suite `tests/unit/ui/StartScreen.test.tsx` (7 tests covering initial layout, folder ingestion, hashing progress, list loading, whole-list refusal, and privacy invariant).
- Implemented Playwright E2E suite `e2e/start-screen.spec.ts` (covering Acceptance Tests T-01, T-02, and T-03).
- Updated `PROJECT.md`: Marked Milestone 3 and Milestone 4 as DONE.

### Tests Passing
- `npm test`: 197/197 unit and integration tests pass (14/14 test suites) including `tests/unit/ui/StartScreen.test.tsx`.
- `npm run lint`: Exits 0, 0 errors, 0 warnings (`eslint . --max-warnings 0`).
- `npx tsc --noEmit`: Exits 0, 0 errors under TypeScript strict mode.
- `npm run build`: Production static bundle succeeds cleanly (`dist/` build in 8.87s).
- `npx playwright test`: 32 passed, 6 skipped (browser capability skips) across Chromium and Firefox, including `e2e/start-screen.spec.ts`.
- `python -m unittest tools/test_validate_export.py`: 20/20 test cases pass.

### Deferred
- Increment 2 (Milestone 5+): Three-pane tagging workspace (image/video/audio viewers, chips, steppers, bystanders) and metadata export generation.

### Questions Added
- None.

## 2026-11-07 — Milestone 2: Folder Ingestion, Asset Classification, Capture Time Extraction & Streaming SHA-256 Hashing

### What Changed
- Implemented `src/folder/types.ts`: Core data structures (`AssetType`, `CustomTypeMap`, `CustomTypesFile`, `CaptureTimeSource`, `CaptureTimeResult`, `IngestedAsset`, `FolderScanResult`, `FolderScanOptions`, worker message contracts, `HashJob`, `AggregateProgress`).
- Implemented `src/folder/classifier.ts`:
  - 6-type classification (`image`, `video`, `audio`, `sensor`, `document`, `other`) covering default extensions per `app-design.md` §3.1.
  - Safe parsing of `dct-types.json` with syntax validation, normalization, and warning tracking.
  - Precedence handling for lab custom extension overrides.
  - Native browser preview helper (`hasNativePreview`).
- Implemented `src/folder/scanner.ts`:
  - Recursive traversal of `FileSystemDirectoryHandle`.
  - Platform-agnostic path normalization with `/` separators for `asset_id`.
  - Automatic exclusion of hidden files/directories (`.git`, `.DS_Store`, `.dct-progress.json`, etc.) and export CSVs (`asset_export_*.csv`).
  - Detection and parsing of root `dct-types.json` while excluding it from `assets[]`.
  - Deterministic natural sorting of assets by `assetId`.
- Implemented `src/folder/captureTime.ts`:
  - EXIF `DateTimeOriginal` extraction using `exifr` with local timezone conversion (`VITE_CAPTURE_TIMEZONE` / `Asia/Kolkata` -> UTC `Z`), falling back to `file.lastModified` (`source: 'last_modified'`).
  - MP4/MOV ISO BMFF `mvhd` header extraction using `mp4box` in 256 KB streaming chunks (`source: 'mp4box'`), verifying `06:40:00Z` on `VID-0005.mp4`.
  - Pure date arithmetic and timezone conversion with two-pass DST refinement using native `Intl.DateTimeFormat`.
  - Universal buffer and text reading helpers resilient in both browser and jsdom/test environments.
- Implemented `src/folder/sha256.ts`:
  - Pure TypeScript FIPS 180-4 streaming engine (`StreamingSha256`) operating in 8 MB chunks without WebAssembly or eval, 100% compliant with strict CSP (`script-src 'self'`).
  - Pre-allocated 32-bit registers for constant ~8 MB RAM consumption even on multi-GB assets.
- Implemented `src/folder/hashWorker.ts` and `src/folder/hashManager.ts`:
  - Web Worker implementing dual-strategy hashing (native `SubtleCrypto` for <=8 MB, `StreamingSha256` for >8 MB).
  - Concurrency pool manager enforcing strictly max 2 concurrent workers with FIFO queue.
  - Per-file progress events, aggregate byte-level folder progress reporting, and graceful cancellation.
  - Strict Rule 4 immutability: zero byte modifications, read-only file handle usage.
- Implemented `src/folder/index.ts`: Barrel file exporting all folder module APIs.
- Implemented comprehensive unit test suites in `tests/unit/folder/`:
  - `tests/unit/folder/mockFileSystem.ts`: Mock FileSystemDirectoryHandle and FileSystemFileHandle with jsdom polyfills.
  - `tests/unit/folder/classifier.test.ts`: 20 unit tests covering all formats, case insensitivity, `dct-types.json` parsing and overrides, and preview capabilities.
  - `tests/unit/folder/scanner.test.ts`: 10 unit tests covering path normalization, ignore rules, sample collection simulation, recursion, and deterministic sorting.
  - `tests/unit/folder/captureTime.test.ts`: 12 unit tests covering pure date/timezone conversions, `VID-0005.mp4` extraction (`06:40:00Z`), PNG fallback to `lastModified`, and error recovery.
  - `tests/unit/folder/hashing.test.ts`: 17 unit tests verifying pure FIPS 180-4 vectors, byte-for-byte exact SHA-256 match on all 8 sample assets, worker pool max 2 concurrency, progress aggregation, cancellation, and Rule 4 immutability.

### Tests Passing
- `npm run lint`: Exits 0, 0 errors, 0 warnings (`eslint . --max-warnings 0`).
- `npx tsc --noEmit`: Exits 0, 0 errors (TypeScript strict mode enforced with zero `any`).
- `npm test`: 70/70 unit tests pass (100% pass across all 6 test suites).
- `npm run build`: Production static bundle succeeds (`dist/` build in 2.75s).
- `npx playwright test`: 30 passed, 4 skipped, 0 failed across Chromium and Firefox.
- `python -m unittest tools/test_validate_export.py`: 20/20 test cases pass.

### Deferred
- Milestone 3: Consented list CSV parsing and L01–L04 validation rules.
- Milestone 4: Start screen UI view integration, folder picker connection, and asset table presentation.

### Questions Added
- None.

## 2026-11-07 — Milestone 1 (Iteration 2): Browser Capability Hardening & Adversarial Stress Immunity

### What Changed
- Hardened `src/app/capabilities.ts` (`isFileSystemAccessSupported`): Wrapped `window.showDirectoryPicker` property inspection in `try...catch { return false; }` to safely handle throwing accessors (`SecurityError`, `DOMException` in sandboxed iframes or restricted enterprise policy contexts).
- Hardened `src/app/BrowserGate.tsx`: Added defensive evaluation of capability and `supportedOverride` (handling object wrapper overrides via `valueOf()` with `try...catch`), guaranteeing that `<BrowserGate>` never crashes React render and always gracefully presents `#browser-gate-unsupported`.
- Augmented `tests/unit/browserGate.test.tsx`:
  - Upgraded `afterEach` teardown with safe descriptor restoration (`Object.getOwnPropertyDescriptor` / `Object.defineProperty`).
  - Added unit test verifying `isFileSystemAccessSupported()` returns `false` without throwing when `window.showDirectoryPicker` getter throws `SecurityError`.
  - Added unit test verifying `<BrowserGate>` renders ONLY `#browser-gate-unsupported` without crashing when property access throws.
  - Added unit test verifying `<BrowserGate>` handles throwing `supportedOverride` gracefully.
- Augmented `e2e/t02-browser-network.spec.ts`:
  - Added E2E test `T-02.8` verifying throwing property access on `window.showDirectoryPicker` in Chromium renders `#browser-gate-unsupported` without unhandled errors or DOM leakage.
  - Optimized `T-02.4` wait state to `domcontentloaded`.
- Hardened `e2e/t02-adversarial-csp.spec.ts`:
  - Upgraded rogue server teardown in `afterAll` with `closeAllConnections?.()`.
  - Expanded Invariant 3 cancellation error texts with `net::ERR_ABORTED` and `NS_BINDING_ABORTED`.
  - Increased `securitypolicyviolation` event window to 500ms in `ADV-CSP-09`.
  - Verified `ADV-CSP-04` beacon assertion handles both Chromium queueing and Firefox synchronous rejection under CSP.

### Tests Passing
- `npm run lint`: Exits 0, 0 errors, 0 warnings (`eslint . --max-warnings 0`).
- `npx tsc --noEmit`: Exits 0, 0 errors (strict mode enforced).
- `npm test`: 11/11 unit tests pass (100% pass across `tests/unit/browserGate.test.tsx` and `tests/unit/security/csp.test.ts`).
- `npx vitest run --config .agents/teamwork/challenger_m1_1/vitest.stress.config.ts`: 8/8 adversarial stress unit tests pass with zero uncaught errors.
- `npm run build`: Static production bundle in `dist/` builds cleanly.
- `npx playwright test`: 30 passed, 4 skipped, 0 failed across Chromium and Firefox (Acceptance Test T-02 and adversarial CSP suites).
- `npx playwright test --config .agents/teamwork/challenger_m1_1/playwright.stress.config.ts`: 6/6 corner cases pass (100% pass, zero unhandled errors).
- `python -m unittest tools/test_validate_export.py`: 20/20 test cases pass.

### Deferred
- Milestone 2: Folder ingestion, recursive scanning, 6-type asset classification, Web Worker streaming SHA-256 hashing, and EXIF/MP4 capture time extraction.
- Milestone 3: Consented list CSV parsing and L01–L04 validation rules.
- Milestone 4: Start screen UI view integration and asset table.

### Questions Added
- None.

## 2026-11-07 — Milestone 1: Toolchain Scaffold, Security / CSP, and Browser Gate


### What Changed
- Initialized project manifest (`package.json`) with React 18, Vite static build, TypeScript strict mode, Tailwind CSS, PostCSS, ESLint flat config, Vitest, Playwright, and core dependencies (`papaparse`, `zod`, `exifr`, `mp4box`, `hash-wasm`, `@types/wicg-file-system-access`).
- Configured TypeScript (`tsconfig.json`, `tsconfig.node.json`) with `strict: true`, `noImplicitAny: true`, and path alias `@/*`.
- Configured `vite.config.ts` (with `server: { hmr: false }` and strict CSP headers) and `vitest.config.ts`.
- Configured `index.html` with canonical air-gapped Content Security Policy meta tag:
  `default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'`.
- Configured ESLint (`eslint.config.js`) enforcing `@typescript-eslint/no-explicit-any: error` and zero warnings.
- Created ambient and window type augmentations (`src/types/mp4box.d.ts`, `src/types/file-system-access.d.ts`, `src/vite-env.d.ts`).
- Implemented capability detection (`src/app/capabilities.ts`) for `window.showDirectoryPicker`.
- Implemented `BrowserGate.tsx` displaying the exact requirement screen in unsupported browsers:
  `"This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly."` and mounting `App.tsx` shell in supported browsers.
- Implemented unit tests (`tests/unit/browserGate.test.tsx`, `tests/unit/security/csp.test.ts`) and Playwright E2E suite (`e2e/t02-browser-network.spec.ts`).

### Tests Passing
- `npm run lint`: Exits 0, 0 errors, 0 warnings.
- `npx tsc --noEmit`: Exits 0, 0 errors.
- `npm test`: 8/8 unit tests pass across `tests/unit/security/csp.test.ts` and `tests/unit/browserGate.test.tsx`.
- `npm run build`: Static build in `dist/` succeeds with 0 errors.
- `npx playwright test`: 11 passed, 3 skipped (browser targets), 0 failed across Chromium and Firefox verifying Acceptance Test T-02, zero network requests under CSP, and browser gate fallback.
- `python -m unittest tools/test_validate_export.py`: 20/20 test cases pass.

### Deferred
- Milestone 2: Folder ingestion, recursive scanning, 6-type asset classification, Web Worker streaming SHA-256 hashing, and EXIF/MP4 capture time extraction.
- Milestone 3: Consented list CSV parsing and L01–L04 validation rules.
- Milestone 4: Start screen UI view integration and asset table.

### Questions Added
- None.
