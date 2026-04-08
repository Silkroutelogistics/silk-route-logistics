# Silk Route Logistics

Asset-based carrier management and freight brokerage platform. Connects carriers, brokers, shippers, and dispatchers to manage loads, track fleets, handle invoicing/factoring, and monitor compliance — all from a unified dark-themed dashboard.

## Tech Stack

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, TanStack Query, Zustand, Recharts
- **Backend:** Node.js, Express, TypeScript, Prisma ORM, Zod validation
- **Database:** PostgreSQL (Neon serverless)
- **Auth:** JWT with bcrypt password hashing, role-based access control (9 roles)
- **PDF:** pdfkit for BOL, Rate Confirmation, Invoice generation
- **Deployment:** Cloudflare Pages (frontend static export) + Render (backend)
- **CI:** GitHub Actions (lint + typecheck + build on push/PR)

## Project Structure

```
silk-route-logistics/
├── .github/workflows/     # CI pipeline
├── backend/
│   ├── prisma/            # Schema (18 models), migrations, seed
│   └── src/
│       ├── config/        # Environment, database, upload config
│       ├── controllers/   # Route handlers (13 controllers)
│       ├── middleware/     # Auth, error handling, audit logging
│       ├── routes/        # Express routes (22 route files, ~120 endpoints)
│       ├── services/      # ELD, EDI, FMCSA, Market, PDF, Tier services
│       ├── validators/    # Zod request schemas (14 validators)
│       └── server.ts      # App entry point
├── frontend/
│   └── src/
│       ├── app/           # Next.js App Router (24 pages)
│       │   ├── auth/      # Login & register
│       │   ├── dashboard/ # 20 protected dashboard pages
│       │   └── onboarding # 5-step carrier registration
│       ├── components/    # Shared UI, layout, auth, modals
│       ├── hooks/         # Auth store, role guard, utilities
│       └── lib/           # API client, roles, utils
├── shared/types/          # Shared TypeScript interfaces
├── render.yaml            # Render deployment blueprint
├── deploy.sh              # Build script
└── package.json           # Root monorepo scripts
```

## Local Development

### 1. Clone & install

```bash
git clone https://github.com/Silkroutelogistics/silk-route-logistics.git
cd silk-route-logistics
npm run install:all
```

### 2. Configure environment

```bash
cp backend/.env.example backend/.env
cp frontend/.env.example frontend/.env.local
```

Edit `backend/.env` and set your PostgreSQL connection string:

```
DATABASE_URL="postgresql://postgres:yourpassword@localhost:5432/silk_route_logistics"
JWT_SECRET="generate-a-strong-secret-here"
```

### 3. Run migrations & seed

```bash
npm run db:migrate
npm run db:seed
```

### 4. Start development servers

```bash
npm run dev
```

This starts both servers concurrently:
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:4000
- **Health check:** http://localhost:4000/health

## Demo Accounts

All accounts use password: `password123`

| Email | Role | Access |
|-------|------|--------|
| `admin@silkroutelogistics.ai` | ADMIN | Full platform access |
| `ceo@silkroutelogistics.ai` | CEO | Executive dashboard + full access |
| `whaider@silkroutelogistics.ai` | BROKER | Load board, carriers, CRM, finance |
| `dispatch@silkroutelogistics.ai` | DISPATCH | Tracking, fleet, drivers, loads |
| `ops@silkroutelogistics.ai` | OPERATIONS | Fleet, compliance, drivers |
| `accounting@silkroutelogistics.ai` | ACCOUNTING | Invoices, finance, factoring |
| `srl@silkroutelogistics.ai` | CARRIER (Platinum) | Load board, scorecard, revenue, invoices |
| `gold@silkroutelogistics.ai` | CARRIER (Gold) | Same as above |
| `silver@silkroutelogistics.ai` | CARRIER (Silver) | Same as above |
| `bronze@silkroutelogistics.ai` | CARRIER (Bronze) | Same as above |
| `flatbed@silkroutelogistics.ai` | CARRIER | Same as above |

## Dashboard Pages (20)

