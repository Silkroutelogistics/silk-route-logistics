# Compass Engine vs Highway — Capability Gap Analysis

**Type:** Read-only audit. No source files modified, no commits.
**Date:** 2026-08-17
**Repo state:** `main` @ `94207d60` (v3.8.asc), committed 2026-08-17 11:40 EDT
**Trigger:** Highway declined at $2,000/mo minimum tier. Question: what does Compass already cover, what is cheap to add, what is structurally out of reach.
**Method:** four parallel read-only sweeps (scoring pipeline, identity services, schema + UI, FMCSA/insurance/monitoring), plus direct verification by the author of every load-bearing claim before it entered this document.

---

## Executive summary

Compass covers **regulatory status** well and **identity** barely at all. That split is the whole finding.

The five capabilities Highway leads with — verified human identity, phone-line intelligence, address reality, VPN/proxy, and cross-broker network linkage — are four cheap API integrations and one thing money cannot buy at our scale.

**The entire Tier 1 + Tier 2 adoption set below costs under $15/month in new spend**, because two of the required API keys (`GOOGLE_MAPS_API_KEY`, `GEMINI_API_KEY`) are already provisioned and the rest sit inside free tiers at 25 loads/month. Against $24,000/year, that is the decision.

Three capabilities are genuinely impossible without Highway's network. They are enumerated with substitutes and undisguised residual risk in Phase D.

**Separately, and more urgently than any Highway comparison:** this audit surfaced a set of defects in the existing vetting engine that materially degrade it today, including a cross-carrier data leak into a customer-facing PDF and a scoring floor that makes the auto-approve path unreachable. See **Phase A.4**.

---

# Phase A — Ground truth

## A.1 Sprint state

Last 30 commits are money/RC/BOL/policy work (`v3.8.aqz` → `v3.8.asc`): accessorial ledger, detention/layover conversion, PDF chrome. **No vetting-stack commit since the May authority-age epic** (`v3.8.ahj` → `ahq`, with the `aku` → `akv` rollback). The vetting code audited here has been stable for roughly three months.

Relevant open items carried in CLAUDE.md §13.3 and `docs/regression-log.md`:
- `authorityGrantedDate` returns null for every real carrier (regression-log, `v3.8.aku` → `akv` P0 rollback). Confirmed still true.
- §13.3 Item 194 E2 — Sentry DSN. Now present in `backend/.env`; treat that item as locally resolved.

## A.2 What the Compass Engine actually is

There is **no `compassScoreService.ts`**. "Compass Score" is the `score` returned by `carrierVettingService.vetCarrier()`. Separately, `tierService.calculateOverallScore` computes a *service scorecard* (the public 7-factor Compass Score on `/carriers`) — a different axis that does not feed vetting. Do not conflate them.

**Scoring model** — `backend/src/services/carrierVettingService.ts`
- Starts at `100`, purely subtractive, no weights (`:107`)
- Clamped `0..100` (`:989`)
- Grade: A ≥90, B ≥75, C ≥60, D ≥40, F <40 (`:83-89`)
- Risk: LOW ≥80, MEDIUM ≥60, HIGH ≥40, CRITICAL <40 (`:76-81`)
- Recommendation: LOW→APPROVE, CRITICAL→REJECT, else REVIEW (`:91-95`)
- **There is no confidence number.** The only `confidence` in the pipeline is `tinResult.confidence`, string-interpolated into one check's detail text (`:530`) and never aggregated.

**No check is a hard fail.** The two "INSTANT FAIL" conditions (no authority, out of service) are 100-point deductions into a clamp, not control-flow blocks. A carrier failing twelve minor checks is indistinguishable from an OFAC-sanctioned one — both floor at 0.

**Blocking lives entirely in `complianceCheck()`** — `backend/src/services/complianceMonitorService.ts:76-322`. Fourteen conditions in order; blocks on suspended/rejected, expired insurance, authority age, FMCSA revoked/OOS, unsigned BCA, OFAC potential match, expired COI, HIGH chameleon risk, and `lastVettingScore < 40`. This is the real gate, and it is invoked on every tender path.

**Configurability: none.** Every threshold, deduction, grade band, and quota is a hardcoded literal. No settings model, no rules table, no env override. Confirmed: zero `process.env` reads in either `carrierVettingService.ts` or `complianceMonitorService.ts`. A broker cannot change a single weight without a code deploy. The only runtime lever is `ComplianceOverride` — per-carrier, 24-hour, quota-limited.

## A.3 Capability status by data source

