import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  // Clean all tables via TRUNCATE CASCADE
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename != '_prisma_migrations'
  `;
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${tables.map(t => `"${t.tablename}"`).join(", ")} CASCADE`);

  const now = new Date();
  const day = 24 * 60 * 60 * 1000;

  const hash = await bcrypt.hash("Wasishah3089$", 12);

  // Single admin account
  const admin = await prisma.user.create({
    data: {
      email: "whaider@silkroutelogistics.ai",
      passwordHash: hash,
      firstName: "Wasi",
      lastName: "Haider",
      company: "Silk Route Logistics",
      role: UserRole.ADMIN,
      isVerified: true,
      phone: "(269) 220-6760",
    },
  });

  // Account Executive — Noor
  const broker = await prisma.user.create({
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
      passwordChangedAt: now,
    },
  });

  // Dispatcher
  const dispatcher = await prisma.user.create({
    data: {
      email: "dispatch@silkroutelogistics.ai",
      passwordHash: hash,
      firstName: "Marcus",
      lastName: "Johnson",
      company: "Silk Route Logistics",
      role: UserRole.DISPATCH,
      isVerified: true,
      phone: "(269) 555-0102",
    },
  });

  // Accountant
  const accountant = await prisma.user.create({
    data: {
      email: "accounting@silkroutelogistics.ai",
      passwordHash: hash,
      firstName: "Priya",
      lastName: "Patel",
      company: "Silk Route Logistics",
      role: UserRole.ACCOUNTING,
      isVerified: true,
      phone: "(269) 555-0103",
    },
  });

  // Shipper user — linked to Customer after customer creation
  const shipperUser = await prisma.user.create({
    data: {
      email: "shipper@acmemfg.com",
      passwordHash: hash,
      firstName: "Robert",
      lastName: "Mitchell",
      company: "Acme Manufacturing",
      role: UserRole.SHIPPER,
      isVerified: true,
      phone: "(313) 555-1000",
    },
  });

  // Personal shipper account
  const shipperUser2 = await prisma.user.create({
    data: {
      email: "wasihaider3089@gmail.com",
      passwordHash: hash,
      firstName: "Wasi",
      lastName: "Haider",
      company: "Haider Logistics",
      role: UserRole.SHIPPER,
      isVerified: true,
      phone: "(269) 220-6760",
    },
  });

  // Aliases for backward compatibility in seed references
  const carrierUser2 = carrierUser;
  const carrierUser3 = carrierUser;
  const carrierUser4 = carrierUser;
  const carrierUser5 = carrierUser;

  const cp1 = await prisma.carrierProfile.create({
    data: {
      userId: carrierUser.id,
      mcNumber: "MC-1794414",
      dotNumber: "4526880",
      companyName: "SRL Transport LLC",
      contactName: "SRL Carrier",
      contactPhone: "(269) 555-0200",
      contactEmail: "carrier@silkroutelogistics.ai",
      tier: "PLATINUM",
      cppTier: "PLATINUM",
      cppTotalLoads: 342,
      cppTotalMiles: 187500,
      equipmentTypes: ["Dry Van", "Reefer", "Flatbed"],
      operatingRegions: ["Midwest", "Northeast", "Southeast", "Southwest", "West Coast", "South Central"],
      onboardingStatus: "APPROVED",
      status: "APPROVED",
      approvedAt: new Date(),
      w9Uploaded: true,
      insuranceCertUploaded: true,
      authorityDocUploaded: true,
      insuranceExpiry: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      safetyScore:98,
      address: "1000 Logistics Pkwy",
      city: "Kalamazoo",
      state: "MI",
      zip: "49001",
      numberOfTrucks: 25,
      paymentPreference: "FLASH",
    },
  });

  // All loads use single carrier profile
  const cp2 = cp1;
  const cp3 = cp1;
  const cp4 = cp1;
  const cp5 = cp1;

  // ═══════════════════════════════════════════════
  // CUSTOMERS
  // ═══════════════════════════════════════════════

  const cust1 = await prisma.customer.create({
    data: {
      name: "Acme Manufacturing",
      type: "SHIPPER",
      address: "1500 Industrial Pkwy",
      city: "Detroit",
      state: "MI",
      zip: "48201",
      contactName: "Robert Mitchell",
      email: "rmitchell@acmemfg.com",
      phone: "(313) 555-1000",
      creditLimit: 500000,
      creditStatus: "APPROVED",
      paymentTerms: "Net 30",
      avgLoadsPerMonth: 45,
      preferredEquipment: ["Dry Van", "Flatbed"],
      rating: 5,
      industry: "Manufacturing",
      onboardingStatus: "APPROVED",
      status: "Active",
      userId: shipperUser.id, // Link to shipper portal user
    },
  });

  const cust2 = await prisma.customer.create({
    data: {
      name: "Great Lakes Foods",
      type: "SHIPPER",
      address: "2200 Lakefront Dr",
      city: "Milwaukee",
      state: "WI",
      zip: "53202",
      contactName: "Linda Kowalski",
      email: "lkowalski@greatlakesfoods.com",
      phone: "(414) 555-2000",
      creditLimit: 250000,
      creditStatus: "APPROVED",
      paymentTerms: "Net 30",
      avgLoadsPerMonth: 25,
      preferredEquipment: ["Reefer"],
      rating: 4,
      industry: "Food & Beverage",
      onboardingStatus: "APPROVED",
      status: "Active",
    },
  });

  const cust3 = await prisma.customer.create({
    data: {
      name: "Pacific Distributors",
      type: "SHIPPER",
      address: "3300 Harbor Blvd",
      city: "Seattle",
      state: "WA",
      zip: "98101",
      contactName: "David Park",
      email: "dpark@pacificdist.com",
      phone: "(206) 555-3000",
      creditLimit: 200000,
      creditStatus: "APPROVED",
      paymentTerms: "Net 30",
      avgLoadsPerMonth: 20,
      preferredEquipment: ["Dry Van", "Reefer"],
      rating: 4,
      industry: "Consumer Goods",
      onboardingStatus: "APPROVED",
      status: "Active",
    },
  });

  const cust4 = await prisma.customer.create({
    data: {
      name: "Southern Paper Co",
      type: "SHIPPER",
      address: "4400 Paper Mill Rd",
      city: "Birmingham",
      state: "AL",
      zip: "35203",
      contactName: "James Calloway",
      email: "jcalloway@southernpaper.com",
      phone: "(205) 555-4000",
      creditLimit: 100000,
      creditStatus: "APPROVED",
      paymentTerms: "Net 15",
      avgLoadsPerMonth: 10,
      preferredEquipment: ["Dry Van", "Flatbed"],
      rating: 3,
      industry: "Paper & Packaging",
      onboardingStatus: "APPROVED",
      status: "Active",
    },
  });

  const cust5 = await prisma.customer.create({
    data: {
      name: "Lone Star Chemicals",
      type: "SHIPPER",
      address: "5500 Refinery Rd",
      city: "Houston",
      state: "TX",
      zip: "77001",
      contactName: "William Brooks",
      email: "wbrooks@lonestarchemicals.com",
      phone: "(713) 555-5000",
      creditLimit: 350000,
      creditStatus: "APPROVED",
      paymentTerms: "Net 30",
      avgLoadsPerMonth: 30,
      preferredEquipment: ["Dry Van"],
      rating: 5,
      industry: "Chemicals",
      onboardingStatus: "APPROVED",
      status: "Active",
      notes: "Hazmat shipper",
    },
  });

  // Link personal shipper account to a customer
  const custPersonal = await prisma.customer.create({
    data: {
      name: "Haider Logistics",
      type: "SHIPPER",
      address: "100 Main St",
      city: "Kalamazoo",
      state: "MI",
      zip: "49007",
      contactName: "Wasi Haider",
      email: "wasihaider3089@gmail.com",
      phone: "(269) 220-6760",
      creditLimit: 250000,
      creditStatus: "APPROVED",
      paymentTerms: "Net 30",
      avgLoadsPerMonth: 20,
      preferredEquipment: ["Dry Van", "Reefer"],
      rating: 5,
      industry: "General Freight",
      onboardingStatus: "APPROVED",
      status: "Active",
      userId: shipperUser2.id,
    },
  });

  // ═══════════════════════════════════════════════
  // CUSTOMER CONTACTS
  // ═══════════════════════════════════════════════

  await prisma.customerContact.createMany({
    data: [
      // Acme Manufacturing
      { customerId: cust1.id, name: "Robert Mitchell", title: "Logistics Manager", email: "rmitchell@acmemfg.com", phone: "(313) 555-1000", isPrimary: true },
      { customerId: cust1.id, name: "Susan Peters", title: "AP Specialist", email: "speters@acmemfg.com", phone: "(313) 555-1001", isPrimary: false },

      // Great Lakes Foods
      { customerId: cust2.id, name: "Linda Kowalski", title: "Shipping Coordinator", email: "lkowalski@greatlakesfoods.com", phone: "(414) 555-2000", isPrimary: true },
      { customerId: cust2.id, name: "Mark Davis", title: "Accounts Payable", email: "mdavis@greatlakesfoods.com", phone: "(414) 555-2001", isPrimary: false },

      // Pacific Distributors
      { customerId: cust3.id, name: "David Park", title: "Distribution Manager", email: "dpark@pacificdist.com", phone: "(206) 555-3000", isPrimary: true },
      { customerId: cust3.id, name: "Emily Chen", title: "Billing Coordinator", email: "echen@pacificdist.com", phone: "(206) 555-3001", isPrimary: false },

      // Southern Paper Co
      { customerId: cust4.id, name: "James Calloway", title: "Freight Manager", email: "jcalloway@southernpaper.com", phone: "(205) 555-4000", isPrimary: true },
      { customerId: cust4.id, name: "Rachel Moore", title: "AP Manager", email: "rmoore@southernpaper.com", phone: "(205) 555-4001", isPrimary: false },

      // Lone Star Chemicals
      { customerId: cust5.id, name: "William Brooks", title: "Transportation Director", email: "wbrooks@lonestarchemicals.com", phone: "(713) 555-5000", isPrimary: true },
      { customerId: cust5.id, name: "Patricia Martinez", title: "Accounts Payable", email: "pmartinez@lonestarchemicals.com", phone: "(713) 555-5001", isPrimary: false },
    ],
  });

  // ═══════════════════════════════════════════════
  // FLEET - TRUCKS
  // ═══════════════════════════════════════════════

  const trucks = [];
  trucks.push(await prisma.truck.create({
    data: {
      unitNumber: "T-101",
      vin: "1FUJGLDR7CLBP1234",
      make: "Freightliner",
      model: "Cascadia",
      year: 2021,
      type: "SLEEPER",
      status: "ACTIVE",
      licensePlate: "MI-1234",
      registrationExpiry: new Date(now.getTime() + 180 * day),
    },
  }));

  trucks.push(await prisma.truck.create({
    data: {
      unitNumber: "T-102",
      vin: "1XKYDP9X9KJ123456",
      make: "Kenworth",
      model: "T680",
      year: 2022,
      type: "SLEEPER",
      status: "ACTIVE",
      licensePlate: "MI-1235",
      registrationExpiry: new Date(now.getTime() + 210 * day),
    },
  }));

  trucks.push(await prisma.truck.create({
    data: {
      unitNumber: "T-103",
      vin: "1NP5DB9X9MN234567",
      make: "Peterbilt",
      model: "579",
      year: 2020,
      type: "SLEEPER",
      status: "ACTIVE",
      licensePlate: "MI-1236",
      registrationExpiry: new Date(now.getTime() + 150 * day),
    },
  }));

  trucks.push(await prisma.truck.create({
    data: {
      unitNumber: "T-104",
      vin: "4V4NC9EH7LN345678",
      make: "Volvo",
      model: "VNL 860",
      year: 2023,
      type: "SLEEPER",
      status: "IN_SHOP",
      licensePlate: "MI-1237",
      registrationExpiry: new Date(now.getTime() + 300 * day),
    },
  }));

  trucks.push(await prisma.truck.create({
    data: {
      unitNumber: "T-105",
      vin: "3AKJHHDR8MSLT4567",
      make: "International",
      model: "LT",
      year: 2021,
      type: "DAY_CAB",
      status: "ACTIVE",
      licensePlate: "MI-1238",
      registrationExpiry: new Date(now.getTime() + 190 * day),
    },
  }));

  // ═══════════════════════════════════════════════
  // FLEET - TRAILERS
  // ═══════════════════════════════════════════════

  const trailers = [];
  trailers.push(await prisma.trailer.create({
    data: {
      unitNumber: "TR-201",
      vin: "1GRAA0621PB123456",
      make: "Great Dane",
      model: "Everest",
      year: 2021,
      type: "DRY_VAN",
      status: "ACTIVE",
      licensePlate: "MI-T201",
      registrationExpiry: new Date(now.getTime() + 180 * day),
      length: 53,
    },
  }));

  trailers.push(await prisma.trailer.create({
    data: {
      unitNumber: "TR-202",
      vin: "1JJV532W8KL234567",
      make: "Wabash",
      model: "DuraPlate",
      year: 2022,
      type: "REEFER",
      status: "ACTIVE",
      licensePlate: "MI-T202",
      registrationExpiry: new Date(now.getTime() + 200 * day),
      length: 53,
      reeferUnit: true,
      reeferModel: "Carrier Transicold",
      reeferHours: 3450,
    },
  }));

  trailers.push(await prisma.trailer.create({
    data: {
      unitNumber: "TR-203",
      vin: "1JJV532W3ML345678",
      make: "Utility",
      model: "3000R",
      year: 2020,
      type: "REEFER",
      status: "ACTIVE",
      licensePlate: "MI-T203",
      registrationExpiry: new Date(now.getTime() + 160 * day),
      length: 53,
      reeferUnit: true,
      reeferModel: "Thermo King",
      reeferHours: 5680,
    },
  }));

  trailers.push(await prisma.trailer.create({
    data: {
      unitNumber: "TR-204",
      vin: "1GRAA0628NB456789",
      make: "Great Dane",
      model: "Champion",
      year: 2023,
      type: "DRY_VAN",
      status: "ACTIVE",
      licensePlate: "MI-T204",
      registrationExpiry: new Date(now.getTime() + 320 * day),
      length: 53,
    },
  }));

  trailers.push(await prisma.trailer.create({
    data: {
      unitNumber: "TR-205",
      vin: "4KFFF0820PU567890",
      make: "Fontaine",
      model: "Revolution",
      year: 2021,
      type: "FLATBED",
      status: "ACTIVE",
      licensePlate: "MI-T205",
      registrationExpiry: new Date(now.getTime() + 185 * day),
      length: 48,
    },
  }));

  // ═══════════════════════════════════════════════
  // FLEET - DRIVERS
  // ═══════════════════════════════════════════════

  const drivers = [];
  drivers.push(await prisma.driver.create({
    data: {
      firstName: "Mike",
      lastName: "Kowalski",
      email: "mkowalski@srltransport.com",
      phone: "(269) 555-0301",
      licenseNumber: "K234-5678-9012",
      licenseState: "MI",
      licenseExpiry: new Date(now.getTime() + 730 * day),
      status: "ON_ROUTE",
      licenseType: "CDL-A",
      endorsements: ["Hazmat", "Tanker"],
      assignedTruckId: trucks[0].id,
      assignedTrailerId: trailers[0].id,
      safetyScore:98,
    },
  }));

  drivers.push(await prisma.driver.create({
    data: {
      firstName: "James",
      lastName: "Brown",
      email: "jbrown@srltransport.com",
      phone: "(269) 555-0302",
      licenseNumber: "B345-6789-0123",
      licenseState: "MI",
      licenseExpiry: new Date(now.getTime() + 650 * day),
      status: "ON_ROUTE",
      licenseType: "CDL-A",
      endorsements: ["Doubles/Triples"],
      assignedTruckId: trucks[1].id,
      assignedTrailerId: trailers[1].id,
      safetyScore:95,
    },
  }));

  drivers.push(await prisma.driver.create({
    data: {
      firstName: "Roberto",
      lastName: "Santos",
      email: "rsantos@srltransport.com",
      phone: "(269) 555-0303",
      licenseNumber: "S456-7890-1234",
      licenseState: "MI",
      licenseExpiry: new Date(now.getTime() + 580 * day),
      status: "AVAILABLE",
      licenseType: "CDL-A",
      endorsements: [],
      assignedTruckId: trucks[2].id,
      assignedTrailerId: trailers[2].id,
      safetyScore:92,
    },
  }));

  drivers.push(await prisma.driver.create({
    data: {
      firstName: "Derek",
      lastName: "Williams",
      email: "dwilliams@srltransport.com",
      phone: "(269) 555-0304",
      licenseNumber: "W567-8901-2345",
      licenseState: "MI",
      licenseExpiry: new Date(now.getTime() + 820 * day),
      status: "AVAILABLE",
      licenseType: "CDL-A",
      endorsements: ["Hazmat"],
      assignedTruckId: trucks[3].id,
      assignedTrailerId: trailers[3].id,
      safetyScore:97,
    },
  }));

  drivers.push(await prisma.driver.create({
    data: {
      firstName: "Tyler",
      lastName: "Anderson",
      email: "tanderson@srltransport.com",
      phone: "(269) 555-0305",
      licenseNumber: "A678-9012-3456",
      licenseState: "MI",
      licenseExpiry: new Date(now.getTime() + 910 * day),
      status: "OFF_DUTY",
      licenseType: "CDL-A",
      endorsements: [],
      assignedTruckId: trucks[4].id,
      assignedTrailerId: trailers[4].id,
      safetyScore:89,
    },
  }));

  // ═══════════════════════════════════════════════
  // LOADS (30)
  // ═══════════════════════════════════════════════

  const loadData = [
    // POSTED (3) - future pickup, no carrier
    { num: 1, status: "POSTED", eqType: "Dry Van", originCity: "Detroit", originState: "MI", originZip: "48201", destCity: "Chicago", destState: "IL", destZip: "60601", distance: 280, rate: 1800, customerRate: 2100, carrierRate: null, pickupDayOffset: 3, deliveryDayOffset: 4, customerIndex: 0, carrierIndex: null, commodity: "Auto Parts", weight: 42000 },
    { num: 2, status: "POSTED", eqType: "Reefer", originCity: "Milwaukee", originState: "WI", originZip: "53202", destCity: "Indianapolis", destState: "IN", destZip: "46201", distance: 295, rate: 2200, customerRate: 2500, carrierRate: null, pickupDayOffset: 4, deliveryDayOffset: 5, customerIndex: 1, carrierIndex: null, commodity: "Fresh Produce", weight: 38000, tempMin: 34, tempMax: 38 },
    { num: 3, status: "POSTED", eqType: "Flatbed", originCity: "Birmingham", originState: "AL", originZip: "35203", destCity: "Nashville", destState: "TN", destZip: "37201", distance: 190, rate: 1500, customerRate: 1700, carrierRate: null, pickupDayOffset: 5, deliveryDayOffset: 6, customerIndex: 3, carrierIndex: null, commodity: "Paper Rolls", weight: 45000 },

    // BOOKED (3) - carrier assigned, future dates
    { num: 4, status: "BOOKED", eqType: "Dry Van", originCity: "Houston", originState: "TX", originZip: "77001", destCity: "Dallas", destState: "TX", destZip: "75201", distance: 240, rate: 1600, customerRate: 1850, carrierRate: 1600, pickupDayOffset: 2, deliveryDayOffset: 3, customerIndex: 4, carrierIndex: 0, commodity: "Industrial Chemicals", weight: 40000, hazmat: true, hazmatClass: "8" },
    { num: 5, status: "BOOKED", eqType: "Dry Van", originCity: "Seattle", originState: "WA", originZip: "98101", destCity: "Portland", destState: "OR", destZip: "97201", distance: 175, rate: 1400, customerRate: 1600, carrierRate: 1400, pickupDayOffset: 3, deliveryDayOffset: 4, customerIndex: 2, carrierIndex: 1, commodity: "Electronics", weight: 35000 },
    { num: 6, status: "BOOKED", eqType: "Reefer", originCity: "Milwaukee", originState: "WI", originZip: "53202", destCity: "Detroit", destState: "MI", destZip: "48201", distance: 380, rate: 2400, customerRate: 2750, carrierRate: 2400, pickupDayOffset: 2, deliveryDayOffset: 3, customerIndex: 1, carrierIndex: 0, commodity: "Frozen Foods", weight: 41000, tempMin: -10, tempMax: 0 },

    // DISPATCHED (2) - pickup tomorrow
    { num: 7, status: "DISPATCHED", eqType: "Dry Van", originCity: "Detroit", originState: "MI", originZip: "48201", destCity: "Louisville", destState: "KY", destZip: "40201", distance: 380, rate: 2100, customerRate: 2400, carrierRate: 2100, pickupDayOffset: 1, deliveryDayOffset: 2, customerIndex: 0, carrierIndex: 1, commodity: "Automotive Parts", weight: 44000 },
    { num: 8, status: "DISPATCHED", eqType: "Flatbed", originCity: "Phoenix", originState: "AZ", originZip: "85001", destCity: "Tucson", destState: "AZ", destZip: "85701", distance: 115, rate: 1200, customerRate: 1350, carrierRate: 1200, pickupDayOffset: 1, deliveryDayOffset: 2, customerIndex: 3, carrierIndex: 2, commodity: "Steel Beams", weight: 46000 },

    // IN_TRANSIT (4) - picked up yesterday
    { num: 9, status: "IN_TRANSIT", eqType: "Dry Van", originCity: "Chicago", originState: "IL", originZip: "60601", destCity: "Cincinnati", destState: "OH", destZip: "45201", distance: 300, rate: 1900, customerRate: 2150, carrierRate: 1900, pickupDayOffset: -1, deliveryDayOffset: 1, customerIndex: 0, carrierIndex: 0, commodity: "Consumer Goods", weight: 39000 },
    { num: 10, status: "IN_TRANSIT", eqType: "Reefer", originCity: "Milwaukee", originState: "WI", originZip: "53202", destCity: "Minneapolis", destState: "MN", destZip: "55401", distance: 340, rate: 2300, customerRate: 2600, carrierRate: 2300, pickupDayOffset: -1, deliveryDayOffset: 1, customerIndex: 1, carrierIndex: 1, commodity: "Dairy Products", weight: 37000, tempMin: 33, tempMax: 40 },
    { num: 11, status: "IN_TRANSIT", eqType: "Dry Van", originCity: "Houston", originState: "TX", originZip: "77001", destCity: "San Antonio", destState: "TX", destZip: "78201", distance: 197, rate: 1500, customerRate: 1700, carrierRate: 1500, pickupDayOffset: -1, deliveryDayOffset: 0, customerIndex: 4, carrierIndex: 0, commodity: "Chemicals", weight: 42000, hazmat: true, hazmatClass: "3" },
    { num: 12, status: "IN_TRANSIT", eqType: "Dry Van", originCity: "Seattle", originState: "WA", originZip: "98101", destCity: "Sacramento", destState: "CA", destZip: "95814", distance: 750, rate: 3200, customerRate: 3650, carrierRate: 3200, pickupDayOffset: -1, deliveryDayOffset: 1, customerIndex: 2, carrierIndex: 3, commodity: "Retail Goods", weight: 38000 },

    // AT_DELIVERY (2) - at destination now
    { num: 13, status: "AT_DELIVERY", eqType: "Flatbed", originCity: "Birmingham", originState: "AL", originZip: "35203", destCity: "Atlanta", destState: "GA", destZip: "30303", distance: 145, rate: 1300, customerRate: 1500, carrierRate: 1300, pickupDayOffset: -1, deliveryDayOffset: 0, customerIndex: 3, carrierIndex: 2, commodity: "Paper Products", weight: 44000 },
    { num: 14, status: "AT_DELIVERY", eqType: "Dry Van", originCity: "Detroit", originState: "MI", originZip: "48201", destCity: "Indianapolis", destState: "IN", destZip: "46201", distance: 290, rate: 1850, customerRate: 2100, carrierRate: 1850, pickupDayOffset: -1, deliveryDayOffset: 0, customerIndex: 0, carrierIndex: 1, commodity: "Manufacturing Parts", weight: 41000 },

    // DELIVERED (4) - delivered 2-6 days ago
    { num: 15, status: "DELIVERED", eqType: "Dry Van", originCity: "Chicago", originState: "IL", originZip: "60601", destCity: "Nashville", destState: "TN", destZip: "37201", distance: 475, rate: 2400, customerRate: 2750, carrierRate: 2400, pickupDayOffset: -4, deliveryDayOffset: -2, customerIndex: 0, carrierIndex: 0, commodity: "Auto Parts", weight: 43000 },
    { num: 16, status: "DELIVERED", eqType: "Reefer", originCity: "Milwaukee", originState: "WI", originZip: "53202", destCity: "Chicago", destState: "IL", destZip: "60601", distance: 90, rate: 1600, customerRate: 1850, carrierRate: 1600, pickupDayOffset: -5, deliveryDayOffset: -4, customerIndex: 1, carrierIndex: 1, commodity: "Fresh Meat", weight: 36000, tempMin: 34, tempMax: 38 },
    { num: 17, status: "DELIVERED", eqType: "Dry Van", originCity: "Houston", originState: "TX", originZip: "77001", destCity: "New Orleans", destState: "LA", destZip: "70112", distance: 350, rate: 2000, customerRate: 2300, carrierRate: 2000, pickupDayOffset: -5, deliveryDayOffset: -3, customerIndex: 4, carrierIndex: 0, commodity: "Chemicals", weight: 40000 },
    { num: 18, status: "DELIVERED", eqType: "Flatbed", originCity: "Phoenix", originState: "AZ", originZip: "85001", destCity: "Albuquerque", destState: "NM", destZip: "87101", distance: 420, rate: 2200, customerRate: 2500, carrierRate: 2200, pickupDayOffset: -8, deliveryDayOffset: -6, customerIndex: 3, carrierIndex: 2, commodity: "Construction Materials", weight: 47000 },

    // POD_RECEIVED (3) - delivered 5-8 days ago
    { num: 19, status: "POD_RECEIVED", eqType: "Dry Van", originCity: "Detroit", originState: "MI", originZip: "48201", destCity: "Buffalo", destState: "NY", destZip: "14201", distance: 265, rate: 1800, customerRate: 2050, carrierRate: 1800, pickupDayOffset: -7, deliveryDayOffset: -5, customerIndex: 0, carrierIndex: 1, commodity: "Auto Parts", weight: 42000 },
    { num: 20, status: "POD_RECEIVED", eqType: "Reefer", originCity: "Seattle", originState: "WA", originZip: "98101", destCity: "San Francisco", destState: "CA", destZip: "94102", distance: 810, rate: 3500, customerRate: 4000, carrierRate: 3500, pickupDayOffset: -10, deliveryDayOffset: -8, customerIndex: 2, carrierIndex: 3, commodity: "Fresh Seafood", weight: 35000, tempMin: 32, tempMax: 38 },
    { num: 21, status: "POD_RECEIVED", eqType: "Dry Van", originCity: "Birmingham", originState: "AL", originZip: "35203", destCity: "Memphis", destState: "TN", destZip: "38103", distance: 240, rate: 1650, customerRate: 1900, carrierRate: 1650, pickupDayOffset: -8, deliveryDayOffset: -6, customerIndex: 3, carrierIndex: 2, commodity: "Paper Goods", weight: 43000 },

    // INVOICED (3) - delivered 8-12 days ago
    { num: 22, status: "INVOICED", eqType: "Dry Van", originCity: "Chicago", originState: "IL", originZip: "60601", destCity: "Detroit", destState: "MI", destZip: "48201", distance: 280, rate: 1800, customerRate: 2100, carrierRate: 1800, pickupDayOffset: -11, deliveryDayOffset: -9, customerIndex: 0, carrierIndex: 0, commodity: "Consumer Goods", weight: 40000 },
    { num: 23, status: "INVOICED", eqType: "Reefer", originCity: "Milwaukee", originState: "WI", originZip: "53202", destCity: "Green Bay", destState: "WI", destZip: "54301", distance: 120, rate: 1700, customerRate: 1950, carrierRate: 1700, pickupDayOffset: -13, deliveryDayOffset: -12, customerIndex: 1, carrierIndex: 1, commodity: "Frozen Foods", weight: 38000, tempMin: -10, tempMax: 0 },
    { num: 24, status: "INVOICED", eqType: "Dry Van", originCity: "Houston", originState: "TX", originZip: "77001", destCity: "Oklahoma City", destState: "OK", destZip: "73102", distance: 450, rate: 2300, customerRate: 2600, carrierRate: 2300, pickupDayOffset: -12, deliveryDayOffset: -10, customerIndex: 4, carrierIndex: 0, commodity: "Chemicals", weight: 41000, hazmat: true, hazmatClass: "8" },

    // COMPLETED (4) - delivered 16-25 days ago
    { num: 25, status: "COMPLETED", eqType: "Dry Van", originCity: "Seattle", originState: "WA", originZip: "98101", destCity: "Los Angeles", destState: "CA", destZip: "90001", distance: 1135, rate: 4200, customerRate: 4800, carrierRate: 4200, pickupDayOffset: -27, deliveryDayOffset: -25, customerIndex: 2, carrierIndex: 3, commodity: "Electronics", weight: 36000 },
    { num: 26, status: "COMPLETED", eqType: "Flatbed", originCity: "Phoenix", originState: "AZ", originZip: "85001", destCity: "Denver", destState: "CO", destZip: "80202", distance: 600, rate: 2800, customerRate: 3200, carrierRate: 2800, pickupDayOffset: -20, deliveryDayOffset: -18, customerIndex: 3, carrierIndex: 2, commodity: "Steel Products", weight: 46000 },
    { num: 27, status: "COMPLETED", eqType: "Dry Van", originCity: "Detroit", originState: "MI", originZip: "48201", destCity: "Cleveland", destState: "OH", destZip: "44101", distance: 170, rate: 1400, customerRate: 1600, carrierRate: 1400, pickupDayOffset: -19, deliveryDayOffset: -18, customerIndex: 0, carrierIndex: 1, commodity: "Auto Parts", weight: 42000 },
    { num: 28, status: "COMPLETED", eqType: "Reefer", originCity: "Milwaukee", originState: "WI", originZip: "53202", destCity: "Madison", destState: "WI", destZip: "53703", distance: 80, rate: 1500, customerRate: 1700, carrierRate: 1500, pickupDayOffset: -18, deliveryDayOffset: -17, customerIndex: 1, carrierIndex: 1, commodity: "Dairy Products", weight: 37000, tempMin: 33, tempMax: 40 },

    // CANCELLED (1)
    { num: 29, status: "CANCELLED", eqType: "Dry Van", originCity: "Birmingham", originState: "AL", originZip: "35203", destCity: "Jacksonville", destState: "FL", destZip: "32201", distance: 450, rate: 2300, customerRate: 2600, carrierRate: null, pickupDayOffset: 6, deliveryDayOffset: 7, customerIndex: 3, carrierIndex: null, commodity: "Paper Products", weight: 44000 },

    // TONU (1)
    { num: 30, status: "TONU", eqType: "Flatbed", originCity: "Houston", originState: "TX", originZip: "77001", destCity: "Dallas", destState: "TX", destZip: "75201", distance: 240, rate: 350, customerRate: 350, carrierRate: 350, pickupDayOffset: -2, deliveryDayOffset: -2, customerIndex: 4, carrierIndex: 2, commodity: "Construction Equipment", weight: 48000 },
  ];

  const loads = [];
  const customers = [cust1, cust2, cust3, cust4, cust5];
  const carriers = [carrierUser, carrierUser2, carrierUser3, carrierUser4, carrierUser5];

  for (const ld of loadData) {
    const pickupDate = new Date(now.getTime() + ld.pickupDayOffset * day);
    const deliveryDate = new Date(now.getTime() + ld.deliveryDayOffset * day);
    const loadNumber = `SRL-${pickupDate.toISOString().split('T')[0].replace(/-/g, '')}-${String(ld.num).padStart(4, '0')}`;
    const referenceNumber = `REF-${ld.num}-${Date.now().toString().slice(-6)}`;

    const loadCreateData: any = {
      loadNumber,
      referenceNumber,
      status: ld.status,
      equipmentType: ld.eqType,
      originCity: ld.originCity,
      originState: ld.originState,
      originZip: ld.originZip,
      destCity: ld.destCity,
      destState: ld.destState,
      destZip: ld.destZip,
      pickupDate,
      deliveryDate,
      distance: ld.distance,
      rate: ld.rate,
      commodity: ld.commodity,
      weight: ld.weight,
      posterId: broker.id,
    };

    if (ld.customerIndex !== undefined && ld.customerIndex !== null) {
      loadCreateData.customerId = customers[ld.customerIndex].id;
    }

    if (ld.carrierIndex !== null && ld.carrierIndex !== undefined) {
      loadCreateData.carrierId = carriers[ld.carrierIndex].id;
    }

    if (ld.customerRate) {
      loadCreateData.customerRate = ld.customerRate;
    }

    if (ld.carrierRate) {
      loadCreateData.carrierRate = ld.carrierRate;
    }

    if (ld.tempMin !== undefined) {
      loadCreateData.temperatureControlled = true;
      loadCreateData.tempMin = ld.tempMin;
      loadCreateData.tempMax = ld.tempMax;
    }

    if (ld.hazmat) {
      loadCreateData.hazmat = true;
      loadCreateData.hazmatClass = ld.hazmatClass;
    }

    const load = await prisma.load.create({ data: loadCreateData });
    loads.push(load);
  }

  // ═══════════════════════════════════════════════
  // INVOICES (10)
  // ═══════════════════════════════════════════════

  const invoices = [];

  // INVOICED loads (3)
  invoices.push(await prisma.invoice.create({
    data: {
      loadId: loads[21].id,
      invoiceNumber: "INV-20260001",
      status: "SENT",
      amount: 2100,
      lineHaulAmount: 1800,
      fuelSurchargeAmount: 300,
      totalAmount: 2100,
      userId: broker.id,
      createdById: accountant.id,
      dueDate: new Date(now.getTime() + 21 * day),
    },
  }));

  invoices.push(await prisma.invoice.create({
    data: {
      loadId: loads[22].id,
      invoiceNumber: "INV-20260002",
      status: "SENT",
      amount: 1950,
      lineHaulAmount: 1700,
      fuelSurchargeAmount: 250,
      totalAmount: 1950,
      userId: broker.id,
      createdById: accountant.id,
      dueDate: new Date(now.getTime() + 18 * day),
    },
  }));

  invoices.push(await prisma.invoice.create({
    data: {
      loadId: loads[23].id,
      invoiceNumber: "INV-20260003",
      status: "SENT",
      amount: 2600,
      lineHaulAmount: 2300,
      fuelSurchargeAmount: 300,
      totalAmount: 2600,
      userId: broker.id,
      createdById: accountant.id,
      dueDate: new Date(now.getTime() + 20 * day),
    },
  }));

  // COMPLETED loads - PAID invoices (4)
  invoices.push(await prisma.invoice.create({
    data: {
      loadId: loads[24].id,
      invoiceNumber: "INV-20260004",
      status: "PAID",
      amount: 4800,
      lineHaulAmount: 4200,
      fuelSurchargeAmount: 600,
      totalAmount: 4800,
      userId: broker.id,
      createdById: accountant.id,
      dueDate: new Date(now.getTime() + 5 * day),
      paidAt: new Date(now.getTime() - 3 * day),
    },
  }));

  invoices.push(await prisma.invoice.create({
    data: {
      loadId: loads[25].id,
      invoiceNumber: "INV-20260005",
      status: "PAID",
      amount: 3200,
      lineHaulAmount: 2800,
      fuelSurchargeAmount: 400,
      totalAmount: 3200,
      userId: broker.id,
      createdById: accountant.id,
      dueDate: new Date(now.getTime() + 12 * day),
      paidAt: new Date(now.getTime() - 1 * day),
    },
  }));

  invoices.push(await prisma.invoice.create({
    data: {
      loadId: loads[26].id,
      invoiceNumber: "INV-20260006",
      status: "PAID",
      amount: 1600,
      lineHaulAmount: 1400,
      fuelSurchargeAmount: 200,
      totalAmount: 1600,
      userId: broker.id,
      createdById: accountant.id,
      dueDate: new Date(now.getTime() + 12 * day),
      paidAt: new Date(now.getTime() - 2 * day),
    },
  }));

  invoices.push(await prisma.invoice.create({
    data: {
      loadId: loads[27].id,
      invoiceNumber: "INV-20260007",
      status: "PAID",
      amount: 1700,
      lineHaulAmount: 1500,
      fuelSurchargeAmount: 200,
      totalAmount: 1700,
      userId: broker.id,
      createdById: accountant.id,
      dueDate: new Date(now.getTime() + 13 * day),
      paidAt: new Date(now.getTime() - 4 * day),
    },
  }));

  // DRAFT invoices (2)
  invoices.push(await prisma.invoice.create({
    data: {
      loadId: loads[14].id,
      invoiceNumber: "INV-20260008",
      status: "DRAFT",
      amount: 2750,
      lineHaulAmount: 2400,
      fuelSurchargeAmount: 350,
      totalAmount: 2750,
      userId: broker.id,
      createdById: accountant.id,
      dueDate: new Date(now.getTime() + 32 * day),
    },
  }));

  invoices.push(await prisma.invoice.create({
    data: {
      loadId: loads[15].id,
      invoiceNumber: "INV-20260009",
      status: "DRAFT",
      amount: 1850,
      lineHaulAmount: 1600,
      fuelSurchargeAmount: 250,
      totalAmount: 1850,
      userId: broker.id,
      createdById: accountant.id,
      dueDate: new Date(now.getTime() + 26 * day),
    },
  }));

  // OVERDUE invoice (1) - POD_RECEIVED
  invoices.push(await prisma.invoice.create({
    data: {
      loadId: loads[18].id,
      invoiceNumber: "INV-20260010",
      status: "OVERDUE",
      amount: 2050,
      lineHaulAmount: 1800,
      fuelSurchargeAmount: 250,
      totalAmount: 2050,
      userId: broker.id,
      createdById: accountant.id,
      dueDate: new Date(now.getTime() - 5 * day),
    },
  }));

  // ═══════════════════════════════════════════════
  // CARRIER SCORECARDS (4 - skip pending carrier)
  // ═══════════════════════════════════════════════

  await prisma.carrierScorecard.createMany({
    data: [
      {
        carrierId: cp1.id,
        period: "WEEKLY",
        onTimePickupPct: 99,
        onTimeDeliveryPct: 98,
        communicationScore: 99,
        documentSubmissionTimeliness: 97,
        acceptanceRate: 98,
        gpsCompliancePct: 100,
        overallScore: 98.5,
        tierAtTime: "PLATINUM",
        claimRatio: 0.5,
        bonusEarned: 750,
      },
      {
        carrierId: cp2.id,
        period: "WEEKLY",
        onTimePickupPct: 97,
        onTimeDeliveryPct: 96,
        communicationScore: 96,
        documentSubmissionTimeliness: 95,
        acceptanceRate: 97,
        gpsCompliancePct: 98,
        overallScore: 96.2,
        tierAtTime: "GOLD",
        claimRatio: 1.2,
        bonusEarned: 400,
      },
      {
        carrierId: cp3.id,
        period: "WEEKLY",
        onTimePickupPct: 93,
        onTimeDeliveryPct: 92,
        communicationScore: 90,
        documentSubmissionTimeliness: 91,
        acceptanceRate: 92,
        gpsCompliancePct: 95,
        overallScore: 92.0,
        tierAtTime: "SILVER",
        claimRatio: 3.0,
        bonusEarned: 0,
      },
      {
        carrierId: cp4.id,
        period: "WEEKLY",
        onTimePickupPct: 88,
        onTimeDeliveryPct: 85,
        communicationScore: 82,
        documentSubmissionTimeliness: 86,
        acceptanceRate: 87,
        gpsCompliancePct: 90,
        overallScore: 85.5,
        tierAtTime: "BRONZE",
        claimRatio: 5.5,
        bonusEarned: 0,
      },
    ],
  });

  // ═══════════════════════════════════════════════
  // MESSAGES (10)
  // ═══════════════════════════════════════════════

  const messages = [];
  messages.push(await prisma.message.create({
    data: {
      senderId: broker.id,
      receiverId: carrierUser.id,
      loadId: loads[8].id,
      content: "Load SRL-20260211-0009 - Pickup Confirmation\n\nHi, please confirm pickup time for tomorrow's load to Cincinnati. Shipper prefers 8 AM.",
      readAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
    },
  }));

  messages.push(await prisma.message.create({
    data: {
      senderId: carrierUser.id,
      receiverId: broker.id,
      loadId: loads[8].id,
      content: "Re: Load SRL-20260211-0009 - Pickup Confirmation\n\nConfirmed. Driver will be there at 8 AM sharp. Truck T-101, Trailer TR-201.",
      readAt: new Date(now.getTime() - 1 * 60 * 60 * 1000),
    },
  }));

  messages.push(await prisma.message.create({
    data: {
      senderId: dispatcher.id,
      receiverId: carrierUser2.id,
      loadId: loads[9].id,
      content: "Load Update - ETA Request\n\nCan you provide updated ETA for the Minneapolis delivery? Customer is asking.",
      readAt: null,
    },
  }));

  messages.push(await prisma.message.create({
    data: {
      senderId: carrierUser3.id,
      receiverId: broker.id,
      content: "POD Uploaded - Load SRL-20260203-0021\n\nPOD has been uploaded for the Memphis delivery. Load completed without issues.",
      readAt: new Date(now.getTime() - 3 * day),
    },
  }));

  messages.push(await prisma.message.create({
    data: {
      senderId: accountant.id,
      receiverId: carrierUser.id,
      content: "Payment Processed - Invoice #QP-20260205\n\nYour Quick Pay invoice has been processed. Funds will be in your account by EOD.",
      readAt: new Date(now.getTime() - 5 * day),
    },
  }));

  messages.push(await prisma.message.create({
    data: {
      senderId: broker.id,
      receiverId: dispatcher.id,
      loadId: loads[6].id,
      content: "Urgent - Customer Request\n\nCustomer needs delivery moved up by 4 hours. Can we accommodate?",
      readAt: new Date(now.getTime() - 30 * 60 * 1000),
    },
  }));

  messages.push(await prisma.message.create({
    data: {
      senderId: admin.id,
      receiverId: broker.id,
      content: "Weekly Performance Summary\n\nGreat work this week! 28 loads moved, 97% on-time delivery. Keep it up!",
      readAt: null,
    },
  }));

  messages.push(await prisma.message.create({
    data: {
      senderId: carrierUser2.id,
      receiverId: dispatcher.id,
      content: "Driver Availability - Next Week\n\nWe have 3 drivers available for Midwest lanes next week. Let me know if you have loads.",
      readAt: new Date(now.getTime() - 6 * 60 * 60 * 1000),
    },
  }));

  messages.push(await prisma.message.create({
    data: {
      senderId: broker.id,
      receiverId: carrierUser3.id,
      loadId: loads[2].id,
      content: "Load Tender - Birmingham to Nashville\n\nTendering load SRL-20260216-0003. Flatbed, 45K lbs paper rolls. Rate: $1500. Accept by EOD.",
      readAt: null,
    },
  }));

  messages.push(await prisma.message.create({
    data: {
      senderId: dispatcher.id,
      receiverId: broker.id,
      content: "Daily Operations Report\n\n4 loads in transit, 2 at delivery, no issues to report. All on schedule.",
      readAt: new Date(now.getTime() - 4 * 60 * 60 * 1000),
    },
  }));

  // ═══════════════════════════════════════════════
  // NOTIFICATIONS (20)
  // ═══════════════════════════════════════════════

  await prisma.notification.createMany({
    data: [
      { userId: admin.id, type: "CARRIER_APPLICATION", title: "New Carrier Application", message: "Sunbelt Logistics has submitted a carrier application", link: "/carriers", read: false },
      { userId: broker.id, type: "LOAD_TENDERED", title: "Load Tendered", message: "Load SRL-20260211-0009 tendered to SRL Transport LLC", link: "/loads/9", read: true, readAt: new Date(now.getTime() - 2 * day) },
      { userId: carrierUser.id, type: "LOAD_UPDATE", title: "Load Update", message: "Pickup time updated for load SRL-20260211-0009", link: "/loads/9", read: true, readAt: new Date(now.getTime() - 1 * day) },
      { userId: carrierUser2.id, type: "PAYMENT_PENDING", title: "Payment Pending", message: "Invoice #QP-20260208 pending approval", link: "/invoices", read: false },
      { userId: carrierUser.id, type: "PAYMENT_APPROVED", title: "Payment Approved", message: "Quick Pay payment of $2,100 approved", link: "/payments", read: true, readAt: new Date(now.getTime() - 3 * day) },
      { userId: accountant.id, type: "INVOICE_OVERDUE", title: "Invoice Overdue", message: "Invoice INV-20260010 is 5 days overdue", link: "/invoices", read: false },
      { userId: broker.id, type: "POD_RECEIVED", title: "POD Received", message: "POD received for load SRL-20260203-0021", link: "/loads/21", read: true, readAt: new Date(now.getTime() - 4 * day) },
      { userId: carrierUser.id, type: "CPP_UPGRADE", title: "CPP Tier Upgrade", message: "Congratulations! You've maintained Platinum tier", link: "/cpp", read: false },
      { userId: dispatcher.id, type: "LOAD_UPDATE", title: "Load In Transit", message: "Load SRL-20260210-0010 is now in transit", link: "/loads/10", read: true, readAt: new Date(now.getTime() - 1 * day) },
      { userId: broker.id, type: "LOAD_UPDATE", title: "Load Delivered", message: "Load SRL-20260209-0015 has been delivered", link: "/loads/15", read: true, readAt: new Date(now.getTime() - 2 * day) },
      { userId: carrierUser3.id, type: "LOAD_TENDERED", title: "New Load Tender", message: "You have been tendered load SRL-20260216-0003", link: "/loads/3", read: false },
      { userId: dispatcher.id, type: "GENERAL", title: "Check Call Due", message: "Check call due for 4 in-transit loads", link: "/loads", read: false },
      { userId: broker.id, type: "GENERAL", title: "Weekly Report Ready", message: "Your weekly performance report is ready", link: "/reports", read: true, readAt: new Date(now.getTime() - 5 * day) },
      { userId: admin.id, type: "GENERAL", title: "System Maintenance", message: "Scheduled maintenance tonight 11 PM - 2 AM", link: "/settings", read: true, readAt: new Date(now.getTime() - 1 * day) },
      { userId: carrierUser2.id, type: "LOAD_UPDATE", title: "Load Completed", message: "Load SRL-20260203-0016 marked as completed", link: "/loads/16", read: true, readAt: new Date(now.getTime() - 4 * day) },
      { userId: accountant.id, type: "PAYMENT_APPROVED", title: "Payment Sent", message: "Payment of $3,200 sent to Pacific Coast Trucking", link: "/payments", read: true, readAt: new Date(now.getTime() - 2 * day) },
      { userId: broker.id, type: "LOAD_UPDATE", title: "Load Cancelled", message: "Load SRL-20260217-0029 has been cancelled by customer", link: "/loads/29", read: false },
      { userId: carrierUser.id, type: "GENERAL", title: "Documentation Required", message: "Insurance certificate expires in 30 days", link: "/profile", read: false },
      { userId: dispatcher.id, type: "LOAD_UPDATE", title: "Load At Delivery", message: "Load SRL-20260210-0013 arrived at destination", link: "/loads/13", read: true, readAt: new Date(now.getTime() - 3 * 60 * 60 * 1000) },
      { userId: broker.id, type: "GENERAL", title: "Customer Feedback", message: "Acme Manufacturing rated their last delivery 5 stars", link: "/customers", read: true, readAt: new Date(now.getTime() - 6 * day) },
    ],
  });

  // ═══════════════════════════════════════════════
  // CHECK CALLS (8)
  // ═══════════════════════════════════════════════

  await prisma.checkCall.createMany({
    data: [
      { loadId: loads[8].id, status: "COMPLETED", city: "Cincinnati", state: "OH", location: "Cincinnati, OH", notes: "On schedule, ETA 2 PM", driverStatus: "ON_SCHEDULE", calledById: dispatcher.id, method: "Phone", createdAt: new Date(now.getTime() - 4 * 60 * 60 * 1000) },
      { loadId: loads[9].id, status: "COMPLETED", city: "Minneapolis", state: "MN", location: "Minneapolis, MN", notes: "30 min delay due to traffic", driverStatus: "ON_SCHEDULE", calledById: dispatcher.id, method: "Phone", createdAt: new Date(now.getTime() - 3 * 60 * 60 * 1000) },
      { loadId: loads[10].id, status: "COMPLETED", city: "San Antonio", state: "TX", location: "San Antonio, TX", notes: "Arriving on time", driverStatus: "ON_SCHEDULE", calledById: dispatcher.id, method: "Phone", createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000) },
      { loadId: loads[11].id, status: "COMPLETED", city: "Sacramento", state: "CA", location: "Sacramento, CA", notes: "1 hour ahead of schedule", driverStatus: "ON_SCHEDULE", calledById: dispatcher.id, method: "Phone", createdAt: new Date(now.getTime() - 5 * 60 * 60 * 1000) },
      { loadId: loads[12].id, status: "COMPLETED", city: "Atlanta", state: "GA", location: "Atlanta, GA", notes: "At receiver dock", driverStatus: "AT_DELIVERY", calledById: dispatcher.id, method: "Phone", createdAt: new Date(now.getTime() - 1 * 60 * 60 * 1000) },
      { loadId: loads[13].id, status: "COMPLETED", city: "Indianapolis", state: "IN", location: "Indianapolis, IN", notes: "Unloading in progress", driverStatus: "AT_DELIVERY", calledById: dispatcher.id, method: "Phone", createdAt: new Date(now.getTime() - 30 * 60 * 1000) },
      { loadId: loads[8].id, status: "COMPLETED", city: "Louisville", state: "KY", location: "Louisville, KY", notes: "Passed through Louisville, heading to Cincinnati", driverStatus: "ON_SCHEDULE", calledById: dispatcher.id, method: "Phone", createdAt: new Date(now.getTime() - 6 * 60 * 60 * 1000) },
      { loadId: loads[9].id, status: "COMPLETED", city: "Eau Claire", state: "WI", location: "Eau Claire, WI", notes: "Fuel stop, will resume in 15 min", driverStatus: "ON_SCHEDULE", calledById: dispatcher.id, method: "Phone", createdAt: new Date(now.getTime() - 8 * 60 * 60 * 1000) },
    ],
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
  Users: 9 (3 SRL employees + 2 new employees + 4 external carriers)
    - whaider@silkroutelogistics.ai (ADMIN)
    - noor@silkroutelogistics.ai (BROKER / Account Executive)
    - dispatch@silkroutelogistics.ai (DISPATCH)
    - accounting@silkroutelogistics.ai (ACCOUNTING)
    - carrier@silkroutelogistics.ai (CARRIER / SRL Transport LLC)
    - jthompson@midwestfreight.com (CARRIER / Midwest Freight Lines)
    - maria@dixiehaulers.com (CARRIER / Dixie Haulers Inc)
    - kevin@pacificcoasttrucking.com (CARRIER / Pacific Coast Trucking)
    - carlos@sunbeltlogistics.com (CARRIER / Sunbelt Logistics - PENDING)
    Password for all: Wasishah3089$
  Carrier Profiles: 5
  Customers: 5
  Customer Contacts: 10
  Trucks: 5
  Trailers: 5
  Drivers: 5
  Loads: 30
  Invoices: 10
  Carrier Scorecards: 4
  Messages: 10
  Notifications: 20
  Check Calls: 8
  SOPs: 14 industry-standard documents across 6 categories
    - Operations: 4 (Freight Ops, Reefer, Hazmat, Flatbed)
    - Safety: 3 (Driver Safety, Workplace OSHA, Claims)
    - Compliance: 2 (Carrier Vetting, DOT Audit)
    - Finance: 2 (AR/Invoicing, Factoring)
    - HR: 2 (Onboarding, Code of Conduct)
    - Sales: 1 (Customer Onboarding)
  `);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
