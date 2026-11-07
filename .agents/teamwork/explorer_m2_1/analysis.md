# Milestone 2 Component 1 Technical Analysis & Worker Implementation Plan
**Module**: Folder Scanning, Path Normalization, 6-Type Classification & Custom `dct-types.json`
**Author**: Explorer Subagent `explorer_m2_1`
**Target Output Files**: `src/folder/classifier.ts`, `src/folder/scanner.ts`, `src/folder/types.ts`
**Target Test Files**: `tests/unit/folder/classifier.test.ts`, `tests/unit/folder/scanner.test.ts`

---

## 1. Executive Summary & Verification of Sample Collection

### 1.1 Sample Collection Verification (`docs/consent-tagging/examples/sample-collection/`)
The sample collection contains exactly 8 assets. Each was analyzed against `docs/consent-tagging/app-design.md` §3.1 and compared against `docs/consent-tagging/examples/asset_export.sample.csv`:

| # | Asset File Name | Extension | Default Classification | `asset_export.sample.csv` Type | Sample Size (Bytes) | Preview Capability |
|---|-----------------|-----------|------------------------|-------------------------------|---------------------|--------------------|
| 1 | `IMG-0001.png`  | `.png`    | `image`                | `image`                       | 10,481              | Native Image Pan/Zoom |
| 2 | `IMG-0002.png`  | `.png`    | `image`                | `image`                       | 10,876              | Native Image Pan/Zoom |
| 3 | `IMG-0003.png`  | `.png`    | `image`                | `image`                       | 10,377              | Native Image Pan/Zoom |
| 4 | `IMG-0004.png`  | `.png`    | `image`                | `image`                       | 9,141               | Native Image Pan/Zoom |
| 5 | `VID-0005.mp4`  | `.mp4`    | `video`                | `video`                       | 87,103              | Native `<video>` Player |
| 6 | `AUD-0006.wav`  | `.wav`    | `audio`                | `audio`                       | 96,138              | Native `<audio>` Player |
| 7 | `SNS-0007.csv`  | `.csv`    | `sensor`               | `sensor`                      | 4,849               | Text Preview (first 200 lines) |
| 8 | `DOC-0008.pdf`  | `.pdf`    | `document`             | `document`                    | 1,616               | Native PDF Viewer |

**Aggregate Counts for Sample Collection**:
- `image`: 4 (`IMG-0001.png`, `IMG-0002.png`, `IMG-0003.png`, `IMG-0004.png`)
- `video`: 1 (`VID-0005.mp4`)
- `audio`: 1 (`AUD-0006.wav`)
- `sensor`: 1 (`SNS-0007.csv`)
- `document`: 1 (`DOC-0008.pdf`)
- `other`: 0
- **Total**: 8 assets.

This confirms 100% agreement with Acceptance Test **T-01** ("Opening the sample collection lists 8 assets with `asset_id`s `IMG-0001.png`…`DOC-0008.pdf` and types asset ×4, video, audio, sensor, document").

---

## 2. Technical Specification: `src/folder/types.ts`

To decouple shared interfaces between scanner, classifier, capture time extraction, and worker hash pools, `src/folder/types.ts` should declare the core data types:

```typescript
export type AssetType = 'image' | 'video' | 'audio' | 'sensor' | 'document' | 'other';

export type CustomTypeMap = Record<string, AssetType>;

export interface CustomTypesFile {
  image?: string[];
  video?: string[];
  audio?: string[];
  sensor?: string[];
  document?: string[];
  other?: string[];
}

export type CaptureTimeSource = 'exif' | 'mp4box' | 'last_modified';

export interface IngestedAsset {
  assetId: string;              // normalized path relative to folder with '/' (e.g., "IMG-0001.png", "sub/x.png")
  file: File;                  // raw File instance
  handle: FileSystemFileHandle; // handle for persistent operations or future edits
  assetType: AssetType;        // classified 6-type enum
  sizeBytes: number;           // file size in bytes
  sha256?: string;             // populated by background worker
  hashProgress?: number;       // 0 to 100%
  capturedAt: string;          // ISO 8601 UTC string ending in 'Z' (e.g. "2026-11-04T06:02:11Z")
  captureTimeSource: CaptureTimeSource;
}

export interface FolderScanResult {
  folderName: string;
  assets: IngestedAsset[];
  warnings: string[];
  customTypeMap?: CustomTypeMap;
}
```

