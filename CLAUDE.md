# Silk Route Logistics — Project Context (CLAUDE.md)

This file is the single binding source of truth for any Claude Code session working in this repo. Read it at session start. Rules below override all defaults. Follow them exactly.

Last consolidated: Phase 6.2 close (v3.8.ee, sprint span `7c74bb1`–`df3545f`).

---

**Where the rest of the context lives.** This file is injected into every session AND into every
subagent's system prompt, so its size is not a style question: at ~405,000 tokens it exceeded the whole
context window of any 200k model, which suspended §2.6 rule c until the slim-down landed.
The core is now ~32,261 tokens, a haiku subagent starts, and rule c is live again. What a session needs *every*
time stays here. What it needs only when doing a named kind of work moved to `docs/claude/`; what is
closed or historical moved to `docs/claude/archive/`. See `docs/claude/README.md` for the conventions.

**§ numbers never change.** 2,332 `§N` citations exist across the codebase (§13.3 alone is cited 599
times). Content moved; labels travel with it, and the `§N` heading stays here as a one-line stub naming
the file the body now lives in — so a citation still lands somewhere that tells you where to look.
Renumbering anything would go stale across 599 comments in a single commit. Do not do it.

---

## §1 PROJECT IDENTITY

- **Legal entity:** Silk Route Logistics Inc. (Michigan C-Corp)
- **Principal address:** 2317 S 35th St, Galesburg, MI 49053. Filed with FMCSA, listed on BMC-84 bond paperwork, and appears on the filed Bill of Lading. Galesburg is inside Kalamazoo County, so county-level venue references (§14 and Broker-Carrier Agreement §10, which the Quick Pay Agreement incorporates by reference rather than restating) remain correct as "Kalamazoo County". Correction history: earlier CLAUDE.md revisions listed Kalamazoo as principal city — that was a session-memory error corrected in v3.7.i; see §3.13 for the rule it codified.
- **FMCSA authority:** USDOT 4526880, MC# 1794414, active property broker
- **SCAC:** SILT — issued by NMFTA August 2026 (applied 2026-08-12 via scaccode.com; entity type broker, non-Class-8 identity verification completed). Renews annually on NMFTA's July 1 – June 30 cycle (~$115/yr including the $5 identity-verification fee) — add to the compliance calendar alongside BMC-84 and UCR. Use on shipper routing guides, customer onboarding/TMS setup forms, and EDI transactions (204/214/210) when that module goes live. Source: NMFTA-issued certificate emailed to whaider@ (primary source per §3.13).
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
  - `operations@silkroutelogistics.ai` — customer-facing operations contact. Used on BOL, Rate Confirmation, Invoice, and other shipper/carrier-facing documents generated via the `srl-brand-design` skill. Routes to `whaider@` until the Pakistan-based AE/Compliance hire (Oct 2026), at which point routing flips to that inbox without requiring document reissue. The forward-looking aliasing avoids a future BOL-template churn when the hire lands.
  - `sales@silkroutelogistics.ai` — inbound prospect/lead intake. The public quote form at `/shippers.html#quote-form` (POST `/api/leads/website`) creates `WebsiteLead` rows + fires a notification + shipper confirmation. **v3.8.amv: the quote-form notification recipient moved from `sales@` → `operations@`.** Resend had auto-suppressed `sales@` after early hard bounces (the v3.8.amu verification tests fired before the inbound alias existed → bounced "user unknown" → Resend blocklisted the address → every later notification showed "Suppressed" in Resend and was never sent, which is why Google's Email Log Search showed 0). `operations@` is the real shared mailbox `sales@` aliases to anyway (Google Workspace: `operations@` mailbox created 2026-05-28, `sales@` is its alias), so leads now land there directly — one inbox alongside the contact form's `operations@` notification. `sales@` remains the public-facing inbound alias (mail TO it routes to the `operations@` shared inbox; only our outbound Resend notification was repointed). (This entry once also cited `frontend/public/ae/communications.html:71`; that whole tree was deleted in v3.8.asc, 2026-08-17 — reference retired 2026-09-21.) Routes to `whaider@` until the first AE/Sales hire. Documented 2026-05-19 (v3.8.aej docs catch-up) per §13.3 Item 8.2.1; recipient repoint 2026-06-02 (v3.8.amv).
  - `carriers@silkroutelogistics.ai` — inbound carrier prospect/application intake. Used on the /carriers.html closing CTA email link and any other carrier-facing onboarding inquiry surface. Mirrors the sales@ pattern but routes to the carrier-side AE/compliance inbox. Routes to `whaider@` (and/or `compliance@`) until the carrier-side hire lands, at which point routing flips to that inbox without requiring page reissue. The forward-looking aliasing avoids future template churn when the hire occurs. Documented 2026-05-21 (v3.8.ahf).
  - `careers@silkroutelogistics.ai` — inbound recruiting/hiring intake. Used on the `/careers.html` "Interested in Joining SRL?" email CTA. Routes to `whaider@` until a hiring lead exists, at which point routing flips without requiring page reissue (same forward-looking aliasing pattern as `sales@`/`carriers@`). Documented 2026-05-31 (v3.8.amg) during the /careers §20 audit (Wasi directive: keep the `careers@` alias rather than repoint to `whaider@`).

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
- **Brand colors + typography:** see §2.1 Design System below (single source of truth). Short form: gold `#BA7517`, navy resolves from `themes.css` (`#0D1B2A` in the default silk-route-classic light mode), canvas `#faf9f7`, gold tint `#FAEEDA`, dark gold `#854F0B`.
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

### Tender accept → status flip: BOOKED vs DISPATCHED is intentional (Sprint 39 P3 decision)

→ `docs/claude/tender-and-dispatch.md`. The three accept paths and why direct books while bulk
dispatches; the `dispatchedAt` analytics dependency that makes it load-bearing; and the tracking-link
fan-out rule — **the customer is told at the SIGNATURE, on every path.**

---

### AE Console modules

Served at `/dashboard/*`, `/accounting/*`, `/admin/*` via Next.js app router. The static HTML that once sat at `frontend/public/ae/*` was **deleted in v3.8.asc (2026-08-17)** — 12 pages and their CSS — so the React routes are the only AE surface. Reference retired 2026-09-21; §12's exemption for that tree went with it.

**Live React routes: 48 dashboard + 13 accounting + 4 admin = 65 live routes.** (Counts exclude Next.js convention files — `layout.tsx`, `error.tsx`, `loading.tsx`.) Grouped by function:

- **Operations (daily-use):** `lead-hunter` · `crm` · `carriers` · `loads` · `orders` · `dispatch` · `track-trace` · `loads-calendar` · `dock-scheduling` · `tender` · `drivers` · `fleet`
- **Financial operations:** `finance` · `invoices` · `payables` · `settlements` · `factoring` · `quick-pay` (dashboard) + `/accounting/*`: `aging` · `analytics` · `approvals` · `credit` · `disputes` · `export` · `fund` · `invoices` · `payments` · `pnl` · `quick-pay` · `quickpay-revenue` · `reports`
- **Intelligence + analytics:** `overview` · `scorecard` · `revenue` · `waterfall` · `market` · `lane-analytics` · `geo-spend` · `backhaul-discovery` · `variance-reports` · `ai-costs` · `ai-insights`
- **Compliance + documents:** `compliance` · `claims` · `documents` · `audit` · `violations` · `fuel-tables`
- **Configuration + rules:** `rfp` · `routing-guide` · `exception-config` · `contract-rates` · `shipper-defaults` · `tagging-rules` · `sops` · `training-courses` (SRL Driver Academy authoring, v3.8.ane) · `settings`
- **Communication:** `messages` · `communications` · `phone-console`
- **Integrations:** `edi` · `integrations` · `tracking`
- **Admin (platform-level):** `/admin/*` — `users` · `system` · `monitoring` · `analytics`

**Canonical Lead Hunter component:** `ProspectDrawer` (`frontend/src/app/dashboard/lead-hunter/ProspectDrawer.tsx`). Lead-hunter-specific; wraps `IconTabs` from `@/components/ui/IconTabs`. Originated in v3.6.a (`4668f67`), evolved through v3.6.b (`e8af6a1`) and v3.6.c (`8fe73b3`). The "SlideDrawer" name from prior session memory is synthesis error — no component by that name exists.

---

### §2.1 Design tokens

Canonical / LEGACY / SUPERSEDED / DEFERRED colour and layout tokens → `docs/claude/design-tokens.md`.
**The `srl-brand-design` skill is canonical** — read `references/tokens.md` from disk per §18.3.

---

### §2.2 — Production Deployment (Canonical)

Render service, required env vars, the canonical Build Command, and the accounts behind each guard in it
— the `check-direct-url.js` pre-migrate check, the `cp -r SRC/. DEST/` trailing-dot form, the fail-fast
property post-Sprint-46, and why `migrate status` takes no `--exit-code` flag →
`docs/claude/deploy-and-schema.md`.

**MORE THAN ONE SESSION MAY BE WORKING THIS REPO AT ONCE (hard rule, added
2026-08-21).**

Two sessions took `v3.8.aud` on the same afternoon. Neither noticed. The
letter is assigned from memory of "what came last", and a second session is
precisely the thing that invalidates that memory.

**Before every commit, in this order:**

1. **Re-derive the version letter from origin, never from memory.** Run
   `node backend/scripts/check-version-letter.js <letter>`. It fetches, takes
   the maximum over both the footer and the commit subjects, and refuses a
   letter already claimed on origin. Run it immediately before the commit —
   origin moved twice under Arc 24 alone, so an answer from session start is
   already stale.
2. **Read `git status` for foreign modifications.** Files you did not touch,
   modified since you started, belong to somebody else. Do not stage them, do
   not revert them, do not "clean them up".
3. **Never stage broader than the files you edited.** `git add backend/src`
   is how another session's work — or an unrelated stray file — rides into
   your commit. Name the paths. Arc 23's broad add swept in an empty file and
   came within one directory of taking uncommitted work with it.

4. **THE INDEX IS SHARED STATE. Stage by explicit pathspec, late, never early.**
   `git add` writes to `.git/index`, and there is one index per repository, not
   one per session. Anything you stage is staged for the other session too, and
   their next bare `git commit` takes it.

   Arc 26 staged twelve files and paused to re-run the version guard. In that
   gap the concurrent session committed, and all twelve rode into a commit
   titled *"fix(auth): logout actually revokes the session"* — describing none
   of them. They reset it back out correctly and nothing was lost, but the
   window is the defect, and it is not small: any pause between `git add` and
   `git commit` is a window.

   So: **`git commit -F msg -- path1 path2 …`**, which stages and commits as one
   act. A brand-new file still needs `git add` first, because a pathspec commit
   only matches paths git already knows — do that immediately before the commit,
   never as a separate step earlier in the arc.

   Corollary for the version-letter guard: it reads the UNSTAGED diff, so
   running it after staging your own bump makes it report your own letter as
   claimed. Run it before you stage, and read the file list when it fires —
   Arc 26's `auj` collision was real (the other session's `schema.prisma`) and
   was very nearly dismissed because part of the same signal was self-inflicted.

**If a file you need is being edited by another session, it is theirs.** Do
not race it. Arc 23 needed `schema.prisma` for a hold branch while another
session had it open; the schema change went to `_pending_migrations/` instead
and lost nothing, because that work was going to be held anyway. When their
work has landed, restore YOUR file from `HEAD` and replay only their hunk —
after verifying it verbatim in the tree first. Never the blanket checkout.

**Audit reports must be named `audit-*.md` or they are not ignored.** The
pattern in `.gitignore` is `docs/audit-reports/audit-*.md`. A report filed as
`<subject>-audit.md` matches nothing, shows up untracked, and is then exactly
the kind of file the shared-index rule above says gets swept into another
session's commit. Check with `git check-ignore -v <path>` before writing.

**Untracked files are not branch-scoped.** `git branch -D` leaves behind any
directory the branch created. Arc 23 abandoned a hold branch and left a
destructive migration sitting untracked in `prisma/migrations/` — the
SCHEDULED directory — where one `git add -A` would have applied it. After
abandoning a branch, read `git status` for what the deletion did not take.

**HELD WORK LIVES ON A BRANCH, NEVER ON `main` (hard rule, added 2026-08-20).**

Any commit whose release conditions are not yet met — a migration waiting on a
verification step, a change waiting on a secret, anything a human still has to
approve — goes on a branch named `hold/<what-it-is-waiting-for>`. **Merging is
the release act.** Nothing else.

The rule exists because the alternative was tried and failed. A column-drop
migration was committed to `main` as the unpushed tip, with a note saying not to
push it. That worked exactly as long as nobody committed on top of it. Two
commits later it was no longer the tip, `git push` carried it along, Render
auto-deployed, and the columns were dropped from production without the
row-count verification the migration's own header required. Full account at
§13.3 Item 212.

