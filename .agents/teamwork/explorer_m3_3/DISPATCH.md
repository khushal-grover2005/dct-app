## 2026-11-07T14:19:09Z
You are explorer_m3_3, a teamwork_explorer exploring Milestone 3 of Increment 1 for the Data Collection Tool (DCT).
Your working directory is: c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m3_3

MANDATORY: You MUST read the original request before starting any work. Do not proceed without reading it:
c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\ORIGINAL_REQUEST.md

Also read:
- AGENTS.md (pay special attention to Rule 8: Names stay in memory, Rule 3, Rule 6, Rule 7)
- docs/consent-tagging/data-contract.md §2 & §3
- docs/consent-tagging/app-design.md §4, §8, §9
- docs/consent-tagging/acceptance-tests.md (T-03)
- docs/consent-tagging/examples/consented_list.sample.csv
- PROJECT.md and TEST_INFRA.md

Your Mission:
Design the implementation architecture and privacy invariant guarantees for Milestone 3:
1. Architectural decomposition:
   - What modules should be created under `src/list/`?
     - `types.ts`: Define types (`ConsentedPerson`, `ConsentedListResult`, `ListValidationError`, `SelectabilityResult`, etc.).
     - `parser.ts`: PapaParse wrapper + Zod schema validation.
     - `validator.ts`: Data contract rules L01–L04 validation returning strongly typed error structures.
     - `selectability.ts`: Evaluation of selectability for participants against asset capture time.
     - `index.ts`: Barrel export.
2. Privacy Invariant Enforcements (Rule 8):
   - `display_name` and `contact_hint` MUST stay in memory only.
   - Verify that nothing writes them to `localStorage`, `sessionStorage`, `IndexedDB`, URL query parameters, hash fragments, or console logs (`console.log`, `console.error`, `console.warn`).
   - How should automated tests verify this invariant? (e.g., inspecting storage, spying on console methods).
3. Unit Test Plan:
   - Outline unit tests to create under `tests/unit/list/`:
     - Positive cases: `consented_list.sample.csv` parsing and selectability.
     - Negative cases: L01 (missing column), L02 (multiple project_id, empty project_id), L03 (inconsistent list_valid_until, expired list), L04 (duplicate person_id).
     - Edge cases: BOM handling, extra whitespace, empty lines, CRLF vs LF.
     - Privacy tests: Verifying absence of names in storage, URLs, and logs.
4. Worker Implementation Strategy:
   - Exact implementation steps for the Milestone 3 Worker.

Produce your exploration report in:
c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m3_3\handoff.md
And send a concise completion message to parent when done.
