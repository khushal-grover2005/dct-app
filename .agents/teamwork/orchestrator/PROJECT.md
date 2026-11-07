# Project: Data Collection Tool (DCT) — Increment 1

## Architecture
The Data Collection Tool (DCT) is a fully client-side, air-gapped web application built with React 18, TypeScript (strict mode), and Vite. It operates strictly locally on collection machines without any server, backend, external APIs, telemetry, or network requests (`connect-src 'none'`).

### Core Subsystems
1. **App Shell & Browser Capability Gate (`src/app/`)**:
   - Detects `window.showDirectoryPicker`. If unsupported, renders an unsupported browser screen mandating desktop Chrome or Edge.
   - Enforces zero network calls via CSP in `index.html`.
2. **Collection Ingestion & Asset Catalog (`src/folder/`)**:
   - Recursive traversal of `FileSystemDirectoryHandle`.
   - Path normalization with `/` separators for `asset_id`.
   - 6 asset classifications (`image`, `video`, `audio`, `sensor`, `document`, `other`) with collection-level `dct-types.json` overrides.
   - Non-blocking streaming SHA-256 calculation in a background Web Worker (8MB chunks, 2 concurrent files).
   - Metadata capture time extraction: EXIF `DateTimeOriginal` (Asia/Kolkata -> UTC ISO 8601 with `Z`), MP4 `mvhd` creation time, fallback to file `lastModified`.
   - Invariant: Asset files are never modified, renamed, or re-encoded.
3. **Consented List Parsing & Privacy Invariant (`src/list/`)**:
   - CSV parsing via `papaparse` and schema validation via `zod`.
   - Strict enforcement of rules L01–L04, rejecting invalid lists whole with descriptive reasons.
   - Selectability evaluation: flags minors (`is_minor == true`) and expired consents (`consent_expires_at <= captured_at`).
   - Invariant: Participant `display_name` and `contact_hint` remain strictly in RAM memory and are never written to `localStorage`, `sessionStorage`, `IndexedDB`, URLs, or application logs.
4. **UI View & Dashboard (`src/ui/`)**:
   - Start screen with folder selection and list file loading controls.
   - Asset inventory table displaying asset IDs, types, hashing status, and capture times.
   - Consented list status badge and participant count summary.

---

