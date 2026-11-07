# Milestone 4 Exploration Report: Start Screen UI Architecture & Layout

## 1. Observation

### 1.1 Requirements & Context Sources
Direct inspection of project documentation, specifications, and codebase reveals:
1. **`ORIGINAL_REQUEST.md` (Lines 26–30, 38–49)**:
   - R2: Start screen folder picker via `window.showDirectoryPicker({ mode: 'readwrite' })`. Background Web Worker SHA-256 calculation without freezing UI.
   - R3: Consented list loading via PapaParse & Zod, enforcing L01–L04, evaluating selectability (minors, expired consents). In-memory privacy invariant: participant display names and contact hints strictly confined to RAM.
   - Acceptance criteria: 8 assets in sample collection, forward-slash `asset_id`, 6 types, SHA-256 match, capture times (`VID-0005.mp4` 06:40:00Z from header, fallback marked as file date). Sample list loads 4 people, 2 non-selectable.
2. **`AGENTS.md` (Lines 10–26, 45–52)**:
   - Rule 1: Stack is fixed: React 18 + TypeScript strict + Vite static build + Tailwind CSS.
   - Rule 2: CSP `connect-src 'none'`.
   - Rule 3: The three ids are copied, never typed. No screen offers an input for `project_id`, `person_id`, or `consent_id`.
   - Rule 8: Names stay in memory. Never written to browser storage, URL, or logs.
3. **`docs/consent-tagging/app-design.md` (§2.1 & §2.5)**:
   - §2.1: Start screen has three steps on one page, each unlocking the next:
     1. *Open collection folder* — picker; every file is an asset (except hidden and app files). Shows count per type and lists any `other` files.
     2. *Load consented list* — file picker. Shows project name, people, how many are not selectable (minors, expired), and `list_valid_until`. Applies L01–L04; failing list refused whole.
     3. *Collection name* — prefilled with folder name, editable (`collection_ref`).
   - §2.5: Layout rules: minimum window 1280 × 720; everything reachable by keyboard; **status chips carry text, not colour alone**.
4. **Existing Codebase Modules**:
   - `src/folder/types.ts` & `src/folder/index.ts`: Exports `IngestedAsset`, `FolderScanResult`, `CustomTypeMap`, `CaptureTimeSource`, `AggregateProgress`, `HashManager`, `scanFolder`.
   - `src/list/types.ts` & `src/list/index.ts`: Exports `ConsentedPerson`, `ConsentedListResult`, `ListValidationError`, `ListParseResult`, `loadConsentedList`, `evaluateSelectability`.
   - `package.json`: Contains `react`, `react-dom`, `lucide-react`, `tailwindcss`, `zod`, `papaparse`, `hash-wasm`, `exifr`, `mp4box`, `@testing-library/react`.
   - Current test status: `npm test` passes 13 test files / 190 tests; `npm run lint` passes (0 warnings); `npm run typecheck` passes (0 errors); `python -m unittest tools/test_validate_export.py` passes 20/20 tests.

---

## 2. Logic Chain

### 2.1 UI Component Breakdown & Hierarchy
To satisfy UC-01, UC-02, app-design.md §2.1, and AGENTS.md Rules 3 & 8, the UI under `src/ui/` is structured as a modular hierarchy:

```
src/ui/
├── types.ts                    # UI view state & event handler interfaces
├── StartScreen.tsx             # Top-level layout container coordinating Folder & List
├── FolderSection.tsx           # Collection folder ingestion controls, status & aggregate hashing progress
├── AssetTable.tsx              # Tabular view of ingested assets with type badges, hash progress, capture times
├── ListSection.tsx             # Consented list loader container with file input and error banner
├── ListErrorBanner.tsx         # Red alert banner displaying L01–L04 / BOM whole rejection errors
├── ListSummary.tsx             # Metric summary cards (project, total, selectable, expired/minor, validity)
└── ParticipantTable.tsx        # In-memory participant preview table with selectability chips
```

### 2.2 Component Specifications & Responsibilities

#### 1. `StartScreen.tsx` (Container)
- **Role**: Coordinates the overall Start screen workflow, maintaining folder state and consented list state.
- **Workflow Steps**:
  1. Collection Folder Ingestion (`FolderSection`).
  2. Consented List Loading (`ListSection`).
  3. Collection Reference Confirmation (`collection_ref` input, prefilled with folder name).
  4. "Proceed to Tagging Workspace" action bar (enabled only when folder is scanned, all hashes completed, and list is validly loaded without errors).
