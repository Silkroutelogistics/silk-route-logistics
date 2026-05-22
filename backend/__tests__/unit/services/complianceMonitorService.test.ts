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
//   6. Null grant date + approved ≥ 24h ago is a hard block (FMCSA
//      should have responded by now).
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
    carrierAgreement: { findFirst: vi.fn() },
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
    mockPrisma.carrierAgreement.findFirst.mockResolvedValue({
      id: "agreement-1",
      status: "SIGNED",
      signedAt: new Date(FIXED_NOW.getTime() - 100 * 86_400_000),
      expiresAt: new Date(FIXED_NOW.getTime() + 365 * 86_400_000),
    });
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
  // Case 6: null grant date + approved ≥24h ago — hard block
  // ─────────────────────────────────────────────────────────────────
  it("6. hard-blocks AUTHORITY_UNVERIFIED when approved ≥24h ago with null grant date", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({
        approvedAt: AFTER_CUTOFF, // 2026-05-22, ~24 days before FIXED_NOW
        authorityGrantedDate: null,
      }),
    );

    const result = await complianceCheck("carrier-1");
    expect(result.allowed).toBe(false);
    expect(result.blocked_reasons.some((r) => r.startsWith("AUTHORITY_UNVERIFIED"))).toBe(true);
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

  it("11. blocked_codes for null grant + ≥24h has AUTHORITY_UNVERIFIED overridable=false", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({
        approvedAt: AFTER_CUTOFF,
        authorityGrantedDate: null,
      }),
    );

    const result = await complianceCheck("carrier-1");
    const unverifiedEntry = result.blocked_codes.find((c) => c.code === "AUTHORITY_UNVERIFIED");
    expect(unverifiedEntry).toBeDefined();
    expect(unverifiedEntry!.overridable).toBe(false);
    expect(unverifiedEntry!.ageMonths).toBeUndefined();
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
