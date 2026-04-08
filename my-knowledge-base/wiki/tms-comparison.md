---
title: TMS Comparison — SRL vs TMW Suite
created: 2026-04-07
last_updated: 2026-04-07
source_count: 1
status: reviewed
---

TMW Suite (Trimble) is the enterprise gold standard TMS. SRL already has 70% of TMW functionality built in-house. The build-vs-buy rule from [[competitive-landscape]]: don't build a full TMS unless SRL pivots to TMS model ($5K+/month for McLeod/TMW).

## SRL vs TMW Feature Matrix

| Feature | TMW Suite | SRL | Gap |
|---------|-----------|-----|-----|
| Order entry | Yes | Yes | — |
| Load statuses | AVL→PLN→DSP→STD→CMP→INV | DRAFT→POSTED→...→COMPLETED | Different names, same concept |
| EDI 204/990/214/210 | Yes | Yes | — |
| Billing/invoicing | Yes | Yes (auto on delivery) | — |
| Check calls | Yes | Yes (SMS automation) | — |
| Documents | Yes | Yes (upload/download) | — |
| Carrier onboarding | Yes | Yes (35-check Compass) | SRL more advanced |
| Multi-role portals | Yes | Yes (AE/Carrier/Shipper/Admin) | — |
| **Trip Folder UI** | Yes (8-tab unified view) | No | High priority gap |
| **P&L per load** | Yes (green/red margin indicators) | Partial (margin calc exists) | Need visual indicators |
| **Rate schedule/tariff engine** | Yes | No | Medium priority |
| **Carrier settlement** | Yes (split pay, reimbursements) | Basic (CarrierPay) | Needs enhancement |
| **Planning worksheet** | Yes (drag-and-drop dispatch) | No | Low priority |
| **Activity audit trail** | Yes | Yes (AuditTrail table) | — |

## TMW Next-Gen (2025-2026)
Trimble building cloud-native modular TMS with AI agents for:
- Order intake (90% auto-processing)
- Invoice scanning
- Road calls
- Tender grading
- 7-day network forecasting

SRL's AI approach (Claude-based) achieves similar goals through different architecture. [Source: TMW_SUITE_DEEP_DIVE.md]

See also: [[tech-stack]], [[load-lifecycle]], [[ai-operations]], [[competitive-landscape]]

[Source: TMW_SUITE_DEEP_DIVE.md]
