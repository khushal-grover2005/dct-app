# DISPATCH: reviewer_m4_1 (Milestone 4 UI & Component Reviewer)

## Mission
Independently review the UI component hierarchy and layout implemented in Milestone 4 (`src/ui/`, `src/app/App.tsx`).

## Reference Material
- `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\ORIGINAL_REQUEST.md` (Verbatim user request)
- `c:\Users\pc\.gemini\antigravity\scratch\dct-app\AGENTS.md`
- `c:\Users\pc\.gemini\antigravity\scratch\dct-app\PROJECT.md`
- `c:\Users\pc\.gemini\antigravity\scratch\dct-app\docs\consent-tagging\app-design.md` (§2.1 & §2.5)
- Worker Handoff: `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\worker_m4\handoff.md`

## Review Checklist
1. App-design.md §2.1 & §2.5 compliance:
   - 3-step Start screen workflow (Open folder, Load list, Collection name prefilled and editable).
   - Status badges carry text labels, not color alone.
   - Asset table with monospace relative paths (`/` separators), 6 types, capture times with source badges (`EXIF`, `MP4 header`, `capture time from file date`), and streaming SHA-256 hashes.
   - Aggregate hashing progress bar showing overall percent and counts.
   - Consented list summary cards with project name, project ID (read-only), total participants, selectable count, non-selectable count, and `list_valid_until`.
   - List rejection error banner displaying rule codes (`[L01]`, `[L02]`, `[L03]`, `[L04]`, `[BOM_NOT_ALLOWED]`) and descriptive messages.
   - Participant table preview with selectability chips and formatted reasons.
2. AGENTS.md Rule 3: Zero input fields for `project_id`, `person_id`, `consent_id`.
3. Verify test runs: `npm test`, `npx tsc --noEmit`, `npm run lint`, `npm run build`, `python -m unittest tools/test_validate_export.py`.

Deliver your verdict (`APPROVE` or `REQUEST_CHANGES`) in `handoff.md` and send a message to orchestrator.


## 2026-11-07T15:46:21Z
You are reviewer_m4_1 (Milestone 4 UI & Component Reviewer).

Your working directory is:
`c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\reviewer_m4_1`

MANDATORY: Read `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\ORIGINAL_REQUEST.md` before starting work.
Also read your instructions in:
`c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\reviewer_m4_1\DISPATCH.md`
Worker handoff report is at:
`c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\worker_m4\handoff.md`

Examine:
- `src/ui/` components (`StartScreen.tsx`, `FolderSection.tsx`, `AssetTable.tsx`, `ListSection.tsx`, `ListErrorBanner.tsx`, `ListSummary.tsx`, `ParticipantTable.tsx`)
- `src/app/App.tsx`
- Compliance with `app-design.md` §2.1 & §2.5 (3-step workflow, accessible badges carrying text, min 1280x720, asset table formatting, streaming SHA-256 progress)
- AGENTS.md Rule 3: No input fields for `project_id`, `person_id`, `consent_id`
- Run builds and tests to verify.

Deliver your verdict (APPROVE or REQUEST_CHANGES) in `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\reviewer_m4_1\handoff.md` and send a message back to orchestrator.
