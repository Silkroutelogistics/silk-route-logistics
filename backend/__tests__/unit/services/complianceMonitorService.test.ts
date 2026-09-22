// Regression coverage for the authority-age gate in complianceCheck()
// — v3.8.ahm (Item 182 sprint 3 of 5).
//
// 7 cases ratified at Phase A:
//   1. Grandfathered carrier is never blocked, regardless of age or null
//      grant date.
//   2. 18 months or more authority age allows silently (no block, no
//      warning).
//   3. 12-18 months blocks by default and is released by a scoped
//      override with checkCode = "AUTHORITY_TOO_YOUNG".
//   4. Under 12 months is blocked even with a scoped override present
//      — the hard floor never consults the override.
//   5. Null grant date + approved < 24h ago surfaces a soft warning
//      (FMCSA callback still in flight).
//   6. Null grant date + approved ≥ 24h ago WARNS (does not block) —
//      grant-date data is unavailable from QCMobile, so null can't be
//      treated as known-young authority (v3.8.apq go-live de-risk).
//   7. A scoped authority-age override does NOT waive a separate
//      insurance-expiry block — scoping must hold across the function.
//
// Mocking: vi.hoisted pattern matching shipperTrackingTokenService.test.ts.
// Prisma is mocked at module level. The carrier-fixture helper builds a
// baseline-allowed row so each test only overrides the field under test.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    carrierProfile: { findUnique: vi.fn() },
    complianceOverride: { findFirst: vi.fn() },
    // v3.8.beh — findMany is what lib/agreementState calls. Not aliased to
    // findFirst: aliasing hides exactly the divergence a mock exists to expose.
    carrierAgreement: { findFirst: vi.fn(), findMany: vi.fn() },
    complianceAlert: { findMany: vi.fn(), create: vi.fn() },
    complianceScan: { findFirst: vi.fn() },
  },
}));

vi.mock("../../../src/config/database", () => ({
  prisma: mockPrisma,
}));

vi.mock("../../../src/lib/logger", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../../src/services/emailService", () => ({
  sendEmail: vi.fn(),
  wrap: (s: string) => s,
}));

vi.mock("../../../src/services/fmcsaService", () => ({
  verifyCarrierWithFMCSA: vi.fn(),
  calendarMonthsBetween: (start: Date, end: Date) => {
    const years = end.getFullYear() - start.getFullYear();
    const months = end.getMonth() - start.getMonth();
    const dayAdjust = end.getDate() < start.getDate() ? -1 : 0;
    return years * 12 + months + dayAdjust;
  },
}));

// Import AFTER mocks. Pull AUTHORITY_AGE_GATE_LIVE_AT so test fixtures
// can anchor their dates relative to the cutoff without hardcoding.
import {
  complianceCheck,
  AUTHORITY_AGE_GATE_LIVE_AT,
} from "../../../src/services/complianceMonitorService";

/**
 * Build a "baseline allowed" carrier fixture. Every check in
 * complianceCheck() passes; tests override specific fields to exercise
 * one branch at a time. Authority-age fields are explicit per-test so
 * the baseline doesn't accidentally satisfy the gate.
 */
function makeCarrier(overrides: Record<string, unknown> = {}) {
  // All dates derive from FIXED_NOW so the fixture is stable under the
  // vi.useFakeTimers pin set in beforeEach.
  const futureDate = new Date(FIXED_NOW.getTime() + 365 * 86_400_000);
  return {
    id: "carrier-1",
    onboardingStatus: "APPROVED",
    approvedAt: null,
    createdAt: new Date(FIXED_NOW.getTime() - 10 * 86_400_000),
    insuranceExpiry: futureDate,
    insuranceGracePeriodEnd: null,
    authorityGrantedDate: null,
    fmcsaAuthorityStatus: "AUTHORIZED",
    safetyRating: "SATISFACTORY",
    w9Uploaded: true,
    insuranceCertUploaded: true,
    authorityDocUploaded: true,
    ofacStatus: "CLEAR",
    cppTotalLoads: 50,
    cppJoinedDate: new Date(FIXED_NOW.getTime() - 200 * 86_400_000),
    coiExpiryDate: futureDate,
    w9ExpiryDate: futureDate,
    authorityDocExpiryDate: futureDate,
    chameleonRiskLevel: null,
    lastVettingScore: 85,
    user: { company: "Test Co", firstName: "T", lastName: "Co" },
    ...overrides,
  };
}

