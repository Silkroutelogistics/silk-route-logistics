// §13.3 Item 282c — an amount edit on a stamped row reaches the DRAFT customer
// invoice, the way it already reached the carrier payable.
//
// Peace Transport's shape: the TONU minted at the $200 policy figure and folded
// into the DRAFT base at the flip; the $250 agreed by phone written onto the
// ledger row afterwards. Before 282c the sync selected only UNSTAMPED rows, so
// the row — already stamped — was invisible and the draft billed $200 forever.
//
// Every case here drives the real syncInvoiceAccessorials, not repriceDraftInvoice
// alone, because the wiring is half the claim: the branch has to run after the
// credit pass and before the pending fold, and a test that called the function
// directly would be green with the sync never reaching it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { syncInvoiceAccessorials, repriceDraftInvoice } from "../../../src/services/invoiceService";

const mockPrisma = vi.mocked(prisma, true) as any;

const INV = "inv-base";
const DRAFT = { id: INV, invoiceNumber: "INV-1043", srlDocNumber: "SRL-121492I", status: "DRAFT", userId: "ae-1", amount: 200, totalAmount: 200, accessorialsAmount: 200 };
const TONU_LINE = { id: "li-tonu", accessorialId: "acc-tonu", type: "ACCESSORIAL", amount: 200, sortOrder: 0 };

/** The ledger mock answers the WHERE it is given — status and stamp (Item 273.10). */
function ledger(rows: any[]) {
  mockPrisma.loadAccessorial.findMany.mockImplementation(async ({ where }: any) =>
    rows.filter((r) => {
      if (where?.status && r.status !== where.status) return false;
      if (where && "shipperInvoiceId" in where) {
        const w = where.shipperInvoiceId;
        if (w === null && r.shipperInvoiceId !== null) return false;
        if (w && typeof w === "object" && "not" in w && w.not === null && r.shipperInvoiceId === null) return false;
      }
      return true;
    }),
  );
}
const tonuRow = (amount: number, over: Record<string, any> = {}) => ({
  id: "acc-tonu", type: "TONU", status: "APPROVED", billedTo: "SHIPPER", shipperInvoiceId: INV,
  amount, customerAmount: null, quantity: null, notes: null, rejectedReason: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  mockPrisma.invoice.findFirst.mockResolvedValue(DRAFT);
  mockPrisma.invoice.findUnique.mockResolvedValue(DRAFT);
  mockPrisma.invoice.update.mockResolvedValue({});
  mockPrisma.invoiceLineItem.findMany.mockResolvedValue([TONU_LINE]);
  mockPrisma.invoiceLineItem.update.mockResolvedValue({});
  mockPrisma.invoiceLineItem.count.mockResolvedValue(1);
  mockPrisma.invoiceLineItem.createMany.mockResolvedValue({ count: 0 });
  mockPrisma.loadAccessorial.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", referenceNumber: "SRL-121492", loadNumber: "SRL-121492", posterId: "ae-1", customer: { defaultAccessorialRates: null } });
});

describe("the $200 → $250 edit reaches the draft", () => {
  it("moves the stamped line to $250 and the totals by +$50, through the sync", async () => {
    ledger([tonuRow(250)]);

    const result = await syncInvoiceAccessorials("load-1");

    expect(mockPrisma.invoiceLineItem.update).toHaveBeenCalledWith({ where: { id: "li-tonu" }, data: { rate: 250, amount: 250 } });
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith({ where: { id: INV }, data: { accessorialsAmount: 250, amount: 250, totalAmount: 250 } });
    expect(mockPrisma.invoiceLineItem.createMany).not.toHaveBeenCalled(); // nothing unstamped to fold
    expect(result).toEqual(DRAFT); // the sync reports the invoice it touched
  });

  it("is idempotent — a second sync at $250 writes nothing", async () => {
    ledger([tonuRow(250)]);
    mockPrisma.invoiceLineItem.findMany.mockResolvedValue([{ ...TONU_LINE, amount: 250 }]);

    const result = await syncInvoiceAccessorials("load-1");

    expect(mockPrisma.invoiceLineItem.update).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
    expect(result).toBeNull();
  });

  it("bills the NEGOTIATED figure when the customer has one — the same pricer as the fold", async () => {
    ledger([tonuRow(250)]);
    mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", referenceNumber: "SRL-121492", loadNumber: "SRL-121492", posterId: "ae-1", customer: { defaultAccessorialRates: { TONU: 300 } } });

    await syncInvoiceAccessorials("load-1");

    expect(mockPrisma.invoiceLineItem.update).toHaveBeenCalledWith({ where: { id: "li-tonu" }, data: { rate: 300, amount: 300 } });
    expect(mockPrisma.invoice.update.mock.calls[0][0].data.totalAmount).toBe(300);
  });

  it("a downward correction takes money off the draft", async () => {
    ledger([tonuRow(150)]);

    await syncInvoiceAccessorials("load-1");

    expect(mockPrisma.invoiceLineItem.update).toHaveBeenCalledWith({ where: { id: "li-tonu" }, data: { rate: 150, amount: 150 } });
    expect(mockPrisma.invoice.update.mock.calls[0][0].data).toEqual({ accessorialsAmount: 150, amount: 150, totalAmount: 150 });
  });

  it("re-prices the stamped row AND folds a new unstamped row in the same sync", async () => {
    ledger([tonuRow(250), { id: "acc-det", type: "DETENTION_DEL", status: "APPROVED", billedTo: "SHIPPER", shipperInvoiceId: null, amount: 100, customerAmount: null, quantity: null, notes: null, rejectedReason: null }]);

    await syncInvoiceAccessorials("load-1");

    expect(mockPrisma.invoiceLineItem.update).toHaveBeenCalledWith({ where: { id: "li-tonu" }, data: { rate: 250, amount: 250 } });
    const folded = mockPrisma.invoiceLineItem.createMany.mock.calls[0][0].data;
    expect(folded).toEqual([expect.objectContaining({ accessorialId: "acc-det", amount: 100 })]);
  });
});

