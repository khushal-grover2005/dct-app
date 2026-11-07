# Data Fixtures and Reference Artifacts Analysis Report

**Document**: `data_report.md`  
**Author**: Explorer Survey 3 (`.agents/teamwork/explorer_survey_3`)  
**Parent**: Project Orchestrator (`fde194f5-9579-434b-9b81-d7bb7a515ef0`)  
**Date**: 2026-11-07  
**Scope**: Milestone 0 — Data fixtures, sample collection, consented list parsing, golden test suite, and test fixture definitions for Increment 1 acceptance tests (T-01, T-02, T-03).

---

## 1. Executive Summary

This report delivers a comprehensive investigation of all synthetic sample data, reference export sheets, consented lists, golden validation fixtures, and test inputs available in the repository.

### Key Discoveries
1. **Actual Filesystem Location**: The sample collections and reference CSVs are located under `docs/consent-tagging/examples/` (and its subdirectories `sample-collection/`, `sample-collection-redacted/`, and `golden/`). Shorthand references in documentation like `examples/sample-collection/` refer to `docs/consent-tagging/examples/sample-collection/`.
2. **Sample Collection Integrity**: The collection contains exactly 8 assets spanning 5 distinct asset types (4 `image`, 1 `video`, 1 `audio`, 1 `sensor`, 1 `document`). Every file matches its documented byte size and produces the exact SHA-256 hash specified in `docs/consent-tagging/examples/asset_export.sample.csv`.
3. **Consented List Parsing & Selectability**: `consented_list.sample.csv` specifies 4 synthetic participants under project `6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01`. Exactly 2 participants are selectable (001 and 002), and exactly 2 are **non-selectable**:
   - **Synthetic Person 003**: Non-selectable because consent expired on `2026-11-03T00:00:00Z`, which is before the collection's capture dates on `2026-11-04`.
   - **Synthetic Person 004**: Non-selectable because `is_minor == true`.
4. **Export Sheet Validation**: `asset_export.sample.csv` contains 11 rows for the 8 assets. Asset `IMG-0002.png` contains 1 bystander row (`bystander_count = 1`), making it a **held asset** and triggering warning `W02`.
5. **Golden Validation Parity**: `docs/consent-tagging/examples/golden/expected.json` establishes a formal test battery of 18 test cases (1 valid case, 1 warning case `w01`, and 16 error cases `e01` through `e16`). Both the Python reference validator and the upcoming TypeScript validator must maintain 100% code-parity against this suite.

---

## 2. Sample Collection Inventory (`docs/consent-tagging/examples/sample-collection/`)

The sample collection represents a typical laboratory collection folder captured on `2026-11-04`.

### 2.1 File Catalog and Type Classification

Classification follows the extension mapping rules defined in `docs/consent-tagging/app-design.md` §3.1:
- `image`: `.jpg .jpeg .png .webp .gif .bmp .avif`
- `video`: `.mp4 .m4v .mov .webm`
- `audio`: `.wav .mp3 .m4a .aac .ogg .oga .opus .flac`
- `sensor`: `.csv .tsv .json .jsonl .txt .log .edf .bin .dat`
- `document`: `.pdf` (previewable), `.doc .docx .odt .rtf` (no preview)
- `other`: any other extension

