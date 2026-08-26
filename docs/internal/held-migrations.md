# Held schema changes

**Five** schema changes are authored, verified, and deliberately not applied.

**They release SEPARATELY.** Each answers to its own condition, and merging them
into one change would couple decisions that have nothing to do with each other —
so that reverting any one of them reverts all three. Resist the tidiness
instinct here; it is the whole reason this file exists rather than a single
"pending schema work" branch.

They share exactly one precondition (the deploy-hook secret, below) and nothing
else.

Last reviewed: 2026-08-24, Arc 34 — **five** holds (four branches, one file),
scheduled `prisma/migrations/` confirmed clean of untracked files on `main`, and
`RENDER_DEPLOY_HOOK_URL` confirmed still unset.

**Arc 31 found an unmet release condition on hold #2 that nobody had recorded —
see the ⚠ under it. Read that before merging the fleet hold.**

---

## The shared precondition

`RENDER_DEPLOY_HOOK_URL` is **not set**. Until it is, Render auto-deploys on
every push to `main` and CI does not gate it, so **merging any of these applies
it the moment the branch lands** rather than when somebody decided it should.

That is Item 212 in one sentence: a column-drop reached production because it
was held back by *position* rather than by a mechanism, and position is not a
mechanism. Setup: [`render-deploy-gate-setup.md`](render-deploy-gate-setup.md).

This one secret now gates **four** schema changes. (Hold 5 also appears below but is CLOSED — it released on evidence, not on the secret, and merged 2026-08-26.) It is the highest-leverage
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

## 2. `hold/retire-fleet-module` — drop the fleet tables

| | |
|---|---|
| **Form** | git branch (`hold/retire-fleet-module`) |
| **Drops** | `trucks`, `trailers`, four enums used only by them, `Load.truckId` / `Load.trailerId`, `Driver.assignedTruckId` / `assignedTrailerId` |
| **Authored** | Arc 23, §13.3 Item 230 |
| **Verified from zero** | Yes — full 44-migration chain applied to an empty container; tables and enums confirmed absent, survivors (`equipment`, `Load.truckNumber`) confirmed present |

**Why held.** SRL is a pure broker. Those tables carried no owner column at all,
and the only two things that ever created a row were the fleet module's own POST
and the seed. The application half shipped in Arc 23; this is the schema half.

**It was a file first, and that is worth remembering.** A concurrent session held
`prisma/schema.prisma` when this was authored, so branching would have meant
committing my schema edit over their uncommitted one; it went to
`_pending_migrations/` instead and lost nothing. Their work landed
(`f9c0d475`), and Arc 24 converted it to this branch.

**Arc 25 sweep found the pending copy still sitting on `main`** — the conversion
removed it on the branch only, so the same migration existed twice, in two
different states, with this file describing the older one. Removed from `main`.
Two copies of a destructive migration is exactly how the wrong one gets applied.

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

**⚠ RELEASE CONDITION NOT MET — found Arc 31, 2026-08-23.**

`eldService.getELDSummary` calls `prisma.truck.count({ where: { status: "ACTIVE" } })`
and is reachable in production via `GET /eld` → `getELDOverview`. **This hold
drops the `trucks` table, so merging it as things stand breaks that endpoint at
runtime.**

Arc 23's own typecheck against this branch caught five surviving fleet
consumers, and this was not among them — it sits in a service the fleet
retirement never looked at. (A `prisma.truck` grep also matches
`carrierVettingService`, but that one is a COMMENT Arc 23 left explaining a
removal; prose, not code.)

Fixing it is a decision about what `/eld` should report once SRL owns no
vehicles, not a mechanical edit — and the same service has a second problem
worth settling in the same change: `hosViolations` counts drivers with
`hosDrivingUsed >= 11`, a counter nothing has written since Arc 22, so it
reports a permanent zero to the AE as though it were a live compliance figure.
§13.3 Item 239.4.

**Release conditions — ALL THREE:**

1. Arc 23's application-side retirement deployed and soaked; nothing may
   reference these tables when this runs.
2. **`eldService`'s `prisma.truck` read resolved** — see the ⚠ above. Verify
   with `grep -rn "prisma\.truck\|prisma\.trailer" backend/src` returning only
   comments.
3. The shared precondition above.

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

## 4. `hold/retire-asset-drivers` — drop three dead Driver columns

| | |
|---|---|
| **Form** | git branch (`hold/retire-asset-drivers`) |
| **Drops** | `Driver.safetyScore`, `Driver.violations`, `Driver.cppMilesEarned` |
| **Authored** | Arc 31, §13.3 Item 239.6 |
| **Verified from zero** | Yes — full chain applied to an empty container; the three confirmed absent and `carrierProfileId` / `trainingPinHash` / `hosDrivingUsed` / `licenseExpiry` confirmed present; `migrate status` clean; backend tsc clean against the regenerated client |

**Why held.** The `/dashboard/drivers` page and `GET /drivers/stats` were the only
readers, and both went in v3.8.aun. `cppMilesEarned` had neither a reader nor a
writer even before that.

