# Acceptance tests

Sixteen tests: vitest for logic, Playwright (Chrome) for screens. Fixtures copy
`examples/sample-collection/` into a temporary folder; Playwright grants folder access through
a test hook. Synthetic data only.

| # | Test | Passes when | Covers |
|---|---|---|---|
| T-01 | Folder loading | Opening the sample collection lists 8 assets with `asset_id`s `IMG-0001.png`…`DOC-0008.pdf` and types asset ×4, video, audio, sensor, document; a nested file gets `sub/x.png`; an unknown extension becomes `other`; a `dct-types.json` mapping `.dat` to sensor is applied; computed hashes equal those in `asset_export.sample.csv`; `VID-0005.mp4` gets capture time 06:40:00Z from its header; an image without EXIF is marked "capture time from file date" | R-01–R-04 |
| T-02 | Browser and network | In Firefox the app shows only the Chrome/Edge page; in Chrome the page's CSP has `connect-src 'none'` and Playwright records zero network requests after load across a full tag-and-save run | R-05, R-06 |
| T-03 | List loading | The sample list loads (4 people, 2 not selectable); copies with a missing column, two project ids, mixed `list_valid_until` or a duplicate `person_id` are refused; after load, `localStorage`, `sessionStorage` and IndexedDB contain no display name | R-07, R-08 |
| T-04 | Not selectable | Synthetic Person 003 (expired before capture) and 004 (minor) show a reason and no Select; for an asset captured after `list_valid_until` nobody is selectable | R-10–R-12 |
| T-05 | Tagging | Selecting 001 twice keeps one chip; removing and re-adding works; there is no input field for any id anywhere in the DOM; a person can be found by contact hint | R-13–R-16 |
| T-06 | Image states | "No person" cannot be turned on with a person selected; an asset with only a bystander shows "bystander only — delete this file" and is not done; the done count and state filter are correct | R-18–R-21 |
| T-07 | Validator parity | The TypeScript validator gives exactly the expected codes for all 18 golden cases | R-25 |
| T-08 | Save the sample | Tagging the sample collection as in `asset_export.sample.csv` and saving writes a sheet with the same rows (other than `export_id`, `exported_at`); `tools/validate_export.py` reports VALID with IMG-0002.png held; a second save has a new `export_id` | R-27–R-29 |
| T-09 | Errors block saving | With an untagged asset, Save is disabled and the asset is listed; each error links back to its asset | R-26, R-27 |
| T-10 | Resume | After tagging two assets and reloading, Resume restores both; the progress file contains no display name or contact hint; a list for another project is refused; deleting one asset file and adding another shows *missing* and *untagged* | R-09, R-22–R-24 |
| T-11 | Correction | Replacing IMG-0002.png with the redacted copy and choosing **I redacted it** clears the bystander and keeps the person; choosing it without replacing the file is refused; the correction sheet validates and has one row; no other control can clear a bystander count | R-31, R-33, R-34 |
| T-12 | Deletions | A deletion request for `IMG-0003.png` and `NOPE.png` shows one found, one not; after confirmation the file is gone from the folder and the correction sheet has one `deleted` row that validates; **I deleted it** on a held asset does the same | R-32, R-35, R-36 |
| T-13 | Keyboard and accessibility | The whole sample collection can be tagged and saved with the keyboard only; axe reports no serious or critical issue on any screen | R-17 |
| T-14 | Scale and warnings | A generated 1 000-file folder opens, hashes in the background with the workspace responsive (switching assets under 200 ms), and saves; an asset named after a list person triggers the filename warning; a project last saved 8 days ago shows the list-deletion reminder | R-04, R-30, R-37 |
| T-15 | Viewers by type | `VID-0005.mp4` plays and is not done until played to the end (or "reviewed outside the app" is confirmed and recorded); `AUD-0006.wav` likewise, and the panel heading reads "heard in this recording"; `SNS-0007.csv` shows its first lines; `DOC-0008.pdf` opens in the PDF viewer; a renamed `.mkv` and a `.heic` image show the no-preview fallback and can still be tagged | R-39–R-41 |
| T-16 | Files are never touched | After a full tag-and-save run, every asset's SHA-256, size and last-modified time are unchanged; the only new files in the folder are the sheet and `.dct-progress.json`; a generated 4 GB video hashes in the background with the workspace responsive | R-04, R-38 |

`python -m unittest tools/test_validate_export.py` (20 tests) keeps passing throughout.
