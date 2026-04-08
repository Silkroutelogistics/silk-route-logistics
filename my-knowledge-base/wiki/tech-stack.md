---
title: Technology Stack
created: 2026-04-07
last_updated: 2026-04-07
source_count: 2
status: reviewed
---

SRL runs on a modern JavaScript/TypeScript stack with static frontend deployment and managed backend infrastructure. The platform has grown from 22 pages and 46 tables (Feb 2026) to 85 pages and 91 models (Apr 2026).

## Frontend
- **Framework:** Next.js 15 with `output: "export"` (static HTML generation)
- **Hosting:** Cloudflare Pages at silkroutelogistics.ai
- **Styling:** Tailwind CSS with dark navy theme (#0f172a), gold accents (#C9A24D)
- **State:** React Query (TanStack) for server state, Zustand for client state
- **Auth:** httpOnly JWT cookies (no localStorage tokens)
- **Pages:** 85 routes across AE dashboard, carrier portal, shipper portal, admin, accounting [Source: project-audit-apr2026.md]

> CONTRADICTION: SYSTEM_ARCHITECTURE.md says "22 pages (15 AE + 7 Carrier)" but project audit found 85 page.tsx files [Source: SYSTEM_ARCHITECTURE.md vs project audit]

## Backend
- **Runtime:** Node.js with Express
- **ORM:** Prisma with PostgreSQL
- **Hosting:** Render at api.silkroutelogistics.ai
- **API:** 327+ REST endpoints across 46 route files [Source: SYSTEM_ARCHITECTURE.md]
- **Validation:** Zod schemas on all request bodies
- **PDF:** PDFKit + bwip-js (barcodes) + sharp (image processing)
- **Email:** Resend API

## Database
- **Provider:** Neon PostgreSQL (serverless, auto-scaling)
- **Models:** 91 Prisma models, 31+ enums [Source: project-audit-apr2026.md]
- **Encryption:** AES-256-GCM on sensitive fields (Customer.taxId, CarrierProfile.insurancePolicyNumber)
- **Indexes:** 110+ indexes

> CONTRADICTION: SYSTEM_ARCHITECTURE.md says "46 tables" but schema now has 91 models [Source: SYSTEM_ARCHITECTURE.md vs project audit]

## External Integrations
| Service | Purpose | Status |
|---------|---------|--------|
| Resend | Email delivery | Active |
| Google Gemini | AI chatbot (Marco Polo) | Active |
| Google Maps | Distance/mileage calculation | Active |
| FMCSA | Carrier safety lookup | Active (requires FMCSA_WEB_KEY) |
| DAT | Load board posting | Configured but key needed |
| OpenPhone | SMS check-call automation | Webhook configured |
| Gmail API | Reply tracking for Lead Hunter | Active (OAuth flow) |
| NHTSA | VIN verification | Active (free, no key) |
| OFAC | Sanctions screening | Active (free, no key) |
| SAM.gov | Federal exclusion check | Active (demo key) |

See also: [[api-endpoints]], [[scheduler-service]], [[deployment]], [[security-architecture]]

[Source: SYSTEM_ARCHITECTURE.md, project-audit-apr2026.md]
