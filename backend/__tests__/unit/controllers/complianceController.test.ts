// Regression coverage for the v3.8.ahn extension of overrideBlock —
// scoped AUTHORITY_TOO_YOUNG overrides plus the three 409 guards
// (NO_AUTHORITY_DATE, HARD_FLOOR_NOT_OVERRIDABLE, OVERRIDE_NOT_NEEDED)
// plus backwards-compat for the legacy blanket-override callers.
//
// Five cases per Phase A D12-A + D13-P ratification:
//   1. 409 NO_AUTHORITY_DATE when authorityGrantedDate is null.
//   2. 409 HARD_FLOOR_NOT_OVERRIDABLE when ageMonths < 12.
//   3. 409 OVERRIDE_NOT_NEEDED when ageMonths >= 18.
//   4. 200 + create({ checkCode: "AUTHORITY_TOO_YOUNG" }) for a 12-18mo
//      carrier with a real reason.
//   5. 200 + create({ checkCode: null }) when no checkCode is sent —
//      Sprint 40 blanket behavior preserved.
//
// Prisma + fmcsaService mocked at module level. The calendarMonthsBetween
// mock returns the same calendar-month logic the real helper uses so
// the controller's ageMonths derivation matches the test fixture math.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Request, Response } from "express";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    carrierProfile: { findUnique: vi.fn() },
    complianceOverride: { count: vi.fn(), create: vi.fn() },
    auditTrail: { create: vi.fn() },
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

vi.mock("../../../src/services/complianceMonitorService", () => ({
  complianceCheck: vi.fn(),
}));

// Mirror the calendar-month arithmetic from the real fmcsaService helper
// so the controller's defense-in-depth re-derivation lands on the same
// integer the gate would compute.
vi.mock("../../../src/services/fmcsaService", () => ({
  calendarMonthsBetween: (start: Date, end: Date) => {
    const years = end.getFullYear() - start.getFullYear();
    const months = end.getMonth() - start.getMonth();
    const dayAdjust = end.getDate() < start.getDate() ? -1 : 0;
    return years * 12 + months + dayAdjust;
  },
}));

import { overrideBlock } from "../../../src/controllers/complianceController";

// Pin "now" to a deterministic mid-month date so nMonthsAgo(N) lands on
// the 15th of some prior month and calendarMonthsBetween returns
// exactly N.
const FIXED_NOW = new Date(Date.UTC(2026, 5, 15, 12, 0, 0));

function nMonthsAgo(n: number): Date {
  return new Date(Date.UTC(2026, 5 - n, 15, 12, 0, 0));
}

type ReqLike = {
  params: { carrierId: string };
  body: { reason?: string; checkCode?: string };
  user: { id: string; email: string; role: string };
};

