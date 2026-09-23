# §18 — Lead Hunter standing rules

Moved out of `CLAUDE.md` on 2026-09-23. **Load this for any Lead Hunter or cold-outreach
work**, and note that §18 binds more than outreach: §18.3 (read the brand skill from disk
at the moment of any claim, every time) and §18.9 (the AI-tell audit) apply to any
SRL-facing copy, including manually drafted email.

Two things in here are enforced by code rather than by discipline: the vertical gate
(§18.7 — `UNKNOWN` hard-blocks email generation at six call sites) and the Compass
check count in §18.8, which a test holds to the number the engine actually emits.

Section numbers unchanged; see `README.md`.

---

## §18 LEAD HUNTER STANDING RULES

These rules apply to every Lead Hunter sprint without re-statement. Codified during the v3.8.v–v3.8.cc Lead Hunter outreach quality fix sprint. §13.3 backlog items that touch Lead Hunter (Apollo importer, prospect schema, outreach generator, sequencer, mass email) must reference this section.

### §18.1 Audit-first

Before any code change in a Lead Hunter sprint: read CLAUDE.md §13.3, `docs/regression-log.md`, and the latest five commits in `git log` to confirm baseline. Report current commit SHA + Phase state before touching code. Map the call paths that the change will affect (CSV importer → bulkCreateCustomers → Customer model → buildEmail/buildEmailSync → sendMassEmail / startSequence / processDueSequences). Do not begin until the audit is surfaced and the baseline is acknowledged.

### §18.2 Atomic commits per bug

One bug = one commit = one regression-log entry (when applicable). No batched commits. Each commit has its own version letter per §3.1. Halt + smoke test (backend `npx tsc --noEmit` clean + frontend `npx tsc --noEmit` clean) between sub-phases. Wait for sign-off before the next.

### §18.3 Brand skill at moment-of-claim

Before any copy/voice claim, read [`/.claude/skills/srl-brand-design/references/voice.md`](.claude/skills/srl-brand-design/references/voice.md) AND [`tokens.md`](.claude/skills/srl-brand-design/references/tokens.md) from disk. Every time. Do not work from session memory; voice/token rules update independently of code and the file is the source of truth. Apply the three calibration questions before publishing copy: would a 15-yr dispatcher nod or roll their eyes? Could a competitor say this verbatim? Is there a number, lane, regulatory citation, or named tool somewhere?

### §18.4 Apollo CSV columns are literal

Apollo emits exact column headers: `First Name`, `Last Name`, `Company Name`, `Title`, `Email`, `Industry`, `Vertical`. Capitals and spaces matter. Importers MUST read these literals — never `Contact Name`, never `firstName`, never `company_name`. Compose `contactName = First Name + " " + Last Name` so downstream firstName extraction (`fullName.split(/\s+/)[0]`) produces the contact's actual first name, not the company's first token. Reference fixture: `srl_coldchain_2026-05-04.csv` (user downloads).

### §18.5 Version verification against §13.3

When a sprint directive suggests a version tag, verify against §3.1 sequence-continuous and §13.3 backlog before applying. If the suggested letter conflicts (taken by a parallel sprint, behind current HEAD, or skips a letter), allocate the next available letter and note the reassignment in the commit message. Never silently re-letter without surfacing.

### §18.6 Ship-default on mechanical halts

When you halt on a mechanical issue (file not found, permission denied, missing skill mount, version-letter conflict, expected dependency absent), make the obvious call and proceed. Do not surface A/B/C menus for non-strategic decisions. Flag the call in the commit message or audit report so it's reviewable. Reserve halts for §3.4 strategic ambiguity (legal claim correctness, scope boundary, irreversible action).

### §18.7 Cold-outreach data flow is import-time validated

Every `Customer` record created through the Lead Hunter import path MUST have `vertical ∈ {COLDCHAIN, WELLNESS}` before any outreach generation runs. `UNKNOWN` is a valid persisted state but is a **hard block** on the email-generation pipeline. UNKNOWN customers surface in the AE Console **Manual Review queue** (Lead Hunter pipeline view → "Manual Review (N)" filter mode at [`page.tsx`](frontend/src/app/dashboard/lead-hunter/page.tsx)).

The hard block enforces at six call sites:

1. [`buildEmail`](backend/src/email/builder.ts) (DB lookup) — throws on `customer.vertical === "UNKNOWN"`
2. [`buildEmailSync`](backend/src/email/builder.ts) (in-memory) — throws on `params.vertical === "UNKNOWN"`
3. `getTemplate` (defense in depth) — throws on Touch 1 + UNKNOWN
4. [`sendMassEmail`](backend/src/controllers/customerController.ts) — skips with reason in `skippedReasons[]` response field
5. [`startSequence`](backend/src/services/emailSequenceService.ts) — throws on UNKNOWN, sequence cannot start
6. `processDueSequences` (cron tick) — holds an active sequence by pushing `nextSendAt` forward 24h, never advances step on UNKNOWN

