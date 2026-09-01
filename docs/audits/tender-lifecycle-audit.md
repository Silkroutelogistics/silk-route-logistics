# Tender lifecycle — Phase A audit (read-only)

**Baseline:** `23faaaa7` (v3.8.aws) · 2026-09-01 · no source changed in this phase.

**Concurrent-session warning.** `backend/src/controllers/rateConfirmationController.ts`
is **modified in the working tree by another session** (v3.8.aws RC-PDF-URL work,
with an untracked migration `20260901000000_rc_pdf_url_api_relative`). It is
squarely inside this sprint's Phase B scope. Per §2.2 that file is theirs until
their work lands. Phase B must re-check `git status` before touching it.

**Report location deviates from the brief.** The brief asked for
`docs/audit-reports/tender-lifecycle-audit.md`. `git check-ignore` says that path
is **not ignored** (`.gitignore` covers `docs/audit-reports/audit-*.md` only), so
it would sit untracked next to an active concurrent session — the precise trap
§2.2 describes. Filed at `docs/audits/`, matching the committed precedent
`docs/audits/carrier-lifecycle-audit.md` (§13.3 Item 195).

---

## 1. Dispatch entry surfaces — there are six, not three

Every one creates `LoadTender` rows independently. There is no shared service.

| # | Surface | Route | Creates tender at | Writes `Load.status` directly? |
|---|---|---|---|---|
| 1 | 7 tender states | ✅ **CLOSED v3.8.axz** — nine, not seven: the target left COUNTERED and DECLINED undecided and both are real carrier-initiated states, so both stayed. The enum is frozen by guard, and a second case asserts `SettleTo` carries every member — a state the transition service cannot reach forces callers through `as never`, which is how RELEASED lost its statusReason | — |
| 2 | Waterfall (manual) | `POST /loads/:id/waterfall` | `waterfallTenderService.ts:58` | via service |
| 3 | No path writes `Load.status` directly | **OPEN — frozen, not closed (v3.8.axz).** 28 sites across 18 files still do. A guard cannot close this row: §13.3 Item 194's log-first investigation established that enforcing the canonical machine over them today **breaks production** — the auto-pilot paths legitimately skip BOOKED (§2 dispatch divergence) and fall-off recovery legitimately moves backwards, and the AE map allows neither. The guard freezes the population instead: it may shrink, never grow | Reconcile the map with an AUTO/SYSTEM actor, then enforce — Item 159 Sprint 3 |
| 4 | One live OFFERED per load unless parallel | **PARTIALLY CLOSED v3.8.axz.** The half that matters operationally is closed and proven: accepting settles every sibling, including COUNTERED (`_withdraw-consolidation-proof.ts`), and a guard derives the accept set from source and asserts each routes through the one helper. The row's own target cannot be asserted: it is conditional on `waterfall.parallel`, which **does not exist**, so a general uniqueness rule would make broadcast tendering illegal | Add `waterfall.parallel`, then assert uniqueness outside it |
| 5 | Waterfall engine (auto-pilot) | internal | `waterfallEngineService.ts:236` | **Yes** — `:172`, `:248` |
| 6 | Loadboard bid accept | `loadBids.ts` accept handler | `loadBids.ts:291` | **Yes** — `:224` |

**28 `LoadTender` write sites across 11 files.** Consolidating to one
`createTender` is the largest single item in Phase B.

## 2. Status enums — three parallel vocabularies

- **`TenderStatus`** (5): `OFFERED · ACCEPTED · COUNTERED · DECLINED · EXPIRED`
- **`LoadStatus`** (18): includes `TENDERED · CONFIRMED · BOOKED`
- **`WaterfallPosition.status`** — a *third*, untyped lowercase string column:
  `queued|tendered|accepted|declined|expired|skipped`. Not an enum; drifts freely.

`LoadTender` has **no `version` column**, so the target's "rcVersion keyed to
tender version" has nothing to key on today.

### `Load.carrierId` writers — the invariant is false today

The target says `acceptTender` is the only writer. **There are eleven**, across
seven files:

| Site | Value |
|---|---|
| `tenderController.ts:125` | `tender.carrier.userId` — accept ✅ |
| `tenderController.ts:304` | `tender.carrier.userId` — accept-on-behalf ✅ |
| `automation.ts:55` | `userId` |
| `carrierLoads.ts:226` | `req.user!.id` — **carrier self-assigns** |
| `loadBids.ts:224` | `bid.carrierId` |
| `fallOffRecovery.ts:57` | `null` (clear) |
| `fallOffRecovery.ts:169` | `carrierUserId` (reassign) |
| `instantBookService.ts:131` | *(shorthand)* |
| `loadComplianceService.ts:312` | *(shorthand)* |
| `loadComplianceService.ts:322` | `existingLoad?.carrierId ?? null` |
| `waterfallEngineService.ts:567` | `pos.carrierId` |

> **Instrument note (§19 Sub-pattern 17).** My first scan required `carrierId:`
> with a colon and reported **nine**. Object shorthand carries no colon, so
> `instantBookService.ts:131` and `loadComplianceService.ts:312` were invisible —
> the exact Arc 12 blind spot (§13.3 Item 218). The corrected scanner was
> self-tested against shorthand *and* wrapped-chain fixtures before its output
> was trusted. **The nine-writer answer looked complete and was wrong.**

**ID-space hazard.** `Load.carrierId` holds a **`User.id`**; `LoadTender.carrierId`
holds a **`CarrierProfile.id`**. Same field name, two ID spaces — the §13.3
Item 57 class that made waterfall accept silently dead for months (Item 222.4).
Any consolidation must not assume they are interchangeable.

## 3. Drawer buttons — and a P0 I nearly reported that isn't one

`frontend/src/app/dashboard/loads/page.tsx`:

| Button | Line | Handler |
|---|---|---|
| Status advance (`"Confirm"` at TENDERED) | :836 | `updateStatus.mutate` → `PATCH /loads/:id/status` |
| Rate Conf | :859 | `setShowRateConf(true)` — opens modal |
| Rate Conf PDF | :866 | `downloadPdf` |
| Accept on Behalf | :1709 | `POST /tenders/:id/accept-on-behalf` |

`STATUS_ACTIONS` maps `TENDERED → "Confirm"` and `CONFIRMED → "Book Load"`, so
the drawer does offer a manual walk toward BOOKED.

> **Corrected finding.** I was about to file this as a P0 — an AE walking a load
> to BOOKED with `carrierId` null. Reading twenty more lines disproved it:
> `loadController.ts:567` has `requiresCarrier = ["CONFIRMED","BOOKED"]` and
> **400s without an assigned carrier**. v3.8.j already removed the carrier
> auto-assign, and a separate guard blocks TENDERED without a live tender.
> The Confirm button is therefore a **dead button that returns an error**, not a
> data-integrity hole. The target still removes it — for UX, not corruption.
> Severity **P2, not P0.**

## 4. Rate confirmation — auto-fire exists, e-sign does not

- **Auto-generation already ships.** `acceptTender` calls
  `autoGenerateRateConfirmation(load.id, tender.id, load.posterId)` (v3.8.acd),
  non-blocking, with a `SystemLog` WARNING on failure.
- **Quick Pay notice already ships.** `notifyQuickPayElectionOpen(load.id)`
  fires at accept (v3.8.asb).
- **No `QuickPayElection` model.** State lives as `Load.quickPaySpeed` +
  `quickPayFeePercent` + `LoadQuickPayOverride`. Nothing is *pending on the
  tender*, and nothing gates RC send on an answer.
- **`/sign` is session-authed, not tokenized.** `rateConfirmations.ts:25` sits
  behind `authenticate` + `authorize(...)`. RC has `signed`, `signedAt`,
  `signedUrl`, `rcTermsVersion` — and **no `signerName`, `signerIp`,
  `signerUserAgent`, `contentHash`, or sign token**. This matches §250's standing
  note that the RC is the weakest evidentiary link.
- **`RateConfirmation.status` is an untyped `String`** defaulting `"DRAFT"` — a
  fourth status vocabulary.

## 5. Surface consistency — the two lists overlap by six statuses

| Surface | Filter | Source |
|---|---|---|
| Load Board | `status notIn [DELIVERED, POD_RECEIVED, INVOICED, COMPLETED, TONU, CANCELLED]` | `loadController.ts:410` |
| Track & Trace `active` | `[BOOKED, DISPATCHED, AT_PICKUP, LOADED, IN_TRANSIT, AT_DELIVERY]` | `trackTraceBoard.ts:14` |
| Track & Trace `tendered` | `[TENDERED, CONFIRMED]` | `trackTraceBoard.ts:17` |

