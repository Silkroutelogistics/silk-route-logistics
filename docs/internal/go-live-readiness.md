> **SUPERSEDED 2026-08-28 by [`launch-readiness.md`](launch-readiness.md).**
>
> This document was scoped to the DOCUMENT CHAIN only (BCA, rate confirmation,
> BOL, invoice) and its outbound-safety claim was later proved false: it stated
> outbound was neutralised by absence, when dotenv was in fact filling the key
> from backend/.env. Kept as the record of the Arc 14 dress rehearsal; do not
> read it as current readiness.

# Go-live readiness — first-load dress rehearsal

**Date:** 2026-08-21 · **Arc 14** (documents) → **15** (audit) → **16** (fixes) → **17** (interactive lifecycle) · Rehearsal load `SRL-140001`
**Scenario:** Beekeepers Naturals · Lebanon NH → North Lake TX · Reefer 53′ · honey/propolis, 28,400 lb, setpoint 38°F continuous

---

## Verdict

> **SRL can run a real load today, including auto-dispatch. The document chain, the money path, and the interactive lifecycle have each been walked end to end against a real database and the real routes, and every fix has been adversarially verified by restoring the defect it closes. Two things are still owed and neither is code: a human eye-pass on the four PDFs, and a walk through the deployed portals as a real carrier and a real shipper. Until those two happen, this sentence is earned about the machinery and unproven about the pixels.**

That boundary is the sentence's own, not an apology attached to it. Everything a script can establish has been established. The two remaining passes are the two a script cannot do.

### How the verdict changed, and why each change was honest

| Arc | Said | Was |
|---|---|---|
| **14** | "can run a real load" — document chain sound | True about documents, and documents were not the risk |
| **15** | four GO-BLOCKERs in the machinery beneath | The money moves in code, not in paperwork |
| **16** | all four closed, proved on real routes | Closing them surfaced a fifth nobody had seen |
| **17** | the lifecycle flown, including the path that had never run | Flying it surfaced a sixth |

Each arc's verdict was reached honestly and each was incomplete, because each looked at a layer the previous one had not. That is the argument for the two human passes rather than a third script.

### Arc 17: the waterfall's maiden flight

**Auto-dispatch had never once accepted a carrier.** Arc 16 found `acceptPosition` passing a User id to `complianceCheck`, which looks up `CarrierProfile` — so every position resolved to "Carrier not found", was skipped, and the cascade exhausted. Flying it for the first time found a **second, independent** reason it could not work:

`waterfallScoringService` filtered carriers by comparing the carrier's REGION NAME to the load's two-letter STATE CODE with `includes()`:

```
"NORTHEAST".includes("NH")   // false — a Northeast carrier, a New Hampshire load
"NORTHEAST".includes("OR")   // TRUE  — a Northeast carrier, an OREGON load
```

Across the ten regions onboarding offers and all fifty states, **41 of 50 states could never be matched by any region a carrier can select**, and the nine that could matched the wrong carriers. Onboarding *requires* a region, so every portal-onboarded carrier was excluded from essentially every waterfall. Fixed in `v3.8.atx` with a real region→state map that fails OPEN, because a filter just shown capable of excluding everyone must not exclude on ignorance.

**The flight now passes 20/20**: build → score (risk exclusions firing) → tender → accept → dispatched at the agreed rate → check-call schedule created → carrier notified, plus the skip case, the decline case and the eligibility floor. Restoring **both** defects reproduces the historical failure verbatim — `blocked_reasons: ["Carrier not found"]`, waterfall exhausted, tender DECLINED, zero check-calls, 12/20.

### Arc 17: the seams

Six handoffs no single domain owns, walked live — **18/18**:

- **signature → gate** — a signed BCA opens tendering; a Quick Pay signature does *not* satisfy it.
- **counter → settlement** — the 221.1 case at full length: the carrier counters $4,350 against a $4,100 offer, the AE accepts on behalf, the rate confirmation is signed at the counter, and **settlement pays that number** — not the offer, not the $5,100 customer rate.
- **POD → delivered tab** — the tab clears only once POD, invoice *and* settlement are all genuinely done.
- **check-call → risk** — two missed calls score 50 points; a carrier check-in satisfies the obligation it was texted about without retroactively erasing a real miss.
- **waterfall → tracking** — the newly-joined seam: auto-dispatch creates the check-call schedule and joins the load to tracking, exactly as the direct path does.
- **the outbound set** — three sends, each to the right class: *Tender Accepted* → AE, *Booked* → the carrier's dispatch alias, *Paperwork due* → carrier. Across 20 notifications, **zero** cross-portal action links.

