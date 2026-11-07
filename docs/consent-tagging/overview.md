# Overview

## What we are asking for

Build the **Data Collection Tool (DCT)**: a browser app on the lab's collection machine that
turns a folder of captured files — assets, video, audio, sensor recordings, documents — into a
metadata sheet saying **who appears in each file, under which consent**.

The flow for a collection:

1. The agent opens the collection's **folder** and the **consented list** we sent for the
   project.
2. For **each asset**, the agent views or plays it and selects the consented people who appear
   in it (seen or heard). The app copies
   `project_id`, `person_id` and `consent_id` from the list — nothing is typed.
3. If anyone not on the list appears, the agent records how many (**bystanders**). If nobody
   appears, the agent marks the asset **no person**.
4. The app **checks** every tag against the list.
5. The app **saves the metadata sheet** — one CSV per collection, one row per person per asset —
   into the folder. That sheet comes to us with the assets.

Files never leave the machine and are never changed: the app reads them from the folder, shows
or plays them, hashes them, and writes the sheet beside them. There is no server and no upload.
Each sheet row names its file by path and by SHA-256, which is how the metadata stays bound to
the file (app-design.md §9).

## Why each part exists

| Part | Without it |
|---|---|
| Ids copied from the list | One typo links an asset to the wrong person's consent |
| One row per person per asset | An asset with several people would lose all but one consent |
| Bystander count | A person who never agreed would be released for research with no trace |
| No minors | Consent for children needs a guardian process that is not part of this version |
| Check against the list | Expired consents and wrong projects would only be caught after delivery |
| A SHA-256 per file | We could not tell whether the file we receive is the one that was tagged |
| No server, no upload | Recordings of people stay on the controlled machine they were captured on |

## What happens after the sheet is saved

You do not build this. On our side, every sheet is checked again and **every consent is
re-checked against its current state**: if someone withdrew after capture, their assets are
held and we send the `asset_id`s to delete. Images with a bystander are held until a
correction sheet arrives. Everything else is released with its consent recorded against it.

## Legal context, briefly

This supports compliance with India's Digital Personal Data Protection Act, 2023 and the DPDP
Rules, 2025: consent must be specific and verifiable, withdrawal must stop processing, and data
must be deleted when consent is withdrawn. You do not need to interpret the law; the use cases
and the data contract encode what the app needs to do.

## Decisions already made

| Decision | Reason |
|---|---|
| Local browser app, no server | Nothing to host or secure; assets and names stay on the machine |
| Chrome or Edge only | The only browsers that can open and write a folder (File System Access API) |
| Files opened from a folder, not uploaded | Same reason; the sheet sits beside the files |
| Metadata in the sheet, not inside the files | Writing into files changes their hash and works for few formats |
| All asset types in this version | Images, video, audio, sensor, documents and other files, each with a suitable viewer |
| CSV sheet, one row per person per asset | Every tool reads it; simplest shape for several people per asset |
| Bystanders flagged, not blocked | The agent records what happened; we decide what to hold |
| We re-check consent on import | Withdrawals after capture are caught on our side |
| A reference validator with golden cases | One definition of "valid", testable from day one in both languages |
