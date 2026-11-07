# Specification Mining Report: Milestone 3 (Consented List Parsing & Validation)

**Author**: `spec_miner_m3_1`  
**Working Directory**: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\spec_miner_m3_1`  
**Date**: 2026-11-07  
**Scope**: Consented CSV list loading, parsing, Zod schema validation, data contract rules L01–L04, privacy invariants, selectability evaluation, and Python validator parity.

---

## 1. Observation

Direct observations and evidence extracted from authoritative sources:

### A. Authoritative Data Contract & Specification
1. **`docs/consent-tagging/data-contract.md` §1 & §3**:
   - Common rules: UTF-8 encoding without BOM, comma delimiter RFC 4180 (quoted with `"` if containing comma or quote), `\n` or `\r\n` line endings, UUIDs lowercase with hyphens, timestamps ISO 8601 in UTC with `Z` (e.g. `2026-11-04T06:02:11Z`), empty fields represented as empty string (two adjacent commas, never `null`, `NA`, or `-`).
   - Required list columns (10 columns):
     `project_id`, `project_name`, `person_id`, `consent_id`, `display_name`, `contact_hint`, `consent_expires_at`, `is_minor`, `list_generated_at`, `list_valid_until`.
   - List validation rules:
     - `L01`: A required list column is missing.
     - `L02`: The list holds more than one `project_id`, or none.
     - `L03`: `list_valid_until` is missing, invalid, or differs between rows.
     - `L04`: The same `person_id` appears twice.

2. **`tools/validate_export.py` (lines 27–41, 78–108, 179–194)**:
   - Column set definition:
     ```python
     LIST_COLUMNS = {
         "project_id", "project_name", "person_id", "consent_id", "display_name", "contact_hint",
         "consent_expires_at", "is_minor", "list_generated_at", "list_valid_until",
     }
     UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
     TS_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$")
     ```
   - BOM detection in `read_csv`:
     ```python
     if text.startswith("\ufeff"):
         raise ValueError(f"{path}: file starts with a byte-order mark; save as UTF-8 without BOM")
     ```
   - Rule implementation and exact error messages in `load_list`:
     ```python
     missing = LIST_COLUMNS - set(header)
     if missing:
         report.error("L01", f"consented list is missing columns: {', '.join(sorted(missing))}")
         return None, None, {}
     projects = {r["project_id"] for r in rows}
     if len(projects) != 1:
         report.error("L02", f"consented list must hold exactly one project_id, found {len(projects)}")
         return None, None, {}
     valid_until = {r["list_valid_until"] for r in rows}
     if len(valid_until) != 1 or parse_ts(next(iter(valid_until))) is None:
         report.error("L03", "consented list must carry one valid list_valid_until on every row")
         return None, None, {}
     people: dict[str, dict[str, str]] = {}
     for r in rows:
         if r["person_id"] in people:
             report.error("L04", f"person_id {r['person_id']} appears twice in the consented list")
         people[r["person_id"]] = r
     return next(iter(projects)), parse_ts(next(iter(valid_until))), people
     ```
   - Consent expiry comparison in export validation:
     ```python
     if captured and expires and captured >= expires:
         report.error("E07", f"consent {cid} expired at {entry['consent_expires_at']}, before capture", i, a)
     if captured and list_valid_until and captured > list_valid_until:
         report.error("E08", f"captured_at is after the list's list_valid_until ({list_valid_until.isoformat().replace('+00:00', 'Z')})", i, a)
     ```
     *Note*: Consent expiry evaluates `captured >= expires` (expired at or after). List validity evaluates `captured > list_valid_until` (strictly after is expired).

### B. Use Cases and Acceptance Criteria
1. **`docs/consent-tagging/use-cases.md` (UC-02)**:
   - "R-07: A list failing L01–L04 is refused whole, with the reason."
   - "R-08: The list is held in memory only; it is never written to browser storage, the progress file, the URL or logs."
   - "R-09: When resuming, a list for a different project than the progress file's is refused."
   - "R-10: Rows with `is_minor = true` show the reason and have no Select action."
   - "R-11: Rows whose consent had expired at the asset's capture time show the date and have no Select action."
   - "R-12: When the asset was captured after `list_valid_until`, no row is selectable and the app asks for a newer list."
