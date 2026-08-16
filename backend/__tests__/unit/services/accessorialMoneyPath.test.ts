// Accessorials reaching the money — the gap Partition 3 closes.
//
// Detention and lumper were computed correctly by applyStopDwellCharges,
// written correctly to LoadAccessorial, and then read by nobody in a money
// path. The carrier settlement summed a frozen RC scalar that
// autoRateConfirmation hardcodes to 0; the customer invoice was linehaul plus
// fuel and nothing else. A carrier held five hours was owed $150 by the terms
// printed on their own rate confirmation and paid $0, and the customer was
// billed for neither the detention nor the lumper SRL had fronted.
//
// The worked example throughout is the one the sprint specifies:
//   GOLD carrier, $2,400 linehaul, $400 fuel surcharge,
//   5h dwell -> $150 detention (2h free, 3 billable at $50/hr),
//   $150 lumper fronted by the carrier and reimbursed at cost.
//
// Every figure below is asserted to the cent, with and without Quick Pay.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import {
  carrierAccessorialsForLoad,
  syncCarrierPayAccessorials,
  onLoadDelivered,
} from "../../../src/services/integrationService";
import { autoGenerateInvoice, syncInvoiceAccessorials } from "../../../src/services/invoiceService";

const mockPrisma = vi.mocked(prisma, true) as any;

// ── The worked example ────────────────────────────────────────────────
const LINEHAUL = 2400;
const FSC = 400;
const DETENTION = 150; // 5h dwell, 2h free, 3h billable at the ratified $50/hr
const LUMPER = 150; // fronted by the carrier, reimbursed AT COST
const CUSTOMER_RATE = 3000;

// Gold, per the locked pay ladder: Net-21 free, 2% seven-day, 4% same-day.
const GOLD_7DAY_PCT = 2;

const APPROVED_LEDGER = [
  { id: "acc-det", type: "DETENTION_DEL", amount: DETENTION, notes: "5h dwell", billedTo: "SHIPPER" },
  { id: "acc-lump", type: "LUMPER", amount: LUMPER, notes: "receipt on file", billedTo: "SHIPPER" },
];

function deliveredLoad(overrides: Record<string, any> = {}) {
  return {
    id: "load-1",
    referenceNumber: "SRL-121485",
    carrierId: "carrier-user-1",
    customerId: null,
    carrierRate: LINEHAUL,
    rate: LINEHAUL,
    fuelSurcharge: FSC,
    distance: 300,
    // The rate confirmation was actually SENT. Without this the settlement
    // pays standard terms at no fee, which is its own test below.
    rateConfirmationPdfUrl: "https://srl/rc/SRL-121485R.pdf",
    quickPayFeePercent: GOLD_7DAY_PCT,
    quickPaySpeed: "SEVEN_DAY",
    carrier: {
      id: "carrier-user-1",
      company: "Test Carrier LLC",
      carrierProfile: {
        id: "profile-1",
        tier: "GOLD",
        cppTier: "GOLD",
        cppTotalLoads: 14,
        cppTotalMiles: 9000,
        quickPayEnabled: true,
      },
    },
    // accessorialTotal 0 is exactly what autoRateConfirmation writes.
    rateConfirmations: [{ id: "rc-1", fuelSurcharge: FSC, accessorialTotal: 0, formData: {} }],
    customer: null,
    ...overrides,
  };
}

/** Arrange every collaborator a delivery settlement touches. */
function arrangeDelivery(load: any, opts: { ledger?: any[] } = {}) {
  mockPrisma.load.findUnique.mockResolvedValue(load);
  mockPrisma.carrierPay.findFirst.mockResolvedValue(null); // no settlement yet
  mockPrisma.loadAccessorial.findMany.mockResolvedValue(opts.ledger ?? APPROVED_LEDGER);
  mockPrisma.carrierAgreement.findFirst.mockResolvedValue({ id: "qp-agreement" }); // signed
  mockPrisma.quickPayEnrollment.findFirst.mockResolvedValue({ status: "APPROVED" });
  mockPrisma.document.findFirst.mockResolvedValue({ createdAt: new Date("2026-08-14T12:00:00Z") }); // POD
  mockPrisma.carrierPay.count.mockResolvedValue(0);
  mockPrisma.carrierPay.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  mockPrisma.carrierPay.create.mockImplementation(async ({ data }: any) => ({ id: "pay-1", ...data }));
  mockPrisma.carrierProfile.update.mockResolvedValue({});
  mockPrisma.approvalQueue.create.mockResolvedValue({});
  mockPrisma.factoringFund.findFirst.mockResolvedValue({ runningBalance: 0 });
  mockPrisma.factoringFund.create.mockResolvedValue({});
}

