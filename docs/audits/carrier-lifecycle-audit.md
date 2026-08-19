# Carrier Lifecycle — End-to-End Audit

**Date:** 2026-08-18
**Baseline:** HEAD `ea3994dd` (v3.8.asi), branch `main`
**Tooling run:** `backend/scripts/audit-completeness.ts` → 99 mutating endpoints, 26 orphan, 510 orphan schema fields, 14 delete-only rows, 550 total findings.
**Scope:** the CARRIER-FACING surface only — `frontend/src/app/onboarding`, `frontend/src/app/carrier/**`, and the backend routes those pages actually call. The AE Console flow was traced only where it writes state the carrier surface reads.

**Method.** Every claim below was verified by grepping *consumers*, not symbol definitions. A route that exists but nothing calls, or a field written but never read, is recorded as a FAIL regardless of how complete the definition looks.

---

## Verdict summary

| ID | Area | Severity | Verdict | One line |
|---|---|---|---|---|
| F-1 | Authority age | P1 | EXISTS-BUT-INERT | The age ladder is coded and unreachable — no carrier has a grant date to measure. |
| F-2 | Authority age | P2 | WORKS (misleading copy) | The under-12-month block tells the carrier the minimum is 18. |
| F-3 | Documents | P2 | WORKS (by design) | Missing W-9/COI/authority warns; it does not block. Expiry blocks. |
| F-4 | Quick Pay / NOA | P2 | MISSING | No factoring / NOA / open-claim check on any charge path. Matches §14's own ledger. |
| F-5 | Check calls | **P1** | **EXISTS-BUT-UNREACHABLE** | **A carrier check call never satisfies its schedule. Reporting in still counts as missed.** |
| F-6 | Check calls | P2 | STUBBED | One schedule-creation path omits `carrierPhone`, so the SMS silently never sends. |
| F-7 | TONU / release window | P2 | MISSING | Ratified 2026-08-15, unbuilt. Confirms §14. |
| F-8 | POD | **P1** | **MISSING** | **Compass grades POD against a 24-hour deadline the system never reminds anyone of.** |

No P0. The gate that would have been one — compliance blocking tender — holds on every path (see A1).

---

## A1 — Onboarding → compliance

**Entry path — WORKS.** Self-registration at `/onboarding` (`frontend/src/app/onboarding/page.tsx`) → `POST /api/carrier/register` → `carrierController.registerCarrier`. There is no invite-only gate; an AE-created path exists separately via `setupAdminCarrierProfile`.

**Compass Engine — WORKS.** `carrierVettingService.vetCarrier` pushes **36 distinct named checks** (146 `checks.push` call sites across pass/warn/fail branches): FMCSA authority, OOS, insurance on file, safety rating, double-broker risk, fleet size, new-carrier risk, internal insurance minimums, authority age, CSA BASICs, identity verification, email domain, VoIP detection, chameleon risk, SOS entity, document completeness, insurance expiry proximity, OFAC/SDN, SAM.gov, W-9 TIN match, BOC-3, UCR, IRP, IFTA (+truck expiry), MCS-150, ELD device, fleet VIN, biometric facial match, cross-reference identity, fraud report history, historical performance, overbooking risk, probationary period, carrier-broker agreement, document expiry enforcement. The "35-point" claim is honest.

**Decision record persists and is read — WORKS.** `lastVettingScore` / `lastVettingRisk` / `lastVettedAt` are written by the vetting service and consumed downstream:

- `complianceMonitorService.ts:309` — score `< 40` becomes a **hard block**; `< 60` a warning.
- `waterfallScoringService.ts:167` — `CRITICAL` or `HIGH` risk excludes the carrier from dispatch scoring.
- `carrierController.ts:1311-1313` — surfaced to the AE.

**Compliance gates tendering — WORKS. This was the P0 candidate and it holds.** `complianceCheck` is called before the tender is written on every path found:

