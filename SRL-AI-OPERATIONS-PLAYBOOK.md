# SRL AI-Native Operations Playbook
## From 2-Person Startup to Multi-Million Dollar Freight Brokerage

**Date**: February 24, 2026
**Context**: Pre-launch, 2-person team. External tools: Email, DAT, DocuSign.
**AI Stack**: Claude Cowork Enterprise + Claude API + Custom Plugins

---

## The Core Thesis

Traditional brokerages scale linearly: more loads = more people. SRL scales exponentially by making AI handle the 80% repetitive work while the 2 founders focus on relationships, strategy, and exceptions. A typical brokerage needs 8-12 people to move 200 loads/month. With AI-native ops, SRL targets 200+ loads/month with 2-4 people.

---

## PHASE 1: LAUNCH (Months 1-3) — "2 People, 50 Loads/Month"

### Priority 1: Carrier Sourcing & Vetting (Your #1 Bottleneck)

**Near-term (Claude Cowork + DAT):**
- **Custom Cowork Plugin: "Carrier Matcher"**
  - Input: Load details (origin, dest, equipment, weight)
  - Action: Searches DAT carrier database, cross-references FMCSA SAFER data, checks insurance status, authority age, safety rating, and inspection history
  - Output: Ranked list of 10-15 qualified carriers with contact info, their typical lanes, and a risk score
  - Time saved: 45-60 min per load → 5 min review

- **Carrier Vetting Automation**
  - Cowork agent connected to FMCSA SAFER API + DAT
  - Auto-pulls: MC#, DOT#, insurance expiry, authority status, safety score, complaint history
  - Flags: New authority (<6 months), insurance gaps, poor safety scores, double-brokering indicators
  - Generates a "Carrier Scorecard" PDF stored in SRL console
  - **Rule**: No carrier with score < 70/100 gets a load without founder approval

- **Carrier Onboarding Packet**
  - Cowork + DocuSign connector
  - When a new carrier is approved: auto-generates carrier agreement, W-9 request, insurance cert request
  - Sends via DocuSign for e-signature
  - On completion: auto-creates carrier profile in SRL console
  - Time saved: 2 hours per carrier → 10 min review + click

### Priority 2: Compliance & Document Management

**Near-term (Claude Cowork + DocuSign + Gmail):**
- **Document Monitoring Agent**
  - Tracks insurance certificate expiry dates for all active carriers
  - 30-day warning email auto-sent to carrier
  - 7-day warning escalates to founder
  - Expired = carrier auto-suspended in SRL console (no new loads)
  - Monitors authority status weekly via FMCSA API

- **BOL & POD Processing**
  - Cowork agent watches Gmail for incoming BOL/POD scans from carriers
  - Auto-extracts: shipper, consignee, commodity, weight, piece count, signatures
  - Matches to existing load in SRL console
  - Flags discrepancies (weight mismatch, missing signatures, wrong consignee)
  - Time saved: 20 min per document → auto-processed, only exceptions need review

- **Rate Confirmation Auto-Generation**
  - After carrier assignment in SRL console → Cowork generates RC from template
  - Pre-fills all load details, rates, payment terms, accessorials
  - Sends via DocuSign for carrier signature
  - Signed RC auto-attached to load record
  - Time saved: 30 min per RC → 2 min review + send

### Priority 3: Manual Data Entry Reduction

**Near-term (Claude API in SRL Console):**
- **Email-to-Load Creator**
  - Cowork watches Gmail for shipper quote requests / load tenders
  - Extracts: origin, destination, pickup/delivery dates, commodity, weight, equipment type
  - Pre-fills create-load form in SRL console
  - Founder reviews and clicks "Create" — no manual typing
  - Time saved: 15 min per load → 2 min review

- **Voice-to-Load (stretch goal for Month 2-3)**
  - Phone call with shipper → record notes
  - Paste notes into Cowork → generates load with all extracted details
  - Useful for phone-heavy freight sales