| Service | Status | Evidence |
|---|---|---|
| `fmcsaService.verifyCarrierWithFMCSA` | **REAL** | QCMobile `/carriers/{dot}`, `FMCSA_WEB_KEY`, 1h cache, fails safe |
| `fmcsaService.getCarrierAuthority` | **DEAD** | `/authority` returns current status only, not GRANT history; parser matches zero rows on every real response |
| `ofacScreeningService` | **REAL** | Treasury `sanctionssearch.ofac.treas.gov`, no key required, weekly rescan, auto-suspends |
| `identityVerificationService` (email) | **REAL** | DNS MX + RDAP domain age + disposable list + free-vs-business |
| `identityVerificationService` (phone) | **HEURISTIC** | numverify path gated on `NUMVERIFY_API_KEY` — **unset, and absent from `env.ts` schema**; falls back to a 19-entry area-code list |
| `identityVerificationService` (SOS) | **REAL** | OpenCorporates free tier, by name/state |
| `chameleonDetectionService` | **REAL, internal-only** | 6 SHA-256 signals matched against SRL's own `carrier_fingerprints` only |
| `samGovService` | **REAL, degraded** | Defaults to `DEMO_KEY` (~30/day); **fails open as CLEAR** |
| `vinVerificationService` | **REAL** | NHTSA vPIC, no key |
| `csaBasicService` | **DEAD (both sources)** | QCMobile parse reads `data.carrier`, API returns `data.content.carrier`; SMS endpoint returns HTML |
| `fmcsaInspectionService` | **REAL, unconsumed** | Correct parsing, working route `GET /carriers/:id/inspections`, **zero frontend callers** |
| `insuranceVerificationService` | **MANUAL** | Human email to agent, no structured response capture |
| `tinMatchService` | **STUB** | Gated on `IRS_TIN_MATCH_API_KEY`; the URLs are not real IRS endpoints |
| `biometricVerificationService` | **DEAD** | Rekognition wired, but nothing ever writes `photoIdUrl`/`selfieUrl` |
| `documentOcrService` | **STUB** | Returns `UNKNOWN`, confidence 0, `// TODO`. No callers |
| `coiReaderService` | **REAL, misplaced** | Gemini Vision COI extraction — wired **only** to AE-side `POST /carriers/:id/read-coi`, never to onboarding |
| `motiveService` / `samsaraService` | **REAL code, DEAD** | Single global env keys; a broker has no fleet account. No per-carrier credential flow |
| `eldValidationService` | **STUB** | Exact string match against a 31-name allowlist |
| `highwayProvider` | **DEAD SCAFFOLD — HAZARD** | See A.4 #3 |

**Env-var contract gap.** `NUMVERIFY_API_KEY`, `IRS_TIN_MATCH_API_KEY`, `SAM_GOV_API_KEY`, and `HIGHWAY_API_KEY` are read via raw `process.env` and are **absent from the validated `env.ts` schema**. They cannot be set through the canonical config path and are invisible to config validation. Any adoption below that introduces a key must add it to `env.ts` **and** to the four-location checklist in CLAUDE.md §19 Sub-pattern 11 (local `.env`, Render dashboard, CI workflow env blocks, CLAUDE.md §2.2).

**Already provisioned and usable:** `GOOGLE_MAPS_API_KEY` ✓, `GEMINI_API_KEY` ✓, `FMCSA_WEB_KEY` ✓, `RESEND_API_KEY` ✓, `OPENPHONE_API_KEY` (Render). `geoip-lite` and `@aws-sdk/client-rekognition` are installed.

## A.4 Defects found (independent of the Highway question)

These degrade the engine today and are cheaper to fix than anything in Phase C.

**1 — Cross-carrier data leak in vetting check #36.** `carrierVettingService.ts:937-945`:

```ts
const trucks = await prisma.truck.findMany({
  where: { iftaExpiry: { lt: new Date() }, ifta: true },   // no carrier scoping
  select: { id: true, unitNumber: true, iftaExpiry: true },
});
```

*Verified by direct read.* No `carrierId` filter. One expired-IFTA truck belonging to **any** carrier deducts 10 points from **every** carrier vetted, and writes other carriers' unit numbers into the check detail string — which renders in the AE UI and in the **customer-facing Compass PDF** (`compassPdfService`). This is a tenant-isolation break in an exportable document.

**2 — The CSA safety gate passes everyone at zero cost.** Both `csaBasicService` sources are dead, so the scores object is all-null. `carrierVettingService.ts:281-295` then runs `Math.max()` over an empty numeric set, yielding `-Infinity`, which fails both the `>90` and `>75` tests and lands on `result: "PASS", deduction: 0` with detail text reading **"Highest percentile: -Infinity th"**. A carrier in the 99th percentile for Unsafe Driving scores identically to a clean one, and the PDF prints `-Infinity`.

**3 — `highwayProvider` fabricates approvals.** *Verified by direct read.* `backend/src/services/complianceProviders/highwayProvider.ts:29-45`: with no API key it returns `available: true` alongside invented data — `legalName: "Mock Transport LLC"`, `status: "AUTHORIZED"`, `authorityGrantedDate: "2019-03-15"`, and elsewhere `riskLevel: "LOW", recommendation: "APPROVE"`. It has zero importers today, so it is inert. But it advertises availability while returning fiction; if anyone ever wires it, it approves everything. Given Highway is declined, **delete the file** rather than leave the landmine.

