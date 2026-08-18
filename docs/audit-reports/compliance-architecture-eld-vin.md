# SRL Compliance Architecture — Obligations, Evidence, and ELD/VIN Matching

**Type:** Research + design. Read-only audit of the codebase; no source files modified, no commits.
**Date:** 2026-08-17
**Repo state:** `main` @ `94207d60` (v3.8.asc)
**Companion document:** [compass-highway-gap-analysis.md](compass-highway-gap-analysis.md)
**Method:** 13-agent workflow — six parallel research sweeps (statutory duty, liability standard, ELD ecosystem, VIN data sources, internal equipment state, scorecard/monitoring), three designs, three adversarial reviews, one completeness critic. Every design was refuted before it entered this document; the corrections are folded in and flagged.

---

## The one thing that changes everything

**Montgomery v. Caribe Transport II, LLC — 608 U.S. ___ (decided May 14, 2026, unanimous, Barrett, J.)**

The Supreme Court held that state-law **negligent-hiring claims against freight brokers fall within the FAAAA safety exception and are not preempted.** In all fifty states. The preemption defense that brokers used to get these claims dismissed early is gone.

Three independent reviewers verified this and could not refute it. It reframes the entire question you asked.

**What it means for SRL specifically:** the plaintiff's theory in Montgomery was that the broker knew or should have known the carrier held a **conditional safety rating** with documented deficiencies — data that was sitting in public FMCSA records on the day the load was awarded. Not exotic data. Not vendor data. Public data the broker could have looked at and didn't.

So your compliance need is **not primarily regulatory**. The FMCSA regulatory floor for a broker is startlingly low. Your exposure is evidentiary: two years after a crash, can you produce a record showing what you knew about that carrier on the day you tendered, from what source, at what timestamp, and who decided?

Today you cannot. `tenderController.ts:28` computes the full compliance result and **throws it away** before writing the tender at `:34`. That single discard is the largest gap in the system, and closing it costs about twelve hours.

---

# Part 1 — What you actually owe

## 1.1 Regulatory floor (lower than you'd think)

**49 CFR 371.3 — the only records rule that binds you.** You must keep a record of each transaction containing six specific fields:

1. Name and address of the **consignor**
2. Name, address, and **registration number of the originating motor carrier**
3. **Bill of lading or freight bill number**
4. **Amount of compensation received by the broker**, and the name of the payer
5. Description of any **non-brokerage service** performed, its compensation, and the payer
6. **Amount of freight charges collected and the date of payment to the carrier**

Retention: **three years** (371.3(b)). Each party to a transaction has a **right to review** its record (371.3(c)).

Fields 4, 5, and 6 are the ones brokers miss. Your margin is *computed*, not persisted per transaction. "Date of payment to the carrier" is a distinct field, not derivable from invoice status. Non-brokerage services aren't captured at all.

**There is no FMCSA regulation requiring you to verify a carrier's authority, insurance, or safety rating before tendering.** Not in Part 371, not in Part 387, not in 49 USC 13904 or 13906. This is the most misunderstood point in broker compliance — and it is precisely why Montgomery matters, because the duty comes from tort law instead.

**49 USC 14916** — brokerage may only be performed by a registered person. Penalty up to **$10,000 per violation**, plus liability for all valid claims without regard to amount, applying **jointly and severally to the corporate entity and to individual officers, directors, and principals.** That statute pierces the corporate veil by its own terms. It is the double-brokering hook, and it points at you personally.

**49 CFR 371.7** — you may not operate under any name other than your registered one, and any advertising must show broker status.

## 1.2 Your own filings — nobody is watching these

The completeness critic caught something all three designs missed: **every design monitors carriers; none monitors SRL.**

