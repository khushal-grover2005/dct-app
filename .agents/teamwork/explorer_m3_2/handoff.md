# Milestone 3 Exploration Report: Participant Selectability Evaluation Logic & Edge Cases

## 1. Observation

### 1.1 Specification Citations & Constraints
- **AGENTS.md Rule 6**:
  > "6. Minors, expired consents and expired lists are not selectable."
- **docs/consent-tagging/data-contract.md §1 & §3**:
  - `consent_expires_at`: `"Empty = no expiry"` (line 35).
  - `is_minor`: `"true or false"` (line 36).
  - `list_valid_until`: `"Do not tag assets captured after this time with this list; the same on every row"` (line 38).
  - Error **E06**: `"The person is a minor (is_minor = true)"` (line 131).
  - Error **E07**: `"The consent had expired at captured_at"` (line 132).
  - Error **E08**: `"captured_at is after the list's list_valid_until"` (line 133).
- **docs/consent-tagging/app-design.md §2.1 & §2.2**:
  - Start screen (line 48–50): `"Load consented list — file picker ... Shows project name, people, how many are not selectable (minors, expired), and list_valid_until. Applies L01–L04; a failing list is refused whole."`
  - Workspace people pane (line 64–69): `"Results with a Select button; not-selectable rows greyed with the reason (*minor*, *consent expired 3 Nov*). Selected people as chips with ✕ ... a minor or expired row has no Select button; after list_valid_until, or for an asset captured after it, every row is unselectable."`
- **docs/consent-tagging/use-cases.md (UC-02 & UC-03)**:
  - **R-10**: `"Rows with is_minor = true show the reason and have no Select action."` (line 58)
  - **R-11**: `"Rows whose consent had expired at the asset's capture time show the date and have no Select action."` (line 59)
  - **R-12**: `"When the asset was captured after list_valid_until, no row is selectable and the app asks for a newer list."` (line 60)
- **docs/consent-tagging/acceptance-tests.md**:
  - **T-03**: `"The sample list loads (4 people, 2 not selectable); copies with a missing column, two project ids, mixed list_valid_until or a duplicate person_id are refused; after load, localStorage, sessionStorage and IndexedDB contain no display name"` (line 11)
  - **T-04**: `"Synthetic Person 003 (expired before capture) and 004 (minor) show a reason and no Select; for an asset captured after list_valid_until nobody is selectable"` (line 12)

### 1.2 Python Validator Implementation Reference (`tools/validate_export.py`)
Lines 185–193 directly implement the exact mathematical comparisons:
```python
185:            if entry["is_minor"].lower() == "true":
186:                report.error("E06", f"person_id {pid} is a minor and cannot be tagged", i, a)
187:            expires = parse_ts(entry["consent_expires_at"]) if entry["consent_expires_at"] else None
188:            if captured and expires and captured >= expires:
189:                report.error("E07", f"consent {cid} expired at {entry['consent_expires_at']}, "
190:                                    f"before capture", i, a)
191:            if captured and list_valid_until and captured > list_valid_until:
192:                report.error("E08", f"captured_at is after the list's list_valid_until "
193:                                    f"({list_valid_until.isoformat().replace('+00:00', 'Z')})", i, a)
```
- Line 188 uses `>=`: `captured >= expires` (i.e. `consent_expires_at <= captured_at` is expired; exact second match is expired).
- Line 191 uses `>`: `captured > list_valid_until` (exact second match is still valid; strictly after is invalid).

### 1.3 Sample Consented List Content (`docs/consent-tagging/examples/consented_list.sample.csv`)
```csv
project_id,project_name,person_id,consent_id,display_name,contact_hint,consent_expires_at,is_minor,list_generated_at,list_valid_until
6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,Synthetic gait study,3f1c9d2a-1b2c-4d3e-8f4a-5b6c7d8e9fa1,9b2e4f6a-8c0d-4e1f-a2b3-c4d5e6f70101,Synthetic Person 001,…01,,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z
6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,Synthetic gait study,7a44b1c2-d3e4-4f50-9a6b-7c8d9e0f1ab2,1d90a2b3-c4d5-4e6f-8a9b-0c1d2e3f0202,Synthetic Person 002,…02,2027-05-01T00:00:00Z,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z
6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,Synthetic gait study,c2d3e4f5-a6b7-4c8d-9e0f-1a2b3c4d5e03,5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f70303,Synthetic Person 003,…03,2026-11-03T00:00:00Z,false,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z
6f1c2a8e-4b7d-4c1a-9e2f-3a5b7c9d1e01,Synthetic gait study,d4e5f6a7-b8c9-4d0e-8f1a-2b3c4d5e6f04,6f7a8b9c-0d1e-4f2a-b3c4-d5e6f7080404,Synthetic Person 004,…04,,true,2026-11-01T04:30:00Z,2026-11-08T04:30:00Z
```

