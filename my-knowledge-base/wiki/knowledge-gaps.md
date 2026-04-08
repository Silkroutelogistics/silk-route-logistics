---
title: Knowledge Base Gaps & Research Priorities
created: 2026-04-07
last_updated: 2026-04-07
source_count: 8
status: reviewed
---

Analysis of what's missing from the wiki and what should be researched next, based on the first query audit of all existing wiki pages.

## Three Biggest Gaps

### 1. Missing Wiki Pages (13 placeholder links)
The index references 13 topics with no wiki page: [[bol-generation]], [[check-call-system]], [[invoicing-payments]], [[carrier-onboarding]], [[fmcsa-integration]], [[ofac-screening]], [[identity-verification]], [[lead-hunter]], [[email-sequences]], [[gmail-reply-tracking]], [[mass-email]], [[api-endpoints]], [[address-book]]. Each needs a dedicated page created from raw sources + codebase knowledge. [Source: index.md]

### 2. Financial Pipeline Undocumented
The money flow (invoicing → payment → settlement) is the least documented area. [[data-flows]] notes it's "60% automated" with missing bank ACH integration, but no dedicated page explains how it works. [Source: data-flows.md]

### 3. No Competitive or Market Intelligence in Wiki
28 of 29 raw sources haven't been ingested. Market research (carrier pain points, QuickPay benchmarks, competitive analysis) exists in raw/ but isn't synthesized into wiki pages. [Source: raw/ directory]

## Contradictions Found
1. Table count: 46 (Feb 2026 doc) vs 91 (Apr 2026 audit) [Source: tech-stack.md]
2. Page count: 22 (Feb 2026 doc) vs 85 (Apr 2026 audit) [Source: tech-stack.md]
3. Company address: Galesburg (old docs) vs Kalamazoo (corrected Apr 2026) [Source: company-info.md]
4. Carrier onboarding complexity: simple 3-step (old doc) vs 35-check Compass (actual) [Source: compass-engine.md]

## Critical Missing Connection
[[lead-hunter]] (demand) and [[srcpp-program]] (supply) don't communicate. When a shipper converts, their lane needs should feed carrier recruitment targeting. No automated carrier acquisition pipeline exists equivalent to the shipper email sequences. This is the biggest strategic gap in the platform. [Source: data-flows.md, srcpp-program.md, load-lifecycle.md]

## Research Priority Queue
1. Ingest COMPETITIVE_BENCHMARKS.md — feeds sales positioning
2. Ingest CARRIER_FINANCIAL_PAIN_POINTS.md — validates SRCPP tier pricing
3. Ingest SRL-AI-OPERATIONS-PLAYBOOK.md — operational strategy for scaling
4. Ingest SECURITY_PLAYBOOK.md — AI-specific security risks
5. Ingest QUICK_PAY_MARKET_RESEARCH.md — QuickPay competitive pricing
6. Create all 13 missing wiki pages from codebase knowledge

[Source: all wiki pages, raw/ directory audit]
