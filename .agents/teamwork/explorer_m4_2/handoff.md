# Exploration Report: Reactive State Management and Pipeline Coordination (Milestone 4)

**Agent**: `explorer_m4_2`  
**Working Directory**: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m4_2`  
**Target Milestone**: Increment 1, Milestone 4 (Start Screen Integration, State Management, and Pipeline Coordination)  
**Date**: 2026-11-07  

---

## 1. Observation

### 1.1 Existing Codebase & Modules
1. **Entry Point & Browser Gate**:
   - `src/main.tsx:12-18`: Wraps `<App />` within `<BrowserGate>`.
   - `src/app/BrowserGate.tsx:9-40`: Evaluates `isFileSystemAccessSupported()`. When false, renders `#browser-gate-unsupported` containing the required message: *"This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly."* When true, renders children.
   - `src/app/App.tsx:1-34`: Currently a static Increment 1 shell with `#app-shell`, heading *"Data Collection Tool"*, badge *"Air-Gapped"*, and note *"Browser capability verified: File System Access API is active."*
   - `tests/unit/browserGate.test.tsx:94-101`: Directly renders `<App />` and asserts `#app-shell`, heading, and the capability verification text.
   - `e2e/t02-browser-network.spec.ts:98-126`: Asserts that in Firefox `#browser-gate-unsupported` is shown and `#app-shell` is absent (`toHaveCount(0)`), whereas in Chromium `#app-shell` is rendered.

2. **Folder Scanning & Ingestion Pipeline (`src/folder/`)**:
   - `src/folder/types.ts:16-27`: Defines `IngestedAsset`:
     - `assetId: string` (forward-slash relative path)
     - `file: File`
     - `handle: FileSystemFileHandle`
     - `assetType: AssetType` (`'image' | 'video' | 'audio' | 'sensor' | 'document' | 'other'`)
     - `sizeBytes: number`
     - `sha256?: string`
     - `hashProgress?: number`
     - `capturedAt: string` (ISO 8601 UTC with 'Z')
     - `captureTimeSource: CaptureTimeSource` (`'exif' | 'mp4box' | 'last_modified'`)
     - `durationSeconds?: number`
   - `src/folder/scanner.ts:66-165`: `scanFolder(directoryHandle, options)` traverses files recursively, ignores hidden files and export CSVs, detects root `dct-types.json`, extracts capture times, sorts assets naturally by `assetId`, and returns `FolderScanResult`:
     `{ folderName: string; assets: IngestedAsset[]; warnings: string[]; customTypeMap?: CustomTypeMap }`.

3. **Background Worker Hashing Pipeline (`src/folder/hashManager.ts`)**:
   - `HashManager`: Manages a pool of up to 2 Web Workers (`maxConcurrency: 2`).
   - `hashManager.hashAssets(assets, onProgress)`: Enqueues jobs, streams aggregate progress via `AggregateProgress` (`totalAssets`, `completedAssets`, `totalBytes`, `processedBytes`, `overallPercent`), mutates `asset.sha256` and `asset.hashProgress`, and resolves when all jobs complete.
   - `hashManager.dispose()`: Cancels in-flight jobs, terminates worker threads, and releases resources.

4. **Consented List Parsing & Validation Pipeline (`src/list/`)**:
   - `src/list/types.ts:40-48`: Defines `ConsentedListResult`:
     `{ projectId: string; projectName: string; listGeneratedAt: string; listValidUntil: string; people: ConsentedPerson[]; totalCount: number; selectableCount: number }`.
   - `src/list/parser.ts:79-216`: `loadConsentedList(csvText, options)` checks UTF-8 BOM, parses RFC 4180 CSV, validates L01–L04, validates schema with Zod, checks optional `expectedProjectId`, and evaluates participant selectability against reference time.
   - `src/list/types.ts:60-65`: `ListValidationError`: `{ code: ListErrorCode; message: string; line?: number; field?: string }`.
   - `tests/unit/list/privacy.test.ts:1-190`: Confirms that `loadConsentedList` and error messages never write participant display names or contact hints to `localStorage`, `sessionStorage`, `IndexedDB`, URLs, or application logs.

5. **Test Status**:
   - `vitest run`: 13 test files passed, 190 unit tests passed (0 failures).
   - `python -m unittest tools/test_validate_export.py`: 20 tests passed.

