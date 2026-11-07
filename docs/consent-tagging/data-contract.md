# Data contract

Version `1`. Two CSV files: the **consented list** we send you, and the **asset export** you
send back. This document is the specification; the validator in
[`tools/validate_export.py`](../../tools/validate_export.py) implements every rule in it, and the
files in [`examples/`](examples/) are valid samples.

## Common rules for both files

| Rule | Value |
|---|---|
| Encoding | UTF-8, no BOM |
| Delimiter | comma; fields containing a comma or quote are quoted with `"` (RFC 4180) |
| Header row | required, exactly the column names below, in any order |
| Line endings | `\n` or `\r\n` |
| Identifiers | `project_id`, `person_id`, `consent_id`, `export_id` are UUIDs, lowercase, with hyphens |
| Timestamps | ISO 8601 in UTC with `Z`, e.g. `2026-11-04T06:02:11Z` |
| Empty value | empty field (two commas), never `null`, `NA` or `-` |

---

## 1. Consented list — we send you

One file per project, named `consented_list_<project_id>_<YYYYMMDD>.csv`. One row per person
who has consented. A newer file for the same project replaces the older one.

| Column | Required | Meaning |
|---|---|---|
| `project_id` | yes | The project; the same on every row |
| `project_name` | yes | Human-readable name, for display only |
| `person_id` | yes | The person, as our consent platform knows them |
| `consent_id` | yes | The consent this person gave for this project |
| `display_name` | yes | Name to show the collection agent so they can find the person |
| `contact_hint` | no | Short disambiguator, e.g. last two digits of a phone number |
| `consent_expires_at` | no | Empty = no expiry |
| `is_minor` | yes | `true` or `false` |
| `list_generated_at` | yes | When we produced the file; the same on every row |
| `list_valid_until` | yes | Do not tag assets captured after this time with this list; the same on every row |

Treat this file as personal data: keep it only on the collection machines, and delete it
when the collection is exported and accepted (see [data-handling.md](data-handling.md)).

---

## 2. Asset export — you send us

One file per collection, named `asset_export_<collection_ref>_<YYYYMMDDTHHMMSSZ>.csv`.
**One row per person per asset**: an asset showing three consented people has three rows.

| Column | Required | Meaning |
|---|---|---|
| `export_id` | yes | A new UUID for this file; the same on every row |
| `exported_at` | yes | When the file was produced; the same on every row |
| `collection_ref` | yes | The collection's name, entered when the folder is opened (default: the folder name); the same on every row |
| `project_id` | yes | Copied from the consented list; the same on every row |
| `asset_id` | yes | The file's path relative to the collection folder, with `/` separators, e.g. `day1/IMG-0001.png`; never reused for another file |
| `asset_type` | yes | `image`, `video`, `audio`, `sensor`, `document` or `other` |
| `captured_at` | yes | When the file was captured |
| `content_sha256` | yes for the DCT | SHA-256 of the file's bytes, 64 lowercase hex characters; the DCT computes it for every file |
| `row_type` | yes | `person`, `bystander`, `no_person` or `deleted` — see below |
| `person_id` | for `person` | Copied from the consented list |
| `consent_id` | for `person` | Copied from the same consented-list row as `person_id` |
| `bystander_count` | for `bystander` | How many people without consent appear in the asset |

### Row types

| `row_type` | Use when | `person_id`, `consent_id` | `bystander_count` |
|---|---|---|---|
| `person` | A consented person from the list appears in the asset | both required | empty |
| `bystander` | Someone **not** on the list, or not identifiable, appears in the asset | both empty | 1 or more |
| `no_person` | Nobody appears in the asset (e.g. an empty room, a sensor trace) | both empty | empty |
| `deleted` | The file was deleted after an earlier export (usually to resolve a bystander) | both empty | empty |

Each asset has **either** exactly one `no_person` row, **or** exactly one `deleted` row, **or**
one or more `person` rows and at most one `bystander` row. A `bystander` row never stands alone:
if only people without consent appear in a file, delete the file instead of exporting it. Every row of one asset repeats the same `asset_type`, `captured_at`
and `content_sha256`.

### What a bystander row does

An asset with a `bystander` row is **held** on our side: it is not released for research until
it is fixed. To fix it, either redact the bystander from the file (it gets a new
`content_sha256`) or delete the file, then send a new export:

- **Redacted** — send the asset again with its `person` rows and no `bystander` row.
- **Deleted** — send the asset again as a single `deleted` row.

A later export containing the same `asset_id` replaces all of that asset's earlier rows.

### Example

| asset_id | row_type | person_id | consent_id | bystander_count |
|---|---|---|---|---|
| IMG-0001.png | person | 3f1c…a1 | 9b2e…01 | |
| IMG-0001.png | person | 7a44…b2 | 1d90…02 | |
| IMG-0002.png | person | 3f1c…a1 | 9b2e…01 | |
| IMG-0002.png | bystander | | | 1 |
| IMG-0004.png | no_person | | | |

The full sample, with every column, is
[`examples/asset_export.sample.csv`](examples/asset_export.sample.csv); it describes the four
synthetic images in [`examples/sample-collection/`](examples/sample-collection/), and its hashes
are those files' real SHA-256 values. [`examples/golden/`](examples/golden/) holds one invalid
sheet per error code, with the codes each must produce in `expected.json`.

---

## 3. Validation before export

Your tool must not produce an export that fails any **error** below. Run
`tools/validate_export.py` on every export before sending it; it exits non-zero on any error.

Checks on the consented list itself (also apply when the tool loads a list):

| Code | Error |
| --- | --- |
| L01 | A required list column is missing |
| L02 | The list holds more than one `project_id`, or none |
| L03 | `list_valid_until` is missing, invalid, or differs between rows |
| L04 | The same `person_id` appears twice |

Checks on the export:

| Code | Error |
|---|---|
| E01 | A required column is missing, or an unknown column is present |
| E02 | A UUID field is not a valid lowercase UUID |
| E03 | `project_id` differs from the consented list, or between rows |
| E04 | `person_id` is not on the consented list |
| E05 | `consent_id` does not belong to that `person_id` on the list |
| E06 | The person is a minor (`is_minor = true`) |
| E07 | The consent had expired at `captured_at` |
| E08 | `captured_at` is after the list's `list_valid_until` |
| E09 | A row's fields do not match its `row_type` (table above) |
| E10 | The same person appears twice on one asset |
| E11 | An asset mixes `no_person` or `deleted` with other rows, has more than one `bystander` row, or has a `bystander` row with no `person` row |
| E12 | `asset_type` is not one of the allowed values |
| E13 | A timestamp is not ISO 8601 UTC with `Z`, or `captured_at` is in the future |
| E14 | `export_id`, `exported_at` or `collection_ref` differs between rows |
| E15 | `content_sha256` is present but not 64 lowercase hex characters |
| E16 | The rows of one asset disagree on `asset_type`, `captured_at` or `content_sha256` |

| Code | Warning (export allowed) |
|---|---|
| W01 | `content_sha256` is empty |
| W02 | Bystander rows are present — those assets will be held |

## 4. What happens on our side

You do not need to build any of this; it is here so you know why the rules exist.

1. We import the export and check it against the same rules.
2. **We re-check every consent against its current state.** If a person withdrew after
   capture, their assets are held and you will receive a list of `asset_id`s to delete.
3. Assets with bystander rows are held until a corrected export arrives.
4. Everything else is released for research, with its consent recorded against it.

## 5. Changes to this contract

A change gets a new version number, a note in this file, and a matching change to the
validator and samples in the same release.
