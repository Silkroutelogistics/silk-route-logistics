# Carrier-archive recut — B2 Phase A (read-only), 2026-09-20

**Baseline read:** `origin/main` `5b382758` + `arc/carrier-archive-recut` through `5e815b1b` (the tree B2 lands on). The third session's on-disk diff in the main checkout is recorded separately in §5 so the delta can be re-verified against what actually gets committed. Nothing in this document changes code. No letter, no merge, none of the seven dirty files touched.

**Verdict up front.** Phase A hits **stop condition 2**: four live API paths create a tender or write `Load.carrierId` without consulting the compliance gate (§1, rows A–D), and one of them has a live UI caller. It also finds **one existing mechanism that the ruled absolute would change** (§2, the blanket override), which the instruction says to report and not rule. Phase B does not start on this document.

---

## 1. Every path that creates a tender or writes `Load.carrierId`

Method: `createTender` (tenderCreationService) is the single `LoadTender` writer and `assignCarrier` (carrierAssignmentService) the single `Load.carrierId` writer — both guarded (`loadTenderWriters`, `carrierIdWriterDrift`). Every caller of each was read to the gate, or to the absence of one. `createTender` itself checks NOTHING about the carrier (only the one-live-offer fan-out rule, `tenderCreationService.ts:116-148`), so the gate is the caller's or nobody's.

### THROUGH GATE

| # | path | gate site | before the write at | live caller |
|---|---|---|---|---|
| 1 | `POST /api/loads/:id/tender` → `tenderController.createTender` | `complianceCheck(carrierId)` `:54` | `createTenderRow` `:71` | Tender modal, `loads/page.tsx:383` |
| 2 | `POST /api/tenders/:id/accept` → `acceptTender` (on-behalf delegates, v3.8.axq) | `complianceCheck(tender.carrierId)` `:155` → 403 | `assignCarrier` `:227` | carrier portal + AE on-behalf |
| 3 | `POST /api/loads/with-tender` → `withTenderController` | `complianceCheck` `:62` | `createTender` `:258` | Carrier Engagement Drawer |
| 4 | `POST /api/carrier-loads/:id/accept` → `carrierLoads.ts` | `complianceCheck(profile.id)` `:245` | `createTender` `:297` → `acceptTender` | carrier load board |
| 5 | `PATCH /api/load-bids/:id/accept` → `loadBids.ts` | `complianceCheck(carrierProfile.id)` `:205` | `createTender` `:309`, `assignCarrier` `:229` | AE bid accept |
| 6 | `waterfallEngineService.acceptPosition` | `complianceCheck(acceptingProfile.id)` `:530` → skip+advance | `assignCarrier` `:608` | carrier accepts a cascade offer |
| 7 | `POST /api/loads/:id/waterfall` → `waterfallTenderService.launchWaterfall` | `complianceCheck(c.carrierId)` `:52` per candidate, `continue` on `!allowed` | `createTender` `:60` | `tenders.ts:116` |
| 8 | `buildWaterfall` positions from scoring | `complianceCheckMany` at BUILD (`waterfallScoringService.ts:280`) | `waterfallPosition.create` `:78` | Order Builder / waterfall page |

Row 8 is gated at build and the resulting ASSIGNMENT is re-gated at accept (row 6); the OFFER the cascade later creates is not re-gated at tender time — see row D below for why that matters.

### BYPASSES GATE — stop condition 2

