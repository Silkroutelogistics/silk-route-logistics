# BKN approval runnable checklist (v3.8.oo verification prep)

**Date:** 2026-05-05
**Audience:** Wasi, executing manually in his AE Console browser session
**Source:** Audit [`f939aa1`](approve-gate-edit-ui-2026-05-04.md) BKN approval path, with affordances added by v3.8.oo (commits `d956328` Gap 1 + `67ed42a` Gap 2)
**Per CLAUDE.md §15:** This checklist is the manual walkthrough form. No agent can drive the AE Console session; Wasi executes each step in his authenticated browser, ticks the checkboxes, and pastes UI evidence (screenshots, API response payloads, observed state) back so the final `bkn-approval-exercise-2026-05-05.md` audit doc can be written from real evidence.

---

## ✅ UNBLOCKED — migration applied 2026-05-05 via local `prisma migrate deploy`

Migration `20260504000000_add_customer_approval_fields` applied to Neon at 2026-05-05 17:35:00 UTC. Columns `approved_at` + `approved_by_id` confirmed in `customers` table; `_prisma_migrations` ledger entry recorded with `applied_steps_count = 1`. Wasi may proceed with Steps 1–7 below. Item 8.10 sprint (Render deploy-chain investigation — why `prisma migrate deploy` did not run automatically across the prior ~24h of deploys) tracked separately in CLAUDE.md §13.3.

---

## Steps 1–7

### Pre-flight

- **Login state required:** authenticated as Wasi (CEO or ADMIN role) in the AE Console at `https://silkroutelogistics.ai/dashboard/...`. The approve endpoint is gated by `authorize("ADMIN", "CEO")` per Phase 3.
- **Tooling:** browser DevTools open with Network tab visible + "Preserve log" enabled per §17 verification methodology. Screenshot tool ready for each step's after-state capture.
- **Test data:** BKN's actual EIN (Tax ID, format `XX-XXXXXXX`) and signed BCA PDF on local disk ready for upload.
- **Pre-execute baseline:** verify BKN currently exists in Neon as a Customer row with `onboardingStatus = "PENDING"` (or any non-APPROVED value). If BKN was already flipped to APPROVED via Phase 6.2-era SQL backfill, this exercise is meaningless — pick a different prospect.

### Step 1 — Find BKN in Lead Hunter

| Field | Detail |
|---|---|
| **UI affordance** | Sidebar → **CRM** is empty (filtered to `?context=crm` = APPROVED only). Switch to **Lead Hunter** in the left nav. |
| **Expected before-state** | Lead Hunter pipeline view loads. BKN is in the `Active` filter mode if `vertical ∈ {COLDCHAIN, WELLNESS}`; in `Manual Review` filter mode if `vertical = UNKNOWN`. |
| **Action** | Click into BKN's row to open `ProspectDrawer`. |
| **Expected after-state** | Drawer slides in (animation `slide-in-right`, max-width 720px). Header shows BKN's company name + onboardingStatus badge `PENDING` (warning palette per §2.1: `bg-[#FBEFD4] text-[#B07A1A]`). The new `OnboardingActionBar` (Phase 5 of v3.8.ee) renders between the header and tab content with three buttons: green Approve, amber Suspend, red Reject. |
| **Pass/Fail** | ☐ Pass ☐ Fail |
| **Notes** | If `vertical = UNKNOWN`, classify first per §18.7 before continuing — but this is independent of the approval gate. |

### Step 2 — Open Profile tab

| Field | Detail |
|---|---|
| **UI affordance** | Tab sidebar in the drawer (left edge). Profile is the default tab — should be active on drawer open. If a different tab is active, click `Profile`. |
| **Expected before-state** | ProfileTab renders. **Financial** section shows: Credit limit (likely `—`), Payment terms (likely `Net 30`), Tax ID (`—` if not yet populated), Credit status (`NOT_CHECKED` badge with no date). |
| **Action** | None yet — verify the section is visible and the four gate-relevant fields are in their pre-populated state. |
| **Expected after-state** | Same view; this is a baseline-capture step. Screenshot the Financial section. |
| **Pass/Fail** | ☐ Pass ☐ Fail |
| **Notes** | If Tax ID already shows `****<digits>`, BKN was previously edited — proceed but note the prior state in the audit doc. |

### Step 3 — Populate `taxId` via Edit profile

