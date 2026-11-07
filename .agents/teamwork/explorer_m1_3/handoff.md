# Handoff Report: Milestone 1 — Browser Capability Gating, Unsupported UI, and Smoke Test Harness

**Agent**: `explorer_m1_3`  
**Parent**: Project Orchestrator (`fde194f5-9579-434b-9b81-d7bb7a515ef0`)  
**Working Directory**: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m1_3`  
**Handoff Type**: Hard (Task Complete)

---

## 1. Observation

1. **Requirement R-05 in `docs/consent-tagging/use-cases.md` (Line 34)**:
   > "In a browser without the File System Access API the app shows one page explaining that Chrome or Edge is required, and nothing else."
2. **Acceptance Test T-02 in `docs/consent-tagging/acceptance-tests.md` (Line 10)**:
   > "In Firefox the app shows only the Chrome/Edge page; in Chrome the page's CSP has `connect-src 'none'` and Playwright records zero network requests after load across a full tag-and-save run"
3. **Stack and Architecture Constraints in `AGENTS.md` (Lines 11–13, 20)**:
   > "React 18 + TypeScript strict + Vite static build, Chrome/Edge, File System Access API, papaparse, exifr, mp4box.js, hash-wasm, zod, vitest, Playwright, npm. No backend, no SSR, no telemetry, no remote fonts or assets."
4. **Target Layout in `PROJECT.md` (Lines 137–141, 156–157)**:
   > ```
   > src/
   > ├── main.tsx                # Entry point & Browser Gate evaluation
   > ├── app/
   > │   ├── App.tsx             # Main container
   > │   └── BrowserGate.tsx     # Unsupported browser fallback UI
   > ...
   > └── styles/
   >     └── index.css           # Tailwind / CSS tokens
   > ```
5. **Collection Machine Display Constraints in `docs/consent-tagging/app-design.md` (Lines 118–120)**:
   > "Layout rules: minimum supported window 1280 × 720; panes resizable; everything reachable by keyboard; status chips carry text, not colour alone."
6. **Existing Codebase State**:
   - `list_dir` on `c:\Users\pc\.gemini\antigravity\scratch\dct-app` verified that `package.json`, `index.html`, and `src/` are not yet created (scheduled for Milestone 1 Worker).
   - Execution of `python -m unittest tools/test_validate_export.py` verified: `Ran 20 tests in 0.071s, OK`.
   - Node runtime verified as `v22.15.0`, npm `11.3.0`.

---

## 2. Logic Chain

1. **Capability Identification (from Observations 1, 2, and 3)**:
   The application requires the File System Access API (`window.showDirectoryPicker`) to read folder contents and write sheets locally without network calls. This API exists in desktop Google Chrome and Microsoft Edge, but is undefined in Mozilla Firefox, Apple Safari, and mobile browsers.
2. **Defensive Detection (from Observations 1 and 3)**:
   Directly accessing `window.showDirectoryPicker` can cause runtime or compile-time issues if not guarded against `undefined` window environments (e.g. build tools, test runners) and TypeScript strict checking. The capability check must verify `typeof window !== 'undefined' && 'showDirectoryPicker' in window && typeof window.showDirectoryPicker === 'function'`.
3. **Strict Unsupported Screen Semantics (from Observations 1 and 2)**:
   The specification explicitly mandates that unsupported browsers show the Chrome/Edge requirement message "and nothing else". Therefore, `BrowserGate.tsx` must conditionally short-circuit rendering before the main application shell (`App.tsx`) is mounted. The unsupported screen must contain solely the exact text:
   `"This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly."`
   No headers, navigation bars, buttons, or secondary links may be rendered.
4. **Supported Shell Layout (from Observations 4 and 5)**:
   When `isFileSystemAccessSupported()` evaluates to true, `BrowserGate` renders its children (`<App />`), which renders `#app-shell` adhering to the minimum viewport width (`min-w-[1280px]`) and clean slate design tokens.
