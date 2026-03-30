/**
 * Seed SOPs — AE Sales Training + Carrier Growth Strategy
 * Run: npx tsx prisma/seed-sops.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const SOPS = [
  // ─── AE SALES TRAINING ────────────────────────────────────
  {
    title: "AE Sales Playbook — Complete Guide",
    category: "sales",
    version: "1.0",
    author: "Wasih Haider",
    description: "Master guide for Account Executives covering the full shipper lifecycle from prospecting to white-glove service delivery.",
    content: `# AE Sales Playbook — Silk Route Logistics

## Your Role as Account Executive

As an AE at Silk Route Logistics, you are the face of SRL to our shippers. Your job is to find shippers who need reliable freight capacity, understand their pain points, onboard them seamlessly, and deliver white-glove service that makes them long-term Cornerstone customers.

## The SRL Sales Methodology: FIND → QUALIFY → PITCH → CLOSE → DELIGHT

Every shipper relationship follows these 5 phases. Master each one.

---

## Phase 1: FIND — Shipper Prospecting

### Where to Find Shippers
1. **Lead Hunter Tool** — Use /dashboard/lead-hunter to search by industry, state, and revenue
2. **DAT Load Board** — Monitor posted loads from shippers seeking capacity
3. **LinkedIn Sales Navigator** — Search for "Logistics Manager", "Supply Chain Director", "Shipping Manager" at manufacturers/distributors
4. **Industry Events** — Attend TMSA, TIA, SMC3 conferences
5. **Referrals** — Ask existing customers: "Who else in your industry struggles with freight?"
6. **Google Alerts** — Set up alerts for "[industry] + warehouse + expansion" to catch growing companies

### Ideal Customer Profile (ICP)
- **Revenue**: $5M–$500M (sweet spot for brokerage services)
- **Freight Spend**: $50K–$5M annually
- **Shipment Volume**: 5–200 loads/month
- **Equipment**: Dry Van, Reefer, Flatbed (our strongest lanes)
- **Geography**: US domestic + US-Canada cross-border
- **Pain Points**: Inconsistent capacity, rate spikes, poor communication, claims

### Daily Prospecting Targets
- 25 cold calls/emails per day
- 5 warm follow-ups per day
- 2 discovery calls per week
- 1 proposal per week

---

## Phase 2: QUALIFY — Understanding Shipper Needs

### The Discovery Call Framework (30 minutes)

**Opening (5 min):**
- "Tell me about your company and what you ship."
- "How does freight fit into your business?"

**Pain Points (10 min):**
- "What's your biggest frustration with your current freight providers?"
- "How often do loads get dropped or rescheduled?"
- "What happens when rates spike — do you have backup options?"
- "How much time does your team spend tracking shipments?"

**Volume & Lanes (10 min):**
- "How many loads do you move per week/month?"
- "What are your top 5 lanes?"
- "What equipment types do you use?"
- "Do you have any temperature-sensitive or hazmat freight?"
- "Any cross-border (US-Canada, US-Mexico)?"

**Decision Process (5 min):**
- "Who else is involved in choosing a freight provider?"
- "What's your timeline for making a change?"
- "What would need to be true for you to give us a trial shipment?"

### Qualification Scorecard
Rate each prospect 1-5:
- **Volume**: How many loads/month?
- **Margin potential**: What rates are they paying now?
- **Decision timeline**: How soon can they move?
- **Pain level**: How frustrated are they?
- **Relationship access**: Can you reach the decision maker?

Score 20+ = Hot lead → Move to Pitch
Score 15-19 = Warm → Nurture with market intel
Score <15 = Cold → Park and revisit quarterly

---

## Phase 3: PITCH — The SRL Value Proposition

### SRL's 5 Differentiators

**1. Carrier-First Network (Caravan Partner Program)**
- "We don't just find any truck — we maintain a vetted carrier network scored on service level, communication, and reliability."
- "Our Platinum carriers have 95%+ on-time rates and priority access to your freight."

**2. Real-Time Visibility**
- "You'll see exactly where your freight is — GPS tracking, ELD integration, automated check calls."
- "No more calling your broker asking 'where's my truck?'"

**3. Compliance & Security**
- "Every carrier goes through our 29-point Compass vetting: FMCSA authority, insurance, OFAC screening, chameleon fraud detection."
- "We monitor carrier compliance daily — if their insurance lapses, they're blocked from your freight instantly."

**4. Technology Platform**
- "Your team gets a dedicated shipper portal: submit quotes, track shipments, view invoices, download documents — all self-service."
- "No email chains. No phone tag. Everything in one place."

**5. White-Glove Service**
- "You'll have a dedicated AE (me) plus dispatch support."
- "Proactive communication — we call you before problems happen, not after."
- "Claims handled within 24 hours with full documentation."

### Pricing Strategy
- **Market Rate**: Use /dashboard/market for current lane rates
- **Target Margin**: 12-18% on standard freight, 20-25% on specialized
- **Volume Discount**: Offer 3-5% reduction for committed weekly volume
- **Trial Rate**: Offer first 3 loads at cost+10% to prove service quality

---

## Phase 4: CLOSE — Onboarding the Shipper

### Step-by-Step Onboarding Checklist

**Day 1: Paperwork**
- [ ] Customer created in CRM (/dashboard/crm → Add Customer)
- [ ] Company name, type, contact info, address
- [ ] Credit limit set (start conservative: $25K-$50K)
- [ ] Payment terms agreed (Net 30 standard, Net 15 for new)
- [ ] Tax ID collected
- [ ] Credit check run (SEC EDGAR for public companies)
- [ ] Broker-Shipper agreement signed

**Day 2-3: System Setup**
- [ ] Shipper portal account created (auto on registration)
- [ ] Primary contact added with email/phone
- [ ] Lane preferences documented in notes
- [ ] Equipment requirements noted
- [ ] Special handling requirements (hazmat, temp, etc.)
- [ ] Preferred pickup/delivery windows recorded

**Day 3-5: Trial Shipment**
- [ ] First load created in system
- [ ] Best carrier matched via Compass scoring
- [ ] Rate confirmation sent and signed
- [ ] Shipper portal walkthrough call (15 min)
- [ ] Track shipment proactively — call shipper before delivery
- [ ] Post-delivery follow-up within 2 hours

**Day 5-7: Relationship Lock**
- [ ] Invoice sent promptly (same day as delivery)
- [ ] Feedback call: "How did we do? What can we improve?"
- [ ] Schedule recurring freight if applicable
- [ ] Ask for 2nd lane / additional volume
- [ ] Set up recurring check-in cadence (weekly for first month)

---

## Phase 5: DELIGHT — White-Glove Service & Cornerstone Growth

### What Makes a Cornerstone Customer
A Cornerstone customer is your top-tier shipper who:
- Ships 20+ loads/month with SRL
- Has been with SRL for 90+ days
- Has 95%+ on-time payment history
- Receives dedicated dispatch priority
- Gets quarterly business reviews

### White-Glove Service Standards
1. **Response Time**: Answer calls within 2 rings. Reply to emails within 30 minutes during business hours.
2. **Proactive Updates**: Send status updates at pickup, midway, and pre-delivery — don't wait for them to ask.
3. **Problem Resolution**: If a load has an issue (delay, damage, TONU), call the shipper FIRST. Own the problem. Present the solution alongside the problem.
4. **Rate Transparency**: Show market rate trends. If rates are dropping, proactively offer lower rates before they shop around.
5. **Quarterly Reviews**: Present shipping volume, on-time %, cost savings, and lane optimization suggestions.

### Escalation Protocol
- **Delivery Delay >2 hours**: Call shipper immediately, provide new ETA
- **Driver No-Show (TONU)**: Notify shipper within 30 min, have backup carrier within 2 hours
- **Cargo Damage**: File claim within 24 hours, send shipper the claim number
- **Rate Dispute**: Escalate to Operations Manager within 4 hours

### Account Growth Playbook
1. **Month 1**: Prove reliability on 3-5 loads. Earn trust.
2. **Month 2**: Ask for additional lanes. "What other lanes can I help with?"
3. **Month 3**: Propose dedicated capacity. "If you commit to 10 loads/week, I can lock in a rate 5% below spot."
4. **Month 6**: Quarterly business review. Present savings report.
5. **Month 12**: Negotiate annual contract with volume commitments.

---

## Quick Reference: SRL Tools for AEs

| Task | Where |
|------|-------|
| Add a customer | CRM → + Add Customer |
| Check credit | CRM → Expand → Check Credit (SEC) |
| Create a load | Load Board → + Create Load OR Order Builder |
| Find carriers | Load Board → Expand load → Suggested Carriers |
| Send tender | Load Board → Expand → Tender to Carrier |
| Track shipment | Track & Trace |
| Create invoice | Invoices → + Create Invoice |
| Check market rates | Market Intel |
| Search any page | Ctrl+K (Command Palette) |
| Message team | Messages |
`,
  },

  {
    title: "Shipper Discovery Call Script",
    category: "sales",
    version: "1.0",
    author: "Wasih Haider",
    description: "Word-for-word script for AE discovery calls with prospective shippers. Includes objection handling.",
    content: `# Shipper Discovery Call Script

## Opening (60 seconds)

"Hi [Name], this is [Your Name] with Silk Route Logistics. Thanks for taking my call.

I'll keep this brief — I know your time is valuable. I wanted to learn about your shipping needs and see if there's a fit for us to help. We're a technology-driven freight brokerage that focuses on carrier quality and real-time visibility.

Can I ask a few questions about your current freight setup?"

---

## Discovery Questions (15-20 minutes)

### About Their Business
1. "What does [Company] make/distribute?"
2. "How does freight fit into your supply chain? Is it a major cost center?"

### Current Pain Points
3. "Walk me through what happens when you need to ship something today. Who do you call?"
4. "What's your biggest headache with freight right now?"
5. "How often do you deal with dropped loads or no-shows?"
6. "When was the last time a shipment went wrong? What happened?"

### Volume & Lanes
7. "How many loads are you moving per month?"
8. "What are your busiest lanes?"
9. "What equipment do you primarily use?"
10. "Any specialized freight — temperature, hazmat, oversized?"

### Current Providers
11. "How many brokers/carriers do you work with currently?"
12. "What do they do well? What do they miss?"
13. "How do you currently track your shipments?"
14. "Are you under any contracts or commitments?"

### Decision & Timeline
15. "If we could solve [pain point they mentioned], what would that be worth to you?"
16. "Who else would be involved in a decision to try a new provider?"
17. "Would you be open to giving us a trial on 1-2 loads to prove our service?"

---

## Objection Handling

### "We're happy with our current provider"
"That's great — I'm not asking you to replace them. Most of our customers started by giving us 2-3 loads to test our service as a backup option. If we outperform, you can shift more volume. If not, you've lost nothing. Would a small trial make sense?"

### "Your rates are too high"
"I understand price matters. Let me ask — when a $2/mile carrier no-shows and you have to cover at $3.50 on the spot market, what does that actually cost you? Our rates include reliability — 97% tender acceptance, vetted carriers, real-time tracking. Let me run a comparison on your top 3 lanes and show you total cost of shipping, not just line-haul rate."

### "We don't have time to onboard another broker"
"I hear you. Our onboarding takes 15 minutes — we just need company info, a point of contact, and your first load. Our shipper portal is self-service. Your team won't have to learn a new system or make extra phone calls."

### "We use an asset carrier, not brokers"
"Smart — asset carriers are great for consistent lanes. Where we fit is on your overflow, surge capacity, and lanes where your asset carrier doesn't cover. Think of us as your flex capacity partner. Do you ever turn away orders because you can't find a truck?"

### "Send me an email and I'll get back to you"
"Absolutely. But before I send that — what specifically would you need to see in that email to move forward? That way I can make sure it's relevant and not just another sales pitch in your inbox."

---

## Closing (2 minutes)

### If Qualified:
"Based on what you've shared, I think we can help — especially on [specific pain point]. Here's what I'd like to do: I'll send you a brief proposal with rates on your top lanes, plus a summary of our carrier vetting and tracking capabilities. Can we schedule 15 minutes next [Tuesday/Wednesday] to review it together?"

### If Not Qualified:
"Thanks for being open with me. It sounds like you're in a good spot right now. I'd love to stay in touch — I send a monthly market trends email that might be useful for rate benchmarking. Can I add you to that? And if anything changes with your freight needs, I'm a phone call away."

---

## Post-Call Actions
1. Add prospect to CRM with discovery notes
2. Set follow-up reminder (3 days for hot leads, 2 weeks for warm)
3. Send personalized email within 2 hours referencing specific pain points discussed
4. If trial agreed: Create customer in CRM immediately, send onboarding link
`,
  },

  {
    title: "Shipper Onboarding Checklist",
    category: "sales",
    version: "1.0",
    author: "Wasih Haider",
    description: "Step-by-step onboarding checklist for new shipper customers. Covers CRM setup, credit, portal access, and first shipment.",
    content: `# Shipper Onboarding Checklist

## Pre-Onboarding (Before First Shipment)

### CRM Setup
- [ ] Create customer in CRM (Customer Type: SHIPPER)
- [ ] Enter company name, address, phone, email
- [ ] Add primary contact (name, title, email, phone)
- [ ] Add secondary/logistics contact if available
- [ ] Set customer status to "Active"
- [ ] Document lane preferences in Notes field
- [ ] Document equipment requirements
- [ ] Document special handling (hazmat, temp, appointment times)

### Credit & Billing
- [ ] Run SEC EDGAR credit check (CRM → Check Credit)
- [ ] Set initial credit limit ($25K for new, adjust based on credit)
- [ ] Set payment terms (Net 30 standard)
- [ ] Collect Tax ID / W-9
- [ ] Set up billing address (same as primary or different)
- [ ] Confirm invoicing preferences (email, portal, EDI)

### Agreement
- [ ] Send Broker-Shipper Transportation Agreement
- [ ] Confirm insurance requirements (if shipper has specific minimums)
- [ ] Document any rate agreements or commitments
- [ ] File signed agreement in Documents vault

### Portal Access
- [ ] Shipper registers at silkroutelogistics.ai/shipper/register
- [ ] Verify shipper can log in to portal
- [ ] Walk shipper through portal features (15 min call):
  - Dashboard overview
  - Quote request submission
  - Shipment tracking
  - Invoice viewing
  - Document downloads

---

## First Shipment (Prove It Load)

### Load Setup
- [ ] Create load in Order Builder with shipper's freight details
- [ ] Verify origin/destination addresses
- [ ] Confirm pickup date, delivery date, appointment times
- [ ] Set customer rate (agreed rate from proposal)
- [ ] Post to load board for carrier matching

### Carrier Assignment
- [ ] Review Compass-scored carrier suggestions
- [ ] Select Platinum or Gold tier carrier for first load
- [ ] Verify carrier insurance and authority current
- [ ] Send and confirm rate confirmation
- [ ] Confirm driver info (name, phone, truck #)

### Execution
- [ ] Confirm dispatch with shipper (call or portal notification)
- [ ] Monitor check calls — proactive updates to shipper at:
  - [ ] Pickup confirmation
  - [ ] Midway point
  - [ ] 2 hours before delivery
  - [ ] Delivery confirmation
- [ ] Collect POD within 2 hours of delivery

### Post-Delivery
- [ ] Generate and send invoice (same day as delivery)
- [ ] Call shipper within 2 hours: "How did everything go?"
- [ ] Document feedback in CRM notes
- [ ] If positive: propose 2nd and 3rd loads immediately
- [ ] If issues: resolve within 24 hours, document resolution

---

## Ongoing Relationship (First 90 Days)

### Week 1-2: Prove Reliability
- Ship 3-5 loads
- Daily check-in with shipper
- 100% on-time target
- Zero claims target

### Week 3-4: Expand Volume
- Ask for additional lanes
- Propose standing order for recurring lanes
- Introduce to dispatch team for after-hours support

### Month 2: Deepen Relationship
- Shift to weekly check-ins
- Share market rate trends for their lanes
- Propose volume-based rate reductions
- Add additional contacts to portal

### Month 3: Cornerstone Path
- Present 90-day performance report
- Propose quarterly business review cadence
- Discuss annual contract or committed volume
- Introduce to operations leadership
`,
  },

  // ─── CARRIER GROWTH STRATEGY ────────────────────────────────
  {
    title: "Carrier Onboarding & Growth Playbook",
    category: "operations",
    version: "1.0",
    author: "Wasih Haider",
    description: "Complete guide for carrier recruitment, onboarding, CPP tier progression, and carrier growth incentives including fuel and QuickPay programs.",
    content: `# Carrier Onboarding & Growth Playbook

## SRL Carrier Philosophy

Silk Route Logistics is a carrier-first brokerage. Happy carriers = reliable service = happy shippers. Our Caravan Partner Program (CPP) rewards the best carriers with better rates, faster pay, and priority access to premium freight.

---

## Part 1: Carrier Recruitment

### Where to Find Quality Carriers
1. **Carrier onboarding portal** — silkroutelogistics.ai/onboarding (self-service)
2. **DAT Load Board** — Carriers responding to posted loads
3. **Truckstop** — Carrier search and load matching
4. **Industry referrals** — Ask existing carriers: "Know any reliable operators?"
5. **Truck stops & terminals** — Physical outreach with QR code to onboarding portal
6. **Social media** — LinkedIn, Facebook trucking groups, Instagram

### Ideal Carrier Profile
- **Authority Age**: 1+ year (minimum 90 days for probationary onboard)
- **Fleet Size**: 3-50 trucks (owner-operators to mid-size fleets)
- **Safety Rating**: Satisfactory or Not Rated (new carriers)
- **Insurance**: $1M+ auto liability, $100K+ cargo
- **CSA Scores**: No BASIC above 75th percentile
- **Equipment**: Dry Van, Reefer, Flatbed, Step Deck

### Carrier Value Proposition
Tell carriers:
1. "Consistent freight — we have steady volume, not just spot loads"
2. "QuickPay available — get paid in 2-5 days instead of Net 30"
3. "Fuel discount program — save on every gallon"
4. "Performance bonuses — earn more as your score improves"
5. "Easy self-service portal — track loads, payments, documents online"
6. "Transparent scoring — you always know where you stand"

---

## Part 2: Carrier Onboarding (Self-Service)

### What Carriers Do (silkroutelogistics.ai/onboarding)

**Step 1: Company Info**
- DOT number (auto-populates from FMCSA)
- MC number
- Company name, address, contact info
- Equipment types, operating regions

**Step 2: Documents**
- W-9
- Certificate of Insurance (COI)
- Operating Authority letter
- Photo ID of owner/contact

**Step 3: Terms & Conditions**
- Sign Carrier-Broker Agreement
- Accept SRL's Caravan Partner Program terms

### What SRL Does (Automated)

**Compass 29-Point Vetting (runs automatically on registration):**
1. FMCSA authority verification
2. Safety rating check
3. Insurance on file verification
4. CSA BASIC scores (all 7 categories)
5. OFAC/SDN screening
6. Chameleon fraud detection (fingerprint cross-reference)
7. Identity verification (email domain, phone type, business entity)
8. ELD provider validation
9. Fleet VIN verification (NHTSA)
10. And 19 more checks...

**Result:**
- Score 80-100 (LOW risk) → Auto-approved
- Score 60-79 (MEDIUM risk) → Manual review required
- Score <60 (HIGH/CRITICAL risk) → Rejected with reason

### Onboarding Timeline
- **Minute 0-5**: Carrier completes self-service form
- **Minute 5-10**: Compass vetting runs automatically
- **Minute 10-15**: If LOW risk → approval email sent, portal activated
- **Same day**: Carrier can start accepting loads on the load board

---

## Part 3: Caravan Partner Program (CPP) — Tier System

### Tier Structure

| Tier | Score | Requirements | Benefits |
|------|-------|-------------|----------|
| **GUEST** | Baseline | New carrier, <3 loads | Standard rates, Net 30 pay |
| **BRONZE** | 60+ | 3+ completed loads | 2% rate bonus, Net 25 pay |
| **SILVER** | 70+ | 25+ loads, 90+ days | 5% rate bonus, Net 20 pay, QuickPay at 2% fee |
| **GOLD** | 80+ | 100+ loads, 180+ days | 8% rate bonus, Net 15 pay, QuickPay at 1.5% fee, fuel discount |
| **PLATINUM** | 90+ | 250+ loads, 365+ days | 12% rate bonus, Net 10 pay, QuickPay at 1% fee, max fuel discount, priority dispatch |

### KPIs That Drive Tier Score (100-point scale)

1. **On-Time Pickup %** (15 points) — Picked up within 1 hour of appointment
2. **On-Time Delivery %** (15 points) — Delivered within 2 hours of appointment
3. **Communication Score** (15 points) — Responds to check calls, provides updates
4. **Claim Ratio** (15 points) — Fewer claims = higher score (inverted)
5. **Document Timeliness** (10 points) — POD submitted within 24 hours
6. **Acceptance Rate** (10 points) — % of tendered loads accepted (higher = better)
7. **GPS Compliance** (10 points) — ELD/GPS tracking enabled during transit
8. **Overall Reliability** (10 points) — Composite of cancellation rate + TONU rate

### Quarterly Bonus Structure
- **PLATINUM**: 3% of quarterly revenue as cash bonus
- **GOLD**: 2% of quarterly revenue
- **SILVER**: 1% of quarterly revenue
- **BRONZE/GUEST**: No bonus (but eligible for tier upgrade)

### Tier Review Cadence
- Scores recalculated after every completed load
- Tier upgrades: Immediate when score threshold reached
- Tier downgrades: 30-day grace period with warning notification

---

## Part 4: QuickPay Program

### How It Works
Carriers don't have to wait Net 30 for payment. QuickPay gets them paid in 2-5 business days.

### Fee Structure (By Tier)
| Tier | QuickPay Fee | Net Pay After Fee |
|------|-------------|-------------------|
| GUEST | 3% | 97% of invoice |
| BRONZE | 3% | 97% |
| SILVER | 2% | 98% |
| GOLD | 1.5% | 98.5% |
| PLATINUM | 1% | 99% |

### Process
1. Load delivered → CarrierPay record auto-created
2. Carrier logs into portal → sees payment in "Payments" tab
3. Carrier clicks "Request QuickPay" button
4. Fee auto-calculated based on tier → net amount shown
5. Carrier confirms → payment scheduled for next business day
6. Payment sent via ACH/check

### QuickPay Revenue for SRL
QuickPay fees are SRL revenue. At scale:
- 100 loads/month × $2,000 avg carrier pay × 50% QuickPay adoption × 2% avg fee = **$2,000/month revenue**

---

## Part 5: Fuel Discount Program

### Program Overview
SRL negotiates bulk fuel pricing and passes discounts to CPP carriers. This is a loyalty incentive — carriers save money by staying in the SRL network.

### Discount Tiers
| Tier | Fuel Discount |
|------|--------------|
| GUEST/BRONZE | Not eligible |
| SILVER | $0.03/gallon off retail |
| GOLD | $0.05/gallon off retail |
| PLATINUM | $0.08/gallon off retail |

### How It Works
1. SRL partners with fuel network (Pilot/Flying J, Love's, TA/Petro)
2. Carrier receives SRL fuel card linked to their CPP tier
3. Discount applied automatically at pump
4. Fuel purchases tracked in carrier portal

### Estimated Carrier Savings
A truck averaging 6 MPG, driving 10,000 miles/month:
- ~1,667 gallons/month
- PLATINUM savings: 1,667 × $0.08 = **$133/month per truck**
- Fleet of 10 trucks: **$1,330/month savings**

### Implementation Timeline
- **Phase 1 (Launch)**: Manual fuel reimbursement (carrier submits receipts)
- **Phase 2 (Month 3)**: Partner with fuel card provider (EFS, Comdata, or Fleet One)
- **Phase 3 (Month 6)**: Integrated fuel card with auto-tier pricing

---

## Part 6: Carrier Retention Strategy

### Monthly Health Checks
- Review carrier scorecard trends
- Identify declining carriers → reach out personally
- Celebrate tier upgrades with congratulatory email + badge

### Communication Cadence
- **PLATINUM**: Quarterly business review with Operations Director
- **GOLD**: Monthly check-in call with dispatch
- **SILVER**: Bi-monthly email with lane opportunities
- **BRONZE/GUEST**: Monthly newsletter with tips + available freight

### Carrier Churn Prevention
Red flags to watch:
1. Declining acceptance rate (was 80%, now 50%)
2. Increasing TONU rate
3. Missing check calls
4. Late document submissions
5. Complaints about rates

Action: Call the carrier. Ask: "What's changed? How can we help?" Often the fix is simple — better lane matching, rate adjustment, or schedule flexibility.

### Exit Interview
If a carrier leaves the network:
- Document reason in CRM
- Classify: rate issue, service issue, capacity issue, went asset
- If fixable: offer to resolve and retain
- If not: thank them, leave door open for return

---

## Quick Reference: Carrier Portal Features

| Feature | Where |
|---------|-------|
| View available loads | Carrier Portal → Find Loads |
| Accept a load | Find Loads → Select → Accept |
| Update load status | My Loads → Status buttons |
| Submit check call | My Loads → Check Call form |
| Upload POD | Documents → Upload |
| View payments | Payments tab |
| Request QuickPay | Payments → QuickPay button |
| View scorecard | Scorecard & Bonuses |
| View revenue | Revenue tab |
| Update profile | Settings |
`,
  },

  {
    title: "Carrier Vetting — Compass System Guide",
    category: "compliance",
    version: "1.0",
    author: "Wasih Haider",
    description: "How SRL's Compass 29-check carrier vetting system works. For Operations and Compliance teams.",
    content: `# Compass by SRL — 29-Check Carrier Vetting System

## Overview
Compass is SRL's automated carrier compliance engine. It runs 29 checks across 6 categories when a carrier registers, and continuously monitors all approved carriers.

## The 29 Checks

### Category 1: FMCSA Authority (Checks 1-7)
1. **Operating Authority** — Must be AUTHORIZED (instant fail if not)
2. **Out-of-Service Status** — Must not have OOS date (instant fail)
3. **Insurance on File** — BIPD insurance required
4. **Safety Rating** — UNSATISFACTORY = fail, CONDITIONAL = warning
5. **Double-Broker Risk** — Entity type must not include BROKER
6. **Fleet Size** — <3 power units = warning
7. **New Carrier Risk** — 1 truck + no safety rating = fail

### Category 2: Identity Verification (Checks 8-15)
8. **Insurance Minimums** — Auto <$1M or Cargo <$100K = fail
9. **Authority Age** — <90 days = warning, <180 days = warning
10. **CSA BASIC Scores** — >90th percentile = fail, >75th = warning
11. **Identity Score** — VERIFIED/PARTIAL/FAILED from composite check
12. **Email Domain** — Disposable = fail, Free = warning, Business = pass
13. **VoIP Phone** — VoIP detected = fail
14. **Chameleon Risk** — HIGH = fail, MEDIUM = warning
15. **Business Entity (SOS)** — Dissolved = fail, Inactive = warning

### Category 3: Documents (Checks 16-17)
16. **Document Completeness** — Missing W-9/COI/Authority = -5 each
17. **Insurance Expiry** — Expired = fail, <14 days = warning

### Category 4: Performance (Check 18)
18. **Historical Score** — Scorecard <50 = fail, <70 = warning

### Category 5: Compliance (Checks 19-22)
19. **OFAC/SDN Screening** — Match ≥90 = fail + auto-suspend
20. **ELD Device** — Not on FMCSA list = warning
21. **W-9 TIN Match** — Mismatch = fail
22. **Biometric Facial** — Mismatch = fail, Skipped = warning

### Category 6: Risk (Checks 23-29)
23. **Fraud Report History** — Per confirmed report = -10
24. **UCR Registration** — Expired = warning
25. **Overbooking Risk** — Critical/High = fail
26. **Carrier-Broker Agreement** — Expired/Missing = warning
27. **Fleet VIN Verification** — Via NHTSA API
28. **Probationary Period** — <3 loads, <90 days = monitored
29. **Document Expiry** — COI/W-9/Authority expiry enforcement

## Scoring
- Start at 100, deductions per check
- Grade: A (90+), B (75-89), C (60-74), D (40-59), F (<40)
- Risk: LOW (80+), MEDIUM (60-79), HIGH (40-59), CRITICAL (<40)

## Automated Actions
- **Daily**: Insurance expiry check, FMCSA authority monitoring
- **Weekly**: OFAC rescan of all approved carriers
- **Monthly**: Full re-vetting with score trend analysis
- **On Change**: Any FMCSA status change triggers immediate alert
`,
  },
];

async function main() {
  console.log("Seeding SOPs/Training Manuals...");

  for (const sop of SOPS) {
    const existing = await prisma.sOP.findFirst({ where: { title: sop.title } });
    if (existing) {
      await prisma.sOP.update({ where: { id: existing.id }, data: sop });
      console.log(`  Updated: ${sop.title}`);
    } else {
      await prisma.sOP.create({ data: sop as any });
      console.log(`  Created: ${sop.title}`);
    }
  }

  console.log("Done — 5 SOPs seeded.");
}

main().catch(console.error).finally(() => prisma.$disconnect());