- **State Model**:
  ```typescript
  interface StartScreenState {
    // Folder State
    directoryHandle: FileSystemDirectoryHandle | null;
    folderName: string | null;
    assets: IngestedAsset[];
    isScanning: boolean;
    scanWarnings: string[];
    aggregateProgress: AggregateProgress | null;
    isHashingComplete: boolean;

    // Consented List State
    listFile: File | null;
    listResult: ConsentedListResult | null;
    listErrors: ListValidationError[] | null;
    isLoadingList: boolean;

    // Collection Metadata
    collectionRef: string;
  }
  ```

#### 2. `FolderSection.tsx` & `FolderPicker`
- **Actions**:
  - "Open collection folder" button:
    - Calls `window.showDirectoryPicker({ mode: 'readwrite' })`.
    - Handles user dismissal (`AbortError`) silently.
    - Triggers `scanFolder(handle)` and updates `isScanning`.
    - Automatically enqueues scanned assets into `HashManager` for streaming SHA-256 background computation.
- **Header & Metric Badges**:
  - Folder Name: Badge displaying `<Folder className="w-4 h-4" /> {folderName}`.
  - Asset Count: Badge displaying `{assets.length} assets`.
  - Type Breakdown Pills:
    - `image`: Blue (`sky-50 text-sky-700 border-sky-200`)
    - `video`: Purple (`purple-50 text-purple-700 border-purple-200`)
    - `audio`: Amber (`amber-50 text-amber-700 border-amber-200`)
    - `sensor`: Teal (`teal-50 text-teal-700 border-teal-200`)
    - `document`: Indigo (`indigo-50 text-indigo-700 border-indigo-200`)
    - `other`: Slate (`slate-100 text-slate-700 border-slate-300`)
  - "Other" Files Warning (per app-design §2.1):
    - If `otherCount > 0`, renders an amber warning pill: `"{otherCount} unclassified 'other' file(s) - check extensions"`.
- **Aggregate Hashing Progress Bar**:
  - Rendered when folder contains assets.
  - Displays:
    - Bar: `w-full bg-slate-200 rounded-full h-2.5` with `bg-emerald-600` fill mapped to `aggregateProgress.overallPercent`.
    - Text: `"Hashing: {completedAssets} of {totalAssets} assets ({overallPercent}%)"`.
    - Completed State: Green badge with `<CheckCircle2 /> "All hashes computed"`.

#### 3. `AssetTable.tsx`
- **Role**: Clean tabular display of scanned files with real-time hash computation status.
- **Columns**:
  1. `Asset ID`: Monospace relative path (e.g., `IMG-0001.png`, `sub/x.png`) with forward slashes.
  2. `Type`: Semantic badge with icon and explicit text label (`image`, `video`, `audio`, `sensor`, `document`, `other`).
  3. `SHA-256 Hash`:
     - Monospace font.
     - Completed: First 8 + `...` + last 8 hex characters, with full 64-char string on title/tooltip and click-to-copy.
     - In progress: Progress bar / percent (`{asset.hashProgress}%`) or spinner.
     - Queued: `"Queued"`.
  4. `Capture Time & Source`:
     - Formatted ISO UTC string: e.g. `2026-11-04T06:02:11Z` (`font-mono text-xs`).
     - Source Badge (satisfying T-01):
       - `exif` -> Green badge `"EXIF"`
       - `mp4box` -> Cyan/Indigo badge `"MP4 header"`
       - `last_modified` -> Amber badge `"file date"`
  5. `Size`: Human-readable size (e.g. `245 KB`, `1.2 MB`).
- **Non-Fatal Warnings Callout**:
  - Displays any `scanWarnings` (such as `dct-types.json` parsing warnings or unreadable file errors) in an alert box above the table.

#### 4. `ListSection.tsx` & `ListPicker`
- **Actions**:
  - "Load consented list" button:
    - Icon: `<FileText className="w-4 h-4 mr-2" />`.
    - Triggers hidden `<input type="file" accept=".csv" data-testid="list-file-input" />`.
    - Reads file content with `await file.text()` and executes `loadConsentedList(text, { referenceTime })`.
