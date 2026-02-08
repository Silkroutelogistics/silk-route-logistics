# Silk Route Logistics

Freight factoring and load marketplace platform. Connects carriers, brokers, and shippers to post loads, book freight, and get invoices funded.

## Tech Stack

- **Frontend:** Next.js 15, React 19, TypeScript, Tailwind CSS 4, TanStack Query, Zustand
- **Backend:** Node.js, Express, TypeScript, Prisma ORM
- **Database:** PostgreSQL (Neon)
- **Auth:** JWT with bcrypt password hashing
- **Deployment:** Cloudflare Pages (frontend) + Cloudflare Workers (backend)

## Project Structure

```
silk-route-logistics/
├── backend/
│   ├── prisma/              # Database schema & migrations
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── src/
│       ├── config/          # Environment, database & upload config
│       ├── controllers/     # Route handlers
│       ├── middleware/       # Auth, error handling
│       ├── routes/          # Express route definitions
│       ├── validators/      # Zod request schemas
│       └── server.ts        # App entry point
├── frontend/
│   └── src/
│       ├── app/             # Next.js App Router pages
│       │   ├── auth/        # Login & register
│       │   └── dashboard/   # Protected dashboard pages
│       ├── components/      # React components (UI, layout, invoices)
│       ├── hooks/           # Custom hooks & stores
│       ├── lib/             # API client & utilities
│       └── types/           # Frontend-specific types
├── shared/
│   └── types/               # Shared TypeScript interfaces
├── package.json             # Root workspace scripts
└── tsconfig.base.json       # Shared TS config
```

## Local Development

### 1. Clone & install

```bash
git clone <repo-url> silk-route-logistics
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

## Seed Accounts

| Email                  | Password      | Role    |
|------------------------|---------------|---------|
| admin@silkroute.com    | password123   | Admin   |
| broker@example.com     | password123   | Broker  |
| carrier@example.com    | password123   | Carrier |

## API Endpoints

### Auth
- `POST /api/auth/register` — Create account
- `POST /api/auth/login` — Sign in
- `GET  /api/auth/profile` — Get current user (auth required)

### Loads
- `POST   /api/loads` — Post a load (broker/shipper)
- `GET    /api/loads` — Search loads (query params: status, originState, destState, equipmentType, minRate, maxRate, page, limit)
- `GET    /api/loads/:id` — Load details
- `PATCH  /api/loads/:id/status` — Update load status
- `DELETE /api/loads/:id` — Delete a load

### Invoices
- `POST /api/invoices` — Create invoice
- `GET  /api/invoices` — List user invoices
- `GET  /api/invoices/:id` — Invoice details
- `POST /api/invoices/:id/factor` — Submit for factoring

### Documents
- `POST   /api/documents` — Upload files (multipart, max 5 files: PDF/JPEG/PNG)
- `GET    /api/documents` — List documents (query: loadId, invoiceId)
- `DELETE /api/documents/:id` — Delete a document

## Deployment to Cloudflare

### Prerequisites

- [Cloudflare account](https://dash.cloudflare.com)
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/) installed (`npm i -g wrangler`)
- PostgreSQL database (e.g., [Neon](https://neon.tech))
- Domain configured: `silkroutelogistics.ai`

### Frontend (Cloudflare Pages)

1. Connect your GitHub repo in the Cloudflare Pages dashboard
2. Configure the build:
   - **Build command:** `cd frontend && npm install && npm run build`
   - **Build output directory:** `frontend/.next`
   - **Root directory:** `/`
3. Set environment variables in Cloudflare Pages settings:
   ```
   NEXT_PUBLIC_API_URL=https://api.silkroutelogistics.ai/api
   NEXT_PUBLIC_APP_NAME=Silk Route Logistics
   ```
4. Set custom domain to `silkroutelogistics.ai`

### Backend (Cloudflare Workers / VPS)

Since the backend uses Express + file uploads, deploy to a VPS or container service:

1. Build the backend:
   ```bash
   cd backend && npm run build
   ```

2. Set production environment variables on your host:
   ```
   NODE_ENV=production
   PORT=4000
   DATABASE_URL=<your-neon-connection-string>
   JWT_SECRET=<strong-random-secret>
   CORS_ORIGIN=https://silkroutelogistics.ai
   UPLOAD_DIR=./uploads
   ```

3. Run migrations against production database:
   ```bash
   npx prisma migrate deploy
   ```

4. Start the server:
   ```bash
   node dist/server.js
   ```

5. Set up a reverse proxy (nginx/caddy) to point `api.silkroutelogistics.ai` to port 4000 with SSL.

### DNS Configuration

In Cloudflare DNS, add:

| Type  | Name  | Content              |
|-------|-------|----------------------|
| CNAME | @     | your-pages-url       |
| A     | api   | your-server-ip       |

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start both frontend & backend |
| `npm run dev:backend` | Start backend only |
| `npm run dev:frontend` | Start frontend only |
| `npm run build` | Build both projects |
| `npm run db:migrate` | Run Prisma migrations |
| `npm run db:seed` | Seed the database |
| `npm run db:studio` | Open Prisma Studio |
| `npm run lint` | Lint both projects |
