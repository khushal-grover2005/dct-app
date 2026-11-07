# Data handling

The consented list and the assets describe real people. During development the team uses
**none** of them.

## While building

1. **Synthetic data only.** Use `examples/` — the sample list, sheets and the synthetic collection:
   assets of abstract figures, a test-pattern video, tone audio, a generated sensor trace and
   a PDF, all marked "not a real person". Do not use photos, recordings or
   names of yourselves or anyone else in code, tests, demos or screenshots.
2. **No real lists or assets until we say so.** The first real collection is tagged only after
   increment 5 is accepted.
3. **No third-party services.** The app makes no network calls at all (CSP `connect-src
   'none'`). No analytics, error reporting, fonts or assets from the internet. Using a coding
   agent to write the code is fine; the app itself never calls one.
4. **Secrets stay out of the repository** (the app should not need any).

## In the app, once real data arrives

| Rule | Requirement |
|---|---|
| Files are read from the folder, never uploaded and never modified | R-06, R-38 |
| The consented list stays in memory; names never reach browser storage, the progress file, the URL or logs | R-08, R-22 |
| Ids are copied from the list, never typed | R-13 |
| Filenames that contain a person's name are flagged | R-30 |
| Deletion requests remove the files from the folder and are confirmed in a correction sheet | R-35, R-36 |
| The list file is deleted once the collection's sheet is accepted; the app reminds after 7 days | R-37 |

## Reporting a problem

Real personal data in the repository, a list or asset sent somewhere it should not be, or a
deletion that could not be completed → tell the faculty lead and the product contact the same
day, directly, not in a public issue.