| Obligation | Detail | Status |
|---|---|---|
| **BMC-84 bond** | Effective **January 16, 2026**: authority is **suspended** when available security falls below $75,000 and is not replenished within **7 calendar days**. Surety gives FMCSA only **30 days' notice** before cancellation | You may learn from the public record, not from PFA |
| **UCR** | **$46** for 2026. Filing opens **Oct 1**, due **Dec 31**. No invoice is sent | Calendar reminder needed |
| **MCS-150 biennial** | Filed by next-to-last digit of USDOT. **DOT 4526880 → digit 8 → even → due in 2026.** Failure deactivates the USDOT number | ⚠️ Verify whether filed |
| **BOC-3** | Must cover **every state in which contracts are written**. Only one form may be on file | ⚠️ Verify yours is blanket, not Michigan-only |

**Fix:** add DOT 4526880 to the daily `fmcsaComplianceScan` loop you already run, and alert `compliance@` on any change to your own authority status or bond amount. Roughly two hours, zero dollars, and it is the only genuinely existential item in this document. A suspended authority stops the company.

## 1.3 The 1099 finding

**Treas. Reg. § 1.6041-3(c) exempts payments for freight services from Form 1099 information reporting entirely.** This is not the corporate exemption — it applies regardless of carrier entity type. **No 1099-NEC is required to owner-operators, LLCs, or sole proprietors for hauling freight.** Because the payments are non-reportable, backup withholding under IRC 3406 does not attach either.

Still collect W-9s — for entity identity, TIN matching, and fraud control, not for tax filing.

⚠️ Unverified at the margin: whether purely non-transport accessorials paid to a non-carrier fall outside the freight exemption. Treat separately if material.

## 1.4 Retention, driven by exposure rather than regulation

| Record | Driver | Keep |
|---|---|---|
| 371.3 transaction record | 371.3(b) | **3 years (mandatory)** |
| Rate confirmations, BOLs, PODs | Michigan contract SOL, MCL 600.5807 | 7 years |
| **Carrier vetting snapshot, COI** | Negligent selection — MCL 600.5805, tolled for minors | **7+ years** |
| Cargo claim file | 49 USC 14706(e) | 4 years |
| Tax records | IRC 6501 | 7 years |

---

# Part 2 — What the audit found in your code

Beyond the defects in the companion Highway document, this sweep surfaced:

**The tender evidence is computed and discarded.** `tenderController.ts:28-34`. The compliance object exists in scope, is used for a 403, and is never persisted. Same at `withTenderController.ts:61`. The bulk accept paths skip it entirely.

**Documents are hard-deleted along with the S3 object.** `documentController.ts:492` calls `prisma.document.delete()` after `deleteFile()` destroys the underlying object. ⚠️ **Correction from adversarial review:** the route is gated `authorize("ADMIN","CEO")` at `routes/documents.ts:86`, so a *carrier* cannot reach it — the original finding overstated this. It remains a real **admin spoliation risk** against records you must keep for three years, and `Document.loadId` cascades on delete.

**The SystemLog 90-day purge destroys FMCSA scan run summaries** (`cron/index.ts:216`).

**Insurance monitoring watches the expiry date but not the amount.** A renewal that silently drops cargo from $100K to $25K passes every check. For refrigerated CPG this is the named exposure.

**Reminder dedup is unscoped by policy period** (`complianceMonitorService.ts:1203`) — the second renewal cycle sends nothing, forever.

**Duplicate crons.** FMCSA is scanned twice daily by two functions; OFAC, chameleon, and CPP recalc each run twice weekly from both `cron/index.ts` and `schedulerService.ts`.

**`Truck` has no relation to `CarrierProfile`.** VIN verification scopes through `Load.truckId`, so it reaches only AE-hand-entered rows.

---

# Part 3 — ELD: the honest answer

You asked how to ask carriers for ELD data and match it against public data. The research produced an answer that contradicts the obvious approach, so here it is plainly.

## 3.1 What the public data actually is

FMCSA publishes two lists at `eld.fmcsa.dot.gov/List` — `DownloadAll` (registered, ~400-900 rows) and a separate revoked list. Both return HTML `<table>` markup under an `application/excel` content type, so parse with cheerio, not a spreadsheet library. Free, no key.

**But the registry is a list of devices, not a mapping of carriers to devices.** No public source tells you which ELD a given carrier runs. Any match you perform is against **a string the carrier typed**. It catches a carrier who honestly names a revoked device. It catches nothing else.

