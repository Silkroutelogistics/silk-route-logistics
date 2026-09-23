# Pricing, tiers and Quick Pay — §8, §9, §10 (and §21)

Moved out of `CLAUDE.md` on 2026-09-23. **Load this for Quick Pay, settlements,
carrier pay, Compass scoring, tier advancement, or rate-confirmation terms.**

Three things in here are LOCKED and are quoted verbatim by code and by documents, so
read them here rather than from memory:

- **§8 the v3 Quick Pay ladder.** Silver Net-30 / 3% / 5%, Gold Net-21 / 2% / 4%,
  Platinum Net-14 / 1% / 3%; same-day is a universal +2% premium and is **never**
  tier-gated; auto-approve $2,000 / $4,000 / $6,000; monthly $15,000 / $40,000 /
  $80,000. A pilot changes who can get in, never what it costs.
- **§9 the Compass Score weights**, and which factors are genuinely measured. Tracking
  compliance is **not measured** and is renormalised out rather than scored as a
  constant — a persisted 0 there is a sentinel, not a result.
- **§10 the tier gates**, each an AND of cumulative loads, on-time percentage and
  tenure. There is one authoritative advancement path; the score-based one was retired.

Section numbers unchanged; see `README.md`.

---

## §8 v3 QUICK PAY PRICING (LOCKED)

> **Pilot note (ratified 2026-08-16, §21.1).** Quick Pay is a **limited pilot**:
> the carrier requests it, SRL approves or declines, and SRL may withdraw it on
> notice. That governs **availability only**. Every figure in this section is
> unchanged and stays LOCKED — a pilot changes who can get in, never what it
> costs. Standard tier pay is free and never depends on the pilot. Do not
> soften any number here on the theory that a pilot is provisional, and do not
> present reaching a tier as granting Quick Pay: it grants the Net terms and
> the published fee that would apply, not admission.

> **Tier-advancement calibration note (added v3.8.aij, 2026-05-23).** Tier names + pricing are stable; the loads / on-time / tenure thresholds in §10 that gate advancement between tiers are calibrated to **current pre-revenue launch volume** and are scheduled to be revisited at ~6 months operational baseline OR when monthly volume materially increases. Threshold revisions go through the same atomic-commit + halt cadence as the v3.8.aii backend + v3.8.aij ledger commits that locked them.

### v3.8.aib Sprint 1 honesty pass — retired lines per tier

The Detention / Referral / Safety Bonus / FSC-pass-through-by-tier lines previously listed under each tier are **RETIRED** as canonical claims. None had backend tracking, payout workflow, or operational margin behind them. See §5 prohibited claims for details. What remains is the pay-ladder spine, auto-approve thresholds, monthly limits, and Platinum's Priority freight access — all broker-controlled and verifiable.

