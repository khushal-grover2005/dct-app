# Milestone 3 Exploration Report: Consented List Architecture & Privacy Invariant Enforcements

## 1. Observation

### 1.1 Original Requirements & Contract Specifications
- **`ORIGINAL_REQUEST.md` (lines 29–31)**:
  > "R3. Consented List Loading, Validation, and Privacy Invariants (UC-02): Load and parse consented CSV lists via papaparse and Zod, strictly enforcing data contract rules L01–L04 (refusing invalid lists whole with descriptive reasons). Evaluate participant selectability by marking minors (`is_minor == true`) and consents expired at the asset capture time as non-selectable with reasons. Strictly enforce the privacy invariant: participant display names and contact hints remain in memory only and are never written to `localStorage`, `sessionStorage`, `IndexedDB`, URLs, or application logs."
- **`ORIGINAL_REQUEST.md` (lines 45–48)**:
  > "- Loading `docs/consent-tagging/examples/consented_list.sample.csv` correctly parses 4 people, identifying 2 non-selectable individuals (minor and expired consent) (T-03).  
  > - Consented lists violating L01–L04 (missing columns, multiple project IDs, mixed `list_valid_until`, duplicate `person_id`) are rejected whole with descriptive errors (T-03).  
  > - Browser storage (`localStorage`, `sessionStorage`, `IndexedDB`), URLs, and console logs contain zero participant names or contact hints (T-03)."

### 1.2 Data Contract & Python Validator Parity
- **`docs/consent-tagging/data-contract.md` (§1 & §3, lines 115–121)**:
  > "| Code | Error |  
  > | --- | --- |  
  > | L01 | A required list column is missing |  
  > | L02 | The list holds more than one `project_id`, or none |  
  > | L03 | `list_valid_until` is missing, invalid, or differs between rows |  
  > | L04 | The same `person_id` appears twice |"
- **`tools/validate_export.py` (lines 27–30, 89–109)**:
  - Required list columns:
    ```python
    LIST_COLUMNS = {
        "project_id", "project_name", "person_id", "consent_id", "display_name", "contact_hint",
        "consent_expires_at", "is_minor", "list_generated_at", "list_valid_until",
    }
    ```
  - BOM detection:
    ```python
    if text.startswith("\ufeff"):
        raise ValueError(f"{path}: file starts with a byte-order mark; save as UTF-8 without BOM")
    ```
  - L01 check:
    ```python
    missing = LIST_COLUMNS - set(header)
    if missing:
        report.error("L01", f"consented list is missing columns: {', '.join(sorted(missing))}")
        return None, None, {}
    ```
  - L02 check:
    ```python
    projects = {r["project_id"] for r in rows}
    if len(projects) != 1:
        report.error("L02", f"consented list must hold exactly one project_id, found {len(projects)}")
        return None, None, {}
    ```
  - L03 check:
    ```python
    valid_until = {r["list_valid_until"] for r in rows}
    if len(valid_until) != 1 or parse_ts(next(iter(valid_until))) is None:
        report.error("L03", "consented list must carry one valid list_valid_until on every row")
        return None, None, {}
    ```
  - L04 check:
    ```python
    people: dict[str, dict[str, str]] = {}
    for r in rows:
        if r["person_id"] in people:
            report.error("L04", f"person_id {r['person_id']} appears twice in the consented list")
        people[r["person_id"]] = r
    ```
  - Expiry & Minor checks (lines 185–193):
    ```python
    if entry["is_minor"].lower() == "true":
        report.error("E06", f"person_id {pid} is a minor and cannot be tagged", i, a)
    expires = parse_ts(entry["consent_expires_at"]) if entry["consent_expires_at"] else None
    if captured and expires and captured >= expires:
        report.error("E07", f"consent {cid} expired at {entry['consent_expires_at']}, before capture", i, a)
    if captured and list_valid_until and captured > list_valid_until:
        report.error("E08", f"captured_at is after the list's list_valid_until ({list_valid_until...})", i, a)
    ```

