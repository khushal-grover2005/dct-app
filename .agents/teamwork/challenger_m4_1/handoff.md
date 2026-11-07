# Milestone 4 Adversarial Challenge Handoff Report: Start Screen & State Pipeline

**Agent**: `challenger_m4_1` (Milestone 4 Start Screen Stress Challenger)  
**Role**: Critic, Specialist  
**Working Directory**: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\challenger_m4_1`  
**Date**: 2026-11-07  
**Verdict**: **REQUEST_CHANGES**

---

## Challenge Summary

**Overall risk assessment**: **MEDIUM**

The Milestone 4 Start Screen implementation exhibits commendable architecture: recursive traversal preserves forward-slash relative paths, division-by-zero on empty folders is cleanly guarded in `HashManager`, large asset batches (>50 files) stream aggregate progress smoothly, and memory privacy is strictly preserved.

However, empirical stress testing surfaced two specific concrete defects requiring mitigation:
1. **DEFECT-01 (Medium Severity - UI Error Masking)**: Initial folder selection errors (such as user permission denial `NotAllowedError`) are completely invisible to the user because `FolderSection.tsx` mounts `folder-warnings-callout` exclusively within `{folderName && (...)}`.
2. **DEFECT-02 (Low/Medium Severity - Stale Worker Callback Leak)**: `HashManager.ts` lacks a `this.disposed` guard in `handleWorkerMessage()`, and `useAppPipeline.ts` lacks a manager identity check in `onDone()`. Lingering in-flight messages from a disposed hashing manager can execute callbacks after disposal and write old folder hashes into reactive state.

---

## Challenges & Empirical Findings

### [Medium] Challenge 1: Silent Masking of Initial Folder Selection Errors (DEFECT-01)
- **Assumption Challenged**: Folder selection errors from `window.showDirectoryPicker()` are surfaced to the user via `folder-warnings-callout`.
- **Attack Scenario**: Fresh session load where `folderName` is `null`. The user clicks "Open collection folder", but the browser rejects the prompt (e.g. `NotAllowedError` permission denied, `SecurityError`, or FSA API unsupported message from line 185). `useAppPipeline.openFolder()` catches the error and appends it to `folderWarnings` (`Folder selection error: Permission denied by user.`).
- **Verbatim Code Location**: `src/ui/FolderSection.tsx` lines 74–157:
  ```tsx
  {folderName && (
    <div className="mt-4 space-y-4">
      ...
      {/* Warnings callout */}
      {folderWarnings.length > 0 && (
        <div data-testid="folder-warnings-callout" className="bg-amber-50 ...">
          ...
        </div>
      )}
    </div>
  )}
  ```
- **Observed Behavior**: Because `folderName` is `null`, lines 74–157 never render. The user is only shown lines 68–72: `"No collection folder opened. Click 'Open collection folder' to begin."`. The error message is silently swallowed with zero UI feedback.
- **Blast Radius**: Lab operators experiencing permissions or browser filesystem errors on first launch will see the button do nothing without any feedback.
- **Mitigation**: Move the `{folderWarnings.length > 0 && (...)}` callout outside the `{folderName && (...)}` block in `FolderSection.tsx` so warnings render even when `folderName` is null.

### [Low/Medium] Challenge 2: Post-Disposal Worker Callback Leak in HashManager (DEFECT-02)
- **Assumption Challenged**: Disposing a `HashManager` during rapid folder switching guarantees that no callbacks for the previous folder's assets will fire.
- **Attack Scenario**: User selects Folder A (which enqueues assets into Manager A). While hashing is in flight, the user immediately selects Folder B. `useAppPipeline` calls `hashManagerRef.current.dispose()` on Manager A and creates Manager B. If a worker message event (e.g. `type: 'DONE'`) was already enqueued in the event loop before thread termination, Manager A receives the event.
- **Verbatim Code Location**:
  `src/folder/hashManager.ts` lines 132–150:
  ```ts
  private handleWorkerMessage(slot: WorkerSlot, message: WorkerOutboundMessage): void {
    const job = slot.currentJob;
    if (!job || job.jobId !== message.jobId) {
      return;
    }
    // LACKS: if (this.disposed) return;
  ```
  `src/app/useAppPipeline.ts` lines 146–150:
  ```ts
  onDone: ({ sha256 }) => {
    asset.sha256 = sha256;
    asset.hashProgress = 100;
    setAssetHashes((prev) => ({ ...prev, [asset.assetId]: sha256 }));
    resolve();
  },
  ```
- **Observed Behavior**: `handleWorkerMessage` does not check `this.disposed`, and `dispose()` does not nullify `slot.currentJob`. The delayed `onDone` callback executes and calls `setAssetHashes` in `useAppPipeline`, potentially writing stale hashes from Folder A into Folder B's state.
- **Blast Radius**: Rapid switching between folders containing colliding filenames (e.g. `IMG-0001.png`) could overwrite the new folder's hash with the old folder's hash.
- **Mitigation**:
  1. In `src/folder/hashManager.ts` `handleWorkerMessage()`: add `if (this.disposed) return;` at the very top.
  2. In `src/folder/hashManager.ts` `dispose()`: for each slot, set `slot.worker.onmessage = null; slot.currentJob = null;`.
  3. In `src/app/useAppPipeline.ts` inside `onDone`: guard with `if (hashManagerRef.current !== manager) return;`.

---

## 1. Observation

All tests were executed directly in `vitest`, `eslint`, `tsc`, and `python unittest`.

1. **Adversarial Test Suite Creation**:
   - Authored test harness: `tests/unit/ui/adversarial_m4.test.tsx` (14 empirical test cases).
   - Test execution command: `npx vitest run tests/unit/ui/adversarial_m4.test.tsx`
   - Output:
     ```text
     ✓ tests/unit/ui/adversarial_m4.test.tsx (14 tests) 9819ms
       ✓ Challenge 1: Rapid folder switching under concurrent Web Worker hashing > 1.1: Immediately switches folders while workers are hashing without race conditions 1291ms
       ✓ Challenge 1: Rapid folder switching under concurrent Web Worker hashing > 1.2: Same filename in Folder A and Folder B resolves with Folder B hash, never polluted by A 477ms
       ✓ Challenge 1: Rapid folder switching under concurrent Web Worker hashing > 1.3 [DEFECT-02 Empirical Demonstration]: HashManager handleWorkerMessage lacks this.disposed guard and slot cleanup on dispose 2ms
       ✓ Challenge 2: Empty folder ingestion (0 assets, division by zero protection) > 2.1: Handles completely empty folder (0 assets) without crashing or NaN 210ms
       ✓ Challenge 2: Empty folder ingestion (0 assets, division by zero protection) > 2.2: Folder containing only ignored hidden files (.git, .hidden, .dct-progress.json) results in 0 assets 205ms
       ✓ Challenge 2: Empty folder ingestion (0 assets, division by zero protection) > 2.3: Proceed button remains disabled even if valid consented list is loaded when assets = 0 479ms
       ✓ Challenge 3: Deeply nested folder structures with forward slashes > 3.1: Ingests 4 levels of nested directories and produces forward-slash relative asset_id 306ms
       ✓ Challenge 3: Deeply nested folder structures with forward slashes > 3.2: Custom extension override at collection root (dct-types.json) applies to nested files 234ms
       ✓ Challenge 4: Large asset collections (>50 assets) > 4.1: Seamlessly processes 60 assets with monotonic progress tracking and full completion 3477ms
       ✓ Challenge 4: Large asset collections (>50 assets) > 4.2: Large collection (>50 assets) preserves RAM privacy without writing to web storage 2594ms
       ✓ Challenge 5: User cancellation (AbortError) handling in directory picker > 5.1: AbortError on initial open preserves idle state without warnings 182ms
       ✓ Challenge 5: User cancellation (AbortError) handling in directory picker > 5.2: AbortError on "Change folder" preserves already loaded folder state without disruption 289ms
       ✓ Challenge 5: User cancellation (AbortError) handling in directory picker > 5.3: Non-AbortError on "Change folder" surfaces descriptive warning callout 302ms
       ✓ Challenge 5: User cancellation (AbortError) handling in directory picker > 5.4 [DEFECT-01 Empirical Demonstration]: Non-AbortError on initial open is invisible because warning callout is inside {folderName && (...)} 159ms

     Test Files  1 passed (1)
          Tests  14 passed (14)
     ```

2. **Code Quality & Linter**:
   - `npx eslint tests/unit/ui/adversarial_m4.test.tsx`: 0 errors, 0 warnings.
   - `python -m unittest tools/test_validate_export.py`: 20/20 tests passed in 0.203s.

---

## 2. Logic Chain

1. **Challenge 1 (Rapid Folder Switching)**:
   - When switching from Folder A to Folder B, `useAppPipeline.ts` invokes `hashManagerRef.current.dispose()`.
   - In our empirical test 1.1, workers running for Folder A have their `.terminate()` method called, stopping further background execution.
   - In test 1.2, colliding filenames between folders correctly display the hash for Folder B without being overwritten by Folder A under standard flow.
   - However, test 1.3 empirically proved that `HashManager.handleWorkerMessage()` does not check `this.disposed`. If a message arrives after `dispose()`, `onDone` is invoked. In `useAppPipeline.ts`, `onDone` does not verify `hashManagerRef.current === manager`, creating a race condition risk.

2. **Challenge 2 (Empty Folder Ingestion)**:
   - `scanFolder()` with 0 assets or with exclusively ignored files (`.git`, `.hidden`, `.dct-progress.json`) yields `scanResult.assets = []`.
   - `useAppPipeline.ts` lines 114–124 bypasses `HashManager` and immediately sets `hashingCompleted = true` and `overallPercent = 100`.
   - Progress bar rendering avoids division-by-zero and renders `Completed (100%)` with `0 assets found`.
   - `isReadyForTagging` checks `assets.length > 0`, ensuring that the "Start tagging" Proceed button remains strictly disabled even when a valid consented list is loaded.

3. **Challenge 3 (Deeply Nested Folder Paths)**:
   - Test 3.1 constructed a 4-level directory hierarchy (`level1/level2/level3/level4/deep_photo.png`).
   - `normalizeAssetPath()` in `scanner.ts` guarantees all paths use forward slashes `/` with zero backslashes.
   - Relative paths are rendered accurately in `AssetTable.tsx` and hashes match crypto oracle.
   - Test 3.2 confirmed root-level `dct-types.json` overrides properly categorize custom extensions in nested subfolders.

4. **Challenge 4 (Large Asset Collections >50 Assets)**:
   - Test 4.1 queued 60 assets through the worker pool.
   - `HashManager` drained all 60 assets concurrently with max concurrency 2.
   - Aggregate progress incremented monotonically from 0% to 100%.
   - Test 4.2 audited browser storage (`localStorage`, `sessionStorage`) after 55 assets and verified 0 keys written, preserving privacy.

5. **Challenge 5 (Cancellation Handling in Directory Picker)**:
   - `AbortError` thrown by `window.showDirectoryPicker` is explicitly caught in `useAppPipeline.ts` lines 196–199, returning cleanly.
   - Initial cancel retains idle prompt; "Change folder" cancel retains previous folder and assets without alteration.
   - However, when non-AbortError occurs (e.g. `NotAllowedError`), `folderWarnings` is updated, but `FolderSection.tsx` hides warnings because `folderName === null` (DEFECT-01).

---

## 3. Caveats

- Operating system native file dialog visual styling is outside the scope of browser-level unit testing and is mediated by the browser implementation of the File System Access API.
- Web Worker thread instantiation in Vitest JSDOM environment is simulated via `ControllableMockWorker`. Real browser behavior in Playwright E2E tests confirms end-to-end integration.

---

## 4. Conclusion

The Milestone 4 implementation is robust across the majority of stress dimensions (division-by-zero protection, deep paths, scale, and cancellation).
However, due to **DEFECT-01** (silent masking of folder selection errors on initial launch) and **DEFECT-02** (missing post-disposal guard in `HashManager` and `useAppPipeline`), the verdict is **REQUEST_CHANGES**.

Recommended fixes for worker:
1. In `src/ui/FolderSection.tsx`: Move `{folderWarnings.length > 0 && (...)}` out of `{folderName && (...)}` so errors on initial open are visible.
2. In `src/folder/hashManager.ts`: Add `if (this.disposed) return;` at the start of `handleWorkerMessage()`, and clear `slot.currentJob = null; slot.worker.onmessage = null;` on `dispose()`.
3. In `src/app/useAppPipeline.ts`: In `onDone` callback, check `if (hashManagerRef.current !== manager) return;`.

---

## 5. Verification Method

To independently verify all findings and stress tests:

```powershell
# 1. Run the comprehensive adversarial suite (all 14 tests)
npx vitest run tests/unit/ui/adversarial_m4.test.tsx

# 2. Run ESLint on the adversarial test file
npx eslint tests/unit/ui/adversarial_m4.test.tsx

# 3. Verify standard Milestone 4 StartScreen integration test suite
npx vitest run tests/unit/ui/StartScreen.test.tsx

# 4. Verify Python reference export validator (20 tests)
python -m unittest tools/test_validate_export.py
```

### Invalidation Conditions
- Any occurrence of `NaN%` or `Infinity%` in the hashing progress bar.
- Any backslash `\` appearing in `asset_id` paths.
- The Proceed button ("Start tagging") becoming enabled when `assets.length === 0`.
- Missing error messages when folder selection fails.
