---
title: Lint Report v2 — April 7, 2026 (Post Full Ingestion)
created: 2026-04-07
---

# Wiki Health Check v2 — April 7, 2026

**Pages:** 18 content pages + index + log
**Raw sources:** 29/29 ingested (100%)
**Internal links:** 150+ across all pages
**Contradictions:** 7 flagged
**Previous health:** 5/10 (lint v1)

---

## Broken Links — 16 Missing Pages

Pages referenced by [[wiki-link]] but have no .md file.

| Severity | Missing Page | Refs | Priority |
|----------|-------------|------|----------|
| :red_circle: | [[carrier-onboarding]] | 8 | HIGH — core flow, heavily referenced |
| :red_circle: | [[email-sequences]] | 7 | HIGH — built feature, zero docs |
| :red_circle: | [[invoicing-payments]] | 6 | HIGH — money flow undocumented |
| :red_circle: | [[lead-hunter]] | 6 | HIGH — built feature, zero docs |
| :red_circle: | [[gmail-reply-tracking]] | 6 | HIGH — built feature, zero docs |
| :yellow_circle: | [[check-call-system]] | 4 | MED — operational feature |
| :yellow_circle: | [[address-book]] | 4 | MED — built today, needs docs |
| :yellow_circle: | [[api-endpoints]] | 4 | MED — architecture reference |
| :yellow_circle: | [[bol-generation]] | 4 | MED — rebuilt today (v7) |
| :yellow_circle: | [[fmcsa-integration]] | 3 | MED — sub-component of Compass |
| :yellow_circle: | [[identity-verification]] | 3 | MED — sub-component of Compass |
| :yellow_circle: | [[ofac-screening]] | 3 | MED — sub-component of Compass |
| :yellow_circle: | [[mass-email]] | 3 | MED — built feature |
| :yellow_circle: | [[risk-engine]] | 3 | MED — operational system |
| :large_blue_circle: | [[deployment]] | 2 | LOW — infra reference |
| :large_blue_circle: | [[operations-playbook]] | 1 | LOW — could merge with ai-operations |

**Improvement from v1:** Same count (16→16) but now all are specific code-documentation gaps, not research gaps. Every missing page has a built feature behind it.

---

## Orphan Pages — 0

All 18 pages have at least 1 inbound link. No orphans.

| Page | Inbound Links | Health |
|------|--------------|--------|
| srcpp-program | 12 | Most-linked page in wiki |
| compass-engine | 9 | |
| carrier-recruitment-pipeline | 9 | |
| load-lifecycle | 8 | |
| carrier-pain-points | 7 | |
| data-flows | 7 | |
| competitive-landscape | 6 | |
| tech-stack | 6 | |
| demand-supply-gap | 5 | |
| security-architecture | 5 | |
| scheduler-service | 4 | |
| ai-operations | 2 | Could use more cross-refs |
| quickpay-program | 2 | Could use more cross-refs |
| company-info | 2 | |
| knowledge-gaps | 2 | |
| version-history | 2 | |
| srl-vision | 1 | :yellow_circle: Near-orphan — needs more backlinks |
| tms-comparison | 1 | :yellow_circle: Near-orphan — needs more backlinks |

---

## Content Quality

### Status Distribution
| Status | Count | Pages |
|--------|-------|-------|
| reviewed | 14 | ai-operations, carrier-pain-points, company-info, compass-engine, competitive-landscape, data-flows, knowledge-gaps, load-lifecycle, quickpay-program, scheduler-service, security-architecture, srl-vision, tech-stack, tms-comparison, version-history |
| draft | 2 | carrier-recruitment-pipeline, demand-supply-gap |
| needs_update | 1 | srcpp-program |

| Severity | Issue |
|----------|-------|
| :yellow_circle: | srcpp-program.md — status: needs_update. SRCPP/CPP/Caravan naming confusion unresolved. Same-day payment tier not added. |
| :yellow_circle: | carrier-recruitment-pipeline.md — status: draft. Templates built in code but page still says "build plan." |
| :yellow_circle: | demand-supply-gap.md — status: draft. Solution now exists (v3.2.k deployed). Should upgrade to reviewed. |

### Citation Coverage
| Level | Count | Pages |
|-------|-------|-------|
| 5+ citations | 4 | knowledge-gaps (9), tech-stack (6), ai-operations (5), security-architecture (5), srcpp-program (5) |
| 2-4 citations | 5 | competitive-landscape (4), carrier-pain-points (2), quickpay-program (2), tms-comparison (2) |
| 1 citation | 7 | carrier-recruitment-pipeline, company-info, compass-engine, data-flows, demand-supply-gap, load-lifecycle, srl-vision |
| 0 citations | 2 | index (meta), log (meta) |