**BOOKED → AT_DELIVERY appears on both boards.** Both read `Load.status`;
**neither reads tender status**, so no surface today derives status the way the
target requires.

`needs_attention` **already exists** (`trackTraceBoard.ts:284`) but filters on
exceptions / calls due / stale GPS / awaiting POD / alert level — **zero overlap**
with the target's tender-centric bucket (EXPIRED, RC_SENT past SLA, RELEASED <24h).

## 6. `audit-completeness.ts`

`Pass 1: 0 UNRESOLVED · 16 DISPOSITIONED · 10 PATTERN · 86 EXACT` — **no orphan
tender endpoints.** Every tender route has a live caller.

Pass 2 `BACKEND_ONLY` (no UI surface) in scope: `Load.tenderedAt`,
`Load.tenderedById`, `WaterfallPosition.tenderSentAt`,
`RateConfirmation.rateConNumber`, `rcTermsVersion`, `signedUrl`, `autoGenerated`.
The last two matter — an AE cannot see whether an RC is signed or auto-drafted.

## 7. Existing table that already models tender events — **reuse `LoadActivity`**

**Do not create a `TenderEvent` table.** `waterfallEventService.ts` is a thin
wrapper over `logLoadActivity` → **`LoadActivity`**, which already carries
`eventType · description · actorType · actorId · actorName · metadata · createdAt`
and whose own column comment already lists `tender_sent`. It already records
`position_tendered / accepted / declined / expired / skipped`.

**Gap:** it is keyed to `loadId`, not `tenderId`, so a load with several tenders
mixes their histories. The cheapest correct change is a nullable `tenderId`
column plus new `eventType` values — additive, no new table, and the drawer's
"Tender History" filters on it.

---

## Gap table vs TARGET