| Path | Site |
|---|---|
| Direct tender create | `tenderController.ts:28` |
| Direct accept | `tenderController.ts:87` |
| Accept-on-behalf | `tenderController.ts:264` |
| Drawer create-with-tender | `withTenderController.ts:61` |
| Waterfall accept | `waterfallEngineService.ts:430` |
| Waterfall tender | `waterfallTenderService.ts:51` |
| Loadboard bid accept | `loadBids.ts:200` |
| Load assign | `loadController.ts:823` |

An AE cannot tender to an unvetted or failed carrier. Blocks enforced: suspended, rejected, expired insurance (grace-aware), FMCSA revoked/OOS, **no signed BCA**, OFAC potential match, expired COI, vetting score < 40.

### F-1 — Authority-age tiering is coded but inert *(P1, EXISTS-BUT-INERT)*

`complianceMonitorService.ts:134-220` implements the §13.3 Item 182 ratified ladder: `< 12mo` hard floor (no override), `12–18mo` override-eligible via a scoped `ComplianceOverride` with `checkCode = "AUTHORITY_TOO_YOUNG"`, `>= 18mo` silent allow, plus soft-grandfathering for carriers approved before `AUTHORITY_AGE_GATE_LIVE_AT`.

**It never fires.** Every branch keys off `carrier.authorityGrantedDate`, and that column is null for every real carrier: the FMCSA QCMobile `/carriers/{dot}/authority` endpoint returns *current status*, not grant history, so `getCarrierAuthority` resolves null universally (Item 182 Sprint 5, rolled back in v3.8.akv). v3.8.apq then deliberately downgraded the null branch from block to **warning** — correctly, because hard-blocking on null was rejecting 17-year-old authorities, a false block rather than protection. Net: authority age is not enforced for anyone today, and the only way to enforce it for a given carrier is an admin manually setting the date via `setAuthorityGrantDate` (v3.8.aio).

**Two divergences worth stating plainly.**

1. **The brief's model is not the ratified model.** This arc's brief specifies four tiers — 18+ standard / 12–18 tracking + standard pay / 6–12 compensating controls + no Quick Pay / under 6 decline. CLAUDE.md §13.3 Item 182 locks three — under 12 hard block / 12–18 override / 18+ allow — with no 6-month tier and no Quick-Pay-specific consequence. The code matches the ratified model. Changing to the four-tier model is a product decision, not a bug fix.
2. **Neither model runs.** Whichever is chosen, it needs a working authority-date source first. The banked fast-follow is the free FMCSA Socrata L&I "with history" dataset to backfill `authorityGrantedDate`.

**Not fixed in this arc.** The smallest safe default is already in place and correct: warn on unknown age, block on *known*-young age, keep every other gate live. Fixing this properly is a data-source project, not a code change.

### F-2 — The hard-floor message misstates the threshold *(P2)*

`complianceMonitorService.ts:~168` — the `ageMonths < 12` branch emits `AUTHORITY_TOO_YOUNG: carrier authority N months old, minimum 18`. For a 6-month authority that reads as "get to 18 and you're fine", when in fact no override exists at all below 12 and the carrier should be told the application is declined. Cosmetic today only because F-1 makes the branch unreachable.

---

## A2 — Documents + signatures

**Inventory of every carrier-facing document found.**

| Document | Generated | Signature captured | Artifact persisted | Read downstream |
|---|---|---|---|---|
| Broker-Carrier Agreement (`BCA_VERSION 2026-06-27-v1`) | yes — `data/agreements.ts` | yes — typed name + IP + UA | yes — PDF at `agreements/bca-{id}.pdf`, `documentUrl` | yes — **hard block** in `complianceCheck` |
| Caravan Quick Pay Agreement (`QP_VERSION 2026-08-16-v4`) | yes — same module | yes — same mechanism | yes — `documentUrl` | yes — gates `quickPayEnabled` → all 3 charge paths |
| Rate Confirmation | yes — `pdfService` / `srl-chrome` | yes — carrier acceptance block | yes — `rateConNumber` persisted (v3.8.asg) | yes — carrier portal + email |
| W-9 | collected | n/a | yes — `docType "W9"` → `w9Uploaded` | warning only |
| COI | collected | n/a | yes — `docType "COI"` → `insuranceCertUploaded` | absence warns; **expiry blocks** |
| Authority letter | collected | n/a | yes — `authorityDocUploaded` | warning only |
| NOA (notice of assignment) | no | no | no | no — see F-4 |

