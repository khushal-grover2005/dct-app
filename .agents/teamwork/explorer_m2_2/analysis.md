# Analysis Report: Capture Time Extraction (Milestone 2 - Component 2)

**Author**: `explorer_m2_2`  
**Date**: 2026-11-07  
**Module**: `src/folder/captureTime.ts`  
**Parent Task**: Milestone 2 — Collection Ingestion, Classification & Hashing

---

## 1. Executive Summary

This report delivers the technical analysis, architectural design, timezone parsing algorithms, MP4 ISO BMFF header extraction logic, and unit test specifications for `src/folder/captureTime.ts`.

Key findings:
1. **Sample Collection Reality**: In `docs/consent-tagging/examples/sample-collection/`, `VID-0005.mp4` has an embedded `mvhd` header with creation time `2026-11-04T06:40:00Z` (`source: 'mp4box'`). The PNG images (`IMG-0001.png`...`IMG-0004.png`) do not contain EXIF `DateTimeOriginal` tags, confirming that under acceptance test **T-01** and `app-design.md`, they must fall back to `file.lastModified` and be tagged with `source: 'last_modified'` ("capture time from file date").
2. **`exifr` Reviver Quirk & Timezone Danger**: `exifr`'s default tag reviver converts EXIF date strings using `new Date(year, month-1, day, hour, min, sec)` in the **local machine's OS timezone**, which introduces timezone corruption if the machine is not running in `Asia/Kolkata`. We must either parse with `{ pick: ['DateTimeOriginal'], reviveValues: false }` or extract raw components and convert using native `Intl.DateTimeFormat`.
3. **`mp4box` ESM Import & Typing (Zero `any`)**: In `mp4box` v2.5.0, ESM does not export a default export; named import `import { createFile } from 'mp4box'` must be used. To attach `.fileStart` to `ArrayBuffer` without `any`, we specify `interface MP4BufferWithStart extends ArrayBuffer { fileStart: number; }`.
4. **Chunked Header Streaming**: MP4 headers (`moov`/`mvhd`) can be read in 256 KB slices via `file.slice()`. As soon as `onReady` fires, reading terminates immediately, ensuring multi-gigabyte video files (up to 4 GB per acceptance test T-16) never consume excess memory.
5. **Data Contract Compliance**: All timestamps are formatted as UTC ISO 8601 strings ending in `Z` with second precision (`YYYY-MM-DDTHH:mm:ssZ`), matching `data-contract.md` v1 and Python validator `tools/validate_export.py` regex `TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$")`.

---

## 2. Sample Collection Inspection & Verification

Direct inspection of `docs/consent-tagging/examples/sample-collection/` compared against `docs/consent-tagging/examples/asset_export.sample.csv`:

| File | Type | Header Metadata Present | Extracted / Expected UTC Time | Source |
|---|---|---|---|---|
| `IMG-0001.png` | `image` | No EXIF `DateTimeOriginal` (IHDR only) | `2026-11-04T06:02:11Z` (sample sheet reference) / `file.lastModified` | `last_modified` |
| `IMG-0002.png` | `image` | No EXIF `DateTimeOriginal` (IHDR only) | `2026-11-04T06:05:40Z` (sample sheet reference) / `file.lastModified` | `last_modified` |
| `IMG-0003.png` | `image` | No EXIF `DateTimeOriginal` (IHDR only) | `2026-11-04T06:20:00Z` (sample sheet reference) / `file.lastModified` | `last_modified` |
| `IMG-0004.png` | `image` | No EXIF `DateTimeOriginal` (IHDR only) | `2026-11-04T06:30:00Z` (sample sheet reference) / `file.lastModified` | `last_modified` |
| `VID-0005.mp4` | `video` | **Yes**: `mvhd` atom creation time present | **`2026-11-04T06:40:00Z`** | **`mp4box`** |
| `AUD-0006.wav` | `audio` | N/A (WAV container) | `2026-11-04T06:45:00Z` (sample sheet reference) / `file.lastModified` | `last_modified` |
| `SNS-0007.csv` | `sensor` | N/A (CSV text) | `2026-11-04T06:50:00Z` (sample sheet reference) / `file.lastModified` | `last_modified` |
| `DOC-0008.pdf` | `document` | N/A (PDF) | `2026-11-04T07:00:00Z` (sample sheet reference) / `file.lastModified` | `last_modified` |

