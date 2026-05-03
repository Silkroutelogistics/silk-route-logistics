# Information Security Policy — Detailed (Internal / NDA-Gated)

**Silk Route Logistics Inc. — Galesburg, Michigan**

| | |
|---|---|
| Document ID | SRL-ISP-2026-001 |
| Version | 1.0 (archived from public document v1.0) |
| Effective | February 19, 2026 |
| Archived to internal | May 3, 2026 (v3.8.r) |
| Classification | **Internal — NDA-gated for external sharing** |

> **Audience:** SRL internal staff and prospects who have executed an NDA with SRL and require detailed security review for procurement.
>
> **Public counterpart:** `frontend/public/security-policy.html` (commitment summary, no implementation specifics).
>
> **Reason for split:** the public document previously disclosed implementation specifics — algorithm names, configuration values, named vendor stack with services per vendor, exact rate-limit thresholds, exact session timing — which collectively map attack surface for any reader and constrain SRL's implementation flexibility. Industry-standard practice publishes a capability commitment publicly and shares the detailed configuration under NDA. This file holds the detailed configuration.

---

## 1. Purpose & Scope

This Information Security Policy establishes the security framework for Silk Route Logistics Inc. ("SRL", "the Company"). It defines the controls, standards, and procedures that protect the confidentiality, integrity, and availability of company information assets.

### 1.1 Scope

This policy applies to:

- All employees, contractors, and third-party service providers
- All information systems, applications, and infrastructure
- All data processed, stored, or transmitted by the Company
- The SRL web platform, Account Executive Portal, Carrier Portal, and Shipper Portal

### 1.2 Data Classification

| Classification | Description | Examples |
|---|---|---|
| Confidential | Highly sensitive; unauthorized access would cause significant harm | Carrier payment details, tax IDs, insurance policy numbers, authentication credentials |
| Internal | For authorized personnel only | Load rates, carrier rates, margin data, financial reports, carrier scorecards |
| Public | Approved for public distribution | Marketing materials, public website content, posted load information |

---

## 2. Security Governance

### 2.1 Roles & Responsibilities

| Role | Responsibility |
|---|---|
| CEO / Owner | Overall accountability for information security; approves security policies and budget |
| System Administrator | Implements and maintains security controls; monitors systems; manages access |
| Account Executives | Handle shipper and carrier data responsibly; report security incidents |
| All Employees | Comply with security policies; complete security training; protect credentials |

### 2.2 Security Reviews

Security posture is reviewed quarterly. This policy is reviewed and updated annually or when significant changes occur to the technology stack, regulatory environment, or business operations.

---

## 3. Access Control

### 3.1 Role-Based Access Control (RBAC)

SRL implements strict RBAC with the principle of least privilege. The system defines the following roles:

| Role | Access Level |
|---|---|
| ADMIN / CEO | Full system access including audit logs, user management, and financial data |
| BROKER / AE | Load management, carrier network, CRM, financial operations |
| DISPATCH / OPERATIONS | Load management, tracking, carrier communications |
| ACCOUNTING | Invoicing, payments, financial reports, AR/AP management |
| CARRIER | Own loads, available loads, compliance documents, payment history |
| SHIPPER | Own shipments, tracking, invoices, analytics |
| READONLY | View-only access to authorized areas |

> Every API endpoint enforces authentication and role-based authorization. Unauthorized access attempts are logged to the security audit trail.

### 3.2 Account Management

- User accounts are created with minimum required permissions
- Account deactivation immediately revokes all access tokens
- Inactive accounts are flagged for review after 90 days
- Shared accounts are prohibited; each user has a unique identity

---

## 4. Authentication & Session Management

### 4.1 Multi-Factor Authentication (MFA)

SRL enforces multi-factor authentication for all user accounts:

- **Factor 1:** Password (validated against security policy)
- **Factor 2:** One-Time Passcode (OTP) delivered via email
- **Factor 3 (Optional):** TOTP authenticator app (available for employee accounts)

TOTP-based 2FA uses AES-256-GCM encrypted secrets with 8 emergency backup codes.

### 4.2 Password Policy

| Requirement | Standard |
|---|---|
| Minimum length | 10 characters |
| Complexity | Must include uppercase, lowercase, number, and special character |
| Common password check | Rejected against list of known compromised passwords |
| Password expiry | 60 days — forced change on next login |
| Hash algorithm | bcrypt with 12 salt rounds |

