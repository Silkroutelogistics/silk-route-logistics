---
title: Lint Report — April 7, 2026
created: 2026-04-07
---

# Wiki Health Check — April 7, 2026

**Pages:** 12 content pages + index + log
**Raw sources:** 29 files (1 ingested, 28 pending)
**Internal links:** 108 total across all pages
**Contradictions flagged:** 5

---

## Broken Links (15 missing pages)

These are referenced by `[[wiki-link]]` across the wiki but have no corresponding .md file.

| Severity | Missing Page | Times Referenced | Referenced By |
|----------|-------------|-----------------|---------------|
| :red_circle: | [[lead-hunter]] | 9 | demand-supply-gap, data-flows, knowledge-gaps, carrier-recruitment-pipeline, index |
| :red_circle: | [[carrier-onboarding]] | 9 | compass-engine, data-flows, carrier-recruitment-pipeline, srcpp-program, security-architecture, index |
| :red_circle: | [[invoicing-payments]] | 7 | load-lifecycle, data-flows, srcpp-program, index |
| :red_circle: | [[email-sequences]] | 7 | carrier-recruitment-pipeline, demand-supply-gap, data-flows, index |
| :red_circle: | [[gmail-reply-tracking]] | 6 | carrier-recruitment-pipeline, demand-supply-gap, data-flows, scheduler-service, index |
| :red_circle: | [[check-call-system]] | 4 | load-lifecycle, scheduler-service, index |
| :yellow_circle: | [[compass-engine]] already exists | — | Already has page, no issue |
| :yellow_circle: | [[bol-generation]] | 3 | load-lifecycle, index |
| :yellow_circle: | [[api-endpoints]] | 3 | tech-stack, index |
| :yellow_circle: | [[address-book]] | 3 | load-lifecycle, index |
| :yellow_circle: | [[identity-verification]] | 2 | index |
| :yellow_circle: | [[fmcsa-integration]] | 2 | index |
| :yellow_circle: | [[ofac-screening]] | 2 | index |
| :yellow_circle: | [[mass-email]] | 2 | demand-supply-gap, index |
| :yellow_circle: | [[risk-engine]] | 2 | load-lifecycle, scheduler-service |
| :large_blue_circle: | [[deployment]] | 1 | tech-stack |

---

## Orphan Pages (0)

No pages without inbound links. All 12 content pages are referenced by at least one other page.

---

## Stale Content

| Severity | Page | Issue |
|----------|------|-------|
| :yellow_circle: | srcpp-program.md | Status: `draft` — needs review. SRCPP tier thresholds and fee rates not validated against market data. CARRIER_FINANCIAL_PAIN_POINTS.md and QUICK_PAY_MARKET_RESEARCH.md in raw/ but not ingested. |
| :yellow_circle: | carrier-recruitment-pipeline.md | Status: `draft` — build plan defined but not executed. Dependencies unresolved (email acquisition, carrier pain point templates). |
| :yellow_circle: | demand-supply-gap.md | Status: `draft` — solution now documented in carrier-recruitment-pipeline, should be upgraded to `reviewed`. |
| :large_blue_circle: | version-history.md | Stops at v3.2.j. Subsequent commits (knowledge base, CLAUDE.md) not tracked. |

---

## Contradictions

| Severity | Contradiction | Location |
|----------|--------------|----------|
| :yellow_circle: | Table count: 46 (Feb 2026) vs 91 (Apr 2026) | tech-stack.md |
| :yellow_circle: | Page count: 22 (Feb 2026) vs 85 (Apr 2026) | tech-stack.md |
| :yellow_circle: | Company address: Galesburg (SYSTEM_ARCHITECTURE.md) vs Kalamazoo (company-info.md) | company-info.md, raw/SYSTEM_ARCHITECTURE.md |
| :yellow_circle: | Onboarding: simple 3-step (old doc) vs 35-check Compass (actual) | compass-engine.md |
| :large_blue_circle: | demand-supply-gap.md says "No capability" but import-from-dat endpoint already exists | demand-supply-gap.md (corrected with solution link) |

---

## Source Attribution Gaps

| Severity | Page | Issue |
|----------|------|-------|
| :yellow_circle: | index.md | Zero `[Source:]` citations (meta page — acceptable) |
| :yellow_circle: | log.md | Zero `[Source:]` citations (log format — acceptable) |
| :large_blue_circle: | data-flows.md | Only 1 source (SYSTEM_ARCHITECTURE.md). Should cross-reference project-audit-apr2026.md for automation percentages. |
| :large_blue_circle: | srcpp-program.md | Only 1 source. Needs QUICK_PAY_MARKET_RESEARCH.md and CARRIER_FINANCIAL_PAIN_POINTS.md to validate tier pricing. |

---