## 3.2 Three corrections that kill the obvious design

**The ELD Identifier is the wrong field to ask for.** It is provider-assigned, observed at 5–7 characters, and **FMCSA explicitly permits multiple devices to share one identifier**. It identifies a *product*, not a device or a carrier. A five-truck carrier's office manager will not find it in device settings — they will guess, mistype, or stall. Asking for it as a blocking field on a hand-sourced carrier base means the whole build runs dark on empty values.

**The revoked list has a `Status` column that distinguishes self-revocation.** Sampled rows read `Self-Revoked` — a provider withdrawing a product, not a compliance failure. Every sampled revocation date fell in 2019–2024, so a rule of "revoked more than 60 days ago → hard block" would blocklist essentially the entire list, including carriers running perfectly legal devices from vendors who simply retired a SKU.

**A blocking gate on honest disclosure creates a perverse incentive.** If naming a revoked device blocks you and staying silent doesn't, carriers stay silent — and you have documented that you built a gate you knew was evadable. That is evidentially worse than not building it.

⚠️ **Conflicting finding, needs verification before build:** two reviewers disagreed on whether the revoked list carries a usable revocation date. One verified a `Date Revoked` column; another found only a `Status` and a Unix-timestamp `Date`, with actual revocation dates living in FMCSA newsroom posts. **Fetch both lists and inspect the columns yourself before designing any date-driven logic.** Given SRL's history with `/authority` and CSA BASICs, assume nothing here.

## 3.3 What to actually do

**Ask for the ELD provider name and device model. Not the identifier.** One optional field pair on the onboarding form, no blocking gate. Resolve provider name against the registry server-side.

**Use it as a scored signal and an AE-review flag, never a hard block.** A carrier naming a revoked device gets a conversation and a 60-day note, not a rejection.

**Do not build telematics integration.** Per-carrier OAuth with Motive or Samsara is not a re-key of the existing global env var — it requires partner-portal enrollment, an app definition with declared scopes, a test org, and **Marketplace certification reviewed quarterly**. That is an unscheduled external dependency, not a sprint task. Visibility aggregators price out of reach (project44 around $6,250/month; FourKites and MacroPoint are quote-gated at 3PL scale).

**Get position, not hours.** You need location for tracking compliance; you have no right to and no use for HOS logs. Position comes from a per-load tracking link at a fraction of the cost and none of the liability.

## 3.4 The liability finding that should shape this

I asked the research to test whether collecting ELD data *increases* your exposure by supporting an argument that the broker exercised carrier-like control. **It does.**

Ingesting HOS logs, driver rosters, or DQ data moves you toward the control analysis that produced borrowed-employee findings against large brokers. Part 391 and Part 395 are the carrier's obligations. Monitoring them buys you nothing defensively and hands a plaintiff an argument.

**The rule that follows:** verification, never supervision. Every field you collect is framed — in the request copy and in the Broker-Carrier Agreement — as *selection and verification evidence*. And a second rule the reviewers insisted on: **collect only what you have a written action rule for.** Post-Montgomery, knowledge creates duty. A red flag you ingest and demonstrably ignore converts a negligent-selection defense into documented notice.

---

# Part 4 — VIN: collect it, but not where you'd expect

## 4.1 What VIN can and cannot prove

NHTSA vPIC decodes a VIN to make, model, year, GVWR, plant, and body class. Free, no key, already integrated. Switch from `DecodeVin` to **`DecodeVinValues`** — a flat object roughly 140× smaller — and use `DecodeVinValuesBatch` (50 VINs per POST) for rosters.

The ISO 3779 check digit (position 9, mod-11) can be computed locally for free as a pre-flight before any HTTP call.

**Nothing public links a VIN to a carrier.** Not registration, not IRP, not insurance filings. DPPA (18 USC 2721) makes DMV data off-limits with **$2,500 minimum statutory damages per violation, uncapped**. NICB VINCheck excludes commercial use. NMVTIS does not enumerate brokers as a permitted user class, and title history is not your threat model.

