# Approve-gate edit UI verification (BKN approval prep)

**Date:** 2026-05-04 (sprint-aligned; doc name preserved per directive even though calendar is 2026-05-05)
**Trigger:** Issue 1 from 2026-05-05 verification — CRM list correctly empty after Phase 6.2 v3.8.ee shipped, no Customer record has `onboardingStatus = APPROVED` yet. To exercise the real workflow on BKN as the first customer, every approve-gate precondition must have an AE-Console editor affordance. This audit verifies that.
**Scope:** read-only. No code, no SQL, no schema changes. No `onboardingStatus` flip on any record.
**Approve-gate preconditions** (from [`evaluateApprovalChecks` at customerController.ts:16-51](../../backend/src/controllers/customerController.ts#L16-L51)):

1. `customer.taxId` non-empty
2. `customer.creditStatus ∈ {APPROVED, CONDITIONAL}` AND `customer.creditCheckDate` non-null
3. `customer.contractUrl` non-empty

---

## Field-by-field edit-UI matrix

| Field | Edit UI exists? | Location | Input type | Gap description |
|---|---|---|---|---|
| **`taxId`** | ✅ **Yes** | [`ProfileTab.tsx:329`](../../frontend/src/app/dashboard/crm/tabs/ProfileTab.tsx#L329) (edit form) + [`NewCustomerForm.tsx:139`](../../frontend/src/app/dashboard/crm/NewCustomerForm.tsx#L139) (create form) | Free-form text `<Input>`; persisted via `PATCH /customers/:id` (`taxId` is in `updateCustomerSchema`). View-side renders masked as `****<last4>` per [ProfileTab.tsx:102](../../frontend/src/app/dashboard/crm/tabs/ProfileTab.tsx#L102). | None. AE clicks **Edit profile** in ProfileTab → enters TIN → Save. Done. |
| **`creditStatus`** | ⚠️ **Partial** — public-company path only | [`ProfileTab.tsx:131-138`](../../frontend/src/app/dashboard/crm/tabs/ProfileTab.tsx#L131-L138) (**Check Credit (SEC)** button) | Server-side enum write driven by SEC EDGAR lookup ([crmCustomer.ts:394-402](../../backend/src/routes/crmCustomer.ts#L394-L402)): `approved → APPROVED`, `flagged → CONDITIONAL`, **everything else (incl. `not_found`) → PENDING_REVIEW**. The fallback "Mark as manually reviewed" button at [ProfileTab.tsx:169](../../frontend/src/app/dashboard/crm/tabs/ProfileTab.tsx#L169) calls [`/mark-manually-reviewed` at crmCustomer.ts:436-459](../../backend/src/routes/crmCustomer.ts#L436-L459) — which updates `creditCheckSource`, `creditCheckResult`, `creditCheckDate`, `creditCheckNotes`, **but does NOT update `creditStatus`**. | **GAP — blocking for private-company customers.** Most CPG/wellness brands (BKN, MERIT, Hero Bread, Kite Hill, MALK, Little Spoon) are private and won't be in SEC EDGAR. SEC check returns `not_found` → `creditStatus = PENDING_REVIEW`. Mark-manually-reviewed sets the date but leaves `creditStatus` untouched. **No UI path sets `creditStatus = APPROVED/CONDITIONAL` for a private company.** Approve gate's credit precondition cannot be satisfied via UI for any private-company customer today. **Proposed fix shape (DO NOT IMPLEMENT in this pass):** extend the `mark-manually-reviewed` handler at [crmCustomer.ts:441-449](../../backend/src/routes/crmCustomer.ts#L441-L449) to also write `creditStatus: CONDITIONAL` (semantically: "manually reviewed + accepted" = CONDITIONAL approval). Optional UI: add a small `<select>` next to the **Mark as manually reviewed** button so the AE can choose APPROVED vs CONDITIONAL vs DENIED instead of always CONDITIONAL. Lives in ProfileTab Financial section. ~10-15 line backend change + ~5 line frontend change. |
| **`creditCheckDate`** | ✅ **Yes** (indirect) | Same two flows as `creditStatus` — SEC check at [crmCustomer.ts:405](../../backend/src/routes/crmCustomer.ts#L405), mark-manually-reviewed at [crmCustomer.ts:446](../../backend/src/routes/crmCustomer.ts#L446) | Server-side `Date` write (`new Date()` set on either flow) | None when paired with the corrected `creditStatus` flow above. Today: clicking either button populates `creditCheckDate`, so the date precondition is satisfiable independently. The combined `creditAcceptable && creditCheckDate !== null` check in `evaluateApprovalChecks` will fail for private companies on the `creditAcceptable` half until the `creditStatus` gap above is fixed. |
| **`contractUrl`** | ❌ **No** | Not in any tab. Not in `createCustomerSchema`, not in `updateCustomerSchema`. | n/a | **GAP — blocking for every customer, not just private.** [`DocsTab.tsx`](../../frontend/src/app/dashboard/crm/tabs/DocsTab.tsx) has a `CUSTOMER_CONTRACT` category (line 15) with an Upload button. The upload calls [`POST /documents/upload`](../../backend/src/controllers/documentController.ts#L13-L74), which writes a row to the generic `Document` table with `entityType=CUSTOMER`, `entityId=<customer.id>`, `docType=CUSTOMER_CONTRACT`, `fileUrl=<S3 url>`. **The handler does NOT cross-write `customer.contractUrl`.** So uploading a customer contract leaves `customer.contractUrl` null forever. PATCH `/customers/:id` cannot fix it either because `contractUrl` is not in `updateCustomerSchema`. Approve gate's contract precondition cannot be satisfied via UI at all today. **Proposed fix shape (DO NOT IMPLEMENT in this pass):** extend [`uploadDocuments`](../../backend/src/controllers/documentController.ts#L13-L74) so that when `entityType === "CUSTOMER"` AND `docType === "CUSTOMER_CONTRACT"`, it also runs `prisma.customer.update({ where: { id: entityId }, data: { contractUrl: fileUrl } })` post-upload. ~5-line addition inside the existing handler. **Alternative:** add `contractUrl` to `updateCustomerSchema` and add a Profile-tab text input for the URL (more flexible, less automated; lets the AE paste a URL from outside if no file is uploaded). Cross-write is the cleaner path because it keeps a single source of truth — the file actually exists in `Document` and `customer.contractUrl` mirrors it. |

### Summary

- 1 of 4 fields fully editable today (`taxId`).
- 1 of 4 partially editable (`creditCheckDate` works; paired `creditStatus` only works for public companies).
- 1 of 4 not editable at all for private-company customers (`creditStatus` for non-public).
- 1 of 4 not editable at all (`contractUrl`).

**Net: BKN cannot be approved through the UI today.** Two backend fixes required first.

---

## BKN approval path

This section enumerates the exact UI clicks Wasi would take to populate BKN's record and trigger Approve, calling out the gaps that block each step.

**Prerequisite state:** BKN exists in the database as a Customer row (imported via Apollo or manually created), `onboardingStatus = "PENDING"` (default at create time), `vertical` set per Apollo CSV column or via Manual Review queue classification, no taxId / creditCheckDate / contractUrl populated.

**Click path (with current gaps marked):**

1. **Find BKN.** Navigate to `/dashboard/lead-hunter`. The CRM page (`/dashboard/crm`) is filtered to `onboardingStatus = APPROVED` only, so BKN is not visible there yet — that's correct per the gate semantics. Lead Hunter pipeline view shows BKN in the Active filter (assuming `vertical ∈ {COLDCHAIN, WELLNESS}`; if UNKNOWN, BKN is in the Manual Review filter — classify first per §18.7).
2. **Open BKN's drawer.** Click the BKN row → `ProspectDrawer` slides in. Click **Profile** tab.
3. **Populate `taxId`.** Click **Edit profile** button → enter BKN's federal Tax ID (EIN) → click **Save**. ✅ Works as designed.
4. **Populate `creditStatus` + `creditCheckDate`.** Click **Check Credit (SEC)** button.
   - **Path A — BKN is publicly traded:** unlikely (BKN is private per recent founder bio research). If it were, SEC returns `approved` or `flagged` → `creditStatus` flips to APPROVED/CONDITIONAL, `creditCheckDate` set. ✅ Works.
   - **Path B — BKN is private (the realistic case):** SEC returns `not_found` → `creditStatus = PENDING_REVIEW`, `creditCheckDate` set, "Company not found in SEC EDGAR" UI surfaces with a **Mark as manually reviewed** button. Click it → `creditCheckSource = "manual"`, `creditCheckResult = "approved"`, `creditCheckDate` re-set, **but `creditStatus` stays at `PENDING_REVIEW`.** ❌ **GAP 1 BLOCKS APPROVAL.** Per the matrix above, the mark-manually-reviewed handler does not update `creditStatus`. The approve gate's "creditStatus must be APPROVED or CONDITIONAL" precondition fails forever for BKN until this is fixed.
5. **Populate `contractUrl`.** Switch to **Docs** tab. Find the **Customer contract** category. Click **Upload** → select BKN's signed broker-shipper agreement PDF → upload completes, document appears in the list with status "Pending" (or "Verified" after click). ❌ **GAP 2 BLOCKS APPROVAL.** Per the matrix above, the upload writes to the `Document` table only; `customer.contractUrl` stays null. The approve gate's contract precondition fails forever until this is fixed.
6. **Click Approve.** Switch back to **Profile** (or any tab — the `OnboardingActionBar` mounts above the tab content per [CustomerDrawer.tsx:135-141](../../frontend/src/app/dashboard/crm/CustomerDrawer.tsx#L135-L141)). Click the green **Approve** button. With Gap 1 + Gap 2 unfixed, expect `422` response with `missing: [{ field: "creditCheck", ... }, { field: "contractUrl", ... }]`. The OnboardingActionBar renders the inline checklist:
   > Required checks not satisfied
   > × **Credit check** — Credit must be APPROVED or CONDITIONAL with a check date on file
   > × **Signed contract** — Customer contract URL must be on file
7. **Confirm in CRM.** Once Gap 1 + Gap 2 are fixed and step 6 returns 200, navigate to `/dashboard/crm` → BKN appears in the approved-customers list. Sprint exercise complete.

### Blocking gaps summary

Two fixes are required before BKN (or any private-company customer) can be approved via UI:

**Gap 1: `creditStatus` not set on `mark-manually-reviewed`** ([crmCustomer.ts:441-449](../../backend/src/routes/crmCustomer.ts#L441-L449))
- Effort: backend ~10-15 lines (handler) + frontend optional ~5 lines (status select) + 1-2 tests
- Decision question for follow-up sprint: does manual review default to `CONDITIONAL` (recommended — manual review is by definition not as rigorous as SEC's `approved` mapping) or do we add a UI selector for the AE to choose APPROVED/CONDITIONAL/DENIED?

**Gap 2: `customer.contractUrl` not cross-written from `CUSTOMER_CONTRACT` upload** ([documentController.ts:13-74](../../backend/src/controllers/documentController.ts#L13-L74))
- Effort: backend ~5 lines (cross-write inside existing upload handler) + 1-2 tests
- Decision question for follow-up sprint: cross-write only on first upload (i.e. when `customer.contractUrl` is null), or always overwrite (latest contract wins)? Recommend always overwrite — superseding contracts is a real workflow and the previous Document row is preserved in the table for history.

### Recommended follow-up sprint shape

Bundle Gap 1 + Gap 2 into a single small backend sprint titled **"Approve-gate edit-UI completion"**, ~30-50 lines + 4-6 tests, single version letter bump (next available past v3.8.nn — likely v3.8.oo). After that ships, BKN approval becomes a 7-click UI workflow with no SQL.

Until that sprint lands, BKN approval requires direct SQL on the four fields (`taxId`, `creditStatus`, `creditCheckDate`, `contractUrl`) followed by the UI Approve click — which defeats most of the gate. Recommend NOT doing this; ship the gap fixes first.

---

## Cross-references

- [`docs/audits/lead-hunter-crm-separation-2026-05-04.md`](lead-hunter-crm-separation-2026-05-04.md) — original Pattern A/B/C audit
- [`docs/audits/phase-6.2-verification-2026-05-04.md`](phase-6.2-verification-2026-05-04.md) — post-ship verification (notes the 4-vs-3 collapse where `creditStatus` + `creditCheckDate` render as a single "Credit check" UI item; relevant here because both halves of the conjunctive check must work, not just the date)
- CLAUDE.md §13.3 Item 6 — closed; the approve flow exists. This audit surfaces that the flow's preconditions cannot all be populated via UI on real customers, which is the Phase 6.2-adjacent follow-up that Item 6 didn't scope.
- CLAUDE.md §13.3 Item 7 (Credit check integration) — partially overlaps Gap 1. Item 7 is about choosing a credit-check service (Experian Business / D&B / manual SOP); Gap 1 is about wiring the manual-review path through to `creditStatus`. Closing Gap 1 unblocks BKN immediately; Item 7 remains open for the longer-term integration.
- v3.8.nn ([`db428a8`]) — CRM new-customer drawer tab-bar guard. Independent UX cleanup shipped alongside this audit.
