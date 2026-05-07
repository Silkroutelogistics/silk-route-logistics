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

Prerequisites:
1. Postgres running locally (default `postgres://localhost:5432`)
2. `DATABASE_URL` env var pointing at it
3. Node 20+
4. Playwright browser binaries installed

Setup (one-time):

```bash
npm install                                  # root + e2e deps
npm run test:e2e:install                     # downloads chromium
cd backend && npm install && cd ..
cd frontend && npm install && cd ..
```

Run:

```bash
# Build frontend (one-time per change)
cd frontend && npm run build && cd ..

# Apply schema + seed with E2E fixtures
cd backend && DATABASE_URL=$DATABASE_URL npx prisma migrate deploy && cd ..
cd backend && DATABASE_URL=$DATABASE_URL E2E_FIXTURES=true npx prisma db seed && cd ..

# Run test (auto-starts backend + frontend via playwright webServer)
DATABASE_URL=$DATABASE_URL E2E_BYPASS_OTP=true npm run test:e2e
```

Or use the UI mode for debugging:

```bash
DATABASE_URL=$DATABASE_URL E2E_BYPASS_OTP=true npm run test:e2e:ui
```

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
