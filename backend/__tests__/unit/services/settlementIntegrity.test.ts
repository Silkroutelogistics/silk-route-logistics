// Settlement integrity — the arithmetic, on every path that touches carrier money.
//
// Three defects live here, and the first one deleted $2,800 of a carrier's money
// as a side effect of an AE clicking approve:
//
//   C1  syncCarrierPayAccessorials rebuilt the gross as
//       `lineHaul + fuelSurcharge + accessorialsTotal`. All three columns are
//       Float? and carrierPayController wrote NONE of them, so a hand-raised
//       $3,100 settlement re-priced to $300 the moment a detention row was
//       approved against it.
//
//   C3  "at cost" held on ONE of the three charge paths. The manual path
//       multiplied the whole settlement; the carrier-portal path read the
//       reimbursement out of RC formData behind a `status: "SIGNED"` filter
//       that matches nothing on a live SENT rate confirmation, so its carve-out
//       resolved to 0 and was decorative.
//
//   C4  accountingController.updatePayment carried the fee forward on every
//       edit but computed the carve-out only inside `if (paymentTier)`. Moving
//       a scheduled date took another $3.00 off the carrier, silently.
//
// The worked example is the sprint's, and every figure below is asserted to the
// cent:
//
//   GOLD carrier, $2,400 line haul, $400 fuel surcharge,
//   5h pickup dwell -> $150 detention (2h free, 3 billable at the ratified $50/hr),
//   $150 lumper fronted by the carrier and reimbursed AT COST.
//
//   Fee base $2,950 (gross less the lumper) · fee $59.00 · carrier net $3,041.00
//   Customer billed $3,700.00 across three itemised lines.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import {
  carrierAccessorialsForLoad,
  atCostReimbursementsForLoad,
  syncCarrierPayAccessorials,
  onLoadDelivered,
} from "../../../src/services/integrationService";
import { createCarrierPay } from "../../../src/controllers/carrierPayController";
import { updatePayment } from "../../../src/controllers/accountingController";
import { autoGenerateInvoice } from "../../../src/services/invoiceService";

const mockPrisma = vi.mocked(prisma, true) as any;

// ── The worked example ────────────────────────────────────────────────
const LINEHAUL = 2400;
const FSC = 400;
const DETENTION = 150;
const LUMPER = 150;
const ACCESSORIALS = DETENTION + LUMPER; // 300
const GROSS = LINEHAUL + FSC + ACCESSORIALS; // 3100
const FEE_BASE = GROSS - LUMPER; // 2950 — the lumper is the carrier's own money
const GOLD_7DAY_PCT = 2;
const FEE = 59.0; // 2950 * 0.02
const CARRIER_NET = 3041.0; // 3100 - 59

const CUSTOMER_LINEHAUL = 3000;
const CUSTOMER_TOTAL = 3700.0; // 3000 + 400 fuel + 300 accessorials at cost

const APPROVED_LEDGER = [
  { id: "acc-det", type: "DETENTION_DEL", amount: DETENTION, notes: "5h dwell", billedTo: "SHIPPER" },
  { id: "acc-lump", type: "LUMPER", amount: LUMPER, notes: "receipt on file", billedTo: "SHIPPER" },
];

/** An express `res` that records what the controller sent. */
function mockRes() {
  const res: any = { statusCode: 200, body: undefined };
  res.status = vi.fn((c: number) => {
    res.statusCode = c;
    return res;
  });
  res.json = vi.fn((b: unknown) => {
    res.body = b;
    return res;
  });
  return res;
}

/** A carrier fully cleared to be charged: pilot approved, agreement signed, enabled. */
function arrangeQuickPayGates() {
  mockPrisma.carrierProfile.findUnique.mockResolvedValue({
    id: "profile-1",
    tier: "GOLD",
    quickPayEnabled: true,
  });
  mockPrisma.quickPayEnrollment.findFirst.mockResolvedValue({ status: "APPROVED" });
  mockPrisma.carrierAgreement.findFirst.mockResolvedValue({ id: "qp-agreement" });
}

