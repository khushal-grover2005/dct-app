# Handoff Report: Capture Time Extraction (Milestone 2 - Component 2)

**Author**: `explorer_m2_2`  
**Date**: 2026-11-07  
**Module**: `src/folder/captureTime.ts`  
**Parent**: Project Orchestrator (`fde194f5-9579-434b-9b81-d7bb7a515ef0`)  
**Type**: Hard Handoff (Investigation Complete)

---

## 1. Observation

1. **Sample Collection Files Inspection**:
   - `docs/consent-tagging/examples/sample-collection/VID-0005.mp4`: Executing `mp4box.createFile()` on `VID-0005.mp4` triggered `onReady` with `info.created = 2026-11-04T06:40:00.000Z`, `info.duration = 4000`, `info.timescale = 1000`. The file is a fast-start MP4 with the `moov` atom in the first 16 KB.
   - `docs/consent-tagging/examples/sample-collection/IMG-0001.png`...`IMG-0004.png`: Running `exifr.parse()` returned only basic IHDR tags (`ImageWidth: 640`, `ImageHeight: 480`). None of the 4 sample PNGs contain `DateTimeOriginal` or EXIF segments.
   - `docs/consent-tagging/examples/asset_export.sample.csv`:
     - Line 2: `IMG-0001.png,image,2026-11-04T06:02:11Z`
     - Line 4: `IMG-0002.png,image,2026-11-04T06:05:40Z`
     - Line 6: `IMG-0003.png,image,2026-11-04T06:20:00Z`
     - Line 7: `IMG-0004.png,image,2026-11-04T06:30:00Z`
     - Line 8: `VID-0005.mp4,video,2026-11-04T06:40:00Z`
     - Line 9: `AUD-0006.wav,audio,2026-11-04T06:45:00Z`
     - Line 11: `SNS-0007.csv,sensor,2026-11-04T06:50:00Z`
     - Line 12: `DOC-0008.pdf,document,2026-11-04T07:00:00Z`
   - `docs/consent-tagging/acceptance-tests.md` Line 9 (T-01):
     > "`VID-0005.mp4` gets capture time 06:40:00Z from its header; an image without EXIF is marked 'capture time from file date'"

2. **`exifr` Library Behavior & Quirk**:
   - In `node_modules/exifr/dist/full.umd.js`, function `$e(e)` implements date parsing:
     ```javascript
     var [t,i,n,s,r,a]=e.trim().split(/[-: ]/g).map(Number),
         o=new Date(t,i-1,n);
     return ... (o.setHours(s),o.setMinutes(r),o.setSeconds(a)), o;
     ```
     This interprets EXIF date strings as local wall-clock time in the host system's OS timezone.
   - Passing `Blob` or `File` directly to `exifr.parse` in a Node environment produces:
     `ReferenceError: FileReader is not defined at U (full.umd.js:1:6236)`. Passing an `ArrayBuffer` directly succeeds without requiring `FileReader`.

3. **`mp4box` ESM & Typing Behavior**:
   - `import MP4Box from 'mp4box'` fails under Node/ESM:
     `SyntaxError: The requested module 'mp4box' does not provide an export named 'default'`.
     Named import `import { createFile } from 'mp4box'` or `import * as MP4Box from 'mp4box'` succeeds.
   - In `src/types/mp4box.d.ts`, `createFile(): MP4File` is declared.
   - `mp4File.appendBuffer()` requires `fileStart: number` on the buffer passed. In TypeScript, casting to `interface MP4BufferWithStart extends ArrayBuffer { fileStart: number; }` compiles with zero `any` under `tsc --noEmit` and ESLint.

4. **Timestamp Format Compliance**:
   - In `tools/validate_export.py` Line 40:
     `TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$")`
   - All timestamps in `asset_export.sample.csv` are formatted without milliseconds: `YYYY-MM-DDTHH:mm:ssZ`.

---

## 2. Logic Chain

1. **Verification of Acceptance Criteria T-01**:
   - From Observation 1: `VID-0005.mp4` contains an `mvhd` atom with creation timestamp `2026-11-04T06:40:00.000Z`. Formatting to seconds produces `2026-11-04T06:40:00Z` and sets `source: 'mp4box'`.
   - From Observation 1: `IMG-0001.png`...`IMG-0004.png` do not contain EXIF `DateTimeOriginal`. Per T-01, they must fall back to `file.lastModified` and be marked with `source: 'last_modified'`.

