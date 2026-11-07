# DCT app design

The **Data Collection Tool (DCT)** is a browser app that runs on the lab's collection machine.
The agent opens a folder of captured files — images, video, audio, sensor recordings,
documents — and the consented list, tags the people in each file, and saves the metadata
sheet into the same folder. There is no server: nothing is uploaded, and
the app makes no network request after it has loaded.

## 1. Fixed choices

| Concern | Choice | Why |
|---|---|---|
| Form | Single-page app, static build, no backend | One less thing to host and secure; data never leaves the machine |
| Language | React 18 + TypeScript (`strict`) | Matches the sponsor's other front ends |
| Build | Vite; output is `dist/`, plain static files | Runs from `http://localhost` or any static host |
| Browsers | Current desktop **Chrome** or **Edge** | The File System Access API (open and write a folder) exists only there; the app shows a clear message in other browsers |
| Folder access | `window.showDirectoryPicker({ mode: 'readwrite' })` | Read the files, write the sheet and the progress file next to them |
| CSV | `papaparse` | Robust quoting both ways |
| Capture times | `exifr` for images (`DateTimeOriginal`); `mp4box.js` for MP4/MOV (`mvhd` creation time) | Capture time from the device, not the file copy time |
| Viewers | Native `<img>`, `<video>`, `<audio>` and the browser's PDF viewer, all from `blob:` URLs; a text preview for CSV/JSON/TXT | Nothing to install, nothing leaves the page |
| Hashing | Web Crypto `crypto.subtle.digest('SHA-256')`; `hash-wasm` streaming for files over 256 MB | Real hashes, no memory blow-up |
| Validation | A TypeScript port of `tools/validate_export.py` in `src/validation/` | Same rules, same codes, same golden cases (§6) |
| Forms and schemas | `zod` | Typed parsing of the list and the progress file |
| Tests | vitest + Testing Library; Playwright for end-to-end | Playwright can drive Chrome with a real folder fixture |
| Lint, format | eslint (`no-explicit-any: error`), prettier | |
| Packaging | npm; `package-lock.json` committed | |

Not permitted: a backend of any kind, Next.js or SSR, a UI kit that loads remote fonts or
assets, analytics or telemetry, service workers that sync data, `localStorage` or IndexedDB
for anything containing names (see §5).

Content Security Policy in `index.html`: `default-src 'self'; img-src 'self' blob:;
media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self';
style-src 'self' 'unsafe-inline'`. `connect-src 'none'`
makes "no network calls" a browser-enforced fact, and a test checks the header is present.

## 2. Screens

### 2.1 Start

Three steps on one page, each unlocking the next:

1. **Open collection folder** — picker; **every file** in the folder and its subfolders is an
   asset, except hidden files (names starting with `.`) and the app's own files
   (`.dct-progress.json`, `asset_export_*.csv`). Each gets an `asset_type` from its extension
   (§3.1). The screen shows a count per type and lists any `other` files so the agent can see
   them before starting.
2. **Load consented list** — file picker (the list usually sits outside the folder). Shows
   project name, people, how many are not selectable (minors, expired), and `list_valid_until`.
   Applies L01–L04; a failing list is refused whole.
3. **Collection name** — prefilled with the folder name, editable; becomes `collection_ref`.

If the folder already holds a progress file (§4), the app offers **Resume** instead of a fresh
start, and checks it belongs to the same project.

### 2.2 Tagging workspace

The main screen. Three panes:

| Pane | Shows | Actions |
|---|---|---|
| Left — asset list | A thumbnail (images, first video frame) or a type icon, the path, and a status chip: *untagged*, *tagged (n)*, *bystander*, *no person*, *error*. Filter by status and type. Progress "34 of 120 done". | Click to open; `↑` `↓` to move |
| Centre — viewer | The viewer for the asset's type (§3.1), with path, type, capture time and its source, size, and duration for media | `←` `→` previous / next asset; `Space` play / pause for media; `+` `−` `0` zoom for images |
| Right — people | Search box over the list (name, contact hint). Results with a **Select** button; not-selectable rows greyed with the reason (*minor*, *consent expired 3 Nov*). Selected people as chips with ✕. **Others in this asset** stepper (0–20). **No person in this asset** toggle. | `/` focus search; `Enter` select first match; `n` toggle no person; `b` add one bystander |