**The signature chain is genuinely closed.** `carrierAuth.ts:921` writes `signatureData`, `signerIp`, `signerUserAgent`, `version`, `signedByName/Title` on a `CarrierAgreement` row, refreshes the click-wrap audit fields on `CarrierProfile`, notifies AEs, and generates the executed PDF. `complianceCheck` then requires `templateName: "broker-carrier"` + `status: SIGNED` before any tender — correctly filtered so a Quick Pay signature can never satisfy the BCA gate (v3.8.aqi). Version is stamped server-side from the constant, and a stale posted version returns `409 AGREEMENT_VERSION_STALE` (v3.8.asb). This is the strongest link in the whole lifecycle.

### F-3 — Document absence warns, expiry blocks *(P2, by design)*

Missing W-9 / COI / authority produce warnings; only *expired* COI is a block. Defensible — insurance adequacy is separately enforced by `Insurance Minimums (Internal)` in vetting and by `insuranceExpiry` in `complianceCheck` — but worth stating so nobody assumes upload completeness is a gate. It is not.

### F-4 — NOA / factoring ineligibility is unimplemented *(P2, MISSING)*

Quick Pay Agreement §8 says a load already assigned to a factor is not Quick-Pay eligible, and asks the carrier to notify Broker. Nothing implements it: no NOA model, no factoring field, no check on any of the three charge paths, and no `PaymentDispute` open-claim query. CLAUDE.md §14 already records §8 as ratified-pending and has reworded the clause from an automatic state to a right Broker may exercise — so the document and the code agree today. Recorded here to confirm the gap is still open, not to reopen the wording.

---

## A3 — Tender → haul → check calls

**Tender surface — WORKS.** `frontend/src/app/carrier/dashboard/tenders/page.tsx` renders a live `<Countdown expiresAt>` (line 65), accept (`POST /tenders/:id/accept`), decline with a **required** reason dropdown (line 276), and counter-offer. Backend filters to `status=OFFERED` + `expiresAt > now` + `deletedAt: null`. `declineReason` persists (`tenderController.declineTender`, v3.8.ajz) and lands in an audit row. Expired tenders are swept hourly by the `tender-expiry-sweep` cron.

**Status workflow — WORKS.** `POST /carrier-loads/:id/status` validates every transition through `lib/loadStateMachine.ts` (`CARRIER_ALLOWED_TRANSITIONS`: BOOKED/DISPATCHED/CONFIRMED → AT_PICKUP → LOADED → IN_TRANSIT → AT_DELIVERY → DELIVERED, strictly forward-only), stamps actual event times, logs T&T activity, broadcasts SSE, and notifies the broker. Carrier and AE read the same `Load.status`, so the two surfaces cannot disagree.

**Shared-endpoint identity — CLEAN.** Both carrier write paths scope on `load.carrierId !== req.user!.id` before writing and set `calledById: req.user!.id` from the carrier's own session. No AE identity leaks into carrier-originated writes.

### F-5 — A carrier check call never satisfies its schedule *(P1, EXISTS-BUT-UNREACHABLE)* — headline

Two systems track the same event and do not talk to each other.

- `CheckCall` — the *record* of a call. Written by the carrier portal.
- `CheckCallSchedule` — the *obligation*. Read by the risk engine and the AE board.

`grep -n "checkCallSchedule" src/routes/carrierLoads.ts` returns **zero matches.** Both carrier write paths — `POST /carrier-loads/:id/check-call` (`carrierLoads.ts:648`) and `POST /carrier-loads/:id/status` (`carrierLoads.ts:439`) — create a `CheckCall` row and notify the broker, and neither marks the pending `CheckCallSchedule` as RESPONDED.

