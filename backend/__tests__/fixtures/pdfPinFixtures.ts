/**
 * Fixed inputs for the golden-render pins.
 *
 * Every value here is FROZEN. Dates are literals rather than `new Date()`,
 * because the pin hashes the drawn content stream: a date that moved would
 * change the bytes and the pin would fail every day for no reason, which is the
 * fastest way to teach someone to ignore it.
 *
 * AND THE SUITE RUNS IN UTC (vitest.config.ts). Every generator formats dates
 * with toLocaleDateString, so a date at midnight UTC prints one day earlier on
 * a negative-offset machine. That is not hypothetical: the settlement fixture
 * below originally used midnight and the pin passed locally in America/New_York
 * while failing on the UTC runner -- the same document, two printed dates. If
 * you add a date here, it is deterministic because the suite is pinned, not
 * because the value avoids a boundary.
 *
 * These are deliberately minimal -- only what each renderer actually draws.
 * If a renderer starts reading a new field, it will throw here rather than
 * silently drawing an empty string, which is the outcome we want.
 */
const PICKUP = new Date("2026-09-10T14:00:00.000Z");
const DELIVERY = new Date("2026-09-12T18:00:00.000Z");
const ISSUED = new Date("2026-09-15T09:00:00.000Z");

const LANE = {
  originCity: "Lebanon", originState: "NH", originZip: "03766",
  destCity: "North Lake", destState: "TX", destZip: "75568",
};

export const BOL_FIXTURE = {
  id: "pin-load-bol", referenceNumber: "SRL-PIN0001", loadNumber: "SRL-PIN0001",
  ...LANE,
  originAddress: "18 Etna Road", originCompany: "Granite State Foods",
  destAddress: "4400 Mustang Way", destCompany: "North Lake Distribution",
  pickupDate: PICKUP, deliveryDate: DELIVERY,
  rate: 4100, customerRate: 5100, carrierRate: 4100, distance: 1852,
  equipmentType: "Reefer", commodity: "Frozen dairy", weight: 28400,
  temperatureMin: 34, temperatureMax: 38,
  specialInstructions: "Continuous reefer. Pulp on arrival.",
  poNumbers: ["PO-88120"],
  lineItems: [
    {
      id: "pin-li-1", lineNumber: 1, pieces: 22, packageType: "PALLET",
      description: "Frozen dairy, palletised", weight: 28400, isHazmat: false,
    },
  ],
} as unknown as Parameters<typeof import("../../src/services/pdfService").generateBOLFromLoad>[0];

export const RC_FIXTURE = {
  id: "pin-load-rc", referenceNumber: "SRL-PIN0002", loadNumber: "SRL-PIN0002",
  ...LANE,
  pickupDate: PICKUP, deliveryDate: DELIVERY,
  rate: 4100, customerRate: 5100, carrierRate: 4100, distance: 1852,
  equipmentType: "Reefer", commodity: "Frozen dairy", weight: 28400,
  carrier: { carrierProfile: { companyName: "Pin Carrier LLC", mcNumber: "MC-999001", dotNumber: "9990011" } },
  // A recorded window, so the pin WATCHES the window line. Without times the RC
  // omits the suffix entirely and the pin was identical whether the window
  // rendered, rendered wrongly, or did not render at all. The BOL fixture
  // deliberately keeps NO times: its pin covers the no-window path, which is
  // where the `[HH:MM-HH:MM]` placeholder used to print.
  pickupTimeStart: "08:00", pickupTimeEnd: "14:00",
  deliveryTimeStart: "09:00", deliveryTimeEnd: null,
  // Resolved dock contacts (lib/stopContact). Present so the pin actually
  // WATCHES the contact line: without them the RC omits the line entirely, so
  // the pin was identical whether the line rendered correctly, rendered the
  // customer's billing contact, or did not render at all. A fixture that does
  // not exercise a feature cannot detect a change to it.
  stopContacts: {
    shipper: { name: "Dana Whitfield", phone: "603-555-0142", email: "dock@granitestatefoods.invalid", source: "FACILITY_FK" },
    consignee: { name: "Marcus Reyes", phone: "940-555-0188", email: null, source: "FACILITY_MATCH" },
  },
} as unknown as Parameters<typeof import("../../src/services/pdfService").generateEnhancedRateConfirmation>[0];

export const RC_FORM_DATA: Record<string, unknown> = {
  carrierName: "Pin Carrier LLC", carrierMcNumber: "MC-999001", carrierDotNumber: "9990011",
  lineHaulRate: 4100, fuelSurcharge: 0, totalCharges: 4100,
  paymentTerms: "Standard", rateConNumber: "SRL-PIN0002R",
};

export const INVOICE_FIXTURE = {
  invoiceNumber: "SRL-PIN0003I", amount: 5100, status: "SENT",
  issuedAt: ISSUED, dueDate: new Date("2026-10-15T09:00:00.000Z"),
  load: {
    referenceNumber: "SRL-PIN0003", loadNumber: "SRL-PIN0003",
    ...LANE, pickupDate: PICKUP, deliveryDate: DELIVERY,
    equipmentType: "Reefer", commodity: "Frozen dairy", weight: 28400,
  },
  customer: { name: "Pin Customer Inc.", email: "ap@pin.invalid" },
} as unknown as Parameters<typeof import("../../src/services/pdfService").generateInvoicePDF>[0];