**4 — Dead checks impose a permanent floor, making auto-approve unreachable.** Four checks have data sources with no writer anywhere in `backend/src`, so they deduct a fixed amount from every carrier forever: IRP `-5` (`:907-921`), IFTA `-5` (`:925-935`), authority age `-5` (null grant date, `:250-265`), biometric `-8` (no selfie ever collected, `:583-602`). Add TIN `-5` (`w9CompanyName` never written) and VIN `-5` (a new carrier has no loads, so zero trucks resolve) and a **flawless new carrier starts near 62 — grade C, risk MEDIUM, recommendation REVIEW.** Registration auto-approves only on grade A (`carrierController.ts:628-640`), so **that path can never fire.** Check the arithmetic against the deduction column before acting, but the direction is not in doubt.

**5 — Chameleon detection is weakened by two hashing choices.** `emailHash` hashes the **domain only**, so every carrier on gmail.com collides and generates noise; `einHash` uses the **last four digits** (~10⁴ space) and is in any case always null because **EIN is never collected** — the onboarding EIN input was removed in `v3.8.air` and no W-9 parser replaced it. The onboarding UI still tells the carrier "your EIN is extracted from this" (`onboarding/page.tsx:1475`), which is false.

**6 — VOIP heuristic produces false positives on real geographic area codes.** `identityVerificationService.ts:143-150` lists 626, 562, 209, 559 among others as VOIP prefixes. These are ordinary California NPAs. Legitimate carriers are being penalized.

**7 — A blanket `ComplianceOverride` (null `checkCode`) short-circuits every downstream check** (`complianceMonitorService.ts:101-111`), including OFAC, chameleon, and unsigned BCA. Scoped overrides exist but are consulted only in the 12–18-month authority band.

**8 — SAM.gov runs on `DEMO_KEY`** (~30 requests/day) and **fails open as CLEAR** on any error.

**9 — Asymmetric auto-suspend on the daily FMCSA rescan.** Out-of-service auto-suspends; **insurance disappearing from the FMCSA record only raises an alert**. Safety-rating downgrade to CONDITIONAL/UNSATISFACTORY is warning-only.

**10 — Cosmetic compliance UI.** The Compliance tab's IRP/IFTA/BOC-3/MCS-150/UCR rows derive their status from `onboardingStatus === "APPROVED"` or `dotNumber !== null` (`dashboard/carriers/page.tsx:1295-1299`), ignoring the real columns entirely. The Inspections tab is hardcoded em-dashes over a **working, unconsumed backend route**.

**11 — Duplicate and mislabelled crons.** OFAC and chameleon scans are scheduled in **both** `cron/index.ts` and `schedulerService.ts` on different days. Three comments claim "every 5 minutes" / "every 15 minutes" for jobs that ship `0,30 * * * *`.

**Refuted claim, recorded for accuracy:** an initial finding held that `carrierVettingService.ts:716` passes `userId` where `verifyAllCarrierVins` expects a `CarrierProfile.id`. This is **wrong** — `schema.prisma:1564-1565` defines `Load.carrierId` as a relation to **User**, so passing `userId` is correct. The VIN check returns zero trucks for a different and benign reason: it resolves trucks through delivered loads, and a carrier being vetted at onboarding has none.

---

# Phase B — Cross-reference