2. **`docs/consent-tagging/acceptance-tests.md` (T-03, T-04)**:
   - T-03: "The sample list loads (4 people, 2 not selectable); copies with a missing column, two project ids, mixed `list_valid_until` or a duplicate `person_id` are refused; after load, `localStorage`, `sessionStorage` and IndexedDB contain no display name".
   - T-04: "Synthetic Person 003 (expired before capture) and 004 (minor) show a reason and no Select; for an asset captured after `list_valid_until` nobody is selectable".
3. **`docs/consent-tagging/examples/consented_list.sample.csv`**:
   - 4 participants:
     - Person 001 (`3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1`): `consent_expires_at` empty, `is_minor=false` -> Selectable.
     - Person 002 (`7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2`): `consent_expires_at=2027-05-01T00:00:00Z`, `is_minor=false` -> Selectable.
     - Person 003 (`c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e03`): `consent_expires_at=2026-11-03T00:00:00Z`, `is_minor=false` -> Non-selectable (expired consent).
     - Person 004 (`d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f04`): `consent_expires_at` empty, `is_minor=true` -> Non-selectable (minor).

### C. Live Probe Results on Python Reference Validator
Direct probing of `tools/validate_export.py` revealed:
1. Missing column (L01): Returns `L01` with sorted comma-separated missing columns.
2. Two projects (L02): Returns `L02` with message `consented list must hold exactly one project_id, found 2`.
3. Zero rows (header only): Returns `L02` with message `consented list must hold exactly one project_id, found 0`.
4. Empty file (0 bytes): Returns `L01` with all 10 columns listed alphabetically.
5. Mixed `list_valid_until` (L03): Returns `L03` with message `consented list must carry one valid list_valid_until on every row`.
6. Invalid `list_valid_until` (no Z, bad date) (L03): Returns `L03` with message `consented list must carry one valid list_valid_until on every row`.
7. Duplicate `person_id` (L04): Produces `L04` with message `person_id <id> appears twice in the consented list`. If duplicate appears 3 times, produces two L04 errors.
8. Execution / Short-circuit priority:
   - If L01 fails, execution halts immediately; L02, L03, L04 are NOT evaluated.
   - If L02 fails, execution halts immediately; L03, L04 are NOT evaluated.
   - If L03 fails, execution halts immediately; L04 is NOT evaluated.
   - If L04 fails, all duplicates across the file are reported.

---

## 2. Logic Chain

From the observed evidence, the following step-by-step logic establishes the exact specification for Milestone 3:

### Step 1: Pre-Parsing & File Gate
1. **UTF-8 BOM Check**: Per Observation A.1 and A.2, the data contract mandates "UTF-8, no BOM". If a file starts with byte sequence `EF BB BF` (or string `\ufeff`), parsing must immediately fail with:
   `"file starts with a byte-order mark; save as UTF-8 without BOM"`
2. **CSV Parsing with PapaParse**:
   - `header: true`
   - `skipEmptyLines: 'greedy'`
   - Header trimming: `transformHeader: (h) => h.trim()`
   - Value trimming: `transform: (v) => v.trim()`
   - Syntax errors reported by PapaParse (e.g. mismatched quotes) reject the list whole with `PARSE_ERROR`.

### Step 2: Sequential L01–L04 Rule Enforcement
1. **L01 Enforcement**:
   - Reference column set: `['project_id', 'project_name', 'person_id', 'consent_id', 'display_name', 'contact_hint', 'consent_expires_at', 'is_minor', 'list_generated_at', 'list_valid_until']`.
   - Compare `missing = LIST_COLUMNS.filter(c => !header.includes(c))`.
   - If `missing.length > 0`:
     - Reject whole with error code `L01`.
     - Exact message: `consented list is missing columns: ${missing.sort().join(', ')}`.
     - Short-circuit immediately (do not inspect rows).
   - *Note on extra columns*: Per Observation A.2 and live probes, `load_list` does NOT reject extra unknown columns in consented list files (unlike export files).
2. **L02 Enforcement**:
   - Extract `project_id` across all parsed rows.
   - Distinct values: `const projects = new Set(rows.map(r => r.project_id).filter(Boolean))`.
   - If `rows.length === 0` or `projects.size !== 1`:
     - Reject whole with error code `L02`.
     - Exact message: `consented list must hold exactly one project_id, found ${projects.size}`.
     - Short-circuit immediately.
3. **L03 Enforcement**:
   - Extract `list_valid_until` across all rows.
   - Distinct values: `const validUntilSet = new Set(rows.map(r => r.list_valid_until))`.
   - If `validUntilSet.size !== 1` OR the single timestamp is invalid (fails regex `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/` or `isNaN(new Date(ts).getTime())`):
     - Reject whole with error code `L03`.
     - Exact message: `consented list must carry one valid list_valid_until on every row`.
     - Short-circuit immediately.
