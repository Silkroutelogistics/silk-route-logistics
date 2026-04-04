# TMW Suite (Trimble TMS) — Deep Dive Reference

> Research compiled April 2026 for SRL modernization.
> TMW Suite is the legacy gold-standard TMS used by Bison Transport and most major Canadian/US carriers.
> Now being replaced by next-gen "Trimble TMS" (cloud-native, AI-powered, modular).

---

## 1. SYSTEM OVERVIEW

TMW.Suite is an enterprise TMS purpose-built for:
- **Truckload carriers** (dedicated, reefer, flatbed, bulk, parcel)
- **Private fleets**
- **Freight brokers / 3PLs**
- **LTL operations**
- **Fuel haulers / petroleum marketers**

It provides a complete **order-to-cash** solution: Order Entry → Dispatch → Tracking → Billing → Settlement → Accounting.

### Core Base Modules (TMWSuite Base)
- Order Entry
- Dispatch
- Billing
- Settlements
- Auto Rating
- File Maintenance
- System Admin
- Fuel Card SmartLink
- Mileage SmartLink
- Fuel Tax SmartLink
- Accounting SmartLink

---

## 2. THE TRIP FOLDER — Central Hub

The Trip Folder is the single most important screen in TMW. It is the "order detail" view where dispatchers, operations, and billing staff live.

### 2.1 Trip Folder Layout

The Trip Folder is divided into:
1. **Top Half** — Trip Info tab + secondary tabs
2. **Bottom Half** — Stops grid (left) + Freight grid (right)

### 2.2 Primary Tabs

#### Trip Info Tab (Main)
Three sections:
- **Asset Section**: Resources assigned to the trip segment (driver, tractor, trailer, carrier)
- **Order Section** (for billable stops): Bill To company, revenue classifications, reference numbers, free-form remarks
- **Movement Section**: Mileage totals, billing charge totals, pay totals, last update details

#### Secondary Tabs (to the right of Trip Info):
| Tab | Purpose |
|-----|---------|
| **Load Requirements** | Special handling requirements based on commodity count, weight, size |
| **Notes** | Free-form remarks and operational notes |
| **Profit and Loss** | View/add/delete/compute billing charges; view/add/delete/compute pay details; target profit calculation (default 15% margin); green=above target, red=below |
| **TM Messages** | TotalMail messages to/from driver |
| **Check Calls** | Position reports, driver status updates, arrival/departure logging |
| **Activity Audit** | Change tracking / audit trail for the order |
| **Documents** | Linked imaging documents (BOL, POD, etc.) |
| **Intermodal** | Container, chassis, rail booking details |
| **Manhattan** | WMS integration data |
| **Paperwork** | Document compliance status, required vs received |
| **TruETA** | Real-time ETA calculation with traffic, weather, HOS |

### 2.3 Stops Grid (Bottom Left)
Each row = one stop or event on the trip.

**Stop Fields:**
| Field | Description |
|-------|-------------|
| Stop Type | PUP (Pickup), DRP (Drop/Delivery), event types |
| Company ID | Internal ID of the stop location |
| Company Name | Name of the facility |
| Address | Street address |
| City | City |
| State | State/province |
| Zip | Postal code |
| Earliest/Latest Arrival | Appointment window |
| Arrival Date/Time | Actual arrival |
| Departure Date/Time | Actual departure |
| Dwell Time | Time spent at stop (auto-calculated) |
| Payable Flag | Whether this stop generates driver/carrier pay |
| Status | Scheduled, Arrived, Departed, Completed |
| Sequence | Stop order |

### 2.4 Freight Grid (Bottom Right)
Each row = one commodity line (freight detail) nested under its stop.

**Freight Detail Fields:**
| Field | Description |
|-------|-------------|
| Commodity | Commodity code/description |
| Weight | Weight of freight |
| Pieces/Count | Number of pieces/pallets/units |
| Description | Free-form commodity description |
| Freight Class | NMFC freight class |
| Hazmat | Hazardous materials flag |