| # | Capability | Our current status | Where it lives / would live | Classification |
|---|---|---|---|---|
| 1 | Operating authority verification vs FMCSA | Live QCMobile lookup at registration + daily rescan; auto-suspends on revoked/OOS | `services/fmcsaService.ts`, `complianceMonitorService.ts:841` | **ALREADY BUILT** |
| 2 | Insurance certificate validation + expiry monitoring | Expiry monitoring real (daily cron, auto-suspends, no grace). Certificate itself is upload-only; amounts self-reported. Gemini COI parser exists but is wired only to a manual AE route | `insuranceVerificationService.ts`, `coiReaderService.ts`, `routes/carriers.ts:218` | **PARTIAL** |
| 3 | Insurance verified with the agent, not the document | Agent email exists and fires on field change; purely human, no structured response capture, nothing ever marks insurance verified | `insuranceVerificationService.ts:159-317` | **PARTIAL** |
| 4 | Continuous re-monitoring after approval | Daily FMCSA, weekly OFAC, weekly chameleon, monthly re-vet, daily insurance enforcement | `cron/index.ts`, `schedulerService.ts` | **ALREADY BUILT** |
| 5 | BASIC scores, inspection + crash history | CSA dead both sources and fails open at 0 deduction. Inspection service real, route works, **UI is em-dashes** | `csaBasicService.ts`, `fmcsaInspectionService.ts`, `carriers/page.tsx:1519` | **PARTIAL** |
| 6 | Broker-configurable pass/fail rules | None. Every threshold hardcoded; no rules model | would be new `VettingRule` model + admin UI | **BUILDABLE EXPENSIVE** |
| 7 | Stated reason for every failure | `blocked_reasons` strings do render in the AE UI. But only 2 of ~12 conditions have stable codes, and persisted per-check results are never rendered — the Compass tab shows checks only for a live in-session run | `complianceMonitorService.ts:70-74`, `carriers/page.tsx:1456` | **PARTIAL** |
| 8 | Cell vs landline vs VOIP at point of entry | Code path exists; API key unset **and absent from env schema**; fallback is a 19-area-code list with false positives | `identityVerificationService.ts:244-288` | **PARTIAL** |
| 9 | SMS MFA before packet access | SMS capability exists (OpenPhone) but is used only for driver invites and unusual-country login. **Zero SMS in carrier onboarding.** No packet concept | `openPhoneService.ts:99`, `onboarding/page.tsx` | **BUILDABLE CHEAP** |
| 10 | OTP relay / virtual number detection | None | rides on the same phone-intelligence lookup as #8 | **BUILDABLE CHEAP** |
| 11 | Facial recognition + government ID of the individual | Rekognition SDK installed and code path present, but **no UI ever collects a selfie or ID**; `photoIdUrl`/`selfieUrl` have no writer. Scores −8 on every carrier | `biometricVerificationService.ts` (retire), new vendor integration | **BUILDABLE CHEAP** |
| 12 | International government ID across many countries | None | same vendor as #11 | **BUILDABLE CHEAP** |
| 13 | Verified binding of an individual to a carrier entity | Account-level binding exists — per-carrier user accounts, and the magic-link tender accept embeds `carrierUserId`. What is missing is verifying the *person* behind the account | `lib/tenderActionToken.ts`, `routes/tenderAction.ts` + #11 | **PARTIAL** |
| 14 | Company email domain verification | MX lookup, RDAP domain age, ~300-entry disposable list, free-vs-business scoring | `identityVerificationService.ts:203-231` | **ALREADY BUILT** |
| 15 | IP geolocation of the person onboarding | `geoip-lite` offline, country stored plaintext, geo-mismatch detection, rendered in `SecuritySignalsCard` | `services/geoService.ts`, `SecuritySignalsCard.tsx` | **ALREADY BUILT** |
| 16 | VPN / proxy detection | None — explicitly deferred in `geoService.ts:9-13` | `geoService.ts` + IPQS | **BUILDABLE CHEAP** |
| 17 | Physical address verification (satellite / registry) | Address stored as typed. Only check is fuzzy city-string equality vs FMCSA | `crossReferenceService.ts:240`, + Google Address Validation | **BUILDABLE CHEAP** |
| 18 | Cross-carrier VIN collision | None. `CarrierFingerprint` has no VIN signal | `chameleonDetectionService.ts:52-61` | **BUILDABLE CHEAP** *(intra-SRL only — see Phase D)* |
| 19 | Onboarding velocity across brokers | Impossible to observe | — | **STRUCTURALLY IMPOSSIBLE** |
| 20 | Factoring company risk scoring | Impossible to observe | — | **STRUCTURALLY IMPOSSIBLE** |
| 21 | Repeat-offender network linkage | Built in-house — 6 hashed signals, `ChameleonMatch` rows, HIGH risk blocks tender. Reach is capped at SRL's own carrier base, and two signals are defective (A.4 #5) | `chameleonDetectionService.ts` | **PARTIAL** |
| 22 | Identity-theft victim flagging | Impossible to observe | — | **STRUCTURALLY IMPOSSIBLE** |
| 23 | ELD integration + live truck position | Motive/Samsara clients are real code but keyed globally, not per carrier; `ELDDeviceMapping` has no provisioning flow; `eldEnabled` has **zero writers**. Tracking is fed by manual entry, geofence, and email parsing | `motiveService.ts`, `samsaraService.ts`, `routes/eld.ts` | **PARTIAL** |
| 24 | Pre-filled packet: banking, terms, W-9/W-8, IRS validated | Payment terms exist on the profile. **No banking fields exist anywhere in the schema.** No packet generation. W-9 upload-only, EIN never captured, TIN match is a stub | `carrierController.ts`, new fields | **PARTIAL** |
| 25 | E-signature on the packet | Click-wrap BCA with server-stamped `bcaAgreedAt` / IP / user-agent / version, plus `CarrierAgreement` with typed signature, `signerIp`, `signerUserAgent`, and a signed-agreement PDF. Not a tamper-evident e-sign certificate | `carrierController.ts:298-301`, `routes/carriers.ts:317` | **PARTIAL** |
| 26 | Exportable vetting record | Per-carrier Compass PDF export exists and works. `VettingReport.checksJson` persists every historical run — but nothing renders or exports it; the fleet CSV carries no vetting detail | `compassPdfService.ts`, `routes/carriers.ts:149` | **PARTIAL** |

**Tally:** ALREADY BUILT 4 · PARTIAL 11 · BUILDABLE CHEAP 7 · BUILDABLE EXPENSIVE 1 · STRUCTURALLY IMPOSSIBLE 3.

---

# Phase C — Adoption specs

Volume assumption throughout: **25 loads/month, 3–5 new carriers/month, ~20 active carriers.** Every figure below is computed at that scale.

> **Migration note applying to all specs:** prefer `String?` columns with app-level validation over new Postgres enums. Every new enum requires a `CREATE TYPE` migration, which needs an explicit `psql` pre-step in CI and adds P1002 advisory-lock exposure per CLAUDE.md §2.2. Specs that would otherwise want an enum are flagged **[ENUM → use String]**.

