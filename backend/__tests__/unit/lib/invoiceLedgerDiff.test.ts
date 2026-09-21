// §13.3 Item 282b — the invoice-vs-ledger diff, to the cent, with no database.
//
// The worked example is Peace Transport's: a TONU minted at the $200 policy
// figure, folded into the DRAFT base and stamped, then edited to the $250 agreed
// by phone. The carrier payable follows the edit because that leg reconciles
// totals; the customer line does not, because that leg marks rows. This diff is
// what lets the customer leg see the $50.
import { describe, it, expect } from "vitest";
import { diffInvoiceAgainstLedger, type InvoiceLineView, type LedgerRowView } from "../../../src/lib/invoiceLedgerDiff";

const INV = "inv-base";

const row = (o: Partial<LedgerRowView> & { id: string }): LedgerRowView => ({
  type: "TONU", status: "APPROVED", billedTo: "SHIPPER", shipperInvoiceId: INV, customerPrice: 200, ...o,
});
const line = (o: Partial<InvoiceLineView> & { id: string }): InvoiceLineView => ({
  accessorialId: null, type: "ACCESSORIAL", amount: 0, sortOrder: 0, ...o,
});

// The load's own lines, which carry no row id by design.
const LOAD_LINES = [
  line({ id: "l-lh", type: "LINEHAUL", amount: 3000, sortOrder: 0 }),
  line({ id: "l-fsc", type: "FUEL_SURCHARGE", amount: 400, sortOrder: 1 }),
];

describe("agreement", () => {
  it("a draft whose lines match the ledger agrees, and load lines are not anomalies", () => {
    const d = diffInvoiceAgainstLedger(INV, [...LOAD_LINES, line({ id: "l-tonu", accessorialId: "acc-tonu", amount: 200, sortOrder: 2 })], [row({ id: "acc-tonu" })]);
    expect(d.agrees).toBe(true);
    expect(d.reprice).toEqual([]);
    expect(d.anomalies).toEqual([]);
    expect(d.netDelta).toBe(0);
    expect(d.grossDelta).toBe(0);
  });

  it("an invoice with no ledger rows and only load lines agrees", () => {
    const d = diffInvoiceAgainstLedger(INV, LOAD_LINES, []);
    expect(d.agrees).toBe(true);
  });
});

describe("the $200 → $250 edit", () => {
  it("names the stamped line, the $50 the customer is under-billed, and the line to move", () => {
    const d = diffInvoiceAgainstLedger(
      INV,
      [...LOAD_LINES, line({ id: "l-tonu", accessorialId: "acc-tonu", amount: 200, sortOrder: 2 })],
      [row({ id: "acc-tonu", customerPrice: 250 })],
    );
    expect(d.agrees).toBe(false);
    expect(d.reprice).toEqual([
      { accessorialId: "acc-tonu", type: "TONU", lineId: "l-tonu", lineAmount: 200, billed: 200, expected: 250, delta: 50 },
    ]);
    expect(d.netDelta).toBe(50);
    expect(d.grossDelta).toBe(50);
  });

  it("a downward edit is a negative delta — the customer is over-billed", () => {
    const d = diffInvoiceAgainstLedger(INV, [line({ id: "l-det", accessorialId: "acc-det", type: "DETENTION", amount: 150, sortOrder: 2 })], [row({ id: "acc-det", type: "DETENTION_DEL", customerPrice: 100 })]);
    expect(d.reprice[0].delta).toBe(-50);
    expect(d.netDelta).toBe(-50);
    expect(d.grossDelta).toBe(50);
  });

  it("net and gross are the census's two numbers: one up, one down", () => {
    const d = diffInvoiceAgainstLedger(
      INV,
      [line({ id: "l-a", accessorialId: "acc-a", amount: 200, sortOrder: 2 }), line({ id: "l-b", accessorialId: "acc-b", amount: 150, sortOrder: 3 })],
      [row({ id: "acc-a", customerPrice: 250 }), row({ id: "acc-b", customerPrice: 100 })],
    );
    expect(d.netDelta).toBe(0); // +50 and −50
    expect(d.grossDelta).toBe(100);
    expect(d.agrees).toBe(false);
  });

  it("compares to the cent and ignores float noise", () => {
    const d = diffInvoiceAgainstLedger(INV, [line({ id: "l", accessorialId: "a", amount: 0.1 + 0.2, sortOrder: 2 })], [row({ id: "a", customerPrice: 0.3 })]);
    expect(d.agrees).toBe(true);
  });
});