5. **Entry Point Composition (from Observation 4)**:
   `src/main.tsx` mounts `<React.StrictMode><BrowserGate><App /></BrowserGate></React.StrictMode>` into the DOM root element `#root`.
6. **Type Safety & Test Harness (from Observations 2 and 3)**:
   Ambient declaration in `src/types/file-system-access.d.ts` ensures `tsc --noEmit` passes cleanly. Vitest unit tests can mock `window.showDirectoryPicker` with `vi.fn()` and verify that either the gate screen or `<App />` is rendered in total isolation. Playwright can drive Firefox to verify the unsupported card and Chromium to verify `#app-shell` and 0 network requests under CSP.

---

## 3. Caveats

1. **Secure Context Dependency**:
   In Chromium, `window.showDirectoryPicker` is strictly exposed only in secure contexts (`isSecureContext === true`). When running in development, Vite serves on `http://localhost:5173` (treated as a secure origin). If deployed over plain unencrypted HTTP on an IP address (e.g. `http://192.168.1.50:5173`), Chromium will hide `showDirectoryPicker`, causing the gate to display. This is expected security behavior.
2. **Playwright Firefox Binary**:
   Running `npx playwright test --project=firefox` requires the Playwright Firefox browser binary to be installed (`npx playwright install firefox`). If missing in the local environment, the Worker must run the installation command.
3. **No Code Implementation**:
   Per the explorer role, no implementation code was written to `src/`. All technical designs, complete source code blueprints, and test specs have been produced in `analysis.md` for consumption by the Worker agent.

---

## 4. Conclusion

Milestone 1 Browser Capability Gating is completely analyzed and specified. The Worker agent can implement the capability gate and smoke test harness with zero ambiguity by following the blueprints in `analysis.md`:
1. **Type Definitions**: `src/types/file-system-access.d.ts` declaring global `Window.showDirectoryPicker`.
2. **Capability Helper**: `src/app/capabilities.ts` implementing `isFileSystemAccessSupported()`.
3. **Gate UI**: `src/app/BrowserGate.tsx` rendering exclusively the exact requirement string on failure.
4. **App Shell**: `src/app/App.tsx` rendering the `#app-shell` container on success.
5. **Entry Point**: `src/main.tsx` cleanly orchestrating the gate and app shell mount.
6. **Tokens & Styles**: `src/styles/index.css` configuring system fonts and Tailwind utilities.
7. **Verification Harness**: `tests/unit/browserGate.test.tsx` (Vitest) and `e2e/t02-browser-network.spec.ts` (Playwright).

---

## 5. Verification Method

To independently verify the implementation once executed by the Worker agent:

1. **Verify Type Checking**:
   ```powershell
   npx tsc --noEmit
   ```
   *Pass Criteria*: Zero errors under `strict: true` and `noImplicitAny: true`.

2. **Verify Code Style and Linting**:
   ```powershell
   npm run lint
   ```
   *Pass Criteria*: Zero ESLint warnings or errors (`no-explicit-any: error` enforced).

3. **Verify Vitest Unit Tests**:
   ```powershell
   npm test tests/unit/browserGate.test.tsx
   ```
   *Pass Criteria*: 4/4 passing tests verifying capability detection, unsupported screen isolation, supported child rendering, and override prop.

4. **Verify Playwright E2E Smoke Tests**:
   ```powershell
   npx playwright test e2e/t02-browser-network.spec.ts --project=firefox
   npx playwright test e2e/t02-browser-network.spec.ts --project=chromium
   ```
   *Pass Criteria*:
   - Firefox run: Locates `#browser-gate-unsupported` containing exact text `"This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly."`, verifies `#app-shell` is absent, and confirms 0 external network calls.
   - Chromium run: Confirms `#browser-gate-unsupported` is absent, `#app-shell` is visible, and 0 external network calls.

5. **Verify Python Reference Validator Parity**:
   ```powershell
   python -m unittest tools/test_validate_export.py
   ```
   *Pass Criteria*: 20/20 tests pass.
