# Milestone 3 Independent Review & Adversarial Critic Report

- **Reviewer**: `reviewer_m3_2` (Teamwork Reviewer & Adversarial Critic)
- **Target**: Milestone 3 of Increment 1 (Consented List Parsing, L01–L04 Validation, Participant Selectability, AGENTS.md Rule 8 Privacy Invariants)
- **Target Author**: `worker_m3`
- **Date**: 2026-11-07
- **Verdict**: **APPROVE**

---

## Review Summary

**Verdict**: **APPROVE**  
Milestone 3 implementation strictly adheres to AGENTS.md Rules 6 & 8, data-contract.md §2 & §3, app-design.md §4 & §8, and acceptance tests T-03 / T-04. Zero integrity violations, zero privacy leaks, and 100% parity with Python reference validator `tools/validate_export.py`.

---

## 1. Observation

### 1.1 Source Code and Test Review
1. `src/list/selectability.ts`:
   - Line 7: `const TS_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/;` validates ISO UTC timestamps with `Z`, supporting up to microsecond precision.
   - Lines 25–34: Non-rolling calendar validation in `isValidIsoUtc` rejects invalid calendar dates like Feb 30:
     ```ts
     const dateMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})T/);
     ...
     if (d.getUTCFullYear() !== year || d.getUTCMonth() + 1 !== month || d.getUTCDate() !== day) {
       return false;
     }
     ```
   - Lines 57–61: `formatExpiryDate(date: Date)` uses UTC methods (`date.getUTCDate()`, `date.getUTCMonth()`), producing strings like `"consent expired 3 Nov"` immune to local client timezone drift.
   - Lines 84–88: Minor check:
     ```ts
     const minorFlag =
       typeof isMinor === 'string' ? isMinor.trim().toLowerCase() === 'true' : Boolean(isMinor);
     if (minorFlag) {
       allReasons.push('minor');
     }
     ```
   - Lines 98–106: Consent expiry boundary implements `>=` comparison (exact second match is expired):
     ```ts
     if (refDate.getTime() >= expDate.getTime()) {
       allReasons.push('expired');
     }
     ```
   - Lines 109–119: List validity boundary implements `>` comparison (exact second match is valid):
     ```ts
     if (refDate.getTime() > validUntilDate.getTime()) {
       allReasons.push('list_expired');
     }
     ```
   - Lines 123–130: Strict precedence evaluation: `minor` > `expired` > `list_expired`.

2. `src/list/validator.ts`:
   - Lines 34–44: Rule L01 checks required list columns and returns sorted missing column names; extra unknown columns are tolerated.
   - Lines 47–55: Rule L02 verifies `projects.size === 1`, reporting exact count otherwise.
   - Lines 58–67: Rule L03 verifies single valid ISO 8601 UTC `list_valid_until` across all rows.
   - Lines 70–84: Rule L04 detects duplicate `person_id` values, reporting duplicate IDs while never revealing display names.
   - Short-circuit execution order: L01 -> L02 -> L03 -> L04 matches `tools/validate_export.py:91-108` verbatim.

3. `src/list/parser.ts`:
   - Lines 84–94: UTF-8 BOM detection rejects `\ufeff` early with message `"file starts with a byte-order mark; save as UTF-8 without BOM"`.
   - Lines 97–102: PapaParse configuration uses `header: true`, `skipEmptyLines: 'greedy'`, and trims headers and values.
   - Lines 47–60: `consentedRowSchema` uses Zod with `.passthrough()` to validate UUIDs, timestamps, boolean strings, and reject empty names.
   - Lines 128–140: Resume check validates matching `expectedProjectId` (code `'RESUME_MISMATCH'`).
   - Lines 171–196: Selectability mapping accurately constructs typed `ConsentedPerson` records.

4. `tests/unit/list/privacy.test.ts`:
   - Lines 28–61: Proves zero participant display names or contact hints in `localStorage` or `sessionStorage`.
   - Lines 63–77: Proves zero participant names in `IndexedDB`.
   - Lines 80–94: Proves zero participant names or contact hints in `window.location`.
   - Lines 96–124: Spies on all `console.*` methods across valid and invalid parsing paths, confirming 0 log leaks.
   - Lines 126–161: Verifies validation error messages never interpolate participant names or contact hints.
   - Lines 163–189: Verifies serialized progress payload contains only identifiers.

### 1.2 Independent Verification Results
All five independent verification commands were executed and passed cleanly:

1. **Vitest Unit Test Suite**:
   ```
   Command: npm test
   Result:
    ✓ tests/unit/list/selectability.test.ts (16 tests)
    ✓ tests/unit/list/validator.test.ts (20 tests)
    ✓ tests/unit/folder/classifier.test.ts (20 tests)
    ✓ tests/unit/list/parser.test.ts (14 tests)
    ✓ tests/unit/folder/hashing.test.ts (17 tests)
    ✓ tests/unit/folder/adversarial.test.ts (24 tests)
    ✓ tests/unit/folder/adversarial_m2.test.ts (13 tests)
    ✓ tests/unit/list/privacy.test.ts (6 tests)
    ✓ tests/unit/folder/captureTime.test.ts (12 tests)
    ✓ tests/unit/folder/scanner.test.ts (10 tests)
    ✓ tests/unit/security/csp.test.ts (3 tests)
    ✓ tests/unit/browserGate.test.tsx (8 tests)

    Test Files  12 passed (12)
         Tests  163 passed (163)
      Duration  34.03s
   Exit Code: 0
   ```

