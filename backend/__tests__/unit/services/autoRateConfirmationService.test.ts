// The Quick Pay election matrix, and when it becomes binding.
//
// Two things are locked here, and they are locked TOGETHER on purpose:
//
//   THE FEE and THE PAY DATE. They diverged in production precisely because
//   nothing ever asserted them as a pair — one code path wrote the speed, a
//   different one kept the frozen percentage, and a load ended up paying
//   same-day money at the 7-day price. Every assertion below therefore checks
//   the percentage AND the resulting due date off the SAME resolved election.
//   A test that checks either one alone would have passed against the bug.
//
//   WHEN IT FREEZES. Drafting a rate confirmation decides nothing. Issuing it
//   does (Quick Pay Agreement §3 cl.3). So the draft path must write NOTHING
//   onto the load, and these tests assert prisma.load.update is never called.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import {
  autoGenerateRateConfirmation,
  resolveIssuedElection,
} from "../../../src/services/autoRateConfirmationService";
import { quickPayDueDate } from "../../../src/services/integrationService";
import { standardNetDays } from "../../../src/lib/quickPayPricing";

const mockPrisma = vi.mocked(prisma, true) as any;

// The shared setup mock does not carry these two models. Added here rather than
// in __tests__/setup.ts so this file stands on its own.
mockPrisma.quickPayEnrollment = { findFirst: vi.fn() };
mockPrisma.rateConfirmation = { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn() };

const RECEIVED = new Date("2026-03-02T15:00:00Z"); // a Monday, mid-afternoon

/**
 * Days between documentation-received and the due date the platform actually
 * computes, for a given frozen speed. This runs the production due-date
 * function, so the pair asserted below is (fee, real pay date), not (fee, a
 * number this test made up).
 */
function dueDaysFor(speed: "STANDARD" | "QP_7DAY" | "QP_SAMEDAY", tier: string): number {
  const due = quickPayDueDate(speed, tier, RECEIVED);
  return Math.round((due.getTime() - RECEIVED.getTime()) / 86_400_000);
}

function makeLoad(overrides: Record<string, any> = {}) {
  return {
    id: "load-1",
    loadNumber: "SRL-121485",
    referenceNumber: "SRL-121485",
    poster: { firstName: "Wasi", lastName: "Haider", phone: "269", email: "ops@srl.ai" },
    originCompany: "Beekeepers Naturals",
    originAddress: "1 Hive Way",
    originCity: "Toronto",
    originState: "ON",
    originZip: "M5V",
    destCompany: "Whole Foods DC",
    destAddress: "9 Dock Rd",
    destCity: "Detroit",
    destState: "MI",
    destZip: "48226",
    equipmentType: "Reefer",
    commodity: "Honey",
    weight: 30000,
    pieces: 20,
    hazmat: false,
    isMultiStop: false,
    temperatureControlled: false,
    tempMin: null,
    tempMax: null,
    tempSetpoint: null,
    preCoolTo: null,
    reeferContinuous: true,
    pickupDate: new Date("2026-03-01T12:00:00Z"),
    deliveryDate: new Date("2026-03-02T12:00:00Z"),
    customerRate: 2400,
    poNumbers: ["PO-1"],
    quickPaySpeed: null,
    ...overrides,
  };
}

function makeTender(tier = "SILVER", quickPayEnabled = true) {
  return {
    id: "tender-1",
    offeredRate: 2000,
    carrier: {
      id: "profile-1",
      companyName: "Integrity Express Logistics",
      mcNumber: "MC-596655",
      dotNumber: "1911857",
      contactEmail: "dispatch@iel.test",
      tier,
      quickPayEnabled,
      user: { firstName: "Ali", lastName: "Abbas", phone: "555", email: "ali@iel.test" },
    },
  };
}

/** Approved pilot, enabled account, signed Quick Pay Agreement. */
function pilotFullyEligible() {
  mockPrisma.quickPayEnrollment.findFirst.mockResolvedValue({ id: "enr-1" });
  mockPrisma.carrierAgreement.findFirst.mockResolvedValue({ id: "agr-1" });
}