## Feature Inventory
| # | Feature | Description | Milestone | Source |
|---|---------|-------------|-----------|--------|
| 1 | Air-Gapped App Shell | Vite + React 18 + TS strict project scaffold with Tailwind tokens and ESLint `no-explicit-any: error` | M1 | ORIGINAL_REQUEST §R1 |
| 2 | Strict Content Security Policy | `index.html` configured with `connect-src 'none'` prohibiting any network traffic | M1 | ORIGINAL_REQUEST §R1 |
| 3 | Browser Gate Screen | Detects `window.showDirectoryPicker`; renders Chrome/Edge requirement screen in unsupported browsers | M1 | ORIGINAL_REQUEST §R1, UC-01 |
| 4 | Folder Picker Ingestion | Folder selection via `window.showDirectoryPicker({ mode: 'readwrite' })` | M2 | ORIGINAL_REQUEST §R2, UC-01 |
| 5 | Recursive Directory Traversal | Scans directory tree, ignoring hidden files (`.`) and internal artifacts (`.dct-progress.json`, `asset_export_*.csv`) | M2 | ORIGINAL_REQUEST §R2, app-design.md §3 |
| 6 | Forward-Slash `asset_id` | All relative paths formatted using `/` separators (e.g., `sub/x.png`) | M2 | ORIGINAL_REQUEST §R2, data-contract.md §1 |
| 7 | 6-Type Asset Classification | Maps extensions to `image`, `video`, `audio`, `sensor`, `document`, or `other` | M2 | ORIGINAL_REQUEST §R2, app-design.md §3.1 |
| 8 | Custom `dct-types.json` Override | Loads collection-level type mappings from `dct-types.json` | M2 | ORIGINAL_REQUEST §R2, app-design.md §3.1 |
| 9 | Web Worker Streaming Hashing | Calculates SHA-256 in Web Worker streaming 8MB chunks without freezing UI | M2 | ORIGINAL_REQUEST §R2, app-design.md §3 |
| 10 | EXIF Capture Time Extraction | Extracts `DateTimeOriginal` from images in `Asia/Kolkata` (+05:30) converted to UTC ISO 8601 with `Z` | M2 | ORIGINAL_REQUEST §R2, app-design.md §3 |
| 11 | MP4/MOV `mvhd` Time Extraction | Extracts UTC creation time from MP4/MOV header atoms via `mp4box.js` | M2 | ORIGINAL_REQUEST §R2, app-design.md §3 |
| 12 | File Date Fallback | Uses file `lastModified` when EXIF/MP4 metadata is absent, flagging fallback origin | M2 | ORIGINAL_REQUEST §R2, app-design.md §3 |
| 13 | Asset File Immutability | Guarantees zero byte modifications, conversions, renaming, or writes to collection files | M2 | AGENTS.md Rule 4 |
| 14 | Consented List CSV Parsing | Parses CSV lists with PapaParse and validates schema via Zod | M3 | ORIGINAL_REQUEST §R3, UC-02 |
| 15 | Rule L01 Enforcement | Rejects list whole if any required column is missing | M3 | ORIGINAL_REQUEST §R3, data-contract.md §4 |
| 16 | Rule L02 Enforcement | Rejects list whole if multiple `project_id` values or none exist | M3 | ORIGINAL_REQUEST §R3, data-contract.md §4 |
| 17 | Rule L03 Enforcement | Rejects list whole if `list_valid_until` is missing, invalid, or inconsistent across rows | M3 | ORIGINAL_REQUEST §R3, data-contract.md §4 |
| 18 | Rule L04 Enforcement | Rejects list whole if duplicate `person_id` entries appear | M3 | ORIGINAL_REQUEST §R3, data-contract.md §4 |
| 19 | Minor Selectability Evaluation | Marks minors (`is_minor == true`) as non-selectable with reason "minor" | M3 | ORIGINAL_REQUEST §R3, UC-02 |
| 20 | Consent Expiry Evaluation | Marks expired consents (`consent_expires_at <= captured_at`) as non-selectable | M3 | ORIGINAL_REQUEST §R3, UC-02 |
| 21 | In-Memory Privacy Invariant | Names and contact hints strictly confined to RAM memory (never in storage, URLs, logs) | M3 | ORIGINAL_REQUEST §R3, AGENTS.md Rule 8 |
| 22 | Start Screen UI Layout | Provides folder and list selection controls with status indicators and summary counters | M4 | app-design.md §2 |
| 23 | Asset Inventory View | Displays asset list with classification tags, hashing progress, and capture times | M4 | app-design.md §2 |
| 24 | Acceptance Test T-01 Pass | Vitest/Playwright verification of 8 assets, paths, types, hashes, capture times | M5 | acceptance-tests.md T-01 |
| 25 | Acceptance Test T-02 Pass | Verification of unsupported browser gate and 0 network requests under CSP | M5 | acceptance-tests.md T-02 |
| 26 | Acceptance Test T-03 Pass | Verification of list parsing, L01–L04 rejection, selectability, and privacy invariant | M5 | acceptance-tests.md T-03 |
| 27 | Python Test Validation | `python -m unittest tools/test_validate_export.py` passes all 20 test cases | M5 | AGENTS.md Done means |
| 28 | Lint and Typecheck Pass | `npm run lint` and `tsc --noEmit` pass with zero warnings/errors | M5 | AGENTS.md Done means |
| 29 | Session Log Record | Increment 1 changes and passing test evidence documented in `session-log.md` | M5 | AGENTS.md Report back |

---

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| M1 | Scaffold, Shell, CSP & Browser Gate | Project configuration, Tailwind, ESLint, CSP `connect-src 'none'`, and Browser Gate screen | none | PLANNED |
| M2 | Collection Ingestion, Classification & Hashing | Folder scanning, path normalization, 6-type classification, Web Worker streaming SHA-256, EXIF/MP4 capture times, immutability | M1 | PLANNED |
| M3 | Consented List Parsing, L01–L04 & Privacy | CSV parsing, Zod validation, L01–L04 rejection, minor/expiry evaluation, in-memory privacy | M1 | PLANNED |
| M4 | UI Integration & Start Screen | Complete Start screen integration connecting folder ingestion, list state, and asset inventory | M2, M3 | PLANNED |
| M5 | Final Milestone: Full E2E & Quality Gate | 100% pass of E2E suites (T-01, T-02, T-03), Python tests, linters, typecheck, adversarial coverage (Tier 5), session log | M4 | PLANNED |

