// Load 5003 was a test load (ruled 2026-09-27): cancel it through the real handler, reason
// OTHER with the note "test load, not real freight". Refuse anything that says it was more.
import { describe, it, expect } from "vitest";
import { planCancel, NOTE, REASON_CODE, type CancelState } from "../../../scripts/cancel-test-load-5003";
import { assessCancellationInput } from "../../../src/lib/cancellationPolicy";

// Production as read 2026-09-28: BOOKED, a CONFIRMED tender and a SIGNED RC, no POD, invoice or pay.
const prod: CancelState = { loadNumber: "5003", status: "BOOKED", podOnFile: false, invoices: 0, liveCarrierPays: 0, cancellationReasonCode: null, cancellationReason: null };

describe("planCancel", () => {
  it("production's state cancels", () => {
    expect(planCancel(prod)).toEqual({ go: true, refuse: [] });
  });

  it("the note passes the platform's own reason policy (the ruled 'test load' alone is 9 characters and would not)", () => {
    expect(assessCancellationInput({ cancellationReasonCode: REASON_CODE, cancellationReason: NOTE }).ok).toBe(true);
    expect(assessCancellationInput({ cancellationReasonCode: REASON_CODE, cancellationReason: "test load" }).ok).toBe(false);
    expect(NOTE.startsWith("test load")).toBe(true);
  });

  it("a second run finds it done", () => {
    expect(planCancel({ ...prod, status: "CANCELLED", cancellationReasonCode: "OTHER", cancellationReason: NOTE }).done).toMatch(/already cancelled/);
  });

  it("a load cancelled for another reason is not rewritten", () => {
    expect(planCancel({ ...prod, status: "CANCELLED", cancellationReasonCode: "SHIPPER_CANCELLED", cancellationReason: null }).refuse.join(" ")).toMatch(/another reason/);
  });

  it("a POD, an invoice, a live carrier pay or a TONU each refuse: then it was not only a test", () => {
    for (const over of [{ podOnFile: true }, { invoices: 1 }, { liveCarrierPays: 1 }, { status: "TONU" }]) {
      const plan = planCancel({ ...prod, ...over });
      expect(plan.go, JSON.stringify(over)).toBeUndefined();
      expect(plan.refuse.length, JSON.stringify(over)).toBe(1);
    }
  });

  it("refuses any load that is not 5003", () => {
    expect(planCancel({ ...prod, loadNumber: "121498" }).refuse.join(" ")).toMatch(/not 5003/);
  });
});
