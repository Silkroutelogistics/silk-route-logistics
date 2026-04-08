# Knowledge Base Schema v2

## Identity
This is a personal knowledge base about Silk Route Logistics Inc. (SRL) — a technology-driven freight brokerage operating out of Kalamazoo, Michigan. Covers operations, compliance, carrier/shipper management, sales pipeline, system architecture, and industry intelligence.
Maintained by an LLM agent. The human (Wasih Haider, Founder & CEO) curates sources and asks questions. The LLM does everything else.

## Architecture
- raw/ contains immutable source documents. NEVER modify files in raw/.
- wiki/ contains the compiled wiki. The LLM owns this directory entirely.
- wiki/skills/ contains discoverable workflow skills (ingest, lint, query, update).
- outputs/ contains generated reports, analyses, and query answers.

## Page Structure: Compiled Truth + Timeline (GBrain pattern)

Every wiki page uses the "above the line / below the line" architecture:

```markdown
---
title: [Topic Name]
type: [concept | entity | strategy | system | reference]
created: [Date]
updated: [Date]
source_count: [Number]
status: [draft | reviewed | needs_update]
confidence: [HIGH | MEDIUM | LOW]
tags: [tag1, tag2]
---

# Topic Name

> One-paragraph summary

## State (Compiled Truth — always current, rewritten on new info)

Current assessment. When new information arrives, this section is REWRITTEN
to reflect the latest truth. Never append here — overwrite.

## Details

Structured information, tables, data.

## Open Threads

Unresolved questions, things to investigate.

## See Also

- [[related-page-1]]
- [[related-page-2]]

---

## Timeline (append-only evidence base — never rewrite)

### [YYYY-MM-DD] source | Description
What was learned, from what source. Each entry is immutable.

### [YYYY-MM-DD] source | Description
Next piece of evidence.
```

**Rules:**
- Above the `---` separator: compiled truth. Rewrite freely when better info arrives.
- Below the `---` separator: timeline. Append-only. Never edit or delete entries.
- The separator `---` between compiled truth and timeline is MANDATORY.
- When new info contradicts compiled truth, update the State section AND append a timeline entry explaining the change.

## Confidence Scoring (Graphify pattern)

Every factual claim should include a confidence tag:

- `[EXTRACTED]` — Verified from authoritative source (FMCSA API, signed contract, official doc)
- `[INFERRED: 0.8]` — Reasonable conclusion with confidence score 0.0-1.0
- `[AMBIGUOUS]` — Conflicting sources, needs resolution
- `[STALE: date]` — Was true as of date, may have changed

Example: "Carrier has Satisfactory safety rating [EXTRACTED: FMCSA lookup 2026-04-07]"

## Wiki Conventions
- Every topic gets its own .md file in wiki/
- Use [[topic-name]] for internal links between wiki pages
- Every factual claim cites its source: [Source: filename.md]
- When new info contradicts existing content, update compiled truth AND append to timeline

## Index and Log
- wiki/index.md lists every page with a one-line description, by category
- wiki/log.md is append-only chronological record
- Log entry format: ## [YYYY-MM-DD] action | Description
  (Actions: ingest, query, lint, update, skill)

## Skills (Hermes pattern)

Skills live in wiki/skills/ as markdown files. Each skill has:
```yaml
---
name: [skill-name]
description: [what it does]
trigger: [when to use it]
version: 1
---
```

Available skills:
- `skill-ingest.md` — Process a raw source into wiki pages
- `skill-lint.md` — Run health check on wiki
- `skill-query.md` — Answer questions using wiki content
- `skill-update.md` — Refresh stale pages with new data

## Ingest Workflow
When processing a new source:
1. Read the full source document
2. Discuss key takeaways with user
3. Create or update a summary page in wiki/ (using compiled truth + timeline format)
4. Update wiki/index.md
5. Update ALL relevant entity and concept pages (rewrite compiled truth, append timeline)
6. Add backlinks from existing pages to new content
7. Flag any contradictions — update compiled truth, log change in timeline
8. Append entry to wiki/log.md
9. A single source should touch 10-15 wiki pages

## Query Workflow
When answering a question:
1. Read wiki/index.md first to find relevant pages
2. Read all relevant wiki pages (compiled truth sections first)
3. Synthesize answer with [Source: page-name] citations and confidence tags
4. If answer reveals new insights, offer to file back into wiki (compiled truth)
5. Save valuable answers to outputs/

## Lint Workflow
Check for:
- Contradictions between compiled truth sections
- Stale claims (last updated >30 days, confidence may have decayed)
- Orphan pages with no inbound links
- Concepts mentioned but never explained
- Missing cross-references
- Claims without source attribution or confidence tag
- Timeline entries that should have updated compiled truth but didn't
Output: wiki/lint-report-[date].md with severity levels

## Focus Areas
1. **Freight Operations** — Load lifecycle, BOL/RC generation, carrier matching, check-calls, tracking, invoicing, payment
2. **Compliance & Vetting** — Compass Engine 35-check system, FMCSA, OFAC, carrier onboarding, insurance, safety ratings
3. **Sales & CRM** — Lead Hunter pipeline, email sequences, Gmail reply tracking, engagement scoring, prospect conversion
4. **System Architecture** — Next.js frontend, Express/Prisma backend, PostgreSQL, Cloudflare Pages, Render, API integrations
5. **Industry Intelligence** — Freight market trends, carrier recruitment strategies, shipper acquisition, competitive positioning, regulatory changes
