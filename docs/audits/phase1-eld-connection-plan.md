# Phase 1 of the mandatory-ELD arc: Phase A read-only audit

**Baseline:** `main` at `9f1fc513`, confirmed equal to `origin/main` before any reading began.
**Date:** 2026-09-07.
**Sources:** `docs/audits/track-and-trace-mandatory-eld-audit.md` Parts 3, 4 and 5; CLAUDE.md §13.3 Item 261 banked list.
**Method:** eight read-only investigations, seven of them run as independent parallel readers with an adversarial verification pass over every file:line claim. No source file was edited. Production was read only through the production rail (`.env.production.local`, `default_transaction_read_only = on`, outbound API keys explicitly empty).

**Nothing here is built. This is a plan and a set of corrections.** Three of the brief's own premises turned out to be wrong against the tree, and each is called out where it falls rather than quietly worked around.

---

## A1. Compass recalc diagnosis

### The blocking cause

**`backend/src/services/integrationService.ts:1401`, the line `if (loads.length === 0) return; // No recent activity`.**

The job ran. Nothing about the cron plumbing suppressed it. It wrote nothing because both selected carriers have zero qualifying loads, so `recalculateCarrierCPP` returned before reaching its `prisma.carrierScorecard.create` at `:1524`.

### The plumbing, cleared in order

| Question | Answer | Evidence |
|---|---|---|
| Is the job registered? | Yes, unconditionally | `cron/index.ts:376`, `cron.schedule("0 23 * * 0", () => withGuard("compass-score-recalc", ...))` |
| Is it in the inventory? | Yes | `cron/index.ts:55`, and `__tests__/unit/cron/scheduledJobs.test.ts` asserts both directions |
| Is `initCronJobs()` called at boot? | Yes, unconditionally | `server.ts:303`, inside the `app.listen` callback. No `NODE_ENV` gate anywhere in `cron/index.ts` |
| Does `withGuard` suppress silently? | Only if a previous run is still in flight | `cron/index.ts:87-90`. In-memory mutex, weekly job, so a stuck run needs a 7-day-old process |
| Does the selection return the carriers? | Yes, both | `integrationService.ts:1951-1953`: `onboardingStatus APPROVED`, `isTestAccount false`, `tier notIn ["NONE"]`. Both APPROVED carriers are `tier=GUEST`, which passes |

Production confirms the shape: **zero loads exist in the database at all**, and there are only 11 `carrier_scorecards` rows ever, the newest two dated 2026-09-01 and 2026-09-02.

### The two newest rows are approval seeds, not recalc output

Both carry `gpsCompliancePct=80, overallScore=88, period=MONTHLY`, which is the literal payload of `onCarrierApproved` at `integrationService.ts:51-69` as it stood on those dates. A recalc row from the same deployed code would have carried `gpsCompliancePct=100`, not 80. So AEROSWIFT and AMERICAN EAGLE were seeded at approval and have never been recalculated.

**Consequence for Phase 0.** `v3.8.bax` stopped the seed writing 80 for future approvals, but it did not backfill. Because the recalc returns at `:1401` for a carrier with no loads, **the stale 80 on those two rows will never be corrected by the recalc**. It sits there until the carrier delivers a load.

### The GUEST dead zone, which is the more interesting finding

For a GUEST-tier carrier the write at `:1524` is reachable only in a narrow band:

- **0 loads** dies at `:1401`.
- **3 or more loads** dies at `:1382`, because the GUEST branch at `:1380` calls `checkGuestPromotion` (`tierService.ts:33`), which returns true at 3 or more DELIVERED/COMPLETED loads with a latest `overallScore` of 70 or better (`tierService.ts:44-51`). The approval seed's `overallScore: 88` satisfies the score half permanently.

So the reachable band is **1 to 2 completed loads**. Today `:1401` fires; the moment a carrier delivers a third load, `:1382` takes over. This is not the cause of the Sunday miss but it is a live gap that a naive fix would walk into.

### Observability is the real defect

Nothing on any path of this job writes to `SystemLog`. `cron/index.ts:378-383` is pino-only, and `withGuard` writes nothing at all. **A run, a skip and a crash are indistinguishable from the database, by construction.** A previous session queried `system_logs` for a recalc trace, found none, and that proved nothing. `cron_registry` is no better: it holds 22 rows and `lastRun` is NULL on every one of them, and no `compass-score-recalc` row exists there at all.

