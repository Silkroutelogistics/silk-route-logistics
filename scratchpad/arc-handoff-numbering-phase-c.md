# Numbering Phase C — handoff

Branch `arc/numbering-phase-c`, cut from `1fd66498` (Phase B, PR #12).
**7 commits, UNPUSHED.** Production is on `1fd66498`, booted 2026-09-24T03:32:17Z.

| letter | sha | what |
|---|---|---|
| bil | `1bdb1a99` | C1a — a load-backed invoice IS the load number |
| bim | `8357c98f` | C1b — the two hand-raised invoice paths join the rule |
| bin | `b2008b2b` | C1c — the invoice document prints ONE number |
| — | `aa12a161` | reachability gate: consumer scan dropped real consumers |
| bio | `ac72ae8b` | C2 — exact document number outranks a substring |
| bip | `a657dd0f` | C2b — remaining search boxes; one runner, not four copies |
| — | `44f0d080` | C3 — SHP- is internal, now enforced |

The two unlettered commits are unversioned per §3.1: CI tooling and test-only.

## What each ruling produced

**C1 (ruling 3).** `createInvoiceWithRetry` takes `srlDocNumber` as a REQUIRED
FIRST parameter, so a call site cannot silently forget the mirror — tsc refuses.
A P2002 on a mirrored number is not retried: the number is derived rather than
allocated, so a duplicate is a real error, and retrying would recompute the same
string six times. Six creation paths now mirror; the accounting path's
INV-YYYYMMDD-XXXX allocator is deleted. The invoice PDF prints one number, and
its fallback is the PERSISTED column, never a derived one.

**C2 (ruling 6).** `lib/documentSearch.ts` — exact first, the legacy `SRL-` form
with it, substring after — wired at five sites through one `runRankedSearch`.
Nothing narrowed: the substring pass IS the old flat OR, so every term that
matched still matches; only the order changed.

**C3.** Already true, so the deliverable is a frozen census that fails if any new
file touches `shipmentNumber`, plus assertions that `/shipments` grants no
CARRIER or SHIPPER and the customer mapper uses the load number.

## Findings worth carrying

1. **tsc does not typecheck `__tests__`** (`include: ["src/**/*"]`). "btsc clean"
   proved the services compile and said nothing about three test files declaring
   the old arity. Only vitest found them.
2. **The reachability gate's consumer scan was nondeterministic.** `.test()` on a
   `/g` regex advances `lastIndex` across calls; measured over the real
   1273-file corpus it dropped a live importer and reported a live export as
   test-only. It fails toward DEAD — the direction that deletes working code.
3. **The permanence guard earned its place.** It failed on the search helper
   building `SRL-` itself; the spelling moved into `documentNumber`, and
   `LEGACY_PREFIX` returned with the caller v3.8.bik said would need it.
4. **Two superseded tests went red and were right to.** They asserted a
   load-backed invoice taking `INV-1043`. Re-aimed, not deleted — their fixture
   stem is legacy, so they now lock that old loads keep the suffixed scheme.

## Open

1. `accountingController` payments search (`paymentNumber`) is still a flat OR.
   Settlement numbers, not load documents — deliberately not wired.
2. Whether the storage key `invoices/<number>.pdf` should follow the
   `documentFilename` convention (`5001_Invoice.pdf`). It is a storage key, not a
   Content-Disposition filename, so the §21.2 rule does not reach it.
3. Nothing pushed. Phase C has had no CI run and no deploy.