/** The carrier user id the settlement fixtures are raised against. */
const CARRIER_USER_ID = "clcarrieruser000000000001";
const LOAD_ID = "clload00000000000000000001";

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  mockPrisma.loadAccessorial.findMany.mockResolvedValue(APPROVED_LEDGER);
  mockPrisma.approvalQueue.create.mockResolvedValue({});
  mockPrisma.notification.create.mockResolvedValue({});
});

// ─────────────────────────────────────────────────────────────────────
// C1 — the settlement-destroying rebuild
// ─────────────────────────────────────────────────────────────────────
describe("C1 — a late accessorial approval cannot destroy a settlement", () => {
  /**
   * The exact production row carrierPayController.createCarrierPay used to
   * write: an amount, and nulls in every component column.
   */
  function handRaisedPay(overrides: Record<string, any> = {}) {
    return {
      id: "pay-1",
      paymentNumber: "CP-20260816-0001",
      loadId: "load-1",
      carrierId: "carrier-user-1",
      status: "PENDING",
      lineHaul: null,
      fuelSurcharge: null,
      accessorialsTotal: null,
      amount: 3100,
      grossAmount: null,
      netAmount: 3100,
      quickPayFeePercent: 0,
      rateConfirmationId: null,
      notes: "Raised by hand",
      ...overrides,
    };
  }

  function arrangeSync(pay: any) {
    mockPrisma.carrierPay.findFirst.mockResolvedValue(pay);
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1",
      referenceNumber: "SRL-121485",
      carrierId: "carrier-user-1",
    });
    mockPrisma.carrierPay.update.mockResolvedValue({});
  }

  it("adds the $300 to a $3,100 settlement whose component columns are all null", async () => {
    // THE REGRESSION. The old rebuild read null + null + 300 and wrote $300,
    // deleting $2,800 the carrier had already been promised.
    arrangeSync(handRaisedPay());

    await syncCarrierPayAccessorials("load-1");

    const data = mockPrisma.carrierPay.update.mock.calls[0][0].data;
    expect(data.grossAmount).toBe(3400.0); // 3100 + 300, not 300
    expect(data.amount).toBe(3400.0);
    expect(data.netAmount).toBe(3400.0); // no fee recorded on this settlement
    expect(data.accessorialsTotal).toBe(300);
  });

  it("moves the settlement by the accessorial delta and by nothing else", async () => {
    arrangeSync(handRaisedPay());

    await syncCarrierPayAccessorials("load-1");

    const data = mockPrisma.carrierPay.update.mock.calls[0][0].data;
    expect(data.grossAmount - 3100).toBeCloseTo(ACCESSORIALS, 2);
    expect(data.netAmount - 3100).toBeCloseTo(ACCESSORIALS, 2);
  });

  it("a late-approved accessorial can never reduce a settlement", async () => {
    // Every shape of a partly-written row: nulls, zeros, and a row that
    // recorded a gross but no split.
    const shapes = [
      handRaisedPay(),
      handRaisedPay({ lineHaul: 0, fuelSurcharge: 0, accessorialsTotal: 0 }),
      handRaisedPay({ grossAmount: 3100, lineHaul: null, fuelSurcharge: null }),
    ];

    for (const shape of shapes) {
      vi.clearAllMocks();
      mockPrisma.loadAccessorial.findMany.mockResolvedValue(APPROVED_LEDGER);
      arrangeSync(shape);

      await syncCarrierPayAccessorials("load-1");

      const data = mockPrisma.carrierPay.update.mock.calls[0][0].data;
      expect(data.grossAmount).toBeGreaterThanOrEqual(shape.amount);
      expect(data.netAmount).toBeGreaterThanOrEqual(shape.netAmount);
    }
  });

  it("still re-prices a fully-populated Quick Pay settlement to the cent", async () => {
    // The delivery path writes every column, and the fee frozen at
    // rate-confirmation time carries over untouched.
    arrangeSync(
      handRaisedPay({
        lineHaul: LINEHAUL,
        fuelSurcharge: FSC,
        accessorialsTotal: 0,
        amount: 2800,
        grossAmount: 2800,
        netAmount: 2744, // 2800 less 2% with nothing to carve out yet
        quickPayFeePercent: GOLD_7DAY_PCT,
      }),
    );

    await syncCarrierPayAccessorials("load-1");

    const data = mockPrisma.carrierPay.update.mock.calls[0][0].data;
    expect(data.grossAmount).toBe(GROSS);
    expect(data.quickPayFeeAmount).toBe(FEE); // 2% of $2,950, not of $3,100
    expect(data.netAmount).toBe(CARRIER_NET);
    // The accessorial change does not re-open the price of the freight.
    expect(data.quickPayFeePercent).toBeUndefined();
  });

  it("refuses to write, and queues, when the movement exceeds the accessorial delta", async () => {
    // A row whose net does not agree with its gross — the fingerprint of a
    // settlement a previous bad re-price already damaged. Normalising it here
    // would move the net by $3,100 on a $300 approval. Refuse and tell someone.
    arrangeSync(handRaisedPay({ grossAmount: 3100, netAmount: 300 }));

    await syncCarrierPayAccessorials("load-1");

    expect(mockPrisma.carrierPay.update).not.toHaveBeenCalled();
    expect(mockPrisma.approvalQueue.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ referenceId: "pay-1", priority: "HIGH", amount: ACCESSORIALS }),
      }),
    );
  });

  it("leaves a committed settlement alone and queues the difference", async () => {
    arrangeSync(handRaisedPay({ status: "PAID" }));

    await syncCarrierPayAccessorials("load-1");

    expect(mockPrisma.carrierPay.update).not.toHaveBeenCalled();
    expect(mockPrisma.approvalQueue.create).toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────
// C3 — at cost, on every path
// ─────────────────────────────────────────────────────────────────────
describe("C3 — the at-cost carve-out holds on every charge path", () => {
  it("one helper answers the question, off the APPROVED ledger", async () => {
    expect(await atCostReimbursementsForLoad("load-1")).toBe(LUMPER);
    expect(mockPrisma.loadAccessorial.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { loadId: "load-1", status: "APPROVED" } }),
    );
  });

  it("counts the lumper and not the detention — one is fronted, one is earned", async () => {
    expect(await atCostReimbursementsForLoad("load-1")).toBe(150);
    const acc = await carrierAccessorialsForLoad("load-1", 0);
    expect(acc.total).toBe(ACCESSORIALS);
    expect(acc.reimbursements).toBe(LUMPER);
  });

  it("delivery path: fee $59.00 on a $2,950 base, net $3,041.00", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1",
      referenceNumber: "SRL-121485",
      carrierId: "carrier-user-1",
      customerId: null,
      carrierRate: LINEHAUL,
      rate: LINEHAUL,
      fuelSurcharge: FSC,
      rateConfirmationPdfUrl: "https://srl/rc/SRL-121485R.pdf",
      quickPayFeePercent: GOLD_7DAY_PCT,
      quickPaySpeed: "SEVEN_DAY",
      carrier: {
        id: "carrier-user-1",
        carrierProfile: { id: "profile-1", tier: "GOLD", quickPayEnabled: true },
      },
      rateConfirmations: [{ id: "rc-1", fuelSurcharge: FSC, accessorialTotal: 0, formData: {} }],
      customer: null,
    });
    mockPrisma.carrierPay.findFirst.mockResolvedValue(null);
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue({ id: "qp-agreement" });
    mockPrisma.quickPayEnrollment.findFirst.mockResolvedValue({ status: "APPROVED" });
    mockPrisma.document.findFirst.mockResolvedValue({ createdAt: new Date("2026-08-14T12:00:00Z") });
    mockPrisma.carrierPay.count.mockResolvedValue(0);
    mockPrisma.carrierPay.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
    mockPrisma.carrierPay.create.mockImplementation(async ({ data }: any) => ({ id: "pay-1", ...data }));
    mockPrisma.carrierProfile.update.mockResolvedValue({});
    mockPrisma.factoringFund.findFirst.mockResolvedValue({ runningBalance: 0 });
    mockPrisma.factoringFund.create.mockResolvedValue({});

    await onLoadDelivered("load-1");

    const s = mockPrisma.carrierPay.create.mock.calls[0][0].data;
    expect(s.grossAmount).toBe(GROSS);
    expect(s.quickPayFeeAmount).toBe(FEE);
    expect(s.netAmount).toBe(CARRIER_NET);
  });

  it("manual path: fee $59.00 on a $2,950 base, net $3,041.00", async () => {
    // Was `data.amount * pct` — 2% of the whole $3,100, $3.00 of it taken out
    // of the lumper the carrier fronted.
    arrangeQuickPayGates();
    mockPrisma.load.findUnique.mockResolvedValue({
      id: LOAD_ID,
      carrierId: CARRIER_USER_ID, // Load.carrierId is a User id, and must match.
      referenceNumber: "SRL-121485",
      quickPayFeePercent: GOLD_7DAY_PCT,
      quickPaySpeed: "SEVEN_DAY",
    });
    mockPrisma.carrierPay.create.mockImplementation(async ({ data }: any) => ({ id: "pay-1", ...data }));

    const res = mockRes();
    await createCarrierPay(
      {
        body: { carrierId: CARRIER_USER_ID, loadId: LOAD_ID, amount: GROSS, isQuickPay: true },
        user: { id: "ae-1", email: "ae@srl.test", role: "ADMIN" },
      } as any,
      res,
    );

    expect(res.statusCode).toBe(201);
    const data = mockPrisma.carrierPay.create.mock.calls[0][0].data;
    expect(data.quickPayDiscount).toBe(FEE);
    expect(data.netAmount).toBe(CARRIER_NET);
    expect(data.grossAmount).toBe(GROSS);
  });
});