### Proposed fix

1. **Observability, roughly 45 LOC across two files.** Give `recalculateCarrierCPP` a tagged return (`{ written: boolean, reason: "no-profile" | "promoted" | "no-loads" | "written" }`), tally the reasons in `processAllCPPRecalculations`, and write one `SystemLog` run-summary row from the cron body, matching the pattern an existing cron already uses at `cron/index.ts:408`.
2. **The GUEST dead zone, roughly 10 LOC.** Decide whether a GUEST carrier crossing the promotion threshold should get a scorecard row before promotion returns. This must be designed, not patched: `checkGuestPromotion` is the §10 M1 gate, and changing its interaction is how an unvetted carrier gets promoted.

**Migration: NO.**

---

## A2. Item 194 soak counters

### Today

Two module-level `let` bindings are the entire mechanism: `loadTransitionObserver.ts:74` (`violationsSinceBoot`) and `:75` (`unexpectedSinceBoot`), incremented at `:114-115`, exposed through `statusMachineCounters()` at `:77-78` and rendered by `/api/health` via `routes/index.ts:139`. Per-process, in memory, reset by every deploy.

The structural problem is arithmetic: there have been 35 successful CI runs on main since 2026-09-01, so the process rarely survives long enough for the window to mean anything. A reading taken minutes after a deploy says only that nothing has happened yet, which is exactly the caution Item 201 already records.

### Proposed design

A new singleton table, `StatusMachineCounter`, recommended over reusing an existing model for three reasons in the order that decides it:

1. The counter is incremented from a hot write path, so it needs an atomic `{ increment: n }` on a uniquely-keyed row. `CronRegistry` is the only existing model with that shape, but squatting a fake `jobName` row there would put a phantom job into every cron-registry read path.
2. `/api/health` must read it in O(1). Counting `SystemLog` rows is O(n) over an unbounded, unpruned table with no index on `source`.
3. **The decisive one: `countingSince` must be a stored timestamp, not derived.** If the window start were inferred from the oldest surviving log row, a retention purge would silently move the soak window and make the gate look satisfied when it is not. That is the same silent drift the whole item exists to eliminate.

The model carries `countingSince`, `violations`, `unexpected`, `lastViolationAt`, `lastEdge`, `deploys`, `lastSha`. `lastEdge` is not decoration: the standing instruction is that a non-zero count is a transition to go and read, and today the only record is a `log.warn` that lives in Render's ephemeral stream and is gone by the time anyone reads the counter.

`/api/health` reports both `cumulative_since` (with its timestamp) and `since_boot`, cached in-process with a short TTL and never throwing, mirroring the `storage`/`parser` functional-probe pattern already in that endpoint.

**Restated soak criterion:** zero cumulative violations across at least 10 gated deploys and at least 3 calendar days, read from `deploys` and `countingSince` rather than remembered.

**Migration: YES.** One additive table. No column added to an existing model, nothing dropped, no backfill.

---

## A3. Carrier scorecard contract

### The gap, both directions

The page destructures seven keys at `scorecard/page.tsx:119` from `api.get("/carrier/scorecard")` at `:106`. The handler at `carrierController.ts:1293` returns seven keys at `:1312-1323`. They overlap on four.

- **Read but never returned:** `metrics`, `history`, `bonuses`. Also `milestone`, `milestoneLoads`, `daysActive`, read by the Milestones block.
- **Returned but never read:** `scorecards`, `nextTierThreshold`, `pointsToNextTier`.

### Recommendation: fix the endpoint

The brief offered "endpoint derives them from the scorecards it already fetches" or "page reads scorecards directly". **The first is right, but not as worded:** `bonuses` cannot come from the scorecard rows, because `CarrierScorecard` carries only a scalar `bonusEarned` with no type, status or description. It needs one extra query, copied verbatim from `getBonuses` at `:1404-1407`.

Roughly 10 backend lines inside one function, zero frontend lines:

- `metrics: scorecards[0] ?? null`. The page indexes by seven KPI keys that are byte-identical to the `CarrierScorecard` columns, so no mapping layer is needed. This also preserves the Phase 0 tracking sentinel contract: `gpsCompliancePct` passes through as stored and the page's own guard suppresses it when `trackingMeasured` is false.
- `history: [...scorecards].reverse()`. The fetch is `calculatedAt: "desc"` and the page labels W1..Wn by array index, so aliasing without the reverse would render the trend backwards.
- `bonuses`, `milestone`, `milestoneLoads`, `daysActive` from the already-loaded profile.
- **Keep `scorecards`.** Two other surfaces read it.

The client-side alternative cannot close 4 of the 7 gaps at any price: `milestone`, `milestoneLoads` and `daysActive` are `CarrierProfile` columns absent from every scorecard row, so the 114-line Milestones block stays broken unless the backend is edited anyway.

**Migration: NO.** Every field already exists and is already populated.

---

## A4. Carrier vetting-report route

### Confirmed

- `compliance/page.tsx:156` calls `api.get("/carrier/vetting-report")`.
- The `catch` at `:158` falls back to `/carrier/scorecard` and synthesises a report with `checks: []`.
- **There is no `/vetting-report` route on the singular carrier router.** The only one repo-wide is `carriers.ts:145`, `:id`-scoped on the plural router, with an authorize list that excludes CARRIER.
- The data exists: `VettingReport` at `schema.prisma:3558`, written on every vetting run by `vetAndStoreReport` at `carrierVettingService.ts:1065`, indexed on `carrierId` and `createdAt`, which is exactly the access pattern a new handler needs.

### Proposed

A new `getOwnVettingReport` handler placed after `getScorecard`, resolving the profile from `req.user.id` rather than any path parameter, so **a carrier cannot name another carrier's id**. The check projection is an explicit allow-list build of `name`, `result`, `detail`, not a `delete c.deduction`, so anything the engine adds to a check later stays server-side by default. Per-check deductions, internal snapshot fields and notes are withheld.

The page's scorecard fallback is deleted so an error renders as an error.

Roughly 35 backend lines, one route line, minus 21 frontend lines.

**Migration: NO.**

---

## A5. Per-carrier ELD connection, Motive and Samsara only

### Today

Both adapters are single-tenant: one global env credential, one global fleet. The per-carrier scaffold exists in schema and is entirely dead. `eldApiKeyEncrypted`, `eldExternalAccountId` and `eldConnectedAt` have no writer.

### Env-var retirement, sequenced

`MOTIVE_API_KEY` and `SAMSARA_API_TOKEN` **cannot be deleted in the same change that adds per-carrier credentials.**

- **Retire immediately:** the header builders at `motiveService.ts:18,24` and `samsaraService.ts:18,24`. `getHeaders()` becomes `getHeaders(connection)`; `isConfigured()` is deleted, since per-connection code either has a row or it does not.
- **Rewrite, do not retire:** `routes/eld.ts:81-84` and `schedulerService.ts:586-589` call the processors with zero arguments and have no carrier in scope. These are what break if the keys simply vanish.
- **Keep for now:** `adminController.ts:302,308` and `pluginsInit.ts:40,52` are status telemetry only.
- **Explicitly out of scope:** `SAMSARA_WEBHOOK_SECRET` and `MOTIVE_WEBHOOK_SECRET` stay single-tenant. Per-carrier OAuth does not make webhooks multi-tenant, and nobody should assume it did.

### Routes and token storage

A new `carrierTelematics` router with `authorize` and `authorize` callback paths: a CARRIER-authed `authorize` that mints and cookie-stores a state value, a **public, state-validated** `callback` (a cross-site top-level navigation carries no guaranteed cookie of ours), and a CARRIER-authed `disconnect`. The mount must be added to `CARRIER_PORTAL_MOUNTS` at `middleware/auth.ts:190-197` or the existing 2FA-wall guard test fails.

Storage reuses `eldApiKeyEncrypted` for the refresh token and adds five nullable columns: `eldAccessTokenEncrypted`, `eldTokenExpiresAt`, `eldProviderCompanyName`, `eldProviderDotNumber`, `eldOwnershipMatch`. The last three store the provider's returned identity verbatim as dispute evidence.

**Encryption:** call the exported `encrypt`/`decrypt` from `utils/encryption.ts` at the two call sites rather than extending the transparent `ENCRYPTED_FIELDS` map in `config/database.ts`. That map is applied on every write to the model and would double-handle values other paths already write to `CarrierProfile`; the codebase's own comment records that TOTP stayed out for exactly this reason.

