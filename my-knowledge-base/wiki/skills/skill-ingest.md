---
name: ingest
description: Process a raw source document into wiki pages with compiled truth + timeline
trigger: "Process [FILENAME] from raw/"
version: 2
tags: [core, knowledge-base]
---

# Skill: Ingest

## When to Use
- New document dropped into raw/
- User says "process", "ingest", or "read [filename]"
- After receiving new market research, audit report, or strategy document

## When NOT to Use
- For answering questions → use skill-query
- For health checks → use skill-lint
- For updating existing pages with new data → use skill-update

## Workflow

### 1. Read Source
Read the full document from raw/. Do not skim.

### 2. Discuss Takeaways
Present 3-5 key takeaways to the user. Flag any contradictions with existing wiki compiled truth.

### 3. Create/Update Wiki Pages
For each topic covered by the source:

**If page exists:**
- REWRITE the State (compiled truth) section with latest information
- APPEND a timeline entry: `### [YYYY-MM-DD] source | What was learned`
- Update `updated:` date and `source_count:` in frontmatter
- Add confidence tags to all new claims

**If page doesn't exist:**
- Create with full compiled truth + timeline format
- Include frontmatter: title, type, created, updated, source_count, status, confidence, tags
- Add `## State`, `## Open Threads`, `## See Also`, `---`, `## Timeline`

### 4. Update Index
Add new pages to wiki/index.md under the appropriate category.

### 5. Cross-Reference
Update ALL related pages with backlinks. A single source should touch 5-15 pages.

### 6. Flag Contradictions
If new info contradicts existing compiled truth:
- Update the compiled truth (it should always be current)
- Append timeline entry explaining what changed and why
- Use `[AMBIGUOUS]` tag if contradiction is unresolved

### 7. Log
Append to wiki/log.md:
```
## [YYYY-MM-DD] ingest | [filename]
Summary of what was learned, pages created/updated, contradictions found.
```

## Quality Checks
- Every new claim has a confidence tag
- Every page has the `---` separator between compiled truth and timeline
- Timeline entries are dated and sourced
- Index is updated
- Log is appended
