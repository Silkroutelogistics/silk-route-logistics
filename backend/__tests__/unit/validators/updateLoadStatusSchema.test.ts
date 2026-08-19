// The status-update body schema must carry every field the handler reads.
//
// validateBody replaces req.body with the Zod result (middleware/validate.ts:21)
// and Zod strips unknown keys, so any field the controller reads off req.body
// but this schema does not declare is silently undefined by the time the handler
// runs. There is no type error and no runtime error — the value just vanishes.
//
// That cost a P0: v3.8.aso added a 422 gate requiring tonuFaultSide on a TONU
// flip and read it off the stripped body, so the gate rejected EVERY TONU,
// including ones sending a perfectly valid fault side. TONU became impossible to
// record, and it shipped, because unit tests covered the policy function and
// nothing covered the wire.
//
// These tests are the cheap guard: if someone adds a field to the handler and
// forgets the schema, or trims the schema without checking the handler, one of
// these fails.

import { describe, it, expect } from "vitest";
import { updateLoadStatusSchema } from "../../../src/validators/load";

describe("updateLoadStatusSchema", () => {
  it("keeps tonuFaultSide — the field the TONU gate rejects on", () => {
    const parsed = updateLoadStatusSchema.parse({ status: "TONU", tonuFaultSide: "CUSTOMER" });
    expect(parsed.tonuFaultSide).toBe("CUSTOMER");
  });

  it("accepts all three ratified fault sides", () => {
    for (const side of ["CUSTOMER", "CARRIER", "BROKER"] as const) {
      expect(updateLoadStatusSchema.parse({ status: "TONU", tonuFaultSide: side }).tonuFaultSide).toBe(side);
    }
  });

  it("rejects a fault side that is not one of the three", () => {
    expect(() => updateLoadStatusSchema.parse({ status: "TONU", tonuFaultSide: "SHIPPER" })).toThrow();
  });

  it("leaves tonuFaultSide undefined when absent, so the gate can 422 on it", () => {
    const parsed = updateLoadStatusSchema.parse({ status: "TONU" });
    expect(parsed.tonuFaultSide).toBeUndefined();
  });

  it("keeps reason and cancellationReason — read by the TONU/CANCELLED handler", () => {
    // Pre-existing and quieter than the TONU bug: the handler reads
    // `req.body.reason || req.body.cancellationReason` and got undefined every
    // time, so every voided CarrierPay note read "no reason provided" no matter
    // what the AE typed.
    const a = updateLoadStatusSchema.parse({ status: "CANCELLED", reason: "shipper cancelled" });
    expect(a.reason).toBe("shipper cancelled");
    const b = updateLoadStatusSchema.parse({ status: "CANCELLED", cancellationReason: "no freight" });
    expect(b.cancellationReason).toBe("no freight");
  });

  it("still requires a valid status", () => {
    expect(() => updateLoadStatusSchema.parse({ tonuFaultSide: "CUSTOMER" })).toThrow();
    expect(() => updateLoadStatusSchema.parse({ status: "NOT_A_STATUS" })).toThrow();
  });
});
