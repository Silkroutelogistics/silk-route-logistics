# Silk Route Logistics — Project Context (CLAUDE.md)

This file is the single binding source of truth for any Claude Code session working in this repo. Read it at session start. Rules below override all defaults. Follow them exactly.

Last consolidated: Phase 4 close (v3.7.h, commit `3ea7539`).

---

## §1 PROJECT IDENTITY

- **Legal entity:** Silk Route Logistics Inc. (Michigan C-Corp)
- **Location:** Kalamazoo, Michigan — canonical. Older docs may reference Galesburg; that is outdated.
- **FMCSA authority:** USDOT 4526880, MC 01794414, active property broker
- **BMC-84 surety bond:** $75,000, filed with FMCSA, surety PFA Protects (CA# 0M18074), completed February 19, 2026. BOC-3 process agent designation also on file.
- **Domain:** silkroutelogistics.ai
- **Tagline:** "Where Trust Travels."
- **Phone:** (269) 220-6760
- **Founder/CEO:** Wasi Haider. Internal tool surfaces may reference by name per §3.10; public marketing pages must not (see §5 Prohibited Claims).
- **Primary contact emails:**
  - `whaider@silkroutelogistics.ai` — founder/CEO, prospect outreach sender
  - `accounting@silkroutelogistics.ai` — AR, carrier pay inquiries
  - `compliance@silkroutelogistics.ai` — fraud reports, BMC-84 claims, FMCSA contact
  - `noreply@silkroutelogistics.ai` — system/transactional emails only

---

## §2 ARCHITECTURE

- **Frontend:**
  - Next.js 15 app router (`frontend/src/app/`) — React 19, TypeScript, Tailwind CSS 4, TanStack Query, Zustand, Recharts
  - Static HTML marketing pages (`frontend/public/*.html`) — 13 pages served via Cloudflare Pages auto-deploy from `main`
  - Shared CSS: `frontend/public/shared/css/utilities.css` (loaded on all pages via chrome injector — holds nav-login CSS after v3.7.f migration)
  - Shared chrome: `<!-- INCLUDE:nav -->` + `<!-- INCLUDE:footer -->` markers expanded by `inject-chrome.mjs` prebuild
- **Backend:** Node.js + Express + TypeScript (`backend/src/`) auto-deployed to Render from `main`
- **Database:** Neon PostgreSQL via Prisma ORM. Schema pushed via `prisma db push` — migration history has drift, avoid `prisma migrate dev`.
- **Auth:** JWT with bcrypt, 9 roles: CARRIER, BROKER, SHIPPER, FACTOR, ADMIN, DISPATCH, OPERATIONS, ACCOUNTING, CEO
- **PDF generation:** pdfkit (BOL, Rate Confirmation, Invoice)
- **Email delivery:** Resend. Google Workspace is the mailbox host.
- **Testing:** Vitest — `backend/__tests__/unit/services/` convention
- **CI:** GitHub Actions — lint + typecheck + build on push/PR
- **Brand colors:** navy `#0A2540`, gold `#BA7517` (darker `#C8963E` used in existing marketing CSS), cream `#F5EFE1`
- **Typography:** Playfair Display / DM Serif Display (headings), DM Sans / Plus Jakarta Sans (body), Georgia (legal docs)
- **Key Prisma models added Feb 2026:**
  - `RateConfirmation` — JSON formData + indexed financial columns, linked to Load
  - `CheckCall` — Track & Trace check-call log, linked to Load + User

### Backend patterns
- Controllers return `void`, use `res.status().json()` directly
- `AuthRequest` extends Express Request with `user?: { id, email, role }`
- Routes use `authenticate` middleware + `authorize(...roles)` + `auditLog(action, entity)`

### Frontend patterns
- Zustand for auth store, axios-based `api` client with token interceptor
- Dark UI theme on authenticated dashboards: navy bg, gold accents (`bg-gold`, `text-navy`), `bg-white/5` cards

### Load status pipeline (full)

```
DRAFT → POSTED → TENDERED → CONFIRMED → BOOKED → DISPATCHED →
AT_PICKUP → LOADED → IN_TRANSIT → AT_DELIVERY → DELIVERED →
POD_RECEIVED → INVOICED → COMPLETED
```

Also: `TONU`, `CANCELLED`, `PICKED_UP` (legacy alias).

---

## §3 BINDING RULES

Organized by firing frequency — universal rules first, domain-specific last. All rules enforceable across sessions; a Claude Code session must respect these without re-explanation.

### §3.1 Versioning

- Format: `MAJOR.MINOR.letter` (e.g. `v3.7.a`)
- **Default: bump the letter. Always. For every commit that deploys.** Sequence: `a → b → c → … → z → aa → ab → …` Continue past `z` with double-letters; **never** roll the minor at `z`.
- **Minor bump** (e.g. `v3.7.z → v3.8.a`): user-initiated only. Do not propose a minor bump unprompted. If you think one is warranted, ship the work as the next letter and mention the thought in the report — let the user promote it.
- **Never skip a letter.** Sequence is continuous.
- If the user names a specific version in their instruction (e.g. "ship this as v3.7.a"), use exactly that — don't second-guess.
- **Source of truth:** `frontend/src/components/ui/VersionFooter.tsx` — update with every commit that deploys.

### §3.2 Content sweeps verify rendered output

After any content/copy commit that touches a page:
1. Open the actual rendered page on deployed prod (not local file)
2. `curl`-and-`grep` the rendered HTML for strings that should be **removed** AND strings that should be **present**
3. Only then sign off

Content sweeps that verify only the diff are the bug that produced the v3.7.c stale-tier-copy miss. Diff says "I changed line X to Y"; rendered-output verification says "line Y is actually what the user sees."

### §3.3 Atomic commits + halt + smoke test

- One commit per sub-phase. Not three. Not five.
- Each commit description fits in one sentence; if it needs a paragraph, the commit is too big.
- Halt + smoke test between each sub-phase. Wait for user sign-off before the next.
- Pre-commit: `npx tsc --noEmit` from `backend/` + `npx next build` from `frontend/` must both pass clean.

### §3.4 Halt > ship

- Clarification is free.
- Post-deploy fixes are expensive.
- When in doubt, halt and surface.
- Never auto-correct ambiguous scope. Never guess at a missing file or uncertain value.

### §3.5 Audit-first pattern

- Before writing code: discovery bash commands to map actual codebase state.
- Halt on unexpected state, surface to user, do not guess.
- Pre-existing bugs may hide in code adjacent to new work — investigate, don't paper over.
- Root-cause before code. Ask "why" 3 times before writing a fix. Read the error. Reproduce it. Understand the mechanism. Then fix once. No blind retrying.

### §3.6 Next.js route shadowing

When both `frontend/public/*.html` AND `frontend/src/app/.../page.tsx` exist for the same path, the React component wins at runtime. Audit BOTH locations when editing content; note which is live before assuming an edit took effect.

**Origin:** v3.7.d auth tagline fix — edits to static HTML auth pages were shadowed by React auth routes.

### §3.7 Delete before you add

- Before building anything new, check for dead code related to what you're touching.
- Remove unused imports, dead functions, orphaned localStorage code.
- Don't add to code smells — reduce them.

### §3.8 Database over localStorage

- Pipeline stages, activity logs, address books, and any data that should persist across sessions MUST be stored in the database.
- localStorage is acceptable ONLY for: UI preferences (theme, sidebar state, view mode).
- When migrating localStorage to DB, keep localStorage as an instant-UI cache but always read/write through the API.

### §3.9 Origin/destination = physical location

- BOL, Rate Confirmation, and all shipping documents use `load.originAddress/City/State/Zip` for shipper and `load.destAddress/City/State/Zip` for consignee.
- Customer (billing entity) address is NEVER used on shipping documents unless origin fields are empty.
- `shipperFacility` and `consigneeFacility` are the company names at pickup/delivery — not the billing customer.

### §3.10 Sender identity for emails

- All prospect/lead outreach: from `Wasih Haider <whaider@silkroutelogistics.ai>` with personal plain-text style.
- Reply-to: `whaider@silkroutelogistics.ai` (so replies land in Gmail for tracking).
- Use the shared `EMAIL_SIGNATURE` from `emailSequenceService.ts` on all outreach emails.
- System/transactional emails (OTP, password reset, notifications): from `noreply@silkroutelogistics.ai`.
- Fraud reports / compliance: `compliance@silkroutelogistics.ai` (see CarrierFraudBanner, v3.7.e).
- AR / carrier pay: `accounting@silkroutelogistics.ai`.

### §3.11 PDFKit coordinate system

- PDFKit uses TOP-DOWN Y coordinates. Y=0 is the TOP of the page, Y=792 is the bottom (letter size).
- Start content at `y=12` and increment downward.
- Set `margins: { top: 34, bottom: 0, left: 34, right: 34 }` to prevent auto-pagination.
- Only use explicit `doc.addPage()` for intentional page breaks.
- **NEVER** use bottom-up Y math — that's ReportLab/Python, not PDFKit/Node.

### §3.12 Legitimate claim exceptions

Marketing claim rules (§4, §5) do **not** apply to the following contexts:

- **Industry citations** — ATRI-sourced safety/cost facts, NIOSH driver wellness facts in splash quotes. Internal employee audience.
- **Technical documentation** — e.g. `security-policy.html` rate-limiting docs are not marketing.
- **User-input form enums** — e.g. shipper register page "500+" in a monthly-shipments dropdown is a form value, not a claim.
- **Milestone threshold phrases** — "97% on-time", "98% on-time" as M4/M5 requirements are tier requirements, not volume claims.
- **Historical changelog comments** — comments in code that factually record past decisions should NOT be edited to match present state (they are a record, not a claim).

---

## §4 HONEST CLAIMS WHITELIST (authoritative)

Only these claims may appear on public marketing pages:

1. 100% fuel surcharge pass-through
2. Itemized quotes, no post-booking clipping
3. No factoring contract required to use Quick Pay
4. Performance-based tier advancement via Milestones M1–M6 (advancement independent of fleet size)
5. Published Quick Pay fees: Silver 3% / Gold 2% / Platinum 1% at 7-day standard; +2% for same-day at any tier
6. Free standard pay by tier: Silver Net-30, Gold Net-21, Platinum Net-14
7. Tier-based quarterly safety bonuses at Gold ($450/qtr) and Platinum ($900/qtr)
8. Tier-based referral bonuses ($250 / $500 / $750)
9. Tier-based detention pay
10. Property broker registered under FMCSA authority (USDOT 4526880, MC 01794414), BMC-84 bond on file
11. 7-factor transparent Compass Score (published on /carriers)
12. Marco Polo AI assistant is 24/7 (AI software is always on)

---

## §5 PROHIBITED CLAIMS (must not appear on marketing pages)

- Volume stats without real numbers (carrier counts, load counts, on-time percentages)
- Named customer testimonials unless a real carrier/shipper provided one in writing
- "Asset-based" / "our fleet" / "our trucks" / "we own"
- "Zero dispatch commission" / "$0 Commission" / "Zero Commission" (retired positioning)
- "Zero factoring fees" (misleading — replaced by no-contract framing)
- "24/7" for human-support contexts (reserved for Marco Polo AI only)
- "Monthly all-in rate cards" as current offering (roadmap only per /carriers "What's coming")
- Fuel card program, insurance referrals, equipment financing as current offerings (roadmap only)
- Named competitors (CHR, TQL, Landstar, Convoy, RXO, etc.) — use "typical broker" / "most brokers" / "industry average"
- "Wasi Haider" name or personal bio on public marketing pages (internal tools exempt per §3.12)
- "X+" style volume metrics without real numbers (500+, 12K+, $50M+ etc. — all retired in v3.7.d)

---

## §6 HONEST HOURS COPY (authoritative)

Use this exact text wherever operating coverage is claimed:

> "Business hours coverage Monday–Friday, 7:00 AM – 7:00 PM Eastern. After-hours emergency line available for active loads in transit."

Short-form variant (tight UI contexts):

> "Business hours Mon–Fri 7am–7pm ET + after-hours emergency line"

---

## §7 PROGRAM NAME CONVENTION (enforce strictly)

- **Full form (preferred):** "Caravan Partner Program"
- **Abbreviation after first reference on same page:** "CPP"
- **Prohibited variants** (retired, never use):
  - "Caravan Program" (missing "Partner")
  - "Caravan Carrier Program"
  - "Caravan Loyalty Program"
  - "Partner Program" (standalone, missing "Caravan")
  - "SRAPP" (fully retired)
- **"Caravan Network"** is acceptable ONLY as the eyebrow pill on `/carriers`; never as a program name.

---

## §8 v3 QUICK PAY PRICING (LOCKED)

### Silver (1–4 trucks, Day-1 entry)
- Net-30 free · 7-day QP 3% · same-day 5% (3%+2%)
- Auto-approve $2,000/load · monthly limit $15K
- Detention $50/hr after 2hr
- Referral $250
- FSC pass-through: loaded miles

### Gold (5–10 trucks OR M4 milestone)
- Net-21 free · 7-day QP 2% · same-day 4% (2%+2%)
- Auto-approve $4,000/load · monthly limit $40K
- Detention $65/hr after 2hr
- Referral $500 · Safety bonus $150/mo ($450/qtr)
- FSC pass-through: loaded + empty miles

### Platinum (11+ trucks OR M5 milestone)
- Net-14 free · 7-day QP 1% · same-day 3% (1%+2%)
- Auto-approve $6,000/load · monthly limit $80K
- Detention $75/hr after 1.5hr
- Referral $750 · Safety bonus $300/mo ($900/qtr)
- FSC pass-through: all miles
- Priority freight access

### Critical rule
Same-day Quick Pay is UNIVERSAL +2% premium on tier fee. **Not tier-gated.** Every tier can elect same-day on any load.

---

## §9 COMPASS SCORE (7-factor, published on /carriers)

| Factor | Weight |
|---|---|
| On-time pickup | 20% |
| On-time delivery | 20% |
| GPS compliance | 15% |
| Claims ratio | 15% |
| Communication | 10% |
| Document timeliness | 10% |
| Acceptance rate | 10% |

---

## §10 MILESTONES M1–M6 (performance-based advancement)

| Milestone | Requirements | Outcome |
|---|---|---|
| M1 | First Caravan Partner Program load | Silver tier active |
| M2 | 30 days, 10+ loads, 95%+ on-time | Silver confirmed, Compass tracking eligible |
| M3 | 90 days, 30+ loads, 96%+ on-time | Silver established, referral bonuses unlock |
| M4 | 180 days, 75+ loads, 97%+ on-time, 1 referral | → Gold (fleet-size-independent) |
| M5 | 360 days, 150+ loads, 98%+ on-time, 3 active lanes | → Platinum |
| M6 | 720 days, 300+ loads | Locked 1% QP permanently, advisory voice on CPP evolution |

---

## §11 PHASES SHIPPED (chronological, all on main)

| Version | Commit | Description |
|---|---|---|
| v3.7.a | `cdf1f3b` | BRONZE→SILVER enum migration, Caravan Partner Program rebrand, v3 QP pricing, 7-factor Compass, QP override backend, `getEffectiveTier` PLATINUM identity fix |
| v3.7.b | `c6744d1` | AE Console QP override UI, variance cron, `caravanService.test.ts`, rate-con PDF cleanup |
| v3.7.c | `635aa46` + `ed3d321` | /carriers tier cards grid fix (v3.7.a miss — caught in visual audit) |
| v3.7.d | `2a9ae08` | **Phase 4A** — truth-up cleanup: removed fabricated stats, testimonials, asset-based mischaracterization, retired $0 Commission, human-support 24/7 |
| v3.7.e | `9fe2ef6` | **Phase 4B** — CarrierFraudBanner on /carriers (FMCSA verification, BMC-84 bond reference, `compliance@` mailto) |
| v3.7.f | `42f443c` | Chrome CSS fix — nav-login CSS migrated from `pages/index.css` to shared `utilities.css`, "Sign In" artifact resolved across 12 non-homepage pages |
| v3.7.g | `630219f` | **Phase 4C** — positioning rewrite: homepage hero, /carriers three commitments, honest math box, Milestones M1–M6, "What's coming" roadmap, closing CTA; `contact.html` FAQ v3 alignment |
| v3.7.g.1 | `1ac3802` | Mobile responsive hotfix — tier cards + math box at ≤768px (bug since v3.7.a + new in 4C); pure CSS, no `!important`; also fixed pre-existing `repeat(4,1fr)` BRONZE-era stale grid |
| v3.7.h | `3ea7539` | **Phase 4D close** — 5 FAQ entries, supporting page sweep, onboarding email verified on v3 (closes Phase 3 Gap 3), MEMORY.md deferred items logged |

---

## §12 EXEMPT SURFACES (internal tools — different rules)

Marketing content rules (§4, §5) do **NOT** apply to these surfaces:

- `frontend/src/app/dashboard/lead-hunter/**` — email signatures intentionally sign as Wasi per earlier decision (§3.10)
- `frontend/src/app/ae/**`, `frontend/src/app/accounting/**`, `frontend/src/app/admin/**` — internal tools, fabricated fixture data allowed (see §13 deferred cleanup)
- `frontend/src/data/splashQuotes.ts` — ATRI/NIOSH-sourced industry facts, employee audience
- Internal dashboards may reference "Wasi" or "Sales (Wasih)" labels
- `frontend/public/security-policy.html` — technical rate-limiting documentation, not marketing
- `frontend/public/ae/**` — internal AE console HTML, fixture data OK

---

## §13 DEFERRED POLISH / CLEANUP QUEUE (non-blocking)

- **Internal AE dashboard fixture personas** — `ae/financials.html:137` contains "Michael Reeves" and possibly other fabricated persona names. Replace with generic labels (Customer #1, Customer #2) before any public demo, investor presentation, or external screen-share. Internal tooling only, not marketing surface.
- **v3.6.j sidebar logo clickability** — 31 portal/AE sidebar logos to be made clickable to dashboards. Non-critical polish.
- **Phase 5 CSS variable consolidation** — Option C from v3.7.f. Consolidate shared CSS variables into a proper variables file instead of `:root` injections in `utilities.css`.
- **Phase 5 visual rebalance** — /carriers and site-wide over-dark color palette; cream/off-white section backgrounds needed; typography audit for mobile readability. Includes BOL / rate confirmation visual redesign (design asset staged in Google Drive by Wasi, slots into Phase 5).
- **README.md fix** — `README.md:3` uses "Asset-based carrier management and freight brokerage platform" — same mischaracterization removed from marketing in v3.7.d. README is dev-facing (internal), not marketing (external), so Phase 4 rules don't strictly apply. Fix as a separate micro-commit before Phase 6 external demos.
- **MEMORY.md cleanup** — after CLAUDE.md §2 (Architecture) and §13 (Deferred Queue) ship, MEMORY.md has duplicated content. Trim MEMORY.md to only session-specific notes. Do NOT do in same commit as CLAUDE.md consolidation (atomic commits rule, §3.3).

---

## §14 LEGAL / COMPLIANCE STATUS

- Property broker under 49 U.S.C. §§ 13904, 13906
- **Carmack Amendment:** SRL is NOT liable as a motor carrier. Carriers sign the bill of lading and assume Carmack liability per the Broker-Carrier Agreement.
- BMC-84 bond provisions documented in Caravan Quick Pay Agreement v2 (Article 20). Surety: PFA Protects (CA# 0M18074).
- Michigan governing law, Kalamazoo County venue for disputes.
- Non-solicitation 12 months post-termination, 15% liquidated damages (Flock pattern).
- **Caravan Quick Pay Agreement v2:** DRAFTED. 22 articles, 3 exhibits, 513 paragraphs, 42.6 KB. Covers anti-assignment, re-brokering prohibition, non-solicitation with liquidated damages, 14 regulatory compliance covenants, full Carmack framework, minimum insurance ($1M auto / $100K cargo / $1M–$2M GL), indemnification, confidentiality, damages cap, Michigan governing law, arbitration election, jury trial waiver, BMC-84 provisions, force majeure. **REQUIRES** Michigan commercial attorney review before first carrier signs. Budget: $400–$800.
- **Broker-Carrier Agreement (base):** Research complete (Cowtown, Flock, Seaton & Husk templates reviewed, FMCSA regulations cross-referenced). Draft not yet created as standalone document. Quick Pay Agreement v2 assumes this base exists — **first carrier onboarding blocker**.

---

## §15 TOOL PREFERENCES (this Claude Code environment)

- **`bash grep` is reliable; the Grep tool has a known quirk on `/tmp` paths** — use `bash grep` for verification via the Bash tool. Lesson origin: v3.7.d smoke test, Grep tool returned zero matches while `bash grep` found the hits.
- **Rendered-output verification requires deployed URL** (not local file reads) — smoke tests use `curl` on `silkroutelogistics.ai`, not local file reads. Cloudflare Pages takes ~2–3 min to deploy after push; use a single background Bash task with `sleep 180` + `curl` + `grep` chain.
- **Visual confirmation requires the user** — no headless browser available. Claude Code can verify HTML structure + deployed content via curl/grep, but pixel-level checks require screenshots from the user.
- **VS Code Claude Code extension** is the primary surface; commits via bash `git` in the integrated terminal.
- **Shell working directory persists** between Bash calls (e.g. `cd backend` sticks). Use absolute paths (`git -C "c:/Users/..."`) or explicit `cd` at the start of each command if the state matters.
- **Exit code 1 from `grep -c` returning zero matches** — this is expected and healthy (grep conventions). If a background Bash ends with a regression-grep that returns zero prohibited-string hits, the whole pipeline "fails" with exit 1 even though the result is a PASS. Read the output, not just the status.

---

## §16 FIRST-CARRIER ONBOARDING BLOCKERS (pre-launch, must resolve before first carrier signs)

1. **Broker-Carrier Agreement base document** — create as standalone `.docx` referenced by Quick Pay Agreement v2
2. **Michigan commercial attorney review of Caravan Quick Pay Agreement v2** ($400–$800 budget)
3. **DAT load board registration** activation
4. **Carrier onboarding welcome email final verification** before first real carrier touches it (v3 language confirmed at `routes/carriers.ts:614` in v3.7.h; re-verify before go-live)
5. **`compliance@silkroutelogistics.ai` alias monitoring cadence** confirmed (published on CarrierFraudBanner since v3.7.e)
6. **Insurance verification** — contingent broker coverage via PFA Protects + LOGISTIQ Broker Shield. Confirm policies active, not just in application state.

---

## Appendix: Legacy / Custom Sections

Preserved from the pre-consolidation CLAUDE.md. These are patterns and roadmap items that didn't fit cleanly into §1–§16 but remain valid tracking material. Time-bound metrics have been stripped (e.g. "currently 21 refs", "Plan for Q2", "Install when doing daily SRL sessions").

### A.1 State Machines for Load & Carrier Lifecycle (claw-code pattern)

- Every entity with a lifecycle (Load, Carrier, Invoice, Sequence) has defined states and valid transitions.
- **Load:** `DRAFT → POSTED → TENDERED → BOOKED → DISPATCHED → AT_PICKUP → LOADED → IN_TRANSIT → AT_DELIVERY → DELIVERED → COMPLETED`
- **Carrier:** `PROSPECT → CONTACTED → INTERESTED → REGISTERED → PENDING → APPROVED` (or `REJECTED`)
- **Invoice:** `DRAFT → SUBMITTED → SENT → UNDER_REVIEW → APPROVED → FUNDED → PAID`
- **Sequence:** `ACTIVE → PAUSED → COMPLETED → STOPPED`
- Invalid transitions should be rejected (e.g., can't go from POSTED directly to DELIVERED).
- State changes should be observable — log every transition with timestamp and actor.

### A.2 Lane-Based Development (claw-codes pattern)

- For features touching multiple systems (e.g., carrier vetting has FMCSA, OFAC, identity, docs, scoring), split into independent lanes.
- Each lane has its own scope, can be built/tested/merged independently.
- Track lane status in commit messages: `[Lane 3/5] OFAC screening integration`.
- Lanes reduce merge conflicts and enable parallel work across sessions.
- Document active lanes in the relevant wiki page's "Open Threads" section.

### A.3 Event-Based State Transitions (claw-code roadmap pattern)

- State changes on Load, Carrier, Invoice, Sequence should emit structured events, not just update a DB field.
- Log every transition: `{ entity, id, from, to, actor, timestamp, metadata }` in `SystemLog`.
- Enables: audit trail, webhook triggers, external monitoring, undo capability.
- Example: `Load SRL-121483: POSTED → BOOKED by userId=xyz at 2026-04-08T10:30:00Z`.

### A.4 Knowledge Graph Awareness (Graphify pattern)

- The wiki tracks "god nodes" — concepts referenced by 10+ pages.
- Surprising connections between topics should be documented in `outputs/` when discovered.
- Every factual claim carries `EXTRACTED` / `INFERRED` / `AMBIGUOUS` confidence tags (already implemented in KB v2).

### A.5 Future Patterns (documented, not yet implemented)

- **Hook system (claude-brain):** PreToolUse / PostToolUse interceptors for permission gates and compliance checks.
- **Cost tracker modularization (src-repo):** split token counting, cost calculation, and analytics into separate modules.
- **Feature flags:** currently using env vars. Consider build-time elimination when/if migrating to Bun.
- **Centralized command registry (Hermes):** single registry auto-generates CLI help, Slack menus, API docs. Plan when multi-platform.
- **Print-mode automation (Hermes):** one-shot CLI mode for CI/testing without trust dialogs.
- **MemPalace conversation persistence:** local AI memory system (ChromaDB) that stores every session verbatim and makes it searchable. Auto-save hooks fire every 15 messages. Command: `pip install mempalace && mempalace init`.
