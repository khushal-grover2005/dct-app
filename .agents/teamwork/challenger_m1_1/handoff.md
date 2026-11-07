# Challenger Milestone 1 Adversarial Stress Test Report

## 1. Observation

Adversarial stress-testing of Milestone 1 Browser Capability Gate (`src/app/capabilities.ts`, `src/app/BrowserGate.tsx`, `src/app/App.tsx`) was conducted across multiple test tiers:

1. **Implementation Code Under Review**:
   - In `src/app/capabilities.ts`:
     ```typescript
     export function isFileSystemAccessSupported(): boolean {
       if (typeof window === 'undefined') {
         return false;
       }
       return (
         'showDirectoryPicker' in window &&
         typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
       );
     }
     ```
   - In `src/app/BrowserGate.tsx`:
     ```typescript
     export const BrowserGate: React.FC<BrowserGateProps> = ({ children, supportedOverride }) => {
       const isSupported = supportedOverride !== undefined ? supportedOverride : isFileSystemAccessSupported();
       if (!isSupported) {
         return (
           <div id="browser-gate-unsupported" ...>
             ...
           </div>
         );
       }
       return <>{children}</>;
     };
     ```

2. **Empirical Verification — Corner Case: `window.showDirectoryPicker` throwing an error**:
   - Test harness in `.agents/teamwork/challenger_m1_1/stress_test_gate.test.tsx` (Vitest) & `.agents/teamwork/challenger_m1_1/stress_gate.spec.ts` (Playwright E2E) simulated a throwing getter on `window.showDirectoryPicker`:
     ```typescript
     Object.defineProperty(window, 'showDirectoryPicker', {
       configurable: true,
       get() {
         throw new Error('SecurityError: Access to File System Access API is restricted by policy.');
       },
     });
     ```
   - **Vitest Result**:
     ```
     stderr | .agents/teamwork/challenger_m1_1/stress_test_gate.test.tsx > Adversarial Stress Test: Browser Capability Gate > Corner Case 6: accessing window.showDirectoryPicker throws an error
     Error: SecurityError: Access to File System Access API is restricted by policy.
         at Module.isFileSystemAccessSupported (src/app/capabilities.ts:7:69)
         at BrowserGate (src/app/BrowserGate.tsx:10:77)
     The above error occurred in the <BrowserGate> component:
     ```
   - **Playwright E2E Result** (`npx playwright test --config .agents/teamwork/challenger_m1_1/playwright.stress.config.ts`):
     ```
     [E2E CORNER CASE] Accessing showDirectoryPicker throws error:
       pageErrors: ["SecurityError: Access to File System Access API is restricted by policy."]
       gateCard isVisible: false
       x 4 [chromium] › Corner Case: accessing window.showDirectoryPicker throws an error (212ms)
     Error: expect(received).toBe(expected)
     Expected: true
     Received: false
     ```
   - **Direct Observation**: When accessing `window.showDirectoryPicker` throws an error (e.g. cross-origin/sandbox iframe restrictions, enterprise browser security policy restrictions, or throwing property descriptors), `isFileSystemAccessSupported()` uncaught error crashes React during mount. The unsupported card `#browser-gate-unsupported` is **NOT displayed**, leaving the user with an unhandled exception and blank screen.

3. **Empirical Verification — Other Corner Cases (PASS)**:
   - `window.showDirectoryPicker = undefined`: PASS. Gate card displayed, zero UI elements or inputs leaked.
   - `delete window.showDirectoryPicker`: PASS. Gate card displayed, zero UI elements or inputs leaked.
   - `window.showDirectoryPicker = null`: PASS. Gate card displayed, zero UI elements or inputs leaked.
   - `window.showDirectoryPicker = {}`: PASS. Gate card displayed, zero UI elements or inputs leaked.
   - `window.showDirectoryPicker` as primitives (string, number, boolean, symbol, bigint): PASS. Gate card displayed, zero UI elements or inputs leaked.
   - Simulated non-Chromium user agents (Firefox, Safari, iOS Safari): PASS. Gate card displayed, zero UI elements or inputs leaked.
   - Genuine `showDirectoryPicker` function in desktop Chromium: PASS. App shell renders cleanly, header and workspace status visible, no gate card.

