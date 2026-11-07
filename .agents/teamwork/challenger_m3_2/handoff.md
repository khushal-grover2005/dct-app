# Challenger Empirical Assessment Report: Milestone 3

**Author**: `challenger_m3_2` (empirical_challenger)  
**Target Milestone**: Milestone 3 (Consented List Parsing, L01–L04 Validation, Participant Selectability, AGENTS.md Rule 8 Privacy Invariants)  
**Date**: 2026-11-07T14:52:00Z  
**Verdict**: **APPROVE**  

---

## 1. Observation

### 1.1 Empirical Verification Test Suite
Authored a comprehensive adversarial stress test suite in `tests/unit/list/adversarial_m3.test.ts` (24 test cases) directly attacking:
- Boundary conditions (exact second equality and sub-second millisecond offsets for `consentExpiresAt` and `listValidUntil`).
- Leap day boundaries (`2024-02-29T12:00:00Z`, century leap years `2000-02-29` vs `1900-02-29`, non-leap Feb 29 dates).
- Multi-reason precedence (`is_minor: true` + expired consent + expired list).
- String boolean variants (`TRUE`, `True`, `false`, `FALSE`, whitespace-padded strings, and strict rejection of invalid strings like `yes`, `1`, `0`).
- Exact sample list evaluation against multiple timestamps on `2026-11-04`.
- Active canary privacy audit across `localStorage`, `sessionStorage`, `IndexedDB`, `window.location`, `console.*` methods, and error message payloads.
- High-scale performance (1,000 participant CSV parsing and selectability evaluation) and injection payload safety.

### 1.2 Verbatim Tool Commands and Outputs

1. **Vitest Unit Test Suite (including adversarial tests)**:
   ```
   Command: npm test
   Output:
    ✓ tests/unit/list/selectability.test.ts (16 tests) 23ms
    ✓ tests/unit/list/parser.test.ts (14 tests) 45ms
    ✓ tests/unit/list/validator.test.ts (20 tests) 27ms
    ✓ tests/unit/list/adversarial_m3.test.ts (24 tests) 473ms
    ✓ tests/unit/folder/hashing.test.ts (17 tests) 415ms
    ✓ tests/unit/folder/adversarial.test.ts (24 tests) 297ms
    ✓ tests/unit/folder/adversarial_m2.test.ts (13 tests) 4506ms
    ✓ tests/unit/folder/classifier.test.ts (20 tests) 32ms
    ✓ tests/unit/list/privacy.test.ts (6 tests) 169ms
    ✓ tests/unit/folder/captureTime.test.ts (12 tests) 341ms
    ✓ tests/unit/folder/scanner.test.ts (10 tests) 182ms
    ✓ tests/unit/security/csp.test.ts (3 tests) 10ms
    ✓ tests/unit/browserGate.test.tsx (8 tests) 513ms

    Test Files  13 passed (13)
         Tests  187 passed (187)
      Duration  29.53s
   Exit Code: 0
   ```

2. **ESLint Static Analysis**:
   ```
   Command: npm run lint
   Output:
   > dct-app@0.1.0 lint
   > eslint . --max-warnings 0
   Exit Code: 0 (0 errors, 0 warnings)
   ```

3. **TypeScript Strict Typecheck**:
   ```
   Command: npx tsc --noEmit
   Output: (clean output)
   Exit Code: 0
   ```

4. **Vite Production Build**:
   ```
   Command: npm run build
   Output:
   ✓ 33 modules transformed.
   dist/index.html                   0.71 kB │ gzip:  0.42 kB
   dist/assets/index--51Bg6Wc.css    8.49 kB │ gzip:  2.47 kB
   dist/assets/index-D9v9x-Vm.js   144.85 kB │ gzip: 46.70 kB
   ✓ built in 4.21s
   Exit Code: 0
   ```

5. **Python Reference Validator Tests**:
   ```
   Command: python -m unittest tools/test_validate_export.py
   Output:
   ....................
   ----------------------------------------------------------------------
   Ran 20 tests in 0.153s

   OK
   Exit Code: 0
   ```

---

## 2. Logic Chain

1. **Selectability Mathematical Boundary Compliance**:
   - In `src/list/selectability.ts:102`, consent expiry evaluates via `refDate.getTime() >= expDate.getTime()`.
     - Observation: `evaluateSelectability(false, '2026-11-04T06:02:11Z', { referenceTime: '2026-11-04T06:02:11Z' })` returned `isSelectable: false`, `reason: 'expired'`, while `referenceTime: '2026-11-04T06:02:10.999Z'` returned `isSelectable: true`.
     - Inference: Exact-second matches and millisecond offsets behave strictly per Python validator line 188 (`captured >= expires`).
   - In `src/list/selectability.ts:115`, list expiry evaluates via `refDate.getTime() > validUntilDate.getTime()`.
     - Observation: `evaluateSelectability(false, null, { referenceTime: '2026-11-08T04:30:00Z', listValidUntil: '2026-11-08T04:30:00Z' })` returned `isSelectable: true`, while `referenceTime: '2026-11-08T04:30:00.001Z'` returned `isSelectable: false`, `reason: 'list_expired'`.
     - Inference: Exact-second matches behave strictly per Python validator line 191 (`captured > list_valid_until`).