// Pin "now" to a deterministic mid-month date so the nMonthsAgo helper
// produces exact calendar-month ages via calendarMonthsBetween. Mid-month
// (the 15th) sidesteps end-of-month rollover edge cases in setMonth/Date
// arithmetic — every "N months ago" date constructed via nMonthsAgo lands
// on the 15th of some prior month, with calendarMonthsBetween(date, FIXED_NOW)
// returning exactly N. FIXED_NOW (2026-06-15) is ~25 days after the gate
// cutoff (2026-05-21T19:00:00Z), so all "post-cutoff" scenarios are
// reachable.
const FIXED_NOW = new Date(Date.UTC(2026, 5, 15, 12, 0, 0)); // 2026-06-15T12:00:00Z
const BEFORE_CUTOFF = new Date(AUTHORITY_AGE_GATE_LIVE_AT.getTime() - 30 * 86_400_000);
const AFTER_CUTOFF = new Date(AUTHORITY_AGE_GATE_LIVE_AT.getTime() + 1 * 86_400_000);

/**
 * Construct a UTC date exactly N calendar months before FIXED_NOW.
 * Verified: calendarMonthsBetween(nMonthsAgo(N), FIXED_NOW) === N.
 */
function nMonthsAgo(n: number): Date {
  return new Date(Date.UTC(2026, 5 - n, 15, 12, 0, 0));
}