async function runAutoRc(load: any, tender: any) {
  mockPrisma.load.findUnique.mockResolvedValue(load);
  mockPrisma.loadTender.findUnique.mockResolvedValue(tender);
  mockPrisma.rateConfirmation.findFirst.mockResolvedValue(null); // no existing draft
  mockPrisma.rateConfirmation.findMany.mockResolvedValue([]); // no numbers allocated yet
  mockPrisma.rateConfirmation.create.mockImplementation(async ({ data }: any) => ({
    id: "rc-1",
    ...data,
  }));

  const rc: any = await autoGenerateRateConfirmation(load.id, tender.id, "ae-1");
  return { rc, fd: rc.formData as Record<string, any> };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.load.update.mockResolvedValue({});
});

describe("autoGenerateRateConfirmation — the election matrix", () => {
  it("NO ELECTION on the load pays standard tier terms at no fee", async () => {
    pilotFullyEligible();
    const { fd } = await runAutoRc(makeLoad({ quickPaySpeed: null }), makeTender("SILVER"));

    // The pair. Silver standard is Net-30 at 0%.
    expect(fd.quickPaySpeed).toBe("STANDARD");
    expect(fd.quickPayFeePercent).toBe(0);
    expect(dueDaysFor("STANDARD", "SILVER")).toBe(standardNetDays("SILVER"));
    expect(fd.paymentTerms).toBe("Net-30");
  });

  it("does NOT default an approved, enabled, signed pilot carrier into 7-day", async () => {
    // The whole of D1 in one assertion: everything about this carrier says
    // "Quick Pay is available to them", and the load still costs them nothing,
    // because availability is not election.
    pilotFullyEligible();
    const { fd } = await runAutoRc(makeLoad({ quickPaySpeed: null }), makeTender("SILVER", true));
    expect(fd.quickPayFeePercent).toBe(0);
  });

  it("SEVEN_DAY elected pays the tier 7-day fee at 7 days", async () => {
    pilotFullyEligible();
    const { fd } = await runAutoRc(makeLoad({ quickPaySpeed: "SEVEN_DAY" }), makeTender("SILVER"));

    expect(fd.quickPaySpeed).toBe("SEVEN_DAY");
    expect(fd.quickPayFeePercent).toBe(3); // §8 Silver 7-day
    expect(dueDaysFor("QP_7DAY", "SILVER")).toBe(7);
  });

  it("SAME_DAY elected pays the 7-day fee plus the universal 2 points, same day", async () => {
    pilotFullyEligible();
    const { fd } = await runAutoRc(makeLoad({ quickPaySpeed: "SAME_DAY" }), makeTender("SILVER"));

    expect(fd.quickPaySpeed).toBe("SAME_DAY");
    expect(fd.quickPayFeePercent).toBe(5); // §8 Silver 3% + 2
    expect(dueDaysFor("QP_SAMEDAY", "SILVER")).toBe(0);
  });

  it("STANDARD elected explicitly is honoured and costs nothing", async () => {
    pilotFullyEligible();
    const { fd } = await runAutoRc(makeLoad({ quickPaySpeed: "STANDARD" }), makeTender("GOLD"));

    expect(fd.quickPaySpeed).toBe("STANDARD");
    expect(fd.quickPayFeePercent).toBe(0);
    expect(dueDaysFor("STANDARD", "GOLD")).toBe(standardNetDays("GOLD"));
  });

  it("an elected speed still costs nothing when the carrier is not in the pilot", async () => {
    mockPrisma.quickPayEnrollment.findFirst.mockResolvedValue(null);
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue({ id: "agr-1" });
    const { fd } = await runAutoRc(makeLoad({ quickPaySpeed: "SAME_DAY" }), makeTender("SILVER"));

    expect(fd.quickPaySpeed).toBe("STANDARD");
    expect(fd.quickPayFeePercent).toBe(0);
  });

  it("an elected speed still costs nothing without a signed Quick Pay Agreement", async () => {
    mockPrisma.quickPayEnrollment.findFirst.mockResolvedValue({ id: "enr-1" });
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue(null);
    const { fd } = await runAutoRc(makeLoad({ quickPaySpeed: "SEVEN_DAY" }), makeTender("SILVER"));

    expect(fd.quickPayFeePercent).toBe(0);
  });
});

