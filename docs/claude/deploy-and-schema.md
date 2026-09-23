# §2.2 — deployment configuration, and how the build chain got its guards

Moved out of `CLAUDE.md` on 2026-09-23. **Load this for a deploy-chain change, a
schema migration, or an incident.**

**What deliberately did NOT move, and stays resident in §2.2:** the concurrency rules
(more than one session may be working this repo; re-derive the version letter from
origin; read `git status` for foreign modifications; never stage broader than you
edited; the index is shared state, so commit by explicit pathspec, late), the
held-work-lives-on-a-branch rule, the `audit-*.md` naming rule, untracked files are
not branch-scoped — and **the production rail with its two named commands.**

The rail stays because it is a safety rail, not a procedure: a migration reached
production from a local shell on 2026-09-01 because `.env` held the production pair
and a raw `npx prisma migrate deploy` bypassed the guard. A session that has not
loaded that rule is the session that repeats it. What moved here is the deployment
*configuration* it protects, and the accounts of how each guard was earned.

Section numbers unchanged; see `README.md`.

---

**Backend service:** Render Web Service "silk-route-logistics"
- URL: https://api.silkroutelogistics.ai
- GitHub: Silkroutelogistics/silk-route-logistics, branch `main`
- Dashboard: https://dashboard.render.com/web/srv-d64iqtffte5s73894h8g
- **Dashboard is canonical** — `render.yaml` is documentation-only (kept in sync with the dashboard but not Blueprint-managed). Edits to `render.yaml` alone will deploy without effect.

**Required env vars on Render (canonical):**
- `DATABASE_URL` — pooled Neon endpoint (hostname contains `-pooler`). Used by runtime backend for normal queries; pooler manages connection limits.
- `DIRECT_URL` — direct Neon endpoint (hostname does NOT contain `-pooler`). Used by Prisma for ALL migrate operations per the `directUrl = env("DIRECT_URL")` line in `schema.prisma`'s datasource block (added v3.8.ajg). Direct connection releases the advisory lock cleanly the moment migrate exits — permanent fix for the P1002 contention class that fired three times in the v3.8.a* arc.
- `PRISMA_MIGRATE_LOCK_TIMEOUT=60000` — bumps Prisma's advisory-lock acquisition timeout from 10s default to 60s. Belt-and-suspenders alongside `DIRECT_URL`. Reduces residual P1002 frequency on the rare case where the direct URL itself is briefly contended (e.g. Render hot-redeploy stacking).
- `NODE_ENV=production` — runtime env. Note that build chain prefixes `NODE_ENV=development` on the `npm install` step only (see buildCommand below); the runtime value is preserved.
- `RESEND_API_KEY`, `JWT_SECRET`, `OPENPHONE_API_KEY`, `OPENPHONE_PHONE_NUMBER_ID`, `FMCSA_WEB_KEY` — service-specific; see Render dashboard for current values.

**Local development requires the same `DATABASE_URL` + `DIRECT_URL` pair** in `backend/.env`. Without `DIRECT_URL` set locally, `prisma migrate dev` + `prisma migrate status` will fall back to `DATABASE_URL` and reintroduce the pooler-cached-lock risk during local migration authoring.

**Build Command** (canonical, copy verbatim to Render dashboard):

```
NODE_ENV=development npm install && npm run build && node scripts/check-direct-url.js && npx prisma migrate deploy && npx prisma migrate status && cp -r src/assets/. dist/backend/src/assets/ && cp -r src/config/. dist/backend/src/config/ && cp -r src/lib/. dist/backend/src/lib/
```

**v3.8.ajs `check-direct-url.js` guard.** Added between `npm run build` and `prisma migrate deploy`. Verifies `DIRECT_URL` env var is (a) set and (b) does NOT contain `-pooler` in the hostname. Exit code 1 with self-explanatory remediation message if either condition fails. Catches the misconfiguration class that hit v3.8.ajr's deploy (Render env var was set but to the pooled URL by mistake → Prisma routed migrate through the pooler → P1002 timeout in 10s with no diagnostic). Pre-ajs the failure mode was silent (10s migrate timeout with no hint about WHY); post-ajs the build fails in <1s with the exact remediation steps. Banks the four-location checklist (§19 Sub-pattern 11 case study #2) as enforced code, not just docs.

**Sprint 47 cp -r form (`SRC/. DEST/` trailing-dot, NOT `SRC DEST`).** POSIX `cp -r SRC DEST` when DEST already exists copies SRC as a CHILD of DEST — producing `DEST/SRC_NAME/files...` (nested), not `DEST/files...` (expected). `tsc` creates `dist/backend/src/{lib,config,assets}/` directories first (emitting compiled `.js` files into them), so by the time the cp steps run, all three destination directories pre-exist and the nesting bug fires silently. Sprint 44b shipped `cp -r src/config dist/backend/src/config` form thinking it would copy contents; it actually produced `dist/backend/src/config/config/signatures/whaider.html` (nested), and the runtime `email/builder.ts:18` reading `dist/backend/src/config/signatures/whaider.html` got the "file not found" warning on every cold start since. Same bug hit Sprint 45-RC's `cp -r src/lib` — compass PNGs went to `dist/backend/src/lib/lib/srl_compass_*.png` instead of `dist/backend/src/lib/srl_compass_*.png`, fallback navy ring rendered on every Rate Confirmation PDF. **Sprint 47 trailing-dot form `cp -r SRC/. DEST/` always copies CONTENTS regardless of whether DEST exists.** Empirical verification gate (Sprint 47 Phase B0 Step 4) — Pattern 6 sub-rule c extension: command-success is not file-landed-at-expected-path; both must be verified.

