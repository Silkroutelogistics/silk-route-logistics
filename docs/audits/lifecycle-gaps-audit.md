# Lifecycle gaps audit — load cancellation with reason codes, customer/shipper deactivation

**Phase A completed 2026-09-18 against HEAD `b4f36454` (v3.8.bcu). Read-only; no source, schema, or data changed during the audit.**

**Trigger (production, 2026-09-18):** the first load tendered to PEACE TRANSPORT LLC (MC 099226) was cancelled because the shipper's freight was not ready. The AE reported no way to cancel the load in the TMS, no way to record a reason, and no way to delete or deactivate the customer record.

**Method.** Four read-only inventories (status enum + every `Load.status` writer; customer relations + lifecycle flags; UI controls + tender rescind routes + delete-only rows; test coverage) were delegated to Sonnet agents. The state machine, fault attribution, every scoring input, the rate-confirmation lifecycle on cancel, and every P1 below were read and verified directly. One approved read-only SELECT was run against production through the `.env.production.local` rail with `default_transaction_read_only = on`.

---

## Corrections to the brief's premises

1. **Prisma CLI no longer resolves to Neon from `backend/.env`.** Since v3.8.axy (§13.3 Item 252) `DATABASE_URL` and `DIRECT_URL` in `backend/.env` resolve to `127.0.0.1:55473/srl` (local container); production lives only in the gitignored `.env.production.local`, which nothing loads unless a named script does.
2. **There is no `AuditEntity` enum.** `AuditTrail.entityType` and `AuditLog.entity` are free strings. `AuditAction` (schema.prisma:573-587) exists and lacked `CANCEL` / `DEACTIVATE` at the audit baseline.
3. **No shipper/customer performance score exists.** `CustomerIntelligence` carries AI-derived `paymentReliability`, `engagementScore`, `paymentScore`, `creditScore`; none reads cancellations.

---

## The production row set (approved SELECT, read-only)

```sql
SELECT l."loadNumber", l.status AS load_status, l."carrierId", l."cancellationReason", l."deletedAt",
       t.status AS tender_status, t."statusReason", t."respondedAt", t."deletedAt" AS tender_deleted,
       rc.status AS rc_status, (rc."signTokenHash" IS NOT NULL) AS rc_still_signable,
       (SELECT count(*) FROM check_call_schedules s WHERE s."loadId" = l.id) AS schedules,
       (SELECT count(*) FROM fall_off_events f WHERE f."loadId" = l.id) AS fall_offs
FROM load_tenders t
JOIN loads l ON l.id = t."loadId"
JOIN carrier_profiles cp ON cp.id = t."carrierId"
LEFT JOIN rate_confirmations rc ON rc."loadId" = l.id
WHERE cp."mcNumber" ILIKE '%99226'
ORDER BY t."createdAt" DESC;
```

| load | load_status | tender_status | respondedAt | rc_status | rc_still_signable | schedules | fall_offs | cancellationReason | deletedAt |
|---|---|---|---|---|---|---|---|---|---|
| SRL-121492 | **BOOKED** | **ACCEPTED** | 2026-09-18 18:16:33Z | DRAFT | false | 0 | 0 | null | null |

**The cancellation never landed.** The load is live at BOOKED with the carrier assigned and the tender ACCEPTED. The RC was drafted and never sent, so no signing token exists — finding #4 is not a live exposure on this load. The consistent reading of the timestamps: the AE attempted to cancel while the load sat at TENDERED (finding #1 — no button there), could not, and the carrier then accepted a load that was already operationally dead. SRL-121492 is the re-verification case for B2b.

---

## Findings

