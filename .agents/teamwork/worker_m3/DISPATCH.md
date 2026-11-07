## 2026-11-07T14:28:31Z
You are worker_m3, a teamwork_worker implementing Milestone 3 of Increment 1 for the Data Collection Tool (DCT).
Your working directory is: c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\worker_m3

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

MANDATORY: You MUST read the original request before starting any work. Do not proceed without reading it:
c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\ORIGINAL_REQUEST.md

Read the synthesis reports from the Milestone 3 Explorers:
1. c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\spec_miner_m3_1\handoff.md
2. c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m3_2\handoff.md
3. c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m3_3\handoff.md

Also read:
- AGENTS.md (specifically Rule 3, Rule 6, Rule 7, Rule 8: Names stay in memory)
- docs/consent-tagging/data-contract.md §2 (The consented list)
- docs/consent-tagging/app-design.md §4 (Consented list model)
- docs/consent-tagging/acceptance-tests.md (T-03, T-04)
- docs/consent-tagging/examples/consented_list.sample.csv
- tools/validate_export.py (reference for L01–L04 logic and messages)

Your Exclusive Write Ownership:
- `src/list/types.ts`
- `src/list/selectability.ts`
- `src/list/validator.ts`
- `src/list/parser.ts`
- `src/list/index.ts`
- `tests/unit/list/parser.test.ts`
- `tests/unit/list/validator.test.ts`
- `tests/unit/list/selectability.test.ts`
- `tests/unit/list/privacy.test.ts`
- `PROJECT.md` (Update Milestone 2 Status to 'DONE' and Milestone 3 Status to 'IN_PROGRESS' in the milestones table)

Implementation Objectives:
1. `src/list/types.ts`:
   - Define domain interfaces: `ConsentedPerson`, `ConsentedListResult`, `NonSelectableReason`, `ListErrorCode`, `ListValidationError`, and discriminated union `ListParseResult`.
2. `src/list/selectability.ts`:
   - Implement `evaluateSelectability(isMinor, consentExpiresAt, options?)`:
     - Minor rule: `isMinor === true` -> `'minor'`, formattedReason `'minor'` (never selectable).
     - Consent expiry: `referenceTime >= consentExpiresAt` -> `'expired'`, formattedReason e.g. `'consent expired 3 Nov'`.
     - List expiry: `referenceTime > listValidUntil` -> `'list_expired'`, formattedReason `'list expired'`.
     - Precedence: `minor` > `expired` > `list_expired`.
     - Exact second boundaries: `>=` for consent expiry (exact second is expired), `>` for list expiry (exact second is still valid).
3. `src/list/validator.ts`:
   - Implement data contract rules L01–L04 with exact 100% parity with `tools/validate_export.py` in short-circuit order (L01 -> L02 -> L03 -> L04):
     - L01: `consented list is missing columns: <sorted list>`
     - L02: `consented list must hold exactly one project_id, found <count>`
     - L03: `consented list must carry one valid list_valid_until on every row`
     - L04: `person_id <id> appears twice in the consented list`
     - Extra columns in header: tolerated (do not error on extra columns).
4. `src/list/parser.ts`:
   - UTF-8 BOM check: reject before parsing if starts with `\ufeff`: `"file starts with a byte-order mark; save as UTF-8 without BOM"`.
   - PapaParse configuration: `header: true`, `skipEmptyLines: 'greedy'`, trimmed headers and values.
   - Zod row schema: UUID v4 regex validation, ISO 8601 UTC with `Z` regex validation, boolean normalization for `is_minor`.
   - `loadConsentedList(csvText: string, options?: { referenceTime?: string; expectedProjectId?: string })`: returns discriminated union `ListParseResult`.
5. `src/list/index.ts`: Barrel export.
6. Unit Test Suites under `tests/unit/list/`:
   - `parser.test.ts`: Sample CSV loading (4 people, 2 non-selectable), BOM rejection, RFC 4180 parsing (quoted commas, quoted quotes, CRLF/LF).
   - `validator.test.ts`: Negative cases for L01, L02, L03, L04, short-circuit order, exact error messages.
   - `selectability.test.ts`: Sample participants (001-004), boundary second checks, precedence.
   - `privacy.test.ts`: AGENTS.md Rule 8 enforcement — assert `localStorage`, `sessionStorage`, `IndexedDB`, URLs, and spied `console.*` methods contain zero participant display names or contact hints.
7. Verification:
   - Run `npm test` (all unit tests must pass, 0 failures).
   - Run `npm run lint` (0 errors, 0 warnings under strict `no-explicit-any: error`).
   - Run `npx tsc --noEmit` (clean typecheck).
   - Run `npm run build` (clean Vite build).
   - Run `python -m unittest tools/test_validate_export.py` (all 20 tests pass).

Document your changes and verification command outputs in:
c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\worker_m3\handoff.md
And send a completion message to parent when done.
