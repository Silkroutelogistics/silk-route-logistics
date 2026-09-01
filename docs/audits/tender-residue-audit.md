# Tender lifecycle residue — Phase A audit (read-only)

**Baseline:** `17b42b78` · 2026-09-01 · **no source changed in this phase.**
**Scope:** the four rows left open or partial when the Unified Tender Lifecycle arc
closed (§13.3 Item 253): rows **7**, **16**, **4**, **3**.

---

## Headline: two of the four rows are misdescribed by the gap table

Before proposing anything, each row's claim was checked against the code. **Rows 16
and 4 do not say what is true**, and in both cases the row is *pessimistic* — it
describes something as absent that exists, while the real gap sits somewhere
adjacent. Row 7 is half-true in a way that matters. Only row 3 is accurate as
written.

This is §19 Sub-pattern 15 (a "NOT built" claim read as current) firing on the
arc's own closing artefact, five commits after it was written. Worth noting because
that table is the thing a future session would build from.

| Row | Gap table says | Actually true | Proposal |
|---|---|---|---|
| **7** | QuickPayElection model absent; a build, not an invariant | The **election exists** on the Load, is frozen at issuance, and the carrier **can already elect it** (see the CORRECTION below) | Do **not** add a parallel model. Add provenance to the path that exists |
| **16** | "Advancing the cascade does not exist" | **It exists** — `expireStalePositions` advances via `advanceWaterfall`. The real gap is **two sweeps racing over the same rows** | Scope the direct sweep out of waterfall tenders |
| **4** | Needs `waterfall.parallel` before a uniqueness rule | Broadcast creates **no Waterfall row at all**, so a `waterfall.*` flag cannot cover it | Put the flag on the **Load**, not the waterfall |
| **3** | 28 sites / 18 files; enforcing today breaks production | Accurate. But 28 *sites* understates the *transitions* — `assignCarrier` fans in 6 callers | Add an `AUTO` actor with 4 named edges |

---

## Row 7 — Quick Pay election

### Where pilot membership lives

| Thing | Where | Meaning |
|---|---|---|
| Pilot workflow | `QuickPayEnrollment` (PENDING / APPROVED / DECLINED / WITHDRAWN) | the request-then-approve pilot, per carrier |
| Availability cache | `CarrierProfile.quickPayEnabled` | **denormalised** cache of "has an APPROVED enrolment"; the schema comment says write it only alongside an enrolment transition |
| Consent forensics | `CarrierProfile.quickPayAgreed{At,FromIp,FromUserAgent}` + `quickPayVersion` | the Caravan Quick Pay Agreement signature |
| Tier economics | `quickPayFeeRate`, `quickPayAutoLimit`, `quickPayMonthlyLimit` | §8 ladder defaults |

### Where the per-load election already lives — this is the finding

**`LoadTender` carries no Quick Pay field of any kind.** The election is
**load-scoped**:

- `Load.quickPaySpeed` (`QuickPaySpeed`) — authoritative since v3.8.asb
- `Load.quickPayFeePercent` (Float) — the fee applied to this load
- `Load.carrierPaymentTier` (`PaymentTier`)
- `LoadQuickPayOverride` — AE override of the tier default, carrying `reason`,
  `reasonNote`, `overriddenBy`, `overriddenAt` (**one per load**, `loadId @unique`)

Note the asymmetry: the **override** path already records who and when. The
**election itself** does not.

### The window

Opens when the auto-draft is created at tender accept; **closes at issuance**
(`sendRateConfirmation`). At issuance `resolveIssuedElection(fd, carrierTier)`
resolves speed and fee **as a pair**, refuses the whole send with **422** if they
contradict, prints the resolved pair on the PDF, and freezes it onto the Load in
the same update that opens the carrier's view of the document.

The controller's own comment records why step 4 moved here: doing it at draft
creation "charged carriers under documents they had never been shown."

### What accounting reads