// ─────────────────────────────────────────────────────────────────────
// C4 — the carve-out cannot fall off an unrelated edit
// ─────────────────────────────────────────────────────────────────────
describe("C4 — editing an unrelated field keeps the at-cost carve-out", () => {
  function arrangeUpdate() {
    mockPrisma.carrierPay.findUnique.mockResolvedValue({
      id: "pay-1",
      status: "PREPARED",
      carrierId: "carrier-user-1",
      loadId: "load-1",
      // v3.8.asb — this fixture used to supply lineHaul/fuelSurcharge/
      // accessorialsTotal, which is the DELIVERY-path row shape. The manual
      // path (carrierPayController.createCarrierPay) deliberately writes
      // lineHaul and fuelSurcharge as null because it takes one `amount` with
      // no split. Testing only the populated shape is why updatePayment could
      // rebuild a gross from three nulls and write a $3,100 settlement to zero
      // on a notes-only edit, with this suite green.
      //
      // `amount` and `grossAmount` are what updatePayment now anchors on, and
      // they are the fields that actually exist on every row.
      amount: GROSS,
      grossAmount: GROSS,
      lineHaul: LINEHAUL,
      fuelSurcharge: FSC,
      accessorialsTotal: ACCESSORIALS,
      quickPayFeePercent: GOLD_7DAY_PCT,
      paymentTier: "PRIORITY",
      paymentMethod: null,
      scheduledDate: null,
      dueDate: null,
      notes: null,
    });
    mockPrisma.load.findUnique.mockResolvedValue({ quickPayFeePercent: GOLD_7DAY_PCT });
    arrangeQuickPayGates();
    mockPrisma.carrierPay.update.mockImplementation(async ({ data }: any) => data);
  }

  it("moving a scheduled date does not take another $3.00 off the carrier", async () => {
    arrangeUpdate();
    const res = mockRes();

    // No paymentTier in the body. The old code carried the 2% forward and
    // dropped `reimbursements` to 0, charging the fee on the lumper.
    await updatePayment(
      { params: { id: "pay-1" }, body: { scheduledDate: "2026-08-20" }, user: { id: "ae-1" } } as any,
      res,
    );

    const data = mockPrisma.carrierPay.update.mock.calls[0][0].data;
    expect(data.quickPayFeeAmount).toBe(FEE); // 2% of $2,950
    expect(data.netAmount).toBe(CARRIER_NET);
  });

  // v3.8.asb — N1/R1. The defect this suite shipped past.
  //
  // carrierPayController.createCarrierPay writes { amount, grossAmount,
  // accessorialsTotal: 0 } and leaves lineHaul and fuelSurcharge NULL on
  // purpose, because that route takes one amount with no split. updatePayment
  // rebuilt its gross as `lineHaul ?? existing.lineHaul ?? 0` plus the other
  // two, so all three read 0 and a notes-only edit wrote the settlement to
  // zero:  before 3100 / 3041   ->   after 0 / 0.
  //
  // Two independent proofs executed this against the real controller. The
  // suite stayed green because arrangeUpdate only ever built the delivery-path
  // row. This test is the manual-path row.
  function arrangeManualRow() {
    mockPrisma.carrierPay.findUnique.mockResolvedValue({
      id: "pay-1",
      status: "PENDING",
      carrierId: "carrier-user-1",
      loadId: "load-1",
      amount: GROSS,
      grossAmount: GROSS,
      lineHaul: null,        // <- the shape carrierPayController actually writes
      fuelSurcharge: null,   // <-
      accessorialsTotal: 0,
      quickPayFeePercent: GOLD_7DAY_PCT,
      paymentTier: "PRIORITY",
      paymentMethod: null,
      scheduledDate: null,
      dueDate: null,
      notes: null,
    });
    mockPrisma.load.findUnique.mockResolvedValue({ quickPayFeePercent: GOLD_7DAY_PCT });
    arrangeQuickPayGates();
    mockPrisma.carrierPay.update.mockImplementation(async ({ data }: any) => data);
  }

  it("a notes-only edit does not zero a hand-raised settlement", async () => {
    arrangeManualRow();
    await updatePayment(
      { params: { id: "pay-1" }, body: { notes: "called the shipper" }, user: { id: "ae-1" } } as any,
      mockRes(),
    );

    const data = mockPrisma.carrierPay.update.mock.calls[0][0].data;
    expect(data.amount).toBe(GROSS);        // 3100, not 0
    expect(data.grossAmount).toBe(GROSS);
    expect(data.netAmount).toBe(CARRIER_NET); // 3041, not 0
  });

  it("a date edit does not zero a hand-raised settlement either", async () => {
    arrangeManualRow();
    await updatePayment(
      { params: { id: "pay-1" }, body: { scheduledDate: "2026-08-20" }, user: { id: "ae-1" } } as any,
      mockRes(),
    );
    expect(mockPrisma.carrierPay.update.mock.calls[0][0].data.amount).toBe(GROSS);
  });

  it("still recomputes the total when the caller actually supplies a money field", async () => {
    arrangeManualRow();
    await updatePayment(
      { params: { id: "pay-1" }, body: { lineHaul: 2500, fuelSurcharge: 400, accessorialsTotal: 300 }, user: { id: "ae-1" } } as any,
      mockRes(),
    );
    // A real money edit must still move the number, or the fix would have made
    // the route read-only for amounts.
    expect(mockPrisma.carrierPay.update.mock.calls[0][0].data.amount).toBe(3200);
  });

  it("prices the same whether or not the edit happens to touch paymentTier", async () => {
    arrangeUpdate();
    await updatePayment(
      { params: { id: "pay-1" }, body: { notes: "moved" }, user: { id: "ae-1" } } as any,
      mockRes(),
    );
    const withoutTier = mockPrisma.carrierPay.update.mock.calls[0][0].data;

    vi.clearAllMocks();
    mockPrisma.loadAccessorial.findMany.mockResolvedValue(APPROVED_LEDGER);
    arrangeUpdate();
    await updatePayment(
      { params: { id: "pay-1" }, body: { paymentTier: "PRIORITY" }, user: { id: "ae-1" } } as any,
      mockRes(),
    );
    const withTier = mockPrisma.carrierPay.update.mock.calls[0][0].data;

    expect(withoutTier.quickPayFeeAmount).toBe(withTier.quickPayFeeAmount);
    expect(withoutTier.netAmount).toBe(withTier.netAmount);
    expect(withoutTier.netAmount).toBe(CARRIER_NET);
  });
});

