# Implementation plan

Five increments, about **seven weeks** for a team of three to four students working part-time with
a coding agent. Each ends with a demo using `examples/sample-collection/` and the sample list.

| Inc | Builds | Use cases | Indicative |
|---|---|---|---|
| 1 | App shell, folder and list loading, asset types, hashing, capture times | UC-01, UC-02 | 1½ weeks |
| 2 | Tagging workspace: viewers for every type, people panel, bystanders, no person | UC-03, UC-04 | 2½ weeks |
| 3 | Validator port, review screen, save sheet | UC-06 | 1 week |
| 4 | Progress file and resume; corrections; deletion requests | UC-05, UC-07, UC-08 | 1 week |
| 5 | Keyboard, accessibility, performance, packaging | all | 1 week |

## Increment 1 · Shell and loading

**Read** AGENTS.md, overview.md, app-design.md §1–3 and §7–8, data-contract.md §1.

**Builds** Vite + React + TypeScript project with lint, vitest, Playwright and CI; CSP; the
unsupported-browser page; Start screen; folder listing with type detection and `dct-types.json`;
EXIF and MP4 header capture times; streamed background hashing;
list parsing with L01–L04 and selectability rules.

**Acceptance** T-01, T-02, T-03. Demo: open the sample collection, see eight assets of five
types with hashes matching `asset_export.sample.csv`; load the sample list and see two people
not selectable.

## Increment 2 · Tagging workspace

**Read** app-design.md §2.2, use-cases.md UC-03 and UC-04.

**Builds** The three-pane workspace; viewers for asset, video, audio, sensor text and PDF with
the no-preview fallback; review-to-end tracking for media; search and select; chips; bystander
stepper; no-person toggle; asset states and filters by state and type.

**Acceptance** T-04, T-05, T-06, T-15. Demo: tag all eight sample assets exactly as in
`asset_export.sample.csv`, playing the video and audio to the end.

## Increment 3 · Validate and save

**Read** data-contract.md §2–3, app-design.md §2.3 and §6, `tools/validate_export.py`.

**Builds** `src/validation/validateExport.ts` with the golden-case suite; the sheet writer;
the review screen; Save sheet and download copy.

**Acceptance** T-07, T-08, T-09. Demo: save the sample collection's sheet, run the Python
validator on it (VALID, one held asset), then break a tag and show Save disabled with E05.

## Increment 4 · Resume and corrections

**Read** app-design.md §2.4 and §4, use-cases.md UC-05, UC-07, UC-08.

**Builds** `.dct-progress.json` writing and resume; missing / new / changed detection;
redaction and deletion flows; deletion requests; correction sheets.

**Acceptance** T-10, T-11, T-12. Demo: reload mid-tagging and resume; replace IMG-0002.png
with the redacted copy from `sample-collection-redacted/` and save a correction sheet that
matches `asset_export.correction.sample.csv` in its rows.

## Increment 5 · Finish

**Read** app-design.md §2.5 and §5.

**Builds** Full keyboard map; accessibility pass (axe in Playwright); 1 000-asset performance
run including a 4 GB video; the filename-name warning; list-deletion reminder; a short user guide in `docs/` with
screenshots of the sample collection.

**Acceptance** T-13, T-14, T-16. Demo: a full collection tagged with the keyboard only; asset
files shown byte-for-byte unchanged afterwards.
