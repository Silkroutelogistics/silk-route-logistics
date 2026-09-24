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

### §21.2 — Document numbering: one bare number per load

**Amended 2026-09-23 by Wasi, superseding the suffix-on-a-shared-stem scheme
ratified 2026-08-16.** The retired scheme is described at the end of this section
rather than deleted, because every number issued before this amendment was issued
under it and is never rewritten — a reader holding one needs to know what it meant.

**One bare number, no prefix and no suffix**, carried by the load and by every
core document issued against it:

| Document | Number |
|---|---|
| Load | `5001` |
| Bill of lading | `5001` |
| Rate confirmation | `5001` |
| Invoice | `5001` |
| Carrier settlement (`CarrierPay`) | `5001` |

The number is the point of reference: a carrier, a shipper or an AE quoting
`5001` names the load and every document on it without having to say which. The
suffix scheme existed so one load's documents sorted together; one number does
that better, because there is nothing left to sort.

**The `SRL-` prefix is retired.** It was kept so a carrier hauling for several
brokers could tell whose paperwork they held. The letterhead, the MC number and
the footer already do that on every page, and the prefix cost more in
transcription — read down a phone line, typed into another broker's TMS, written
on a dock receipt — than it bought in attribution.

**Only a supplemental document for a missed accessorial takes a letter**, and the
letter is assigned **by accessorial type**, so the type is legible from the
reference alone. **One constant in `lib/documentNumber.ts` is the only place a
letter is assigned** — a second assignment site is how two accessorial types come
to share a letter:

| Type | | Type | | Type | |
|---|---|---|---|---|---|
| `LUMPER` | A | `LAYOVER` | E | `REEFER_FUEL` | J |
| `DETENTION_PU` | B | `HAZMAT` | F | `INSIDE_DELIVERY` | K |
| `DETENTION_DEL` | C | `DEADHEAD` | G | `LIFTGATE` | L |
| `TONU` | D | `DRIVER_ASSIST` | H | `PALLET_EXCHANGE` | M |

**`I` is skipped deliberately** — it reads as a `1` in a hand-written or faxed
reference, on the kind of document a lumper receipt gets stapled to.

**A repeat supplemental of the same type takes a digit**: `5001A`, then `5001A2`,
then `5001A3`. The first carries no digit so the common case reads clean, which is
the one mechanic carried over from the retired scheme.

**"Settlement" means `CarrierPay`, per load, and takes the bare number.** The
`Settlement` batch is a different object — one carrier, one period, many loads —
so it structurally cannot carry a load's number and **keeps `STL-<n>`**. It is not
a load document and the rule does not reach it.

**`INV-####` retires to a read-only mirror.** New invoices carry the bare load
number only, and the wire-payment memo and the AR dunning emails key on that going
forward. Legacy invoices stay findable by their `INV-` number: retiring a sequence
is not the same as erasing the keys customers already have in their accounts
payable systems.

**`Load.srlBolNumber` survives and is not dropped.** For a new load it holds the
same value as the bare load number. It is still not `Load.bolNumber`, which is the
**shipper-supplied** reference their AP department searches on — those two are
different things and must stay different.

**Search resolves in three passes, in order:** exact match on the document number,
then exact match on a legacy `SRL-` number, then substring results after. Order is
the whole design. `SRL-121495` was self-delimiting; `5001` is not, so a plain
substring search for `5001` also matches `15001` and `50012`, and the load the AE
actually typed must come back first rather than ranked among its own superstrings.

**Legacy numbers are never rewritten.** Loads issued before this amendment keep
their `SRL-1214xx` stems and their `B`/`R`/`I`/`S`/`P` suffixes, and search accepts
both forms. A number already printed on a signed bill of lading is not a formatting
decision. The two namespaces cannot collide: the legacy one is prefixed and the new
one is not, so a new `5001B` and a legacy `SRL-121495B` are distinct strings.

**Filenames carry the number, never a type prefix** — `5001_BOL.pdf`,
`5001_Rate_Confirmation.pdf`, `5001_Invoice.pdf`, `5001A_Lumper.pdf`. Sorting a
download folder by name is the same use case the numbering scheme exists for, and
a `TYPE-` prefix breaks it there exactly as it would anywhere else.

**`SHP-YYYY-NNN` is internal only.** The load number replaces it on every customer
and carrier surface; the shipment sequence stays for internal joins and is not
quoted outward.

**Sequence start: 5001**, from `load_number_seq`.

**Status: the numbering and the filenames are BUILT; three consequences are not.**
`generateLoadNumber` emits the bare number from a sequence declared `START WITH
5001`. `lib/documentNumber.ts` carries the letter map, the supplemental allocator,
the core re-issue separator and the filename rule, and a permanence guard fails CI
on a number built outside that module, a `TYPE-` filename prefix, or a letter
assigned anywhere else.

**NOT yet built, named so nobody reads this section as describing them:** the
`INV-####` retirement to a read-only mirror, the three-pass search order, and
`SHP-YYYY-NNN` being confined to internal surfaces. Each is a change to a surface
outside the numbering module.

**One open question the rulings did not reach.** A core re-issue is a new row for
the same load against a `@unique` column, and a bare number has no suffix letter to
hang a revision on. `5001-2` is what `documentNumber.ts` issues, because appending
a bare digit would make revision 2 of load 5001 read as load 50012. The separator
is one constant if a different character is wanted.

`quickPayPilotDocClaims.test.ts` holds the first paragraph against what
`documentNumber.ts` actually emits, in both directions, so this line cannot go
stale either way.

#### The retired scheme, for reading numbers issued before 2026-09-23

Ratified 2026-08-16 and superseded above. A **suffix on a shared stem**: load
`SRL-121485`, BOL `SRL-121485B`, rate confirmation `SRL-121485R`, invoice
`SRL-121485I`, supplemental invoice `SRL-121485S`, settlement `SRL-121485P` — `P`
for pay, so it could not collide with `S`. Re-issues took a numeric revision
(`SRL-121485R2`). Numbers were never reused then either, for the same reason they
are not now: in a dispute the document has to say on its face which version the
carrier signed.

---

