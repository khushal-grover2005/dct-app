# Use cases

Eight use cases covering every asset type — image, video, audio, sensor, document and other. Each carries numbered requirements (`R-nn`) that the acceptance tests cite.
The actor is the **collection agent** unless stated; the **coordinator** is the lab person who
handles corrections and deletion requests (often the same person). Screens are described in
[app-design.md](app-design.md); file rules in [data-contract.md](data-contract.md).

| ID | Use case | Screen |
|---|---|---|
| UC-01 | Open a collection folder | Start |
| UC-02 | Load the consented list | Start |
| UC-03 | Tag the people in an asset | Tagging workspace |
| UC-04 | Record bystanders, or nobody | Tagging workspace |
| UC-05 | Resume a collection | Start |
| UC-06 | Review and save the metadata sheet | Review |
| UC-07 | Correct held assets | Corrections |
| UC-08 | Process a deletion request | Corrections |

---

### UC-01 · Open a collection folder

1. The agent clicks **Open collection folder** and picks the folder.
2. The app lists every asset in it and its subfolders, reads each asset's capture time, and
   starts hashing in the background.
3. The agent confirms or edits the collection name (default: the folder name).

| # | Requirement |
|---|---|
| R-01 | Every file in the folder and its subfolders is an asset, except hidden files and the app's own files; each gets an `asset_type` from its extension (app-design.md §3.1), extendable per collection with `dct-types.json`. |
| R-02 | Each asset's `asset_id` is its path relative to the folder with `/` separators. |
| R-03 | Capture time is EXIF `DateTimeOriginal` for assets (interpreted in the configured time zone, stored in UTC), the `mvhd` creation time for MP4/MOV, and otherwise the file's last-modified time, marked as such. |
| R-04 | Each asset's SHA-256 is computed from its bytes, streamed in chunks; hashing runs in the background and shows progress; a 1 000-file folder and a 4 GB video both stay responsive. |
| R-05 | In a browser without the File System Access API the app shows one page explaining that Chrome or Edge is required, and nothing else. |
| R-06 | No file byte, filename or hash is sent over the network. The page's CSP has `connect-src 'none'`. |
| R-38 | The app never modifies, converts, re-encodes or writes into an asset file; the only files it writes are the sheet and the progress file (and deletes, on request, under UC-07 and UC-08). |

### UC-02 · Load the consented list

1. The agent picks the list file.
2. The app checks it (L01–L04) and shows project, people, how many are not selectable, and
   `list_valid_until`.

| # | Requirement |
|---|---|
| R-07 | A list failing L01–L04 is refused whole, with the reason. |
| R-08 | The list is held in memory only; it is never written to browser storage, the progress file, the URL or logs. |
| R-09 | When resuming, a list for a different project than the progress file's is refused. |

### UC-03 · Tag the people in an asset

1. The agent opens an asset; it shows large, with zoom.
2. The agent searches the list by name or contact hint and selects each person who appears.
3. The app records the person on the asset and saves progress.

| # | Requirement |
|---|---|
| R-10 | Rows with `is_minor = true` show the reason and have no Select action. |
| R-11 | Rows whose consent had expired at the asset's capture time show the date and have no Select action. |
| R-12 | When the asset was captured after `list_valid_until`, no row is selectable and the app asks for a newer list. |
| R-13 | No screen lets a user type or edit `project_id`, `person_id` or `consent_id`. |
| R-14 | A person can be selected once per asset; selecting again does nothing. |
| R-15 | A person not on the list cannot be added; they can only be counted as a bystander. |
| R-16 | Selected people can be removed until the sheet is saved. |
| R-17 | The workspace is fully usable by keyboard: next/previous asset, play/pause, search, select, no person, add bystander. |
| R-39 | Each type has a viewer (asset, video, audio, sensor text, PDF); a file the browser cannot show falls back to type, size and capture time, with "view this file in your usual viewer, then tag it here". |
| R-40 | The people panel states what "appears" means for the type (visible, visible or heard, heard, wore the device, named in the document). |

### UC-04 · Record bystanders, or nobody

| # | Requirement |
|---|---|
| R-18 | **Others in this asset** records a bystander count from 0 to 20. |
| R-19 | **No person in this asset** cannot be turned on while people are selected or bystanders counted, and disables both while on. |
| R-20 | An asset is done when it has at least one selected person, or "No person" on. An asset with bystanders and no selected person is never done and shows "bystander only — delete this file". |
| R-21 | The asset list shows each asset's type and state and a done count; it can filter by state and by type. |
| R-41 | A video or audio asset is done only after it has been played to the end in the app, or the agent confirms they reviewed it outside the app; the confirmation is recorded in the progress file. |

### UC-05 · Resume a collection

1. The agent opens a folder that already has a progress file.
2. The app offers **Resume**, restores every tag, and asks for the consented list.

| # | Requirement |
|---|---|
| R-22 | Progress is saved to `.dct-progress.json` in the folder within one second of every change; it holds identifiers only (app-design.md §4). |
| R-23 | On resume, assets missing from the folder are shown as *missing*, new assets as *untagged*, and assets whose hash changed since the last save as *changed — check tags*. |
| R-24 | A crash or reload loses at most the last second of tagging. |

### UC-06 · Review and save the metadata sheet

1. The agent opens **Review**. The app validates the whole collection.
2. With no errors and every asset done, the agent clicks **Save sheet**.

| # | Requirement |
|---|---|
| R-25 | Review runs the TypeScript validator over the exact rows the sheet would contain. |
| R-26 | Each error is listed against its asset with the validator's code and message, and links back to that asset. |
| R-27 | **Save sheet** is disabled while any error exists or any asset is not done. |
| R-28 | Assets held for bystanders are listed before saving. |
| R-29 | The sheet is written into the folder per the data contract, with a new `export_id`; the app shows the file name. A download copy is offered as well. |
| R-30 | The review screen warns when an asset path contains a name from the list. |

### UC-07 · Correct held assets

**Actor** Coordinator. **Trigger** A saved sheet had assets with bystanders.

| # | Requirement |
|---|---|
| R-31 | **I redacted it** re-hashes the file; an unchanged hash is refused; a changed hash clears the bystander count and keeps the selected people. |
| R-32 | **I deleted it** marks the asset `deleted` once the file is gone, or deletes it after confirmation. |
| R-33 | **Save correction sheet** writes only the corrected assets, with the same `collection_ref` and a new `export_id`, and it validates. |
| R-34 | A bystander count can be cleared only through R-31 or R-32. |

### UC-08 · Process a deletion request

**Actor** Coordinator. **Trigger** We send a list of `asset_id`s to delete — for example after a
person withdrew consent.

| # | Requirement |
|---|---|
| R-35 | The coordinator loads or pastes the `asset_id`s; the app shows which it found in the folder and which it did not. |
| R-36 | One confirmation deletes all found files from the folder; each becomes a `deleted` row in a correction sheet. |
| R-37 | The Start screen reminds the coordinator to delete the consented list file for any project whose last sheet is more than 7 days old. |