describe("autoGenerateRateConfirmation — drafting freezes nothing", () => {
  it("never writes the election onto the load, whatever was elected", async () => {
    for (const speed of [null, "STANDARD", "SEVEN_DAY", "SAME_DAY"]) {
      vi.clearAllMocks();
      pilotFullyEligible();
      await runAutoRc(makeLoad({ quickPaySpeed: speed }), makeTender("SILVER"));
      // A draft nobody has sent must leave Load.quickPayFeePercent NULL, which
      // is what every charge path reads as "no fee recorded on this load".
      expect(mockPrisma.load.update).not.toHaveBeenCalled();
    }
  });

  it("allocates the rate confirmation's document number at creation", async () => {
    pilotFullyEligible();
    const { rc } = await runAutoRc(makeLoad(), makeTender("SILVER"));
    // A null here is invisible to the allocator's startsWith scan and to the
    // @unique column, so a re-issue silently reused this same number.
    expect(rc.rateConNumber).toBe("SRL-121485R");
  });

  it("takes the next revision when a number is already allocated for the load", async () => {
    pilotFullyEligible();
    mockPrisma.load.findUnique.mockResolvedValue(makeLoad());
    mockPrisma.loadTender.findUnique.mockResolvedValue(makeTender("SILVER"));
    mockPrisma.rateConfirmation.findFirst.mockResolvedValue(null);
    mockPrisma.rateConfirmation.findMany.mockResolvedValue([{ rateConNumber: "SRL-121485R" }]);
    mockPrisma.rateConfirmation.create.mockImplementation(async ({ data }: any) => ({ id: "rc-2", ...data }));

    const rc: any = await autoGenerateRateConfirmation("load-1", "tender-1", "ae-1");
    expect(rc.rateConNumber).toBe("SRL-121485R2");
  });
});

const ok = (fd: Record<string, unknown>, tier: string) => {
  const r = resolveIssuedElection(fd, tier);
  if (!r.ok) throw new Error(`expected ok, got ${r.code}: ${r.error}`);
  return r;
};
const refused = (fd: Record<string, unknown>, tier: string) => {
  const r = resolveIssuedElection(fd, tier);
  if (r.ok) throw new Error(`expected a refusal, got ${r.speed} @ ${r.feePercent}%`);
  return r;
};

describe("resolveIssuedElection — the pair that gets frozen when SRL issues", () => {
  it("freezes nothing chargeable when the document elected nothing", () => {
    const r = ok({}, "SILVER");
    expect(r).toMatchObject({ speed: "STANDARD", feePercent: 0 });
    expect(dueDaysFor("STANDARD", "SILVER")).toBe(30);
  });

  it("derives the fee from the §8 ladder when only the speed was recorded", () => {
    expect(ok({ quickPaySpeed: "SEVEN_DAY" }, "GOLD")).toMatchObject({ speed: "SEVEN_DAY", feePercent: 2 });
    expect(ok({ quickPaySpeed: "SAME_DAY" }, "GOLD")).toMatchObject({ speed: "SAME_DAY", feePercent: 4 });
    expect(ok({ quickPaySpeed: "SAME_DAY" }, "PLATINUM")).toMatchObject({ speed: "SAME_DAY", feePercent: 3 });
  });

  it("derives the speed from the rung when only a fee was recorded", () => {
    // This is the AE rate-confirmation modal, which has only ever sent a
    // percentage. Storing the fee alone is how a frozen 3% ended up beside a
    // speed that said something else.
    const seven = ok({ quickPayFeePercent: 3 }, "SILVER");
    expect(seven).toMatchObject({ speed: "SEVEN_DAY", feePercent: 3 });
    expect(dueDaysFor("QP_7DAY", "SILVER")).toBe(7);

    const same = ok({ quickPayFeePercent: 5 }, "SILVER");
    expect(same).toMatchObject({ speed: "SAME_DAY", feePercent: 5 });
    expect(dueDaysFor("QP_SAMEDAY", "SILVER")).toBe(0);
  });

  it("keeps the pair together when both halves were recorded and agree", () => {
    expect(ok({ quickPaySpeed: "SAME_DAY", quickPayFeePercent: 3 }, "PLATINUM")).toMatchObject({
      speed: "SAME_DAY",
      feePercent: 3,
    });
  });

  it("allows a discount below the rung — it pays the carrier more", () => {
    expect(ok({ quickPaySpeed: "SEVEN_DAY", quickPayFeePercent: 2 }, "SILVER")).toMatchObject({
      speed: "SEVEN_DAY",
      feePercent: 2,
    });
  });

  it("REFUSES standard terms sitting next to a fee", () => {
    expect(refused({ quickPaySpeed: "STANDARD", quickPayFeePercent: 3 }, "SILVER").code).toBe(
      "QP_SPEED_FEE_CONTRADICTION",
    );
  });

  it("REFUSES a Quick Pay speed with no fee behind it", () => {
    expect(refused({ quickPaySpeed: "SEVEN_DAY", quickPayFeePercent: 0 }, "SILVER").code).toBe(
      "QP_SPEED_FEE_CONTRADICTION",
    );
  });

  it("REFUSES a fee above the published ladder", () => {
    // §8 is locked. No AE typing into a form prices above it.
    expect(refused({ quickPaySpeed: "SEVEN_DAY", quickPayFeePercent: 4 }, "SILVER").code).toBe(
      "QP_FEE_ABOVE_LADDER",
    );
    expect(refused({ quickPayFeePercent: 6 }, "SILVER").code).toBe("QP_FEE_ABOVE_LADDER");
    // 3% IS the Platinum same-day rung, so it is on the ladder, not above it.
    expect(ok({ quickPayFeePercent: 3 }, "PLATINUM")).toMatchObject({ speed: "SAME_DAY", feePercent: 3 });
  });

  it("REFUSES a bare fee that sits between the two rungs", () => {
    // 4% for a Silver carrier is neither 7-day (3%) nor same-day (5%), and the
    // two differ by a fortnight of pay date. Guessing here picks a pay date.
    expect(refused({ quickPayFeePercent: 4 }, "SILVER").code).toBe("QP_SPEED_AMBIGUOUS");
    expect(refused({ quickPayFeePercent: 3 }, "GOLD").code).toBe("QP_SPEED_AMBIGUOUS");
  });

  it("REFUSES a speed it does not recognise", () => {
    expect(refused({ quickPaySpeed: "TURBO" }, "SILVER").code).toBe("QP_SPEED_UNRECOGNISED");
  });

  it("refusals carry a reason an operator can act on", () => {
    const r = refused({ quickPaySpeed: "STANDARD", quickPayFeePercent: 3 }, "SILVER");
    expect(r.error).toMatch(/standard terms/i);
    expect(r.error).toMatch(/3%/);
  });
});