Rules the screen enforces (they mirror the validator so errors are prevented, not just reported):
selecting a person twice is impossible; "No person" disables selection and the stepper, and
cannot be turned on while people are selected; a minor or expired row has no Select button;
after `list_valid_until`, or for an asset captured after it, every row is unselectable.

An asset is **done** when it has at least one selected person, or "No person" on. An asset
with only bystanders shows *bystander only — delete this file* and is never done (R-20).

What "appears in" means depends on the type, and the people panel says so in its heading:

| Type | Tag a person who… | Count as a bystander anyone who… |
|---|---|---|
| image | is visible | is visible and not on the list, or cannot be identified |
| video | is visible **or** heard at any point | is visible or heard at any point and not on the list |
| audio | is heard (voice) | is heard and not on the list, or cannot be identified |
| sensor | wore or was measured by the device | — (sensors record one person; use "no person" for environmental sensors) |
| document | is named, pictured or otherwise identifiable in it | is identifiable in it and not on the list |
| other | is in it in any identifiable way | is in it and not on the list |

For video and audio the agent must play the whole asset before it can be marked done: the
viewer tracks the furthest point played, and the asset shows *not fully reviewed* until it
reaches the end (or the agent confirms they reviewed it outside the app, which is recorded).

Every change is saved to the progress file within one second (§4). There is no Save button on
this screen.

### 2.3 Review and save sheet

- Runs the validator over the whole collection and lists errors by asset, each clickable back
  to the workspace. Warnings listed separately (held assets, capture times from the file date).
- Shows counts by type: assets, rows, people tagged, assets held for bystanders, not-done assets.
- **Save sheet** is enabled only when there are no errors and every asset is done. It writes
  `asset_export_<collection_ref>_<YYYYMMDDTHHMMSSZ>.csv` into the folder and shows the path.
  Each save gets a new `export_id`.
- A second button, **Download a copy**, offers the same file through the browser's download,
  for browsers or folders where writing fails.

### 2.4 Corrections

Reached from the Start screen when a progress file has previous saves:

