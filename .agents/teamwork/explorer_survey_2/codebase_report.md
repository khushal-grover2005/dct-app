# DCT Increment 1 Codebase & Workspace Survey Report

Date: 2026-11-07  
Survey Agent: `explorer_survey_2`  
Working Directory: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_survey_2`  
Target Scope: Increment 1 of the Data Collection Tool (DCT)

---

## 1. Executive Summary

The workspace at `c:\Users\pc\.gemini\antigravity\scratch\dct-app` represents the initial specification pack (Specification Pack v3) of the Data Collection Tool (DCT). The repository currently contains comprehensive specifications, design documents, synthetic sample datasets, reference golden fixtures, and a complete Python reference validator (`tools/validate_export.py` and `tools/test_validate_export.py`).

**Key Finding**: The frontend application itself does **not yet exist**. There is no `package.json`, no TypeScript configuration, no Vite setup, no `src/` directory, no `e2e/` test suite, and no `.gitignore`. As documented in `README.md` line 24:
> *"The app itself (`package.json`, `src/`, `e2e/`) is created in increment 1."*

All specifications for Increment 1 (UC-01 and UC-02) are clearly defined, completely consistent, and ready for immediate implementation.

---

## 2. Workspace File Inventory

### 2.1 Existing Root Files & Directories
| Path | Type | Size / Description |
|---|---|---|
| `AGENTS.md` | File | 3,717 bytes. Core developer instructions, strict invariant rules, stack definition, and acceptance criteria. |
| `CLAUDE.md` | File | 146 bytes. Pointer to `AGENTS.md`. |
| `README.md` | File | 1,892 bytes. Specification pack overview and setup instructions. |
| `prompt_draft.md` | File | 5,005 bytes. Detailed Increment 1 prompt draft with requirements R1–R3 and acceptance criteria. |
| `.git/` | Directory | Git repository metadata. |
| `.agents/` | Directory | Agent teamwork metadata and dispatch instructions. |
| `docs/` | Directory | Complete project documentation and synthetic sample data (see §2.2). |
| `tools/` | Directory | Python reference validator and its test suite (see §2.3). |

### 2.2 Documentation & Sample Assets (`docs/consent-tagging/`)
- `overview.md`: High-level purpose, user flow, architectural rationale, and DPDP Act legal context.
- `app-design.md`: Technical specification detailing fixed choices, screens, data models, progress file schema, validator port, repository layout, and asset type rules.
- `data-contract.md`: Specification of the consented list schema, asset export CSV schema, row types (`person`, `bystander`, `no_person`, `deleted`), and validation rules (L01–L04, E01–E16, W01–W02).
- `use-cases.md`: 8 complete use cases with numbered requirements (R-01 through R-41). Increment 1 specifically covers UC-01 and UC-02.
- `implementation-plan.md`: 5-increment roadmap; Increment 1 covers app shell, folder and list loading, asset types, hashing, and capture times.
- `acceptance-tests.md`: Acceptance test matrix (T-01 through T-16). Increment 1 targets T-01, T-02, and T-03.
- `data-handling.md`: Synthetic data policy, air-gapped restrictions, and personal data rules.
- `examples/`:
  - `consented_list.sample.csv`: Sample list containing 4 individuals (`Synthetic Person 001` through `004`), with Person 003 having expired consent and Person 004 marked as a minor.
  - `asset_export.sample.csv`: Reference exported sheet for the 8 synthetic sample collection files.
  - `asset_export.correction.sample.csv`: Reference sheet for correction testing.
  - `sample-collection/`: 8 synthetic files representing 5 asset types:
    - `AUD-0006.wav` (audio, 96,138 bytes)
    - `DOC-0008.pdf` (document, 1,616 bytes)
    - `IMG-0001.png` (image, 10,481 bytes)
    - `IMG-0002.png` (image, 10,876 bytes)
    - `IMG-0003.png` (image, 10,377 bytes)
    - `IMG-0004.png` (image, 9,141 bytes)
    - `SNS-0007.csv` (sensor, 4,849 bytes)
    - `VID-0005.mp4` (video, 87,103 bytes)
  - `sample-collection-redacted/`: Redacted version of `IMG-0002.png`.
  - `golden/`: Golden dataset for validator parity:
    - `expected.json`: Maps 18 error/warning test cases to exact error and warning codes.
    - 16 error test CSVs (`e01` through `e16`), 1 warning CSV (`w01`), and 1 valid CSV (`valid_sample.csv`).

### 2.3 Python Reference Validator (`tools/`)
- `tools/validate_export.py` (276 lines):
  - Self-contained CLI and library using Python 3.9+ standard library only (`argparse`, `csv`, `json`, `re`, `sys`, `dataclasses`, `datetime`).
  - Implements checks for consented list:
    - L01: Required columns present.
    - L02: Exactly one `project_id`.
    - L03: Single valid `list_valid_until` timestamp.
    - L04: No duplicate `person_id`.
  - Implements checks for export sheet:
    - E01 (columns), E02 (UUID format), E03 (project ID match), E04 (unknown person), E05 (wrong consent ID), E06 (minor check), E07 (expired consent check), E08 (post-list validity check), E09 (row type shape), E10 (duplicate person per asset), E11 (asset composition rules), E12 (allowed asset type), E13 (UTC ISO 8601 timestamp with Z, no future dates), E14 (file-level constants consistency), E15 (64-char lowercase hex SHA-256), E16 (asset-level row consistency).
    - W01 (empty hash warning), W02 (held assets with bystanders warning).
- `tools/test_validate_export.py` (178 lines):
  - Contains 20 unit tests across 3 test classes:
    - `Samples` (2 tests): verifies `asset_export.sample.csv` and `asset_export.correction.sample.csv`.
    - `Rules` (17 tests): tests each specific error code E01–E16 and warning W01 via synthetic mutations.
    - `GoldenCases` (1 test with 18 subtests): iterates over all cases in `docs/consent-tagging/examples/golden/expected.json`.
- `tools/__pycache__/`:
  - Contains `test_validate_export.cpython-310.pyc` and `validate_export.cpython-310.pyc`, confirming Python 3.10 is installed and active in the host environment.
  - Note: Unsandboxed command execution via PowerShell requires user confirmation, which timed out during test run. The code itself is standard library with no external dependencies and has precompiled cleanly.

### 2.4 Missing Artifacts (To Be Created in Increment 1)
1. **Configuration & Project Files**:
   - `package.json` and `package-lock.json`
   - `tsconfig.json` (TypeScript `strict: true`, target ES2022)
   - `tsconfig.node.json`
   - `vite.config.ts`
   - `vitest.config.ts`
   - `playwright.config.ts`
   - `.eslintrc.cjs` or `eslint.config.js` (enforcing `@typescript-eslint/no-explicit-any: error`)
   - `postcss.config.js` and `tailwind.config.js` (or pure CSS token configuration)
   - `.gitignore` (ignoring `node_modules/`, `dist/`, `.dct-progress.json`, test results, OS files)
   - `index.html` (with strict CSP: `connect-src 'none'`)
2. **Source Code Structure (`src/`)**:
   - `src/main.tsx` and `src/App.tsx`
   - `src/app/`: Unsupported browser gate, layout, header, footer
   - `src/folder/`: Directory picker, recursive scanner, type classifier, `dct-types.json` parser, SHA-256 worker, capture time extractors (EXIF via `exifr`, MP4 via `mp4box.js`, file date fallback)
   - `src/list/`: CSV parser (`papaparse`), Zod schemas for consented list, L01–L04 validation, selectability logic, privacy guards
   - `src/styles/`: `tokens.css` or Tailwind styles
   - `src/types/`: Core type definitions (`ListPerson`, `ConsentedList`, `AssetEntry`, `AssetType`, etc.)
   - `src/workers/hashWorker.ts`: Web Worker for streaming SHA-256 calculation
3. **Test Suites**:
   - `src/**/__tests__/`: Vitest unit and integration tests covering folder scanning, type detection, capture time extraction, SHA-256 hashing, list validation (L01–L04), and privacy invariants
   - `e2e/`: Playwright end-to-end tests for T-01, T-02, and T-03
4. **Documentation**:
   - `docs/consent-tagging/session-log.md`: Initialized with Increment 1 session record.

---

## 3. Technology Stack & Dependency Specification

Per `AGENTS.md` and `docs/consent-tagging/app-design.md §1`:

### 3.1 Production Dependencies
| Package | Version Range | Purpose |
|---|---|---|
| `react` | `^18.3.1` | UI component tree |
| `react-dom` | `^18.3.1` | DOM renderer |
| `papaparse` | `^5.4.1` | Fast RFC 4180 CSV parsing (for list loading and progress files) |
| `zod` | `^3.23.8` | Schema validation and typed parsing |
| `exifr` | `^7.1.3` | Lightweight EXIF parser for extracting `DateTimeOriginal` from images |
| `mp4box` | `^0.5.2` | ISO base media file format parser for extracting MP4/MOV `mvhd` creation time |
| `hash-wasm` | `^4.11.0` | High-performance WebAssembly SHA-256 streaming for large files |
| `lucide-react` | Optional (`^0.395.0`) | UI icons (or inline SVGs) |

### 3.2 Development Dependencies
| Package | Version Range | Purpose |
|---|---|---|
| `typescript` | `^5.4.5` | TypeScript compiler |
| `@types/react` | `^18.3.3` | React TypeScript typings |
| `@types/react-dom` | `^18.3.0` | React DOM typings |
| `@types/papaparse` | `^5.3.14` | Papaparse typings |
| `@types/mp4box` | `^0.5.2` (or custom .d.ts) | MP4Box typings |
| `vite` | `^5.2.11` | Build tool and dev server |
| `@vitejs/plugin-react` | `^4.2.1` | Vite React fast refresh plugin |
| `vitest` | `^1.6.0` | Unit test runner |
| `@testing-library/react` | `^15.0.7` | React component testing utilities |
| `@testing-library/jest-dom` | `^6.4.5` | Matchers for testing DOM state |
| `jsdom` | `^24.0.0` | Virtual DOM environment for vitest |
| `@playwright/test` | `^1.44.1` | Browser end-to-end testing |
| `eslint` | `^8.57.0` | Linter |
| `@typescript-eslint/parser` | `^7.10.0` | TypeScript ESLint parser |
| `@typescript-eslint/eslint-plugin` | `^7.10.0` | TypeScript ESLint rules (`no-explicit-any: error`) |
| `prettier` | `^3.2.5` | Code formatter |
| `tailwindcss` + `autoprefixer` + `postcss` | `^3.4.3` | Utility-first CSS styling (optional or pure CSS tokens) |

---

## 4. Subsystem Breakdown for Increment 1

### 4.1 Air-Gapped Shell, Security & Browser Gate (R1)
1. **Content Security Policy**:
   - `index.html` must define:
     ```html
     <meta http-equiv="Content-Security-Policy" content="default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline';">
     ```
   - Invariant: `connect-src 'none'` guarantees zero outbound network traffic after page load.
2. **Browser Support Gate (`UnsupportedBrowser.tsx`)**:
   - In browsers lacking `window.showDirectoryPicker` (e.g. Firefox, Safari), the application must display a dedicated unsupported screen stating that Chrome or Edge is required.
   - None of the collection or list actions should be rendered in unsupported browsers.

### 4.2 Collection Folder Ingestion & Background Processing (R2)
1. **Directory Traversal (`src/folder/scanner.ts`)**:
   - Uses `window.showDirectoryPicker({ mode: 'readwrite' })`.
   - Traverses files recursively across all subdirectories.
   - Filters:
     - Ignore hidden files (`name.startsWith('.')`).
     - Ignore app internal files (`.dct-progress.json`, `asset_export_*.csv`).
   - Relative path normalization: `asset_id` must use forward slashes `/` (e.g., `subfolder/file.png`).
2. **Asset Type Classification (`src/folder/classifier.ts`)**:
   - Default classification by case-insensitive extension:
     - `image`: `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp`, `.avif`, `.heic`, `.heif`, `.tif`, `.tiff`, `.raw`, `.dng`, `.cr2`, `.nef`, `.arw`
     - `video`: `.mp4`, `.m4v`, `.mov`, `.webm`, `.mkv`, `.avi`, `.wmv`, `.mts`, `.3gp`
     - `audio`: `.wav`, `.mp3`, `.m4a`, `.aac`, `.ogg`, `.oga`, `.opus`, `.flac`
     - `sensor`: `.csv`, `.tsv`, `.json`, `.jsonl`, `.txt`, `.log`, `.edf`, `.bin`, `.dat`
     - `document`: `.pdf`, `.doc`, `.docx`, `.odt`, `.rtf`
     - `other`: any unrecognised extension.
   - Custom overrides via collection-level `dct-types.json`:
     - If `dct-types.json` is located in the collection root, load and merge extension mappings (e.g., `{"sensor": [".dat", ".edf"]}`).
3. **Background SHA-256 Hashing (`src/folder/hasher.ts` & Web Worker)**:
   - Offload hashing to a Web Worker to ensure UI thread remains non-blocking.
   - Streaming in 8 MB chunks. Files ≤ 256 MB can use Web Crypto `crypto.subtle.digest`, or `hash-wasm` streaming for arbitrary sizes.
   - Output: 64-character lowercase hex string matching `tools/validate_export.py` SHA_RE.
4. **Capture Time Extraction (`src/folder/captureTime.ts`)**:
   - **Images**: Parse EXIF `DateTimeOriginal` using `exifr`. EXIF lacks timezone offset, so interpret in configured timezone (default `VITE_CAPTURE_TIMEZONE` = `Asia/Kolkata`) and convert to UTC ISO 8601 with trailing `Z`.
   - **MP4 / MOV**: Parse `mvhd` header creation time using `mp4box.js` (MP4 spec times are already UTC since Jan 1, 1904).
   - **Fallback**: File `lastModified` timestamp converted to UTC ISO 8601 `Z`. Mark `capturedAtSource = 'file_modified'`.
5. **Byte-Level Immutability**:
   - Files are opened via read-only streams. No modification, transcoding, renaming, or in-file metadata tagging is ever performed.

### 4.3 Consented List Loading, Validation & Privacy (R3)
1. **CSV Parsing & Validation (`src/list/loadList.ts`)**:
   - Parse CSV via `papaparse`.
   - Validate structure using `zod`.
   - Enforce rules L01–L04:
     - **L01**: Check for all 10 required headers: `project_id`, `project_name`, `person_id`, `consent_id`, `display_name`, `contact_hint`, `consent_expires_at`, `is_minor`, `list_generated_at`, `list_valid_until`.
     - **L02**: Verify all rows belong to exactly one `project_id`.
     - **L03**: Verify single identical valid ISO 8601 UTC `list_valid_until` across all rows.
     - **L04**: Verify all `person_id` values are unique.
   - Whole rejection: If any L rule fails, reject the entire list with a clear error message.
2. **Participant Selectability Logic (`src/list/selectability.ts`)**:
   - Minor evaluation: If `is_minor === true`, mark participant unselectable with reason `"minor"`.
   - Consent expiry: If `consent_expires_at` is earlier than asset `captured_at` (or current reference time), mark unselectable with reason `"consent expired <date>"`.
   - List validity: If asset `captured_at` is after `list_valid_until`, all participants are unselectable.
3. **Privacy Invariant Guard (`src/list/privacy.ts`)**:
   - Participant `display_name` and `contact_hint` must reside exclusively in React memory state.
   - Must NEVER be written to `localStorage`, `sessionStorage`, `IndexedDB`, URLs, or `console.log`.
   - Automated tests must inspect browser storage and log interceptors to guarantee compliance.

---

## 5. Acceptance Test Alignment (Increment 1)

| Test ID | Requirement | Success Criteria | Verification Mode |
|---|---|---|---|
| **T-01** | Folder loading & background processing | Opening `examples/sample-collection/` identifies 8 assets across 5 types (4 image, 1 video, 1 audio, 1 sensor, 1 document); nested files retain forward-slash relative paths; unknown extensions become `other`; `dct-types.json` overrides apply; computed SHA-256 hashes match `asset_export.sample.csv` exactly; `VID-0005.mp4` extracts `06:40:00Z` from header; images without EXIF fall back to `file_modified`. | Vitest + Playwright |
| **T-02** | Browser gate & air-gap verification | Unsupported browsers (without `window.showDirectoryPicker`) display Chrome/Edge requirement; `index.html` has CSP `connect-src 'none'`; Playwright monitors network traffic and asserts zero outbound HTTP/WebSocket requests during entire run. | Playwright |
| **T-03** | Consented list parsing & privacy invariants | Sample list loads 4 people (2 selectable, 2 unselectable); invalid lists violating L01–L04 are rejected whole with descriptive errors; `localStorage`, `sessionStorage`, `IndexedDB`, and URLs contain zero occurrences of participant names or contact hints. | Vitest + Playwright |

---

## 6. Recommended Implementation Sequence

To cleanly construct Increment 1, the following staged plan is recommended:

1. **Stage 1: Project Scaffolding & Tooling Setup**
   - Initialize `package.json` with exact specified dependencies.
   - Set up `tsconfig.json` (`strict: true`, `noImplicitAny: true`).
   - Configure `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`.
   - Configure ESLint (`no-explicit-any: error`) and Prettier.
   - Create `.gitignore`.
   - Create `index.html` with air-gapped CSP (`connect-src 'none'`).

2. **Stage 2: Core Data Types & Privacy Utilities**
   - Implement `src/types/contract.ts` and `src/types/app.ts` mirroring `app-design.md §3`.
   - Implement `src/list/privacy.ts` (storage sanitizer and invariant assertions).

3. **Stage 3: Consented List Subsystem (UC-02)**
   - Implement `src/list/parser.ts` using `papaparse` and `zod`.
   - Implement rules L01, L02, L03, L04 with descriptive errors.
   - Implement selectability evaluation (`is_minor`, `consent_expires_at`, `list_valid_until`).
   - Write Vitest unit test suite for list parsing, edge cases, and golden sample data.

4. **Stage 4: Collection Folder Traversal, Classification & Hashing (UC-01)**
   - Implement browser capability detector (`src/app/browserGate.ts`).
   - Implement recursive folder scanner using File System Access API (`src/folder/scanner.ts`).
   - Implement extension classifier with `dct-types.json` support (`src/folder/classifier.ts`).
   - Implement capture time extraction for EXIF and MP4 `mvhd` (`src/folder/captureTime.ts`).
   - Implement background Web Worker for streaming SHA-256 hashing (`src/folder/hasher.ts`).
   - Write Vitest unit test suite verifying against `examples/sample-collection/` and `asset_export.sample.csv`.

5. **Stage 5: App Shell & Start Screen UI**
   - Build `src/app/UnsupportedBrowser.tsx`.
   - Build `src/app/StartScreen.tsx`:
     - Step 1: Open collection folder picker with asset count and classification badges.
     - Step 2: Load consented list picker with project name and participant counts.
     - Step 3: Collection reference name input (prefilled with folder name).
   - Wire state into clean React context/hooks.

6. **Stage 6: End-to-End Acceptance Tests & Session Logging**
   - Implement Playwright test fixtures for File System Access API mock/hooks.
   - Implement `e2e/t01-folder.spec.ts`, `e2e/t02-airgap.spec.ts`, `e2e/t03-list.spec.ts`.
   - Run verification suite: `npm test`, `npm run lint`, `tsc --noEmit`, `python -m unittest tools/test_validate_export.py`.
   - Create and populate `docs/consent-tagging/session-log.md`.