**A competent fraudster using a stolen MC# supplies that carrier's real VINs** — they are painted on the side of every truck. VIN validates *the claim*, never *the actor*.

## 4.2 So why collect it at all

One reason, and it is a good one: **the same VIN appearing under two different MC numbers is a chameleon-carrier signal**, and it runs entirely on your own data at zero cost. That is the highest-value use of VIN in the entire design.

## 4.3 Where to collect it

**Not at onboarding.** A fleet VIN roster is high friction on a hand-sourced base of 5–20 carriers and near-zero yield.

**At dispatch, per load.** You already capture driver name, driver phone, tractor unit, and trailer number on the rate confirmation step. Add **one field: tractor VIN.** It costs the carrier about ten seconds on a load they have already accepted, scales with actual exposure, and gives you an equipment record for a theft or claims report.

**Trailer VIN optional and never checked** — vPIC coverage is sparse and drop-and-hook makes the trailer on file routinely not the trailer that moves.

## 4.4 Two auto-blocks the reviewers killed

**Check-digit failure must not hard-block.** It is true that a fabricated VIN cannot pass mod-11 by accident — but the converse is the common case. A two-character transposition at 5am fails mod-11. So do glider kits, rebuilt units, and pre-1981 equipment. Terminally blocking a booked load on a typo is worse than the fraud it prevents. Make it a correction prompt with one retry, then AE review.

**Same VIN under two MCs must not auto-block either.** Legitimate causes are common on a small recurring base: an owner-operator leasing the same tractor to a second authority sequentially, a carrier running under both its own and a leased-on MC, equipment sold between carriers. Auto-blocking strands a loaded truck. Hold for review — or auto-block **only when the two MC associations overlap in time.**

---

# Part 5 — The matching engine

One matcher module, one append-only result table, three invocation moments (onboarding, monthly re-vet, tender). **Total incremental external cost: $0.00/month.**

| Check | Source | Verdict logic | Class |
|---|---|---|---|
| **VIN decode** | vPIC `DecodeVinValues` | Check digit fails → correction prompt, then review. Vehicle class contradicts claimed tractor → scored 15 + review. Make/year variance → review only | Scored |
| **VIN cross-carrier reuse** ⭐ | SRL's own data | Same VIN, two carriers, overlapping active dates → hold for review + chameleon fingerprint | Scored 20 |
| **VIN vs COI schedule** | `coiReaderService` (Gemini) | Default **NOT_APPLICABLE** — most trucking COIs use "Any Auto." Only when the COI shows specifically-described autos and a dispatched VIN is absent → review | Review only |
| **Claimed fleet vs FMCSA power units** | QCMobile `totalPowerUnits` | Ratio > 3.0 **and** delta > 5 → scored 8. Ratio ≥ 10 → scored 20 + review | Scored |
| **ELD provider vs registry** | FMCSA lists | Registered → pass. Revoked → review + carrier notice. Self-revoked → review only. Not listed → scored 5 | Scored, never hard |
| **Legal name + state/ZIP vs FMCSA** | QCMobile | Token-set ≥90 pass; 70–89 review with **zero score impact**; <70 scored 12. **Never hard** | Scored |
| **Insurance vs FMCSA BIPD** | QCMobile | On-file absent when required → hard (already the auto-suspend). Claimed above filed → **pass**, that is normal | Hard (existing) |

**Do not check cargo insurance against FMCSA.** BMC-34 cargo filings are **household-goods carriers only** under §387.303(c). Absence for general freight proves nothing and would flag every legitimate carrier. Compare COI-extracted cargo limits against your own contract minimum instead.

**Name matching must never hard-block.** "J&M Transport LLC" versus "J AND M TRANSPORT L L C" must pass silently. Normalize by uppercasing, stripping punctuation and legal suffixes (INC, LLC, LP, CORP, CO, LTD) — but keep TRUCKING, TRANSPORT, EXPRESS, which are distinguishing tokens.

