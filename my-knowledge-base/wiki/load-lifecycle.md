---
title: Load Lifecycle
created: 2026-04-07
last_updated: 2026-04-07
source_count: 2
status: reviewed
---

The load lifecycle is the core revenue flow of SRL. A load progresses through 12+ statuses from creation to payment. The system auto-generates invoices on delivery and creates carrier payment records.

## Status Flow
```
DRAFT → POSTED → TENDERED → BOOKED → DISPATCHED → AT_PICKUP → LOADED
→ PICKED_UP → IN_TRANSIT → AT_DELIVERY → DELIVERED → COMPLETED
```

## End-to-End Data Flow
1. **Create Load** — broker enters origin/dest, weight, equipment, rate via [[address-book]]
2. **Post to DAT** — optional load board posting
3. **Smart Match** — [[compass-engine]] scores carriers, returns top 10 matches
4. **Tender to Carrier** — rate confirmation sent
5. **Carrier Accepts** — load status → BOOKED
6. **Dispatch** — [[check-call-system]] schedules SMS check-calls
7. **Pickup** — carrier confirms at facility, status → LOADED
8. **In Transit** — check-calls track location, [[risk-engine]] scores load
9. **Delivery** — status → DELIVERED, triggers:
   - Auto-generate invoice (see [[invoicing-payments]])
   - Create CarrierPay record with [[srcpp-program]] tier fee
   - CPP recalculation triggered
10. **Payment** — invoice sent to shipper, carrier paid per payment tier

## Automated Triggers on Status Change
| Status | Automation |
|--------|-----------|
| DISPATCHED | Check-call SMS schedule created |
| IN_TRANSIT | Risk scoring begins (every 30 min) |
| DELIVERED | Auto-invoice + CarrierPay + CPP recalc |
| 4h stale | Late detection alert to broker |

## Key Fields on Load Model
- 73 fields (largest table in the schema)
- `referenceNumber` — auto-generated SRL-XXXXXX
- `bolNumber`, `sealNumber`, `appointmentNumber`
- `rate` (shipper rate), `carrierRate` (what carrier gets paid)
- `margin` = rate - carrierRate

See also: [[bol-generation]], [[invoicing-payments]], [[check-call-system]], [[srcpp-program]]

[Source: SYSTEM_ARCHITECTURE.md, project-audit-apr2026.md]
