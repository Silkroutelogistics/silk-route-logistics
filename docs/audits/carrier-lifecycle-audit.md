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

---

## Before / after

| Finding | Before | After | Commit |
|---|---|---|---|
| F-5 | `grep checkCallSchedule src/routes/carrierLoads.ts` → 0 matches. Carrier reports in, schedule stays PENDING, carrier is texted for the update they just gave, MISSED 30 min later, +25 risk points. | Both carrier write paths call `markScheduledCheckCallsAnswered`. Due obligations close; already-MISSED rows and future windows are untouched. | `b57e19a9` (v3.8.asj) |
| F-6 | `loadTracking.ts` PRE_PICKUP schedule created with no `carrierPhone`; `processDueCheckCalls` skips the send and flips to SENT anyway, so it ages into MISSED silently. | Phone resolved the same way `createCheckCallSchedule` does. | `b57e19a9` (v3.8.asj) |
| F-8 | 35 cron jobs, none mentions POD. Compass grades against delivery + 24h; carrier is never told. | Hourly `pod-reminders` at :45 Eastern. Banded 4-20h / 20-24h carrier, 24h+ AE. Deadline derived from `PAPERWORK_DUE_HOURS`, pinned to the grading constant by test. | `32d22d50` (v3.8.ask) |

**Gates.** Backend `tsc` clean at every commit. Vitest **579/580 → 588/589** (+9 band-boundary tests). Frontend `tsc` clean (no frontend files changed). The single failure throughout is `urlSafety > allows public hostnames`, which performs a live DNS lookup of `hooks.slack.com`; it was verified pre-existing by stashing the three changed files and re-running against a clean tree, and it is environment-dependent rather than a code defect.

**`audit-completeness.ts` is unchanged at 550 findings (26 / 510 / 14), and that is expected.** That tool measures three things — mutating endpoints with no frontend caller, schema fields with no frontend reference, and delete-only list rows. None of the three fixes added an endpoint, added a field, or touched a list row; F-5 and F-6 are backend-internal wiring between two tables, and F-8 is a cron. The counter not moving is a limitation of what the tool measures, not evidence the fixes were inert. The reachability evidence for each is the consumer grep recorded in its commit message.

---

# Arc 2 — working the open queue (2026-08-18)

Second pass over the queue this audit left. Five items, five commits, baseline HEAD `2b76cc93`.

| Item | What | Commit |
|---|---|---|
| 1 | POD sweep escape hatch — INVOICED loads were never chased | `6b8bbd50` v3.8.asl |
| 2 | Repeat AE escalation every 48h while a POD stays overdue | `a4ed85cd` v3.8.asm |
| 3 | Triaged and annotated all 26 Pass 1 orphan endpoints | `9cbba6a7` (unversioned) |
| 4 | **F-1 unblocked** — FMCSA Socrata authority-date source, + F-2 copy | `816ce5eb` v3.8.asn |
| 5 | F-7 TONU fault side captured and required; billing legs banked | `1c845260` v3.8.aso |

## F-1 is no longer blocked on data

The audit recorded F-1 as inert because `authorityGrantedDate` is null for every carrier and QCMobile has no grant history. That is now solved: the free Socrata L&I dataset `9mw4-x3tu` ("AuthHist - All With History") carries `orig_served_date` per authority action, keyed by DOT and MC docket, no API key.

Three properties of it were found by probing the live API rather than reading documentation, and each has a failure mode that looks like an empty dataset rather than a bug:

1. `dot_number` is **zero-padded to 8**. `dot_number=4526880` returns `[]`; `04526880` returns the row. Unpadded, a backfill reports "no record found" for every carrier.
2. A carrier has **many rows** — one per operating-authority type plus revocation events. INTEGRITY EXPRESS holds a 2007 PROPERTY BROKER grant and a 2010 MOTOR PROPERTY CONTRACT CARRIER grant. The gate asks how long they have been *hauling*, so motor authority wins and it reads 2010.
3. Dates are **MM/DD/YYYY text**, so `01/02/2020` sorts before `12/31/1999` and a naive sort reports a carrier decades younger than they are.

Selection rule: GRANTED rows only, prefer MOTOR authority types, take the earliest. Earliest matches the reinstatement caveat this audit already recorded — age anchors on original grant, and the separate FMCSA-status gate catches an authority that is not currently active.

**Dry run against production, 2026-08-19:** 4 carriers with a null date, **4 resolved, 0 unresolved, 0 errors**. Gate outcome if committed: 1 hard block, 0 override-eligible, 3 allowed. The single block is `SRL Transport LLC` — a **test account** on SRL's own broker docket, 5 months old. Three of the four rows are test accounts and the fourth is PENDING, so **no real approved carrier is affected today**.

`--commit` was deliberately not run. Writing this column is what turns an inert compliance gate live, and that is Wasi's call after reading the report.

## Two decisions taken rather than asked

Both are halt-ship: smallest safe default, recorded here.

