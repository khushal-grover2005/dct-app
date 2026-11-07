# Specification Mining Report — Increment 1

**Tool**: Data Collection Tool (DCT)  
**Target Increment**: Increment 1 · App Shell, Folder & List Loading, Asset Classification, Capture Times, Streaming Hashing  
**Date**: 2026-11-07  
**Author**: teamwork_spec_miner (`spec_miner_survey_1`)  
**Authoritative Sources**:
- `AGENTS.md`
- `docs/consent-tagging/overview.md`
- `docs/consent-tagging/app-design.md`
- `docs/consent-tagging/data-contract.md`
- `docs/consent-tagging/use-cases.md`
- `docs/consent-tagging/implementation-plan.md`
- `docs/consent-tagging/acceptance-tests.md`
- `docs/consent-tagging/data-handling.md`
- `tools/validate_export.py` & `tools/test_validate_export.py`
- `docs/consent-tagging/examples/*` (`consented_list.sample.csv`, `asset_export.sample.csv`, `sample-collection/`, `golden/expected.json`)

---

## 1. Executive Summary & Increment 1 Mission

Increment 1 establishes the production client-side foundation of the Data Collection Tool (DCT). The application is an air-gapped, zero-network, browser-based SPA for collection agents on collection machines. It allows opening a folder of captured multi-modal assets, classifying them, extracting device capture times (or file fallback), computing SHA-256 digests in background workers without freezing the UI, and loading/validating a project's consented participant list while strictly guarding personal data in-memory.

---

