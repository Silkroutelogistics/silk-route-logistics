# Knowledge Base Schema

## Identity
This is a personal knowledge base about Silk Route Logistics Inc. (SRL) — a technology-driven freight brokerage operating out of Kalamazoo, Michigan. Covers operations, compliance, carrier/shipper management, sales pipeline, system architecture, and industry intelligence.
Maintained by an LLM agent. The human (Wasih Haider, Founder & CEO) curates sources and asks questions. The LLM does everything else.

## Architecture
- raw/ contains immutable source documents. NEVER modify files in raw/.
- wiki/ contains the compiled wiki. The LLM owns this directory entirely.
- outputs/ contains generated reports, analyses, and query answers.

## Wiki Conventions
- Every topic gets its own .md file in wiki/
- Every wiki file starts with YAML frontmatter:
  ---
  title: [Topic Name]
  created: [Date]
  last_updated: [Date]
  source_count: [Number of raw sources that informed this page]
  status: [draft | reviewed | needs_update]
  ---
- After frontmatter, a one-paragraph summary
- Use [[topic-name]] for internal links between wiki pages
- Every factual claim cites its source: [Source: filename.md]
- When new info contradicts existing content, flag explicitly:
  > CONTRADICTION: [old claim] vs [new claim] from [source]

## Index and Log
- wiki/index.md lists every page with a one-line description, by category
- wiki/log.md is append-only chronological record
- Log entry format: ## [YYYY-MM-DD] action | Description
  (Actions: ingest, query, lint, update)

## Ingest Workflow
When processing a new source:
1. Read the full source document
2. Discuss key takeaways with user
3. Create or update a summary page in wiki/
4. Update wiki/index.md
5. Update ALL relevant entity and concept pages across the wiki
6. Add backlinks from existing pages to new content
7. Flag any contradictions with existing wiki content
8. Append entry to wiki/log.md
9. A single source should touch 10-15 wiki pages

## Query Workflow
When answering a question:
1. Read wiki/index.md first to find relevant pages
2. Read all relevant wiki pages
3. Synthesize answer with [Source: page-name] citations
4. If answer reveals new insights, offer to file it back into wiki/
5. Save valuable answers to outputs/

## Lint Workflow (Monthly)
Check for:
- Contradictions between pages
- Stale claims superseded by newer sources
- Orphan pages with no inbound links
- Concepts mentioned but never explained
- Missing cross-references
- Claims without source attribution
Output: wiki/lint-report-[date].md with severity levels

## Focus Areas
1. **Freight Operations** — Load lifecycle, BOL/RC generation, carrier matching, check-calls, tracking, invoicing, payment
2. **Compliance & Vetting** — Compass Engine 35-check system, FMCSA, OFAC, carrier onboarding, insurance, safety ratings
3. **Sales & CRM** — Lead Hunter pipeline, email sequences, Gmail reply tracking, engagement scoring, prospect conversion
4. **System Architecture** — Next.js frontend, Express/Prisma backend, PostgreSQL, Cloudflare Pages, Render, API integrations
5. **Industry Intelligence** — Freight market trends, carrier recruitment strategies, shipper acquisition, competitive positioning, regulatory changes
