# Milestone 4 Handoff Report: Start Screen UI, Folder Ingestion & Consented List Flow (UC-01 & UC-02)

**Agent**: `worker_m4`  
**Working Directory**: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\worker_m4`  
**Date**: 2026-11-07  
**Task**: Implement Milestone 4: Start Screen UI, Folder Ingestion & Consented List Flow (UC-01 & UC-02)  

---

## 1. Observation

### 1.1 Requirements & Context Sources
- `ORIGINAL_REQUEST.md` (Lines 23–31, 38–49): Mandates air-gapped app shell with CSP `connect-src 'none'`, folder picker via `window.showDirectoryPicker`, recursive traversal, forward-slash `asset_id`, 6-type classification, background Web Worker streaming SHA-256 calculation, capture time extraction (EXIF Asia/Kolkata -> UTC Z, MP4 header `06:40:00Z` on `VID-0005.mp4`, fallback to file date), consented list loading, L01–L04 whole-list refusal, selectability evaluation (minors and expired consents non-selectable), and strict in-memory privacy (zero names in storage, URLs, logs).
- `AGENTS.md` (Rules 1–10): Stack fixed to React 18 + TS strict + Vite; zero network; IDs copied never typed; asset files strictly immutable; names stay in memory; synthetic data only.
- `docs/consent-tagging/app-design.md` (§2.1 & §2.5): 3-step Start screen (1. Open collection folder, 2. Load consented list, 3. Collection reference name `collection_ref` prefilled from folder name, editable). Status badges carry text labels, not color alone.
- Explorers' Blueprints:
  - `explorer_m4_1/handoff.md`: UI component hierarchy and design tokens (`src/ui/`).
  - `explorer_m4_2/handoff.md`: Reactive state management pipeline and `useAppPipeline` custom hook.
  - `explorer_m4_3/handoff.md`: Vitest integration and Playwright E2E verification suites.

### 1.2 Implemented Source Files
1. `src/ui/types.ts`: Defined view state contracts `FolderUiState`, `ListUiState`, `AppPipeline`, and `StartScreenProps`.
2. `src/app/useAppPipeline.ts`: Created unified reactive hook managing directory selection, `scanFolder`, background `HashManager` pool (2 concurrent workers), live per-asset hash streaming, `loadConsentedList` CSV ingestion, selectability synchronization, and `isReadyForTagging` derivation.
3. `src/ui/FolderSection.tsx`: Ingestion controls, folder name badge (`data-testid="folder-name"`), asset count pill (`data-testid="asset-count-badge"`), 6-type semantic breakdown badges (`image`, `video`, `audio`, `sensor`, `document`, `other`), amber warning pill for unclassified 'other' files, and aggregate SHA-256 progress bar (`data-testid="hashing-progress-bar"`).
4. `src/ui/AssetTable.tsx`: Table listing scanned assets with monospace relative paths (`/`), semantic type badges, capture times, source badges (`EXIF`, `MP4 header`, `capture time from file date`), and full 64-character SHA-256 display (`data-testid="asset-hash-<assetId>"`).
5. `src/ui/ListSection.tsx`: Consented list loader with accessible hidden file input (`data-testid="consented-list-input"`), file picker dialog trigger, and value clearing for re-selection.
6. `src/ui/ListErrorBanner.tsx`: Whole-list error banner displaying rule codes (`[L01]`, `[L02]`, `[L03]`, `[L04]`, `[BOM_NOT_ALLOWED]`) and descriptive messages without leaking personal data.
7. `src/ui/ListSummary.tsx`: Summary metric cards for project name, project ID, total participants, selectable count, non-selectable count, and `list_valid_until`.
8. `src/ui/ParticipantTable.tsx`: In-memory participant table preview showing person ID, display name, contact hint, consent expiry, status chips, and selectability reasons (`minor`, `consent expired 3 Nov`).
9. `src/ui/StartScreen.tsx`: Top-level 3-step Start screen workflow coordinator with collection reference input (`data-testid="collection-ref-input"`) and "Start tagging" proceed button (`data-testid="proceed-button"`).
10. `src/ui/index.ts`: Barrel export file.
11. `src/app/App.tsx`: Wired root application shell to `useAppPipeline` and `<StartScreen />`, strictly maintaining `#app-shell`, heading, "Air-Gapped" badge, and browser capability verification required by `browserGate.test.tsx`.
12. `PROJECT.md`: Updated Milestones M3 and M4 to `DONE` and feature inventory features 14–23 to `DONE`.
13. `docs/consent-tagging/session-log.md`: Documented Milestone 4 changes, passing test evidence, and deferred scope.

### 1.3 Implemented Verification Test Suites
1. `tests/unit/ui/StartScreen.test.tsx`: 7 integration unit tests:
   - Initial idle state render with pickers and disabled proceed button.
   - Folder ingestion of 8 sample assets with badges, capture times (`VID-0005.mp4` at `06:40:00Z`), and 100% hashing completion matching exact SHA-256.
   - Consented list loading displaying project summary, selectability breakdown (4 people, 2 not selectable: minor and expired), and RAM privacy verification.
   - Whole-list refusal on missing columns (L01) displaying error alert banner.
   - Whole-list refusal on UTF-8 BOM (`BOM_NOT_ALLOWED`).
   - Order-independent loading (list loaded first, then folder loaded) enabling "Start tagging" button.
   - Graceful handling of user cancellation (`AbortError`) in directory picker.
