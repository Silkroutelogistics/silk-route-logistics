---
title: SRCPP — Silk Route Carrier Performance Program
created: 2026-04-07
last_updated: 2026-04-07
source_count: 2
status: needs_update
---

The SRCPP (Silk Route Carrier Performance Program) is SRL's carrier loyalty and performance tiering system. Carriers earn tiers based on load completion, on-time performance, and claims history. Higher tiers unlock better payment terms and reduced fees.

## Tier Ladder
| Tier | Requirements | Quick Pay Fee | Payment Terms |
|------|-------------|---------------|---------------|
| GUEST | New carrier, < first load | 3% | Net 21 |
| BRONZE | First load completed | 3% | Net 21 |
| SILVER | Performance threshold met | 2.5% | Net 14 |
| GOLD | Sustained high performance | 2% | Net 7 |
| PLATINUM | Top-tier performance | 1.5% | Net 3 |

## Scoring Factors
- On-time pickup/delivery percentage
- Claim ratio (claims / total loads)
- Fall-off rate (cancelled after booking)
- Total loads completed
- Communication responsiveness (check-call compliance)

## Recalculation Schedule
- **Weekly:** Full SRCPP tier recalculation (Sunday 6 AM ET) [Source: SYSTEM_ARCHITECTURE.md]
- **Daily:** Tier updates + log cleanup (6 AM) [Source: SYSTEM_ARCHITECTURE.md]
- **On delivery:** CPP recalculation triggered per load

## Data Flow
```
Carrier Approved → Initial Scorecard (GUEST/BRONZE)
→ Complete Loads → Weekly Recalculation
→ Tier Update → Payment Tier Assigned → Fee % Applied
→ CarrierPay created with tier-appropriate fee on each DELIVERED load
```

## Database
- `carrier_scorecards` — monthly performance snapshots
- `carrier_bonuses` — SRCPP-based incentives
- `CarrierProfile.cppTier` — current tier (NONE/BRONZE/SILVER/GOLD/PLATINUM)
- `CarrierProfile.quickPayFeeRate` — current fee rate

## Market Validation (from [[carrier-pain-points]])

SRCPP pricing is **validated and competitive** against the market:
- SRL QP at 1.5-3% vs factoring effective rate 4-5.5% = **$3,600-$4,500/year savings** per carrier [Source: CARRIER_FINANCIAL_PAIN_POINTS.md]
- 70%+ of small carriers use factoring. SRL QP is a direct replacement at lower cost.
- 30-day payment delay costs carriers $13,000-$48,000/year in real costs. QP pays for itself 2-8x.

> CONTRADICTION: PLATINUM tier offers 1.5% with next-day payment. But carrier research shows "same-day payment" is the #1 factoring benefit carriers cite. Consider adding a Same-Day tier at 3.5-4% to compete with factoring's instant payment. [Source: CARRIER_FINANCIAL_PAIN_POINTS.md]

## Gaps to Address
- No fuel card/discount program (factoring companies bundle 5-15 cents/gallon — major retention tool)
- No fuel advance at pickup (50-80% advance so carriers can fuel for delivery)
- No emergency advance for catastrophic repairs
- No same-day payment tier

See also: [[carrier-onboarding]], [[load-lifecycle]], [[invoicing-payments]], [[carrier-pain-points]], [[carrier-recruitment-pipeline]]

[Source: SYSTEM_ARCHITECTURE.md, CARRIER_FINANCIAL_PAIN_POINTS.md]