---

## 3. Technical Specification: `src/folder/classifier.ts`

### 3.1 Default Extensions Map
Per `app-design.md` §3.1, extensions are case-insensitive and mapped as follows:

```typescript
export const DEFAULT_TYPE_EXTENSIONS: Record<AssetType, string[]> = {
  image: [
    // Preview supported
    '.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif',
    // No preview fallback
    '.heic', '.heif', '.tif', '.tiff', '.raw', '.dng', '.cr2', '.nef', '.arw'
  ],
  video: [
    // Preview supported
    '.mp4', '.m4v', '.mov', '.webm',
    // No preview fallback
    '.mkv', '.avi', '.wmv', '.mts', '.3gp'
  ],
  audio: [
    // Preview supported
    '.wav', '.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac'
  ],
  sensor: [
    '.csv', '.tsv', '.json', '.jsonl', '.txt', '.log', '.edf', '.bin', '.dat'
  ],
  document: [
    // Preview supported
    '.pdf',
    // No preview fallback
    '.doc', '.docx', '.odt', '.rtf'
  ],
  other: []
};
```

### 3.2 Custom `dct-types.json` Parsing & Schema Validation
Labs can customize extension classifications for proprietary sensor rigs or equipment by placing an optional `dct-types.json` file in the collection root folder (e.g. `{"sensor": [".edf", ".bin"]}`).

Requirements for `parseDctTypesJson(jsonString: string)`:
1. **JSON Parse Guard**: Must catch JSON syntax errors safely. If invalid, returns empty `customTypeMap` and a descriptive warning: `"Invalid JSON syntax in dct-types.json: <details>"`.
2. **Object Root Check**: If the parsed JSON is not an object or is `null`/`Array`, returns warning: `"dct-types.json must be a JSON object mapping asset types to extension lists."`.
3. **Key Validation**: Keys must belong to the 6 valid `AssetType` values (`image`, `video`, `audio`, `sensor`, `document`, `other`). Any unknown key records a warning: `"Unknown asset type '<key>' in dct-types.json ignored."`.
4. **Value Array Check**: Values for each type must be an `Array`. If not, records warning: `"Value for asset type '<key>' in dct-types.json must be an array of string extensions."`.
5. **Extension Normalization**:
   - Each extension string is trimmed, converted to lowercase, and guaranteed to have a leading dot:
     ```typescript
     const normalizedExt = ext.trim().toLowerCase().startsWith('.') 
       ? ext.trim().toLowerCase() 
       : `.${ext.trim().toLowerCase()}`;
     ```
   - Non-string items inside arrays are skipped with a warning.
6. **Lookup Inversion**:
   Inverts the map into `Record<string, AssetType>` (mapping extension -> `AssetType`) for $O(1)$ lookup speed during scanning.

### 3.3 Asset Classification Logic (`classifyAsset`)
```typescript
export function classifyAsset(
  fileNameOrPath: string,
  customTypeMap?: CustomTypeMap
): AssetType {
  // Extract extension from filename (case-insensitive)
  const lastDot = fileNameOrPath.lastIndexOf('.');
  if (lastDot === -1 || lastDot === fileNameOrPath.length - 1) {
    return 'other'; // No extension or trailing dot
  }
  
  const ext = fileNameOrPath.slice(lastDot).toLowerCase();
  
  // Custom type mapping overrides default mapping
  if (customTypeMap && ext in customTypeMap) {
    return customTypeMap[ext]!;
  }
  
  // Default extension lookup
  for (const [type, extensions] of Object.entries(DEFAULT_TYPE_EXTENSIONS)) {
    if (extensions.includes(ext)) {
      return type as AssetType;
    }
  }
  
  return 'other';
}
```