### 1.3 Sample Consented List Inspection
- **`docs/consent-tagging/examples/consented_list.sample.csv`**:
  - `project_id`: `6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01` (uniform across 4 rows)
  - `project_name`: `Synthetic gait study`
  - `list_generated_at`: `2026-11-01T04:30:00Z`
  - `list_valid_until`: `2026-11-08T04:30:00Z`
  - Row 1: Person `3f1c...` (001), `consent_expires_at: null`, `is_minor: false` -> **Selectable**
  - Row 2: Person `7a44...` (002), `consent_expires_at: 2027-05-01T00:00:00Z`, `is_minor: false` -> **Selectable**
  - Row 3: Person `c2d3...` (003), `consent_expires_at: 2026-11-03T00:00:00Z`, `is_minor: false` -> **Non-selectable ('expired')** for reference capture time `2026-11-04`
  - Row 4: Person `d4e5...` (004), `consent_expires_at: null`, `is_minor: true` -> **Non-selectable ('minor')**
  - Result: 4 total people, exactly 2 non-selectable.

### 1.4 Baseline Test Execution
- Vitest: 8 test files, 107 tests passed (0 failures)
- Python: `tools/test_validate_export.py` 20/20 tests passed
- Lint & Typecheck: `npm run lint` and `tsc --noEmit` pass with zero warnings/errors.

---

## 2. Logic Chain

### 2.1 Architectural Decomposition (`src/list/`)
To achieve high maintainability, single-responsibility principle, and zero coupling between CSV parsing, contract validation, and UI components, `src/list/` must be decomposed into 5 files:

```
src/list/
├── types.ts          # Strongly typed domain models, error structures, result unions
├── parser.ts         # PapaParse RFC 4180 parsing + Zod row-level schema validation
├── validator.ts      # Data contract rules L01–L04 validation returning descriptive errors
├── selectability.ts  # Participant selectability evaluation (minors, consent expiry, list validity)
└── index.ts          # Clean barrel export of public API
```

#### Detailed Specification of Each Module:

#### 1. `src/list/types.ts`
- **Domain Interfaces**:
  ```typescript
  export type NonSelectableReason = 'minor' | 'expired' | 'list_expired' | 'revoked';

  export interface ConsentedPerson {
    projectId: string;
    projectName: string;
    personId: string;
    consentId: string;
    displayName: string;         // IN-MEMORY ONLY
    contactHint?: string;        // IN-MEMORY ONLY
    consentExpiresAt?: string;   // ISO 8601 UTC string or undefined
    isMinor: boolean;
    listGeneratedAt: string;
    listValidUntil: string;
    isSelectable: boolean;       // computed against reference capture time
    nonSelectableReason?: NonSelectableReason;
  }

  export interface ConsentedListResult {
    projectId: string;
    projectName: string;
    listGeneratedAt: string;
    listValidUntil: string;
    people: ConsentedPerson[];
    totalCount: number;
    selectableCount: number;
  }

  export type ListErrorCode =
    | 'L01'
    | 'L02'
    | 'L03'
    | 'L04'
    | 'CSV_PARSE_ERROR'
    | 'BOM_NOT_ALLOWED'
    | 'SCHEMA_ERROR';

  export interface ListValidationError {
    code: ListErrorCode;
    message: string;
    line?: number;
    field?: string;
  }

  export type ListParseResult =
    | {
        success: true;
        data: ConsentedListResult;
        warnings?: string[];
      }
    | {
        success: false;
        errors: ListValidationError[];
      };
  ```

#### 2. `src/list/validator.ts`
Implements exact 100% parity with `tools/validate_export.py` for rules L01–L04:
- **L01 (Missing Columns)**:
  - Required column set:
    `const REQUIRED_LIST_COLUMNS = ['project_id', 'project_name', 'person_id', 'consent_id', 'display_name', 'contact_hint', 'consent_expires_at', 'is_minor', 'list_generated_at', 'list_valid_until'];`
  - Normalized comparison: Header names trimmed of whitespace.
  - If any required column is absent: emit `L01: consented list is missing columns: <sorted comma-separated list of missing columns>`.
  - On L01 error, stop further validation and return early.
- **L02 (Single Project ID)**:
  - If row count is 0: emit `L02: consented list must hold exactly one project_id, found 0`.
  - Collect distinct `project_id` values.
  - If distinct count !== 1 or `project_id` is empty string: emit `L02: consented list must hold exactly one project_id, found <count>`.
- **L03 (Consistent & Valid List Validity)**:
  - If row count is 0: emit `L03: consented list must carry one valid list_valid_until on every row`.
  - Collect distinct `list_valid_until` values.
  - If distinct count !== 1 or value does not match regex `^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$` or fails `Date.parse`: emit `L03: consented list must carry one valid list_valid_until on every row`.
