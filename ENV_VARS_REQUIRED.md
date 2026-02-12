# Environment Variables — Silk Route Logistics

> Last updated: 2026-02-12

## Required Variables (Backend — Render)

| Variable | Required | Description | Where to Get | Status |
|----------|----------|-------------|--------------|--------|
| `DATABASE_URL` | **Yes** | PostgreSQL connection string | Neon Console → Connection Details | SET |
| `JWT_SECRET` | **Yes** | Secret key for JWT signing (min 32 chars) | Generate: `openssl rand -hex 32` | SET |
| `PORT` | No | Server port (default: 4000) | Render sets automatically | SET (auto) |
| `NODE_ENV` | No | Environment (default: development) | Set to `production` on Render | SET |
| `JWT_EXPIRES_IN` | No | Token expiry (default: 24h) | Override if needed | DEFAULT |
| `CORS_ORIGIN` | No | Extra CORS origins (comma-separated) | Your frontend URLs | SET |
| `RESEND_API_KEY` | **Yes** | Email delivery API key | resend.com → API Keys | SET |
| `EMAIL_FROM` | No | Sender email (default: noreply@silkroutelogistics.ai) | Must match Resend verified domain | DEFAULT |
| `GEMINI_API_KEY` | Recommended | Google Gemini for Marco Polo AI chatbot | Google AI Studio → API Keys | SET |
| `ANTHROPIC_API_KEY` | Optional | Claude AI (fallback for chatbot) | Anthropic Console → API Keys | NOT SET |
| `GOOGLE_MAPS_API_KEY` | Recommended | Distance calculation for loads | Google Cloud Console → Credentials | SET |
| `FMCSA_WEB_KEY` | Recommended | FMCSA carrier lookup (DOT/MC validation) | FMCSA Web Services Portal | SET |
| `DAT_API_KEY` | Optional | DAT Load Board integration | DAT Solutions account | NOT SET |
| `DAT_API_SECRET` | Optional | DAT Load Board secret | DAT Solutions account | NOT SET |
| `DAT_API_URL` | No | DAT API base URL (default: https://freight.dat.com/api/v2) | DAT documentation | DEFAULT |
| `OPENPHONE_WEBHOOK_SECRET` | Optional | OpenPhone webhook signature verification | OpenPhone Dashboard → Webhooks | NOT SET |
| `ENCRYPTION_KEY` | Optional | Field-level encryption key | Generate: `openssl rand -hex 32` | NOT SET |
| `MAX_FILE_SIZE` | No | Max upload size in bytes (default: 10MB) | Override if needed | DEFAULT |
| `UPLOAD_DIR` | No | File upload directory (default: ./uploads) | Override if needed | DEFAULT |

## Frontend Variables (Cloudflare Pages)

| Variable | Required | Description | Status |
|----------|----------|-------------|--------|
| None | — | Frontend is static HTML, API URL is hardcoded to `https://api.silkroutelogistics.ai/api` | N/A |

## Summary

- **Total variables**: 18
- **Required (must be set)**: 2 (`DATABASE_URL`, `JWT_SECRET`)
- **Strongly recommended**: 4 (`RESEND_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `FMCSA_WEB_KEY`)
- **Currently set on Render**: `DATABASE_URL`, `JWT_SECRET`, `PORT`, `NODE_ENV`, `CORS_ORIGIN`, `RESEND_API_KEY`, `GEMINI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `FMCSA_WEB_KEY`
- **Not set (optional features disabled)**: `ANTHROPIC_API_KEY`, `DAT_API_KEY`, `DAT_API_SECRET`, `OPENPHONE_WEBHOOK_SECRET`, `ENCRYPTION_KEY`

## Notes

- All optional variables gracefully degrade — features using them are skipped if not configured
- `JWT_EXPIRES_IN` changed from `7d` to `24h` as of v1.0 for security
- `CORS_ORIGIN` on Render should include: `https://silkroutelogistics.ai,https://www.silkroutelogistics.ai,https://silk-route-logistics.pages.dev`
- Render auto-sets `PORT` — do not hardcode it