- **Error Handling (`ListErrorBanner.tsx`)**:
  - Renders when `loadConsentedList` returns `{ success: false, errors }`.
  - Color: Rose/Red banner (`bg-rose-50 border-rose-200 text-rose-800`).
  - Displays error code (`L01`, `L02`, `L03`, `L04`, `BOM_NOT_ALLOWED`, `CSV_PARSE_ERROR`) and descriptive message.
  - Invariant: Participant table is hidden when list is rejected whole.
  - Invariant: Zero names or contact hints in error banner (preserved by `src/list/validator.ts`).

#### 5. `ListSummary.tsx`
- **Metric Cards Layout**:
  - Project Info:
    - Project Name: e.g. `Synthetic gait study`.
    - Project ID: Monospace `6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01` (read-only, never editable).
  - People Metrics:
    - Total Participants: `4 people`.
    - Selectable: `2 selectable` (Emerald badge).
    - Non-Selectable: `2 not selectable` (Amber badge: `1 minor, 1 expired`).
  - Validity Period:
    - `list_valid_until`: Formatted UTC (e.g. `2026-11-08T04:30:00Z`).
    - Expiration notice if validity is within 7 days.

#### 6. `ParticipantTable.tsx`
- **Role**: Displays participant preview strictly in RAM memory.
- **Columns**:
  1. `Person ID`: Monospace UUID.
  2. `Display Name`: Name rendered directly from in-memory object.
  3. `Contact Hint`: Contact hint or `—`.
  4. `Consent Expiry`: Formatted UTC date or `None`.
  5. `Selectability`:
     - Selectable: `<span className="px-2 py-0.5 rounded text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">Selectable</span>`
     - Non-Selectable: `<span className="px-2 py-0.5 rounded text-xs font-medium bg-slate-100 text-slate-600 border border-slate-300">Not Selectable</span>`
  6. `Reason`:
     - Minor: `<span className="px-2 py-0.5 rounded text-xs font-medium bg-rose-50 text-rose-700 border border-rose-200">minor</span>`
     - Expired: `<span className="px-2 py-0.5 rounded text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">consent expired 3 Nov</span>`
     - List Expired: `<span className="px-2 py-0.5 rounded text-xs font-medium bg-red-50 text-red-700 border border-red-200">list expired</span>`
- **In-Memory Privacy Guarantee**:
  - Zero writes to `localStorage`, `sessionStorage`, `IndexedDB`, URL query parameters, or browser history.
  - Zero `console.log` logging of participant objects or names.

---

### 2.3 Styling & CSS Design Tokens (Clean Offline Lab Aesthetic)

The DCT UI utilizes Tailwind CSS configured in `tailwind.config.js` and `src/styles/index.css`:

| Category | Tailwind Token Classes | Usage Context |
|---|---|---|
| **Background & Shell** | `bg-slate-50`, `min-h-screen`, `min-w-[1280px]` | Application base and page layout |
| **Card / Surface** | `bg-white`, `border border-slate-200`, `rounded-lg`, `shadow-sm` | Section containers, metric cards |
| **Primary Typography** | `text-slate-900`, `font-semibold`, `font-medium` | Headers, labels, primary text |
| **Muted Typography** | `text-slate-500`, `text-slate-600`, `text-xs` / `text-sm` | Captions, secondary timestamps |
| **Code / Monospace** | `font-mono text-xs text-slate-800` | `asset_id`, SHA-256 hash, UUIDs, ISO UTC dates |
| **Primary Buttons** | `bg-slate-900 hover:bg-slate-800 text-white font-medium px-4 py-2 rounded-md shadow-sm transition` | "Open collection folder", "Load consented list" |
| **Disabled Buttons** | `bg-slate-200 text-slate-400 cursor-not-allowed` | Inactive actions |
| **Success / Valid** | `bg-emerald-50 text-emerald-700 border border-emerald-200` | Completed hash, selectable badge |
| **Warning / Notice** | `bg-amber-50 text-amber-800 border border-amber-200` | File date fallback, expiring consent |
| **Error / Refusal** | `bg-rose-50 text-rose-800 border border-rose-200` | L01–L04 refusal banner, minor badge |
| **Progress Bar** | Track: `bg-slate-200 h-2 rounded-full`, Fill: `bg-emerald-600 transition-all` | Aggregate hashing progress |

---

### 2.4 Accessibility & Test Selectors Schema (`data-testid`)

Every interactive element, table row, and indicator carries a deterministic `data-testid` for reliable Vitest and Playwright automation:

