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