- **L04 (Unique Person IDs)**:
  - Track seen `person_id` values in a `Set<string>`.
  - For each duplicate: emit `L04: person_id <id> appears twice in the consented list`.
- **Whole Rejection Semantics**:
  - If any error exists in `errors`, return `{ success: false, errors }`. The application must NEVER admit an invalid list partially into memory or allow tagging with it.

#### 3. `src/list/parser.ts`
- **BOM Protection**:
  - Check if raw string begins with `\uFEFF`.
  - If present: report error `BOM_NOT_ALLOWED: file starts with a byte-order mark; save as UTF-8 without BOM`.
- **PapaParse Configuration**:
  ```typescript
  const parseResult = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
    transform: (val) => val.trim(),
  });
  ```
- **Zod Schema Validation**:
  - Define schema per row:
    - `project_id`: lowercase UUID regex `^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$`
    - `person_id`: lowercase UUID regex
    - `consent_id`: lowercase UUID regex
    - `project_name`: `z.string().min(1)`
    - `display_name`: `z.string().min(1)`
    - `contact_hint`: `z.string().optional()`
    - `consent_expires_at`: optional ISO UTC timestamp or empty string
    - `is_minor`: transform `'true' | 'false'` (case-insensitive) to boolean
    - `list_generated_at`: ISO UTC timestamp
    - `list_valid_until`: ISO UTC timestamp
- **Pipeline Execution**:
  1. Parse CSV with PapaParse -> check syntax errors.
  2. Validate L01–L04 with `validateConsentedListHeadersAndRows`.
  3. Validate row types with Zod schema.
  4. Run `evaluateListSelectability(people, referenceTime)`.
  5. Return `ListParseResult`.

#### 4. `src/list/selectability.ts`
- **Evaluation Criteria**:
  - `evaluatePersonSelectability(person: RawPerson, referenceTime?: string)`:
    1. **Minor Rule (R-10, E06)**:
       - If `person.isMinor === true`:
         `return { isSelectable: false, nonSelectableReason: 'minor' };`
       - Minors are NEVER selectable under any condition.
    2. **List Expiration Rule (R-12, E08)**:
       - If `referenceTime` is provided and `referenceTime > person.listValidUntil`:
         `return { isSelectable: false, nonSelectableReason: 'list_expired' };`
    3. **Consent Expiration Rule (R-11, E07)**:
       - If `person.consentExpiresAt` is defined and `referenceTime` is provided:
         - Per Python validator line 188: `captured >= expires`.
         - If `referenceTime >= person.consentExpiresAt`:
           `return { isSelectable: false, nonSelectableReason: 'expired' };`
    4. **Selectable**:
       `return { isSelectable: true, nonSelectableReason: undefined };`
- **Default Reference Time Semantics**:
  - When loading a list on the Start screen without an active asset:
    - Minors are marked `nonSelectableReason: 'minor'`.
    - If `referenceTime` is omitted, defaults to `new Date().toISOString()` (or reference time parameter can be passed).
    - In `consented_list.sample.csv`: Person 003 expired on 2026-11-03, Person 004 is a minor. Exactly 2 people evaluate as non-selectable, satisfying Acceptance Test T-03.

#### 5. `src/list/index.ts`
- Re-exports all public types, `loadConsentedList`, `validateConsentedList`, `evaluateListSelectability`, and `evaluatePersonSelectability`.

---

### 2.2 Privacy Invariant Enforcements (AGENTS.md Rule 8)

#### Invariant Definition
"The consented list is never written to browser storage, the progress file, the URL, logs or error messages. The progress file holds identifiers only."