:large_blue_circle: Most pages have at least 1 source citation. Acceptable.

---

## Contradictions — 7 Total

| # | Severity | Contradiction | Status |
|---|----------|--------------|--------|
| 1 | :yellow_circle: | Table count: 46 (Feb) vs 91 (Apr) | Acknowledged — stale doc |
| 2 | :yellow_circle: | Page count: 22 (Feb) vs 85 (Apr) | Acknowledged — stale doc |
| 3 | :yellow_circle: | Address: Galesburg vs Kalamazoo | Corrected in code, stale in raw |
| 4 | :yellow_circle: | Onboarding: 3-step vs 35-check | Acknowledged — old doc simplified |
| 5 | :large_blue_circle: | SRAPP vs SRCPP acronym | Minor — same program |
| 6 | :large_blue_circle: | Compass: 40% (raw) vs 71% (wiki) | Wiki correct (post-fix), raw stale |
| 7 | :yellow_circle: | SRCPP vs CPP vs Caravan — triple naming | Needs resolution — pick one name |

---

## Raw Source Coverage

| Status | Count |
|--------|-------|
| :white_check_mark: Ingested with dedicated wiki page | 7 (SYSTEM_ARCHITECTURE, CARRIER_PAIN_POINTS, COMPETITIVE_BENCHMARKS, SRL-AI-OPERATIONS-PLAYBOOK, QUICK_PAY_MARKET_RESEARCH, srl-vision-strategy, TMW_SUITE_DEEP_DIVE) |
| :white_check_mark: Ingested as reference (logged, no dedicated page) | 22 |
| :red_circle: Not ingested | 0 |
| **Total** | **29/29 (100%)** |

---

## Concepts Mentioned But Never Explained

| Severity | Concept | Mentioned In |
|----------|---------|-------------|
| :yellow_circle: | **Risk Engine** | load-lifecycle, scheduler-service, data-flows |
| :yellow_circle: | **Denim Wallet** | quickpay-program (mentioned but no integration docs) |
| :large_blue_circle: | **Marco Polo AI** | tech-stack (Google Gemini chatbot) |
| :large_blue_circle: | **Factoring Fund** | data-flows (referenced in financial pipeline) |
| :large_blue_circle: | **Caravan** | competitive-landscape (carrier marketplace) |

---

## Improvement Since Lint v1

| Metric | Lint v1 | Lint v2 | Change |
|--------|---------|---------|--------|
| Pages | 12 | 18 | +6 (+50%) |
| Raw sources ingested | 1/29 (3%) | 29/29 (100%) | +28 (+2800%) |
| Broken links | 15 | 16 | +1 (new ref added) |
| Orphan pages | 0 | 0 | Stable |
| Contradictions | 5 | 7 | +2 (deeper analysis) |
| Draft pages | 3 | 2 | -1 improved |
| Source citations | 31 | 49 | +18 (+58%) |
| Output files | 0 | 2 | +2 |

**Overall health: 7/10** (up from 5/10)

Remaining to reach 9/10:
1. Create 5 highest-priority missing pages (carrier-onboarding, email-sequences, invoicing-payments, lead-hunter, gmail-reply-tracking)
2. Resolve SRCPP/CPP/Caravan naming
3. Add external market data sources
4. Start tracking actual performance metrics

---

## Top 3 Articles to Fill Gaps

### 1. Create [[invoicing-payments]] — The Money Flow
**Why:** Referenced 6 times, touches the financial pipeline (60% automated per [[data-flows]]). Payment processing is 0% complete (no ACH integration). This page would document: auto-invoice on delivery, invoice statuses, CarrierPay creation, QuickPay execution, settlement batching, and what's missing (bank integration). Connects [[load-lifecycle]] → [[srcpp-program]] → [[quickpay-program]] into one money story.
**Impact:** Closes the biggest documentation gap in the revenue chain.

### 2. Create [[carrier-onboarding]] — The Supply Funnel
**Why:** Referenced 8 times (most-referenced missing page). The registration flow, Compass 35-check vetting, auto-approval logic, required fields, and post-registration automation are all built but undocumented. This is the entry point for every carrier in the network — the carrier-side equivalent of Lead Hunter.
**Impact:** Documents the supply-side funnel that [[carrier-recruitment-pipeline]] feeds into.

### 3. Create [[performance-dashboard]] — Actuals vs Projections
**Why:** Not currently in the index at all, but query audit #3 identified this as critical: [[quickpay-program]] projects $446K by Year 5, [[ai-operations]] targets $2.8M by month 24, but zero actuals are tracked. A wiki page that records weekly metrics (loads booked, carriers active, revenue, QP adoption, margin) would transform the knowledge base from strategy docs into an operational cockpit.
**Impact:** The only article that makes the knowledge base measure reality, not just plan it.