```typescript
export const TEST_IDS = {
  // Top Level
  START_SCREEN: 'start-screen',
  COLLECTION_REF_INPUT: 'collection-ref-input',
  PROCEED_BUTTON: 'btn-proceed-tagging',

  // Folder Section
  FOLDER_SECTION: 'folder-section',
  OPEN_FOLDER_BTN: 'btn-open-folder',
  FOLDER_NAME_BADGE: 'folder-name-badge',
  ASSET_COUNT_BADGE: 'asset-count-badge',
  TYPE_PILL: (type: string) => `type-pill-${type}`,
  OTHER_WARNING_PILL: 'other-warning-pill',
  HASH_PROGRESS_BAR: 'hash-progress-bar',
  HASH_PROGRESS_TEXT: 'hash-progress-text',
  HASH_COMPLETE_BADGE: 'hash-complete-badge',
  FOLDER_WARNINGS_CALLOUT: 'folder-warnings-callout',

  // Asset Table
  ASSET_TABLE: 'asset-table',
  ASSET_ROW: (assetId: string) => `asset-row-${assetId}`,
  ASSET_ID_CELL: 'asset-id-cell',
  ASSET_TYPE_BADGE: 'asset-type-badge',
  ASSET_HASH_CELL: 'asset-hash-cell',
  ASSET_CAPTURED_AT_CELL: 'asset-captured-at-cell',
  ASSET_TIME_SOURCE_BADGE: 'asset-time-source-badge',

  // List Section
  LIST_SECTION: 'list-section',
  LOAD_LIST_BTN: 'btn-load-list',
  LIST_FILE_INPUT: 'list-file-input',
  LIST_ERROR_BANNER: 'list-error-banner',
  LIST_ERROR_MESSAGE: 'list-error-message',

  // List Summary
  LIST_SUMMARY: 'list-summary',
  PROJECT_NAME: 'project-name',
  PROJECT_ID: 'project-id',
  TOTAL_PEOPLE_COUNT: 'total-people-count',
  SELECTABLE_COUNT: 'selectable-count',
  NON_SELECTABLE_COUNT: 'non-selectable-count',
  LIST_VALID_UNTIL: 'list-valid-until',

  // Participant Table
  PARTICIPANT_TABLE: 'participant-table',
  PARTICIPANT_ROW: (personId: string) => `participant-row-${personId}`,
  PARTICIPANT_ID: 'participant-id',
  PARTICIPANT_NAME: 'participant-name',
  PARTICIPANT_CONTACT: 'participant-contact',
  PARTICIPANT_STATUS_BADGE: 'participant-status-badge',
  PARTICIPANT_REASON_BADGE: 'participant-reason-badge',
} as const;
```

---

## 3. Proposed Component Code Blueprints

### Blueprint 1: `src/ui/types.ts`
```typescript
import type { IngestedAsset, AggregateProgress, CustomTypeMap } from '../folder';
import type { ConsentedListResult, ListValidationError } from '../list';

export interface FolderUiState {
  directoryHandle: FileSystemDirectoryHandle | null;
  folderName: string | null;
  assets: IngestedAsset[];
  isScanning: boolean;
  scanWarnings: string[];
  customTypeMap?: CustomTypeMap;
  aggregateProgress: AggregateProgress | null;
  isHashingComplete: boolean;
  hashingError: string | null;
}

export interface ListUiState {
  listFile: File | null;
  listResult: ConsentedListResult | null;
  listErrors: ListValidationError[] | null;
  isLoading: boolean;
}

export interface StartScreenProps {
  onStartTagging?: (collectionRef: string, folder: FolderUiState, list: ListUiState) => void;
}
```