`integrationService.createCarrierPayOnDelivery` reads `load.quickPayFeePercent`
and `load.quickPaySpeed` (both frozen), the **enrolment** for pilot state, and
`profile.quickPayEnabled`. It no longer falls back to `rc.formData`.

### ~~The carrier never elects~~ — CORRECTED 2026-09-01, this claim was WRONG

> **What this section said, and it was false:** *the carrier accepts; the AE makes
> the election in the RC modal formData; the carrier-facing half does not exist.*

**The carrier CAN elect, per load, and could when this audit was written.**
`PUT /carrier-payments/loads/:loadId/quickpay-speed` is live, has a GET beside it
returning the three speeds priced for the tier, refuses with `QP_NOT_ENABLED`
when the carrier is not in the pilot, reports `locked` once the fee is frozen,
and is wired to `/carrier/dashboard/my-loads` with the dollar figures shown so
the choice reads as three prices rather than three words.

**How the claim was made.** I grepped ONE page -- the tenders/accept page -- found
no Quick Pay reference, and generalised from it to the platform. The narrow
finding was true and is still true: there is no election step at accept time. The
inference drawn from it was not.

**This is §19 Sub-pattern 17** (verification-instrument failure: the reach of the
instrument excluded the answer), committed inside the audit whose whole purpose
was to check claims before anyone built on them. It is the same shape the
sub-pattern was written for, and worth recording precisely because an audit is
the last place it should happen -- a wrong claim here does not merely misinform,
it commissions work. The directive for Phase B was written on this section, and
7d as originally cut described building a surface that already existed.

**What was genuinely missing, and what row 7 therefore shipped:** PROVENANCE. The
endpoint wrote `Load.quickPaySpeed` alone, so a fee could be shown to a carrier
with no record of who chose it, when, or through what channel -- while the BCA,
the Quick Pay Agreement and the rate confirmation each capture name, IP, user
agent and timestamp. That finding stands unchanged and was the right one.

**Going-forward rule, from this:** a claim of the form *"the platform does not do
X"* needs a search across the surfaces that COULD do X, not one where X was
expected to be. Grep the endpoint layer before concluding a capability is absent.

### Two real gaps, and one of them is evidentiary

1. **No provenance.** An election appears on the Load with no record of who chose
   it, when, or through what channel. If a carrier disputes a 3% deduction there
   is nothing saying they elected it — while the BCA, the Quick Pay Agreement and
   now the RC all capture name, IP, user agent and timestamp. **The per-load money
   decision carries the weakest evidence of any consent artefact in the system.**
2. **Load-scoping outlives the tender.** `voidLiveRateConfirmations` clears RCs and
   the signing token but **not** `Load.quickPaySpeed` / `quickPayFeePercent`. After
   a rate change (`loadController:1044`), a counter (`tenderController:490`) or a
   **release** (`carrierReleaseService:151`), the election persists — so a load
   re-offered to a *different* carrier carries the first carrier's elected fee.
   **Mitigated:** the next issuance re-resolves against the new carrier's tier and
   overwrites, so the stale value is only readable between release and the next RC.
   Low severity, and it is the argument for tender-scoping.

### Proposed shape — deliberately NOT the brief's model

The brief proposed `QuickPayElection { tenderId, carrierId, elected, feeBasis,
decidedAt, decidedVia }`. **Half of those fields already exist on the Load**, and a
second row holding "what was elected" beside `Load.quickPaySpeed` would create two
answers to one question — the dual-source drift this codebase has repeatedly had to
unpick (dual suspension columns, dual onboarding status, `Load.rate`).

Recommended instead:

```prisma
model QuickPayElection {
  id               String    @id @default(cuid())
  tenderId         String    @unique       // tender-scoped: survives re-offer correctly
  loadId           String                  // denormalised for the charge-path read
  carrierProfileId String
  speed            QuickPaySpeed           // the ELECTED speed
  feePercent       Float                   // resolved against the tier AT decision time
  decidedAt        DateTime  @default(now())
  decidedVia       QuickPayDecisionChannel // PORTAL | CARVAN | EMAIL_LINK | ON_BEHALF
  decidedByUserId  String?                 // null when the carrier decided for themselves
  evidenceType     TenderEvidenceType?     // required when decidedVia = ON_BEHALF
  evidenceRef      String?                 // mirrors the accept-on-behalf contract
  signerIp         String?
  signerUserAgent  String?
}
```