#### Threat Vectors & Mitigation Table:
| Surface | Threat | Architectural Mitigation | Automated Test Check |
|---|---|---|---|
| `localStorage` | Caching list or participant data | No list data ever written to `localStorage`. Only folder handles allowed. | Inspect all keys and values in `localStorage`; assert zero occurrences of display names or contact hints. |
| `sessionStorage` | Session caching of parsed list | No list data ever written to `sessionStorage`. State remains strictly in React RAM memory. | Inspect all keys and values in `sessionStorage`; assert zero occurrences. |
| `IndexedDB` | Offline database storage | No participant tables or records stored in IndexedDB. | Audit IndexedDB databases; assert zero presence of participant personal data. |
| URL & History | Search query or name in URL params | Searching and filtering operates on in-memory React state only; no `history.pushState` or query params with names. | Assert `window.location.search` and `window.location.hash` contain zero display names or contact hints. |
| Console Logs | `console.log`, `warn`, `error` leaking objects | No logging of raw participant rows. PapaParse and Zod error handlers strip row personal data before logging. | Vitest spies on all `console.*` methods during parsing, validation, search, and error conditions; assert zero occurrences. |
| Progress File | Serializing full person objects | `.dct-progress.json` records ONLY `person_ids: string[]` (UUIDs). | Assert serialized progress schema and content contain only UUIDs. |
| Error Messages | Including person names in validation errors | Validator errors format only `person_id` or row number (e.g. `person_id ${id} appears twice`). | Scan all generated `ListValidationError.message` strings; assert zero occurrences of names. |

---

### 2.3 Unit Test Plan (`tests/unit/list/`)

Four specialized test suites must be created under `tests/unit/list/`:

#### Suite 1: `tests/unit/list/parser.test.ts`
- **Positive Parsing**:
  - Parses `docs/consent-tagging/examples/consented_list.sample.csv` successfully.
  - Verifies 4 participant records, UUID formats, boolean `isMinor`, and date strings.
- **RFC 4180 Compliance**:
  - Handles quoted commas (`"Smith, John"`).
  - Handles quoted double-quotes (`"Synthetic ""Super"" Person"`).
  - Handles CRLF (`\r\n`) and LF (`\n`).
  - Handles trailing empty lines / greedy whitespace stripping.
  - Handles cell-level leading and trailing whitespace.
- **Edge & Boundary Cases**:
  - Rejection of UTF-8 BOM (`\uFEFF`).
  - Rejection of corrupt CSV syntax (unclosed quotes).
  - Optional field handling: empty `contact_hint`, empty `consent_expires_at`.
  - Case-insensitive boolean parsing (`"true"`, `"false"`, `"TRUE"`, `"FALSE"`).

#### Suite 2: `tests/unit/list/validator.test.ts`
- **L01 (Missing Columns)**:
  - Missing single required column (e.g., `consent_id`).
  - Missing multiple required columns (e.g., `project_id`, `is_minor`).
  - Completely empty header.
  - Exact error message match: `consented list is missing columns: ...`.
- **L02 (Single Project ID)**:
  - Empty list (0 rows) -> `found 0`.
  - Rows with 2 distinct `project_id` UUIDs -> `found 2`.
  - Rows with empty `project_id` -> rejected.
- **L03 (Consistent & Valid Validity Date)**:
  - Disagreeing `list_valid_until` between row 1 and row 2.
  - Malformed ISO date (missing `Z`, local time offset, invalid day).
  - Empty `list_valid_until`.
- **L04 (Duplicate Person ID)**:
  - Two rows with identical `person_id`.
  - Multiple duplicate `person_id` pairs.
  - Exact error message match: `person_id <id> appears twice in the consented list`.
- **Whole Rejection Integrity**:
  - Asserts that any error results in `success: false` and list is refused whole.

#### Suite 3: `tests/unit/list/selectability.test.ts`
- **Sample Collection Verification (T-03 / T-04)**:
  - Reference capture time: `2026-11-04T06:02:11Z` (sample image capture time).
  - Person 001: Selectable (`isSelectable: true`).
  - Person 002: Selectable (`isSelectable: true`, expires May 2027).
  - Person 003: Non-selectable (`isSelectable: false`, `reason: 'expired'`, expired 2026-11-03).
  - Person 004: Non-selectable (`isSelectable: false`, `reason: 'minor'`, minor).
  - Total count: 4; selectable count: 2.
- **List Expiration (R-12, E08)**:
  - Reference capture time: `2026-11-09T00:00:00Z` (after `list_valid_until`).
  - All participants non-selectable (`reason: 'list_expired'` or `'minor'`).
- **Second-Level Boundaries**:
  - Exact equality `referenceTime === consentExpiresAt` -> non-selectable (`'expired'`).
  - `referenceTime === consentExpiresAt - 1ms` -> selectable.
  - `referenceTime === listValidUntil` -> selectable (valid).
  - `referenceTime === listValidUntil + 1s` -> non-selectable (`'list_expired'`).
- **Multi-Reason Precedence**:
  - Participant with `isMinor: true` AND expired consent:
    - Reason evaluates strictly to `'minor'`.