### Ownership check, and the unknown that gates it

Samsara `GET /me` yields `carrierSettings.dotNumber` and `carrierName`. Motive `/companies` yields `name`, `company_id` and `dot_ids`. DOT compares exact-equal against `CarrierProfile.dotNumber` after stripping non-digits and leading zeros, and is a hard gate. Company name compares after normalisation and is a warning only, recorded as `eldOwnershipMatch = "NAME_MISMATCH"`.

**OPEN QUESTION, and it blocks the Motive hard gate: `dot_ids` semantics.** It is an array, nothing in this repo calls `/companies`, and the prior audit records that Motive's own documentation examples show **alphanumeric** values, which is inconsistent with a USDOT and suggests internal record identifiers. Three sub-questions must be answered by Motive: are the elements USDOT numbers or internal ids; if a list, does match mean membership (so a connected account can cover DOTs SRL never vetted); and can one USDOT appear across several Motive companies (in which case `eldExternalAccountId` is not a stable unique key). **Until the first is answered, ship Motive DOT matching in warn-only mode and hard-gate Samsara only.** Samsara's `dotNumber` is a plain integer and carries no such ambiguity.

Also unverified in-repo: the Samsara `/me` response shape itself. The field names come from the brief and a prior audit doc, not from anything executable here. Confirm against a live response before writing the parser.

### On mismatch

Do not write the credential, do not set `eldEnabled`, discard the token in memory. Record an `AuditLog` row directly rather than through the `auditLog()` middleware, because that middleware only fires on 2xx and the refusal path redirects. Notify ADMIN users through `createNotification`. Redirect the carrier to settings with a reason code, so the block names its exit.

### The fan-out fix

Today `samsaraService.ts:209-216` and `motiveService.ts:194-201` select **every** active load for the carrier and loop, so a truck on load A stamps load B's timeline, and `ELDEvent.loadId` ends up as whichever load sorted last. Replace the `findMany` with a single-load resolve keyed on the unit, matching `Load.truckNumber` or VIN against the vehicle, and match driver name against `ELDEvent.driverName`.

**ID-space hazard, called out because it has already cost this codebase months:** `ELDDeviceMapping.carrierId` and `Load.carrierId` are both `User.id`, while every Compass and vetting table keys on `CarrierProfile.id`. A connection row stored on `CarrierProfile` means the poll loop must translate on every tick. This needs a decision, not an inference.

**Migration: YES.** One additive migration on `carrier_profiles`, five nullable columns, zero backfill.

---

## A6. The dispatch gate

### The census in the source audit is wrong, and so is the brief

**There are four writers of `Load.status = "DISPATCHED"`, not three.** The source audit says three at `track-and-trace-mandatory-eld-audit.md:271` and misses the fourth.

| # | Site | Driver |
|---|---|---|
| 1 | `routes/loadBids.ts:234` | auto-pilot, has `complianceCheck` at `:205` |
| 2 | `waterfallEngineService.ts:603` | auto-pilot, has `complianceCheck` at `:520` |
| 3 | `loadController.ts:617` | AE, gated by `validateLoadStatusTransition` at `:543` |
| 4 | `rateConfirmationController.ts:875` | **AE, missed by the source audit.** TENDERED to DISPATCHED on RC finalize |

A gate wired to "the three DISPATCHED writers" leaves the finalize edge open.

**Four of the six paths the brief calls auto-pilot do not write DISPATCHED at all.** Broadcast tender writes TENDERED; instant book, fall-off recovery and automation match write BOOKED. **Three of those four run no compliance check whatsoever.** A dispatch-time gate structurally cannot reach them. That is a separate finding and a larger one than the gate itself: it means there are live paths that put a carrier on a load with no compliance evaluation at any point.

### Proposed `trackingReadiness(loadId)`

A new `trackingReadinessService.ts`, shaped deliberately like `complianceCheck` so the existing UI plumbing renders it with no new transport. Verdicts worst-first: `NOT_CONNECTED`, then `UNIT_NOT_MATCHED`, then `DRIVER_NOT_VERIFIED`, else `READY`. A carrier with no feed at all should not first be told to pick a truck.