### 2.5 Invoice / Billing Section
| Field | Description |
|-------|-------------|
| Item Code | Charge type (line haul, accessorial code) |
| Invoice Number | System-generated or manual invoice # |
| Description | Charge description |
| Quantity | Units (miles, hours, pieces, etc.) |
| Rate | Rate per unit |
| Charge | Calculated charge amount |
| Currency | USD, CAD, etc. |
| Approved | Approval flag |
| Bill To | Company responsible for payment |

**Charge Summary:**
- Line Haul charges
- Accessorial charges (detention, tarping, fuel surcharge, etc.)
- **Total Charges** = Line Haul + Accessorials

### 2.6 Vendor Charges / Carrier Pay (Right Panel)
| Field | Description |
|-------|-------------|
| Compensation | Base carrier/driver pay |
| Reimbursements | Fuel advances, toll reimbursements |
| Deductions | Fixed deductions, variable deductions |
| Total Settlement | Net pay amount |

---

## 3. ORDER LIFECYCLE / STATUS WORKFLOW

```
AVL (Available) → PLN (Planned) → DSP (Dispatched) → STD (Started) → CMP (Completed) → INV (Invoiced)
```

| Status | Meaning |
|--------|---------|
| **AVL** | Order entered, available for planning |
| **PLN** | Resources assigned, carrier/driver planned |
| **DSP** | Dispatched to driver/carrier |
| **STD** | First stop actualized (pickup started) |
| **CMP** | Final billable stop departed |
| **INV** | Invoice generated and sent |

Separate tracking for:
- `ord_status` — operational status (AVL → CMP)
- `ord_invoicestatus` — billing status (AVL after CMP → invoiced)

---

## 4. MASTER DATA (File Maintenance)

### 4.1 Company Master File
Profiles for ALL business entities:
- **Shippers** — origin companies
- **Consignees** — destination companies
- **Bill To** — payers (may differ from shipper)
- **Drop/Hook locations** — trailer swap yards
- **Truck stops** — check call locations
- **Fuel stops**
- **Trailer wash/storage sites**

**Key Company Fields:**
- Company ID, Name, Address, City, State, Zip
- Contact name, phone, email
- Revenue classifications
- Order requirements (required fields, equipment types)
- Credit terms, payment terms
- Customer-specific rate schedules

### 4.2 Driver Master File
- Driver ID, Name, SSN/SIN
- CDL number, state, class, endorsements
- Medical card expiration date
- License expiration date
- Hire date, termination date, status
- Division, domicile, fleet
- Pay rate/type (per mile, percentage, hourly)
- Home terminal
- HOS data integration
- Equipment preferences
- Expiration tracking (CDL, medical, MVR, drug test)

### 4.3 Tractor Master File
- Tractor ID, VIN, Year, Make, Model
- License plate, state
- Fuel type, tank capacity
- Odometer reading
- Division, fleet, domicile
- Owner (company vs owner-operator)
- Maintenance schedule
- Insurance expiration
- GPS/ELD device ID

### 4.4 Trailer Master File
- Trailer ID, VIN, Year, Make, Model
- Trailer type (dry van, reefer, flatbed, tanker, etc.)
- Length, capacity (weight, volume)
- License plate, state
- Owner (company, O/O, inside carrier, customer)
- Reefer settings
- Inspection expiration
- Location tracking (GPS, door/cargo/temp sensors)

### 4.5 Pay To Master File (Carriers / Owner-Operators)
- Pay To ID, Name, Address
- MC#, DOT#, SCAC code
- Insurance certificate (cargo, liability, auto)
- Insurance expiration dates
- Operating authority
- CSA scores
- Safety rating
- Service rating
- Equipment types available
- Lanes served
- Pay terms, payment method
- W-9 / tax information
- RMIS/SaferWatch compliance data

---

## 5. RATING AND TARIFF SYSTEM