**A commit held back by position is not held back.** Position is not a
mechanism: it depends on every future session noticing an ordering constraint
that nothing enforces, and it fails silently and completely the first time one
does not. A branch cannot be pushed by accident, because pushing `main` does not
push it.

Corollaries worth stating, since each was a step in that failure:

- **Re-read `git log origin/main..HEAD` immediately before every push.** If it
  contains anything you did not intend to release, stop. This is cheap and it is
  the last point at which the mistake above was catchable.
- **A CI poll must target YOUR commit SHA, never "latest run on main".** With two
  sessions pushing, the newest run belongs to whoever pushed last. In the v3.8.awl
  arc the poll returned `d6ba6233 completed success` — a different session's
  commit — while `2efdff12` was still in flight. Reporting that would have been
  citing someone else's green as your own. Resolve the run by SHA
  (`gh run list --json headSha,conclusion,databaseId` and match), then read the
  job list from that run id. Same failure family as §19 Sub-pattern 16: the check
  ran, and it was not watching what its name implied.

  **Do NOT reach for `gh run list --commit <sha>`.** It is the obvious shortcut
  for exactly this rule and it **returns `[]` silently** for a run that exists —
  no error, no warning, indistinguishable from "CI has not started". In the
  v3.8.awo arc it returned empty twice, minutes apart, while run `33425243512`
  was in progress and plainly visible in `gh run list` with that `headSha`. An
  empty result reads as "not started yet", and the natural next move is to fall
  back to the latest run on main — which is the precise failure this rule exists
  to prevent. **`--json headSha` with an explicit match is the only method that
  has been observed to work.**
- **`/api/health` does not tell you whether a migration landed.** `migrate deploy`
  runs during the BUILD while the previous process keeps serving, so the SHA can
  report the old commit while the schema has already changed. Read the `schema`
  field (v3.8.atj) or `_prisma_migrations` directly.
- **A destructive migration's own verification gate runs BEFORE the push**, not
  after. Once it has applied, the question the gate answers is unanswerable
  except through PITR.

**Schema mutation paths:**

1. **CANONICAL — author migration in feature branch:**

   ```powershell
   cd backend
   npm run prisma:migrate -- --name <descriptive_name>
   ```

   **Use the npm script, not the raw `prisma` command.** Every schema-touching
   script routes through `backend/scripts/prisma-target-guard.ts` first, which
   resolves the URL the CLI will actually use and refuses any non-local host
   unless `PRISMA_TARGET=production` is set on that one invocation.

   **The trap it exists to close (2026-08-31):** `migrate` and `db push` read
   **`directUrl`** (`schema.prisma:27`), not `url`. Exporting only
   `DATABASE_URL` points the runtime at localhost while every migrate command
   still reaches production through `DIRECT_URL` — and the shell looks local to
   whoever typed it. The only tell is one substring in the hostname: no
   `-pooler` means it is the direct Neon endpoint, not the pooled one.

   **THE PRODUCTION RAIL (v3.8.axy). `backend/.env` resolves to the LOCAL
   container and nothing else.** The production `DATABASE_URL` and `DIRECT_URL`
   live only in **`backend/.env.production.local`**, which is gitignored
   (`.gitignore:14`) and which nothing loads automatically — Prisma reads
   `.env`, never `.env.*.local`. So a raw `npx prisma migrate deploy` typed by
   a human now reaches the local container **by construction** rather than
   because they remembered a rule.

   That rule was not enough: a migration reached production from a local shell
   at 15:11:07 on 2026-09-01 because `.env` held the production pair and the
   raw command bypassed the guard entirely (§13.3 Item 252).

   **Reaching production is now two named commands**, both of which run the
   target guard against the environment they have already built:

   ```powershell
   npm run prisma:status:production   # read-only
   npm run prisma:deploy:production   # applies pending migrations
   ```

   The guard also refuses when `.env` and `.env.production.local` resolve to the
   same non-local host — the one way the separation can be silently undone, by
   pasting the production URL back into `.env`.

   **`psql`, GUI clients and any script that carries its own connection string
   remain OUTSIDE the guard, and always were.** What changed is that they can no
   longer pick production up from `backend/.env`; the credentials are only in
   `.env.production.local`. A human who copies that string into `psql` is making
   a deliberate choice, which is the most the rail can offer.

   Note the Render build chain calls `npx prisma migrate deploy` directly and is
   deliberately unaffected — deploying to production is that command's job. The
   guard protects a human at a terminal.

   **The seed is deliberately NOT routed through it, and must not be.**
   `package.json#prisma.seed` is the plain `npx ts-node prisma/seed.ts`, because
   `prisma db seed` does **not** run its command through a shell: a
   `guard && seed` chain is tokenised, the guard receives `&&` as an argument,
   exits 0, and Prisma reports success while the seed never runs. That shipped
   once and took the whole E2E suite down with a 404 three layers away — §19
   Sub-pattern 16, ninth fire. The seed does not need it: `prisma/seed.ts` calls
   its own `assertNotProduction()` before the TRUNCATE, fails closed on an
   absent `DATABASE_URL`, and cannot be defeated by how it is invoked.

   Migration auto-applies to local DB + creates migration file at `prisma/migrations/<timestamp>_<name>/`. Commit migration file alongside `schema.prisma` changes. Render auto-deploys main branch → `migrate deploy` applies the migration in build chain.

2. **EMERGENCY OVERRIDE — incident response only** → `docs/claude/deploy-and-schema.md`.

3. **NEVER — `prisma db push` against production.**

   Was used historically for v3.8.aa-dd schema work; resolved in Sprint 44b via baseline reset (single init migration captures full prod state as of 2026-05-09). Going forward this path is **deprecated for production**. `db push` is acceptable for the CI test DB (fresh per run, no migration history needed) — see `.github/workflows/ci.yml`.

**Local development, read-only verification commands, and the Sprint 44b baseline reset** (plus the
pre-44b state, retained for context) → `docs/claude/deploy-and-schema.md`.

### §2.5 — Output protocol (token discipline; binding on every arc)

**Every halt ends with a HALT CARD** — one fenced block, ≤15 lines, nothing printed after it:
```
HALT <arc> @ <sha> | pushed y/n
COMMITS: <sha> <letter> <subject>            — one line per commit
GATES: btsc N | test P/F | ftsc N | build ok/fail | e2e ok/deferred
INJECTIONS: N run, N red as expected
FINDINGS: <=3 lines
OPEN: numbered decisions, one line each
DETAIL: scratchpad/arc-handoff.md
```
- **Gate output goes to `.logs/<gate>.log`** — the `.log` extension is load-bearing: `.gitignore:26` `*.log` ignores it at any depth, but `.logs/` is NOT itself a pattern, so `.logs/notes.txt` would be swept into another session's commit (§2.2). Verify with `git check-ignore -v` before first use. Print only counts and failing test names; run vitest with `--reporter=dot`.
- **Searches and subagent returns carry counts and file lists, never match bodies** — unless a body IS the finding. Subagent returns ≤20 lines; mechanical scans pass `model: haiku` explicitly.
- **Compact at every halt. Start a fresh session at each arc boundary.**
- **The HALT CARD format is defined HERE, in §2.5.** It is the block above; nothing else defines it.
- **FRONTEND DEPLOY VERIFICATION IS `node frontend/scripts/check-pages-deploy.mjs <sha>`, NEVER an Actions job name.** Cloudflare Pages builds outside GitHub Actions, so no Actions job — green, red, or absent — is evidence about what Cloudflare served; citing one is §19 Sub-pattern 16, a check that ran without watching the thing its name implied. The check reads `/build-info.json`, which `frontend/scripts/stamp-build.mjs` writes into the export as a `postbuild` step, and compares the SERVED commit to the pushed one. Exit 0 means a browser receives that commit. Its failure codes are distinct because the remedies are (1 late/failed/never-triggered · 2 no marker at all · 3 something else is answering · 4 the check could not run), and it never exits 0 on "could not tell". It does NOT read Cloudflare's API: the API reports what Cloudflare RECORDED, this reports what a browser RECEIVES, and only the second is what a halt card claims. `backend/__tests__/unit/ci/pagesDeployCheck.test.ts` keeps the two halves wired and agreeing.
- **Render remains the backend's deploy path and is unaffected by the above** — it is hook-driven from CI (§13.3 Items 251, 257), so the backend's deploy IS an Actions job. The two deploy targets are verified differently because they deploy differently.

---

### §2.6 — Usage budget (added 2026-09-22). What a session SPENDS — binding like the rest of §2, and deliberately not §19: that library catches defects, this governs spend, and a session that runs out of context mid-arc loses the arc.

- **Halt reports: 15 lines max in chat** — status, gate pass/fail counts, a findings table, open questions. Detail goes to a scratchpad file, cited by path. **Never paste full gate or scanner output** into a report.
- **Cite `file:line`. Do not quote code blocks in reports.** A reader who wants the code can open it; a reader who wants the conclusion should not have to scroll past the code to reach it.
- **Read a file once per block. Grep with line ranges before opening whole files.** This is the other half of the delegation rule below: that rule sends search to a subagent and keeps judgment on the main path, and reading a file to understand it IS judgment — so it lands on the expensive path by default, and nothing else says to do it economically.
- **Mechanical work goes to a subagent on the cheapest capable model** — grep, enumerate, count, run scanners, run matrices. Judgment stays on the main path. The main path decides what a finding means; it does not have to be the thing that counted the rows. **Suspended 2026-09-23 on this file’s own size; REVIVED the same day on the probe the suspension named.** The condition was that the core load under 200,000 tokens. Core on `main` measured **1,197 lines / ~32,261 est. tokens** when the probe ran, and the test was re-run from a session rooted at a fresh clone of merged main: a **haiku subagent STARTED and returned 1197 — 59,195 tokens, 2 tool calls, ~12.5s**, against 646,443 for the same trivial task on the next model up (ratio ~1:10.9). Five earlier attempts all died before their first tool call with `Prompt is too long`: ~458,654 pre-slim, ~458,140, ~458,159, and ~459,791 / ~458,635 from a stale project root — the last two are why the probe must be rooted on a checkout OF merged main, not merely on a repository that contains it. The rule returns unchanged.
- **Compact at every halt. Each block starts from its handoff file, not from prior context.** A block that cannot be resumed from its handoff file has an incomplete handoff file, and that is the defect to fix.
- **The full gate stack runs at a block's tip only.** Intermediate commits get backend `tsc` + `npm test`. Running the whole stack on every commit of a ten-commit block spends the budget re-proving what the tip proves once.
- **Adversarial matrix: only the injections the directive names, plus one per new guard.** The second half is a FLOOR, not a ceiling — it is the one clause here that mandates work rather than bounding it, which is why it is not folded into the budget rule above. §19 Sub-pattern 16's recurring shape is a guard that was green and blind, and running the injection is the only thing that tells a guard that works from a guard that merely runs.
- **No polling, no standing watches, no re-checks on idle notices. Act on explicit triggers only.** An idle notice is not a trigger; a message, a user turn, or a named completion is.
- **One guard run per commit unless it fires.** Deliberately its own line rather than part of the gate-stack rule above, because that rule does not reach the guards this one is mostly about: `npm test` is `vitest run`, so `verify:rc` and `verify:bol` (which chains three more) sit outside it entirely — and those are the slow ones, where re-running a green guard actually costs something.
- **`npm test` runs at `--maxWorkers=2` by default — but the rerun protocol is the half that carries it.** Item 300, FIVE occurrences: tinypool dies with `ERR_IPC_CHANNEL_CLOSED` and **no result**, which is a crash and not a test failure — reading it as one is how a green suite gets called red. The fifth fire landed AT `--maxWorkers=2`, so treat the setting as a default, never as a cure. On that crash rerun ONCE and log both runs; a second failure halts rather than being re-run again.

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
- **Docs-only commits ship unversioned.** Letter bump fires on commits that change user-visible state (frontend, backend API, migrations, deploy artifacts). Does NOT fire on commits that only change developer-facing context (CLAUDE.md, MEMORY.md, READMEs, session handoffs, `docs/`). Confirmed at v3.7.j sign-off and reaffirmed at v3.8.e.2 docs catch-up.

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
- Pre-commit: `npx tsc --noEmit` from `backend/` + `npm test` from `backend/` + `npx next build` from `frontend/` must all pass clean. `npm test` added to the canonical gate at v3.8.alh after ald/alf/alg shipped with CI red because tsc was green but vitest was not — Sub-pattern 11 third fire. CI runs `npm test` on every push; local gate must mirror.
- **AND `npm run verify:rc` from `backend/`, on any commit that touches the Rate
  Confirmation or the shared chrome it draws with.** The fit matrix renders
  fifteen fixtures and asserts page count, footer clearance, required and
  forbidden text, that the line haul is on the page at all, and that SRL's
  customer rate is not. It is a script rather than a vitest file because it
  needs pdfjs and takes seconds per fixture, so it does not belong in the unit
  run — but it was therefore also not in ANY gate, and it sat red for fifteen
  of fifteen cases for an entire arc while nobody was obliged to look. A gate
  nobody runs is a gate that is off. Now it has a name and a place in this list.