// ─────────────────────────────────────────────────────────────────────
// C5 — no issued document, no fee
// ─────────────────────────────────────────────────────────────────────
describe("C5 — a fee is charged only when one was frozen on the load", () => {
  it("refuses to price off the ladder when no fee is recorded", async () => {
    // The state between a carrier electing Quick Pay and an AE sending the rate
    // confirmation. The ladder fallback used to charge a percentage here that
    // had been issued on no document.
    arrangeQuickPayGates();
    mockPrisma.load.findUnique.mockResolvedValue({
      id: LOAD_ID,
      carrierId: CARRIER_USER_ID,
      referenceNumber: "SRL-121485",
      quickPayFeePercent: null, // nothing frozen — the rate confirmation is unsent
      quickPaySpeed: "SEVEN_DAY", // and a speed alone must not price it
    });

    const res = mockRes();
    await createCarrierPay(
      {
        body: { carrierId: CARRIER_USER_ID, loadId: LOAD_ID, amount: GROSS, isQuickPay: true },
        user: { id: "ae-1" },
      } as any,
      res,
    );

    expect(res.statusCode).toBe(422);
    expect(res.body.code).toBe("QP_NOT_ELECTED_ON_LOAD");
    expect(mockPrisma.carrierPay.create).not.toHaveBeenCalled();
  });

  it("raises the settlement at the full amount when Quick Pay is not asked for", async () => {
    mockPrisma.carrierPay.create.mockImplementation(async ({ data }: any) => ({ id: "pay-1", ...data }));

    const res = mockRes();
    await createCarrierPay(
      { body: { carrierId: CARRIER_USER_ID, loadId: LOAD_ID, amount: GROSS }, user: { id: "ae-1" } } as any,
      res,
    );

    const data = mockPrisma.carrierPay.create.mock.calls[0][0].data;
    expect(data.netAmount).toBe(GROSS); // the whole $3,100
    expect(data.quickPayDiscount).toBeNull();
    expect(data.accessorialsTotal).toBe(0); // stated, not left null
  });
});