### 5.1 Billing Rates
- Rate schedules per customer/lane/commodity
- Rate types: per mile, per hundredweight, flat rate, percentage
- Rate tables: origin-destination matrix rates
- Minimum charges
- Fuel surcharge schedules (auto-calculated from DOE index)
- Date-effective rates (start/end dates)
- Contract vs spot rates

### 5.2 Accessorial Rate Types
| Type | Description |
|------|-------------|
| **Linked Line Item** | Manually added per-order (e.g., detention) |
| **Freestanding Accessorial** | Auto-applies to many/all trips (e.g., fuel surcharge, tarping fee) |

Common accessorials:
- Detention (pickup/delivery)
- Driver assist / lumper
- Tarping
- Stop-off charges
- Layover
- Toll charges
- Reefer fuel
- Hazmat
- Inside delivery
- Residential delivery
- Liftgate
- Over-dimensional

### 5.3 Pay Rates (Driver/Carrier)
- Per mile (loaded, empty, total)
- Percentage of revenue
- Flat rate per trip
- Per hundredweight
- Hourly rate
- Split pay (proportional to miles driven)
- Accessorial pay rates (detention, tarping, etc.)
- Calculation: `(line haul charge x % miles driven) x resource pay rate`

---

## 6. COMPLETE MODULE CATALOG

### 6.1 Safety & Transportation Management
| Module | Description |
|--------|-------------|
| **Risk and Safety** | Tracks accidents, incidents, cargo claims, salvage, subrogation, litigation. Collects: fast braking, excess speed, citations, log violations, failed inspections. Shift schedules, on-time performance. |
| **CSA Web Portal** | Monitors FMCSA CSA data, charts rating changes, identifies mis-reporting |
| **Safety Module** | Tracks accident/spill/injury frequency and resolution |

### 6.2 Brokerage / Dispatch / Document Management
| Module | Description |
|--------|-------------|
| **Dispatch Advisor** | AI-powered load matching to optimize empty miles and operating ratio |
| **Advanced Carrier Selection (ACS)** | 90-day carrier performance history, rate/pay history, margin guidance, profit estimation |
| **Brokerage Multi-Planning** | Separates customer service from carrier management, status-based load tracking, commission management |
| **External Equipment** | Imports carrier/driver data from load boards into planning worksheet |
| **DAT 360 Interface** | Real-time freight board integration within dispatch screens |
| **Freight Board Interface** | Posts to DAT, Direct Freight, Getloaded, Truckstop, etc. |
| **Freight Agent License** | Web app for remote broker agents with own customer/carrier blocks |
| **LTL Operations** | Terminal operations, cross-dock planning, linehaul dispatch, door management |
| **Record Level Security** | Compartmentalizes data access by division/workgroup |
| **Inspection and Hold** | Vehicle damage tracking for auto haulers, prevents damaged inventory dispatch |
| **ExpertFuel** | Fuel optimization with daily diesel price feeds and routing algorithms |
| **Match Advice** | Load-to-driver matching with constraint optimization |
| **IVR Module** | Automated phone-based check calls and status updates |

### 6.3 Document Management / Imaging
| Module | Description |
|--------|-------------|
| **Cloud Imaging** | SaaS document capture, retrieval, indexing, rendition invoice printing |
| **Mobile Imaging** | Driver app captures docs, auto-indexes, delivers to back-end imaging |
| **Trimble Imaging** | Full DMS: workflow engine, annotation, OCR, full-text search, fax |
| **SmartLink Bar Coding** | Barcode recognition for automated document classification |
| **SmartLink Alerts/Compliance** | Document expiration tracking, auto-pushes expirations to prevent non-compliant dispatch |
| **SmartLink Email** | Auto-imports PDF/TIFF/DOC from email, classifies by filename/subject |
| **3rd Party Imaging** | Integration with EBE, Flying J, Microdea, Paperwise, Pegasus, TMI, Trippak |