Only two things ever close a schedule: the OpenPhone SMS webhook (`checkCallAutomation.handleCheckCallResponse:279`) and the AE-side `PATCH /load-tracking/:loadId/status` (`loadTracking.ts:276, 287, 523`).

The consequence, end to end:

1. Carrier opens the portal — the channel SRL tells them to use — and files a check call with city, state and notes.
2. The schedule row stays `PENDING`.
3. `processDueCheckCalls` (every 5 min via `schedulerService.ts:398`) flips it to `SENT` and texts the carrier asking for the update they just gave.
4. 30 minutes later it becomes `MISSED`, then escalates to the AE.
5. `riskEngine.ts:52` counts `MISSED`/`ESCALATED` rows: one missed call adds 25 risk points, two or more adds 50.

A compliant carrier is texted redundantly, marked delinquent, and pushed toward a RED risk flag for doing exactly what they were asked. **Fixed in this arc.**

### F-6 — One schedule path omits `carrierPhone` *(P2, STUBBED)*

`createCheckCallSchedule` (`checkCallAutomation.ts:89`) resolves `carrierPhone` from `user.phone ?? carrierProfile.contactPhone` and stores it on every row — correct. But `loadTracking.ts:262`, the AE-side `ACCEPTED`/`CONFIRMED` branch, creates a `PRE_PICKUP` schedule **without** it. `processDueCheckCalls` guards its send on `if (cc.carrierPhone)` and then flips the row to `SENT` regardless, so that schedule ages into `MISSED` without a single message ever being sent. **Fixed in this arc** (same defect family as F-5).

### F-7 — TONU billing and the 4-hour release window are unbuilt *(P2, MISSING)*

Confirms CLAUDE.md §14's ledger rather than adding to it. `onLoadCancelledOrTONU` only *reverses* — voids AP, reverses credit and funding, cancels tenders. There is no customer-side TONU charge anywhere in the billing path, and `invoiceService` carries only a TONU accessorial *label*. The 4-hour carrier release window appears solely as `cancellationWindowHours: 4` printed on the Rate Confirmation and as training copy; nothing enforces it and the printed line still does not name the releasing party. Both remain ratified-pending. Not touched — implementing either is a billing change requiring its own sprint.

---

## A4 — POD within 24 hours

**Upload path — WORKS.** `POST /carrier-loads/:id/documents` (portal, `frontend/src/app/carrier/dashboard/my-loads/page.tsx:68` and the documents page) → `load_documents` → status flips to `POD_RECEIVED` → `autoGenerateInvoice` fires (non-fatal) → broker notification → `sendPODToContact` emails the shipper. Downstream scorecard and payment queue both read from it.

### F-8 — Nothing enforces the 24-hour deadline *(P1, MISSING)*

The 24-hour window is a real obligation on three surfaces: the Broker-Carrier Agreement, the printed Rate Confirmation, and the driver training curriculum. `lib/docTimeliness.ts` **grades** against it — `POD_GRACE_MS` derives from `PAPERWORK_DUE_HOURS`, and Compass document-timeliness marks a load late when POD lands after `actualDelivery + 24h`.

No mechanism ever tells the carrier. The full cron inventory (35 jobs) contains no POD job. The closest thing is two schedule types inside `createCheckCallSchedule` — `POD_REQUEST_30MIN` and `POD_REQUEST_1HR` — and they miss in two ways:

- they are pegged to the **planned** `deliveryDate`, not `actualDeliveryDatetime`, so on any load that delivers off-schedule they fire at the wrong time or have already elapsed and get filtered out by `futureSchedules`;
- neither sits anywhere near the 24-hour mark, so nothing escalates as the deadline approaches.

A carrier is therefore scored against a deadline they are never reminded of, on a load whose delivery time the system knows precisely. **Fixed in this arc.**

---

## What this arc fixes

P1s with a code-shaped fix: **F-5**, **F-6**, **F-8**.

P1 without one: **F-1** — inert because of an upstream data source, already carrying the correct safe default, and its target model is an unresolved product decision. Documented, not patched.

P2s recorded and deliberately not built: **F-2**, **F-3**, **F-4**, **F-7**.
