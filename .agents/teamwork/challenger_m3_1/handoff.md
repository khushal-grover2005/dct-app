# Milestone 3 Empirical Challenge Report: Consented List Validation & Parsing

**Agent**: `challenger_m3_1`  
**Role**: `critic`, `specialist` (teamwork_challenger)  
**Working Directory**: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\challenger_m3_1`  
**Date**: 2026-11-07  
**Verdict**: **APPROVE**

---

## 1. Observation

### 1.1 Empirical Test Suite Execution
Created comprehensive stress test suite `tests/unit/list/adversarial_m3.test.ts` (27 tests across 5 challenge dimensions).

1. **Vitest Unit Suite**:
   ```
   Command: npm test
   Output:
    ✓ tests/unit/list/selectability.test.ts (16 tests)
    ✓ tests/unit/list/validator.test.ts (20 tests)
    ✓ tests/unit/list/parser.test.ts (14 tests)
    ✓ tests/unit/list/adversarial_m3.test.ts (27 tests)
    ✓ tests/unit/folder/hashing.test.ts (17 tests)
    ✓ tests/unit/folder/adversarial.test.ts (24 tests)
    ✓ tests/unit/folder/adversarial_m2.test.ts (13 tests)
    ✓ tests/unit/folder/classifier.test.ts (20 tests)
    ✓ tests/unit/list/privacy.test.ts (6 tests)
    ✓ tests/unit/folder/captureTime.test.ts (12 tests)
    ✓ tests/unit/security/csp.test.ts (3 tests)
    ✓ tests/unit/folder/scanner.test.ts (10 tests)
    ✓ tests/unit/browserGate.test.tsx (8 tests)

    Test Files  13 passed (13)
         Tests  190 passed (190)
      Duration  20.96s
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

4. **Python Reference Validator Suite (`tools/validate_export.py`)**:
   ```
   Command: python -m unittest tools/test_validate_export.py
   Output:
   ....................
   ----------------------------------------------------------------------
   Ran 20 tests in 0.075s
   OK
   (exit code 0)
   ```

5. **Production Build**:
   ```
   Command: npm run build
   Output:
   ✓ 33 modules transformed.
   dist/index.html                   0.71 kB │ gzip:  0.42 kB
   dist/assets/index--51Bg6Wc.css    8.49 kB │ gzip:  2.47 kB
   dist/assets/index-D9v9x-Vm.js   144.85 kB │ gzip: 46.70 kB
   ✓ built in 3.40s
   (exit code 0)
   ```

---

## 2. Logic Chain

### 2.1 Challenge 1: Header & Column Enforcement (L01)
- **Observations**:
  - `tests/unit/list/adversarial_m3.test.ts:46-75`: Tested omitting every single column from `REQUIRED_LIST_COLUMNS` individually. In every case, error code is verbatim `'L01'` and message is verbatim `"consented list is missing columns: <col>"`.
  - Tested omitting combinations of 3 columns (`['project_name', 'is_minor', 'consent_expires_at']`). Output was alphabetically sorted: `"consent_expires_at, is_minor, project_name"`.
  - Tested empty header in `validateConsentedList([], [])`: Reported all 10 columns alphabetically sorted.
  - Tested whitespace-padded headers (`"  project_id  "`) and extra unknown columns (`"  extra_notes  "`, `"operator_id"`): Trimming succeeds and extra columns are safely tolerated per data contract §3.
  - Tested arbitrary column order permutations: Succeeded without error.

### 2.2 Challenge 2: Project ID Invariants (L02)
- **Observations**:
  - Zero data rows (valid header only, 0 rows of data): Yielded verbatim `'L02'` with `"consented list must hold exactly one project_id, found 0"`.
  - 2 distinct project IDs: Yielded verbatim `'L02'` with `"consented list must hold exactly one project_id, found 2"`.
  - 3 distinct project IDs: Yielded verbatim `'L02'` with `"consented list must hold exactly one project_id, found 3"`.
  - Mixed valid and empty string `project_id`: Counted as 2 distinct project IDs, yielding `"found 2"` under L02.
  - All rows holding empty string `project_id`: Refused whole by Zod schema validation with `SCHEMA_ERROR` on `project_id` (`"Identifier must be a lowercase UUID"`).
  - Mixed valid and invalid UUID format `project_id`: Yielded `"found 2"` under L02.
  - All rows holding identical invalid UUID (e.g. uppercase UUID): Refused whole via Zod `SCHEMA_ERROR`.