**Exactly-once, proven by forced repeat.** Sweeping expired tenders twice in one window: first sweep expired 1, sent 1 email; the repeat expired 0, sent 0. That count only became a meaningful test once Arc 16 removed the second scheduler — before that it would have read 2, which is precisely what carriers and AEs were receiving.

### The one open product question

**Termination mid-load is undecided, not broken.** Terminating a BCA blocks the next tender immediately and leaves loads already in the carrier's hands untouched. No carrier-portal gate reads `CarrierAgreement.status`, so that carrier keeps working the load, uploading the POD, and being paid.

That is arguably correct — the freight is on their truck and somebody has to deliver it. But nothing states the intent, no AE is told an in-flight load is now held by a terminated carrier, and nobody has decided whether SRL still pays. **Wasi's call**, and it is a policy question rather than a bug.

### What is owed, and by whom

| Owed | Owner | Why a script cannot close it |
|---|---|---|
| Eye-pass on the four PDFs | **Wasi** | Text extraction is conclusive on wording, citations and numbers, and blind to colour, overprint and a wrong-hue border — the v3.8.aru class |
| Portal walk as carrier + shipper on production | **Wasi** | Needs real credentials against the deployed site; every walk here is server-side |
| Termination-mid-load policy | **Wasi** | A decision, not a defect |
| Render deploy-hook secret | **Wasi** | CI cannot gate deploys until it exists; dashboard-only |
| PITR read for Item 212 | **Wasi** | Window closes **2026-08-27** |

---
## What was actually done

A throwaway Postgres container, schema applied from the real migration chain, the BKN scenario seeded as real rows, and each PDF produced by driving the **real download controller** with a captured response — not a hand-built fixture. A fixture proves a renderer works; this proves the renderer works *on this load*.

**Outbound neutralisation — CORRECTED 2026-08-21 (Arc 15). The claim originally printed here was false.**

> ~~*Outbound neutralised by absence… The rehearsal script refuses to start if either is set… No email or SMS could leave the machine.*~~

The script's guard read `process.env` at module top — **before** the first `await import("../src/config/database")` pulled in `config/env` and ran `dotenv.config()`. `dotenv` does not override an already-set variable, but `RESEND_API_KEY` was never set by the rehearsal env at all, so dotenv filled it from `backend/.env`, **which holds the production key**. The guard had already printed "both absent" by then.

**Nothing was sent, and that is verified rather than assumed:** zero `[Email] Sent to` lines across both rehearsals, and `autoGenerateInvoice`'s "AE notify" is a `prisma.notification.create` row rather than an email. But that outcome depended on which code paths happened to run, not on the control working. A rehearsal that exercised a genuine send path — a tender email, a POD reminder — would have sent **real mail from the production Resend account to whatever address the seed data carried**.

This is §19 Sub-pattern 16 aimed at the most expensive possible target: a safety control that was green for the wrong reason, and that I published as evidence.

**Corrected control**, now in the script and adversarially verified: the guard loads dotenv *itself* first, so it inspects the environment the app will actually see, and requires the keys to be **explicitly empty** rather than merely unset. An empty string survives dotenv (it counts as set) and is falsy where the code branches — `emailService` builds no client, `openPhoneService` throws before any network call. Run against the old conditions the new guard refuses with *"RESEND_API_KEY is set to a real value. Outbound would be LIVE"*, and the backend's own boot log now reports `[Email] Resend configured: false`.

---

## Per-document verdict

| Document | Pages | Functional | Brand (text-checkable) | Verdict |
|---|---|---|---|---|
| Executed BCA | 4 | Signature block carries name, title, timestamp, **IP**, version `2026-06-27-v1`, ESIGN/UETA language, carrier legal name + MC/DOT | Authority on page, no placeholder text, no ligature bug | **PASS** |
| Rate Confirmation | 3 | Facility named, both cities, temperature setpoint, full accessorial schedule (detention $50/hr after 2h, $250/stop cap; TONU $200; layover $250/day), carrier acceptance block, per-page footer | `SRL-140001R` suffix present, authority on page | **PASS** with one latent hazard (below) |
| BOL v2.9 | 1 | One-page layout held with real reefer/commodity data; Carmack cited as **49 U.S.C. § 14706**; shipper, consignee, seal language, weight, hazmat marking cite `49 CFR 172` correctly | Authority on page, no placeholders | **PASS** |
| Customer Invoice | 1 | `srlDocNumber = SRL-140001I` — the §21.2 suffix scheme works; bills $4,850; terms present | Authority on page | **PASS** |

**Brand caveat, stated rather than glossed:** text extraction is conclusive for wording, citations, numbers and per-page footers. It **cannot see colour, overprint, or a border in the wrong hue** — which is exactly the class the v3.8.aru red-orange border regression belonged to. A human-eye pass over all four rendered pages in both light and dark viewers is **owed** and is not claimable from this rehearsal.