**Address: compare state and ZIP5 only.** Street-level comparison is pure noise given mailing-versus-physical addresses and MCS-150 staleness. A state mismatch is worth an eyeball because remit-to in a different state from the FMCSA record is a known chameleon pattern. **Do not geocode** — the Google key buys nothing here at 20 carriers.

## What is genuinely diagnostic versus noise

**Diagnostic:** cross-carrier VIN reuse with overlapping dates · FMCSA-initiated ELD revocation · claimed fleet ≥10× federal power units · name similarity below 70 against both legal and DBA names.

**Noise — surface, never score:** any name variant at 70 or above · all street-address differences · trailer decode failures · model-year and make typos · claimed insurance below filed amount · missing COI auto schedule · power-unit deltas inside 3× or 5 units.

---

# Part 6 — The evidence architecture (highest value in this document)

## 6.1 One model, not three

The three designs each proposed a different persistence shape for tender evidence and would have collided in migration. Resolved in favor of a single model.

**`TenderComplianceSnapshot`** — attached to `LoadTender`, not `Load`. A load may be tendered to three carriers; each tender is a separate selection decision, and the declined ones prove you considered alternatives.

Contents, in outline:
- 371.3 identity as captured — carrier legal name, MC, DOT (never a live lookup later)
- Decision, blocked reasons, warnings, deciding user, any override id, **policy version**
- **Raw payloads, never booleans** — the full QCMobile response body, retrieval timestamp, source URL, authority status, safety rating, out-of-service date, OFAC result
- Insurance as held at tender, plus `coiDocumentId` and **`coiS3VersionId`** pinning the exact bytes
- Links to `VettingReport`, `ComplianceScan`, scores at tender, BCA version signed

All status-like fields are `String`, **not Postgres enums** — deliberately, so no `CREATE TYPE` migration and no psql CI pre-step is required.

`complianceCheck()` must be extended to *return* its raw sub-payloads rather than only reasons. Roughly +80 LOC and zero new external calls at your volume.

**A boolean `compliancePassed: true` fails the evidentiary test. The raw payload passes it.**

## 6.2 The safety-data substitute — the unassigned gap

All three designs correctly concluded that **CSA BASIC percentiles are not available to brokers.** Post-FAST Act, percentiles and alert status are visible only to the carrier through its DOT PIN. `csaBasicService` is not fixable — there is no source. This is the third time this codebase has built against a data source that does not exist, after `/authority` and CSA.

But Montgomery turned on public safety data, so leaving the field blank is not an option either.

**Substitute, all present in the QCMobile response you already fetch:** safety rating (public, and literally the pivot in Montgomery), driver and vehicle out-of-service rates against national averages, inspection counts, crash counts. Persist them in the snapshot.

**Then state the limitation in a versioned written vetting policy** — a Markdown artifact with a `VETTING_POLICY_VERSION` constant, mirroring the `agreements.ts` pattern, stamped server-side onto every snapshot. Say explicitly which fields SRL uses and that percentiles are not available to brokers. *The policy stating the limitation is itself the defense. A blank field is not.*

## 6.3 Retention and immutability

- `Document` gains `deletedAt`, `deletedByUserId`, `deletionReason`, `s3VersionId`. Soft delete only; **never call `deleteFile()`**.
- `Document.loadId` → `onDelete: Restrict`.
- `RateConfirmation` and `Invoice` gain `deletedAt`. No hard-delete path on either.
- **S3 bucket versioning on**, with an IAM deny on `DeleteObjectVersion`, `PutLifecycleConfiguration`, `PutBucketVersioning`, and `PutBucketPolicy`.
- Exclude FMCSA scan summaries and security logs from the SystemLog purge.
- `ComplianceScan`, `VettingReport`, `CarrierScorecard`, `TenderComplianceSnapshot`, and the audit trail are **never purged** — document the protected tables in the cron header.

⚠️ **Honest limitation:** versioning plus an IAM deny is **not** equivalent to S3 Object Lock. The deny is defeated by whoever can edit the IAM policy — at a one-person company, the same human with the motive. A spoliation argument survives this design. Say "versioning now; Object Lock in compliance mode if counsel or an underwriter asks in writing," and do not claim more.