with **`Load.quickPaySpeed` / `quickPayFeePercent` retained as the frozen
projection** that the charge path and the PDF read.

The election row is the *record of the decision*; the Load columns stay the *frozen
terms of the document*. That preserves every existing reader unchanged and adds only
what is missing.

`decidedVia = ON_BEHALF` reuses `TenderEvidenceType` deliberately — v3.8.axq
already ratified that an AE acting for a carrier must point at something a person
can go and look at, and a fee election is the same class of act as an acceptance.

**Sequencing note.** The model is the smaller half. The carrier-facing election
surface is the part with product weight and should land **with** the model rather
than after it: a provenance column whose only writer is the AE records that the AE
decided, which is exactly what happens today.

---

## Row 16 — expiry advances the cascade

### The row is wrong: advancing already exists

`waterfallEngineService.expireStalePositions()` (L703), called from
`waterfallTick()` (L934), which `schedulerService` runs on an **adaptive ticker**
(v3.8.arf), already:

1. finds `status: "tendered"` positions past `tenderExpiresAt`
2. marks the position `expired`
3. settles the tender to `EXPIRED` with reason `ttl_elapsed`
4. logs `position_expired`
5. **calls `advanceWaterfall(waterfallId, position + 1)`**

and `triggerFallbackChain` handles genuine exhaustion by flipping the waterfall to
`exhausted` and the load to `POSTED` — with a comment explaining that visibility and
status must move together.

**A resumable cursor already exists:** `Waterfall.currentPosition`, written at
`waterfallEngineService:274`. Per-position TTL is
`WaterfallPosition.tenderExpiresAt`, and `@@index([status, tenderExpiresAt])` exists
specifically to serve this sweep.

### The real gap: two sweeps own the same rows

`processExpiredTenders` (the **direct** sweep, Item 141, hourly at :30) selects:

```
status: { in: ["OFFERED", "COUNTERED"] }, expiresAt: { lt: now }, deletedAt: null
```

**It does not exclude waterfall-linked tenders** — `waterfallPositionId` is not in
the filter. On finding no live tenders left on the load it reverts
`TENDERED -> POSTED`.

`waterfallEngineService:218` writes **the same instant** to both
`LoadTender.expiresAt` (L250) and `WaterfallPosition.tenderExpiresAt` (L268), so
**both sweeps become eligible simultaneously** and only scheduler order decides.

- **Ticker wins** (the usual case — it runs fast while a cascade is active): the
  tender is already `EXPIRED`, so the direct sweep's `IN (OFFERED, COUNTERED)`
  filter matches nothing. Correct.
- **Cron wins** (ticker in idle/slow mode, or after a process restart): the direct
  sweep expires the tender and reverts the load to `POSTED` **while the waterfall is
  still `active`**. The ticker then advances the cascade and tenders the next
  carrier — on a load that is back on the open board.

That is the row's real content, and it is a **race, not a missing feature.**

### Proposed shape

Scope the direct sweep out of cascade-owned tenders:

```
where: { status: { in: ["OFFERED","COUNTERED"] }, expiresAt: { lt: now },
         deletedAt: null, waterfallPositionId: null }
```

One clause. The cascade owns its own expiry and always has; the direct sweep should
own only the tenders nobody else owns.

Guard: assert the direct sweep's filter excludes waterfall-linked tenders, and
assert the two writers of the expiry instant stay in sync (they are one variable
today, and a future edit could split them without anything noticing).

**Not proposed:** merging the two sweeps. They have genuinely different jobs — one
returns a load to the board, the other walks a cascade — and merging them would put
cascade knowledge into a path that has none.

---

## Row 4 — one live OFFERED per load