| # | path | what it does | gate | caller today |
|---|---|---|---|---|
| **A** | `POST /api/automation/assign-match/:loadId` (`automation.ts:41-76`) | `assignCarrier` → BOOKED, `carrierUserId` = **body `userId`**; no tender row; `createCheckCallSchedule` | **none** — no `complianceCheck`, no status, no `deletedAt`, no `isTestAccount` | none in `frontend/src` or `e2e`; live API, `authorize(ADMIN, CEO, BROKER, DISPATCH, OPERATIONS)` |
| **B** | `POST /api/automation/fall-off-accept/:loadId` (`automation.ts:150-166`) → `handleFallOffAcceptance` (`fallOffRecovery.ts:164`) | `assignCarrier` → BOOKED for `req.body.carrierUserId \|\| req.user.id`; precondition: an ACTIVE `fallOffEvent` on the load | **none** — the backups came from `matchCarriersForLoad` (`dispatchableCarrierWhere` + equipment + insurance, no gate) and the accept does not check the accepter was among them | none found; `authorize(…, CARRIER)` — **a CARRIER may pass any `carrierUserId` in the body** |
| **C** | `POST /api/loads/:id/broadcast` (`tenders.ts:163`) → `launchBroadcast` (`broadcastTenderService.ts:26`) | `createTender` for **every body candidate** (`carrierId`, `carrierUserId`, `offeredRate`), 1–50 of them | **none** anywhere on the path | none in `frontend/src`/`e2e` (only a proof script and a unit test); live API, `authorize(BROKER, ADMIN, CEO, DISPATCH)` |
| **D** | `POST /api/waterfalls/:id/positions` (`waterfalls.ts:349`, `authorize(...AE_ROLES)` — AE-driven, not carrier) → `waterfallPosition.create` at `:375` (a POSITION row, not a tender row) queued for **body `carrierUserId`**; then `waterfallEngineService.tenderPosition` (`:190-275`) creates the OFFER through `createTender` at `:256` | position inserted ungated; `tenderPosition` resolves the profile by `userId` with **no `deletedAt` filter** and no `complianceCheck` (only the C3 `skipped` guard) | **none at insert, none at tender time**; the ASSIGNMENT is re-gated at accept (row 6) | **LIVE UI: `waterfall/tabs/MatchTab.tsx:23`** |

One more that is a BYPASS by shape and dead in practice, recorded so nobody rediscovers it as live — and one that Phase A recorded as dead and is NOT (row F, corrected below by the Phase B re-verification):

| # | path | why it is dead today | what would make it live |
|---|---|---|---|
| E | `POST /api/ai/instant-book` (`ai.ts:437`) → `instantBook` (`instantBookService.ts:98`) | `canInstantBook` checks `onboardingStatus === APPROVED` + tier GOLD/PLATINUM + `insuranceExpiry` — **not `complianceCheck`** (no BCA, OFAC, authority age, chameleon, `deletedAt`, `isTestAccount`); and it is `authenticate`-only with **no `authorize`**. Dead by construction: `canInstantBook` resolves a **profile** id and `assignCarrier` writes that id into `Load.carrierId`, which is a **User** FK → FK violation → `success:false`; with a user id `canInstantBook` answers "Carrier not found". §13.3 Item 57 / 222.4 class. No caller anywhere. | fixing the id would make it a live gateless assignment path. **Phase B note:** once B2b gates inside `assignCarrier`, the gate itself must not be what makes this path live — a `User.id` handed to `canInstantBook` still answers "Carrier not found", so it stays dead; the §13.3 instant-book repair item must say that a repair which resolves by `userId` reaches `assignCarrier` with an `authenticate`-only, `authorize`-less route in front of it. |
| ~~F~~ **F — LIVE** | `PUT /api/loads/:id` → `updateLoad` `data.carrierId = carrierId` (`loadController.ts:1051-1067`), persisted by `prisma.load.update({ where, data })` at `:1107` | **CORRECTED 2026-09-20 (Phase B re-verification, executed not reasoned).** Phase A wrote that `updateLoadSchema = createLoadSchema.partial()` declares no `carrierId` so `validateBody` strips it. Wrong premise: `createLoadSchema` ends `}).passthrough()` (`validators/load.ts:127`, since `82d9822a`), Zod 3.25 `.partial()` carries `unknownKeys` forward — `updateLoadSchema._def.unknownKeys === 'passthrough'` and `safeParse({carrierId:'x', weight:1000}).data` returns both keys (a `.strip()` control in the same probe drops `carrierId`). So the branch RUNS: `complianceCheck` only when a `CarrierProfile` matches the supplied `userId`; **when none does (an AE's, a shipper's, any non-carrier `User.id`) the gate is skipped and the id is written** — the FK wants only `users.id`. Reachable by BROKER/ADMIN/CEO/DISPATCH via `PUT /api/loads/:id` `{carrierId}`. The only frontend PUT caller (`EditLoadModal.tsx:117`) does not send it, so no UI exercises it today. **This is a fifth live bypass, and a direct `Load.carrierId` writer outside `assignCarrier` while `carrierIdWriterDrift` is green** — see the blind-spot note. B2d removes it. | — (it is live) |

