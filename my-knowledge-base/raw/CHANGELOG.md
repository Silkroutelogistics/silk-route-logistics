# Changelog — Silk Route Logistics

All notable changes to this project are documented in this file.

---

## [1.0.0] — 2026-02-12 (CURRENT RELEASE)

### Commit: `2b3490e` — Monitoring System
**Files created:**
- `backend/src/services/cronRegistryService.ts` — Cron registry with DB tracking, manual trigger, toggle
- `backend/src/controllers/monitoringController.ts` — Enhanced health, cron management, error logs/stats
- `backend/src/routes/monitoring.ts` — 6 admin-only monitoring endpoints
- `frontend/public/ae/js/notification-bell.js` — Drop-in notification bell component

**Files modified:**
- `backend/prisma/schema.prisma` — Added CronRegistry + ErrorLog models
- `backend/src/middleware/errorHandler.ts` — Added DB persistence + admin alerting (10+ errors/hour)
- `backend/src/routes/index.ts` — Mounted monitoring routes at `/api/admin`
- `backend/src/server.ts` — Enhanced `/health`, added cron registry seeding at startup
- 18 HTML pages — Added notification-bell.js script tag

**Features:**
- Enhanced health endpoint with DB latency, memory stats, cron status
- Cron job registry (18 jobs tracked in DB, manual trigger, enable/disable)
- Error logging to database with admin alerting threshold
- Notification bell with unread badge, dropdown, mark-read, 60s auto-poll

---

### Commit: `84537e2` — Cross-System Integration
**Files created:**
- `backend/src/services/integrationService.ts` — Central orchestrator for all 5 data loops

**Files modified:**
- `backend/src/controllers/loadController.ts` — Hooks for DELIVERED/DISPATCHED → integration
- `backend/src/controllers/carrierController.ts` — Hook for carrier APPROVED → SRCPP init
- `backend/src/controllers/documentController.ts` — Hook for POD upload → shipper notification
- `backend/src/controllers/accountingController.ts` — Hook for invoice paid → credit update
- `backend/src/services/checkCallAutomation.ts` — Hook for DELIVERED via check-call
- `backend/src/services/schedulerService.ts` — Weekly SRCPP recalculation cron

**Features:**
- DELIVERED → auto-invoice + CarrierPay (SRCPP tier fee) + fund entry + scorecard
- Carrier approved → initial SRCPP scorecard (BRONZE)
- Invoice paid → shipper credit update
- POD uploaded → shipper notification email
- Load created → shipper credit enforcement (block if over limit)
- Weekly SRCPP recalculation for all active carriers

---

### Commit: `1cd8fd7` — Accounting Console
**Files created:**
- `backend/src/controllers/accountingController.ts` — 51 accounting endpoints
- `backend/src/routes/accounting.ts` — Full accounting route file
- `frontend/public/ae/accounting/dashboard.html` — Accounting overview
- `frontend/public/ae/accounting/receivable.html` — AR management
- `frontend/public/ae/accounting/payable.html` — AP management
- `frontend/public/ae/accounting/fund.html` — Factoring fund
- `frontend/public/ae/accounting/reports.html` — Financial reports
- `frontend/public/ae/accounting/approvals.html` — Approval queue

**Features:**
- Full AP/AR management with aging reports
- Factoring fund health monitoring and adjustments
- P&L by load, lane, carrier, shipper
- Approval queue for high-value payments ($5K+)
- Weekly/monthly report generation
- CSV/JSON export functionality

---

### Commit: `54c0360` — Phase D: Scale Features
**Files created/modified:** Multiple controllers, services, routes, and 8 frontend pages

**Features:**
- Public tracking page with token-based access
- Invoice auto-generation on delivery
- Claims management system
- Carrier tools (FMCSA lookup, calculators)
- Financial dashboard with P&L
- Training & SOP management

---

### Commit: `307e187` — Tender & Rate Confirmation
**Files created:**
- `backend/src/services/shipperNotificationService.ts` — Shipper email automation
- `frontend/public/ae/tender.html` — 10-section tender page

**Files modified:**
- `backend/src/validators/rateConfirmation.ts` — Extended schema for all 10 sections
- `backend/src/controllers/rateConfirmationController.ts` — Sign, send-shipper, finalize
- `backend/src/services/pdfService.ts` — Shipper load confirmation PDF
- `backend/src/routes/rateConfirmations.ts` — 3 new routes (sign, send-shipper, finalize)
- `backend/src/services/schedulerService.ts` — 2 shipper transit update crons

---

### Commit: `bfea25b` — Caravan & DAT Enhancement
**Features:**
- SRCPP source score bonus in carrier matching
- Carrier branding in marketplace
- Guest carrier UX improvements

---

### Commit: `08af5f0` — Phase A+B+C Complete
**Features:**
- AE Command Center (dashboard, loads, CRM, communications)
- Carrier Portal (dashboard, loads, compliance, payments, tools, help)
- Automation Layer (smart matching, check-call scheduling, risk engine, fall-off recovery, email sequences)

---

### Earlier commits (infrastructure & fixes)
| Commit | Description |
|--------|-------------|
| `b694940` | Fix: move ts-node to dependencies for Render |
| `5b5d7d6` | Fix: resolve Render exit code 127 |
| `bab44d0` | Fix: resolve Render deploy — move prisma to deps |
| `cd137af` | Security hardening + deploy fix |
| `491b37c` | Fix: add express-async-errors for crash prevention |
| `2548fdd` | Security: Cloudflare Pages security headers |
| `1b3dfec` | Security: helmet CSP, CORS lockdown, rate limiting, input sanitization |
| `c6d01a3` | Fix: display BROKER as "Account Executive" |
| `7c6e79b` | Fix: 6 AE console bugs |
| `0fc92e4` | Feat: accounting module (carrier pay, settlements, margins) |
| `2022c09` | Feat: tender/rate confirmation + track & trace |
| `c9a2731` | Feat: rate limits, password reset, vitest |
| `94bbec8` | Feat: email OTP 2FA, 60-day password expiry |
| `5a8b0eb` | Feat: Marco Polo chatbot (Gemini) |
| `e9d01b4` | Feat: auto-calculate billable miles (Google Maps) |
| `6735982` | Feat: automation overhaul + Marco Polo AI |
| `90067d4` | Feat: AE/Carrier toggle, FMCSA compliance |
| `4040888` | Feat: comprehensive platform hardening |
| `8bf0ab3` | Initial commit: Silk Route Logistics platform |

---

## Database Schema Changes

### v1.0 (Current)
- **46 models** total
- **31 enums** (Role, LoadStatus, InvoiceStatus, PaymentTier, etc.)
- **110+ indexes** for query performance
- **Key additions in final phase:** CronRegistry, ErrorLog

### Notable migrations:
- CarrierPay expanded to 47 fields (SRCPP integration)
- Load expanded to 73 fields (tender, tracking, multi-stop)
- Invoice added aging reminder flags (reminderSent31/45/60)
- ApprovalQueue added for $5K+ payment approval workflow
- FinancialReport for auto-generated monthly reports