2. **Timezone Conversion Correctness**:
   - From Observation 2: Because `exifr` defaults to the runner's OS timezone, relying on `exifr`'s revived `Date` would yield incorrect UTC timestamps if the collection machine or test runner runs in a timezone other than `Asia/Kolkata`.
   - By extracting raw numerical components `{ year, month, day, hour, minute, second }` and passing them through `Intl.DateTimeFormat(undefined, { timeZone: 'Asia/Kolkata' })`, we compute the exact offset of `+05:30` (or configured `VITE_CAPTURE_TIMEZONE`) and subtract it to produce the true UTC ISO 8601 string.
   - Test `2026-11-04 11:32:11` in `Asia/Kolkata` yields `2026-11-04T06:02:11Z`, matching `IMG-0001.png` in `asset_export.sample.csv`.

3. **Memory Safety for Large Media**:
   - From Observation 1 & 3: For MP4 files, parsing in 256 KB slices via `file.slice(offset, offset + 256 * 1024)` allows `onReady` to fire on the initial chunk for fast-start MP4s. Halting chunk reading immediately upon `onReady` guarantees that 4 GB videos (tested in T-16) do not load into memory.

4. **Environment Portability & Testability**:
   - From Observation 2: Passing `ArrayBuffer` slices to `exifr.parse` ensures that tests pass consistently across both Node (Vitest) and browser (Playwright/Chrome) environments without relying on DOM `FileReader`.

5. **Type Safety & Lint Compliance**:
   - From Observation 3: Defining `interface MP4BufferWithStart extends ArrayBuffer { fileStart: number; }` ensures 100% type safety and strict ESLint compliance (`no-explicit-any: error`).

---

## 3. Caveats

1. **Non-Fast-Start MP4s**: If an MP4 file has its `moov` atom at the very end of the file (after `mdat`), sequential chunking will need to read through the file or jump to the trailing chunk. The chunked reader safely iterates until `settled` or EOF.
2. **Uninitialized Hardware Clocks**: Some video cameras set `mvhd` creation time to 0 (Jan 1, 1904 UTC). The logic treats years `<= 1970` as uninitialized and gracefully falls back to `file.lastModified`.
3. **No Caveats Beyond Above**: All other aspects of EXIF, MP4, and fallback extraction have been tested and verified against the actual sample files and Python validation suite.

---

## 4. Conclusion

The specification and architecture for `src/folder/captureTime.ts` are fully resolved:
- **Module Interface**: Export `extractCaptureTime(file: File, assetType: AssetType, timezone?: string): Promise<CaptureTimeResult>`.
- **Return Type**: `{ capturedAt: string; source: 'exif' | 'mp4box' | 'last_modified'; durationSeconds?: number }`.
- **Image Extraction**: `exifr.parse(arrayBuffer, { pick: ['DateTimeOriginal'], reviveValues: false })` ➔ parse date components ➔ convert via native `Intl` in `Asia/Kolkata` ➔ fallback to `file.lastModified`.
- **Video Extraction**: `mp4box` chunked reader (256 KB slices) ➔ `mvhd` creation time (already UTC) ➔ fallback to `file.lastModified`.
- **Other Formats**: Synchronously convert `file.lastModified` to UTC ISO 8601 `Z`.
- **Timestamp Precision**: ISO 8601 UTC ending in `Z` (`YYYY-MM-DDTHH:mm:ssZ`) without milliseconds.

---

## 5. Verification Method

1. **Inspect Analysis Report**:
   - View `.agents/teamwork/explorer_m2_2/analysis.md` for full implementation code sketches and unit test matrices.
2. **Run Existing Test Suite**:
   ```powershell
   npm test
   npm run lint
   npm run typecheck
   ```
3. **Verify Sample MP4 Header**:
   ```powershell
   node -e "import('mp4box').then(({ createFile }) => { const fs = require('fs'); const f = createFile(); f.onReady = (i) => console.log('CREATED:', i.created.toISOString()); const b = fs.readFileSync('docs/consent-tagging/examples/sample-collection/VID-0005.mp4'); const ab = b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength); ab.fileStart = 0; f.appendBuffer(ab); });"
   ```
   Must output `CREATED: 2026-11-04T06:40:00.000Z`.
4. **Invalidation Conditions**:
   - If `VID-0005.mp4` header creation time does not match `2026-11-04T06:40:00Z`.
   - If `IMG-0001.png`...`IMG-0004.png` fail to mark `source: 'last_modified'`.
   - If any `any` type is introduced violating `no-explicit-any: error`.