### Blueprint 2: `src/ui/FolderSection.tsx`
```typescript
import React from 'react';
import { FolderOpen, CheckCircle2, AlertTriangle, Layers } from 'lucide-react';
import type { FolderUiState } from './types';
import type { AssetType } from '../folder';

interface FolderSectionProps {
  folderState: FolderUiState;
  onOpenFolder: () => Promise<void>;
}

const TYPE_COLORS: Record<AssetType, string> = {
  image: 'bg-sky-50 text-sky-700 border-sky-200',
  video: 'bg-purple-50 text-purple-700 border-purple-200',
  audio: 'bg-amber-50 text-amber-700 border-amber-200',
  sensor: 'bg-teal-50 text-teal-700 border-teal-200',
  document: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  other: 'bg-slate-100 text-slate-700 border-slate-300',
};

export const FolderSection: React.FC<FolderSectionProps> = ({ folderState, onOpenFolder }) => {
  const { folderName, assets, isScanning, scanWarnings, aggregateProgress, isHashingComplete } = folderState;

  // Compute asset type counts
  const typeCounts = React.useMemo(() => {
    const counts: Record<AssetType, number> = {
      image: 0,
      video: 0,
      audio: 0,
      sensor: 0,
      document: 0,
      other: 0,
    };
    assets.forEach((a) => {
      counts[a.assetType] = (counts[a.assetType] ?? 0) + 1;
    });
    return counts;
  }, [assets]);

  return (
    <div data-testid="folder-section" className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-slate-100 rounded-lg text-slate-700">
            <FolderOpen className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">1. Collection Folder</h2>
            <p className="text-xs text-slate-500">Select directory of captured assets to inspect and hash</p>
          </div>
        </div>
        <button
          type="button"
          data-testid="btn-open-folder"
          onClick={onOpenFolder}
          disabled={isScanning}
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 transition"
        >
          {isScanning ? 'Scanning folder...' : folderName ? 'Change folder' : 'Open collection folder'}
        </button>
      </div>

      {folderName && (
        <div className="mt-4 space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <span data-testid="folder-name-badge" className="px-3 py-1 rounded-md text-xs font-mono font-medium bg-slate-100 text-slate-800 border border-slate-200">
              📁 {folderName}/
            </span>
            <span data-testid="asset-count-badge" className="px-3 py-1 rounded-md text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200">
              {assets.length} assets
            </span>
            {(Object.keys(typeCounts) as AssetType[]).map((type) => {
              const count = typeCounts[type];
              if (count === 0 && type !== 'other') return null;
              return (
                <span
                  key={type}
                  data-testid={`type-pill-${type}`}
                  className={`px-2.5 py-0.5 rounded-full text-xs font-medium border ${TYPE_COLORS[type]}`}
                >
                  {count} {type}
                </span>
              );
            })}
            {typeCounts.other > 0 && (
              <span data-testid="other-warning-pill" className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-800 border border-amber-300">
                <AlertTriangle className="w-3 h-3 mr-1" />
                {typeCounts.other} unclassified 'other' file(s)
              </span>
            )}
          </div>

          {/* Hashing progress */}
          <div className="bg-slate-50 border border-slate-200 rounded-md p-3">
            <div className="flex justify-between items-center mb-1.5">
              <span className="text-xs font-medium text-slate-700">SHA-256 Hashing Status</span>
              <span data-testid="hash-progress-text" className="text-xs font-mono text-slate-600">
                {isHashingComplete ? (
                  <span data-testid="hash-complete-badge" className="inline-flex items-center text-emerald-700 font-medium">
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> Completed (100%)
                  </span>
                ) : aggregateProgress ? (
                  `${aggregateProgress.completedAssets} of ${aggregateProgress.totalAssets} (${aggregateProgress.overallPercent}%)`
                ) : (
                  'Waiting...'
                )}
              </span>
            </div>
            <div data-testid="hash-progress-bar" className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
              <div
                className="bg-emerald-600 h-2 transition-all duration-300 rounded-full"
                style={{ width: `${isHashingComplete ? 100 : aggregateProgress?.overallPercent ?? 0}%` }}
              />
            </div>
          </div>

          {/* Warnings callout */}
          {scanWarnings.length > 0 && (
            <div data-testid="folder-warnings-callout" className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800 space-y-1">
              <div className="font-semibold flex items-center">
                <AlertTriangle className="w-4 h-4 mr-1 text-amber-600" /> Collection Warnings:
              </div>
              <ul className="list-disc list-inside space-y-0.5">
                {scanWarnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
```

