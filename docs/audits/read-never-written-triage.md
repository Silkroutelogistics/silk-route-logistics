# READ-never-WRITTEN Triage

**Date:** 2026-08-20 (Arc 8 Phase 4)
**Source:** `backend/scripts/audit-field-usage.ts` — per-column verdicts, not a yes/no count.

## The class

The inverse of an orphan. An orphan column is work thrown away; a READ-never-WRITTEN column is **code depending on a value nothing produces** — and when the consumer is a screen, it is a UI showing a user false emptiness.

That distinction is why this list exists separately from the orphan triage, and why it is ordered by **consumer surface** rather than alphabetically.

## The tool was wrong twice before this list was trustworthy

Both corrections happened while producing this document, and both are worth knowing because they change how much the numbers can be trusted.

**Spread writes are invisible.** A column written through `data: { ...flags }` never appears literally at the write site. This bit against my own code first: the settlement doc-flag sync wrote its seven columns via a spread and the classifier called them all READ-never-WRITTEN. The fix was to write them out explicitly rather than to teach the tool dataflow analysis — code invisible to its own audit tool is the problem, not the tool. Kept as a `--self-test` fixture so it is not rediscovered.

**A fixed lookback window was far too small.** Distinguishing `data: { f }` from `select: { f }` originally searched back 600 characters for the nearest context keyword. A Prisma create payload here is routinely forty-odd fields, so `data: {` sat outside the window and **every later field in the block was reported READ**. `withTenderController` assigns `destContactName` literally inside a data block and was classified a read — acting on that would have sent someone to "fix" a field that was already written. Replaced with backward brace-depth walking, which has no window to outgrow.

**That second fix moved the count in both directions:** 217 → 237 READ. It corrected false READs (far-away `data:`) *and* false WRITTENs (a nearby `data:` that was not the real enclosing context). Both prior numbers were wrong. Treat any single verdict as a question until the matches under it are read — which is why the tool prints them.

**Database-supplied columns looked like application bugs.** (Arc 11 Phase 5.) A column carrying `@default(...)` or `@updatedAt` is written by Postgres on every insert and has no literal write site anywhere in the application — so the classifier saw it consulted, never assigned, and called it READ-never-WRITTEN.

Caught on `CarrierScorecard.calculatedAt`, whose banked verdict below read *"WIRE — trivially set where the scorecard is computed"*. It already has `@default(now())`. Acting on that verdict would have added an explicit write for something the database already does — the audit manufacturing the busywork it exists to prevent. Six queries order by that column and all of them were fine the whole time.

**This moved the count by roughly a third.** 237 READ → **164**; frontend-visible 134 → **95**. Reclassified as `DB_WRITTEN` rather than dropped, so the fields are still accounted for. Third correction to this tool, and the third one found by reading a verdict's matches instead of trusting the verdict — which is the whole reason it prints them.

**Object shorthand was invisible.** (Arc 12.) `data: { status: "COUNTERED", counterRate, respondedAt }` writes `counterRate` — but shorthand carries no colon, and the classifier keyed on `field:`. Shorthand is idiomatic here, so this was never one stray case. The disambiguation that makes it safe is the enclosing context: a destructure, `const { counterRate } = schema.parse(body)`, has the identical shape and is a read. It sits outside any `data:` payload, so it stays one. Both shapes are now fixtures, because a rule that distinguishes them is untested unless both are present.

**Hoisted payloads were invisible.** (Arc 12.) A payload is routinely built as `const data = { ... }` and handed to prisma on the next line rather than written inline. The key-before-brace walk only saw the inline form, so every field in a hoisted payload read as consulted-never-assigned. Found on `DriverCourseProgress.bestScorePct`, which driverTraining assigns and upserts — a driver's best quiz score has been recorded correctly the whole time. Narrowed deliberately to variables actually named `data` / `payload` / `createData` / `updateData`: treating every `const x = {` as a write would call half the codebase written and break the audit in the other direction. The narrowing has its own fixture.

