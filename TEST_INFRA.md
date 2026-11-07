# E2E Test Infra: Data Collection Tool (DCT) — Increment 1

## Test Philosophy
- Opaque-box, requirement-driven. No dependency on implementation design.
- Pure user-space verification exercising the browser app exactly as a lab collection agent would.
- Zero network requests strictly verified across all scenarios.
- Methodology: Category-Partition + Boundary Value Analysis (BVA) + Pairwise Combinatorial + Real-World Workload Testing.

---

## Feature Inventory & Test Mapping
| # | Feature | Source | Tier 1 (Functional) | Tier 2 (Boundaries) | Tier 3 (Interactions) |
|---|---------|--------|:-------------------:|:-------------------:|:---------------------:|
| 1 | Air-Gapped App Shell & CSP | ORIGINAL_REQUEST §R1 | T1.01 (connect-src none) | T2.01 (header check) | T3.01 (CSP + Ingestion) |
| 2 | Browser Gate Screen | ORIGINAL_REQUEST §R1 | T1.02 (showDirPicker check) | T2.02 (undefined API) | T3.02 (Gate + Non-Chrome) |
| 3 | Folder Picker Ingestion | ORIGINAL_REQUEST §R2 | T1.03 (valid folder open) | T2.03 (empty folder) | T3.03 (Picker + Scanning) |
| 4 | Recursive Directory Traversal | ORIGINAL_REQUEST §R2 | T1.04 (nested sub/x.png) | T2.04 (deep nesting) | T3.04 (Hidden files filter) |
| 5 | Forward-Slash `asset_id` | data-contract.md §1 | T1.05 (normalized path) | T2.05 (Windows backslash) | T3.05 (Path + Table view) |
| 6 | 6-Type Asset Classification | app-design.md §3.1 | T1.06 (all 6 types) | T2.06 (unknown extension) | T3.06 (Types + Filtering) |
| 7 | Custom `dct-types.json` | app-design.md §3.1 | T1.07 (custom override) | T2.07 (malformed json) | T3.07 (Override + Default) |
| 8 | Web Worker SHA-256 Hashing | app-design.md §3 | T1.08 (hash accuracy) | T2.08 (large file chunks) | T3.08 (Concurrency max 2) |
| 9 | EXIF Capture Time Extraction | app-design.md §3 | T1.09 (Asia/Kolkata -> UTC) | T2.09 (missing tz offset) | T3.09 (EXIF + Table sort) |
| 10 | MP4/MOV `mvhd` Capture Time | app-design.md §3 | T1.10 (06:40:00Z extraction) | T2.10 (corrupted header) | T3.10 (MP4 + Worker hash) |
| 11 | File Date Fallback | app-design.md §3 | T1.11 (lastModified fallback) | T2.11 (zero timestamp) | T3.11 (Fallback flag display) |
| 12 | Asset Immutability | AGENTS.md Rule 4 | T1.12 (byte hash unchanged) | T2.12 (read-only handle) | T3.12 (Scan + No write) |
| 13 | Consented List CSV Parsing | ORIGINAL_REQUEST §R3 | T1.13 (parse 4 participants) | T2.13 (BOM / quotes / CRLF) | T3.13 (CSV + Zod parse) |
| 14 | Rule L01 Enforcement | data-contract.md §4 | T1.14 (missing column reject) | T2.14 (extra columns) | T3.14 (L01 + Error toast) |
| 15 | Rule L02 Enforcement | data-contract.md §4 | T1.15 (mixed project_id) | T2.15 (empty project_id) | T3.15 (L02 + Whole reject) |
| 16 | Rule L03 Enforcement | data-contract.md §4 | T1.16 (mixed list_valid_until) | T2.16 (invalid date format) | T3.16 (L03 + Whole reject) |
| 17 | Rule L04 Enforcement | data-contract.md §4 | T1.17 (duplicate person_id) | T2.17 (case sensitivity) | T3.17 (L04 + Whole reject) |
| 18 | Minor Selectability Evaluation | UC-02, R-10 | T1.18 (is_minor marked false) | T2.18 (string "true" vs bool) | T3.18 (Minor + Disable tag) |
| 19 | Expiry Selectability Evaluation | UC-02, R-11 | T1.19 (expired consent reason) | T2.19 (exact equality edge) | T3.19 (Expiry + Capture time) |
| 20 | In-Memory Privacy Invariant | AGENTS.md Rule 8 | T1.20 (0 storage / logs) | T2.20 (storage attempt catch) | T3.20 (Storage + URL audit) |

---

## Test Architecture
- **Unit & Integration Runner**: Vitest (happy-path, boundary parsing, error codes, in-memory invariants).
- **End-to-End Runner**: Playwright with Chromium (Desktop Chrome) & Firefox (Browser Gate check).
- **Network Gate Interceptor**: Playwright route listener failing immediately on any non-local network request.
- **Data Fixtures**:
  - `docs/consent-tagging/examples/sample-collection/` (reference 8 assets)
  - `docs/consent-tagging/examples/consented_list.sample.csv` (reference 4 participants)
  - Synthetic negative lists for L01, L02, L03, L04.

---

## Real-World Application Scenarios (Tier 4)
| # | Scenario | Features Exercised | Complexity |
|---|----------|--------------------|------------|
| 1 | Standard Lab Ingestion Flow | F1, F3, F4, F5, F6, F8, F9, F10, F12, F13, F18, F19 | High |
| 2 | Hostile / Unsupported Browser Access | F2 (Unsupported browser gate in Firefox) | Medium |
| 3 | Malformed / Corrupted Consented Lists | F14, F15, F16, F17 (L01–L04 rejection whole) | Medium |
| 4 | Custom Sensor Equipment with dct-types.json | F6, F7 (Custom extension mapping and scan) | Medium |
| 5 | Strict Privacy Leak Audit across Storage & URLs | F20 (Zero leakage verification under full workflow) | High |

---

## Coverage Thresholds
- Tier 1: ≥5 test cases per core feature category.
- Tier 2: ≥5 boundary & corner tests.
- Tier 3: Pairwise combinations across ingestion, classification, parsing, and invariants.
- Tier 4: ≥5 end-to-end user workflows.
