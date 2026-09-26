/**
 * Send lock: the four BKN loads whose invoices SRL delivered through Tipalti on
 * 2026-09-25 cannot be emailed an invoice from the platform. It would bill twice.
 */
import { describe, it, expect } from "vitest";
import { INVOICE_SEND_LOCKED, isInvoiceSendLocked, sendLockedMessage } from "../../../src/lib/invoiceSendLock";

describe("which loads are locked", () => {
  it("the four delivered BKN loads, in either spelling", () => {
    for (const n of ["121492", "121494", "121495", "121496"]) {
      expect(isInvoiceSendLocked(n)).toBe(true);
      expect(isInvoiceSendLocked(`SRL-${n}`)).toBe(true);
    }
  });

  it("nothing else: the neighbours, the continuing series, the withdrawn series, an invoice number, nothing", () => {
    for (const n of ["SRL-121493", "SRL-121497", "121498", "5003", "SRL-121494I", "121494I", "", null, undefined]) {
      expect(isInvoiceSendLocked(n as any)).toBe(false);
    }
  });

  it("the refusal names the load, the channel and the way out", () => {
    expect(INVOICE_SEND_LOCKED).toBe("INVOICE_SEND_LOCKED");
    const m = sendLockedMessage("SRL-121494");
    for (const s of ["SRL-121494", "Tipalti", "mark-sent"]) expect(m).toContain(s);
  });
});