### Silver (1–4 trucks, Day-1 entry)
- Net-30 free · 7-day QP 3% · same-day 5% (3%+2%)
- Auto-approve $2,000/load · monthly limit $15K
- ~~Detention $50/hr after 2hr~~ — retired v3.8.aib (see §5)
- ~~Referral $250~~ — retired v3.8.aib (see §5)
- ~~FSC pass-through: loaded miles~~ — reframed v3.8.aib to "FSC itemized on every rate confirmation" universal (§4 #1)

### Gold (5–10 trucks OR M4 milestone)
- Net-21 free · 7-day QP 2% · same-day 4% (2%+2%)
- Auto-approve $4,000/load · monthly limit $40K
- ~~Detention $65/hr after 2hr~~ — retired v3.8.aib (see §5)
- ~~Referral $500~~ — retired v3.8.aib (see §5)
- ~~Safety bonus $150/mo ($450/qtr)~~ — retired v3.8.aib (see §5)
- ~~FSC pass-through: loaded + empty miles~~ — retired v3.8.aib (see §5); shipper-billed FSC is loaded-miles-only

### Platinum (11+ trucks OR M5 milestone)
- Net-14 free · 7-day QP 1% · same-day 3% (1%+2%)
- Auto-approve $6,000/load · monthly limit $80K
- ~~Detention $75/hr after 1.5hr~~ — retired v3.8.aib (see §5)
- ~~Referral $750~~ — retired v3.8.aib (see §5)
- ~~Safety bonus $300/mo ($900/qtr)~~ — retired v3.8.aib (see §5)
- ~~FSC pass-through: all miles~~ — retired v3.8.aib (see §5); requires SRL to pay from margin, unbacked
- Priority freight access — RETAINED, broker-controlled

### Critical rule
Same-day Quick Pay is UNIVERSAL +2% premium on tier fee. **Not tier-gated.** Every tier can elect same-day on any load.

---

## §9 COMPASS SCORE (7-factor, published on /carriers)

| Factor | Weight |
|---|---|
| On-time pickup | 20% |
| On-time delivery | 20% |
| Tracking compliance | 15% |
| Claims ratio | 15% |
| Communication | 10% |
| Document timeliness | 10% |
| Acceptance rate | 10% |

> Factor renamed "GPS compliance" → "Tracking compliance" (v3.8.alz, Build C, 2026-05-30) so the public label matches what's measured: % of loads with captured location visibility from any source (carrier portal / geofence / check-call-email / **ELD** via motiveService+samsaraService). The `CarrierScorecard.gpsCompliancePct` DB column is unchanged. Compass factors are now genuinely measured backend-side (Builds A/B/D/C/E) — on-time pickup/delivery from actual event timestamps + 2h grace, document timeliness POD≤delivery+24h, tracking from LoadTrackingEvent location. Tracking compliance is **NOT MEASURED (corrected 2026-09-07, v3.8.bax + v3.8.bay)**. It read NEUTRAL (100) until a carrier connected ELD, and **nothing in the codebase has ever written `CarrierProfile.eldEnabled`**, so that constant was a standing claim of location visibility SRL does not have, carrying 15% of the composite on every carrier. `lib/trackingFactor.resolveTrackingFactor` now returns null when no location source exists, and `tierService.calculateOverallScore` renormalises over the remaining six factors, so an unmeasured carrier is scored on what SRL can actually observe rather than credited with a tracking record nobody captured. `CarrierScorecard.gpsCompliancePct` is `Float @default(0)` and cannot hold null without a migration, so the persisted value for such a carrier is a 0 sentinel; every reader gates on `eldEnabled` and renders "Not measured", because printing the sentinel would be the same false claim pointing the other way. Phase 1 replaces the sentinel with a nullable column. Per-carrier ELD credentials (`CarrierProfile.eldApiKeyEncrypted` etc.) are on the schema and unwritten: see §13.3 Item 261.
>
> **Document-timeliness alignment (noted v3.8.arn, measurement unchanged).** The POD ≤ delivery + 24h window this factor grades on now agrees with what the Rate Confirmation promises the carrier — signed BOL, POD, and supporting paperwork due within 24 hours of delivery. Carriers are graded against the same deadline they are given in writing, so the factor is defensible if a carrier disputes a Compass score. Any future change to one must move the other in the same commit.

---

## §10 TIER ADVANCEMENT GATES (locked launch model, v3.8.aii + v3.8.aij)

The Caravan Partner Program advances carriers through 3 tiers (Silver / Gold / Platinum) plus a Founding recognition status on top of Platinum. Each transition is an **AND** of (cumulative-since-join loads, on-time pct, tenure days). Counting reads `cppTotalLoads` + `cppJoinedDate` per `caravanService.checkMilestoneAdvancement`.

**Threshold calibration:** the load thresholds below (12 / 20 / 30) are calibrated to current pre-revenue launch volume. Revisit at ~6 months operational baseline OR when monthly volume materially increases. Per §8 note.

**Single authoritative advancement gate.** The legacy parallel score-based promotion path in `tierService` (score ≥90 → Gold, ≥95 → Platinum) was retired in v3.8.aii so a carrier cannot bypass the loads-and-days gate via service score alone.

| Tier / status | Code milestone enum | Loads (cumulative-since-join) | On-time | Tenure floor | Outcome |
|---|---|---|---|---|---|
| Silver (entry) | M1_FIRST_LOAD | 3 completed loads + service score ≥ 70 (`tierService.checkGuestPromotion`) | — | — | Silver tier active. Working toward Gold gate. |
| Gold | M4_PARTNER | 12 | 97% | 90 days | → Gold tier. Net-21 + 2% 7-day QP unlock per §8. |
| Platinum | M5_CORE | 20 | 98% | 120 days | → Platinum tier. Net-14 + 1% 7-day QP unlock per §8. Priority freight access. |
| Founding | M6_FOUNDING | 30 | 98% | 180 days | Recognition status. Carrier remains tier=PLATINUM with Founding flag; 1% Quick Pay tier locked permanently. |

**Retired gating criteria (do not surface on carrier-facing pages):**
- **Referral requirement** — retired v3.8.aii. No field tracks referrals; the referral system was retired in v3.8.aib Sprint 1.
- **"3 active lanes"** — retired v3.8.aii. No field exists in code for this criterion; was page-only marketing copy that didn't map to any backend gate.
- **Score-based promotion** — retired v3.8.aii. `tierService.calculateTier(overallScore)` + `recalculateAllTiers` deleted. Compass Score still drives scorecard persistence + bonus % display but does NOT mutate tier directly.
- **Fleet-size promotion shortcut** — `calculateTierFromFleet` retired v3.8.aii (dead code, zero callers). Per CLAUDE.md §11 v3.7.a "PLATINUM identity fix" precedent and the locked model's "advancement is performance-based" framing, fleet size does not bypass the gate.

**Legacy enum value handling.** `CarrierMilestone` enum still includes `M2_PROVEN` and `M3_RELIABLE` values for backwards compatibility with any pre-reconciliation persisted rows. `checkMilestoneAdvancement` normalizes both to `M1_FIRST_LOAD` lookup so those carriers advance to `M4_PARTNER` under the locked gate. No Prisma migration shipped; legacy values are inert after Commit 1.

---


---

> **§21 lives here, and a test reads it.**
> `backend/__tests__/unit/routes/quickPayPilotDocClaims.test.ts` locates §21.1 by its
> heading and §21.2 by the next one **in this file**, then holds its claims against
> the code: the pilot-request endpoint exists, the portal calls it, the migration is
> applied rather than pending, and approval alone still does not enable Quick Pay.
>
> It carries a length tripwire, so renaming either heading makes it **fail loudly**
> instead of passing against an empty string. Keep §21.1 before §21.2, keep both
> headings spelled exactly as they are, and if this section ever moves again, repoint
> that test in the same commit — never before, never after.
>
> **Do not quote those two headings verbatim anywhere above the section itself.** The
> test finds them with a plain `indexOf`, so prose *about* the anchor is indistinguishable
> from the anchor: an earlier draft of this very note quoted them and the test matched
> the note, slicing 16 characters. The tripwire caught it, which is what it is for — but
> the hazard is cheaper to remove than to absorb.

---

## §21 QUICK PAY PILOT + DOCUMENT NUMBERING (ratified 2026-08-16)

Two principal decisions, both ratified 2026-08-16. This section states what was
decided and, separately, what is actually built — those are not the same list,
and the difference is the point of writing it down.

### §21.1 — Quick Pay is a limited pilot (request, then approve)

**Ratified.** Quick Pay is no longer generally available on request of the
carrier alone. It is a **limited pilot**:

1. The carrier **asks** — a tick on the carrier application (`/onboarding`).
2. The request lands for an AE as **pending**.
3. An AE **approves or declines**, with a reason on decline.
4. Once approved, the enrolment rides the tender-sending process.
5. The carrier receives the Rate Confirmation, which states the option applied
   to that load.

The pilot is **withdrawable by SRL on notice**. Withdrawal is forward-only: it
never affects a load already funded under Quick Pay.

**What the carrier picks, and when.** Onboarding is a yes/no request to join.
**Speed is per load**, because same-day is a +2% premium under §8 and cash need
is per load, not permanent. Default is 7-day. The RC prints the speed and the
fee percentage applied **to that load**, not the tier ladder.

**A pilot changes availability, never economics.** The §8 ladder is untouched
and stays LOCKED: Silver Net-30 / 3% / 5%, Gold Net-21 / 2% / 4%, Platinum
Net-14 / 1% / 3%; same-day is a universal +2% premium and is never tier-gated;
auto-approve $2,000 / $4,000 / $6,000; monthly $15,000 / $40,000 / $80,000. Do
not weaken any of these on the theory that a pilot is provisional. Standard tier
pay is free, always available, and never depends on the pilot.

**Two decline paths, deliberately distinct.** Declining a carrier's request to
JOIN (QP Agreement §3) is not the same event as declining ONE LOAD over an
approval ceiling (QP Agreement §6). Both end at standard tier terms at no fee.
Keep them separate — collapsing them loses the fact that a carrier inside the
pilot can still have a single load declined. The same distinction holds between
**declined** (refused; nothing was ever switched on) and **withdrawn** (was in,
taken out; funded loads may sit behind it). No surface may render those two as
one status.

**Built.** `QuickPayEnrollment` model + `QuickPayEnrollmentStatus`; the
`requestQuickPayPilot` tick on registration; AE `GET /carriers/quickpay-enrollments`
and `POST /carriers/:id/quickpay/{approve,decline,withdraw}` (ADMIN / CEO /
**OPERATIONS** — wider than the ADMIN+CEO carrier-approval pair on purpose, since
this decides fee-bearing payment timing on loads the carrier is already cleared
to haul, and Operations runs the pilot); the pilot fields on
`GET /carrier-auth/activation-status`; the four-code 403 gate on the enable path
of `POST /carrier-auth/quickpay-election`; Caravan Quick Pay Agreement
**v2026-08-16-v4** carrying the pilot in its preamble, §3 and §10; and the
surfaces — onboarding request, AE pending queue + per-carrier tab, carrier
activation, carrier payments, `/carriers`, `/faq`.

**Ratified-pending — and TWO of these were stale for two weeks.** Corrected
2026-08-31 after this list was read as current, quoted to Wasi as a live gap,
and very nearly used to justify rebuilding an endpoint that already exists:

- ~~**The migration is authored but NOT applied.**~~ **APPLIED.**
  `20260816120000_document_numbers_quickpay_pilot_accessorial_uniqueness` sits in
  the live `prisma/migrations/` directory, not `_pending_migrations/`, and
  production reports a later migration as applied — Prisma applies in order, so
  this one landed with it. Enrolment reads return real rows.
- ~~**There is no carrier-side request endpoint.**~~ **BUILT, AND WIRED.**
  `POST /api/carrier-auth/quickpay-pilot-request` shipped in v3.8.asb
  ([`routes/carrierAuth.ts`](backend/src/routes/carrierAuth.ts)) — APPROVED-only,
  idempotent while a request is open, allows a fresh request from DECLINED or
  WITHDRAWN, and notifies the desk. The carrier portal calls it from
  [`activation/page.tsx`](frontend/src/app/carrier/dashboard/activation/page.tsx).
  The enable-path 403's `action.href` and the approve-path 409's "they can
  request it from their portal" both now describe a control that exists.
- **Approval does not switch Quick Pay on.** STILL TRUE, verified.
  `POST /carriers/:id/quickpay/approve` sets `QuickPayEnrollment.status` and
  nothing else; the only writer of `quickPayEnabled: true` is the signature path
  at [`carrierAuth.ts`](backend/src/routes/carrierAuth.ts) `quickpay-election`.
  Approval admits; the carrier still signs the Caravan Quick Pay Agreement. An AE
  reading "approved" is looking at a half-done state, and the AE tab says so.
- **`CarrierProfile.quickPayEnabled` is a denormalised mirror** of "has an
  APPROVED enrolment", not an independent switch. It stays the read-gate every
  charge path already checks. Write it only in the same transaction as an
  enrolment transition. Anything else re-opens the drift this model closed.

**Why this went stale, and what now catches it.** v3.8.asb built the endpoint and
applied the migration; nobody came back to this list. A "NOT built" list is the
most dangerous kind of documentation to leave unmaintained, because it is read
precisely when somebody is deciding whether to build something — so a stale entry
does not merely misinform, it commissions duplicate work.
[`quickPayPilotDocClaims.test.ts`](backend/__tests__/unit/routes/quickPayPilotDocClaims.test.ts)
now fails if this section claims a route is missing while that route exists in
the source. §19 Sub-pattern 15.

### §21.2 — Document numbering: suffix on a shared stem

**Ratified.** Document references are a **SUFFIX on a shared stem, never a
prefix.** The stem is the existing load number, so every document for one load
sorts together in any system that sorts a text column — which is the whole
point, and what a prefix scheme (`BOL-…`, `RC-…`) destroys.

| Document | Number |
|---|---|
| Load | `SRL-121485` — the anchor, already generated today |
| BOL | `SRL-121485B` |
| Rate confirmation | `SRL-121485R` |
| Invoice | `SRL-121485I` |
| Supplemental invoice (accessorial-only) | `SRL-121485S` |
| Settlement / carrier pay | `SRL-121485P` — P for pay, so it cannot collide with S |

This is the Bison Transport convention (load 5789854, invoice 5789854A,
accessorials 5789854S) carried onto the SRL stem. The `SRL-` prefix stays so a
carrier hauling for several brokers can tell whose paper they are holding.

**Re-issues take a numeric revision suffix** — `SRL-121485R2`, `SRL-121485R3`.
Revision 1 carries no digit so the common case reads clean. **Original numbers
are NEVER reused:** `rateConNumber` is `@unique`, so reuse throws on a normal
re-issue, and in a dispute the document has to say on its face which version the
carrier signed.

**`Load.bolNumber` is NOT this.** That column is the **shipper-supplied** BOL
reference their AP department searches on. SRL's own BOL number is
`Load.srlBolNumber`. They are different things and must stay different — do not
overload either.

**Built.** The anchor (`generateLoadNumber`, Postgres sequence `load_number_seq`)
already existed. The suffix scheme, the allocator and the re-issue rule live in
`backend/src/lib/documentNumber.ts`; the persisted columns (`Load.srlBolNumber`,
`RateConfirmation.rateConNumber`, `Invoice.srlDocNumber`, `CarrierPay.srlDocNumber`)
are in the schema and the migration.

**Ratified-pending — NOT built.** Same caveat: the migration is authored, not
applied. Two load creators still bypass `generateLoadNumber`
(`shipperPortalController.ts`, `emailToLoadService.ts`), so a portal-created or
email-created load has a null `loadNumber` and therefore **no stem to suffix
from** — its documents have nothing to hang off. Closing that is a prerequisite
for the scheme being true of every load rather than most of them.

---