**THE TABLE STAYS, and this is the important part.** `Driver` is shared: the
carrier portal owns rows in it — the roster, phone verification, the Arc 19
SMS/GPS chain and the entire Driver Academy. This drops three columns from a
live table, nothing more. Anyone reading "retire asset drivers" and reaching for
`DROP TABLE` has misread the boundary.

**Deliberately narrow, and the exclusions are the reasoning:**

- **HOS quartet excluded.** Dead in the write direction since Arc 22 removed the
  only writer, but `eldService` still *reads* them. Dropping them before
  settling what that service should report puts a 500 on an AE dashboard.
- **`assignedTruckId` / `assignedTrailerId` excluded.** Hold #2 already drops
  them, from this same table. Two copies of a destructive migration is exactly
  how the wrong one gets applied — the near-miss recorded under hold #2.

**Release conditions — BOTH:**

1. The row-count gate in the migration header, run against production **before**
   merging. All three counters must be zero; a non-zero means something wrote a
   column this migration believes is dead.
2. The shared precondition above.

---

## 5. `hold/arc34-session-policy` — uniform session lifetime (30m idle / 12h absolute)

> **RELEASED 2026-08-26 as `9e30d784` (v3.8.aut). This entry is kept as the
> record of what the hold was for and how it was discharged — the hold is
> CLOSED and the branch is merged.**
>
> The release condition was met in full: the proof harness runs **16/16**
> against a real Postgres over real HTTP. It first ran **RED at 12/16**, and
> that red was the point — it caught three defects that reasoning had not,
> including a legacy staff branch still running ahead of the uniform policy and
> deciding. The load-bearing assertion passed on AE, CARRIER and SHIPPER, which
> converted the `sets req.user and calls next for valid token` verdict from
> "stale fixture" (diagnosis) to fact, exactly as this entry required.
>
> Census re-run immediately before merge, as instructed below: **6 rows, zero
> sign-ins in 7 days, unchanged.** The rollout signed out nobody.
>
> All three "also outstanding" items were completed: dated supersession wording
> (seven tests, not two — five went red and two were passing for the wrong
> reason), the `authController.ts:412/:855` comments, and the rollout sweep,
> now scheduled hourly and registered in `SCHEDULED_JOB_NAMES`.

| | |
|---|---|
| **Form** | git branch (`hold/arc34-session-policy`), tip `8dfa5c5f` |
| **Adds** | `SessionPortal` enum + `StaffSession.portal` (additive, defaulted) |
| **Authored** | Arc 34, §13.3 Item 244 |
| **Verified from zero** | NO — and that is the point. See the release condition. |

**THIS ONE IS DIFFERENT IN KIND FROM THE FOUR ABOVE, and conflating them would
misread both.** Holds 1-4 are DESTRUCTIVE changes waiting on the deploy-hook
secret: the schema work is finished and proven, and what is missing is a
mechanism to control WHEN it applies. This one is ADDITIVE — it drops nothing,
and its migration is safe to apply the moment it lands. What it is waiting for
is EVIDENCE, not a gate.

**Why held.** The branch changes how every authenticated request is judged, on
all four portals, via a fail-closed policy. It is correct by reasoning and
unproven by execution. Reasoning has a poor record in this specific file: three
diagnoses about it were confidently wrong in a row, and two real defects — one a
total lockout — were caught by tests the concurrent session wrote, not by
review.

**Release condition — ONE thing:**

The five-path proof-by-login (staff-password, carrier, shipper, driver, SSO)
against a real server. Per path: a session is minted; the row exists with the
right `portal` AND is keyed by the 32-char truncated hash the middleware reads;
and **a subsequent authenticated request succeeds**. That last assertion is the
whole gate — it converts the outstanding "stale fixture" verdict on
`sets req.user and calls next for valid token` from a diagnosis into a fact. The
alternative reading of that failing test is "authentication is broken", and
nothing currently distinguishes the two.

Plus, in the same harness: idle → `SESSION_IDLE_EXPIRED`; absolute at 12h;
a pre-policy session → `SESSION_REVOKED_POLICY_ROLLOUT`; a background poll that
does NOT reset the clock (adversarially verified by unmarking one poll); and a
remembered SSO session still idling at 30m.

**The deploy-hook secret is NOT a precondition here** — unlike holds 1-4. This
hold releases on evidence alone.

**Also outstanding before merge** (all specified in `8dfa5c5f`'s message): dated
supersession wording on the two intended test changes, the supersession comments
at `authController.ts:412/:855` per
[`seam-note-arc34-session-policy.md`](seam-note-arc34-session-policy.md), and
the rollout sweep call.

**Census, taken 2026-08-24 and still the reason this is cheap to ship:**
`staff_sessions` 6 rows, zero users signed in within 7 days, zero drivers
holding a training session. **The rollout signs out nobody.** Re-run
`scripts/_readonly-session-census.ts` before merging — if sign-ins now exist,
`SESSION_REVOKED_POLICY_ROLLOUT` stops being insurance and becomes load-bearing.

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
