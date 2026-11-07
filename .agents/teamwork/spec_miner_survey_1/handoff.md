# Handoff Report — Increment 1 Specification Mining

**Agent**: `teamwork_spec_miner` (`spec_miner_survey_1`)  
**Date**: 2026-11-07T12:12:00Z  
**Recipient**: Project Orchestrator (`fde194f5-9579-434b-9b81-d7bb7a515ef0`)  
**Report Type**: Hard Handoff (Task Complete)

---

## 1. Observation

Direct observations from repository files and specifications:

1. **Air-Gap and Browser Gate Requirements**:
   - `AGENTS.md` Rule 1 & Rule 2:
     > "Stack is fixed: React 18 + TypeScript strict + Vite static build, Chrome/Edge, File System Access API, papaparse, exifr, mp4box.js, hash-wasm, zod, vitest, Playwright, npm. No backend, no SSR, no telemetry, no remote fonts or assets."
     > "No network. The CSP sets `connect-src 'none'`. Do not add any fetch, beacon, or library that phones home."
   - `docs/consent-tagging/app-design.md` lines 16–17 & 32–35:
     > "Browsers: Current desktop Chrome or Edge. The File System Access API (open and write a folder) exists only there; the app shows a clear message in other browsers."
     > "Content Security Policy in `index.html`: `default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'`. `connect-src 'none'` makes 'no network calls' a browser-enforced fact, and a test checks the header is present."
   - `docs/consent-tagging/use-cases.md` R-05 & R-06:
     > "R-05: In a browser without the File System Access API the app shows one page explaining that Chrome or Edge is required, and nothing else."
     > "R-06: No file byte, filename or hash is sent over the network. The page's CSP has `connect-src 'none'`."

2. **Folder Ingestion & Asset Rules (UC-01)**:
   - `docs/consent-tagging/app-design.md` lines 43–47 & 133–148:
     > "Every file in the folder and its subfolders is an asset, except hidden files (names starting with `.`) and the app's own files (`.dct-progress.json`, `asset_export_*.csv`). Each gets an `asset_type` from its extension (§3.1)."
     > `assetId: string; // path relative to the folder, '/' separators`
     > `AssetType = 'image' | 'video' | 'audio' | 'sensor' | 'document' | 'other';`
   - `docs/consent-tagging/app-design.md` §3.1 lines 163–177:
     > Lists extension mappings: image (`.jpg`, `.jpeg`, `.png`, etc.), video (`.mp4`, `.mov`, etc.), audio (`.wav`, `.mp3`, etc.), sensor (`.csv`, `.tsv`, `.edf`, `.bin`, `.dat`), document (`.pdf`, `.docx`, etc.), other (anything else).
     > Custom extensions: "A lab can add extensions for its own devices with an optional `dct-types.json` in the collection folder (`{"sensor": [".edf", ".bin"]}`)..."
   - `docs/consent-tagging/app-design.md` lines 150–157:
     > "capturedAt, in order of preference: images — EXIF `DateTimeOriginal`, which has no time zone, so interpret it in `VITE_CAPTURE_TIMEZONE` (default `Asia/Kolkata`) and convert to UTC; MP4/MOV — the `mvhd` creation time (already UTC); everything else, or when those are missing — the file's `lastModified`."
     > "`sha256` is computed in the background after the folder opens, two files at a time, streamed in 8 MB chunks so a multi-gigabyte video never sits in memory; the asset list shows a hashing progress bar."
   - `AGENTS.md` Rule 4 & `use-cases.md` R-38:
     > "never modify an asset file — no conversion, re-encoding, renaming or metadata writing."

3. **Consented List Parsing & Validation Rules L01–L04 (UC-02)**:
   - `docs/consent-tagging/data-contract.md` lines 27–39 & 113–121:
     > Columns: `project_id, project_name, person_id, consent_id, display_name, contact_hint, consent_expires_at, is_minor, list_generated_at, list_valid_until`.
     > L01: A required list column is missing.
     > L02: The list holds more than one `project_id`, or none.
     > L03: `list_valid_until` is missing, invalid, or differs between rows.
     > L04: The same `person_id` appears twice.
   - `tools/validate_export.py` lines 89–109:
     > Exact Python implementation of `load_list` executing L01, L02, L03, and L04.
   - `AGENTS.md` Rule 8 & `docs/consent-tagging/app-design.md` §5:
     > "Names stay in memory. The consented list is never written to browser storage, the progress file, the URL, logs or error messages. The progress file holds identifiers only."