### Broadcast creates no waterfall

`broadcastTenderService.launchBroadcast` creates **N simultaneous OFFERED tenders**
(`Promise.all` over candidates, all sharing one `expiresAt`), each through
`createTender` with `reason: "broadcast"`, then flips the load to `TENDERED`. Its
only caller is `routes/tenders.ts:169`.

**It contains zero references to `waterfall`.** So the row's own target — a
`waterfall.parallel` flag — **cannot cover the case that actually produces multiple
live tenders**, because broadcast has no waterfall row to hang a flag on.

### Nothing on the tender row distinguishes broadcast from sequential

`reason: "broadcast"` is passed to `createTender`, which forwards it to
`logTenderTransition` — into **`LoadActivity`**, i.e. history. It is **not**
persisted on `LoadTender`. `LoadActivity` has no `reason` column either; the value
lands in `metadata` JSON.

So the only queryable discriminator today is `waterfallPositionId` (non-null =
cascade), and **broadcast and direct tenders are indistinguishable** on the row. A
uniqueness rule cannot currently be expressed against tender state at all.

### Proposed shape

Put the flag on the **Load**, because that is the scope the rule is about:

```prisma
Load.tenderFanout  TenderFanout @default(SEQUENTIAL)   // SEQUENTIAL | PARALLEL
```

set to `PARALLEL` by `launchBroadcast` (and by a future parallel cascade mode),
`SEQUENTIAL` everywhere else. The uniqueness rule it unlocks:

> A load whose `tenderFanout` is `SEQUENTIAL` has **at most one** tender in a LIVE
> state (`OFFERED` or `COUNTERED`) at any time.

Behaviourally assertable against a real database, and structurally guardable by
asserting that every tender creator either sets the flag or is a sequential path.

**Rejected alternative:** a `broadcastId` on the tender. It marks the group but does
not state the *rule*, and the rule is what the row is asking for.

---

## Row 3 — nothing writes `Load.status` directly

### The census — 28 sites across 18 files (matches the guard baseline)

| File | Sites | Target statuses | Actor |
|---|---|---|---|
| `controllers/accountingController.ts` | 1 | INVOICED | AE |
| `controllers/checkCallController.ts` | 1 | computed | AE |
| `controllers/customerController.ts` | 1 | CANCELLED | AE |
| `controllers/loadController.ts` | 2 | computed, CANCELLED | AE |
| `controllers/rateConfirmationController.ts` | 1 | FINALIZED | AE |
| `controllers/tenderController.ts` | 2 | TENDERED, POSTED | AE |
| `routes/carrierLoads.ts` | 3 | AT_PICKUP, computed, computed | **CARRIER** |
| `routes/loadTracking.ts` | 3 | computed, LOADED, DELIVERED | SYSTEM |
| `services/broadcastTenderService.ts` | 1 | TENDERED | AE |
| `services/carrierAssignmentService.ts` | 2 | `status as never` (x2) | **fans in 6 callers** |
| `services/checkCallAutomation.ts` | 1 | mapping | SYSTEM |
| `services/ediService.ts` | 1 | BOOKED | SYSTEM (already validates) |
| `services/emailCheckCallParser.ts` | 1 | computed | SYSTEM |
| `services/geofenceService.ts` | 1 | computed | SYSTEM |
| `services/integrationService.ts` | 2 | POD_RECEIVED, INVOICED | SYSTEM |
| `services/shipperNotificationService.ts` | 1 | POD_RECEIVED (guarded) | SYSTEM |
| `services/waterfallEngineService.ts` | 3 | TENDERED, POSTED, POSTED | **AUTO** |
| `services/waterfallTenderService.ts` | 1 | TENDERED | AUTO |

**28 sites understates the transitions.** `carrierAssignmentService.assignCarrier`
is two sites but **six callers**, each performing a different transition:

| Caller | status | actor |
|---|---|---|
| `tenderController:213` (acceptTender) | BOOKED | CARRIER accept |
| `routes/automation.ts:57` | BOOKED | AUTO |
| `routes/loadBids.ts:229` | **DISPATCHED** | AE accepts a bid |
| `fallOffRecovery:173` | BOOKED | AUTO |
| `instantBookService:135` | BOOKED | AUTO |
| `waterfallEngineService:598` | **DISPATCHED** | AUTO |

`assignCarrier` writes `status as never`, so **neither the type system nor the state
machine sees any of these six.** `clearCarrier` is the mirror, with one caller
(`carrierReleaseService:134`, `status: "POSTED"`).

### Why a zero-writer guard is red against correct code today

`ActorRole` is `"CARRIER" | "AE"` — there is no third actor. The AE map:

```
POSTED:     ["TENDERED", "BOOKED", "CANCELLED"]
TENDERED:   ["CONFIRMED", "BOOKED", "POSTED", "CANCELLED"]
BOOKED:     ["DISPATCHED", "CANCELLED", "TONU"]
DISPATCHED: ["AT_PICKUP", "CANCELLED", "TONU"]
```

Four edges production legitimately performs are absent from it:

| Edge | Performed by | Why it is correct |
|---|---|---|
| `POSTED -> DISPATCHED` | waterfall accept, loadbid accept | §2 auto-pilot divergence: bulk accept **is** dispatch, and `dispatchedAt` feeds the dispatched-today dashboards |
| `TENDERED -> DISPATCHED` | same, when already tendered | same |
| `BOOKED -> POSTED` | release / fall-off recovery | a fallen-off load must return to the board |
| `DISPATCHED -> POSTED` | release / waterfall exhaustion | same |

Enforcing the AE map over these would **break bulk dispatch and fall-off recovery**
— which is why Item 194's log-first investigation stopped short of wiring, and why
the guard freezes the population instead.

### Proposed shape

```ts
export type ActorRole = "CARRIER" | "AE" | "AUTO";

const AUTO_ALLOWED_TRANSITIONS: Partial<Record<LoadStatus, LoadStatus[]>> = {
  POSTED:     ["TENDERED", "DISPATCHED", "CANCELLED"],
  TENDERED:   ["DISPATCHED", "POSTED", "CANCELLED"],
  BOOKED:     ["DISPATCHED", "POSTED", "CANCELLED", "TONU"],
  DISPATCHED: ["AT_PICKUP", "POSTED", "CANCELLED", "TONU"],
};
```

**`AUTO` is deliberately NOT a superset of `AE`.** It is a *different* set: the auto
paths may skip BOOKED and may move backwards to POSTED, and a human AE should
inherit neither — the BOOKED checkpoint exists so an AE can review before committing
dispatch (§2), and letting an AE skip it silently would erase a deliberate control.

Then `assignCarrier` and `clearCarrier` take an `actor: ActorRole` and drop the
`as never` cast, so all six fan-in callers become typed and validated at the one
place they already share.

**Sequencing:** log-only first, per Item 194 — instrument the four edges, let a
deploy cycle prove the census is complete, then enforce. The `as never` cast is the
tell that these transitions have never been checked by anything, so the log-only
pass is likely to surface edges this audit has not predicted.

---

## Rows that should stay open after this phase

**None of the four is unclosable** — each now has a proposal with a named shape. But
two carry conditions that should be stated before any build:

- **Row 7** should not ship the model without the carrier-facing election surface. A
  provenance record whose only writer is an AE records that the AE decided, which is
  what already happens; the evidentiary gap would remain open while looking closed.
- **Row 3** should not ship enforcement in the same commit as the actor. The
  `as never` cast means these transitions have never been checked by anything, so
  log-only first is the difference between a fix and an outage.

## File counts

| Row | Files to touch (estimate) | Migration |
|---|---|---|
| 7 | ~6 backend + 2 frontend | yes (new model + enum) |
| 16 | 1 backend + 1 guard | no |
| 4 | 2 backend + 1 guard | yes (enum + column) |
| 3 | 3 backend + 1 guard | no |