### 3.4 Native Preview Capability Helper
For subsequent UI milestones (workspace viewers in Increment 2):
```typescript
export function hasNativePreview(assetType: AssetType, fileNameOrPath: string): boolean {
  const lastDot = fileNameOrPath.lastIndexOf('.');
  if (lastDot === -1) return false;
  const ext = fileNameOrPath.slice(lastDot).toLowerCase();

  switch (assetType) {
    case 'image':
      return ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.avif'].includes(ext);
    case 'video':
      return ['.mp4', '.m4v', '.mov', '.webm'].includes(ext);
    case 'audio':
      return ['.wav', '.mp3', '.m4a', '.aac', '.ogg', '.oga', '.opus', '.flac'].includes(ext);
    case 'sensor':
      return ['.csv', '.tsv', '.json', '.jsonl', '.txt', '.log'].includes(ext);
    case 'document':
      return ext === '.pdf';
    default:
      return false;
  }
}
```

---

## 4. Technical Specification: `src/folder/scanner.ts`

### 4.1 Path Normalization (`normalizeAssetPath`)
In compliance with data-contract.md §2 and cross-platform Windows/POSIX requirements:
1. Every path separator must be `/`.
2. Convert all backslashes `\` to `/`.
3. Strip leading slashes `/` or `./`.
4. Collapse duplicate consecutive slashes (`//` -> `/`).
5. Remove trailing slashes.
6. Example:
   - `IMG-0001.png` -> `IMG-0001.png`
   - `sub\nested\image.png` -> `sub/nested/image.png`
   - `./sub//x.png` -> `sub/x.png`

### 4.2 Filtering Rules
Files and directories to ignore during traversal:
1. **Hidden Files and Directories**:
   Any entry whose `name.startsWith('.')` must be immediately ignored.
   - Files: `.DS_Store`, `.gitkeep`, `.dct-progress.json`, `.thumbnails`
   - Directories: `.git/`, `.vscode/`, `.gemini/`
2. **App Internal Files**:
   Matches export CSVs: `/^asset_export.*\.csv$/i`
   - Matches `asset_export_LAB-A-2026-11-04-01_20261104T100000Z.csv`, `asset_export.sample.csv`, `asset_export.correction.sample.csv`.
   - Does NOT filter assets that simply contain "asset_export" as part of a regular file name (e.g. `my_asset_export.png`, `asset_export_data.tsv`).
3. **Root `dct-types.json` Configuration**:
   When scanning the root directory, if `dct-types.json` exists:
   - It is read as text and passed to `parseDctTypesJson`.
   - Its mappings and warnings are captured.
   - It is **excluded** from `FolderScanResult.assets[]` (it is not an asset).

### 4.3 Deterministic Asset Ordering
Directory iteration via `FileSystemDirectoryHandle.values()` does not guarantee sorted order across operating systems. The scanner must sort the resulting `assets` array deterministically by `assetId`:
```typescript
assets.sort((a, b) => a.assetId.localeCompare(b.assetId, undefined, { numeric: true, sensitivity: 'base' }));
```

### 4.4 Capture Time Integration Hook
During traversal, the scanner needs capture time metadata for each asset. To keep modules decoupled, `scanner.ts` can accept an optional `captureTimeExtractor`:
```typescript
export type CaptureTimeExtractor = (
  file: File,
  assetType: AssetType
) => Promise<{ capturedAt: string; captureTimeSource: CaptureTimeSource }>;
```
If not supplied (e.g. in isolated scanner tests), it defaults to a fallback extractor using `file.lastModified` formatted as ISO 8601 UTC with `'Z'` and source `'last_modified'`. In production, `extractCaptureTime` from `src/folder/captureTime.ts` is passed.

---

## 5. Vitest Mocking Infrastructure for Node/JSDOM

In Vitest's `jsdom` test environment, `FileSystemDirectoryHandle` and `FileSystemFileHandle` are not native classes. A lightweight mock directory handle factory is required to allow fast, isolated unit tests.