---

### C1 · Phone line-type + reputation *(capability 8, 10)*

- **Source:** Twilio Lookup v2, Line Type Intelligence package. Optionally add SMS Pumping Risk for relay/virtual-number signal.
- **Cost:** $0.008 per lookup → **~$0.04/month** at 5 new carriers. Effectively free.
- **Schema:** none required — `CarrierIdentityVerification.phoneType` / `phoneCarrier` / `phoneIsVoip` already exist. Add `phoneRiskScore Int?` if adopting the pumping-risk signal.
- **Consumed by:** `carrierVettingService` check #13 (`:343-354`), replacing the area-code heuristic. `identityVerificationService.detectPhoneType` (`:244`) is the single swap point.
- **Signal type:** **hard fail** on VOIP/virtual for a *new* carrier; scored −10 for an existing one.
- **UI:** Profile tab contact row; `SecuritySignalsCard` for the risk detail.
- **Also fixes:** A.4 #6 — delete `VOIP_PREFIXES` (`:143-150`) entirely.
- **Env:** add `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` to `env.ts` **and** the four-location checklist.

### C2 · Government ID + selfie verification *(capability 11, 12, and the missing half of 13)*

- **Source:** Stripe Identity (document + selfie). Persona and Veriff are equivalent alternatives.
- **Cost:** $1.50 per verification → **~$7.50/month** at 5 carriers. This is the single largest line item in the whole plan.
- **Schema:** reuse `CarrierIdentityVerification` — `photoIdUrl`, `selfieUrl`, `facialMatchScore`, `facialMatchStatus`, `facialMatchVerifiedAt` all already exist and are currently unwritten. Add `idvProvider String?`, `idvSessionId String?`, `idvVerifiedName String?`. **[ENUM → use String]** for status.
- **Consumed by:** check #22 (`:583-602`) — replace the byte-hash comparison. Add a `complianceCheck` condition so an unverified signer blocks tender.
- **Signal type:** **hard fail** — no verified individual, no tender.
- **UI:** new step in `onboarding/page.tsx` (a hosted redirect, so no PII touches our servers); result on the Compliance tab and in `SecuritySignalsCard`.
- **Retire:** `biometricVerificationService.ts` and the installed `@aws-sdk/client-rekognition` dependency. Do not extend the SHA-256 byte-equality fallback.
- **International coverage** (capability 12) is included by the same vendor at the same price — no extra work, which is why #12 is cheap but Tier 3: our carrier base is domestic.

### C3 · Address validation *(capability 17)*

- **Source:** Google Address Validation API — **rides the already-provisioned `GOOGLE_MAPS_API_KEY`**. Returns USPS standardization plus CMRA (commercial mail-receiving agency) and address-type flags, which is exactly the mailbox-storefront signal.
- **Cost:** **$0.** Google's $200/month platform credit covers ~12,000 lookups; we would use 5.
- **Schema:** `CarrierProfile` add `addressVerifiedAt DateTime?`, `addressVerificationResult String?`, `addressIsCmra Boolean?`, `addressFormatted String?`. **[ENUM → use String]**.
- **Consumed by:** new check in `carrierVettingService`; add a `complianceCheck` condition for CMRA/PO-box.
- **Signal type:** **hard fail** on CMRA/PO-box/undeliverable; scored −8 on unconfirmed-but-plausible.
- **UI:** Profile tab, beside the address; flag chip on the Compliance tab.
- **Satellite imagery** is not replicable and is not needed — CMRA classification catches the same fraud pattern more reliably than a human squinting at a rooftop.

### C4 · VPN / proxy / datacenter detection *(capability 16)*

- **Source:** IPQualityScore proxy detection API. Free tier is ~1,000 lookups/month.
- **Cost:** **$0** at our volume. Paid tier starts near $99/month and is unnecessary until ~1,000 registrations/month.
- **Schema:** `CarrierProfile` add `registrationIsProxy Boolean?`, `registrationIspName String?`, `registrationFraudScore Int?`.
- **Consumed by:** `geoService` — extend `resolveGeo`; new scored check; feed `SecuritySignalsCard`.
- **Signal type:** **scored** (−15). Not a hard fail — legitimate carriers use VPNs. Combined with a VOIP phone or a CMRA address it should escalate to manual review.
- **UI:** `SecuritySignalsCard`, alongside the existing geo-mismatch alert.
- **Env:** add `IPQS_API_KEY` to `env.ts` + four-location checklist.

### C5 · Close the insurance verification loop *(capability 3, and half of 2)*