**The four-tier authority model is still not built.** This arc's brief specified 18+ / 12–18 / 6–12 / under-6-decline. §13.3 Item 182 ratifies three tiers with no 6-month band and no Quick-Pay consequence. Item 4 shipped the *data source* and left the ladder logic exactly as ratified. Adopting the four-tier model remains open and is Wasi's decision.

**The release window is measured before pickup, not before acceptance.** The brief said "within 4 hours of acceptance". The Rate Confirmation and `accessorialPolicy` both say *before pickup*, and the instruction was to read the template as source of truth — so before-pickup won. A test fails if anyone re-anchors it.

## What moved, and what did not

| Counter | Before | After | Why |
|---|---:|---:|---|
| Pass 1 orphan endpoints | 26 | 26 | Every one is now annotated at its call site with a verdict. Nothing was deleted — see below. |
| Pass 2 orphan schema fields | 510 | **511** | `Load.tonuFaultSide` is new and backend-captured; its AE surface is banked with the billing legs. An honest increase. |
| Pass 4 delete-only rows | 14 | 14 | Untouched this arc. |
| Backend test suite | 594 | **632** | +38 across POD population, escalation ordinals, Socrata parsing, and TONU branches. |

Pass 1 staying at 26 is the intended outcome, not a miss. Nothing qualified as cleanly DEAD: the two closest candidates share controllers with live routes and are money-path, on code I did not author, and Pass 1 only proves *the frontend* does not call something — it cannot see an integration or a script. Full reasoning and per-endpoint verdicts in [`orphan-endpoint-triage.md`](orphan-endpoint-triage.md).

---

# Arc 3 — ship, finish the money path, close the triage (2026-08-19)

Baseline HEAD `274249e8`. Deployed through **`274249e8`** (migration applied to production Neon, code pushed, CI green on backend + frontend).

| Phase | What | Commit |
|---|---|---|
| 1 | Migration to prod + push + CI | deploy only |
| 2 | TONU obligation reaches the accessorial ledger | `5b42271a` v3.8.asp |
| 3 | Dispute workflow wired — and a live 404 fixed | `7c4adf28` v3.8.asq |
| 5 | Pass 1 graded by evidence | `d233fddf` (unversioned) |
| 4 | Pass 4 delete-only rows | **banked — see below** |

## Phase 1 — deployed, column before code

The migration was applied to a **fresh Postgres 16 container** first, running the whole 39-migration chain from empty rather than `db push`: all applied clean, `tonuFaultSide` present as nullable `text`, `migrate status` reporting up to date. Then production Neon: applied, and verified directly — `information_schema` shows the column, `_prisma_migrations` shows the row with `applied_steps_count: 1`. Only then was the code pushed, so the column has never been behind the code that reads it.

**Smoke, reported honestly.** Two of the three requested checks need an authenticated AE or carrier session that this environment does not have, and I did not fabricate credentials to manufacture a green tick.

1. **TONU flip without a fault side** — *partially verified*. `PATCH /api/loads/:id/status` on production returns `401 {"error":"No token provided"}`. The endpoint is live and fails cleanly rather than 500-ing, but the `422 TONU_FAULT_SIDE_REQUIRED` gate sits behind auth and could not be exercised. The gate's logic is covered by unit tests; its production behaviour is unverified.
2. **POD reminder cron registered** — *not verified*. The `:45 pod-reminders` job is in the deployed commit and Render is serving that commit (`/api/health` 200), but confirming registration needs Render logs or the authenticated monitoring endpoint.
3. **Carrier check-call closes its schedule** — *not verified*. Needs an authenticated carrier session and a live load.

One thing the smoke did confirm: `POST /api/auth/e2e-token` returns `404` in production, so the v3.8.anh hardening holds and there is no bypass to borrow.

## Phase 2 — the TONU obligation is recorded; billing stays banked

Both legs are **one `LoadAccessorial` row**, because that is the existing architecture rather than a shortcut. The customer reader (`unbilledCustomerAccessorials`) applies the negotiated rate and drops any row not billed to `SHIPPER`; the carrier reader (`approvedAccessorials`) reads the same row and does not filter on `billedTo` at all. So:

| Fault | `amount` | `customerAmount` | `billedTo` | Effect |
|---|---|---|---|---|
| CUSTOMER | TONU_AMOUNT | null | SHIPPER | bills customer, pays carrier |
| BROKER | TONU_AMOUNT | 0 | BROKER | pays carrier out of margin, bills nobody |
| CARRIER | — | — | — | no row; existing reversal is the whole story |

**Ordering, which Phase 2c asked to pin:** `onLoadCancelledOrTONU` cancels tenders, reverses shipper credit, voids `CarrierPay`, cancels approval-queue rows and reverses factoring funds — and never touches `LoadAccessorial`. It is also fire-and-forget from `loadController`, so anything written to those tables here could be voided or not depending on which finished first. The ledger cannot be raced, which is why it is the anchor, and a test asserts no `CarrierPay` or `Invoice` write happens on this path.

