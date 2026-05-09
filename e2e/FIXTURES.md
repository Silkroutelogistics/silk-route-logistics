# E2E Fixture Catalog

Reference document for E2E test fixtures used by `full-lifecycle.spec.ts` and any future test surfaces.

Established at Sprint 44.5 closing §13.3 Item 67. Pattern 7 (design-system conformance audit) surfaced 6 fixture extensions across Sprints 37/38/40/41/43 with no central reference. This doc consolidates the gate, idempotency rules, naming conventions, and current inventory so future sprints don't re-derive.

---

## Gate

All fixtures live behind `process.env.E2E_FIXTURES === "true"` in `backend/prisma/seed.ts`. Setting that env var **before** `npx prisma db seed` is the only way fixtures land. CI workflow sets it explicitly at `.github/workflows/ci.yml:87`. Local smoke runs need the same export.

```powershell
$env:E2E_FIXTURES = "true"
$env:DATABASE_URL = "postgresql://srl:srl_local_dev@localhost:5433/srl_e2e"
npx prisma db seed
```

The gate exists so production seeds (or `seed.ts` in a fresh dev workstation) never accidentally create test users, dummy carriers, or smoke-only loads.

---

## Idempotency requirements

Smokes mutate state. Each subsequent run must see deterministic starting state, which means seed must be idempotent **across multiple smoke runs** and **across the same fixture being touched mid-test**.

Two patterns are in use:

### Pattern A — Upsert (preferred for entities created once)

For users + carrier profiles + customer rows that the smoke reads but does not destructively mutate:

```ts
const user = await prisma.user.upsert({
  where: { email: "blocked-carrier@srl.invalid" },
  update: {},
  create: { /* ... */ },
});
```

Re-running `prisma db seed` is safe — existing rows untouched, missing rows created.

### Pattern B — DeleteMany + recreate (required when smoke mutates fixture state)

For waterfall positions that smoke advances + loadbids that smoke accepts/rejects + compliance overrides that smoke creates: each smoke run leaves residue. Subsequent runs see the residue and assertions fail.

Wrap fixture creation with a cleanup step **before** create:

```ts
// Clear prior smoke-run residue so this seed leaves deterministic state.
await prisma.complianceOverride.deleteMany({
  where: { carrierId: priorBlocked.id },
});

await prisma.load.deleteMany({
  where: { commodity: { in: ["E2E-WATERFALL-FIXTURE", "E2E-LOADBID-FIXTURE", "E2E-SHIPPER-FIXTURE"] } },
});
```

Then run the create as normal. This is the canonical "reset to known state" approach for E2E.

---

## Naming conventions

Distinctive identifiers so smokes can find fixtures via API queries (no need to pass IDs through env vars).

### Email — `*@srl.invalid`

Test users use the `@srl.invalid` TLD (RFC 6761 reserves `.invalid` for testing — guarantees no real-world conflict, no accidental email send risk).

| Email | Sprint | Role | Purpose |
|---|---|---|---|
| `test-carrier@srl.invalid` | seed default | CARRIER | Primary APPROVED carrier with signed agreement; B6 + B6.5 happy-path tender |
| `blocked-carrier@srl.invalid` | Sprint 40 | CARRIER | APPROVED + insurance expired → passes Sprint 36b picker eligibility, trips compliance check; B6.5b/c/d/e |

### Commodity — `E2E-*-FIXTURE`

Test loads use distinctive commodity strings so the smoke can filter API responses without storing fixture IDs.

| Commodity tag | Sprint | Lifecycle status | Purpose |
|---|---|---|---|
| `E2E-WATERFALL-FIXTURE` | Sprint 43 | POSTED | Waterfall + 1 tendered position pointing at blocked-carrier; B6.5d |
| `E2E-LOADBID-FIXTURE` | Sprint 43 | POSTED | LoadBid pending pointing at blocked-carrier User.id; B6.5e |
| `E2E-SHIPPER-FIXTURE` | Sprint 43 | DELIVERED | Belongs to Haider Logistics customer; visible under shipper-portal session for B15 |

### Reference number — auto-generated `SRL-NNNNNNNNNN`

Most smoke-created loads use the auto-generated reference number from `nextLoadReferenceNumber()`. The smoke captures `load.referenceNumber` from the create response and uses it for subsequent UI clicks.

---

## Current fixture inventory

Six fixture extensions have shipped across Sprint 37/38/40/41/43, plus the seed defaults:

### Seed defaults (always present; not gated by `E2E_FIXTURES`)