export const SETTLEMENT_FIXTURE = {
  settlementNumber: "SRL-PIN0004P",
  periodStart: new Date("2026-09-01T00:00:00.000Z"),
  periodEnd: new Date("2026-09-15T00:00:00.000Z"),
  period: "2026-09-01 to 2026-09-15",
  grossPay: 4100, deductions: 0, netSettlement: 4100, status: "PAID",
  carrier: { firstName: "Pat", lastName: "Pin", company: "Pin Carrier LLC" },
  carrierPays: [
    {
      srlDocNumber: "SRL-PIN0004P", amount: 4100, quickPayDiscount: null, netAmount: 4100,
      load: { referenceNumber: "SRL-PIN0004", ...LANE, pickupDate: PICKUP, deliveryDate: DELIVERY },
    },
  ],
} as unknown as Parameters<typeof import("../../src/services/pdfService").generateSettlementPDF>[0];

/** Frozen signature, so an executed agreement pin does not move with the clock. */
export const PIN_SIGNATURE = {
  signedByName: "Pat Pin", signedByTitle: "Owner",
  signedAt: new Date("2026-09-01T12:00:00.000Z"),
  signerIp: "203.0.113.10", version: "PINNED",
  consentAt: new Date("2026-09-01T12:00:00.000Z"),
};

export const PIN_CARRIER = {
  legalName: "Pin Carrier LLC", mcNumber: "MC-999001", dotNumber: "9990011", ein: "99-9990011",
};

/**
 * Shipper Load Confirmation. Reuses RC_FIXTURE for the load (same
 * EnhancedRCLoadData shape) and carries its own formData, because the SLC draws
 * eighteen fd.* fields the RC form data does not have. Populated rather than
 * minimal on purpose: a fixture missing them pins a page of em-dashes, which is
 * stable and proves nothing about the document anyone receives.
 *
 * customerRate only. This document is customer-facing and must never show
 * carrier cost -- the pin is the thing that notices if it starts to.
 */
export const SLC_FORM_DATA: Record<string, unknown> = {
  shipperName: "Pin Shipper Co.", shipperAddress: "12 Mill Road",
  shipperCity: "Lebanon", shipperState: "NH", shipperZip: "03766",
  consigneeName: "Pin Consignee Inc.", consigneeAddress: "980 Depot Street",
  consigneeCity: "North Lake", consigneeState: "TX", consigneeZip: "75568",
  pickupDate: PICKUP, deliveryDate: DELIVERY,
  pickupTimeWindow: "08:00-12:00", deliveryTimeWindow: "13:00-17:00",
  equipmentType: "Reefer", commodity: "Frozen dairy",
  customerRate: 5100,
  specialInstructions: "Continuous reefer at 38F. Lumper paid by consignee.",
};

/**
 * Training certificate, two variants that between them exercise every
 * conditional branch in generateTrainingCertificate in both directions:
 * expiresAt, carrierName and verifyQrPng. FULL has all three, MINIMAL has none.
 *
 * The QR is a real generated PNG, not a stub. generateCertVerifyQRBuffer is
 * deterministic -- verified before pinning: same code gives identical bytes,
 * a different code gives different bytes. A nondeterministic image would make
 * this pin flap daily, which is the failure the frozen clock exists to prevent.
 */
export const CERT_VERIFY_CODE = "a1b2c3d4e5f60718";

export const CERT_FULL = {
  driverName: "Jordan Pin", courseTitle: "Hazmat & Dangerous Goods Awareness",
  courseCategory: "Hazardous Materials", scorePct: 92,
  completedAt: new Date("2026-06-01T12:00:00.000Z"),
  expiresAt: new Date("2027-06-01T12:00:00.000Z"),
  carrierName: "Pin Carrier LLC", certId: "PIN123-HAZMAT-AWARENESS",
  verifyCode: CERT_VERIFY_CODE,
};

export const CERT_MINIMAL = {
  driverName: "Jordan Pin", courseTitle: "Hours of Service Fundamentals",
  courseCategory: "Compliance", scorePct: 80,
  completedAt: new Date("2026-06-01T12:00:00.000Z"),
  expiresAt: null, carrierName: null, certId: "PIN124-HOS-FUNDAMENTALS",
  verifyCode: CERT_VERIFY_CODE, verifyQrPng: null,
};

/**
 * The instant SRL countersigned, for the countersigned Rate Confirmation pin.
 *
 * Frozen like everything else here. The render clock is already pinned in
 * documentRenderPins.test.ts, but this value is not the clock: it is a stored
 * column, and in production it comes off the row rather than from `new Date()`
 * at render time. Pinning it keeps the two independent, so a change to the
 * render clock cannot silently move this pin and vice versa.
 *
 * The NAME and TITLE deliberately are not pinned. buildRcCountersign resolves
 * them from config/authority, which is also where the agreement pins get the
 * broker signatory, so changing the officer moves both — and it should, because
 * the documents changed.
 */
export const PIN_RC_COUNTERSIGN_AT = new Date("2026-09-01T12:00:00.000Z");
