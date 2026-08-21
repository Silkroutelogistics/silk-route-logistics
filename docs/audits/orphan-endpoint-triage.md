# Orphan Endpoint Triage — audit-completeness Pass 1

**Date:** 2026-08-18
**Baseline:** HEAD `a4ed85cd` (v3.8.asm)
**Source:** `backend/scripts/audit-completeness.ts` Pass 1 — mutating routes (PUT / PATCH / DELETE) with no apparent frontend caller. 26 findings.

Every one of the 26 is now annotated in place with an `// audit-pass1:` comment, so the next person reading the route sees the verdict without re-deriving it, and a future Pass 1 run is self-documenting.

## Nothing was deleted, and that is deliberate

The item allowed deletion of routes classified DEAD. On inspection none qualified cleanly, and the two closest candidates are money-path:

- `PATCH /invoices/:id/mark-paid` shares the **same `markInvoicePaid` controller** as `PUT /accounting/invoices/:id/mark-paid`, which is the one the frontend calls. It is a redundant mount, not dead code.
- `PATCH /drivers/:id/assign-equipment` is superseded by the narrower `assign-truck` / `assign-trailer` pair the frontend uses, but the handler is still live and reachable.

Both are reachable HTTP surfaces on code I did not author. Removing a mount is a breaking change for any non-browser consumer, and Pass 1 only proves *the frontend* does not call something — it cannot see an integration, a script, or a partner. So these are logged as consolidation candidates rather than deleted. The count therefore stays at 26 and every survivor carries its reason, which is the other half of the item's target.

## Classification

### FALSE-POSITIVE (2) — the endpoint is live; the heuristic missed it

| Route | Source | Evidence |
|---|---|---|
| `PATCH /carrier-drivers/:id/deactivate` | `carrierDrivers.ts` | `carrier/dashboard/drivers/page.tsx:145` calls `` `/carrier-drivers/${id}/${action}` `` |
| `PATCH /carrier-drivers/:id/reactivate` | `carrierDrivers.ts` | same call site — `action` is a template variable |

**This is a tool limitation worth knowing.** Pass 1 matches static URL fragments, so any caller that builds the final path segment from a variable reads as an orphan. Both of these shipped with working UI in v3.8.amw. Treat a Pass 1 finding as a question, never a verdict.

### INTENTIONAL (1) — API surface, no frontend caller expected

| Route | Source | Why |
|---|---|---|
| `PATCH /shipments/:id/location` | `shipments.ts` | Integration surface per Phase 5E.c Decision 4.1 |

### DUPLICATE / SUPERSEDED (3) — consolidation candidates, both paths reachable

| Route | Source | Live equivalent |
|---|---|---|
| `PATCH /invoices/:id/mark-paid` | `invoices.ts` | `PUT /accounting/invoices/:id/mark-paid` — identical controller |
| `PATCH /customers/:id/credit` | `customers.ts` | `PUT /accounting/credit/:id` |
| `PATCH /drivers/:id/assign-equipment` | `drivers.ts` | `assign-truck` + `assign-trailer` |

Same class as §13.3 Items 40 and 158 (parallel endpoints). Consolidating means picking a canonical, migrating any caller, and deleting the other — a sprint of its own, with the money-path ones needing the most care.

### MISSING-UI (20) — backend built, frontend never wired

This is the reachability defect class: real capability that no operator can reach. Not built now, per the item.