---

## 2. Logic Chain

### 2.1 Separation of Concerns: `useAppPipeline` Custom Hook
Placing complex async coordination directly inside a giant React component leads to testing friction and re-render tangles.  
Instead, pipeline logic should be encapsulated in a dedicated custom hook (`src/app/useAppPipeline.ts`), leaving `src/app/App.tsx` as a clean presentation orchestrator that binds pipeline state to UI components (`StartScreen`).

### 2.2 Application State Model Specification
The reactive state model consists of four logical facets:

```ts
export interface AppState {
  // 1. Folder & Asset Ingestion State
  directoryHandle: FileSystemDirectoryHandle | null;
  folderName: string | null;
  assets: IngestedAsset[];
  folderScanning: boolean;
  folderWarnings: string[];
  collectionRef: string;

  // 2. Background Hashing State
  hashingProgress: AggregateProgress;
  hashingCompleted: boolean;
  assetHashes: Record<string, string>; // Maps assetId -> sha256 for O(1) reactive lookup

  // 3. Consented List State
  consentedList: ConsentedListResult | null;
  listLoading: boolean;
  listErrors: ListValidationError[];
  listFileName: string | null;

  // 4. Derived & Readiness State
  isReadyForTagging: boolean;
}
```

#### Detailed State Invariants:
1. **`directoryHandle`**: Holds native `FileSystemDirectoryHandle`. Set upon successful `window.showDirectoryPicker()`. Cleared if user cancels or resets.
2. **`folderName`**: Derived from `directoryHandle.name`. Prefills `collectionRef`.
3. **`assets`**: Array of `IngestedAsset` objects produced by `scanFolder`.
4. **`folderScanning`**: Boolean flag set `true` during directory traversal and capture time extraction; `false` once `scanFolder` resolves.
5. **`folderWarnings`**: Array of non-fatal warnings (e.g. invalid `dct-types.json` structure or unreadable files).
6. **`hashingProgress`**: Holds latest `AggregateProgress` (`{ totalAssets, completedAssets, totalBytes, processedBytes, overallPercent }`). Initialized to 0.
7. **`hashingCompleted`**: Set to `true` when all assets in the active collection have finished hashing (or immediately if `assets.length === 0`).
8. **`assetHashes`**: A reactive dictionary `Record<string, string>` updated as individual assets finish hashing in the worker pool. This guarantees React reactivity and avoids mutable reference pitfalls with `React.memo`.
9. **`consentedList`**: Holds parsed `ConsentedListResult`. Contains participant list, project details, and selectability counts.
10. **`listLoading`**: Boolean flag set `true` during CSV reading and Zod/L01–L04 validation.
11. **`listErrors`**: Array of `ListValidationError` if the list fails validation. When non-empty, `consentedList` is strictly `null`.
12. **`isReadyForTagging`**: Derived readiness condition:
    ```ts
    const isReadyForTagging = Boolean(
      directoryHandle &&
      assets.length > 0 &&
      !folderScanning &&
      consentedList &&
      listErrors.length === 0
    );
    ```

---

### 2.3 Pipeline Coordination & Async Workflow

#### Flow A: Open Collection Folder (`openFolder`)
```
[User Clicks "Open collection folder"]
         │
         ▼
[window.showDirectoryPicker({ mode: 'readwrite' })]
   ├── User Cancels (AbortError) ──► Silently ignore (retain current state)
   └── Permission Denied ──────────► Set folderWarnings (friendly message)
         │
         ▼ Handle acquired
[Cleanup previous HashManager via hashManagerRef.current?.dispose()]
[Set folderScanning = true, reset hashingProgress, assetHashes, folderWarnings]
         │
         ▼
[scanFolder(directoryHandle, { timezone: 'Asia/Kolkata' })]
         │
         ▼ Scan completed
[Update state: folderName, assets, folderWarnings, folderScanning = false]
[Prefill collectionRef with folderName if empty]
         │
         ├── If assets.length === 0 ──► setHashingCompleted(true), return
         │
         ▼
[Initialize HashManager({ maxConcurrency: 2 })]
[Stream AggregateProgress -> setHashingProgress(progress)]
[Stream per-asset onDone -> setAssetHashes(prev => ({ ...prev, [assetId]: sha256 }))]
         │
         ▼ All files hashed
[setHashingCompleted(true)]
```