| # | Target invariant | Today | Gap |
|---|---|---|---|
| 1 | 7 tender states | 5, and `COUNTERED`/`DECLINED` aren't in the target | Add `RC_SENT · CONFIRMED · WITHDRAWN · RELEASED`; **decide COUNTERED/DECLINED — they are live carrier states** |
| 2 | All paths via one `createTender` | CLOSED **v3.8.axd–axg** — one creator, CI-guarded (creation + state) | — |
| 3 | No path writes `Load.status` directly | ≥5 paths do | Move into service |
| 4 | One live OFFERED per load unless parallel | No uniqueness check anywhere | Add guard + `waterfall.parallel` flag |
| 5 | Accept atomic; siblings auto-**withdraw** | ✅ **CLOSED v3.8.aww → axk** — one transition service; withdraw takes OFFERED **and COUNTERED**, which all six hand-rolled copies missed. Tender-state writers 11 → **3**, count asserted | — |
| 6 | `acceptTender` sole `carrierId` writer | ✅ **CLOSED v3.8.axa–axc** — one writer (`carrierAssignmentService`), 11 → 0, CI-guarded | `releaseCarrier` as sole clearer = commit 8 |
| 7 | QuickPayElection pending on tender; RC deferred | **OPEN — not closeable by a guard (v3.8.axz).** The RC half is done: the election window opens at the auto-draft and closes at send, and `resolveIssuedElection` refuses a contradictory pair before the PDF is built (§21.1). The model half is a BUILD, not an invariant — there is no `QuickPayElection` row to assert anything about, and a guard over an absent model can only assert its absence, which is a restatement of the gap rather than a defence against it | New model + gate |
| 8 | RC auto-fire idempotent, keyed to tender version | ✅ **CLOSED v3.8.axh → axv, guarded axz** — `LoadTender.version` exists, a counter bumps it and voids the stale RC, a rate change re-issues, and a re-send **reuses the frozen artifact** rather than re-rendering. Guarded structurally (the generator sits inside the not-yet-issued branch) because a re-render produces different bytes for identical terms | — |
| 9 | Tokenized e-sign w/ name·ip·UA·hash → CONFIRMED | ✅ **CLOSED v3.8.axs–axu** — single-use expiring token on a public route, typed name + attestation, name·IP·UA·timestamp·tokenId captured as columns, hash over the frozen bytes, certificate naming that hash, tender → CONFIRMED via the transition service. Concurrency-proven single use | — |
| 10 | BOL + shipper notify at CONFIRMED | ✅ **CLOSED v3.8.axv → aya** — the carrier's BOL download requires a CONFIRMED tender (AE exempt), and the customer announcement fires at the signature on **every** path. The auto paths reached CONFIRMED only once they ISSUED the RC rather than drafting it: before v3.8.aya the waterfall generated none at all and the loadboard-bid path drafted and stopped, so no signing link reached those carriers | — |
| 11 | Rate change post-accept voids RC, reverts to OFFERED | ✅ **CLOSED v3.8.axv** — voids the live RC **and kills its signing token**, returns the tender to OFFERED at the new rate with a version bump and a cleared respondedAt. SIGNED/FINALIZED untouched | — |
| 12 | Override needs userId·reason·ts; refused on HARD_FAIL | `OverrideComplianceModal` exists; **no HARD_FAIL refusal at tender time** | Verify against §14 absolute set |
| 13 | Load Board = no tender ≥ACCEPTED | Reads `Load.status`; **overlaps T&T by 6** | Re-query both |
| 14 | Needs Attention = tender-centric | Exists, unrelated filters | Extend |
| 15 | TTL from `TENDER_TTL_MINUTES` (120) | CLOSED **v3.8.axd** — env-driven, bounded 15..10080 | — |
| 16 | Expiry advances waterfall / flags | **OPEN — not closeable by a guard (v3.8.axz).** The sweep ships (Item 141) and reverts the load to POSTED so it returns to the board; what is missing is advancing the CASCADE to the next position, which is behaviour that does not yet exist. A guard can only assert what a system does, and asserting the absent advance would be a test that fails by design — a permanently-red guard is one people learn to ignore | Add the advance + the flag |
| 17 | Every transition → event row | ✅ **CLOSED v3.8.awv → axk** — every state write now runs through the transition service, so the expiry sweep and the cascade log too (neither did before) | Drawer read = commit 10 |
| 18 | Remove Confirm + Rate Conf send; add Withdraw/Release/Resend/View | ✅ **CLOSED v3.8.axp → axx** — Confirm and the standalone Rate Conf send are gone; Withdraw, Accept/Reject counter and Release shipped in axp, and Resend/View joined `WIRED_ACTIONS` once they had endpoints. A guard now fails if a wired action has no dispatcher case | — |
| 19 | Card + header read same derived status | Both read `Load.status` (consistent), but **no derived status exists** | Build derivation |

### Files touched — estimate

| Area | Files | Notes |
|---|---|---|
| Schema + migration | 2 | enum values, `LoadTender.version`, `LoadActivity.tenderId`, `QuickPayElection`, 4 RC signature columns |
| `createTender` consolidation | ~8 | 6 creators + service + validators |
| `carrierId` consolidation | ~7 | 11 sites |
| RC auto-fire + e-sign | ~5 | ⚠️ **includes the concurrently-edited `rateConfirmationController.ts`** |
| TTL + expiry | ~3 | cron, controller, env |
| Query changes | ~3 | loadController, trackTraceBoard, frontend |
| Drawer buttons | ~2 | `loads/page.tsx`, `loadStatusActions.ts` |
| Guards + tests | ~8 | one per invariant |
| **Total** | **~38** | far past the 4-file/100-LOC threshold → **≥10 commits** |

## Recommendations before Phase B

1. **Decide `COUNTERED` / `DECLINED`.** The target lists neither. Both are live
   carrier actions with UI, an email, and a persisted `declineReason`. Dropping
   them is a product decision, not a migration detail.
2. **Reuse `LoadActivity`; add `tenderId`.** No new table.
3. **`Load.carrierId` (User) ≠ `LoadTender.carrierId` (CarrierProfile).** Pin
   this in a test before consolidating, per Item 222.4.
4. **Sequence RC work last** — that file belongs to another session right now.
5. Invariants 5 (siblings→WITHDRAWN) and 6 (single writer) are the highest-value,
   lowest-risk first commits.

## Not verified in this phase

- Runtime behaviour — nothing was executed against a database.
- Whether `automation.ts:55` and `instantBookService.ts:131` are reachable in
  production (both write `carrierId`; neither was traced to a live caller).
- Frontend Track & Trace drawer button inventory (backend queries only).