function makeReq(overrides: Partial<ReqLike> = {}): Request {
  return {
    params: { carrierId: "carrier-1" },
    body: { reason: "Known good carrier, prior business history" },
    user: { id: "admin-1", email: "ceo@srl.invalid", role: "CEO" },
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response & {
  _status: number;
  _body: Record<string, unknown> | undefined;
} {
  const res = {
    _status: 200,
    _body: undefined as Record<string, unknown> | undefined,
    status: vi.fn(function (this: typeof res, code: number) {
      this._status = code;
      return this;
    }),
    json: vi.fn(function (this: typeof res, body: Record<string, unknown>) {
      this._body = body;
      return this;
    }),
  };
  return res as unknown as Response & {
    _status: number;
    _body: Record<string, unknown> | undefined;
  };
}

function makeCarrier(overrides: Record<string, unknown> = {}) {
  return {
    id: "carrier-1",
    authorityGrantedDate: nMonthsAgo(15), // 12-18 band by default
    user: { company: "Test Co", firstName: "T", lastName: "Co" },
    ...overrides,
  };
}

describe("overrideBlock — v3.8.ahn scoped AUTHORITY_TOO_YOUNG", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(FIXED_NOW);
    // Default: quota plenty open + mints succeed.
    mockPrisma.complianceOverride.count.mockResolvedValue(0);
    mockPrisma.complianceOverride.create.mockResolvedValue({
      id: "override-1",
      carrierId: "carrier-1",
      reason: "Known good carrier, prior business history",
      checkCode: null,
      adminId: "admin-1",
      expiresAt: new Date(FIXED_NOW.getTime() + 24 * 60 * 60 * 1000),
      createdAt: FIXED_NOW,
    });
    mockPrisma.auditTrail.create.mockResolvedValue({ id: "audit-1" });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────
  // Case 1: 409 NO_AUTHORITY_DATE
  // ─────────────────────────────────────────────────────────────────
  it("1. returns 409 NO_AUTHORITY_DATE when AUTHORITY_TOO_YOUNG is requested but grant date is null", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({ authorityGrantedDate: null }),
    );

    const req = makeReq({
      body: { reason: "Manual override attempt", checkCode: "AUTHORITY_TOO_YOUNG" },
    });
    const res = makeRes();

    await overrideBlock(req as any, res);

    expect(res._status).toBe(409);
    expect(res._body?.code).toBe("NO_AUTHORITY_DATE");
    expect(mockPrisma.complianceOverride.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditTrail.create).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────
  // Case 2: 409 HARD_FLOOR_NOT_OVERRIDABLE
  // ─────────────────────────────────────────────────────────────────
  it("2. returns 409 HARD_FLOOR_NOT_OVERRIDABLE when ageMonths < 12", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({ authorityGrantedDate: nMonthsAgo(6) }),
    );

    const req = makeReq({
      body: { reason: "Manual override attempt", checkCode: "AUTHORITY_TOO_YOUNG" },
    });
    const res = makeRes();

    await overrideBlock(req as any, res);

    expect(res._status).toBe(409);
    expect(res._body?.code).toBe("HARD_FLOOR_NOT_OVERRIDABLE");
    expect((res._body?.error as string).includes("6 months old")).toBe(true);
    expect(mockPrisma.complianceOverride.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditTrail.create).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────
  // Case 3: 409 OVERRIDE_NOT_NEEDED
  // ─────────────────────────────────────────────────────────────────
  it("3. returns 409 OVERRIDE_NOT_NEEDED when ageMonths >= 18", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({ authorityGrantedDate: nMonthsAgo(24) }),
    );

    const req = makeReq({
      body: { reason: "Manual override attempt", checkCode: "AUTHORITY_TOO_YOUNG" },
    });
    const res = makeRes();

    await overrideBlock(req as any, res);

    expect(res._status).toBe(409);
    expect(res._body?.code).toBe("OVERRIDE_NOT_NEEDED");
    expect((res._body?.error as string).includes("24 months old")).toBe(true);
    expect(mockPrisma.complianceOverride.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditTrail.create).not.toHaveBeenCalled();
  });

  // ─────────────────────────────────────────────────────────────────
  // Case 4: successful 12-18 mint with checkCode passed through
  // ─────────────────────────────────────────────────────────────────
  it("4. mints a scoped AUTHORITY_TOO_YOUNG override for a 15-month carrier and persists checkCode", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(
      makeCarrier({ authorityGrantedDate: nMonthsAgo(15) }),
    );

    const req = makeReq({
      body: { reason: "Known good carrier, prior business history", checkCode: "AUTHORITY_TOO_YOUNG" },
    });
    const res = makeRes();

    await overrideBlock(req as any, res);

    expect(res._status).toBe(200);
    expect(res._body?.override).toBeDefined();
    expect(mockPrisma.complianceOverride.create).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.complianceOverride.create.mock.calls[0][0];
    expect(createCall.data.checkCode).toBe("AUTHORITY_TOO_YOUNG");
    expect(createCall.data.reason).toBe("Known good carrier, prior business history");

    // Audit log captures the checkCode too.
    expect(mockPrisma.auditTrail.create).toHaveBeenCalledTimes(1);
    const auditCall = mockPrisma.auditTrail.create.mock.calls[0][0];
    expect(auditCall.data.changedFields.checkCode).toBe("AUTHORITY_TOO_YOUNG");
  });

  // ─────────────────────────────────────────────────────────────────
  // Case 5: backwards-compat — no checkCode = blanket mint (Sprint 40)
  // ─────────────────────────────────────────────────────────────────
  it("5. mints a blanket override (checkCode = null) when no checkCode is supplied", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(makeCarrier());

    const req = makeReq({
      body: { reason: "Legacy blanket override path, no scoping requested" },
    });
    const res = makeRes();

    await overrideBlock(req as any, res);

    expect(res._status).toBe(200);
    expect(mockPrisma.complianceOverride.create).toHaveBeenCalledTimes(1);
    const createCall = mockPrisma.complianceOverride.create.mock.calls[0][0];
    expect(createCall.data.checkCode).toBeNull();

    // Audit log records null too.
    const auditCall = mockPrisma.auditTrail.create.mock.calls[0][0];
    expect(auditCall.data.changedFields.checkCode).toBeNull();
  });
});