- **Source:** none — no new vendor. Give the existing agent email a **signed token link** to a hosted confirm/dispute page, exactly like the `tenderActionToken` pattern already shipped in `v3.8.als`.
- **Cost:** **$0.**
- **Schema:** new `InsuranceVerification` model — `carrierProfileId`, `token`, `sentAt`, `respondedAt`, `respondedBy`, `outcome String`, `agentNotes`, `expiresAt`. **[ENUM → use String]** for outcome. Add `CarrierProfile.insuranceVerifiedAt DateTime?`.
- **Consumed by:** `complianceCheck` — no agent confirmation on file blocks tender for a new carrier.
- **Signal type:** **hard fail** for a first load; scored thereafter.
- **UI:** Insurance tab — verification state, agent, timestamp; resend control.
- **Note:** reuse `lib/tenderActionToken.ts` wholesale. Purpose-scoped JWT, public route, no auth — the token is the authorization. This is the highest-value zero-dollar item in the plan.

### C6 · COI parsing at onboarding *(capability 2)*

- **Source:** `coiReaderService.extractCOIData` — **already built, already uses the provisioned `GEMINI_API_KEY`**, currently reachable only from the AE-side manual route.
- **Cost:** pennies per document on the existing key.
- **Schema:** none. Add `coiExtractedJson Json?` on `CarrierProfile` if you want to retain the raw extraction.
- **Consumed by:** call it in `carrierController.registerCarrier` at the COI upload site (`:351-362`); cross-check extracted amounts and expiry against the carrier's typed values and against `MIN_COVERAGE` in `insuranceVerificationService.ts:19-24`.
- **Signal type:** **scored** — mismatch between typed and extracted values is a −20 fraud signal and should force manual review. It is the cheapest available detector of a doctored certificate.
- **UI:** Insurance tab — show typed vs extracted side by side with mismatches highlighted.
- **This is the single best effort-to-value item in the audit:** the parser exists, the key exists, it needs a function call in one place.

### C7 · W-9 parsing and EIN capture *(capability 24)*

