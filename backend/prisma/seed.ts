import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Clean existing data
  await prisma.complianceAlert.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.customerContact.deleteMany();
  await prisma.eDITransaction.deleteMany();
  await prisma.notification.deleteMany();
  await prisma.message.deleteMany();
  await prisma.loadTender.deleteMany();
  await prisma.carrierBonus.deleteMany();
  await prisma.carrierScorecard.deleteMany();
  await prisma.document.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.load.deleteMany();
  await prisma.carrierProfile.deleteMany();
  await prisma.brokerIntegration.deleteMany();
  await prisma.shipment.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.equipment.deleteMany();
  await prisma.truck.deleteMany();
  await prisma.trailer.deleteMany();
  await prisma.sOP.deleteMany();
  await prisma.user.deleteMany();

  const hash = await bcrypt.hash("W3lcome2SRL26!!", 12);

  // Single admin account
  await prisma.user.create({
    data: {
      email: "whaider@silkroutelogistics.ai",
      passwordHash: hash,
      firstName: "Wasi",
      lastName: "Haider",
      company: "Silk Route Logistics",
      role: UserRole.ADMIN,
      isVerified: true,
      phone: "(269) 555-0100",
    },
  });

  // Account Executive — Noor
  await prisma.user.create({
    data: {
      email: "noor@silkroutelogistics.ai",
      passwordHash: hash,
      firstName: "Noor",
      lastName: "Ahmed",
      company: "Silk Route Logistics",
      role: UserRole.BROKER,
      isVerified: true,
      phone: "(269) 555-0101",
    },
  });

  // Carrier account with profile
  const carrierUser = await prisma.user.create({
    data: {
      email: "carrier@silkroutelogistics.ai",
      passwordHash: hash,
      firstName: "SRL",
      lastName: "Carrier",
      company: "SRL Transport LLC",
      role: UserRole.CARRIER,
      isVerified: true,
      phone: "(269) 555-0200",
    },
  });

  await prisma.carrierProfile.create({
    data: {
      userId: carrierUser.id,
      mcNumber: "MC-1234567",
      dotNumber: "3456789",
      tier: "PLATINUM",
      equipmentTypes: ["Dry Van", "Reefer", "Flatbed"],
      operatingRegions: ["Midwest", "Northeast", "Southeast", "Southwest", "West Coast", "South Central"],
      onboardingStatus: "APPROVED",
      approvedAt: new Date(),
      w9Uploaded: true,
      insuranceCertUploaded: true,
      authorityDocUploaded: true,
      insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      safetyScore: 98,
      address: "1000 Logistics Pkwy",
      city: "Kalamazoo",
      state: "MI",
      zip: "49001",
      numberOfTrucks: 25,
    },
  });

  // ═══════════════════════════════════════════════
  // INDUSTRY-STANDARD SOPs
  // ═══════════════════════════════════════════════

  await prisma.sOP.createMany({
    data: [
      // ── OPERATIONS ──────────────────────────────
      {
        title: "Standard Freight Operations Manual",
        category: "operations",
        version: "3.0",
        author: "Wasih Haider",
        pages: 24,
        description: "Comprehensive guide covering end-to-end freight brokerage operations including load booking, dispatch, tracking, delivery confirmation, and post-delivery processes.",
        content: `1. LOAD LIFECYCLE MANAGEMENT
1.1 Load Entry & Validation — All loads must include: origin/destination with full address, pickup/delivery windows (date + 2-hour window), equipment type, weight, commodity description, rate, and shipper contact.
1.2 Load Posting — Posted loads appear on the Load Board within 30 seconds. Reference numbers follow SRL-YYYYMMDD-XXXX format. All posted loads require minimum $1M cargo insurance.
1.3 Carrier Assignment — Tender loads to qualified carriers matching equipment type, region, and tier requirements. Platinum/Gold carriers receive priority. Tender expiry: 24 hours standard, 4 hours for urgent.
1.4 Dispatch — Confirm driver name, phone, truck/trailer numbers. Send dispatch confirmation to shipper within 1 hour of booking. Verify driver has BOL copy and delivery instructions.
1.5 In-Transit Monitoring — GPS check-ins every 2 hours minimum. Proactive ETA updates to shipper at: pickup, midpoint, and 2 hours before delivery. Escalation for 30+ min late: notify AE → Dispatch Manager.
1.6 Delivery & POD — Driver must obtain signed POD (Proof of Delivery) at destination. POD uploaded within 4 hours of delivery. Any exceptions (shortages, damage, refusal) documented immediately.
1.7 Load Completion — Status updated to COMPLETED after POD verification. Invoice generated within 24 hours. Carrier performance scored within 48 hours.

2. RATE MANAGEMENT
2.1 Spot Rates — Check DAT/Truckstop for lane averages. Markup: 12-18% standard, 8-12% for contract shippers.
2.2 Contract Rates — Reviewed quarterly. Mini-bid process for lanes >10 loads/month. Rate lock periods: 30/60/90 days.
2.3 Accessorial Charges — Detention: $75/hr after 2-hour free time. Lumper: pass-through + $25 admin fee. TONU: $350 flat. Layover: $350/day.

3. EXCEPTION HANDLING
3.1 Service Failures — Late pickup/delivery: document cause, notify customer immediately, file carrier scorecard deduction.
3.2 Claims Process — Report within 24 hours. Carrier liable per Carmack Amendment. SRL claim deductible: $250. Maximum claim: lesser of invoice value or $100,000.
3.3 Load Cancellations — Shipper cancel >24hrs: no charge. <24hrs: $150 admin fee. <2hrs/at pickup: full TONU.

4. DOCUMENT RETENTION
BOLs, PODs, rate confirmations: 7 years. Carrier packets: duration of relationship + 3 years. Compliance records: per FMCSA requirements.

Last revised: ${new Date().toISOString().split("T")[0]} | Next review: Quarterly | Owner: Operations Manager`,
      },
      {
        title: "Temperature-Controlled Freight Procedures",
        category: "operations",
        version: "2.1",
        author: "Wasih Haider",
        pages: 12,
        description: "SOPs for handling refrigerated (reefer) and frozen freight, including pre-cool requirements, continuous temp monitoring, and chain-of-custody documentation per FDA FSMA regulations.",
        content: `1. EQUIPMENT REQUIREMENTS
1.1 All reefer units must be 2019 or newer with functioning data loggers (Carrier/Thermo King).
1.2 Pre-cool verification: unit must reach target temp ≥2 hours before pickup. Driver provides pre-cool printout.
1.3 Fuel level: minimum 75% at pickup for loads >300 miles.

2. TEMPERATURE CLASSIFICATIONS
- Frozen: -10°F to 0°F (ice cream, frozen meals, seafood)
- Deep Frozen: -20°F to -10°F (specialty items)
- Refrigerated: 33°F to 40°F (fresh produce, dairy, meat)
- Cool: 45°F to 55°F (chocolate, pharmaceuticals, wine)
- Controlled Room Temp: 59°F to 77°F (certain pharma, cosmetics)

3. MONITORING & COMPLIANCE
3.1 Continuous temp logging every 15 minutes (FDA FSMA requirement).
3.2 Driver check: verify temp display every fuel stop, minimum every 4 hours.
3.3 Alarm thresholds: ±3°F from target → driver notification. ±5°F → dispatch + shipper alert.
3.4 Receiver temp check at delivery — must be within ±2°F of BOL specification.

4. REJECTION PROTOCOL
If receiver rejects load due to temp: driver does NOT leave facility. Contact dispatch immediately. Document: photos of temp readout, receiver signature on rejection form, download reefer data log.

5. DOCUMENTATION
BOL must state: commodity, required temp range, pre-cool temp at loading, continuous monitoring printout attached to POD.

Last revised: ${new Date().toISOString().split("T")[0]} | Next review: Semi-annually | Regulatory basis: FDA 21 CFR Part 1, Subpart O (FSMA)`,
      },
      {
        title: "Hazmat Freight Handling Protocol",
        category: "operations",
        version: "1.4",
        author: "Wasih Haider",
        pages: 16,
        description: "Procedures for booking, tendering, and monitoring hazardous materials shipments in compliance with 49 CFR Parts 171-180, including placarding, driver certification, and routing requirements.",
        content: `1. PRE-BOOKING VERIFICATION
1.1 Confirm hazmat class, UN number, proper shipping name, packing group.
1.2 Verify carrier has hazmat authority (MC authority + hazmat endorsement).
1.3 Driver must have current CDL with HME (Hazmat Endorsement) — verify expiry date.
1.4 Confirm insurance: minimum $5M combined single limit for most hazmat classes.

2. HAZMAT CLASSES
- Class 1: Explosives (not accepted)
- Class 2: Gases (2.1 flammable, 2.2 non-flammable, 2.3 toxic)
- Class 3: Flammable Liquids (most common — paints, adhesives, fuels)
- Class 4: Flammable Solids
- Class 5: Oxidizers & Organic Peroxides
- Class 6: Toxic & Infectious Substances
- Class 7: Radioactive (not accepted)
- Class 8: Corrosives (batteries, acids)
- Class 9: Miscellaneous (lithium batteries, dry ice, magnetized material)

3. PLACARDING REQUIREMENTS (49 CFR 172.504)
Driver responsible for proper placards. Broker verifies placard type matches BOL hazmat class. Four-sided placarding required for >1,001 lbs of single hazmat class.

4. ROUTING
Highway Routing (49 CFR 397): avoid tunnels, densely populated areas. Use FMCSA Hazmat Route Registry. Driver must have printed route plan.

5. EMERGENCY
Carrier must have 24/7 emergency contact. CHEMTREC: 1-800-424-9300. Incident: call 911, then dispatch, then shipper.

Last revised: ${new Date().toISOString().split("T")[0]} | Regulatory basis: 49 CFR 171-180 | Owner: Compliance Officer`,
      },
      {
        title: "Flatbed & Oversized Load Procedures",
        category: "operations",
        version: "1.2",
        author: "Wasih Haider",
        pages: 10,
        description: "Load securement standards for flatbed, step deck, and lowboy shipments per FMCSA 49 CFR Part 393, including tarping requirements, chain/strap specifications, and oversize/overweight permit coordination.",
        content: `1. LOAD SECUREMENT (49 CFR 393.100-136)
1.1 Minimum working load limit (WLL): aggregate must equal 50% of cargo weight.
1.2 Tie-down requirements: minimum 2 tie-downs for <5ft articles, +1 for each additional 10ft.
1.3 Chain grades: Grade 70+ for direct tie-down. Grade 43+ for indirect (choker).
1.4 Strap condition: no cuts, burns, or knots. Replace at 10% WLL reduction.

2. TARPING
2.1 Lumber, steel coils (customer request): full tarp coverage, smoke tarp acceptable for steel.
2.2 Tarping upcharge: $50-150 depending on commodity and coverage requirement.
2.3 Driver confirms tarp condition and securement before departure.

3. OVERSIZED LOADS (>8'6" wide, >13'6" high, >53' long, >80,000 lbs)
3.1 Permit coordination: broker obtains permits 48+ hours in advance via state DOT portals.
3.2 Escort/pilot car requirements vary by state — verify for each state in route.
3.3 Travel restrictions: typically sunrise to sunset, no weekends/holidays for >12' wide.

4. STEP DECK / LOWBOY SPECIFICS
Step deck: max height 10' on well, 8'6" on deck. Lowboy: confirm bridge clearances for entire route. RGN (Removable Gooseneck): required for non-drive-on cargo.

Last revised: ${new Date().toISOString().split("T")[0]} | Regulatory basis: 49 CFR 393 | Owner: Operations Manager`,
      },

      // ── SAFETY ──────────────────────────────────
      {
        title: "Driver Safety & Pre-Trip Inspection Manual",
        category: "safety",
        version: "2.0",
        author: "Wasih Haider",
        pages: 14,
        description: "Pre-trip/post-trip inspection checklist, accident procedures, CSA score management, and Hours of Service compliance per FMCSA regulations (49 CFR 395-396).",
        content: `1. PRE-TRIP INSPECTION (49 CFR 396.13)
1.1 REQUIRED BEFORE EVERY TRIP — driver must inspect and document:
□ Engine compartment: oil, coolant, belts, hoses, leaks
□ Cab: mirrors, windshield (no cracks >3/4"), wipers, horn, gauges
□ Lights: headlights, taillights, brake lights, turn signals, clearance lights, reflectors
□ Tires: minimum 4/32" tread (steer), 2/32" (drive/trailer). No bulges, cuts, or exposed cord. Proper inflation (±5 PSI of sidewall rating)
□ Brakes: pushrod stroke within limits, no air leaks, slack adjusters
□ Coupling: fifth wheel locked, kingpin engaged, airlines connected, no air leaks
□ Trailer: doors secure, seals intact, load secured
□ Safety equipment: fire extinguisher (ABC rated, charged), reflective triangles (3), spare fuses

1.2 Deficiencies found → repair before departure. If safety-critical, vehicle is OUT OF SERVICE until repaired.

2. HOURS OF SERVICE (49 CFR 395)
- 11-hour driving limit after 10 consecutive hours off duty
- 14-hour on-duty window (non-extendable)
- 30-minute break required after 8 hours driving
- 60/70-hour weekly limit (7/8-day rolling period)
- 34-hour restart: must include two 1:00-5:00 AM periods
- ELD required — no paper logs except for exemptions (short-haul <150 air-miles)

3. ACCIDENT PROCEDURE
3.1 Stop. Secure scene. Call 911. Check for injuries.
3.2 Do NOT admit fault. Exchange info: other driver license, insurance, plate numbers, witnesses.
3.3 Photos: all vehicles (all angles), road conditions, traffic signs, injuries, cargo damage.
3.4 Contact dispatch within 15 minutes: (269) 555-0102.
3.5 Drug/alcohol post-accident testing required if: fatality, OR tow-away + citation, OR injury requiring medical transport + citation.

4. CSA (Compliance, Safety, Accountability)
Monitored BASIC categories: Unsafe Driving, HOS, Vehicle Maintenance, Controlled Substances, Hazmat, Driver Fitness, Crash Indicator. Target: all BASICs below intervention threshold.

Last revised: ${new Date().toISOString().split("T")[0]} | Next review: Annually | Regulatory basis: 49 CFR 390-399`,
      },
      {
        title: "Workplace Safety & OSHA Compliance",
        category: "safety",
        version: "1.1",
        author: "Wasih Haider",
        pages: 8,
        description: "Office and warehouse safety procedures, ergonomics, fire evacuation plan, incident reporting, and OSHA recordkeeping requirements for a freight brokerage environment.",
        content: `1. GENERAL WORKPLACE SAFETY
1.1 Maintain clear walkways and emergency exits at all times.
1.2 Report all unsafe conditions to management immediately.
1.3 No horseplay, intoxication, or weapons on company premises.
1.4 PPE required in warehouse areas: steel-toe shoes, high-vis vest.

2. ERGONOMICS (Office Staff)
2.1 Monitor at eye level, 20-26 inches from face.
2.2 Chair: feet flat on floor, thighs parallel, lumbar support.
2.3 Keyboard: elbows at 90°, wrists neutral (no flexion/extension).
2.4 20-20-20 rule: every 20 minutes, look 20 feet away for 20 seconds.
2.5 Stretch breaks every 60 minutes.

3. FIRE SAFETY
3.1 Know all exits (posted evacuation maps at each exit).
3.2 Fire extinguisher locations: kitchen, server room, each exit hallway.
3.3 Evacuation: RACE — Rescue, Alarm, Contain, Evacuate. Assembly point: front parking lot by flagpole.
3.4 Fire drills: quarterly. Fire extinguisher inspection: monthly (tag check), annually (professional service).

4. INCIDENT REPORTING
4.1 ALL workplace injuries/illnesses reported within 24 hours — no exceptions.
4.2 OSHA 300 Log maintained by HR. Severe injuries (hospitalization, amputation, eye loss): OSHA notified within 24 hours. Fatality: within 8 hours.
4.3 Near-miss reports encouraged — no disciplinary action for reporting.

Last revised: ${new Date().toISOString().split("T")[0]} | Regulatory basis: OSHA 29 CFR 1910 | Owner: HR Manager`,
      },
      {
        title: "Cargo Claims & Loss Prevention",
        category: "safety",
        version: "1.3",
        author: "Wasih Haider",
        pages: 10,
        description: "Claims investigation workflow, Carmack Amendment liability framework, loss prevention best practices, and carrier chargeback procedures for freight damage, shortage, and theft.",
        content: `1. CLAIMS FILING TIMELINE
1.1 Shipper/receiver must report damage/shortage within 24 hours of delivery.
1.2 Written claim with documentation submitted within 9 months of delivery (Carmack statute).
1.3 Carrier has 30 days to acknowledge, 120 days to resolve.

2. DOCUMENTATION REQUIRED
□ Original BOL (signed, with notations if applicable)
□ Delivery receipt / POD (with exception notes)
□ Photographs of damaged freight (minimum 10 photos: overview + detail)
□ Commercial invoice showing value of goods
□ Repair estimate or replacement cost documentation
□ Carrier inspection report (if applicable)

3. LIABILITY FRAMEWORK (Carmack Amendment, 49 USC §14706)
3.1 Carrier is strictly liable for loss/damage during transport unless:
    - Act of God, public enemy, shipper's fault, inherent vice, or public authority
3.2 Released value: if BOL states released value, carrier liability is limited to that amount.
3.3 SRL policy: carriers must carry minimum $100K cargo insurance. Loads >$100K require excess coverage.

4. LOSS PREVENTION
4.1 High-value loads (>$50K): GPS tracking required, no-stop policy, team drivers preferred.
4.2 Theft hotspots: truck stops within 200 miles of origin, especially in CA, FL, TX, GA, NJ.
4.3 Double-brokering prevention: verify carrier MC# active on FMCSA, no "double broker" language in carrier agreement. Direct communication with assigned driver.
4.4 Seal integrity: numbered seals applied at origin, verified at delivery. Seal number on BOL.

Last revised: ${new Date().toISOString().split("T")[0]} | Next review: Annually | Owner: Claims Manager`,
      },

      // ── COMPLIANCE ──────────────────────────────
      {
        title: "Carrier Vetting & FMCSA Compliance",
        category: "compliance",
        version: "3.0",
        author: "Wasih Haider",
        pages: 18,
        description: "Carrier onboarding verification procedures: FMCSA authority validation, insurance verification, safety rating assessment, CSA score review, and ongoing monitoring requirements.",
        content: `1. CARRIER ONBOARDING REQUIREMENTS
Before any load is tendered, the carrier must have on file:
□ Active MC/DOT authority verified via FMCSA SAFER (mobile.fmcsa.dot.gov)
□ Operating status: AUTHORIZED (reject NOT AUTHORIZED, OUT OF SERVICE)
□ Insurance: $1M auto liability, $100K cargo (minimum). Certificates of Insurance (COI) with SRL as certificate holder.
□ W-9 (tax ID verification)
□ Signed Carrier-Broker Agreement (includes payment terms, indemnification, insurance requirements)
□ Safety Rating: SATISFACTORY or UNRATED acceptable. CONDITIONAL — case-by-case review. UNSATISFACTORY — rejected.

2. FMCSA VERIFICATION CHECKS
2.1 SAFER System: verify legal name, DBA, DOT#, MC#, operating status, insurance on file.
2.2 CSA Scores: review all 7 BASICs. Flag carriers with scores above 50th percentile in Unsafe Driving or HOS Compliance.
2.3 Inspection history: review last 24 months. OOS (Out-of-Service) rate >25% = rejected.
2.4 Crash history: fatal crashes in last 12 months = management review required.

3. ONGOING MONITORING
3.1 Insurance certificates: re-verified every 90 days. Auto-alert 30 days before expiry.
3.2 Authority status: weekly automated check against FMCSA database.
3.3 CSA scores: monthly review for active carriers.
3.4 Carrier scorecard: weekly internal scoring (on-time, communication, claims, documentation).

4. TIER QUALIFICATION
- Platinum (98+): priority tendering, 3% rate premium, weekly performance bonus
- Gold (95-97.9): standard priority, 1% rate premium
- Silver (90-94.9): standard tendering, no premium
- Bronze (<90): probationary, limited to 2 loads/week, quarterly review

5. DEACTIVATION TRIGGERS
- MC authority revoked or suspended
- Insurance lapse >24 hours
- OOS order from FMCSA
- 2+ valid cargo claims in 90 days
- Scorecard below 75 for 4 consecutive weeks
- Double-brokering violation (immediate, permanent)

Last revised: ${new Date().toISOString().split("T")[0]} | Next review: Quarterly | Regulatory basis: 49 CFR 387, FMCSA SAFER`,
      },
      {
        title: "DOT Audit Preparation & Records Retention",
        category: "compliance",
        version: "1.0",
        author: "Wasih Haider",
        pages: 12,
        description: "Preparation checklist for FMCSA compliance reviews and DOT audits, including required records, retention periods, and corrective action procedures per 49 CFR 371 (broker regulations).",
        content: `1. FMCSA BROKER REQUIREMENTS (49 CFR 371)
1.1 Broker authority (MC number) must be active and displayed.
1.2 Surety bond or trust fund: $75,000 minimum (BMC-84 bond or BMC-85 trust).
1.3 Process agent (BOC-3): must be on file and current in every state of operation.
1.4 Record of each transaction: maintain for minimum 3 years.

2. REQUIRED RECORDS
For each transaction, maintain:
□ Name and address of consignor (shipper), consignee, and carrier
□ Bill of lading or receipt
□ Copy of contract or rate confirmation
□ Proof of carrier's authority and insurance at time of dispatch
□ Record of any claims filed
□ Gross compensation received

3. RETENTION SCHEDULE
- Transaction records: 3 years minimum
- Carrier agreements: duration + 3 years
- Insurance certificates: 5 years
- Claims records: 7 years
- Financial records: 7 years (IRS requirement)
- Employee records: duration of employment + 5 years

4. AUDIT PREPARATION CHECKLIST
□ Verify BMC-84 bond is active and $75K+
□ BOC-3 current in all operating states
□ All carrier files complete (authority, insurance, W-9, agreement)
□ Sample 20 recent transactions — verify all records present
□ Review any open claims — ensure documented and within timeline
□ Confirm website displays MC number and DOT number
□ Employee roster with roles and qualifications current

5. CORRECTIVE ACTIONS
If deficiencies found: respond to FMCSA within 15 business days with corrective action plan. Implement and document corrections within 60 days. Follow-up audit may occur within 12 months.

Last revised: ${new Date().toISOString().split("T")[0]} | Regulatory basis: 49 CFR 371, 49 CFR 387 | Owner: Compliance Officer`,
      },

      // ── FINANCE ─────────────────────────────────
      {
        title: "Accounts Receivable & Invoicing Procedures",
        category: "finance",
        version: "2.0",
        author: "Wasih Haider",
        pages: 10,
        description: "End-to-end invoicing workflow from load completion to payment collection, including customer credit terms, aging management, and collections escalation procedures.",
        content: `1. INVOICING WORKFLOW
1.1 Invoice generated within 24 hours of POD receipt.
1.2 Invoice must include: invoice number, date, load reference, origin/destination, pickup/delivery dates, line-haul rate, accessorial charges, total amount due, payment terms, remit-to address.
1.3 Attachments: signed BOL, POD, rate confirmation.
1.4 Delivery: email to customer AP contact + upload to customer portal (if applicable).

2. PAYMENT TERMS
- Standard: Net 30
- Preferred customers (>$50K/month volume): Net 45
- New customers (<90 days): Net 15 or prepay (credit review pending)
- Quick Pay option: 2% discount for payment within 5 days

3. CREDIT MANAGEMENT
3.1 New customer credit application required before first load.
3.2 Credit check: D&B, trade references (minimum 3), bank reference.
3.3 Credit limits: set based on score — reviewed quarterly.
3.4 Credit hold: automatic at 120% of credit limit. No new loads until AR brought current.

4. AGING & COLLECTIONS
- 0-30 days: standard monitoring
- 31-45 days: automated reminder email
- 46-60 days: phone call from AR specialist
- 61-90 days: demand letter, credit hold, escalation to AE
- 91+ days: collections agency or legal action. Write-off requires VP approval.

5. CARRIER PAYMENTS
5.1 Standard: Net 30 from invoice receipt.
5.2 Quick Pay (factoring): 97% within 24 hours of approved invoice.
5.3 Deductions: document and communicate before payment. Never deduct without written carrier agreement.

Last revised: ${new Date().toISOString().split("T")[0]} | Next review: Annually | Owner: Controller`,
      },
      {
        title: "Factoring & Quick Pay Program",
        category: "finance",
        version: "1.2",
        author: "Wasih Haider",
        pages: 6,
        description: "Quick Pay factoring program terms, advance rates by carrier tier, fee schedules, and reconciliation procedures for accelerated carrier payment processing.",
        content: `1. PROGRAM OVERVIEW
Silk Route Logistics offers Quick Pay factoring to approved carriers, providing accelerated payment (24-48 hours) at a discount from the invoice face value.

2. ADVANCE RATES & FEES BY TIER
- Platinum carriers: 97% advance rate, 3% factoring fee
- Gold carriers: 96% advance rate, 4% factoring fee
- Silver carriers: 95% advance rate, 5% factoring fee
- Bronze carriers: 93% advance rate, 7% factoring fee

3. ELIGIBILITY
3.1 Carrier must be onboarded and approved (APPROVED status).
3.2 Clean delivery — no open claims or disputes on the load.
3.3 Complete documentation: signed POD, BOL, rate confirmation.
3.4 Invoice submitted through SRL portal (not email/fax).

4. PROCESS
4.1 Carrier submits invoice with POD via portal.
4.2 AR team verifies: POD matches BOL, no exceptions noted, rate matches confirmation.
4.3 Approved invoices funded next business day via ACH.
4.4 Remainder (holdback) released upon customer payment, minus fees.

5. RECONCILIATION
Monthly statement sent to carrier showing: invoices factored, advance amounts, fees withheld, holdback releases, net payments.

Last revised: ${new Date().toISOString().split("T")[0]} | Owner: Accounting Manager`,
      },

      // ── HR ──────────────────────────────────────
      {
        title: "Employee Onboarding & Training Program",
        category: "hr",
        version: "2.0",
        author: "Wasih Haider",
        pages: 14,
        description: "New hire onboarding process for all SRL roles including brokers, dispatchers, and operations staff. Covers orientation, TMS training, mentorship program, and 30-60-90 day performance milestones.",
        content: `1. PRE-START (Before Day 1)
1.1 Offer letter signed, background check cleared.
1.2 IT provisions: email account, TMS login, phone/headset, dual monitors.
1.3 Workspace prepared with SOP binder, company handbook, role-specific materials.
1.4 Mentor assigned (same role, 6+ months tenure).

2. WEEK 1: ORIENTATION
Day 1: Company overview, mission, org chart, HR paperwork (I-9, W-4, benefits enrollment).
Day 2: TMS platform training — navigating loads, customers, carriers, messaging.
Day 3: Industry fundamentals — freight modes, equipment types, lane geography, rate structures.
Day 4: Role-specific shadowing with mentor. Observe live customer/carrier calls.
Day 5: Practice scenarios in sandbox environment. End-of-week quiz (80% to pass).

3. WEEKS 2-4: GUIDED PRACTICE
2.1 Handle tasks under mentor supervision (increasing autonomy each week).
2.2 Broker trainees: book 5 loads with mentor oversight, attend carrier calls.
2.3 Dispatch trainees: dispatch 10 loads, handle 2 check-call cycles, process 5 PODs.
2.4 Weekly 1:1 with manager — review progress, questions, feedback.

4. 30-60-90 DAY MILESTONES
Day 30: Independent on core tasks, pass TMS proficiency test, handle routine customer inquiries.
Day 60: Full workload at 75% capacity. Know all SOPs for role. Build book of 10+ carrier relationships.
Day 90: Full performance capacity. Eligible for incentive program. Formal performance review.

5. ONGOING DEVELOPMENT
Monthly team training sessions. Annual industry conference attendance (TIA, TMSA). Quarterly role certification renewal.

Last revised: ${new Date().toISOString().split("T")[0]} | Owner: HR Director`,
      },
      {
        title: "Code of Conduct & Ethics Policy",
        category: "hr",
        version: "1.1",
        author: "Wasih Haider",
        pages: 8,
        description: "Professional conduct standards, anti-harassment policy, conflict of interest disclosure, confidentiality requirements, and disciplinary procedures for all SRL employees.",
        content: `1. PROFESSIONAL CONDUCT
1.1 Treat all customers, carriers, colleagues, and vendors with respect and professionalism.
1.2 Represent SRL honestly in all business dealings. No false claims about service capabilities or capacity.
1.3 Respond to all communications within 4 business hours.
1.4 Dress code: business casual (Mon-Thu), casual Friday. Client meetings: business professional.

2. ANTI-HARASSMENT & NON-DISCRIMINATION
2.1 Zero tolerance for harassment based on race, color, religion, sex, national origin, age, disability, sexual orientation, gender identity, or any protected class.
2.2 Report incidents to HR or anonymous ethics hotline. No retaliation for good-faith reports.
2.3 Investigation initiated within 48 hours of report. Confidentiality maintained to extent possible.

3. CONFLICTS OF INTEREST
3.1 Disclose any financial interest in customer, carrier, or vendor companies.
3.2 No kickbacks, bribes, or undisclosed payments from any business partner.
3.3 Do not accept gifts >$50 value from carriers or customers without management approval.
3.4 No personal use of SRL carrier relationships for non-company freight.

4. CONFIDENTIALITY
4.1 Customer rates, carrier rates, and margin information are strictly confidential.
4.2 Do not share customer shipping data, volumes, or contact information externally.
4.3 Non-disclosure agreement signed at hire, surviving 2 years post-employment.
4.4 Non-compete: 12 months, 100-mile radius from any SRL office.

5. DISCIPLINARY PROCESS
Verbal warning → Written warning → Final written warning → Termination.
Severity exceptions: theft, fraud, harassment, intoxication, violence = immediate termination.

Last revised: ${new Date().toISOString().split("T")[0]} | Owner: HR Director`,
      },

      // ── SALES ───────────────────────────────────
      {
        title: "Customer Onboarding & CRM Process",
        category: "sales",
        version: "1.3",
        author: "Wasih Haider",
        pages: 10,
        description: "End-to-end shipper acquisition process from lead generation through first load, including credit application, lane analysis, rate quoting, and account setup in the CRM system.",
        content: `1. LEAD QUALIFICATION
1.1 Target profiles: manufacturers, distributors, CPG companies with 10+ FTL shipments/month.
1.2 Qualify: freight volume, primary lanes, equipment needs, current broker/carrier relationships, payment history.
1.3 Lead scoring: A (50+ loads/month), B (20-49), C (10-19), D (<10 — monitor for growth).

2. PROPOSAL & PRICING
2.1 Request 30-day shipping history (origin/destination pairs, volumes, current rates).
2.2 Run lane analysis: DAT/Truckstop benchmarks, SRL carrier network capacity, margin targets.
2.3 Proposal includes: rate sheet by lane, service guarantees (on-time %, communication SLAs), technology offerings (real-time tracking, EDI, TMS integration).

3. ACCOUNT SETUP
3.1 Signed shipper-broker agreement (standard terms or customer-negotiated).
3.2 Credit application processed within 48 hours.
3.3 CRM entry: company info, contacts (shipping, AP, management), special requirements.
3.4 Shipping instructions documented: dock hours, appointment requirements, special handling, preferred carriers.
3.5 EDI setup (if applicable): 204/990/214/210 transaction set mapping, testing, go-live.

4. FIRST LOAD PROTOCOL
4.1 AE personally manages first 5 loads — no delegation.
4.2 Assign highest-tier available carrier for first load.
4.3 Proactive updates every 2 hours to customer.
4.4 Post-delivery call within 4 hours: satisfaction check, feedback, second load opportunity.

5. ONGOING ACCOUNT MANAGEMENT
Weekly: volume review, open issue follow-up.
Monthly: performance report (on-time %, claims, savings).
Quarterly: business review meeting with customer stakeholders.
Annual: contract renewal / rate review, growth strategy discussion.

Last revised: ${new Date().toISOString().split("T")[0]} | Owner: VP Sales`,
      },
    ],
  });

  console.log(`
Seed complete:
  Users: 3
    - admin@silkroutelogistics.ai (ADMIN) — password123
    - noor@silkroutelogistics.ai (BROKER / Account Executive) — password123
    - carrier@silkroutelogistics.ai (CARRIER / SRL Transport LLC) — password123
  Carrier Profile: SRL Transport LLC (MC-1234567, DOT 3456789, Platinum tier)
  SOPs: 13 industry-standard documents across 6 categories
    - Operations: 4 (Freight Ops, Reefer, Hazmat, Flatbed)
    - Safety: 3 (Driver Safety, Workplace OSHA, Claims)
    - Compliance: 2 (Carrier Vetting, DOT Audit)
    - Finance: 2 (AR/Invoicing, Factoring)
    - HR: 2 (Onboarding, Code of Conduct)
    - Sales: 1 (Customer Onboarding)
  Everything else: empty — build from the UI
  `);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
