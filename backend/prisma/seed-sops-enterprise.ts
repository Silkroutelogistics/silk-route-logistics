import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const ENTERPRISE_SOPS = [
  {
    title: "Load Board Management & Posting Protocol",
    category: "Operations",
    version: "1.0",
    author: "Wasih Haider",
    description: "Standard procedures for posting loads to DAT, Truckstop, and internal load board. Covers pricing strategy, retention time, and capacity allocation.",
    pages: 8,
    content: `# Load Board Management & Posting Protocol

## Purpose

This SOP defines how Silk Route Logistics posts loads to external load boards, manages visibility, and allocates capacity between internal carriers and the spot market.

## Load Posting Workflow

### Step 1: Load Entry & Rate Setting
1. Load created in TMS with origin, destination, equipment, dates, and customer rate
2. Carrier rate target set: Customer Rate minus target margin (minimum 12% for FTL, 15% for LTL)
3. Rate Intelligence checked via /dashboard/market for lane benchmarks
4. If contract carrier available via Routing Guide, tender to them first (no board posting)

### Step 2: Internal Carrier Network (Priority 1)
1. Check Routing Guide for lane-specific carrier priority list
2. Launch waterfall tender to ranked carriers (60-minute expiration per step)
3. If accepted within 2 hours, load is covered. Do not post to board.
4. If no acceptance, proceed to broadcast tender or load board

### Step 3: Load Board Posting (Priority 2)
1. Post to DAT via TMS integration (/dashboard/loads → DAT Post button)
2. Post format: Origin City, ST → Dest City, ST | Equipment | Weight | Rate | Dates
3. Include special requirements: hazmat, temp-controlled, oversized, team required
4. Set competitive rate: start at target, adjust ±5% based on market conditions

### Step 4: Rate Management During Posting
- Hour 0-4: Hold at target rate
- Hour 4-8: If no interest, increase rate by 3-5%
- Hour 8-12: Escalate to manager. Consider rate increase of 8-10%
- Hour 12+: Broker discretion. Priority is covering the load before pickup
- Never exceed customer rate minus 5% minimum margin

### Step 5: Carrier Screening on Inbound Calls
1. Verify carrier in TMS (Compass vetting score must be B or higher)
2. Confirm equipment availability, pickup/delivery capability
3. Check for double-brokering red flags (newly registered MC, no equipment)
4. Negotiate rate. Counter at 5-8% below their ask
5. If agreed, book immediately and remove from load boards

### Load Board Best Practices
- Remove loads from board within 15 minutes of booking
- Never post the same load on multiple boards with different rates
- Update posting if dates or requirements change
- Monitor competitor postings on the same lane for rate intelligence
- Track posting-to-book conversion rate (target: 40%+ within 8 hours)

### Capacity Allocation Strategy
- 60% Internal carriers (Routing Guide + Caravan partners)
- 25% Load board spot market
- 10% Digital freight matching (DAT, Convoy partnerships)
- 5% Emergency/last-resort (rate premium acceptable)

## Regulatory Notes
- All load postings must accurately represent freight characteristics
- Do not misrepresent weight, dimensions, or hazmat status
- Maintain records of all postings per DOT audit requirements (3 years)`,
  },

  {
    title: "Dispute Resolution & Freight Liability",
    category: "Finance",
    version: "1.0",
    author: "Wasih Haider",
    description: "Procedures for resolving billing disputes, handling freight liability claims, and managing shipper/carrier disagreements under the Carmack Amendment.",
    pages: 10,
    content: `# Dispute Resolution & Freight Liability

## Purpose

This SOP establishes procedures for resolving billing disputes between SRL, shippers, and carriers. It covers the Carmack Amendment framework, released value shipments, and escalation paths.

## Types of Disputes

### 1. Rate Disputes
- Carrier invoices a different rate than agreed on Rate Confirmation
- Resolution: Rate Confirmation is the binding document. Pay the RC rate.
- If carrier disputes: escalate to Operations Manager within 24 hours

### 2. Accessorial Disputes
- Detention, lumper, TONU, or other charges not pre-approved
- Resolution: Only pay accessorials documented on the signed Rate Confirmation
- Exception: Detention over 2 hours at shipper/receiver with timestamped proof

### 3. Shortage/Damage Claims (Carmack Amendment)
- Shipper alleges cargo damage or shortage
- Timeline: Shipper must file written claim within 9 months of delivery (49 USC 14706)
- SRL must acknowledge claim within 30 days
- SRL must resolve (pay, deny, or offer settlement) within 120 days
- Required documentation: BOL (showing condition at origin), POD (showing condition at delivery), photos, repair estimate, commercial invoice

### 4. Late Delivery Claims
- Shipper claims financial loss due to late delivery
- Liability: Carrier is liable for actual damages caused by unreasonable delay
- SRL defense: Force majeure (weather, traffic, mechanical), shipper-caused delay, receiver-caused delay
- Documentation required: Check call logs, GPS tracking, weather reports

## Carmack Amendment Framework (49 USC 14706)

### Shipper's Burden of Proof
1. Goods were in good condition when tendered to carrier
2. Goods were damaged or lost when delivered (or not delivered)
3. Amount of damages

### Carrier Defenses
1. Act of God (natural disaster, severe weather)
2. Act of public enemy
3. Act of the shipper (improper packaging, loading)
4. Public authority (government seizure, quarantine)
5. Inherent nature of goods (perishable, fragile)

### Released Value Shipments
- If BOL contains a released value declaration (e.g., "Released Value: $2.00/lb")
- Carrier liability limited to declared value
- SRL must ensure customer understands released value implications at booking

## Dispute Resolution Process

### Step 1: Internal Review (0-48 hours)
- Gather all documentation: BOL, POD, Rate Confirmation, photos, check call logs
- Interview dispatcher and AE who handled the load
- Review GPS tracking data and communication records

### Step 2: Carrier/Shipper Notification (48-72 hours)
- Notify the disputing party in writing (email)
- Provide SRL's position with supporting documentation
- Request their documentation within 15 business days

### Step 3: Negotiation (1-4 weeks)
- Attempt good-faith resolution
- Common settlements: split the difference, partial credit, service credit
- Document all negotiation communications

### Step 4: Escalation (if unresolved after 30 days)
- Escalate to CEO for review
- Consider mediation through TIA (Transportation Intermediaries Association)
- Last resort: Legal action or arbitration

## Financial Controls
- All dispute settlements over $500 require Operations Manager approval
- All dispute settlements over $2,000 require CEO approval
- Maintain dispute log in TMS (/dashboard/claims)
- Monthly dispute report reviewed in management meeting`,
  },

  {
    title: "Customer Portal & EDI Integration Guide",
    category: "Operations",
    version: "1.0",
    author: "Wasih Haider",
    description: "Setup and management of customer EDI connections (204/990/214/210) and shipper portal onboarding procedures.",
    pages: 8,
    content: `# Customer Portal & EDI Integration Guide

## Purpose

This SOP covers setting up shipper portal access and EDI connections for customers integrating with SRL's TMS.

## Shipper Portal Setup

### Portal Features Available to Shippers
1. Dashboard: shipment overview, active loads, delivery status
2. Shipments: create, track, and manage freight orders
3. Invoices: view, download, and dispute invoices
4. Analytics: spend analysis, on-time performance, lane history
5. Documents: BOL, POD, rate confirmations, insurance certificates
6. Messaging: direct communication with SRL team
7. Tracking: real-time GPS tracking with ETA
8. Quote: instant rate quotes on primary lanes

### Portal Onboarding Steps
1. Customer agreement signed with portal access clause
2. AE creates Customer record in CRM with billing details
3. Customer registers at silkroutelogistics.ai/shipper/register
4. System auto-links registration to Customer record via email match
5. AE verifies access and walks customer through portal features
6. First shipment created through portal with AE supervision

## EDI Integration

### Supported Transaction Types
- **EDI 204** (Motor Carrier Load Tender): Shipper sends load request to SRL
- **EDI 990** (Response to Load Tender): SRL accepts/declines the tender
- **EDI 214** (Shipment Status): SRL sends real-time status updates to shipper
- **EDI 210** (Motor Carrier Freight Details): SRL sends invoice to shipper

### EDI Setup Process
1. Customer provides: EDI provider name, ISA/GS identifiers, communication method (AS2/SFTP/VAN)
2. SRL IT configures mapping in /dashboard/edi
3. Test transactions sent in both directions (minimum 3 round-trips)
4. Production cutover after both parties validate test data
5. Monitor first 10 production transactions for errors

### EDI Troubleshooting
- 997 Functional Acknowledgment failures: check ISA envelope formatting
- Mapping errors: verify field positions match partner's specification
- Duplicate transactions: check for ISA control number reuse
- Missing segments: validate mandatory fields are populated

## API Integration (Alternative to EDI)
- REST API available at api.silkroutelogistics.ai
- Documentation at /api/docs
- API keys issued per customer (Settings → Integrations)
- Rate limits: 100 requests/minute per API key
- Webhooks available for real-time event notifications`,
  },

  {
    title: "Rate Engine & Pricing Methodology",
    category: "Finance",
    version: "1.0",
    author: "Wasih Haider",
    description: "How SRL calculates freight rates, sets margin targets, and benchmarks against market data for competitive pricing.",
    pages: 8,
    content: `# Rate Engine & Pricing Methodology

## Purpose

This SOP defines how SRL calculates freight rates, maintains margin targets, and uses market intelligence for competitive pricing.

## Rate Calculation Framework

### Customer Rate (Sell Side)
1. Base rate: Historical lane average from Rate Intelligence (/dashboard/market)
2. Equipment premium: Reefer +15-25%, Flatbed +10-20%, Specialized +25-40%
3. Seasonal adjustment: Peak (Oct-Dec) +8-15%, Produce season (Apr-Jul) varies by lane
4. Urgency premium: Same-day +30-50%, Next-day +15-25%
5. Volume discount: 10+ loads/month -3-5%, 50+ loads/month -5-8%
6. Contract rate: Locked rate for committed volume (minimum 90 days)

### Carrier Rate (Buy Side)
1. Target: Customer rate minus target margin
2. Minimum margins by equipment type:
   - Dry Van FTL: 12% minimum, 18% target
   - Reefer FTL: 14% minimum, 20% target
   - Flatbed: 15% minimum, 22% target
   - LTL: 20% minimum, 28% target
   - Expedited: 18% minimum, 25% target

### Accessorial Pricing
- Detention (after 2hr free time): $75/hour
- Lumper: Pass-through at cost + $25 admin fee
- TONU (Truck Ordered Not Used): $250-500 depending on distance traveled
- Layover: $300/day
- Driver assist: $50-100 per stop
- Inside delivery: $75-150
- Lift gate: $50-75
- Residential delivery: $75-100

## Market Intelligence Sources
1. SRL Rate Intelligence (/dashboard/market) — historical lane data from SRL's own loads
2. DAT RateView — national benchmark data (when available)
3. Contract rates on file (/dashboard/contract-rates) — customer-specific locked rates
4. Routing Guide (/dashboard/routing-guide) — carrier-specific negotiated rates per lane

## Margin Protection Rules
1. Never book below minimum margin without Operations Manager approval
2. If margin drops below 8% on any load, flag for review
3. Monthly margin report reviewed by CEO (target: 15% blended across all loads)
4. Negative margin loads require CEO approval and documented justification
5. Track margin by: lane, customer, carrier, equipment type, time period`,
  },

  {
    title: "Carrier Communication & Escalation Protocol",
    category: "Operations",
    version: "1.0",
    author: "Wasih Haider",
    description: "Standard procedures for carrier check calls, problem escalation, and suspension/termination of carrier relationships.",
    pages: 10,
    content: `# Carrier Communication & Escalation Protocol

## Purpose

This SOP defines how SRL communicates with carriers throughout the load lifecycle, handles problems, and manages carrier relationship escalations.

## Check Call Schedule

### Standard Loads
- 2 hours before pickup: Confirm driver en route, ETA
- At pickup: Confirm loaded, count, seal number
- Every 4 hours in transit: Location, ETA, any issues
- 2 hours before delivery: Confirm ETA, appointment status
- At delivery: Confirm delivered, get POD

### High-Value/Time-Critical Loads
- Every 2 hours in transit
- Immediate notification of any delay
- GPS tracking required (real-time, not just check calls)

### Temperature-Controlled Loads
- Every 2 hours in transit
- Temperature reading required at each check call
- Immediate notification if temperature deviates from range

## Check Call Process
1. Call carrier dispatch number on file
2. If no answer: wait 15 minutes, call again
3. If no answer after 2 attempts: send SMS via OpenPhone
4. If no response after 30 minutes: escalate to Operations Manager
5. Log every check call in TMS (/carrier-calls)

## Problem Escalation Matrix

### Level 1 — Dispatcher Handles
- Minor delays (under 2 hours)
- Equipment substitution (same class)
- Driver swap (carrier's decision)
- Address corrections

### Level 2 — Operations Manager
- Delays over 2 hours
- Carrier no-show (30+ min late to pickup)
- Temperature excursion on reefer loads
- Equipment mismatch
- Driver behavior complaints

### Level 3 — CEO/VP Operations
- Carrier goes dark (no contact for 4+ hours with load in transit)
- Suspected cargo theft or diversion
- Accidents or injuries
- Double-brokering discovered
- Customer threatening to leave due to service failure

## Carrier Suspension Triggers
- Authority revoked or suspended by FMCSA
- Insurance lapse exceeding 24 hours
- Out-of-service order
- 2+ cargo claims within 90 days
- Scorecard below 75 for 4 consecutive weeks
- Confirmed double-brokering (permanent ban)
- Driver safety violation (DUI, reckless driving)
- Failure to respond to 3+ consecutive check calls

## Suspension Process
1. Carrier flagged in TMS — no new tenders sent
2. Written notification via email within 24 hours
3. Allow carrier to respond within 5 business days
4. Review response and make final determination
5. If reinstated: 30-day probationary period with enhanced monitoring
6. If terminated: remove from all routing guides, update Compass status`,
  },

  {
    title: "Shipper Complaint & Service Recovery",
    category: "Sales",
    version: "1.0",
    author: "Wasih Haider",
    description: "Process for handling shipper complaints, measuring satisfaction, and executing service recovery to retain customers.",
    pages: 6,
    content: `# Shipper Complaint & Service Recovery

## Purpose

This SOP defines how SRL handles shipper complaints, measures customer satisfaction, and recovers from service failures to retain customers.

## Complaint Categories & Response Times
- Service failure (late pickup/delivery): Acknowledge within 1 hour, resolve within 24 hours
- Billing dispute: Acknowledge within 4 hours, resolve within 5 business days
- Communication failure: Acknowledge within 2 hours, resolve within 24 hours
- Cargo damage/loss: Acknowledge within 1 hour, begin claims process immediately
- General feedback: Acknowledge within 4 hours

## Service Recovery Process

### Step 1: Acknowledge (within 1 hour)
- AE calls customer directly (not email for serious issues)
- Acknowledge the problem without making excuses
- Express commitment to resolve

### Step 2: Investigate (within 4 hours)
- Review check call logs, GPS data, carrier communications
- Identify root cause
- Document findings in TMS

### Step 3: Resolve (within 24 hours)
- Provide customer with explanation and corrective action
- Offer service recovery (see below)
- Implement preventive measures

### Service Recovery Options (AE Authority)
- Rate credit on next shipment: up to 5% (AE authority)
- Rate credit on next shipment: 5-15% (Operations Manager approval)
- Free shipment: (CEO approval only)
- Goodwill gift: SRL branded items (AE authority)
- Dedicated account review meeting (always offer)

### Step 4: Follow-Up (48-72 hours)
- AE calls customer to confirm satisfaction
- Document resolution in CRM
- Update carrier scorecard if carrier was at fault

## Customer Satisfaction Measurement
- Post-delivery survey: automated email after every 10th load
- Quarterly Business Review: scheduled with all customers doing 10+ loads/month
- Net Promoter Score: tracked monthly (target: NPS > 50)
- Complaint rate: target < 2% of total loads`,
  },

  {
    title: "Financial Controls & Fraud Prevention",
    category: "Compliance",
    version: "1.0",
    author: "Wasih Haider",
    description: "Controls for preventing double-brokering, payment fraud, and ensuring financial integrity of all freight transactions.",
    pages: 10,
    content: `# Financial Controls & Fraud Prevention

## Purpose

This SOP establishes financial controls to prevent fraud, double-brokering, and ensure the integrity of all SRL transactions.

## Double-Brokering Prevention

### Red Flags at Booking
1. Carrier MC# less than 6 months old with no equipment
2. Carrier wants to use a different MC# than what's on file
3. Carrier cannot provide driver name/phone at time of booking
4. Rate accepted is significantly below market (carrier may plan to re-broker)
5. Carrier asks for rate confirmation to be sent to a different email
6. Google Maps shows carrier's address is a residential location or virtual office
7. Carrier has no website, social media, or online presence
8. Multiple carriers calling from the same phone number

### Prevention Measures
1. Compass vetting: 29-point automated check before any load assignment
2. Driver verification: Name and phone must match carrier's dispatch records
3. GPS tracking: Real-time tracking via ELD integration (no manual updates accepted for first 5 loads)
4. Check calls: Verify driver directly (not just carrier dispatch)
5. Seal integrity: Seal number recorded at pickup, verified at delivery
6. No rate confirmation forwarding: RC is between SRL and the carrier only

### If Double-Brokering Suspected
1. Immediately contact driver directly
2. Verify who the driver believes their employer is
3. If confirmed double-brokering:
   - Suspend carrier permanently in TMS
   - Notify shipper
   - File complaint with FMCSA
   - Report to CarrierWatchDog/Highway
   - Consider legal action for breach of contract

## Payment Fraud Prevention

### Carrier Payment Verification
1. Bank details verified against carrier's W-9 name (no third-party accounts)
2. Any bank detail change requires:
   - Written request from authorized carrier contact
   - Verbal confirmation via phone call to number on file (NOT the number in the change request)
   - 5 business day hold before processing payments to new account
3. QuickPay requests verified against completed loads with signed POD

### Shipper Credit Controls
1. Credit application required before first load (no exceptions)
2. D&B report or 3 trade references required for credit over $10,000
3. Credit limits reviewed quarterly
4. Past-due accounts: hold all new loads until payment received (61+ days)
5. New customers: first 3 loads on prepay or COD

## Internal Controls
- Segregation of duties: person creating invoice cannot approve payment
- All payments over $5,000 require dual approval
- Monthly bank reconciliation by CEO
- Quarterly review of all carrier banking changes
- Annual review of all vendor relationships for conflicts of interest`,
  },

  {
    title: "Reporting & Performance Analytics Guide",
    category: "Operations",
    version: "1.0",
    author: "Wasih Haider",
    description: "KPI definitions, dashboard usage guide, and carrier/customer scorecard methodology for management reporting.",
    pages: 8,
    content: `# Reporting & Performance Analytics Guide

## Purpose

This SOP defines the KPIs, dashboards, and reporting cadences used to manage SRL's operations and make data-driven decisions.

## Key Performance Indicators (KPIs)

### Load Performance
- On-Time Pickup %: Target 95%+ (loads picked up within 1 hour of appointment)
- On-Time Delivery %: Target 95%+ (loads delivered within 1 hour of appointment)
- Claims Rate: Target < 0.5% of total loads
- TONU Rate: Target < 2% of total loads
- Load-to-Book Ratio: Target 3:1 or better (loads posted vs. loads booked)

### Financial Performance
- Gross Margin %: Target 15% blended (FTL 12-18%, LTL 20-28%)
- Revenue per Load: Track monthly trend
- Days Sales Outstanding (DSO): Target < 35 days
- Carrier Payment Cycle: Standard Net 30, QuickPay Net 3
- Bad Debt Rate: Target < 0.5% of revenue

### Carrier Performance (Scorecard)
- On-Time Pickup: 20% of score
- On-Time Delivery: 25% of score
- Communication/Check Calls: 15% of score
- Claim Ratio: 15% of score (inverted — lower is better)
- Document Timeliness: 10% of score
- Acceptance Rate: 10% of score
- GPS Compliance: 5% of score

### Customer Performance
- Shipment Volume: monthly trend
- Revenue per Customer: monthly trend
- Payment Timeliness: DSO per customer
- Complaint Rate: per customer
- Growth Rate: quarter-over-quarter

## Dashboard Guide

### Overview Dashboard (/dashboard/overview)
- Daily: active loads, pending pickups, in-transit, delivered today
- Weekly: revenue, margin, load count, carrier utilization
- Alerts: compliance issues, insurance expirations, overdue payments

### Market Intelligence (/dashboard/market)
- Lane rate trends (30/60/90 day)
- Regional capacity indicators
- Seasonal adjustment factors

### Carrier Scorecards (/dashboard/scorecard)
- Individual carrier performance over time
- Tier progression tracking
- Comparison against fleet averages

### Financial Reports (/accounting/reports)
- Weekly: cash flow, AR aging, carrier payments due
- Monthly: P&L by lane, customer, carrier
- Quarterly: business review metrics for customer meetings

## Reporting Cadence
- Daily standup: review active loads, exceptions, escalations (10 min)
- Weekly review: KPI dashboard walkthrough, pipeline update (30 min)
- Monthly management: financial review, scorecard trends, growth metrics (60 min)
- Quarterly board: strategic review, market positioning, customer growth (90 min)`,
  },

  {
    title: "Technology & System Management",
    category: "Operations",
    version: "1.0",
    author: "Wasih Haider",
    description: "TMS user roles, data management, integration maintenance, and system administration procedures.",
    pages: 8,
    content: `# Technology & System Management

## Purpose

This SOP covers the administration of SRL's Transportation Management System (TMS), user access, data management, and third-party integrations.

## TMS User Roles & Permissions

### Role Hierarchy
1. CEO: Full access to all modules including financial controls and system settings
2. ADMIN: Full access except system-level configuration changes
3. BROKER (Account Executive): Load management, carrier matching, customer management, invoicing
4. DISPATCH: Load tracking, carrier communication, status updates
5. OPERATIONS: Compliance, carrier vetting, exception management, SOPs
6. ACCOUNTING: Invoicing, payments, financial reports, credit management
7. READONLY: View-only access to dashboards and reports

### User Onboarding
1. IT admin creates user account with appropriate role
2. User receives email with temporary password
3. User completes OTP verification on first login
4. User sets permanent password (10+ chars, complexity required)
5. User configures TOTP 2FA (recommended for all employees, required for ADMIN/CEO)
6. 30-day password expiry for first password, 60-day thereafter

### User Offboarding
1. Disable account immediately upon termination notification
2. Revoke all active sessions
3. Audit recent activity for the past 30 days
4. Transfer any assigned loads/customers to replacement user
5. Archive user data per retention policy

## Data Management

### Backup & Recovery
- Database: Neon PostgreSQL with automated daily backups
- Retention: 30 days of point-in-time recovery
- RPO (Recovery Point Objective): 1 hour
- RTO (Recovery Time Objective): 4 hours

### Data Retention Schedule
- Load records: 7 years (DOT requirement)
- Financial records: 7 years (IRS requirement)
- Carrier compliance documents: 5 years after relationship ends
- Communication logs: 3 years
- Audit trails: 5 years
- User activity logs: 2 years

## Integration Maintenance

### Active Integrations
- Resend (email service): API key rotation every 90 days
- OpenPhone (phone/SMS): Webhook health monitored daily
- Google Maps (mileage/geocoding): API key quota monitored weekly
- FMCSA SAFER (carrier verification): API availability checked hourly
- Neon PostgreSQL (database): Connection pooling monitored

### Integration Health Monitoring
- /admin/monitoring dashboard shows integration status
- Automated alerts for: API key expiry, webhook failures, connection timeouts
- Monthly review of all integration usage and costs

## Security Practices
- All API communications over HTTPS (TLS 1.3)
- Sensitive data encrypted at rest (AES-256-GCM)
- Session management: 30-min timeout (employees), 60-min (shippers)
- Rate limiting: 100 req/min per user
- OWASP Top 10 compliance: XSS, CSRF, SQL injection protections
- Sentry error tracking for production issues
- Quarterly security review by development team`,
  },

  {
    title: "Regulatory Compliance & License Maintenance",
    category: "Compliance",
    version: "1.0",
    author: "Wasih Haider",
    description: "MC# renewal, BOC-3 maintenance, surety bond management, and federal/state regulatory requirements for freight brokers.",
    pages: 10,
    content: `# Regulatory Compliance & License Maintenance

## Purpose

This SOP ensures SRL maintains all required federal and state licenses, bonds, and registrations to operate as a freight broker.

## Federal Requirements

### FMCSA Broker Authority (MC# 01794414)
- MC authority must remain ACTIVE at all times
- No renewal required (authority is perpetual once granted)
- Must maintain active BMC-84 surety bond or BMC-85 trust fund
- Authority can be revoked for: bond cancellation, fraud, pattern of violations

### Surety Bond (BMC-84)
- Minimum: $75,000 (as of 2013 MAP-21 Act)
- Current bond must be on file with FMCSA at all times
- Bond company must file cancellation notice 30 days before termination
- If bond cancelled: immediately seek replacement (SRL has 30 days to file new bond before authority revoked)
- Annual premium payment: tracked in accounting, auto-reminder 60 days before renewal
- Bond number and surety company on file in /dashboard/compliance

### Process Agent (BOC-3)
- BOC-3 filing designates process agents in all states where SRL operates
- Must remain current and on file with FMCSA
- Update if process agent company changes
- Verify annually that all state designations are active

### Unified Carrier Registration (UCR)
- Annual registration required for brokers operating in interstate commerce
- Registration period: October 1 - September 30
- Must register before January 1 each year
- Fees based on previous year's revenue bracket
- Maintain proof of registration in compliance files

## DOT Number (4526880)
- DOT# required for all interstate motor carriers and brokers
- Biennial update required (MCS-150 form): verify every 2 years
- Update within 30 days of any change: name, address, operations type
- SRL's MCS-150 due date tracked in /dashboard/compliance

## State Requirements
- Michigan: Business registration active with Secretary of State
- Other states: no state-specific broker license required (federal authority covers all states)
- However, if SRL operates any owned vehicles: state-specific requirements apply per operating state

## Insurance Requirements (SRL Corporate)
- General liability: $1,000,000 minimum
- Professional liability (E&O): $1,000,000 recommended for freight brokers
- Workers' compensation: as required by Michigan law
- Cyber liability: recommended given TMS and customer data

## Compliance Calendar
- January: UCR registration renewal
- Quarterly: review bond status, insurance certificates
- Biennial: MCS-150 update
- Monthly: FMCSA SAFER system check for SRL's own authority status
- Weekly: carrier compliance scanning for active carrier network

## Record Keeping
- All compliance documents stored in /dashboard/compliance
- Physical copies maintained in secure filing cabinet at office
- Digital backup in cloud storage (encrypted)
- Retention: permanent for authority documents, 7 years for financial compliance`,
  },
];

async function main() {
  console.log("Seeding enterprise SOPs...");

  for (const sop of ENTERPRISE_SOPS) {
    const existing = await prisma.sOP.findFirst({ where: { title: sop.title } });
    if (existing) {
      await prisma.sOP.update({ where: { id: existing.id }, data: sop });
      console.log(`  Updated: ${sop.title}`);
    } else {
      await prisma.sOP.create({ data: sop });
      console.log(`  Created: ${sop.title}`);
    }
  }

  console.log(`Done — ${ENTERPRISE_SOPS.length} enterprise SOPs seeded.`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
