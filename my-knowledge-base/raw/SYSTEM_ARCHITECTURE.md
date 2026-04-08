# System Architecture — Silk Route Logistics v1.0

> Last updated: 2026-02-12

## Platform Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        INTERNET / USERS                             │
│   AE (Broker)  │  Carrier  │  Admin  │  Shipper (email only)       │
└────────┬────────┴─────┬─────┴────┬────┴─────────────────────────────┘
         │              │          │
    ┌────▼──────────────▼──────────▼────┐
    │    Cloudflare Pages (Frontend)     │
    │    silkroutelogistics.ai           │
    │    Static HTML + JS + CSS          │
    │    22 pages (15 AE + 7 Carrier)    │
    └────────────────┬──────────────────┘
                     │ HTTPS
    ┌────────────────▼──────────────────┐
    │    Render (Backend)                │
    │    api.silkroutelogistics.ai       │
    │    Express + Prisma + Node.js      │
    │    327 API endpoints               │
    │    18 cron jobs                     │
    └────────────────┬──────────────────┘
                     │ TLS
    ┌────────────────▼──────────────────┐
    │    Neon (PostgreSQL)               │
    │    46 tables, 110+ indexes         │
    │    Serverless, auto-scaling        │
    └───────────────────────────────────┘
```

## External Service Integrations

```
Backend ──► Resend          (Email delivery: transactional + marketing)
       ──► Google Gemini    (Marco Polo AI chatbot)
       ──► Google Maps      (Distance Matrix API for mileage)
       ──► FMCSA            (Carrier safety lookup by DOT/MC)
       ──► DAT              (Load board posting, optional)
       ──► OpenPhone        (Webhooks for check-call automation, optional)