### 6.4 Accounting / Billing / Finance
| Module | Description |
|--------|-------------|
| **Accounting Interface** | Exports to Dynamics 365, Sage, NetSuite, Oracle, SAP, QuickBooks |
| **Payroll** | Integration with Great Plains payroll, ADP, etc. |
| **Ticket Order Entry** | For aggregate/bulk hauling — master orders with individual shipment tickets |
| **Dedicated Billing** | Consolidated invoices for dedicated customers with multiple billing schedules |
| **3rd Party Pay** | Manages pay to sales reps, finders, freight agents, yard workers, lumpers |
| **Intercompany Order Transfer** | Posts loads between divisions with automatic AR/AP routing |
| **Fuel Export (Tax) SmartLink** | Flat file data for IFTA/fuel tax reporting |
| **Fuel & Mileage Report** | State mileage and fuel purchase summary for quarterly tax |
| **Advances/Fuel Purchases Import** | Imports from 26+ fuel card providers |
| **Interactive Fuel Card SmartLink** | Block/unblock/reassign fuel cards, set limits (Comdata, EFS, QuikQ) |
| **Money Codes SmartLink** | Import cash advance authorization codes |

### 6.5 Driver Management / Integration / Fuel Management
| Module | Description |
|--------|-------------|
| **EDriverlogs** | HOS data capture from Trimble in-cab units |
| **Hours of Service** | Omnitracs HOS interface for dispatch integration |
| **Rapid Hire SmartLink** | Batch import driver records from recruiting software |
| **Tenstreet Interface** | Auto-create/modify/retire driver records from Tenstreet |
| **Driver Retention Analytics** | Predicts voluntary departure within 28 days, identifies risk factors, coaching recommendations |
| **SystemsLink API** | Web service API for CRUD operations on TMWSuite database |
| **EDI SmartLinks** | Full EDI suite: 204 (tender), 990 (response), 214 (status), 210 (invoice), 820 (remittance), 824, 997 |
| **Trimble K'Nect** | Transaction-based EDI for 15+ trading partners |
| **ACE/ACI EDI** | US/Canada customs border crossing e-manifest |
| **Data Exchange** | Configurable flat file/spreadsheet import toolkit |
| **Fuel Dispatch** | Full order entry/dispatch for fuel haulers with commodity profiles, card planner, driver shift planning |

### 6.6 Tracking / Mobile Communications
| Module | Description |
|--------|-------------|
| **TripAlert** | Proactive monitoring: transit delays, excessive dwell, HOS alerts |
| **Geofencing** | GPS-based auto-arrival/departure with geocoding tools |
| **Mobile Comm SmartLink** | Integrates 25+ telematics providers (Omnitracs, Trimble, Geotab, KeepTruckin, Isaac, etc.) |
| **TMW Go! Driver** | iOS/Android app for drivers: orders, check calls, stop updates |
| **TMW Go! Dispatch** | iOS/Android app for dispatchers: check calls, resource assignment, reports, trip splits |
| **TMW Go! Notifications** | Real-time change alerts for orders and assignments |
| **FleetConneX** | Cloud middleware connecting TMS to telematics, processes updates in seconds |
| **D2Link 3.0** | Consumer smartphone solution: barcode scanning, signature capture, geofencing, forms |
| **TotalMail** | Middleware gateway for all mobile communication and trailer tracking |
| **Asset Tracking** | Trailer GPS, cargo sensor, door sensor, motion sensor, power sensor, temperature monitoring |

### 6.7 Mileage / Routing / Business Intelligence
| Module | Description |
|--------|-------------|
| **TruETA** | Cloud-based ETA calculation with traffic, weather, HOS, driver breaks |
| **Driver Trip Planning** | Driver rest stops, HOS-compliant routing, accurate ETAs |
| **Out-of-Route/Corridor** | Detects route deviation, measures extension, alerts driver |
| **Toll Data** | Captures toll costs during mileage lookup, optional auto-invoice |
| **Reveal** | BI platform: pre-built dashboards, scorecards, geographic maps, profit/margin analysis |
| **Engage.Bid** | Web-based freight bid management, strategic pricing, lane awards |
| **NetWise** | Root cause analysis for profitability issues |
| **The DAWG** | Business alerting: user-defined triggers, email/desktop warnings, management-by-exception |