### 4.3 Session Management

- JWT tokens issued with HS256 algorithm and configurable expiry
- Tokens delivered via httpOnly, Secure, SameSite cookies
- Token blacklisting on logout prevents token reuse
- Token rotation on refresh — old token immediately blacklisted
- Automatic session timeout: 30 minutes for employees, 60 minutes for external users
- Warning modal displayed 2 minutes before timeout with option to extend

### 4.4 Brute Force Protection

- Login endpoint: Maximum 5 attempts per IP per 15-minute window
- OTP verification: Maximum 8 attempts per IP per 15-minute window
- OTP code: Maximum 5 incorrect attempts before lockout
- Password change: Maximum 5 attempts per hour
- All failed login attempts are logged with IP address for security monitoring

---

## 5. Data Protection & Encryption

### 5.1 Encryption in Transit

- All web traffic encrypted via TLS 1.2+ (HTTPS enforced via HSTS)
- HSTS header: `max-age=31536000; includeSubDomains`
- API-to-database connections use SSL (enforced in production)

### 5.2 Encryption at Rest

- **Database:** PostgreSQL hosted on Neon with built-in encryption at rest
- **Application-level:** AES-256-GCM encryption for sensitive fields (tax IDs, insurance policy numbers)
- **TOTP secrets:** AES-256-GCM encrypted before database storage
- **Passwords:** One-way bcrypt hash (12 rounds) — never stored in plaintext
- **OTP codes:** SHA-256 hashed before storage

### 5.3 Sensitive Data Handling

> Confidential data fields are automatically encrypted on write and decrypted on read using Prisma middleware. The encryption key is derived from a server-side environment variable and never exposed to clients.

- Tax IDs and insurance policy numbers are encrypted at the application layer
- Payment details are processed through secure channels
- Personal information is only accessible to authorized roles
- API responses exclude sensitive fields not needed by the requesting role

---

## 6. Network & Infrastructure Security

### 6.1 Infrastructure

| Component | Provider | Security Features |
|---|---|---|
| Frontend Hosting | Cloudflare Pages | DDoS protection, WAF, global CDN, automatic HTTPS |
| Backend API | Render | Managed infrastructure, automatic TLS, private networking |
| Database | Neon (PostgreSQL) | Encryption at rest, SSL connections, automated backups |
| Email Service | Resend | DKIM/SPF/DMARC authenticated sending |

### 6.2 Security Headers

The following HTTP security headers are enforced on all API responses:

- **Content-Security-Policy:** Restricts resource loading origins
- **X-Content-Type-Options:** nosniff — prevents MIME type sniffing
- **X-Frame-Options:** DENY — prevents clickjacking
- **X-XSS-Protection:** Enabled with block mode
- **Strict-Transport-Security:** Enforces HTTPS
- **Referrer-Policy:** strict-origin-when-cross-origin
- **Permissions-Policy:** Restricts browser feature access

### 6.3 CORS Policy

Cross-Origin Resource Sharing is restricted to explicitly configured origins. Credentials are only accepted from whitelisted domains.

---

## 7. Application Security

### 7.1 Input Validation

- All API inputs validated with Zod schema validation before processing
- Request body sanitization to prevent XSS and injection attacks
- Parameterized queries via Prisma ORM prevent SQL injection
- HTTP Parameter Pollution (HPP) prevention enabled

### 7.2 API Security

- JWT-based authentication with HS256 algorithm (prevents algorithm confusion attacks)
- Rate limiting on all authentication endpoints
- Request size limits to prevent payload-based attacks
- Error responses sanitized to prevent information leakage

### 7.3 Dependency Management

- Regular `npm audit` scans for known vulnerabilities
- Dependencies pinned to specific versions to prevent supply chain attacks
- Critical vulnerability patches applied within 48 hours of disclosure

---

## 8. Incident Response

### 8.1 Incident Classification

| Severity | Description | Response Time |
|---|---|---|
| Critical | Active breach, data exfiltration, system compromise | Immediate (within 1 hour) |
| High | Vulnerability actively exploited, unauthorized access detected | Within 4 hours |
| Medium | Suspicious activity, failed intrusion attempts | Within 24 hours |
| Low | Policy violation, configuration issue | Within 72 hours |