### Key Observations:
- In `VID-0005.mp4`, `mp4box` parses `hasMoov: true, duration: 4000, timescale: 1000, created: 2026-11-04T06:40:00.000Z`. This perfectly matches row 8 of `asset_export.sample.csv`.
- In `IMG-0001.png`...`IMG-0004.png`, `exifr.parse` reports only `ImageWidth: 640, ImageHeight: 480`. Under acceptance test **T-01**, "an image without EXIF is marked 'capture time from file date'". This confirms that fallback to `file.lastModified` is an intentional test requirement.
- When git checks out files, `stat.mtime` is set to checkout time. In production, collection files on the lab machine retain their hardware recording timestamps. In unit tests and mocks, `File.lastModified` is explicitly passed to verify fallback handling.

---

## 3. Order of Preference & Architecture

Per `docs/consent-tagging/app-design.md` §3 and `PROJECT.md` Feature 10–12:

```
                  ┌───────────────────────────────┐
                  │    Incoming Asset (File)      │
                  └──────────────┬────────────────┘
                                 │
                     ┌───────────┴───────────┐
                     │     assetType?        │
                     └───────────┬───────────┘
               image             │             video              audio, sensor, doc, other
       ┌─────────────────────────┼─────────────────────────┐───────────────────┐
       ▼                         │                         ▼                   ▼
┌─────────────────────┐          │               ┌──────────────────┐    ┌──────────────────┐
│ exifr.parse()       │          │               │ mp4box parse     │    │ file.lastModified│
│ DateTimeOriginal    │          │               │ mvhd created time│    │                  │
└──────┬──────────────┘          │               └────────┬─────────┘    └─────────┬────────┘
       │                         │                        │                        │
       ├─ Found                  │                        ├─ Found                 │
       │                         │                        │                        │
       ▼                         │                        ▼                        │
┌──────────────────────┐         │               ┌──────────────────┐              │
│ Convert local time in│         │               │ Format UTC Date  │              │
│ VITE_CAPTURE_TIMEZONE│         │               │ to ISO 8601 'Z'  │              │
│ (Asia/Kolkata) to UTC│         │               └────────┬─────────┘              │
└──────┬───────────────┘         │                        │                        │
       │                         │                        ▼                        │
       ▼                         │                 source: 'mp4box'                │
 source: 'exif'                  │                        │                        │
       │                         │                        │                        │
       └─ Absent/Corrupt         │                        └─ Absent/Corrupt        │
               │                 │                                │                │
               └─────────────────┼────────────────────────────────┴────────────────┘
                                 ▼
                     ┌────────────────────────┐
                     │ Use file.lastModified  │
                     │ Format to ISO 8601 'Z' │
                     │ source: 'last_modified'│
                     └────────────────────────┘
```

---

## 4. Timezone Parsing Logic (`Asia/Kolkata` -> UTC `Z`)

### 4.1 The Challenge
EXIF tag `DateTimeOriginal` (TIFF Tag 0x9003) stores wall-clock time as an ASCII string without timezone offset, e.g. `"2026:11:04 11:32:11"`.
Per `AGENTS.md` and `app-design.md` §3:
> "EXIF `DateTimeOriginal`, which has no time zone, so interpret it in `VITE_CAPTURE_TIMEZONE` (default `Asia/Kolkata`) and convert to UTC"

### 4.2 Handling `exifr` Reviver Quirk
If `exifr.parse` is called with default options, it runs a reviver function `$e(str)` that performs:
```javascript
new Date(year, month - 1, day, hour, minute, second)
```
This binds the timestamp to the **local OS timezone of the current browser or runner**. If the test runner is in UTC, `11:32:11` becomes `11:32:11 UTC` instead of `06:02:11 UTC`. If in UTC-5 (EST), it becomes `16:32:11 UTC`.