## 6.4 Litigation hold

Soft-delete is not a hold. Add `legalHold Boolean @default(false)` on `CarrierProfile` and `Load`; every delete path and every purge cron checks it. About three hours.

---

# Part 7 — Corrections the adversarial review forced

Recorded because each one would have shipped as a defect.

| Finding | Severity |
|---|---|
| **TCPA.** Texting a driver whose number came from the *carrier* is not consent — prior express consent must come from the subscriber. **$500–$1,500 per text, uncapped, class-actionable.** The BCA clause binds the carrier, not the driver | **Fatal — fix before any SMS ships** |
| **CSA BASIC percentiles are unavailable to brokers.** Cannot be a Tier 0 gate; `csaBasicService` is not "fixable" | **Fatal** |
| **Prisma `$use` was removed in v6.14.0**; `package.json` resolves 6.19.x. The proposed banking-change middleware cannot be built as written — use `$extends` | **Fatal** |
| **`bankAccountNumber` and `routingNumber` do not exist** in the schema. Only `remitToName`/`remitToAddress` | **Fatal** |
| **ELD Identifier is non-unique and provider-assigned**; the registry maps devices, not carriers | **Fatal to the obvious design** |
| **Self-revoked ELD devices are not compliance failures**, and all sampled revocations predate the 60-day window | **Fatal to the block rule** |
| **Cargo insurance is not filed with FMCSA** for general freight (BMC-34 is household goods only) | Fatal to that check |
| **Samsara/Motive OAuth requires partner enrollment and quarterly certification** — not a code change | Schedule risk |
| **Document hard-delete is ADMIN/CEO-gated** — carriers cannot reach it. The threat is admin spoliation | Framing correction |
| **S3 versioning ≠ Object Lock** | Overstatement |
| VIN check-digit and dual-MC auto-blocks would strand loaded trucks on typos and lease transfers | False positives |
| `requiredCargoMinimum` as a carrier default would flag every dry-van carrier at the industry-standard $50K — the floor is a property of the **commodity**, not the carrier | False positive |
| BCA-version-drift alerts on every version bump would storm the queue and train the AE to bulk-dismiss — destroying the disposition record | Self-defeating |

---

# Part 8 — Undesigned scenarios the critic surfaced

**Insurance cancellation has no inbox.** You are named certificate holder specifically so the insurer notifies you — and nobody wired where that notice lands. The expiry cron catches only the scheduled date, never a mid-term cancellation. **Route insurer notices to `compliance@` and add a one-field AE action ("mark policy cancelled, effective date") that sets the expiry and fires the existing enforcement path.** This is the cheapest control in the entire package and it beats every polling design, because the insurer does the monitoring for you at no cost.

**Carrier suspended mid-load.** Auto-suspend fires today with no branch for in-transit freight. Write the rule explicitly: **suspension blocks new tenders only and never recalls freight in transit.** On suspension, open a critical alert per active load with the AE decision recorded on the load.

**Offboarding.** No design covered it. Add `terminatedAt`, `terminationReason`, `doNotUse`; block tender on `doNotUse`; and make sure records **survive** termination rather than being cleaned up.

**371.3(c) right of review has no production path.** A carrier's first transparency request will be handled by hand. Reuse the audit-package endpoint scoped to the requesting carrier's own transactions — same machinery, one auth change. The pending NPRM proposes a **48-hour** electronic production window.

**The anchor customer's audit is a different artifact** than a defense-attorney package. **Read that contract first** — it may impose vetting or insurance minimums stricter than anything designed here, along with a right-to-audit clause.

**Segregation of duties is impossible at one person.** Requester, approver, and auditor are the same human. Unfixable at this size — so the record must be timestamped, immutable, and reconstructable, and the written policy should say so plainly rather than implying controls that do not exist.

---

# Part 9 — Sequence and cost