describe("billed is the NET of every line for the row, not the last line", () => {
  it("a row credited back and re-approved at a new figure agrees at that figure", () => {
    // charge 200, credit −200, re-charge 250 — three lines, one row, net 250.
    const d = diffInvoiceAgainstLedger(
      INV,
      [
        line({ id: "l1", accessorialId: "a", amount: 200, sortOrder: 2 }),
        line({ id: "l2", accessorialId: "a", amount: -200, sortOrder: 3 }),
        line({ id: "l3", accessorialId: "a", amount: 250, sortOrder: 4 }),
      ],
      [row({ id: "a", customerPrice: 250 })],
    );
    expect(d.agrees).toBe(true);
  });

  it("when the net disagrees, the delta lands on the latest POSITIVE line, never on a credit", () => {
    const d = diffInvoiceAgainstLedger(
      INV,
      [
        line({ id: "l1", accessorialId: "a", amount: 200, sortOrder: 2 }),
        line({ id: "l2", accessorialId: "a", amount: -200, sortOrder: 3 }),
        line({ id: "l3", accessorialId: "a", amount: 200, sortOrder: 4 }),
        line({ id: "l4", accessorialId: "a", amount: -50, sortOrder: 5 }),
      ],
      [row({ id: "a", customerPrice: 250 })],
    );
    // net 150, expected 250 → +100, applied to l3 (latest positive), not l4 (a credit).
    expect(d.reprice).toEqual([expect.objectContaining({ lineId: "l3", lineAmount: 200, billed: 150, expected: 250, delta: 100 })]);
  });
});

describe("what is NOT re-priced, and is reported instead", () => {
  it("a row stamped here but REJECTED — the credit path owns it", () => {
    const d = diffInvoiceAgainstLedger(INV, [line({ id: "l", accessorialId: "a", amount: 200, sortOrder: 2 })], [row({ id: "a", status: "REJECTED", customerPrice: 0 })]);
    expect(d.reprice).toEqual([]);
    expect(d.anomalies).toEqual([{ kind: "STAMPED_NOT_APPROVED", accessorialId: "a", status: "REJECTED" }]);
  });

  it("a row stamped here but billed to SRL, not the customer", () => {
    const d = diffInvoiceAgainstLedger(INV, [line({ id: "l", accessorialId: "a", amount: 90, sortOrder: 2 })], [row({ id: "a", billedTo: "SRL", customerPrice: 0 })]);
    expect(d.reprice).toEqual([]);
    expect(d.anomalies).toEqual([{ kind: "STAMPED_NOT_CUSTOMER", accessorialId: "a", billedTo: "SRL" }]);
  });

  it("a row credited off this draft (un-stamped) with lines netting to zero is silent", () => {
    const d = diffInvoiceAgainstLedger(
      INV,
      [line({ id: "l1", accessorialId: "a", amount: 75, sortOrder: 2 }), line({ id: "l2", accessorialId: "a", amount: -75, sortOrder: 3 })],
      [row({ id: "a", status: "REJECTED", shipperInvoiceId: null, customerPrice: 75 })],
    );
    expect(d.agrees).toBe(true);
  });

  it("lines billing money for a row the mark says is NOT on this invoice", () => {
    const d = diffInvoiceAgainstLedger(INV, [line({ id: "l1", accessorialId: "a", amount: 75, sortOrder: 2 })], [row({ id: "a", shipperInvoiceId: "inv-other", customerPrice: 75 })]);
    expect(d.reprice).toEqual([]);
    expect(d.anomalies).toEqual([{ kind: "NET_ON_UNSTAMPED_ROW", accessorialId: "a", net: 75, stampedTo: "inv-other" }]);
  });

  it("a line keyed to a row that no longer exists", () => {
    const d = diffInvoiceAgainstLedger(INV, [line({ id: "l1", accessorialId: "gone", amount: 75, sortOrder: 2 })], []);
    expect(d.anomalies).toEqual([{ kind: "ORPHAN_LINE", accessorialId: "gone", net: 75 }]);
  });

  it("an accessorial line written before 282a (no key) cannot be re-priced and says so", () => {
    const d = diffInvoiceAgainstLedger(INV, [line({ id: "l-old", type: "DETENTION", amount: 150, sortOrder: 2 })], [row({ id: "a", type: "DETENTION_DEL", customerPrice: 150 })]);
    expect(d.anomalies).toEqual(expect.arrayContaining([
      { kind: "UNKEYED_LINE", lineId: "l-old", type: "DETENTION", amount: 150 },
      { kind: "STAMPED_NO_LINE", accessorialId: "a", expected: 150 },
    ]));
    expect(d.reprice).toEqual([]);
  });

  it("output order is by line sortOrder, whatever order the lines arrive in", () => {
    const d = diffInvoiceAgainstLedger(
      INV,
      [line({ id: "l-b", accessorialId: "b", amount: 1, sortOrder: 5 }), line({ id: "l-a", accessorialId: "a", amount: 1, sortOrder: 2 })],
      [row({ id: "a", customerPrice: 2 }), row({ id: "b", customerPrice: 2 })],
    );
    expect(d.reprice.map((r) => r.lineId)).toEqual(["l-a", "l-b"]);
  });
});