## 2. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | Browser Gate | File System Access API Check | Evaluates whether `window.showDirectoryPicker` is supported by the browser | Browser environment (`window`) | Boolean capability flag; renders unsupported screen if false | Displays single message explaining Chrome or Edge desktop requirement; blocks all other UI | `app-design.md` §1, §2.1; `use-cases.md` R-05; `acceptance-tests.md` T-02 |
| 2 | Air-Gap Security | Strict CSP Enforcement | `index.html` meta tag enforces `connect-src 'none'`, preventing any network egress | Browser HTTP stack / network calls | Network requests blocked at engine level | Any `fetch`, `XHR`, `WebSocket`, or beacon fails immediately | `AGENTS.md` Rule 2; `app-design.md` §1; `ORIGINAL_REQUEST.md` R1 |
| 3 | Folder Ingestion | Directory Picker Ingestion | Prompts agent to select collection directory with readwrite permissions | User click on "Open collection folder"; Directory Handle | `FileSystemDirectoryHandle` reference stored in memory | User abort/rejection handled gracefully without crash | `app-design.md` §1, §2.1; `use-cases.md` UC-01 |
| 4 | Folder Ingestion | Recursive Directory Scan | Traverses picked folder and all subfolders to discover asset files | `FileSystemDirectoryHandle` | Array of asset file handles and relative paths | Skips inaccessible entries or alerts on FS errors | `app-design.md` §2.1; `use-cases.md` R-01; `ORIGINAL_REQUEST.md` R2 |
| 5 | Folder Ingestion | Hidden File & Internal Exclusion | Automatically filters out hidden files (names starting with `.`) and app artifacts | Discovered directory entries | Filtered stream containing only asset files | N/A (silently excluded) | `app-design.md` §2.1; `use-cases.md` R-01 |
| 6 | Folder Ingestion | Asset ID Normalization | Constructs `asset_id` as the relative path from collection root using `/` separators | Path segments from directory traversal | String `asset_id` (e.g. `sub/x.png`, `IMG-0001.png`) | Rejects path traversal escapes | `app-design.md` §3; `data-contract.md` §2; `use-cases.md` R-02 |
| 7 | Classification | Default Asset Type Classification | Maps file extension (case-insensitive) to one of 6 types (`image`, `video`, `audio`, `sensor`, `document`, `other`) | File extension | `AssetType` enum value | Unknown extensions default to `other` | `app-design.md` §3.1; `use-cases.md` R-01 |
| 8 | Classification | Custom Extension Overrides (`dct-types.json`) | Reads optional `dct-types.json` from root of collection folder to extend/override type mappings | `dct-types.json` file content (e.g. `{"sensor": [".edf", ".bin", ".dat"]}`) | Custom extension-to-type map | Invalid JSON or structure logged/ignored without crashing folder scan | `app-design.md` §3.1; `use-cases.md` R-01; `acceptance-tests.md` T-01 |
| 9 | Metadata Capture | Image EXIF Capture Time Extraction | Extracts `DateTimeOriginal` from image EXIF via `exifr`, interprets in configured timezone (default `Asia/Kolkata`), converts to UTC ISO 8601 with `Z` | Image file bytes | `capturedAt: Date`, `capturedAtSource: 'exif'` | Falls back to file `lastModified` if tag absent or corrupted | `app-design.md` §1, §3; `use-cases.md` R-03; `ORIGINAL_REQUEST.md` R2 |
| 10 | Metadata Capture | MP4/MOV Header Capture Time Extraction | Extracts `mvhd` creation time via `mp4box.js` (stored in UTC since 1904) and converts to UTC ISO 8601 with `Z` | MP4/MOV file header bytes | `capturedAt: Date`, `capturedAtSource: 'media_header'` | Falls back to file `lastModified` if unparseable | `app-design.md` §1, §3; `use-cases.md` R-03; `acceptance-tests.md` T-01 |
| 11 | Metadata Capture | File Date Fallback Capture Time | Uses `file.lastModified` as capture time when EXIF/media headers are absent | `File.lastModified` (ms epoch) | `capturedAt: Date`, `capturedAtSource: 'file_modified'` | Marked as "capture time from file date" | `app-design.md` §3; `use-cases.md` R-03 |
| 12 | Integrity & Hash | Background Streaming SHA-256 Hashing | Computes SHA-256 hexadecimal digest via Web Worker streaming 8MB chunks using Web Crypto / `hash-wasm` | File streams in 8MB chunks | 64 lowercase hex characters string (`sha256`) | Worker error surfaced to asset entry | `app-design.md` §1, §3; `use-cases.md` R-04; `acceptance-tests.md` T-01, T-16 |
| 13 | Integrity & Hash | Hash Concurrency & UI Responsiveness | Limits concurrent background hashing to two files at a time to prevent UI thread starvation | Queue of discovered assets | Asset hashing progress event/state | Throttled queue prevents out-of-memory on large files | `app-design.md` §3; `use-cases.md` R-04 |
| 14 | Integrity & Hash | Asset Immutability Guard | Zero write/modify/transcode operations performed on asset files; byte-for-byte unchanged | `FileSystemFileHandle` / `File` | File unchanged | Any write attempt to an asset file is strictly forbidden | `AGENTS.md` Rule 4; `app-design.md` §3.1, §9; `use-cases.md` R-38 |
| 15 | Consented List | CSV Parsing & Encoding Verification | Parses consented list CSV via `papaparse` + `zod`; verifies UTF-8 without BOM | CSV file string/stream | Parsed header array and row dictionaries | Fails if starts with UTF-8 BOM (`\ufeff`) | `data-contract.md` Common rules; `tools/validate_export.py` `read_csv` |
| 16 | Consented List | List Contract Validation: Rule L01 | Asserts all required list columns are present in CSV header | CSV header list | Header verified against `LIST_COLUMNS` | Rejects list with error code `L01: consented list is missing columns: ...` | `data-contract.md` §3; `tools/validate_export.py` `load_list` |
| 17 | Consented List | List Contract Validation: Rule L02 | Asserts the list contains exactly one `project_id` across all rows | Set of `project_id` values | Verified single project ID | Rejects list with error code `L02: consented list must hold exactly one project_id, found N` | `data-contract.md` §3; `tools/validate_export.py` `load_list` |
| 18 | Consented List | List Contract Validation: Rule L03 | Asserts `list_valid_until` is present, valid ISO 8601 UTC timestamp, and identical across all rows | Set of `list_valid_until` strings | Verified `Date` instance | Rejects list with error code `L03: consented list must carry one valid list_valid_until on every row` | `data-contract.md` §3; `tools/validate_export.py` `load_list` |
| 19 | Consented List | List Contract Validation: Rule L04 | Asserts each `person_id` appears at most once in the consented list | `person_id` values per row | Verified unique participant map | Rejects list with error code `L04: person_id <UUID> appears twice in the consented list` | `data-contract.md` §3; `tools/validate_export.py` `load_list` |
| 20 | Consented List | Minor Selectability Evaluation | Evaluates `is_minor == true` (case-insensitive) for each participant row | `is_minor` string field | `isMinor: boolean`; marked non-selectable with reason "minor" | Disables selection; prevents minor export (E06) | `data-contract.md` §1; `use-cases.md` R-10; `acceptance-tests.md` T-03, T-04 |
| 21 | Consented List | Expiry Selectability Evaluation | Evaluates `consent_expires_at` against current time / capture time | `consent_expires_at` ISO timestamp | `consentExpiresAt: Date | null`; non-selectable if expired | Disables selection; prevents expired consent export (E07) | `data-contract.md` §1; `use-cases.md` R-11; `acceptance-tests.md` T-03, T-04 |
| 22 | Consented List | List Validity Window Evaluation | Evaluates whether asset was captured after `list_valid_until` | Asset `captured_at` vs `list_valid_until` | Selectability status for all participants | When captured after validity, all rows unselectable (R-12, E08) | `use-cases.md` R-12; `data-contract.md` §3 (E08) |
| 23 | Privacy | In-Memory Personal Data Isolation | Ensures participant `display_name` and `contact_hint` reside solely in RAM (`ConsentedList` state) | Parsed participant records | In-memory React state / Map | Never written to localStorage, sessionStorage, IndexedDB, URLs, logs, or progress files | `AGENTS.md` Rule 8; `app-design.md` §5; `use-cases.md` R-08; `acceptance-tests.md` T-03 |
| 24 | Start Screen UI | Step-by-Step Flow Activation | Three sequential steps on Start Screen: 1. Open folder, 2. Load list, 3. Collection name | User actions / state transitions | Unlocks next step upon valid completion; pre-fills collection name from folder name | Errors display inline; invalid state keeps next step locked | `app-design.md` §2.1; `ORIGINAL_REQUEST.md` R1, R2, R3 |
| 25 | Start Screen UI | Asset Summary & Other Extension Triage | Displays counts of assets grouped by type (image, video, audio, sensor, document, other) and explicitly lists files typed as `other` | Scanned asset list | UI asset count badges and `other` file path list | Alerts agent before starting if unhandled extensions exist | `app-design.md` §2.1 |
| 26 | Start Screen UI | Consented List Summary Display | Displays project name, total people count, non-selectable count (with reasons), and `list_valid_until` | Loaded `ConsentedList` | UI summary cards | Whole list refused with error if L01–L04 fails | `app-design.md` §2.1; `acceptance-tests.md` T-03 |
| 27 | Start Screen UI | Collection Reference Configuration | Defaults `collection_ref` to picked directory name, allows agent editing | Directory name string | Configured `collection_ref` string | Prevents empty reference | `app-design.md` §2.1; `use-cases.md` UC-01 step 3 |
| 28 | Cross-Cutting | Non-Typable Identifiers Contract | Identifiers (`project_id`, `person_id`, `consent_id`) are never typed or edited by users | Application state | Read-only references copied directly | No input field exists in DOM for any of these identifiers | `AGENTS.md` Rule 3; `use-cases.md` R-13; `acceptance-tests.md` T-05 |
| 29 | Cross-Cutting | Progress Resume Detection (Surveyed) | Checks whether picked folder contains `.dct-progress.json` and offers Resume | File presence in directory | "Resume" button offering previous session state | If project mismatch between list and progress file, refuses list (R-09) | `app-design.md` §2.1, §4; `use-cases.md` UC-05, R-09 |
| 30 | Cross-Cutting | List Deletion Reminder (Surveyed) | Checks if last saved sheet is > 7 days old and reminds coordinator to delete list | Progress file save history | Reminder banner on Start Screen | N/A | `app-design.md` §5; `use-cases.md` R-37; `acceptance-tests.md` T-14 |
| 31 | Cross-Cutting | Filename Privacy Warning (Surveyed) | Scans asset paths for whole-word case-insensitive matches against participant `display_name` | Asset paths & list display names | Warning flag on asset | Warns agent during review | `app-design.md` §5; `use-cases.md` R-30; `acceptance-tests.md` T-14 |