4. **Acceptance Tests (T-01, T-02, T-03)**:
   - `docs/consent-tagging/acceptance-tests.md` lines 9–11:
     > T-01: Opening sample collection lists 8 assets (`IMG-0001.png`...`DOC-0008.pdf`), types asset ×4, video, audio, sensor, document; nested file gets `sub/x.png`; unknown extension becomes `other`; `dct-types.json` mapping `.dat` to sensor applied; computed hashes equal those in `asset_export.sample.csv`; `VID-0005.mp4` gets capture time `06:40:00Z` from header; image without EXIF marked "capture time from file date".
     > T-02: Firefox shows only Chrome/Edge page; Chrome CSP has `connect-src 'none'` and Playwright records zero network requests.
     > T-03: Sample list loads (4 people, 2 not selectable); missing column, two project ids, mixed `list_valid_until` or duplicate `person_id` refused; `localStorage`, `sessionStorage`, `IndexedDB` contain no display name.

---

## 2. Logic Chain

1. **From Observation 1**: The DCT operates on sensitive data on local collection machines. Therefore, an air-gapped architecture with CSP `connect-src 'none'` and desktop Chrome/Edge requirement (checked via `window.showDirectoryPicker`) is a mandatory security and functional prerequisite before any folder operations can occur.
2. **From Observation 2**: Ingesting a collection folder requires scanning `FileSystemDirectoryHandle`, recursing subdirectories, omitting hidden files (`.`) and internal artifacts (`.dct-progress.json`, `asset_export_*.csv`), and normalizing all relative paths to forward slashes `/`. Asset types must support both default file extensions and collection-specific `dct-types.json` mappings.
3. **From Observation 2**: Performance and UI responsiveness depend on offloading SHA-256 computations to a Web Worker, streaming in 8MB chunks, and throttling to 2 files concurrently. Capture time extraction must parse EXIF `DateTimeOriginal` assuming `Asia/Kolkata` (converting to UTC `Z`) or MP4 `mvhd` creation time (already UTC) before falling back to `file.lastModified`. Asset files must remain untouched.
4. **From Observation 3**: Loading the consented list requires robust parsing via `papaparse` and `zod`, rejecting files with UTF-8 BOM, and validating rules L01–L04. Any violation rejects the whole list. Selectability must be computed for minors (`is_minor == true`) and expired consents (`consent_expires_at <= captured_at`), while ensuring `display_name` and `contact_hint` are kept strictly in-memory and never written to Web Storage, IndexedDB, URLs, or logs.
5. **From Observation 4**: Increment 1 completeness is objectively determined by the passing of acceptance tests T-01, T-02, and T-03 in vitest and Playwright.

---

## 3. Caveats

- **No Caveats**: All specifications for Increment 1 were directly extracted from authoritative documentation (`AGENTS.md`, `app-design.md`, `data-contract.md`, `use-cases.md`, `acceptance-tests.md`), the reference validator `tools/validate_export.py`, and sample datasets in `docs/consent-tagging/examples/`.
- Future increments (Workspace viewers in Increment 2, Export validation in Increment 3, Progress resume/corrections in Increment 4, Finish in Increment 5) were also surveyed and cataloged in the discovered features table to ensure full forward-compatibility of data structures.

---

## 4. Conclusion

The specification for Increment 1 is fully discovered, unambiguous, and comprehensively documented in:
- `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\spec_miner_survey_1\spec_report.md`

All implementation requirements, error codes, interface types, and acceptance criteria are ready for the architecture and implementation agents.

---

## 5. Verification Method

1. **Verify Report Artifact**:
   Inspect `.agents/teamwork/spec_miner_survey_1/spec_report.md` to confirm all 31 discovered features and 30 edge cases match the authoritative documentation.
2. **Verify Python Reference Validator**:
   Inspect `tools/validate_export.py` lines 89–109 to confirm the logic for L01, L02, L03, and L04.
3. **Verify Sample Collection Matches**:
   Inspect `docs/consent-tagging/examples/asset_export.sample.csv` and `docs/consent-tagging/examples/consented_list.sample.csv` to confirm exact SHA-256 hashes, capture times, and participant selectabilities.
