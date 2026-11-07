# Data Collection Tool (DCT) — specification pack v3

Everything needed to build the DCT: a browser app in which a collection agent opens a folder
of captured files (images, video, audio, sensor data, documents), tags the consented people in
each one, and saves a metadata sheet. This pack holds
the design, the data contract, synthetic samples, a reference validator with golden test cases,
the use cases, the plan and the instructions for a coding agent.

## Start the repository

Create a new repository and copy this pack into its root as the first commit:

```
AGENTS.md  CLAUDE.md  README.md          instructions for the coding agent
docs/consent-tagging/                    overview, app design, data contract, use cases,
                                         plan, acceptance tests, data handling
docs/consent-tagging/examples/           sample list, sample sheets, a sample collection of
                                         images, video, audio, sensor and PDF files,
                                         golden/ (one invalid sheet per error code)
tools/validate_export.py                 the reference validator (Python 3.9+, no installs)
tools/test_validate_export.py            its tests, including the golden cases
```

The app itself (`package.json`, `src/`, `e2e/`) is created in increment 1.

## Try the reference validator

```bash
python tools/validate_export.py \
  --list   docs/consent-tagging/examples/consented_list.sample.csv \
  --export docs/consent-tagging/examples/asset_export.sample.csv \
  --now 2026-11-05T12:00:00Z
# WARNING W02 … IMG-0002.png    VALID: 11 rows, 8 assets, 0 errors, 1 warnings

python -m unittest tools/test_validate_export.py      # 20 tests, 18 golden cases
```

## Start with the coding agent

> Work on increment 1 of the DCT plan. Read AGENTS.md first, then the documents it lists.
> Propose a plan before writing code.
