import { PrismaClient, UserRole, CarrierTier, LoadStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Clean existing data
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
  await prisma.user.deleteMany();

  const hash = await bcrypt.hash("password123", 10);

  // ── Users ──────────────────────────────────────────
  const admin = await prisma.user.create({
    data: {
      email: "admin@silkroute.com", passwordHash: hash,
      firstName: "Admin", lastName: "User", company: "Silk Route Logistics",
      role: UserRole.ADMIN, isVerified: true,
    },
  });

  const broker = await prisma.user.create({
    data: {
      email: "broker@example.com", passwordHash: hash,
      firstName: "Jane", lastName: "Mitchell", company: "Fast Freight Brokerage",
      role: UserRole.BROKER, isVerified: true,
    },
  });

  const carrier1 = await prisma.user.create({
    data: {
      email: "platinum@example.com", passwordHash: hash,
      firstName: "Mike", lastName: "Platinum", company: "Elite Haulers Inc",
      role: UserRole.CARRIER, isVerified: true, phone: "(555) 100-0001",
    },
  });

  const carrier2 = await prisma.user.create({
    data: {
      email: "gold@example.com", passwordHash: hash,
      firstName: "Sarah", lastName: "Gold", company: "Golden Transport LLC",
      role: UserRole.CARRIER, isVerified: true, phone: "(555) 200-0002",
    },
  });

  const carrier3 = await prisma.user.create({
    data: {
      email: "bronze@example.com", passwordHash: hash,
      firstName: "Tom", lastName: "Bronze", company: "New Carrier Co",
      role: UserRole.CARRIER, isVerified: true, phone: "(555) 300-0003",
    },
  });

  // ── Carrier Profiles ──────────────────────────────
  const cp1 = await prisma.carrierProfile.create({
    data: {
      userId: carrier1.id, mcNumber: "MC-100001", dotNumber: "DOT-200001",
      insuranceExpiry: new Date("2027-06-15"), safetyScore: 99,
      tier: CarrierTier.PLATINUM,
      equipmentTypes: ["Dry Van", "Reefer", "Flatbed"],
      operatingRegions: ["Southeast", "Northeast", "Midwest"],
      onboardingStatus: "APPROVED", approvedAt: new Date("2025-01-15"),
      w9Uploaded: true, insuranceCertUploaded: true, authorityDocUploaded: true,
    },
  });

  const cp2 = await prisma.carrierProfile.create({
    data: {
      userId: carrier2.id, mcNumber: "MC-100002", dotNumber: "DOT-200002",
      insuranceExpiry: new Date("2027-03-20"), safetyScore: 96,
      tier: CarrierTier.GOLD,
      equipmentTypes: ["Dry Van", "Reefer"],
      operatingRegions: ["West", "Southwest"],
      onboardingStatus: "APPROVED", approvedAt: new Date("2025-03-01"),
      w9Uploaded: true, insuranceCertUploaded: true, authorityDocUploaded: true,
    },
  });

  const cp3 = await prisma.carrierProfile.create({
    data: {
      userId: carrier3.id, mcNumber: "MC-100003", dotNumber: "DOT-200003",
      insuranceExpiry: new Date("2026-12-01"), safetyScore: 82,
      tier: CarrierTier.BRONZE,
      equipmentTypes: ["Dry Van"],
      operatingRegions: ["Midwest"],
      onboardingStatus: "APPROVED", approvedAt: new Date("2025-11-01"),
      w9Uploaded: true, insuranceCertUploaded: true, authorityDocUploaded: false,
    },
  });

  // ── Scorecards (last 4 weeks for each carrier) ────
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  const scorecardData = [
    // Platinum carrier - consistently high
    { carrierId: cp1.id, tier: CarrierTier.PLATINUM, scores: [
      { otp: 99, otd: 99, comm: 98, claim: 0.5, doc: 99, accept: 97, gps: 99, week: 0 },
      { otp: 98, otd: 99, comm: 97, claim: 0.8, doc: 98, accept: 96, gps: 98, week: 1 },
      { otp: 99, otd: 98, comm: 99, claim: 0.3, doc: 99, accept: 98, gps: 99, week: 2 },
      { otp: 97, otd: 99, comm: 98, claim: 0.6, doc: 97, accept: 95, gps: 98, week: 3 },
    ]},
    // Gold carrier - strong
    { carrierId: cp2.id, tier: CarrierTier.GOLD, scores: [
      { otp: 96, otd: 97, comm: 94, claim: 1.5, doc: 95, accept: 93, gps: 96, week: 0 },
      { otp: 95, otd: 96, comm: 95, claim: 1.8, doc: 94, accept: 92, gps: 95, week: 1 },
      { otp: 97, otd: 95, comm: 93, claim: 2.0, doc: 96, accept: 94, gps: 97, week: 2 },
      { otp: 94, otd: 96, comm: 96, claim: 1.2, doc: 93, accept: 91, gps: 94, week: 3 },
    ]},
    // Bronze carrier - improving
    { carrierId: cp3.id, tier: CarrierTier.BRONZE, scores: [
      { otp: 85, otd: 82, comm: 80, claim: 5, doc: 78, accept: 75, gps: 80, week: 0 },
      { otp: 82, otd: 80, comm: 78, claim: 6, doc: 75, accept: 72, gps: 78, week: 1 },
      { otp: 80, otd: 78, comm: 75, claim: 7, doc: 72, accept: 70, gps: 75, week: 2 },
      { otp: 78, otd: 76, comm: 73, claim: 8, doc: 70, accept: 68, gps: 73, week: 3 },
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

  // ── Bonuses ────────────────────────────────────────
  await prisma.carrierBonus.createMany({
    data: [
      { carrierId: cp1.id, type: "PERFORMANCE", amount: 450, period: "2026-01", status: "PAID", description: "Platinum tier monthly bonus" },
      { carrierId: cp1.id, type: "PERFORMANCE", amount: 150, period: "2026-W05", status: "PENDING", description: "Weekly performance bonus" },
      { carrierId: cp1.id, type: "REFERRAL", amount: 200, status: "APPROVED", description: "Referred Golden Transport LLC" },
      { carrierId: cp2.id, type: "PERFORMANCE", amount: 225, period: "2026-01", status: "PAID", description: "Gold tier monthly bonus" },
      { carrierId: cp2.id, type: "VOLUME", amount: 100, period: "2026-01", status: "APPROVED", description: "50+ loads milestone" },
    ],
  });

  // ── Loads ──────────────────────────────────────────
  const loads = await Promise.all([
    prisma.load.create({
      data: {
        referenceNumber: "SRL-2026-001", status: LoadStatus.COMPLETED,
        originCity: "Atlanta", originState: "GA", originZip: "30301",
        destCity: "Miami", destState: "FL", destZip: "33101",
        weight: 42000, equipmentType: "Dry Van", commodity: "Electronics",
        rate: 2800, distance: 662, posterId: broker.id, carrierId: carrier1.id,
        pickupDate: new Date("2026-01-20"), deliveryDate: new Date("2026-01-21"),
      },
    }),
    prisma.load.create({
      data: {
        referenceNumber: "SRL-2026-002", status: LoadStatus.IN_TRANSIT,
        originCity: "Dallas", originState: "TX", originZip: "75201",
        destCity: "Chicago", destState: "IL", destZip: "60601",
        weight: 38000, equipmentType: "Reefer", commodity: "Produce",
        rate: 3500, distance: 920, posterId: broker.id, carrierId: carrier1.id,
        pickupDate: new Date("2026-02-06"), deliveryDate: new Date("2026-02-08"),
      },
    }),
    prisma.load.create({
      data: {
        referenceNumber: "SRL-2026-003", status: LoadStatus.POSTED,
        originCity: "Los Angeles", originState: "CA", originZip: "90001",
        destCity: "Phoenix", destState: "AZ", destZip: "85001",
        weight: 35000, equipmentType: "Flatbed", commodity: "Steel",
        rate: 1900, distance: 373, posterId: broker.id,
        pickupDate: new Date("2026-02-10"), deliveryDate: new Date("2026-02-11"),
      },
    }),
    prisma.load.create({
      data: {
        referenceNumber: "SRL-2026-004", status: LoadStatus.POSTED,
        originCity: "Seattle", originState: "WA", originZip: "98101",
        destCity: "Portland", destState: "OR", destZip: "97201",
        weight: 28000, equipmentType: "Dry Van", commodity: "Consumer Goods",
        rate: 1200, distance: 174, posterId: broker.id,
        pickupDate: new Date("2026-02-12"), deliveryDate: new Date("2026-02-12"),
      },
    }),
    prisma.load.create({
      data: {
        referenceNumber: "SRL-2026-005", status: LoadStatus.BOOKED,
        originCity: "Denver", originState: "CO", originZip: "80201",
        destCity: "Kansas City", destState: "MO", destZip: "64101",
        weight: 40000, equipmentType: "Reefer", commodity: "Frozen Foods",
        rate: 2200, distance: 606, posterId: broker.id, carrierId: carrier2.id,
        pickupDate: new Date("2026-02-09"), deliveryDate: new Date("2026-02-10"),
      },
    }),
  ]);

  // ── Load Tenders ──────────────────────────────────
  await prisma.loadTender.createMany({
    data: [
      {
        loadId: loads[2].id, carrierId: cp1.id, status: "OFFERED",
        offeredRate: 1900, expiresAt: new Date(now + 2 * 24 * 60 * 60 * 1000),
      },
      {
        loadId: loads[3].id, carrierId: cp2.id, status: "OFFERED",
        offeredRate: 1200, expiresAt: new Date(now + 24 * 60 * 60 * 1000),
      },
      {
        loadId: loads[0].id, carrierId: cp1.id, status: "ACCEPTED",
        offeredRate: 2800, respondedAt: new Date("2026-01-19"),
        expiresAt: new Date("2026-01-20"),
      },
    ],
  });

  // ── Invoices ──────────────────────────────────────
  await prisma.invoice.createMany({
    data: [
      {
        invoiceNumber: "INV-1001", status: "PAID", amount: 2800,
        factoringFee: 84, advanceRate: 97, advanceAmount: 2716,
        userId: carrier1.id, loadId: loads[0].id,
        paidAt: new Date("2026-01-25"),
      },
      {
        invoiceNumber: "INV-1002", status: "SUBMITTED", amount: 3500,
        userId: carrier1.id, loadId: loads[1].id,
      },
      {
        invoiceNumber: "INV-1003", status: "FUNDED", amount: 2200,
        factoringFee: 66, advanceRate: 95, advanceAmount: 2090,
        userId: carrier2.id, loadId: loads[4].id,
      },
    ],
  });

  // ── Messages ──────────────────────────────────────
  await prisma.message.createMany({
    data: [
      { senderId: broker.id, receiverId: carrier1.id, loadId: loads[1].id, content: "Hi Mike, the Dallas-Chicago load is confirmed. Pickup at 8 AM at the warehouse on Main St.", createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000) },
      { senderId: carrier1.id, receiverId: broker.id, loadId: loads[1].id, content: "Got it, Jane. I'll be there at 7:30 AM. Any special handling instructions for the produce?", createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000 + 30 * 60 * 1000) },
      { senderId: broker.id, receiverId: carrier1.id, loadId: loads[1].id, content: "Temperature must stay at 34°F. Receiver will check on arrival.", createdAt: new Date(now - 2 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000) },
      { senderId: broker.id, receiverId: carrier2.id, content: "Sarah, I have a new load from Denver to KC. Interested?", createdAt: new Date(now - 24 * 60 * 60 * 1000) },
      { senderId: carrier2.id, receiverId: broker.id, content: "Yes! Send me the details.", createdAt: new Date(now - 24 * 60 * 60 * 1000 + 15 * 60 * 1000) },
    ],
  });

  // ── Notifications ─────────────────────────────────
  await prisma.notification.createMany({
    data: [
      { userId: carrier1.id, type: "TENDER", title: "New Load Tender", message: "New load available: LA → Phoenix, $1,900", actionUrl: "/dashboard/loads" },
      { userId: carrier1.id, type: "PAYMENT", title: "Payment Received", message: "Invoice INV-1001 has been paid. $2,716 deposited.", actionUrl: "/dashboard/invoices", readAt: new Date() },
      { userId: carrier1.id, type: "SCORECARD", title: "Weekly Scorecard", message: "Your weekly score is 98.7%. Platinum tier maintained!", actionUrl: "/dashboard/scorecard" },
      { userId: carrier1.id, type: "BONUS", title: "Bonus Earned", message: "You earned a $150 weekly performance bonus.", actionUrl: "/dashboard/revenue" },
      { userId: carrier2.id, type: "TENDER", title: "New Load Tender", message: "New load available: Seattle → Portland, $1,200", actionUrl: "/dashboard/loads" },
      { userId: carrier2.id, type: "SCORECARD", title: "Weekly Scorecard", message: "Your weekly score is 95.4%. Keep it up for Gold tier!", actionUrl: "/dashboard/scorecard" },
      { userId: carrier3.id, type: "ONBOARDING", title: "Complete Your Profile", message: "Upload your authority document to complete onboarding.", actionUrl: "/dashboard/settings" },
    ],
  });

  // ── Broker Integrations ───────────────────────────
  await prisma.brokerIntegration.createMany({
    data: [
      { name: "McLeod Software", provider: "mcleod", status: "INACTIVE" },
      { name: "TMW Systems", provider: "tmw", status: "INACTIVE" },
      { name: "MercuryGate", provider: "mercurygate", status: "INACTIVE" },
      { name: "DAT Freight & Analytics", provider: "dat", status: "INACTIVE" },
    ],
  });

  console.log("Seed complete: 5 users, 3 carrier profiles, scorecards, bonuses, 5 loads, tenders, invoices, messages, notifications, integrations");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
