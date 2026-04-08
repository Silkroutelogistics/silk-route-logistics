---
title: SRCPP — Silk Route Carrier Performance Program
created: 2026-04-07
last_updated: 2026-04-07
source_count: 1
status: draft
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

See also: [[carrier-onboarding]], [[load-lifecycle]], [[invoicing-payments]]

[Source: SYSTEM_ARCHITECTURE.md]
