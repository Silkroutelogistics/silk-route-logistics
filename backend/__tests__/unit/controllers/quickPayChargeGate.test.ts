// Caravan Quick Pay Agreement §3 — the three-condition charge gate, on the AE
// settlement path.
//
// §3: "Broker will not deduct a Quick Pay fee on a load unless all three of the
// following are true: a Quick Pay fee is recorded on that load, this Quick Pay
// Agreement is signed, and Quick Pay is enabled on Carrier's account. If any one
// of them is not true, the load is paid on Carrier's standard tier payment terms
// at no fee."
//
// Two live routes could deduct a fee with none of the three checked:
//   POST /accounting/payments/prepare   (accountingController.preparePayment)
//   PUT  /accounting/payments/:id       (accountingController.updatePayment)
//
// Both derived the fee from a request-supplied PaymentTier string against the
// tier ladder. So `PUT /accounting/payments/:id` with `{ paymentTier: "PRIORITY" }`
// overwrote the zero fee createCarrierPayOnDelivery had correctly written and
// deducted 3% from a carrier who had signed nothing — the exact deduction §3
// says will not happen, on a route the delivery-path gate never sees.
//
// These cases pin each condition independently, because a gate that only holds
// when all three fail together is not a gate. Every failure mode must pay the
// carrier MORE, never less.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { prisma } from "../../../src/config/database";
import { resolveElectedQuickPayFee } from "../../../src/controllers/accountingController";

const mockPrisma = prisma as any;

const CARRIER_USER_ID = "user_carrier_1";
const LOAD_ID = "load_1";
const PROFILE_ID = "profile_1";

/** A load carrying a recorded 3% Quick Pay election and no reimbursements. */
function loadWithElection(pct: number | null, accessorials: unknown[] = []) {
  return {
    quickPayFeePercent: pct,
    rateConfirmations: [{ formData: { accessorials } }],
  };
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("Quick Pay Agreement §3 — never deduct a fee unless all three conditions hold", () => {
  it("charges the fee recorded on the load when all three conditions hold", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(loadWithElection(3));
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: PROFILE_ID, quickPayEnabled: true });
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue({ id: "agreement_1" });

    const result = await resolveElectedQuickPayFee(CARRIER_USER_ID, LOAD_ID);
    expect(result.feePercent).toBe(3);
  });

  it("condition 1 — no fee recorded on the load is standard terms at no fee", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(loadWithElection(null));
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: PROFILE_ID, quickPayEnabled: true });
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue({ id: "agreement_1" });

    const result = await resolveElectedQuickPayFee(CARRIER_USER_ID, LOAD_ID);
    expect(result.feePercent).toBe(0);
  });

  it("condition 2 — an unsigned Quick Pay Agreement can never produce a deduction", async () => {
    // The load carries a real election and the account is enabled. Only the
    // signature is missing, and that alone has to zero the fee.
    mockPrisma.load.findUnique.mockResolvedValue(loadWithElection(3));
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: PROFILE_ID, quickPayEnabled: true });
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue(null);

    const result = await resolveElectedQuickPayFee(CARRIER_USER_ID, LOAD_ID);
    expect(result.feePercent).toBe(0);
    expect(result.reason).toMatch(/not signed/i);
  });

  it("condition 3 — Quick Pay disabled on the account withdraws the election", async () => {
    // §3: disabling Quick Pay "withdraws it on every load Broker has not yet
    // funded; each of those loads then reverts to standard tier terms at no fee".
    mockPrisma.load.findUnique.mockResolvedValue(loadWithElection(3));
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: PROFILE_ID, quickPayEnabled: false });
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue({ id: "agreement_1" });

    const result = await resolveElectedQuickPayFee(CARRIER_USER_ID, LOAD_ID);
    expect(result.feePercent).toBe(0);
    expect(result.reason).toMatch(/not enabled/i);
  });

  it("a zero recorded on the load is a positive record of no election, not a missing value", async () => {
    // The rate-confirmation modal now publishes 0 when the AE selects Standard,
    // so 0 has to read as "no Quick Pay on this load" and not fall through to a
    // tier-derived default.
    mockPrisma.load.findUnique.mockResolvedValue(loadWithElection(0));
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: PROFILE_ID, quickPayEnabled: true });
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue({ id: "agreement_1" });

    const result = await resolveElectedQuickPayFee(CARRIER_USER_ID, LOAD_ID);
    expect(result.feePercent).toBe(0);
  });

  it("the PaymentTier label cannot create a charge on its own", async () => {
    // The whole defect in one case. The caller may pass any PaymentTier it
    // likes; this resolver does not take one, so a tier label can no longer
    // price anything. A load with no election pays nothing no matter what the
    // request called it.
    mockPrisma.load.findUnique.mockResolvedValue(loadWithElection(null));
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: PROFILE_ID, quickPayEnabled: true });
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue({ id: "agreement_1" });

    expect((await resolveElectedQuickPayFee(CARRIER_USER_ID, LOAD_ID)).feePercent).toBe(0);
    expect(resolveElectedQuickPayFee.length).toBe(2); // (carrierUserId, loadId) — no tier arg
  });

  it("a settlement with no load attached cannot be charged a Quick Pay fee", async () => {
    const result = await resolveElectedQuickPayFee(CARRIER_USER_ID, null);
    expect(result.feePercent).toBe(0);
    expect(mockPrisma.load.findUnique).not.toHaveBeenCalled();
  });
});

describe("Quick Pay Agreement §4 — at-cost reimbursements sit outside the fee base", () => {
  it("carves out a lumper the carrier fronted", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(
      loadWithElection(3, [
        { type: "LUMPER", amount: 150 },
        { type: "DETENTION", amount: 250 },
      ]),
    );
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: PROFILE_ID, quickPayEnabled: true });
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue({ id: "agreement_1" });

    const result = await resolveElectedQuickPayFee(CARRIER_USER_ID, LOAD_ID);
    // Lumper is repaid at cost and is the carrier's own money. Detention is
    // earnings and stays inside the base.
    expect(result.reimbursements).toBe(150);
    expect(result.feePercent).toBe(3);
  });

  it("reports no carve-out when the load has no reimbursement lines", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(loadWithElection(3, [{ type: "DETENTION", amount: 250 }]));
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: PROFILE_ID, quickPayEnabled: true });
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue({ id: "agreement_1" });

    const result = await resolveElectedQuickPayFee(CARRIER_USER_ID, LOAD_ID);
    expect(result.reimbursements).toBe(0);
  });
});
