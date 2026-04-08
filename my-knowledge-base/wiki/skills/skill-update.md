---
name: update
description: Refresh existing wiki pages with new data without full re-ingest
trigger: "Update [page] with..." or when codebase changes affect wiki accuracy
version: 1
tags: [core, knowledge-base, maintenance]
---

# Skill: Update

## When to Use
- Code was deployed that changes how a documented system works
- New data point arrived (metric, API response, market rate)
- A contradiction was discovered during a query
- Lint report flagged a page as stale or needs_update

## When NOT to Use
- For processing a new raw document → use skill-ingest
- For answering questions → use skill-query

## Workflow

### 1. Identify What Changed
Read the current compiled truth section. Understand what's there.

### 2. Update Compiled Truth
REWRITE the State section (and any relevant detail sections) to reflect current reality.
Add confidence tags to all new claims.
Update `updated:` date in frontmatter.

### 3. Append Timeline Entry
Add a new entry below the `---` separator:
```
### [YYYY-MM-DD] source | What changed
Old state: [previous claim]. New state: [updated claim]. Reason: [what triggered the update].
```

### 4. Update Cross-References
If the update affects other pages, update their compiled truth too.
Append timeline entries in those pages as well.

### 5. Log
Append to wiki/log.md:
```
## [YYYY-MM-DD] update | [page-name]
What changed and why.
```

## Rules
- NEVER delete timeline entries
- ALWAYS update the `updated:` date
- If confidence changed, update the `confidence:` frontmatter field
- If contradicting previous compiled truth, explain in timeline why