| Asset ID (`asset_id`) | Size (Bytes) | Extension | Classified `asset_type` | Reference Capture Time (`captured_at`) | Capture Time Source | SHA-256 Hash |
|---|---|---|---|---|---|---|
| `IMG-0001.png` | 10,481 | `.png` | `image` | `2026-11-04T06:02:11Z` | EXIF `DateTimeOriginal` | `2180908ddf0ede06fd1be557ec0741028aaccc8f69030b0260c071490fe198e3` |
| `IMG-0002.png` | 10,876 | `.png` | `image` | `2026-11-04T06:05:40Z` | EXIF `DateTimeOriginal` | `d7ccb67ce581735227576793a5ed283fe97658b7f3855985c954cef033cb928d` |
| `IMG-0003.png` | 10,377 | `.png` | `image` | `2026-11-04T06:20:00Z` | EXIF `DateTimeOriginal` | `8bf338500e6e1049641dd043cca6cdc1c8883f475992b5ccdfe61aaf1c2d2227` |
| `IMG-0004.png` | 9,141 | `.png` | `image` | `2026-11-04T06:30:00Z` | EXIF `DateTimeOriginal` | `252faa78eca702304cc17cbc026361d2c17607834b7869178174413a9fa3fd3c` |
| `VID-0005.mp4` | 87,103 | `.mp4` | `video` | `2026-11-04T06:40:00Z` | MP4 Header (`mvhd` atom) | `06020319b521122923f0c02ecdb030893d561ce6ccf9e3e596791e68de8e002b` |
| `AUD-0006.wav` | 96,138 | `.wav` | `audio` | `2026-11-04T06:45:00Z` | File `lastModified` | `570475d23f0878b87d95de909a167e167297f98ad25c4061ab4ed7e59e820527` |
| `SNS-0007.csv` | 4,849 | `.csv` | `sensor` | `2026-11-04T06:50:00Z` | File `lastModified` | `884016620503eb2fc868a7bb722723936bf152859da9acd610a2d175058162d4` |
| `DOC-0008.pdf` | 1,616 | `.pdf` | `document` | `2026-11-04T07:00:00Z` | File `lastModified` | `8491e3916b78e4a55b894f691ed66912a2699df2c33ceac2706d08cf4ac94aae` |

### 2.2 Deep Dive into Asset Attributes
1. **`asset_id` Normalization**:
   - `asset_id` must always be the relative path from the root collection folder, separated by forward slashes (`/`), even when running on Windows (e.g. `sub/x.png`, not `sub\x.png`).
   - Root files have no leading slash (e.g. `IMG-0001.png`).
2. **Ignored / Hidden Files**:
   - Any file or directory starting with `.` (e.g. `.git`, `.DS_Store`, `.hidden`, `.dct-progress.json`) must be skipped during scanning.
   - Any generated sheet matching `asset_export_*.csv` in the root must also be ignored as an asset.
3. **Capture Time Resolution**:
   - **EXIF `DateTimeOriginal`**: For image files, EXIF timestamps have no timezone offset. The app must interpret this timestamp in the environment's capture timezone (`VITE_CAPTURE_TIMEZONE`, default `Asia/Kolkata`, UTC+5:30) and convert it to UTC ISO 8601 with `Z`.
     - Example: EXIF `2026:11:04 11:32:11` IST (+05:30) -> `2026-11-04T06:02:11Z`.
   - **Images without EXIF**: When EXIF `DateTimeOriginal` is absent, fall back to file `lastModified`, and mark `capturedAtSource: 'file_modified'` with UI indicator *"capture time from file date"*.
   - **MP4/MOV Header**: In `VID-0005.mp4`, the `mvhd` atom stores creation time as seconds since 1904-01-01 in UTC. Parsed via `mp4box.js`, this yields `2026-11-04T06:40:00Z`.
   - **Other Assets**: Audio (`.wav`), sensor data (`.csv`), and documents (`.pdf`) default to file `lastModified`.
4. **Byte-Level Immutability Invariant (R-38)**:
   - Asset files must **never** be modified, converted, re-encoded, or renamed during scanning, hashing, tagging, or export. Their SHA-256 and byte sizes must remain 100% identical before and after DCT processing.

---

## 3. Redacted Sample Collection (`docs/consent-tagging/examples/sample-collection-redacted/`)

