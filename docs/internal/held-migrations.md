# Held schema changes

Three schema changes are authored, verified, and deliberately not applied.

**They release SEPARATELY.** Each answers to its own condition, and merging them
into one change would couple decisions that have nothing to do with each other —
so that reverting any one of them reverts all three. Resist the tidiness
instinct here; it is the whole reason this file exists rather than a single
"pending schema work" branch.

They share exactly one precondition (the deploy-hook secret, below) and nothing
else.

Last reviewed: 2026-08-21, Arc 24.

---

## The shared precondition

`RENDER_DEPLOY_HOOK_URL` is **not set**. Until it is, Render auto-deploys on
every push to `main` and CI does not gate it, so **merging any of these applies
it the moment the branch lands** rather than when somebody decided it should.

That is Item 212 in one sentence: a column-drop reached production because it
was held back by *position* rather than by a mechanism, and position is not a
mechanism. Setup: [`render-deploy-gate-setup.md`](render-deploy-gate-setup.md).

This one secret now gates **three** schema changes. It is the highest-leverage
thing outstanding on the human side.

---

## 1. `hold/retire-load-rate` — drop `Load.rate`

| | |
|---|---|
| **Form** | git branch (`hold/retire-load-rate`) |
| **Drops** | `Load.rate` (one column) |
| **Authored** | Arc 21, §13.3 Item 227 |
| **Verified from zero** | Yes — full chain applied to an empty container; row-parity gate RUN against a migrated container, **0 mismatched rows** |

**Why held.** `Load.rate` meant the CUSTOMER number on one creation path and the
CARRIER number on another. Every reader was migrated to an explicit field and
the column left as a **write-only mirror** — still written so a rollback finds
what it expects, read by nothing.

**Release conditions — BOTH:**

1. [`noLoadRateReads.test.ts`](../../backend/__tests__/unit/lib/noLoadRateReads.test.ts)
   green for a full deploy cycle. It fails on any new read and carries a
   vacuity tripwire.
2. The shared precondition above.

**On merge:** remove the four mirror writes and the guard's allowance for them.
The migration header says so, because scaffolding left standing becomes
architecture.

**Note on the row-parity gate:** its first draft used snake_case identifiers
against camelCase columns, so it would have **errored rather than answered** —
and the tempting fix when a gate errors is to delete the condition. Quoted and
re-run before it was trusted.

---

## 2. `_pending_migrations/20260822010000_drop_fleet_module` — drop the fleet tables

| | |
|---|---|
| **Form** | file under `backend/prisma/_pending_migrations/` |
| **Drops** | `trucks`, `trailers`, four enums used only by them, `Load.truckId` / `Load.trailerId`, `Driver.assignedTruckId` / `assignedTrailerId` |
| **Authored** | Arc 23, §13.3 Item 230 |
| **Verified from zero** | Yes — full 44-migration chain applied to an empty container; tables and enums confirmed absent, survivors (`equipment`, `Load.truckNumber`) confirmed present |

**Why held.** SRL is a pure broker. Those tables carried no owner column at all,
and the only two things that ever created a row were the fleet module's own POST
and the seed. The application half shipped in Arc 23; this is the schema half.

**Why a file and not a branch (originally).** A concurrent session was editing
`prisma/schema.prisma` at the time, and branching would have meant committing my
schema edit over their uncommitted one. Their work has since landed
(`f9c0d475`), so this **can now become a branch** — see the conversion note in
the file header.

**`Driver.assignedEquipmentId` is deliberately NOT in this drop.** Arc 22 banked
it as stranded because the field name appears nowhere in `src` — but
`equipmentController` consumes that relation **from the `Equipment` side**, and
`Equipment` is a live model. Absence of a name is not absence of a consumer.

**A near-miss worth recording.** An older, MORE destructive draft of this
migration sat **untracked inside `prisma/migrations/`** — the scheduled
directory — for the whole of Arc 23. It additionally dropped
`assignedEquipmentId`. It survived a `git branch -D` because untracked files are
not branch-scoped, and it was one `git add -A` from Render applying it. Removed
in Arc 24. **When abandoning a branch that created directories, check
`git status` for what the branch deletion did not take with it.**

**Release conditions — BOTH:**

1. Arc 23's application-side retirement deployed and soaked; nothing may
   reference these tables when this runs.
2. The shared precondition above.

---

## 3. `_pending_migrations/20260821040000_drop_dead_load_ref_fallbacks` — drop two dead reference columns

| | |
|---|---|
| **Form** | file under `backend/prisma/_pending_migrations/` |
| **Drops** | `Load.pickupNumber`, `Load.shipperPoNumber` |
| **Authored** | Arc 13, §13.3 Item 219 |
| **Verified from zero** | See the file header — authored with a row-count gate; confirm before merging |

**Why held.** Both were middle or last links in fallback chains whose earlier
link is populated, so they could only ever contribute an empty string. Two
search branches queried `shipperPoNumber` and could never have matched a row.

**Release conditions:** the shared precondition, plus running the row-count gate
in the file header. The banked follow-up (wiring the carrier BOL preview to the
populated `poNumbers[]` array) is a feature and is not blocked by this.

---

## Before merging any of them

1. **Run the row-count gate in the file's own header against production**, and
   read the answer. A gate run *after* the drop answers nothing — that is
   exactly what made Item 212 permanently unanswerable.
2. **Re-read `git log origin/main..HEAD` immediately before pushing.** If it
   contains anything you did not intend to release, stop.
3. **`/api/health` does not tell you whether a migration landed.** `migrate
   deploy` runs during the BUILD while the old process keeps serving, so the SHA
   can report the old commit while the schema has already changed. Read the
   `schema` field, or `_prisma_migrations` directly.