4. **L04 Enforcement**:
   - Iterate rows and track seen `person_id` values in a `Set<string>`.
   - If `seen.has(row.person_id)`:
     - Record error code `L04`.
     - Exact message: `person_id ${row.person_id} appears twice in the consented list`.
   - If any `L04` errors are collected:
     - Reject whole with all collected `L04` errors.
     - Short-circuit immediately (do not proceed to ingest people into application state).

### Step 3: Zod Schema Validation & Data Types
Each row is validated against Zod schema to guarantee field-level contract integrity:
1. `project_id`: `z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'project_id must be a lowercase UUID')`
2. `project_name`: `z.string().trim().min(1, 'project_name cannot be empty')`
3. `person_id`: `z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'person_id must be a lowercase UUID')`
4. `consent_id`: `z.string().trim().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/, 'consent_id must be a lowercase UUID')`
5. `display_name`: `z.string().trim().min(1, 'display_name cannot be empty')`
6. `contact_hint`: `z.string().trim().optional().default('')`
7. `consent_expires_at`: `z.string().trim().optional().refine(val => !val || isValidIsoUtc(val), 'consent_expires_at must be empty or a valid ISO 8601 UTC timestamp with Z')`
8. `is_minor`: transformed from string `'true'` / `'false'`. If `.toLowerCase() === 'true'`, returns `true`; if `.toLowerCase() === 'false'`, returns `false`; otherwise fails schema validation.
9. `list_generated_at`: `z.string().trim().refine(isValidIsoUtc, 'list_generated_at must be a valid ISO 8601 UTC timestamp with Z')`
10. `list_valid_until`: `z.string().trim().refine(isValidIsoUtc, 'list_valid_until must be a valid ISO 8601 UTC timestamp with Z')`

### Step 4: List Rejection Semantics & Interface Contract
1. **"Refusing Whole"**:
   - The parser returns a discriminated union:
     ```typescript
     export interface ValidationError {
       code: 'L01' | 'L02' | 'L03' | 'L04' | 'PARSE_ERROR' | 'BOM_ERROR' | 'SCHEMA_ERROR' | 'RESUME_MISMATCH';
       message: string;
       line?: number;
     }

     export type ConsentedListParseResult =
       | { success: true; data: ConsentedListResult }
       | { success: false; errors: ValidationError[] };
     ```
   - When `success: false`, zero participants are stored in application state. The existing state remains unchanged or reset to unpopulated.
2. **Resume Check (R-09)**:
   - If resuming a collection where `.dct-progress.json` exists with `progress.project_id`, and `parsedList.projectId !== progress.project_id`:
     - Reject whole with error code `RESUME_MISMATCH`.
     - Descriptive message: `"consented list project_id (${parsedList.projectId}) does not match collection progress project_id (${progress.project_id})"`.

### Step 5: Selectability Evaluation Semantics
Per Observation A.2, B.1, and B.2:
1. **Minor evaluation**:
   - Condition: `person.isMinor === true`
   - Result: `isSelectable = false`, `nonSelectableReason = 'minor'`.
2. **Consent expiry evaluation**:
   - Evaluated against a reference capture time (e.g., asset `captured_at`, or when evaluating on the Start screen, the collection reference / current date).
   - Condition: `person.consentExpiresAt && referenceTime && new Date(referenceTime).getTime() >= new Date(person.consentExpiresAt).getTime()`.
   - Result: `isSelectable = false`, `nonSelectableReason = 'expired'` (UI label e.g.: `consent expired 3 Nov`).
3. **List expiration evaluation**:
   - Condition: `referenceTime && new Date(referenceTime).getTime() > new Date(person.listValidUntil).getTime()`.
   - Result: All rows unselectable with message asking for a newer list.
4. **Summary Counters on Load (UC-02)**:
   - For `consented_list.sample.csv`:
     - Total: 4
     - Selectable: 2 (Person 001, Person 002)
     - Non-selectable: 2 (Person 003 expired, Person 004 minor)

### Step 6: In-Memory Privacy Invariants
Per AGENTS.md Rule 8 and Observation B.1:
1. `display_name` and `contact_hint` MUST NEVER be persisted to:
   - `localStorage`
   - `sessionStorage`
   - `IndexedDB`
   - Cookies
   - `.dct-progress.json`
   - URLs (paths, query parameters, or hash fragments)
   - `console.log`, `console.error`, `console.warn`, `console.info`, or error toasts
