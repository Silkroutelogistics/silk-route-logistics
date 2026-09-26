/**
 * checkAutoReversal lifts only what it can prove has cleared (§13.3 Item 323).
 *
 * It used to lift every SUSPENDED carrier with a suspension timestamp the
 * moment FMCSA read clean, whatever the cause and whether or not the carrier
 * was archived. That lifted administrators' manual suspensions on Monday, put
 * archived carriers back to APPROVED, and reinstated a VETTING_CRITICAL
 * suspension on facts unrelated to the vetting score (AEROSWIFT, 2026-09-07).
 *
 * The prisma mock holds rows and evaluates each WHERE against them, so a wrong
 * filter fails here instead of matching whatever the author assumed (§13.3
 * Item 273.10). The first case is production as measured on 2026-09-26: three
 * suspended carriers, all AE_MANUAL, two archived, with the FMCSA answers the
 * live lookup gave that morning.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

type Row = {
  id: string;
  companyName: string;
  onboardingStatus: string;
  status: string;
  deletedAt: Date | null;
  isTestAccount: boolean;
  dotNumber: string | null;
  autoSuspendedAt: Date | null;
  autoSuspendReason: string | null;
  autoSuspendCause: string | null;
  insuranceExpiry: Date | null;
  user: { company: string | null; firstName: string; lastName: string; email: string };
};

const { mockPrisma, state, fmcsa, mockSendEmail } = vi.hoisted(() => {
  const state: { rows: Row[]; liftDuringFmcsaCall: string | null } = { rows: [], liftDuringFmcsaCall: null };
  const fmcsa: Record<string, { verified: boolean; operatingStatus: string; outOfServiceDate: string | null; insuranceOnFile: boolean }> = {};

  function matches(row: Record<string, unknown>, where: Record<string, unknown>): boolean {
    for (const [k, v] of Object.entries(where)) {
      const actual = row[k];
      if (v === null) { if (actual !== null) return false; continue; }
      if (v && typeof v === "object" && !(v instanceof Date)) {
        const op = v as { not?: unknown; in?: unknown[] };
        if ("not" in op) { if (op.not === null ? actual === null : actual === op.not) return false; continue; }
        if ("in" in op) { if (!op.in!.includes(actual)) return false; continue; }
        throw new Error(`mock cannot evaluate operator on ${k}: ${JSON.stringify(v)}`);
      }
      if (actual !== v) return false;
    }
    return true;
  }

  const mockPrisma = {
    carrierProfile: {
      findMany: vi.fn(async (args: { where: Record<string, unknown> }) =>
        state.rows.filter((r) => matches(r as unknown as Record<string, unknown>, args.where)).map((r) => ({ ...r }))),
      updateMany: vi.fn(async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        const hit = state.rows.filter((r) => matches(r as unknown as Record<string, unknown>, args.where));
        for (const r of hit) Object.assign(r, args.data);
        return { count: hit.length };
      }),
    },
    complianceAlert: { create: vi.fn(async () => ({})) },
  };
  return { mockPrisma, state, fmcsa, mockSendEmail: vi.fn(async () => "id") };
});

vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));
vi.mock("../../../src/lib/logger", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("../../../src/services/emailService", () => ({ sendEmail: mockSendEmail, wrap: (s: string) => s }));
vi.mock("../../../src/services/fmcsaService", () => ({
  calendarMonthsBetween: () => 24,
  verifyCarrierWithFMCSA: vi.fn(async (dot: string) => {
    // A person lifting the suspension while this call is in flight.
    if (state.liftDuringFmcsaCall) {
      const r = state.rows.find((x) => x.id === state.liftDuringFmcsaCall)!;
      Object.assign(r, { onboardingStatus: "REVIEWING", status: "REVIEW", autoSuspendedAt: null, autoSuspendReason: null, autoSuspendCause: null });
    }
    return fmcsa[dot] ?? { verified: false, operatingStatus: "UNKNOWN", outOfServiceDate: null, insuranceOnFile: false };
  }),
}));

import { checkAutoReversal } from "../../../src/services/complianceMonitorService";
import { verifyCarrierWithFMCSA } from "../../../src/services/fmcsaService";

const CLEAN = { verified: true, operatingStatus: "AUTHORIZED", outOfServiceDate: null, insuranceOnFile: true };
const DAY = 86_400_000;

function row(over: Partial<Row> & { id: string; dotNumber: string }): Row {
  return {
    companyName: over.id.toUpperCase(),
    onboardingStatus: "SUSPENDED",
    status: "SUSPENDED",
    deletedAt: null,
    isTestAccount: false,
    autoSuspendedAt: new Date("2026-09-21T04:07:00Z"),
    autoSuspendReason: "suspended",
    autoSuspendCause: "FMCSA_AUTHORITY",
    insuranceExpiry: null,
    user: { company: null, firstName: "Test", lastName: "Carrier", email: `${over.id}@srl.invalid` },
    ...over,
  };
}

const byId = (id: string) => state.rows.find((r) => r.id === id)!;

beforeEach(() => {
  vi.clearAllMocks();
  state.rows = [];
  state.liftDuringFmcsaCall = null;
  for (const k of Object.keys(fmcsa)) delete fmcsa[k];
});

describe("checkAutoReversal scope", () => {
  it("production on 2026-09-26: three AE_MANUAL suspensions (two archived), nothing is lifted, FMCSA is not even asked", async () => {
    state.rows = [
      row({ id: "blue-falcon", dotNumber: "4291042", autoSuspendCause: "AE_MANUAL", autoSuspendedAt: new Date("2026-09-23T22:23:54Z") }),
      row({ id: "a-falcon", dotNumber: "3483486", autoSuspendCause: "AE_MANUAL", deletedAt: new Date("2026-09-21T05:00:00Z") }),
      row({ id: "american-eagle", dotNumber: "4080743", autoSuspendCause: "AE_MANUAL", deletedAt: new Date("2026-09-21T05:00:00Z") }),
    ];
    fmcsa["4291042"] = { ...CLEAN, insuranceOnFile: false };
    fmcsa["3483486"] = CLEAN;
    fmcsa["4080743"] = CLEAN;

    const result = await checkAutoReversal();

    expect(result).toEqual({ checked: 0, reinstated: 0, errors: 0 });
    expect(verifyCarrierWithFMCSA).not.toHaveBeenCalled();
    expect(state.rows.map((r) => r.onboardingStatus)).toEqual(["SUSPENDED", "SUSPENDED", "SUSPENDED"]);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it.each(["AE_MANUAL", "OFAC_MATCH", "VETTING_CRITICAL", "FMCSA_RATING", null])(
    "a %s suspension stays suspended however clean FMCSA reads",
    async (cause) => {
      state.rows = [row({ id: "c1", dotNumber: "1000001", autoSuspendCause: cause })];
      fmcsa["1000001"] = CLEAN;
      await checkAutoReversal();
      expect(byId("c1").onboardingStatus).toBe("SUSPENDED");
      expect(mockSendEmail).not.toHaveBeenCalled();
    },
  );

  it("an archived carrier is never reinstated, even for a reversible cause", async () => {
    state.rows = [row({ id: "c1", dotNumber: "1000001", autoSuspendCause: "FMCSA_AUTHORITY", deletedAt: new Date("2026-09-20T00:00:00Z") })];
    fmcsa["1000001"] = CLEAN;
    await checkAutoReversal();
    expect(byId("c1").onboardingStatus).toBe("SUSPENDED");
  });

  it("a test account is never reinstated", async () => {
    state.rows = [row({ id: "c1", dotNumber: "1000001", isTestAccount: true })];
    fmcsa["1000001"] = CLEAN;
    await checkAutoReversal();
    expect(byId("c1").onboardingStatus).toBe("SUSPENDED");
  });

  it("an FMCSA authority suspension is reinstated once FMCSA reads clean, with all three columns cleared", async () => {
    state.rows = [row({ id: "c1", dotNumber: "1000001", autoSuspendCause: "FMCSA_AUTHORITY" })];
    fmcsa["1000001"] = CLEAN;
    const result = await checkAutoReversal();
    expect(result.reinstated).toBe(1);
    expect(byId("c1")).toMatchObject({
      onboardingStatus: "APPROVED",
      status: "APPROVED",
      autoSuspendedAt: null,
      autoSuspendReason: null,
      autoSuspendCause: null,
    });
    expect(mockPrisma.complianceAlert.create).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
  });

  it("an out-of-service suspension stays while FMCSA still shows the OOS date", async () => {
    state.rows = [row({ id: "c1", dotNumber: "1000001", autoSuspendCause: "FMCSA_OUT_OF_SERVICE" })];
    fmcsa["1000001"] = { ...CLEAN, outOfServiceDate: "2026-09-01" };
    await checkAutoReversal();
    expect(byId("c1").onboardingStatus).toBe("SUSPENDED");
  });

  it("an insurance-expiry suspension needs a current expiry on SRL's record, not only FMCSA's filing", async () => {
    state.rows = [
      row({ id: "lapsed", dotNumber: "1000001", autoSuspendCause: "INSURANCE_EXPIRED", insuranceExpiry: new Date(Date.now() - 5 * DAY) }),
      row({ id: "missing", dotNumber: "1000002", autoSuspendCause: "INSURANCE_EXPIRED", insuranceExpiry: null }),
      row({ id: "renewed", dotNumber: "1000003", autoSuspendCause: "INSURANCE_EXPIRED", insuranceExpiry: new Date(Date.now() + 300 * DAY) }),
    ];
    fmcsa["1000001"] = CLEAN;
    fmcsa["1000002"] = CLEAN;
    fmcsa["1000003"] = CLEAN;
    await checkAutoReversal();
    expect(byId("lapsed").onboardingStatus).toBe("SUSPENDED");
    expect(byId("missing").onboardingStatus).toBe("SUSPENDED");
    expect(byId("renewed").onboardingStatus).toBe("APPROVED");
  });

  it("a suspension lifted by a person during the FMCSA call is not overwritten with APPROVED", async () => {
    state.rows = [row({ id: "c1", dotNumber: "1000001", autoSuspendCause: "FMCSA_AUTHORITY" })];
    fmcsa["1000001"] = CLEAN;
    state.liftDuringFmcsaCall = "c1";
    const result = await checkAutoReversal();
    expect(byId("c1").onboardingStatus).toBe("REVIEWING");
    expect(result.reinstated).toBe(0);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });
});