4. **Repository Health & Quality Checks**:
   - `npm run lint`: **FAILED** with 4 ESLint errors in `e2e/t02-adversarial-csp.spec.ts`:
     - Line 52:15: `Empty block statement  no-empty`
     - Line 61:15: `Empty block statement  no-empty`
     - Line 332:15: `Empty block statement  no-empty`
     - Line 338:15: `Empty block statement  no-empty`
   - `npx playwright test`: **FAILED** on test `ADV-CSP-04` in `e2e/t02-adversarial-csp.spec.ts` (1 failed, 28 passed, 3 skipped).
   - `npx tsc --noEmit`: PASS (0 errors).
   - `python -m unittest tools/test_validate_export.py`: PASS (20/20 passed).

## 2. Logic Chain

1. **Challenge Mission Mandate**:
   - The mission requires verifying that when `window.showDirectoryPicker` throws an error, or in any unsupported state:
     *"Verify that in all failure/unsupported states, the app displays ONLY the Chrome/Edge requirement message and never leaks any app UI or functional elements."*
2. **Defect Mechanism**:
   - In `src/app/capabilities.ts`, `isFileSystemAccessSupported()` evaluates `'showDirectoryPicker' in window && typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'` without any `try { ... } catch { return false; }` boundary.
   - When the property access throws, the exception propagates synchronously into `<BrowserGate>` during React rendering.
   - Because no error boundary or internal `try/catch` exists, React aborts component rendering.
   - Consequently, the requirement screen is never shown to the user, violating Mission criteria 1 and 2.
3. **Repository Quality Gate Requirement (Done Means)**:
   - `AGENTS.md` mandates that `npm run lint` and all test suites pass with zero errors.
   - Currently, `npm run lint` fails on `e2e/t02-adversarial-csp.spec.ts` (4 `no-empty` errors) and `npx playwright test` fails on test `ADV-CSP-04`.
4. **Conclusion Derivation**:
   - Because of the capability gate crash bug under throwing conditions and the failing lint/playwright checks, Milestone 1 cannot be approved in its current state.

## 3. Caveats

- In standard desktop Google Chrome and Microsoft Edge on bare-metal systems under normal permissions, `window.showDirectoryPicker` is a standard native function and does not throw on property access.
- However, when embedded in sandboxed environments, restricted iframes, enterprise policy contexts, or when browser extensions hook the global object with throwing traps, unhandled access crashes the application.

## 4. Conclusion & Verdict

**Verdict**: **REJECT**

### Required Action Items for Worker:
1. **Fix `src/app/capabilities.ts`**:
   Wrap the property access in a `try...catch` block:
   ```typescript
   export function isFileSystemAccessSupported(): boolean {
     if (typeof window === 'undefined') {
       return false;
     }
     try {
       return (
         'showDirectoryPicker' in window &&
         typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function'
       );
     } catch {
       return false;
     }
   }
   ```
2. **Fix `e2e/t02-adversarial-csp.spec.ts` Linter & Test Failures**:
   - Resolve the 4 `no-empty` block statements.
   - Fix the assertion in `ADV-CSP-04` so `npx playwright test` passes 100% cleanly.

## 5. Verification Method

To independently reproduce and verify this finding:

1. **Reproduce Capability Gate Crash via Custom Vitest Config**:
   ```powershell
   npx vitest run --config .agents/teamwork/challenger_m1_1/vitest.stress.config.ts
   ```
   *Expected*: Shows `Error: SecurityError: Access to File System Access API is restricted by policy.` thrown inside `<BrowserGate>`.

2. **Reproduce Capability Gate Crash via Playwright E2E**:
   ```powershell
   npx playwright test --config .agents/teamwork/challenger_m1_1/playwright.stress.config.ts
   ```
   *Expected*: Test 4 fails with `Expected: true, Received: false` for `isGateVisible`.

3. **Verify Lint Regression**:
   ```powershell
   npm run lint
   ```
   *Expected*: 4 errors in `e2e/t02-adversarial-csp.spec.ts`.
