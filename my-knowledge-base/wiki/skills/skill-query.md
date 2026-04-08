---
name: query
description: Answer questions using wiki content with citations and confidence
trigger: "Based on the wiki, answer..." or any question about SRL domain knowledge
version: 2
tags: [core, knowledge-base, research]
---

# Skill: Query

## When to Use
- User asks a question about SRL, freight, carriers, compliance, or strategy
- User wants a briefing, comparison, or analysis
- User asks "what do we know about X"

## When NOT to Use
- For processing new raw documents → use skill-ingest
- For health checks → use skill-lint

## Workflow

### 1. Read Index
Read wiki/index.md to identify all relevant pages.

### 2. Read Compiled Truth First
For each relevant page, read the State (compiled truth) section first.
Only read Timeline if deeper historical context is needed.

### 3. Synthesize Answer
- Cite wiki pages: [Source: page-name]
- Include confidence tags on claims: [EXTRACTED], [INFERRED: 0.X], [AMBIGUOUS]
- If multiple pages inform the answer, note where they agree and where they conflict
- Structure longer answers as: current state → key tensions → open questions → next steps

### 4. File Insights Back
If the answer reveals new connections or insights worth preserving:
- Offer to create a new wiki page or update existing compiled truth
- Save valuable analyses to outputs/ with frontmatter (title, date, pages_cited)

### 5. Log
Append to wiki/log.md if the query produced significant new insight.

## Output Formats
- **Quick answer:** 1-3 sentences with citations
- **Briefing:** 500 words, structured (state/tensions/questions/steps)
- **Comparison:** Table format with confidence tags per cell
- **Connection analysis:** Which topics link to which, what's unexplored