---

## 3. Edge Cases & Boundary Conditions

| # | Feature | Input / Condition | Observed / Required Behavior | Authoritative Reference |
|---|---------|-------------------|------------------------------|------------------------|
| 1 | Browser Gate | Non-Chromium browser (Firefox, Safari) or insecure context without `window.showDirectoryPicker` | Renders ONLY the unsupported screen explaining Chrome or Edge desktop requirement. No crash, no partial app rendered. | `app-design.md` §1; `acceptance-tests.md` T-02 |
| 2 | Air-Gap Security | Component attempts `fetch('/api/...')` or external font load | Blocked by CSP `connect-src 'none'`. Browser emits CSP violation in devtools; request aborted with network error. | `app-design.md` §1; `acceptance-tests.md` T-02 |
| 3 | Directory Scanner | Folder contains hidden files (e.g. `.git`, `.DS_Store`, `.env`) | Files beginning with `.` are strictly omitted from the asset list. | `app-design.md` §2.1; `use-cases.md` R-01 |
| 4 | Directory Scanner | Folder contains app artifacts: `.dct-progress.json`, `asset_export_*.csv` | App artifacts are excluded from the asset list. | `app-design.md` §2.1; `use-cases.md` R-01 |
| 5 | Directory Scanner | Deeply nested directory structure (e.g. `day1/morning/session_a/IMG-0001.png`) | Relative path is normalized with forward slashes `/`: `day1/morning/session_a/IMG-0001.png`. Windows backslashes `\` are strictly converted to `/`. | `data-contract.md` §2; `use-cases.md` R-02 |
| 6 | Directory Scanner | Empty folder or folder with zero assets | Start screen reports 0 assets; continues gracefully without crashing. | `app-design.md` §2.1 |
| 7 | Asset Classification | Mixed/uppercase extensions (e.g. `photo.PNG`, `video.MP4`, `trace.CSV`) | Extension matching is case-insensitive; `.PNG` is classified as `image`, `.MP4` as `video`. | `app-design.md` §3.1 |
| 8 | Asset Classification | Custom mapping in `dct-types.json` (e.g. `{"sensor": [".dat", ".edf"]}`) | Files ending in `.dat` or `.edf` are classified as `sensor` instead of `other`. | `app-design.md` §3.1; `acceptance-tests.md` T-01 |
| 9 | Asset Classification | Malformed or invalid `dct-types.json` | Safely ignored with fallback to default extensions; does not crash folder scan. | Defensive design |
| 10 | Asset Classification | Unrecognized extension (e.g. `.xyz`, `.custom`) without `dct-types.json` entry | Classified as `other`. Listed explicitly in the "other files" section of the Start screen. | `app-design.md` §2.1, §3.1; `acceptance-tests.md` T-01 |
| 11 | Capture Time Extraction | Image without EXIF `DateTimeOriginal` or with corrupt EXIF metadata | Falls back to file's `lastModified` timestamp converted to UTC ISO 8601 `Z`. Records `capturedAtSource: 'file_modified'`. | `app-design.md` §3; `use-cases.md` R-03; `acceptance-tests.md` T-01 |
| 12 | Capture Time Extraction | EXIF `DateTimeOriginal` string `2026:11:04 11:32:11` (local time in Asia/Kolkata UTC+05:30) | Correctly parsed as 11:32:11 Asia/Kolkata -> converted to UTC `2026-11-04T06:02:11Z`. | `app-design.md` §3; `ORIGINAL_REQUEST.md` R2 |
| 13 | Capture Time Extraction | MP4 file with `mvhd` box containing creation timestamp (e.g. `VID-0005.mp4`) | Extracted via `mp4box.js` (seconds since 1904-01-01 UTC) -> output formatted as `2026-11-04T06:40:00Z` (`capturedAtSource: 'media_header'`). | `acceptance-tests.md` T-01; `ORIGINAL_REQUEST.md` R2 |
| 14 | Capture Time Extraction | Non-MP4 video/audio (e.g. `AUD-0006.wav`, `DOC-0008.pdf`, `SNS-0007.csv`) | Falls back to file `lastModified` -> converted to UTC ISO 8601 with `Z`. | `app-design.md` §3; `use-cases.md` R-03 |
| 15 | Hashing Engine | Multi-gigabyte file (e.g. 4 GB video) | Streamed in 8MB chunks using Web Worker (`hash-wasm` / Web Crypto). UI remains responsive (60fps); no browser out-of-memory error. | `app-design.md` §1, §3; `use-cases.md` R-04; `acceptance-tests.md` T-16 |
| 16 | Hashing Engine | 1,000 files in collection | Worker queue hashes 2 files concurrently; Start screen updates progress bar smoothly without locking. | `app-design.md` §3; `use-cases.md` R-04; `acceptance-tests.md` T-14 |
| 17 | Hashing Engine | Empty (0 byte) file | Hashes correctly to empty SHA-256 (`e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`). | Cryptographic standard |
| 18 | Asset Immutability | Reading/hashing files | Original files are opened in read mode; file size, last modified time, and SHA-256 remain strictly unchanged before and after processing. | `AGENTS.md` Rule 4; `use-cases.md` R-38; `acceptance-tests.md` T-16 |
| 19 | Consented List | File starts with UTF-8 Byte Order Mark (`\ufeff`) | Rejection with clear error: `file starts with a byte-order mark; save as UTF-8 without BOM`. | `data-contract.md` Common rules; `tools/validate_export.py` line 82 |
| 20 | Consented List | Missing required header column (e.g. `consent_id` missing) | Rejection whole with error code `L01: consented list is missing columns: consent_id`. No partial list loaded. | `data-contract.md` §3; `tools/validate_export.py` line 93; `acceptance-tests.md` T-03 |
| 21 | Consented List | Multiple or zero `project_id` values across rows | Rejection whole with error code `L02: consented list must hold exactly one project_id, found N`. | `data-contract.md` §3; `tools/validate_export.py` line 97; `acceptance-tests.md` T-03 |
| 22 | Consented List | `list_valid_until` missing, malformed timestamp, or different across rows | Rejection whole with error code `L03: consented list must carry one valid list_valid_until on every row`. | `data-contract.md` §3; `tools/validate_export.py` line 101; `acceptance-tests.md` T-03 |
| 23 | Consented List | Duplicate `person_id` in list | Rejection whole with error code `L04: person_id <UUID> appears twice in the consented list`. | `data-contract.md` §3; `tools/validate_export.py` line 106; `acceptance-tests.md` T-03 |
| 24 | Selectability | Minor participant (`is_minor == "true"`) | Flagged non-selectable; reason displayed: `minor`. Select action disabled. | `app-design.md` §2.2; `use-cases.md` R-10; `acceptance-tests.md` T-03, T-04 |
| 25 | Selectability | Expired consent (`consent_expires_at <= captured_at` or expired currently) | Flagged non-selectable; reason displayed: `consent expired <date>`. Select action disabled. | `app-design.md` §2.2; `use-cases.md` R-11; `acceptance-tests.md` T-03, T-04 |
| 26 | Selectability | Asset captured after `list_valid_until` | All participants in the list are rendered unselectable with message asking for a newer list. | `app-design.md` §2.2; `use-cases.md` R-12; `acceptance-tests.md` T-04 |
| 27 | Privacy Invariant | Inspection of `localStorage`, `sessionStorage`, `IndexedDB`, browser cookies | Absolutely 0 entries contain participant names or contact hints. Only folder handles or UI preferences permitted. | `AGENTS.md` Rule 8; `app-design.md` §5; `acceptance-tests.md` T-03 |
| 28 | Privacy Invariant | URL query string, hash, page title, console logs, error toast messages | Participant `display_name` and `contact_hint` are NEVER included in URLs, document.title, `console.*`, or error dialogs. | `app-design.md` §5; `acceptance-tests.md` T-03 |
| 29 | Start Screen UI | Folder chosen first, then valid list loaded | Step 1 and Step 2 show complete badges; Step 3 unlocks with `collection_ref` pre-filled. | `app-design.md` §2.1 |
| 30 | Start Screen UI | Folder chosen, but user closes folder picker without choosing | Handled without throwing unhandled promise rejection; UI stays at step 1. | Browser FSA API contract |

---

## 4. Deep-Dive Specifications for Increment 1

### 4.1 Browser Gate and Air-Gapped Security Architecture

#### Browser Gate
- **Requirement**: Desktop Chrome or Edge required.
- **Implementation**:
  ```ts
  const isSupported = typeof window !== 'undefined' && 'showDirectoryPicker' in window;
  ```
- If `isSupported === false`: Render `UnsupportedBrowserScreen` exclusively.
- The screen must display a prominent, clear message explaining that the File System Access API is required and the agent must use desktop Google Chrome or Microsoft Edge. No other navigation or controls should be rendered.

#### Content Security Policy (`index.html`)
- Must contain:
  ```html
  <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';">
  ```
- Verification: `connect-src 'none'` guarantees that any network call (`fetch`, `XMLHttpRequest`, `WebSocket`, `navigator.sendBeacon`) fails at the browser engine level. Playwright automated tests verify zero network calls during full execution (acceptance test T-02).

---

### 4.2 Collection Folder Ingestion (UC-01)

#### Directory Ingestion Flow
1. User clicks "Open collection folder".
2. Calls `const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' });`.
3. Traverses the directory recursively:
   ```ts
   async function* scanDirectory(
     dirHandle: FileSystemDirectoryHandle,
     prefix = ''
   ): AsyncGenerator<{ path: string; handle: FileSystemFileHandle }> {
     for await (const entry of dirHandle.values()) {
       if (entry.name.startsWith('.')) continue; // skip hidden files and directories
       if (entry.kind === 'file') {
         if (entry.name === '.dct-progress.json' || entry.name.startsWith('asset_export_')) {
           continue; // skip app files
         }
         const path = prefix ? `${prefix}/${entry.name}` : entry.name;
         yield { path, handle: entry as FileSystemFileHandle };
       } else if (entry.kind === 'directory') {
         const newPrefix = prefix ? `${prefix}/${entry.name}` : entry.name;
         yield* scanDirectory(entry as FileSystemDirectoryHandle, newPrefix);
       }
     }
   }
   ```
