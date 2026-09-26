/**
 * The carrier TONU override (ruling 2026-09-26: Peace Transport on SRL-121492 at
 * $250, one time; Jetex on SRL-121496 stays at the $200 default).
 *
 * SRL-121492's flip never recorded the TONU, so the plan must record the
 * obligation BEFORE it sets the amount and raises the payable at that figure.
 * Raising the payable first would mint it at the $200 default.
 */
import { describe, it, expect } from "vitest";
import { planOverride, overrideNote } from "../../../scripts/apply-carrier-tonu-override";

const base = { status: "TONU", tonuFaultSide: "CUSTOMER", hasCarrier: true, row: null, hasPayable: false };

describe("carrier TONU override plan", () => {
  it("SRL-121492's shape: no row, no payable -> record, set the amount, then raise the payable", () => {
    expect(planOverride(base, 250)).toEqual({ steps: ["RECORD_OBLIGATION", "SET_AMOUNT", "RAISE_PAYABLE"] });
  });

  it("an existing row at the default with a payable -> set the amount and resync the payable", () => {
    expect(planOverride({ ...base, row: { id: "a", amount: 200 }, hasPayable: true }, 250)).toEqual({ steps: ["SET_AMOUNT", "SYNC_PAYABLE"] });
  });

  it("a row already at the figure writes no amount again", () => {
    expect(planOverride({ ...base, row: { id: "a", amount: 250 }, hasPayable: true }, 250)).toEqual({ steps: ["SYNC_PAYABLE"] });
  });

  it("refuses a load that is not TONU, a carrier-fault TONU, no carrier, and a non-positive amount", () => {
    expect(planOverride({ ...base, status: "DELIVERED" }, 250).refuse).toBeTruthy();
    expect(planOverride({ ...base, tonuFaultSide: "CARRIER" }, 250).refuse).toBeTruthy();
    expect(planOverride({ ...base, hasCarrier: false }, 250).refuse).toBeTruthy();
    expect(planOverride(base, 0).refuse).toBeTruthy();
  });

  it("the row carries the amount, reason and who overrode it, ahead of any existing note", () => {
    expect(overrideNote(250, "carrier negotiated TONU", "Wasi Haider", "prior")).toBe(
      "Carrier TONU override: 250.00 (one-time) · reason: carrier negotiated TONU · overrideBy: Wasi Haider\nprior",
    );
  });
});
