# Milestone 3 Handoff Report: Consented List Loading, Validation & Privacy Invariants

**Author**: `worker_m3`  
**Working Directory**: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\worker_m3`  
**Date**: 2026-11-07  
**Scope**: Milestone 3 of Increment 1 (Consented List Parsing, L01–L04 Validation, Participant Selectability, AGENTS.md Rule 8 In-Memory Privacy Invariants).

---

## 1. Observation

### 1.1 Source Files Created and Modified
All code modifications were strictly restricted to exclusive write ownership:
1. `PROJECT.md` (lines 68–69):
   - Milestone 2 status updated to `'DONE'`.
   - Milestone 3 status updated to `'IN_PROGRESS'`.
2. `src/list/types.ts` (new):
   - Defined `NonSelectableReason`, `ParticipantSelectabilityResult`, `SelectabilityOptions`, `ConsentedPerson`, `ConsentedListResult`, `ListErrorCode`, `ListValidationError`, `LoadListOptions`, and discriminated union `ListParseResult`.
3. `src/list/selectability.ts` (new):
   - Implemented `isValidIsoUtc` strictly matching `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/` with non-rolling calendar date checks.
   - Implemented `formatExpiryDate(date: Date)` returning formatted strings like `"consent expired 3 Nov"`.
   - Implemented `evaluateSelectability(isMinor, consentExpiresAt, options?)` with boundary logic (`>=` for consent expiry, `>` for list expiry) and precedence (`minor` > `expired` > `list_expired`).
4. `src/list/validator.ts` (new):
   - Implemented `validateConsentedList(headers, rows)` enforcing data contract rules L01–L04 in strict short-circuit order with 100% exact message parity with `tools/validate_export.py`.
   - Tolerates extra header columns per data contract §3.
5. `src/list/parser.ts` (new):
   - UTF-8 BOM detection rejecting `\ufeff` early with `"file starts with a byte-order mark; save as UTF-8 without BOM"`.
   - PapaParse configuration (`header: true`, `skipEmptyLines: 'greedy'`, trimmed headers and values).
   - Zod row schema validation with lowercase UUID regex, ISO UTC with `Z` timestamps, and boolean normalization for `is_minor`.
   - `loadConsentedList(csvText, options?)` returning typed `ListParseResult`.
6. `src/list/index.ts` (new):
   - Barrel export of all types, validator functions, selectability evaluation, and CSV parser.
7. `tests/unit/list/selectability.test.ts` (new, 16 tests):
   - Verified sample participants 001–004, exact boundary seconds, sub-second precision, precedence, string booleans, and date format strings.
8. `tests/unit/list/validator.test.ts` (new, 20 tests):
   - Verified negative cases for L01, L02, L03, L04, short-circuit order, and exact error messages.
9. `tests/unit/list/parser.test.ts` (new, 14 tests):
   - Verified loading `docs/consent-tagging/examples/consented_list.sample.csv` (4 people, 2 non-selectable), BOM rejection, RFC 4180 parsing, resume project check, and schema validation.
10. `tests/unit/list/privacy.test.ts` (new, 6 tests):
    - Audited `localStorage`, `sessionStorage`, `IndexedDB`, `window.location`, spied `console.*` methods, and error message text to guarantee zero display names or contact hints are leaked.

### 1.2 Tool Commands & Direct Outputs
1. **Vitest Unit Test Suite**:
   ```
   Command: npm test
   Output:
    ✓ tests/unit/folder/classifier.test.ts (20 tests)
    ✓ tests/unit/list/selectability.test.ts (16 tests)
    ✓ tests/unit/list/validator.test.ts (20 tests)
    ✓ tests/unit/list/parser.test.ts (14 tests)
    ✓ tests/unit/folder/adversarial.test.ts (24 tests)
    ✓ tests/unit/folder/hashing.test.ts (17 tests)
    ✓ tests/unit/folder/adversarial_m2.test.ts (13 tests)
    ✓ tests/unit/list/privacy.test.ts (6 tests)
    ✓ tests/unit/security/csp.test.ts (3 tests)
    ✓ tests/unit/folder/captureTime.test.ts (12 tests)
    ✓ tests/unit/folder/scanner.test.ts (10 tests)
    ✓ tests/unit/browserGate.test.tsx (8 tests)

    Test Files  12 passed (12)
         Tests  163 passed (163)
      Duration  20.92s
   ```
2. **ESLint Static Analysis**:
   ```
   Command: npm run lint
   Output:
   > dct-app@0.1.0 lint
   > eslint . --max-warnings 0
   (exit code 0, 0 errors, 0 warnings)
   ```
3. **TypeScript Strict Typecheck**:
   ```
   Command: npx tsc --noEmit
   Output: (exit code 0, clean output)
   ```
4. **Vite Production Build**:
   ```
   Command: npm run build
   Output:
   ✓ 33 modules transformed.
   dist/index.html                   0.71 kB │ gzip:  0.42 kB
   dist/assets/index--51Bg6Wc.css    8.49 kB │ gzip:  2.47 kB
   dist/assets/index-D9v9x-Vm.js   144.85 kB │ gzip: 46.70 kB
   ✓ built in 3.43s
   (exit code 0)
   ```
5. **Python Reference Validator Tests**:
   ```
   Command: python -m unittest tools/test_validate_export.py
   Output:
   Ran 20 tests in 0.075s
   OK
   (exit code 0)
   ```

---

## 2. Logic Chain

1. **Parity with Python Reference Validator (`tools/validate_export.py`)**:
   - In `tools/validate_export.py:91-108`, `load_list` evaluates rules in exact sequence: L01 (missing columns) -> L02 (single project_id) -> L03 (consistent & valid list_valid_until) -> L04 (duplicate person_ids).
   - In `src/list/validator.ts`, `validateConsentedList` faithfully reproduces this exact short-circuit execution.
   - Verbatim messages:
     - L01: `"consented list is missing columns: <sorted comma-separated list>"`
     - L02: `"consented list must hold exactly one project_id, found <count>"` (e.g. 0 or 2)
     - L03: `"consented list must carry one valid list_valid_until on every row"`
     - L04: `"person_id <id> appears twice in the consented list"`
   - Extra columns in header: Set comparison `REQUIRED_LIST_COLUMNS.filter(c => !headerSet.has(c))` tolerates extra unknown columns without error, matching Python's `LIST_COLUMNS - set(header)`.

2. **Selectability Mathematical Boundaries & Precedence**:
   - Per Python validator line 188 (`captured >= expires`), consent expiry treats exact-second matches as expired (`referenceTime >= consentExpiresAt`).
   - Per Python validator line 191 (`captured > list_valid_until`), list expiry treats exact-second matches as valid (`referenceTime > listValidUntil`).
   - Precedence: Minor status is an absolute legal invariant (`AGENTS.md Rule 6`). When a participant is both a minor and has an expired consent, primary reason is `'minor'` while `allReasons` preserves `['minor', 'expired']`.
   - Evaluation of `docs/consent-tagging/examples/consented_list.sample.csv`:
     - Person 001 (`3f1c...`): adult, no expiry -> selectable.
     - Person 002 (`7a44...`): adult, expires 2027-05-01 -> selectable.
     - Person 003 (`c2d3...`): adult, expired 2026-11-03 -> non-selectable (`'expired'`, `"consent expired 3 Nov"`).
     - Person 004 (`d4e5...`): minor -> non-selectable (`'minor'`).
     - Result: Exactly 4 total, 2 selectable, 2 non-selectable (100% satisfying T-03).

3. **In-Memory Privacy Invariants (`AGENTS.md Rule 8`)**:
   - Rule 8 mandates: "The consented list is never written to browser storage, the progress file, the URL, logs or error messages. The progress file holds identifiers only."
   - In `src/list/parser.ts` and `src/list/validator.ts`, all error messages format only `person_id` (UUID) or row line numbers; participant display names and contact hints are never interpolated into error strings or logs.
   - In `tests/unit/list/privacy.test.ts`, comprehensive automated tests audit `localStorage`, `sessionStorage`, `IndexedDB`, `window.location`, and spied `console.*` invocations to verify zero leakage.

---

## 3. Caveats

1. **Start Screen UI Integration (Milestone 4)**:
   - Milestone 3 implements the data models, parser, validator, selectability engine, and complete unit test suites. Binding `loadConsentedList` into the React UI (`src/ui/StartScreen.tsx`, list status badge, and file input handling) is formally scheduled for Milestone 4.
2. **Start Screen Default Reference Time**:
   - When `loadConsentedList` is invoked without an explicit `referenceTime` (e.g. initial load before any asset is selected), it defaults to `new Date()`. In production and test environments operating in Nov 2026, Person 003 correctly evaluates to expired. In unit tests, passing an explicit `referenceTime` ensures deterministic assertions regardless of wall-clock time.

---

## 4. Conclusion

Milestone 3 is completely implemented, fully tested, and strictly validated:
- `src/list/types.ts`: All domain models and discriminated union `ListParseResult` defined.
- `src/list/selectability.ts`: Minor and expiry evaluations with exact second boundaries and precedence implemented.
- `src/list/validator.ts`: Contract rules L01–L04 with 100% Python validator parity and short-circuit order implemented.
- `src/list/parser.ts`: PapaParse RFC 4180 ingestion, UTF-8 BOM protection, and Zod row schema parsing implemented.
- `src/list/index.ts`: Clean public barrel export created.
- 56 new unit tests across 4 suites in `tests/unit/list/` pass cleanly with zero failures. Total suite count is 163 tests across 12 files.
- Zero ESLint warnings, zero TypeScript errors, clean Vite production build, and all 20 Python validator tests pass.

---

## 5. Verification Method

To independently verify this implementation:

1. **Run Vitest Unit Tests**:
   ```powershell
   npm test
   ```
   (Confirms all 12 test files and 163 tests pass with 0 failures).

2. **Run ESLint (`no-explicit-any: error`)**:
   ```powershell
   npm run lint
   ```
   (Confirms 0 errors, 0 warnings under `--max-warnings 0`).

3. **Run TypeScript Compiler in Strict Mode**:
   ```powershell
   npx tsc --noEmit
   ```
   (Confirms clean typecheck with zero type errors).

4. **Run Vite Production Build**:
   ```powershell
   npm run build
   ```
   (Confirms successful bundle creation in `dist/`).

5. **Run Python Reference Validator Tests**:
   ```powershell
   python -m unittest tools/test_validate_export.py
   ```
   (Confirms 20/20 test cases pass).