| Field | Detail |
|---|---|
| **UI affordance** | Click **Edit profile** button (gold-bordered, near bottom of the ProfileTab read view). |
| **Expected before-state** | ProfileTab swaps to `EditProfileForm` view. Inputs render for Company / Status / Industry / Account rep / Address / City / State / Zip / Credit limit / Payment terms / **Tax ID**. |
| **Action** | Enter BKN's federal EIN in the **Tax ID** input (format `XX-XXXXXXX`). Click **Save**. |
| **Expected after-state** | Form swaps back to ProfileTab read view. Tax ID field now shows `****<last 4 digits of EIN>` (masked render per [ProfileTab.tsx:102](../../frontend/src/app/dashboard/crm/tabs/ProfileTab.tsx#L102)). Background `query.refetch()` fires. |
| **Expected API response** | `PATCH /api/customers/:id` → 200 with the full updated customer object (including the new `taxId` value). |
| **Pass/Fail** | ☐ Pass ☐ Fail |
| **Notes** | Save button disables briefly during mutation (text reads "Saving…"). |

### Step 4 — Run SEC credit check + populate `creditStatus` via the new manual-review popover

| Field | Detail |
|---|---|
| **UI affordance** | Click **Check Credit (SEC)** button (gold-tinted, in the row below the Edit profile button). |
| **Expected before-state** | A spinner appears on the button ("Checking SEC…"). |
| **Action 4a** | Wait for the SEC EDGAR lookup to complete. |
| **Expected after-state 4a** | View swaps to `SecLookupView`. BKN is private → matches the `!lookup.publiclyTraded` branch at [ProfileTab.tsx:152-177](../../frontend/src/app/dashboard/crm/tabs/ProfileTab.tsx#L152-L177): renders an amber "Company not found in SEC EDGAR" card with a single gold **Mark as manually reviewed** button below. |
| **Action 4b** | Click **Mark as manually reviewed**. |
| **Expected after-state 4b** | **NEW (v3.8.oo Gap 1):** `ManualReviewPopover` modal opens with: heading "Mark credit as manually reviewed", explanatory paragraph, **Decision** select (default `CONDITIONAL (default)`, options `APPROVED` / `CONDITIONAL (default)` / `DENIED`), **Notes (optional)** textarea, Cancel + Save review buttons. **If a single-button immediate save fires instead of the popover, that's a Gap 1 regression — halt and capture screenshot.** |
| **Action 4c** | Leave Decision at `CONDITIONAL`. Optionally enter notes (e.g. "BKN: BCA on file, two trade refs verified, payment history clean from 2025 RFPs"). Click **Save review**. |
| **Expected API response** | `POST /api/customers/:id/mark-manually-reviewed` body `{ creditStatus: "CONDITIONAL", notes: "<text>" }` → 200 with `{ customer: { ... } }`. |
| **Expected after-state 4c** | Popover closes. SEC lookup view also dismisses (`setSecView(null)` per [ProfileTab.tsx:48](../../frontend/src/app/dashboard/crm/tabs/ProfileTab.tsx#L48)). Back at ProfileTab read view. **Financial** section now shows: Credit status `CONDITIONAL` (amber badge), today's date next to it, Check source `manual · approved`. |
| **Pass/Fail** | ☐ Pass ☐ Fail |
| **Notes** | If the popover renders but Save review returns 422, capture the response payload — that's a zod validator regression. |

### Step 5 — Switch to Docs tab + upload BKN's signed BCA as `CUSTOMER_CONTRACT`

| Field | Detail |
|---|---|
| **UI affordance** | Drawer left tab sidebar → click **Docs** icon (FileText). |
| **Expected before-state** | DocsTab renders. Eight document categories listed as cards: W-9, Credit application, Rate agreement, **Customer contract**, Tax exemption certificate, COI (provided by SRL), Payment authorization, Other. Each card has status pill `Missing` (gray Clock icon) and an Upload button. |
| **Action 5a** | Click the **Upload** label inside the **Customer contract** card. |
| **Expected after-state 5a** | OS file picker opens. |
| **Action 5b** | Select BKN's signed BCA PDF from local disk. Confirm. |
| **Expected after-state 5b** | Upload button text briefly reads `…`. After completion, the **Customer contract** card's status pill flips to amber `Pending` (Clock icon), View + Verify buttons render alongside the Upload label. |
| **Expected API response** | `POST /api/documents/upload` (multipart) → 201 with array containing one Document row: `{ id, fileName, fileUrl, fileType, fileSize, entityType: "CUSTOMER", entityId: <BKN's id>, docType: "CUSTOMER_CONTRACT", status: "PENDING", ... }`. |
| **Cross-write verification (NEW Gap 2)** | The v3.8.oo Gap 2 fix wraps the Document.create + Customer.update in a `prisma.$transaction`. After the upload, **re-fetch BKN's customer record** via API (or just reload the drawer) and confirm `customer.contractUrl` now equals the `fileUrl` from the upload response. If it does NOT, that's a Gap 2 regression. |
| **Pass/Fail** | ☐ Pass ☐ Fail |
| **Notes** | Optional: click **Verify** on the contract card to flip its document status from PENDING to VERIFIED. Doesn't affect the gate (gate reads `customer.contractUrl`, not document status), but matches normal AE workflow. |

### Step 6 — Click Approve in OnboardingActionBar

| Field | Detail |
|---|---|
| **UI affordance** | Switch back to any drawer tab (Profile is fine; the OnboardingActionBar mounts above the tab content per [CustomerDrawer.tsx:135-141](../../frontend/src/app/dashboard/crm/CustomerDrawer.tsx#L135-L141), so it's visible regardless). Click the green **Approve** button. |
| **Expected before-state** | Approve button enabled, text reads `Approve`. |
| **Action** | Click it once. |
| **Expected after-state** | Button text briefly reads `Approving…` while disabled. On 200 response, OnboardingActionBar re-renders into the success-tinted strip variant: green CheckCircle2 icon + text `Approved customer · onboarding gate cleared` (per [OnboardingActionBar.tsx:69-74](../../frontend/src/app/dashboard/crm/OnboardingActionBar.tsx#L69-L74)). The drawer header status badge changes from amber `PENDING` to green `APPROVED`. |
| **Expected API response** | `POST /api/customers/:id/approve` (no body) → **200** with payload `{ customer: { ...full customer object..., onboardingStatus: "APPROVED", approvedAt: "<ISO timestamp>", approvedById: "<Wasi's user id>" } }`. |
| **422 fallback** | If 422 returns instead of 200, body shape is `{ error: "Required checks not satisfied", missing: [{ field, label, reason }, ...] }`. The OnboardingActionBar renders the missing-checks checklist inline. **If 422 fires here, it means at least one of taxId / creditStatus / creditCheckDate / contractUrl is still null on the customer record — which means one of Steps 3, 4, 5 didn't actually persist.** Halt and capture which fields are listed. |
| **500 fallback (the BLOCKED scenario)** | If 500 returns, that's the Track 1 Outcome C scenario — `approved_at` / `approved_by_id` columns missing in Neon. Halt and capture the Render error log. |
| **Pass/Fail** | ☐ Pass ☐ Fail |
| **Notes** | Idempotency: clicking Approve a second time on an already-APPROVED customer returns 200 with `{ customer, alreadyApproved: true }` — no re-write, no duplicate audit log. |

### Step 7 — Close drawer, confirm BKN visible in CRM filtered list

| Field | Detail |
|---|---|
| **UI affordance** | Close the drawer (X button or Esc key). Sidebar nav → **CRM**. |
| **Expected before-state** | CRM page loads. Pre-Step 6 state: `Approved customers: 0` (assuming BKN is the first ever approved customer in this DB; if other test customers were APPROVED via SQL, the count is whatever it was). |
| **Action** | None — the page should auto-refresh from the underlying React Query cache invalidation, or do a manual page refresh. |
| **Expected after-state** | `Approved customers` count incremented by 1. BKN's row visible in the customer list with the new approved-customer status. |
| **Expected API call** | `GET /api/customers?context=crm&search=&limit=200` → 200 with `customers: [{ id: <BKN id>, onboardingStatus: "APPROVED", approvedAt, approvedById, ... }, ...]` (BKN included). |
| **Pass/Fail** | ☐ Pass ☐ Fail |

---

## Post-approval verification

### V1 — Lead Hunter prospects view no longer lists BKN

| Field | Detail |
|---|---|
| **UI affordance** | Sidebar → **Lead Hunter**. Pipeline view, Active filter. |
| **Expected** | BKN is **gone** from this list (it now satisfies `onboardingStatus = APPROVED`, which the v3.8.ee `?context=prospects` filter at the backend excludes via `where.onboardingStatus = { not: "APPROVED" }`). |
| **Expected API call** | `GET /api/customers?context=prospects&search=&limit=200` → 200 with BKN absent from the array. |
| **Pass/Fail** | ☐ Pass ☐ Fail |
| **Notes** | If BKN still appears here after a hard refresh, that's a Phase 6.2 read-filter regression. Halt and capture. |

### V2 — Direct DB confirmation of the four gate preconditions persisted

This is the verbatim authoritative state check. Run from a trusted host (Wasi's local backend with `DATABASE_URL` matching prod):

```sql
SELECT
  id,
  name,
  onboarding_status,
  approved_at,
  approved_by_id,
  tax_id IS NOT NULL    AS has_tax_id,
  credit_status,
  credit_check_date     IS NOT NULL AS has_credit_check_date,
  contract_url          IS NOT NULL AS has_contract_url
FROM customers
WHERE name ILIKE '%BKN%' OR name ILIKE '%By Kilian%' OR name ILIKE '%Bookoo%';
```

| Field | Expected |
|---|---|
| `onboarding_status` | `APPROVED` |
| `approved_at` | non-null timestamp matching Step 6 click time |
| `approved_by_id` | Wasi's user id |
| `has_tax_id` | `true` |
| `credit_status` | `CONDITIONAL` (per Step 4c selection) |
| `has_credit_check_date` | `true` |
| `has_contract_url` | `true` |
| **Pass/Fail** | ☐ Pass ☐ Fail |

### V3 — Audit log entry written

| Field | Detail |
|---|---|
| **Source** | `customer_activity` table (or whatever Prisma maps `CustomerActivity` to). |
| **Query** | `SELECT event_type, description, actor_id, created_at FROM customer_activity WHERE customer_id = '<BKN id>' ORDER BY created_at DESC LIMIT 5;` |
| **Expected** | Most recent row: `event_type = "onboarding_approved"`, `description` like `"Onboarding approved by <Wasi email>"`, `actor_id = <Wasi user id>`. The Step 4 manual-review action should also have logged a `credit_check_manual` event with `metadata.creditStatus = "CONDITIONAL"`. |
| **Pass/Fail** | ☐ Pass ☐ Fail |

---

## What to paste back

After completing all checkboxes, paste the following into the next chat turn so the final `bkn-approval-exercise-2026-05-05.md` audit doc can be written from real evidence:

1. **Pass/fail for each numbered step** (Steps 1–7) and each verification (V1, V2, V3).
2. **Step 4 evidence specifically:** confirm whether the popover rendered (Gap 1 fix landed in UI) or whether a single-click immediate save fired (regression). If popover, screenshot showing the status selector + notes textarea.
3. **Step 5 evidence specifically:** the `customer.contractUrl` value after the upload — populated with the file's S3 URL (Gap 2 fix landed) or still null (regression).
4. **Step 6 response payload** — the 200/422/500 response body verbatim.
5. **V2 query result** — the row from the SQL query verbatim.
6. **Any drift from the path documented above** — UI elements that weren't where this checklist expected them, copy that didn't match, status pills with unexpected colors, etc. Drift is the audit value here; don't smooth it over.

If any step fails or hits a halt condition (Step 4 single-click regression, Step 5 contractUrl null, Step 6 500 or unexpected 422), STOP and paste evidence at the failure point. Don't continue past a failure.

---

## Cross-references

- [`docs/audits/approve-gate-edit-ui-2026-05-04.md`](approve-gate-edit-ui-2026-05-04.md) — original audit (commit `f939aa1`) that scoped the BKN path
- [`docs/audits/lead-hunter-crm-separation-2026-05-04.md`](lead-hunter-crm-separation-2026-05-04.md) — Pattern A/B/C audit
- [`docs/audits/phase-6.2-verification-2026-05-04.md`](phase-6.2-verification-2026-05-04.md) — post-Phase-6.2 verification (16 tests passing, 4-vs-3 collapse documented)
- v3.8.oo regression-log entry — Gap 1 + Gap 2 commits + the BKN path summary
- CLAUDE.md §13.3 Item 8.10 — prisma migration backfill (originally scoped for v3.8.aa ProspectVertical only; this checklist's BLOCKED warning surfaces that the scope is broader — Phase 3's customer_approval migration also stalled)
- CLAUDE.md §17 — security gate verification methodology (DevTools Network preserve-log pattern referenced in Pre-flight)
- CLAUDE.md §15 — visual confirmation requires the user; this checklist exists because no agent can drive Wasi's session