The repository includes a secondary sample folder containing a redacted version of `IMG-0002.png`:
- **File**: `docs/consent-tagging/examples/sample-collection-redacted/IMG-0002.png`
- **File Size**: 10,699 bytes (compared to the unredacted 10,876 bytes)
- **SHA-256 Hash**: `0caf0360e7391643e7fd419ae9f7bb489fab57e0ac0932342d91acab5a0a2896`
- **Purpose**: Used for testing the correction flow (UC-07, T-11). When replacing the original `IMG-0002.png` with this redacted file, the app detects that the SHA-256 hash changed, which permits clearing the bystander count while retaining the consented person row.

---

## 4. Consented List Detailed Analysis (`docs/consent-tagging/examples/consented_list.sample.csv`)

### 4.1 List Metadata & Structure
- **Filename**: `consented_list.sample.csv` (In production: `consented_list_<project_id>_<YYYYMMDD>.csv`)
- **Project ID**: `6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01` (Identical on every row per L02)
- **Project Name**: `Synthetic gait study`
- **List Generated At**: `2026-11-01T04:30:00Z`
- **List Valid Until**: `2026-11-08T04:30:00Z` (Identical on every row per L03)

### 4.2 Participant Breakdown and Selectability

The file contains 4 participant records:

| Index | `person_id` | `consent_id` | `display_name` | `contact_hint` | `consent_expires_at` | `is_minor` | Selectable? | Rationale / UI State |
|---|---|---|---|---|---|---|---|---|
| **001** | `3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1` | `9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101` | `Synthetic Person 001` | `…01` | *(empty / none)* | `false` | **YES** | Active adult consent with no expiration. Select button active. |
| **002** | `7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2` | `1d90a2b3-c4d5-4e6f-8a9b-0c1d2e3f0202` | `Synthetic Person 002` | `…02` | `2027-05-01T00:00:00Z` | `false` | **YES** | Active adult consent valid through May 2027 (after capture date). Select button active. |
| **003** | `c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e03` | `5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f70303` | `Synthetic Person 003` | `…03` | `2026-11-03T00:00:00Z` | `false` | **NO** | **Consent expired**: Expired on `2026-11-03T00:00:00Z`, prior to all collection assets (`2026-11-04`). In UI: Greyed out, no Select button, reason: *"consent expired 3 Nov"*. Exporting this person triggers validator error `E07`. |
| **004** | `d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f04` | `6f7a8b9c-0d1e-4f2a-b3c4-d5e6f7080404` | `Synthetic Person 004` | `…04` | *(empty / none)* | `true` | **NO** | **Minor**: `is_minor == true`. In UI: Greyed out, no Select button, reason: *"minor"*. Exporting this person triggers validator error `E06`. |

### 4.3 Data Contract Rules for Consented Lists (L01–L04)
When loading a consented list, the app must validate:
- **L01**: All 10 required columns must exist (`project_id`, `project_name`, `person_id`, `consent_id`, `display_name`, `contact_hint`, `consent_expires_at`, `is_minor`, `list_generated_at`, `list_valid_until`).
- **L02**: Exactly one unique `project_id` across all rows; non-empty.
- **L03**: `list_valid_until` must be present, valid ISO 8601 UTC with `Z`, and identical across all rows.
- **L04**: No duplicate `person_id` values across rows.
- **Error Behavior**: If any check fails, the list is refused **whole** with a user-facing explanation. No partial records are retained in memory.

---

## 5. Asset Export Samples Comparison (`asset_export.sample.csv` vs Sample Collection)

`docs/consent-tagging/examples/asset_export.sample.csv` serves as the golden positive control for a completed collection export.

### 5.1 File-Level Export Constants
- `export_id`: `0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d` (Must be a fresh lowercase UUID for every save)
- `exported_at`: `2026-11-04T10:00:00Z` (UTC ISO 8601 with `Z`)
- `collection_ref`: `LAB-A-2026-11-04-01` (Prefilled from collection folder name, editable)
- `project_id`: `6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01` (Copied strictly from consented list)

### 5.2 Row-by-Row Mapping Matrix (11 Rows, 8 Assets)