### Blueprint 3: `src/ui/AssetTable.tsx`
```typescript
import React from 'react';
import type { IngestedAsset, AssetType, CaptureTimeSource } from '../folder';

interface AssetTableProps {
  assets: IngestedAsset[];
}

const TYPE_BADGES: Record<AssetType, string> = {
  image: 'bg-sky-50 text-sky-700 border-sky-200',
  video: 'bg-purple-50 text-purple-700 border-purple-200',
  audio: 'bg-amber-50 text-amber-700 border-amber-200',
  sensor: 'bg-teal-50 text-teal-700 border-teal-200',
  document: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  other: 'bg-slate-100 text-slate-700 border-slate-300',
};

const SOURCE_BADGES: Record<CaptureTimeSource, { label: string; class: string }> = {
  exif: { label: 'EXIF', class: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  mp4box: { label: 'MP4 header', class: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
  last_modified: { label: 'file date', class: 'bg-amber-50 text-amber-700 border-amber-200' },
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const AssetTable: React.FC<AssetTableProps> = ({ assets }) => {
  if (assets.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <h3 className="text-sm font-semibold text-slate-800">Scanned Assets Catalog ({assets.length})</h3>
        <span className="text-xs text-slate-500">Asset paths normalized with '/'</span>
      </div>
      <div className="overflow-x-auto">
        <table data-testid="asset-table" className="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 font-medium uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-4 py-3">Asset ID</th>
              <th scope="col" className="px-4 py-3">Type</th>
              <th scope="col" className="px-4 py-3">Size</th>
              <th scope="col" className="px-4 py-3">Capture Time</th>
              <th scope="col" className="px-4 py-3">Source</th>
              <th scope="col" className="px-4 py-3">SHA-256</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {assets.map((asset) => {
              const sourceInfo = SOURCE_BADGES[asset.captureTimeSource];
              return (
                <tr key={asset.assetId} data-testid={`asset-row-${asset.assetId}`} className="hover:bg-slate-50 transition">
                  <td data-testid="asset-id-cell" className="px-4 py-2.5 font-mono text-slate-900 font-medium">
                    {asset.assetId}
                  </td>
                  <td className="px-4 py-2.5">
                    <span data-testid="asset-type-badge" className={`px-2 py-0.5 rounded text-[11px] font-medium border ${TYPE_BADGES[asset.assetType]}`}>
                      {asset.assetType}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-600">
                    {formatFileSize(asset.sizeBytes)}
                  </td>
                  <td data-testid="asset-captured-at-cell" className="px-4 py-2.5 font-mono text-slate-800">
                    {asset.capturedAt}
                  </td>
                  <td className="px-4 py-2.5">
                    <span data-testid="asset-time-source-badge" className={`px-2 py-0.5 rounded text-[11px] font-medium border ${sourceInfo.class}`}>
                      {sourceInfo.label}
                    </span>
                  </td>
                  <td data-testid="asset-hash-cell" className="px-4 py-2.5 font-mono text-slate-600">
                    {asset.sha256 ? (
                      <span title={asset.sha256} className="text-slate-800">
                        {asset.sha256.slice(0, 8)}...{asset.sha256.slice(-8)}
                      </span>
                    ) : asset.hashProgress !== undefined ? (
                      <span className="text-blue-600 font-sans">{asset.hashProgress}%</span>
                    ) : (
                      <span className="text-slate-400 font-sans">Queued</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

### Blueprint 4: `src/ui/ListSection.tsx` & `ListErrorBanner.tsx`
```typescript
import React, { useRef } from 'react';
import { FileText, AlertCircle } from 'lucide-react';
import type { ListUiState } from './types';
import type { ListValidationError } from '../list';

interface ListSectionProps {
  listState: ListUiState;
  onLoadListFile: (file: File) => Promise<void>;
}

export const ListErrorBanner: React.FC<{ errors: ListValidationError[] }> = ({ errors }) => {
  return (
    <div data-testid="list-error-banner" className="bg-rose-50 border border-rose-200 rounded-lg p-4 mb-4 text-rose-800">
      <div className="flex items-center space-x-2 font-semibold text-sm mb-1">
        <AlertCircle className="w-4 h-4 text-rose-600" />
        <span>Consented List Refused (L01–L04 Data Contract Violation)</span>
      </div>
      <ul className="list-disc list-inside space-y-1 text-xs">
        {errors.map((err, idx) => (
          <li key={idx} data-testid="list-error-message">
            <span className="font-mono font-medium">[{err.code}]</span> {err.message}
          </li>
        ))}
      </ul>
    </div>
  );
};

