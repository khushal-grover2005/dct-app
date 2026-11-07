# Reviewer Handoff Report: Milestone 4 UI & Component Hierarchy Review

**Agent**: `reviewer_m4_1`  
**Role**: Reviewer & Adversarial Critic  
**Working Directory**: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\reviewer_m4_1`  
**Verdict**: **APPROVE**  
**Date**: 2026-11-07  

---

## 1. Observation

### 1.1 Source Code Inspection
- **`src/app/App.tsx`**:
  - Line 12: Renders `<div id="app-shell" data-testid="app-shell" className="min-h-screen bg-slate-50 text-slate-900 flex flex-col min-w-[1280px]">`. Adheres to min 1280x720 layout specification in `app-design.md` §2.5.
  - Lines 16–21: Renders heading `"Data Collection Tool"` and badge `"Air-Gapped"`.
  - Lines 29–31: Displays `"Browser capability verified: File System Access API is active."`, preserving browser gate integration invariants verified by `browserGate.test.tsx`.
  - Line 37: Embeds `<StartScreen pipeline={pipeline} />`.
- **`src/ui/StartScreen.tsx`**:
  - Implements the 3-step workflow required by `app-design.md` §2.1:
    - Step 1: `<FolderSection pipeline={pipeline} />` (Line 33) and `<AssetTable />` (Line 36).
    - Step 2: `<ListSection pipeline={pipeline} />` (Line 39).
    - Step 3: Collection Reference input (`data-testid="collection-ref-input"`, Line 63) prefilled from folder name and editable, with Proceed button (`data-testid="proceed-button"`, Line 74).
  - Lines 76–81: Proceed button is strictly disabled until `isReadyForTagging` evaluates to `true` (folder scanned with assets, scanning inactive, valid consented list loaded without errors).
- **`src/ui/FolderSection.tsx`**:
  - Lines 77–111: Displays folder name (`📁 {folderName}/`), asset count badge (`{assets.length} assets found`), and semantic badges for 6 asset types (`image`, `video`, `audio`, `sensor`, `document`, `other`). Unclassified files display an amber warning pill (`{typeCounts.other} unclassified 'other' file(s)`).
  - Lines 114–138: Aggregate SHA-256 progress bar (`data-testid="hashing-progress-bar"`) displaying real-time counts, percentage, progress bar width, and emerald checkmark completion badge (`Completed (100%)`).
- **`src/ui/AssetTable.tsx`**:
  - Lines 42–52: Renders tabular catalog with columns: Asset ID, Type, Size, Capture Time, Source, SHA-256.
  - Lines 64–69: Displays `assetId` in monospace with forward-slash paths (`/`).
  - Lines 88–94: Renders explicit text source badges (`EXIF`, `MP4 header`, `capture time from file date`) using accessible text labels, not color alone (`app-design.md` §2.5).
  - Lines 96–106: Displays full 64-character SHA-256 hash or live streaming progress indicator (`asset.hashProgress%`).
- **`src/ui/ListSection.tsx`**:
  - Lines 40–47: Accessible hidden file input (`<input ref={fileInputRef} type="file" accept=".csv" data-testid="consented-list-input" className="hidden" onChange={handleFileChange} />`).
  - Line 21: `e.target.value = ''` resets input value, allowing users to re-select corrected files seamlessly.
- **`src/ui/ListErrorBanner.tsx`**:
  - Lines 26–35: Displays whole-list rejection banner showing rule codes (`[L01]`, `[L02]`, `[L03]`, `[L04]`, `[BOM_NOT_ALLOWED]`) and row numbers without leaking personal data.
- **`src/ui/ListSummary.tsx`**:
  - Lines 12–62: Renders 4 metric cards: Project Name, Project ID (read-only `<div>` with title tooltip), Total Participants, Selectability Breakdown (`X selectable / Y not selectable`), and List Validity date (`list_valid_until`).
- **`src/ui/ParticipantTable.tsx`**:
  - Lines 15–17: Explicit badge `"In-Memory Only (AGENTS.md Rule 8)"`.
  - Lines 51–75: Renders participant rows with Person ID (read-only `<td>`), Display Name, Contact Hint, Consent Expiry, Status badge (`Selectable` / `Not Selectable`), and reason badges (`minor` in rose, `consent expired 3 Nov` in amber).
- **AGENTS.md Rule 3 Verification (Zero Typed IDs)**:
  - Global codebase search for `<input>` and `<select>`:
    - Only two inputs exist across the UI:
      1. `src/ui/ListSection.tsx:40`: `<input type="file" accept=".csv" />` for CSV loading.
      2. `src/ui/StartScreen.tsx:60`: `<input id="collection-ref-input" type="text" />` for `collection_ref`.
    - Zero input fields exist for `project_id`, `person_id`, or `consent_id`.

### 1.2 Integrity & Adversarial Audit
- **No hardcoded test results**: Verified by searching `src/` for sample collection hashes (e.g. `2180908...`) and sample strings (e.g. `Synthetic gait study`). All asset records, hashes, and participant rows are parsed and computed dynamically.
- **No facade or dummy implementations**: Real Web Worker hashing with `HashManager`, real PapaParse CSV parsing with Zod schemas, real selectability synchronization across collection reference times.
- **Out-of-order resilience**: In `useAppPipeline.ts` (lines 84–112), if a list is loaded before a folder, opening a folder afterwards automatically re-synchronizes participant selectability against the newly scanned collection capture time.
- **User cancellation resilience**: `useAppPipeline.ts` (lines 196–199) catches `DOMException` with `AbortError` when a user cancels the OS folder picker, retaining current state without error alerts.
- **Whole-list rejection invariance**: Invalid lists (L01–L04 or BOM) clear `consentedList` to `null` and suppress both summary cards and participant tables.

### 1.3 Independent Test & Build Verifications
1. `npm test -- --run`: 14 test files passed, 197 tests passed, 0 failed (25.63s).
2. `npm run lint`: Exited 0 with 0 errors and 0 warnings (`eslint . --max-warnings 0`).
3. `npx tsc --noEmit`: Exited 0 with 0 errors under TypeScript strict mode.
4. `npm run build`: Static production bundle compiled cleanly in 11.47s (`dist/index.html` 0.71 kB, `dist/assets/index-CFwUauu8.js` 541.25 kB).
5. `python -m unittest tools/test_validate_export.py`: 20/20 passed in 0.111s.
6. `npx playwright test e2e/start-screen.spec.ts`: 2 passed (chromium), 2 skipped (firefox) (46.2s).
7. `npx playwright test e2e/t02-browser-network.spec.ts --project=firefox`: 5 passed, 3 skipped (50.6s).

---

## 2. Logic Chain

1. **3-Step Workflow & State Coordination**:
   - `app-design.md` §2.1 mandates a 3-step Start screen (Folder -> List -> Collection Name) where each unlocks the next.
   - `FolderSection` and `ListSection` feed into `useAppPipeline`, which derives `isReadyForTagging` (true only when folder has assets, scanning is finished, and valid consented list has 0 errors).
   - `StartScreen.tsx` binds `isReadyForTagging` to the Proceed button (`proceed-button`), providing clear helper feedback while locked.
2. **Accessible Badges & Layout Standards**:
   - `app-design.md` §2.5 mandates `min-w-[1280px]` and status badges carrying text labels, not color alone.
   - `App.tsx` sets `min-w-[1280px]` on the root shell.
   - Every badge in `FolderSection` (`{count} {type}`), `AssetTable` (`EXIF`, `MP4 header`, `capture time from file date`), and `ParticipantTable` (`Selectable`, `Not Selectable`, `minor`, `consent expired 3 Nov`) uses explicit text content paired with high-contrast Tailwind color tokens.
3. **Strict Compliance with AGENTS.md Rule 3**:
   - AGENTS.md Rule 3 mandates that `project_id`, `person_id`, and `consent_id` are copied and never typed.
   - Code inspection and automated grep confirmed zero input/edit elements for any of the three identifiers. `project_id` is a read-only label in `ListSummary`, `person_id` is a read-only table cell in `ParticipantTable`, and `consent_id` is never surfaced for agent input.
4. **Privacy Invariant Protection (AGENTS.md Rule 8)**:
   - Evaluated by `StartScreen.test.tsx` and `e2e/start-screen.spec.ts`.
   - Browser storage (`localStorage`, `sessionStorage`, `IndexedDB`), URLs, and console logs contain zero participant display names or contact hints.
5. **Verdict Derivation**:
   - All acceptance criteria are satisfied, zero integrity violations exist, all tests pass, and code quality meets all project standards. The implementation is approved.

---

## 3. Caveats

- **Tagging Workspace Transition**: The 3-pane tagging workspace (asset media viewers, participant chip selector, bystander stepper) is deferred to Milestone 5+ (Increment 2) as planned. Milestone 4 properly verifies collection readiness and surfaces confirmation.
- No other caveats.

---

## 4. Conclusion

The Milestone 4 implementation delivers a clean, accessible, robust, and spec-compliant Start screen UI hierarchy for Increment 1:
- Conforms fully to `app-design.md` §2.1 & §2.5.
- Strictly adheres to AGENTS.md Rules 1–10 (especially Rule 3: zero typed IDs, and Rule 8: in-memory participant privacy).
- All unit, integration, strict typecheck, linter, production build, Python reference, and Playwright E2E suites pass with zero defects.
- **Final Verdict: APPROVE**.

---

## 5. Verification Method

To independently verify this assessment, execute the following commands in the workspace root:

```powershell
# 1. Run all unit and integration tests (197 passed, 0 failed)
npm test

# 2. Run Start Screen Playwright E2E suite
npx playwright test e2e/start-screen.spec.ts

# 3. Run ESLint (must pass with 0 warnings)
npm run lint

# 4. Run TypeScript strict typecheck (must pass with 0 errors)
npx tsc --noEmit

# 5. Run Vite production build (must succeed cleanly)
npm run build

# 6. Run Python export validator reference tests (20/20 passed)
python -m unittest tools/test_validate_export.py
```

### Invalidation Conditions
- Any input element introduced allowing manual entry of `project_id`, `person_id`, or `consent_id`.
- Any participant name appearing in browser storage, URLs, or console logs.
- Any regression in SHA-256 background streaming or capture time extraction badges.
- Failure of whole-list refusal on data contract violations L01–L04 or BOM.
