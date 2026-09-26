/**
 * backfill-missing-invoices `classify` (invoicing audit G-2, queue B2c).
 *
 * The one property that costs money if wrong: a TONU is never classified for the
 * linehaul auto-invoice. SRL-121492's exact shape — TONU, fault CUSTOMER, no
 * ledger row, no invoice — must come back as "record the TONU, then charge it".
 */
import { describe, it, expect } from "vitest";
import { classify } from "../../../scripts/backfill-missing-invoices";

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
