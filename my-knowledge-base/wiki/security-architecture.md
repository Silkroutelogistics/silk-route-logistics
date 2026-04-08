---
title: Security Architecture
created: 2026-04-07
last_updated: 2026-04-07
source_count: 2
status: reviewed
---

SRL implements a 13-layer security stack from CDN edge to database. The system handles sensitive freight, financial, and carrier identity data.

## 13-Layer Stack (outer → inner)
1. **Cloudflare** — DDoS, WAF, bot protection
2. **Render** — TLS termination, reverse proxy
3. **Helmet** — CSP, HSTS, X-Frame-Options
4. **Security Headers** — Permissions-Policy
5. **CORS** — Whitelist: silkroutelogistics.ai, localhost:3000, *.pages.dev
6. **Auth Rate Limiter** — 30 req/15 min on /api/auth
7. **Global Rate Limiter** — 300 req/15 min on /api
8. **HPP** — HTTP Parameter Pollution protection
9. **Body Parser** — 10KB request limit
10. **Cookie Parser** — httpOnly JWT cookies
11. **Input Sanitization** — trim + escape all strings
12. **JWT Authentication** — HS256, 24h expiry, per-request DB lookup
13. **Role-Based Authorization** — 8 roles (ADMIN, CEO, BROKER, CARRIER, DISPATCH, OPERATIONS, ACCOUNTING, SHIPPER)

## Additional Security (added Apr 2026)
- Webhook rate limiting: 100/15min per IP on all webhook endpoints [Source: project-audit-apr2026.md]
- Payment endpoint rate limiting: carrier-pay, carrier-payments, settlements [Source: project-audit-apr2026.md]
- Phone validation on unauthenticated openphone-checkcall webhook [Source: project-audit-apr2026.md]
- npm audit: 0 vulnerabilities on both frontend and backend [Source: project-audit-apr2026.md]

## Known Gaps (as of Apr 2026)
- In-memory session storage (needs Redis for horizontal scaling)
- No Resend webhook signature verification (svix)
- Setup tokens for forced 2FA have no explicit expiry

## Encryption
- AES-256-GCM on Customer.taxId, CarrierProfile.insurancePolicyNumber, Driver.licenseNumber
- Key rotation support with version prefixing (v1:, v2:)
- TOTP secrets encrypted separately (avoids circular dependency)

See also: [[tech-stack]], [[compass-engine]], [[carrier-onboarding]]

[Source: SYSTEM_ARCHITECTURE.md, project-audit-apr2026.md]
