# Lead Hunter → CRM separation audit

**Date:** 2026-05-04
**Trigger:** Apollo uploads to Lead Hunter are appearing in the CRM customer list. Agreed workflow says Lead Hunter prospects must NOT appear in CRM — only after manual onboarding approval should a record become CRM-visible.
**Scope:** read-only audit. No code changes in this pass.

---

## TL;DR

The bug is **Pattern A — no separation**. Lead Hunter prospects and CRM customers are the same table (`customers`). The Apollo bulk-upload writes directly to `prisma.customer.create`. The CRM list endpoint returns every row in the table. There is no separate `Prospect` / `Lead` model, no read-side filter that distinguishes the two surfaces, and no API path or UI to flip a Customer from `onboardingStatus=PENDING` to `APPROVED`. The CRM page does client-side segmentation via a `statusOf()` helper but renders Apollo prospects under a "Prospect" sub-tab in the same list — so the user perceives them as "in CRM."

Pattern B (filter missing) and Pattern C (gate missing) are both true as downstream consequences but the architectural root is Pattern A.

---

## Phase 1 — Data model

### One table, not two

There is no `Prospect`, `Lead`, or `LeadHunter*` Prisma model. Lead Hunter writes prospects to the `Customer` model directly. The closest separate model is [`WebsiteLead`](../../backend/prisma/schema.prisma#L3192) — but that backs the public quote-request form, not Apollo uploads.

Lead-Hunter-specific fields live on `Customer` itself (annotated with `// Lead Hunter — ...` comments at [schema.prisma:1953-1971](../../backend/prisma/schema.prisma#L1953-L1971)):

- `personalizedHook`, `personalizedRelevance`, `researchedAt`, `researchNotes` (v3.6.c personalization)
- `vertical: ProspectVertical @default(UNKNOWN)` (v3.8.aa)
- `sequenceStatus`, `currentTouch`, `lastTouchSentAt`, `nextTouchDueAt`, `sequenceCluster`
- `lastResendEmailId`

Even cross-references treat the two as one — `EmailSequence.prospectId` at [schema.prisma:2816](../../backend/prisma/schema.prisma#L2816) is commented `// Customer id (prospect)`.

### Status / lifecycle fields on Customer

| Field | Type | Default | Set by |
|---|---|---|---|
| `status` | `String` (free-form) | `"Active"` | Apollo upload writes `"Prospect"`; manual create defaults to `"Active"`; never written by any approval flow |
| `onboardingStatus` | `enum OnboardingStatus` | `PENDING` | Set to `PENDING` at SHIPPER self-register ([authController.ts:132](../../backend/src/controllers/authController.ts#L132)); read at SHIPPER login gate ([authController.ts:72](../../backend/src/controllers/authController.ts#L72)); **never written to `APPROVED` anywhere in the customer code path** |
| `creditStatus` | `enum CreditStatus` | `NOT_CHECKED` | Updated by SEC EDGAR check ([crmCustomer.ts:399-411](../../backend/src/routes/crmCustomer.ts#L399-L411)) and `mark-manually-reviewed` |
| `vertical` | `enum ProspectVertical` | `UNKNOWN` | Set by Apollo CSV column or upgraded on re-import |
| `sequenceStatus` | `String?` | `null` | Lead Hunter outreach state machine (`ACTIVE`/`PAUSED`/`STOPPED`/`COMPLETED`) |

`OnboardingStatus` enum values: `PENDING`, `DOCUMENTS_SUBMITTED`, `UNDER_REVIEW`, `APPROVED`, `REJECTED`, `SUSPENDED` ([schema.prisma:93](../../backend/prisma/schema.prisma#L93)).

`ProspectVertical` enum values: `COLDCHAIN`, `WELLNESS`, `UNKNOWN` ([schema.prisma:106](../../backend/prisma/schema.prisma#L106)).

---

## Phase 2 — Write path (Apollo → DB)

**Endpoint:** `POST /api/customers/bulk` ([routes/customers.ts:39](../../backend/src/routes/customers.ts#L39))
**Authorization:** `ADMIN`, `CEO`, `BROKER`
**Handler:** `bulkCreateCustomers` at [customerController.ts:634-748](../../backend/src/controllers/customerController.ts#L634-L748)

Relevant write at [customerController.ts:697-710](../../backend/src/controllers/customerController.ts#L697-L710):

```ts
const customer = await prisma.customer.create({
  data: {
    name,
    contactName: row.contactName || null,
    email: email,
    phone: row.phone || null,
    city: row.city || null,
    state: row.state || null,
    type: row.type || "SHIPPER",
    industryType: row.industryType || null,
    vertical: row.vertical || "UNKNOWN",
    status: "Prospect",
  } as any,
});
```

**Status fields at write time:**
- `status: "Prospect"` (explicit)
- `onboardingStatus: PENDING` (schema default — not set in payload)
- `creditStatus: NOT_CHECKED` (schema default)
- `type: "SHIPPER"` (default if not specified)

**Confirmed:** the Apollo bulk-upload write touches `prisma.customer` directly. No separate prospects table exists to write to.

A `ShipperCredit` row with $50K limit is also auto-created per prospect. There is no business-side check at write time — no TIN validation, no credit screen, no contract, no manual approval.

---

## Phase 3 — Read path (CRM list)

**Frontend caller:** [`frontend/src/app/dashboard/crm/page.tsx:61-66`](../../frontend/src/app/dashboard/crm/page.tsx#L61-L66)

```ts
const customersQuery = useQuery<CustomersResponse>({
  queryKey: ["crm-customers", search],
  queryFn: async () =>
    (await api.get("/customers", { params: { search, limit: 200 } })).data,
  refetchInterval: 60_000,
});
```

The CRM page passes only `search` and `limit`. **No status filter, no onboardingStatus filter, nothing.**

A comment at [crm/page.tsx:70-71](../../frontend/src/app/dashboard/crm/page.tsx#L70-L71) makes the intent explicit:
> "Client-side status filter (the legacy endpoint doesn't expose it cleanly; keeping behavior local avoids touching the controller)."

So the CRM tab counts Apollo prospects as a sub-category of customers via the [`statusOf()` helper at crm/page.tsx:21-41](../../frontend/src/app/dashboard/crm/page.tsx#L21-L41) — which buckets PENDING-without-loads as `"prospect"`, APPROVED as `"active"`, REJECTED/SUSPENDED as `"inactive"`. It's a UI segmentation of one combined list, not a separation.

**Backend handler:** `getCustomers` at [customerController.ts:28-87](../../backend/src/controllers/customerController.ts#L28-L87)

```ts
const where: Record<string, unknown> = {};
if (req.query.include_deleted !== "true") {
  where.deletedAt = null;
}
if (query.status) where.status = query.status;
if (query.industry) where.industryType = { contains: query.industry, mode: "insensitive" };
if (query.city)     where.city = { contains: query.city, mode: "insensitive" };
if (query.search)   where.OR = [...];
```

The only mandatory filter is `deletedAt = null`. `status` is filtered only if the caller passes it. There is no default discriminator that keeps Apollo prospects out of the result set.

**Lead Hunter calls the same endpoint** ([lead-hunter/page.tsx:261](../../frontend/src/app/dashboard/lead-hunter/page.tsx#L261)) — that's by design, since the data model assumes one combined list.

**`crmCustomer.ts` does NOT add a list endpoint.** It only adds detail-level extensions (facilities, notes, documents, account-rep picker, SEC credit check). The CRM tab depends on the legacy `/api/customers` for its list.

---

## Phase 4 — Onboarding gate

### There is no gate that flips Customer.onboardingStatus

Grep across `backend/src/` for `onboardingStatus.*APPROVED` returns ~30 hits — every single one writes to `prisma.carrierProfile`, not `prisma.customer`. The Customer code path has:

- **One read, no writes.** [authController.ts:72](../../backend/src/controllers/authController.ts#L72) reads `customer.onboardingStatus` to gate SHIPPER login (the v3.8.e.1 S-2 gate).
- `createCustomerSchema` and `updateCustomerSchema` ([validators/customer.ts](../../backend/src/validators/customer.ts)) **do not include `onboardingStatus` as a writable field**. So the generic `PATCH /customers/:id` endpoint cannot transition it either.
- `cron/index.ts:288` filters carrier-profile pending statuses for daily identity validation — irrelevant to Customer.

**Operational consequence:** today, the only path for a Customer to become `onboardingStatus="APPROVED"` is direct SQL in the Neon console. CLAUDE.md §13.3 Item 6 acknowledges this:
> "Without this UI, the approval workflow is 'manually flip onboardingStatus in Neon SQL editor.'"

### Internal checks (TIN, credit, contract) are not enforced

- TIN validation: schema field exists (`taxId`) but no validator enforces format or completion before any state transition.
- Credit check: SEC EDGAR check exists ([crmCustomer.ts:377-434](../../backend/src/routes/crmCustomer.ts#L377-L434)) and updates `creditStatus`. Not wired as a prerequisite for any onboarding transition — it's a standalone CRM action.
- Contract signed: `contractUrl` field exists on Customer; no validator enforces presence.

These fields are **displayed** in the CRM drawer but not gated against status transitions — because there are no status transitions to gate.

---

## Phase 5 — Pattern classification

**Primary: Pattern A — no separation.** The architectural choice is one shared `customers` table for both Lead Hunter prospects and CRM customers. There is no `Prospect`/`Lead` model to write to instead. The shared-table design is intentional in the codebase — Lead Hunter fields live on `Customer` directly, `EmailSequence.prospectId` references `Customer.id`, and the CRM page's `statusOf()` helper is built around segmenting one combined list.

**Secondary, downstream of A:**
- **Pattern B — filter missing.** A `status` discriminator IS written at upload time (`"Prospect"`), and `onboardingStatus` defaults to `PENDING`. The CRM read endpoint filters by neither. The CRM page does client-side segmentation but the request returns everything in the table.
- **Pattern C — gate missing.** No API path or UI button writes `Customer.onboardingStatus = "APPROVED"`. The v3.8.e.1 SHIPPER login gate checks the field, but no code in the customer pipeline ever writes it. Manual SQL is the only path.

The user-visible symptom (Apollo uploads showing in CRM) is most directly explained by Pattern B — but a tactical Pattern B fix (add a `where: { onboardingStatus: 'APPROVED' }` filter to `getCustomers` when called from CRM) would surface Pattern C immediately because no records would ever clear the filter without manual SQL. So fixing this end-to-end requires touching all three layers.

---

## Proposed fix scope

Three options, increasing in invasiveness. Pick deliberately — they have different blast radii.

### Option 1 — Read-side filter only (Pattern B fix)

- Add a `?context=crm` or `?excludeProspects=true` query param to `GET /customers`.
- When set, filter `where.onboardingStatus = { in: ["APPROVED", "UNDER_REVIEW", "DOCUMENTS_SUBMITTED"] }` AND `where.status != "Prospect"` (defense in depth, since the two fields can drift).
- CRM page passes the param; Lead Hunter page does not.
- **Blast radius:** small. ~10 lines backend, ~3 lines frontend.
- **Catch:** without Pattern C also fixed, this filter will be permanently empty in production (no customer ever reaches APPROVED today). So Option 1 alone is correct only if paired with Option 2 or with a willingness to flip records via SQL during launch.

### Option 2 — Add the approval gate UI/endpoint (Pattern C fix)

- New endpoint `POST /api/customers/:id/approve` (or similar) that writes `onboardingStatus = "APPROVED"`, `approvedAt = now()`, audit-logs the actor, and writes a `CustomerActivity` event.
- New AE Console UI: dedicated `/dashboard/shippers` surface mirroring `dashboard/carriers/page.tsx:730` Approve/Reject button pattern.
- Optionally: enforce prerequisites (credit check completed, TIN present, contract uploaded) inside the handler with a 422 response listing missing items.
- **Blast radius:** medium. ~150-250 lines (matches CLAUDE.md §13.3 Item 6 sprint estimate).
- This is **already in the Phase 6.2 backlog as Item 6 (Portal Approval UI S-3)** — it pairs with the v3.8.e.1 S-2 login gate.

### Option 3 — Schema separation (Pattern A fix)

- Introduce a separate `Prospect` model. Migrate Apollo upload to write there. Add a `convertProspectToCustomer(prospectId)` endpoint that, on approval, copies fields into `customers` and either soft-deletes or links the prospect row.
- **Blast radius:** large. New model, migration, backfill of the 4-figure-ish existing prospect rows in production, refactor of `EmailSequence`, `customerActivity`, `Communication`, the Lead Hunter UI, and every place that joins on `customer.id`.
- Architecturally clean but expensive. Not recommended unless a compliance requirement (TIN/W9 collection at conversion, audit-trail isolation for non-customer outreach) makes the cost worth paying.

### Recommendation (for the sprint that fixes this)

Bundle **Option 1 + Option 2** as a single Phase 6.2 sprint. The `getCustomers` read-side filter (Option 1) is the user-visible fix; the approval endpoint + Approve button (Option 2) makes the filter operational. Item 6 in CLAUDE.md §13.3 already scopes Option 2; this audit adds Option 1 as the paired requirement. Defer Option 3 unless a regulatory or audit-trail driver shows up.

Side effect to keep in scope when Option 1 ships: the v3.8.e.1 SHIPPER login gate (`authController.ts:72`) is already running but currently blocks every shipper because no record ever gets to APPROVED. Once Option 2 ships, real shippers will start clearing the gate. Should be smoke-tested per §17 methodology.

---

## Cross-references

- **CLAUDE.md §13.3 Item 6 (Phase 6.2 candidate)** — "Portal Approval UI S-3 — pairs with v3.8.e.1's gate. AE Console approve button at `/dashboard/shippers` (dedicated surface, mirror of `dashboard/carriers/page.tsx:730` pattern). Includes 'Shipper application under review' UX page (paired requirement from v3.8.e.1 — the friendly message rendering when shipper hits the gate). Without this UI, the approval workflow is 'manually flip onboardingStatus in Neon SQL editor.' Effort: medium sprint, AE Console UI work."
  - **Status:** open. This audit's Option 2 is the same sprint.
  - **Gap in current Item 6 scope:** Item 6 covers the approve button only. It does not call out the CRM read-side filter (Option 1) or the visibility separation. This audit recommends extending Item 6 to bundle Option 1 + Option 2.

- **CLAUDE.md §13.3 Item 7 (Credit check integration)** — closely related. If credit check becomes a prerequisite for APPROVED, it's an Option 2 sub-requirement.

- **CLAUDE.md §13.3 Item 8.1 (v3.8.l Customer inactivation workflow)** — adjacent but different. Item 8.1 addresses the "AE creates loads against an inactive customer" gap. The bug audited here is the inverse: "AE sees a non-onboarded prospect listed as a customer." Both touch customer-status semantics but should ship as separate sprints with shared design discussion (the four orthogonal status fields — `status`, `onboardingStatus`, `creditStatus`, `User.isActive` — affect both).

- **`backend/scripts/audit-completeness.ts`** — this bug was NOT surfaced by the orphan-endpoint or orphan-field passes:
  - The `GET /customers` endpoint IS called (so not orphan).
  - `onboardingStatus` IS used (read at the login gate, so not orphan).
  - The bug is the **absence** of a where-clause filter, which is not a static-code-checkable signal under the current heuristics. A future Pass 5 ("read endpoint returns rows that should be filtered by status field defined on the model") could catch this class of bug, but is out of scope for the current audit-completeness.ts.

- **`docs/regression-log.md` Phase 6 — Portal Approval Workflow** — the S-2 (login gate, shipped as v3.8.e.1) and S-3 (approve UI, deferred to Phase 6.2 Item 6) entries cover the approval workflow but do not call out the CRM-visibility separation. Recommend adding a paired entry there when Phase 6.2 is scoped.

---

## Changes proposed in this pass

None. This is a read-only audit per the instruction.
