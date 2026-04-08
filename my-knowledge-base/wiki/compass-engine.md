---
title: Compass Engine — 35-Check Carrier Vetting
created: 2026-04-07
last_updated: 2026-04-07
source_count: 3
status: reviewed
---

The Compass Engine is SRL's proprietary carrier vetting system that runs 35 compliance checks during [[carrier-onboarding]]. It scores carriers 0-100, assigns a grade (A-F), risk level (LOW-CRITICAL), and recommendation (APPROVE/REVIEW/REJECT).

## Scoring
- Score starts at 100, deductions subtracted per failed check
- Grade: A (>=90), B (>=75), C (>=60), D (>=40), F (<40)
- Risk: LOW (>=80), MEDIUM (>=60), HIGH (>=40), CRITICAL (<40)
- A-grade carriers with APPROVE recommendation are auto-approved

## 35 Checks — Status as of April 2026

### Fully Operational (25 checks)
1. FMCSA Operating Authority (instant fail if not AUTHORIZED)
2. Out of Service Status (instant fail)
3. FMCSA Insurance on File
4. Safety Rating
5. Double-Broker Risk
6. Fleet Size
7. New Carrier Risk (authority age)
8. Insurance Minimums (internal thresholds)
9. Authority Age
10. CSA BASIC Scores (live FMCSA API)
11. Identity Verification (DB check)
12. Email Domain (200+ disposable blocklist, MX records, domain age via RDAP)
13. VoIP Phone Detection (18 area codes + NumVerify API if configured)
14. Chameleon Detection (SHA-256 fingerprint matching)
15. Business Entity / SOS (OpenCorporates API, 50/day free)
16. Document Completeness
17. Insurance Expiry Proximity
18. Historical Performance
19. OFAC/SDN Screening (live public API, auto-suspend on score >=90)
20. ELD Device Verification (48 FMCSA-registered providers)
25. Overbooking Risk (active loads vs fleet capacity)
26. Carrier-Broker Agreement (signed check)
27. Fleet VIN Verification (NHTSA free API)
28. Probationary Period (first 90 days)
29. Document Expiry Enforcement
30. SAM.gov Federal Exclusion (demo key, 100/day)
31. Cross-Reference Identity Validation
35. MCS-150 Biennial Update

### Partially Operational (4 checks)
21. W-9 TIN Match — format validation works, IRS API needs paid enrollment (~$0.50/check)
22. Biometric Facial Match — falls back to manual review without AWS Rekognition (~$0.01/face)
24. UCR Registration — DB field only, no unified API (state-administered)
34. BOC-3 Process Agent — DB flag only

### Manual Only (6 checks)
23. Fraud Report History — DB queries only
32. IRP Registration — no API, state-administered
33. IFTA Compliance — no API, state-administered
15. Secretary of State — OpenCorporates free tier (50/day)
11. Full Identity Verification — needs IDV provider (Persona, Jumio)
13. Accurate VoIP — needs Twilio Lookup ($0.005/check)

## Registration Data Required
- **Required:** DOT#, MC#, email, password, first name, last name, company, phone, address (street/city/state/zip), equipment types, operating regions
- **Optional:** EIN (9 digits), numberOfTrucks, insurance details, insurance agent contact

## Files
- `backend/src/services/carrierVettingService.ts` — master orchestrator (35 checks)
- `backend/src/services/fmcsaService.ts` — FMCSA API integration
- `backend/src/services/ofacScreeningService.ts` — OFAC/SDN screening
- `backend/src/services/chameleonDetectionService.ts` — identity fraud detection
- `backend/src/services/identityVerificationService.ts` — email/phone/SOS checks
- `backend/src/services/tinMatchService.ts` — TIN format + IRS validation
- `backend/src/services/vinVerificationService.ts` — NHTSA VIN decoder
- `backend/src/services/samGovService.ts` — federal exclusion check
- `backend/src/services/csaBasicService.ts` — CSA BASIC scores

See also: [[carrier-onboarding]], [[load-lifecycle]], [[data-flows]], [[security-architecture]]

[Source: carrierVettingService.ts, project audit Apr 2026, compass check analysis]
