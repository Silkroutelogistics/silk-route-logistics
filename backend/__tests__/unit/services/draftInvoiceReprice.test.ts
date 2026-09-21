// §13.3 Item 282c — an amount edit on a stamped row reaches the DRAFT customer
// invoice, the way it already reached the carrier payable.
//
// Peace Transport's shape: the TONU minted at the $200 policy figure and folded
// into the DRAFT base at the flip; the $250 agreed by phone written onto the
// ledger row afterwards. Before 282c the sync selected only UNSTAMPED rows, so
// the row — already stamped — was invisible and the draft billed $200 forever.
//
// Every case here drives the real syncInvoiceAccessorials, not repriceDraftInvoices
// alone, because the wiring is half the claim: the branch has to run after the
// credit pass and before the pending fold, and a test that called the function
// directly would be green with the sync never reaching it.
//
// The pre-merge review found the first cut narrowed to the BASE invoice, so a row
// stamped to a DRAFT SUPPLEMENTAL was neither re-priced nor reported, and that
// "SENT is reported, not applied" was a claim with no log behind it. Both are
// cases below; both are asserted through the logger, not through the absence of
// a write (§19 Sub-pattern 16 — the absence of a write is what the defect looked
// like too).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { log } from "../../../src/lib/logger";
import { syncInvoiceAccessorials, repriceDraftInvoices } from "../../../src/services/invoiceService";