| Row # | `asset_id` | `asset_type` | `captured_at` | `content_sha256` | `row_type` | `person_id` | `consent_id` | `bystander_count` | Notes |
|---|---|---|---|---|---|---|---|---|---|
| 2 | `IMG-0001.png` | `image` | `2026-11-04T06:02:11Z` | `2180908ddf0...` | `person` | `3f1c9d2a...` (001) | `9b2e4f6a...` | *(empty)* | Person 001 tagged |
| 3 | `IMG-0001.png` | `image` | `2026-11-04T06:02:11Z` | `2180908ddf0...` | `person` | `7a44b1c2...` (002) | `1d90a2b3...` | *(empty)* | Person 002 tagged |
| 4 | `IMG-0002.png` | `image` | `2026-11-04T06:05:40Z` | `d7ccb67ce58...` | `person` | `3f1c9d2a...` (001) | `9b2e4f6a...` | *(empty)* | Person 001 tagged |
| 5 | `IMG-0002.png` | `image` | `2026-11-04T06:05:40Z` | `d7ccb67ce58...` | `bystander` | *(empty)* | *(empty)* | `1` | Bystander present (**Held Asset**) |
| 6 | `IMG-0003.png` | `image` | `2026-11-04T06:20:00Z` | `8bf338500e6...` | `person` | `7a44b1c2...` (002) | `1d90a2b3...` | *(empty)* | Person 002 tagged |
| 7 | `IMG-0004.png` | `image` | `2026-11-04T06:30:00Z` | `252faa78eca...` | `no_person` | *(empty)* | *(empty)* | *(empty)* | Marked "No person" |
| 8 | `VID-0005.mp4` | `video` | `2026-11-04T06:40:00Z` | `06020319b52...` | `person` | `7a44b1c2...` (002) | `1d90a2b3...` | *(empty)* | Person 002 tagged |
| 9 | `AUD-0006.wav` | `audio` | `2026-11-04T06:45:00Z` | `570475d23f0...` | `person` | `3f1c9d2a...` (001) | `9b2e4f6a...` | *(empty)* | Person 001 tagged (voice heard) |
| 10 | `AUD-0006.wav` | `audio` | `2026-11-04T06:45:00Z` | `570475d23f0...` | `person` | `7a44b1c2...` (002) | `1d90a2b3...` | *(empty)* | Person 002 tagged (voice heard) |
| 11 | `SNS-0007.csv` | `sensor` | `2026-11-04T06:50:00Z` | `88401662050...` | `person` | `3f1c9d2a...` (001) | `9b2e4f6a...` | *(empty)* | Person 001 tagged (device wearer) |
| 12 | `DOC-0008.pdf` | `document` | `2026-11-04T07:00:00Z` | `8491e3916b7...` | `no_person` | *(empty)* | *(empty)* | *(empty)* | Marked "No person" |

---

## 6. Golden Validation Cases Catalog (`docs/consent-tagging/examples/golden/`)

The golden validation suite defined in `golden/expected.json` provides an exhaustive test harness for validating export sheets against `consented_list.sample.csv`.

