# E2E Lifecycle Smoke

Sprint 37 (v3.8.aaq) introduced this E2E suite as the methodology shift
from manual smoke walks to automated regression locks.

## What it covers

A single Playwright test (`full-lifecycle.spec.ts`) walks one load
through the canonical lifecycle and asserts brand-skill conformance on
the generated Rate Confirmation PDF. If any Sprint 26-36b closed fix
regresses, the test goes red **before** deploy.

Coverage map:

| Sprint | Closed fix | Asserted at |
|---|---|---|
| 26b | Accessorial render Load Board crash | B5 — click load |
| 29 | Accessorial render RC modal crash | B6 — open RC modal |
| 30 | Broker Info canonical SRL identity | B11 — RC PDF assert |
| 31 | Carrier search 404 | B5 — search returns |
| 32 | Dropdown white bg + error UI | B5 — visual + ok |
| 33 | Caravan tier reconciliation | B11 — RC PDF assert |
| 34 | quickPayFeePercent coercion | B7 — send tender ok |
| 35 | fuelSurchargeType enum alignment | B7 — send tender ok |
| 36 | Tender modal Y1 picker | B5 — picker results |
| 36b | Eligibility filter + ID semantics | B5 + B7 — select+send |
| 27 | /track public status mapping | B9 — /track render |

## Running locally

```bash
npm run test:e2e:local
```

That is the whole thing. It provisions a throwaway Postgres, applies the
schema, seeds the E2E fixtures, rebuilds the frontend if it needs to, and runs
Playwright the way CI runs it.

One-time, before the first run:

```bash
npm install && npm run test:e2e:install   # root deps + chromium
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

Requires Docker, which hosts the throwaway database, and Node 24 — what
`backend/package.json` declares and what CI pins.

Arguments pass straight through to Playwright:

```bash
npm run test:e2e:local -- --headed
npm run test:e2e:local -- --debug
```

The database is left running afterwards so you can look at what the test did:

```bash
docker exec -it srl-e2e-local psql -U ci -d ci
docker rm -f srl-e2e-local        # when you are done with it
```

### Why one command rather than a list of steps

The instructions here used to be a list of steps, and following them verbatim
produced **a failing test on a healthy tree**. The build step omitted
`NEXT_PUBLIC_API_URL`, which Next.js inlines at build time, so the browser
called the wrong origin and the run died at B5 with `element(s) not found` —
indistinguishable from a real frontend regression. The env list was also short
of `JWT_SECRET`, `ENCRYPTION_KEY` and `DIRECT_URL`.

That mattered more than it looks. On 2026-09-01 this job was red across
eighteen runs, and three of the four root causes were the same shape: a
contract changed — an added required field, a new consent step, a retired
override policy — and the fixture did not catch up in the same commit. Each was
about a minute of local work to catch. None was caught, because running this
suite locally meant a half-hour of assembly with several ways to produce a
misleading red.

Two details the runner handles that are easy to get wrong by hand:

- **A stale server on port 3010 or 4000.** Playwright starts its own and will
  not reuse one, so the runner refuses up front and tells you how to find the
  process. It does not kill it for you — that may be something you are using.
- **A stale `frontend/out/`.** The runner greps the built chunks for the API
  URL it needs and rebuilds only when that URL is genuinely absent, so reruns
  stay fast without ever testing against a wrongly-configured build.

### CI parity

The runner reads the `e2e` job's `env:` block out of
`.github/workflows/ci.yml` and uses it directly rather than keeping a second
copy. A copy drifts, and a drifted copy shows up as a local pass over a CI
failure — the one outcome that teaches you to stop trusting the red. If that
block stops carrying something the runner depends on, it fails and names the
missing key instead of falling back to a stale value.

Local Postgres is the only substitution: CI uses a service container on 5432,
the runner uses `srl-e2e-local` on 55440 so it cannot collide with the other
local databases this repo keeps around. Override with `E2E_LOCAL_PG_PORT` or
`E2E_LOCAL_CONTAINER` if it still does.

## Adding new assertions

When a future sprint closes a regression, add the canonical / forbidden
strings to `helpers/pdf.ts`:

- `RC_PDF_FORBIDDEN`: strings that MUST NOT appear (legacy values now
  retired)
- `RC_PDF_REQUIRED`: strings that MUST appear (canonical values now
  established)

These lists are **append-only** — every fix adds a regression lock.

## Why static export + `serve` (not `next dev`)

Cloudflare Pages serves static HTML in production per `next.config.ts`
`output: "export"`. CI runs `next build` then serves `out/` via the
`serve` package. This matches deploy reality more closely than dev mode.

Local development can use the same flow OR run `next dev` separately
(skip the webServer block by setting `reuseExistingServer: true`).

## Why programmatic JWT mint (not real OTP/TOTP flow)

Backend exposes `POST /api/auth/e2e-token` ONLY when `E2E_BYPASS_OTP=true`
is set on the backend process. Returns a signed JWT for any seeded user
without OTP/TOTP. Production environments fail-closed (404 if env
variable absent) — see `backend/src/routes/auth.ts:60`.

## Sprint sequencing

- **Sprint 37 (this)**: foundational E2E + B10-B12 PDF assertions
- **Sprint 38+**: each new sprint adds its regression lock to the
  RC_PDF_FORBIDDEN / RC_PDF_REQUIRED arrays
- **Future**: split into per-feature specs once base infra stable
- **Future**: visual regression sprint (Percy/Chromatic) closes Tier 2 gap