### 1.4 Sample Collection Asset Capture Times (`docs/consent-tagging/examples/asset_export.sample.csv`)
All 8 assets in the sample collection have `captured_at` timestamps on `2026-11-04` between `2026-11-04T06:02:11Z` (IMG-0001) and `2026-11-04T07:00:00Z` (DOC-0008).

---

## 2. Logic Chain

### 2.1 Criteria for Non-Selectability
1. **Minor Participants**:
   - Observation: AGENTS.md Rule 6, UC-03 R-10, `validate_export.py` lines 185–186 (E06).
   - Invariant: A participant with `is_minor === true` (or case-insensitive `"true"`) can NEVER be selected under any condition.
   - Reason Code: `'minor'`.
   - UI Rendering: Row is disabled/greyed out with no "Select" button, displaying the text label `"minor"`.

2. **Expired Consents**:
   - Observation: data-contract.md §3 E07, UC-03 R-11, `validate_export.py` line 188.
   - Operator: If `reference_time >= consent_expires_at` (equivalent to `consent_expires_at <= reference_time`), the consent has expired.
   - Empty/Null: If `consent_expires_at` is empty or null, consent does not expire.
   - Reason Code: `'expired'`.
   - UI Rendering: Row is disabled/greyed out with no "Select" button, displaying formatted label such as `"consent expired 3 Nov"`.

3. **Semantics of `reference_time`**:
   - **Context 1: In the Tagging Workspace (UC-03)**:
     - `reference_time` IS the asset's `capturedAt` timestamp.
     - Logic: Consent validity is bound to the exact moment the data was captured. A consent that was valid when a photo was taken on Nov 4 remains valid for that photo even if the collection agent performs tagging on Nov 15. Conversely, if consent expired on Nov 3, an asset captured on Nov 4 cannot tag that participant.
   - **Context 2: On List Load / Start Screen (UC-02)**:
     - On the Start screen, the list status badge displays summary counters: total participants and how many are non-selectable (T-03).
     - At this stage, no asset is selected. The evaluation functions must accept an optional `referenceTime?: string | Date`.
     - In production, if a collection folder is already open, `reference_time` defaults to the collection assets' capture time (or current time `new Date()`).
     - In the sample data: Person 003 expired on `2026-11-03T00:00:00Z`. Whether evaluated against sample asset capture times (`2026-11-04T06:02:11Z`), test `NOW` (`2026-11-05T12:00:00Z`), or current date, Person 003 is expired, giving exactly 2 non-selectable participants.

4. **Expired Lists (`list_valid_until`)**:
   - Observation: data-contract.md E08, UC-03 R-12, `validate_export.py` line 191.
   - Operator: `asset.capturedAt > list_valid_until` (strict inequality). If `capturedAt == list_valid_until`, it is valid.
   - Scope of Effect: List expiration is not merely an individual attribute; it is an **asset-level blocker**.
   - Behavior: If an asset was captured after `list_valid_until`, all participants become unselectable for that asset, and the workspace displays a prompt requesting a newer consented list.
   - List Ingestion Distinction: Rule L03 verifies that `list_valid_until` is present, well-formed, and consistent across rows. An expired `list_valid_until` relative to `Date.now()` is NOT rejected during list loading because collection assets may have been captured in the past when the list was valid.

### 2.2 Precedence and Multi-Reason Handling
- **Scenario**: A participant has both `is_minor === true` AND `consent_expires_at <= reference_time`.
- **Precedence Rule**:
  1. Primary Reason: `'minor'` takes precedence over `'expired'`.
  2. Rationale: Minor status is an immutable, foundational legal constraint ("minors are never selectable" - AGENTS.md Rule 6). A minor participant was legally incapable of providing adult consent in the first place, making the expiry of that consent secondary to their minority status.
  3. Structured API Design:
     To satisfy both single-reason UI badges (`nonSelectableReason?: 'minor' | 'expired' | 'list_expired'`) and forensic/audit logging, the evaluation function returns:
     - `isSelectable: boolean`
     - `reason?: 'minor' | 'expired' | 'list_expired'` (primary reason)
     - `allReasons: Array<'minor' | 'expired' | 'list_expired'>` (all active reasons)
     - `formattedReason?: string` (human-readable string for UI chips)

### 2.3 Evaluation on Sample Data (`consented_list.sample.csv`)