**Robust Solution**:
Support both raw string extraction (`reviveValues: false`) and component extraction from `Date` objects:
```typescript
export interface DateComponents {
  year: number;
  month: number; // 1-12
  day: number;   // 1-31
  hour: number;  // 0-23
  minute: number;// 0-59
  second: number;// 0-59
}

export function parseDateComponents(value: unknown): DateComponents | null {
  if (typeof value === 'string') {
    const match = value.trim().match(/^(\d{4})[-: ](\d{2})[-: ](\d{2})[-: T](\d{2})[-: ](\d{2})[-: ](\d{2})/);
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
        hour: Number(match[4]),
        minute: Number(match[5]),
        second: Number(match[6]),
      };
    }
  }
  if (value instanceof Date && !isNaN(value.getTime())) {
    return {
      year: value.getFullYear(),
      month: value.getMonth() + 1,
      day: value.getDate(),
      hour: value.getHours(),
      minute: value.getMinutes(),
      second: value.getSeconds(),
    };
  }
  return null;
}
```

### 4.3 Native Timezone Conversion using `Intl.DateTimeFormat`
No third-party date libraries (Rule 1: Fixed stack). Modern JavaScript provides `Intl.DateTimeFormat` with IANA timezone support in all target browsers:

```typescript
export function convertLocalToUtcIso(
  components: DateComponents,
  timeZone: string = 'Asia/Kolkata'
): string {
  const { year, month, day, hour, minute, second } = components;

  // Validate IANA timezone string; fallback to Asia/Kolkata on invalid
  let validTz = timeZone;
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: validTz });
  } catch {
    validTz = 'Asia/Kolkata';
  }

  // 1. Initial UTC guess assuming wall clock time matches UTC
  const guessUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);

  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: validTz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hour12: false,
  });

  const getWallMsAtUtc = (utcMs: number): number => {
    const parts = dtf.formatToParts(new Date(utcMs));
    const map: Record<string, number> = {};
    for (const p of parts) {
      if (p.type !== 'literal') map[p.type] = parseInt(p.value, 10);
    }
    if (map.hour === 24) map.hour = 0; // Normalize midnight in 24h format
    return Date.UTC(map.year, map.month - 1, map.day, map.hour, map.minute, map.second);
  };

  // 2. Measure timezone offset at this wall clock time
  const wallAtGuess = getWallMsAtUtc(guessUtcMs);
  const offsetMs = wallAtGuess - guessUtcMs;
  let exactUtcMs = guessUtcMs - offsetMs;

  // 3. Second pass refinement (handles DST boundary shifts)
  const wallAtExact = getWallMsAtUtc(exactUtcMs);
  if (wallAtExact !== guessUtcMs) {
    const secondOffset = wallAtExact - exactUtcMs;
    exactUtcMs = guessUtcMs - secondOffset;
  }

  return formatUtcIso(new Date(exactUtcMs));
}

export function formatUtcIso(date: Date): string {
  // Format as YYYY-MM-DDTHH:mm:ssZ (omits milliseconds for data contract v1 parity)
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}
```

### 4.4 Verification of Timezone Results
- `2026-11-04 11:32:11` in `Asia/Kolkata` (+05:30) ➔ `2026-11-04T06:02:11Z` (exact match with sample sheet `IMG-0001.png` capture time).
- `2026-11-04 11:35:40` in `Asia/Kolkata` (+05:30) ➔ `2026-11-04T06:05:40Z` (exact match with sample sheet `IMG-0002.png` capture time).
- Midnight rollover: `2026-11-04 02:00:00` in `Asia/Kolkata` ➔ `2026-11-03T20:30:00Z` (correctly shifts calendar day).

---

## 5. MP4 `mvhd` Parsing Logic without `any`

### 5.1 MP4 Creation Time Mechanism
In ISO BMFF containers (MP4, M4V, MOV), the `mvhd` (Movie Header) atom stores `creation_time` as seconds since midnight, Jan 1, 1904 UTC.
`mp4box.js` parses this atom and produces a `Date` object: `info.created`.
Since `mvhd` is recorded in UTC, **no timezone conversion is needed**.

### 5.2 Typing & Eliminating `any`
`src/types/mp4box.d.ts` is configured with:
```typescript
declare module 'mp4box' {
  export interface MP4MediaInfo {
    hasMoov: boolean;
    duration: number;
    timescale: number;
    isFragmented: boolean;
    isProgressive: boolean;
    hasIOD: boolean;
    created: Date;
    modified: Date;
    tracks: unknown[];
  }

  export interface MP4File {
    onReady?: (info: MP4MediaInfo) => void;
    onError?: (e: string) => void;
    appendBuffer(data: ArrayBuffer): number;
    flush(): void;
    start(): void;
    stop(): void;
  }

  export function createFile(): MP4File;
  const MP4Box: { createFile: () => MP4File; };
  export default MP4Box;
}
```