### 6.8 Visibility / Web Portals
| Module | Description |
|--------|-------------|
| **Trimble Visibility** | 360-degree shipment visibility with Trust Center for data distribution |
| **eStat** | Customer portal: track-and-trace, quote requests, order placement, document viewing |
| **CarrierHub** | Carrier portal: view available loads, request/self-assign loads |
| **DriverSeat** | Driver portal: settlement records, pay statements, trip history |
| **CashLink** | B2B invoice integration via Amalto platform |
| **WorkCycle Enterprise** | Workflow automation engine with templates, timers, file operations, email |
| **WorkCycle: RMIS** | Auto-imports carrier compliance data from RMIS |
| **WorkCycle: Carrier 411** | Auto-imports carrier data from Carrier 411 |
| **WorkCycle: ePay** | ACH payment automation for carrier settlements |
| **WorkCycle: Auto Apply to Credit** | Auto-matches credit memos to invoices in Dynamics GP |

---

## 7. EDI TRANSACTION FLOW

```
Shipper sends EDI 204 (Load Tender)
    → TMW LTSL 2.0 receives flat file → creates pending order
    → Dispatcher reviews → accepts/declines
    ← TMW sends EDI 990 (Accept/Decline response)

During transit:
    → TMW sends EDI 214 (Shipment Status) at each check call / stop event

After delivery:
    → TMW sends EDI 210 (Freight Invoice) from billing

Additional:
    ← EDI 820 (Remittance Advice) — payment notification from customer
    ← EDI 997 (Functional Acknowledgment) — receipt confirmation
```

---

## 8. DATA FLOW BETWEEN MODULES

```
ORDER ENTRY                  →  DISPATCH / PLANNING WORKSHEET
  (creates order,                (matches resources, dispatches)
   Bill To, shipper,                    |
   consignee, commodity,               ↓
   reference numbers)          TRIP FOLDER
                               (central hub, all data converges)
                                        |
              ┌──────────┬──────────────┼──────────────┬──────────────┐
              ↓           ↓              ↓              ↓              ↓
         CHECK CALLS   TRACKING     DOCUMENTS      BILLING      SETTLEMENT
         (driver       (GPS,        (BOL, POD,     (rating,     (driver/carrier
          status,       geofence,    imaging)       invoicing,    pay calc,
          position)     TruETA)                     accessorials) deductions)
              |           |              |              |              |
              ↓           ↓              ↓              ↓              ↓
         EDI 214      VISIBILITY    COMPLIANCE     EDI 210      ACCOUNTING
         (customer     (eStat,      (alerts,       (customer    (GL, AP, AR,
          status)      CarrierHub)   expiration)    invoice)     payroll)
```

---

## 9. PROFIT AND LOSS — Order Level

TMW calculates P&L at the individual order level:

| Metric | Source |
|--------|--------|
| **Revenue** | Auto-rated billing charges (line haul + accessorials) |
| **Carrier/Driver Cost** | Auto-rated pay (compensation + reimbursements) |
| **Fuel Cost** | Fuel card imports, ExpertFuel data |
| **Toll Cost** | Toll data from mileage lookup |
| **3rd Party Cost** | Lumpers, agents, finders |
| **Gross Profit** | Revenue - All Costs |
| **Margin %** | Gross Profit / Revenue |
| **Target Profit** | Default 15% margin (configurable per order) |

Visual indicators:
- **Green** = actual margin above target
- **Red** = actual margin below target

---

## 10. SETTLEMENT SYSTEM

### Trip Settlement (Per-Trip Pay)
- Compensation: line haul pay based on rate schedule
- Reimbursements: fuel advances, tolls, per diem
- Deductions: fixed (truck payment, insurance) and variable (fuel, maintenance)
- Split pay: proportional to miles driven by each resource
- Accessorial pay: detention, tarping, etc.

### Time Settlement (Periodic Pay)
- Collects all trips in a pay period
- Applies recurring deductions
- Generates settlement statements
- Integrates with payroll systems

