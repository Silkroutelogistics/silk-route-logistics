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

## Current state

| Bucket | Count |
|---|---|
| WRITTEN | 1399 |
| **READ (never written)** | **237** |
| STRING_ONLY | 4 |
| UNREFERENCED | 67 |

Of the 237: **134 frontend-visible**, 103 backend-only. Frontend-visible ranks first because a rendered column that nothing writes is a user being told something false.

## FIXED this arc — the top surface-visible cluster

### `Load.customerInvoiced` and `Load.carrierSettled`

Not cosmetic. Both are **queried as a filter** and **rendered**, and written by nothing:

- `trackTraceBoard.ts:97-101` — the **"delivered" tab** selects loads where `podVerified: false` **OR** `customerInvoiced: false` **OR** `carrierSettled: false`.
- `trackTraceBoard.ts:268-269` — both are returned to the Finance tab, which displays them.

With two of the three permanently false, that OR was **always true**. The delivered tab showed every delivered load forever and could never be cleared, no matter how completely a load was invoiced, settled and closed. A worklist that cannot empty is not a worklist — an AE working that tab had no way to tell which loads actually still needed something.

**Fixed at the source events**, the same pattern as the settlement checklist: `customerInvoiced` is set where the invoice is sent to the customer (`invoiceController`), `carrierSettled` where the settlement reaches PAID (`accountingController`). No backfill — historical loads keep their false flags, so the tab will drain going forward rather than retroactively claiming work was done that nobody recorded.

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
| Scorecard | `CarrierScorecard.calculatedAt` | **WIRE** — trivially set where the scorecard is computed. |
| `CarrierProfile.isTestAccount` | Rendered as the TEST badge | Known: the badge never renders because `getAllCarriers` filters on the column without returning it (banked at §13.3 Item 193). **WIRE** the response field. |

The 103 backend-only READs are lower urgency by construction — an internal assumption rather than a user-visible falsehood — and are left for a later pass.