The `NODE_ENV=development npm install` prefix (Sprint 46) is install-time only — runtime `NODE_ENV=production` is preserved via render.yaml `envVars` block. The override is load-bearing because Render's env-level `NODE_ENV=production` would otherwise cause `npm install` to skip the `devDependencies` block entirely, leaving all `@types/*` packages absent at compile time. Under that condition, `Request` from `express` resolves to `any`, `AuthRequest extends Request<any,any,any,any>` cascades to "Property 'params/body/query' does not exist on type 'AuthRequest'", and tsc emits ~1,100 errors. Pre-Sprint-46 those errors were masked by `(npx tsc \|\| true)` in `backend/package.json` build script; Sprint 46 dropped the `\|\| true` so tsc now fails the build, and the `NODE_ENV=development` prefix is required to make tsc actually pass (devDeps installed → @types resolved → AuthRequest cascade healed).

**Architectural property — build chain is fail-fast post-Sprint-46.** tsc error → build halts → cp steps don't execute → deploy fails visibly. Pre-Sprint-46 the chain was fail-silent: `|| true` swallowed tsc, cp steps ran regardless, deploy succeeded with broken artifacts (Sprint 45-RC compass mark placeholder + Sprint 44b email signature template both shipped because of this — runtime fallbacks fired without anyone seeing the build-time failure that put them there). Item 96 banks this lesson as canonical methodology principle.

The `prisma migrate status` step is a post-deploy verification gate (Sprint 44b P3). It fails the build if any migrations remain pending after `migrate deploy` runs, catching silent-skip class regressions before the new artifact ships.

The `cp -r src/lib dist/backend/src/lib` step (Sprint 45-RC) is load-bearing for runtime `__dirname`-relative reads of the skill chrome library's compass PNG fallbacks (`backend/src/lib/srl-chrome.ts:169` `LOGO_DIR = __dirname`, lines 179 + 184 read `srl_compass_{60,120,240,480}.png` siblings). Without this cp step, `generateEnhancedRateConfirmation` will fail at runtime when rendering the compass mark on Rate Confirmation PDFs. Pattern 6 sub-rule c reminder: render.yaml is documentation-only per Sprint 44b — Wasi must update Render dashboard buildCommand manually before or alongside the Sprint 45-RC commit's deploy or RC PDF generation will 500.

**Prisma 6's `migrate status` returns non-zero exit code on pending/failed migrations inherently — no `--exit-code` flag needed (and not supported).** The Sprint 44b initial directive specified `--exit-code` from a Prisma 5-era convention; Prisma 6.19's `npx prisma migrate status --help` exposes only `--help / --config / --schema` with no `--exit-code` option, and the Render deploy that triggered this hotfix surfaced "unknown or unexpected option: --exit-code" after the `migrate deploy` step ran clean. Behavior verified via `LASTEXITCODE: 0` on clean status run + non-zero on drift. Item 73 logs this caught + closed.

The `cp -r src/config dist/backend/src/config` step is load-bearing for runtime `__dirname`-relative reads of email signature templates (`backend/src/email/builder.ts:18` reads `dist/backend/src/config/signatures/whaider.html`). Item 72 (Sprint 44b pre-commit audit) caught the omission of this step in an intermediate Sprint 44b draft — restored before commit. Any future `__dirname`-relative asset under `backend/src/` must either live under `src/assets/` or `src/config/`, or the buildCommand must extend the cp chain.

2. **EMERGENCY OVERRIDE — only for incident response:**

   If a migration file ships but Render fails to apply it cleanly, run from local:

   ```powershell
   $env:DATABASE_URL = "<prod-url-from-.env>"
   npx prisma migrate deploy
   ```

   If a migration is in the file but already manifest in prod (rare — should not happen with this canonical):

   ```powershell
   npx prisma migrate resolve --applied "<migration-name>"
   ```

   Document override in `regression-log.md` with reason and verification.

**Local development:**
Use `prisma migrate dev` to author migrations against local DB. Never use `db push` for permanent schema changes. `db push` is acceptable for rapid prototyping that gets captured as a migration before commit.

**Verification commands (read-only):**

From `backend/` with `$env:DATABASE_URL` set to prod:

```powershell
npx prisma migrate status
```

Should always show `Database schema is up to date`.

**Sprint 44b baseline reset note:**

The single migration `20260509170000_baseline_init` at `prisma/migrations/` captures complete prod schema as of 2026-05-09. Prior 15 migrations archived to `prisma/_archived_migrations_2026-05-09/` for historical reference only — they are NOT part of the active migration chain. Render's `_prisma_migrations` table was cleared and the baseline marked as applied during Sprint 44b execution.

**Pre-Sprint-44b state (deprecated, retained for context):**

Render Build Command lacked `prisma migrate deploy` entirely. Schema additions during Apr 24 → May 4 landed in prod via manual `prisma db push`, bypassing migration history. Audit caught this via Sprint 44a Track 1 (CSV of 87 prod enums vs 6 `CREATE TYPE` statements in migrations) — drift scope was 81 of 87 enums plus corresponding tables/columns.

---