**Two guard blind spots found on row F, recorded — and both are LIVE, not latent:** `carrierIdWriterDrift` matches `carrierId` inside a `data:`/`create:` block of a `load` write and cannot see a hoisted `data.carrierId = …` assignment passed as shorthand `data` (§19 Sub-pattern 18 / Item 260's seventh-writer shape) — it reports 8/8 green on this tree while the writer at `:1061`/`:1107` exists, so its own comment "exactly one writer" is untrue; `audit-schema-drift` counts a derived schema (`.partial()`) as one of its 9 "unresolvable" and lists none of them, and under `passthrough` an undeclared read is legal anyway, so `--strict` cannot see it. B2d widens the drift guard to the hoisted + shorthand shape and injection-verifies that it names the removed site.

**What the five live bypasses mean for B2.** `CARRIER_ARCHIVED` and `CARRIER_NOT_APPROVED` in `complianceCheck` refuse nothing on A–D (or F), because nothing on them asks the gate. The directive's B2 already carries "by-id refusals: createTender / withTender / loadBids / instantBook / loadCompliance / waterfallEngine" — that list does not name `assign-match`, `fall-off-accept`, `broadcast`, or the manual position add, and it names two (withTender, loadBids) that already gate. The honest place for a by-id refusal that A–D cannot skip is the two chokepoints themselves — `createTender` and `assignCarrier` — which today check nothing about the carrier. That is a design decision for Wasi (a chokepoint that refuses is a different contract from one that only writes), not one for Phase B to take. **TAKEN 2026-09-20: B2b puts the gate inside `createTender` and `assignCarrier`; B2c makes fall-off-accept use `req.user.id` for a CARRIER; B2d removes the `updateLoad` branch.** Row D's position row at `waterfalls.ts:375` is not a tender row, so a coverage guard scoped to tender-row writers will not see it — the gate lands inside `createTender`, which `tenderPosition` calls at `:256`, so the OFFER is refused there and the position is skipped and advanced; the queued row itself stays, gateless, as a row that will never fire.

---

**§1 re-verified against origin as it stands (2026-09-20, Phase B open):** seventeen independent refuters over the eight THROUGH rows, the six BYPASS rows and three completeness critics (callers, raw writers, dead claims). Substance holds on every row except F (corrected above). Four rows carried the wrong path prefix — the tenders router is mounted at `/` (`routes/index.ts:339`), so it is `POST /api/loads/:id/tender`, `/api/tenders/:id/accept`, `/api/loads/:id/waterfall`, `/api/loads/:id/broadcast` — corrected in the tables. Row 8: `buildWaterfall` reaches `getEligibleCarriers` through `scoreCarriersForLoad` (one hop elided; the gate at `waterfallScoringService.ts:280` is exact) and the manual add-position route is a THIRD `waterfallPosition` writer that row D covers — row 8 must not be read as "every position is gated at write". Row B: `matchCarriersForLoad` pre-filters with `dispatchableCarrierWhere` (not `complianceCheck`); the accept ignores the match set, so the bypass stands. Row E: line is `ai.ts:437`. **Three facts for B2b/B2d that the tables do not carry:** (i) `assignCarrier` spreads `extra` LAST after `carrierId: carrierUserId`, and `extra` is typed `Prisma.LoadUncheckedUpdateInput`, which admits `carrierId` — a caller passing `extra: { carrierId }` silently overrides the gated value (no caller does today; zero hits), so B2b’s gate inside `assignCarrier` must refuse or strip `carrierId` from `extra`; (ii) `carrierLoads.ts:25` imports `assignCarrier` with zero call sites — a coverage guard that counts importers over-counts by one; (iii) row F also accepts `carrierId: null`, which clears the carrier without `carrierReleaseService` — B2d’s removal takes both directions. And row 8’s scored positions are tendered LATER by `tenderPosition` (after a decline, an expiry sweep, an AE skip, an archive advance) with no re-check at tender time, so the build-time gate is the only gate on the OFFER until B2b lands inside `createTender`.

## 2. Override or approval paths that today admit a non-APPROVED carrier to a tender — HALT AND REPORT, not ruled

`CARRIER_NOT_APPROVED` is ruled absolute and non-overridable. Anything below that admits a non-APPROVED carrier today is an existing mechanism the absolute would change.

1. **The blanket override releases SUSPENDED and REJECTED today.** `complianceCheck` pushes `"Carrier is suspended"` (`:269`) and `"Carrier application rejected"` (`:272`) as plain reasons — **no `blocked_code`, not added to `absoluteReasons`**. Under an active blanket override (`checkCode IS NULL`) the partition at `:608-610` keeps only `absoluteReasons` and releases the rest, so a SUSPENDED or REJECTED carrier becomes tenderable for 24h. `POST /api/compliance/carrier/:id/override-block` without `checkCode`, ADMIN/CEO, 15-per-30-days. The modal offers it (no code → nothing to disable on). **Making SUSPENDED/REJECTED absolute under CARRIER_NOT_APPROVED removes them from what a blanket override can release.** That is a behavior change to the override mechanism as ratified in Arc 26 (§14 "an override releases; it does not skip") — the §14 test says an override releases a judgment call, and whether SRL's own suspension is a judgment call an ADMIN may waive for a day is exactly the question. **Not ruled here.**
   Also released by a blanket override today, adjacent and worth stating: `"No signed carrier-broker agreement on file"` and `"Carrier-broker agreement has expired"` — neither is absolute. Not a status question, but the same waivability surface.
   Production today: **0 active overrides, 0 SUSPENDED, 0 REJECTED** (§3), so no live instance is affected at the moment of writing.
2. **Scoped overrides cannot reach status.** `SCOPED_CHECK_CODES` allow-lists only `AUTHORITY_TOO_YOUNG` and `CHAMELEON_UNREVIEWED`; a status reason carries no code. Unaffected by the absolute.
3. **The base gap, not an override:** `acceptTenderOnBehalf` (ADMIN/CEO) and the direct tender endpoint both run the gate, and the gate allows PENDING / REVIEWING / INFO_REQUESTED. So today an AE can, by API, tender to and accept-on-behalf for a non-APPROVED carrier that holds an executed BCA. Closing this is what B2 is for; it is listed so the change is named, not because it is an override.
4. **Approval-writing paths do not admit — they change status first**: `approveCarrier`, emergency approve, `verifyCarrier`, `updateCarrier`'s generic `onboardingStatus` write, `liftCarrierRejection` (→ REVIEWING), `restoreCarrier` (→ REVIEWING, B6c). The ones that can PRODUCE a non-APPROVED carrier with an executed BCA (the only population the gap reaches, since `sign-bca` refuses non-APPROVED at `carrierAuth.ts` 403 `NOT_APPROVED`): restore, lift-rejection of a previously-approved carrier, and the generic status write from APPROVED. None of them tenders.
5. **The BYPASSES in §1 admit any status at all**, because they never ask. Listed there.

---

## 3. Census — what the new absolute refuses beyond archive

Code-level (what each status meets today), then the production rows (read-only, 2026-09-20, `scripts/_readonly-b2-status-census.ts`, session `default_transaction_read_only = on`).

| onboardingStatus | `complianceCheck` today | blanket override | list pickers (7) | live flow that could tender to it today | production rows (2026-09-20) | after CARRIER_NOT_APPROVED |
|---|---|---|---|---|---|---|
| PENDING | **allows** (no reason) | n/a | excluded (APPROVED-only) | rows 1–3, 5–7 by API if the carrier holds an executed BCA — cannot, `sign-bca` refuses PENDING; only via status move after signing | 1, archived, no BCA | refused, absolute |
| REVIEWING | **allows** | n/a | excluded | same; **restore (B6c) is the reachable producer** — proven by B6d run 2 | 3, live, no BCA | refused, absolute |
| INFO_REQUESTED | **allows** | n/a | excluded | same | 0 | refused, absolute |
| REJECTED | blocks, "Carrier application rejected" | **releases it** | excluded | API + blanket override | 0 | refused, absolute — **changes the override (§2.1)** |
| SUSPENDED | blocks, "Carrier is suspended" | **releases it** | excluded | API + blanket override | 0 (Item 258's AEROSWIFT is no longer SUSPENDED) | refused, absolute — **changes the override (§2.1)** |
| archived (`deletedAt`, any status) | **allows** — the gate does not read `deletedAt` | n/a | excluded (B6a) | rows 1–7 by API; B6d PENDING(B2) #1 | 4 (1 PENDING real, 3 APPROVED test) | refused by CARRIER_ARCHIVED |
| `isTestAccount` | not read by the gate | n/a | excluded (v3.8.aim/alm) | rows 1–7 by API | 3 (all archived) | unchanged — not in B2 |

**Production facts that bound the change:** 11 carriers total. **No non-APPROVED carrier holds an executed broker-carrier agreement** (census §2 empty) — so on the day of writing, CARRIER_NOT_APPROVED refuses nobody a flow could otherwise reach. No live tender, in-flight load, queued/tendered position, or active override points at a non-APPROVED or archived live carrier. The 3 ACCEPTED tenders on archived test carriers are history (no in-flight load behind them). The population the absolute exists for is the one restore creates, and it is created only by restore, lift-rejection, or an admin's generic status write.

---

## 4. The tripwire that makes PENDING(B2) fail once `B2_LANDED` flips

`scripts/_carrier-archive-proof.ts` reports two checks as PENDING(B2) behind `const B2_LANDED = false`. The risk is the PENDING staying soft after the gate lands (§19 Sub-pattern 16: a check that cannot go red). Shape, as a CI-resident unit test:

`backend/__tests__/unit/services/archiveGateProofParity.test.ts`
1. Read `src/services/complianceMonitorService.ts`, blank comments, and detect `gateHasArchive = /blocked_codes\.push\(\{\s*code:\s*"CARRIER_ARCHIVED"/` and `gateHasNotApproved` likewise. Vacuity: the file must contain `blocked_codes.push({ code: "OFAC_MATCH"` (a known push), or the matcher is broken.
2. Read `scripts/_carrier-archive-proof.ts` for `/^const B2_LANDED = (true|false);$/m` — exactly one match, else fail.
3. Assert `B2_LANDED === (gateHasArchive && gateHasNotApproved)`: the flag flips in the commit that adds the codes and cannot lag or lead them.
4. Assert both codes are in the `BlockedCode` union (`src/services/complianceMonitorService.ts`) — `blockedCodeMirror.test.ts` then carries them to the frontend union and its absolute-count assertion (6 → 8).
5. Assert both are pushed with `overridable: false` AND added to `absoluteReasons` on the same reason string — the §14 mirror rule, which is what §2.1 above says is the decision still owed for SUSPENDED/REJECTED.
6. Assert `okB2(` appears in the proof for exactly the two checks, so a third soft check cannot be added without this test knowing.

In the proof itself, `okB2` already becomes `ok` when the flag is true; nothing changes there.

---

## 5. The third session's on-disk diff in the main checkout — recorded for re-verification

Read with `git diff` in `C:/Users/Wasi Haider/dev/silk-route-logistics` on 2026-09-20 (main at `2261d912`, origin at `5b382758`). Per the peer (silk-route-logistics-0e): this is a **third session's** work (compliance / OFAC / autoSuspendCause), that session is not live, and the peer's scope lock forbids landing or stashing it. So there is no commit coming from the peer to re-verify against; the block clears only by Wasi's instruction to whoever owns it.

| file | diff | hunks | overlap with B2 |
|---|---|---|---|
| `backend/src/services/complianceMonitorService.ts` | +250/− | import at `:17`; `fmcsaComplianceScan` ≥`:1334`; `dailyComplianceReminders`; `checkAutoReversal`; `processInsuranceExpiryEnforcement`; `monthlyCarrierReVetting`; `detectFmcsaAuthorityChanges` | **none** — 0 changed lines touch `absoluteReasons`, `blocked_codes`, `BlockedCode`, `SCOPED_CHECK_CODES`, `complianceCheck(`, or the status refusals at `:269/:272`; textual risk is the import block only |
| `backend/src/controllers/complianceController.ts` | 26 lines | import at `:4`; `suspendCarrier` `:718-733` | **none** with the override endpoint (`overrideBlock` at `:476`, `HARD_FLOOR_NOT_OVERRIDABLE` at `:530/:562`) |
| `backend/src/controllers/carrierVettingController.ts` | 3 lines | — | none |
| `backend/src/services/ofacScreeningService.ts` | 12 lines | — | none |
| `backend/prisma/schema.prisma` | +5 | `enum AuditAction` gains five values | none (B2 adds no schema) |
| `backend/prisma/migrations/migration_lock.toml` | EOL only | — | none |
| `backend/__tests__/unit/services/autoSuspendCauseCoverage.test.ts` | 34 lines | — | none |
| untracked: `backend/src/lib/carrierStatusAudit.ts`, `backend/__tests__/unit/services/autoReversalCause.test.ts` | new | — | none |

**PARKED 2026-09-20 (authorised by Wasi, one operation).** The nine paths — the seven above plus the two untracked companions, because three of the seven import `../lib/carrierStatusAudit` — were copied byte-exact from the main checkout into a new worktree on `hold/compliance-ofac-autosuspend` (from `2261d912`), verified identical on all nine by `cmp`, sha256 and an empty `git diff --no-index`, committed as `abd42c23` (unversioned; `migration_lock.toml`'s difference was line endings only and normalizes to the HEAD blob), and pushed to origin. Only then were the seven restored in the main checkout and main fast-forwarded to `origin/main` = `5b382758`. `stash@{0}` not popped; the two untracked originals left in place. **The third session, when resumed, starts from `hold/compliance-ofac-autosuspend`, not from the main checkout.** B2 is unblocked.

B2's own footprint: `complianceMonitorService.ts` (`complianceCheck` :175–~640 — two pushes, two absolutes, the `BlockedCode` union), `complianceController.ts` (the absolute set the override endpoint 409s on), `frontend/src/components/loads/OverrideComplianceModal.tsx` (mirror union + disabled submit), `blockedCodeMirror.test.ts` (count 6 → 8), the proof's flag, the tripwire in §4. Both backend files are dirty in the main checkout; B2 lands on this branch, and the hunks do not overlap, so the merge should be clean — **re-verify against the committed diff, not this table, when it lands.**

---

## 6. Halt

- **Stop condition 2 — four live gateless paths** (§1 A–D; D with a live UI caller). Decision needed: gate them individually, or make the two chokepoints (`createTender`, `assignCarrier`) refuse by id so nothing can skip the gate.
- **Halt-and-report — the blanket override** (§2.1): today it releases SUSPENDED and REJECTED; the ruled absolute would stop that. Decision needed before Phase B writes `absoluteReasons.add(...)` on those two reasons.
- **CARRIER_ARCHIVED's own absoluteness** is not yet ruled (only CARRIER_NOT_APPROVED was). Under the §14 admission test — a record state SRL itself set, with the login off — it is recommended absolute; recorded as a recommendation.
- **B2 is still blocked** on the third session's dirty `complianceMonitorService.ts`, and the peer cannot clear it. Phase B begins only when the seven files are clean on main, and begins by re-verifying §1 and §5 against what was actually committed.

---

## 7. Phase B close-out (2026-09-21)

Written after the B2 block, B5 and this pass; the halt items in §6 each carry their resolution here so nobody re-derives them from the commit log. Branch `arc/carrier-archive-recut`, `5b382758` → `1aaf3165` plus this docs commit; B2 pushed to origin 2026-09-21.

### 7.1 The §6 halt items, resolved

| §6 item | Decision (Wasi, 2026-09-20) | Where it landed |
|---|---|---|
| Stop condition 2 — four live gateless paths (A–D) + F | **The two chokepoints refuse by id.** `createTender` and `assignCarrier` ask `complianceCheck` themselves, before any write; a sixth surface cannot skip a question the chokepoint asks itself. | bdz (gate inside both, `lib/carrierEligibility.ts`); bea (A–D map the refusal: 403 with codes on A and B, a named `skipped[]` on broadcast, a `position_skipped` event on the cascade + 403 at the door); beb (B's actor rule); bec (F: the `PUT /loads/:id` carrierId branch is gone, the key is refused 400 by name) |
| Halt-and-report — the blanket override releases SUSPENDED / REJECTED | **It does not now.** Both status refusals were plain strings with no code; they are one absolute, `CARRIER_NOT_APPROVED`, with `status` on the code. | bdy; §14 absolutes table row |
| `CARRIER_ARCHIVED`'s own absoluteness — recommended, not ruled | **Ruled absolute.** Remedy is restore, its own decision with its own audit row. | bdy; §14 absolutes table row |
| B2 blocked on the third session's dirty `complianceMonitorService.ts` | Parked to `hold/compliance-ofac-autosuspend` (§5); main re-verified clean; Phase B opened on the seven files as committed. | §5 above |

### 7.2 Row F, restated as it turned out

Phase A called `updateLoad`'s carrierId branch dead behind the validator. It was live (`updateLoadSchema` ends in `.passthrough()`), it wrote `Load.carrierId` outside the single writer, and `carrierIdWriterDrift` reported 8/8 over it because the write rode a hoisted payload. bec removed the branch, refuses the key by name, and taught the scanner the hoisted shape (three fixtures, one negative). §19 Sub-pattern 18's third blind class, beside shorthand and the wrapped chain.

### 7.3 B5 — record custody at the database

`prisma/_pending_migrations/20260921120000_carrier_profile_fk_restrict` (commit `1aaf3165`, unversioned). The directive named a source branch, `hold/carrier-custody-restrict`, and six FKs. The branch does not exist anywhere — no local ref, no origin ref, no reflog, no doc — and the count is **seven**, derived from `schema.prisma` and the live migration SQL, which agree: five CASCADE (`load_tenders`, `quick_pay_enrollments`, `quick_pay_elections`, `carrier_training_requirements`, `info_requests`) and two SET NULL (`drivers`, `dock_schedules`). Authored, gated in its header, verified on a from-zero container (chain of 75 applied; the 14 authored ALTERs are byte-identical to what `prisma migrate diff` generates for the companion schema hunk; a hard delete of a carrier holding a driver is refused 23503 after and NULLs the driver before). **Not applied, and not in `prisma/migrations/`**: the gate has to read the seven constraint names off production first, by hand, because a name production does not carry would fail the deploy without `IF EXISTS` and leave a FAILED migration blocking every later deploy. The gate runner is local-only on purpose — see §13.3 Item 286.10.

### 7.4 Counts, corrected to source

| The directive said | Source says | Where |
|---|---|---|
| six list pickers | seven | B6a (`scripts/find-prisma-calls`) — Item 286.1 |
| six FKs | seven | B5 — Item 286.9 |
| row F dead | live | bec — §7.2 |

### 7.5 Left open by this arc, on purpose

- The peer's C6 (reason modal): the Archive… button posts no body and gets 422 until it lands. Before merge.
- B4b / C7: the page has no restore control (Item 286.7).
- Item 286.5: whether an archived carrier's fingerprint should match new registrants — a §14-text question.
- The B5 production gate and the move into `prisma/migrations/` with the schema hunk — one commit, after merge, by hand.