4. Reads optional `dct-types.json` from the root directory handle if present:
   - Schema: `Record<AssetType, string[]>`.
   - Normalizes all extension strings to lowercase with leading dot (e.g. `".dat"`).

#### Asset Classification Specification (§3.1)
- Default Extension Mappings:
  - **`image`**:
    - Previewable: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp`, `.avif`
    - No preview: `.heic`, `.heif`, `.tif`, `.tiff`, `.raw`, `.dng`, `.cr2`, `.nef`, `.arw`
  - **`video`**:
    - Previewable: `.mp4`, `.m4v`, `.mov`, `.webm`
    - No preview: `.mkv`, `.avi`, `.wmv`, `.mts`, `.3gp`
  - **`audio`**:
    - Previewable: `.wav`, `.mp3`, `.m4a`, `.aac`, `.ogg`, `.oga`, `.opus`, `.flac`
  - **`sensor`**:
    - Text previewable: `.csv`, `.tsv`, `.json`, `.jsonl`, `.txt`, `.log`
    - Binary (size only): `.edf`, `.bin`, `.dat`
  - **`document`**:
    - Previewable: `.pdf`
    - No preview: `.doc`, `.docx`, `.odt`, `.rtf`
  - **`other`**:
    - Any file extension not matched above or in `dct-types.json`.
- UI Requirement: Start screen displays count per asset type and explicitly lists all `other` files by path before tagging begins.

---

### 4.3 Metadata Extraction & Streaming Hashing

#### Capture Time Extraction Rules
1. **Images** (`assetType === 'image'`):
   - Use `exifr.parse(file, ['DateTimeOriginal'])`.
   - If `DateTimeOriginal` is present:
     - EXIF stores timestamps without timezone (e.g., `"2026:11:04 11:32:11"` or Date object in local timezone).
     - Interpret in `VITE_CAPTURE_TIMEZONE` (default: `"Asia/Kolkata"` which is UTC+05:30).
     - Convert to UTC ISO 8601 string ending in `Z` (e.g., `"2026-11-04T06:02:11Z"`).
     - Assign `capturedAtSource: 'exif'`.
   - If missing or unparseable:
     - Fallback to `new Date(file.lastModified).toISOString()`.
     - Assign `capturedAtSource: 'file_modified'`.
2. **MP4/MOV Videos** (`assetType === 'video'` with `.mp4` or `.mov` extension):
   - Extract `mvhd` creation time using `mp4box.js`.
   - MP4 file headers record creation time in UTC (seconds since January 1, 1904 UTC).
   - Format to UTC ISO 8601 string ending in `Z` (e.g., `VID-0005.mp4` -> `2026-11-04T06:40:00Z`).
   - Assign `capturedAtSource: 'media_header'`.
   - Fallback if header unparseable: `file.lastModified` -> `capturedAtSource: 'file_modified'`.
3. **All Other Assets** (`audio`, `sensor`, `document`, `other`):
   - `capturedAt = new Date(file.lastModified).toISOString()`.
   - Assign `capturedAtSource: 'file_modified'`.

#### Streaming SHA-256 Hashing Architecture
- **Web Worker**:
  - Main thread dispatches file handles/blobs to worker.
  - Worker reads `file.slice(offset, offset + CHUNK_SIZE)` where `CHUNK_SIZE = 8 * 1024 * 1024` (8 MB).
  - Uses `crypto.subtle.digest` or `hash-wasm` (`createSHA256().init() -> update(chunk) -> digest('hex')`).
  - Worker yields progress percentages per file.
  - Main thread throttles active hashing to **2 concurrent files** to keep main UI responsive.
  - Generates exact 64-character lowercase hex string.
  - Verification: Matches `docs/consent-tagging/examples/asset_export.sample.csv` hashes exactly.

---

### 4.4 Consented List Ingestion and Validation (UC-02)

#### CSV Structure and Schema
- Required Header:
  `project_id,project_name,person_id,consent_id,display_name,contact_hint,consent_expires_at,is_minor,list_generated_at,list_valid_until`
- Delimiter: Comma `,`, RFC 4180 quoting.
- Encoding: UTF-8 without BOM. If byte-order mark detected, throw error.

#### Validation Rules L01–L04 (Must reject list whole with exact error codes)
- **L01**: `consented list is missing columns: <col1>, <col2>`
  - Asserts all 10 required columns exist in header.
- **L02**: `consented list must hold exactly one project_id, found <N>`
  - Evaluates unique `project_id` across rows. Must equal 1.
- **L03**: `consented list must carry one valid list_valid_until on every row`
  - Asserts `list_valid_until` matches `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$` and is identical across all rows.
- **L04**: `person_id <UUID> appears twice in the consented list`
  - Asserts no duplicate `person_id` exists in the list.

#### Selectability Rules
- For each participant entry:
  - `isMinor`: `row.is_minor.trim().toLowerCase() === 'true'`.
    - If `true`: Not selectable. Reason: `"minor"`.
  - `consentExpiresAt`: parsed ISO 8601 UTC timestamp or `null`.
    - If non-null and `consentExpiresAt <= assetCapturedAt` (or expired relative to current reference time): Not selectable. Reason: `"consent expired <date>"`.
  - `listValidUntil`: If `assetCapturedAt > listValidUntil`: Nobody is selectable. Reason: `"captured after list_valid_until"`.

#### Strict Privacy Invariant
- Data Structures:
  ```ts
  export interface ListPerson {
    personId: string;
    consentId: string;
    displayName: string; // IN-MEMORY ONLY
    contactHint: string; // IN-MEMORY ONLY
    consentExpiresAt: Date | null;
    isMinor: boolean;
  }

  export interface ConsentedList {
    projectId: string;
    projectName: string;
    generatedAt: Date;
    validUntil: Date;
    people: Map<string, ListPerson>;
  }
  ```
- **Invariant**: `displayName` and `contactHint` MUST NEVER be written to:
  - `localStorage`
  - `sessionStorage`
  - `IndexedDB`
  - Cookies
  - URLs (query parameters, paths, or hash fragments)
  - `console.log`, `console.info`, `console.error`, or telemetry
  - Any persisted state file (`.dct-progress.json`)
- Browser storage verification: Automated tests query all Web Storage and IndexedDB instances after list loading and verify 0 occurrences of display names or contact hints.

---

### 4.5 Acceptance Test Criteria Matrix (T-01, T-02, T-03)

| Test ID | Test Title | Exact Verification Criteria |
|---------|------------|-----------------------------|
| **T-01** | Folder loading | 1. Open `examples/sample-collection/`<br>2. 8 assets identified: `IMG-0001.png`...`DOC-0008.pdf`<br>3. Classification: 4 image, 1 video, 1 audio, 1 sensor, 1 document<br>4. Nested file gets `sub/x.png` with `/`<br>5. Unknown extension classifies as `other`<br>6. Custom `dct-types.json` mapping `.dat` to `sensor` applies<br>7. SHA-256 hashes match `asset_export.sample.csv` exactly<br>8. `VID-0005.mp4` extracts capture time `06:40:00Z` from `mvhd` header<br>9. Image without EXIF marked `captured_at_source: 'file_modified'`<br>10. Assets byte-for-byte unchanged |
| **T-02** | Browser & network security | 1. Browser lacking `window.showDirectoryPicker` displays only Chrome/Edge requirement screen<br>2. `index.html` has `<meta http-equiv="Content-Security-Policy" content="... connect-src 'none' ...">`<br>3. Playwright test registers 0 network requests during execution |
| **T-03** | Consented list loading & privacy | 1. Load `consented_list.sample.csv`: 4 participants parsed, 2 marked non-selectable (Person 003 expired, Person 004 minor)<br>2. Lists violating L01, L02, L03, L04 rejected whole with descriptive error messages<br>3. `localStorage`, `sessionStorage`, `IndexedDB`, URLs, and console logs contain 0 participant display names or contact hints |

---

## 5. Reference Data & Golden Controls

### Sample Collection Assets Reference Table
From `docs/consent-tagging/examples/sample-collection/` and `asset_export.sample.csv`:

| Asset ID | Type | Expected SHA-256 | Expected Captured At | Source |
|---|---|---|---|---|
| `IMG-0001.png` | `image` | `2180908ddf0ede06fd1be557ec0741028aaccc8f69030b0260c071490fe198e3` | `2026-11-04T06:02:11Z` | `exif` |
| `IMG-0002.png` | `image` | `d7ccb67ce581735227576793a5ed283fe97658b7f3855985c954cef033cb928d` | `2026-11-04T06:05:40Z` | `exif` |
| `IMG-0003.png` | `image` | `8bf338500e6e1049641dd043cca6cdc1c8883f475992b5ccdfe61aaf1c2d2227` | `2026-11-04T06:20:00Z` | `exif` |
| `IMG-0004.png` | `image` | `252faa78eca702304cc17cbc026361d2c17607834b7869178174413a9fa3fd3c` | `2026-11-04T06:30:00Z` | `exif` |
| `VID-0005.mp4` | `video` | `06020319b521122923f0c02ecdb030893d561ce6ccf9e3e596791e68de8e002b` | `2026-11-04T06:40:00Z` | `media_header` |
| `AUD-0006.wav` | `audio` | `570475d23f0878b87d95de909a167e167297f98ad25c4061ab4ed7e59e820527` | `2026-11-04T06:45:00Z` | `file_modified` |
| `SNS-0007.csv` | `sensor` | `884016620503eb2fc868a7bb722723936bf152859da9acd610a2d175058162d4` | `2026-11-04T06:50:00Z` | `file_modified` |
| `DOC-0008.pdf` | `document` | `8491e3916b78e4a55b894f691ed66912a2699df2c33ceac2706d08cf4ac94aae` | `2026-11-04T07:00:00Z` | `file_modified` |

### Sample Consented List Reference Table
From `docs/consent-tagging/examples/consented_list.sample.csv`:
- `project_id`: `6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01`
- `project_name`: `Synthetic gait study`
- `list_generated_at`: `2026-11-01T04:30:00Z`
- `list_valid_until`: `2026-11-08T04:30:00Z`

| Person ID | Consent ID | Display Name | Contact Hint | Expiry | Minor? | Selectability Status (for capture 2026-11-04) |
|---|---|---|---|---|---|---|
| `3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1` | `9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101` | `Synthetic Person 001` | `…01` | None | `false` | **Selectable** |
| `7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2` | `1d90a2b3-c4d5-4e6f-8a9b-0c1d2e3f0202` | `Synthetic Person 002` | `…02` | `2027-05-01T00:00:00Z` | `false` | **Selectable** |
| `c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e03` | `5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f70303` | `Synthetic Person 003` | `…03` | `2026-11-03T00:00:00Z` | `false` | **NOT Selectable** (Reason: expired 2026-11-03) |
| `d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f04` | `6f7a8b9c-0d1e-4f2a-b3c4-d5e6f7080404` | `Synthetic Person 004` | `…04` | None | `true` | **NOT Selectable** (Reason: minor) |

---

## 6. Implementation Architecture Recommendations for Engineers

1. **Project Scaffold**:
   - `vite` with `@vitejs/plugin-react`
   - `typescript` with `strict: true`
   - `tailwindcss` or pure css tokens (`src/styles/tokens.css`)
   - `eslint` with `@typescript-eslint/eslint-plugin` and rule `@typescript-eslint/no-explicit-any: error`
   - `vitest` + `@testing-library/react` + `jsdom`
   - `@playwright/test`
2. **Folder and File Parsing Module (`src/folder/`)**:
   - `scanDirectory.ts`: generator walking DirectoryHandle
   - `assetClassifier.ts`: extension map, `dct-types.json` loader
   - `captureTime.ts`: `exifr` parser with timezone conversion via `Intl` or date-fns-tz; `mp4box.js` parser for `mvhd`
   - `hashWorker.ts` / `hasher.ts`: Web Worker streaming file slices (8MB), chunked hashing via Web Crypto or `hash-wasm`
3. **Consented List Module (`src/list/`)**:
   - `parseList.ts`: `papaparse` integration with BOM detection, validation of L01–L04, returning typed `ConsentedList`
   - `selectability.ts`: helper to compute selectability per asset capture time
4. **App Routing & Layout (`src/app/`)**:
   - `App.tsx`: detects `window.showDirectoryPicker`. If unsupported, renders `UnsupportedBrowserScreen`.
   - `StartScreen.tsx`: 3 sequential steps (Folder picker -> List picker -> Collection name input).