2. `e2e/start-screen.spec.ts`: Full Playwright E2E browser automation suite:
   - `T-01 & T-02`: Ingestion of 8 sample assets plus nested `sub/x.png`, unknown extension `test.xyz` ('other'), custom `dct-types.json` override (.dat -> sensor), header time `06:40:00Z` on `VID-0005.mp4`, fallback "capture time from file date" on `IMG-0001.png`, exact SHA-256 matches, and 0 external network requests under CSP `connect-src 'none'`.
   - `T-03`: Consented list ingestion, L01–L04 negative list whole refusal, and comprehensive privacy audit across `localStorage`, `sessionStorage`, `IndexedDB`, console messages, and URL parameters.

### 1.4 Test & Verification Tool Executions
- `npm test`: 14 test files passed, 197 tests passed (0 failed).
- `npm run lint`: Exited 0 with 0 errors and 0 warnings (`eslint . --max-warnings 0`).
- `npx tsc --noEmit`: Exited 0 with 0 errors under TypeScript strict mode.
- `npm run build`: Static production bundle compiled cleanly in 9.90s.
- `npm run e2e`: 32 passed, 6 skipped across Chromium and Firefox (1.1m).
- `python -m unittest tools/test_validate_export.py`: 20/20 passed in 0.091s.

---

## 2. Logic Chain

1. **Reactive State Pipeline (`useAppPipeline.ts`)**:
   - `scanFolder(handle)` returns `FolderScanResult` containing normalized assets and non-fatal warnings.
   - Scanned assets are enqueued into `HashManager` with `maxConcurrency: 2`, streaming aggregate progress to `FolderSection` and updating `assetHashes` reactively so `AssetTable` reflects computed hashes in real time.
   - Consented lists are ingested via `loadConsentedList(csvText, { referenceTime })` with BOM detection using `TextDecoder('utf-8', { ignoreBOM: true })`.
   - Any L01–L04 or BOM violation sets `consentedList` to `null` and populates `listErrors`, refusing the whole list and hiding the participant preview table per data-contract.md §4.
   - If folder is loaded first, list selectability evaluates against the collection capture time; if list is loaded first, opening the collection re-synchronizes selectability against the newly scanned assets.
2. **Component Separation & Accessibility (`src/ui/`)**:
   - `FolderSection` renders type pills with high-contrast Tailwind tokens and explicit text labels (`image`, `video`, `audio`, etc.) rather than color alone per app-design.md §2.5.
   - `AssetTable` renders full 64-character SHA-256 strings in monospace font, satisfying deterministic Playwright assertion `toHaveText(expectedSha)` without truncation issues.
   - `ListSection` resets `fileInput.value = ''` upon change, allowing agents to re-select corrected files seamlessly.
3. **App Shell Invariance (`App.tsx`)**:
   - Maintained `#app-shell`, heading "Data Collection Tool", "Air-Gapped" badge, and text "Browser capability verified: File System Access API is active." in the header.
   - This ensures all 8 existing unit tests in `browserGate.test.tsx` and BrowserGate E2E tests continue to pass with 0 regressions.
4. **Privacy Invariant Guarantee (AGENTS.md Rule 8)**:
   - Zero calls to `localStorage.setItem` or `sessionStorage.setItem` containing participant data.
   - Zero participant names or contact hints in console logging or URL parameters.
   - Validated independently by both unit tests (`StartScreen.test.tsx`) and automated Playwright browser audits (`start-screen.spec.ts`).

---

## 3. Caveats

1. **Tagging Workspace Transition**:
   - Reaching the three-pane tagging workspace (asset media viewers, participant chip selector, bystander stepper) belongs to Increment 2 (Milestone 5+).
   - In Milestone 4, clicking "Start tagging" validates that the collection is ready and displays a verified status notice.
2. **Browser FSA API Availability**:
   - In automated headless test environments, native OS directory dialogs are automated via injected `page.addInitScript` mock directory handles backed by binary buffers from `docs/consent-tagging/examples/sample-collection/`.
   - Firefox is intentionally blocked by `<BrowserGate>` as required by R1 / Acceptance Test T-02.

---

## 4. Conclusion

Milestone 4 is fully implemented, verified, and complete:
- Satisfies UC-01 (Open a collection folder) and UC-02 (Load the consented list).
- Upholds all AGENTS.md rules: fixed stack, zero network traffic (CSP `connect-src 'none'`), no typed IDs, asset file immutability, and in-memory participant privacy.
- All 197 unit/integration tests, 32 Playwright E2E tests, ESLint with 0 warnings, strict TypeScript compilation, Vite static build, and Python export validator pass with 100% green status.

---

## 5. Verification Method

### 5.1 Commands to Verify Independently
```powershell
# 1. Run all unit and integration tests (197 tests, 14 suites)
npm test

# 2. Run Playwright Start Screen E2E suite
npx playwright test e2e/start-screen.spec.ts

# 3. Run all Playwright E2E test suites (32 passed, 6 skipped)
npm run e2e

# 4. Run ESLint (must pass with 0 warnings)
npm run lint

# 5. Run TypeScript strict typecheck (must pass with 0 errors)
npx tsc --noEmit

# 6. Run clean Vite production build
npm run build

# 7. Run reference Python validator suite (20 tests)
python -m unittest tools/test_validate_export.py
```

### 5.2 Invalidation Conditions
- Any network request made after load outside localhost.
- Any participant name or contact hint appearing in `localStorage`, `sessionStorage`, `IndexedDB`, console logs, or URL parameters.
- Any SHA-256 mismatch against `docs/consent-tagging/examples/asset_export.sample.csv`.
- Any partial acceptance of invalid consented lists violating L01–L04 or BOM.