Adding any new outreach call path requires the same gate. The schema-level enum at [`schema.prisma`](backend/prisma/schema.prisma) (`enum ProspectVertical { COLDCHAIN, WELLNESS, UNKNOWN }`) is the SOT for valid values.

### §18.8 Honest-framing rule

Cold-outreach copy MUST follow voice.md + §4 + §5:

- No fabricated metrics ("98% pickup rate", "8-12% reduction", "X+ shippers"). Pre-revenue means pre-revenue. Use capability claims (regulatory authority, Compass Engine vetting) instead.
- No marketing softeners ("I'd love the opportunity", "see if we can add value", "would you be open to a brief call", "I'd be happy to").
- No em-dashes in body copy (commas, colons, sentence breaks instead). Em-dashes acceptable only in list-separator context.
- No "we track" / "we serve" / "we deliver to X retailers" implied-portfolio language unless the portfolio actually exists. Use industry-knowledge framing: "In refrigerated CPG, the operational signal that matters is..."
- Compass Engine is a **33-point carrier vetting system** (re-derive this number before quoting it — `backend/__tests__/unit/services/compassCheckCount.test.ts` holds every surface to the code). Never describe as "AI-powered market intelligence" (per voice.md line 25 prohibition).
- Authority line on every cold-outreach intro: `Michigan-licensed property broker (MC# 1794414, DOT# 4526880, BMC-84 bonded $75K, $100K contingent cargo through Hancock & Associates)`.
- Sender identity: `Wasi Haider` / `whaider@silkroutelogistics.ai` (never `Wasih`). Single source of truth: `CEO_NAME` + `CEO_EMAIL` exports in [`backend/src/email/builder.ts`](backend/src/email/builder.ts) — startup log line surfaces a regression in production logs immediately.
- Specific operational ask at close: "send a recent BOL on a tricky lane and I'll come back with a quote and the carrier's full Compass profile" — never "would you be open to a brief call this week?"

### §18.9 — Outreach copy AI-tell audit (mandatory pre-send)

Every SRL outreach email — Lead Hunter generated, manually drafted, or templated — must pass an AI-tell audit before send. The audit applies to body, subject line, and signature. The character "—" (em dash, U+2014) must not appear anywhere in any sent email. Banned constructions:

  1. Em dashes in body, subject, or signature. Replace with periods, commas, colons, or restructure.
  2. "That's where..." / "That's the..." / "That's what..." sentence openers. Use the actual subject of the sentence.
  3. Parenthetical asides used as voice texture. Allowed only when genuinely necessary for clarity.
  4. Symmetric two-clause balanced sentences ("X is Y, and Y is X"-style construction).
  5. Consultant-speak imports: "step-change", "in under a year", "planning-vs-actuals", "leverage", "synergy", "best-in-class", "world-class", "north star", "unlock value", "comprehensive solution", "AI-powered" (when describing capabilities, not products).
  6. Marketing softeners: "I'd love the opportunity", "see if we can add value", "would you be open to a brief call", "I would appreciate the opportunity to connect".
  7. Repeated close patterns within a single batch. No two outreach emails sent within the same week may use the same closing operational ask. Acceptable closes: "Send a recent BOL on [lane] and I'll quote against your incumbent" / "If your next outbound RFQ has a slot open" / "What does your current carrier review cycle look like?" / Other operational asks specific to the recipient's situation.

Adjective/noun lists are NOT banned when they are factual proper-noun enumerations (real product categories, real retailer names from the recipient's actual distribution). The prohibition is on adjective-stacking as a "showing range" device, not on naming actual entities.

Hook structure rule (per voice.md, restated here for outreach scope):
  - Opening sentence: a company-specific operational signal that proves recipient research. Not credentials.
  - Authority line (MC#, BMC-84, contingent cargo): one line above signature. Not paragraph one.
  - Length: 4-5 short paragraphs. Tight beats long.
  - Compass Engine described correctly (33-point carrier vetting — see §18.8 on re-deriving the count), never "AI-powered market intelligence".

Implementation guidance for Lead Hunter system prompts (touch1ColdChainTemplate, touch1WellnessTemplate, fallback): the system prompt must explicitly enumerate the banned constructions in §18.9 above and instruct the model to self-check before output. The audit is also applied at the test/preview stage — Little Spoon and MERIT preview render must pass §18.9 audit, not just §18.8 honest-framing.

For manual outreach (founder-drafted in Gmail, not Lead Hunter generated): same audit applies. Run it mentally before send. The discipline is the writer's, not the platform's.

---