To attach `fileStart` to `ArrayBuffer` without violating `no-explicit-any: error`:
```typescript
interface MP4ArrayBufferWithStart extends ArrayBuffer {
  fileStart: number;
}
```

### 5.3 Chunked Streaming Implementation
To prevent loading multi-gigabyte videos (e.g. 4 GB video in T-16) into memory, `mp4box` is fed chunks of 256 KB. For fast-start files (where `moov` precedes `mdat`), the header is parsed in the first 256 KB chunk and reading halts immediately:

```typescript
import { createFile, MP4MediaInfo } from 'mp4box';

export async function extractMp4CreationTime(
  file: File
): Promise<{ capturedAt: string; durationSeconds?: number } | null> {
  return new Promise((resolve) => {
    try {
      const mp4File = createFile();
      let settled = false;

      const finish = (result: { capturedAt: string; durationSeconds?: number } | null) => {
        if (!settled) {
          settled = true;
          resolve(result);
        }
      };

      mp4File.onReady = (info: MP4MediaInfo) => {
        if (
          info.created &&
          !isNaN(info.created.getTime()) &&
          info.created.getFullYear() > 1970 // Guard against uninitialized 1904/0 timestamp
        ) {
          const durationSeconds =
            info.timescale > 0 ? info.duration / info.timescale : undefined;
          finish({
            capturedAt: formatUtcIso(info.created),
            durationSeconds,
          });
        } else {
          finish(null);
        }
      };

      mp4File.onError = () => {
        finish(null);
      };

      const chunkSize = 256 * 1024; // 256 KB slices
      let offset = 0;

      const readChunk = async () => {
        if (settled || offset >= file.size) {
          if (!settled) {
            try {
              mp4File.flush();
            } catch {
              // Ignore flush errors
            }
            finish(null);
          }
          return;
        }

        try {
          const slice = file.slice(offset, Math.min(offset + chunkSize, file.size));
          const ab = await slice.arrayBuffer();
          const bufferWithStart = ab as MP4ArrayBufferWithStart;
          bufferWithStart.fileStart = offset;
          offset += ab.byteLength;

          mp4File.appendBuffer(bufferWithStart);
        } catch {
          finish(null);
          return;
        }

        if (!settled) {
          // Microtask yield
          setTimeout(readChunk, 0);
        }
      };

      readChunk();
    } catch {
      resolve(null);
    }
  });
}
```

---

## 6. Target Interface & Module Design (`src/folder/captureTime.ts`)

```typescript
export type AssetType = 'image' | 'video' | 'audio' | 'sensor' | 'document' | 'other';
export type CaptureTimeSource = 'exif' | 'mp4box' | 'last_modified';

export interface CaptureTimeResult {
  capturedAt: string;            // ISO 8601 UTC string ending in 'Z' (YYYY-MM-DDTHH:mm:ssZ)
  source: CaptureTimeSource;     // 'exif' | 'mp4box' | 'last_modified'
  durationSeconds?: number;      // Populated for video when available
}

export async function extractCaptureTime(
  file: File,
  assetType: AssetType,
  timezone?: string
): Promise<CaptureTimeResult>
```

### Full Pipeline for `extractCaptureTime`:
1. If `assetType === 'image'`:
   - Read header slice (`file.slice(0, 256 * 1024)` or full file if smaller).
   - Pass `ArrayBuffer` to `exifr.parse(ab, { pick: ['DateTimeOriginal'], reviveValues: false })`. Passing `ArrayBuffer` avoids `FileReader` dependency in Node/Vitest environments.
   - If `DateTimeOriginal` is resolved:
     - Parse components via `parseDateComponents`.
     - Convert to UTC via `convertLocalToUtcIso(components, timezone || getCaptureTimezone())`.
     - Return `{ capturedAt, source: 'exif' }`.
   - If `DateTimeOriginal` is null or parsing throws:
     - Fall back to `file.lastModified`: `{ capturedAt: formatUtcIso(new Date(file.lastModified)), source: 'last_modified' }`.

2. If `assetType === 'video'`:
   - Call `extractMp4CreationTime(file)`.
   - If valid result returned:
     - Return `{ capturedAt: result.capturedAt, source: 'mp4box', durationSeconds: result.durationSeconds }`.
   - If null returned (corrupt, non-MP4, or uninitialized clock):
     - Fall back to `file.lastModified`: `{ capturedAt: formatUtcIso(new Date(file.lastModified)), source: 'last_modified' }`.