```

## Frontend Structure

### AE (Account Executive) Console — 15 pages
```
frontend/public/ae/
├── dashboard/index.html     AE Command Center (KPIs, charts, load map)
├── loads.html               Load Board (CRUD, status, detail view, tender button)
├── tender.html              Tender/Rate Confirmation (10-section form, profit calc)
├── crm.html                 Customer Management (contacts, credit, load history)
├── communications.html      Email/SMS Hub (templates, sequences, OpenPhone)
├── caravan.html              The Caravan — Carrier marketplace + DAT integration
├── claims.html              Claims Management (file, track, resolve)
├── financials.html          Financial Dashboard (P&L, revenue, margins)
├── training.html            Training & SOPs
├── accounting/
│   ├── dashboard.html       Accounting Overview (AR, AP, fund health)
│   ├── receivable.html      Accounts Receivable (invoices, aging, collections)
│   ├── payable.html         Accounts Payable (carrier payments, SRCPP tiers)
│   ├── fund.html            Factoring Fund Management (balance, transactions)
│   ├── reports.html         Financial Reports (weekly, monthly, P&L, export)
│   └── approvals.html       Approval Queue (high-value payments, overrides)
```

### Carrier Console — 7 pages
```
frontend/public/carrier/
├── login.html               Carrier Login Portal
├── dashboard.html           Carrier Dashboard (SRCPP score, revenue, loads)
├── loads.html               Available & My Loads (accept, decline, status update)
├── compliance.html          Compliance Center (documents, CSA scores, calendar)
├── payments.html            Payment History (QuickPay requests, factoring)
├── tools.html               Carrier Tools (FMCSA lookup, calculators, resources)
└── help.html                Help & Support Center
```

### Shared Components
```
frontend/public/ae/js/
├── api.js                   API client (fetch wrapper, auth, all endpoints)
├── notification-bell.js     Drop-in notification bell (auto-injects into header)
└── style.css                Shared styles (dark navy theme, gold accents)
```

## Backend Architecture

### Directory Structure
```
backend/src/
├── config/
│   ├── database.ts          Prisma client singleton
│   └── env.ts               Zod-validated environment variables
├── middleware/
│   ├── auth.ts              JWT authenticate + role-based authorize
│   ├── errorHandler.ts      Global error handler + DB logging + admin alerting
│   ├── security.ts          Security headers + input sanitization
│   ├── auditTrail.ts        Automatic audit trail middleware
│   └── requestLogger.ts     HTTP request logging to SystemLog
├── controllers/             (46 route handler files)
│   ├── authController.ts
│   ├── loadController.ts
│   ├── invoiceController.ts
│   ├── accountingController.ts
│   ├── carrierController.ts
│   ├── monitoringController.ts
│   └── ... (40 more)
├── services/
│   ├── integrationService.ts     Cross-system data loop orchestrator
│   ├── cronRegistryService.ts    Cron job registry + manual trigger
│   ├── schedulerService.ts       All cron job definitions + distributed locks
│   ├── emailService.ts           Resend email templates + sending
│   ├── shipperNotificationService.ts  Shipper auto-update emails
│   ├── pdfService.ts             PDF generation (BOL, Rate Con, Invoice, Settlement)
│   ├── invoiceService.ts         Auto-invoice generation on delivery
│   ├── tierService.ts            SRCPP payment tier calculation
│   ├── checkCallAutomation.ts    Automated check-call scheduling + SMS
│   ├── riskEngine.ts             Load risk scoring engine
│   └── emailSequenceService.ts   Multi-step email sequence processor
├── routes/                  (46 route files → 327 endpoints)
├── validators/              Zod schemas for request validation
├── cron/index.ts            Legacy cron job initialization
└── prisma/schema.prisma     Database schema (46 models, 31 enums)
```

## API Routes by Feature

### Authentication & Users (18 endpoints)
| Prefix | Endpoints | Auth |
|--------|-----------|------|
| `/api/auth` | 13 routes (register, login, OTP, password, profile) | Mixed |
| `/api/carrier-auth` | 5 routes (carrier-specific login flow) | Mixed |

### Load Management (21 endpoints)
| Prefix | Endpoints | Auth |
|--------|-----------|------|
| `/api/loads` | 8 routes (CRUD, status updates) | BROKER+ |
| `/api/carrier-loads` | 7 routes (available, accept, decline, status) | CARRIER |
| `/api/check-calls` | 3 routes (create, recent, by load) | BROKER+ |
| `/api/tenders` | 5 routes (create, accept, counter, decline) | Mixed |

### Financial & Accounting (63 endpoints)
| Prefix | Endpoints | Auth |
|--------|-----------|------|
| `/api/invoices` | 12 routes (CRUD, aging, factor, mark paid) | BROKER+ |
| `/api/accounting` | 51 routes (dashboard, AP, AR, fund, credit, disputes, reports, approvals, P&L, export) | ADMIN/ACCOUNTING |

### Carrier Management (29 endpoints)
| Prefix | Endpoints | Auth |
|--------|-----------|------|
| `/api/carrier` | 12 routes (register, onboard, dashboard, scorecard) | Mixed |
| `/api/carriers` | 6 routes (admin CRUD, verify) | ADMIN+ |
| `/api/carrier-compliance` | 5 routes (documents, CSA, calendar) | CARRIER |
| `/api/carrier-payments` | 4 routes (history, summary, QuickPay) | CARRIER |
| `/api/srcpp` | 3 routes (status, recalculate, leaderboard) | Mixed |
| `/api/carrier-match` | 4 routes (smart match, import, emergency) | BROKER+ |
| `/api/carrier-pay` | 6 routes (prepare, batch, approve) | ADMIN+ |
| `/api/settlements` | 5 routes (create, finalize, pay) | ADMIN+ |

### Rate Confirmation & Tender (9 endpoints)
| Prefix | Endpoints | Auth |
|--------|-----------|------|
| `/api/rate-confirmations` | 9 routes (CRUD, send, sign, finalize, PDF) | BROKER+ |

### Fleet & Drivers (24 endpoints)
| Prefix | Endpoints | Auth |
|--------|-----------|------|
| `/api/fleet` | 14 routes (trucks, trailers, overview, assign) | ADMIN+ |
| `/api/drivers` | 10 routes (CRUD, HOS, equipment assignment) | DISPATCH+ |

### Communication (12 endpoints)
| Prefix | Endpoints | Auth |
|--------|-----------|------|
| `/api/messages` | 5 routes (send, conversations, unread) | Authenticated |
| `/api/notifications` | 4 routes (list, unread, mark read) | Authenticated |
| `/api/email` | 3 routes (templates, send, preview) | BROKER+ |

### Compliance & Monitoring (20 endpoints)
| Prefix | Endpoints | Auth |
|--------|-----------|------|
| `/api/compliance` | 5 routes (alerts, scan, dismiss, resolve) | ADMIN+ |
| `/api/eld` | 5 routes (overview, HOS, DVIR, locations) | DISPATCH+ |
| `/api/fmcsa` | 2 routes (my profile, DOT lookup) | Mixed |
| `/api/audit` | 3 routes (logs, stats, login activity) | ADMIN |
| `/api/admin` | 6 routes (health, crons, errors) | ADMIN |

### Other (25+ endpoints)
| Prefix | Endpoints | Auth |
|--------|-----------|------|
| `/api/customers` | 11 routes (CRUD, contacts, credit) | BROKER+ |
| `/api/shippers` | 4 routes (CRUD) | BROKER+ |
| `/api/shipments` | 7 routes (CRUD, status, location) | DISPATCH+ |
| `/api/documents` | 6 routes (upload, download, rate-con, delete) | Authenticated |
| `/api/pdf` | 5 routes (BOL, rate-con, invoice, settlement) | Mixed |
| `/api/market` | 8 routes (lanes, regions, trends, capacity) | BROKER+ |
| `/api/edi` | 6 routes (tender, response, status, invoice) | BROKER+ |
| `/api/dat` | 4 routes (post, remove, responses) | BROKER+ |
| `/api/automation` | 13 routes (match, check-call, risk, fall-off, sequences) | BROKER+ |
| `/api/financials` | 4 routes (summary, QuickBooks) | ADMIN+ |
| `/api/claims` | 4 routes (CRUD) | BROKER+ |
| `/api/communications` | 2 routes (list, create) | BROKER+ |
| `/api/tracking` | 1 route (public tracking page) | Public |
| `/api/webhooks` | 3 routes (OpenPhone, Resend) | Public |
| `/api/chat` | 2 routes (public, authenticated) | Mixed |
| `/api/sops` | 6 routes (CRUD, upload) | OPERATIONS+ |
| `/api/equipment` | 5 routes (CRUD) | DISPATCH+ |
| `/api/integrations` | 2 routes (list, sync) | BROKER+ |

## Database Schema — 46 Tables

### Core Business
| Table | Description | Key Relations |
|-------|-------------|---------------|
| `users` | All users (ADMIN, CEO, BROKER, CARRIER, DISPATCH, OPERATIONS, ACCOUNTING, AE) | → loads, invoices, messages, notifications |
| `loads` | Freight loads (73 fields — largest table) | → carrier, poster, customer, invoices, check_calls |
| `invoices` | Customer invoices with aging/factoring | → load, line_items, documents |
| `carrier_pays` | Carrier payment records (47 fields) | → carrier, load, rate_confirmation, settlement |
| `customers` | Shipper/customer accounts | → loads, contacts, shipper_credit |

### Carrier System
| Table | Description |
|-------|-------------|
| `carrier_profiles` | Extended carrier info (MC#, DOT#, insurance, SRCPP) |
| `carrier_scorecards` | Monthly carrier performance snapshots |
| `carrier_bonuses` | SRCPP-based carrier incentives |
| `load_tenders` | Tender offers to carriers |
| `rate_confirmations` | Rate confirmation documents (10-section form data) |

### Financial
| Table | Description |
|-------|-------------|
| `invoice_line_items` | Invoice breakdown lines |
| `payment_disputes` | Carrier payment dispute tracking |
| `shipper_credits` | Customer credit limits & aging |
| `factoring_fund` | Factoring fund transactions (debits/credits) |
| `bank_reconciliations` | Bank statement reconciliation |
| `settlements` | Carrier payment settlement batches |
| `approval_queue` | High-value payment approval workflow |
| `financial_reports` | Auto-generated financial reports |

### Operations
| Table | Description |
|-------|-------------|
| `check_calls` | Carrier check-in records |
| `check_call_schedules` | Automated check-call timing |
| `shipments` | Shipment tracking records |
| `documents` | Uploaded files (POD, BOL, insurance, etc.) |
| `match_results` | Smart carrier matching results |
| `risk_logs` | Load risk assessment scores |
| `fall_off_events` | Carrier fall-off tracking |
| `email_sequences` | Multi-step email automation |
| `claims` | Freight claims management |

### Fleet
| Table | Description |
|-------|-------------|
| `trucks` | Company truck inventory |
| `trailers` | Company trailer inventory |
| `drivers` | Driver records with HOS/CDL |
| `equipment` | General equipment tracking |

### Communication
| Table | Description |
|-------|-------------|
| `messages` | Internal messaging system |
| `notifications` | In-app notifications |
| `communications` | Email/SMS log |
| `edi_transactions` | EDI 204/990/214/210 records |

### System
| Table | Description |
|-------|-------------|
| `system_logs` | Request/event logging |
| `audit_trails` | User action audit trail |
| `audit_logs` | Detailed audit entries |
| `compliance_alerts` | Compliance violation alerts |
| `otp_codes` | 2FA OTP codes |
| `sops` | Standard Operating Procedures |
| `broker_integrations` | Third-party integration config |
| `scheduler_locks` | Distributed cron job locks |
| `cron_registry` | Cron job tracking & management |
| `error_logs` | Application error persistence |

## Cron Job Schedule (18 Jobs)

| Job | Schedule | Description |
|-----|----------|-------------|
| check-call-reminders | `*/5 * * * *` | Overdue check call alerts every 5 min |
| check-call-automation | `*/15 * * * *` | Send scheduled check-call texts every 15 min |
| late-detection | `0,30 * * * *` | Late shipment detection every 30 min |
| risk-flagging | `5,35 * * * *` | Risk assessment engine every 30 min |
| invoice-aging | `0 * * * *` | Mark overdue invoices hourly |
| pre-tracing | `0 * * * *` | Pre-tracing alerts (48h/24h before pickup) hourly |
| email-sequences | `10 * * * *` | Process due email sequences hourly |
| otp-cleanup | `0 3 * * *` | Clean expired OTP codes daily 3 AM |
| daily-srcpp-tiers | `0 6 * * *` | SRCPP tier updates + log cleanup daily 6 AM |
| password-expiry | `0 9 * * *` | Password expiry reminders daily 9 AM |
| ar-reminders-daily | `0 11 * * *` | AR overdue reminders daily 6 AM ET |
| shipper-transit-am | `0 14 * * *` | Shipper transit updates 9 AM ET |
| shipper-transit-pm | `0 21 * * *` | Shipper transit updates 4 PM ET |
| weekly-report | `0 7 * * 1` | Weekly report snapshot Monday 7 AM |
| ap-aging-weekly | `0 12 * * 1` | AP aging check Monday 7 AM ET |
| srcpp-weekly-recalc | `0 11 * * 0` | SRCPP tier recalculation Sunday 6 AM ET |
| monthly-report-gen | `0 13 1 * *` | Monthly financial report 1st of month 8 AM ET |
| monthly-invoice-reminders | `0 6 1 * *` | Invoice reminder emails monthly 1st 6 AM |

## 5 Major Data Flow Loops

### 1. Load Lifecycle
```
Create Load → Post to DAT → Smart Match Carriers → Tender to Carrier
→ Carrier Accepts → Dispatch → Check Calls → Pickup (LOADED)
→ In Transit → Delivery (DELIVERED) → POD Upload → Invoice → Payment
```

### 2. Carrier SRCPP Scoring
```
Carrier Approved → Initial Scorecard (BRONZE) → Complete Loads
→ Weekly Recalculation (on-time %, claim ratio, fall-off rate)
→ Tier Update (BRONZE → SILVER → GOLD → PLATINUM)
→ Payment Tier Assigned (Standard → Elite) → Fee % Applied
```

### 3. Financial Pipeline
```
Load DELIVERED → Auto-Generate Invoice → Send to Shipper
→ CarrierPay Created (SRCPP tier fee applied) → QuickPay/Standard
→ If >= $5K → ApprovalQueue → Admin Review → Approve/Reject
→ Fund Entry (QP_FEE_EARNED) → Settlement Batch → Mark Paid
```

### 4. Shipper Credit & Collections
```
Customer Created → ShipperCredit Initialized ($50K default)
→ Load Created → Credit Checked (block if over limit)
→ Invoice Generated → AR Aging (31/45/60 day reminders)
→ Invoice Paid → Credit Updated (outstandingBalance decreased)
```

### 5. Carrier Onboarding
```
Carrier Registers → Submit Documents (MC Auth, Insurance, W9)
→ Admin Reviews → FMCSA Verification → Approve/Reject
→ If Approved: CarrierProfile activated, Initial SRCPP scorecard
→ Appears in Smart Matching, Can accept loads on Caravan
```

## Security Architecture

```
Internet → Cloudflare (DDoS, WAF, Bot Protection)
        → Render (TLS termination, reverse proxy)
        → Express Security Stack:
           1. Helmet (CSP, HSTS, X-Frame-Options)
           2. Custom Security Headers (Permissions-Policy, etc.)
           3. CORS (whitelist: silkroutelogistics.ai, localhost:3000)
           4. Auth Rate Limiter (10 req/15 min on /api/auth)
           5. Global Rate Limiter (100 req/15 min on /api)
           6. HPP (HTTP Parameter Pollution protection)
           7. Body Parser (10KB limit)
           8. Cookie Parser (httpOnly JWT cookies)
           9. Input Sanitization (trim + escape all strings)
           10. JWT Authentication (24h expiry, per-request DB lookup)
           11. Role-Based Authorization (8 roles)
           12. Audit Trail (all mutations logged)
           13. Error Handler (generic messages in production)
```

## Deployment

| Service | Platform | URL | Auto-Deploy |
|---------|----------|-----|-------------|
| Frontend | Cloudflare Pages | silkroutelogistics.ai | Yes (GitHub push to main) |
| Backend | Render | api.silkroutelogistics.ai | Yes (GitHub push to main) |
| Database | Neon PostgreSQL | (connection string) | N/A (schema push) |
| Email | Resend | (API) | N/A |
| DNS | Cloudflare | silkroutelogistics.ai | N/A |
