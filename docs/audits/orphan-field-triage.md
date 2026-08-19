# Orphan Schema Field Triage — audit-completeness Pass 2

**Date:** 2026-08-19
**Baseline:** HEAD `4c4227e7` (v3.8.asy)
**Source:** `backend/scripts/audit-completeness.ts` Pass 2, after the upgrade described below.

## The tool was wrong before it was useful

Pass 2 counted references in `frontend/src` **only**. Every backend-only column — audit stamps, cron bookkeeping, denormalised mirrors — therefore surfaced as an "orphan" beside genuinely dead ones. It also contradicted the triage note in the tool's own header, which says to grep `backend/src/` **and** `frontend/src/` before bucketing anything.

Pass 2 now checks both and tags each finding:

| Bucket | Meaning | Count |
|---|---|---|
| `UNREFERENCED` | Nothing outside `schema.prisma` mentions it | **69** |
| `BACKEND_ONLY` | Server uses it, no UI surfaces it | 437 |

**506 → 69 actionable.** The 437 are reported rather than hidden, because "the server uses it but nothing shows it" is occasionally a missing screen rather than correct design — but they are not this document's subject.

Every finding below was verified independently of the scanner (`grep -rn` across `backend/src` + `frontend/src`, confirming 0 code references against 1 schema declaration). The scanner was right in every case checked.

## Nothing was deleted

Same posture as the Pass 1 triage, for the same reason: a column I did not author, on a table with production rows, is not something to drop on the strength of a grep. Dropping a column is irreversible in a way that adding one is not. The one clean deletion candidate (section C1) is authored as a migration in [`backend/prisma/_pending_migrations/`](../../backend/prisma/_pending_migrations/) — deliberately **outside** `prisma/migrations/`, because Render runs `migrate deploy` on every push, so a file placed there is scheduled rather than pending. **It was not applied this arc**, and applying it requires the row-count gate in its header plus the matching `schema.prisma` edit.

---

## A. Real gaps — a capability the schema anticipates and the code never built

### A1. `CarrierAgreement.terminatedAt` / `terminatedBy` / `terminationReason` — an agreement cannot be ended

The only status ever written or queried is `SIGNED` (`accountingController.ts:102`, `carrierPayController.ts:57`, `carrierVettingController.ts:623`). Nothing terminates an agreement, so a signed BCA or Quick Pay agreement is signed forever.

**Why this one matters more than it looks.** `assessVersions` (v3.8.asw, `lib/agreementVersions.ts`) judges a carrier's document state on their latest `SIGNED` row. If an agreement should be void — carrier offboarded, agreement superseded when counsel returns (§16 #1/#2), Quick Pay pilot withdrawn under §21.1 — there is no way to record that. The version-drift work assumed a termination path exists. It does not.

Pairs directly with the banked enforcement half of Item 199 Phase 2, and with §21.1's withdrawal semantics: **withdrawn ≠ declined**, and neither is currently representable on the agreement row.

### A2. `CarrierPay.docSignedBol` / `docSignedRateCon` / `docCarrierInvoice` / `docLumperReceipt` / `docScaleTicket` / `docTempLog` / `allDocsVerified` — the settlement document checklist is not wired

Seven columns describing a per-settlement document checklist, read by nothing. The live gate is a single `Load.podVerified` boolean (`routes/documents.ts:44`), set when a POD is uploaded.

So a settlement can be finalised with a POD and nothing else: no scale ticket, no lumper receipt, no temp log — the last being the one that matters for a reefer claim, where the temperature record is the evidence. Whether the checklist should gate payment or merely inform the AE is a business decision, not a code decision; what is not defensible is a schema that implies the check exists.

### A3. `CarrierPay.remitToName` / `remitToAddress` — no remit-to on a payment record

Where the money is actually sent is not carried on the payment row. Worth confirming against whatever the payment export uses today before assuming it is missing rather than sourced elsewhere.

---

## B. Asymmetry worth a decision — one leg tracked, the other not

### B1. `LoadAccessorial.carrierInvoiceId`

The sibling column `shipperInvoiceId` is load-bearing: `invoiceService.ts:57` documents it as "the not-yet-billed marker", `unbilledCustomerAccessorials` selects on `shipperInvoiceId: null`, and `accountingController.ts:781` clears it when an invoice is voided. `carrierInvoiceId` has zero references.

So the **customer** leg of the accessorial ledger knows which charges have been billed and the **carrier** leg does not. That may be by design — `createCarrierPayOnDelivery` / `syncCarrierPayAccessorials` (v3.8.asb) re-price in place while a settlement is open and escalate once committed, which does not obviously need a per-row stamp. Recorded as an asymmetry to decide deliberately, not asserted as a bug.