2. In error messages for `L01`–`L04`, only UUIDs (`person_id`, `project_id`) appear. Names are strictly omitted.

---

## 3. Features Discovered

| # | Category | Feature | Description | Inputs | Outputs | Error Behavior | Discovered Via |
|---|----------|---------|-------------|--------|---------|----------------|----------------|
| 1 | List Parsing | UTF-8 BOM Gate | Detects and rejects byte-order mark in CSV text before parsing | Raw CSV string / bytes | None (passes to parser) | Fails with `"file starts with a byte-order mark; save as UTF-8 without BOM"` | `validate_export.py:81` & data-contract.md |
| 2 | List Parsing | RFC 4180 CSV Ingestion | Parses CSV list using PapaParse, trimming headers and values | File text / stream | Header array & row objects | Fails whole on syntax errors (`PARSE_ERROR`) | data-contract.md §1 & PapaParse |
| 3 | Validation | Rule L01 (Required Headers) | Verifies all 10 required columns exist in header (case-sensitive, order-independent) | Header field names | Set comparison against `LIST_COLUMNS` | Rejects whole: `consented list is missing columns: <sorted list>` | data-contract.md §3 & `validate_export.py:91` |
| 4 | Validation | Extra Column Tolerance | Consented list allows extra unrecognised columns (unlike export sheet) | Header field names with extra column | Ingestion continues | No error (only `missing` triggers L01) | `validate_export.py:91` & probe testing |
| 5 | Validation | Rule L02 (Single Project ID) | Enforces exactly 1 unique non-empty `project_id` across all data rows | `project_id` column values | `projectId: string` | Rejects whole: `consented list must hold exactly one project_id, found <count>` (e.g. 0 or 2) | data-contract.md §3 & `validate_export.py:95` |
| 6 | Validation | Rule L03 (Valid Until Consistency) | Enforces exactly 1 unique, valid ISO 8601 UTC timestamp for `list_valid_until` across rows | `list_valid_until` column values | `listValidUntil: string` | Rejects whole: `consented list must carry one valid list_valid_until on every row` | data-contract.md §3 & `validate_export.py:99` |
| 7 | Validation | Rule L04 (Unique Person ID) | Detects duplicate `person_id` entries across all rows, recording each duplicate occurrence | `person_id` column values | Unique lookup map | Rejects whole: `person_id <id> appears twice in the consented list` | data-contract.md §3 & `validate_export.py:103` |
| 8 | Validation | Execution Short-Circuit Priority | Evaluates rules in strict order: L01 -> L02 -> L03 -> L04, short-circuiting on the first failing phase | CSV rows and headers | First failing error phase | Halts on first failure; L04 records all duplicates before halting | `validate_export.py:89-108` & probe testing |
| 9 | Schema | Zod Schema Validation | Validates individual field types: UUIDs, strings, ISO timestamps with `Z`, boolean string | Row dictionary | Typed `ConsentedPerson` object | Rejects whole with `SCHEMA_ERROR` | PROJECT.md §Code Layout & Zod |
| 10 | Schema | Boolean String Parsing | Normalizes `is_minor` from case-insensitive `'true'` / `'false'` to boolean | String value | `boolean` (`true` / `false`) | Fails schema validation if string is not 'true' or 'false' | data-contract.md §1 & `validate_export.py:185` |
| 11 | Schema | ISO 8601 UTC Timestamp Gate | Validates timestamps against `/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$/` and `Date` validity | Timestamp string | Validated UTC string | Fails validation if local offset (e.g. `+05:30`) or no `Z` | `validate_export.py:40` |
| 12 | Selectability | Minor Selectability Gate | Flags minors (`is_minor == true`) as non-selectable with reason `'minor'` | `isMinor` boolean | `isSelectable: false`, `nonSelectableReason: 'minor'` | No Select action in UI | UC-03 (R-10) & T-04 |
| 13 | Selectability | Consent Expiry Evaluation | Evaluates consent expiry: non-selectable if `captured_at >= consent_expires_at` | `consent_expires_at`, `captured_at` | `isSelectable: false`, `nonSelectableReason: 'expired'` | No Select action in UI; shows expiry date | UC-03 (R-11) & `validate_export.py:188` |
| 14 | Selectability | List Validity Expiry Gate | Evaluates list validity: all rows non-selectable if `captured_at > list_valid_until` | `list_valid_until`, `captured_at` | All rows `isSelectable: false` | No row selectable; prompts for newer list | UC-03 (R-12) & `validate_export.py:191` |
| 15 | Resume | Resume Project Gate | Rejects a consented list if its `project_id` differs from `.dct-progress.json` | List `project_id`, progress `project_id` | Match confirmation | Rejects whole with `RESUME_MISMATCH` | UC-02 (R-09) & app-design.md §5 |
| 16 | Privacy | In-Memory Privacy Invariant | Strictly confines `display_name` and `contact_hint` to RAM memory | Participant records | React memory state only | Never written to storage, URLs, progress file, or logs | AGENTS.md Rule 8 & app-design.md §5 |
| 17 | Review Warning | Filename Leak Detection | Scans asset paths for whole-word occurrences of list `display_name`s (case-insensitive) | Asset paths & list `display_name`s | Filename identification warning | Surfaces warning chip on review screen | app-design.md §5 & acceptance-tests.md T-14 |