The three new codes join the `BlockedCode` union in `complianceMonitorService.ts:70` rather than being redeclared, so the existing mirror guard forces the frontend modal to move with them. All three are **waivable**: none is a fact held by another party, so per §14 none belongs in the absolute set. All three must also be added to `SCOPED_CHECK_CODES`, or the override endpoint answers `400 UNKNOWN_CHECK_CODE`, which is precisely the "block names the wrong remedy" defect §14 already records.

Every code carries a message and an `action { href, label }`, following the one existing implementation of the block-names-its-exit rule at `rateConfirmationController.ts:565-589`.

### Fallback tier for a carrier whose provider has no API

Driver ping at a fixed cadence, configured through the existing check-call schedule machinery, with a Compass consequence and exclusion from auto-pilot. **Never SMS-only.**

**Migration: NO for the four verdicts as specified.** Every input already exists. YES if the verdicts are to be persisted rather than computed on read.

---

## A7. Contract

### What §22 says today

Authored at `docs/legal/bca-content-F11.md:159-162`, compiled verbatim into `brokerCarrierAgreement.generated.ts:217-222`. The sentence a mandatory-ELD amendment must replace is at `:161`:

> "Tracking may be by any mutually agreed method, including ELD integration, third-party tracking platforms, BROKER's carrier portal, driver-initiated location sharing, or manual check calls. BROKER will not require CARRIER to integrate any particular ELD platform as a condition of doing business."

Manual check calls are an enumerated substitute, so no ELD is compelled. Note the election is **mutually agreed**, that is bilateral, not a unilateral carrier election.

The second sentence is a **vendor-neutrality** covenant, not an ELD-optional one, and it is textually severable. It should be preserved. Both sentences live on one physical line and inside one clause string, so preserving the second means rewriting the line rather than deleting it.

The RC prints no ELD covenant at all. `srl-chrome.ts:1957` pushes only:

> "Status updates through the SRL carrier portal, or by call or text to (269) 220-6760."

### DRAFT FOR COUNSEL (Dirk Beckwith), not reviewed and not approved

Full replacement §22 text, a single replacement RC covenant line, and the driver consent changes are in the appendix at the end of this report. No legal citations are invented; where a statutory hook would normally sit it is left to counsel. Two drafting notes matter for the build:

- **No transmission-interval figure is proposed.** A number there is an operational commitment SRL would owe on every load, and there is no basis in the tree for choosing one.
- The new representation clause puts USDOT-ownership risk on the carrier's representation rather than on SRL's verification. **The build must not read that as evidence the ownership check is unnecessary.**

### Driver consent, and why it does not wait for the amendment

The feed carries driver name (`schema.prisma:5079`, populated at `motiveService.ts:153` and `samsaraService.ts:306`), phone and position. **None of it originates from the driver's handset or from any act by the driver.** The ping page currently tells the driver, at `driverPing.ts:96-98`, that SRL does not receive their location at any other time. **A connected feed makes that sentence false, not merely incomplete.**

The consent constant is versioned and the version is interpolated into the text itself and snapshotted onto each row, so the wording cannot be edited in place without bumping the constant.

**These changes are due before the first live feed and their timing is independent of the BCA amendment.** The ping-page sentence is not a contract term at all: it is a factual representation to a person who is not a party to the BCA, and it becomes untrue the moment the feed exists regardless of what any carrier has signed.

### The gate must remain advisory

**The mandatory-ELD dispatch gate must remain advisory, surfacing a warning and never returning a blocking code, for every carrier that has not executed the amended BCA.**

Why, in one sentence: a block enforcing a term the signed paper does not contain is a term SRL is imposing without agreement.

Mechanically the enforcing branch is conditioned **per carrier, not per deployment**. There is no date on which the gate flips globally, because there is no date on which every carrier has signed. The per-carrier test needs no migration: `CarrierAgreement.version`, `status` and `signedAt` already exist.

---

## A8. Sizing, forward sequence only