/** The data object handed to prisma.carrierPay.create. */
function settlement() {
  return mockPrisma.carrierPay.create.mock.calls[0][0].data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  mockPrisma.invoiceLineItem.createMany.mockResolvedValue({ count: 1 });
  mockPrisma.invoiceLineItem.count.mockResolvedValue(0);
  mockPrisma.loadAccessorial.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.notification.create.mockResolvedValue({});
  mockPrisma.invoice.findMany.mockResolvedValue([]);
});

// ─────────────────────────────────────────────────────────────────────
describe("carrierAccessorialsForLoad — the ledger read", () => {
  it("sums the APPROVED ledger and splits out the at-cost reimbursement", async () => {
    mockPrisma.loadAccessorial.findMany.mockResolvedValue(APPROVED_LEDGER);

    const acc = await carrierAccessorialsForLoad("load-1", 0);

    expect(acc.total).toBe(300); // 150 detention + 150 lumper
    expect(acc.reimbursements).toBe(150); // lumper only — detention is earned
    expect(acc.rcShortfall).toBe(0);
  });

  it("only reads APPROVED rows — a pending claim is not yet money", async () => {
    mockPrisma.loadAccessorial.findMany.mockResolvedValue([]);

    const acc = await carrierAccessorialsForLoad("load-1", 0);

    expect(acc.total).toBe(0);
    expect(mockPrisma.loadAccessorial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { loadId: "load-1", status: "APPROVED" } }),
    );
  });

  it("pays the ledger and reports the gap when the RC declared more", async () => {
    // Ledger holds nothing, but the rate confirmation promised the carrier $200
    // of layover in writing.
    //
    // v3.8.asb — this used to return the higher of the two (`Math.max`), on the
    // rule that an ambiguous case pays the carrier MORE. The rule is right; the
    // floor was the wrong way to honour it, because only ONE side of the trade
    // could see the higher figure. The customer invoice itemises one line per
    // ledger row and can only bill rows that exist, so the carrier was settled
    // at $200 and the customer billed $150 — a permanent hole against a policy
    // (§5) whose whole content is that the customer is billed exactly what the
    // carrier is owed.
    //
    // The gap is now surfaced instead. Recording the missing ledger row pays the
    // carrier AND bills the customer in the same movement; paying the promise
    // here removed the only pressure to record it.
    mockPrisma.loadAccessorial.findMany.mockResolvedValue([]);

    const acc = await carrierAccessorialsForLoad("load-1", 200);

    expect(acc.total).toBe(0);
    expect(acc.rcShortfall).toBe(200);
  });

  it("never adds the two stores together", async () => {
    // Same $150 detention on both the RC and the ledger must bill once.
    mockPrisma.loadAccessorial.findMany.mockResolvedValue([APPROVED_LEDGER[0]]);

    const acc = await carrierAccessorialsForLoad("load-1", 150);

    expect(acc.total).toBe(150);
    expect(acc.rcShortfall).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("carrier settlement — accessorials reach the pay", () => {
  it("GOLD with 7-day Quick Pay: gross $3,100.00, fee $59.00, net $3,041.00", async () => {
    arrangeDelivery(deliveredLoad());

    await onLoadDelivered("load-1");

    const s = settlement();
    expect(s.lineHaul).toBe(2400);
    expect(s.fuelSurcharge).toBe(400);
    expect(s.accessorialsTotal).toBe(300);
    expect(s.grossAmount).toBe(3100.0);

    // The 2% is charged on $2,950 — gross less the $150 lumper the carrier
    // fronted. Charging a fee on a carrier's own money would be skimming it.
    expect(s.quickPayFeePercent).toBe(2);
    expect(s.quickPayFeeAmount).toBe(59.0); // 2950 * 0.02
    expect(s.netAmount).toBe(3041.0); // 3100 - 59
    expect(s.paymentTier).toBe("PRIORITY");
  });

  it("GOLD on standard terms: gross $3,100.00, no fee, net $3,100.00", async () => {
    // No election frozen on the load. Quick Pay is opt-in per load.
    arrangeDelivery(deliveredLoad({ quickPayFeePercent: null, quickPaySpeed: null }));

    await onLoadDelivered("load-1");

    const s = settlement();
    expect(s.grossAmount).toBe(3100.0);
    expect(s.accessorialsTotal).toBe(300);
    expect(s.quickPayFeeAmount).toBe(0);
    expect(s.netAmount).toBe(3100.0);
    expect(s.paymentTier).toBe("STANDARD");
  });

  it("pays standard terms at no fee when the rate confirmation was never sent", async () => {
    // The fee freezes at DRAFT creation; only an AE clicking send issues the
    // document. A fee under an instrument the carrier could not read is not a
    // fee they agreed to.
    arrangeDelivery(deliveredLoad({ rateConfirmationPdfUrl: null }));

    await onLoadDelivered("load-1");

    const s = settlement();
    expect(s.quickPayFeeAmount).toBe(0);
    expect(s.netAmount).toBe(3100.0); // the carrier keeps the $59
    expect(s.paymentTier).toBe("STANDARD");
  });

  it("still pays the accessorials when the RC was never sent", async () => {
    arrangeDelivery(deliveredLoad({ rateConfirmationPdfUrl: null }));

    await onLoadDelivered("load-1");

    // Withholding the fee must not withhold the detention with it.
    expect(settlement().accessorialsTotal).toBe(300);
  });

  it("does not put a $3,100 Gold settlement in front of an operator", async () => {
    // Gold auto-approves to $4,000 a load. The old flat $5,000 and the old
    // per-tier read disagreed in both directions; this one is inside its own.
    arrangeDelivery(deliveredLoad());

    await onLoadDelivered("load-1");

    expect(mockPrisma.approvalQueue.create).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("customer invoice — accessorials billed AT COST", () => {
  const invoiceLoad = {
    id: "load-1",
    referenceNumber: "SRL-121485",
    posterId: "ae-1",
    customerRate: CUSTOMER_RATE,
    fuelSurcharge: FSC,
    originCity: "Detroit",
    originState: "MI",
    destCity: "Chicago",
    destState: "IL",
  };

  it("bills $3,700.00: $3,000 linehaul + $400 fuel + $300 accessorials at cost", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    mockPrisma.load.findUnique.mockResolvedValue(invoiceLoad);
    mockPrisma.loadAccessorial.findMany.mockResolvedValue(APPROVED_LEDGER);
    mockPrisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv-1", ...data }));

    await autoGenerateInvoice("load-1");

    const data = mockPrisma.invoice.create.mock.calls[0][0].data;
    expect(data.lineHaulAmount).toBe(3000);
    expect(data.fuelSurchargeAmount).toBe(400);
    expect(data.accessorialsAmount).toBe(300);
    expect(data.totalAmount).toBe(3700.0);
    expect(data.amount).toBe(3700.0);
  });

  it("bills the carrier figure exactly — no markup on a pass-through", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    mockPrisma.load.findUnique.mockResolvedValue(invoiceLoad);
    mockPrisma.loadAccessorial.findMany.mockResolvedValue(APPROVED_LEDGER);
    mockPrisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv-1", ...data }));

    await autoGenerateInvoice("load-1");

    // What the customer is billed for accessorials equals what the carrier is
    // owed for them, to the cent. Margin lives in the linehaul spread.
    const billed = mockPrisma.invoice.create.mock.calls[0][0].data.accessorialsAmount;
    const owed = (await carrierAccessorialsForLoad("load-1", 0)).total;
    expect(billed).toBe(owed);
    expect(billed).toBe(300);
  });

  it("itemises each accessorial as its own line so the customer can see it", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    mockPrisma.load.findUnique.mockResolvedValue(invoiceLoad);
    mockPrisma.loadAccessorial.findMany.mockResolvedValue(APPROVED_LEDGER);
    mockPrisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv-1", ...data }));

    await autoGenerateInvoice("load-1");

    const lines = mockPrisma.invoiceLineItem.createMany.mock.calls[0][0].data;
    expect(lines).toHaveLength(4); // linehaul, fuel, detention, lumper
    const detention = lines.find((l: any) => l.type === "DETENTION");
    const lumper = lines.find((l: any) => l.type === "LUMPER");
    expect(detention).toMatchObject({ amount: 150, rate: 150, quantity: 1 });
    expect(detention.description).toContain("Detention at delivery");
    expect(lumper).toMatchObject({ amount: 150 });
  });

  it("marks the lines billed so they cannot be billed a second time", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    mockPrisma.load.findUnique.mockResolvedValue(invoiceLoad);
    mockPrisma.loadAccessorial.findMany.mockResolvedValue(APPROVED_LEDGER);
    mockPrisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv-1", ...data }));

    await autoGenerateInvoice("load-1");

    expect(mockPrisma.loadAccessorial.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["acc-det", "acc-lump"] } },
      data: { shipperInvoiceId: "inv-1" },
    });
  });

  it("does not bill a line an AE marked as not the customer's", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    mockPrisma.load.findUnique.mockResolvedValue(invoiceLoad);
    mockPrisma.loadAccessorial.findMany.mockResolvedValue([
      APPROVED_LEDGER[0],
      { id: "acc-srl", type: "DEADHEAD", amount: 90, notes: null, billedTo: "SRL" },
    ]);
    mockPrisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv-1", ...data }));

    await autoGenerateInvoice("load-1");

    // The deadhead SRL chose to absorb stays off the customer's invoice.
    expect(mockPrisma.invoice.create.mock.calls[0][0].data.accessorialsAmount).toBe(150);
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("approved after the fact — the duplicate guard", () => {
  it("re-prices an unpaid settlement rather than leaving the detention unpaid", async () => {
    // Settled at delivery with no accessorials on the ledger yet; the AE
    // approves the detention claim the next morning.
    mockPrisma.carrierPay.findFirst.mockResolvedValue({
      id: "pay-1",
      paymentNumber: "CP-20260814-0001",
      loadId: "load-1",
      carrierId: "carrier-user-1",
      status: "PREPARED",
      lineHaul: LINEHAUL,
      fuelSurcharge: FSC,
      accessorialsTotal: 0,
      // v3.8.asb — the money columns a real row always carries. `amount` and
      // `netAmount` are NOT NULL in the schema, so every settlement has them;
      // the re-price now derives the new gross from `amount` rather than
      // rebuilding it from the nullable component columns, which is what stopped
      // a hand-raised $3,100 settlement collapsing to $300.
      amount: LINEHAUL + FSC,
      grossAmount: LINEHAUL + FSC,
      netAmount: 2744, // 2800 less 2%, nothing carved out yet
      quickPayFeePercent: GOLD_7DAY_PCT,
      rateConfirmationId: "rc-1",
      notes: "Auto-generated on delivery",
    });
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", referenceNumber: "SRL-121485", carrierId: "carrier-user-1" });
    mockPrisma.rateConfirmation.findUnique.mockResolvedValue({ accessorialTotal: 0 });
    mockPrisma.loadAccessorial.findMany.mockResolvedValue(APPROVED_LEDGER);
    mockPrisma.carrierPay.update.mockResolvedValue({});

    await syncCarrierPayAccessorials("load-1");

    const data = mockPrisma.carrierPay.update.mock.calls[0][0].data;
    expect(data.accessorialsTotal).toBe(300);
    expect(data.grossAmount).toBe(3100.0);
    expect(data.quickPayFeeAmount).toBe(59.0); // still on the $2,950 base
    expect(data.netAmount).toBe(3041.0);
    // The frozen Quick Pay price is not re-opened by an accessorial change.
    expect(data.quickPayFeePercent).toBeUndefined();
  });

  it("is idempotent — a second approval sync writes nothing", async () => {
    mockPrisma.carrierPay.findFirst.mockResolvedValue({
      id: "pay-1",
      paymentNumber: "CP-20260814-0001",
      loadId: "load-1",
      carrierId: "carrier-user-1",
      status: "PREPARED",
      lineHaul: LINEHAUL,
      fuelSurcharge: FSC,
      accessorialsTotal: 300, // already in step
      quickPayFeePercent: GOLD_7DAY_PCT,
      rateConfirmationId: null,
      notes: "",
    });
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", referenceNumber: "SRL-121485", carrierId: "carrier-user-1" });
    mockPrisma.loadAccessorial.findMany.mockResolvedValue(APPROVED_LEDGER);

    await syncCarrierPayAccessorials("load-1");

    expect(mockPrisma.carrierPay.update).not.toHaveBeenCalled();
  });

  it("does not rewrite a settlement that has already been PAID; queues it instead", async () => {
    mockPrisma.carrierPay.findFirst.mockResolvedValue({
      id: "pay-1",
      paymentNumber: "CP-20260814-0001",
      loadId: "load-1",
      carrierId: "carrier-user-1",
      status: "PAID",
      lineHaul: LINEHAUL,
      fuelSurcharge: FSC,
      accessorialsTotal: 0,
      quickPayFeePercent: GOLD_7DAY_PCT,
      rateConfirmationId: null,
      notes: "",
    });
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", referenceNumber: "SRL-121485", carrierId: "carrier-user-1" });
    mockPrisma.loadAccessorial.findMany.mockResolvedValue(APPROVED_LEDGER);
    mockPrisma.approvalQueue.create.mockResolvedValue({});

    await syncCarrierPayAccessorials("load-1");

    expect(mockPrisma.carrierPay.update).not.toHaveBeenCalled();
    expect(mockPrisma.approvalQueue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ amount: 300, referenceId: "pay-1", requestedById: "carrier-user-1" }),
      }),
    );
  });

  it("does nothing when the load has not been settled yet", async () => {
    mockPrisma.carrierPay.findFirst.mockResolvedValue(null);

    await syncCarrierPayAccessorials("load-1");

    expect(mockPrisma.carrierPay.update).not.toHaveBeenCalled();
    expect(mockPrisma.approvalQueue.create).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
describe("the supplemental invoice — when the S suffix is used", () => {
  const baseDraft = {
    id: "inv-base",
    invoiceNumber: "INV-1043",
    srlDocNumber: "SRL-121485I",
    status: "DRAFT",
    userId: "ae-1",
    totalAmount: 3400,
    accessorialsAmount: 0,
  };

  it("folds into the base invoice while it is still a DRAFT — no second document", async () => {
    mockPrisma.loadAccessorial.findMany.mockResolvedValue(APPROVED_LEDGER);
    mockPrisma.invoice.findFirst.mockResolvedValue(baseDraft);
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1", referenceNumber: "SRL-121485", loadNumber: "SRL-121485", posterId: "ae-1",
    });
    mockPrisma.invoice.update.mockResolvedValue({});
    mockPrisma.invoice.findUnique.mockResolvedValue({ id: "inv-base" });

    await syncInvoiceAccessorials("load-1");

    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
    const data = mockPrisma.invoice.update.mock.calls[0][0].data;
    expect(data.accessorialsAmount).toBe(300);
    expect(data.totalAmount).toBe(3700.0); // 3400 + 300
  });

  it("raises a SUPPLEMENTAL once the base has been SENT to the customer", async () => {
    mockPrisma.loadAccessorial.findMany.mockResolvedValue(APPROVED_LEDGER);
    mockPrisma.invoice.findFirst.mockResolvedValue({ ...baseDraft, status: "SENT" });
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1", referenceNumber: "SRL-121485", loadNumber: "SRL-121485", posterId: "ae-1",
    });
    mockPrisma.invoice.findMany.mockResolvedValue([]); // numbering scans
    mockPrisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv-supp", ...data }));

    await syncInvoiceAccessorials("load-1");

    expect(mockPrisma.invoice.update).not.toHaveBeenCalled(); // base untouched
    const data = mockPrisma.invoice.create.mock.calls[0][0].data;
    expect(data.invoiceKind).toBe("SUPPLEMENTAL");
    expect(data.supplementsInvoiceId).toBe("inv-base");
    expect(data.srlDocNumber).toBe("SRL-121485S"); // the S suffix, finally written
    expect(data.totalAmount).toBe(300.0);
    expect(data.accessorialsAmount).toBe(300.0);
    expect(data.lineHaulAmount).toBe(0);
    expect(data.status).toBe("DRAFT"); // the AE still reviews and sends
  });

  it("bills a late accessorial exactly once", async () => {
    mockPrisma.loadAccessorial.findMany.mockResolvedValue([]); // all already stamped
    mockPrisma.invoice.findFirst.mockResolvedValue({ ...baseDraft, status: "SENT" });

    const result = await syncInvoiceAccessorials("load-1");

    expect(result).toBeNull();
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });

  it("leaves an uninvoiced load alone — the base invoice will read the ledger itself", async () => {
    mockPrisma.loadAccessorial.findMany.mockResolvedValue(APPROVED_LEDGER);
    mockPrisma.invoice.findFirst.mockResolvedValue(null);

    expect(await syncInvoiceAccessorials("load-1")).toBeNull();
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled();
  });
});