2. **ESLint Static Analysis**:
   ```
   Command: npm run lint
   Result:
   > dct-app@0.1.0 lint
   > eslint . --max-warnings 0
   Exit Code: 0 (0 errors, 0 warnings)
   ```

3. **TypeScript Compiler (`strict`)**:
   ```
   Command: npx tsc --noEmit
   Result: Clean output
   Exit Code: 0
   ```

4. **Vite Production Build**:
   ```
   Command: npm run build
   Result:
   ✓ 33 modules transformed.
   dist/index.html                   0.71 kB │ gzip:  0.42 kB
   dist/assets/index--51Bg6Wc.css    8.49 kB │ gzip:  2.47 kB
   dist/assets/index-D9v9x-Vm.js   144.85 kB │ gzip: 46.70 kB
   ✓ built in 13.73s
   Exit Code: 0
   ```

5. **Python Reference Validator Tests**:
   ```
   Command: python -m unittest tools/test_validate_export.py
   Result:
   Ran 20 tests in 1.048s
   OK
   Exit Code: 0
   ```

---

## 2. Logic Chain

1. **Contract Parity (L01–L04)**:
   - Observation: `validateConsentedList` enforces rules in exact sequence L01 -> L02 -> L03 -> L04 with verbatim string messages matching Python reference `tools/validate_export.py:91-108`.
   - Deduction: Any consented list rejected by the Python script will be rejected by the TypeScript implementation with identical diagnostic messages before any asset tagging can proceed.

2. **Selectability Boundaries & Precedence**:
   - Observation: `evaluateSelectability` tests `refDate.getTime() >= expDate.getTime()` for consent expiration and `refDate.getTime() > validUntilDate.getTime()` for list expiration.
   - Observation: Person 003 (`c2d3...`) expires at `2026-11-03T00:00:00Z` and evaluates to `'expired'` (`"consent expired 3 Nov"`) at sample capture time `2026-11-04T06:02:11Z`. Person 004 (`d4e5...`) has `is_minor === true` and evaluates to `'minor'`. Person 001 and 002 evaluate to selectable.
   - Deduction: Acceptance criteria T-03 and T-04 are completely satisfied: exactly 4 participants parsed, exactly 2 non-selectable. Exact-second boundary math aligns with Python lines 188 and 191.

3. **In-Memory Privacy Invariants (AGENTS.md Rule 8)**:
   - Observation: AST inspection and runtime audits in `tests/unit/list/privacy.test.ts` demonstrate that `display_name` and `contact_hint` are never written to `localStorage`, `sessionStorage`, `IndexedDB`, URLs, console output, or error messages.
   - Observation: `consentedRowSchema` and `validateConsentedList` format errors using only field names, line numbers, or UUIDs.
   - Deduction: AGENTS.md Rule 8 is strictly maintained across normal and error code paths.

4. **Adversarial Integrity Audit**:
   - Observation: No hardcoded participant IDs, test flags, dummy mocks, or bypasses exist in `src/list/`. All logic processes arbitrary CSV inputs dynamically through PapaParse, Zod, and UTC Date arithmetic.
   - Deduction: No integrity violations detected.

---

## 3. Adversarial Challenges & Stress Testing

| Challenge | Scenario Tested | Outcome / Defense | Risk Level |
|---|---|---|---|
| **Boundary Math** | Exact millisecond / second boundary comparisons | `>=` flags exact second match on consent expiry as expired; `>` allows exact second match on list valid until as valid. | Pass (Low) |
| **Timezone Drift** | Client running in UTC+12 or UTC-10 formatting date strings | `formatExpiryDate` uses `getUTCDate()` and `getUTCMonth()`, eliminating any day/month shifts. | Pass (Low) |
| **Calendar Rollover** | Invalid dates like `2026-02-30T00:00:00Z` | `isValidIsoUtc` verifies UTC year, month, and day match parsed values, preventing rolling date acceptance. | Pass (Low) |
| **Malformed CSVs** | Unclosed quotes, trailing blank rows, extra columns | PapaParse `greedy` empty line skipping and Zod `.passthrough()` handle whitespace and extra columns gracefully. | Pass (Low) |
| **Privacy Leak via Error Strings** | Corrupt display name or contact hint | Zod error messages never interpolate the rejected input string; only field name and constraint message are returned. | Pass (Low) |

---

## 4. Caveats

1. **React UI Integration**:
   - `loadConsentedList` is a headless domain module. UI wiring (display chips, non-selectable badges, disable select buttons) will be integrated in Milestone 4.
2. **Deterministic Test References**:
   - Calling `evaluateSelectability` without `options.referenceTime` defaults to `new Date()`. In unit tests and headless evaluations, passing an explicit `referenceTime` guarantees deterministic evaluation.

---

## 5. Conclusion

The Milestone 3 deliverables (`src/list/` modules and unit test suites in `tests/unit/list/`) are complete, well-architected, conformant to all project invariants, and pass all quality and adversarial checks without regressions.

**Recommendation**: Proceed to Milestone 4.

---

## 6. Verification Method

To independently reproduce this verification:

1. Run vitest:
   ```powershell
   npm test
   ```
   Expected: 12 test files passed, 163 tests passed.
2. Run eslint:
   ```powershell
   npm run lint
   ```
   Expected: 0 errors, 0 warnings.
3. Run tsc:
   ```powershell
   npx tsc --noEmit
   ```
   Expected: exit code 0.
4. Run vite build:
   ```powershell
   npm run build
   ```
   Expected: exit code 0, static assets created in `dist/`.
5. Run python reference validator:
   ```powershell
   python -m unittest tools/test_validate_export.py
   ```
   Expected: 20 tests pass.
