---
title: Demand-Supply Gap — The Missing Carrier Recruitment Pipeline
created: 2026-04-07
last_updated: 2026-04-07
source_count: 4
status: draft
---

SRL has an asymmetric go-to-market: the demand side (shipper acquisition) is fully automated while the supply side (carrier acquisition) has no equivalent pipeline. This is the single biggest strategic gap in the platform.

## Demand Side (Automated)
- [[lead-hunter]]: Pipeline stages LEAD → WON, DB-persisted
- [[email-sequences]]: 4-step drip from whaider@, personal style
- [[gmail-reply-tracking]]: Auto-detects replies, classifies intent
- Engagement scoring: 0-100 based on opens/clicks/replies
- Auto-stop on reply, follow-up reminders on sequence completion
- Mass email with INTRO/FOLLOW_UP/CAPACITY templates

**Result:** Shipper acquisition is a push-button operation.

## Supply Side (Manual)
- Carriers register via onboarding form
- [[compass-engine]] vets them automatically (35 checks)
- [[srcpp-program]] retains them with tiered loyalty
- carrierOutreachService sends notifications when matching loads are posted
- **But:** No proactive carrier recruitment. No email sequences for carriers. No carrier lead pipeline. No "Carrier Hunter" equivalent.

**Result:** SRL can only serve carriers who find SRL. No outbound carrier acquisition.

## The Missing Link
When [[lead-hunter]] converts a prospect to a customer (WON status), the system knows:
- What lanes the shipper needs (origin/dest from their loads)
- What equipment types (dry van, flatbed, reefer)
- What volume (loads per week/month)

This lane demand data should feed a **carrier recruitment engine** that:
1. Identifies lanes where demand exceeds carrier supply
2. Searches DAT/carrier databases for carriers operating those lanes
3. Runs email outreach sequences (like Lead Hunter but for carriers)
4. Tracks engagement and follow-ups
5. Converts interested carriers through the [[carrier-onboarding]] flow

## Priority
This gap means SRL could win shipper customers but fail to find carriers to haul their freight. The demand-supply balance must be maintained for the business to work.

See also: [[lead-hunter]], [[srcpp-program]], [[carrier-onboarding]], [[data-flows]], [[knowledge-gaps]]

[Source: data-flows.md, srcpp-program.md, load-lifecycle.md, compass-engine.md]
