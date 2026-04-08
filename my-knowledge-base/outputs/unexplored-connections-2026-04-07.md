---
title: 5 Unexplored Connections — April 7, 2026
date: 2026-04-07
pages_analyzed: 18
connections_found: 5
---

# 5 Most Interesting Unexplored Connections

## 1. Compass Score × QuickPay Capital Allocation
Risk-weight QP capital: fund A-grade carriers first when $70K limit is hit.
**Action:** Tie CarrierProfile.lastVettingScore to CarrierPay priority queue.

## 2. Detention Tracking × Scheduler × Shipper Credit
Auto-compute facility dwell time from check-call timestamps → shipper detention scorecard → warn carriers before accepting loads from slow facilities.
**Action:** New weekly cron job computing avgWaitTime per facility from check_calls table.

## 3. Volume Gates × Recruitment Success Balance
Gate 1 (150 loads/month) requires BOTH shipper demand AND carrier supply. Model the crossover point to know when to shift recruitment spend between sides.
**Action:** Track shipper load volume AND carrier capacity as paired metrics.

## 4. Carrier Operating System = Trip Folder for Carriers
TMW Trip Folder is broker-centric. Flip it: unified carrier dashboard showing loads/payments across ALL brokers. The product that sells itself.
**Action:** Research broker public APIs (CHR, TQL, Uber Freight) for carrier payment data.

## 5. Chameleon Detection as Fraud Network Product
Carrier fingerprint database grows with every import. At 10K+ records, it becomes an independent fraud detection product. Run fingerprinting at DAT import (before outreach), not just after registration.
**Action:** Move chameleon check to import-from-dat flow, before sequence trigger.