| Route | Source | Severity | Note |
|---|---|---|---|
| `PUT /accounting/payments/:id` | `accounting.ts` | **P1** | Live money path — this is the endpoint whose fee gate was hardened in v3.8.asb. Reachable by API with no AE surface. |
| `PUT /accounting/disputes/:id/investigate` | `accounting.ts` | P2 | Dispute workflow backend complete; `/accounting/disputes` never wired to it. |
| `PUT /accounting/disputes/:id/propose` | `accounting.ts` | P2 | Same workflow. |
| `PUT /accounting/disputes/:id/resolve` | `accounting.ts` | P2 | Same workflow. The three together are one missing screen. |
| `DELETE /accounting/reports/:id` | `accounting.ts` | P3 | Saved-report delete. |
| `PATCH /carrier-loads/:id/driver` | `carrierLoads.ts` | P2 | Carrier cannot assign a driver to their own load from the portal. |
| `PATCH /carriers/fraud-reports/:reportId/review` | `carriers.ts` | **P1** | Fraud-report review is AE-managed and has no console surface — reports can be filed and never actioned. |
| `PATCH /carriers/:id/ucr` | `carriers.ts` | P2 | UCR feeds Compass vetting; no manual-correction UI. |
| `PUT /carriers/chameleon-matches/:matchId/review` | `carriers.ts` | **P1** | `SecuritySignalsCard` shows matches read-only (audit F-note); the review action was never wired, so a flagged identity cluster cannot be cleared or confirmed. |
| `PUT /carriers/:id/restore` | `carriers.ts` | P2 | Soft-delete restore. |
| `PUT /customers/:id/restore` | `customers.ts` | P2 | Soft-delete restore. |
| `PATCH /drivers/:id/hos` | `drivers.ts` | P3 | HOS comes from ELD; manual correction retained. |
| `PUT /eld/devices/:id` | `eld.ts` | P2 | ELD device-mapping edit — banked since v3.8.ajt. |
| `DELETE /fleet/trucks/:id` | `fleet.ts` | P2 | `/dashboard/fleet` is read-plus-create only. |
| `PATCH /fleet/trucks/:id/assign` | `fleet.ts` | P3 | Assignment done through `/drivers/:id/assign-truck`. |
| `DELETE /fleet/trailers/:id` | `fleet.ts` | P2 | Same as trucks. |
| `PUT /invoices/:id/line-items` | `invoices.ts` | P2 | Line-item edit lives in accounting; this route never wired. |
| `PUT /loads/:id/restore` | `loads.ts` | P2 | Soft-delete restore — relates to §13.3 Item 8.2 (cancelled-loads tab). |
| `PATCH /routing-guides/entries/:entryId` | `routingGuide.ts` | P3 | Guides edited whole, not per entry. |
| `DELETE /routing-guides/entries/:entryId` | `routingGuide.ts` | P3 | Same. |

## The three worth a sprint

Ranked by what an operator currently cannot do:

1. **`chameleon-matches/:matchId/review`** — the Compass fraud story depends on identity-cluster detection, and today a match can be raised but never resolved. Read-only detection with no disposition is an unfinished control.
2. **`fraud-reports/:reportId/review`** — same shape. A carrier can be reported and the report sits.
3. **`accounting/payments/:id` + the three dispute routes** — one missing accounting screen covering payment edit and dispute lifecycle, on a path that already handles money.

## Rerunning

`npx tsx backend/scripts/audit-completeness.ts`. Pass 1 will still report 26; each now has a verdict at the call site. A finding that appears *without* an `audit-pass1:` comment above it is new since 2026-08-18 and needs triage.

---

## Arc 22 — Pass 1 closure (2026-08-21)

**17 UNRESOLVED → 0.** Seven endpoints deleted, ten already carried a verdict.

The headline finding is not about any endpoint. **Arc 2 had already triaged all ten
survivors and written each verdict into the code as a `// audit-pass1:` note — and
the tool matched paths and ignored comments, so every one resurfaced as UNRESOLVED
on every run since.** The triage had no memory. Re-deciding settled questions each
run is how a findings list stops being read, and a list nobody reads is worse than
no list, because it still looks like coverage.

Pass 1 now reads those notes. A note moves an endpoint from UNRESOLVED to
**DISPOSITIONED** — still listed, still shown with its reason, no longer counted as
an open question. It never hides anything: an annotation that could remove a finding
from the page would be a way to silence a finding rather than answer one.

### Deleted — DEAD-BY-STRATEGY (7)

**The business fact, stated rather than implied: SRL is a pure broker and has no
truck side.** §5 prohibits SRL from ever claiming "our fleet" / "our trucks" / "we
own". `Truck` and `Trailer` carry **no owner column at all** — not a carrier, not
SRL — and the only two things that ever created a row were this module's own POST
and the seed. They modelled an asset-carrier operation SRL will never run.

