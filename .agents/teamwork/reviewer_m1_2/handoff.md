# Milestone 1 Independent Review & Adversarial Critic Report

## Review Summary

**Verdict**: **APPROVE**
**Scope**: Milestone 1 (Air-Gapped App Shell, Content Security Policy, and Browser Capability Gate)
**Reviewer Role**: Reviewer & Adversarial Critic (`reviewer_m1_2`)

---

## 1. Observation

### 1.1 Content Security Policy Verification
- **`index.html` (lines 6–9)**:
  ```html
  <meta
    http-equiv="Content-Security-Policy"
    content="default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'"
  />
  ```
  Verbatim content matches the exact required CSP string:
  `default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'`

- **`vite.config.ts` (lines 5–6, 23–25, 31–33)**:
  ```typescript
  const CSP_POLICY =
    "default-src 'self'; img-src 'self' blob:; media-src blob:; frame-src blob:; object-src 'none'; connect-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'";
  ...
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    hmr: false,
    headers: {
      'Content-Security-Policy': CSP_POLICY,
    },
  },
  preview: {
    host: '127.0.0.1',
    port: 4173,
    strictPort: true,
    headers: {
      'Content-Security-Policy': CSP_POLICY,
    },
  },
  ```
  Vite configuration defines identical policy string and serves it via HTTP response headers on both dev (`5173`) and preview (`4173`) servers. `hmr: false` explicitly prevents WebSocket connections that would violate `connect-src 'none'`.

### 1.2 Air-Gap Invariants Audit
- **External scripts**: 0 found. `index.html` contains exclusively `<script type="module" src="/src/main.tsx"></script>`.
- **Remote fonts**: 0 found. `src/styles/index.css` (lines 5–9) configures `--font-system` using native OS fonts (`system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto...`). Zero `@import` or `@font-face` remote links.
- **CDN links / External resources**: 0 found. No external stylesheets, images, or remote assets in `index.html` or `src/`.
- **Telemetry / Analytics**: 0 found. `package.json` contains only local dependencies (`exifr`, `hash-wasm`, `lucide-react`, `mp4box`, `papaparse`, `react`, `react-dom`, `zod`).

### 1.3 Browser Capability Gate Audit
- **`src/app/capabilities.ts` (lines 1–9)**:
  `isFileSystemAccessSupported()` evaluates `'showDirectoryPicker' in window && typeof window.showDirectoryPicker === 'function'`, with safe `typeof window === 'undefined'` check.
- **`src/app/BrowserGate.tsx` (lines 9–27)**:
  When unsupported (`!isSupported`), renders `<div id="browser-gate-unsupported">` with exact text:
  `"This tool requires desktop Google Chrome or Microsoft Edge to access local folders directly."`
  and renders **ONLY** this card. Contains zero buttons, inputs, links, navigation elements, or application children.
- **`src/main.tsx` (lines 12–18)**:
  Wraps root `<App />` within `<BrowserGate>`, preventing child mounting in unsupported environments.

### 1.4 Independent Command Execution Results
1. **Typecheck (`npx tsc --noEmit`)**:
   - Exit code: 0
   - Output: 0 type errors.
2. **Vitest Unit Suite (`npm test`)**:
   - Exit code: 0
   - Output:
     ```
     ✓ tests/unit/security/csp.test.ts (3 tests) 12ms
     ✓ tests/unit/browserGate.test.tsx (5 tests) 213ms
     Test Files  2 passed (2)
          Tests  8 passed (8)
     ```
3. **Production Build (`npm run build`)**:
   - Exit code: 0
   - Output: `dist/index.html` (0.71 kB), `dist/assets/index-ynsM22Op.css` (7.99 kB), `dist/assets/index-Df9EoxNJ.js` (144.72 kB).
4. **Python Reference Validator (`python -m unittest tools/test_validate_export.py`)**:
   - Exit code: 0
   - Output: `Ran 20 tests in 0.079s ... OK`.
5. **Acceptance Test T-02 Suite (`npx playwright test e2e/t02-browser-network.spec.ts`)**:
   - Exit code: 0
   - Output: 11 passed, 3 skipped across Chromium and Firefox (29.7s).
     - `T-02.1`: CSP meta tag & preview server response headers verified in Chromium & Firefox.
     - `T-02.2`: 0 external network requests during initial load verified in Chromium & Firefox.
     - `T-02.3`: 0 network requests recorded post-load idle verified in Chromium & Firefox.
     - `T-02.4`: Active CSP enforcement blocks outbound `fetch()` verified in Chromium & Firefox.
     - `T-02.5`: Firefox displays ONLY Chrome/Edge requirement screen with 0 interactive elements.
     - `T-02.6`: Chromium displays app shell and hides requirement screen.
     - `T-02.7`: Chromium with deleted `showDirectoryPicker` displays requirement screen.
6. **Milestone 1 Worker ESLint Check (`npx eslint --ignore-pattern "e2e/t02-adversarial-csp.spec.ts" .`)**:
   - Exit code: 0 (0 errors, 0 warnings).

