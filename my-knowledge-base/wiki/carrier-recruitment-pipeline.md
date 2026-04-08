---
title: Carrier Recruitment Pipeline — Build Plan
created: 2026-04-07
last_updated: 2026-04-07
source_count: 6
status: draft
---

The carrier recruitment pipeline closes the [[demand-supply-gap]] by using DAT responses + FMCSA enrichment + existing email sequence engine to proactively acquire carriers. 75% of the infrastructure already exists.

## Four-Stage Funnel

### Stage 1: DISCOVER (DAT) — BUILT
- Post loads to DAT → carriers respond with DOT#/MC#/contact
- `POST /api/dat/post-load`, `GET /api/dat/responses/:loadId`
- **Gap:** No auto-import of responders who don't register within 24h

### Stage 2: ENRICH (FMCSA) — BUILT
- DOT# → legal name, phone, address, fleet size, safety, insurance
- `verifyCarrierWithFMCSA()` with 1-hour cache
- CarrierOk API for 300+ fields including potential email (needs API key)
- **Gap:** FMCSA has no email — blocks outreach without alternative source

### Stage 3: OUTREACH (Email/SMS Sequences) — ENGINE BUILT, TEMPLATES MISSING
- Email sequence engine is entity-agnostic (works for carriers same as shippers)
- Gmail reply tracking detects replies from any sender
- **Gap:** No carrier-specific templates, no DAT→outreach trigger wired

### Stage 4: CONVERT (Compass + SRCPP) — FULLY BUILT
- Register → 35 checks → auto-approve A-grade → SRCPP tier → load matching
- Zero gaps — works end-to-end

## Email Acquisition Strategy
| Source | Has Email? | Status |
|--------|-----------|--------|
| DAT responses | Maybe (parse from response data) | Check DAT API response format |
| CarrierOk API | Likely (300+ fields) | Needs CARRIER_OK_API_KEY |
| Carrier registration form | Yes (required field) | Only after they register |
| SMS via OpenPhone | N/A (phone-based) | Already integrated for check-calls |

## Carrier Email Templates (4-step sequence)
Informed by [[carrier-pain-points]] research. Lead with carrier survival issues, not broker features:
- **Day 0:** "Get paid in 3 days, not 30" — introduce SRL, highlight $3,600+/year savings vs factoring, no contracts, no hidden fees
- **Day 3:** "No more factoring traps" — QuickPay at 1.5-3% vs 4-5.5% effective factoring rate, no reserve holdback, no termination fees, SRL Payment Guarantee
- **Day 7:** "Your compliance, handled" — free FMCSA monitoring, CSA alerts, insurance expiry tracking, Compass safety dashboard. Plus: we never double-broker
- **Day 14:** "Last note — your lanes, your terms" — consistent freight on preferred lanes, link to register, mention SRCPP tier ladder (better performance = lower fees + faster pay)

## Recruitment Pipeline Stages
`PROSPECT → CONTACTED → INTERESTED → REGISTERED → APPROVED`
- Maps to CarrierProfile.onboardingStatus or new recruitmentStatus field
- Mirrors [[lead-hunter]] stages: LEAD → CONTACTED → QUALIFIED → PROPOSAL → WON

## Build Pieces (in order)
1. Carrier email templates (informed by CARRIER_FINANCIAL_PAIN_POINTS.md)
2. Auto-prospect from DAT responses + outreach trigger
3. Recruitment pipeline stages on CarrierProfile
4. Lane-demand matching (loads with no matches → target carrier recruitment)

## Dependencies
- ~~Ingest CARRIER_FINANCIAL_PAIN_POINTS.md before writing templates~~ DONE — see [[carrier-pain-points]]
- Determine email acquisition path (DAT vs CarrierOk vs SMS)
- Confirm DAT API response data format (does it include carrier email?)

See also: [[demand-supply-gap]], [[srcpp-program]], [[compass-engine]], [[email-sequences]], [[lead-hunter]], [[data-flows]]

[Source: DAT/FMCSA audit, demand-supply-gap.md, data-flows.md, tech-stack.md, srcpp-program.md, load-lifecycle.md]