describe("what the re-price does NOT touch", () => {
  it("a SENT base — the customer holds it; the edit is reported, not applied", async () => {
    ledger([tonuRow(250)]);
    mockPrisma.invoice.findFirst.mockResolvedValue({ ...DRAFT, status: "SENT" });

    const result = await syncInvoiceAccessorials("load-1");

    expect(mockPrisma.invoiceLineItem.update).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled(); // no supplemental either: the row is stamped, not pending
    expect(result).toBeNull();
  });

  it("a REJECTED row still stamped — the credit path owns it", async () => {
    ledger([tonuRow(250, { status: "REJECTED", rejectedReason: "disputed" })]);
    // creditRejectedAccessorials will credit it; that path's own tests cover the credit.
    mockPrisma.invoice.findUnique.mockResolvedValue(DRAFT);

    await syncInvoiceAccessorials("load-1");

    expect(mockPrisma.invoiceLineItem.update).not.toHaveBeenCalled();
  });

  it("a row billed to SRL, not the customer", async () => {
    ledger([tonuRow(250, { billedTo: "SRL" })]);

    const r = await repriceDraftInvoice("load-1");

    expect(mockPrisma.invoiceLineItem.update).not.toHaveBeenCalled();
    expect(r?.anomalies).toEqual([{ kind: "STAMPED_NOT_CUSTOMER", accessorialId: "acc-tonu", billedTo: "SRL" }]);
  });

  it("a pre-282a line with no key cannot be found and is reported, never guessed by amount", async () => {
    ledger([tonuRow(250)]);
    mockPrisma.invoiceLineItem.findMany.mockResolvedValue([{ ...TONU_LINE, accessorialId: null }]);

    const r = await repriceDraftInvoice("load-1");

    expect(mockPrisma.invoiceLineItem.update).not.toHaveBeenCalled();
    expect(r?.anomalies.map((a) => a.kind).sort()).toEqual(["STAMPED_NO_LINE", "UNKEYED_LINE"]);
  });

  it("no base invoice — nothing is stamped anywhere, so there is nothing to re-price", async () => {
    ledger([]);
    mockPrisma.invoice.findFirst.mockResolvedValue(null);

    expect(await repriceDraftInvoice("load-1")).toBeNull();
    expect(mockPrisma.invoiceLineItem.findMany).not.toHaveBeenCalled();
  });
});

describe("order inside the sync", () => {
  it("the credit pass runs before the re-price, so a rejected row is credited and un-stamped first", async () => {
    // A row that is REJECTED and stamped. The credit path un-stamps it; the
    // re-price must then see it as unstamped rather than re-price it to $250.
    const calls: string[] = [];
    ledger([tonuRow(250, { status: "REJECTED", rejectedReason: "disputed" })]);
    mockPrisma.invoiceLineItem.createMany.mockImplementation(async () => { calls.push("credit-fold"); return { count: 1 }; });
    mockPrisma.invoiceLineItem.findMany.mockImplementation(async () => { calls.push("reprice-read"); return [TONU_LINE]; });

    await syncInvoiceAccessorials("load-1");

    expect(calls.indexOf("credit-fold")).toBeGreaterThan(-1);
    expect(calls.indexOf("reprice-read")).toBeGreaterThan(calls.indexOf("credit-fold"));
    expect(mockPrisma.invoiceLineItem.update).not.toHaveBeenCalled();
  });
});