#### Flow B: Load Consented List (`loadListFromFile` / `loadListFromText`)
```
[User Selects CSV File or inputs CSV text]
         │
         ▼
[Set listLoading = true]
[Read file content as UTF-8 text via file.text()]
         │
         ▼
[loadConsentedList(csvText, { referenceTime: new Date() })]
         │
         ├── If parseResult.success === false
         │     ├── setConsentedList(null) (Refuse whole list)
         │     ├── setListErrors(parseResult.errors)
         │     └── setListLoading(false)
         │
         └── If parseResult.success === true
               ├── setConsentedList(parseResult.data)
               ├── setListErrors([])
               └── setListLoading(false)
```

#### Flow C: Order Independence
The pipeline permits loading in either order:
- **Folder first, list second**: Folder scans and hashes in the background; when the list is subsequently loaded and passes validation, `isReadyForTagging` flips to `true`.
- **List first, folder second**: List validates immediately and previews participants; when the folder is subsequently opened and scanned, `isReadyForTagging` flips to `true`.

---

### 2.4 Lifecycle and Memory Safeguards

1. **Web Worker Lifecycle & Disposal**:
   - `HashManager` spawns 2 Web Workers (`WorkerSlot[]`).
   - If a folder is open and hashing is in flight, opening a new folder or changing directory handles MUST immediately invoke `hashManagerRef.current?.dispose()`.
   - `App` or `useAppPipeline` registers a cleanup hook:
     ```ts
     useEffect(() => {
       return () => {
         hashManagerRef.current?.dispose();
         hashManagerRef.current = null;
       };
     }, []);
     ```
   - `dispose()` invokes `cancelAll()`, drains the job queue, and executes `worker.terminate()` on each active thread. This guarantees zero orphaned workers or lingering file locks.

2. **Rule 8 In-Memory Privacy Invariants**:
   - `consentedList` holds participant objects with `displayName` and `contactHint`.
   - AGENTS.md Rule 8 strictly requires that participant names remain strictly in RAM.
   - **Guarantees**:
     - No `localStorage.setItem` or `sessionStorage.setItem` of list data.
     - No IndexedDB storage of personal data.
     - No URL serialization (no query parameters, no hash routes containing names).
     - No console logging (`console.log`, `console.info`, `console.warn`, `console.error`) of participant names or full `ConsentedPerson` objects.
     - Error messages are strictly bounded to column names, row indices, and UUIDs (as enforced by `validateConsentedList` and `loadConsentedList`).

3. **Performance & High-Frequency Update Throttling**:
   - In collections with 1,000 assets or multi-gigabyte files, chunk progress updates fire frequently from workers.
   - React state updates for `hashingProgress` should either be batched or dispatched via `requestAnimationFrame` to avoid UI thread thrashing.
   - `assetHashes` is updated upon asset completion (at most 2 events concurrently), ensuring minimal re-render overhead while maintaining reactive row-level hash updates.

---

### 2.5 Browser Gate Integration Strategy

1. **Architecture & Scope**:
   - `src/main.tsx` wraps `<App />` inside `<BrowserGate>`.
   - In production and Playwright E2E (`e2e/t02-browser-network.spec.ts`):
     - If `window.showDirectoryPicker` is missing (e.g. Firefox), `<BrowserGate>` replaces the entire page with `#browser-gate-unsupported` and ensures `#app-shell` is never mounted (`toHaveCount(0)`).
     - If `window.showDirectoryPicker` is available (Chromium), `<BrowserGate>` renders the app shell (`#app-shell`).
2. **Unit Test Compatibility**:
   - Existing unit test `tests/unit/browserGate.test.tsx:94-101` tests `<App />` directly without `<BrowserGate>` wrapping.
   - Retaining `#app-shell` and the capability badge in `App.tsx` guarantees that all existing unit tests in `browserGate.test.tsx` continue passing with zero regressions.

---

## 3. Caveats

1. **Tagging Workspace Deferred**:
   - Transitioning into the three-pane tagging workspace (image/video/audio viewers, chips, bystanders) belongs to Increment 2 (Milestone 5+).
   - Milestone 4 delivers the complete Start screen, reactive folder ingestion, hashing pipeline, and consented list validation. A "Start tagging" button should be rendered in the Ready state, disabled or displaying a placeholder for Increment 2.