| Page | Route | Description |
|------|-------|-------------|
| Overview | `/dashboard/overview` | Role-based: CEO metrics, employee quick actions, carrier stats |
| Load Board | `/dashboard/loads` | Create/manage loads, tender to carriers, status pipeline |
| Carriers | `/dashboard/carriers` | Carrier pool, tier filtering, approve/reject, performance |
| Tracking | `/dashboard/tracking` | Shipment tracking, ELD monitor, GPS locations |
| Fleet | `/dashboard/fleet` | Trucks & trailers CRUD, maintenance, assignments |
| Drivers | `/dashboard/drivers` | Driver management, HOS, compliance, fleet assignment |
| CRM | `/dashboard/crm` | Customer management, contacts, credit status |
| Messages | `/dashboard/messages` | Real-time messaging between users |
| Finance | `/dashboard/finance` | Revenue/expenses charts, AR/AP management |
| Invoices | `/dashboard/invoices` | Invoice CRUD, AR aging, CSV export, status workflow |
| Market Intel | `/dashboard/market` | Lane analytics, rate trends, market intelligence |
| Compliance | `/dashboard/compliance` | Compliance scanning, alerts, expiration tracking |
| Scorecard | `/dashboard/scorecard` | Carrier KPIs, tier progress, score history |
| Revenue | `/dashboard/revenue` | Carrier revenue breakdown with charts |
| Documents | `/dashboard/documents` | Document vault with upload, search, categorization |
| Factoring | `/dashboard/factoring` | Quick Pay / freight factoring calculator |
| SOPs | `/dashboard/sops` | SOP library with PDF preview |
| EDI | `/dashboard/edi` | EDI 204/990/214/210 transaction log |
| Audit Log | `/dashboard/audit` | System audit log with stats and filtering |
| Settings | `/dashboard/settings` | Profile, password, notifications, docs |

## API Endpoints (~120 total)

### Auth (`/api/auth`)
- `POST /register` — Create account
- `POST /login` — Sign in (rate-limited: 10/15min)
- `GET /profile` — Get current user
- `PATCH /profile` — Update profile
- `PATCH /password` — Change password
- `POST /refresh` — Refresh JWT token
- `POST /logout` — Logout

### Loads (`/api/loads`)
- `POST /` — Create load
- `GET /` — Search loads (status, state, equipment, rate range, pagination)
- `GET /:id` — Load details with tenders, documents, messages
- `PATCH /:id/status` — Update status
- `DELETE /:id` — Delete load

### Tenders (`/api/`)
- `POST /loads/:id/tender` — Create tender
- `POST /tenders/:id/accept` — Accept (auto-books load)
- `POST /tenders/:id/counter` — Counter-offer
- `POST /tenders/:id/decline` — Decline
- `GET /carrier/tenders` — Carrier's tenders

### Invoices (`/api/invoices`)
- Full CRUD + factoring + stats + status workflow

### Carrier (`/api/carrier`)
- Registration, onboarding, dashboard, scorecard, revenue, bonuses, admin management

### Fleet (`/api/fleet`)
- Trucks & trailers CRUD, stats, driver assignment, fleet overview

### Drivers (`/api/drivers`)
- Full CRUD, HOS, truck/trailer assignment, stats

### Customers (`/api/customers`)
- Full CRUD, contacts management, credit status

### Also: Messages, Notifications, Documents, Shipments, SOPs, EDI, Market, Compliance, Audit, Accounting, PDF, ELD, Integrations

## Deployment

### Frontend (Cloudflare Pages)

1. Connect GitHub repo in Cloudflare Pages dashboard
2. Build settings:
   - **Build command:** `cd frontend && npm install && npm run build`
   - **Build output directory:** `frontend/out`
   - **Root directory:** `/`
3. Environment variables:
   ```
   NEXT_PUBLIC_API_URL=https://api.silkroutelogistics.ai/api
   ```

### Backend (Render)

Configured via `render.yaml` Blueprint, or manually:

1. Build: `npm install && npx prisma generate && npm run build`
2. Start: `npx prisma migrate deploy && node dist/server.js`
3. Environment variables: `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN`, `PORT=4000`

### DNS (Cloudflare)

| Type | Name | Content |
|------|------|---------|
| CNAME | @ | your-pages-url |
| A/CNAME | api | your-render-url |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend & backend |
| `npm run build` | Build both projects |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed the database |
| `npm run db:studio` | Open Prisma Studio |
| `npm run lint` | Lint both projects |