| # | Finding | File:line | Bug class | Sev |
|---|---|---|---|---|
| 1 | Cancel button renders only for `POSTED\|BOOKED\|DISPATCHED`; the AE map allows `TENDERED\|CONFIRMED\|AT_PICKUP\|DRAFT\|PLANNED → CANCELLED` too. A load at TENDERED has no button. | `frontend/src/app/dashboard/loads/page.tsx:1037` vs `backend/src/lib/loadStateMachine.ts:75-82` | UI state differs from server-allowed | P1 — trigger root cause |
| 2 | Cancel sends `{ status }` only. No UI captures a reason; `Load.cancellationReason` is written only by `deleteLoad` (the status write at 611 omits it; the branch at 676 reads a value no client sends). | `loads/page.tsx:334`; `loadController.ts:611-618, 676, 1117` | Two-surface inconsistency | P1 |
| 3 | TONU button sends no `tonuFaultSide`; backend writes `status: TONU` at 611, then returns 422 at 705. Every TONU click leaves a half-applied TONU: status flipped, no fault side, no cascade, no reversal, stale panel. | `loads/page.tsx:1047-1055`; `loadController.ts:611, 702-713` | Write-then-refuse (partial write) | P1 |
| 4 | Rate confirmation is not voided on cancellation. `onLoadCancelledOrTONU` voids CarrierPay, invoices, tenders, check-call schedules — never the RC. `voidLiveRateConfirmations` has three callers (rate change, counter, release); cancel is not one. Token survives; `/rc-sign/:token` checks only token validity; a carrier can sign a cancelled load's RC, is told "the load is confirmed", and the customer tracking-link fan-out fires. | `rateConfirmationVoidService.ts:40`; `integrationService.ts:1845-1985`; `rcSign.ts:92-105, 280-286` | Two-surface inconsistency | P1 |
| 5 | Post-accept cancellation leaves an `ACCEPTED\|RC_SENT\|CONFIRMED` tender untouched — `withdrawLiveTenders` LIVE = `OFFERED\|COUNTERED`; nobody calls release. `carrierId` stays, carrier history reads "Accepted", `HOLDS_LOAD` still true. | `tenderTransitionService.ts:56`; `integrationService.ts:1866`; `lib/tenderLifecycle.ts:27` | Label-only status | P2 |
| 6 | `recalculateCarrierCPP` (persists `CarrierScorecard.acceptanceRate` → Compass/tier) counts `WITHDRAWN` in the denominator; `carrierController` excludes it (v3.8.awx). A shipper-cancelled OFFERED tender lowers the carrier's persisted acceptance rate. | `integrationService.ts:1497-1507` vs `carrierController.ts:1712-1726` | Two-surface inconsistency | P1 |
| 7 | All three acceptance surfaces count `status === "ACCEPTED"` only. Since v3.8.axt/axu a tender moves `ACCEPTED → RC_SENT → CONFIRMED`, so a carrier who accepts and signs scores as not-accepted; `RELEASED` likewise. The funnel's `responded` drops RC_SENT/CONFIRMED rows — the awx "parts stop summing" regression in a new costume. | `integrationService.ts:1506`; `carrierController.ts:1711`; `routes/analytics.ts:402, 412` | Two-surface (scoring vs lifecycle) | P1 |
| 8 | Communication score = `RESPONDED / all CheckCallSchedules`; cancellation flips PENDING/SENT to `CANCELLED`, which stay in the denominator as unanswered. | `integrationService.ts:1448-1457, 1946-1949` | Fault attribution absent | P1 |
| 9 | `customer_cancel` release records a `FallOffEvent` (Item 8a ratified); `fallOffRecovery`'s ≥2 "deactivation review" counter reads all reasons. Two shipper cancellations flag a blameless carrier for review. Not a Compass input. | `carrierReleaseService.ts:63-70, 188-196`; `fallOffRecovery.ts:109-133` | Fault attribution absent | P2 |
| 10 | `deleteLoad` has no state guard — force-writes `CANCELLED` from any status incl. COMPLETED/INVOICED; no validator; the UI's `DRAFT\|CANCELLED\|TONU` gate is client-only. | `loadController.ts:1093-1120`; `routes/loads.ts:101` | UI gate not enforced | P1 |
| 11 | `deleteLoad` authz is `posterId === user \|\| ADMIN`; the route authorizes ADMIN/CEO/BROKER/DISPATCH/OPERATIONS. Frontend `await api.delete` has no error handling → silent 403. | `loadController.ts:1099-1102` vs `routes/loads.ts:101`; `loads/page.tsx:1058-1066` | Two-surface inconsistency | P2 |
| 12 | Button says "Permanently delete"; backend soft-deletes ("Load archived"); `restoreLoad` clears `deletedAt` but leaves `status: CANCELLED` (terminal) and has no UI; restore un-deletes every child regardless of when. | `loads/page.tsx:1059`; `loadController.ts:1139, 1142-1157` | UI state differs from DB | P2 |
| 13 | Manual `POST /invoices` and `POST /carrier-pays` never read `load.status` — a CANCELLED load can be invoiced and paid by hand. | `invoiceController.ts:12-43`; `carrierPayController.ts:125-175` | Control with no guard | P1 |
| 14 | No cancellation fault party, no reason enum, no `cancelledAt`/`cancelledById`; `cancellationReason` is free text. | `schema.prisma:1740-1741` | Model gap | P1 |
| 15 | `tonuFaultSide` is `String?` with `CUSTOMER` vocabulary; the new `FaultParty` says `SHIPPER`. | `schema.prisma:1741`; `lib/tonuPolicy.ts:27` | Two vocabularies | P3 |
| 16 | Load Board always sends `activeOnly=true`; no CANCELLED/TONU tab and no status filter control. A cancelled load is unreachable from the board (§13.3 Item 8.2). | `loads/page.tsx:74, 243-245`; `loadController.ts:416` | UI gap | P2 |
| 17 | Customer `Inactivate` renders only when `onboardingStatus === APPROVED`. A PENDING/REVIEWING customer gets Approve + a "Reject" stub whose body says to "flip via Neon SQL editor". Route is ADMIN/CEO only. | `crm/OnboardingActionBar.tsx:92-197, 295-329`; `routes/customers.ts:50` | Control promising behaviour no code grants | P1 — trigger second half |
| 18 | `DELETE /customers/:id` (soft + cascade) reachable only from the Lead Hunter prospect tab; CRM drawer has no delete/archive; `PUT /customers/:id/restore` has zero UI callers. | `lead-hunter/tabs/ActionsTab.tsx:63`; `routes/customers.ts:53-55` | UI gap | P2 |
| 19 | `deleteCustomer` cascades: cancels active loads with free-text `"Customer X deleted"`, voids invoices, zeroes credit, deactivates the shipper user — with zero `auditLog` on any `customers.ts` route and no fault party. | `customerController.ts:734-889`; `routes/customers.ts` | Audit gap + unattributed cancellation | P2 |
| 20 | Lifecycle signals inconsistent: Customer has four (`deletedAt`, `isActive`+reason/at/by, free-text `status` default `"Active"`, `onboardingStatus`); CarrierProfile has `deletedAt`+`status`+`onboardingStatus`, no `isActive`; User has `isActive` only; CustomerFacility/CustomerContact have none. | `schema.prisma:2695, 2723, 2752, 2813; 1026-1027, 1311; 869` | Two-surface inconsistency | P2 |
| 21 | Facility hard delete, no confirm; `Load.originFacilityId`/`destFacilityId` are bare strings with no FK → dangling ids on historical loads. | `crmCustomer.ts:172-192`; `FacilitiesTab.tsx:87-92`; `schema.prisma:1592-1593` | Referential integrity | P2 |
| 22 | Contact hard delete, no confirm. | `customerController.ts:1025-1033`; `ContactsPanel.tsx:176-181` | Delete-only affordance | P3 |
| 23 | Carrier `DELETE` (soft) and restore have no UI; no manual suspend endpoint or button — SUSPENDED reachable only via the generic `PUT /carriers/:id` enum or automation. | `carriers.ts:970-996`; `carriers/page.tsx` | UI gap | P2 |
| 24 | Audit: `AuditAction` lacked CANCEL/DEACTIVATE; no entity enum; `auditLog()` never writes `changes`/`details`; only `logStatusChange` (status path) and `updateUserStatus` (from/to on AuditTrail) capture previous/new. | `schema.prisma:573-587`; `middleware/audit.ts:7-31`; `loadAuditService.ts:121-133`; `adminController.ts:80-118` | Audit gap | P2 |
| 25 | Unguarded status writers outside this arc: `finalizeRateConfirmation` writes `BOOKED→TENDERED` / `CONFIRMED→TENDERED` (illegal in both maps); `emailCheckCallParser`'s ad-hoc `statusOrder` can advance a CANCELLED load; `loadTracking.ts` has no validator. | `rateConfirmationController.ts:868-881`; `emailCheckCallParser.ts:176-188`; `loadTracking.ts:242-249, 365-372` | Unguarded writer | P2 — banked §13.3 Item 276 |
| 26 | Tests: zero cases feed a WITHDRAWN or RC_SENT/CONFIRMED tender through `recalculateCarrierCPP`; zero on `deleteCustomer`/`inactivateCustomer`/`checkCustomerActive`/`carrierReleaseService`; zero E2E steps on cancel/TONU/delete; no test that CANCELLED is refused from DELIVERED/POD_RECEIVED. Ten vacuous assertions (below). | see A8 | Vacuous / absent coverage | P2 |
| 27 | `getAllowedNextStatuses` has no AUTO branch — falls through to the CARRIER map. | `loadStateMachine.ts:203-206` | Latent | P3 — banked §13.3 Item 276 |
| 28 | Delete-only rows: `/dashboard/documents` (Download + Delete), `/dashboard/sops` (no edit path), `/dashboard/tagging-rules` per-rule rows. | `documents/page.tsx:216-224`; `sops/page.tsx:236-241`; `tagging-rules/page.tsx:613-636` | Delete-only affordance | P3 — banked §13.3 Item 276 |