describe("complianceCheck — authority-age gate (v3.8.ahm)", () => {
  beforeEach(() => {
    // resetAllMocks (not just clear) — clears the .mockResolvedValueOnce
    // queue too, so any leftover Once-mock from a prior test (e.g. case 4's
    // unconsumed scoped-override entry) cannot leak into the next test's
    // blanket-override lookup.
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    // Defaults: no blanket override, no scoped override, signed agreement on file.
    mockPrisma.complianceOverride.findFirst.mockResolvedValue(null);
    // v3.8.beh — the gate reads agreements through lib/agreementState, which
    // fetches the broker-carrier rows in ONE findMany and decides in memory.
    mockPrisma.carrierAgreement.findMany.mockResolvedValue([
      { templateName: "broker-carrier", status: "SIGNED", signedAt: new Date(FIXED_NOW.getTime() - 100 * 86_400_000), terminatedAt: null, terminationReason: null, expiresAt: new Date(FIXED_NOW.getTime() + 365 * 86_400_000) },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────
  // Case 1: grandfathered carrier — never blocked
  // ─────────────────────────────────────────────────────────────────
  it("1. soft-grandfathers existing carrier approved before the cutoff (null grant date too)", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({
        approvedAt: BEFORE_CUTOFF,
        authorityGrantedDate: null, // backfill never reached this row
      }),
    );

    const result = await complianceCheck("carrier-1");
    expect(result.allowed).toBe(true);
    expect(result.blocked_reasons).toEqual([]);
    expect(result.warnings.some((w) => w.startsWith("AUTHORITY_AGE_GRANDFATHERED"))).toBe(true);
  });

  it("1b. soft-grandfathers existing carrier even with too-young authority (e.g. 6 months)", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({
        approvedAt: BEFORE_CUTOFF,
        authorityGrantedDate: nMonthsAgo(6),
      }),
    );

    const result = await complianceCheck("carrier-1");
    expect(result.allowed).toBe(true);
    expect(result.blocked_reasons).toEqual([]);
    expect(result.warnings.some((w) => w.includes("AUTHORITY_AGE_GRANDFATHERED") && w.includes("6 months"))).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────
  // Case 2: 18 months or more — allowed silently
  // ─────────────────────────────────────────────────────────────────
  it("2. allows silently when authority age is 18+ months (no block, no authority-age warning)", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({
        approvedAt: AFTER_CUTOFF,
        authorityGrantedDate: nMonthsAgo(20),
      }),
    );

    const result = await complianceCheck("carrier-1");
    expect(result.allowed).toBe(true);
    expect(result.blocked_reasons).toEqual([]);
    // No authority-age warning should fire — the check is silent on ≥18 months.
    expect(result.warnings.some((w) => w.startsWith("AUTHORITY_"))).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────
  // Case 3: 12-to-18 months — blocks default, released by scoped override
  // ─────────────────────────────────────────────────────────────────
  it("3a. blocks a 15-month authority by default (no override)", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({
        approvedAt: AFTER_CUTOFF,
        authorityGrantedDate: nMonthsAgo(15),
      }),
    );
    mockPrisma.complianceOverride.findFirst.mockResolvedValue(null);

    const result = await complianceCheck("carrier-1");
    expect(result.allowed).toBe(false);
    expect(result.blocked_reasons.some((r) => r.startsWith("AUTHORITY_TOO_YOUNG") && r.includes("15 months"))).toBe(true);
  });

  it("3b. releases a 15-month authority when a scoped AUTHORITY_TOO_YOUNG override is active", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({
        approvedAt: AFTER_CUTOFF,
        authorityGrantedDate: nMonthsAgo(15),
      }),
    );
    // First findFirst call is the blanket override lookup (checkCode IS NULL) — null.
    // Second findFirst call is the scoped AUTHORITY_TOO_YOUNG lookup — return an active override.
    mockPrisma.complianceOverride.findFirst
      .mockResolvedValueOnce(null) // blanket
      .mockResolvedValueOnce({
        id: "override-1",
        carrierId: "carrier-1",
        checkCode: "AUTHORITY_TOO_YOUNG",
        reason: "Admin override — known good carrier",
        adminId: "admin-1",
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

    const result = await complianceCheck("carrier-1");
    expect(result.allowed).toBe(true);
    expect(result.blocked_reasons).toEqual([]);
    expect(result.warnings.some((w) => w.startsWith("AUTHORITY_AGE_OVERRIDE"))).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────
  // Case 4: under 12 months — blocked even with scoped override
  // ─────────────────────────────────────────────────────────────────
  it("4. hard-blocks <12-month authority even when a scoped override is present", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({
        approvedAt: AFTER_CUTOFF,
        authorityGrantedDate: nMonthsAgo(6),
      }),
    );
    // Even though a scoped override would be "present" if queried, the
    // <12-month branch does NOT consult overrides — the hard floor blocks
    // regardless. Only the blanket-override lookup fires (returns null
    // here, so we don't short-circuit). We deliberately do NOT pre-stage
    // a second mockResolvedValueOnce for the scoped lookup because the
    // <12 branch never executes it; staging unused Once-mocks would leak
    // into the next test's queue.
    mockPrisma.complianceOverride.findFirst.mockResolvedValueOnce(null);

    const result = await complianceCheck("carrier-1");
    expect(result.allowed).toBe(false);
    expect(result.blocked_reasons.some((r) => r.startsWith("AUTHORITY_TOO_YOUNG") && r.includes("6 months"))).toBe(true);
    // No AUTHORITY_AGE_OVERRIDE warning — the override was never consulted.
    expect(result.warnings.some((w) => w.startsWith("AUTHORITY_AGE_OVERRIDE"))).toBe(false);
  });

  // ─────────────────────────────────────────────────────────────────
  // Case 5: null grant date + approved <24h ago — warn only
  // ─────────────────────────────────────────────────────────────────
  it("5. surfaces AUTHORITY_PENDING warning when approved <24h ago with null grant date", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({
        approvedAt: new Date(FIXED_NOW.getTime() - 6 * 60 * 60 * 1000), // 6 hours ago (after cutoff)
        authorityGrantedDate: null,
      }),
    );

    const result = await complianceCheck("carrier-1");
    expect(result.allowed).toBe(true);
    expect(result.blocked_reasons).toEqual([]);
    expect(result.warnings.some((w) => w.startsWith("AUTHORITY_PENDING"))).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────
  // Case 6: null grant date + approved ≥24h ago — WARN, not block
  // ─────────────────────────────────────────────────────────────────
  // v3.8.apq go-live de-risk: null grant date is data-unavailability, not
  // known-young authority. QCMobile can't supply grant dates, so a null reads
  // identically for a 17-year carrier and a 3-month one. Blocking on it was
  // blocking every legitimate carrier at tender time. Now warns, does not block.
  it("6. warns AUTHORITY_AGE_UNAVAILABLE (does NOT block) when approved ≥24h ago with null grant date", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({
        approvedAt: AFTER_CUTOFF, // 2026-05-22, ~24 days before FIXED_NOW
        authorityGrantedDate: null,
      }),
    );

    const result = await complianceCheck("carrier-1");
    expect(result.allowed).toBe(true);
    expect(result.blocked_reasons.some((r) => r.startsWith("AUTHORITY_UNVERIFIED"))).toBe(false);
    expect(result.warnings.some((w) => w.startsWith("AUTHORITY_AGE_UNAVAILABLE"))).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────
  // v3.8.ahn — blocked_codes overridable flag across the 3 authority bands
  // ─────────────────────────────────────────────────────────────────
  it("8. blocked_codes for <12mo has overridable=false (hard floor)", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({
        approvedAt: AFTER_CUTOFF,
        authorityGrantedDate: nMonthsAgo(6),
      }),
    );
    mockPrisma.complianceOverride.findFirst.mockResolvedValueOnce(null);

    const result = await complianceCheck("carrier-1");
    const ageEntry = result.blocked_codes.find((c) => c.code === "AUTHORITY_TOO_YOUNG");
    expect(ageEntry).toBeDefined();
    expect(ageEntry!.overridable).toBe(false);
    expect(ageEntry!.ageMonths).toBe(6);
  });

  it("9. blocked_codes for 12-18mo (no override) has overridable=true", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({
        approvedAt: AFTER_CUTOFF,
        authorityGrantedDate: nMonthsAgo(15),
      }),
    );
    mockPrisma.complianceOverride.findFirst.mockResolvedValue(null);

    const result = await complianceCheck("carrier-1");
    const ageEntry = result.blocked_codes.find((c) => c.code === "AUTHORITY_TOO_YOUNG");
    expect(ageEntry).toBeDefined();
    expect(ageEntry!.overridable).toBe(true);
    expect(ageEntry!.ageMonths).toBe(15);
  });

  it("10. blocked_codes is empty for ≥18mo (silent allow)", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({
        approvedAt: AFTER_CUTOFF,
        authorityGrantedDate: nMonthsAgo(20),
      }),
    );

    const result = await complianceCheck("carrier-1");
    expect(result.blocked_codes).toEqual([]);
  });

  it("11. null grant + ≥24h emits NO authority-age blocked_code — warns instead (v3.8.apq)", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({
        approvedAt: AFTER_CUTOFF,
        authorityGrantedDate: null,
      }),
    );

    const result = await complianceCheck("carrier-1");
    expect(result.allowed).toBe(true);
    expect(result.blocked_codes.find((c) => c.code === "AUTHORITY_UNVERIFIED")).toBeUndefined();
    expect(result.warnings.some((w) => w.startsWith("AUTHORITY_AGE_UNAVAILABLE"))).toBe(true);
  });

  // ─────────────────────────────────────────────────────────────────
  // Case 7: CRITICAL — scoped override scope holds across the function
  // ─────────────────────────────────────────────────────────────────
  it("7. scoped AUTHORITY_TOO_YOUNG override does NOT waive a separate insurance-expiry block", async () => {
    const expiredInsurance = new Date(FIXED_NOW.getTime() - 10 * 86_400_000); // expired 10 days ago

    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({
        approvedAt: AFTER_CUTOFF,
        authorityGrantedDate: nMonthsAgo(15),
        insuranceExpiry: expiredInsurance,
        insuranceGracePeriodEnd: null,
      }),
    );
    mockPrisma.complianceOverride.findFirst
      .mockResolvedValueOnce(null) // blanket — none
      .mockResolvedValueOnce({
        id: "override-1",
        checkCode: "AUTHORITY_TOO_YOUNG",
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      });

    const result = await complianceCheck("carrier-1");

    // Authority-age block was released by the scoped override — confirm.
    expect(result.warnings.some((w) => w.startsWith("AUTHORITY_AGE_OVERRIDE"))).toBe(true);
    expect(result.blocked_reasons.some((r) => r.startsWith("AUTHORITY_TOO_YOUNG"))).toBe(false);

    // But insurance MUST still block — scope must hold.
    expect(result.allowed).toBe(false);
    expect(result.blocked_reasons.some((r) => r === "Insurance has expired")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// A terminated carrier-broker agreement (Arc 6 Phase 2)
//
// Termination already blocked before this shipped, because a TERMINATED row
// fails the status: "SIGNED" filter and falls into the no-agreement branch. The
// defect was the REASON: it said "none on file", which sends an AE to chase a
// carrier for a signature they already gave and someone revoked. These pin the
// block AND the distinction.
// ─────────────────────────────────────────────────────────────────────────────
describe("complianceCheck — terminated agreement", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    mockPrisma.complianceOverride.findFirst.mockResolvedValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("blocks a carrier whose BCA was terminated, and says terminated rather than missing", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(makeCarrier());
    // One findMany; the only broker-carrier row is TERMINATED.
    mockPrisma.carrierAgreement.findMany.mockResolvedValue([
      { templateName: "broker-carrier", status: "TERMINATED", signedAt: new Date("2026-05-01T00:00:00Z"), terminatedAt: new Date("2026-06-01T00:00:00Z"), terminationReason: "Carrier offboarded at their request", expiresAt: null },
    ]);

    const result = await complianceCheck("carrier-1");

    expect(result.allowed).toBe(false);
    expect(result.blocked_reasons.join(" ")).toContain("AGREEMENT_TERMINATED");
    expect(result.blocked_reasons.join(" ")).toContain("2026-06-01");
    expect(result.blocked_reasons.join(" ")).not.toContain("AGREEMENT_MISSING");
  });

  it("surfaces a non-overridable AGREEMENT_TERMINATED code", async () => {
    // An AE waving this through would put a load on a carrier with no agreement
    // governing it. The remedy is a signature, not an override.
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(makeCarrier());
    mockPrisma.carrierAgreement.findMany.mockResolvedValue([
      { templateName: "broker-carrier", status: "TERMINATED", signedAt: null, terminatedAt: new Date("2026-06-01T00:00:00Z"), terminationReason: "x", expiresAt: null },
    ]);

    const result = await complianceCheck("carrier-1");

    const code = result.blocked_codes.find((c) => c.code === "AGREEMENT_TERMINATED");
    expect(code).toBeDefined();
    expect(code!.overridable).toBe(false);
  });

  it("blocks a carrier who never signed with a non-overridable AGREEMENT_MISSING code (v3.8.beh)", async () => {
    // Ninth absolute (seventh when written). Until beh this branch pushed a
    // bare reason with no
    // code, and a blanket override released it — which is how SRL-121492 ran
    // on a carrier holding only the registration click-wrap.
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(makeCarrier());
    mockPrisma.carrierAgreement.findMany.mockResolvedValue([]);

    const result = await complianceCheck("carrier-1");

    expect(result.allowed).toBe(false);
    expect(result.blocked_reasons.join(" ")).toContain("AGREEMENT_MISSING");
    expect(result.blocked_reasons.join(" ")).toContain("activation page");
    const code = result.blocked_codes.find((c) => c.code === "AGREEMENT_MISSING");
    expect(code).toBeDefined();
    expect(code!.overridable).toBe(false);
    expect(result.blocked_codes.some((c) => c.code === "AGREEMENT_TERMINATED")).toBe(false);
  });

  it("ACKNOWLEDGED (registration click-wrap) is MISSING, not SIGNED", async () => {
    // The enum comment says the click-wrap is deliberately not a signature.
    // This is the shape every F11 registrant holds today (PEACE TRANSPORT et al).
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(makeCarrier());
    mockPrisma.carrierAgreement.findMany.mockResolvedValue([
      { templateName: "broker-carrier", status: "ACKNOWLEDGED", signedAt: new Date(FIXED_NOW.getTime() - 3 * 86_400_000), terminatedAt: null, terminationReason: null, expiresAt: null },
    ]);

    const result = await complianceCheck("carrier-1");

    expect(result.allowed).toBe(false);
    expect(result.blocked_codes.find((c) => c.code === "AGREEMENT_MISSING")?.overridable).toBe(false);
  });

  it("a blanket override does NOT release AGREEMENT_MISSING — the 2026-09-18 shape", async () => {
    // A live blanket override, a carrier with only the click-wrap row. Before
    // beh this returned allowed: true and the tender was created
    // (created_under_compliance_override). Now the reason is KEPT, not released.
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(makeCarrier());
    mockPrisma.carrierAgreement.findMany.mockResolvedValue([
      { templateName: "broker-carrier", status: "ACKNOWLEDGED", signedAt: new Date(FIXED_NOW.getTime() - 3 * 86_400_000), terminatedAt: null, terminationReason: null, expiresAt: null },
    ]);
    mockPrisma.complianceOverride.findFirst.mockResolvedValue({
      id: "ov-blanket", checkCode: null, expiresAt: new Date(FIXED_NOW.getTime() + 86_400_000), createdAt: FIXED_NOW,
    });

    const result = await complianceCheck("carrier-1");

    expect(result.allowed).toBe(false);
    expect(result.blocked_reasons.some((r) => r.startsWith("AGREEMENT_MISSING"))).toBe(true);
    expect(result.released.some((r) => r.startsWith("AGREEMENT_MISSING"))).toBe(false);
    expect(result.blocked_codes.find((c) => c.code === "AGREEMENT_MISSING")?.overridable).toBe(false);
  });

  it("allows a carrier who re-signed after termination", async () => {
    // The whole point of keeping the sign path idempotent: terminate, re-sign,
    // haul again. The SIGNED lookup finds the newer row, so the terminated
    // branch is never reached.
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(makeCarrier());
    // Both rows in hand; the newer SIGNED one wins over the TERMINATED one.
    mockPrisma.carrierAgreement.findMany.mockResolvedValue([
      { templateName: "broker-carrier", status: "TERMINATED", signedAt: new Date(FIXED_NOW.getTime() - 30 * 86_400_000), terminatedAt: new Date(FIXED_NOW.getTime() - 10 * 86_400_000), terminationReason: "x", expiresAt: null },
      { templateName: "broker-carrier", status: "SIGNED", signedAt: new Date(FIXED_NOW.getTime() - 86_400_000), terminatedAt: null, terminationReason: null, expiresAt: null },
    ]);

    const result = await complianceCheck("carrier-1");

    expect(result.allowed).toBe(true);
    expect(result.blocked_reasons).toEqual([]);
  });

  it("reads agreements with exactly one query on every path", async () => {
    // v3.8.beh — one findMany, decided in memory. The pre-beh shape was two
    // findFirsts on the no-agreement path; this pins that it did not come back.
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(makeCarrier());
    mockPrisma.carrierAgreement.findMany.mockResolvedValue([
      { templateName: "broker-carrier", status: "SIGNED", signedAt: new Date(FIXED_NOW.getTime() - 86_400_000), terminatedAt: null, terminationReason: null, expiresAt: null },
    ]);

    await complianceCheck("carrier-1");

    expect(mockPrisma.carrierAgreement.findMany).toHaveBeenCalledTimes(1);
    expect(mockPrisma.carrierAgreement.findFirst).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────
// Carrier-archive recut B2a (2026-09-20) — the seventh and eighth absolutes.
//
// Before B2a the gate never read deletedAt (a by-id tender to an ARCHIVED
// carrier went through while every list picker refused it — B6d, first run),
// and it refused SUSPENDED and REJECTED by reason string only, with no code
// and no absolute marking, so PENDING / REVIEWING / INFO_REQUESTED passed
// outright and a blanket override released a suspension for a day.
//
// Each case here holds one property; the blanket-override cases hold the
// PARTITION (a waivable block on the same carrier is released while the
// absolute stands), because "still blocked" alone is also true of a gate
// that simply stopped honouring overrides.
// ─────────────────────────────────────────────────────────────────────────
describe("complianceCheck — archive and status absolutes (carrier-archive B2a)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    mockPrisma.complianceOverride.findFirst.mockResolvedValue(null);
    // The gate reads the agreement through lib/agreementState (v3.8.beh), which
    // uses findMany + the pure agreementStateFrom, not the findFirst this block
    // was written against. The fixture is UPDATED rather than deleted (§13.3
    // Item 244.2): the intent is unchanged — this carrier HAS an executed BCA,
    // so the agreement is never what blocks, and the archive/status codes these
    // cases assert on are isolated. templateName is required: agreementStateFrom
    // filters on it, so a row without it reads as MISSING and would block here
    // for the wrong reason.
    const signedBca = {
      id: "agreement-1",
      status: "SIGNED",
      templateName: "broker-carrier",
      version: "2026-09-03-F11",
      signedAt: new Date(FIXED_NOW.getTime() - 100 * 86_400_000),
      terminatedAt: null,
      expiresAt: null,
    };
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue(signedBca);
    mockPrisma.carrierAgreement.findMany.mockResolvedValue([signedBca]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const BLANKET = { id: "ov-blanket", checkCode: null, expiresAt: new Date(FIXED_NOW.getTime() + 3_600_000) };

  it("baseline: an APPROVED, un-archived carrier gets neither code (negative control)", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(makeCarrier({ deletedAt: null, archiveReason: null }));
    const r = await complianceCheck("carrier-1");
    expect(r.allowed).toBe(true);
    expect(r.blocked_codes.map((c) => c.code)).not.toContain("CARRIER_ARCHIVED");
    expect(r.blocked_codes.map((c) => c.code)).not.toContain("CARRIER_NOT_APPROVED");
  });

  it("an archived carrier is refused with CARRIER_ARCHIVED, overridable:false, and the reason names the restore", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({ deletedAt: new Date(FIXED_NOW.getTime() - 86_400_000), archiveReason: "FRAUD_CONFIRMED" }),
    );
    const r = await complianceCheck("carrier-1");
    expect(r.allowed).toBe(false);
    const code = r.blocked_codes.find((c) => c.code === "CARRIER_ARCHIVED");
    expect(code).toBeDefined();
    expect(code!.overridable).toBe(false);
    const reason = r.blocked_reasons.find((x) => x.startsWith("CARRIER_ARCHIVED:"))!;
    expect(reason).toContain("Fraud confirmed"); // the shared label, not the enum
    expect(reason).toContain("restore");
  });

  it("an archived carrier with no reason recorded still says so rather than printing 'null'", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({ deletedAt: new Date(FIXED_NOW.getTime() - 86_400_000), archiveReason: null }),
    );
    const r = await complianceCheck("carrier-1");
    const reason = r.blocked_reasons.find((x) => x.startsWith("CARRIER_ARCHIVED:"))!;
    expect(reason).toContain("no reason recorded");
    expect(reason).not.toContain("null");
  });

  it("a REVIEWING carrier holding an executed BCA is refused with CARRIER_NOT_APPROVED — the B6d finding", async () => {
    // The restore path (B6c) is the first population with both. The list
    // pickers refused it; the gate allowed it; a by-id tender went through.
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(makeCarrier({ onboardingStatus: "REVIEWING", deletedAt: null }));
    const r = await complianceCheck("carrier-1");
    expect(r.allowed).toBe(false);
    const code = r.blocked_codes.find((c) => c.code === "CARRIER_NOT_APPROVED");
    expect(code).toBeDefined();
    expect(code!.overridable).toBe(false);
    expect(code!.status).toBe("REVIEWING");
    const reason = r.blocked_reasons.find((x) => x.startsWith("CARRIER_NOT_APPROVED:"))!;
    expect(reason).toContain("REVIEWING");
    expect(reason).toContain("approve");
  });

  it.each(["PENDING", "INFO_REQUESTED"])("%s is refused the same way — every non-APPROVED state is one absolute", async (status) => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(makeCarrier({ onboardingStatus: status, deletedAt: null }));
    const r = await complianceCheck("carrier-1");
    expect(r.allowed).toBe(false);
    const code = r.blocked_codes.find((c) => c.code === "CARRIER_NOT_APPROVED");
    expect(code?.status).toBe(status);
    expect(code?.overridable).toBe(false);
  });

  it("SUSPENDED keeps its legacy reason string verbatim and now carries the code", async () => {
    // loadComplianceService prints its own copy of this string and a reader
    // may be matching on it; the string does not move, the code is new.
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(makeCarrier({ onboardingStatus: "SUSPENDED", deletedAt: null }));
    const r = await complianceCheck("carrier-1");
    expect(r.blocked_reasons).toContain("Carrier is suspended");
    const code = r.blocked_codes.find((c) => c.code === "CARRIER_NOT_APPROVED");
    expect(code?.status).toBe("SUSPENDED");
    expect(code?.overridable).toBe(false);
  });

  it("REJECTED keeps its legacy reason string verbatim and now carries the code", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(makeCarrier({ onboardingStatus: "REJECTED", deletedAt: null }));
    const r = await complianceCheck("carrier-1");
    expect(r.blocked_reasons).toContain("Carrier application rejected");
    expect(r.blocked_codes.find((c) => c.code === "CARRIER_NOT_APPROVED")?.status).toBe("REJECTED");
  });

  it("a blanket override releases a waivable block on a SUSPENDED carrier and does NOT release the suspension — the partition", async () => {
    // Before B2a this override made a suspended carrier tenderable for 24h.
    // lastVettingScore < 40 is a waivable block on the same row; it must go
    // into `released` while the suspension stays in blocked_reasons.
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({ onboardingStatus: "SUSPENDED", deletedAt: null, lastVettingScore: 30, lastVettedAt: FIXED_NOW }),
    );
    mockPrisma.complianceOverride.findFirst.mockResolvedValueOnce(BLANKET); // the blanket lookup is the first call
    const r = await complianceCheck("carrier-1");
    expect(r.allowed).toBe(false);
    expect(r.blocked_reasons).toContain("Carrier is suspended");
    expect(r.released.some((x) => x.startsWith("Vetting score CRITICAL"))).toBe(true);
    expect(r.released).not.toContain("Carrier is suspended");
    expect(r.appliedOverrideId).toBe("ov-blanket");
  });

  it("a blanket override does not release CARRIER_ARCHIVED", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({ deletedAt: new Date(FIXED_NOW.getTime() - 86_400_000), archiveReason: "DUPLICATE_RECORD", lastVettingScore: 30, lastVettedAt: FIXED_NOW }),
    );
    mockPrisma.complianceOverride.findFirst.mockResolvedValueOnce(BLANKET);
    const r = await complianceCheck("carrier-1");
    expect(r.allowed).toBe(false);
    expect(r.blocked_reasons.some((x) => x.startsWith("CARRIER_ARCHIVED:"))).toBe(true);
    expect(r.released.some((x) => x.startsWith("CARRIER_ARCHIVED:"))).toBe(false);
    expect(r.released.some((x) => x.startsWith("Vetting score CRITICAL"))).toBe(true);
  });

  it("a blanket override does not release CARRIER_NOT_APPROVED for a REVIEWING carrier", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(makeCarrier({ onboardingStatus: "REVIEWING", deletedAt: null }));
    mockPrisma.complianceOverride.findFirst.mockResolvedValueOnce(BLANKET);
    const r = await complianceCheck("carrier-1");
    expect(r.allowed).toBe(false);
    expect(r.released.some((x) => x.startsWith("CARRIER_NOT_APPROVED:"))).toBe(false);
  });

  it("an archived carrier that is also not APPROVED carries both codes — two absolutes, not one", async () => {
    // Restore lands the carrier at REVIEWING with deletedAt cleared, so this
    // pair never arises from the restore path; it arises when a non-APPROVED
    // carrier is archived (archive does not touch onboardingStatus).
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({ onboardingStatus: "PENDING", deletedAt: new Date(FIXED_NOW.getTime() - 86_400_000), archiveReason: "OTHER" }),
    );
    const r = await complianceCheck("carrier-1");
    const codes = r.blocked_codes.map((c) => c.code);
    expect(codes).toContain("CARRIER_ARCHIVED");
    expect(codes).toContain("CARRIER_NOT_APPROVED");
  });
});