- **Held assets** — each asset saved with a bystander. Per asset: *I redacted it* (the app
  re-hashes the file; if the hash did not change it refuses; on change it clears the bystander
  count, keeping the people) or *I deleted it* (the app checks the file is gone, or offers to
  delete it with the user's confirmation, and marks it `deleted`).
- **Deletion request** — paste or load a list of `asset_id`s we sent. The app shows each,
  deletes it from the folder with one confirmation for the batch, and marks it `deleted`.
- **Save correction sheet** — writes a sheet containing only the corrected assets, same
  `collection_ref`, new `export_id`.

### 2.5 Wireframe

The tagging workspace is drawn in the project brief. Layout rules: minimum supported window
1280 × 720; panes resizable; everything reachable by keyboard; status chips carry text, not
colour alone.

## 3. Data model in the app

```ts
type ListPerson = {
  personId: string; consentId: string; displayName: string; contactHint: string;
  consentExpiresAt: Date | null; isMinor: boolean;
};
type ConsentedList = {
  projectId: string; projectName: string; generatedAt: Date; validUntil: Date;
  people: Map<string, ListPerson>;                 // by personId
};
type AssetType = 'image' | 'video' | 'audio' | 'sensor' | 'document' | 'other';
type AssetEntry = {
  assetId: string;                                 // path relative to the folder, '/' separators
  assetType: AssetType;                            // from the extension, §3.1
  handle: FileSystemFileHandle;
  sizeBytes: number; sha256: string | null;        // null until hashed
  durationSeconds: number | null;                  // video and audio
  capturedAt: Date;                                // see the capture-time rules below
  capturedAtSource: 'exif' | 'media_header' | 'file_modified';
  reviewedToEnd: boolean;                          // video/audio played to the end, or confirmed
  personIds: string[];                             // selected, in selection order
  bystanderCount: number;                          // 0 = none
  noPerson: boolean;
  state: 'active' | 'deleted';
};
```

- `capturedAt`, in order of preference: images — EXIF `DateTimeOriginal`, which has no time
  zone, so interpret it in `VITE_CAPTURE_TIMEZONE` (default `Asia/Kolkata`) and convert to UTC;
  MP4/MOV — the `mvhd` creation time (already UTC); everything else, or when those are missing —
  the file's `lastModified`. The source is recorded so the review screen can warn "capture time
  from file date".
- `sha256` is computed in the background after the folder opens, two files at a time, streamed
  in 8 MB chunks so a multi-gigabyte video never sits in memory; the asset list shows a hashing
  progress bar. Saving waits for all hashes.
- `consent_id` is never stored on the asset; it is looked up from the list by `person_id` when
  the sheet is written. A person cannot carry the wrong consent.

### 3.1 Asset types and viewers

The type comes from the file extension, case-insensitive. A lab can add extensions for its own
devices with an optional `dct-types.json` in the collection folder (`{"sensor": [".edf", ".bin"]}`),
which the app reads on open and lists on the Start screen.

| `asset_type` | Default extensions | Viewer in the app |
|---|---|---|
| image | `.jpg .jpeg .png .webp .gif .bmp .avif` | Image, zoom and pan |
| image (no preview) | `.heic .heif .tif .tiff .raw .dng .cr2 .nef .arw` | Type icon, size, EXIF time; "view this file in your usual viewer, then tag it here" |
| video | `.mp4 .m4v .mov .webm` | `<video>` with scrubbing, playback speed 0.5–2×, frame step; review-to-end tracked |
| video (no preview) | `.mkv .avi .wmv .mts .3gp` | Type icon, size; tagging allowed after "I reviewed it outside the app" |
| audio | `.wav .mp3 .m4a .aac .ogg .oga .opus .flac` | `<audio>` with scrubbing and a waveform; review-to-end tracked |
| sensor | `.csv .tsv .json .jsonl .txt .log .edf .bin .dat` | Text formats: the first 200 lines and the line count; binary: size only |
| document | `.pdf` (preview), `.doc .docx .odt .rtf` (no preview) | PDF in the browser's viewer; others type icon and size |
| other | anything else | Type icon, size, path |

A file the browser cannot play (for example an MOV in a codec Chrome lacks) falls back to its
"no preview" row automatically. The app never converts, transcodes, re-encodes or modifies a
file, and never writes anything into an asset file.

## 4. The progress file

`.dct-progress.json` in the collection folder, rewritten after every change (debounced 1 s,
written to a temporary name then renamed). It holds **identifiers only** — never names or
contact hints — so a copied folder does not leak who is in it.

```json
{
  "format": "dct.progress", "format_version": 1,
  "collection_ref": "LAB-A-2026-11-04-01",
  "project_id": "6f1c…", "list_generated_at": "2026-11-01T04:30:00Z",
  "assets": {
    "IMG-0001.png": { "sha256": "2180…", "captured_at": "2026-11-04T06:02:11Z",
                      "captured_at_source": "exif", "asset_type": "image",
                      "person_ids": ["3f1c…", "7a44…"], "bystander_count": 0,
                      "no_person": false, "state": "active" }
  },
  "saves": [ { "export_id": "0a1b…", "file": "asset_export_…csv", "saved_at": "…",
               "held": ["IMG-0002.png"] } ]
}
```

On resume, the app re-lists the folder: assets that vanished are flagged *missing* (not
silently dropped); new files appear as *untagged*; an asset whose hash changed since its last
save is flagged *changed — check tags*.

## 5. Personal data in the browser

- The consented list lives **in memory only**. Reloading the page means loading the list again
  (the progress file remembers which project it was, and refuses a list for another project).
- No `localStorage`, `sessionStorage`, IndexedDB or cookies for list data. The only thing the
  app may keep in browser storage is the folder handle for "reopen last folder", which holds no
  personal data.
- Names never appear in the URL, the page title, console output or error messages.
- **Filename check**: if any asset path contains a list `display_name` (case-insensitive,
  whole word), the review screen warns that the filename may identify a person. `asset_id` is
  the path, so it reaches us.
- After the sheet for a collection is accepted, the coordinator deletes the list file; the app
  shows a reminder on the Start screen for any project whose last save is more than 7 days old.

## 6. The validator in TypeScript

`src/validation/validateExport.ts` ports `tools/validate_export.py` rule for rule, with the
same codes and messages. Two tests keep them identical:

1. **Golden cases** — a vitest suite reads `docs/consent-tagging/examples/golden/expected.json`
   and, for every case, runs the TypeScript validator and asserts exactly the listed error and
   warning codes. The Python suite runs the same cases.
2. **Round trip** — an end-to-end test tags the sample collection, saves the sheet, and runs
   the Python validator on the saved file in CI; it must report `VALID`.

The app validates its in-memory state through the same function by first rendering the rows it
would write, so what the review screen says is exactly what the saved file will contain.

## 7. Repository layout

```
.
├── AGENTS.md  CLAUDE.md  README.md
├── package.json  package-lock.json  vite.config.ts  tsconfig.json  index.html
├── src/
│   ├── app/            routes, layout, keyboard map, unsupported-browser page
│   ├── folder/         directory picker, listing, type detection, hashing, capture times, progress file
│   ├── list/           consented list parsing (zod), selectability rules
│   ├── tagging/        workspace panes and state (one reducer)
│   ├── viewers/        image, video, audio, sensor text, PDF, no-preview fallback
│   ├── review/         review screen, sheet writer
│   ├── corrections/    held assets, deletion requests
│   ├── validation/     validateExport.ts and its golden-case test
│   └── styles/         tokens.css
├── e2e/                Playwright specs; fixtures copy examples/sample-collection
├── docs/consent-tagging/
└── tools/              validate_export.py and its tests (unchanged)
```

## 8. Running it

```bash
npm ci
npm run dev        # http://localhost:5173 — open in Chrome or Edge
npm run build      # static files in dist/
npm run preview    # serves dist/ on http://localhost:4173
npm test           # vitest, including golden cases
npm run e2e        # Playwright, Chrome
```

For lab machines, `dist/` is served from `http://localhost` by `npm run preview` or any static
server. The File System Access API needs a secure context; `localhost` counts as one, a plain
`file://` page does not.

## 9. How metadata is bound to each asset

The app never writes into an asset file. Each asset's metadata lives in the sheet, and every
row names its asset twice:

| Column | Binds by | Survives |
|---|---|---|
| `asset_id` | the file's path in the collection folder, e.g. `day1/VID-0005.mp4` | the folder being copied or archived as a whole |
| `content_sha256` | the file's exact bytes | a file being renamed or moved — it can be found again by hash |

So: the path is how a reader finds the file; the hash proves it is the same file that was
tagged. If a file's bytes change after tagging (an edit, a re-encode, a metadata write by
another tool), its hash no longer matches and the import on our side holds it. That is why the
app must not modify files, and why the rule stands for every type.

Why not write the tags into the files themselves (EXIF, XMP, ID3 tags, MP4 metadata)? Writing
changes the bytes and therefore the hash; browsers cannot do it for most formats (WAV, MKV,
sensor files, PDFs have no common field for it); and it would embed consent identifiers in
files that are copied and shared far more widely than the sheet.

The folder after a save:

```
LAB-A-2026-11-04-01/
├── IMG-0001.png  …  VID-0005.mp4  AUD-0006.wav  SNS-0007.csv  DOC-0008.pdf   unchanged
├── asset_export_LAB-A-2026-11-04-01_20261104T100000Z.csv                     the metadata sheet
└── .dct-progress.json                                                        working state, ids only
```

The folder — assets plus sheet — is delivered together. The sheet is the metadata of record.
