# DISPATCH: challenger_m4_2 (Milestone 4 Adversarial Data & Privacy Challenger)

## Mission
Adversarially challenge and stress-test data validation, whole-list refusal, and in-memory privacy guarantees in Milestone 4.

## Reference Material
- `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\ORIGINAL_REQUEST.md` (Verbatim user request)
- `c:\Users\pc\.gemini\antigravity\scratch\dct-app\AGENTS.md` (Rule 3 & 8)
- `c:\Users\pc\.gemini\antigravity\scratch\dct-app\PROJECT.md`
- `c:\Users\pc\.gemini\antigravity\scratch\dct-app\TEST_INFRA.md`
- Worker Handoff: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\worker_m4\handoff.md`

## Adversarial Challenges to Execute
1. Challenge 1: Malformed and corrupted CSV files (unclosed quotes, invalid encodings, binary garbage) uploaded to the consented list picker. Verify whole-list rejection without unhandled React errors.
2. Challenge 2: Massive consented list (e.g., 500 participants) rendering performance and selectability recalculation.
3. Challenge 3: In-memory privacy penetration test: inspect browser storage (`localStorage`, `sessionStorage`, `IndexedDB`), DOM element data attributes, URL query/hash parameters, and console messages during list upload and error states. Verify zero participant names or contact hints escape memory.
4. Challenge 4: Loading invalid list after a valid list was loaded: verify previous valid list is cleared immediately and whole-list refusal is enforced.

Deliver your verdict (`APPROVE` or `REQUEST_CHANGES`) in `handoff.md` and send a message to orchestrator.

## 2026-11-07T15:46:55Z
You are challenger_m4_2 (Milestone 4 Adversarial Data & Privacy Challenger).

Your working directory is:
`c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\challenger_m4_2`

MANDATORY: Read `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\ORIGINAL_REQUEST.md` before starting work.
Also read your instructions in:
`c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\challenger_m4_2\DISPATCH.md`
Worker handoff report is at:
`c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\worker_m4\handoff.md`

Execute empirical adversarial challenges against list validation and privacy:
1. Malformed CSVs (unclosed quotes, invalid encodings, binary garbage) uploaded to the consented list picker.
2. Large consented list (>500 participants) rendering and selectability performance.
3. In-memory privacy penetration testing: audit `localStorage`, `sessionStorage`, `IndexedDB`, DOM attributes, URL query/hash parameters, and console messages during list upload and error states for any participant names or contact hints.
4. Loading invalid list after a valid list was loaded: verify previous valid list is cleared immediately and whole-list refusal is enforced.

Deliver your findings and verdict (APPROVE or REQUEST_CHANGES) in `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\challenger_m4_2\handoff.md` and send a message back to orchestrator.

