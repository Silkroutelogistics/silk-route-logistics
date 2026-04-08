---
title: Scheduler Service — Cron Jobs
created: 2026-04-07
last_updated: 2026-04-07
source_count: 2
status: reviewed
---

The scheduler service runs 18+ automated cron jobs with distributed database-based locking to prevent duplicate execution across instances. All jobs are defined in `backend/src/services/schedulerService.ts`.

## Active Cron Jobs

### Every 5-15 Minutes
| Job | Schedule | Purpose |
|-----|----------|---------|
| Check-call reminders | */5 min | Alert broker of overdue check-calls |
| Check-call automation | */15 min | Send scheduled SMS via OpenPhone |

### Every 30 Minutes
| Job | Schedule | Purpose |
|-----|----------|---------|
| Late detection | :00, :30 | Flag shipments with 4h+ stale tracking |
| Risk flagging | :05, :35 | Run [[risk-engine]] RED/AMBER scoring |
| Gmail reply checker | :25, :55 | Poll CEO inbox for prospect replies (see [[gmail-reply-tracking]]) |

### Hourly
| Job | Schedule | Purpose |
|-----|----------|---------|
| Invoice aging | :00 | Mark overdue invoices |
| Pre-tracing alerts | :00 | 48h/24h pickup reminders to carriers |
| Email sequences | :10 | Process due [[email-sequences]] steps |

### Daily
| Job | Schedule | Purpose |
|-----|----------|---------|
| OTP cleanup | 3 AM | Purge expired OTP codes |
| SRCPP tier updates | 6 AM | Daily [[srcpp-program]] recalculation |
| Password expiry | 9 AM | Remind users of expiring passwords |
| AR reminders | 11 AM (6 AM ET) | Overdue invoice reminders |
| Shipper transit AM | 14:00 (9 AM ET) | Morning transit updates to shippers |
| Shipper transit PM | 21:00 (4 PM ET) | Afternoon transit updates |
| Shipper ETA updates | 17:00 (noon ET) | Daily ETA emails to shipper contacts |

### Weekly
| Job | Schedule | Purpose |
|-----|----------|---------|
| Weekly report | Monday 7 AM | Snapshot for dashboards |
| AP aging | Monday 12:00 (7 AM ET) | Check carrier payment aging |
| SRCPP recalculation | Sunday 11:00 (6 AM ET) | Full tier recalc |
| OFAC rescan | Weekly | Re-screen all approved carriers |

### Monthly
| Job | Schedule | Purpose |
|-----|----------|---------|
| Financial report | 1st, 13:00 (8 AM ET) | Auto-generate monthly P&L |
| Invoice reminders | 1st, 6 AM | Monthly invoice reminder batch |
| Carrier re-vetting | 1st, 7:00 (2 AM ET) | Full [[compass-engine]] re-vet |
| Compliance scan | Monthly | Insurance expiry, doc expiry checks |

## Distributed Locking
Uses `SchedulerLock` table — each job acquires a database lock with TTL before executing. Prevents duplicate runs when multiple Render instances are active.

See also: [[load-lifecycle]], [[srcpp-program]], [[gmail-reply-tracking]], [[email-sequences]]

[Source: SYSTEM_ARCHITECTURE.md, project-audit-apr2026.md]