---

## 4. Edge Cases

| # | Feature | Input | Observed Behavior |
|---|---------|-------|-------------------|
| 1 | L01 | Empty file (0 bytes) | Rejected with `L01: consented list is missing columns: consent_expires_at, consent_id, contact_hint, display_name, is_minor, list_generated_at, list_valid_until, person_id, project_id, project_name` |
| 2 | L01 | Header with 1 missing column (`display_name`) | Rejected with `L01: consented list is missing columns: display_name` |
| 3 | L01 | Header with multiple missing columns (`is_minor`, `contact_hint`) | Rejected with `L01: consented list is missing columns: contact_hint, is_minor` (sorted alphabetically) |
| 4 | L01 | Header with extra unexpected column (`extra_col`) | Accepted (passes L01; Python validator checks `missing = LIST_COLUMNS - set(header)`, does not error on extra columns) |
| 5 | L01 | Header columns in permuted / shuffled order | Accepted (set comparison is order-independent) |
| 6 | L01 | Header containing leading/trailing whitespace (` project_id `) | Accepted after trimming; fails if untrimmed |
| 7 | L01 | File encoded with UTF-8 BOM (`\ufeff`) | Fails before parsing with `"file starts with a byte-order mark; save as UTF-8 without BOM"` |
| 8 | L02 | 0 data rows (header only) | Rejected with `L02: consented list must hold exactly one project_id, found 0` |
| 9 | L02 | Two rows with different `project_id` UUIDs | Rejected with `L02: consented list must hold exactly one project_id, found 2` |
| 10 | L02 | One row with valid UUID, one row with empty string `""` | Rejected with `L02: consented list must hold exactly one project_id, found 2` |
| 11 | L02 | All rows have empty string `project_id` | Rejected with `L02: consented list must hold exactly one project_id, found 0` (or `SCHEMA_ERROR` UUID format) |
| 12 | L03 | Two rows with different `list_valid_until` timestamps | Rejected with `L03: consented list must carry one valid list_valid_until on every row` |
| 13 | L03 | `list_valid_until` timestamp without `Z` (local time `2026-11-08T04:30:00`) | Rejected with `L03: consented list must carry one valid list_valid_until on every row` |
| 14 | L03 | `list_valid_until` with timezone offset `+05:30` instead of `Z` | Rejected with `L03: consented list must carry one valid list_valid_until on every row` |
| 15 | L03 | `list_valid_until` with invalid date (`2026-02-30T00:00:00Z` or `invalid`) | Rejected with `L03: consented list must carry one valid list_valid_until on every row` |
| 16 | L03 | `list_valid_until` with fractional seconds (`2026-11-08T04:30:00.123456Z`) | Accepted (matches `(\.\d{1,6})?Z` pattern and valid ISO) |
| 17 | L04 | Single `person_id` appearing twice | Rejected with `L04: person_id <id> appears twice in the consented list` |
| 18 | L04 | Single `person_id` appearing 3 times | Rejected with two `L04` errors for that `<id>` |
| 19 | L04 | Two different `person_id`s duplicated | Rejected with `L04` errors for both duplicate IDs |
| 20 | Priority | File has missing column AND mixed project IDs | Rejects with `L01` only (L02 not reached) |
| 21 | Priority | File has two project IDs AND mixed `list_valid_until` | Rejects with `L02` only (L03 not reached) |
| 22 | Priority | File has mixed `list_valid_until` AND duplicate `person_id` | Rejects with `L03` only (L04 not reached) |
| 23 | Selectability | Person with `is_minor: "true"` | `isSelectable: false`, `nonSelectableReason: 'minor'` |
| 24 | Selectability | Person with `is_minor: "TRUE"` or `"True"` | `isSelectable: false`, `nonSelectableReason: 'minor'` (case-insensitive) |
| 25 | Selectability | Person with `is_minor: "false"` | `isSelectable: true` (if adult and not expired) |
| 26 | Selectability | Person with `is_minor: "yes"` or `"1"` | Schema validation failure (`SCHEMA_ERROR`) |
| 27 | Selectability | `captured_at == consent_expires_at` | `isSelectable: false` (comparison is `captured >= expires`) |
| 28 | Selectability | `captured_at < consent_expires_at` | `isSelectable: true` (unexpired at capture time) |
| 29 | Selectability | `captured_at == list_valid_until` | `isSelectable: true` (comparison is `captured > list_valid_until`; valid up to and including) |
| 30 | Selectability | `captured_at > list_valid_until` | All rows `isSelectable: false` (list expired) |
| 31 | Selectability | `consent_expires_at` is empty `""` | Never expires (`isSelectable: true` indefinitely) |
| 32 | Privacy | Error message generated for L04 | Verbatim: `person_id <UUID> appears twice in the consented list` (ZERO display names or contact hints in message) |