| Person ID | Display Name | `is_minor` | `consent_expires_at` | Evaluation against Ref Time (`2026-11-04`) | `isSelectable` | Primary Reason | UI Text |
| :--- | :--- | :---: | :---: | :--- | :---: | :---: | :--- |
| `3f1c9d2a-…-5b6c7d8e9fa1` | Synthetic Person 001 | `false` | *(empty)* | Consent never expires; adult | **`true`** | `undefined` | "Select" |
| `7a44b1c2-…-7c8d9e0f1ab2` | Synthetic Person 002 | `false` | `2027-05-01T00:00:00Z` | Valid until May 2027 (`2026-11-04 < 2027-05-01`) | **`true`** | `undefined` | "Select" |
| `c2d3e4f5-…-1a2b3c4d5e03` | Synthetic Person 003 | `false` | `2026-11-03T00:00:00Z` | Expired before capture (`2026-11-04 >= 2026-11-03`) | **`false`** | `'expired'` | "consent expired 3 Nov" |
| `d4e5f6a7-…-2b3c4d5e6f04` | Synthetic Person 004 | `true` | *(empty)* | Minor status is absolute | **`false`** | `'minor'` | "minor" |

**Sample Summary Verification**:
- Total participants: 4
- Selectable participants: 2 (Person 001, Person 002)
- Non-selectable participants: 2 (Person 003, Person 004)
- **Direct Acceptance Test T-03 Match**: *"The sample list loads (4 people, 2 not selectable)"*.

### 2.4 Edge Cases & Boundary Conditions
1. **Exact-Second Boundary Comparison**:
   - `reference_time === consent_expires_at`: Evaluates to **expired** (`consent_expires_at <= reference_time`). At the exact second of expiration, consent is no longer active.
   - `reference_time === list_valid_until`: Evaluates to **valid** (`reference_time > list_valid_until` is false). A list is valid up to and including the second specified.
2. **Sub-second Precision**:
   - Timestamps with fractional seconds (e.g. `.500Z`): Compare using millisecond timestamps (`date.getTime()`). If `reference_time = 06:02:11.500Z` and `expires = 06:02:11.000Z`, it is correctly identified as expired.
3. **Malformed Timestamps**:
   - Any non-empty `consent_expires_at` or `list_valid_until` that fails ISO 8601 UTC regex (`^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?Z$`) must fail Zod validation during list loading, halting the process before evaluation.
4. **Timezone Offsets**:
   - Local offsets (e.g. `+05:30`, `-04:00`, `+00:00`) or dates lacking timezone designators are strictly invalid per data-contract.md §Common rules (must end in `Z`). Validator error **E13** enforces this.
5. **String Booleans**:
   - CSV parsers return strings. The evaluator must handle both boolean `true` and string `"true"` (case-insensitive: `"true"`, `"TRUE"`, `"True"`). Any other value is treated as `false`.

---

## 3. Caveats
- **Revocation**: The data contract schema defines `consent_expires_at` and `is_minor`. While `ConsentedPerson` interface in `PROJECT.md` mentions `'revoked'` as a possible union member in `nonSelectableReason`, consented lists do not currently contain a `is_revoked` column. Per data contract §4.2, post-capture withdrawals result in deletion requests sent by the coordinator, not list flags.
- **Reference Time Fallback**: When no asset is selected and no explicit `referenceTime` is passed to the selectability evaluator, defaulting to `new Date()` ensures real-time evaluation, but unit tests must pass an explicit timestamp for deterministic assertions.

---

## 4. Conclusion & Concrete Design Blueprint

### 4.1 Recommended Module Architecture: `src/list/selectability.ts`
Implement `src/list/selectability.ts` with the following clean, typed interface:

```typescript
export type NonSelectableReason = 'minor' | 'expired' | 'list_expired';

export interface ParticipantSelectabilityResult {
  isSelectable: boolean;
  reason?: NonSelectableReason;
  allReasons: NonSelectableReason[];
  formattedReason?: string;
}

export interface SelectabilityOptions {
  referenceTime?: string | Date;
  listValidUntil?: string | Date;
}

/**
 * Evaluates whether a participant can be tagged given a reference time (asset capture time or current time).
 */
export function evaluateSelectability(
  isMinor: boolean | string,
  consentExpiresAt?: string | Date | null,
  options?: SelectabilityOptions
): ParticipantSelectabilityResult {
  const allReasons: NonSelectableReason[] = [];

  // 1. Minor check (absolute invariant)
  const minorFlag = typeof isMinor === 'string' ? isMinor.trim().toLowerCase() === 'true' : Boolean(isMinor);
  if (minorFlag) {
    allReasons.push('minor');
  }

  // Parse reference time
  const refDate = options?.referenceTime
    ? typeof options.referenceTime === 'string'
      ? new Date(options.referenceTime)
      : options.referenceTime
    : new Date();

  // 2. Consent expiration check (<= comparison)
  if (consentExpiresAt) {
    const expDate = typeof consentExpiresAt === 'string' ? new Date(consentExpiresAt) : consentExpiresAt;
    if (!isNaN(expDate.getTime()) && !isNaN(refDate.getTime())) {
      if (refDate.getTime() >= expDate.getTime()) {
        allReasons.push('expired');
      }
    }
  }

  // 3. List expiration check (> comparison)
  if (options?.listValidUntil) {
    const validUntilDate =
      typeof options.listValidUntil === 'string' ? new Date(options.listValidUntil) : options.listValidUntil;
    if (!isNaN(validUntilDate.getTime()) && !isNaN(refDate.getTime())) {
      if (refDate.getTime() > validUntilDate.getTime()) {
        allReasons.push('list_expired');
      }
    }
  }

  const isSelectable = allReasons.length === 0;
  // Precedence order: minor > expired > list_expired
  const primaryReason = allReasons.includes('minor')
    ? 'minor'
    : allReasons.includes('expired')
    ? 'expired'
    : allReasons.includes('list_expired')
    ? 'list_expired'
    : undefined;

  let formattedReason: string | undefined;
  if (primaryReason === 'minor') {
    formattedReason = 'minor';
  } else if (primaryReason === 'expired' && consentExpiresAt) {
    const expDate = typeof consentExpiresAt === 'string' ? new Date(consentExpiresAt) : consentExpiresAt;
    formattedReason = formatExpiryDate(expDate);
  } else if (primaryReason === 'list_expired') {
    formattedReason = 'list expired';
  }

  return {
    isSelectable,
    reason: primaryReason,
    allReasons,
    formattedReason,
  };
}

function formatExpiryDate(date: Date): string {
  // Matches "consent expired 3 Nov" format from app-design.md §2.2
  const day = date.getUTCDate();
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[date.getUTCMonth()];
  return `consent expired ${day} ${month}`;
}
```

---

## 5. Verification Method

### 5.1 Verification Commands
1. **Existing Test Suite**:
   ```powershell
   npm test
   ```
   Ensures all 107 existing unit tests in Milestone 1 & 2 pass without regressions.
2. **Python Validator Parity Test**:
   ```powershell
   python -m unittest tools/test_validate_export.py
   ```
   Ensures 20 Python tests (including E06, E07, E08, and golden cases) pass cleanly.
3. **TypeScript Typecheck**:
   ```powershell
   npm run typecheck
   ```
   Ensures strict TypeScript compliance with zero errors.

### 5.2 Unit Test Cases for Implementer (`tests/unit/list/selectability.test.ts`)
The implementer can independently verify against the following test matrix:
1. `Person 001`: `is_minor: false`, `consent_expires_at: null` -> `isSelectable: true`, `reason: undefined`.
2. `Person 002`: `is_minor: false`, `consent_expires_at: "2027-05-01T00:00:00Z"`, `ref: "2026-11-04T06:00:00Z"` -> `isSelectable: true`.
3. `Person 003`: `is_minor: false`, `consent_expires_at: "2026-11-03T00:00:00Z"`, `ref: "2026-11-04T06:00:00Z"` -> `isSelectable: false`, `reason: "expired"`, `formattedReason: "consent expired 3 Nov"`.
4. `Person 004`: `is_minor: true`, `consent_expires_at: null` -> `isSelectable: false`, `reason: "minor"`.
5. `Precedence`: `is_minor: true` AND `consent_expires_at: "2026-11-03T00:00:00Z"` -> `isSelectable: false`, `reason: "minor"`, `allReasons: ["minor", "expired"]`.
6. `Boundary Equality 1`: `ref: "2026-11-03T00:00:00Z"`, `consent_expires_at: "2026-11-03T00:00:00Z"` -> `isSelectable: false` (exact second match is expired).
7. `Boundary Equality 2`: `ref: "2026-11-08T04:30:00Z"`, `list_valid_until: "2026-11-08T04:30:00Z"` -> `list_expired: false` (exact second match is still valid).
8. `Boundary Strict`: `ref: "2026-11-08T04:30:01Z"`, `list_valid_until: "2026-11-08T04:30:00Z"` -> `isSelectable: false`, `reason: "list_expired"`.
9. `Case-Insensitive String Booleans`: `"TRUE"`, `"True"`, `"true"` evaluate to minor; `"false"`, `""`, `null` evaluate to non-minor.
10. `T-03 Sample List Integration`: Evaluating all 4 participants in `consented_list.sample.csv` identifies exactly 2 non-selectable participants.
