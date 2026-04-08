---
name: lint
description: Full health check on wiki — broken links, contradictions, stale pages, orphans
trigger: "Run a health check" or "lint the wiki"
version: 2
tags: [core, knowledge-base, maintenance]
---

# Skill: Lint

## When to Use
- Monthly maintenance (first of month)
- After a batch of ingests (5+ sources processed)
- User asks for wiki health status
- Before starting a major new research initiative

## When NOT to Use
- For processing a single new source → use skill-ingest
- For answering questions → use skill-query

## Workflow

### 1. Inventory
Count all pages, list by status (draft/reviewed/needs_update/stale).

### 2. Broken Links
Find all [[wiki-links]] that reference pages that don't exist.
Report with reference count and severity.

### 3. Orphan Pages
Find pages with zero inbound links. Flag as near-orphan if only 1 link.

### 4. Contradictions
Scan compiled truth sections for conflicting claims across pages.
Check if timeline entries exist that should have updated compiled truth but didn't.

### 5. Stale Content
Flag pages where `updated:` date is >30 days old.
Flag pages with `confidence: LOW` or `[STALE]` tags.
Flag pages with `status: needs_update`.

### 6. Source Attribution
Check every page has at least one `[Source:]` citation.
Check every factual claim has a confidence tag.

### 7. Structural Integrity
Verify every page has:
- YAML frontmatter with required fields (title, type, created, updated, status, confidence)
- `## State` section (compiled truth)
- `---` separator
- `## Timeline` section
Flag pages not yet migrated to v2 format.

### 8. Output
Write to wiki/lint-report-[date].md with severity levels:
- 🔴 Error: broken links to heavily-referenced pages, structural issues
- 🟡 Warning: stale content, missing confidence tags, contradictions
- 🔵 Info: near-orphans, low citation count, suggested improvements

### 9. Suggest Articles
Recommend top 3 pages to create or research based on gap analysis.

### 10. Log
Append to wiki/log.md with health score.