- 1 admin user, 1 CEO (`whaider@silkroutelogistics.ai`), 1 SHIPPER (`wasihaider3089@gmail.com`)
- 5 carriers (4 APPROVED + 1 PENDING per console output)
- 5 customers including `Haider Logistics` (linked to `wasihaider3089@gmail.com`)
- 30 loads, 10 invoices, 8 check calls, 14 SOPs

### `E2E_FIXTURES=true` extensions

| Sprint | Fixture | Purpose | Idempotency pattern |
|---|---|---|---|
| 37 | Signed `CarrierAgreement` for every APPROVED carrier | Compliance gate passes during B6.5 tender accept | Implicit (creates one per existing carrier) |
| 38 | Carrier `mcNumber` rotation (`MC-1794414` → `MC-998877`) | Removes false-positive on Sprint 30 Houston-template forbidden list (smoke saw broker MC# in carrier section due to seed value collision) | Schema update via upsert |
| 40 | `blocked-carrier@srl.invalid` (APPROVED, insurance expired 30d ago) | Compliance-block fixture: passes Sprint 36b picker eligibility, trips compliance check on selection | Upsert |
| 41 | `complianceOverride.deleteMany` cleanup before recreating blocked-carrier fixture | Smoke creates 24h overrides during B6.5b that would mask blocked state on re-run | Pattern B |
| 43 | Waterfall fixture (load + Waterfall + tendered WaterfallPosition pointing at blocked-carrier) | B6.5d skip+advance compliance re-check | Pattern B (`load.deleteMany` by commodity tag before recreate) |
| 43 | Loadbid fixture (POSTED load + pending LoadBid pointing at blocked-carrier User.id) | B6.5e 409-error compliance re-check | Pattern B |
| 43 | Shipper-portal load (DELIVERED, Haider Logistics customer) | B15 ShipmentDetailDrawer a11y walk under shipper session | Pattern B |

---

## Adding a new E2E fixture

Checklist for future sprints:

1. **Confirm E2E necessity.** Can the smoke create the fixture inline at test time instead of in seed? Inline is preferred (test-local state, no seed change). Seed-time fixtures are for cases where (a) the fixture must exist before backend boot, (b) the fixture is shared across many test sections, or (c) creation requires admin-only tables that the test runner can't write.

2. **Pick the idempotency pattern.** If the smoke mutates the fixture (accepts a tender, applies an override, advances waterfall position), use **Pattern B** (`deleteMany` before `create`). If the fixture is read-only across runs, **Pattern A** (`upsert`) is sufficient.

3. **Use the canonical naming convention.** Test emails get `@srl.invalid`. Test loads get a distinctive `commodity` tag like `E2E-<purpose>-FIXTURE`. This lets smokes find the fixture via API filter without storing IDs across env-var boundaries.

4. **Gate behind `E2E_FIXTURES`.** Do not unconditionally seed the fixture. Production seeds + dev workstation seeds must remain unaffected.

5. **Update this catalog.** Add a row under `Current fixture inventory` with sprint, purpose, idempotency pattern. Future sprints reading this doc will see complete inventory + understand whether their new fixture conflicts with an existing one.

6. **Pre-commit smoke check.** Run `npx prisma db seed` twice in a row locally with `E2E_FIXTURES=true`. If the second run errors (e.g., unique constraint violation, NOT NULL violation), fix idempotency before pushing.

---

## Pattern 6 sub-rule c reminder

When adding a fixture that informs a prod-touching action (rare for E2E, but possible if the seed changes a production-shape table like `User` or `Customer`):

Verify the fixture's broader implication against authoritative source before commit. Pattern 6 sub-rule c (Sprint 44b three-fire canonical) applies to E2E fixtures the same way it applies to deploy commands and migration files: the audit's narrow "this fixture works" can be right while the broader inference "this fixture won't affect prod" is wrong.

For E2E fixtures specifically, the authoritative-source check is:

```powershell
# Confirm the fixture creates rows ONLY when E2E_FIXTURES is set:
$env:E2E_FIXTURES = "false"
npx prisma db seed
# Query for the fixture's distinctive identifier — should return zero rows.

$env:E2E_FIXTURES = "true"
npx prisma db seed
# Same query — should return the fixture rows.
```

If the fixture leaks into the no-`E2E_FIXTURES` path, the gate is broken; fix before commit.

---

*Last updated: Sprint 44.5 (2026-05-09). Surfaced as Item 67 by Pattern 7 fixture-class enumeration in Sprint 43 Phase A audit.*