| Case File | Simulated Issue | Expected Error Codes | Expected Warning Codes | Rationale |
|---|---|---|---|---|
| `valid_sample.csv` | Base positive sample | *(none)* | `W02` | Valid tagging; warning W02 flags held asset `IMG-0002.png` |
| `e01_unknown_column.csv` | Extra column `notes` added | `E01` | *(none)* | Unknown column violated RFC 4180 strict schema |
| `e02_uppercase_uuid.csv` | `person_id` has uppercase chars | `E02`, `E04` | `W02` | `E02` for non-lowercase UUID regex, `E04` because lookup fails |
| `e03_wrong_project.csv` | Mismatched `project_id` | `E03` | `W02` | `project_id` does not match the consented list's ID |
| `e04_unknown_person.csv` | Synthetic UUID not in list | `E04` | `W02` | Person ID not registered on consented list |
| `e05_someone_elses_consent.csv` | Person 001 with Person 002's consent | `E05` | `W02` | `consent_id` does not match `person_id`'s mapped consent |
| `e06_minor.csv` | Minor tagged (Person 004) | `E06` | `W02` | Person 004 has `is_minor == true` |
| `e07_expired_consent.csv` | Expired person tagged (Person 003) | `E07` | `W02` | Consent expired 2026-11-03, captured 2026-11-04 |
| `e08_after_list_validity.csv` | Asset captured after `list_valid_until` | `E08` | *(none)* | Captured 2026-11-09 > list valid until 2026-11-08 |
| `e09_person_without_consent.csv` | Missing `consent_id` on person row | `E09` | `W02` | Person row missing mandatory consent UUID |
| `e10_same_person_twice.csv` | Person 001 tagged twice on `IMG-0001.png` | `E10` | `W02` | Duplicate person on single asset |
| `e11_bystander_alone.csv` | Bystander row without any person row | `E11` | `W02` | Standalone bystander asset must be deleted, not exported |
| `e12_bad_asset_type.csv` | `asset_type` set to `lidar` | `E12` | `W02` | Invalid asset type outside allowed 6 types |
| `e13_local_time.csv` | Non-UTC timestamp (`2026-11-04 06:30:00`) | `E13` | `W02` | Timestamp missing `Z` UTC indicator or future timestamp |
| `e14_two_collections.csv` | Conflicting `collection_ref` values | `E14` | `W02` | File-level constants differ between rows |
| `e15_bad_hash.csv` | Invalid SHA-256 (`ABC`) | `E15` | `W02` | Hash is not 64 lowercase hex characters |
| `e16_rows_disagree.csv` | Rows of `IMG-0001.png` disagree on capture time | `E16` | `W02` | Metadata values must be identical across all rows of an asset |
| `w01_no_hash.csv` | Missing `content_sha256` | *(none)* | `W01`, `W02` | Empty hash is allowed with warning `W01` |

---

## 7. Test Inputs and Data Fixtures Required for Acceptance Tests T-01, T-02, T-03

To implement and verify Increment 1 under vitest and Playwright, the following test fixtures and mock environments are needed:

### 7.1 Fixtures for T-01 (Folder Loading & Metadata Extraction)
- **Primary Collection Fixture**:
  - Source directory: `docs/consent-tagging/examples/sample-collection/`.
  - In unit and E2E tests, copy this directory to a clean temporary folder so tests never mutate reference files.
- **Structural Edge-Case Fixtures**:
  - **Nested Subdirectories**: Create a subfolder `sub/` containing `sub/x.png`. Test assertion: `asset_id` must normalize to `sub/x.png` with forward slash `/` and type `image`.
  - **Unknown Extension**: Add `sensor_data.xyz`. Test assertion: classifies as `other`.
  - **Custom Type Configuration (`dct-types.json`)**: Add a `dct-types.json` at folder root with content `{"sensor": [".dat"]}` and a file `motion.dat`. Test assertion: classifies as `sensor`.
  - **Excluded Files**: Add `.hidden_asset.png`, `.dct-progress.json`, and `asset_export_test.csv`. Test assertion: completely excluded from the scanned asset list.
  - **Missing EXIF Fallback**: Add an image (e.g. `no_exif.png`) stripped of EXIF tags. Test assertion: `capturedAt` falls back to file's `lastModified`, and `capturedAtSource` is set to `file_modified`.
- **Worker Hashing Test Fixture**:
  - Background Web Worker hash runner (via Web Crypto API or `hash-wasm` streaming chunks).
  - Test assertion: Verify all 8 hashes match the values in `asset_export.sample.csv`.
- **MP4 Creation Time Extraction**:
  - Read `VID-0005.mp4` via `mp4box.js` and extract `mvhd` creation timestamp.
  - Test assertion: `capturedAt` evaluates to `2026-11-04T06:40:00Z` in UTC.