**Independently corroborated.** The reachability gate names this exact pair in the Check 4 header comment (`scripts/verify-reachability.ts`): *"foreign keys designed for the accessorial-to-invoice link, migrated, and then referenced NOWHERE in the codebase for months."* Two tools built for different purposes found the same thing, which is the strongest signal in this document — and the note predates this pass, so the observation has been sitting in the repo unactioned.

---

## C. Superseded — a newer mechanism replaced these, and the old columns stayed

### C1. `CarrierProfile.w9Url` / `coiUrl` / `authorityLetterUrl`

Superseded by the `Document` table. `carrierController.ts:352-354` maps each upload to a `docType` (`W9` / `COI` / `AUTHORITY`) plus a `*Uploaded` boolean flag on `CarrierProfile`. The `*Url` columns are the earlier single-URL shape and are never written.

Cleanest deletion candidates in the set — the replacement is unambiguous and live. Still batched, not dropped.

---

## D. Observability the schema promises and does not collect

### D1. `ShipperTrackingToken.accessCount` / `lastAccessedAt`

Never incremented, so nobody knows whether a tracking link has been opened once or ten thousand times.

This is worth more than housekeeping given §14: the public `/track` PII scope was deliberately narrowed on 2026-08-12 (v3.8.ara) precisely because *the QR outlives the paper* — the link is forwarded, photographed, and scanned by people who are not parties to the shipment. Zero access telemetry means a link being scraped is undetectable. The narrowing reduced what a leaked link discloses; it did not make leakage visible.

### D2. `ShipmentRiskLog.alertSent`

Never set. Whether a risk alert actually went out is not recorded on the log row that exists to record it. Adjacent to Item 192, where the risk cron's email behaviour was the subject.

---

## E. Grouped — inert by nature, no action proposed

Reported for completeness; none imply a missing capability.

| Group | Fields | Note |
|---|---|---|
| ML / intelligence tables | `CarrierIntelligence` ×7, `CustomerIntelligence` ×4, `LaneRateIntelligence.seasonalJson`, `DemandForecast.modelVersion` | Written by scoring services, consumed as whole records rather than by field name — the scanner counts identifiers, so aggregate consumers read as zero. Verify before treating any as dead. |
| Telematics | `ELDEvent` ×4, `ELDDeviceMapping.externalDriverId` | Ingest-side columns for a per-carrier ELD integration that is stored-ready but not activated (§9 telematics-activated note). |
| Fleet maintenance | `Truck.lastServiceDate`, `Truck.lastInspectionDate`, `Trailer.lastInspectionDate` | AE-console fleet scaffolding. |
| Carrier compliance dates | `CarrierProfile.iftaExpiryDate`, `irpExpiryDate`, `mcs150LastUpdate` | Note IFTA/IRP were archived from the Academy as dispatch-side (v3.8.anf); these columns predate that. |
| Retired programme | `CarrierProfile.referralCount`, `loyaltyEscalator`, `Driver.cppMilesEarned` | Referral and loyalty-escalator programmes were **retired in v3.8.aib** (§5). Columns outlived the claims. |
| Accounting / GL | `Load.glCode`, `glDepartment`, `targetCarrierCost`, `customerRatePerMile`, `CashPosition.pendingShipperAR`, `FinancialReport.csvUrl` | GL coding and target-cost pricing were never built out. |
| Identity verification | `CarrierIdentityVerification` ×4 | Manual-verification stamps; the automated path does not set them. |
| Misc infrastructure | `SchedulerLock.lockedAt`, `ApprovalQueue.escalatedToId`, `BrokerIntegration.apiEndpoint`/`apiKeyEncrypted`, `Customer` ×5, `Load.regionOrigin`/`regionDestination`/`noBrokerClause` | Mixed; individually low-stakes. |

---

## Recommended sequence

1. **A1 (agreement termination)** — smallest surface, clearest gap, and it unblocks the banked version-enforcement work plus §21.1 pilot withdrawal. A status transition and three columns already exist to receive it.
2. **A2 (settlement doc checklist)** — needs a business decision first: gate payment, or inform the AE? Do not build until that is answered.
3. **D1 (tracking-link telemetry)** — two columns, one write, and it makes a deliberate security posture measurable.
4. **C1 (superseded doc URLs)** — into the batched §2.2-pending deletion migration.
5. Everything in **E** — leave until something else touches the table.
