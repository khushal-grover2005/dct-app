# Dispatch Log

## 2026-11-07T11:55:43Z

Build Increment 1 of the Data Collection Tool (DCT), an air-gapped, production client-side browser application for lab collection agents that satisfies UC-01 (Open a collection folder) and UC-02 (Load the consented list). The application runs entirely offline without external API calls or network dependencies, keeping all participant data strictly on the local client.

Working directory: C:\Users\pc\.gemini\antigravity\scratch\dct-app
Integrity mode: development

Reference material:
- AGENTS.md
- docs/consent-tagging/overview.md
- docs/consent-tagging/app-design.md
- docs/consent-tagging/data-contract.md
- docs/consent-tagging/use-cases.md
- docs/consent-tagging/implementation-plan.md
- docs/consent-tagging/acceptance-tests.md
- tools/validate_export.py
- tools/test_validate_export.py

## Requirements

### R1. Air-Gapped App Shell, Security, and Browser Gate (UC-01, UC-02)
Set up the Vite + React 18 + TypeScript (`strict`) client-side application with Tailwind/CSS tokens, ESLint (`no-explicit-any: error`), vitest, and Playwright. Configure `index.html` with Content Security Policy `connect-src 'none'`. Ensure the application is completely air-gapped with zero external network requests or remote API calls after initial page load. Display an unsupported browser screen in browsers lacking the File System Access API (`window.showDirectoryPicker`), requiring Chrome or Edge.

### R2. Collection Folder Ingestion and Background Processing (UC-01)
Implement the Start screen folder picker using `window.showDirectoryPicker({ mode: 'readwrite' })`. Recursively scan all files in the folder and subfolders (excluding hidden files starting with `.` and app files `.dct-progress.json`, `asset_export_*.csv`). Extract `asset_id` as the relative path with `/` separators. Classify assets into six types (`image`, `video`, `audio`, `sensor`, `document`, `other`) per app-design.md §3.1, supporting custom extensions via `dct-types.json`. Compute SHA-256 hashes in a background Web Worker (streaming 8MB chunks via Web Crypto / `hash-wasm`) without freezing UI responsiveness. Extract capture times from EXIF `DateTimeOriginal` (interpreting in Asia/Kolkata timezone and converting to UTC ISO 8601 with `Z`) for images, `mvhd` header creation time via `mp4box.js` for MP4/MOV, or fall back to file `lastModified`. Ensure asset files are never modified, renamed, or re-encoded.

### R3. Consented List Loading, Validation, and Privacy Invariants (UC-02)
Load and parse consented CSV lists via papaparse and Zod, strictly enforcing data contract rules L01–L04 (refusing invalid lists whole with descriptive reasons). Evaluate participant selectability by marking minors (`is_minor == true`) and consents expired at the asset capture time as non-selectable with reasons. Strictly enforce the privacy invariant: participant display names and contact hints remain in memory only and are never written to `localStorage`, `sessionStorage`, `IndexedDB`, URLs, or application logs.

## Acceptance Criteria

### Browser Gate and Air-Gapped Security
- [ ] In unsupported browsers lacking `window.showDirectoryPicker`, the app displays only the Chrome/Edge requirement message.
- [ ] `index.html` contains CSP `connect-src 'none'`, and Playwright tests verify zero network calls during execution (T-02).

### Folder Scanning and Metadata Ingestion
- [ ] Opening `examples/sample-collection/` lists 8 assets with correct `asset_id` paths and classifies them into expected types (4 image, 1 video, 1 audio, 1 sensor, 1 document) (T-01).
- [ ] Subfolder files retain forward-slash relative paths (e.g. `sub/x.png`), unknown extensions classify as `other`, and collection-level `dct-types.json` overrides apply (T-01).
- [ ] SHA-256 hashes computed via background Web Worker match `docs/consent-tagging/examples/asset_export.sample.csv` exactly (T-01).
- [ ] `VID-0005.mp4` extracts capture time `06:40:00Z` from header, and images without EXIF fall back to file lastModified marked accordingly (T-01).
- [ ] Asset files are confirmed byte-for-byte unchanged before and after processing.

### Consented List Parsing and Invariants
- [ ] Loading `docs/consent-tagging/examples/consented_list.sample.csv` correctly parses 4 people, identifying 2 non-selectable individuals (minor and expired consent) (T-03).
- [ ] Consented lists violating L01–L04 (missing columns, multiple project IDs, mixed `list_valid_until`, duplicate `person_id`) are rejected whole with descriptive errors (T-03).
- [ ] Browser storage (`localStorage`, `sessionStorage`, `IndexedDB`), URLs, and console logs contain zero participant names or contact hints (T-03).

### Verification and Quality Bar
- [ ] Acceptance tests T-01, T-02, and T-03 pass under vitest and Playwright.
- [ ] `python -m unittest tools/test_validate_export.py` passes all 20 tests.
- [ ] `npm run lint` (`eslint`) and `tsc --noEmit` pass with zero errors.
- [ ] Increment 1 progress and test results are logged at the top of `docs/consent-tagging/session-log.md`.