## Raw Source Ingestion Status

| Status | Count | Files |
|--------|-------|-------|
| :white_check_mark: Ingested | 1 | SYSTEM_ARCHITECTURE.md |
| :red_circle: Not ingested | 28 | Everything else in raw/ |

**Highest priority un-ingested sources:**
1. CARRIER_FINANCIAL_PAIN_POINTS.md — blocks carrier recruitment templates
2. COMPETITIVE_BENCHMARKS.md — blocks sales positioning
3. SRL-AI-OPERATIONS-PLAYBOOK.md — operational scaling strategy
4. QUICK_PAY_MARKET_RESEARCH.md — validates SRCPP pricing
5. SECURITY_PLAYBOOK.md — AI-specific security risks

---

## Concepts Mentioned But Never Explained

| Concept | Mentioned In | Needs |
|---------|-------------|-------|
| **Risk Engine** | load-lifecycle, scheduler-service | Dedicated [[risk-engine]] page — scoring formula, RED/AMBER/GREEN thresholds, triggers |
| **QuickPay** | srcpp-program, carrier-recruitment-pipeline | Explained briefly in SRCPP but no dedicated page on how QuickPay works operationally |
| **Marco Polo AI** | tech-stack (Google Gemini chatbot) | No documentation on what the AI chatbot does, what queries it handles |
| **Factoring Fund** | data-flows | Referenced as "Fund Entry" in financial pipeline but never explained |
| **Caravan** | SYSTEM_ARCHITECTURE.md | Carrier marketplace feature — no wiki page |

---

## Missing Cross-References

| Severity | From | Should Link To |
|----------|------|---------------|
| :large_blue_circle: | compass-engine.md | [[fmcsa-integration]], [[ofac-screening]], [[identity-verification]] — these are sub-components of the 35 checks |
| :large_blue_circle: | scheduler-service.md | [[risk-engine]] — risk flagging runs every 30 min as a cron job |
| :large_blue_circle: | carrier-recruitment-pipeline.md | [[check-call-system]] — OpenPhone SMS can be used for carrier outreach when no email |

---

## Summary Scorecard

| Metric | Score | Status |
|--------|-------|--------|
| Page coverage | 12/27 (44%) | :red_circle: 15 placeholder links with no pages |
| Source ingestion | 1/29 (3%) | :red_circle: 28 raw sources un-processed |
| Orphan pages | 0 | :white_check_mark: All pages linked |
| Contradictions | 5 (3 acknowledged, 2 resolved) | :yellow_circle: Acceptable — old docs not updated |
| Source citations | 31 total | :yellow_circle: Most pages have at least 1 |
| Cross-references | 108 links | :white_check_mark: Dense internal linking |
| Draft pages | 3 of 12 (25%) | :yellow_circle: Need review |

**Overall health: 5/10** — Strong structure and cross-linking, but majority of raw sources un-ingested and 15 referenced pages don't exist yet.

---

## Top 3 Articles to Fill the Biggest Knowledge Gaps

### 1. Ingest `CARRIER_FINANCIAL_PAIN_POINTS.md` → Create [[carrier-pain-points]] wiki page
**Why:** This is the #1 blocker. The carrier recruitment pipeline templates need to speak to real carrier pain points. Every other carrier-facing feature (SRCPP pricing, QuickPay positioning, recruitment emails) depends on understanding what carriers actually care about. This single source would inform [[srcpp-program]], [[carrier-recruitment-pipeline]], [[demand-supply-gap]], and the carrier email templates.
**Impact:** Unblocks carrier recruitment build. Validates SRCPP tier pricing. Informs 4+ wiki pages.

### 2. Ingest `COMPETITIVE_BENCHMARKS.md` → Create [[competitive-landscape]] wiki page
**Why:** SRL's Lead Hunter emails, carrier recruitment pitch, and shipper conversations all need competitive positioning. "Why SRL instead of DAT/Convoy/Echo?" is unanswered in the wiki. This source has feature-by-feature comparisons that would inform [[lead-hunter]] templates, [[carrier-recruitment-pipeline]] messaging, and [[company-info]] positioning.
**Impact:** Shapes all outbound messaging. Differentiates SRL in market.

### 3. Ingest `SRL-AI-OPERATIONS-PLAYBOOK.md` → Create [[operations-playbook]] wiki page
**Why:** The wiki documents WHAT the system does but not HOW to operate it as a business. This playbook describes how 2 people scale to 200+ loads/month using AI automation. It connects [[scheduler-service]] cron jobs, [[compass-engine]] vetting, [[load-lifecycle]] automation, and [[data-flows]] into an operational runbook. Without it, the wiki is a technical manual, not a business guide.
**Impact:** Transforms wiki from architecture docs into operational knowledge.