**Activation banked, for a specific reason.** On a TONU load neither money *document* exists: `syncInvoiceAccessorials` returns null without a BASE invoice and `autoGenerateInvoice` only fires on the POD/delivery path; `syncCarrierPayAccessorials` returns early without a `CarrierPay`, and the reversal voids any that existed. Conjuring one is wrong in both available ways — `autoGenerateInvoice` would bill the customer the full linehaul for a truck that never moved, and a bespoke TONU invoice is the parallel plumbing this design avoids. A "settle a TONU" surface is a product decision. The row is still load-bearing: the moment an invoice or settlement exists on that load, the existing readers pick it up.

## Phase 3 — the dispute Resolve button had never worked

Phase 3 was scoped as "build MISSING-UI". The first trace found a live bug instead: the Resolve button POSTed to `/accounting/disputes/:id/resolve` and only a `PUT` exists, so **every click 404'd**. It also sent `{ resolution }` where the controller reads `{ resolutionNotes }`, so even with the right verb the notes were dropped. Investigate and Propose were wired for the first time, making the `INVESTIGATING` state the controller enforces reachable at all. Approve and Deny are separate buttons because `resolveDispute` reads `approved !== false` — one button could only ever approve.

**Priority list adjusted against the code:** invoice mark-paid needed nothing. `accounting/invoices/page.tsx:135` already calls `PUT /accounting/invoices/:id/mark-paid`; the Pass 1 finding was the *duplicate* `PATCH /invoices/:id/mark-paid`, which the triage doc had already classified as DUPLICATE rather than MISSING-UI. Invoice line-items edit remains unbuilt.

## Phase 5 — Pass 1 now grades its evidence

v1 asked whether each static route segment appeared in a file preceded by `/` or `${...}`, so `action: "deactivate"` never matched and two live endpoints sat on an "orphan" list through a whole triage pass. v2 matches **segments** against the tail of each caller path, either side allowed to be dynamic, and grades the result EXACT / PATTERN / UNRESOLVED.

The first v2 run made a worse mistake than v1 — `/:id/deactivate` matched any two-segment caller, attributing carrier-drivers to a customer-contacts call. A wrong caller is worse than none, because it reads as evidence. PATTERN matches now must also look aimed at the route's own mount, and the most specific caller wins.

**26 binary orphans → 17 UNRESOLVED, 9 PATTERN, 73 EXACT.** Both known false positives report PATTERN against the correct file and path, and the three dispute routes wired in Phase 3 dropped off entirely as EXACT — the tool independently confirming that work.

## Phase 4 — banked, with the reason

Not triaged. Reading the 14 findings showed the Pass 4 heuristic has the **same defect Pass 5 just fixed in Pass 1**: it flags any `.map(...)`, including ones that are state updaters rather than list renders. At least six are not list rows at all —

```
return list.map((l, i) => ({ ...l, order: i + 1 }))        // reorder helper
onChange(lessons.map((l, idx) => idx === i ? {...l, ...patch} : l))  // the edit affordance itself
form.stops.map((s) => s.id === id ? {...s, [key]: value} : s)        // update reducer
```

Triaging those as "rows where an AE cannot correct their data" would be triaging noise. The honest next step is to fix Pass 4's matcher the way Pass 1's was fixed — require the `.map()` to be inside JSX and to render a row — and only then triage what survives. Candidates that do look like real renders: `TagManagementPanel` assignments, `tagging-rules` rules, `orders` customerTemplates, `documents` filtered, `admin/monitoring` audit entries.

## Counters

| Counter | Arc 2 close | Arc 3 close | Why |
|---|---:|---:|---|
| Pass 1 | 26 (binary) | **17 UNRESOLVED** + 9 PATTERN | Graded; two false positives reclassified, three disputes routes became EXACT |
| Pass 2 | 511 | **508** | The disputes UI now references `investigationNotes`, `proposedResolution`, `proposedAmount` |
| Pass 4 | 14 | 14 | Untouched — banked with its own heuristic defect named |
| Backend suite | 632 | **641** | +9 TONU ledger tests |

## Still open after this arc

| ID | Why it was not built |
|---|---|
| F-1 | **Data source solved in Arc 2** (`816ce5eb`). What remains is a decision, not a build: run the backfill with `--commit` to turn the ladder live, and settle three-tier vs the brief's four-tier. |
| F-2 | **Fixed in Arc 2** (`816ce5eb`) — the under-12 block now states the 12-month floor and that it cannot be waived; the 12–18 message names the scoped override and who can apply it. |
| F-3 | Working as designed — recorded so nobody assumes upload completeness gates tendering. |
| F-4 | NOA / factoring ineligibility is ratified-pending in §14; implementing it is a billing change. |
| F-7 | **Half-closed in Arc 2** (`1c845260`). The fault side is captured and required at the TONU flip, and the two-sided decision function is built and tested. The two billing legs — customer invoice line, carrier settlement payable — are deliberately NOT wired: they cross `invoiceService`'s accessorial path and the carrierPay/settlement path, and a half-live billing change is worse than a banked one. Resume state in §13.3 Item 196. The RC clause still does not name the releasing party; it must when a writer enforces the rule, and `e2e/helpers/pdf.ts` pins that string. |
