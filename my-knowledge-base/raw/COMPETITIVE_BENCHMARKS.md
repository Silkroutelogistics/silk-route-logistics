# Competitive Benchmarks — Silk Route Logistics

Performance targets, build-vs-buy triggers, and threat scenarios.

---

## Performance Targets

| Metric | Industry Leader | SRL Target (Gate 1) | SRL Target (Gate 2) |
|--------|----------------|---------------------|---------------------|
| Quote response time | <30 sec (CHR) | <10 min (manual) | <60 sec (AI-assisted) |
| Carrier match time | <2 min (Parade) | <30 min (manual) | <5 min (AI-ranked) |
| Check-call response parse | Instant (ELD) | <15 min (manual) | <30 sec (AI-parsed) |
| Document OCR turnaround | <5 sec (Turvo) | <24 hrs (manual) | <30 sec (AI) |
| On-time delivery rate | 95%+ (top brokers) | 95%+ | 97%+ with AI exceptions |

---

## Build vs. Buy Trigger Points

| Capability | Build In-House | Buy When | Product to Evaluate | Monthly Cost |
|------------|---------------|----------|---------------------|--------------|
| Carrier matching | Simple scoring system (built) | 500+ loads/month | Parade | $500–2K/month |
| Market rate data | DAT API (integrated) | Always use external | DAT/Truckstop | ~$300/month |
| ELD tracking | Samsara/Motive webhooks (built) | Already using | Samsara/Motive | Per-device |
| Document OCR | Claude Vision (built) | 2000+ docs/month | Veryfi, Nanonets | $200–500/month |
| Voice agent | — | 30+ loads/day | Bland.ai | $460/month |
| Full TMS | — | If SRL pivots to TMS model | McLeod, TMW | $5K+/month |

**Rule:** Do NOT build what you can buy at equivalent quality for <5% of monthly gross revenue.

---

## Threat Scenarios

### 1. Autonomous Freight Platforms (HwyHaul Miles, Convoy model)
**Threat:** Eliminate brokerage margin entirely via platform matching.
**SRL Moat:** Carrier relationships (SRAPP program), internal factoring, personalized service.
**Action:** Invest in SRAPP execution > AI tools. Moat is the relationship, not the tech.

### 2. Mega-Broker AI Adoption (CHR, Echo, XPO)
**Threat:** Instant quoting, massive carrier pools, AI-driven pricing.
**SRL Moat:** Niche focus, faster carrier payment (Quick Pay), dedicated AE per shipper.
**Action:** Compete on speed-to-pay and personal service, not on tech parity.

### 3. Carrier Disintermediation (carriers going direct)
**Threat:** Digital freight matching reduces need for brokers.
**SRL Moat:** Credit/payment guarantee, claims handling, multi-shipper lane access.
**Action:** Strengthen factoring and payment speed as core value prop.