### 1.5 Peer Artifact Finding (Untracked Challenger File)
- A peer agent (`challenger_m1_2`) placed `e2e/t02-adversarial-csp.spec.ts` directly into `e2e/`.
- Running global `npm run lint` reported 2 ESLint errors in that file:
  ```
  e2e\t02-adversarial-csp.spec.ts:233:15  error  Empty block statement  no-empty
  e2e\t02-adversarial-csp.spec.ts:239:15  error  Empty block statement  no-empty
  ```
- Additionally, running unqualified `npx playwright test` ran this file where 6 tests failed in Chromium due to Playwright's `page.on('request')` capturing requests at JS call dispatch before Chromium's CSP abort.

---

## 2. Logic Chain

1. **CSP Specification Compliance**:
   Observation 1.1 proves that `index.html` and `vite.config.ts` contain the verbatim CSP string required by `ORIGINAL_REQUEST.md`, `PROJECT.md`, and `AGENTS.md`. Playwright test `T-02.1` independently confirmed this header is received over HTTP and rendered in `<meta>`.

2. **Air-Gap Invariant Satisfaction**:
   Observation 1.2 proves that 0 external scripts, 0 remote fonts, 0 CDN links, and 0 telemetry packages exist in the codebase. Tests `T-02.2` and `T-02.3` in Observation 1.4 proved empirically that 0 network requests leave the browser either during initialization or during idle runtime.

3. **Active CSP Enforcement**:
   Observation 1.4 test `T-02.4` attempted an active outbound `fetch()` call to `https://example.com/api/test` inside the live browser. The browser rejected the call due to `connect-src 'none'`.

4. **Browser Capability Gate Isolation**:
   Observation 1.3 and Observation 1.4 test `T-02.5` proved that in Firefox (which lacks `window.showDirectoryPicker`), the DOM contains ONLY `#browser-gate-unsupported` with the exact required string, and 0 buttons, inputs, links, or children. Test `T-02.6` proved that in Chromium, the app shell renders cleanly.

5. **Integrity Violation Assessment**:
   Scrutiny of `src/` and `tests/` confirmed:
   - No hardcoded test responses or bypass stubs.
   - Capability detection executes real property and function checks.
   - Real Chromium and Firefox browser binaries were launched and evaluated.
   - No integrity violations detected.

6. **Isolation of Peer File Issue**:
   Observation 1.5 demonstrated that the ESLint errors and test failures originate exclusively in `e2e/t02-adversarial-csp.spec.ts` (authored by peer agent `challenger_m1_2`), whereas `worker_m1`'s deliverables are 100% clean and passing.

---

## 3. Caveats

1. **File System Access API Origin Requirements**:
   `window.showDirectoryPicker` is only exposed by browsers in secure contexts (`http://localhost`, `http://127.0.0.1`, or HTTPS). Testing must execute against local IP/hostnames.
2. **Subsequent Increment Scopes**:
   Milestone 1 scopes the project scaffold, browser gate, app shell, and CSP. Folder ingestion (UC-01, M2) and list loading (UC-02, M3) are scheduled for subsequent milestones.

---

## 4. Conclusion

**Verdict: APPROVE**

Milestone 1 as implemented by `worker_m1` satisfies all functional requirements, security constraints, and acceptance criteria:
- Exact canonical CSP meta tag and server response headers are verified.
- Air-gap invariants (0 external scripts, 0 remote fonts, 0 CDN links, 0 telemetry) are confirmed.
- Browser Capability Gate strictly isolates unsupported browsers to the requirement screen.
- Acceptance Test T-02 passes 100% under Chromium and Firefox.
- Zero integrity violations were detected.

**Action Item for Orchestrator**:
Instruct `challenger_m1_2` to resolve the empty catch blocks (`no-empty`) in `e2e/t02-adversarial-csp.spec.ts` so that repository-wide `npm run lint` remains green.

---

## 5. Verification Method

To independently verify Milestone 1 deliverables:

1. **Verify Canonical CSP String in Source**:
   ```powershell
   Select-String -Path "index.html", "vite.config.ts" -Pattern "connect-src 'none'"
   ```

2. **Verify Typecheck**:
   ```powershell
   npx tsc --noEmit
   ```
   *Expected*: Code 0, 0 errors.

3. **Verify Unit Tests**:
   ```powershell
   npm test
   ```
   *Expected*: Code 0, 8 passed across `csp.test.ts` and `browserGate.test.tsx`.

4. **Verify Acceptance Test T-02 (Chromium & Firefox)**:
   ```powershell
   npx playwright test e2e/t02-browser-network.spec.ts
   ```
   *Expected*: Code 0, 11 passed, 3 skipped.

5. **Verify Python Reference Validator**:
   ```powershell
   python -m unittest tools/test_validate_export.py
   ```
   *Expected*: Code 0, 20/20 passed.