### Final Settlement (Single Asset)
- Settles all outstanding pay for a driver/carrier
- Final deduction processing
- Generates final pay statement

### 3rd Party Settlement
- Sales rep commissions
- Freight agent fees
- Lumper/yard worker pay

---

## 11. REPORTS GENERATED

TMW provides "hundreds of standard reports" plus ad hoc reporting:

### Operations Reports
- Trip/order status
- On-time delivery performance
- Empty mile percentage
- Driver utilization
- Equipment utilization
- Lane analysis
- Customer profitability

### Financial Reports
- Revenue by customer/lane/driver/division
- Profit and loss by order
- Margin analysis
- Settlement summaries
- Aging reports (AR/AP)
- Fuel tax (IFTA) — state mileage and fuel purchase summary

### Safety Reports
- Accident frequency and resolution
- CSA score tracking
- Inspection results
- Driver behavior (speeding, hard braking)
- Incident/claim tracking

### Compliance Reports
- Document expiration alerts
- CDL/medical card expiration
- Insurance certificate expiration
- HOS violations
- Missing paperwork

---

## 12. NEXT-GEN TRIMBLE TMS (2025-2026)

Trimble is replacing TMW.Suite with a cloud-native, modular TMS with embedded AI:

### Seven Core Modules
1. **Order** — AI-assisted order intake, grading incoming tenders
2. **Capacity** — Supply/demand forecasting up to 7 days out
3. **Supply:Demand** — Network balance optimization
4. **Status** — Real-time tracking and updates
5. **Back Office** — Billing, settlements, accounting
6. **Control Center** — Dashboard and exception management
7. (Seventh module unnamed in sources)

### AI Agents
- **Order Intake Agent** — Eliminates manual review in 90% of standard orders
- **Invoice Scanning Agent** — Auto-processes inbound invoices
- **Road Call Agent** — Automates road call/breakdown handling
- **Tender Grading** — AI-scores incoming freight tenders
- **Contract Intake** — AI-reads and processes rate contracts
- **Network Balance Forecasting** — 7-day load balance prediction

### Timeline
- Order + Capacity modules: pre-release trial (existing customers) — 2025
- End-to-end Trimble TMS beta: Q1 2026
- Order Intake Agent for TMW.Suite, TruckMate, Innovative: H1 2026

---

## 13. IMPLICATIONS FOR SRL

### What SRL Already Has (and maps to TMW):
- Order entry with shipper/consignee/Bill To
- Load lifecycle statuses
- EDI 204/990/214/210 (JSON format)
- Invoice with line haul + accessorials
- Check calls / tracking
- Document management
- Carrier onboarding
- Multi-role portals (shipper, carrier, admin)

### What SRL Should Add (based on TMW):