| # | Step | Files | LOC | Migration | Depends on | Tests |
|---|---|---|---|---|---|---|
| 1 | A1 recalc observability and GUEST dead zone | 2 | ~55 | NO | none | tagged-return unit tests; a guard that the reason tally is written |
| 2 | A2 cumulative counters | 7 | ~200 | **YES** (new table) | none | increment atomicity; health reports both windows; countingSince cannot drift |
| 3 | A3 scorecard contract | 1 | ~10 | NO | none | response-shape test pinning all 13 keys; the reverse on history |
| 4 | A4 vetting-report route | 3 | ~35 backend, -21 frontend | NO | none | ownership scoping (carrier A cannot read B); deduction withheld |
| 5 | A5a schema and OAuth | ~6 | ~450 | **YES** (5 nullable columns) | 4 | state validation; token never in a response body; encryption round-trip |
| 6 | A5b ownership and matching | ~6 | ~700 | NO | 5 | DOT normalisation; refusal path writes no credential; ping lands on one load |
| 7 | A6 the gate, log-only first | 10 | ~400 | NO | 6 | all four DISPATCHED writers covered; codes are waivable and scoped |
| 8 | A7 paper, runs in parallel from the start | 5 | ~40 | NO | none for drafting; step 7 enforcement depends on it | agreement content parity test; consent version bump |

**A7 is parallel and should start first**, because it is the only step with an external dependency (counsel) and the only one that gates step 7's enforcement flip.

---

## Halt

**Report path:** `docs/audits/phase1-eld-connection-plan.md`

**A1 blocking cause:** `backend/src/services/integrationService.ts:1401`, `if (loads.length === 0) return;`. The cron is registered at `cron/index.ts:376`, `initCronJobs()` is called unconditionally at `server.ts:303`, `withGuard` did not suppress it, and the selection at `:1951-1953` returned both APPROVED carriers. The job ran and wrote nothing because neither carrier has a qualifying load, and production has no loads at all. A second guard at `:1382` will take over as the blocker the moment either carrier delivers a third load.

**Migration count: 2 confirmed, 1 conditional.** A2 adds one table. A5a adds five nullable columns to `carrier_profiles`. A6 needs one only if the readiness verdicts are persisted rather than computed on read. A1, A3, A4 and A7 need none.

**Three riskiest steps:**

1. **A5b, ownership and matching.** Two provider payload shapes are unverified in this repo, and the Motive `dot_ids` semantics are unknown in a way that may leave Motive with no usable DOT signal at all. It also rewrites which load every ping lands on, so a mistake silently rewrites live tracking history rather than failing loudly.
2. **A6, the gate.** The source audit's own writer census was wrong, three auto-pilot paths run no compliance check at any point so the gate cannot reach them, and enforcing before a carrier has executed the amended BCA imposes a term they never agreed to.
3. **A1's GUEST dead-zone half.** It touches `checkGuestPromotion`, which is the §10 M1 advancement gate. A wrong edit there promotes an unvetted carrier past the gate, which is a worse outcome than the missing scorecard row it is trying to fix.

**Phase B has not started and will not start without confirmation.**

---

## Appendix. DRAFT FOR COUNSEL (Dirk Beckwith)

**NOT REVIEWED. NOT APPROVED. NOT RATIFIED.** No part of this has been seen by counsel, and nothing here asserts otherwise. No legal citations are offered; where a statutory or regulatory hook would normally sit, it is left to counsel rather than invented.

### A. Replacement BCA §22

Replacing `docs/legal/bca-content-F11.md:159-162`. Register matched to the surrounding prose: third person CARRIER and BROKER, "shall" for duty and "will" for BROKER's own undertaking, numerals spelled then bracketed, no lists inside a clause. **The generated TypeScript is never hand-edited**; it is regenerated by `npx tsx scripts/generate-agreement-content.ts` run with cwd `backend/`, and a parity test asserts the two match.

**Clause 1, unchanged from `:160`.**

> CARRIER shall provide location updates as reasonably requested, including pickup confirmation, in-transit updates and delivery confirmation with signed Proof of Delivery, and shall respond to check-call requests within thirty (30) minutes during business hours. CARRIER shall give BROKER contact information for the driver on each load.

**Clause 2, replaces `:161`.**

> CARRIER shall maintain an electronic logging device on each power unit used in BROKER's service and shall keep that device connected to BROKER's platform through a telematics provider BROKER supports, from dispatch through delivery of each shipment. BROKER does not require any particular telematics provider, and CARRIER may connect through any provider on BROKER's then-current supported list. Where CARRIER's provider is not on that list, CARRIER shall tell BROKER before accepting a shipment, and BROKER may accept an alternative method for that shipment in writing. A connection that lapses through equipment failure or absence of cellular coverage is not of itself a breach, but CARRIER shall restore it as soon as reasonably possible and shall provide manual check calls at intervals of two (2) hours while it is down.

