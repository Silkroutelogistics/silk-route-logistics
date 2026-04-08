---
title: Data Flow Loops
created: 2026-04-07
last_updated: 2026-04-07
source_count: 1
status: reviewed
---

SRL has 5 major data flow loops that drive the business. Each loop is automated end-to-end with manual intervention points where human judgment is required.

## 1. Load Lifecycle (Revenue Loop)
Create Load → Post to DAT → Smart Match → Tender → Accept → Dispatch → Check Calls → Pickup → Transit → Delivery → Invoice → Payment

**Status:** 80% automated. Missing: payment processor integration (manual "mark paid"). See [[load-lifecycle]]

## 2. Carrier SRCPP Scoring (Loyalty Loop)
Approved → Initial Scorecard (BRONZE) → Complete Loads → Weekly Recalc → Tier Update → Payment Tier → Fee Applied

**Status:** Fully automated via cron. See [[srcpp-program]]

## 3. Financial Pipeline (Money Loop)
DELIVERED → Auto-Invoice → Send to Shipper → CarrierPay Created (tier fee) → QuickPay/Standard → If ≥$5K: ApprovalQueue → Fund Entry → Settlement → Paid

**Status:** 60% automated. Missing: bank ACH integration, settlement execution. See [[invoicing-payments]]

## 4. Shipper Credit & Collections (Risk Loop)
Customer Created → ShipperCredit Init ($50K) → Load Created → Credit Check → Invoice Generated → AR Aging (31/45/60 day reminders) → Paid → Credit Updated

**Status:** Partially implemented. Credit check exists but no enforcement on payment. See [[invoicing-payments]]

## 5. Carrier Onboarding (Supply Loop)
Register → Documents → FMCSA Verify → [[compass-engine]] 35 checks → Auto-approve (A-grade) or Admin Review → Approve → Portal Access → Smart Matching

**Status:** 90% automated with auto-approval for A-grade carriers. See [[carrier-onboarding]]

## 6. Lead-to-Customer Pipeline (Demand Loop) — Added Apr 2026
Prospect Created → Email Sequence Started → Gmail Reply Tracked → Intent Detected → Sequence Auto-stopped → Follow-up → Convert to Customer

**Status:** Fully automated. See [[lead-hunter]], [[email-sequences]], [[gmail-reply-tracking]]

[Source: SYSTEM_ARCHITECTURE.md]