vi.mock("../../../src/lib/logger", () => ({ log: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

const mockPrisma = vi.mocked(prisma, true) as any;
const mockLog = vi.mocked(log, true) as any;

const BASE = "inv-base";
const SUPP = "inv-supp";
const DRAFT = { id: BASE, invoiceNumber: "INV-1043", srlDocNumber: "SRL-121492I", invoiceKind: "BASE", status: "DRAFT", userId: "ae-1", amount: 200, totalAmount: 200, accessorialsAmount: 200 };
const TONU_LINE = { id: "li-tonu", invoiceId: BASE, accessorialId: "acc-tonu", type: "ACCESSORIAL", amount: 200, sortOrder: 0 };

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
/** The invoice list answers by load; the document-number scans (no loadId) get nothing. */
function invoices(list: any[]) {
  mockPrisma.invoice.findMany.mockImplementation(async ({ where }: any) => (where?.loadId ? list.filter((i) => i.status !== "VOID") : []));
}
/** Lines answer by invoice id set. */
function lines(list: any[]) {
  mockPrisma.invoiceLineItem.findMany.mockImplementation(async ({ where }: any) => {
    const ids = where?.invoiceId?.in ?? (where?.invoiceId ? [where.invoiceId] : null);
    return ids ? list.filter((l) => ids.includes(l.invoiceId)) : list;
  });
}
const tonuRow = (amount: number, over: Record<string, any> = {}) => ({
  id: "acc-tonu", type: "TONU", status: "APPROVED", billedTo: "SHIPPER", shipperInvoiceId: BASE,
  amount, customerAmount: null, quantity: null, notes: null, rejectedReason: null, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.$transaction.mockImplementation(async (cb: any) => cb(mockPrisma));
  mockPrisma.invoice.findFirst.mockResolvedValue(DRAFT);
  mockPrisma.invoice.findUnique.mockResolvedValue(DRAFT);
  mockPrisma.invoice.update.mockResolvedValue({});
  invoices([DRAFT]);
  lines([TONU_LINE]);
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
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith({ where: { id: BASE }, data: { accessorialsAmount: 250, amount: 250, totalAmount: 250 } });
    expect(mockPrisma.invoiceLineItem.createMany).not.toHaveBeenCalled(); // nothing unstamped to fold
    expect(result).toEqual(DRAFT); // the sync reports the invoice it touched
  });

  it("is idempotent — a second sync at $250 writes nothing (the container proof asserts the total too)", async () => {
    ledger([tonuRow(250)]);
    lines([{ ...TONU_LINE, amount: 250 }]);

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

describe("every DRAFT document on the load, not only the base (the review's survivor)", () => {
  const SENT_BASE = { ...DRAFT, status: "SENT" };
  const DRAFT_SUPP = { id: SUPP, invoiceNumber: "INV-1044", srlDocNumber: "SRL-121492S", invoiceKind: "SUPPLEMENTAL", status: "DRAFT", userId: "ae-1", amount: 300, totalAmount: 300, accessorialsAmount: 300 };
  const LATE_LINE = { id: "li-late", invoiceId: SUPP, accessorialId: "acc-late", type: "DETENTION", amount: 300, sortOrder: 0 };
  const lateRow = (amount: number) => ({ id: "acc-late", type: "DETENTION_DEL", status: "APPROVED", billedTo: "SHIPPER", shipperInvoiceId: SUPP, amount, customerAmount: null, quantity: null, notes: null, rejectedReason: null });

  it("a row stamped to a DRAFT SUPPLEMENTAL is re-priced; the SENT base is left alone", async () => {
    invoices([SENT_BASE, DRAFT_SUPP]);
    lines([TONU_LINE, LATE_LINE]);
    ledger([tonuRow(200), lateRow(350)]); // the base row agrees; the late row was edited 300 → 350

    const result = await syncInvoiceAccessorials("load-1");

    expect(mockPrisma.invoiceLineItem.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.invoiceLineItem.update).toHaveBeenCalledWith({ where: { id: "li-late" }, data: { rate: 350, amount: 350 } });
    expect(mockPrisma.invoice.update).toHaveBeenCalledTimes(1);
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith({ where: { id: SUPP }, data: { accessorialsAmount: 350, amount: 350, totalAmount: 350 } });
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled(); // no second supplemental: the row was stamped, not pending
    expect(mockPrisma.invoice.findUnique).toHaveBeenCalledWith({ where: { id: SUPP } });
    expect(result).toBeTruthy();
  });

  it("a base and a supplemental both DRAFT are each re-priced against their own rows", async () => {
    invoices([DRAFT, DRAFT_SUPP]);
    lines([TONU_LINE, LATE_LINE]);
    ledger([tonuRow(250), lateRow(325)]);

    const r = await repriceDraftInvoices("load-1");

    expect(r.map((x) => [x.invoiceId, x.repriced, x.netDelta])).toEqual([[BASE, 1, 50], [SUPP, 1, 25]]);
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith({ where: { id: BASE }, data: { accessorialsAmount: 250, amount: 250, totalAmount: 250 } });
    expect(mockPrisma.invoice.update).toHaveBeenCalledWith({ where: { id: SUPP }, data: { accessorialsAmount: 325, amount: 325, totalAmount: 325 } });
  });
});

describe("what the re-price does NOT touch — and REPORTS", () => {
  it("a SENT base — the customer holds it; the edit is logged with the figures, and nothing is written", async () => {
    ledger([tonuRow(250)]);
    invoices([{ ...DRAFT, status: "SENT" }]);
    mockPrisma.invoice.findFirst.mockResolvedValue({ ...DRAFT, status: "SENT" });

    const result = await syncInvoiceAccessorials("load-1");

    expect(mockPrisma.invoiceLineItem.update).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
    expect(mockPrisma.invoice.create).not.toHaveBeenCalled(); // no supplemental either: the row is stamped, not pending
    expect(result).toBeNull();
    // The report is the load-bearing half: a green "nothing written" is also what the defect looked like.
    const reported = mockLog.warn.mock.calls.find((c: any) => /REPORTED, NOT APPLIED/.test(String(c[1] ?? c[0])));
    expect(reported).toBeTruthy();
    expect(reported[0]).toMatchObject({ invoiceId: BASE, netDelta: 50, reprice: [expect.objectContaining({ accessorialId: "acc-tonu", billed: 200, expected: 250 })] });
    expect(String(reported[1])).toContain("+$50.00");
  });

  it("a SENT document whose lines agree with the ledger reports nothing", async () => {
    ledger([tonuRow(200)]);
    invoices([{ ...DRAFT, status: "SENT" }]);

    const r = await repriceDraftInvoices("load-1");

    expect(r).toEqual([expect.objectContaining({ invoiceId: BASE, repriced: 0, reported: false, netDelta: 0 })]);
    expect(mockLog.warn).not.toHaveBeenCalled();
  });

  it("a REJECTED row still stamped — the credit path owns it", async () => {
    ledger([tonuRow(250, { status: "REJECTED", rejectedReason: "disputed" })]);
    mockPrisma.invoice.findUnique.mockResolvedValue(DRAFT);

    await syncInvoiceAccessorials("load-1");

    expect(mockPrisma.invoiceLineItem.update).not.toHaveBeenCalled();
  });

  it("a row billed to SRL, not the customer", async () => {
    ledger([tonuRow(250, { billedTo: "SRL" })]);

    const r = await repriceDraftInvoices("load-1");

    expect(mockPrisma.invoiceLineItem.update).not.toHaveBeenCalled();
    expect(r[0].anomalies).toEqual([{ kind: "STAMPED_NOT_CUSTOMER", accessorialId: "acc-tonu", billedTo: "SRL" }]);
  });

  it("a line with no key (pre-282a, or an API line editor's) cannot be found and is reported, never guessed by amount", async () => {
    ledger([tonuRow(250)]);
    lines([{ ...TONU_LINE, accessorialId: null }]);

    const r = await repriceDraftInvoices("load-1");

    expect(mockPrisma.invoiceLineItem.update).not.toHaveBeenCalled();
    expect(r[0].anomalies.map((a) => a.kind).sort()).toEqual(["STAMPED_NO_LINE", "UNKEYED_LINE"]);
    expect(mockLog.warn).toHaveBeenCalledTimes(1);
  });

  it("no invoice on the load — nothing is stamped anywhere, so there is nothing to re-price or read", async () => {
    ledger([]);
    invoices([]);

    expect(await repriceDraftInvoices("load-1")).toEqual([]);
    expect(mockPrisma.invoiceLineItem.findMany).not.toHaveBeenCalled();
  });

  it("a VOID invoice is not read", async () => {
    ledger([tonuRow(250, { shipperInvoiceId: null })]);
    invoices([{ ...DRAFT, status: "VOID" }]);

    expect(await repriceDraftInvoices("load-1")).toEqual([]);
  });
});

describe("order inside the sync", () => {
  it("the credit pass runs before the re-price, so a rejected row is credited and un-stamped first", async () => {
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