### 7.2 Fixtures for T-02 (Browser Gate & Air-Gapped Network Verification)
- **Unsupported Browser Screen Test**:
  - In vitest/Playwright, simulate an environment where `window.showDirectoryPicker` is `undefined` (or run in Firefox).
  - Test assertion: The app renders solely the unsupported browser message instructing the user to use Chrome or Edge. No Start screen controls or file pickers are displayed.
- **Air-Gapped Network Assertion**:
  - In `index.html`, verify presence of `<meta http-equiv="Content-Security-Policy" content="... connect-src 'none' ...">`.
  - In Playwright, attach request listener:
    ```ts
    const networkRequests: string[] = [];
    page.on('request', req => networkRequests.push(req.url()));
    ```
  - Test assertion: Zero outgoing network requests after initial page bundle load throughout opening folders, loading lists, hashing, and tagging.

### 7.3 Fixtures for T-03 (Consented List Parsing & Privacy Invariants)
- **Valid List Positive Fixture**:
  - `docs/consent-tagging/examples/consented_list.sample.csv`.
  - Test assertions:
    - Parses 4 people successfully.
    - Selectable: Synthetic Person 001 and Synthetic Person 002.
    - Non-selectable: Synthetic Person 003 (reason: *"consent expired 3 Nov"*) and Synthetic Person 004 (reason: *"minor"*).
    - Project name and validity period displayed correctly.
- **Invalid List Negative Fixtures (L01–L04)**:
  1. `list_missing_column.csv`: Remove column `consent_id` -> Rejected with `L01: consented list is missing columns: consent_id`.
  2. `list_multiple_projects.csv`: Set row 2 `project_id` to `11111111-1111-4111-8111-111111111111` -> Rejected with `L02: consented list must hold exactly one project_id, found 2`.
  3. `list_mixed_validity.csv`: Set row 2 `list_valid_until` to `2026-12-01T00:00:00Z` -> Rejected with `L03: consented list must carry one valid list_valid_until on every row`.
  4. `list_duplicate_person.csv`: Duplicate Person 001's row -> Rejected with `L04: person_id ... appears twice in the consented list`.
- **Privacy Invariants Test Assertion**:
  - Execute a full load of `consented_list.sample.csv`.
  - Query browser storage:
    - `localStorage`: Verify no key or value contains `"Synthetic Person"`, `"Person 001"`, `…01`, etc.
    - `sessionStorage`: Verify completely empty of names or contact hints.
    - `IndexedDB`: Verify no object stores contain names or contact hints.
    - `window.location.href`: Verify no query parameters contain names.
    - Console logs (`page.on('console', msg => ...)`): Verify no participant names or contact hints are logged.

---

## 8. Summary Table of Test Fixture Files

| Fixture Path / Description | Role in Testing | Used in Tests |
|---|---|---|
| `docs/consent-tagging/examples/sample-collection/` | Real 8-asset collection | T-01, T-08, T-15, T-16 |
| `docs/consent-tagging/examples/sample-collection-redacted/IMG-0002.png` | Redacted replacement asset | T-11 |
| `docs/consent-tagging/examples/consented_list.sample.csv` | Standard consented list (4 participants) | T-03, T-04, T-05, T-07, T-08 |
| `docs/consent-tagging/examples/asset_export.sample.csv` | Expected output metadata sheet (11 rows) | T-01, T-08 |
| `docs/consent-tagging/examples/asset_export.correction.sample.csv` | Expected correction sheet (1 row) | T-11 |
| `docs/consent-tagging/examples/golden/` (18 files + expected.json) | Reference validation suite | T-07 |
| Synthetic invalid CSV fixtures (`L01`–`L04`) | Negative tests for list parser | T-03 |
| Synthetic nested folder fixture (`sub/x.png`, `dct-types.json`) | Path and custom extension tests | T-01 |
