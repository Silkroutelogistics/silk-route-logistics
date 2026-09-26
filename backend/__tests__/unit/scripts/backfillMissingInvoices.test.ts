/**
 * backfill-missing-invoices `classify` (invoicing audit G-2, queue B2c).
 *
 * The one property that costs money if wrong: a TONU is never classified for the
 * linehaul auto-invoice. SRL-121492's exact shape — TONU, fault CUSTOMER, no
 * ledger row, no invoice — must come back as "record the TONU, then charge it".
 */
import { describe, it, expect } from "vitest";
import { classify, planWrite, invoiceNumberFor } from "../../../scripts/backfill-missing-invoices";

const base = { tonuFaultSide: null, hasBaseInvoice: false, hasTonuLedgerRow: false };

describe("backfill classify", () => {
  it("SRL-121492's shape: TONU, customer fault, no ledger row -> record then charge", () => {
    expect(classify({ ...base, status: "TONU", tonuFaultSide: "CUSTOMER" })).toBe("RECORD_TONU_THEN_CHARGE");
  });

  it("a TONU is never sent to the linehaul auto-invoice, in any combination", () => {
    for (const tonuFaultSide of [null, "CUSTOMER", "CARRIER", "BROKER"])
      for (const hasBaseInvoice of [true, false])
        for (const hasTonuLedgerRow of [true, false])
          expect(classify({ status: "TONU", tonuFaultSide, hasBaseInvoice, hasTonuLedgerRow })).not.toBe("AUTO_INVOICE");
  });

  it("TONU with its ledger row but no invoice -> raise the charge only", () => {
    expect(classify({ ...base, status: "TONU", tonuFaultSide: "CUSTOMER", hasTonuLedgerRow: true })).toBe("RAISE_TONU_CHARGE");
  });

  it("TONU that bills nobody, or has no fault side, or is already invoiced -> nothing", () => {
    expect(classify({ ...base, status: "TONU", tonuFaultSide: "CARRIER" })).toBeNull();
    expect(classify({ ...base, status: "TONU", tonuFaultSide: null })).toBeNull();
    expect(classify({ status: "TONU", tonuFaultSide: "CUSTOMER", hasBaseInvoice: true, hasTonuLedgerRow: true })).toBeNull();
  });

  it("delivered-class loads without a BASE invoice -> auto-invoice; with one -> nothing", () => {
    for (const status of ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"]) {
      expect(classify({ ...base, status })).toBe("AUTO_INVOICE");
      expect(classify({ ...base, status, hasBaseInvoice: true })).toBeNull();
    }
  });

  it("CANCELLED and in-flight loads are never listed", () => {
    for (const status of ["CANCELLED", "BOOKED", "IN_TRANSIT", "DRAFT"]) expect(classify({ ...base, status })).toBeNull();
  });
});

const PROD = "ep-green-frog-ajsgv9me.c-3.us-east-2.aws.neon.tech";
const LOCAL = "127.0.0.1";

describe("backfill write plan: --execute, and --target=prod for production", () => {
  it("dry run by default, on any host", () => {
    expect(planWrite([], PROD).write).toBe(false);
    expect(planWrite([], LOCAL).write).toBe(false);
    expect(planWrite(["--target=prod"], PROD).write).toBe(false);
  });

  it("production needs both flags; either alone does not write", () => {
    expect(planWrite(["--execute"], PROD)).toMatchObject({ write: false, refuse: expect.stringContaining("--target=prod") });
    expect(planWrite(["--execute", "--target=prod"], PROD)).toEqual({ write: true });
  });

  it("a local host writes on --execute and refuses a mismatched --target=prod", () => {
    expect(planWrite(["--execute"], LOCAL)).toEqual({ write: true });
    expect(planWrite(["--execute", "--target=prod"], LOCAL).write).toBe(false);
  });

  it("the retired --commit flag never writes", () => {
    expect(planWrite(["--commit"], LOCAL).write).toBe(false);
    expect(planWrite(["--commit", "--target=prod"], PROD).write).toBe(false);
  });
});

describe("backfill invoice number follows the load", () => {
  it("a legacy load keeps the legacy form", () => {
    expect(invoiceNumberFor({ loadNumber: "SRL-121492", referenceNumber: "SRL-121492" })).toBe("SRL-121492I");
  });
  it("a 50001-series load prints the bare shared number", () => {
    expect(invoiceNumberFor({ loadNumber: "50001", referenceNumber: "50001" })).toBe("50001");
  });
});
