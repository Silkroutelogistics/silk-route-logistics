---
title: Competitive Landscape & Benchmarks
created: 2026-04-07
last_updated: 2026-04-07
source_count: 2
status: reviewed
---

SRL competes against mega-brokers (CHR, Echo, XPO), digital platforms (Convoy model, HwyHaul), and carrier disintermediation. The moat is NOT technology — it's carrier relationships ([[srcpp-program]]), speed-to-pay (QuickPay), and personal service. Technology is the enabler, not the differentiator.

## Performance Benchmarks

| Metric | Industry Leader | SRL Gate 1 (Now) | SRL Gate 2 (Target) |
|--------|----------------|-------------------|---------------------|
| Quote response | <30 sec (CHR) | <10 min (manual) | <60 sec (AI-assisted) |
| Carrier match | <2 min (Parade) | <30 min (manual) | <5 min (AI-ranked) |
| Check-call parse | Instant (ELD) | <15 min (manual) | <30 sec (AI-parsed) |
| Document OCR | <5 sec (Turvo) | <24 hrs (manual) | <30 sec (AI/Claude Vision) |
| On-time delivery | 95%+ (top brokers) | 95%+ target | 97%+ with AI exceptions |

SRL is at **Gate 1** for most metrics. Gate 2 requires AI automation that's partially built (smart matching, check-call SMS, email sequences). [Source: COMPETITIVE_BENCHMARKS.md]

## Build vs Buy Decision Matrix

| Capability | Decision | Trigger | Product | Cost |
|------------|----------|---------|---------|------|
| Carrier matching | BUILD (done) | — | — | — |
| Market rate data | BUY | Always | DAT/Truckstop | ~$300/mo |
| ELD tracking | BUY | Already using | Samsara/Motive | Per-device |
| Document OCR | BUILD (done) | — | Claude Vision | — |
| Voice agent | BUY | 30+ loads/day | Bland.ai | $460/mo |
| Full TMS | BUY | Only if pivot | McLeod, TMW | $5K+/mo |

**Rule:** Do NOT build what you can buy at equivalent quality for <5% of monthly gross revenue. [Source: COMPETITIVE_BENCHMARKS.md]

## Three Threat Scenarios

### 1. Autonomous Freight Platforms
- **Threat:** Eliminate brokerage margin via platform matching
- **SRL Moat:** [[srcpp-program]] loyalty, internal factoring, personal service
- **Action:** Invest in SRCPP execution > AI tools. Moat = relationship, not tech.

### 2. Mega-Broker AI Adoption (CHR, Echo, XPO)
- **Threat:** Instant quoting, massive carrier pools, AI pricing
- **SRL Moat:** Niche focus, faster carrier payment, dedicated AE per shipper
- **Action:** Compete on speed-to-pay and personal service, not tech parity

### 3. Carrier Disintermediation
- **Threat:** Digital freight matching reduces need for brokers
- **SRL Moat:** Credit/payment guarantee, claims handling, multi-shipper lane access
- **Action:** Strengthen factoring and payment speed as core value prop

## SRL's Competitive Positioning (Synthesized)

**For shippers:** "Enterprise visibility without the enterprise price tag. AI-powered rate predictions, 35-point carrier vetting, real-time tracking, dedicated account management."

**For carriers:** "Get paid in 3 days, save $3,600+/year vs factoring. No contracts, no hidden fees. Free compliance dashboard. We never double-broker." (See [[carrier-pain-points]] for full messaging)

**Against mega-brokers:** "You're not a number here. One person manages your account. Your loads get GPS tracking. Your carriers are vetted with 35 checks, not just a pulse."

**Against factoring companies:** "Same cash flow solution, half the cost, zero contracts. Plus: freight, compliance, and a loyalty program that rewards your best performance." (See [[srcpp-program]])

> CONTRADICTION: Document references "SRAPP program" but the wiki and codebase use "SRCPP" (Silk Route Carrier Performance Program). Likely an older acronym. [Source: COMPETITIVE_BENCHMARKS.md vs srcpp-program.md]

See also: [[srcpp-program]], [[carrier-pain-points]], [[carrier-recruitment-pipeline]], [[demand-supply-gap]], [[tech-stack]]

[Source: COMPETITIVE_BENCHMARKS.md, CARRIER_FINANCIAL_PAIN_POINTS.md]
