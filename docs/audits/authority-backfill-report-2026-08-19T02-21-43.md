# Authority grant-date backfill — DRY RUN

**Run:** 2026-08-19T02:21:43.569Z
**Source:** FMCSA Socrata L&I `AuthHist - All With History` (dataset `9mw4-x3tu`), free and unauthenticated.
**Scanned:** 4 carrier(s) with a null `authorityGrantedDate`.

| Result | Count |
|---|---:|
| Resolved a grant date | 4 |
| No record found | 0 |
| Lookup errored | 0 |
| Written to DB | 0 (dry run) |

## What the live gate would do with these dates

Populating this column is what makes the authority-age ladder in `complianceMonitorService` fire for the first time. Read this before committing.

| Gate outcome | Carriers |
|---|---:|
| **Hard block (under 12 months)** | **1** |
| Override-eligible (12–18 months) | 0 |
| Allowed (18+ months) | 3 |
| Unresolved — stays warn-only | 0 |

> 1 carrier(s) would be **blocked from tendering** the moment this is committed. Confirm that is intended before running with `--commit`.

## Per-carrier detail

| Carrier | DOT | MC | Status | Resolved grant | Auth type | Docket | Matched by | Disposition | Gate verdict |
|---|---|---|---|---|---|---|---|---|---|
| SRL Transport LLC | 4526880 | MC-1794414 | APPROVED (TEST) | 2026-02-25 | PROPERTY BROKER | MC1794414 | docket | — | **HARD BLOCK** (5mo, no override possible) |
| cmmtzjp79000tcr1t39bhbdqp | 245330 | MC-156588 | APPROVED (TEST) | 1982-12-27 | MOTOR PROPERTY COMMON CARRIER | MC156588 | docket | TRANSFERRED | allowed (523mo) |
| cmn05156c000td11t391pf1ts | 1911857 | MC-596655 | APPROVED (TEST) | 2010-08-31 | MOTOR PROPERTY CONTRACT CARRIER | MC596655 | docket | — | allowed (191mo) |
| cmpjvhv3m000znu2e5t70qg12 | 2630230 | MC-920053 | PENDING | 2015-07-08 | MOTOR PROPERTY COMMON CARRIER | MC920053 | docket | — | allowed (133mo) |

## Method

Per carrier: query the dataset by MC docket first (exact index key, cannot collide), fall back to the DOT zero-padded to 8 characters. Among the returned rows keep only `GRANTED` ones, prefer `MOTOR` operating-authority types over broker/forwarder, and take the **earliest** such grant.

Earliest is deliberate and matches the reinstatement caveat already recorded in the carrier-lifecycle audit: age anchors on the original grant, not the most recent reinstatement, so a revoked-then-reinstated carrier reads as older than they operationally are. The separate FMCSA-status gate is what catches an authority that is not currently active — the `Disposition` column above surfaces those rows so a human can see them.

`--commit` only ever fills a null. It will not overwrite a date an admin set by hand via `setAuthorityGrantDate` (v3.8.aio); the manual-correction path outranks a bulk import.
