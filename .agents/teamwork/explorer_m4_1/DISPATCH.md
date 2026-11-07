## 2026-11-07T14:59:54Z
You are explorer_m4_1, a teamwork_explorer exploring Milestone 4 of Increment 1 for the Data Collection Tool (DCT).
Your working directory is: c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m4_1

MANDATORY: You MUST read the original request before starting any work. Do not proceed without reading it:
c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\ORIGINAL_REQUEST.md

Also read:
- AGENTS.md
- docs/consent-tagging/app-design.md §2 (Start screen) & §3 (Asset types)
- docs/consent-tagging/use-cases.md (UC-01 & UC-02)
- docs/consent-tagging/acceptance-tests.md (T-01, T-02, T-03)
- PROJECT.md and TEST_INFRA.md
- Existing modules: `src/folder/` (scanner, classifier, captureTime, hashManager) and `src/list/` (types, parser, validator, selectability)

Your Mission:
Design the Start screen UI components hierarchy and visual layout under `src/ui/`:
1. Component breakdown:
   - `StartScreen.tsx`: Top-level layout container assembling Folder Section and Consented List Section.
   - Folder section (`FolderSection.tsx` / `FolderPicker.tsx`):
     - Button: "Open collection folder" (`window.showDirectoryPicker({ mode: 'readwrite' })`).
     - State display: folder name, asset count, aggregate hashing progress bar.
   - `AssetTable.tsx`:
     - Displays list of scanned assets: `asset_id` (relative path with `/`), type badge (`image`, `video`, `audio`, `sensor`, `document`, `other`), SHA-256 hash or hashing progress, capture time (formatted UTC `Z` + source badge `exif`, `mp4box`, `last_modified`).
     - Non-fatal warnings display (e.g. custom type mapping warnings, unreadable files).
   - Consented List section (`ListSection.tsx` / `ListPicker.tsx`):
     - File picker: "Load consented list" (supporting `<input type="file" accept=".csv" />` and File System Access API).
     - Error banner: Displays descriptive error if list is refused whole (L01–L04, BOM, etc.).
     - `ListSummary.tsx`: Displays project name, total people count, non-selectable count (minors, expired), and `list_valid_until`.
     - Participant table / list preview: Shows participants with non-selectable indicators and reasons (e.g. `'minor'`, `'consent expired 3 Nov'`), strictly preserving AGENTS.md Rule 8 in-memory privacy.
2. Styling & CSS Tokens: Tailwind CSS design tokens conforming to clean offline lab tool aesthetic.
3. Accessibility & ID Selectors: Plan clean `data-testid` or `id` attributes for E2E automated testing.

Produce your exploration report in:
c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m4_1\handoff.md
And send a concise completion message to parent when done.