**Clause 3, new.**

> CARRIER represents that each telematics account it connects is CARRIER's own account, for equipment CARRIER operates under its own USDOT number, and that CARRIER has obtained from every driver whose name, mobile number or position that account carries the consent necessary for BROKER to receive and use that data for shipments CARRIER hauls for BROKER. BROKER will use that data only to track shipments tendered under this Agreement, to meet BROKER's obligations to the shipper, and to retain the record of a shipment, and BROKER will not use it to observe CARRIER's drivers outside those shipments.

**Clause 4, unchanged from `:162`.**

> Where CARRIER or its driver gives a mobile number for operational messaging, CARRIER consents and confirms it has the driver's consent to receive operational and tracking messages at that number. A recipient may opt out at any time by replying STOP, and BROKER will honor it. Opting out does not affect CARRIER's standing under this Agreement or its Compass Score.

**Drafting notes.**

1. The vendor-neutrality promise from the old `:161` is deliberately kept, restated as "BROKER does not require any particular telematics provider." Only the method-election sentence is removed. Dropping neutrality would concede lock-in the amendment does not need.
2. **No transmission-interval figure is proposed.** A number there is an operational commitment SRL would owe on every load, and there is no basis in the tree for choosing one. Left for ops and counsel.
3. Clause 3 sentence 1 is the contractual counterpart to a USDOT-ownership check that does not exist in code. As drafted it puts the risk on CARRIER's representation rather than on SRL's verification. Counsel may prefer that; **the build must not read it as evidence the check is unnecessary.**
4. Clause 3 sentence 2 is a use-limitation running against BROKER. It is the consideration that makes sentence 1 askable.

### B. Replacement RC covenant line

One line, replacing `backend/src/lib/srl-chrome.ts:1957`, pushed **only** where the carrier has executed the amended BCA:

> Connected ELD required from dispatch through delivery; status also through the SRL carrier portal, or by call or text to (269) 220-6760.

The existing string must remain the fallback for every carrier still on unamended F11. Selecting between the two uses the same executed-amendment test the gate uses. Printing "required" to a carrier whose signed BCA contains the method-election sentence would state a term that carrier never agreed to, on the document §24 makes binding at pickup.

### C. Driver consent changes, required and independent of the amendment

**C1. `driverPing.ts:96-98`.** The current sentence becomes false the moment a feed exists. Proposed replacement:

> Tapping the button sends your current position to Silk Route Logistics for this load only. While you are hauling this load, your carrier's electronic logging system also sends us your name and your truck's position without you doing anything; this button is for when that feed is down or your carrier has not connected one. You can ignore this message with no effect on your load or your pay.

The neighbouring lines at `:92-93` ("This shares your position one time, right now. It does not track you") carry the same problem and must move with it.

**C2. `driverVerificationService.ts:39-44`.** Bump `DRIVER_SMS_CONSENT_VERSION` to a new value and add one sentence. **Do not edit the v1 string in place:** the version is interpolated into the text and snapshotted onto every row, so editing in place would leave new rows self-describing as v1.

> Your carrier's electronic logging system also sends us your name and your truck's position while you are hauling our load, and that happens whether or not you tap anything.

**C3.** Both are due before the first live per-carrier feed, and their timing does not ride on the BCA amendment. C1 is not a contract term at all: it is a factual representation to a person who is not a party to the BCA, and it becomes untrue the moment the feed exists regardless of what any carrier has signed.

**C4.** Drivers who consented under v1 and are later assigned a load under a live feed should be re-shown the new text. A re-consent path already exists at `driverVerificationService.ts:189-199`. Whether it must be exercised here is counsel's to say.

---

## Phase B outcome -- 2026-09-08, `v3.8.bbn` → `v3.8.bbs`

Six commits, in the ruled order. Baseline `9f1fc513`; this report was written
read-only against that baseline before anything changed.