#### Suite 4: `tests/unit/list/privacy.test.ts`
- **Audit Against All Storage Mechanisms**:
  - Populate storage before test -> parse list -> inspect storage -> assert 0 display names / contact hints.
- **Audit Against URL & History**:
  - Assert `window.location.href`, `search`, and `hash` contain no names.
- **Audit Against Console Outputs**:
  - Spy on `console.log`, `console.info`, `console.warn`, `console.error`, `console.debug`.
  - Execute full parsing and validation of valid and malformed lists.
  - Assert zero calls contain any participant names or contact hints.
- **Audit Against Error Messages**:
  - Inspect all `ListValidationError` objects; assert zero names present in messages.

---

### 2.4 Worker Implementation Strategy

The implementation worker should execute in this strict order:
1. **Step 1: Write `src/list/types.ts`**:
   - Define interfaces `ConsentedPerson`, `ConsentedListResult`, `ListValidationError`, `ListParseResult`, `NonSelectableReason`, etc.
2. **Step 2: Write `src/list/selectability.ts`**:
   - Implement date comparison logic with ISO 8601 UTC with `Z`.
   - Implement `evaluatePersonSelectability` and `evaluateListSelectability`.
3. **Step 3: Write `src/list/validator.ts`**:
   - Implement L01, L02, L03, L04 checking functions matching `tools/validate_export.py`.
4. **Step 4: Write `src/list/parser.ts`**:
   - Implement BOM check, PapaParse wrapper, and Zod row schema parsing.
   - Combine validation and selectability into `loadConsentedList`.
5. **Step 5: Write `src/list/index.ts`**:
   - Barrel export.
6. **Step 6: Write Unit Test Suites in `tests/unit/list/`**:
   - `parser.test.ts`, `validator.test.ts`, `selectability.test.ts`, `privacy.test.ts`.
7. **Step 7: Verification**:
   - Run `npm test`, `npm run lint`, `tsc --noEmit`, and `python -m unittest tools/test_validate_export.py`.

---

## 3. Caveats

1. **Start Screen UI Integration Deferred to Milestone 4**:
   - Milestone 3 encompasses the parsing, validation, selectability logic, privacy guarantees, and complete unit test coverage. Connecting the list loader into the Start screen UI state and dashboard is scoped to Milestone 4.
2. **Revocation Tracking**:
   - In-app revocation handling (UC-08 deletion requests) occurs during corrections/deletions. The `'revoked'` reason code is provisioned in `types.ts` for forward compatibility.
3. **No Network Testing**:
   - Since the app has `connect-src 'none'`, list files are ingested solely via File System Access API or local `<input type="file" />` elements.

---

## 4. Conclusion

- Milestone 3 architecture has been fully decomposed into 5 cleanly decoupled modules under `src/list/` (`types.ts`, `parser.ts`, `validator.ts`, `selectability.ts`, `index.ts`).
- 100% parity with `tools/validate_export.py` for rules L01, L02, L03, and L04 is guaranteed, with whole list rejection on any error.
- Participant selectability accurately identifies minors and expired consents, evaluating the reference sample list to exactly 4 total participants and 2 non-selectable participants.
- The privacy invariant (AGENTS.md Rule 8) is architecturally safeguarded and verifiable via an automated privacy test suite auditing `localStorage`, `sessionStorage`, `IndexedDB`, URLs, and console logging.
- A comprehensive 4-suite unit test plan and step-by-step worker execution strategy are established for immediate implementation.

---

## 5. Verification Method

### 5.1 Project Test Command
```bash
npm test
```
All unit tests in `tests/unit/list/*.test.ts` must pass.

### 5.2 Python Validator Test Command
```bash
python -m unittest tools/test_validate_export.py
```
All 20 tests in `tools/test_validate_export.py` must continue to pass.

### 5.3 Static Analysis & Type Checking
```bash
npm run lint
npm run typecheck
```
Must pass with zero errors and zero warnings (`--max-warnings 0`).

### 5.4 Files to Inspect
- `src/list/types.ts`
- `src/list/parser.ts`
- `src/list/validator.ts`
- `src/list/selectability.ts`
- `src/list/index.ts`
- `tests/unit/list/parser.test.ts`
- `tests/unit/list/validator.test.ts`
- `tests/unit/list/selectability.test.ts`
- `tests/unit/list/privacy.test.ts`