| Verb | Path | Rationale |
|---|---|---|
| PATCH | `/fleet/trucks/:id` | No caller in any frontend, present or historical (`git log -S` on `trucks/` under `frontend/` is empty). |
| DELETE | `/fleet/trucks/:id` | Same. |
| PATCH | `/fleet/trucks/:id/assign` | Same; driver↔truck assignment is a motor-carrier act. |
| PATCH | `/fleet/trailers/:id` | Same. |
| DELETE | `/fleet/trailers/:id` | Same. |
| PATCH | `/drivers/:id/assign-equipment` | Superseded by the narrower `assign-truck` / `assign-trailer`, which are live. |
| PATCH | `/drivers/:id/hos` | **The strongest case of the seven, and not merely strategic.** It hand-edits `hosDrivingUsed` / `hosOnDutyUsed` / `hosCycleUsed` / `hosCycleLimit` — the 11/14/70 clock under 49 CFR 395. A typed-in HOS clock is exactly what the ELD mandate exists to prevent. Even a motor carrier should not have this endpoint; a broker certainly should not. |

All seven verified to have **zero** other consumers before deletion — not just no
frontend caller, but nothing in `src`, `__tests__`, `e2e`, cron, or service code.
Route, controller handler, and now-orphaned Zod schema removed together.

**Read and create remain**, because `/dashboard/fleet` calls them. The module is now
exactly what its UI does. Retiring it wholesale is §13.3 Item 228 — a business
decision, deliberately not taken here.

**Schema consequence, batched not executed.** Three fields lost their last backend
reference: `Truck.assignedDriverId`, `Trailer.assignedDriverId`,
`Driver.assignedEquipmentId` (Pass 2 UNREFERENCED 52 → 55, total unchanged at 1538).
No migration was authored for them: Item 228 would supersede a three-column drop,
and pre-empting a decision with a partial migration is how a schema accumulates
half-finished intentions.

### Dispositioned — verdict on file (10)

Each was independently re-verified this arc, not taken on Arc 2's word.

| Path | Verdict | Worth building? |
|---|---|---|
| `PUT /carriers/chameleon-matches/:matchId/review` | MISSING-UI | **Yes — the highest-value gap found.** `SecuritySignalsCard` renders the match count and the overlap explanation, and offers no way to mark one reviewed. Matches accrue OPEN forever and the count an AE sees never falls, so the signal decays into background noise. |
| `PATCH /carrier-loads/:id/driver` | MISSING-UI | **Yes, and worth more since Arc 19.** Driver verification is now per-load; this is the natural place a carrier names the driver. |
| `PUT /invoices/:id/line-items` | MISSING-UI | Yes — Item 211 flagged line-item edit as unbuilt; this is the backend half already standing. |
| `PUT /eld/devices/:id` | MISSING-UI | Yes, eventually. **Explicitly NOT dead-by-strategy** — Compass tracking is telematics-activated and the Motive/Samsara services are real code; a carrier connecting their own ELD is the intended path. |
| `PATCH /routing-guides/entries/:entryId` | MISSING-UI | Low. The UI manages whole guides; the entire `/entries` sub-resource is unwired, so this is one third of a missing feature rather than a loose end. |
| `DELETE /routing-guides/entries/:entryId` | MISSING-UI | Low, same. |
| `PUT /carriers/:id/restore` | MISSING-UI | Low. Soft-delete exists with no restore affordance; a rare, recoverable-by-support need. |
| `PUT /customers/:id/restore` | MISSING-UI | Low, same. |
| `DELETE /accounting/reports/:id` | MISSING-UI | Low. Saved-report delete; no harm in its absence. |
| `PATCH /shipments/:id/location` | INTENTIONAL | n/a — integration surface per Phase 5E.c Decision 4.1; a frontend caller was never expected. |

### The tool change, adversarially verified

Three injections, each run and each observed to move the count:

1. Rename `audit-pass1:` to an ordinary comment → that endpoint returns to UNRESOLVED.
   The reader requires the real tag; it does not treat any nearby comment as a verdict.
2. Append a new unannotated route → UNRESOLVED rises. An annotation elsewhere cannot
   blanket-silence the pass.
3. Append a route into a file dense with verdicts → still UNRESOLVED. A note cannot
   bleed onto the route below it, because the walk stops at the first non-comment line.

**A gate that did not cover the artifact.** `tsc --noEmit` returned 0 on a file with a
syntax error, because `tsconfig.json` includes only `src/**/*` — `scripts/` is outside
it. Twice during this arc a green tsc was reported over an audit-tool change it never
read. The gate for a tool change is running the tool.