| Commit | Ruling | Est. source | Actual source | Files |
|---|---|---|---|---|
| `a2c96b6d` v3.8.bbn | A1 write-always | 95 | 72 (+228 test) | 4 |
| `c196a4a8` v3.8.bbo | A1b observability | 140 | 113 (+260 test) | 2 |
| `53ca089e` v3.8.bbp | A2 cumulative counters | 380 | 244 (+542 test/script) | 4 |
| `9fe25c05` v3.8.bbq | A3 scorecard payload | 120 | 134 (+212 test) | 3 |
| `5b9a8885` v3.8.bbr | A4 vetting report | 190 | 119 (+215 test) | 3 |
| `1a54a0ea` v3.8.bbs | ping consent text | 70 | 22 (+145 test) | 1 |

Every commit came in under its estimate except A3, which was 11.7% over and
inside the 20% threshold. Commit 1's 300-line figure against a 95-line estimate
was ruled on separately and is recorded in its own message: the estimate sized
source only, and the ruling required a locally mocked, injection-verified test.

### Deviations from this plan, and why

**C1 shipped CONDITIONAL, not unconditional.** This report proposed:

> While you are hauling this load, your carrier's electronic logging system also
> sends us your name and your truck's position without you doing anything

That sentence asserts the feed exists. **Today no carrier has `eldEnabled`**, so
it would have been false for every driver who read it, and it stays false for any
carrier who never connects one. The shipped wording is conditional in its own
text -- "if your carrier has connected a telematics or ELD feed to us, we also
receive your truck's location from that feed while this load is active, whether
or not you tap" -- which is true for both populations, needs nothing looked up
(the handler deliberately performs no load lookup), and tells the driver to ask
their carrier which case they are in. It also names the carrier as the party who
connected the feed rather than SRL as one who took it.

The neighbouring `:92-93` clause moved with it, as this report required: "It does
not track you" is gone.

**C2 was NOT done, and is still open.** This report proposes bumping
`DRIVER_SMS_CONSENT_VERSION` and adding a positive ELD disclosure to the stored
SMS consent. That was outside the ruled scope of commit 6, which named the ping
page. It is worth separating the two claims so the omission is not read as a
disagreement:

- **Correctness:** the current SMS consent contains nothing false. It is
  TCPA-scoped -- who is texting, about what, how often, rates, how to stop -- and
  makes no claim about location retention. A test now asserts it stays that way,
  because a promise added there would contradict the ping notice on rows already
  written.
- **Disclosure completeness:** C2's point stands regardless. The consent moment
  is where a driver is told what SRL will do, and a positive disclosure there is
  an improvement even though the absence of one is not a falsehood.

C2's own timing note governs: due before the first live per-carrier feed, and
independent of the BCA amendment. C4 (re-showing the new text to drivers who
consented under v1) rides with it.

**A1's GUEST dead-zone half was not done**, as this report recommended. It
touches `checkGuestPromotion`, the §10 M1 advancement gate; a wrong edit there
promotes an unvetted carrier past the gate, which is worse than the missing
scorecard row it would fix. Banked as CLAUDE.md §13.3 Item 263 with the shape and
the decision it needs.

### Found during Phase B, not predicted by Phase A

**The scorecard page was reading six fields the endpoint never returned.**
`metrics`, `history`, `bonuses`, `milestone`, `milestoneLoads`, `daysActive` --
so all seven Compass gauges rendered 0.0%, the trend chart was empty, the
bonuses table could never appear, and the milestone panel read 0 loads / 0% /
0 days against the §10 thresholds. Nothing errored, because every read was an
optional chain taking its default.

**The compliance page manufactured a vetting verdict from the performance
score.** `GET /carrier/vetting-report` did not exist; the page caught the 404 and
derived grade, risk level and recommendation from the Compass Score. A carrier
was shown a vetting grade computed from their on-time percentage.

**A1's factor nulls had a trap the audit did not name.** `claimRatio` is the
inverted term, scored `100 - claimRatio`, and `100 - null` is `100` in
JavaScript -- so widening the type would have credited an unmeasured carrier with
a flawless claim record.

### Still open after Phase B

- **Per-factor measurability on the scorecard.** A zero-denominator factor
  persists as the 0 sentinel and the column cannot say which it is;
  `trackingMeasured` covers one factor because `eldEnabled` is the only
  measurability signal surviving to read time. Needs a nullable column or the
  factor computation extracted from the recalc.
- **C2 and C4** above.
- **A5 and A6**, deferred to a second Phase B with their decisions already fixed.
- **B. The BCA amendment and the §24 method-election sentence** -- counsel's, per
  section A7 of this report.