---

## Interface Contracts

### Collection Ingestion (`src/folder/`) ↔ UI / State
```typescript
export type AssetType = 'image' | 'video' | 'audio' | 'sensor' | 'document' | 'other';

export interface IngestedAsset {
  assetId: string;              // relative path with '/' (e.g., "IMG-0001.png", "sub/x.png")
  file: File;                  // raw file handle
  assetType: AssetType;        // classified type
  sizeBytes: number;
  sha256?: string;             // populated by background worker
  hashProgress?: number;       // 0 to 100%
  capturedAt: string;          // ISO 8601 UTC string ending in 'Z'
  captureTimeSource: 'exif' | 'mp4box' | 'last_modified';
}

export interface FolderScanResult {
  folderName: string;
  assets: IngestedAsset[];
  warnings: string[];
}
```

### Consented List (`src/list/`) ↔ UI / State
```typescript
export interface ConsentedPerson {
  projectId: string;
  projectName: string;
  personId: string;
  consentId: string;
  displayName: string;         // IN-MEMORY ONLY
  contactHint?: string;        // IN-MEMORY ONLY
  consentExpiresAt?: string;   // ISO 8601 UTC string or null
  isMinor: boolean;
  listGeneratedAt: string;
  listValidUntil: string;
  isSelectable: boolean;       // computed against reference capture time
  nonSelectableReason?: 'minor' | 'expired' | 'revoked';
}

export interface ConsentedListResult {
  projectId: string;
  projectName: string;
  listValidUntil: string;
  people: ConsentedPerson[];
  totalCount: number;
  selectableCount: number;
}
```

---

## Code Layout
```
c:\Users\pc\.gemini\antigravity\scratch\dct-app\
├── index.html                  # CSP connect-src 'none', root mount
├── package.json                # React 18, Vite, TS, Tailwind, Zod, PapaParse, hash-wasm, mp4box, exifr
├── tsconfig.json               # strict: true, noImplicitAny: true
├── vite.config.ts              # Vite configuration
├── vitest.config.ts            # Vitest unit test configuration
├── playwright.config.ts        # Playwright E2E configuration
├── src/
│   ├── main.tsx                # Entry point & Browser Gate evaluation
│   ├── app/
│   │   ├── App.tsx             # Main container
│   │   └── BrowserGate.tsx     # Unsupported browser fallback UI
│   ├── folder/
│   │   ├── scanner.ts          # Recursive folder scanner & asset_id normalization
│   │   ├── classifier.ts       # 6-type classification + dct-types.json support
│   │   ├── captureTime.ts      # EXIF (Asia/Kolkata -> UTC) + mp4box + lastModified
│   │   ├── hashWorker.ts       # Web Worker streaming SHA-256 (8MB chunks)
│   │   └── hashManager.ts      # Worker pool / concurrency controller (2 files max)
│   ├── list/
│   │   ├── parser.ts           # PapaParse + Zod schema validation
│   │   ├── validator.ts        # L01, L02, L03, L04 rule enforcement
│   │   └── selectability.ts    # Minor and expiry evaluation
│   ├── ui/
│   │   ├── StartScreen.tsx     # Start screen folder + list ingestion UI
│   │   ├── AssetTable.tsx      # Ingested assets list & progress
│   │   └── ListSummary.tsx     # Consented list status badge
│   └── styles/
│       └── index.css           # Tailwind / CSS tokens
├── tests/
│   ├── unit/                   # Vitest unit tests (scanner, classifier, captureTime, validator, etc.)
│   └── fixtures/               # Test fixtures (sample collection, negative list variants)
└── e2e/                        # Playwright E2E tests (T-01, T-02, T-03, network interception)
```