**Cumulatively, 40% of the original list was the tool.** 237 → 164 (`@default`) → 149 (shorthand) → **143** (hoisted). Frontend-visible 134 → **78**. Five blind spots now, every one found by reading a verdict's matches instead of trusting the verdict, which is the only reason the tool prints them.

**Frontend request payloads are not recognised as writes, and this is the big one.** (Arc 13.) The write-detection rule is Prisma-shaped: a `field:` inside a `data:` context. A field the CRM sets by PUTting `{ minMarginPercent: … }` at an API is produced by the system just as surely, and reads as never-written.

Three of the AE tier's top candidates turned out to be exactly this, all money- or config-adjacent, all working:

| Field | Actually written by |
|---|---|
| `Customer.minMarginPercent` | `ProfileTab.tsx:338` → PATCH → `validators/customer.ts` → `updateCustomer` |
| `Customer.defaultAccessorialRates` | `ProfileTab.tsx:339`, same path. This is the rate card `invoiceService.customerPriceFor` reads — the feature works; what v3.8.ase found was that no customer had *entered* rates yet, which is not the same as being unable to. |
| `CustomerFacility.operatingHours` | `FacilitiesTab.tsx:205` → the facility routes, which spread `...req.body` with no `validateBody`, so nothing strips it. §13.3 Item 8.2.2's closure is accurate. |

**It hits the frontend-visible bucket hardest, which is the bucket this document ranks first.** A column rendered on a screen is very often also *edited* on a screen. So treat the frontend-visible count as an upper bound, not an estimate.

**Not fixed, deliberately.** The three shapes have no single cheap signal in common — `minMarginPercent` is in a Zod validator, `operatingHours` is in none, and detecting "object literal passed as the second argument to `api.patch`" is real static analysis. Three arcs of evidence say every widening of this heuristic has produced a new class of error, and the tool's own header already says a verdict is a question. Widening it again to save a grep is a bad trade.

**The procedural fix instead, and it is cheap: for any frontend-visible field, grep the CRM/portal save path BEFORE anything else.** One grep for the field name in `frontend/src` restricted to save handlers answers it in seconds, and answers it correctly where the tool cannot.

## Current state

| Bucket | Count | Arc 11 | Original |
|---|---|---|---|
| WRITTEN | 1427 | 1401 | 1399 |
| **READ (never written)** | **143** | 164 | 237 |
| DB_WRITTEN | 73 | 73 | — |
| STRING_ONLY | 4 | 4 | 4 |
| UNREFERENCED | 67 | 67 | 67 |

Of the 143: **78 frontend-visible**, 65 backend-only. Frontend-visible ranks first because a rendered column that nothing writes is a user being told something false.

## FIXED this arc — the top surface-visible cluster

### `Load.customerInvoiced` and `Load.carrierSettled`

Not cosmetic. Both are **queried as a filter** and **rendered**, and written by nothing:

- `trackTraceBoard.ts:97-101` — the **"delivered" tab** selects loads where `podVerified: false` **OR** `customerInvoiced: false` **OR** `carrierSettled: false`.
- `trackTraceBoard.ts:268-269` — both are returned to the Finance tab, which displays them.

With two of the three permanently false, that OR was **always true**. The delivered tab showed every delivered load forever and could never be cleared, no matter how completely a load was invoiced, settled and closed. A worklist that cannot empty is not a worklist — an AE working that tab had no way to tell which loads actually still needed something.

**Fixed at the source events**, the same pattern as the settlement checklist: `customerInvoiced` is set where the invoice is sent to the customer (`invoiceController`), `carrierSettled` where the settlement reaches PAID (`accountingController`). No backfill — historical loads keep their false flags, so the tab will drain going forward rather than retroactively claiming work was done that nobody recorded.

## CARRIER-VISIBLE TIER — worked Arc 12, and it is clean

Ordered carrier-visible first, on the grounds that a falsehood shown to a customer outranks one shown to staff. After the two classifier fixes above, the tier is three fields, and **none of them is a code defect**:

| Field | Finding |
|---|---|
| `Message.receiverId` | Written via `data: { senderId, ...data }` — the spread blind spot, already documented. `messageController` is correct. Pre-existing code, so recorded rather than restructured to satisfy a tool. |
| `Load.pickupNumber` | A dead FALLBACK, not a missing write. `pdfService:1806` reads `fd.pickupNumber \|\| load.pickupNumber \|\| ""` — the RC's own `formData` carries the value and is populated. The cascade resolves; nothing renders empty. |
| `Load.shipperPoNumber` | Same shape. The BOL renders `poNumbers[]` first (v3.8.d.4) and this is the third link in the fallback chain. `trackingController:158` also searches by it, a branch that can never match. |

**DECIDED Arc 13 — dropped.** The reads are deleted and the columns are authored at `prisma/_pending_migrations/20260821040000_drop_dead_load_ref_fallbacks`, outside `prisma/migrations/` so they are pending rather than scheduled, with the row-count gate in the header. **Original note kept for the reasoning:** Either the Order Builder should capture a pickup number onto the load and the RC formData is a workaround (**WIRE**), or formData is canonical and the columns are redundant (**SCHEMA-DEAD**, to a `hold/` branch per §2.2). Dropping them would foreclose the first reading; wiring them would duplicate a working source. That is a product call.

This closes the carrier tier at **zero user-visible falsehoods** — which is the honest result, not an absence of work.

## AE-VISIBLE TIER — worked Arc 13, and it is clean so far

Carrier-visible closed in Arc 12 at zero defects. The AE tier's highest-value candidates — the money- and config-adjacent ones — are the three false positives in the table above. No defect found.

Remaining AE-tier candidates, not yet individually read: the Order Builder cluster (`driverMode`, `liveOrDrop`, `cargoValue`, `lumperEstimate`, `originFacilityId`, `destFacilityId`, the four lat/lng), `Load.truckId` / `trailerId`, `Customer.accountRepId`, `CustomerFacility.dockInfo`. **Every one of these is edited on a screen**, so the procedural fix above applies to all of them and most are likely the same class. Read the save path first.

## Verdict vocabulary for the remainder

- **WIRE** — the source event exists; connect it, as above.
- **RENDER-REMOVE** — the UI should stop showing what will never exist.
- **SCHEMA-DEAD** — candidate for the next migration batch, corroborated by `git log -S`.

## Banked, with first-pass verdicts

Not yet individually verified. Given the tool was wrong twice today, **each needs its matches read before action** — the verdicts below are a starting point, not a work order.

| Cluster | Fields | First-pass verdict |
|---|---|---|
| Rate-confirmation form fields | `Load.trailerLength`, `pickupHours`, `deliveryHours`, `deliveryAppointment`, `unloadingType`, `pickupNumber`, `shipperPoNumber` | Likely **WIRE** — the RC modal renders them and the Order Builder probably should capture them. Check whether the RC's own `formData` JSON already carries the value, in which case the column is genuinely redundant and this is RENDER-REMOVE. |
| Order Builder dispatch fields | `Load.waterfallMode`, `driverMode`, `liveOrDrop`, `cargoValue`, `lumperEstimate`, `directTenderCarrierId` | Mixed. `directTenderCarrierId` is a known dead write-path (Item 176 deleted its only consumer) — likely **SCHEMA-DEAD**. The others need a read of the convert-to-load path. |
| Facility / geo | `Load.originFacilityId`, `destFacilityId`, `originLat` | Likely **WIRE** — FacilityPicker selects a facility and the id should persist. |
| Scorecard | `CarrierScorecard.calculatedAt` | ~~WIRE~~ — **FALSE POSITIVE, closed Arc 11.** Has `@default(now())`; Postgres writes it. This verdict is what exposed the third blind spot above. |
| `CarrierProfile.isTestAccount` | Rendered as the TEST badge | ~~WIRE~~ — **FIXED v3.8.atq.** `getAllCarriers` filtered on the column without returning it, so the badge and the toggle's current state both read undefined. The fence worked; its label was invisible. |

The 103 backend-only READs are lower urgency by construction — an internal assumption rather than a user-visible falsehood — and are left for a later pass.