### Plain answers

**Can a load be cancelled today?** Partially. Yes from POSTED, BOOKED, or DISPATCHED via the Load Board Cancel button, with a `confirm()` and no reason recorded. No from TENDERED, CONFIRMED, AT_PICKUP, DRAFT, PLANNED — though the server permits all of them. Never from the T&T drawer.

**Does a cancellation currently penalize the carrier?** Yes, three ways, none fault-aware: (a) a withdrawn OFFERED/COUNTERED tender stays in the persisted Compass acceptance-rate denominator (#6); (b) cancelled check-call schedules count as unanswered (#8); (c) a `customer_cancel` release records a fall-off that feeds the ≥2 deactivation-review counter (#9). Adjacent and worse: a carrier who accepted and signed is scored as not-accepted at all (#7).

### Vacuous assertions (A8)

| File:line | Why |
|---|---|
| `cancelCascade.test.ts:126-131, 133-142, 144-146, 169-172` | source-text presence / `indexOf` position, not executed behaviour |
| `tonuCarrierPayable.test.ts:186-190`, `tonuCustomerCharge.test.ts:208-212` | order asserted by comment-string `indexOf` |
| `loadController.test.ts:286-306` | `deleteLoad` asserts only the 200 body — passes with the cascade deleted |
| `carrierController.test.ts:113-147` | `tenders: []`, never reads `acceptanceRate` |
| `statusMachineCounters.test.ts:240-248` | regex over route source (mitigated by a negative control) |

---

## Ratified decisions (2026-09-18, do not re-ask)

1. Cancellation cut-off: keep the AE map (CANCELLED blocked from LOADED onward); add the POD guard as defense in depth. Loaded freight is a TONU or claim question.
2. `customer_cancel` fall-off: keep the record (Item 8a stands); it stops counting toward deactivation review.
3. Fault vocabulary: `FaultParty` with SHIPPER now; `tonuFaultSide` CUSTOMER stays, documented equivalent in `lib/cancellationPolicy.ts`; its migration is banked to a `hold/` branch.
4. Customer delete: no delete-time load cancellation cascade. Active loads are cancelled individually with a reason code first; the endpoint returns 409 listing blocking load numbers.
5. Role scope for customer inactivate and carrier suspend: ADMIN, CEO, OPERATIONS.
6. Shipper scoring: read-only "cancellations by fault" count on the CRM surface, fed by the new columns. No composite score.
7. Delete-only rows: banked, out of scope.

## Phase B commit order

B0, B1a, B1b, B2a, B2b, B4a, B4b, B3a, B3b, B3c, B5a, B5b, B6a, B6b, B7a, B7b. B4 moved ahead of B3: #3, #4, #13 are state-corrupting or money-moving; #6, #7, #8 are scoring accuracy.

**Scope changes ratified 2026-09-19 (push-approval message):** B5b shipped as three commits (bdh customer, bdi carrier, bdj facility + contact). B6a/B6b are the audit enum + writer and the wiring (bdk, bdl). **B7b now also carries the carrier RESTORE affordance** — `PUT /carriers/:id/restore` shipped in bdi with no UI, and an archive with no way back is the same class of gap as a Delete-only row — alongside the load restore work already there. **B7b also carries the archive REASON field (ratified 2026-09-19):** the bdi Archive button sends no body, so the `CARRIER_ARCHIVED` audit row's `reason` is null today — the row is correct, the affordance is missing; the archive confirm becomes a modal with a required reason, like Inactivate and Suspend. B7b's full carry: carrier restore affordance, archive reason field, load restore, the cancelled/TONU board tab (Item 8.2), **and the archive 409's remedy text reading DELIVERED-pre-POD as "POD still owed" (ruling 4, 2026-09-19 — one line in `lib/carrierReferences.ts`; the refusal itself does not change)**. **Item 282 (customer under-billing, P1) runs as its own arc between B6b and B7b**, and does not start until its Phase A is approved.

## Migrations (local container only, run 2026-09-18, host `127.0.0.1:55473` confirmed before each)

- `20260918203506_lifecycle_cancellation_reason_fault_party` — two enums, four nullable columns, one index. **Also carries pre-existing drift** (§13.3 Item 273.8) that `migrate dev` folded in: DROP/ADD of `info_requests_createdById_fkey` and `info_requests_cancelledById_fkey` with explicit `ON DELETE` rules, and `training_questions.options DROP DEFAULT`. Not edited after apply (checksum in the local ledger). Production constraint names are to be verified read-only before push; a name mismatch fails the deploy at build (safe, blocking) and is remediated by rewriting the migration with `IF EXISTS` plus a local ledger resolve.
- `20260918203633_audit_action_cancel_deactivate` — two `ADD VALUE`s on `AuditAction`.
