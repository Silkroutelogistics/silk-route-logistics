# §14 — legal and compliance status

Moved out of `CLAUDE.md` on 2026-09-23. **Load this for compliance-gate work,
agreements, termination, carrier archive, Quick Pay terms, or anything that touches
what SRL is contractually or legally bound to.** Cited 108 times.

The largest thing in it is the **nine absolutes** table and the rule behind it — an
override releases a judgment call, never a fact — together with the test for
admission to that set. That is the rule a compliance change is measured against, and
it is here rather than resident because a session not touching the gate does not need
it loaded.

**§14.1 (sandbox traps) deliberately stayed in `CLAUDE.md`.** It is labelled §14 but
it is not legal content: it is three environment traps that cost real time in *any*
session, which is the definition of always-loaded.

Section numbers unchanged; see `README.md`.

---

## §14 LEGAL / COMPLIANCE STATUS

- Property broker under 49 U.S.C. §§ 13904, 13906
- **Carmack Amendment:** SRL is NOT liable as a motor carrier. Carriers sign the bill of lading and assume Carmack liability per the Broker-Carrier Agreement.
- **BMC-84 bond:** $75,000, filed with FMCSA, surety PFA Protects (CA# 0M18074) — full detail in §1. No carrier-facing agreement restates the bond provisions and none needs to: the bond is a filing with the FMCSA, not a term between SRL and a carrier, and per the counsel-confirmed architecture covenants live in the Broker-Carrier Agreement. The citation that stood here to "Caravan Quick Pay Agreement v2 (Article 20)" pointed at a document that does not exist in this repo; removed 2026-08-16.
- Michigan governing law, Kalamazoo County venue for disputes.
- Non-solicitation 12 months post-termination, 15% liquidated damages (Flock pattern).
- **Broker-Carrier Agreement — exists in-house, pending counsel.** The body is `BROKER_CARRIER_AGREEMENT` in [`backend/src/data/agreements.ts`](backend/src/data/agreements.ts): 11 sections, `BCA_VERSION = 2026-06-27-v1`. It is the master agreement governing every tendered load. The agreement PDF renders from it, the carrier portal fetches it (`GET /carrier-auth/agreement/broker-carrier`), the onboarding click-through presents it, and carriers sign it today. A standalone `.docx` is no longer the mechanism: this file is the source and the PDF is generated, so the review pane, the click-through, and the executed PDF cannot disagree on the *body* — and, since v3.8.asb, cannot disagree on the *version* either. [`frontend/src/app/onboarding/page.tsx`](frontend/src/app/onboarding/page.tsx) used to keep a hardcoded `BCA_VERSION = "2026-05-24-v1"` as the fallback behind its fetch (`bcaContent?.version ?? BCA_VERSION`), so a failed fetch stamped a three-month-stale string onto `CarrierProfile.bcaVersion` — and let the applicant tick "I agree to the Broker-Carrier Agreement above" while the pane still read "Loading the agreement…". It failed OPEN. That constant is deleted, the acknowledgement checkbox is disabled until the body has loaded (the activation pane's fail-closed pattern), and [`carrierController.ts`](backend/src/controllers/carrierController.ts) now stamps `BCA_VERSION` server-side instead of `data.bcaVersion || null`. The validator still declares `bcaVersion` so a cached older bundle does not 400, but it is accepted and ignored. It has NOT been through a Michigan commercial attorney — see §16 #1. Each load is further governed by the Rate Confirmation, an operational form incorporating this Agreement by reference; the Agreement controls on conflict.
- **Agreement termination — RATIFIED 2026-08-21, and IMPLEMENTED.** `POST /api/carriers/:id/agreements/:agreementId/terminate` ([`carrierVettingController.ts`](backend/src/controllers/carrierVettingController.ts)), **ADMIN + CEO only, effective immediately, reason required (≥10 chars), carrier notified with that reason.** It **never deletes** — the row is marked TERMINATED and keeps its signature, IP, user agent, version and executed PDF, because a terminated agreement is still the evidence of what was agreed while it stood.

  **Who:** ADMIN + CEO, deliberately narrower than the ADMIN/CEO/OPERATIONS that may create and sign one. Terminating a BCA hard-blocks every tender for that carrier, which is a carrier-approval-class consequence, so it sits with carrier-approval-class authority. Widening it to OPERATIONS is a business decision and is not blocked by anything technical.

  **Notice:** none. Termination bites the moment it is recorded. **This is defensible because the paper does not promise otherwise** — the BCA contains no termination-notice clause, and §244's 30-day notice governs Caravan *program criteria*, not the agreement body. That is an absence rather than a permission, and it is the right default until counsel says otherwise: a platform that supports immediate termination can add a notice window later, whereas one that cannot terminate at all has no answer to a carrier who must be stopped today.

  **What counsel should settle (rides with §16 #1, not a platform blocker):** whether the BCA should carry a termination-notice clause at all, and if so how long. The consolidated draft should state plainly what the platform must support, since the mechanism now exists and the paper is silent about it.

  **TERMINATION MID-LOAD — RATIFIED 2026-08-21 (Arc 18), and IMPLEMENTED.** The policy, verbatim:

  > **In-flight loads complete and pay normally. Termination blocks future tenders only. Freight-cause exceptions are human-handled and out of code scope.**

  This is the behaviour the platform already had; Arc 17 found it *undecided* rather than broken and pinned it while the question stood. Ratifying it costs nothing to change and everything to leave unsaid. **A carrier who hauls a load is owed for it whatever else is true about the relationship** — the freight is on their truck, somebody has to deliver it, and refusing to pay for work already done because the commercial relationship ended is both wrong and the kind of thing that gets a broker's bond claimed against. The third clause matters as much as the first two: if a carrier is being terminated *because* of something on this load, that is a human decision about that load, taken on the load, and code must not try to infer it.

  **What the code does, therefore, is not stop anything — it makes sure a human knows.** Two consequences follow from terminating a Broker-Carrier Agreement, and only two ([`terminationImpactService.ts`](backend/src/services/terminationImpactService.ts)):

  1. **The owning AE is notified**, by load number and lane, that a load of theirs is now being hauled by a carrier SRL has terminated — one message per AE listing all of their affected loads, not one per load. The admin who terminated always receives the full picture regardless of who posted the loads, because they took the action.
  2. **Those loads move to the EXPEDITED check-call cadence**, reusing the protocol the platform already runs for urgent freight rather than inventing a second one. The concrete risk of a terminated carrier finishing a load is that they stop answering. **Watch harder; do not seize.**

  **In-flight means assigned and past tender but not yet POD_RECEIVED.** A load at POD_RECEIVED or beyond is excluded deliberately: the freight is delivered and the paperwork is in, so a terminated carrier at that point needs paying, not watching. Terminating a **Quick Pay** Agreement triggers none of this — it changes payment timing, not who is hauling, and escalating check calls over a fee change would be noise.

  **The confirmation modal states both halves before the admin commits**, because the prior wording ("loads already in flight are unaffected") reads as *nothing happens to them* and left an admin to guess whether SRL still pays. It now separates **stops immediately** — this carrier cannot be tendered or accept any new load until they sign a new agreement — from **does not stop**: loads already in flight stay with this carrier, complete normally, and **are paid normally**, with check calls tightened and the AE notified. It closes by saying that a load which must be taken off this carrier has to be moved on the load itself, because termination will not do it.

  **TERMINATED reads as terminated, not as never-signed.** That distinction is enforced in two places (v3.8.atf): the carrier compliance panel names the date and reason, and the tender-time override modal treats `AGREEMENT_TERMINATED` as a hard block whose remedy is a signature rather than a waiver. Confusing the two was the original defect — an AE offered a waiver for a condition no waiver can fix.

- **CARRIER ARCHIVE — RATIFIED 2026-09-19. Archive is `deletedAt` plus `isActive` off; suspend is the operational state; both may apply to the same carrier; only in-flight work blocks.** Ruled by Wasi on 2026-09-19, superseding the any-history rule that v3.8.bdi shipped as an interim ("a carrier with history is suspended, never archived"). This paragraph is the ruling's text; the code follows it, not the other way round.

  **What archive IS.** `CarrierProfile.deletedAt` + `deletedBy` + a `CarrierArchiveReason` + an optional note, and `User.isActive = false`, written in ONE transaction. It is a soft delete: the profile, its documents, its executed agreements, its audit rows and its history stay; the login stops — `middleware/auth.ts` refuses an inactive user on the next request, so no token blacklist is needed. Nothing is deleted.

  **What suspend IS, and why the two are independent.** `onboardingStatus = SUSPENDED` is the OPERATIONAL state: a carrier who may not be tendered today and may be reinstated tomorrow (the FMCSA auto-reversal does exactly that). Archive is a record-lifecycle state. They are two dimensions, not two values of one, and **both may apply to the same carrier**: a suspended carrier may be archived, and archiving does not write `onboardingStatus`. A surface that folds them into one status is wrong.

  **Only IN-FLIGHT work blocks an archive. History never does.** In flight means a load assigned to the carrier from which POD_RECEIVED is still reachable under the load state machine — **DELIVERED-pre-POD counts as in flight**, because the POD is still owed (Item 195 F-8) — and a tender the carrier has accepted (ACCEPTED, RC_SENT, CONFIRMED) on such a load. The refusal is a 409 that names the loads; the exit is to release or complete them, or to suspend instead. Loads past POD, paid settlements, executed agreements, documents, drivers, scans, past matches and settled tenders are history and never block — a signed BCA is evidence, and evidence is kept, not deleted (v3.8.bdi's test "a signed agreement alone refuses" is reversed by this ruling).

  **Six classes of open offer WITHDRAW inside the archive transaction instead of refusing:** open tender offers (OFFERED, COUNTERED), queued waterfall positions, pending bids, future dock schedules, active routing-guide entries, and open info requests. Each is an offer nobody has accepted or work nobody has started; each is closed by SRL's act and recorded as SRL's act, never as the carrier's refusal (the v3.8.aww rule: a withdrawal must not read as a decline anywhere a carrier is scored). If a withdrawal fails, the transaction fails and nothing is archived.

  **Payables and disputes NEITHER block NOR change.** An unpaid `CarrierPay` stays owed and stays payable; an open `PaymentDispute` stays open; a settlement in progress finishes. Archiving hides nothing from accounting and forgives nothing: money owed to a carrier is owed whatever the state of the record.

- **Caravan Quick Pay Agreement — exists in-house, pending counsel.** The body is `CARAVAN_QUICK_PAY_AGREEMENT` in the same file: 10 sections, versioned by `QP_VERSION` in that file. **The literal version string is deliberately not reproduced here** — go read the constant. Every time this section has restated it, it has gone stale, once inside the same hour it was written. `getAgreement()` resolves `quick-pay`, `quickpay`, and `qp` to it, so `GET /carrier-auth/agreement/quick-pay` serves it and the signed `CarrierAgreement` row written by [`routes/carrierAuth.ts`](backend/src/routes/carrierAuth.ts) records consent against a version that points at real clauses. It is a first draft written in-house. It is NOT attorney-reviewed and NOT final — §16 #2. It is a **supplement**, not a second master: Section 1 incorporates the BCA by reference, it deliberately does not restate BCA covenants, and the BCA controls on conflict. Every economic figure in it is the locked §8 ladder. When counsel returns, swap the body in that file and bump `QP_VERSION`; the signing mechanism records consent against whatever version is current, so no code change is needed. **Version-stamping invariant:** the version recorded on a `CarrierAgreement` signature row must be the version of the text the signer was actually shown, resolved server-side from `agreements.ts`. A request body must never decide it. The frontend `QP_VERSION` mirror this section previously flagged is gone — deleted in v3.8.asa, recorded at [`frontend/src/lib/carrierAgreements.ts`](frontend/src/lib/carrierAgreements.ts) — and the activation pane now fetches the body and posts back the version served with it. That closed the client half; v3.8.asb closed the server half. Both signing paths in [`routes/carrierAuth.ts`](backend/src/routes/carrierAuth.ts) (`sign-bca`, `quickpay-election`) now compare the posted version against the served constant, return `409 AGREEMENT_VERSION_STALE` on mismatch so a stale tab is told to reload rather than silently recording consent to a body nobody can reproduce, and stamp the constant — never the request. **The tripwire for any future consent write is the pattern `bodyVersion || CONSTANT`, or any write that stamps a version the request supplied.** The constant is the only correct source; the request is only ever evidence of what the signer was shown, which is what the 409 is for. **Correction history:** the "DRAFTED — 22 articles, 3 exhibits, 513 paragraphs, 42.6 KB" instrument described here through 2026-08-15 is not in this repo and never was. The 2026-08-15 replacement text was itself written mid-flight and read as false the moment its own commit landed — it said the endpoint 404s and cited `2026-05-24-v1`, both of which describe the state before that sprint. Corrected 2026-08-16. Describe what is, not what is in motion. That correction then went stale inside the same day: this section cited `2026-08-15-v1` while the constant had moved to `-16`, and it warned about a frontend version mirror that had already been deleted, while the server-side tripwire that actually remained went unrecorded. Corrected again 2026-08-16. That correction was then itself overtaken while it was being written: a parallel sprint bumped the constant again (v3.8.asb, narrowing two Quick Pay clauses that promised more than the billing path delivers) between the sentence being typed and the pass being verified. Three drifts, one of them inside the hour. So the literal is now gone from this section entirely. The lesson is narrower than "describe what is" — **do not restate a value that lives in code. Cite the constant and make the reader go read it.** A version string in prose has a half-life measured in hours; a pointer to the constant does not.
- **A SEVERE CARRIER-SPECIFIC FRAUD SIGNAL MAY BLOCK A TENDER; THE BLOCK MUST
  ALWAYS NAME ITS HUMAN EXIT (ratified 2026-08-21, Arc 24).** Chameleon risk at
  HIGH is the only fraud signal that blocks rather than deducts, and it earns
  that because it is evidence about THIS carrier — a phone, email, address,
  EIN, IP or DOT hash overlapping another carrier's — not a generic score. A
  reincarnated carrier under a fresh MC is the loss a broker cannot absorb: it
  lands on the shipper's freight and SRL's bond, and unlike an overpayment it
  is not recoverable afterwards.

  **The exit is the load-bearing half.** An AE reviews the matches on the
  carrier's Security Signals card; clearing them recomputes the risk from what
  remains and releases the block. Confirming one keeps it. A block a human
  cannot escape is a deletion with extra steps, so the blocked reason itself
  states the remedy rather than leaving an AE to find it.

  This applies to every block, not just this one. The vetting-score block was
  found in the same arc to be a SECOND, unnamed block sitting behind the first:
  clearing a match removes a 20-point deduction that stays baked into a
  persisted score until vetting re-runs, so an AE followed the named exit and
  hit a different wall. It now names the re-vet as its own exit.

  **Item 231 narrowed, not reversed (ratified 2026-09-17, v3.8.bbw).** A match
  row is evidence, and evidence can stop existing — the rule that produced it
  changes (v3.8.bbv: EMAIL became the same inbox, never the same provider), the
  other carrier is deleted, a fingerprint is corrected. A rescan now retires
  the OPEN rows it can no longer support: DISMISSED, `reviewedById` NULL,
  `reviewNotes` "Retired by rescan: no fingerprint overlap under current
  rule", one SystemLog row per batch carrying the ids. REVIEWED, DISMISSED and
  CONFIRMED_FRAUD are never touched. **A system retirement is not a human
  judgment:** only a HUMAN dismissal (`reviewedById` set) suppresses a pair
  that later genuinely matches; a retired pair comes back as a fresh OPEN row
  if the evidence returns. And the level the scan writes is the level a
  review reads — `checkChameleon` writes through `recomputeChameleonRiskLevel`
  — so a CONFIRMED verdict survives a rescan and a downgrade lands on the
  same path as an escalation.

- **AN OVERRIDE RELEASES; IT DOES NOT SKIP. HARD FLOORS APPLY REGARDLESS
  (ratified 2026-08-22, Arc 26).** A blanket compliance override runs the full
  check sequence and releases only the **waivable** blocks. It never short-
  circuits the gate, and the response **names every block it released** rather
  than returning a bare `allowed: true`.

  **NINE blocks are absolute and no override of any kind waives them**, ratified
  across five arcs:

  | Code | Ratified | Why |
  |---|---|---|
  | `AUTHORITY_TOO_YOUNG` (<12mo) | Arc 26 | reconciled an existing contradiction |
  | `AGREEMENT_TERMINATED` | Arc 26 | same |
  | `OFAC_MATCH` | Arc 27 | sanctions are a legal prohibition on transacting |
  | `FMCSA_REVOKED` | Arc 27 | a carrier with no operating authority is not a carrier |
  | `OUT_OF_SERVICE` | Arc 27 | a federal prohibition on operating, lifted only by FMCSA |
  | `INSURANCE_EXPIRED` | v3.8.axl | whether cover is in force is the insurer's fact, and it is the one uncovered loss nobody claws back |
  | `CARRIER_ARCHIVED` | carrier-archive B2a, 2026-09-20 | the record is out of the operation (login off, every open offer withdrawn); the remedy is a RESTORE, which is its own decision with its own audit row — not a 24-hour waiver |
  | `CARRIER_NOT_APPROVED` | carrier-archive B2a, 2026-09-20 | only an APPROVED carrier may be tendered; the remedy is an APPROVAL, which is its own decision with its own authority. **Absorbs the old SUSPENDED / REJECTED refusals**, which until B2a were plain reason strings a blanket override released |
  | `AGREEMENT_MISSING` | v3.8.beh (2026-09-21) | whether a contract exists is a fact — the same fact as TERMINATED with a weaker excuse. **Fired live on 2026-09-18:** a blanket override released the bare "no signed agreement" reason on a carrier holding only the registration click-wrap, the tender was created (`created_under_compliance_override`), the carrier accepted in their own session, and SRL-121492 ran with no contract governing it |

  **AGREEMENT_MISSING is decided by ONE predicate, and so is everything else
  that asks the question.** [`lib/agreementState.ts`](backend/src/lib/agreementState.ts)
  (`getAgreementState` / pure `agreementStateFrom`) returns `SIGNED |
  TERMINATED | MISSING`; the tender gate, the Compass "Carrier-Broker
  Agreement" factor, and (from Commit 2) the rate confirmation signature all
  call it. Three where-clauses became one. A surface that asks "is there an
  executed BCA" by any other route is drift, and the v3.8.aqi incident (a
  Quick Pay row read as the BCA on the vetting report) is what that drift
  costs.

  **D1 — "signed" means ANY executed version (ratified 2026-09-21).** A
  `SIGNED` `broker-carrier` row of any version counts, including the two
  carriers on the archived `2026-06-27-v1` body. **Reason:** there is no
  in-portal re-sign surface yet (§13.3 Item 199 Phase 2), so requiring the
  current F11 body would lock those two out with nothing they could do about
  it. F11-only enforcement is deferred to the Item 199 Phase 2 re-consent
  sprint, which must ship the re-sign path BEFORE the version filter. The
  registration click-wrap (`ACKNOWLEDGED`, v3.8.awo) is NOT a signature and
  never satisfies this — the enum comment says so and the predicate is where
  that sentence became code.

  **D2 — no gate at RC issuance (AE send), a considered deferral
  (2026-09-21).** With AGREEMENT_MISSING absolute, an RC cannot reach an
  unsigned carrier except through a termination between accept and send;
  the signature-time check (Commit 2) catches that at the binding moment,
  which is the one that matters. Gating the send as well would be a third
  copy of the same question on a path that cannot reach it. Revisit only if
  a path that issues an RC without passing accept ever appears.

  **An override releases a JUDGMENT CALL, never a FACT.** Whether a 14-month
  authority is good enough for this load is a judgment, and judgments are what an
  AE is entitled to make. Whether a carrier is under sanctions, has had its
  authority revoked, or is subject to an Out-of-Service order is not a judgment —
  those are facts held by another party. SRL waiving its own record of one does
  not change the fact; it only removes the evidence that SRL knew. That is the
  test for admission to this set, and it is why the first two entries arrived by
  reconciliation and the next three by decision. `INSURANCE_EXPIRED` and
  `AGREEMENT_MISSING` pass it in the same plain form: whether cover is in force
  is the insurer's fact, and whether a contract exists is one SRL can only
  record, never waive into being.

  **`CARRIER_ARCHIVED` and `CARRIER_NOT_APPROVED` pass a SECOND form of it.**
  An archive and a non-APPROVED status are SRL's own facts rather than another
  party's, so the first form does not reach them — but each has its own remedy
  with its own authority and audit row (restore; approve), and an override that
  stood in for either would let a 24-hour waiver take a decision the platform
  records elsewhere. Before B2a a blanket override released a SUSPENDED or
  REJECTED carrier for a day; it does not now, and that is the change Wasi
  ruled for.

  **The grace period is deliberately NOT part of this.** An active
  `insuranceGracePeriodEnd` still produces a WARNING rather than a block: that is
  SRL granting time against a renewal already in motion, granted once and with an
  end date, not an AE waiving a lapse at tender time. The distinction is what
  keeps this a policy rather than a loophole, and it is asserted by
  `_hard-fail-refusal-proof.ts` so it cannot later be folded in.

  **The absolutes are checked BEFORE the scoped allow-list at the override
  endpoint, and the order is load-bearing.** An absolute is not a scoped code
  either, so with the allow-list first every one of the six was refused as
  `400 UNKNOWN_CHECK_CODE` — telling an AE they had made a typo when what they
  hit was policy. Both answers refuse and nothing unsafe happened, but a block
  that names the wrong remedy sends somebody to re-type a code that was correct.

  The Arc 26 pair were already declared un-waivable elsewhere — the override
  endpoint 409s rather than mint against a <12-month authority, and the modal
  disables submit on a terminated agreement — and the gate was the one place that
  disagreed, and it was the place that decides. The Arc 27 three carried no such
  declaration anywhere, so each was declared at its source FIRST (a
  `blocked_code` with `overridable: false`, a 409 from the override endpoint, a
  disabled submit with the reason on screen) and the gate's absolute set mirrors
  those declarations rather than leading them.

  **Membership in that set is mirrored, never judged fresh.** A block is
  absolute when the rest of the system already refuses to waive it: an
  `overridable: false` code, an endpoint that 409s, a modal that disables
  submit. Adding one means marking it in all of those places and saying why
  here. Adding a block the endpoint would still happily mint an override for is
  the same contradiction pointing the other way.

  **Recording an override must never be able to prevent it.** Naming what a
  grant releases is documentation of an act the admin is already authorised to
  take — role-gated, quota-checked, reason-required, audited. If computing that
  record fails, the grant proceeds with a thinner record; it does not 500 and
  leave a load stuck with no explanation.

  ~~**Open, and deliberately not decided here:** OFAC/SDN, FMCSA authority
  revoked, and FMCSA Out-of-Service are still waivable by a blanket override.~~
  **CLOSED — ratified Arc 27**, all three now absolute; see the table above.
  Expired insurance followed in v3.8.axl on the same test.

- **FAIL TOWARD NOT PAYING, NOT TOWARD PAYING THE WRONG NUMBER (ratified 2026-08-21, Arc 16/17).** When a money path cannot determine what SRL owes, it must **refuse and tell a human** — never substitute a number that happens to be nearby.

  The rule exists because the alternative was in production. `createCarrierPayOnDelivery` read `load.carrierRate || load.rate || 0`, and `load.rate` holds the CUSTOMER rate on the primary creation path. With no accept path writing `carrierRate`, an ordinary load settled the carrier at **100% of SRL's revenue** — silently, on a document that looked entirely normal. The `||` was there to be safe. It was the bug.

  **The asymmetry is the whole argument.** Refusing to pay is recoverable in minutes: the AE is notified, sets the rate, and it settles. Overpaying by the entire margin is a clawback conversation with a carrier who is holding a signed rate confirmation, and SRL is in the wrong. The two errors are not comparable, so the defaults must not be symmetric.

  Concretely: a null agreed rate raises no `CarrierPay` and notifies the AE; carrier outreach omits the rate row rather than quoting a number it cannot source; `invoiceService` already refuses on a zero customer rate, which is the same principle on the billing side and is where the shape was copied from.

  **The direction reverses for eligibility filters, and for the same reason.** A filter that cannot tell whether a carrier covers a lane must fail OPEN — offering a lane the carrier declines costs a decline and is visible; never offering it loses the load and is invisible. Pay decisions fail closed; matching decisions fail open. Ask which error can be seen and corrected. (Arc 17 §13.3 Item 223.1.)

- **Ratified-vs-implemented ledger (as of 2026-08-16).** A ratified term is not a live term. This section is where that distinction is kept, because a future session reads this file as binding and will otherwise quote a decision as behaviour. Figures live in §5 and are deliberately not restated here.
  - **Corrected detention-to-layover ladder — RATIFIED AND IMPLEMENTED.** [`backend/src/lib/detentionLayover.ts`](backend/src/lib/detentionLayover.ts) is the single writer of both charge types for a stop, and [`backend/__tests__/unit/lib/detentionLayover.test.ts`](backend/__tests__/unit/lib/detentionLayover.test.ts) holds it: named cases at the conversion instant and either side of it, plus an invariant sweep in quarter-hour steps out to five days asserting that detention and layover never cover the same hour, that **no band past the conversion is left unpaid by any instrument**, that charges never decrease as dwell grows, that every started layover day is paid, and that the ladder never pays less than the pre-sprint code did at the same dwell. **Read that second one precisely, because it is narrower than it looks and the narrowness is deliberate:** the ladder is FLAT from hour 7 to hour 31 — a 14-hour hold and a 30-hour hold both pay $500 — and that is correct, because layover day one is billed in full at the conversion rather than accrued through those hours. The guarantee the code can support is *no unpaid band*, not *earns continuously*. An earlier version of this bullet said "no band past the conversion accrues nothing", which reads as the stronger claim and is why the test and the reconciler doc were both reworded off it. Do not restore the stronger wording, and do not "fix" the flat band — it is prepaid, not unaccrued. The sweep's overlap test asserts its own exercised count, so it cannot pass vacuously. This one is safe to describe as live.
  - **Caravan Quick Pay Agreement body — EXISTS AND IS SIGNED TODAY; counsel review OPEN.** The document is real and binding on the carrier who signs it. It is not attorney-reviewed. §16 #2.
  - **Consent path — RATIFIED AND IMPLEMENTED, no residual gap.** Both activation panes fetch the agreement body from the backend, render what was served, and post back the version served with it; both fail closed when no body loaded. The executed PDF is generated and stored against the signature row for both agreements, and both signing routes reject a stale posted version with a 409 rather than stamping it. The onboarding registration write was the one surface off that path — it posted `bcaVersion` in the registration payload, so the 409 guard never saw it — and v3.8.asb closed it by deleting the page's stale fallback constant, disabling the acknowledgement until the body loads, and stamping the version server-side. **No consent write anywhere now takes its version from the request.** The standing tripwire is unchanged: `bodyVersion || CONSTANT`, or any write that stamps a version the request supplied.
  - **Quick Pay §3 three-condition charge gate — IMPLEMENTED ON ALL THREE CHARGE PATHS.** §3 says Broker will not deduct a Quick Pay fee unless a fee is recorded on the load, the agreement is signed, and Quick Pay is enabled. Three paths can deduct one: `integrationService.createCarrierPayOnDelivery`, `routes/carrierPayments` (the carrier's own request), and `accountingController` prepare/edit. The third checked **none** of the three until v3.8.asb — it derived a fee from a request-supplied `PaymentTier` string, so `PUT /accounting/payments/:id` with `{ paymentTier: "PRIORITY" }` overwrote the correctly-zero fee the delivery path had written and deducted 3% from a carrier who had signed nothing. All three now resolve the fee from the load behind the same gate, and [`__tests__/unit/controllers/quickPayChargeGate.test.ts`](backend/__tests__/unit/controllers/quickPayChargeGate.test.ts) pins each condition independently. **If a fourth charge path is added it checks the same three conditions, or the clause is false again.**
  - **Accessorials reaching the invoice and the settlement — LARGELY BUILT, and the sentence that said otherwise was stale.** Through v3.8.asc this file and the release notes said "accessorial rows are written correctly and reach neither the shipper invoice nor the carrier settlement." A ten-agent trace of the money path in v3.8.ase established that v3.8.asb had already closed both main legs: `autoGenerateInvoice` reads the approved ledger, itemises it, and stamps `shipperInvoiceId`; `syncInvoiceAccessorials` folds a late approval into a DRAFT base or raises a real SUPPLEMENTAL invoice with its own `…S` number; `createCarrierPayOnDelivery` and `syncCarrierPayAccessorials` carry the carrier side, re-pricing in place while the settlement is still open and escalating rather than rewriting once it is committed. An AE can approve a claim on a live React surface and the money moves. **Do not repeat the old sentence.** What remains is edge-work, tracked below and in §13.3.
  - **Customer billing separated from carrier pay — MECHANISM BUILT (v3.8.ase), INERT UNTIL RATES ARE ENTERED.** `LoadAccessorial` carried ONE `amount` column that both sides read, so every accessorial was billed to the customer at exactly what the carrier was paid — zero margin, on a policy that explicitly says customer billing is negotiable per contract while carrier pay is the uniform schedule. `Customer.defaultAccessorialRates` had held the negotiated rates the whole time and no money path read it. v3.8.ase adds a nullable `customerAmount` (NULL means "bill what we paid", so no historical row changes meaning and no backfill was needed) and a single resolver, `invoiceService.customerPriceFor`, which prefers an explicit per-row figure, then the customer's negotiated rate, then cost. **A read-only production check at ship time found ZERO customers with negotiated rates on file, so billing is unchanged until rates are entered on a customer.** The rate is per-unit where the row carries a quantity and flat where it does not.
  - **Quick Pay §8 ineligibility conditions — NOT IMPLEMENTED, and the clause now says so.** Neither charge path queries `PaymentDispute` for an open cargo claim, nor runs `complianceCheck` for authority and insurance standing. §8 stated these as an automatic state ("a load is not eligible… standard tier payment terms continue to apply"), which a carrier could rely on and be charged anyway; it now states them as a right Broker may exercise through the §6 review. Do not restate them as automatic before the checks exist on all three charge paths. The same clause also contradicted §5 outright on incomplete documentation — §5 said the load "remains eligible on the same terms", §8 said "not eligible… standard tier terms apply", one signed page, opposite money — resolved in favour of §5, which is what the billing path does.
  - **TONU two-sided billing — RATIFIED 2026-08-15, NOT IMPLEMENTED.** Neither side exists in the billing path. There is no customer-side TONU charge at all, and `onLoadCancelledOrTONU` ([`integrationService.ts`](backend/src/services/integrationService.ts)) *reverses* credit, voids AP and reverses funding on cancellation — it raises nothing. TONU is a load status today, not a charge. The carrier-side clause the Rate Confirmation prints pays on a narrower trigger than the ratified one. Do not describe either side as live.
  - **4-hour carrier release window — RATIFIED 2026-08-15, NOT IMPLEMENTED.** Nothing enforces it, and the terms grid still prints the line without naming the releasing party. §5 carries the reframing and the reason it no longer conflicts with TONU.
- **Public `/track` PII scope — REVERSED 2026-08-12 (v3.8.ara), superseding the v3.7.k lock.** Wasi reviewed a live QR scan and directed that the public tracking view expose only the lane, not the parties or the cargo. `STATUS_ONLY` (the access level the BOL QR mints, and the default for any bare lookup) now returns **only**: origin + destination **city/state**, status, progress, milestones, scheduled/actual dates, last known city/state, and ETA. **Withheld from STATUS_ONLY:** `shipperName` (customer), `commodity`, `weight`, `equipment`, temperature spec, stop-by-stop facility detail, check calls, and `podUrl`. `FULL`-access tokens (issued deliberately to a shipper) still receive everything.
  - The prior v3.7.k rationale — "the BOL already prints the shipper beside the QR, so redacting adds nothing" — was rejected because the QR outlives the paper: the link is forwarded, photographed, and scanned by dock workers, lumpers, and receivers who are not parties to the shipment. A public link that names the customer and the commodity discloses who ships what, on which lane, in what volume.
  - Implementation: `trackingController.ts` gates every commercially sensitive field on `accessLevel === "FULL"`. Pre-ara only `stops` and `checkCalls` were gated while the rest returned unconditionally — the gate existed but was not honored.
  - Do NOT re-expose customer/commodity on `STATUS_ONLY` without an explicit reversal of THIS decision.

---