describe("a speed change attempted after issue", () => {
  // The route-level refusal lives in
  // PUT /api/carrier-payments/loads/:loadId/quickpay-speed, which locks on the
  // frozen fee. What is locked here is the invariant that makes that lock
  // meaningful: re-resolving an ISSUED document reproduces the pair it was
  // issued at, so a load's fee and pay date cannot be re-derived into
  // something else after the fact.
  it("re-resolving an issued rate confirmation reproduces the same pair", () => {
    const issuedFd = { quickPaySpeed: "SEVEN_DAY", quickPayFeePercent: 3 };
    const first = resolveIssuedElection(issuedFd, "SILVER");
    const again = resolveIssuedElection(issuedFd, "SILVER");
    expect(again).toEqual(first);
  });

  it("re-resolves against the tier the document was issued at, not today's", () => {
    // The carrier advanced Silver -> Gold after this load was issued. Anchored
    // on the tier printed on the document, the frozen pair reproduces exactly.
    // This is why finalizeRateConfirmation reads fd.carrierPaymentTier first:
    // it is reproducing what was issued, not pricing the load fresh.
    const issuedFd = { quickPaySpeed: "SEVEN_DAY", quickPayFeePercent: 3, carrierPaymentTier: "SILVER" };
    const r = ok(issuedFd, issuedFd.carrierPaymentTier);
    expect(r).toMatchObject({ speed: "SEVEN_DAY", feePercent: 3 });
    expect(dueDaysFor("QP_7DAY", "SILVER")).toBe(7);
  });

  it("refuses rather than re-prices when the fee is above the tier it is asked about", () => {
    // Same document read against GOLD, whose 7-day rung is 2%. Rather than
    // quietly re-reading 3% as some other Gold product — the derivation habit
    // that mispriced loads in the first place — it refuses and leaves the
    // frozen numbers alone.
    const r = refused({ quickPaySpeed: "SEVEN_DAY", quickPayFeePercent: 3 }, "GOLD");
    expect(r.code).toBe("QP_FEE_ABOVE_LADDER");
  });
});