### 5.1 Mock Directory Handle Implementation (`tests/unit/folder/mockFileSystem.ts`)
```typescript
export interface MockFileEntry {
  kind: 'file';
  name: string;
  content?: string | Uint8Array;
  lastModified?: number;
}

export interface MockDirectoryEntry {
  kind: 'directory';
  name: string;
  entries: (MockFileEntry | MockDirectoryEntry)[];
}

export function createMockFileHandle(entry: MockFileEntry): FileSystemFileHandle {
  const blobParts: BlobPart[] = [entry.content ?? ''];
  const file = new File(blobParts, entry.name, {
    lastModified: entry.lastModified ?? 1730700000000 // 2026-11-04T06:00:00Z
  });

  return {
    kind: 'file',
    name: entry.name,
    getFile: async () => file,
    isSameEntry: async (other) => other.name === entry.name && other.kind === 'file',
  } as unknown as FileSystemFileHandle;
}

export function createMockDirectoryHandle(
  name: string,
  entries: (MockFileEntry | MockDirectoryEntry)[]
): FileSystemDirectoryHandle {
  return {
    kind: 'directory',
    name,
    async *values() {
      for (const e of entries) {
        if (e.kind === 'file') {
          yield createMockFileHandle(e);
        } else {
          yield createMockDirectoryHandle(e.name, e.entries);
        }
      }
    },
    async *entries() {
      for (const e of entries) {
        if (e.kind === 'file') {
          yield [e.name, createMockFileHandle(e)] as [string, FileSystemFileHandle];
        } else {
          yield [e.name, createMockDirectoryHandle(e.name, e.entries)] as [string, FileSystemDirectoryHandle];
        }
      }
    },
    getFileHandle: async (fileName: string) => {
      const found = entries.find((e) => e.kind === 'file' && e.name === fileName);
      if (!found || found.kind !== 'file') {
        throw new Error(`NotFoundError: File ${fileName} not found`);
      }
      return createMockFileHandle(found);
    },
    getDirectoryHandle: async (dirName: string) => {
      const found = entries.find((e) => e.kind === 'directory' && e.name === dirName);
      if (!found || found.kind !== 'directory') {
        throw new Error(`NotFoundError: Directory ${dirName} not found`);
      }
      return createMockDirectoryHandle(found.name, found.entries);
    },
    isSameEntry: async (other) => other.name === name && other.kind === 'directory',
  } as unknown as FileSystemDirectoryHandle;
}
```

---

## 6. Comprehensive Unit Test Specifications

### 6.1 `tests/unit/folder/classifier.test.ts`
1. **Default Type Classification**:
   - `image`: tests `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.bmp`, `.avif`, `.heic`, `.tif`, `.cr2`.
   - `video`: tests `.mp4`, `.m4v`, `.mov`, `.webm`, `.mkv`, `.avi`, `.3gp`.
   - `audio`: tests `.wav`, `.mp3`, `.m4a`, `.aac`, `.ogg`, `.opus`, `.flac`.
   - `sensor`: tests `.csv`, `.tsv`, `.json`, `.jsonl`, `.txt`, `.log`, `.edf`, `.bin`, `.dat`.
   - `document`: tests `.pdf`, `.doc`, `.docx`, `.odt`, `.rtf`.
   - `other`: tests `.xyz`, `.unknown`, `.custom`, and no-extension files (`README`, `LICENSE`).
2. **Case Insensitivity**:
   - Asserts `.PNG`, `.MP4`, `.WAV`, `.CSV`, `.PDF` map to their respective types.
3. **Compound Extensions & Punctuation**:
   - `foo.v1.0.png` -> `image`.
   - `data.final.csv` -> `sensor`.
   - `archive.tar.gz` -> `other`.
   - Trailing dot `file.` -> `other`.
4. **`dct-types.json` Parsing**:
   - Valid JSON with standard extensions: `{"sensor": [".edf", ".bin"]}` parses cleanly.
   - Valid JSON without leading dots: `{"sensor": ["edf", "bin"]}` normalizes to `[".edf", ".bin"]`.
   - Uppercase extensions: `{"sensor": [".EDF", "BIN"]}` normalizes to lowercase `[".edf", ".bin"]`.
   - Malformed JSON string: returns empty custom map and descriptive syntax warning.
   - Non-object root: `["sensor"]` returns warning.
   - Unknown asset type key: `{"fooType": [".xyz"]}` logs warning: `"Unknown asset type 'fooType' in dct-types.json ignored."`.
   - Non-array type values: `{"sensor": ".edf"}` logs warning.
   - Non-string items in array: `{"sensor": [123, null, ".edf"]}` logs warning and captures `.edf`.
