# AGENTS.md — the Data Collection Tool (DCT)

You are building the **DCT**: a browser app that runs on a lab's collection machine. The agent
opens a folder of captured files — images, video, audio, sensor recordings, documents — and the
consented list for the project, tags the people in each file, and the app saves a **metadata
sheet** (CSV) into the folder. For every asset the sheet records which consented people appear in it — `project_id`, `person_id`, `consent_id` — plus
bystanders, or that nobody appears.

There is no server. Nothing is uploaded. The app makes no network request after it loads.

Read this file completely before every session. Then read, in order:

1. [docs/consent-tagging/overview.md](docs/consent-tagging/overview.md) — what and why
2. [docs/consent-tagging/app-design.md](docs/consent-tagging/app-design.md) — screens, state, stack, files
3. [docs/consent-tagging/data-contract.md](docs/consent-tagging/data-contract.md) — the list, the sheet, every rule
4. [docs/consent-tagging/use-cases.md](docs/consent-tagging/use-cases.md) — what the app must do
5. [docs/consent-tagging/implementation-plan.md](docs/consent-tagging/implementation-plan.md) — find your increment

## Rules

1. **Stack is fixed**: React 18 + TypeScript strict + Vite static build, Chrome/Edge, File
   System Access API, papaparse, exifr, mp4box.js, hash-wasm, zod, vitest, Playwright, npm.
   No backend, no SSR, no telemetry, no remote fonts or assets. See app-design.md §1.
2. **No network.** The CSP sets `connect-src 'none'`. Do not add any fetch, beacon, or library
   that phones home.
3. **The three ids are copied, never typed.** `person_id` comes from the list row the agent
   selects; `consent_id` is looked up from the list when the sheet is written; `project_id` is
   the list's. No screen offers an input for any of them.
4. **One row per person per asset** in the sheet, and **never modify an asset file** — no
   conversion, re-encoding, renaming or metadata writing. The sheet binds metadata to each file
   by path and SHA-256 (app-design.md §9).
5. **Bystanders are always recorded** and never dropped to make a save pass. Only redaction
   (a changed file hash) or deletion clears them.
6. **Minors, expired consents and expired lists are not selectable.**
7. **Validate before save.** The TypeScript validator in `src/validation/` is a faithful port
   of `tools/validate_export.py`. It must pass every case in
   `docs/consent-tagging/examples/golden/expected.json`. Save is disabled while any error exists.
8. **Names stay in memory.** The consented list is never written to browser storage, the
   progress file, the URL, logs or error messages. The progress file holds identifiers only.
9. **Do not change the data contract or the golden cases.** A needed change goes into
   `docs/consent-tagging/open-questions.md`, and you stop.
10. **Synthetic data only** — the files in `docs/consent-tagging/examples/`. No photos or names
    of real people anywhere in the repository.

## Done means

- The increment's acceptance tests in
  [acceptance-tests.md](docs/consent-tagging/acceptance-tests.md) pass.
- `npm test` (including the golden cases), `npm run e2e`, `npm run lint` and `tsc --noEmit` pass.
- `python -m unittest tools/test_validate_export.py` still passes.
- A sheet saved by the app from the sample collection validates with
  `tools/validate_export.py`.
- Documents the change affects are updated in the same pull request.

## Report back

End each session with a short entry at the top of `docs/consent-tagging/session-log.md`: what
changed, which tests now pass, anything deferred, any question added. Never claim a test
passes unless it has run.