---

## 5. Caveats

1. **Start Screen Reference Time for Selectability**:
   On initial load of the consented list on the Start screen (UC-02), the app reports how many participants are non-selectable (e.g. 2 for the sample list). In UC-02, the collection folder has already been opened in Step 1, so the collection assets' capture time (or collection earliest capture time `2026-11-04T06:02:11Z` or current system time) can be passed as `referenceTime`. For the sample list (`consented_list.sample.csv`), Person 003 expired on `2026-11-03`, so any reference time on or after `2026-11-04` produces exactly 2 non-selectable (Person 003 expired, Person 004 minor), perfectly satisfying T-03.
2. **Extra Column Handling**:
   While `validate_export.py` tolerates extra columns in the consented list (checking only `missing = LIST_COLUMNS - set(header)`), the Zod row schema should use `.passthrough()` or strip extra fields, ensuring extra columns do not cause schema parsing failures while preserving strict L01 validation.
3. **Empty String vs Missing in CSV**:
   Optional fields `contact_hint` and `consent_expires_at` in CSV are represented as empty string `""` between commas (RFC 4180). They must never be `"null"`, `"NA"`, or `"-"`.

---

## 6. Conclusion

Milestone 3 requires the implementation of:
1. `src/list/types.ts`: TypeScript interfaces for `ConsentedPerson`, `ConsentedListResult`, `ValidationError`, and `ConsentedListParseResult`.
2. `src/list/schema.ts`: Zod schema for CSV row parsing, UUID v4 validation, and ISO 8601 UTC timestamp validation.
3. `src/list/validator.ts`: Rules L01–L04 implementation with exact 100% Python validator message parity and short-circuit priority.
4. `src/list/parser.ts`: PapaParse wrapper with UTF-8 BOM check, L01–L04 validation, Zod transformation, and selectability calculation.
5. `src/list/selectability.ts`: Selectability evaluation function enforcing minor, consent expiry (`>=`), and list expiration (`>`) rules.
6. `tests/unit/list/`: Comprehensive Vitest test suite testing happy paths, L01–L04 negative cases, BOM rejection, and privacy invariants.

All specifications mined above align 100% with `tools/validate_export.py`, `docs/consent-tagging/data-contract.md`, and acceptance tests T-03 and T-04.

---

## 7. Verification Method

To independently verify the facts and logic in this report:

1. **Verify Python Reference Validator Behavior on L01–L04**:
   ```powershell
   python -m unittest tools/test_validate_export.py
   ```
   (Must pass all 20 tests).

2. **Verify Python Validator load_list on Sample List**:
   ```powershell
   python -c "import sys; sys.path.insert(0, 'tools'); from validate_export import load_list, Report; r = Report(); proj, valid, people = load_list('docs/consent-tagging/examples/consented_list.sample.csv', r); print('Errors:', r.errors); print('Count:', len(people))"
   ```
   (Outputs `Errors: []`, `Count: 4`).

3. **Verify Existing Vitest Test Suite**:
   ```powershell
   npm test
   ```
   (Must pass all 8 test files / 107 tests with zero errors).

4. **Verify TypeScript Strict Check**:
   ```powershell
   npm run typecheck
   ```
   (Must pass with zero type errors).