- **AND `npm run verify:bol` from `backend/`, on any commit that touches the
  Bill of Lading or the shared chrome it draws with.** Three gates behind one
  name: the fit matrix (six line-item shapes, one page each, terms strip below
  content, content above the footer rule), the one-page smoke, and the anchor
  parity gate.

  **The anchor gate exists because a render pin cannot answer the question the
  BOL migration asks.** Moving the BOL onto shared chrome moves its pin by
  construction on nearly every commit, and a moved pin proves only that
  something changed. Acceptance is PARITY, so the gate measures it: body
  anchors must hold to pixel-verified v2.9 canon, while letterhead anchors are
  expected to move once to the operational register and are reported rather
  than enforced. Re-capture deliberately with `--capture`, and say in the commit
  what moved and why.

  Same reasoning as `verify:rc` above, and the same history: these two BOL
  gates existed for months wired to nothing — no npm script, no CI job — so
  they ran only when somebody remembered. A gate nobody runs is a gate that is
  off.
- **AND `npm run test:e2e:local` from the repo root, on any commit that changes a
  contract E2E exercises** — an endpoint's request or response shape, an
  agreement version, a compliance verdict, an auth or signing path. Added
  2026-09-02 after a factual count: **4 of the last 20 CI runs on `main` were
  red, and 3 of those 4 were E2E** — the one job the gate above never ran.
  Backend, frontend and deploy were green on all three. That is not bad luck;
  it is a gate that omits the only job exercising the full wire (real HTTP, real
  database, real contracts between services), so a contract change lands red
  *after* push by construction. The runner already existed (`a63876d4`, "the
  suite that kept going red is now runnable before the push") and was not being
  used. It costs ~1.5 minutes and it is not optional. Sub-pattern 11, fourth
  operational context.

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

### §3.13 Address / legal-identity verification

Never trust session memory or prior docs for legal-notice-critical identity fields (principal address, MC#, DOT#, bond surety). Verify against FMCSA SAFER, incorporation docs, or bond paperwork before asserting canonical. A session-memory error in this category propagated a wrong city into CLAUDE.md commit `57eb145`; v3.7.i corrected it. Lesson: legal identity fields need primary-source verification, not chat-memory synthesis.

---

## §4 HONEST CLAIMS WHITELIST (authoritative)

The 15 claims that may appear on public marketing pages → `docs/claude/brand-and-claims.md`.

---

## §5 PROHIBITED CLAIMS (must not appear on marketing pages)

What must never be claimed, **and the canonical detention / TONU / layover ladder**, which is filed
inside it → `docs/claude/brand-and-claims.md`.

---

## §6 HONEST HOURS COPY (authoritative)

The exact operating-coverage wording → `docs/claude/brand-and-claims.md`.

---

## §7 PROGRAM NAME CONVENTION (enforce strictly)

"Caravan Partner Program" / "CPP", and the retired variants → `docs/claude/brand-and-claims.md`.

---

## §8 v3 QUICK PAY PRICING (LOCKED)

The locked fee/terms ladder and the pilot note → `docs/claude/pricing-tiers-quickpay.md`. **Do not
quote these figures from memory** — they are cited verbatim by the RC terms grid and by §21.

---

## §9 COMPASS SCORE (7-factor, published on /carriers)

The 7 factors and their weights, and which are actually measured → `docs/claude/pricing-tiers-quickpay.md`.

---

## §10 TIER ADVANCEMENT GATES (locked launch model, v3.8.aii + v3.8.aij)

The single authoritative advancement gate, and the criteria that were retired →
`docs/claude/pricing-tiers-quickpay.md`.

---

## §11 PHASES SHIPPED (chronological, all on main)

Moved → `docs/claude/archive/phases-shipped.md`. 168 chronological rows of shipped work plus the §11
architectural finding on `sanitizeInput` input-time escaping. A log, not a rule — read it to find out
when something shipped, or what a version letter refers to.

---

## §12 EXEMPT SURFACES (internal tools — different rules)

Where the marketing-claim rules do not apply → `docs/claude/brand-and-claims.md`.

---

## §13 DEFERRED POLISH / CLEANUP QUEUE (non-blocking)

Sequenced backlog. Ordering is deliberate: items earlier in the list should be done before items later.

### §13.1 Active state

Phase 6.2 closed at v3.8.ee (Lead Hunter / CRM separation). No active sprint. Phase 6.3 awaiting scoping.

### §13.2 Pre-Phase-6.2 housekeeping

Should complete before next sprint kickoff:

1. **Migration script run against prod** — `backend/scripts/decode-encoded-load-fields.ts`. Idempotent, multi-pass-safe. Walks 19 fields on loads table, decodes pre-v3.8.d.2 encoded values in place. Run once and confirmed clean (4 loads decoded incl. one 6-times-encoded outlier) on 2026-04-29; **rerun if any pre-v3.8.d.2 data is still suspected** in surfaces beyond the loads table.

2. ~~**Phase 5E.c — T&T source-of-truth scoping decision**~~ — **CLOSED 2026-04-30** at "current-state documented; future-state explicitly deferred with named triggers" level. See [`docs/architecture/track-and-trace-source-of-truth.md`](docs/architecture/track-and-trace-source-of-truth.md) v1.0. Documents canonical source (`Load.trackingEvents[]`), write paths, auth boundaries, PII scope on public /tracking, display granularity vs. industry public-tracker patterns (RXO/Coyote Camp 2 vs. C.H. Robinson Camp 1), 5 deferred future-state decisions with named reopen triggers, 3 risks with mitigations, 4 implicit architectural decisions surfaced for searchability. Phase 5E gaps #1 + #2 already closed via the live `/tracking` page discovered during v3.8.c verification; gap #3 closed by this document. Phase 5E now fully closed.

### §13.3 Phase 6.2 sprint candidates

Moved → `docs/claude/backlog-open.md` (168 items) and `docs/claude/archive/backlog-records.md` (93
closed). 261 items, 52% of this file before the move; cited 599 times across the codebase, so the label
stays here. The split is by *positive evidence of closure* — struck title, or `CLOSED`/`SUPERSEDED` in the
opening — and everything else stayed open, so `backlog-open.md` is deliberately over-inclusive. A record
sitting in the open file is visible clutter; a pending task filed as history is lost silently.

**Read `backlog-open.md` before proposing work** — §19 Sub-pattern 15 exists because a stale "NOT built"
claim is read exactly when somebody is deciding whether to build something, and commissions duplicate work.

---

## §14 LEGAL / COMPLIANCE STATUS

→ `docs/claude/legal-and-compliance.md`. Broker status and Carmack, the BMC-84 bond, Michigan law and
venue, the Broker-Carrier and Caravan Quick Pay agreements, agreement termination and the mid-load
policy, the carrier-archive ruling, **the nine absolutes and "an override releases a judgment call,
never a fact"**, fail-toward-not-paying, the ratified-vs-implemented ledger, and the public /track PII
scope.

---

## §14.1 SANDBOX TRAPS (this environment; each cost real time before it was recognised)

These are not defects in the codebase. Each one produced a **plausible-looking failure of the thing under test**, which is what makes them expensive: the natural response is to debug the fix rather than the harness. Banked Arc 28 after all three fired in one arc.

- **`pkill` silently does nothing here.** Three consecutive "restarts" of a local server all reported success and all left the original process running, so several rounds of diagnosis were spent on a stale build. **Kill by PID** (`netstat -ano | grep :PORT` → `taskkill /F /PID`), and **verify freshness from the artifact** — `/api/health` reports `bootedAt`, which is what finally exposed it. A restart you did not confirm is a restart that did not happen.
- **`NODE_ENV=production` locally demands TLS the container does not offer.** Prisma refuses a plain Postgres connection and every query throws `error performing TLS handshake`, which surfaces as a 500 from whatever handler ran first. Append `?sslmode=disable` when running a production-config build against a local container.
- **`prisma generate` picks up a concurrent session's schema.** A migration committed by another session between the container being created and the client being generated leaves the client asking for a column the container lacks — here, `users.googleSub` — and the resulting error names *your* handler. Re-run `prisma migrate deploy` against the rehearsal container after any pull or any concurrent-session commit.

- **A FRESH WORKTREE HAS NO `backend/.env`, and the suite fails to COLLECT rather than to assert.** `.env` is gitignored, so `git worktree add` never produces one. Any module that validates env at import time — `src/config/env.ts`, reached through `src/routes/ssoAuth.ts` — then throws during collection, and vitest reports a **failed SUITE with zero failed tests**, naming a file the arc never touched. Measured 2026-09-24: `ssoSessionRow.test.ts` failed to collect in a fresh worktree and passed **11/11** the moment CI's four values were supplied. **The four are in `.github/workflows/ci.yml`'s backend job** (`DATABASE_URL`, `DIRECT_URL`, `JWT_SECRET`, `ENCRYPTION_KEY`) — copy them from there rather than from a real `.env`, which on this machine is the local-container rail (§2.2) and is not yours to duplicate into a second tree. CI is unaffected because it sets them; the main checkout is unaffected because it has an `.env`. **So this fires only in the fresh worktree an arc is told to create, which is exactly when nobody has a baseline to compare against.**

**The shared lesson:** when a probe fails, the first question is whether the probe is sound, not whether the code is. Two of the three above looked exactly like the feature being fixed was still broken.

## §15 TOOL PREFERENCES (this Claude Code environment)

- **`bash grep` is reliable; the Grep tool has a known quirk on `/tmp` paths** — use `bash grep` for verification via the Bash tool. Lesson origin: v3.7.d smoke test, Grep tool returned zero matches while `bash grep` found the hits.
- **Rendered-output verification requires deployed URL** (not local file reads) — smoke tests use `curl` on `silkroutelogistics.ai`, not local file reads. Cloudflare Pages takes ~2–3 min to deploy after push; use a single background Bash task with `sleep 180` + `curl` + `grep` chain.
- **Visual confirmation requires the user** — no headless browser available. Claude Code can verify HTML structure + deployed content via curl/grep, but pixel-level checks require screenshots from the user.
- **VS Code Claude Code extension** is the primary surface; commits via bash `git` in the integrated terminal.
- **Shell working directory persists** between Bash calls (e.g. `cd backend` sticks). Use absolute paths (`git -C "c:/Users/..."`) or explicit `cd` at the start of each command if the state matters.
- **Exit code 1 from `grep -c` returning zero matches** — this is expected and healthy (grep conventions). If a background Bash ends with a regression-grep that returns zero prohibited-string hits, the whole pipeline "fails" with exit 1 even though the result is a PASS. Read the output, not just the status.
- **`LogSeverity` enum uses `WARNING`, not `WARN`** — non-standard naming. Caught during v3.8.e.1 build (TS2322 error: `'WARN' is not assignable to LogSeverity`). Most observability platforms (Datadog, Sentry, Pino, Winston) use `WARN`. If logging infrastructure is migrated, the enum mismatch will resurface — worth normalizing during any logging refactor. Today: always write `WARNING` when constructing SystemLog records.

---

## §16 FIRST-CARRIER ONBOARDING BLOCKERS (pre-launch, must resolve before first carrier signs)

→ `docs/claude/launch-blockers.md`. Counsel review of the Broker-Carrier and Caravan Quick Pay
agreements, DAT activation, insurance verification, and the compliance@ monitoring cadence.

---

## §17 SECURITY GATE VERIFICATION METHODOLOGY

→ `docs/claude/security-gates.md`. When it applies, the two permanent test fixtures, and the smoke
procedure for proving a gate actually fires.

---

## §18 LEAD HUNTER STANDING RULES

Moved → `docs/claude/outreach.md`. Every subsection below, titled as it read before the move. **§18.3 and
§18.9 bind more than outreach** — read the brand skill from disk at the moment of any claim, and run the
AI-tell audit, on any SRL-facing copy including manually drafted email.

- **§18.1 Audit-first** · `docs/claude/outreach.md`
- **§18.2 Atomic commits per bug** · `docs/claude/outreach.md`
- **§18.3 Brand skill at moment-of-claim** · `docs/claude/outreach.md`
- **§18.4 Apollo CSV columns are literal** · `docs/claude/outreach.md`
- **§18.5 Version verification against §13.3** · `docs/claude/outreach.md`
- **§18.6 Ship-default on mechanical halts** · `docs/claude/outreach.md`
- **§18.7 Cold-outreach data flow is import-time validated** · `docs/claude/outreach.md`
- **§18.8 Honest-framing rule** · `docs/claude/outreach.md`
- **§18.9 — Outreach copy AI-tell audit (mandatory pre-send)** · `docs/claude/outreach.md`

---

## §19 METHODOLOGY LOG

Patterns surfaced cumulatively during sprints. **Consult during Phase A audit before any code change.** Updated each session as new patterns emerge. Quarterly review prunes calcified patterns and promotes hot ones.

Each entry: name, sprint of origin (commit hash), trigger conditions, what to do, an example sprint where it caught something.

### Active patterns (as of Sprint 44.5, 2026-05-09)

#### 1. Audit-first methodology (Sprint 1+, ongoing)
- **Trigger:** any code change request.
- **Action:** Phase A audit (read-only) on render path + handlers + cache invalidation BEFORE Phase B implementation.
- **Caught in:** every session. Memory #11 fired 16x in the Sprint 22-37 session alone — assumed knowledge of code paths is wrong; verify before assuming.

#### 2. Path β methodology (Sprint 32, v3.8.aak)
- **Trigger:** opaque API failure with silent or generic error.
- **Action:** 3-sprint cadence:
  - Sprint N: ship error UI (observability layer)
  - Sprint N+1: widen extractor (diagnostics layer)
  - Sprint N+2: targeted root-cause fix
  - Each sprint atomic per §3.3.
- **Caught in:** Sprints 32-35 RC modal revival cycle. Sprint 32 added error UI; Sprint 33 widened extractor to surface "formData.X" details; Sprint 34 fixed `quickPayFeePercent` string-vs-number; Sprint 35 fixed `fuelSurchargeType` enum drift.

#### 3. Phase A0 contract audit (Sprint 36, v3.8.aao)
- **Trigger:** fix touches a feature whose end-to-end behavior crosses multiple surfaces and code paths.
- **Action:** contract audit before surface audit. Inventory: endpoints, state machine, data model relations, frontend consumption sites, cache invalidation contracts, notification fire matrix, edge cases.
- **Output:** determines atomic-commit shape (single-surface vs bundled cross-surface vs multi-sprint sequence).
- **Caught in:** Sprint 36 tender acceptance — surfaced 7 gaps before any single-surface fix shipped. Cluster of 6 (Items 51-56) shipped across Sprints 38+39 as a deliberate sequence rather than firefighting one symptom at a time.

#### 4. Phase A2 picker-FK contract audit (Sprint 36b, v3.8.aap)
- **Trigger:** UI picker returns an ID that's used as a backend FK.
- **Action:** audit must include — which backend FK that ID resolves against, what state filters apply at that backend, what ID type the picker source returns, what eligibility predicate downstream consumers enforce. Picker-as-metadata vs picker-as-FK distinction determines audit depth.
- **Caught in:** Sprint 36b — Tender modal picker had wrong ID semantics (sent `User.id` while backend FK expected `CarrierProfile.id`) AND a permissive carrier list (`/api/carrier/all` returned all approved + non-approved).

#### 5. E2E lifecycle gate + local-first discipline (Sprint 37, v3.8.aaq)
- **Trigger:** per-sprint audit-first methodology hits a ceiling (Memory #11 firing repeatedly across consecutive sessions).
- **Action:** ship a single E2E lifecycle test that retires the regression-class structurally. Each subsequent sprint validated by green CI before deploy. **Local-first discipline: run E2E locally (~30s) before push (~5min via CI).**
- **Caught in:** Sprint 38 seed `mcNumber` false-positive surfaced in <30s locally — would have shipped silently without the smoke. Sprint 39 B6.5a smoke locked Item 54 on-behalf flow before push.

#### 6. Cross-sprint precedent audit (Sprint 39, v3.8.aas)
- **Trigger:** sprint introduces or modifies behavior on a code path that prior sprints have already touched.
- **Action:** Phase A audit must explicitly check the prior sprints' wiring on the same path. Inconsistency between adjacent sprints (e.g., Sprint N fires X, Sprint N+1 doesn't fire X on same path) is silent drift unless surfaced explicitly.
- **Caught in:** Sprint 39 — Sprint 38 fired tracking-link fan-out at BOOKED on direct path; Sprint 39's on-behalf endpoint default would NOT have fired it, codifying drift. Resolved via α decision (on-behalf matches Sprint 38 normal direct, fires fan-out at BOOKED). Pattern fired again Sprint 40 (role gate ADMIN vs ADMIN+CEO discrepancy). Two-fire validation, not premature capture.

##### Pattern 6 sub-rules (canonicalized Sprint 44.5)

Pattern 6 has three named sub-rules established through prospective validation:

###### Sub-rule a — Stability green-light (Sprint 43)
- **When all canonical references show no drift since last audit, Pattern 6 contributes a fast green-light gate** rather than detailed per-canonical investigation. Time-bounded check (~30s) vs exhaustive trace.
- **Validated:** Sprint 43 Phase A (5 canonicals stable since Sprint 42 — `SlideDrawer` popstate, `ProspectDrawer` trigger-dep variant, Sprint 36b eligibility filter, whaider/Haider seed fixtures, `/auth/e2e-token` Sprint 37 endpoint).
- **How to apply:** in Phase A, list canonical references the sprint depends on. If a 30-second grep confirms each is unchanged since the last audit, log "Pattern 6 stability green-light" and move to next phase. Save the deep investigation for sprints where a canonical actually moved.

###### Sub-rule b — Spatial sub-mode (Sprint 44a)
- **Pattern 6 fires not just temporally** (cross-sprint, same code path) **but spatially** (cross-document, same point in time). When canonical reference docs disagree at a single moment, the contradiction itself is a lead.
- **Validated:** Sprint 44a Track 1 — `render.yaml` + CLAUDE.md §2.2 vs `.github/workflows/ci.yml:112-116` comment held simultaneous contradictory claims about canonical schema mutation path (`migrate deploy` vs `db push`). Only one could be true; resolving which became the central tiebreaker for Sprint 44b's branch selection (X/Y/Z).
- **How to apply:** when reviewing canonical docs, look for *current-state* contradictions across files in the same domain — not just temporal drift. Two docs that say different things at the same time are evidence that one is wrong; the wrongness is itself the audit finding.

###### Sub-rule c — Audits can be wrong / authoritative-source verification (Sprint 44b — three-fire canonical)
- **Trigger:** an audit finding will inform a prod-touching action.
- **Action:** verify the audit's broader implication against an authoritative source (direct DB query, runtime-codepath grep, CLI flag `--help`, etc.) before the action ships. The audit's narrow finding may be correct in isolation but stale or incomplete in its broader inference.
- **Validated three-fold in single Sprint 44b session** — definitive canonicalization, not premature capture:
  1. **Phase 1 (Sprint 44a Track 1)** — `ProspectVertical` grep against `backend/prisma/migrations/` correctly returned empty. The narrow finding was right. The broader inference *"this is the only drift"* was wrong. Direct `pg_type` + `information_schema` query (CSV of 87 prod enums) revealed actual scope: 81 of 87 enums drifted via `db push`. Authoritative source = the database itself.
  2. **Phase 3 (Item 72)** — Sprint 44b directive's draft buildCommand surface-looked complete; the audit said "this is the canonical." Pre-commit grep on `backend/src/` for `__dirname.*config|src/config/` surfaced runtime read at `email/builder.ts:18` loading `config/signatures/whaider.html` — load-bearing for production email signatures. Authoritative source = the runtime codepath, not the directive's surface.
  3. **Phase 4 (Item 73, hotfix)** — Sprint 44b directive's `--exit-code` flag specification surface-looked complete; flag was inherited from a Prisma 5-era convention. Render production deploy failed with `unknown or unexpected option: --exit-code`. `npx prisma migrate status --help` confirmed v6.19 exposes only `--help / --config / --schema`. Authoritative source = the CLI tool's own help output.
- **Pattern lineage:** audit findings inform prod-touching actions; the action's success requires authoritative-source verification of the broader implication, not just the audit's narrow finding.

###### Sub-rule c named sub-patterns (post-Sprint-44.5 expansion, canonicalized §19 meta-50)

Sub-rule c, originally canonicalized at Sprint 44.5 through three-fire validation lineage (Phase 1 + Phase 3 + Phase 4 across the Sprint 44a/b cluster), has accumulated **9 named sub-patterns across Sprint 45a → Sprint 50 with 17 cumulative prospective fires**. The sub-patterns extend sub-rule c's authoritative-source-verification principle into specific operational contexts: build chain failure modes, file-producing build operations, deferred risk protocols, skill-canonical vs industry-practice reconciliation, hybrid data flow verification, concurrent-sprint coordination, grep audit completeness, conditional render visual gates, and renderer-only sprint pre-push smoke. Together with the root sub-rule c principle they form **10 methodology principles** at maturity.

Naming convention: sub-patterns enumerate 1 → 9 below in chronological origin order. The root authoritative-source-verification principle is the parent canonical (already documented above as sub-rule c definition); the 9 named sub-patterns are derivative specializations.

##### Sub-pattern 1 — Fail-fast-build-chain
- **Origin:** Item 96, Sprint 46 (commit `f695eac`, v3.8.abe)
- **Trigger:** prod deploy chain or CI build chain swallows failures via `|| true`, `--ignore-errors`, or analogous suppressors.
- **Mechanic:** silent-success is worse than loud-failure on prod deploy chains. (a) silent-success normalizes ignoring build log noise; (b) failure modes propagate to runtime where they're harder to diagnose; (c) eventually shipping a "live" service that's missing assets damages user trust. Architectural fix: convert chain from fail-silent to fail-fast — tsc error → npm run build exits non-zero → cp steps don't run → deploy halts with visible failure.
- **Case study:** pre-Sprint-46 backend chain was `npm install (NODE_ENV=production skips devDeps) → (npx tsc || true) (mask errors) → cp steps (succeed unconditionally) → deploy succeeds with broken artifacts`. Sprint 44b email signature template + Sprint 45-RC compass mark placeholder both shipped under fail-silent regime; runtime fallbacks fired without anyone seeing the build-time failure.
- **Prevention value:** catches all future "missing asset at runtime" regressions at build time rather than post-deploy.

##### Sub-pattern 2 — Runtime-path-verification
- **Origin:** Item 99, Sprint 47 (commit `db077d4`, v3.8.abf)
- **Trigger:** sprint touches a file-producing build operation (`cp`, `mv`, `tar`, `cp -r`, asset bundler output path).
- **Mechanic:** for file-producing build operations, "command exited 0" is necessary but NOT sufficient verification — must also verify file landed at expected runtime path. Sub-rule c gate extends: command-success verification + file-path verification.
- **Case study:** Sprint 44b shipped `cp -r src/config dist/backend/src/config` thinking it would copy contents; POSIX `cp -r SRC DEST` when DEST exists nests SRC as CHILD → produced `dist/backend/src/config/config/signatures/whaider.html` (nested), not the expected flat path. Runtime `email/builder.ts:18` got "file not found" warning on every cold start for 6+ days until Sprint 47 surfaced the class via Sprint 45-RC compass placeholder.
- **Prevention value:** catches build-chain silent-write-to-wrong-path class regressions; complements Sub-pattern 1's command-exit-code gate.

##### Sub-pattern 3 — Deferred-but-not-missed
- **Origin:** Item 105, Sprint 47.b (commit `d0c9155`, v3.8.abg)
- **Trigger:** sprint identifies downstream risk it can't empirically validate at commit time (e.g., visual rendering needing production-equivalent deployment, environmental behavior needing live infrastructure).
- **Mechanic:** document the risk + activation criteria + planned hotfix path in the commit message itself. Future sprint has a clear handoff if the risk materializes. The protocol works as designed when (a) Sprint N flags the risk explicitly, (b) Sprint N+1 activates immediately when verification surfaces it.
- **Case study:** Sprint 47 commit message documented the deferred ligature substitution risk verbatim ("if RC PDF renders italic Playfair with ligature artifacts post-Sprint-47, same monkey-patch approach migrates into srl-chrome.ts as a separate hotfix; deferred unless surfaces visually"). When Wasi's visual verification of PDF #4 surfaced the bug as Sprint 47 had predicted, Sprint 47.b activated within a single day per the documented plan.
- **Prevention value:** distinguishes "incomplete sprint that should have shipped fix in-arc" from "sprint that correctly identified risk it couldn't empirically validate." Avoids retrospective blame on properly-deferred work.

##### Sub-pattern 4 — Skill-vs-industry-practice reconciliation
- **Origin:** Item 115, Sprint 48 (commit `22b61a7`, v3.8.abh)
- **Trigger:** skill canonical reference (e.g., `srl-brand-design/scripts/srl_chrome.ts`) contracts diverge from industry practice (e.g., CHR/Coyote/RXO RC body conventions).
- **Mechanic:** skill canonical is authoritative for SKILL CONTRACTS (function signatures, token names, render primitives) but NOT necessarily for industry practice. When the two conflict, reconcile explicitly — don't blindly defer to skill nor abandon skill for industry. Document the reconciliation decision and which case study it covers.
- **Case study:** Sprint 45-RC removed the CARRIER body section from RC PDF per too-purist skill canonical interpretation (`SKILL.md` had no body-section recipe). Industry standard (CHR / Coyote / RXO / Landstar) all surface carrier identity in a body section above signature. Sprint 48 reconciled by restoring CARRIER · ASSIGNED body section with inline rendering, keeping skill chrome library mirror clean.
- **Prevention value:** prevents single-source-of-truth over-application; surfaces that one canonical (skill) doesn't subsume another (industry).

##### Sub-pattern 5 — Audit-both-ends-of-data-flow
- **Origin:** Item 116, Sprint 48.b (commit `10a9999`, v3.8.abi)
- **Trigger:** verifying hybrid data precedence (formData primary, DB fallback, multi-tier fallback chains).
- **Mechanic:** verify BOTH the write side (frontend key names match validator) AND the read side (renderer reads those key names). Audit-first must reach both ends of the data flow; verifying only one end produces structurally-correct surface with silently-broken persistence path.
- **Case study:** Sprint 48 shipped the CARRIER · ASSIGNED body section structurally correct but rendered em-dashes for every field despite AE selecting a carrier. Root cause: 3-key mismatch — RC modal FormState wrote `carrierCompany / carrierMC / carrierDOT`, Zod validator declared `carrierName / carrierMcNumber / carrierDotNumber`. Default `z.object().strip()` silently dropped unknown keys → payload validated empty → renderer fell to em-dash. Sprint 48 Phase A audit verified renderer hybrid precedence (formData primary, Load fallback) but did NOT verify which key names RC modal actually wrote. Half-complete audit.
- **Prevention value:** catches Zod-strip class regressions where validator + frontend FormState drift; complementary to Sub-pattern 7 (grep-regex-completeness) which catches schema name variants.
- **Fires #2 and #3** — validator-vs-handler drift, then the same shape across the CORS boundary — `docs/claude/archive/methodology-fires.md`.

##### Sub-pattern 6 — Concurrent-sprint-coordination
- **Origin:** Item 136, Sprint 49 (commit `0f6f135`, v3.8.abk)
- **Trigger:** prior sprint shipped mid-planning of next sprint (multi-day session arcs where the planning baseline diverges from the deployed state).
- **Mechanic:** re-verify scope against latest production state before Phase B lock — not just static planning baseline. Sub-rule c extension: scope verification against latest production state, not just static planning baseline.
- **Case study:** Sprint 48.c shipped mid-Sprint-49-planning, consuming v3.8.abj. Sprint 49 directive specified `v3.8.abj → v3.8.abk` (incorrect — abj was already consumed). Phase B0 verification caught the version letter drift before commit (corrected to abk → abl post-Sprint-49.b). Also verified MC#/DOT# bug status (still unresolved post-48.c) and signature pre-fill state (live).
- **Prevention value:** catches version-letter drift, status-still-open errors, and dependency-already-shipped misalignments in directives authored before the latest production state.

##### Sub-pattern 7 — Grep-regex-completeness-gate
- **Origin:** Sprint 49 Phase B0 (commit `0f6f135`, v3.8.abk) — methodology pattern banked inline; no §13.3 backlog item per Path α canonical promotion.
- **Trigger:** verifying schema state, code state, or any structural inventory via grep.
- **Mechanic:** search multiple naming variants of the same conceptual field (e.g., `Window` vs `Time` vs `Range` vs `Slot`; `Number` vs `Num` vs `Id` vs `Reference`). When a single regex returns an empty result set, do NOT conclude "field doesn't exist" — try variants before locking the conclusion.
- **Case study:** Sprint 49 Phase A A2 grep on `pickupWindow|deliveryWindow|pickupStart|deliveryStart` returned no matches → audit concluded schema had only date fields + appointmentRequired boolean, no time-window support. Phase B0 audit re-grepped with `pickupTimeStart|pickupTimeEnd|deliveryTimeStart|deliveryTimeEnd` and surfaced the fields at schema lines 1052-1056. Schema DOES support time windows; the grep regex was incomplete on field naming variants.
- **Prevention value:** prevents "field doesn't exist" false negatives that cascade into unnecessary schema migration scoping or incorrect deferral logic.

##### Sub-pattern 8 — Conditional-render-visual-verification
- **Origin:** Item 139, Sprint 49.b (commit `723b244`, v3.8.abl)
- **Trigger:** sprint adds conditional render paths (`if (data) { render with data } else { render empty }`) where the conditional branch wasn't visually verified with populated data before commit.
- **Mechanic:** when adding a conditional render path, visual verification with the actual conditional case populated is required. Code-side review can confirm syntax + types but cannot confirm visual layout (overlap, alignment, line wrap, page break interaction). The math may look plausible until rendered output proves otherwise.
- **Case study:** Sprint 48.c placed pre-filled signature value at `fieldY+4` while label sits at `fieldY`; 6.5pt label extends ~6.5pt down and 8.5pt value starting at +4 produced ~2.5pt visible overlap on every pre-filled row. Pattern only became visible when actual carrier data arrived through Sprint 48.b → Sprint 49 flow. Sprint 49.b ratified 22→26pt row spacing + value Y +4→+10 + underline Y +14→+20 + block height 180→210pt.
- **Prevention value:** catches visual-layout class regressions invisible to type-system and code review; pairs with Sub-pattern 9 (text-extraction-pre-push-smoke) for pre-deploy assertion coverage.
- **Refinement:** see Sub-pattern 8.a (Layout-constraint-verification) in meta-51 expansion — addresses the case where new conditional content fits the rendered element but overflows the layout slot allocated to it.

##### Sub-pattern 9 — Text-extraction-pre-push-smoke
- **Origin:** Sprint 50 Phase B1 (commit `70cf791`, v3.8.abm) — methodology pattern banked inline; no §13.3 backlog item per Path α canonical promotion.
- **Trigger:** renderer-only sprint where visual layout can't be eyeballed in-environment (CLI-driven, headless, agent-mediated).
- **Mechanic:** generate sample output (PDF, image, HTML) and run text-extraction assertions on content + key phrases + page count before push. Visual layout verification still requires human eyes post-deploy, but content + structural assertions catch the cheap class (missing clauses, regex mismatches, page overflow) at commit time.
- **Case study:** Sprint 50 added a 10-clause T&C body to the RC PDF page 2. Pre-push pdf-parse smoke verified all 10 clauses present, key phrases ("fullest extent permitted by law", "30 minutes before beginning", "24-48 hours", `operations@`, `accounting@`, `· notify` suffix), and 2-page total preserved. 25/27 assertions passed; 2 false negatives confirmed via inspection script were pdf-parse line-wrap artifacts (`"freight \ncharges"`, `"hours of \ndelivery"`) — content intact, smoke pattern flagged for whitespace tolerance in future iterations.
- **Prevention value:** catches missing-content, key-phrase-typo, and page-count-overflow regressions at commit time for renderer-only sprints; cheaper than full E2E lifecycle smoke; complementary to Sub-pattern 8's visual-layout gate.

Cumulative fire registry (Sprint 44a — Sprint 50) → `docs/claude/archive/methodology-fires.md`.

###### Sub-rule c second canonical expansion (post-Sprint-51.f, canonicalized §19 meta-51)

Sprint 47 → Sprint 51.f shipped an extended RC PDF + RC modal arc — 17 atomic commits across 9 hotfix iterations, all closing methodology gaps with zero rollbacks. The arc surfaced 5 new sub-patterns + 1 refinement to sub-pattern 8 + the methodology library's first ratification-layer sub-pattern. Sub-rule c surface now spans **14 canonical sub-patterns + 8.a refinement across 2 methodology layers** (execution + ratification), with **25 cumulative prospective fires**. Three methodologically distinct contributions: (a) introduction of the ratification layer (sub-pattern 13), (b) three-fire validation lineage parallel to sub-rule c root's Sprint 44.5 canonical promotion, (c) decision-tree reference table for sprint Phase A quick-lookup.

###### Sub-pattern methodology layers (meta-51 introduces)

Sub-patterns 1-9 + 8.a + 10, 11, 12, 14 operate at the **EXECUTION LAYER** — gates applied by Claude Code during Phase B execution after Phase A audit findings are surfaced. These sub-patterns catch errors at code write time, build time, or pre-push time.

Sub-pattern 13 (literal-vs-intent ratification) is the first methodology principle operating at the **RATIFICATION LAYER** — gates applied chat-side before a Phase B directive ships. The user's Q-ratifications lock Phase B scope; ratification-layer sub-patterns guard the framing of those Q-questions so the locked scope matches the user's actual operational intent (not just one of N technically-valid interpretations).

Layer attribution determines WHEN the sub-pattern fires in the sprint lifecycle:
- **Execution layer:** between Phase A surface and Phase B push
- **Ratification layer:** between Phase A surface and directive draft

Future sub-patterns banked into §19 must explicitly attribute layer so the methodology library's operational scope stays well-defined.

##### Sub-pattern 10 — Hydration-effect-dep-array-audit
- **Origin:** Item 147, Sprint 51.b (commit `6350918`, v3.8.abp)
- **Layer:** Execution
- **Trigger:** useEffect that syncs server→local state with form/edit-state values in the dependency array.
- **Mechanic:** ref-based reads for in-effect access to current state without triggering re-fire. Sub-pattern 10 prescribes: form/edit-state values must NOT be in the dependency array; use `useRef` to capture current value for read-only access inside the effect body. The hydration effect should fire on initial mount or server-state arrival only — not on every user keystroke.
- **Case study:** Sprint 51.b QP Override reason field overwrite bug. The hydration useEffect at `QuickPayOverridePanel.tsx:86-97` had `appliedPct` in its dependency array; user keystrokes in the applied-rate input triggered the effect to re-fire, and the `if (existing) {...}` branch overwrote user's reason/note edits back to the saved override row values. Fix: single-shot `hydrated` flag prevents re-fire after initial sync.
- **Prevention value:** catches the entire class of "user edits disappear on next keystroke" bugs in form components hydrating from server state. Particularly common in TanStack Query consumers where `data` reference is stable but the developer-author's mental model assumes one-shot population.

##### Sub-pattern 11 — CI-parity-verification
- **Origin:** Item 148, CI hotfix (commit `013883d`, v3.8.abq)
- **Layer:** Execution
- **Trigger:** local pre-commit gate is a strict subset of CI gates.
- **Mechanic:** local verification MUST run the same gates CI runs. Frontend changes touching JSX require `npx next build` (which invokes ESLint as part of the build), NOT just `tsc --noEmit` (which only checks types). Backend with eslint/vitest in CI requires equivalent local gates before push.
- **Case study #1 (origin):** Sprint 51 `verify/page.tsx:158` had `doesn't` (ASCII apostrophe) in JSX text. Next.js default ESLint has `react/no-unescaped-entities` set to `error`. Sprint 51 pre-commit ran `tsc --noEmit` clean on both backend + frontend; tsc passed. CI Lint & Build failed at 26 seconds; E2E job skipped. Required CI hotfix commit `013883d` to swap `doesn't` → `does not`.
- **Case study #2 (retrospective, banked 2026-05-24):** Sprint v3.8.ajg added `directUrl = env("DIRECT_URL")` to `backend/prisma/schema.prisma`. Updated Render dashboard env vars + local `backend/.env` + CLAUDE.md §2.2 docs — but missed `.github/workflows/ci.yml` env blocks. Backend CI job failed at `npx prisma validate` (step 4) with `P1012: Environment variable not found: DIRECT_URL` in 24 seconds; E2E job auto-skipped via `needs: [backend, frontend]`. Frontend job unaffected (doesn't touch Prisma). Reproduced locally with `unset DIRECT_URL && DATABASE_URL=... npx prisma validate` → same P1012. Hotfix commit `5504c81` added `DIRECT_URL: postgresql://ci:ci@localhost:5432/ci` to both backend job env block and e2e job env block. CI's plain Postgres container has no pooler, so DIRECT_URL and DATABASE_URL can point at the same connection string. **Banked sub-pattern extension:** when adding any `env()` reference to `schema.prisma`, the env block must be updated in FOUR locations: (1) local `backend/.env`, (2) Render dashboard env vars, (3) CI workflow env blocks for every job that runs Prisma, (4) CLAUDE.md §2.2 canonical env var list. ajg updated 1+2+4, missed 3. The four-location checklist is canonical going forward for schema env() reference additions.
- **Case study #3 (banked 2026-05-27, v3.8.alh):** Sprint v3.8.ald swapped 5 callsites in `authController.ts` from `findUnique` → `findFirst` (lines 126, 169, 258, 374, 584) for case-insensitive email lookup. Pre-commit gate ran `npx tsc --noEmit` clean + `npx next build` clean + declared green. Did NOT run `npm test`. CI's backend job runs `npm test` and failed at 10 cases in `authController.test.ts` with `TypeError: prisma.user.findFirst is not a function` because `__tests__/setup.ts:6-11` defined the `prisma.user` mock without `findFirst`. CI red across ald → alf → alg push window (~24h, 3 commits) because Render's build chain doesn't run vitest — production stayed green, CI stayed red, the divergence went unnoticed until Wasi surfaced the GitHub Actions failure notification on the alg push. v3.8.alh hotfix shape: (a) added `findFirst: vi.fn()` to setup.ts user mock (matches every other model — otpCode/shipment/invoice/loadTender all already carry both); (b) re-pointed 6 test mocks from `findUnique.mockResolvedValue(...)` → `findFirst.mockResolvedValue(...)` to match what the controller now calls. Second wave caught a mock-state-leakage subtletly — vitest's `clearAllMocks` clears call history but NOT `mockResolvedValue`, so a 7th test needed re-pointing to explicit null because the truthy user from the prior test leaked across. **Banked sub-pattern extension #2:** the four-location checklist for `env()` schema references (case study #2) extends to a parallel gate inventory — `npm test` is now part of the canonical pre-commit gate per CLAUDE.md §3.3. Local verification must include vitest for any backend change touching controllers/services/routes the test suite covers. **Banked observation #1 (Render-vs-CI gate divergence):** Render's build chain runs `npm install + tsc + check-direct-url.js + prisma migrate deploy/status + cp -r` — but NOT vitest. A passing Render deploy is NOT evidence of a passing test suite. The two surfaces are independent gates; both must be green. Going-forward implication: when CI fails on a push that Render passed, the failure is NOT necessarily about production breakage — it can be a test/mock/setup gap that production-runtime doesn't exercise. Diagnose before assuming production impact.
- **Case study #4 (banked 2026-09-01, Item 254) — reading the workflow COLOUR is not reading the GATE.** The tender-lifecycle arc pushed **fourteen** commits over a red `E2E - Full Lifecycle Smoke`. Backend, Frontend and Deploy were green on every one, and E2E is deliberately outside the deploy gate (v3.8.asv, after the Item 198 six-hour Playwright hang), so nothing in the workflow's aggregate colour, the deploy's success, or production's health reflected it. **Neither cause was a defect in the code under test.** (a) Commit 10c (v3.8.axq) added an evidence requirement to accept-on-behalf; the E2E predated that contract and sent none, so it got the 400 the contract exists to produce — a test lagging a deliberate contract change. (b) B6.5b asserted *"the override must unblock the carrier"* against a rule **v3.8.axl had retired** when it made expired insurance absolute and Arc 26 stopped blanket overrides short-circuiting — a test asserting policy the platform had intentionally changed (§13.3 Item 244.2's superseded-test shape, and it went red rather than passing vacuously, which is the good outcome). **GOING-FORWARD RULE: the per-commit gate includes reading the E2E job's OWN result BY NAME — `gh run view <id> --json jobs --jq '.jobs[] | "\(.conclusion)\t\(.name)"'` and read the `E2E - Full Lifecycle Smoke` row — never the workflow's aggregate conclusion and never the deploy job's colour.** A workflow whose deploy gate excludes a job is a workflow whose colour structurally cannot report that job: green means "everything that gates passed", which is a different claim from "everything passed". That is §19 Sub-pattern 16's shape — a signal with no discriminating power — applied to gate COMPOSITION rather than to a guard's subject. Item 254 adds pinned-issue automation as the mechanical half; **this rule is the half that does not depend on that automation working.**
- **Case study #4 SUPERSEDED IN ITS PREMISE, 2026-09-25 (v3.8.bjh arc, C3) — the practice survives, its reason changed.** The account above is historical and stays as written, but one sentence in it is now false as present tense: **E2E is no longer outside the deploy gate.** `deploy` reads `needs: [backend, frontend, e2e]` (§13.3 Items 273.11/273.12, closed shape (a)), so a red E2E on a pushed SHA now SKIPS the deploy and colours the run red. The rule's own premise — *green means everything that GATES passed, which is a different claim from everything passed* — no longer holds for E2E, because E2E gates.
  **READING THE JOB BY NAME IS STILL THE RULE, for a new reason rather than the old one.** `Deploy to Render` now has two ways to read `skipped`: its `needs` were not met, or its `if` excluded the ref — and GitHub renders both identically, so the conclusion alone cannot say whether a commit shipped. That is the same no-discriminating-power shape the old rule guarded (§19 Sub-pattern 16, eleventh fire), pointing at a different field. Read the job list by name and read the deploy job's LOG line, not the tick.
- **Prevention value:** catches "passed tsc, failed CI" bugs. Local verify cost: ~30-45s per sprint. CI hotfix cycle cost: ~5 min wall-clock + E2E job re-run. Net wall-clock savings compound across sprints. Three-fire validation lineage now achieved (Sprint 51 JSX escape, v3.8.ajg env() missing in CI, v3.8.ald `findFirst` mock gap) — Sub-pattern 11 was already canonical at origin per Item 148; the three fires demonstrate distinct operational contexts where the mechanic recurs (ESLint, Prisma config, vitest mock). Fire count for next quarterly §19 review: 19 → 20 → 21. **Sub-rule c registry advances:** 32 → 33 with the v3.8.alh fire — every authoritative-source check on the failure shape (CI log → exact failing tests → exact mock definition → exact controller call site) was load-bearing for diagnosing this in <5 min without a blind fix.

##### Sub-pattern 12 — Write-read-dataflow-audit
- **Origin:** Sprint 51.c, commit `88adebb`, v3.8.abr — methodology pattern banked inline; no §13.3 backlog item per Path α canonical promotion.
- **Layer:** Execution
- **Trigger:** component writes via callback prop; receiver may not read what was written; refactor scenarios where dataflow consumers drift from producer changes.
- **Mechanic:** when verifying write/read flows, audit BOTH that the write fires AND that the receiver reads and acts on the written value. Three-layer audit pattern: write fires → state updates → receiver consumes. Not just "does the write succeed" — but "does the consumer's code path actually read what the producer wrote."
- **Case study:** Sprint 33 → 51.c (17-sprint window). QP Override panel wrote `form.quickPayFeePercent` via the `onAppliedRateChange` callback. The financials `useMemo` at `RateConfirmationModal.tsx:578-585` computed `feePercent = feePctForSpeed(speedUiKey, carrierTier)` — IGNORING `form.quickPayFeePercent`. A useEffect at line 588-592 then OVERWROTE `form.quickPayFeePercent` back to the speed-derived default. The Override panel was decorative for 17 sprints — UI looked like AE could override, but Payment Calculation never reflected the override. Sprint 51.c Item 150 fixed by rewriting the useMemo to consume the override, and removing the overwriting useEffect.
- **Prevention value:** catches "silent ignore" bugs where writes succeed but receiver path breaks. Particularly valuable in refactor scenarios where dataflow consumers drift from producer changes — the producer code keeps writing correctly, but the consumer no longer reads.

##### Sub-pattern 8.a — Layout-constraint-verification (refinement of #8)
- **Origin:** Item 152, Sprint 51.d (commit `4f5ed1e`, v3.8.abs)
- **Layer:** Execution (refinement to sub-pattern 8 conditional-render-visual-verification)
- **Trigger:** conditional render CHANGES content of a pre-existing layout element within a fixed-width constraint.
- **Mechanic:** visual verification scope must include BOTH the new conditional rendering AND the pre-existing element's layout integrity with the new content. Sub-pattern 8 verifies that the new element renders correctly; 8.a verifies that the pre-existing layout doesn't break under the new content. The distinction matters when the conditional fills a slot whose original content fit a width budget but the new content doesn't.
- **Case study:** Sprint 51 Item 134 α QP cell value `"Standard Net-30"` (15 chars at FONT_BODY 9pt ≈ 75pt) overflowed the meta strip cell width budget (~67.5pt at CONTENT_W 540pt / 8 cells); collided with the adjacent TERMS cell. Sub-pattern 8 (visual verification) would have shown the new value rendering, but the layout-overflow into the adjacent cell only became visible in side-by-side cell rendering. Sprint 51.d shortened to `"Standard"` (8 chars ≈ 40pt) — fits with 27pt margin.
- **Prevention value:** catches layout-overflow regressions that text-extraction smoke (sub-pattern 9) cannot detect. Text-extraction confirms "the content is present"; layout-constraint verifies "the content fits the slot allocated to it."

##### Sub-pattern 13 — Literal-vs-intent ratification (three-fire validated canonical)
- **Origin:** Sprint 51.c → Sprint 51.e → Sprint 51.f three-fire validated lineage
- **Layer:** **Ratification (NEW LAYER — first methodology principle operating above execution)**

**Three-fire validation lineage:**

1. **Fire 1 — Sprint 51.c Q2 ratification** (commit `88adebb`, v3.8.abr). Phase A Q-question: "should override values persist across SPEED toggles, or auto-sync to new tier default?" Answer ratified: persist. Sprint 51.c shipped literal persistence — override values stayed across speed toggles regardless of context. Result: AE toggling 7-Day (default 3%) with Override=3 to Same-Day (default 5%) kept Override at 3, surfacing as "-2pp delta vs tier default" with reason-required validation. Felt wrong to AE.

2. **Fire 2 — Sprint 51.e Phase A refinement** (commit `38a1d6b`, v3.8.abt). Phase A Q-question: "should the persist behavior distinguish intentional overrides (typed reason or value ≠ old default) from incidental ones (matched old default, no reason)?" Answer ratified: yes, refine to intentional-vs-incidental detection. Sprint 51.e shipped: auto-sync when Override matched OLD tier default AND reason empty; preserve when value differs OR reason set. Closer to user mental model. Still missing.

3. **Fire 3 — Sprint 51.f reality** (commit `f5552b9`, v3.8.abu). User clarified actual workflow: SPEED card IS the primary control; Override is a per-load-per-speed-instance adjustment; speed toggle = context reset. Sprint 51.f shipped always-reset on speed change. Three iterations of Phase A framing each refined one level closer; the third iteration matched the user's operational model.

**Mechanic:**

When ratifying behavior of a UI control whose mental model the ratifier hasn't operated, the ratification MUST be informed by user's actual workflow pattern, NOT just technical behavior options.

*Technical question framing:* "should values persist or auto-sync, with what conditions?"
- Optimizes for state-preservation invariants.
- Generates multiple valid behavioral options.
- Each is internally consistent with its own ratification.
- None necessarily match user intent.

*Workflow question framing:* "what does the user DO when they toggle this control? Is the new state a context reset or a context refinement?"
- Optimizes for user mental model match.
- Anchors ratification in operational workflow.
- Surfaces simpler answers when the user's model is simpler than refinement implied.

Sub-pattern 13 prescribes workflow-first framing in Phase A ratification drafting. Three iterations of technical-first framing (Sprint 51.c, 51.e) walked closer but kept overshooting the simpler workflow answer (Sprint 51.f).

**Prevention value:**

Catches the entire class of "shipped correctly per ratification but doesn't match user intent" bugs. Saves iteration cycles when user's mental model is simpler than technical refinement implied. Three-fire validation parallel to sub-rule c root's Sprint 44.5 canonical promotion lineage — both principles required three independent operational fires to canonicalize because the underlying methodology gap was subtle until repeated empirical surfacing made it canonical.

This is the methodology library's first principle that operates at the ratification layer (chat-side, before directive ships) rather than the execution layer (Claude Code, during Phase B). The layer distinction is methodologically significant — future sub-pattern banking must explicitly attribute which layer the principle operates at.

##### Sub-pattern 14 — Diff-disproves-hypothesis halt
- **Origin:** Sprint 51.f Phase A diagnostic
- **Layer:** Execution
- **Trigger:** regression hypothesis can be disproven by code-side audit (diff analysis, conditional render trace).
- **Mechanic:** when diff analysis or conditional render trace mathematically demonstrates that the hypothesized cause cannot produce the observed behavior, HALT for external evidence (browser state, network logs, scenario confirmation) rather than ship a speculative fix. The hypothesis itself is wrong — speculating at "fixes" wastes cycles and risks introducing real regressions.
- **Case study:** Sprint 51.f original report: "Override panel absent." Claude Code Phase A diff analysis showed Sprint 51.e changes between commit `88adebb` and `38a1d6b` were purely additive — 3 useRef declarations + 1 useEffect with `[tierDefaultPct]` dep. No conditional render gates touched, no JSX restructure, no early-return additions. Diff was mathematically incapable of removing the panel from the DOM. Halted for external evidence; user-side DevTools verification confirmed v3.8.abt was live; the real issue was Sprint 51.e's intent-detection behavior didn't match user's mental model (Sprint 51.f sub-pattern 13 territory), NOT a phantom regression.
- **Prevention value:** prevents phantom-regression fixes that address non-existent bugs. Saves rollback risk + verification cycle when actual root cause is elsewhere (user mental model, environment state, scenario confusion). Especially important after refactor sprints — the temptation to attribute next-sprint user reports to the refactor must be checked against actual diff capability.

##### Sub-pattern 15 — Backlog-row-drift vs §11-history-row (three-fire validated canonical)
- **Origin:** v3.8.akr → v3.8.akq → v3.8.akw three-fire lineage 2026-05-25
- **Layer:** Audit (NEW LAYER — operates above the execution + ratification layers; gates the *information* a sprint relies on for scoping)
- **Trigger:** sprint Phase A audit reads a §13.3 backlog row's "Fix shape" or "Sprint shape" text and treats it as the canonical statement of work.
- **Mechanic:** §13.3 backlog rows can drift out of sync with what §11 history rows + actual code shipped. When a sprint reads "Item N needs X done" from §13.3, the Phase A audit MUST cross-reference against (a) `grep "closes.*Item N\|§13\.3 Item N.*CLOSED"` in §11 history rows, AND (b) live code state at the file:line references the row cites. §13.3 row text is NOT authoritative for closure status; §11 history rows + actual code are. Banking-row maintenance has lagged behind code shipping for some items across 2026-05-08 through 2026-05-25.

**Three-fire validation lineage:**

1. **Fire 1 — v3.8.akr (Item 8.5 close, 2026-05-25 morning).** Initial CLAUDE.md grep for `AddressBook|addressBook|address-book` returned 13 files. Audit-first discipline required classifying each match (route-self / schema-self / version-history comments / archived-wiki docs) before inferring "13 references means active." Authoritative source = full classification of every match, not raw match count. Banked inline at Item 8.5 close as case-study extension to Sub-rule c — *"match-count is not consumer-count"*.

2. **Fire 2 — Item 191 backlog-row correction (2026-05-25 mid-morning).** §13.3 Item 191 row text claimed *"Priority: ELEVATED"* + *"every future schema migration is at risk until this lands"* — appeared OPEN. Cross-reference against §11 history surfaced *"(closes §13.3 Item 191)"* in the v3.8.ajg row (2026-05-24). Fix had shipped 24 hours prior; §13.3 row was never marked closed. Wasi caught the staleness when I included Item 191 as top-priority in a backlog summary. Banked at the docs-only correction commit as *"backlog-row-drift vs §11-history-row"* with the going-forward gate *"when summarizing §13.3 OPEN items, the §13.3 row text alone is NOT authoritative for closure status. §11 history rows are the source of truth."*

3. **Fire 3 — v3.8.akw (Items 51 + 52 + 53 audit, 2026-05-25 afternoon).** §13.3 Items 52 + 53 row text claimed *"wants the call wired"* (52) and *"uses Promise.all (NOT atomic)"* (53). Sub-agent Phase A audit + verbatim code reads against `tenderController.ts` + `waterfallEngineService.ts` + `loadBids.ts` confirmed Sprint 38 (v3.8.acd, 2026-05-13) already wrapped acceptTender in `prisma.$transaction` and wired `sendTrackingLinkToCrmContacts` to all five accept surfaces. §13.3 rows were ~12 days stale. Only the waterfall path's `notifyTenderAction("ACCEPTED")` was a genuine gap (closed in v3.8.akw). Two of three "bundled cleanup" items were docs-only closures retroactive to Sprint 38/39.

**Three independent fires within ~24h across three sprints validates canonical promotion per §19 sub-rule c three-fire convention.** Fire counts now: this sub-pattern is the **15th canonical methodology sub-pattern** in the §19 library and the **first audit-layer sub-pattern** (above the execution + ratification layers).

**Audit-layer distinction:** Sub-patterns 1-12 + 14 + 8.a operate at the **execution layer** (Claude Code during Phase B). Sub-pattern 13 operates at the **ratification layer** (chat-side, between Phase A surface and directive draft). Sub-pattern 15 operates at the **audit layer** — gates the *information* the Phase A audit relies on, before the audit findings even inform a directive. The three layers stack: audit → ratification → execution. A miss at the audit layer corrupts the ratification and execution layers downstream.

**Going-forward gate canonical text:** *"Sprint Phase A audits that consult §13.3 backlog row text MUST cross-reference each item against §11 history rows (grep for `closes.*Item N` or `§13\.3 Item N.*CLOSED`) AND verbatim against the file:line references in the row's text, BEFORE relying on the row's 'Fix shape' or 'Sprint shape' framing. §13.3 rows are signals, not authoritative state. The going-forward maintenance discipline: when shipping a closure, update both the §11 history row AND the §13.3 backlog row in the same commit."*


**Fourth fire** — a stale "NOT built" list commissioned duplicate work → `docs/claude/archive/methodology-fires.md`.

##### Sub-pattern 16 — Green-check-proves-the-check-ran (three-fire validated canonical)
- **Origin:** 2026-08-19/20, three fires in two days across the Arc 7-8 incident cluster.
- **Layer:** Verification (a fourth layer — above audit, ratification and execution; it governs whether a passing signal means what its name says).
- **Trigger:** any guard, gate, assertion or safeguard reporting success.

**The principle: a green check proves the check RAN, not that it observed the thing it names.**

Three independent fires, all green in CI, none caught by CI:

1. **A migration held by position.** Item 208 recorded that a column-drop commit must not ship. Nothing enforced it — it was the unpushed tip, which is a property of ordering, not a mechanism. Two commits landed above it and `git push` carried it along. **Caught by reading the push list**, after the drop had already applied to production (Item 212).
2. **A field asserted against the wrong file.** `v3.8.atj` added `schema` to `/health` in `server.ts`; the endpoint that matters is `/api/health` in `routes/index.ts`. tsc was clean and the test was green — green *because it asserted against the same wrong file*, so the mistake was self-consistent. **Caught by curling production** (Item 213 / `v3.8.atk`).
3. **An assertion outliving the behaviour it named.** "fails when the deploy hook secret is missing" kept passing after that behaviour was deliberately removed, because it only checked the job contained `exit 1` somewhere — and a different path still did. **Caught by the user's inbox** (Item 214).

**Going-forward rule, as practice rather than aspiration:** every new guard is verified against the **real artifact** once — the production response, the actual git state, the rendered output, the actual email — before its green is trusted. A fixture proves the logic; only the artifact proves the aim. **And the standard for a guard that passes vacuously on its first injection (ratified 2026-09-19):** fix it before the commit, re-inject, and RECORD the vacuous pass and its cause in the commit message — the migration test that matched a commented-out statement and the write scanner that read a `where:` filter as a write (v3.8.bdk, v3.8.bdl) are the shape. A guard's first version is the one most likely to carry the blind spot it was written against; the record is what lets the next author check for the same one.

**Kin already in this library**, which is what makes this a pattern rather than an anecdote:
- The `\Z` regex in `deployGate.test.ts` (Arc 3) — Ruby/Python syntax in JavaScript, so the assertion matched nothing and passed vacuously.
- The false-passing adversarial injection (Arc 4) — a string replace that silently did not match, so the "verification" ran against unbroken code and reported success.
- The sub-agent completeness claim (v3.8.alm) — a delegated audit asserting "no extras" while the orchestrator's own grep found twice as many sites.

**Fires 4—12** — CI pinned to an unsupported runtime; a mount guard green *because of* the defect; family vs weight; legal-vs-correct; a fixture colliding with its own control; a shell-less `&&`; configured-is-not-functional; a 401 with no discriminating power; a redirect test that never mounted the destination. All → `docs/claude/archive/methodology-fires.md`.

Cumulative fire registry extensions → `docs/claude/archive/methodology-fires.md`.

###### Decision-tree reference: when to fire which sub-pattern

Quick-lookup operational artifact for sprint Phase A audits. Library size (14 + 8.a) reached the navigation-aid threshold at meta-51 — this table reduces Phase A audit cognitive cost.

| Sprint scenario | Sub-patterns to apply |
|---|---|
| New conditional render path | #8 (new content renders) + #8.a (pre-existing layout integrity) |
| useEffect syncing server → local form state | #10 (ref-based read, NO form values in deps) |
| Frontend touching JSX or new pages | #11 (run `next build` locally, NOT just `tsc`) |
| Component writes via callback prop | #12 (audit BOTH write fires AND receiver reads) |
| Phase 4 user reports regression | #14 (diff analysis first; halt if hypothesis disproven) |
| Ratifying UI control behavior | #13 (workflow-first framing, NOT technical options) |
| Renderer-only sprint (PDF, image, doc) | #9 (text-extraction smoke) + #8.a (layout integrity) |
| Schema/code audit via grep | #7 (multiple naming variants; read verbatim if regex empty) |
| Concurrent sprints in same epoch | #6 (re-verify scope against latest production state) |
| File-producing build operation | #1 (fail-fast build chain) + #2 (runtime path verification) |
| Sprint identifies downstream risk | #3 (deferred-but-not-missed protocol) |
| Skill canonical vs industry practice | #4 (reconcile when conflicts surface) |
| Hybrid data flow (formData primary, DB fallback) | #5 (audit both ends — write side + read side) |
| Authoritative source available | Root sub-rule c (verify before prod-touching action) |

Maturity observation (Sprint 47 → 51.f) and **fire 13** (three greens on one job) → `docs/claude/archive/methodology-fires.md`.

##### Sub-pattern 17 — Verification-instrument failure (filed beside Item 230.3)

- **Origin:** Arc 34 Step 0, 2026-08-24. Three consecutive wrong reports on one question.
- **Layer:** Verification (with Sub-pattern 16 — but distinct: 16 is a guard that does not observe what it names; 17 is an *instrument* whose reach silently excludes the answer).
- **Trigger:** any grep, scanner or extractor used to establish that something does NOT exist.

**What happened.** Arc 34 asked which login paths write a `StaffSession` row. The scan was `grep -oE "staffSession\.[a-zA-Z]+"`, which requires the model and the method on the SAME LINE. This codebase's formatter wraps long Prisma chains:

```ts
await prisma.staffSession
  .upsert({ ... })
```

So the writer at `ssoAuth.ts:186` was invisible, and the report read "no writer exists anywhere". **Production had 6 rows the entire time** — which is what eventually exposed it, not any amount of re-reading.

**The corroboration was the trap.** The same broken pattern was run against `main`, `auth/sso` and `bench/carrier`. Three agreeing answers felt like confirmation; they were one blind spot counted three times. Repo-wide, 29 of 2495 Prisma call sites are wrapped — a **1.2%** blind spot that happened to contain the only site that mattered.

> **Looking harder with the wrong instrument isn't looking harder.**

**Then a second, opposite error.** With the writer found, the report became "the password path has a gap". It does not: `authController.ts:412` and `:855` carry an explicit comment saying no row is written *deliberately*, because the fail-closed branch turns an absent row into exactly the ruled 24h cap — and that *"adding a row here would be a regression, not a fix."* The absence was designed, and the design was documented inches away.

> **Absence of code is not absence of intent; the comment next to the gap may be telling you it isn't one.**

**Cost of not catching it:** Arc 34 Phase 2 was one step from silently reversing another session's documented decision, leaving their comment in place asserting that the new code was a regression — with no way for a later reader to tell which side was current.

**The fix, as a tool rather than a resolution.** [`scripts/find-prisma-calls.ts`](../../backend/scripts/find-prisma-calls.ts) matches across line breaks, strips comments so prose is not mistaken for a call, flags each site inline-vs-wrapped, and **self-tests against a fixture reproducing `ssoAuth.ts:186` verbatim**. Item 230.3 fixed this same single-line assumption in the endpoint extractor; fixing it there did not fix it in a human's hands, which is the argument for the tool.

**Going-forward gate:** a negative finding — "nothing does X", "no caller exists", "this is dead" — is only as good as the instrument's reach. Before reporting one: state the method, verify the instrument against a fixture drawn from the codebase's *actual* formatting, and check the claim against independent evidence (a row count, a live response) rather than a second run of the same pattern.

##### Sub-pattern 19 — the letter guard has a window, so re-check AFTER the commit

**The closing step of the commit ritual, added 2026-09-01 after it failed.**

`check-version-letter` reads the working tree. It cannot see a letter another
session is about to claim, only one they have already written into a file. So
there is a window between "guard says free" and "commit lands", and a concurrent
session committing inside that window produces a duplicate the guard reported as
clean.

**It happened.** `v3.8.awx` was taken twice on 2026-09-01 — `56e0db42` at 00:26
and `3dafd980` at 00:33. The guard passed for the second one because at check
time only its own files claimed the letter. Same failure family as §2.2's
`v3.8.aud` incident, which is what the guard was built for; the guard narrows the
window, it does not close it.

**Rule: run `check-version-letter <letter>` again IMMEDIATELY AFTER the commit,
while it is still HEAD.** A collision found there is cheap — amend the message to
the next free letter and bump the footer, both one command. A collision found
after the next commit lands is history-rewriting across a concurrent session, and
the honest move becomes documenting it rather than fixing it.

Corollary: the check is on the COMMITTED subject, so it also catches the case the
pre-commit run structurally cannot — the other session's commit arriving between
your check and your commit.

##### Sub-pattern 20 — a proof script runs with outbound keys explicitly EMPTY

**Absence is not neutralization** — the Arc 15 lesson (§13.3 Item 221), relearned
on the tender arc because it was nearly repeated.

Every DB-backed proof in Phase B ran with `RESEND_API_KEY` present from
`backend/.env`, and the app logged `Resend configured: true`. Nothing was sent,
verified by grepping every captured output for `[Email] Sent to` and finding
none — but that is luck about which code paths the proof happened to exercise,
not a control. A proof that touched `acceptTender`'s notification fan-out would
have emailed real carriers from a throwaway container.

**Rule: invoke every DB-backed proof with the outbound keys explicitly empty**,
not merely unset —

```
RESEND_API_KEY= QUO_API_KEY= OPENPHONE_API_KEY= npx tsx scripts/_proof.ts
```

— and **grep the captured output for `[Email] Sent to` afterwards, printing the
count**, so the claim "nothing was sent" is measured rather than assumed. An
empty string is falsy for the `configured` checks and survives `dotenv`, which an
unset variable does not: `dotenv` fills an absent key from `.env`, which is
exactly how the Arc 15 guard came to report "both absent" while holding the
production key.

##### Sub-pattern 18 — `key:` regex undercounts by shorthand and by wrapped chain

**A specialization of 17, and the one that actually fires.** 17 is the general
principle about instrument reach. This is the concrete, checkable defect that
keeps producing it in this codebase, and unlike 17 it yields an *undercount*
rather than a zero — which is worse, because a plausible non-zero answer does
not invite a second look.

**The two blind spots, both from this repo's ordinary formatting:**

1. **Object shorthand carries no colon.** `data: { status, carrierId }` assigns
   `carrierId` and a `/\bcarrierId\s*:/` pattern cannot see it. Already banked at
   §13.3 Item 218, where it moved the READ-never-WRITTEN count 237 → 164 → 149
   → 143 across successive corrections.
2. **The formatter wraps long chains.** `await prisma.load\n  .update({...})`
   defeats any pattern needing model and method on one line — Item 230.3 in the
   endpoint extractor, Sub-pattern 17 in `staffSession`.

**Fires in this arc, both mine:**

- **Tender-lifecycle Phase A.** Scanning writers of `Load.carrierId` with a
  colon-only pattern returned **nine**. Adding shorthand returned **eleven** —
  `instantBookService.ts:131` and `loadComplianceService.ts:312` were invisible.
  Nine looked like a complete answer and the audit's central invariant was built
  on it.
- **Phase B commit 1.** `grep 'v3\.8\.[a-z]+' VersionFooter.tsx | head` returned
  `awq` from a *comment header*; the actual `SRL_VERSION` constant said `awt`,
  1,600 lines down. The version letter was nearly derived from prose.

**Going-forward rule.** Any scanner used to enumerate assignments must (a) accept
`key` followed by `,` `}` or newline as well as `:`, (b) match across line
breaks, (c) strip comments so prose is not read as code, and (d) be
**self-tested against fixtures of both shapes before its output is trusted** —
the fixture is the gate, not the plausibility of the number. Commit 5's
`carrier-id-writer-drift` guard is the enforced form of this rule.

##### Sub-pattern 21 — a fixture value that is not unique to its role proves nothing

- **Origin:** the session race arc, 2026-09-01 (§13.3 Item 255.7). Two proof
  failures, both mine, both looking exactly like a code defect.
- **Layer:** Verification.
- **Trigger:** any fixture minting two values that the test believes are
  distinct.

**`jwt.sign` is deterministic.** The same payload and the same secret produce a
byte-identical token, and `iat` is floored to the second — so two mints inside
one second returned **the same token**. Two sections of a proof that believed
they held different tokens were sharing one, and a session row created for the
first silently satisfied the second.

The failures did not look like a fixture problem. They looked like the grace
window letting through a token it should have refused, which is precisely the
defect under test — so the natural next move is to go and "fix" working code.
Isolating it took an instrumented run printing the actual token age at request
time.

> **A value shared between two roles in one fixture cannot distinguish them.**

This is the eighth fire of Sub-pattern 16 pointed at the fixture rather than the
guard: the check ran, it observed a real value, and it was measuring something
other than what its name said. Same remedy as there — make the observation
unambiguous **by construction** rather than looking harder at an ambiguous one.
A monotonic nonce in the payload is one line and removes the class.

**Going-forward rule.** When a fixture mints more than one of anything that must
be distinct — a token, a hash, a reference number, a slug, an idempotency key —
vary it explicitly rather than relying on wall-clock time to do it. Any
generator whose input is a second-resolution timestamp will collide inside a
fast test, and the collision surfaces as a plausible failure of the subject.

##### Sub-pattern 22 — a patch script asserts its anchor, or it lies

- **Origin:** the same arc, 2026-09-01. Fired repeatedly in a single session.
- **Layer:** Verification.
- **Trigger:** any scripted edit — `String.replace`, `sed`, a one-shot `node -e`.

**An unguarded `String.replace` that matches nothing returns the original string
and the script then reports success.** In this arc a debug-instrumentation patch
printed `dbg on`, changed nothing, and the run that followed was read as evidence
about the code. It was evidence about an unpatched file.

The miss is rarely a typo. In this codebase it is almost always **line endings**:
a multi-line anchor written with `\n` against a CRLF file, or CRLF against a file
a heredoc just created with LF (§14.1). Both fail silently and both look like the
code has changed underneath you.

**Going-forward rule.** Every scripted edit must (a) assert the anchor is present
BEFORE replacing and `exit 1` on a miss, (b) prefer line-wise editing
(`split(/\r?\n/)`) over multi-line string anchors, so line endings cannot decide
the outcome, and (c) print what it changed, not merely that it ran.

**Two corollaries from the same arc, both cheap and both cost a cycle:**

- **Do not build a matcher inside `node -e` or `sed`.** Escapes are eaten on the
  way in — four times in this arc, turning `\n` into a real newline and `\s` into
  a bare `s`. Write the script to a file, or use `String.fromCharCode`.
- **Do not chain a state-changing command into one whose exit code you then
  read.** `node patch.js && npx tsc | head; echo ${PIPESTATUS[0]}` reports the
  FAILED PATCH's status as though it were the typecheck's. Twice in this arc that
  read as a compile error that did not exist. Same shape as §13.3 Items 228.5 and
  244.3.

#### 7. Design-system conformance audit (Sprint 40b/40c, ALWAYS-FIRE post-Sprint-44.5)
- **Trigger:** sprint introduces or modifies a UI element belonging to a multi-surface class (drawers, modals, banners, tab rails, side panels, status badges, action buttons, form inputs, **nullable-data render paths**, **deploy-pipeline classes**, **fixture classes**).
- **Action:** enumerate all surfaces in the class. Check the modification against canonical reference + skill. Document drift if found.
- **Distinct from Pattern 6:** Pattern 6 is **temporal** (Sprint N vs Sprint N+1 on a single code path). Pattern 7 is **spatial** (Surface A vs Surface B at the same time across a class).
- **ALWAYS-FIRE status promoted Sprint 44.5** based on five consecutive prospective fires across multiple domains:
  - **Sprint 41 (marginPercent)** — surfaced 4 unguarded `.toFixed()` crash sites where §13.3 Items 12.1+12.2 documented 2 of 4. Domain: code logic / nullable-data render paths.
  - **Sprint 42 (drawer enumeration)** — 6 detail-style surfaces audited; ShipmentDetailDrawer + 4 right-drawers + Load Board side panel got atomic P0+P1 hotfix bundle. Domain: UI/CSS conformance.
  - **Sprint 43 (fixture-class enumeration)** — 6 fixture extensions across Sprints 37/38/40/41/43 with no central reference; surfaced Item 67 methodology debt. Domain: testing infrastructure.
  - **Sprint 44a (deploy-pipeline-class enumeration)** — 3 schema-mutation paths existed without canonical (Render automated + manual `db push` + manual `migrate deploy`); surfaced Item 8.10's deeper root cause + drove canonical consolidation. Domain: infrastructure / deploy pipeline.
  - **Sprint 44b (drift scope quantification)** — continued Sprint 44a; converted "ProspectVertical drift" finding into "81 of 87 enums" via authoritative-source query. Domain: schema integrity.
- **Caught retroactively in:** Sprint 30 Houston-template drift (5 surfaces shared the wrong Texas-template `SRL_INFO`), Sprint 32 dropdown bg drift (5 modals had 5 different dropdown patterns), Sprint 40b drawer drift (11 findings × 6 surfaces — 1 P0, 3 P1, 3 P2, 4 P3), Sprint 40c marginPercent crash sites (4 surfaces unguarded, §13.3 Items 12.1+12.2 documented only 2 of 4). Same architectural fingerprint: render-path or component-class drift across multiple consumers without a central reference.
- **Pattern signature is grep-able.** A 30-second `grep "marginPercent.*toFixed"` surfaced all 4 crash sites at once where 2-of-4 manual catch had stood for weeks. When fixing a class member, grep the class signature first; a single-surface fix on a multi-surface defect is a partial close that ages into a backlog item.
- **Domain breadth:** Pattern 7 has now fired in CSS/UI, code logic, methodology debt, infrastructure, and schema integrity. Cross-domain applicability confirms the pattern is structural, not domain-specific.

### Per-sprint commit message convention (effective Sprint 40+)

Every sprint commit message now includes two lines near the close:

```
Patterns applied: <comma-separated list of §19 entries that fired>
Patterns emerged: <new pattern, if any — meta-commit follows to log it>
```

When new patterns surface, ship them as a separate methodology meta-commit (no version bump, no source code change — same shape as Sprint 28 audit-only and Sprint 37 lock-only). Quarterly review prunes the catalog.

### Pending review (next quarterly)

→ `docs/claude/archive/methodology-fires.md`.

---

## §20 PAGE AUDIT STANDARD (binding for public marketing surfaces)

Moved → `docs/claude/brand-and-claims.md`. Every subsection below, titled as it read before the move.

- **§20.1 — Scope** · `docs/claude/brand-and-claims.md`
- **§20.2 — Workflow (mandatory)** · `docs/claude/brand-and-claims.md`
- **§20.3 — The audit lenses** · `docs/claude/brand-and-claims.md`
- **§20.1.5 = Lens 1.5 Architectural Reveal Defense** · **§20.1.6 = Lens 1.6 Semantic Legibility Defense** · **§20.1.7 = Lens 1.7 Brand Modernity Alignment** · `docs/claude/brand-and-claims.md`
  (shorthand used in code for the lenses, which are headings *inside* §20.3 — they were never sections of their own)
- **§20.4 — Graphics audit** · `docs/claude/brand-and-claims.md`
- **§20.5 — Pre-commit gates (mandatory checklist)** · `docs/claude/brand-and-claims.md`
- **§20.6 — Page-level audit log (where each page was last audited)** · `docs/claude/brand-and-claims.md`
- **§20.7 — Cross-page redundancy registry (seed entries from this audit arc)** · `docs/claude/brand-and-claims.md`
- **§20.8 — Sunday-onward foundation (2026-05-17 → 2026-05-21 arc, canonical for web design + content writing going forward)** · `docs/claude/brand-and-claims.md`
- **§20.8.1 — Proven canonical patterns (validated across this arc)** · `docs/claude/brand-and-claims.md`
- **§20.8.2 — Canonical UI components (banked as reusable patterns)** · `docs/claude/brand-and-claims.md`
- **§20.8.3 — Methodology banking (§19 sub-pattern fires validated)** · `docs/claude/brand-and-claims.md`
- **§20.8.4 — Binding effect** · `docs/claude/brand-and-claims.md`
- **§20.8.5 — Marco Polo chatbot governed by the disclosure ceiling (added 2026-05-25, v3.8.akx)** · `docs/claude/brand-and-claims.md`

---

## §21 QUICK PAY PILOT + DOCUMENT NUMBERING (§21.1 ratified 2026-08-16 · §21.2 amended 2026-09-23)

→ `docs/claude/pricing-tiers-quickpay.md`. §21.1 Quick Pay is a limited pilot (request, then approve —
the ladder in §8 is unchanged by it); §21.2 document numbering as **one bare number per load** — `5001` on
the load, the BOL, the rate confirmation, the invoice and the CarrierPay alike, no `SRL-` prefix and no
core suffix, with a letter only on a supplemental for a missed accessorial (`5001A`). The
suffix-on-a-shared-stem scheme ratified 2026-08-16 is superseded, and is described at the end of that
section rather than deleted because numbers issued under it are never rewritten.

**This is the one section a test reads.** `quickPayPilotDocClaims.test.ts` anchors on the §21.1 and §21.2
headings in that file and holds their claims against the code. If §21 moves again, repoint the test in the
same commit — never before, never after.

---

**Appendix A** — load/carrier state machines (A.1, restating the §2 pipeline above) and the
"documented, not yet implemented" roadmap patterns (A.2–A.5) →
`docs/claude/archive/roadmap-patterns.md`.