### 2.3 Challenge 3: List Validity Invariants (L03)
- **Observations**:
  - Inconsistent `list_valid_until` across rows: Yielded verbatim `'L03'` with `"consented list must carry one valid list_valid_until on every row"`.
  - Missing `Z` suffix (`2026-11-08T04:30:00`): Yielded verbatim `'L03'`.
  - Local timezone offsets (`+05:30`, `-04:00`, `+00:00`): Yielded verbatim `'L03'`.
  - Non-existent calendar dates (`2026-02-31T00:00:00Z`, `2025-02-29T00:00:00Z`, `2026-04-31T12:00:00Z`, `2026-06-31T12:00:00Z`): Rejected by `isValidIsoUtc` and yielded verbatim `'L03'`.
  - Leap year Feb 29 (`2024-02-29T12:00:00Z`): Successfully accepted.
  - Invalid times (`2026-11-01T25:00:00Z`, `2026-11-01T12:60:00Z`): Rejected by `isValidIsoUtc`.
  - Subsecond timestamps (`2026-11-08T04:30:00.123456Z`): Successfully accepted.

### 2.4 Challenge 4: Duplicate Person Invariants (L04)
- **Observations**:
  - Single duplicated `person_id` (2 occurrences): Yielded 1 `'L04'` error: `"person_id <id> appears twice in the consented list"`.
  - 3x duplicated `person_id` (3 occurrences): Yielded 2 `'L04'` errors, exactly matching Python reference validator behavior (`tools/validate_export.py:106`).
  - Multiple distinct duplicate `person_id`s (P1 and P2 duplicated): Yielded 2 distinct `'L04'` errors (one for P1 and one for P2).
  - Duplicate `consent_id` or duplicate `display_name` with unique `person_id`: Accepted (L04 is strictly scoped to `person_id`).

### 2.5 Challenge 5: Priority Short-Circuit & RFC 4180 Invariants
- **Observations**:
  - Short-circuit precedence verified empirically:
    - L01 halts before L02, L03, L04.
    - L02 halts before L03, L04.
    - L03 halts before L04.
  - UTF-8 BOM Gate: `\ufeff` prefix rejected early with `'BOM_NOT_ALLOWED'` and `"file starts with a byte-order mark; save as UTF-8 without BOM"`.
  - RFC 4180 complex quoting: Quoted commas (`"Smith, John"`), escaped quotes (`"John ""The Runner"" Doe"`), multi-line cell values (`"Line 1\nLine 2"`), and CRLF (`\r\n`) line endings are cleanly parsed.
  - Whole-list refusal guarantee: In every negative scenario, `success: false` and `data: undefined` are returned; zero people are ingested.
  - Trailing empty lines: Greedy whitespace skipping prevents phantom rows or spurious parsing failures.

---

## 3. Caveats

1. **Non-blocking Parser Delimiter Optimization**:
   - In `src/list/parser.ts:97`, `Papa.parse` is currently called without `delimiter: ','`.
   - When a completely empty file (`""`) or whitespace-only file is loaded, PapaParse generates an autodetection warning (`"Unable to auto-detect delimiting character; defaulted to ','"`), which `loadConsentedList` returns as `CSV_PARSE_ERROR` (safely refusing the file whole).
   - In contrast, calling `validateConsentedList([], [])` directly returns `L01` with all 10 missing columns sorted alphabetically.
   - Adding `delimiter: ','` to `Papa.parse` in a future refactor would allow `loadConsentedList("")` to bypass autodetection and yield `L01` directly, aligning with Python's `read_csv`.
   - This does not violate any safety invariant since empty files are strictly refused whole with zero participants ingested.

---

## 4. Conclusion

The Milestone 3 implementation in `src/list/` has been empirically stress-tested against hostile, malformed, and boundary CSV inputs.
All five challenge dimensions (L01 header rules, L02 project constraints, L03 validity date boundaries, L04 duplicate person counting, and priority short-circuiting / RFC 4180 parsing) behave with 100% contract compliance and mathematical precision.
In-memory privacy invariants are rigorously maintained.
All 190 automated tests pass with 0 failures, lint passes with 0 warnings, TypeScript compiles cleanly with 0 errors, and the production bundle builds without issue.

Verdict: **APPROVE**.

---

## 5. Verification Method

To independently reproduce and verify these findings:

```powershell
# 1. Run all vitest unit tests (including 27 adversarial stress tests)
npm test

# 2. Run specifically the Milestone 3 adversarial stress test harness
npx vitest run tests/unit/list/adversarial_m3.test.ts

# 3. Verify zero ESLint warnings
npm run lint

# 4. Verify TypeScript strict typecheck
npx tsc --noEmit

# 5. Verify Python reference validator test suite
python -m unittest tools/test_validate_export.py

# 6. Verify production build
npm run build
```