2. **FSA API in Headless / Automated Environments**:
   - Playwright running headless Chromium supports `window.showDirectoryPicker`, but opening the native picker requires either mock injection (`page.addInitScript`) or an `<input type="file" webkitdirectory />` test hook. The hook in `useAppPipeline` exposes `openFolderFromHandle` directly to allow robust programmatic integration testing without native dialog friction.
3. **Timezone Evaluation**:
   - EXIF capture times default to `VITE_CAPTURE_TIMEZONE` (default: `Asia/Kolkata`) converted to UTC. File dates use UTC directly. Selectability evaluation uses ISO 8601 UTC strings.

---

## 4. Conclusion & Recommended Implementation Plan

### 4.1 Module Architecture
Implement two primary files for Milestone 4 state and coordination:
1. `src/app/useAppPipeline.ts`: The unified custom hook managing folder scanning, worker hashing, list loading, and readiness computation.
2. `src/app/App.tsx`: The top-level container rendering the application header, browser verification badge, and mounting `StartScreen` with props supplied by `useAppPipeline`.

### 4.2 Detailed Implementation Code Sketch

#### `src/app/useAppPipeline.ts`:
```ts
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  FolderScanResult,
  IngestedAsset,
  AggregateProgress,
  HashManager,
  scanFolder,
} from '../folder';
import {
  ConsentedListResult,
  ListValidationError,
  loadConsentedList,
} from '../list';

export interface AppPipeline {
  // Folder state
  directoryHandle: FileSystemDirectoryHandle | null;
  folderName: string | null;
  assets: IngestedAsset[];
  folderScanning: boolean;
  folderWarnings: string[];
  collectionRef: string;
  setCollectionRef: (ref: string) => void;

  // Hashing state
  hashingProgress: AggregateProgress;
  hashingCompleted: boolean;
  assetHashes: Record<string, string>;

  // List state
  consentedList: ConsentedListResult | null;
  listLoading: boolean;
  listErrors: ListValidationError[];
  listFileName: string | null;

  // Pipeline actions
  openFolder: () => Promise<void>;
  openFolderFromHandle: (handle: FileSystemDirectoryHandle) => Promise<void>;
  loadListFromFile: (file: File) => Promise<void>;
  loadListFromText: (csvText: string, fileName?: string) => void;
  resetAll: () => void;

  // Derived readiness
  isReadyForTagging: boolean;
}

const INITIAL_PROGRESS: AggregateProgress = {
  totalAssets: 0,
  completedAssets: 0,
  totalBytes: 0,
  processedBytes: 0,
  overallPercent: 0,
};

export function useAppPipeline(): AppPipeline {
  // Folder state
  const [directoryHandle, setDirectoryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [folderName, setFolderName] = useState<string | null>(null);
  const [assets, setAssets] = useState<IngestedAsset[]>([]);
  const [folderScanning, setFolderScanning] = useState(false);
  const [folderWarnings, setFolderWarnings] = useState<string[]>([]);
  const [collectionRef, setCollectionRef] = useState('');

  // Hashing state
  const [hashingProgress, setHashingProgress] = useState<AggregateProgress>(INITIAL_PROGRESS);
  const [hashingCompleted, setHashingCompleted] = useState(false);
  const [assetHashes, setAssetHashes] = useState<Record<string, string>>({});

  // List state
  const [consentedList, setConsentedList] = useState<ConsentedListResult | null>(null);
  const [listLoading, setListLoading] = useState(false);
  const [listErrors, setListErrors] = useState<ListValidationError[]>([]);
  const [listFileName, setListFileName] = useState<string | null>(null);

  // References
  const hashManagerRef = useRef<HashManager | null>(null);

  // Web Worker cleanup on unmount
  useEffect(() => {
    return () => {
      hashManagerRef.current?.dispose();
      hashManagerRef.current = null;
    };
  }, []);

  // Internal folder ingestion logic
  const ingestFolderHandle = useCallback(async (handle: FileSystemDirectoryHandle) => {
    // 1. Dispose any existing worker pool
    if (hashManagerRef.current) {
      hashManagerRef.current.dispose();
      hashManagerRef.current = null;
    }

    setDirectoryHandle(handle);
    setFolderName(handle.name);
    setFolderScanning(true);
    setFolderWarnings([]);
    setHashingCompleted(false);
    setHashingProgress(INITIAL_PROGRESS);
    setAssetHashes({});

    try {
      const scanResult: FolderScanResult = await scanFolder(handle);
      setAssets(scanResult.assets);
      setFolderWarnings(scanResult.warnings);
      setCollectionRef((prev) => prev || scanResult.folderName);
      setFolderScanning(false);

      if (scanResult.assets.length === 0) {
        setHashingCompleted(true);
        return;
      }

      // 2. Start background worker hashing
      const manager = new HashManager({
        maxConcurrency: 2,
        onAggregateProgress: (progress) => {
          setHashingProgress({ ...progress });
        },
      });
      hashManagerRef.current = manager;

      const hashPromises = scanResult.assets.map((asset) => {
        return new Promise<void>((resolve) => {
          const jobId = `job_${asset.assetId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          manager.enqueue({
            jobId,
            assetId: asset.assetId,
            file: asset.file,
            onProgress: (p) => {
              asset.hashProgress = p.percent;
            },
            onDone: ({ sha256 }) => {
              asset.sha256 = sha256;
              asset.hashProgress = 100;
              setAssetHashes((prev) => ({ ...prev, [asset.assetId]: sha256 }));
              resolve();
            },
            onError: (err) => {
              setFolderWarnings((prev) => [
                ...prev,
                `Failed to hash '${asset.assetId}': ${err.message}`,
              ]);
              resolve();
            },
            onCancelled: () => {
              resolve();
            },
          });
        });
      });

      await Promise.all(hashPromises);
      setHashingCompleted(true);
      // Trigger final assets update
      setAssets([...scanResult.assets]);
    } catch (err) {
      setFolderScanning(false);
      const msg = err instanceof Error ? err.message : String(err);
      setFolderWarnings((prev) => [...prev, `Failed to scan directory: ${msg}`]);
    }
  }, []);

  // Action: Open folder via FSA API
  const openFolder = useCallback(async () => {
    if (typeof window === 'undefined' || !('showDirectoryPicker' in window)) {
      setFolderWarnings((prev) => [
        ...prev,
        'File System Access API is not supported in this browser.',
      ]);
      return;
    }

    try {
      const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
      await ingestFolderHandle(handle);
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        // User cancelled folder picker dialog - retain existing state
        return;
      }
      const msg = err instanceof Error ? err.message : String(err);
      setFolderWarnings((prev) => [...prev, `Folder selection error: ${msg}`]);
    }
  }, [ingestFolderHandle]);

  // Action: Load list from CSV text
  const loadListFromText = useCallback((csvText: string, fileName?: string) => {
    setListLoading(true);
    if (fileName) {
      setListFileName(fileName);
    }

    const result = loadConsentedList(csvText, {
      referenceTime: new Date(),
    });

    if (result.success) {
      setConsentedList(result.data);
      setListErrors([]);
    } else {
      setConsentedList(null); // Refuse whole list
      setListErrors(result.errors);
    }
    setListLoading(false);
  }, []);

  // Action: Load list from File
  const loadListFromFile = useCallback(async (file: File) => {
    setListFileName(file.name);
    setListLoading(true);
    try {
      const text = await file.text();
      loadListFromText(text, file.name);
    } catch (err) {
      setConsentedList(null);
      setListErrors([
        {
          code: 'CSV_PARSE_ERROR',
          message: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
        },
      ]);
      setListLoading(false);
    }
  }, [loadListFromText]);

  // Action: Reset
  const resetAll = useCallback(() => {
    hashManagerRef.current?.dispose();
    hashManagerRef.current = null;
    setDirectoryHandle(null);
    setFolderName(null);
    setAssets([]);
    setFolderScanning(false);
    setFolderWarnings([]);
    setCollectionRef('');
    setHashingProgress(INITIAL_PROGRESS);
    setHashingCompleted(false);
    setAssetHashes({});
    setConsentedList(null);
    setListLoading(false);
    setListErrors([]);
    setListFileName(null);
  }, []);

  // Derived readiness
  const isReadyForTagging = useMemo(() => {
    return Boolean(
      directoryHandle !== null &&
      assets.length > 0 &&
      !folderScanning &&
      consentedList !== null &&
      listErrors.length === 0
    );
  }, [directoryHandle, assets.length, folderScanning, consentedList, listErrors.length]);

  return {
    directoryHandle,
    folderName,
    assets,
    folderScanning,
    folderWarnings,
    collectionRef,
    setCollectionRef,
    hashingProgress,
    hashingCompleted,
    assetHashes,
    consentedList,
    listLoading,
    listErrors,
    listFileName,
    openFolder,
    openFolderFromHandle: ingestFolderHandle,
    loadListFromFile,
    loadListFromText,
    resetAll,
    isReadyForTagging,
  };
}
```

#### `src/app/App.tsx`:
```tsx
import type React from 'react';
import { useAppPipeline } from './useAppPipeline';
import { StartScreen } from '../ui/StartScreen';

