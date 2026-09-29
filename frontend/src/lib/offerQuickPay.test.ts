/**
 * Item 342 (v3.8.bor) — the AE's Quick Pay election on an offer.
 */
import { describe, it, expect } from "vitest";
import { EMPTY_OFFER_QUICK_PAY, offerQuickPayBody, offerQuickPayProblem } from "./offerQuickPay";
import { buildWithTenderPayload } from "@/components/drawer/withTenderPayload";

describe("offerQuickPay", () => {
  it("standard terms send nothing and need nothing", () => {
    expect(offerQuickPayBody(EMPTY_OFFER_QUICK_PAY)).toBeUndefined();
    expect(offerQuickPayProblem(EMPTY_OFFER_QUICK_PAY)).toBeNull();
  });

  it("a paid speed needs evidence before it can be sent", () => {
    const v = { ...EMPTY_OFFER_QUICK_PAY, speed: "SAME_DAY" as const };
    expect(offerQuickPayProblem(v)).toMatch(/evidence/);
    expect(offerQuickPayProblem({ ...v, evidenceRef: "  a " })).toMatch(/evidence/);
    expect(offerQuickPayProblem({ ...v, evidenceRef: "RE: load 121498" })).toBeNull();
  });

  it("sends the speed and the evidence, trimmed", () => {
    expect(offerQuickPayBody({ speed: "SEVEN_DAY", evidenceType: "call_timestamp", evidenceRef: " 2026-09-29 10:14 " }))
      .toEqual({ speed: "SEVEN_DAY", evidenceType: "call_timestamp", evidenceRef: "2026-09-29 10:14" });
  });

  it("the drawer's payload carries it on the tender, where the backend reads it", () => {
    const qp = { speed: "SAME_DAY" as const, evidenceType: "email_subject", evidenceRef: "RE: load 121498" };
    const form = { offeredRate: "400", expiresAtHours: "24", poNumbersText: "", pickupDate: "2026-09-30", deliveryDate: "2026-10-01" } as never;
    const p = buildWithTenderPayload(form, { customerId: "c", carrierId: "cp-1", quickPay: qp });
    expect(p.tender).toMatchObject({ carrierId: "cp-1", quickPay: qp });
    expect(buildWithTenderPayload(form, { customerId: "c", carrierId: "cp-1" }).tender.quickPay).toBeUndefined();
  });
});