### 8.2 Response Procedures

1. **Detection:** Automated monitoring via security audit logs, system logs, and failed login tracking
2. **Containment:** Isolate affected systems, revoke compromised credentials, blacklist tokens
3. **Investigation:** Review audit logs, identify scope and impact
4. **Recovery:** Restore from backups if needed, patch vulnerabilities, reset credentials
5. **Notification:** Notify affected parties within 72 hours as required by applicable laws
6. **Post-Incident Review:** Document lessons learned, update security controls

### 8.3 Audit Logging

The following events are logged with timestamps, user IDs, IP addresses, and user agents:

- Login attempts (successful and failed)
- Logout events
- Password changes and resets
- OTP lockouts
- Access denied events (RBAC violations)
- Data modifications (create, update, delete operations)
- Administrative actions (user management, configuration changes)

---

## 9. Business Continuity

### 9.1 Backup & Recovery

- Database: Automated daily backups with point-in-time recovery (Neon)
- Application code: Version controlled in Git with remote repositories
- Recovery Time Objective (RTO): 4 hours
- Recovery Point Objective (RPO): 24 hours

### 9.2 Availability

- Frontend served via Cloudflare's global CDN for high availability
- Backend deployed on Render with automatic restarts and health checks
- Database on Neon with automatic failover capabilities

---

## 10. Vendor & Third-Party Security

All third-party services are evaluated for security posture before integration:

| Vendor | Service | Data Shared | Security Measures |
|---|---|---|---|
| Neon | Database hosting | All application data | SOC 2, encryption at rest, SSL |
| Cloudflare | CDN & hosting | Static assets, DNS | SOC 2, DDoS protection, WAF |
| Render | API hosting | Application runtime | SOC 2, TLS, private networking |
| Resend | Email delivery | Email addresses, OTP codes | TLS, DKIM/SPF |

> API keys and secrets are stored as environment variables, never committed to source code. The ENCRYPTION_KEY is a high-entropy secret stored securely on the deployment platform.

---

## 11. Employee Security Awareness

- All employees are briefed on information security policies during onboarding
- Phishing awareness: employees are trained to identify and report suspicious communications
- Credentials must not be shared, written down, or stored in plain text
- Work devices must use screen locks and up-to-date antivirus protection
- Security incidents must be reported immediately to the System Administrator
- Multi-factor authentication (TOTP) is strongly recommended for all employee accounts

---

## 12. Regulatory Compliance

Silk Route Logistics operates in compliance with applicable regulations:

- **FMCSA Regulations:** Carrier verification, safety scores, and authority validation
- **CCPA / State Privacy Laws:** User data rights, deletion requests, privacy notices
- **PCI Awareness:** No credit card data is stored directly; payment processing is handled through third-party providers
- **CAN-SPAM Act:** Email communications include unsubscribe options

The Company maintains a Privacy Policy and Terms of Service that outline data handling practices and user rights.

---

## 13. Policy Review & Updates

This policy is a living document and will be reviewed:

- Annually, at minimum
- After any security incident
- When significant changes are made to the technology stack
- When regulatory requirements change

| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | February 19, 2026 | SRL Security | Initial policy document |
| 1.0 (archived) | May 3, 2026 | SRL Security | Archived to internal as part of v3.8.r public/private split. Public counterpart now serves a commitment summary at `/security-policy.html`. This document remains authoritative for internal reference and NDA-gated external sharing. |

---

## NDA-Gated External Sharing

This document may be shared with prospects, customers, and procurement teams **after execution of a mutual NDA with SRL**. To request a copy:

1. Prospect contacts `compliance@silkroutelogistics.ai` requesting detailed security review
2. SRL responds with the standard mutual NDA template
3. NDA executed by both parties
4. SRL emails this document (PDF export from this Markdown source) to the named NDA signatory
5. SRL logs the disclosure in the `compliance@` mailbox audit trail with date, recipient, NDA reference

Do **not** share this file via public channels (email-to-public-list, public Slack, public Notion, marketing site, sales deck downloads, etc.). The whole point of the public/private split is that this content stays out of attacker reconnaissance. If a prospect cannot or will not sign an NDA, refer them to the public commitment summary at `/security-policy.html` — it is sufficient for the majority of procurement reviews.