### Priority 4: Invoicing

**Near-term (Claude Cowork + Gmail):**
- **Auto-Invoice on Delivery**
  - When load status = DELIVERED + POD received:
  - Cowork generates invoice from SRL template (load details, rates, accessorials, payment terms)
  - Attaches POD as supporting document
  - Sends to shipper via email
  - Tracks in SRL console with payment due date
  - 7/14/21-day auto-follow-up emails for unpaid invoices

- **Carrier Pay Processing**
  - On shipper payment received → flags carrier payment as ready
  - Generates carrier pay stub with load details and agreed rate
  - Quick-pay discount auto-calculated if carrier opted in

---

## PHASE 2: GROWTH (Months 4-8) — "2 People, 150+ Loads/Month"

### Scaling Without Hiring

- **Agent Teams (Opus 4.6 feature)**
  - Deploy specialized AI agents working in parallel:
    - **Agent 1: Load Intake** — processes incoming emails/calls, creates loads
    - **Agent 2: Carrier Matching** — finds and contacts carriers for open loads
    - **Agent 3: Track & Trace** — monitors in-transit loads, sends status updates to shippers
    - **Agent 4: Back Office** — invoicing, document filing, compliance monitoring
  - Founders focus on: closing new shippers, resolving exceptions, building carrier relationships

### Revenue Intelligence

- **Lane Rate Intelligence Plugin**
  - Cowork analyzes DAT rate data + SRL historical loads
  - Suggests optimal customer rates per lane (maximize margin while staying competitive)
  - Flags lanes where SRL is leaving money on the table
  - Weekly market report: rate trends, seasonal shifts, capacity forecasts

- **Customer Health Dashboard**
  - Tracks load volume per customer, payment patterns, complaint frequency
  - Alerts: "Acme Manufacturing's volume dropped 40% this month — reach out"
  - Suggests upsell opportunities: "Customer X ships LA→Dallas weekly, offer dedicated capacity deal"

### Operational Efficiency

- **Exception-Only Management**
  - AI handles 100% of routine loads end-to-end
  - Founders get notified ONLY for exceptions:
    - Carrier late to pickup (no check-in within 1hr of appointment)
    - Rate negotiation needed (carrier counter above threshold)
    - Document discrepancy (BOL weight mismatch >5%)
    - Customer complaint or claim
  - Target: 80% of loads need zero human intervention

- **Automated Carrier Communication**
  - Load tendered → AI sends rate con
  - Day before pickup → AI sends dispatch confirmation + pickup instructions
  - Pickup time → AI requests check-in call/update
  - In transit → AI requests periodic location updates
  - Delivery → AI requests POD upload
  - All via email/SMS with escalation to founder if no response

---

## PHASE 3: SCALE (Months 9-18) — "4-6 People, 500+ Loads/Month"

### First Hires (AI-Augmented, Not Replaced)

| Role | What They Do | What AI Does For Them |
|------|-------------|----------------------|
| Carrier Sales Rep (1-2) | Build carrier relationships, negotiate rates | AI finds carriers, pre-vets, drafts outreach emails, tracks capacity |
| Account Executive (1-2) | Win new shipper accounts, manage key accounts | AI generates proposals, tracks customer health, drafts QBRs |
| Operations Coordinator (1) | Handle exceptions, manage claims | AI routes only exceptions to them, pre-drafts claim responses |

### Technology Expansion

- **Custom SRL Cowork Plugin (published to Anthropic marketplace)**
  - If SRL's internal tools prove effective, package and sell the logistics plugins to other brokerages
  - Revenue diversification: SaaS income alongside brokerage revenue

- **TMS Integration**
  - As volume grows, consider TMS (MercuryGate, Tai, etc.) with Cowork connectors
  - AI bridges SRL console ↔ TMS ↔ accounting software