export const ListSection: React.FC<ListSectionProps> = ({ listState, onLoadListFile }) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await onLoadListFile(file);
    }
  };

  return (
    <div data-testid="list-section" className="bg-white rounded-lg border border-slate-200 p-6 shadow-sm mb-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div className="flex items-center space-x-3">
          <div className="p-2 bg-slate-100 rounded-lg text-slate-700">
            <FileText className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-slate-900">2. Consented Participants List</h2>
            <p className="text-xs text-slate-500">Load consented participants CSV file (validated under L01–L04)</p>
          </div>
        </div>
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            data-testid="list-file-input"
            className="hidden"
            onChange={handleFileChange}
          />
          <button
            type="button"
            data-testid="btn-load-list"
            onClick={() => fileInputRef.current?.click()}
            disabled={listState.isLoading}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-slate-900 hover:bg-slate-800 disabled:bg-slate-300 transition"
          >
            {listState.isLoading ? 'Validating CSV...' : listState.listResult ? 'Reload consented list' : 'Load consented list'}
          </button>
        </div>
      </div>

      <div className="mt-4">
        {listState.listErrors && listState.listErrors.length > 0 && (
          <ListErrorBanner errors={listState.listErrors} />
        )}
      </div>
    </div>
  );
};
```

### Blueprint 5: `src/ui/ListSummary.tsx` & `ParticipantTable.tsx`
```typescript
import React from 'react';
import type { ConsentedListResult } from '../list';

export const ListSummary: React.FC<{ listResult: ConsentedListResult }> = ({ listResult }) => {
  const nonSelectableCount = listResult.totalCount - listResult.selectableCount;

  return (
    <div data-testid="list-summary" className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Project Name</div>
        <div data-testid="project-name" className="text-base font-semibold text-slate-900 mt-1 truncate">
          {listResult.projectName}
        </div>
        <div data-testid="project-id" className="text-[11px] font-mono text-slate-500 mt-0.5 truncate" title={listResult.projectId}>
          {listResult.projectId}
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Total Participants</div>
        <div data-testid="total-people-count" className="text-2xl font-semibold text-slate-900 mt-1">
          {listResult.totalCount}
        </div>
        <div className="text-xs text-slate-500 mt-0.5">Parsed people records</div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">Selectability Breakdown</div>
        <div className="flex items-center space-x-2 mt-1">
          <span data-testid="selectable-count" className="text-lg font-semibold text-emerald-700">
            {listResult.selectableCount} selectable
          </span>
          <span className="text-slate-300">/</span>
          <span data-testid="non-selectable-count" className="text-lg font-semibold text-amber-700">
            {nonSelectableCount} not selectable
          </span>
        </div>
        <div className="text-xs text-slate-500 mt-0.5">Minors & expired consents excluded</div>
      </div>

      <div className="bg-white border border-slate-200 rounded-lg p-4 shadow-sm">
        <div className="text-xs font-medium text-slate-500 uppercase tracking-wide">List Validity</div>
        <div data-testid="list-valid-until" className="text-sm font-mono font-medium text-slate-900 mt-1">
          {listResult.listValidUntil}
        </div>
        <div className="text-xs text-emerald-600 font-medium mt-0.5">Active authorization period</div>
      </div>
    </div>
  );
};

