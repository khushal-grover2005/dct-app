# DISPATCH: Milestone 4 Implementation Worker (worker_m4)

## Context & Objectives
You are the implementation worker for **Milestone 4: UI Integration & Start Screen** of the Data Collection Tool (DCT), an air-gapped client-side browser application for lab collection agents that satisfies UC-01 (Open a collection folder) and UC-02 (Load the consented list).

## Mandatory Reference Documents
Read these files completely before starting work:
1. `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\ORIGINAL_REQUEST.md` (Verbatim user request)
2. `c:\Users\pc\.gemini\antigravity\scratch\dct-app\AGENTS.md` (Project rules and invariants)
3. `c:\Users\pc\.gemini\antigravity\scratch\dct-app\PROJECT.md` (Architecture, milestones, interfaces)
4. `c:\Users\pc\.gemini\antigravity\scratch\dct-app\TEST_INFRA.md` (Testing architecture and test tiers)
5. `c:\Users\pc\.gemini\antigravity\scratch\dct-app\docs\consent-tagging\app-design.md` (§2.1 Start screen & §2.5 Layout rules)
6. Exploration Reports:
   - `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m4_1\handoff.md` (UI component hierarchy, layout, styling tokens, data-testid mapping)
   - `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m4_2\handoff.md` (Reactive state pipeline, useAppPipeline hook, lifecycle & memory disposal)
   - `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m4_3\handoff.md` (Vitest integration suite & Playwright E2E automation blueprint)

## Mandatory Integrity Warning
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

## Exclusive Write Ownership
You own the following files exclusively:
- `src/ui/types.ts`
- `src/ui/StartScreen.tsx`
- `src/ui/FolderSection.tsx`
- `src/ui/AssetTable.tsx`
- `src/ui/ListSection.tsx`
- `src/ui/ListErrorBanner.tsx`
- `src/ui/ListSummary.tsx`
- `src/ui/ParticipantTable.tsx`
- `src/ui/index.ts`
- `src/app/useAppPipeline.ts`
- `src/app/App.tsx` (Wire up pipeline & StartScreen while preserving #app-shell, heading, and BrowserGate compatibility)
- `tests/unit/ui/StartScreen.test.tsx` (Vitest integration test suite)
- `e2e/start-screen.spec.ts` (Playwright E2E test suite covering T-01, T-02, T-03)
- `PROJECT.md` (Update M3 Status to 'DONE', M4 Status to 'IN_PROGRESS' / 'DONE')

Do NOT modify files in `src/folder/` or `src/list/` unless fixing an integration bug.

## Requirements & Invariants
1. **Rule 1 & Rule 2**: Fixed stack (React 18 + TS strict + Tailwind CSS + Lucide icons); CSP `connect-src 'none'`; zero network requests after initial load.
2. **Rule 3**: `project_id`, `person_id`, and `consent_id` are never typed — no input fields for them on any screen.
3. **Rule 4**: Asset files are strictly read-only — never modified, renamed, or re-encoded.
4. **Rule 8**: Participant names and contact hints stay in memory only — never written to `localStorage`, `sessionStorage`, `IndexedDB`, URLs, or application logs.
5. **App Design §2.1 & §2.5**:
   - Three-step Start screen: 1. Open collection folder, 2. Load consented list, 3. Collection reference name (`collection_ref` prefilled with folder name).
   - Asset table with monospace relative paths (`/` separators), semantic type badges (carrying text, not color alone), capture times with source badges (`EXIF`, `MP4 header`, `file date`), and streaming SHA-256 progress.
   - Aggregate hashing progress bar showing overall percent and completed/total count.
   - Consented list summary cards with project name, project ID (read-only), total participants, selectable count, non-selectable count with reason breakdown (minor, expired), and `list_valid_until`.
   - List rejection error banner displaying descriptive error and rule code (L01–L04, BOM) and refusing whole list.
   - In-memory participant table preview showing selectability chips.
   - Proceed button to Tagging Workspace (disabled/placeholder until folder hashed and valid list loaded).
   - Layout: min 1280x720, keyboard accessible, status badges carry text labels.
6. **Testing & Quality Gates**:
   - `npm test` must pass all existing tests (190+) plus new `StartScreen.test.tsx` integration tests.
   - `npm run lint` (`eslint --max-warnings 0`) must pass with 0 errors/warnings.
   - `npx tsc --noEmit` must pass with 0 errors under TypeScript strict mode.
   - `npm run build` must complete cleanly.
   - `python -m unittest tools/test_validate_export.py` must pass all 20 tests.
   - Run Playwright E2E suite (`npx playwright test e2e/start-screen.spec.ts` or `npm run e2e`).

## Handoff Requirements
Upon completion, write a detailed handoff report to:
`c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\worker_m4\handoff.md`
Report verification commands and exact test outputs. Then send a completion message back to the orchestrator.


## 2026-11-07T15:10:17Z
[Message] timestamp=2026-11-07T15:10:17Z sender=fde194f5-9579-434b-9b81-d7bb7a515ef0 priority=MESSAGE_PRIORITY_HIGH content=You are the Milestone 4 Implementation Worker (worker_m4) for the Data Collection Tool (DCT).

Your working directory is:
`c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\worker_m4`

MANDATORY: Read `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\ORIGINAL_REQUEST.md` before starting work.
Also read your task instructions in:
`c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\worker_m4\DISPATCH.md`

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A teamwork_auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Your task:
Implement Milestone 4: Start Screen UI, Folder Ingestion & Consented List Flow (UC-01 & UC-02).
Read the comprehensive blueprints provided by the three explorers:
- `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m4_1\handoff.md` (UI Component hierarchy and styles)
- `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m4_2\handoff.md` (State pipeline & useAppPipeline hook)
- `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m4_3\handoff.md` (Vitest integration & Playwright E2E suites)

Exclusive write ownership:
- `src/ui/types.ts`
- `src/ui/StartScreen.tsx`
- `src/ui/FolderSection.tsx`
- `src/ui/AssetTable.tsx`
- `src/ui/ListSection.tsx`
- `src/ui/ListErrorBanner.tsx`
- `src/ui/ListSummary.tsx`
- `src/ui/ParticipantTable.tsx`
- `src/ui/index.ts`
- `src/app/useAppPipeline.ts`
- `src/app/App.tsx` (Wire up pipeline and StartScreen while maintaining #app-shell, heading, and BrowserGate compatibility)
- `tests/unit/ui/StartScreen.test.tsx`
- `e2e/start-screen.spec.ts`
- `PROJECT.md` (Update M3 Status to 'DONE', M4 Status to 'IN_PROGRESS' / 'DONE')

Quality & Verification:
- Run `npm test` (all 190+ unit tests and new StartScreen integration tests must pass).
- Run `npm run lint` (0 errors, 0 warnings).
- Run `npx tsc --noEmit` (0 errors in strict mode).
- Run `npm run build` (clean Vite build).
- Run `python -m unittest tools/test_validate_export.py` (20/20 tests pass).
- Run Playwright E2E tests (`npx playwright test e2e/start-screen.spec.ts`).

When done, write your report to `c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\worker_m4\handoff.md` and send a message back to the orchestrator.