export const App: React.FC = () => {
  const pipeline = useAppPipeline();

  return (
    <div id="app-shell" className="min-h-screen bg-slate-50 text-slate-900 flex flex-col min-w-[1280px]">
      <header className="border-b border-slate-200 bg-white px-6 py-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <h1 className="text-xl font-semibold tracking-tight text-slate-900">
            Data Collection Tool
          </h1>
          <span className="px-2.5 py-0.5 text-xs font-medium rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
            Air-Gapped
          </span>
          {pipeline.collectionRef && (
            <span className="text-xs text-slate-500 font-mono bg-slate-100 px-2 py-0.5 rounded">
              {pipeline.collectionRef}
            </span>
          )}
        </div>
        <div className="flex items-center space-x-4">
          <div className="text-xs text-slate-500">
            Browser capability verified: File System Access API is active.
          </div>
          <div className="text-sm text-slate-500 font-medium">Increment 1 Shell</div>
        </div>
      </header>

      <main className="flex-1 p-6 max-w-7xl w-full mx-auto">
        <StartScreen pipeline={pipeline} />
      </main>
    </div>
  );
};

export default App;
```

---

## 5. Verification Method

### 5.1 Verification Commands
Execute the following verification commands to validate the entire suite before and after integration:

1. **Vitest Unit & Integration Suites**:
   ```powershell
   npm test
   ```
   *Expected*: All 190+ unit tests pass, including:
   - `tests/unit/browserGate.test.tsx` (BrowserGate gating and App shell mounting)
   - `tests/unit/folder/*.test.ts` (scanner, capture time, classifier, hashing, concurrency)
   - `tests/unit/list/*.test.ts` (selectability, parser, validator, privacy)

2. **TypeScript Strict Typecheck**:
   ```powershell
   npm run typecheck
   ```
   *Expected*: Zero type errors under `strict: true`.

3. **ESLint Static Code Quality**:
   ```powershell
   npm run lint
   ```
   *Expected*: Zero lint errors (`no-explicit-any`, unused variables, React hooks exhaustive-deps).

4. **Playwright E2E Verification**:
   ```powershell
   npm run e2e
   ```
   *Expected*: Passing `t02-browser-network.spec.ts` (validating Firefox rejection, Chromium rendering, CSP air-gapped isolation, zero network requests).

5. **Python Validator Parity Baseline**:
   ```powershell
   python -m unittest tools/test_validate_export.py
   ```
   *Expected*: 20/20 tests passing.

### 5.2 Integration Unit Testing Plan (`tests/unit/app/useAppPipeline.test.ts`)
To verify `useAppPipeline` in isolation:
1. **Folder Selection & Hashing**:
   - Call `result.current.openFolderFromHandle(mockHandle)`.
   - Assert `folderScanning` transitions `true` -> `false`.
   - Assert `assets` length equals 8.
   - Assert `hashingCompleted` resolves to `true` and all 8 assets have valid `sha256` matching sample collection hashes.
2. **Consented List Validation & Whole-List Refusal**:
   - Call `result.current.loadListFromText(sampleCsvText)`.
   - Assert `consentedList` is populated (4 people, 2 selectable, 2 non-selectable).
   - Assert `listErrors` is empty.
   - Assert `isReadyForTagging` becomes `true`.
   - Call `result.current.loadListFromText(invalidCsvText)`.
   - Assert `consentedList` is `null`, `listErrors` has length > 0, and `isReadyForTagging` becomes `false`.
3. **Cancellation & Worker Cleanup**:
   - Trigger folder ingestion, then invoke `resetAll()` or unmount.
   - Verify `hashManager.dispose()` was called and workers terminated without lingering state.