export const ParticipantTable: React.FC<{ listResult: ConsentedListResult }> = ({ listResult }) => {
  return (
    <div className="bg-white rounded-lg border border-slate-200 shadow-sm overflow-hidden mb-6">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
        <h3 className="text-sm font-semibold text-slate-800">Consented Participants Preview ({listResult.totalCount})</h3>
        <span className="text-xs text-emerald-700 font-medium bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full">
          In-Memory Only (AGENTS.md Rule 8)
        </span>
      </div>
      <div className="overflow-x-auto">
        <table data-testid="participant-table" className="min-w-full divide-y divide-slate-200 text-left text-xs">
          <thead className="bg-slate-50 text-slate-600 font-medium uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-4 py-3">Person ID</th>
              <th scope="col" className="px-4 py-3">Display Name</th>
              <th scope="col" className="px-4 py-3">Contact Hint</th>
              <th scope="col" className="px-4 py-3">Consent Expires</th>
              <th scope="col" className="px-4 py-3">Status</th>
              <th scope="col" className="px-4 py-3">Selectability Reason</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-slate-100">
            {listResult.people.map((person) => (
              <tr key={person.personId} data-testid={`participant-row-${person.personId}`} className="hover:bg-slate-50 transition">
                <td data-testid="participant-id" className="px-4 py-2.5 font-mono text-slate-700">
                  {person.personId}
                </td>
                <td data-testid="participant-name" className="px-4 py-2.5 font-medium text-slate-900">
                  {person.displayName}
                </td>
                <td data-testid="participant-contact" className="px-4 py-2.5 text-slate-600">
                  {person.contactHint || '—'}
                </td>
                <td className="px-4 py-2.5 font-mono text-slate-600">
                  {person.consentExpiresAt || 'No expiration'}
                </td>
                <td className="px-4 py-2.5">
                  <span
                    data-testid="participant-status-badge"
                    className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                      person.isSelectable
                        ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        : 'bg-slate-100 text-slate-600 border-slate-300'
                    }`}
                  >
                    {person.isSelectable ? 'Selectable' : 'Not Selectable'}
                  </span>
                </td>
                <td className="px-4 py-2.5">
                  {person.formattedReason && (
                    <span
                      data-testid="participant-reason-badge"
                      className={`px-2 py-0.5 rounded text-[11px] font-medium border ${
                        person.nonSelectableReason === 'minor'
                          ? 'bg-rose-50 text-rose-700 border-rose-200'
                          : 'bg-amber-50 text-amber-700 border-amber-200'
                      }`}
                    >
                      {person.formattedReason}
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
```

---

## 4. Caveats
1. **Web Worker in Headless/jsdom Test Runners**:
   Vitest standard jsdom environment does not provide native `Worker`. `HashManager` has support for workerFactory injection or mock fallbacks, which the unit test harness already employs. UI unit tests should mock or inject simulated hashing events to avoid jsdom Worker errors.
2. **`showDirectoryPicker` Browser Mocking**:
   In Playwright or test environments, native OS file picker dialogs cannot be automated directly without browser hooks. Using a hidden `<input type="file" accept=".csv" />` for the consented list allows Playwright `page.setInputFiles()` to seamlessly drive list loading in E2E tests, while folder ingestion can use a test hook or mocked directory handle.
3. **Reference Time Synchronization**:
   When evaluating selectability on the Start screen, if the collection folder has already been loaded, the earliest or reference capture time from the collection assets can be passed to `loadConsentedList`. If not yet loaded, it defaults to current time (`new Date()`). In either case, for the sample dataset (capture date ~2026-11-04 vs expired consent 2026-11-03), Synthetic Person 003 and 004 are correctly evaluated as non-selectable.
4. **Collection Reference Prefix**:
   App-design §2.1 Step 3 specifies that `collection_ref` defaults to the folder name and is editable. The bottom action bar should display an editable text input for `collection_ref` prefilled with `folderName`.

---

## 5. Conclusion
Milestone 4's Start screen architecture is fully specified:
- Implements the complete 3-step Start screen workflow defined in `docs/consent-tagging/app-design.md` §2.1.
- Seamlessly connects `src/folder/` (scanner, 6-type classifier, captureTime, hashManager) and `src/list/` (CSV parser, L01–L04 validator, selectability).
- Strictly preserves AGENTS.md Rule 3 (no typing of IDs) and Rule 8 (in-memory privacy: display names and contact hints remain strictly in RAM).
- Incorporates accessible, high-contrast Tailwind tokens and semantic badge labels carrying both text and color per app-design.md §2.5.
- Provides complete `data-testid` schema facilitating deterministic E2E verification for T-01, T-02, and T-03.

---

## 6. Verification Method

### 6.1 Independent Static & Test Commands
```bash
# 1. Verify existing unit test suite passes (190 tests)
npm test

# 2. Verify ESLint rules pass with zero warnings
npm run lint

# 3. Verify TypeScript strict typecheck passes
npm run typecheck

# 4. Verify Python reference export validator passes
python -m unittest tools/test_validate_export.py
```

### 6.2 Component Verification Steps for Implementer
1. Mount `<StartScreen />` inside `src/app/App.tsx`.
2. Create `tests/unit/ui/startScreen.test.tsx` verifying:
   - Initial layout with folder picker and list loader buttons.
   - Folder selection displays folder name badge, asset count (8 assets), type badges, and aggregate hashing progress.
   - Consented list selection with valid CSV renders summary metrics (4 people, 2 selectable, 2 not selectable) and participant preview table.
   - Negative list variants (missing column L01, BOM marker, duplicate person L04) render `ListErrorBanner` and suppress participant table.
   - AGENTS.md Rule 8 privacy invariant: inspect `localStorage.length === 0`, `sessionStorage.length === 0`, and zero leakage in URL.