**Total incremental cash cost: $0/month.** Everything below runs on FMCSA QCMobile, the FMCSA ELD lists, NHTSA vPIC, Resend, OpenPhone, S3, and Gemini — all already provisioned. Gemini COI extraction runs a few cents a month.

### Phase 0 — This week, ~8 hours

1. **Monitor your own authority.** Add DOT 4526880 to the daily scan; alert on authority or bond change. Calendar reminders for UCR (Oct 1 / Dec 31) and MCS-150 (2026). Verify BOC-3 is blanket. *~2h — the only existential item here.*
2. **Insurance cancellation inbox** routed to `compliance@` with the one-field AE action. *~2h.*
3. **Stop destroying evidence** — document soft-delete, drop `deleteFile()`, `onDelete: Restrict`, exclude scan summaries from the purge. *~4h.*

### Phase 1 — The evidence layer, ~2 days

4. **`TenderComplianceSnapshot`** with raw payloads, wired at all three accept paths. *~12h. This is the Montgomery defense and it is the highest-leverage change in the document.*
5. **Versioned vetting policy artifact** stating what you check and that percentiles are unavailable to brokers. *~3h.*

### Phase 2 — Real safety data and the cheap manual control, ~2 days

6. **Persist the public safety fields** already in the QCMobile response — safety rating, OOS rates versus national averages, inspection and crash counts. *~6h.*
7. **Dispatch-time callback verification.** Call the number in the **FMCSA registration record**, never the number on the emailed packet, before releasing a first-time carrier. Latch it with `Load.carrierCallbackVerifiedAt` and require dual approval on a first load. *~4h — and it defeats MC# identity cloning better than any schema.*
8. **Insurance amount drift** — extend expiry enforcement to compare limits, with the floor set per commodity and Gemini output going to an AE confirm queue rather than straight to a critical alert. *~8h.*

### Phase 3 — Matching, ~2 days

9. Cron de-duplication and the reminder-period fix. *~4h.*
10. VIN at dispatch → vPIC → chameleon fingerprint. *~8h.*
11. ELD provider-name registry match, scored only. *~6h.*
12. Name/state/ZIP and power-unit matching with the widened tolerances. *~6h.*

### Deferred until something changes

Telematics OAuth (partner certification dependency) · audit-package export endpoints (~32h, build when a claim or an underwriter asks) · alert aging and escalation (single-digit queue today) · banking-change latch (fields must exist first) · full fleet VIN rosters · any paid monitoring subscription.

---

## The bottom line

Your compliance need is not the regulatory checklist — that floor is low and you largely meet it. It is **evidentiary**, and Montgomery made it sharply more so three months ago.

The single most valuable thing you can build is not a new check. It is persisting the check you already run. `tenderController.ts` computes your entire defense and discards it on every tender.

On ELD and VIN specifically: **ask for less than you were planning to.** Provider name, not device identifier. Tractor VIN at dispatch, not a fleet roster at onboarding. Position, not hours. The restraint is not just cheaper — collecting HOS data actively increases your liability, and a gate that punishes honest disclosure is worse than no gate.

**Three manual controls beat everything in this document and cost nothing:** call the carrier back on the FMCSA-registered number, source the insurance agent's contact independently of the COI, and require dual approval on a first-time carrier's first load. Public-data matching validates the claim. Only the callback validates the actor.

---

## Open items requiring verification before build

1. **Inspect the FMCSA revoked ELD list columns yourself.** Reviewers disagreed on whether a usable revocation date exists. Given this codebase's history with `/authority` and CSA BASICs, verify before designing date logic.
2. **Confirm MCS-150 is filed for 2026** and that BOC-3 coverage is blanket rather than Michigan-only.
3. **Read the anchor customer contract** for vetting, insurance flow-down, and right-to-audit clauses.
4. **Confirm QCMobile actually returns inspection and crash aggregates** for your carriers — the interface declares the fields, but the same interface declared fields that turned out to be absent.
5. **TCPA consent mechanism** must be settled with counsel before any driver SMS ships.

---

*Read-only audit and design. No source files were modified and no commits were made in producing this report.*