5. **Custom Override Precedence**:
   - Re-mapping existing extension: `{"document": [".csv"]}` maps `test.csv` to `document` instead of default `sensor`.
   - Mapping custom extension: `{"sensor": [".myrig"]}` maps `test.myrig` to `sensor`.
   - Unmapped extensions fall back to default extensions without degradation.
6. **Preview Capability**:
   - `hasNativePreview` returns `true` for `.png`, `.mp4`, `.wav`, `.pdf`, `.csv`.
   - `hasNativePreview` returns `false` for `.heic`, `.mkv`, `.doc`, `.bin`, `.xyz`.

### 6.2 `tests/unit/folder/scanner.test.ts`
1. **Path Normalization**:
   - Flat root files: `IMG-0001.png` -> `IMG-0001.png`.
   - Subdirectory: `sub/x.png` -> `sub/x.png`.
   - Windows backslashes: `sub\nested\image.png` -> `sub/nested/image.png`.
   - Mixed separators and duplicate slashes: `sub\\nested//file.wav` -> `sub/nested/file.wav`.
   - Leading `./` and `/` stripped.
2. **Filter Hidden Files and Directories**:
   - `.DS_Store`, `.gitkeep` ignored.
   - Hidden directory `.git/` not traversed.
   - `.dct-progress.json` ignored.
3. **Filter App Export CSVs**:
   - `asset_export_LAB-A-2026-11-04-01_20261104T100000Z.csv` ignored.
   - `asset_export.sample.csv` ignored.
   - Legitimate asset `asset_export_presentation.png` NOT ignored.
4. **`dct-types.json` Ingestion**:
   - `dct-types.json` read from root directory, parsed, and custom mappings applied.
   - `dct-types.json` excluded from `assets[]`.
   - Malformed `dct-types.json` records warning in `FolderScanResult.warnings` and continues folder scanning.
5. **Sample Collection Simulation**:
   - Mock directory containing the 8 sample files (`IMG-0001.png`...`DOC-0008.pdf`).
   - Asserts total asset count is 8.
   - Asserts types: 4 `image`, 1 `video`, 1 `audio`, 1 `sensor`, 1 `document`.
6. **Deterministic Sorting**:
   - Directory with scrambled entry order (`VID-0005.mp4`, `AUD-0006.wav`, `IMG-0001.png`) is returned sorted by `assetId`.
7. **Empty & Degenerate Directories**:
   - Empty directory returns 0 assets and 0 warnings.
   - Directory with only hidden files returns 0 assets.

---

## 7. Concrete Worker Implementation Instructions

When implementing Component 1, the Worker should follow this exact sequence:

1. **Step 1: Create `src/folder/types.ts`**
   - Define `AssetType`, `CustomTypeMap`, `CustomTypesFile`, `CaptureTimeSource`, `IngestedAsset`, and `FolderScanResult`.
2. **Step 2: Create `src/folder/classifier.ts`**
   - Implement `DEFAULT_TYPE_EXTENSIONS`.
   - Implement `parseDctTypesJson`.
   - Implement `classifyAsset`.
   - Implement `hasNativePreview`.
3. **Step 3: Create `src/folder/scanner.ts`**
   - Implement `normalizeAssetPath`.
   - Implement `isIgnoredFile` and `isIgnoredDirectory`.
   - Implement recursive traversal for `FileSystemDirectoryHandle`.
   - Read root `dct-types.json` if present and attach custom mappings/warnings.
   - Integrate with capture time extraction (defaulting to fallback).
   - Deterministically sort assets by `assetId`.
4. **Step 4: Create `tests/unit/folder/mockFileSystem.ts`**
   - Implement mock directory handle and file handle factory.
5. **Step 5: Create Unit Tests**
   - `tests/unit/folder/classifier.test.ts` (all test cases in §6.1).
   - `tests/unit/folder/scanner.test.ts` (all test cases in §6.2).
6. **Step 6: Quality Gate Validation**
   - Run `npm test`.
   - Run `npm run typecheck` (`tsc --noEmit`).
   - Run `npm run lint`.
   - Ensure 0 warnings and 0 errors under ESLint `no-explicit-any: error`.
