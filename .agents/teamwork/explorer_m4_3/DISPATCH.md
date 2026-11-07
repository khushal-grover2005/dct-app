## 2026-11-07T15:00:17Z
You are explorer_m4_3, a teamwork_explorer exploring Milestone 4 of Increment 1 for the Data Collection Tool (DCT).
Your working directory is: c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m4_3

MANDATORY: You MUST read the original request before starting any work. Do not proceed without reading it:
c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\ORIGINAL_REQUEST.md

Also read:
- AGENTS.md
- docs/consent-tagging/acceptance-tests.md (specifically T-01, T-02, T-03)
- docs/consent-tagging/app-design.md §2 (Start screen)
- docs/consent-tagging/examples/sample-collection/
- docs/consent-tagging/examples/consented_list.sample.csv
- Existing Playwright test suites in `e2e/` (e.g. `t02-browser-network.spec.ts`)

Your Mission:
Design the automated integration and end-to-end verification plan for the Start screen in Milestone 4:
1. Vitest Integration Suite (`tests/unit/ui/StartScreen.test.tsx`):
   - Rendering folder picker and consented list picker.
   - Mocking folder selection -> asserting 8 assets rendered with badges, progress bar, capture times.
   - Mocking consented list load -> asserting project name, 4 people total, 2 non-selectable (with reasons).
   - Mocking invalid list load -> asserting descriptive error alert and whole-list refusal.
2. Playwright E2E Test Suite for Acceptance Tests T-01 & T-03 (`e2e/start-screen.spec.ts`):
   - How to test File System Access API in Chromium under Playwright (e.g. mock directory handle or file chooser fallback).
   - Ingesting sample collection -> verifying 8 assets rendered in table, correct types, forward-slash paths (`sub/x.png` if present), capture times.
   - Ingesting sample consented list -> verifying summary badge (4 people, 2 not selectable).
   - Ingesting invalid lists (missing columns, multiple project IDs, mixed valid_until, duplicate person IDs) -> verifying error display and zero people selectable.
   - Verifying zero network requests during the entire user flow (T-02).
   - Verifying zero display names or contact hints in `localStorage`, `sessionStorage`, `IndexedDB`, or console logs during the entire E2E test run (T-03).
3. Test Strategy & Edge Cases:
   - Identify potential test flakiness or browser quirks.

Produce your exploration report in:
c:\Users\pc\.gemini\antigravity\scratch\dct-app\.agents\teamwork\explorer_m4_3\handoff.md
And send a concise completion message to parent when done.
