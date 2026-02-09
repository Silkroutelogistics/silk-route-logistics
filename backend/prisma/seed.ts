import { PrismaClient, UserRole, CarrierTier, LoadStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Clean existing data
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
  await prisma.sOP.deleteMany();
  await prisma.user.deleteMany();

  const hash = await bcrypt.hash("password123", 10);
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;

  // ═══════════════════════════════════════════════
  // USERS
  // ═══════════════════════════════════════════════

  const admin = await prisma.user.create({
    data: {
      email: "admin@silkroutelogistics.ai", passwordHash: hash,
      firstName: "Wasih", lastName: "Haider", company: "Silk Route Logistics",
      role: UserRole.ADMIN, isVerified: true,
    },
  });

  const broker = await prisma.user.create({
    data: {
      email: "whaider@silkroutelogistics.ai", passwordHash: hash,
      firstName: "Whaider", lastName: "Haider", company: "Silk Route Logistics",
      role: UserRole.BROKER, isVerified: true, phone: "(269) 555-0101",
    },
  });

  const dispatch = await prisma.user.create({
    data: {
      email: "dispatch@silkroutelogistics.ai", passwordHash: hash,
      firstName: "Marcus", lastName: "Rivera", company: "Silk Route Logistics",
      role: UserRole.DISPATCH, isVerified: true, phone: "(269) 555-0102",
    },
  });

  const accounting = await prisma.user.create({
    data: {
      email: "accounting@silkroutelogistics.ai", passwordHash: hash,
      firstName: "Priya", lastName: "Sharma", company: "Silk Route Logistics",
      role: UserRole.ACCOUNTING, isVerified: true,
    },
  });

  const operations = await prisma.user.create({
    data: {
      email: "operations@silkroutelogistics.ai", passwordHash: hash,
      firstName: "Carlos", lastName: "Rivera", company: "Silk Route Logistics",
      role: UserRole.OPERATIONS, isVerified: true,
    },
  });

  // Carrier 1: Platinum owner-operator, 1 truck, dry van (primary carrier demo account)
  const carrier1 = await prisma.user.create({
    data: {
      email: "srl@silkroutelogistics.ai", passwordHash: hash,
      firstName: "Mike", lastName: "Henderson", company: "Henderson Trucking",
      role: UserRole.CARRIER, isVerified: true, phone: "(616) 555-1001",
    },
  });

  // Carrier 2: Gold, small reefer fleet
  const carrier2 = await prisma.user.create({
    data: {
      email: "gold@silkroutelogistics.ai", passwordHash: hash,
      firstName: "Sarah", lastName: "Kowalski", company: "Kowalski Cold Freight",
      role: UserRole.CARRIER, isVerified: true, phone: "(312) 555-2002",
    },
  });

  // Carrier 3: Silver, car hauler
  const carrier3 = await prisma.user.create({
    data: {
      email: "silver@silkroutelogistics.ai", passwordHash: hash,
      firstName: "Carlos", lastName: "Ramirez", company: "Ramirez Auto Transport",
      role: UserRole.CARRIER, isVerified: true, phone: "(313) 555-3003",
    },
  });

  // Carrier 4: Bronze, new owner-operator
  const carrier4 = await prisma.user.create({
    data: {
      email: "bronze@silkroutelogistics.ai", passwordHash: hash,
      firstName: "Tom", lastName: "Novak", company: "Novak Hauling LLC",
      role: UserRole.CARRIER, isVerified: true, phone: "(517) 555-4004",
    },
  });

  // Carrier 5: Gold, flatbed specialist
  const carrier5 = await prisma.user.create({
    data: {
      email: "flatbed@silkroutelogistics.ai", passwordHash: hash,
      firstName: "Darryl", lastName: "Washington", company: "Great Lakes Flatbed",
      role: UserRole.CARRIER, isVerified: true, phone: "(419) 555-5005",
    },
  });

  // ═══════════════════════════════════════════════
  // CARRIER PROFILES
  // ═══════════════════════════════════════════════

  const cp1 = await prisma.carrierProfile.create({
    data: {
      userId: carrier1.id, mcNumber: "MC-891201", dotNumber: "DOT-3401201",
      insuranceExpiry: new Date("2027-06-15"), safetyScore: 99,
      tier: CarrierTier.PLATINUM,
      equipmentTypes: ["Dry Van"],
      operatingRegions: ["Michigan", "Indiana", "Ohio", "Illinois"],
      onboardingStatus: "APPROVED", approvedAt: new Date("2025-03-10"),
      w9Uploaded: true, insuranceCertUploaded: true, authorityDocUploaded: true,
      numberOfTrucks: 1, address: "2847 Division Ave S", city: "Grand Rapids", state: "MI", zip: "49548",
    },
  });

  const cp2 = await prisma.carrierProfile.create({
    data: {
      userId: carrier2.id, mcNumber: "MC-891202", dotNumber: "DOT-3401202",
      insuranceExpiry: new Date("2027-03-20"), safetyScore: 96,
      tier: CarrierTier.GOLD,
      equipmentTypes: ["Reefer", "Dry Van"],
      operatingRegions: ["Michigan", "Illinois", "Wisconsin", "Minnesota", "Indiana"],
      onboardingStatus: "APPROVED", approvedAt: new Date("2025-05-01"),
      w9Uploaded: true, insuranceCertUploaded: true, authorityDocUploaded: true,
      numberOfTrucks: 3, address: "1580 W Fullerton Ave", city: "Chicago", state: "IL", zip: "60614",
    },
  });

  const cp3 = await prisma.carrierProfile.create({
    data: {
      userId: carrier3.id, mcNumber: "MC-891203", dotNumber: "DOT-3401203",
      insuranceExpiry: new Date("2026-11-01"), safetyScore: 92,
      tier: CarrierTier.SILVER,
      equipmentTypes: ["Car Hauler", "Step Deck"],
      operatingRegions: ["Michigan", "Ohio", "Indiana", "Pennsylvania"],
      onboardingStatus: "APPROVED", approvedAt: new Date("2025-08-15"),
      w9Uploaded: true, insuranceCertUploaded: true, authorityDocUploaded: true,
      numberOfTrucks: 2, address: "14320 Michigan Ave", city: "Dearborn", state: "MI", zip: "48126",
    },
  });

  const cp4 = await prisma.carrierProfile.create({
    data: {
      userId: carrier4.id, mcNumber: "MC-891204", dotNumber: "DOT-3401204",
      insuranceExpiry: new Date("2026-09-01"), safetyScore: 82,
      tier: CarrierTier.BRONZE,
      equipmentTypes: ["Dry Van"],
      operatingRegions: ["Michigan", "Indiana"],
      onboardingStatus: "APPROVED", approvedAt: new Date("2025-12-01"),
      w9Uploaded: true, insuranceCertUploaded: true, authorityDocUploaded: false,
      numberOfTrucks: 1, address: "518 E Grand River Ave", city: "Lansing", state: "MI", zip: "48906",
    },
  });

  const cp5 = await prisma.carrierProfile.create({
    data: {
      userId: carrier5.id, mcNumber: "MC-891205", dotNumber: "DOT-3401205",
      insuranceExpiry: new Date("2027-01-15"), safetyScore: 95,
      tier: CarrierTier.GOLD,
      equipmentTypes: ["Flatbed", "Step Deck"],
      operatingRegions: ["Ohio", "Michigan", "Indiana", "Kentucky"],
      onboardingStatus: "APPROVED", approvedAt: new Date("2025-06-20"),
      w9Uploaded: true, insuranceCertUploaded: true, authorityDocUploaded: true,
      numberOfTrucks: 2, address: "1200 Front St", city: "Toledo", state: "OH", zip: "43605",
    },
  });

  // ═══════════════════════════════════════════════
  // SCORECARDS (last 4 weeks per carrier)
  // ═══════════════════════════════════════════════

  const scorecardData = [
    { carrierId: cp1.id, tier: CarrierTier.PLATINUM, scores: [
      { otp: 99, otd: 99, comm: 98, claim: 0.5, doc: 99, accept: 97, gps: 99, week: 0 },
      { otp: 98, otd: 99, comm: 97, claim: 0.8, doc: 98, accept: 96, gps: 98, week: 1 },
      { otp: 99, otd: 98, comm: 99, claim: 0.3, doc: 99, accept: 98, gps: 99, week: 2 },
      { otp: 97, otd: 99, comm: 98, claim: 0.6, doc: 97, accept: 95, gps: 98, week: 3 },
    ]},
    { carrierId: cp2.id, tier: CarrierTier.GOLD, scores: [
      { otp: 96, otd: 97, comm: 94, claim: 1.5, doc: 95, accept: 93, gps: 96, week: 0 },
      { otp: 95, otd: 96, comm: 95, claim: 1.8, doc: 94, accept: 92, gps: 95, week: 1 },
      { otp: 97, otd: 95, comm: 93, claim: 2.0, doc: 96, accept: 94, gps: 97, week: 2 },
      { otp: 94, otd: 96, comm: 96, claim: 1.2, doc: 93, accept: 91, gps: 94, week: 3 },
    ]},
    { carrierId: cp3.id, tier: CarrierTier.SILVER, scores: [
      { otp: 93, otd: 91, comm: 90, claim: 3, doc: 88, accept: 85, gps: 90, week: 0 },
      { otp: 91, otd: 90, comm: 88, claim: 3.5, doc: 87, accept: 83, gps: 88, week: 1 },
    ]},
    { carrierId: cp4.id, tier: CarrierTier.BRONZE, scores: [
      { otp: 85, otd: 82, comm: 80, claim: 5, doc: 78, accept: 75, gps: 80, week: 0 },
      { otp: 82, otd: 80, comm: 78, claim: 6, doc: 75, accept: 72, gps: 78, week: 1 },
    ]},
    { carrierId: cp5.id, tier: CarrierTier.GOLD, scores: [
      { otp: 95, otd: 96, comm: 94, claim: 1.0, doc: 96, accept: 94, gps: 95, week: 0 },
      { otp: 96, otd: 95, comm: 95, claim: 1.2, doc: 95, accept: 93, gps: 96, week: 1 },
    ]},
  ];

  for (const carrier of scorecardData) {
    for (const s of carrier.scores) {
      const overall =
        s.otp * 0.2 + s.otd * 0.2 + s.comm * 0.1 + (100 - s.claim) * 0.15 +
        s.doc * 0.1 + s.accept * 0.1 + s.gps * 0.15;
      await prisma.carrierScorecard.create({
        data: {
          carrierId: carrier.carrierId, period: "WEEKLY",
          onTimePickupPct: s.otp, onTimeDeliveryPct: s.otd,
          communicationScore: s.comm, claimRatio: s.claim,
          documentSubmissionTimeliness: s.doc, acceptanceRate: s.accept,
          gpsCompliancePct: s.gps,
          overallScore: Math.round(overall * 100) / 100,
          tierAtTime: carrier.tier,
          bonusEarned: carrier.tier === "PLATINUM" ? 150 : carrier.tier === "GOLD" ? 75 : 0,
          calculatedAt: new Date(now - s.week * weekMs),
        },
      });
    }
  }

  // ═══════════════════════════════════════════════
  // BONUSES
  // ═══════════════════════════════════════════════

  await prisma.carrierBonus.createMany({
    data: [
      { carrierId: cp1.id, type: "PERFORMANCE", amount: 450, period: "2026-01", status: "PAID", description: "Platinum tier monthly bonus" },
      { carrierId: cp1.id, type: "PERFORMANCE", amount: 150, period: "2026-W06", status: "PENDING", description: "Weekly performance bonus" },
      { carrierId: cp1.id, type: "REFERRAL", amount: 200, status: "APPROVED", description: "Referred Kowalski Cold Freight" },
      { carrierId: cp2.id, type: "PERFORMANCE", amount: 225, period: "2026-01", status: "PAID", description: "Gold tier monthly bonus" },
      { carrierId: cp2.id, type: "VOLUME", amount: 100, period: "2026-01", status: "APPROVED", description: "15+ loads milestone" },
      { carrierId: cp5.id, type: "PERFORMANCE", amount: 75, period: "2026-W06", status: "PENDING", description: "Weekly performance bonus" },
    ],
  });

  // ═══════════════════════════════════════════════
  // LOADS (Midwest lanes)
  // ═══════════════════════════════════════════════

  const loads = await Promise.all([
    // Load 1: COMPLETED — Kalamazoo to Chicago, dry van
    prisma.load.create({
      data: {
        referenceNumber: "SRL-2026-001", status: LoadStatus.COMPLETED,
        originCity: "Kalamazoo", originState: "MI", originZip: "49008",
        destCity: "Chicago", destState: "IL", destZip: "60601",
        weight: 38000, equipmentType: "Dry Van", commodity: "Auto Parts",
        rate: 1800, distance: 145, posterId: broker.id, carrierId: carrier1.id,
        pickupDate: new Date("2026-01-15"), deliveryDate: new Date("2026-01-15"),
      },
    }),
    // Load 2: IN_TRANSIT — Grand Rapids to Indianapolis, reefer (CPG)
    prisma.load.create({
      data: {
        referenceNumber: "SRL-2026-002", status: LoadStatus.IN_TRANSIT,
        originCity: "Grand Rapids", originState: "MI", originZip: "49503",
        destCity: "Indianapolis", destState: "IN", destZip: "46204",
        weight: 42000, equipmentType: "Reefer", commodity: "Frozen Foods (CPG)",
        rate: 2800, distance: 260, posterId: broker.id, carrierId: carrier2.id,
        pickupDate: new Date("2026-02-07"), deliveryDate: new Date("2026-02-08"),
      },
    }),
    // Load 3: POSTED — Detroit to Columbus, needs tendering
    prisma.load.create({
      data: {
        referenceNumber: "SRL-2026-003", status: LoadStatus.POSTED,
        originCity: "Detroit", originState: "MI", originZip: "48201",
        destCity: "Columbus", destState: "OH", destZip: "43215",
        weight: 35000, equipmentType: "Dry Van", commodity: "Consumer Electronics",
        rate: 1600, distance: 200, posterId: broker.id,
        pickupDate: new Date("2026-02-10"), deliveryDate: new Date("2026-02-10"),
      },
    }),
    // Load 4: POSTED — Kalamazoo to Milwaukee, reefer, needs tendering
    prisma.load.create({
      data: {
        referenceNumber: "SRL-2026-004", status: LoadStatus.POSTED,
        originCity: "Kalamazoo", originState: "MI", originZip: "49008",
        destCity: "Milwaukee", destState: "WI", destZip: "53202",
        weight: 40000, equipmentType: "Reefer", commodity: "Dairy Products",
        rate: 2100, distance: 195, posterId: broker.id,
        pickupDate: new Date("2026-02-11"), deliveryDate: new Date("2026-02-11"),
      },
    }),
    // Load 5: BOOKED — Detroit to Toledo, car hauler
    prisma.load.create({
      data: {
        referenceNumber: "SRL-2026-005", status: LoadStatus.BOOKED,
        originCity: "Detroit", originState: "MI", originZip: "48201",
        destCity: "Toledo", destState: "OH", destZip: "43605",
        weight: 28000, equipmentType: "Car Hauler", commodity: "Vehicles (6 units)",
        rate: 1400, distance: 62, posterId: broker.id, carrierId: carrier3.id,
        pickupDate: new Date("2026-02-09"), deliveryDate: new Date("2026-02-09"),
      },
    }),
    // Load 6: DELIVERED — Grand Rapids to Chicago, dry van
    prisma.load.create({
      data: {
        referenceNumber: "SRL-2026-006", status: LoadStatus.DELIVERED,
        originCity: "Grand Rapids", originState: "MI", originZip: "49503",
        destCity: "Chicago", destState: "IL", destZip: "60601",
        weight: 44000, equipmentType: "Dry Van", commodity: "Office Furniture",
        rate: 1950, distance: 180, posterId: broker.id, carrierId: carrier1.id,
        pickupDate: new Date("2026-02-05"), deliveryDate: new Date("2026-02-05"),
      },
    }),
    // Load 7: POSTED — Toledo to Fort Wayne, flatbed, needs tendering
    prisma.load.create({
      data: {
        referenceNumber: "SRL-2026-007", status: LoadStatus.POSTED,
        originCity: "Toledo", originState: "OH", originZip: "43605",
        destCity: "Fort Wayne", destState: "IN", destZip: "46802",
        weight: 45000, equipmentType: "Flatbed", commodity: "Steel Coils",
        rate: 1700, distance: 118, posterId: broker.id,
        pickupDate: new Date("2026-02-12"), deliveryDate: new Date("2026-02-12"),
      },
    }),
    // Load 8: DISPATCHED — Kalamazoo to Detroit, reefer
    prisma.load.create({
      data: {
        referenceNumber: "SRL-2026-008", status: LoadStatus.DISPATCHED,
        originCity: "Kalamazoo", originState: "MI", originZip: "49008",
        destCity: "Detroit", destState: "MI", destZip: "48201",
        weight: 36000, equipmentType: "Reefer", commodity: "Fresh Produce",
        rate: 1500, distance: 150, posterId: broker.id, carrierId: carrier2.id,
        pickupDate: new Date("2026-02-08"), deliveryDate: new Date("2026-02-08"),
      },
    }),
    // Load 9: COMPLETED — Lansing to Chicago
    prisma.load.create({
      data: {
        referenceNumber: "SRL-2026-009", status: LoadStatus.COMPLETED,
        originCity: "Lansing", originState: "MI", originZip: "48906",
        destCity: "Chicago", destState: "IL", destZip: "60601",
        weight: 38000, equipmentType: "Dry Van", commodity: "Paper Products",
        rate: 1650, distance: 210, posterId: broker.id, carrierId: carrier4.id,
        pickupDate: new Date("2026-01-28"), deliveryDate: new Date("2026-01-29"),
      },
    }),
    // Load 10: POSTED — Minneapolis to Kalamazoo, needs tendering
    prisma.load.create({
      data: {
        referenceNumber: "SRL-2026-010", status: LoadStatus.POSTED,
        originCity: "Minneapolis", originState: "MN", originZip: "55401",
        destCity: "Kalamazoo", destState: "MI", destZip: "49008",
        weight: 30000, equipmentType: "Dry Van", commodity: "Retail Goods (CPG)",
        rate: 2600, distance: 490, posterId: broker.id,
        pickupDate: new Date("2026-02-13"), deliveryDate: new Date("2026-02-14"),
      },
    }),
  ]);

  // ═══════════════════════════════════════════════
  // ADDITIONAL LOADS (Multi-Region for Market Trends)
  // ═══════════════════════════════════════════════

  const regionalLoads = await Promise.all([
    // SOUTHEAST
    prisma.load.create({ data: { referenceNumber: "SRL-2026-011", status: LoadStatus.COMPLETED, originCity: "Atlanta", originState: "GA", originZip: "30301", destCity: "Nashville", destState: "TN", destZip: "37201", weight: 36000, equipmentType: "Dry Van", commodity: "Consumer Goods", rate: 1400, distance: 250, posterId: broker.id, carrierId: carrier1.id, pickupDate: new Date("2026-01-10"), deliveryDate: new Date("2026-01-10") } }),
    prisma.load.create({ data: { referenceNumber: "SRL-2026-012", status: LoadStatus.COMPLETED, originCity: "Charlotte", originState: "NC", originZip: "28201", destCity: "Atlanta", destState: "GA", destZip: "30301", weight: 40000, equipmentType: "Reefer", commodity: "Beverages", rate: 1600, distance: 245, posterId: broker.id, carrierId: carrier2.id, pickupDate: new Date("2026-01-12"), deliveryDate: new Date("2026-01-12") } }),
    prisma.load.create({ data: { referenceNumber: "SRL-2026-013", status: LoadStatus.COMPLETED, originCity: "Jacksonville", originState: "FL", originZip: "32099", destCity: "Savannah", destState: "GA", destZip: "31401", weight: 32000, equipmentType: "Flatbed", commodity: "Lumber", rate: 950, distance: 140, posterId: broker.id, carrierId: carrier5.id, pickupDate: new Date("2026-01-18"), deliveryDate: new Date("2026-01-18") } }),
    prisma.load.create({ data: { referenceNumber: "SRL-2026-014", status: LoadStatus.DELIVERED, originCity: "Nashville", originState: "TN", originZip: "37201", destCity: "Birmingham", destState: "AL", destZip: "35201", weight: 38000, equipmentType: "Dry Van", commodity: "Auto Parts", rate: 1100, distance: 190, posterId: broker.id, carrierId: carrier1.id, pickupDate: new Date("2026-01-25"), deliveryDate: new Date("2026-01-25") } }),
    prisma.load.create({ data: { referenceNumber: "SRL-2026-015", status: LoadStatus.POSTED, originCity: "Miami", originState: "FL", originZip: "33101", destCity: "Tampa", destState: "FL", destZip: "33601", weight: 35000, equipmentType: "Reefer", commodity: "Seafood", rate: 1200, distance: 280, posterId: broker.id, pickupDate: new Date("2026-02-14"), deliveryDate: new Date("2026-02-14") } }),

    // NORTHEAST
    prisma.load.create({ data: { referenceNumber: "SRL-2026-016", status: LoadStatus.COMPLETED, originCity: "Newark", originState: "NJ", originZip: "07102", destCity: "Boston", destState: "MA", destZip: "02101", weight: 28000, equipmentType: "Dry Van", commodity: "Retail Merchandise", rate: 1800, distance: 215, posterId: broker.id, carrierId: carrier1.id, pickupDate: new Date("2026-01-08"), deliveryDate: new Date("2026-01-08") } }),
    prisma.load.create({ data: { referenceNumber: "SRL-2026-017", status: LoadStatus.COMPLETED, originCity: "Philadelphia", originState: "PA", originZip: "19101", destCity: "New York", destState: "NY", destZip: "10001", weight: 30000, equipmentType: "Dry Van", commodity: "Paper Products", rate: 850, distance: 95, posterId: broker.id, carrierId: carrier4.id, pickupDate: new Date("2026-01-14"), deliveryDate: new Date("2026-01-14") } }),
    prisma.load.create({ data: { referenceNumber: "SRL-2026-018", status: LoadStatus.DELIVERED, originCity: "Hartford", originState: "CT", originZip: "06101", destCity: "Newark", destState: "NJ", destZip: "07102", weight: 25000, equipmentType: "Reefer", commodity: "Pharmaceuticals", rate: 1300, distance: 120, posterId: broker.id, carrierId: carrier2.id, pickupDate: new Date("2026-01-22"), deliveryDate: new Date("2026-01-22") } }),

    // SOUTH CENTRAL
    prisma.load.create({ data: { referenceNumber: "SRL-2026-019", status: LoadStatus.COMPLETED, originCity: "Houston", originState: "TX", originZip: "77001", destCity: "Dallas", destState: "TX", destZip: "75201", weight: 42000, equipmentType: "Flatbed", commodity: "Oil Equipment", rate: 1500, distance: 240, posterId: broker.id, carrierId: carrier5.id, pickupDate: new Date("2026-01-05"), deliveryDate: new Date("2026-01-05") } }),
    prisma.load.create({ data: { referenceNumber: "SRL-2026-020", status: LoadStatus.COMPLETED, originCity: "Dallas", originState: "TX", originZip: "75201", destCity: "Oklahoma City", destState: "OK", destZip: "73101", weight: 35000, equipmentType: "Dry Van", commodity: "Electronics", rate: 1200, distance: 205, posterId: broker.id, carrierId: carrier1.id, pickupDate: new Date("2026-01-11"), deliveryDate: new Date("2026-01-11") } }),
    prisma.load.create({ data: { referenceNumber: "SRL-2026-021", status: LoadStatus.COMPLETED, originCity: "San Antonio", originState: "TX", originZip: "78201", destCity: "Houston", destState: "TX", destZip: "77001", weight: 40000, equipmentType: "Reefer", commodity: "Fresh Produce", rate: 1100, distance: 200, posterId: broker.id, carrierId: carrier2.id, pickupDate: new Date("2026-01-20"), deliveryDate: new Date("2026-01-20") } }),
    prisma.load.create({ data: { referenceNumber: "SRL-2026-022", status: LoadStatus.POSTED, originCity: "Little Rock", originState: "AR", originZip: "72201", destCity: "New Orleans", destState: "LA", destZip: "70112", weight: 34000, equipmentType: "Dry Van", commodity: "Building Materials", rate: 1350, distance: 380, posterId: broker.id, pickupDate: new Date("2026-02-15"), deliveryDate: new Date("2026-02-16") } }),

    // WEST
    prisma.load.create({ data: { referenceNumber: "SRL-2026-023", status: LoadStatus.COMPLETED, originCity: "Los Angeles", originState: "CA", originZip: "90001", destCity: "Phoenix", destState: "AZ", destZip: "85001", weight: 38000, equipmentType: "Dry Van", commodity: "CPG - Household", rate: 2200, distance: 370, posterId: broker.id, carrierId: carrier1.id, pickupDate: new Date("2026-01-06"), deliveryDate: new Date("2026-01-06") } }),
    prisma.load.create({ data: { referenceNumber: "SRL-2026-024", status: LoadStatus.COMPLETED, originCity: "Seattle", originState: "WA", originZip: "98101", destCity: "Portland", destState: "OR", destZip: "97201", weight: 30000, equipmentType: "Reefer", commodity: "Fresh Fish", rate: 1100, distance: 175, posterId: broker.id, carrierId: carrier2.id, pickupDate: new Date("2026-01-13"), deliveryDate: new Date("2026-01-13") } }),
    prisma.load.create({ data: { referenceNumber: "SRL-2026-025", status: LoadStatus.COMPLETED, originCity: "Denver", originState: "CO", originZip: "80201", destCity: "Las Vegas", destState: "NV", destZip: "89101", weight: 35000, equipmentType: "Flatbed", commodity: "Construction Steel", rate: 2800, distance: 750, posterId: broker.id, carrierId: carrier5.id, pickupDate: new Date("2026-01-19"), deliveryDate: new Date("2026-01-20") } }),
    prisma.load.create({ data: { referenceNumber: "SRL-2026-026", status: LoadStatus.DELIVERED, originCity: "San Francisco", originState: "CA", originZip: "94102", destCity: "Los Angeles", destState: "CA", destZip: "90001", weight: 28000, equipmentType: "Dry Van", commodity: "Tech Equipment", rate: 1600, distance: 380, posterId: broker.id, carrierId: carrier4.id, pickupDate: new Date("2026-01-28"), deliveryDate: new Date("2026-01-28") } }),

    // UPPER MIDWEST
    prisma.load.create({ data: { referenceNumber: "SRL-2026-027", status: LoadStatus.COMPLETED, originCity: "Des Moines", originState: "IA", originZip: "50301", destCity: "Omaha", destState: "NE", destZip: "68101", weight: 40000, equipmentType: "Reefer", commodity: "Meat Products", rate: 950, distance: 140, posterId: broker.id, carrierId: carrier2.id, pickupDate: new Date("2026-01-09"), deliveryDate: new Date("2026-01-09") } }),
    prisma.load.create({ data: { referenceNumber: "SRL-2026-028", status: LoadStatus.COMPLETED, originCity: "Kansas City", originState: "MO", originZip: "64101", destCity: "St. Louis", destState: "MO", destZip: "63101", weight: 36000, equipmentType: "Dry Van", commodity: "Packaged Foods", rate: 800, distance: 250, posterId: broker.id, carrierId: carrier4.id, pickupDate: new Date("2026-01-16"), deliveryDate: new Date("2026-01-16") } }),
    prisma.load.create({ data: { referenceNumber: "SRL-2026-029", status: LoadStatus.COMPLETED, originCity: "Minneapolis", originState: "MN", originZip: "55401", destCity: "Fargo", destState: "ND", destZip: "58102", weight: 32000, equipmentType: "Dry Van", commodity: "Agricultural Parts", rate: 1300, distance: 235, posterId: broker.id, carrierId: carrier1.id, pickupDate: new Date("2026-01-24"), deliveryDate: new Date("2026-01-24") } }),
    prisma.load.create({ data: { referenceNumber: "SRL-2026-030", status: LoadStatus.POSTED, originCity: "Sioux Falls", originState: "SD", originZip: "57101", destCity: "Des Moines", destState: "IA", destZip: "50301", weight: 38000, equipmentType: "Reefer", commodity: "Dairy", rate: 1050, distance: 260, posterId: broker.id, pickupDate: new Date("2026-02-13"), deliveryDate: new Date("2026-02-13") } }),
  ]);

  // ═══════════════════════════════════════════════
  // LOAD TENDERS
  // ═══════════════════════════════════════════════

  await prisma.loadTender.createMany({
    data: [
      // Load 3 (Detroit→Columbus): Tendered to Henderson, awaiting response
      { loadId: loads[2].id, carrierId: cp1.id, status: "OFFERED", offeredRate: 1600, expiresAt: new Date(now + 2 * 24 * 60 * 60 * 1000) },
      // Load 4 (Kalamazoo→Milwaukee): Tendered to Kowalski, awaiting response
      { loadId: loads[3].id, carrierId: cp2.id, status: "OFFERED", offeredRate: 2100, expiresAt: new Date(now + 24 * 60 * 60 * 1000) },
      // Load 7 (Toledo→Fort Wayne): Tendered to Great Lakes Flatbed, they countered
      { loadId: loads[6].id, carrierId: cp5.id, status: "COUNTERED", offeredRate: 1700, counterRate: 1850, respondedAt: new Date(now - 2 * 60 * 60 * 1000), expiresAt: new Date(now + 24 * 60 * 60 * 1000) },
      // Load 10 (Minneapolis→Kalamazoo): Tendered to Henderson, awaiting
      { loadId: loads[9].id, carrierId: cp1.id, status: "OFFERED", offeredRate: 2600, expiresAt: new Date(now + 3 * 24 * 60 * 60 * 1000) },
      // Load 10: Also tendered to Novak
      { loadId: loads[9].id, carrierId: cp4.id, status: "OFFERED", offeredRate: 2600, expiresAt: new Date(now + 3 * 24 * 60 * 60 * 1000) },
      // Load 1 (completed): Was accepted by Henderson
      { loadId: loads[0].id, carrierId: cp1.id, status: "ACCEPTED", offeredRate: 1800, respondedAt: new Date("2026-01-14"), expiresAt: new Date("2026-01-15") },
      // Load 5 (booked): Accepted by Ramirez Auto
      { loadId: loads[4].id, carrierId: cp3.id, status: "ACCEPTED", offeredRate: 1400, respondedAt: new Date("2026-02-07"), expiresAt: new Date("2026-02-08") },
      // Load 2 (in transit): Accepted by Kowalski
      { loadId: loads[1].id, carrierId: cp2.id, status: "ACCEPTED", offeredRate: 2800, respondedAt: new Date("2026-02-06"), expiresAt: new Date("2026-02-07") },
      // Load 3: Also tendered to Novak, he declined
      { loadId: loads[2].id, carrierId: cp4.id, status: "DECLINED", offeredRate: 1600, respondedAt: new Date(now - 6 * 60 * 60 * 1000), expiresAt: new Date(now + 24 * 60 * 60 * 1000) },
      // Old expired tender
      { loadId: loads[6].id, carrierId: cp1.id, status: "EXPIRED", offeredRate: 1650, expiresAt: new Date(now - 24 * 60 * 60 * 1000) },
    ],
  });

  // ═══════════════════════════════════════════════
  // INVOICES
  // ═══════════════════════════════════════════════

  await prisma.invoice.createMany({
    data: [
      { invoiceNumber: "INV-1001", status: "PAID", amount: 1800, factoringFee: 54, advanceRate: 97, advanceAmount: 1746, userId: carrier1.id, loadId: loads[0].id, paidAt: new Date("2026-01-18") },
      { invoiceNumber: "INV-1002", status: "SUBMITTED", amount: 2800, userId: carrier2.id, loadId: loads[1].id },
      { invoiceNumber: "INV-1003", status: "PAID", amount: 1950, factoringFee: 58.5, advanceRate: 97, advanceAmount: 1891.5, userId: carrier1.id, loadId: loads[5].id, paidAt: new Date("2026-02-07") },
      { invoiceNumber: "INV-1004", status: "SUBMITTED", amount: 1500, userId: carrier2.id, loadId: loads[7].id },
      { invoiceNumber: "INV-1005", status: "PAID", amount: 1650, userId: carrier4.id, loadId: loads[8].id, paidAt: new Date("2026-02-02") },
    ],
  });

  // ═══════════════════════════════════════════════
  // CUSTOMERS (Midwest shippers)
  // ═══════════════════════════════════════════════

  const cust1 = await prisma.customer.create({
    data: {
      name: "Great Lakes Manufacturing", contactName: "Robert Chen", email: "rchen@greatlakesmfg.com",
      phone: "(269) 555-8001", address: "1200 Industrial Blvd", city: "Kalamazoo", state: "MI", zip: "49001",
      status: "Active", rating: 5, paymentTerms: "Net 30", creditLimit: 50000,
      notes: "Long-term customer. Auto parts and machinery components. Prefers AM pickups.",
    },
  });

  const cust2 = await prisma.customer.create({
    data: {
      name: "Midwest Fresh Foods Co.", contactName: "Lisa Park", email: "lpark@midwestfresh.com",
      phone: "(616) 555-8002", address: "890 Market St", city: "Grand Rapids", state: "MI", zip: "49503",
      status: "Active", rating: 4, paymentTerms: "Net 15", creditLimit: 75000,
      notes: "CPG customer. Frozen and refrigerated goods. Requires reefer with temp monitoring.",
    },
  });

  const cust3 = await prisma.customer.create({
    data: {
      name: "Motor City Auto Group", contactName: "Derek Williams", email: "dwilliams@motorcityauto.com",
      phone: "(313) 555-8003", address: "4500 Michigan Ave", city: "Detroit", state: "MI", zip: "48210",
      status: "Active", rating: 4, paymentTerms: "Net 30", creditLimit: 40000,
      notes: "Auto dealership group. Regular car hauling needs. Detroit and surrounding metro.",
    },
  });

  const cust4 = await prisma.customer.create({
    data: {
      name: "Heartland CPG Distributors", contactName: "Amanda Foster", email: "afoster@heartlandcpg.com",
      phone: "(312) 555-8004", address: "2200 N Elston Ave", city: "Chicago", state: "IL", zip: "60614",
      status: "Active", rating: 5, paymentTerms: "Net 30", creditLimit: 100000,
      notes: "Major CPG distributor. High volume. Retail delivery to Walmart, Meijer, Kroger.",
    },
  });

  // ═══════════════════════════════════════════════
  // DRIVERS
  // ═══════════════════════════════════════════════

  const driver1 = await prisma.driver.create({
    data: {
      firstName: "Jake", lastName: "Morrison", phone: "(269) 555-9001", email: "jake@silkroutelogistics.ai",
      licenseType: "CDL-A", licenseNumber: "MI-CDL-4421", licenseExpiry: new Date("2028-03-15"),
      status: "ON_ROUTE", currentLocation: "Battle Creek, MI", hireDate: new Date("2025-06-01"),
      safetyScore: 98, violations: 0,
      hosDrivingUsed: 6.5, hosOnDutyUsed: 9.0, hosCycleUsed: 45, hosCycleLimit: 70,
    },
  });

  const driver2 = await prisma.driver.create({
    data: {
      firstName: "Maria", lastName: "Santos", phone: "(269) 555-9002", email: "maria@silkroutelogistics.ai",
      licenseType: "CDL-A", licenseNumber: "MI-CDL-4422", licenseExpiry: new Date("2027-11-20"),
      status: "AVAILABLE", currentLocation: "Kalamazoo, MI", hireDate: new Date("2025-08-15"),
      safetyScore: 95, violations: 1,
      hosDrivingUsed: 0, hosOnDutyUsed: 0, hosCycleUsed: 20, hosCycleLimit: 70,
    },
  });

  const driver3 = await prisma.driver.create({
    data: {
      firstName: "Kevin", lastName: "O'Brien", phone: "(269) 555-9003",
      licenseType: "CDL-A", licenseNumber: "MI-CDL-4423", licenseExpiry: new Date("2027-06-30"),
      status: "OFF_DUTY", currentLocation: "Portage, MI", hireDate: new Date("2025-10-01"),
      safetyScore: 92, violations: 0,
      hosDrivingUsed: 0, hosOnDutyUsed: 0, hosCycleUsed: 55, hosCycleLimit: 70,
    },
  });

  // ═══════════════════════════════════════════════
  // EQUIPMENT (SRL's own + leased)
  // ═══════════════════════════════════════════════

  const equip1 = await prisma.equipment.create({
    data: {
      unitNumber: "SRL-001", type: "Dry Van", year: 2023, make: "Freightliner", model: "Cascadia",
      vin: "1FUJGLDR5XSAA0001", status: "ACTIVE", mileage: 85000,
      nextServiceDate: new Date("2026-03-01"),
    },
  });

  const equip2 = await prisma.equipment.create({
    data: {
      unitNumber: "SRL-T01", type: "53' Dry Van Trailer", year: 2022, make: "Great Dane", model: "Champion",
      vin: "1GRAA0623NW100001", status: "ACTIVE", mileage: 120000,
      nextServiceDate: new Date("2026-04-15"),
    },
  });

  const equip3 = await prisma.equipment.create({
    data: {
      unitNumber: "SRL-T02", type: "53' Reefer Trailer", year: 2024, make: "Utility", model: "3000R",
      vin: "1UYVS2530RM100001", status: "ACTIVE", mileage: 35000,
      nextServiceDate: new Date("2026-06-01"),
    },
  });

  // Assign equipment to drivers
  await prisma.driver.update({ where: { id: driver1.id }, data: { assignedEquipmentId: equip1.id } });

  // ═══════════════════════════════════════════════
  // SHIPMENTS (for tracking page)
  // ═══════════════════════════════════════════════

  await prisma.shipment.createMany({
    data: [
      {
        shipmentNumber: "SHP-2026-001", proNumber: "PRO-88201", bolNumber: "BOL-55001",
        status: "IN_TRANSIT",
        originCity: "Kalamazoo", originState: "MI", originZip: "49008",
        destCity: "Chicago", destState: "IL", destZip: "60601",
        weight: 38000, pieces: 24, commodity: "Auto Parts", equipmentType: "Dry Van",
        rate: 1800, distance: 145, specialInstructions: "Dock delivery. Call 30 min before arrival.",
        pickupDate: new Date("2026-02-08T06:00:00"), deliveryDate: new Date("2026-02-08T14:00:00"),
        actualPickup: new Date("2026-02-08T06:15:00"),
        customerId: cust1.id, driverId: driver1.id, equipmentId: equip1.id,
        lastLocation: "Battle Creek, MI", lastLocationAt: new Date(now - 2 * 60 * 60 * 1000),
        eta: new Date("2026-02-08T13:30:00"),
      },
      {
        shipmentNumber: "SHP-2026-002", proNumber: "PRO-88202", bolNumber: "BOL-55002",
        status: "DISPATCHED",
        originCity: "Grand Rapids", originState: "MI", originZip: "49503",
        destCity: "Indianapolis", destState: "IN", destZip: "46204",
        weight: 42000, pieces: 18, commodity: "Frozen Foods (CPG)", equipmentType: "Reefer",
        rate: 2800, distance: 260, specialInstructions: "Maintain 0°F. Receiver checks temp on arrival.",
        pickupDate: new Date("2026-02-09T07:00:00"), deliveryDate: new Date("2026-02-09T16:00:00"),
        customerId: cust2.id, driverId: driver2.id, equipmentId: equip3.id,
      },
      {
        shipmentNumber: "SHP-2026-003", proNumber: "PRO-88203", bolNumber: "BOL-55003",
        status: "DELIVERED",
        originCity: "Detroit", originState: "MI", originZip: "48210",
        destCity: "Toledo", destState: "OH", destZip: "43605",
        weight: 28000, pieces: 6, commodity: "Vehicles", equipmentType: "Car Hauler",
        rate: 1400, distance: 62,
        pickupDate: new Date("2026-02-06T08:00:00"), deliveryDate: new Date("2026-02-06T11:00:00"),
        actualPickup: new Date("2026-02-06T08:10:00"), actualDelivery: new Date("2026-02-06T10:45:00"),
        customerId: cust3.id, lastLocation: "Toledo, OH", lastLocationAt: new Date("2026-02-06T10:45:00"),
      },
      {
        shipmentNumber: "SHP-2026-004", proNumber: "PRO-88204",
        status: "PENDING",
        originCity: "Chicago", originState: "IL", originZip: "60614",
        destCity: "Kalamazoo", destState: "MI", destZip: "49008",
        weight: 30000, pieces: 40, commodity: "CPG - Retail Goods", equipmentType: "Dry Van",
        rate: 1600, distance: 145,
        pickupDate: new Date("2026-02-10T06:00:00"), deliveryDate: new Date("2026-02-10T12:00:00"),
        customerId: cust4.id,
      },
    ],
  });

  // ═══════════════════════════════════════════════
  // SOPs
  // ═══════════════════════════════════════════════

  await prisma.sOP.createMany({
    data: [
      { title: "Reefer Load Procedures", category: "Operations", version: "2.1", author: "Whaider Haider", description: "Standard operating procedure for temperature-controlled freight.", pages: 8 },
      { title: "Car Hauling Safety Checklist", category: "Safety", version: "1.0", author: "Marcus Rivera", description: "Pre-trip and loading safety checklist for auto transport.", pages: 4 },
      { title: "Customer Onboarding Process", category: "Sales", version: "1.3", author: "Wasih Haider", description: "Steps for onboarding new Midwest shipper accounts.", pages: 6 },
      { title: "Carrier Vetting & Compliance", category: "Compliance", version: "3.0", author: "Priya Sharma", description: "FMCSA verification, insurance, and authority checks.", pages: 12 },
      { title: "Claims & Dispute Resolution", category: "Operations", version: "1.1", author: "Whaider Haider", description: "Process for handling freight claims and carrier disputes.", pages: 5 },
    ],
  });

  // ═══════════════════════════════════════════════
  // MESSAGES
  // ═══════════════════════════════════════════════

  await prisma.message.createMany({
    data: [
      // Broker (whaider@) ↔ Carrier 1 (srl@) — Henderson Trucking
      { senderId: broker.id, receiverId: carrier1.id, content: "Mike, I have a Minneapolis to Kalamazoo load coming up. 30K lbs dry van, $2,600. Interested?", createdAt: new Date(now - 24 * 60 * 60 * 1000) },
      { senderId: carrier1.id, receiverId: broker.id, content: "That's a good lane for me. Send the tender, I'll review.", createdAt: new Date(now - 24 * 60 * 60 * 1000 + 15 * 60 * 1000) },
      { senderId: broker.id, receiverId: carrier1.id, content: "Tender sent. Also, great work on the Kalamazoo-Chicago run last week — on time and no issues.", createdAt: new Date(now - 24 * 60 * 60 * 1000 + 30 * 60 * 1000) },
      { senderId: carrier1.id, receiverId: broker.id, content: "Thanks Whaider. That lane works perfectly with my schedule. Happy to run it weekly.", createdAt: new Date(now - 24 * 60 * 60 * 1000 + 45 * 60 * 1000) },

      // Broker (whaider@) ↔ Carrier 2 (gold@) — Kowalski Cold Freight
      { senderId: broker.id, receiverId: carrier2.id, loadId: loads[1].id, content: "Sarah, the Grand Rapids reefer load is confirmed for tomorrow. Pickup at Midwest Fresh Foods, dock 4, 7 AM.", createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000) },
      { senderId: carrier2.id, receiverId: broker.id, loadId: loads[1].id, content: "Got it. What temp does the receiver need?", createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000) },
      { senderId: broker.id, receiverId: carrier2.id, loadId: loads[1].id, content: "0°F for frozen. They'll check on arrival. Call me if any issues.", createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000) },
      { senderId: carrier2.id, receiverId: broker.id, content: "Also — I have capacity for a Kalamazoo to Milwaukee reefer run next week. Let me know if anything comes up.", createdAt: new Date(now - 12 * 60 * 60 * 1000) },

      // Broker (whaider@) ↔ Carrier 3 (silver@) — Ramirez Auto Transport
      { senderId: broker.id, receiverId: carrier3.id, content: "Carlos, Motor City Auto Group needs 6 vehicles moved Detroit to Toledo on the 9th. Can you handle it?", createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000) },
      { senderId: carrier3.id, receiverId: broker.id, content: "Absolutely. My open hauler can take 7. Send the details.", createdAt: new Date(now - 3 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000) },

      // Admin (admin@) ↔ Broker (whaider@) — internal SRL communication
      { senderId: admin.id, receiverId: broker.id, content: "Whaider, the new carrier Novak Hauling is approved. They're based in Lansing, MI — dry van only. Add them to the rotation.", createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000) },
      { senderId: broker.id, receiverId: admin.id, content: "Got it, Wasih. I already tendered them the Detroit-Columbus load. They have good rates.", createdAt: new Date(now - 4 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000) },
      { senderId: admin.id, receiverId: broker.id, content: "Good. Also please review the Great Lakes Flatbed counter on the Toledo-Fort Wayne steel load. They want $1,850 vs our $1,700.", createdAt: new Date(now - 8 * 60 * 60 * 1000) },

      // Dispatch (dispatch@) ↔ Broker (whaider@)
      { senderId: dispatch.id, receiverId: broker.id, content: "Whaider, Jake Morrison is 2 hours out from Chicago on SHP-2026-001. The receiver at the warehouse confirmed dock 7.", createdAt: new Date(now - 3 * 60 * 60 * 1000) },
      { senderId: broker.id, receiverId: dispatch.id, content: "Perfect. Once that delivers, see if he can deadhead to Milwaukee for the Kalamazoo-Milwaukee pickup tomorrow.", createdAt: new Date(now - 3 * 60 * 60 * 1000 + 10 * 60 * 1000) },

      // Accounting (accounting@) ↔ Broker (whaider@)
      { senderId: accounting.id, receiverId: broker.id, content: "Whaider, INV-1002 from Kowalski Cold Freight is $2,800 for the GR-Indy reefer load. Should I process?", createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000) },
      { senderId: broker.id, receiverId: accounting.id, content: "Yes, Priya. Confirmed — that matches the tender rate. Go ahead and approve.", createdAt: new Date(now - 5 * 24 * 60 * 60 * 1000 + 15 * 60 * 1000) },

      // Admin (admin@) ↔ Dispatch (dispatch@)
      { senderId: admin.id, receiverId: dispatch.id, content: "Marcus, can you check on driver availability for next week? We have 4 loads that need covering.", createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000) },
      { senderId: dispatch.id, receiverId: admin.id, content: "Will do. Jake and Maria are both available after Tuesday. Kevin is off until Thursday.", createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000 + 20 * 60 * 1000) },

      // Admin (admin@) ↔ Carrier 1 (srl@) — direct executive contact
      { senderId: admin.id, receiverId: carrier1.id, content: "Mike, thanks for maintaining Platinum status. Your on-time rate is exceptional. We're sending you a $150 weekly bonus.", createdAt: new Date(now - 6 * 24 * 60 * 60 * 1000) },
      { senderId: carrier1.id, receiverId: admin.id, content: "Thank you Wasih! The Silk Route partnership has been great. Looking forward to more lanes.", createdAt: new Date(now - 6 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000) },
    ],
  });

  // ═══════════════════════════════════════════════
  // NOTIFICATIONS
  // ═══════════════════════════════════════════════

  await prisma.notification.createMany({
    data: [
      // Admin notifications
      { userId: admin.id, type: "SYSTEM", title: "New Carrier Application", message: "Novak Hauling LLC has completed onboarding. Review and approve.", actionUrl: "/dashboard/settings" },
      { userId: admin.id, type: "TENDER", title: "Counter Offer Received", message: "Great Lakes Flatbed countered Toledo→Fort Wayne at $1,850 (offered $1,700).", actionUrl: "/dashboard/loads" },
      // Broker notifications
      { userId: broker.id, type: "TENDER", title: "Tender Declined", message: "Novak Hauling declined Detroit→Columbus load (SRL-2026-003).", actionUrl: "/dashboard/loads" },
      { userId: broker.id, type: "LOAD", title: "Load Delivered", message: "SRL-2026-006 Grand Rapids→Chicago delivered on time.", actionUrl: "/dashboard/loads" },
      // Carrier notifications
      { userId: carrier1.id, type: "TENDER", title: "New Load Tender", message: "Minneapolis→Kalamazoo, $2,600, Dry Van. Review and accept.", actionUrl: "/dashboard/loads" },
      { userId: carrier1.id, type: "PAYMENT", title: "Payment Received", message: "Invoice INV-1003 paid. $1,891.50 deposited.", actionUrl: "/dashboard/invoices", readAt: new Date() },
      { userId: carrier1.id, type: "SCORECARD", title: "Weekly Scorecard", message: "Your score is 98.7%. Platinum tier maintained!", actionUrl: "/dashboard/scorecard" },
      { userId: carrier1.id, type: "BONUS", title: "Bonus Earned", message: "You earned a $150 weekly performance bonus.", actionUrl: "/dashboard/revenue" },
      { userId: carrier2.id, type: "TENDER", title: "New Load Tender", message: "Kalamazoo→Milwaukee, $2,100, Reefer. Review and accept.", actionUrl: "/dashboard/loads" },
      { userId: carrier2.id, type: "SCORECARD", title: "Weekly Scorecard", message: "Your score is 95.4%. Gold tier maintained!", actionUrl: "/dashboard/scorecard" },
      { userId: carrier3.id, type: "LOAD", title: "Load Booked", message: "Detroit→Toledo car haul confirmed for Feb 9.", actionUrl: "/dashboard/loads" },
      { userId: carrier4.id, type: "ONBOARDING", title: "Complete Your Profile", message: "Upload your authority document to complete onboarding.", actionUrl: "/dashboard/settings" },
    ],
  });

  // ═══════════════════════════════════════════════
  // BROKER INTEGRATIONS
  // ═══════════════════════════════════════════════

  await prisma.brokerIntegration.createMany({
    data: [
      { name: "McLeod Software", provider: "mcleod", status: "INACTIVE" },
      { name: "DAT Freight & Analytics", provider: "dat", status: "INACTIVE" },
      { name: "Turvo", provider: "turvo", status: "INACTIVE" },
    ],
  });

  console.log(`
Seed complete:
  Users:       10 (5 internal + 5 carriers) — all @silkroutelogistics.ai
  Carriers:    5 profiles (Platinum, 2× Gold, Silver, Bronze)
  Loads:       30 (across 6 regions: Great Lakes, Southeast, Northeast, South Central, West, Upper Midwest)
  Tenders:     10 (4 OFFERED, 3 ACCEPTED, 1 COUNTERED, 1 DECLINED, 1 EXPIRED)
  Invoices:    5
  Customers:   4 Midwest shippers
  Drivers:     3
  Equipment:   3 (1 tractor + 2 trailers)
  Shipments:   4
  SOPs:        5
  Messages:    22 (across 8 conversation threads — broker, admin, dispatch, accounting, carriers)
  Notifications: 12

  Demo Logins (password: password123):
    admin@silkroutelogistics.ai       → Admin (full access)
    whaider@silkroutelogistics.ai     → Broker (employee features)
    dispatch@silkroutelogistics.ai    → Dispatch
    operations@silkroutelogistics.ai  → Operations
    accounting@silkroutelogistics.ai  → Accounting
    srl@silkroutelogistics.ai         → Carrier: Henderson Trucking (Platinum)
    gold@silkroutelogistics.ai        → Carrier: Kowalski Cold Freight (Gold)
    silver@silkroutelogistics.ai      → Carrier: Ramirez Auto Transport (Silver)
    bronze@silkroutelogistics.ai      → Carrier: Novak Hauling (Bronze)
    flatbed@silkroutelogistics.ai     → Carrier: Great Lakes Flatbed (Gold)
  `);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
