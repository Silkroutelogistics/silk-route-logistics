# docs/claude/ — the context CLAUDE.md no longer carries resident

`CLAUDE.md` is injected into every session AND into every subagent's system prompt.
At ~405,000 tokens it exceeded the entire context window of any 200k model, so a
haiku subagent could not be spawned in this repository at all, and a sonnet one
cost ~646,000 tokens before it did any work — which is what suspended §2.6 rule c.
The core is now ~32,261 tokens, haiku starts (59,195 tokens for a trivial task), and
rule c is live again.

This directory holds what was moved out. Three rules govern it.

**1. § numbers never change.** 2,332 `§N` citations exist across `backend/`,
`frontend/`, `e2e/`, `shared/`, `scripts/` and `.github/` — §13.3 alone is cited
599 times. Content moves; labels travel with it. `CLAUDE.md` keeps the `§N`
heading as a one-line stub naming the file the body now lives in, so a citation
still lands somewhere that tells you where to look. **Renumber nothing, ever** —
that is the Sub-pattern 15 stale-pointer class at a scale nothing would catch.

**2. Every move is byte-exact.** A section was extracted as bytes, written
unchanged, and the sha256 of the moved span was compared before and after, then
re-derived independently from a pre-move snapshot. A pure move is reviewable at
any size because there is no content to review — only the boundary. That is what
substitutes for §3.3's 100-LOC bound, which cannot apply to relocating a
3,000-line section.

**3. Exactly one artifact reads `CLAUDE.md`.** Swept twice, by two methods:
`backend/__tests__/unit/routes/quickPayPilotDocClaims.test.ts`, anchored on
`### §21.1`…`### §21.2` with a length tripwire so a lost anchor fails loudly
instead of passing against an empty string. It is repointed in the same commit
that moves §21, never before or after. ~110 other files mention `CLAUDE.md`;
all are prose citations in comments or failure messages.

## Layout

| directory | holds |
|---|---|
| `docs/claude/` | needed for named work — load it when doing that work |
| `docs/claude/archive/` | closed, historical, or log — records of what happened |

The split is by *whether a session not doing that work needs it loaded*, never by
whether the text is correct. A recorded incident is reference, not a standing
rule; a closed item whose rule survives is split, with the rule staying resident.
