# Milestone 3 Review & Adversarial Audit Report

**Author**: `reviewer_m3_1` (Role: Reviewer, Adversarial Critic)  
**Target Milestone**: Increment 1, Milestone 3 (Consented List Parsing, L01–L04 Validation, Selectability & Privacy Invariants)  
**Working Directory**: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\reviewer_m3_1`  
**Date**: 2026-11-07  
**Verdict**: **APPROVE**

---

## 1. Observation

### 1.1 Implementation Architecture and Code Inspection
The Milestone 3 deliverables were inspected across `src/list/` and `tests/unit/list/`:

1. **`src/list/types.ts`**:
   - Defined domain model types (`ConsentedPerson`, `ConsentedListResult`, `ParticipantSelectabilityResult`, `NonSelectableReason`, `ListValidationError`, `LoadListOptions`).
   - Defined discriminated union `ListParseResult` (`success: true` with `data: ConsentedListResult` vs. `success: false` with `errors: ListValidationError[]`).
   - Enforces privacy comments highlighting `AGENTS.md Rule 8` in-memory-only constraints for `displayName` and `contactHint`.

2. **`src/list/validator.ts`**:
   - `REQUIRED_LIST_COLUMNS` lines 4–15: Exactly 10 columns matching data contract §1 and `tools/validate_export.py:LIST_COLUMNS`.
   - Rule L01 (lines 34–44): Computes missing columns via `REQUIRED_LIST_COLUMNS.filter(col => !headerSet.has(col)).sort()`. Missing columns are sorted alphabetically. Extra columns in header are preserved without error.
   - Rule L02 (lines 46–55): Extracts distinct `project_id` values. If `projects.size !== 1`, reports verbatim Python validator error: `"consented list must hold exactly one project_id, found <count>"`.
   - Rule L03 (lines 57–67): Extracts distinct `list_valid_until` values. If `validUntilSet.size !== 1` or `!isValidIsoUtc(firstValidUntil)`, reports verbatim Python validator error: `"consented list must carry one valid list_valid_until on every row"`.
   - Rule L04 (lines 69–84): Tracks seen `person_id`s in a `Set<string>`. For any duplicate, reports verbatim Python validator error: `"person_id <id> appears twice in the consented list"`.
   - Sequential short-circuiting: L01 -> L02 -> L03 -> L04.

3. **`src/list/selectability.ts`**:
   - `isValidIsoUtc` (lines 13–36): Validates string against `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/`, verifies `Date.getTime()`, and performs non-rolling calendar date verification (rejecting rollover dates such as `2026-02-29T...` and `2026-04-31T...`).
   - `formatExpiryDate` (lines 57–61): Formats date as `"consent expired <day> <month>"` (e.g. `"consent expired 3 Nov"`, conforming to `app-design.md` §2.2).
   - `evaluateSelectability` (lines 76–150):
     - Boundary checks: `referenceTime >= consentExpiresAt` (operator `>=` matching `tools/validate_export.py` line 188) and `referenceTime > listValidUntil` (operator `>` matching `tools/validate_export.py` line 191).
     - Precedence hierarchy: `minor` > `expired` > `list_expired`.
     - Returns `isSelectable`, primary `reason`, `allReasons`, and human-readable `formattedReason`.

4. **`src/list/parser.ts`**:
   - BOM Gate (lines 84–94): Rejects `\ufeff` prefix before CSV parsing with exact message: `"file starts with a byte-order mark; save as UTF-8 without BOM"`.
   - PapaParse configuration (lines 97–102): `header: true`, `skipEmptyLines: 'greedy'`, `transformHeader: (h) => h.trim()`, `transform: (val) => val.trim()`.
   - L01–L04 execution (lines 120–126): Invokes `validateConsentedList` and halts immediately on rule failure.
   - Resume check (lines 128–140): Validates matching `expectedProjectId`, emitting `RESUME_MISMATCH` if progress collection project differs.
   - Zod row validation (lines 47–60, 142–168): Uses `.passthrough()` for extra columns. Validates lowercase UUID v4, trimmed non-empty `project_name` and `display_name`, case-insensitive boolean string for `is_minor`, and ISO 8601 UTC with 'Z' timestamps.
   - Selectability evaluation (lines 171–196): Maps all rows with in-memory selectability state.

5. **`src/list/index.ts`**: Clean barrel export of all module interfaces and functions.

### 1.2 Independent Command Verification Results
The test and build commands were independently executed in the environment:

1. **Vitest Unit Test Suite**:
   ```powershell
   npm test
   ```
   Output:
   ```
   ✓ tests/unit/folder/classifier.test.ts (20 tests)
   ✓ tests/unit/list/selectability.test.ts (16 tests)
   ✓ tests/unit/list/validator.test.ts (20 tests)
   ✓ tests/unit/list/parser.test.ts (14 tests)
   ✓ tests/unit/folder/adversarial.test.ts (24 tests)
   ✓ tests/unit/folder/hashing.test.ts (17 tests)
   ✓ tests/unit/folder/adversarial_m2.test.ts (13 tests)
   ✓ tests/unit/list/privacy.test.ts (6 tests)
   ✓ tests/unit/folder/captureTime.test.ts (12 tests)
   ✓ tests/unit/security/csp.test.ts (3 tests)
   ✓ tests/unit/folder/scanner.test.ts (10 tests)
   ✓ tests/unit/browserGate.test.tsx (8 tests)

   Test Files  12 passed (12)
        Tests  163 passed (163)
     Duration  20.08s
   ```

2. **Specific List Module Suite (including M3 Adversarial Harness)**:
   ```powershell
   npx vitest run tests/unit/list
   ```
   Output:
   ```
   ✓ tests/unit/list/selectability.test.ts (16 tests)
   ✓ tests/unit/list/validator.test.ts (20 tests)
   ✓ tests/unit/list/privacy.test.ts (6 tests)
   ✓ tests/unit/list/parser.test.ts (14 tests)
   ✓ tests/unit/list/adversarial_m3.test.ts (24 tests)

   Test Files  5 passed (5)
        Tests  80 passed (80)
   ```

3. **ESLint Static Analysis**:
   ```powershell
   npm run lint
   ```
   Output: Exit code 0, 0 errors, 0 warnings (`eslint . --max-warnings 0`).

4. **TypeScript Strict Type Check**:
   ```powershell
   npx tsc --noEmit
   ```
   Output: Exit code 0, clean output with zero type errors.

5. **Vite Production Build**:
   ```powershell
   npm run build
   ```
   Output: Built successfully in 1.13s (33 modules transformed into `dist/`).

6. **Python Reference Validator Tests**:
   ```powershell
   python -m unittest tools/test_validate_export.py
   ```
   Output: Ran 20 tests in 0.180s, OK (exit code 0).

7. **Playwright E2E Test Suite**:
   ```powershell
   npm run e2e
   ```
   Output: 30 passed, 4 skipped across Chromium and Firefox (exit code 0).

### 1.3 Integrity & Anti-Cheat Audit
A search was performed across `src/list/` for sample participant names (`Synthetic Person 001`…), sample project IDs (`6f1c2a8e...`), sample person IDs (`3f1c9d2a...`), or hardcoded bypasses:
- Grep search for sample IDs and strings yielded **zero results** in `src/list/`.
- Dynamic tests with arbitrary UUIDs, non-sample participant names, and 5,000 synthetic rows verified that parsing and validation logic executes completely dynamically with zero hardcoded lookup tables.

---

## 2. Logic Chain

1. **Data Contract Rules L01–L04 Parity**:
   - Observation: In `src/list/validator.ts`, the checks evaluate L01 (missing required columns), L02 (single `project_id`), L03 (consistent & valid `list_valid_until`), and L04 (duplicate `person_id`).
   - Inference: Because the function returns immediately when an earlier rule fails, short-circuit order is guaranteed (verified by `tests/unit/list/validator.test.ts` lines 224–262 and adversarial tests 7A–7D).
   - Inference: Error strings match verbatim with `tools/validate_export.py` lines 91–108, ensuring 100% interoperability with the reference validator.

2. **RFC 4180 Ingestion & BOM Protection**:
   - Observation: `loadConsentedList` checks `csvText.startsWith('\ufeff')` as its very first operation and returns `{ success: false, errors: [{ code: 'BOM_NOT_ALLOWED', ... }] }`.
   - Observation: PapaParse operates with `header: true`, `skipEmptyLines: 'greedy'`, and header/value trimming.
   - Inference: Multiline quoted strings containing embedded newlines and quotes (RFC 4180) are parsed without splitting rows prematurely, while whitespace-only lines and trailing blank lines are safely stripped without generating phantom empty rows.

3. **Mathematical Precision of Selectability**:
   - Observation: `tools/validate_export.py` line 188 checks `captured >= expires`, while line 191 checks `captured > list_valid_until`.
   - Observation: `src/list/selectability.ts` applies `refDate.getTime() >= expDate.getTime()` for consent expiration and `refDate.getTime() > validUntilDate.getTime()` for list expiration.
   - Inference: Exact-second comparisons adhere to the specification down to millisecond precision (`2026-11-04T06:02:11.000Z` vs `.001Z`).
   - Inference: When evaluated against `consented_list.sample.csv` at `2026-11-04T06:02:11Z`, Person 001 and 002 are selectable, Person 003 is non-selectable (`'expired'`), and Person 004 is non-selectable (`'minor'`), producing exactly 4 total and 2 selectable (100% satisfying acceptance test T-03).

4. **In-Memory Privacy Invariants (AGENTS.md Rule 8)**:
   - Observation: `src/list/validator.ts` and `src/list/parser.ts` construct error messages containing only UUIDs, line numbers, or column names; `displayName` and `contactHint` are never interpolated into errors.
   - Observation: Automated canary stress tests (`tests/unit/list/adversarial_m3.test.ts` lines 331–454) injected `SECRET_CANARY_NAME_XYZ_789` and `CANARY_HINT_42` into valid and invalid CSVs and proved 0 occurrences in `localStorage`, `sessionStorage`, `IndexedDB`, `window.location`, console methods, and error output.
   - Inference: Participant personal identifiers are strictly confined to volatile RAM, fulfilling AGENTS.md Rule 8.

5. **Performance and Scaling**:
   - Observation: Adversarial benchmark with 5,000 synthetic rows completed in 104 ms.
   - Inference: Parser and validation complexity is strictly O(N) in participant count, well within responsive browser UI budgets.

---

## 3. Caveats

1. **Start Screen UI Data Binding**:
   - Milestone 3 specifies and implements the data models, parser, validator, selectability engine, and unit test suites.
   - Connecting `loadConsentedList` to React components (`StartScreen.tsx`, list status badge, and file input event listener) is formally assigned to Milestone 4.
2. **Default Reference Time Assumption**:
   - If `referenceTime` is omitted when invoking `loadConsentedList`, it defaults to `new Date()`. When tagging collections in the workspace, UI callers should pass the asset capture time to ensure correct evaluation of time-sensitive consents.

---

## 4. Conclusion

Milestone 3 is implemented to high standards with zero integrity violations, full specification conformance, robust error handling, and complete test verification.

### Verdict
**APPROVE**

---

## 5. Verification Method

To independently reproduce the review findings:

1. **Run All Unit Tests**:
   ```powershell
   npm test
   ```
   (Confirms 12 test files and 163 tests pass with 0 failures).

2. **Run Milestone 3 Test Suite**:
   ```powershell
   npx vitest run tests/unit/list
   ```
   (Confirms all 5 list test files and 80 tests pass).

3. **Run Static Linters & Strict Typecheck**:
   ```powershell
   npm run lint
   npx tsc --noEmit
   ```
   (Confirms zero ESLint warnings and zero TypeScript errors).

4. **Run Production Build**:
   ```powershell
   npm run build
   ```
   (Confirms successful Vite static bundle generation).

5. **Run Python Reference Validator**:
   ```powershell
   python -m unittest tools/test_validate_export.py
   ```
   (Confirms 20/20 test cases pass).

6. **Run Playwright E2E Tests**:
   ```powershell
   npm run e2e
   ```
   (Confirms 30 passed, 4 skipped across Chromium and Firefox).