- **Predictive Capacity**
  - AI models predict carrier availability per lane based on historical data
  - Pre-books capacity before shipper tenders arrive
  - Competitive advantage: instant quotes while competitors scramble to find trucks

### Financial Targets

| Month | Loads/Month | Avg Revenue/Load | Gross Revenue | Avg Margin | Gross Profit | Team Size |
|-------|-------------|------------------|---------------|------------|-------------|-----------|
| 3 | 50 | $2,500 | $125,000 | 15% | $18,750 | 2 |
| 6 | 150 | $2,800 | $420,000 | 16% | $67,200 | 2 |
| 12 | 350 | $3,000 | $1,050,000 | 17% | $178,500 | 4 |
| 18 | 500 | $3,200 | $1,600,000 | 18% | $288,000 | 6 |
| 24 | 800+ | $3,500 | $2,800,000+ | 18%+ | $504,000+ | 8 |

---

## IMPLEMENTATION ROADMAP

### Week 1-2: Foundation
- [ ] Sign up for Claude Cowork Enterprise (contact Anthropic sales)
- [ ] Connect Gmail + DocuSign to Cowork
- [ ] Build Carrier Vetting plugin (FMCSA SAFER API integration)
- [ ] Build Rate Confirmation auto-generation template
- [ ] Set up document monitoring (insurance expiry tracking)

### Week 3-4: Core Workflows
- [ ] Build Email-to-Load intake agent
- [ ] Build Carrier Matching plugin (DAT integration)
- [ ] Build auto-invoicing workflow
- [ ] Test end-to-end: email → load → carrier match → RC → dispatch → POD → invoice

### Month 2: Optimization
- [ ] Build carrier communication automation (dispatch confirm, check-ins, POD request)
- [ ] Build BOL/POD extraction agent
- [ ] Build lane rate intelligence dashboard
- [ ] Refine all agents based on real load data

### Month 3: Scale Prep
- [ ] Deploy agent teams (4 specialized agents running in parallel)
- [ ] Build exception-only notification system
- [ ] Build customer health monitoring
- [ ] Document all workflows for future hires

---

## COST ESTIMATE

| Item | Monthly Cost | Notes |
|------|-------------|-------|
| Claude Cowork Enterprise | ~$100-200/seat | 2 seats initially |
| Claude API (for SRL console integrations) | ~$200-500 | Usage-based, scales with volume |
| DAT Load Board | ~$200-400 | Carrier sourcing |
| DocuSign | ~$25-50 | E-signatures |
| SRL Hosting (Cloudflare + Render) | ~$50-100 | Current stack |
| **Total** | **~$575-1,250/mo** | **vs. $4,000-6,000/mo for 1 additional employee** |

The AI stack costs less than 1/4 of a single employee while doing the work of 3-4 people.

---

## COMPETITIVE MOAT

1. **Speed**: Quote-to-dispatch in minutes, not hours. Shippers love fast responses.
2. **Accuracy**: AI doesn't forget to check insurance, miss a POD, or mistype a rate.
3. **24/7 Operations**: AI agents work nights/weekends. Carriers calling at 6 AM get instant responses.
4. **Data Advantage**: Every load builds SRL's lane intelligence. Over time, SRL knows rates and capacity better than competitors.
5. **Scalability**: Adding 50 loads/month requires zero new hires until 500+ loads/month.

---

## KEY RISKS & MITIGATIONS

| Risk | Mitigation |
|------|-----------|
| AI makes a mistake on a critical load | Exception thresholds: any load >$5K or hazmat requires founder review |
| Carrier relationship feels impersonal | Founders personally call top 20 carriers monthly. AI handles routine comms. |
| Shipper wants to talk to a person | All AI emails have founder's direct line. Escalation path is clear. |
| Anthropic pricing increases | Core SRL console works independently. Cowork is additive, not dependency. |
| Compliance miss | Weekly automated compliance audit. Quarterly manual review. |