#### High Priority
1. **Trip Folder concept** — unified order detail view with all tabs in one screen
2. **Profit & Loss tab** — real-time margin calculation per load with visual indicators
3. **Rate Schedule / Tariff engine** — customer-specific rates with date ranges, minimums, fuel surcharge auto-calc
4. **Driver/Carrier Settlement engine** — compensation, reimbursements, deductions, split pay, periodic settlements
5. **Planning Worksheet** — two-pane view: available trips (top) + available resources (bottom) for drag-and-drop dispatch
6. **Activity Audit trail** — every change to an order tracked with timestamp and user
7. **Load Requirements** — commodity weight/count/size constraints, required equipment types
8. **Reference Numbers** — multiple reference numbers per order (PO#, BOL#, PRO#, customer ref)

#### Medium Priority
9. **Paperwork compliance** — required vs received documents per order, blocks billing until complete
10. **TruETA equivalent** — ETA calculation with traffic, weather, HOS
11. **Fuel surcharge automation** — DOE index-based auto-calculation
12. **BI dashboards / Reveal equivalent** — pre-built KPI scorecards
13. **WorkCycle automation** — configurable workflow triggers and actions
14. **CarrierHub portal** — carrier self-service load board
15. **DriverSeat portal** — driver pay statement access

#### Lower Priority
16. **Intermodal support** — container/chassis tracking, rail booking
17. **Fuel card integration** — Comdata, EFS block/unblock
18. **IFTA fuel tax reporting** — state mileage and fuel purchase summary
19. **Geofencing** — auto-arrival/departure from GPS
20. **Driver retention analytics** — 28-day departure prediction

---

## Sources

- [TMW.Suite TMS Product Page](https://transportation.trimble.com/products/tmw-suite)
- [TMW.Suite Product Catalog — Table of Contents](https://transportationinfo.trimble.com/suitecatalog/table-of-contents)
- [Safety / Transportation Management Catalog](https://transportationinfo.trimble.com/suitecatalog/safety-transportation-management)
- [Brokerage / Dispatch / Document Management Catalog](https://transportationinfo.trimble.com/suitecatalog/brokerage-dispatch-document-management)
- [Accounting / Billing / Finance Catalog](https://transportationinfo.trimble.com/suitecatalog/accounting-billing-finance)
- [Driver Management / Integration / Fuel Management Catalog](https://transportationinfo.trimble.com/suitecatalog/driver-management-integration-fuel-management)
- [Tracking / Mobile Communications Catalog](https://transportationinfo.trimble.com/suitecatalog/tracking-mobile-communications)
- [Mileage / Routing / Business Intelligence Catalog](https://transportationinfo.trimble.com/suitecatalog/managementreportingbi)
- [Visibility / Web Flows Catalog](https://transportationinfo.trimble.com/suitecatalog/visibility-web-flows)
- [TMW Operations — Trip Folder Layout](https://learn.transportation.trimble.com/wp-content/uploads/tte/ebcbe19c93c746dd320c/olhlp/b75480e2e3c8/docs/Current/TripFolder/TF-Layout.html)
- [TMW Operations — Stops](https://learn.transportation.trimble.com/wp-content/uploads/tte/ebcbe19c93c746dd320c/olhlp/a44223636c61/docs/Current/TripFolder/TF-Stops.html)
- [TMW Operations — Covering an Order](https://learn.transportation.trimble.com/wp-content/uploads/tte/ebcbe19c93c746dd320c/olhlp/2af459aa8051/docs/Current/Brokerage/IntroCoverOrder.html)
- [TMW Operations — Carrier Assignment (ACS)](https://learn.transportation.trimble.com/wp-content/uploads/tte/ebcbe19c93c746dd320c/olhlp/dc08dbb60cb8/docs/Current/Brokerage/AssignCarrierACS.html)
- [TMW Back Office — Billing Rate Creation](https://learn.transportation.trimble.com/wp-content/uploads/tte/ebcbe19c93c746dd320c/olhlp/4a67a1ab44bd/docs/Current/Rating/BR-CreateBillingRate.html)
- [TMW Back Office — Rate Tables](https://learn.transportation.trimble.com/wp-content/uploads/tte/ebcbe19c93c746dd320c/olhlp/53b6f6a69f0a/docs/Current/Rating/TAR-Tables.html)
- [Trimble TMS AI Announcement — Insight 2025](https://transportation.trimble.com/resources/blogs/trimble-announces-new-ai-powered-trimble-tms-at-trimble-insight-2025)
- [Trimble AI Agents Announcement](https://transportation.trimble.com/resources/blogs/trimble-announces-new-ai-and-agentic-workflows-across-solutions-at-trimble-insight-2025)
- [Bison Transport Case Study](https://transportation.trimble.com/resources/case-studies/bison-transport)
- [Trimble Integration with SaferWatch](https://www.ccjdigital.com/business/article/14938433/trimble-announces-integration-of-tmwsuite-with-saferwatch)
- [Trimble RMIS Integration](http://www.prweb.com/releases/2018/05/prweb15477979.htm)
- [Trimble Cloud Imaging Launch](https://www.prnewswire.com/news-releases/trimble-launches-new-imaging-solutions-to-improve-invoicing-for-trucking-companies-300709175.html)