- **Source:** Gemini Vision on the existing key, same pattern as C6.
- **Cost:** pennies.
- **Schema:** none new — `CarrierIdentityVerification.w9TinFull` / `w9TinLastFour` exist and are unwritten. Add `w9CompanyName String?` (**required** — check #21 already reads it and it has no writer, which is why TIN matching is permanently "not checked").
- **Consumed by:** check #21; and critically `chameleonDetectionService.buildFingerprint` — restoring `einHash`, currently always null.
- **Signal type:** **scored**; name/EIN mismatch against the FMCSA legal name is a hard fail.
- **UI:** Compliance tab.
- **Also fixes:** A.4 #5 (dead EIN signal) and the false claim at `onboarding/page.tsx:1475` that EIN is already extracted.
- **On "IRS validated":** real IRS TIN Matching is an e-Services enrollment for payers filing 1099s — an interactive/bulk web tool, **not a REST API**. `tinMatchService`'s endpoints do not exist. Either enroll in e-Services and do it manually at 1099 time, or use a commercial wrapper (Tax1099, Avalara) later. Delete the fictional URLs.

### C8 · SMS verification at onboarding *(capability 9)*

- **Source:** OpenPhone `sendSMS` — already wired and subscribed.
- **Cost:** **$0** incremental.
- **Schema:** `CarrierProfile` add `phoneVerifiedAt DateTime?`. Reuse the existing `OtpCode` model with a `CARRIER_REG:` prefix, matching the `VERIFY:` / `RESET:` convention already in `otpService`.
- **Consumed by:** gate Step 1 → Step 2 in `onboarding/page.tsx`; add a `complianceCheck` condition.
- **Signal type:** **hard fail** — an unverified phone cannot complete registration.
- **UI:** onboarding Step 1, mirroring the existing email-verification pattern.
- **Sequencing:** deploy **after C1**, so a VOIP number is rejected before we spend an SMS on it.

### C9 · Wire the inspection data that already exists *(capability 5)*

- **Source:** `fmcsaInspectionService` — already written, correct parsing, working route `GET /carriers/:id/inspections`, zero frontend callers.
- **Cost:** **$0.** Uses the existing `FMCSA_WEB_KEY`.
- **Schema:** none.
- **Consumed by:** replace the hardcoded em-dashes at `carriers/page.tsx:1519-1553` with a TanStack query against the existing route.
- **Signal type:** **scored** — OOS rates above the national averages already hardcoded in that tab (5.51% driver / 20.72% vehicle).
- **Caveat to verify first:** the QCMobile `/inspections` endpoint may require elevated FMCSA entitlement. Confirm it returns data for a known carrier before wiring the UI — and note the service currently **fails open**, returning all-zeros with `betterThanAverage: true`, so a carrier with no retrievable data reads as better than average. Fix that to return `null`/unknown, not zeros.
- **CSA BASICs specifically:** FMCSA publishes them on the SMS website but exposes **no clean public API**, and the two paths in `csaBasicService` are both dead. Options: (a) delete the check rather than let it silently pass everyone, (b) manual SMS lookup during onboarding, (c) a commercial data reseller later. **Do (a) now** — a check that prints "-Infinity" and always passes is worse than no check.

### C10 · Persist and export the vetting record *(capability 7, 26)*

- **Source:** none — the data is already persisted in `VettingReport.checksJson` / `flagsJson` / `fmcsaSnapshot` with timestamps.
- **Cost:** **$0.**
- **Schema:** none.
- **Consumed by:** the Compass tab should read the latest `VettingReport` instead of showing checks only for a live in-session run; extend `compassPdfService` to render a historical report by id.
- **Signal type:** n/a — surfacing only.
- **UI:** Compass tab; add a report-history selector; keep the existing PDF download.
- **Also:** promote the ~12 block conditions in `complianceCheck` to stable codes. Only `AUTHORITY_TOO_YOUNG` and `AUTHORITY_UNVERIFIED` have them today, which is why scoped overrides can only be minted for the authority gate.

### C11 · Repair chameleon hashing *(capability 21)*

- **Source:** none.
- **Cost:** **$0.**
- **Schema:** none. Add `vinHash String?` to `CarrierFingerprint` if adopting C12.
- **Change:** hash the **full email address** rather than the domain (keep a separate domain signal at lower weight); hash the **full EIN** once C7 supplies it.
- **Signal type:** unchanged — HIGH blocks, MEDIUM warns.
- **UI:** `SecuritySignalsCard`, unchanged. Note the copy there refers the AE to "the chameleon detection UI", which does not exist — the review endpoints (`PUT /carriers/chameleon-matches/:matchId/review`) have no frontend caller.

### C12 · Intra-SRL VIN collision *(capability 18 — bounded)*

- **Source:** none. Our own truck records.
- **Cost:** **$0.**
- **Schema:** `CarrierFingerprint` add `vinHash String?` (indexed), or a separate `CarrierVin` join table since a carrier has many VINs.
- **Consumed by:** `chameleonDetectionService`.
- **Signal type:** **hard fail** — the same VIN on two carrier records is not innocent.
- **Honest value assessment:** at 5–20 carriers this fires approximately never. Build it when the carrier base passes ~50. **See Phase D for what we actually lose here.**

### C13 · Banking capture *(capability 24)*

- **Source:** none, but **do not store raw account numbers**. Either collect a voided check as a `Document` (the `InfoRequestCategory.VOIDED_CHECK` path already exists) or use a payment processor's tokenized bank-account object.
- **Cost:** $0 for the document path.
- **Schema:** `CarrierProfile` add `bankAccountToken String?`, `bankVerifiedAt DateTime?`, `bankLastFour String?`. **Never** add plaintext routing/account columns — none exist today and that is the correct state.
- **Signal type:** **hard fail** before first settlement, not before first tender.
- **UI:** a banking step in carrier activation, not onboarding.
- **Fraud note:** mid-relationship bank-detail changes are a primary payment-fraud vector. Any change should require re-verification and should notify `compliance@` — cheaper to build than to recover from.

---

# Phase D — Ranked adoption

Ranked by **fraud loss prevented per dollar**, for our specific profile: low volume, small hand-sourced carrier base, CPG freight (high-theft-attractive), single anchor customer where one incident is existential.

## Tier 1 — Hard gate before any carrier can be tendered a load

| Rank | Item | Spec | Monthly cost | Why first |
|---|---|---|---|---|
| 1 | **Government ID + selfie of the signing individual** | C2 | ~$7.50 | Defeats the impersonation vector directly. Every double-brokering scheme starts with a person who is not who they claim. This is the capability Highway sells and the one we most lack |
| 2 | **Phone line-type at point of entry** | C1 | ~$0.04 | Highest-signal cheapest check in freight fraud. Fraudulent carriers use VOIP and burner numbers almost universally. Also removes a heuristic that is currently penalizing legitimate California carriers |
| 3 | **Insurance confirmed by the agent via token link** | C5 | $0 | Closes the loop on a document we currently accept on trust. A forged COI is trivially produced and we have no detector |
| 4 | **COI parsed and cross-checked at onboarding** | C6 | ~$0 | The parser and the API key already exist. A typed-vs-extracted mismatch is the cheapest forgery detector available to us |
| 5 | **Address validation with CMRA detection** | C3 | $0 | Rides a key we already pay for. Catches the mailbox-drop and parking-lot address pattern |
| 6 | **SMS verification of the phone** | C8 | $0 | Deploy after #2 so VOIP numbers are rejected first |

**Tier 1 total new spend: under $8/month.**

Also in Tier 1, at zero cost and higher urgency than any of the above: **fix A.4 #1** (the cross-carrier leak into the Compass PDF), **delete `highwayProvider.ts`** (A.4 #3), and **remove or repair the CSA check** (A.4 #2) so it stops silently passing every carrier while printing `-Infinity`.

## Tier 2 — Scored signals contributing to the number, not blocking

| Rank | Item | Spec | Monthly cost | Rationale |
|---|---|---|---|---|
| 7 | VPN / proxy / datacenter detection | C4 | $0 | Free tier covers us entirely. Not a blocker alone; powerful in combination |
| 8 | W-9 parsing + EIN capture | C7 | ~$0 | Revives a dead chameleon signal and the permanently-unchecked TIN match |
| 9 | Chameleon hashing repair | C11 | $0 | Removes gmail-domain collision noise; restores EIN matching once #8 lands |
| 10 | Inspection / crash data wired to the existing route | C9 | $0 | The backend works today; only the UI binding is missing. Fix the fail-open-to-zeros behavior in the same change |
| 11 | Persisted vetting record + stable block codes | C10 | $0 | Makes the AE decision auditable and scoped overrides possible beyond the authority gate |

**Tier 2 total new spend: $0.**

## Tier 3 — Defer until volume justifies it

| Item | Spec | Trigger to revisit |
|---|---|---|
| Intra-SRL VIN collision | C12 | Carrier base > 50 |
| Banking capture + change re-verification | C13 | Before first carrier settlement, not before first load |
| International ID verification | C2 (included free) | First non-domestic carrier |
| Configurable rules engine (cap. 6) | — | Second person doing carrier approvals. Hardcoded thresholds are correct while one founder decides |
| ELD per-carrier OAuth (cap. 23) | — | A customer contractually requires live telematics. Note `eldEnabled` has zero writers, so the GPS-compliance scorecard branch is unreachable today |
| E-signature platform (cap. 25) | — | Only if counsel requires a tamper-evident certificate. Our click-wrap with server-stamped IP, user-agent, timestamp, and version is defensible under ESIGN/UETA. Dropbox Sign's API tier is $300/month — 40× the entire Tier 1 plan |

## What we are exposed to by not buying Highway

Three capabilities require observing carrier behavior across brokers other than us. No amount of engineering or third-party API spend reproduces them, because the input data is other brokers' traffic.

### 19 · Onboarding velocity across brokers

**Substitute:** refuse unsolicited inbound carriers for anchor-customer freight; source through referral and known relationships only. Cross-check fleet size from FMCSA against claimed capacity — a two-truck carrier bidding on volume freight is the observable tail of the same signal.

**Residual risk — stated plainly:** a carrier that solicited two hundred brokers last week and one that solicited two look **identical** to us. Onboarding velocity is the earliest reliable signal that an entity is harvesting broker relationships to convert later, and we will not have it. We see our own single data point, and a first-time carrier looks the same either way.

### 20 · Factoring company risk scoring

**Substitute:** maintain an internal allowlist of factors we have paid without incident. Require a Notice of Assignment and verify it by calling the factor at a number obtained independently, never from the NOA document. Treat a factoring change mid-relationship as a re-verification trigger.

**Residual risk:** we cannot see the composition of a factor's book. A factor carrying a heavy concentration of double-brokering carriers is invisible to us until we are already in a payment dispute. Factors are frequently the mechanism by which fraud is monetized, and we are blind to that entire layer.

### 22 · Identity-theft victim flagging on legitimate carriers

**Substitute:** call every new carrier back on the phone number in their **FMCSA record**, never the number in their email signature. Verify insurance with the agent independently (C5). Both practices materially reduce this exposure and cost nothing.

**Residual risk, and this is the sharpest one:** when a fraudster has also compromised the FMCSA record — updating the contact phone or email on the DOT registration, which is a known and not-rare attack — **our callback lands on the fraudster and confirms the fraud.** Every control we have then points the same direction, confidently and wrongly. Highway sees the legitimate carrier reporting the theft through another broker; we never will. This is the single scenario where our full stack, correctly operated, produces a false green light.

### The honest bottom line

Tier 1 and Tier 2 close the gap on **identity at the point of entry** — who this person is, whether their phone and address and insurance are real. That is most of the fraud we would realistically face at 25 loads/month with a hand-sourced carrier base, and it costs under $15/month against Highway's $2,000.

What we do not get, and cannot buy at any price short of Highway or a comparable consortium, is **the network view**: the ability to see an actor's behavior across brokers we do not control. Our exposure is concentrated in one specific scenario — a carrier whose credentials are genuinely valid, whose FMCSA record has been compromised, operating against us for the first time. Every check in Tier 1 passes that carrier. Manual discipline does not catch it.

The mitigating factor is volume and sourcing: at a handful of hand-picked carriers per month, we can afford per-carrier scrutiny that does not scale to fifty. **That is the real substitute for Highway, and it stops working somewhere around fifty carriers or the point where we can no longer personally vouch for who is hauling.** That threshold — not a dollar figure — is the trigger to revisit this decision.

---

## Recommended sequence

1. **This week, $0:** fix the cross-carrier leak (A.4 #1), delete `highwayProvider.ts`, disable the CSA check.
2. **Sprint 1, ~$8/month:** C1 phone intelligence + C2 identity verification. The two hard gates that matter most.
3. **Sprint 2, $0:** C5 insurance token loop + C6 COI parsing. Both close forgery vectors using assets we already own.
4. **Sprint 3, $0:** C3 address validation + C8 SMS. Completes Tier 1.
5. **Then Tier 2** as capacity allows — all zero-cost.
6. **Recalibrate the scoring floor** (A.4 #4) once the dead checks are removed or fed, or the grade-A auto-approve path stays permanently unreachable.

---

*Read-only audit. No source files were modified and no commits were made in producing this report.*