2. **Precedence Hierarchy Enforcement**:
   - In `src/list/selectability.ts:124-130`, primary reason evaluates via:
     `allReasons.includes('minor') ? 'minor' : allReasons.includes('expired') ? 'expired' : allReasons.includes('list_expired') ? 'list_expired' : undefined`.
     - Observation: When a participant has both `is_minor: true` and an expired consent timestamp, `reason` evaluates strictly to `'minor'`, and `allReasons` preserves `['minor', 'expired']`.
     - Inference: AGENTS.md Rule 6 invariant ("Minors, expired consents and expired lists are not selectable") and UI guidance (minor is an absolute gate) are strictly satisfied.

3. **Leap Day and Sub-second Validation**:
   - In `src/list/selectability.ts:7-36`, `isValidIsoUtc` validates calendar dates without rollover.
     - Observation: `2024-02-29T12:00:00Z` and `2000-02-29T00:00:00Z` validated as `true`; `2023-02-29T12:00:00Z`, `2026-02-29T12:00:00Z`, and `1900-02-29T00:00:00Z` were rejected as `false`. Expiry on leap day correctly formats as `"consent expired 29 Feb"`.
     - Inference: Calendar edge cases cannot corrupt date calculations.

4. **Boolean Ingestion and Normalization**:
   - In `src/list/parser.ts:19-26`, `isMinorSchema` trims and parses `"true"` or `"false"` case-insensitively, transforming into native boolean.
     - Observation: CSV values `"TRUE"`, `"True"`, `"FALSE"`, and `"False"` parsed cleanly. Non-boolean values (`"yes"`, `"1"`, `"0"`, `""`) failed Zod validation and yielded `SCHEMA_ERROR` on field `is_minor`.
     - Inference: Malformed boolean values cannot accidentally admit minors as adults.

5. **Sample List Accuracy (`docs/consent-tagging/examples/consented_list.sample.csv`)**:
   - Parsing the real sample list against capture timestamps across all hours of `2026-11-04` (`00:00:00Z`, `06:02:11Z`, `12:00:00Z`, `23:59:59Z`):
     - `totalCount`: exactly 4.
     - `selectableCount`: exactly 2 (Person 001 and Person 002).
     - Non-selectable: exactly 2 (Person 003 with `'expired'` and `"consent expired 3 Nov"`, Person 004 with `'minor'`).
     - Inference: 100% compliance with Acceptance Criteria T-03 and T-04.

6. **Privacy Invariant Canary Audit (AGENTS.md Rule 8)**:
   - Canary markers (`SECRET_CANARY_NAME_XYZ_789`, `CANARY_HINT_42`) were injected into CSV rows.
   - Storage inspection: 0 canary keys or values in `localStorage` or `sessionStorage`.
   - Navigation inspection: 0 canary occurrences in `window.location.href`, `search`, or `hash`.
   - Logging inspection: Spies on `console.log`, `console.info`, `console.warn`, `console.error`, and `console.debug` confirmed 0 canary strings emitted during successful or failed parsing.
   - Error inspection: Error messages for duplicate `person_id` (L04) or row schema errors contained only the `person_id` UUID or line number (`Row 2`), with 0 participant display names or contact hints.
   - Inference: Participant display names and contact hints stay strictly in RAM per AGENTS.md Rule 8.

---

## 3. Caveats

No caveats. All edge cases, boundaries, precedence rules, and privacy invariants have been independently verified through automated tests executing in the project test environment.

---

## 4. Conclusion

Milestone 3 implementation strictly satisfies:
1. Data Contract §2 & §3 (L01–L04 validation parity with `tools/validate_export.py`).
2. Acceptance Criteria T-03 and T-04.
3. AGENTS.md Rule 6 (Selectability gating and precedence) and Rule 8 (Zero-leakage in-memory privacy).
4. Codebase hygiene: 187 tests pass across 13 test suites, ESLint passes with 0 warnings, strict TypeScript passes with 0 errors, Vite production build succeeds, and reference Python tests pass.

**Verdict**: **APPROVE**

---

## 5. Verification Method

To independently verify this assessment:

1. **Run Vitest Test Suite**:
   ```powershell
   npm test
   ```
   Confirms all 13 test files (including `tests/unit/list/adversarial_m3.test.ts`) and all 187 tests pass.

2. **Run ESLint**:
   ```powershell
   npm run lint
   ```
   Confirms 0 errors, 0 warnings under `--max-warnings 0`.

3. **Run TypeScript Strict Check**:
   ```powershell
   npx tsc --noEmit
   ```
   Confirms zero type errors.

4. **Run Vite Production Build**:
   ```powershell
   npm run build
   ```
   Confirms clean production bundle generation.

5. **Run Reference Python Validator Tests**:
   ```powershell
   python -m unittest tools/test_validate_export.py
   ```
   Confirms 20/20 reference tests pass.