// ─────────────────────────────────────────────────────────────────────
// C9 — one store, read by both sides
// ─────────────────────────────────────────────────────────────────────
describe("C9 — the ledger is authoritative on both sides of the trade", () => {
  it("pays the ledger, not a larger figure typed onto the rate confirmation", async () => {
    // The RC declared $200 of layover the ledger has no row for. Paying the
    // declared figure settled the carrier at $200 and billed the customer $150,
    // because the invoice can only itemise rows that exist.
    mockPrisma.loadAccessorial.findMany.mockResolvedValue([]);

    const acc = await carrierAccessorialsForLoad("load-1", 200);

    expect(acc.total).toBe(0);
    expect(acc.rcShortfall).toBe(200); // surfaced, so the row gets recorded
  });

  it("never adds the two stores together", async () => {
    mockPrisma.loadAccessorial.findMany.mockResolvedValue([APPROVED_LEDGER[0]]);

    const acc = await carrierAccessorialsForLoad("load-1", DETENTION);

    expect(acc.total).toBe(DETENTION);
    expect(acc.rcShortfall).toBe(0);
  });

  it("bills the customer exactly what the carrier is owed — $3,700.00 at cost", async () => {
    mockPrisma.invoice.findFirst.mockResolvedValue(null);
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1",
      referenceNumber: "SRL-121485",
      posterId: "ae-1",
      customerRate: CUSTOMER_LINEHAUL,
      fuelSurcharge: FSC,
      originCity: "Detroit",
      originState: "MI",
      destCity: "Chicago",
      destState: "IL",
    });
    mockPrisma.invoice.create.mockImplementation(async ({ data }: any) => ({ id: "inv-1", ...data }));
    mockPrisma.invoiceLineItem.createMany.mockResolvedValue({ count: 4 });
    mockPrisma.loadAccessorial.updateMany.mockResolvedValue({ count: 2 });

    await autoGenerateInvoice("load-1");

    const inv = mockPrisma.invoice.create.mock.calls[0][0].data;
    expect(inv.totalAmount).toBe(CUSTOMER_TOTAL);
    // At cost: the accessorial figure billed equals the accessorial figure owed,
    // to the cent. Margin lives in the line-haul spread, never in a pass-through.
    expect(inv.accessorialsAmount).toBe(ACCESSORIALS);
    expect(inv.accessorialsAmount).toBe((await carrierAccessorialsForLoad("load-1", 0)).total);
  });
});
