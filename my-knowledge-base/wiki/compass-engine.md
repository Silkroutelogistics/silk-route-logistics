---
title: Compass Engine — 35-Check Carrier Vetting
type: system
created: 2026-04-07
updated: 2026-04-07
source_count: 4
status: reviewed
confidence: HIGH
tags: [compliance, carrier-vetting, fmcsa, ofac, fraud-detection]
---

# Compass Engine

> SRL's proprietary carrier vetting system running 35 compliance checks during [[carrier-onboarding]]. Scores carriers 0-100, assigns grade (A-F), risk level (LOW-CRITICAL), and recommendation (APPROVE/REVIEW/REJECT). A-grade carriers auto-approve on registration.

## State

25 of 35 checks are fully operational as of April 2026. [EXTRACTED: codebase audit Apr 7, 2026]

The engine runs automatically during carrier registration via `vetAndStoreReport()` as a background task. Results are stored in `VettingReport` and `ComplianceScan` tables, and `CarrierProfile` is updated with `lastVettingScore`, `lastVettingRisk`, `vettingGrade`. [EXTRACTED: carrierVettingService.ts]

A-grade carriers (score >=90, recommendation APPROVE) are auto-approved — `onboardingStatus` set to APPROVED, `isVerified` set to true, notification sent. [EXTRACTED: carrierController.ts, Apr 7 2026 code change]

Registration now collects phone (required), address (required), and EIN (optional) — all wired into chameleon fingerprint building for fraud detection. [EXTRACTED: carrier registration upgrade Apr 7, 2026]

## Scoring
- Score starts at 100, deductions subtracted per failed check [EXTRACTED: carrierVettingService.ts]
- Grade: A (>=90), B (>=75), C (>=60), D (>=40), F (<40)
- Risk: LOW (>=80), MEDIUM (>=60), HIGH (>=40), CRITICAL (<40)
- Checks #1 (FMCSA Authority) and #2 (Out of Service) are instant fails (-100 points)

## 35 Checks — Operational Status

### Fully Operational (25)
1. FMCSA Operating Authority [EXTRACTED: live API]
2. Out of Service Status [EXTRACTED: live API]
3. FMCSA Insurance on File [EXTRACTED: live API]
4. Safety Rating [EXTRACTED: live API]
5. Double-Broker Risk [EXTRACTED: live API]
6. Fleet Size [EXTRACTED: live API]
7. New Carrier Risk [EXTRACTED: authority age calc]
8. Insurance Minimums [EXTRACTED: DB thresholds]
9. Authority Age [EXTRACTED: DB calc]
10. CSA BASIC Scores [EXTRACTED: live FMCSA QCMobile API]
11. Identity Verification [EXTRACTED: DB check]
12. Email Domain — 200+ disposable blocklist, MX records, domain age via RDAP [EXTRACTED: identityVerificationService.ts]
13. VoIP Phone Detection — 18 area codes + NumVerify API [EXTRACTED: identityVerificationService.ts]
14. Chameleon Detection — SHA-256 fingerprint matching [EXTRACTED: chameleonDetectionService.ts]
15. Business Entity / SOS — OpenCorporates API, 50/day free [INFERRED: 0.9 — API available but rate-limited]
16. Document Completeness [EXTRACTED: DB check]
17. Insurance Expiry Proximity [EXTRACTED: DB date calc]
18. Historical Performance [EXTRACTED: DB query]
19. OFAC/SDN Screening — live public API, auto-suspend on score >=90 [EXTRACTED: ofacScreeningService.ts]
20. ELD Device Verification — 48 FMCSA-registered providers [EXTRACTED: hardcoded list]
25. Overbooking Risk [EXTRACTED: active loads vs fleet capacity]
26. Carrier-Broker Agreement [EXTRACTED: DB flag]
27. Fleet VIN Verification — NHTSA free API [EXTRACTED: vinVerificationService.ts]
28. Probationary Period [EXTRACTED: 90-day DB calc]
29. Document Expiry Enforcement [EXTRACTED: DB date checks]
30. SAM.gov Federal Exclusion — demo key, 100/day [EXTRACTED: samGovService.ts]
31. Cross-Reference Identity Validation [EXTRACTED: crossReferenceService.ts]
35. MCS-150 Biennial Update [EXTRACTED: FMCSA data]

### Partially Operational (4)
21. W-9 TIN Match — format validation works, IRS API needs paid enrollment (~$0.50/check) [INFERRED: 0.7 — format validation confirmed, API untested]
22. Biometric Facial Match — falls back to manual review without AWS Rekognition (~$0.01/face) [EXTRACTED: biometricVerificationService.ts]
24. UCR Registration — DB field only, no unified API [EXTRACTED: schema field exists, no API]
34. BOC-3 Process Agent — DB flag only [EXTRACTED: schema field]

### Manual Only (6)
23. Fraud Report History — DB queries only [EXTRACTED]
32. IRP Registration — no API, state-administered [EXTRACTED: no API exists]
33. IFTA Compliance — no API, state-administered [EXTRACTED]
11*. Full Identity Verification — needs IDV provider (Persona, Jumio) [INFERRED: 0.6]
13*. Accurate VoIP — needs Twilio Lookup ($0.005/check) [INFERRED: 0.8]
15*. Secretary of State — OpenCorporates free tier (50/day) [EXTRACTED]

## Key Files
- `backend/src/services/carrierVettingService.ts` — master orchestrator
- `backend/src/services/fmcsaService.ts` — FMCSA API
- `backend/src/services/ofacScreeningService.ts` — OFAC/SDN screening
- `backend/src/services/chameleonDetectionService.ts` — identity fraud
- `backend/src/services/identityVerificationService.ts` — email/phone/SOS
- `backend/src/services/tinMatchService.ts` — TIN validation
- `backend/src/services/vinVerificationService.ts` — NHTSA VIN decoder

## Open Threads
- Resolve whether to add same-day IRS TIN matching (cost: ~$0.50/check, enrollment: 2-4 weeks)
- AWS Rekognition for biometric facial match (~$0.01/face) — worth the cost?
- Highway.com integration for real-time carrier monitoring (additional to FMCSA)
- Chameleon fingerprinting should run at DAT import BEFORE outreach, not just after registration

## See Also
- [[carrier-onboarding]], [[carrier-recruitment-pipeline]], [[carrier-pain-points]]
- [[load-lifecycle]], [[data-flows]], [[security-architecture]]

---

## Timeline

### [2026-02-12] SYSTEM_ARCHITECTURE.md | Initial Compass design
Described as simple 3-step carrier onboarding: Register → FMCSA Verify → Approve/Reject. No mention of 35 checks or scoring system.

### [2026-04-05] project-audit-apr2026.md | Audit found 40% completion
Audit reported "Carrier vetting only 40% complete — 28+ of 35 checks are stubs." FMCSA and OFAC confirmed working. TIN, VIN, CSA enforcement, biometrics flagged as placeholder.

### [2026-04-07] codebase audit | 25 of 35 checks confirmed operational
Deep code audit revealed 25 checks are fully functional with live API calls or DB logic. 4 partially operational (need paid APIs). 6 manual only (no unified API exists). Previous "40%" assessment was stale — many checks had been implemented but not documented.

### [2026-04-07] code change | Registration fields + auto-approval wired
Phone (required), address (required), EIN (optional) added to carrier registration. All fields wired into chameleon fingerprint building. Auto-approval for A-grade carriers (score >= 90) implemented.

### [2026-04-07] code change | Disposable email blocklist expanded
200+ disposable email domains added to identityVerificationService.ts. VoIP area code detection expanded to 18 known VoIP-heavy area codes.
