# AI Feature Deployment Gates — Silk Route Logistics

Every AI feature activates based on load volume, NOT calendar dates.

**Query:** `SELECT COUNT(*) FROM loads WHERE created_at > NOW() - INTERVAL '30 days'`

**API Endpoint:** `GET /api/ai/gates/status`

---

## Gate 0: Manual Operations (0–150 loads/month)

**Prerequisites (ALL must be checked before Gate 1):**
- [ ] Landing page loads correctly on desktop and mobile
- [ ] Carrier self-service onboarding works end-to-end (form → database → email)
- [ ] Load creation and carrier assignment works in AE Console
- [ ] Rate confirmation generation works
- [ ] 9-status load tracking works (manual updates)
- [ ] POD upload and template-based invoice generation works
- [ ] Carrier payment via Stripe ACH works
- [ ] Scorecard calculation cron job runs correctly
- [ ] FMCSA status checker cron job runs correctly
- [ ] Insurance expiry alerter cron job runs correctly

**Active automation (NO AI):**
- `fmcsa_monitor` — Daily FMCSA SAFER API check
- `insurance_checker` — Daily expiry date comparison
- `scorecard_calc` — Monthly SQL aggregation
- `rate_card_gen` — Monthly rate card generation

**AI involvement:** None in production. Use claude.ai Cowork for personal productivity.

---

## Gate 1: AI-Assisted Tools (150–450 loads/month)

**Prerequisites:** ALL Gate 0 items checked. At least 30 days of operational data.

**Validation sequence:** Shadow mode (30 days) → Supervised mode (30 days) → Production mode

**Features activated:**
- [ ] `email_classifier` (Haiku) — Classify inbound emails, suggest responses
- [ ] `checkcall_parser` (Haiku) — Extract location + delay signals from carrier replies
- [ ] `document_ocr` (Sonnet vision) — Extract data from BOL/POD images
- [ ] `morning_briefing` (Sonnet) — Generate daily operations summary
- [ ] `ai_usage_dashboard` — AI cost + accuracy tracking in AE Console
- [ ] Cost cap configured and alerting at 80%

**Estimated monthly AI cost:** $13–50

**Fallback chain:** Each tool has AI → rule-based → manual queue fallback.

---

## Gate 2: Intelligent Automation (450–900 loads/month)

**Prerequisites:** ALL Gate 1 items in production mode. AI accuracy >90% on sampled decisions.

**Features activated:**
- [ ] `rate_quoting` (Opus) — Multi-step quote generation with AE approval queue
- [ ] `load_matching` (Sonnet) — Multi-factor carrier ranking with AE selection
- [ ] `exception_detection` (Sonnet) — Delay detection with AE alert confirmation
- [ ] `quick_pay_evaluator` (Sonnet + deterministic validation)
- [ ] `carrier_outreach` (Sonnet) — Personalized outreach drafts with AE review

**Estimated monthly AI cost:** $100–300

**Architecture:** All produce recommendations → enter AE approval queue. NONE execute autonomously.

---

## Gate 3: Autonomous Operations (900+ loads/month)

**Prerequisites:** ALL Gate 2 items in production mode. 90+ day operational history.

**Features activated:**
- [ ] `auto_dispatch` — Pre-approved Platinum carrier + lane combinations
- [ ] `auto_quick_pay` — Platinum carriers under $5,000 (deterministic validation, no human review)
- [ ] `voice_agent` — Inbound carrier status calls (Bland.ai integration)
- [ ] `predictive_cashflow` — Weekly working capital projections
- [ ] `auto_qbr` — Auto-generated shipper QBR decks (quarterly)

**Estimated monthly AI cost:** $500–800 (including Bland.ai voice at ~$460/month)

---

## Implementation Reference

**Volume check module:** `backend/src/ai/volumeGates.ts`
**Circuit breaker:** `backend/src/security/circuitBreaker.ts`
**Cost tracking:** `backend/src/services/aiRouter/costTracker.ts`
**Security modules:** `backend/src/security/`