---

## Findings

### GO-BLOCKER
**None found in the document chain** — and that was accurate as far as it went. **Four were found in the machinery beneath it by Arc 15, and all four are closed in Arc 16.** See the verdict above. The lesson worth keeping: a document chain can be entirely correct while the code that acts on the same numbers is not.

### FIX-NOW-SMALL
**None.** The two real findings below are latent rather than live, and fixing either means changing a shared field's meaning or a fallback's source — neither is a small inline change, and both deserve their own commit with tests.

### POST-GO-LIVE

**1. The rate confirmation's linehaul fallback reads the customer rate.** — **PARTIALLY RESOLVED, Arc 16.**

> The same root cause turned out to be live elsewhere, not merely latent here: settlement and carrier outreach both read `load.rate` on paths where it holds the customer number, and both are fixed (221.1, 221.2). The RC fallback at `pdfService.ts:1925` is **unchanged** and remains latent for the reason given below — but it is now the last consumer of the ambiguity rather than one of three.

`pdfService.ts:1925` — `const linehaul = (fd.lineHaulRate ?? load.rate)`. `loadController.createLoad:230` sets `rate: raw.customerRate || raw.rate`, so on the AE's primary creation path **`Load.rate` is the customer rate**. If `fd.lineHaulRate` is ever absent, the carrier's binding pay document prints SRL's customer rate as carrier pay.

*Not live today:* both producers set it — auto-RC from `tender.offeredRate`, the RC modal from `toNum(form.carrierLineHaul)`, which returns `0` rather than `undefined` on a blank field, so `??` does not fall through. Reachable only by a future producer that omits the key.

*Why it is worth recording anyway:* this rehearsal accidentally demonstrated it. A seed that used `lineHaul` instead of `lineHaulRate` produced a rate confirmation reading **Linehaul $4,850.00 · Total Carrier Pay $5,100.00** against an agreed $4,100 — a $1,000 overstatement on a document a carrier signs. The failure is silent and the document looks entirely normal.

**2. `Load.rate` means different things on different creation paths.** — **STILL OPEN, and deliberately so.**

> Arc 16 resolved the semantics by making `carrierRate` the single answer to "what do we owe the carrier" and giving it a writer on all four accept paths, so the money paths no longer depend on `Load.rate`'s meaning. The column's own ambiguity is untouched: unifying it means changing a shared field's meaning across every reader, which is a migration sprint, not an inline fix. Recorded rather than rushed.

`loadController.createLoad:230` → customer rate. `withTenderController:194` → `tender.offeredRate`, the carrier rate. One column, two meanings, and finding 1 is downstream of it. Any consumer reading `Load.rate` is right on one path and wrong on the other.

### NOT FINDINGS — probe errors, recorded so nobody re-raises them
- `49 CFR` appears on the BCA and BOL and is **correct**: `Parts 382-399` (FMCSA safety) and `172` (hazmat marking). The obsolete Carmack citation `§ 1035` appears nowhere; the BOL cites `14706`.
- The BCA carries no load reference. Correct — it is a master agreement, not load-scoped.
- First-run "missing IP / missing carrier name" on the BCA was my options shape: the field is `signerIp`, and `carrier` is an option separate from `signature`. Corrected, both render.

---

## Not covered by this rehearsal

Each of these is a real gap in the verdict, not an omission of convenience:

- **The full interactive lifecycle.** Registration → email verify → TOTP wall → application → vetting → approve → dispatch → status walk → check calls → POD. Individual pieces have unit and E2E coverage; the *continuous* walk as both actors has not been done.
- **A human-eye brand pass** over the four rendered pages. See the brand caveat above.
- **The carrier's first-touch experience** through the real registration flow.
- **Unhappy paths:** TONU with fault side, tender expiry, missed check call, late POD.
- **Reachability of the BOL to the driver at the dock.** The generator works; whether the AE can print it and the carrier can retrieve it pre-pickup was not exercised end to end. A BOL that exists only in code does not get freight signed.
- **`rateConNumber` allocation.** The rehearsal created the RC row directly, so no number was allocated; the invoice's `SRL-140001I` shows the scheme works. Whether the real send path allocates `…R` was not exercised.

---

## Reproducing

```
docker run -d --name srl-rehearsal -e POSTGRES_PASSWORD=rehearsal -e POSTGRES_DB=srl -p 55432:5432 postgres:16
# env with DATABASE_URL on :55432 and NO Resend/OpenPhone keys
npx prisma migrate deploy
npx tsx scripts/_rehearsal-arc14.ts        # seeds + produces the four PDFs
npx tsx scripts/_rehearsal-arc14-read.ts   # opens and reads them
```
Output lands in `.rehearsal-arc14/` with `extracted-text.json` for inspection.