3. For all other types (`audio`, `sensor`, `document`, `other`):
   - Return `{ capturedAt: formatUtcIso(new Date(file.lastModified)), source: 'last_modified' }`.

---

## 7. Concrete Unit Test Specifications (`tests/unit/captureTime.test.ts`)

| # | Test Case | Input | Expected Output | Rationale / Acceptance Criteria |
|---|---|---|---|---|
| 1 | Real sample MP4 extraction | `VID-0005.mp4` from sample collection | `{ capturedAt: '2026-11-04T06:40:00Z', source: 'mp4box' }` | Acceptance test T-01 parity |
| 2 | Image without EXIF fallback | `IMG-0001.png` from sample collection | `{ capturedAt: <file.lastModified as ISO>, source: 'last_modified' }` | Acceptance test T-01 requirement |
| 3 | Image with EXIF string in `Asia/Kolkata` | Mock image with EXIF `DateTimeOriginal: '2026:11:04 11:32:11'` | `{ capturedAt: '2026-11-04T06:02:11Z', source: 'exif' }` | Correct UTC offset calculation (-05:30) |
| 4 | Image with EXIF Date instance | Mock image with EXIF `DateTimeOriginal: new Date(2026, 10, 4, 11, 35, 40)` | `{ capturedAt: '2026-11-04T06:05:40Z', source: 'exif' }` | Handle revived Date objects |
| 5 | Midnight boundary shift | EXIF `DateTimeOriginal: '2026-11-04 02:00:00'` in `Asia/Kolkata` | `{ capturedAt: '2026-11-03T20:30:00Z', source: 'exif' }` | Day decrement crossing midnight |
| 6 | Custom timezone parameter | EXIF `DateTimeOriginal: '2026-11-04 12:00:00'`, tz: `'America/New_York'` | `{ capturedAt: '2026-11-04T17:00:00Z', source: 'exif' }` | Configurable `VITE_CAPTURE_TIMEZONE` support |
| 7 | Invalid timezone fallback | EXIF `DateTimeOriginal: '2026-11-04 11:32:11'`, tz: `'Invalid/NonExistent'` | `{ capturedAt: '2026-11-04T06:02:11Z', source: 'exif' }` | Graceful fallback to `Asia/Kolkata` |
| 8 | Corrupted image file | Corrupted bytes with extension `.png` | `{ capturedAt: <file.lastModified as ISO>, source: 'last_modified' }` | Resilient error handling without throwing |
| 9 | Corrupted MP4 file | Plain text file with extension `.mp4` | `{ capturedAt: <file.lastModified as ISO>, source: 'last_modified' }` | Fallback on corrupt media header |
| 10 | Empty MP4 file | 0-byte file with extension `.mp4` | `{ capturedAt: <file.lastModified as ISO>, source: 'last_modified' }` | Empty file safety |
| 11 | Uninitialized MP4 creation time | MP4 header with year 1904 / 0 | `{ capturedAt: <file.lastModified as ISO>, source: 'last_modified' }` | Ignore uninitialized camera clocks |
| 12 | Audio, sensor, document fallback | WAV, CSV, PDF files | `{ capturedAt: <file.lastModified as ISO>, source: 'last_modified' }` | Non-image/non-video default behavior |
| 13 | ISO format compliance | All outputs | Match `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$` | Python validator and data contract v1 compliance |

---

## 8. Recommendations for Implementation Phase

1. **Keep `captureTime.ts` self-contained**: All EXIF and MP4 parsing logic belongs in `src/folder/captureTime.ts`.
2. **Use `ArrayBuffer` for `exifr`**: Passing `ArrayBuffer` rather than `File` or `Blob` prevents `ReferenceError: FileReader is not defined` under Node/Vitest environments.
3. **Export pure conversion functions**: Export `convertLocalToUtcIso`, `parseDateComponents`, and `formatUtcIso` so unit tests can directly verify timezone math without building binary mock files for every edge case.
4. **Coordinate with `scanner.ts`**: The folder scanner (`explorer_m2_1`) can call `extractCaptureTime(file, assetType)` for each discovered file to populate `capturedAt` and `captureTimeSource` on `IngestedAsset`.
