/**
 * v3.8.aue — ACCOUNT_EXECUTIVE guard tests.
 *
 * The role resolves centrally in authorize() as (BROKER ∪ OPERATIONS) − DENY,
 * with DENY evaluated FIRST. These tests exercise the real middleware against
 * the ACTUAL authorize() role lists at each production call-site (each is cited
 * file:line below), so a gate list changing under us shows up here rather than
 * in production.
 *
 * Per §19 Sub-pattern 16: none of these assert that a string is PRESENT in a
 * source file. Every one drives the middleware and asserts what it DOES.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  authorize,
  normalizeRoutePath,
  matchAccountExecutiveDeny,
  AE_INHERITED_ROLES,
  ACCOUNT_EXECUTIVE_DENY,
} from "../../../src/middleware/auth";
import { login } from "../../../src/controllers/authController";
import { prisma } from "../../../src/config/database";
import bcrypt from "bcryptjs";

const mockPrisma = prisma as any;
const AE = "ACCOUNT_EXECUTIVE";

/** Drives the real authorize() middleware and reports what it did. */
function invoke(role: string, method: string, originalUrl: string, gate: string[]) {
  const req: any = {
    user: { id: "u-ae", email: "ae@srl.invalid", role },
    method,
    originalUrl,
    headers: {},
    ip: "127.0.0.1",
  };
  const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
  const next = vi.fn();
  authorize(...gate)(req, res, next);
  return {
    allowed: next.mock.calls.length === 1,
    status: res.status.mock.calls[0]?.[0] ?? null,
    body: res.json.mock.calls[0]?.[0] ?? null,
  };
}

beforeEach(() => {
  // Explicit reset — do NOT rely on clearAllMocks, which clears call history
  // but leaves mockResolvedValue in place, so a truthy user leaks into the
  // next test (the v3.8.alh leakage bug).
  mockPrisma.user.findFirst.mockReset();
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.user.findUnique.mockReset();
  mockPrisma.user.findUnique.mockResolvedValue(null);
  mockPrisma.user.update.mockReset();
  mockPrisma.user.update.mockResolvedValue({});
  mockPrisma.otpCode.updateMany.mockReset();
  mockPrisma.otpCode.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.otpCode.create.mockReset();
  mockPrisma.otpCode.create.mockResolvedValue({ id: "otp-1", code: "12345678" });
  mockPrisma.systemLog.create.mockReset();
  mockPrisma.systemLog.create.mockResolvedValue({});
});

// ─── DENY: money movement ────────────────────────────────────────────────────
describe("ACCOUNT_EXECUTIVE — money movement is denied", () => {
  // Each case: [label, method, url, the REAL production gate at that route]
  const cases: Array<[string, string, string, string[]]> = [
    // accounting.ts:86 — BROKER is on this gate, so only deny-first stops it.
    ["payments/prepare", "POST", "/api/accounting/payments/prepare", ["ADMIN", "CEO", "ACCOUNTING", "BROKER"]],
    // accounting.ts:90
    ["payments/:id/submit", "POST", "/api/accounting/payments/abc123/submit", ["ADMIN", "CEO", "ACCOUNTING", "BROKER"]],
    // accounting.ts:116
    ["fund/balance", "GET", "/api/accounting/fund/balance", ["ADMIN", "CEO", "ACCOUNTING", "BROKER"]],
    // accounting.ts:111
    ["credit", "GET", "/api/accounting/credit", ["ADMIN", "CEO", "ACCOUNTING", "BROKER"]],
    // loads.ts:123 / :140 — both verbs
    ["quickpay-override POST", "POST", "/api/loads/ld_1/quickpay-override", ["BROKER", "ADMIN", "CEO"]],
    ["quickpay-override GET", "GET", "/api/loads/ld_1/quickpay-override", ["BROKER", "ADMIN", "CEO", "DISPATCH"]],
    // carrierPay.ts:9 — file-level guard; these routes have no per-route gate.
    ["carrier-pay create", "POST", "/api/carrier-pay", ["ADMIN", "CEO", "ACCOUNTING", "BROKER"]],
    ["carrier-pay batch settle", "POST", "/api/carrier-pay/batch", ["ADMIN", "CEO", "ACCOUNTING", "BROKER"]],
    // invoices.ts:26 — factoring moves money; the rest of /invoices is allowed.
    ["invoice factoring", "POST", "/api/invoices/inv_1/factor", ["ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"]],
  ];

  for (const [label, method, url, gate] of cases) {
    it(`403s ${label}`, () => {
      const r = invoke(AE, method, url, gate);
      expect(r.allowed).toBe(false);
      expect(r.status).toBe(403);
    });
  }

  it("denies even when a call-site names ACCOUNT_EXECUTIVE explicitly (deny beats explicit grant)", () => {
    const r = invoke(AE, "POST", "/api/accounting/payments/prepare", ["ACCOUNT_EXECUTIVE"]);
    expect(r.allowed).toBe(false);
    expect(r.status).toBe(403);
  });
});

// ─── DENY: admin surfaces (defense-in-depth) ────────────────────────────────
describe("ACCOUNT_EXECUTIVE — admin surfaces are denied", () => {
  it("403s /api/admin/users (ADMIN-only gate, nothing to inherit)", () => {
    const r = invoke(AE, "GET", "/api/admin/users", ["ADMIN"]);
    expect(r.allowed).toBe(false);
    expect(r.status).toBe(403);
  });

  it("403s /api/admin even if BROKER were ever added to an admin route (drift guard)", () => {
    // This is the whole point of the redundant admin deny entries: simulate the
    // future drift where someone widens an admin gate to BROKER.
    const r = invoke(AE, "GET", "/api/admin/users", ["ADMIN", "BROKER"]);
    expect(r.allowed).toBe(false);
    expect(r.status).toBe(403);
  });

  it("403s /api/system-logs and /api/audit-trail under the same drift", () => {
    expect(invoke(AE, "GET", "/api/system-logs", ["ADMIN", "OPERATIONS"]).status).toBe(403);
    expect(invoke(AE, "GET", "/api/audit-trail", ["ADMIN", "BROKER"]).status).toBe(403);
  });
});

// ─── ALLOW: the granted operational surface ─────────────────────────────────
describe("ACCOUNT_EXECUTIVE — granted surfaces pass", () => {
  const cases: Array<[string, string, string, string[]]> = [
    // accounting.ts:128 — margin/P&L READ, inherited via BROKER.
    ["accounting/pnl/loads", "GET", "/api/accounting/pnl/loads", ["ADMIN", "CEO", "ACCOUNTING", "BROKER"]],
    // carriers.ts:277 — inherited via OPERATIONS, not BROKER.
    ["carrier full-vet", "POST", "/api/carriers/c_1/full-vet", ["ADMIN", "CEO", "OPERATIONS"]],
    // contractRates.ts:45 — inherited via BROKER.
    ["contract rates", "GET", "/api/contract-rates", ["ADMIN", "CEO", "BROKER"]],
    // invoices.ts:21 — invoicing allowed; only factoring is denied.
    ["invoice generate", "POST", "/api/invoices/generate/ld_1", ["ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"]],
    // accounting.ts:101
    ["file dispute", "POST", "/api/accounting/disputes", ["ADMIN", "CEO", "ACCOUNTING", "BROKER"]],
    // accounting.ts:67
    ["accounting dashboard", "GET", "/api/accounting/dashboard", ["ADMIN", "CEO", "ACCOUNTING", "BROKER"]],
  ];

  for (const [label, method, url, gate] of cases) {
    it(`allows ${label}`, () => {
      const r = invoke(AE, method, url, gate);
      expect(r.allowed).toBe(true);
      expect(r.status).toBeNull();
    });
  }

  it("inherits from BOTH BROKER and OPERATIONS, not just one", () => {
    expect(AE_INHERITED_ROLES).toEqual(["BROKER", "OPERATIONS"]);
    expect(invoke(AE, "GET", "/api/x", ["BROKER"]).allowed).toBe(true);
    expect(invoke(AE, "GET", "/api/x", ["OPERATIONS"]).allowed).toBe(true);
    // ...and inherits nothing from roles it was never granted.
    expect(invoke(AE, "GET", "/api/x", ["ACCOUNTING"]).allowed).toBe(false);
    expect(invoke(AE, "GET", "/api/x", ["DISPATCH"]).allowed).toBe(false);
    // The deprecated AE value is a different role and is NOT inherited.
    expect(invoke(AE, "GET", "/api/x", ["AE"]).allowed).toBe(false);
  });

  it("scopes the factoring deny to POST only, per the ratified ruling", () => {
    const gate = ["ADMIN", "CEO", "BROKER", "OPERATIONS", "ACCOUNTING"];
    expect(invoke(AE, "POST", "/api/invoices/inv_1/factor", gate).allowed).toBe(false);
    expect(invoke(AE, "GET", "/api/invoices/inv_1/factor", gate).allowed).toBe(true);
  });
});

// ─── Path normalization: the bypass class ───────────────────────────────────
describe("deny matching normalizes the path", () => {
  const gate = ["ADMIN", "CEO", "ACCOUNTING", "BROKER"];

  it("blocks the uppercase variant (Express routing is case-insensitive)", () => {
    expect(invoke(AE, "POST", "/API/ACCOUNTING/payments/prepare", gate).status).toBe(403);
    expect(invoke(AE, "POST", "/api/Accounting/Payments/Prepare", gate).status).toBe(403);
  });

  it("blocks the trailing-slash variant (Express is non-strict by default)", () => {
    expect(invoke(AE, "POST", "/api/accounting/payments/prepare/", gate).status).toBe(403);
    expect(invoke(AE, "GET", "/api/accounting/fund/", gate).status).toBe(403);
  });

  it("blocks duplicate-slash and query-string variants", () => {
    expect(invoke(AE, "POST", "/api//accounting//payments/prepare", gate).status).toBe(403);
    expect(invoke(AE, "POST", "/api/accounting/payments/prepare?force=1", gate).status).toBe(403);
  });

  it("normalizeRoutePath is total and never returns an empty string", () => {
    expect(normalizeRoutePath("/API/Foo/")).toBe("/api/foo");
    expect(normalizeRoutePath("/api/foo?a=1#b")).toBe("/api/foo");
    expect(normalizeRoutePath("/")).toBe("/");
    expect(normalizeRoutePath("")).toBe("/");
  });

  it("does not over-match a prefix that merely starts the same", () => {
    // /api/accounting/funding-notes is NOT /api/accounting/fund/*
    expect(matchAccountExecutiveDeny("GET", "/api/accounting/funding-notes")).toBeNull();
    // /api/carrier-pays is not /api/carrier-pay
    expect(matchAccountExecutiveDeny("GET", "/api/carrier-payx")).toBeNull();
    // ...but the exact resource and its children are matched.
    expect(matchAccountExecutiveDeny("GET", "/api/carrier-pay")).not.toBeNull();
    expect(matchAccountExecutiveDeny("GET", "/api/carrier-pay/summary")).not.toBeNull();
  });

  it("every deny pattern is lowercase, as normalization requires", () => {
    for (const rule of ACCOUNT_EXECUTIVE_DENY) {
      expect(rule.re.source).toBe(rule.re.source.toLowerCase());
    }
  });
});

// ─── Blast radius: other roles are untouched ────────────────────────────────
describe("the deny list applies to ACCOUNT_EXECUTIVE only", () => {
  const gate = ["ADMIN", "CEO", "ACCOUNTING", "BROKER"];

  it("BROKER still reaches payment preparation", () => {
    expect(invoke("BROKER", "POST", "/api/accounting/payments/prepare", gate).allowed).toBe(true);
  });

  it("ACCOUNTING still reaches the fund", () => {
    expect(invoke("ACCOUNTING", "GET", "/api/accounting/fund/balance", gate).allowed).toBe(true);
  });

  it("ADMIN still reaches the admin console", () => {
    expect(invoke("ADMIN", "GET", "/api/admin/users", ["ADMIN"]).allowed).toBe(true);
  });

  it("an unauthenticated request is still refused", () => {
    const req: any = { method: "GET", originalUrl: "/api/x", headers: {} };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };
    const next = vi.fn();
    authorize("ADMIN")(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});

// ─── The lockout: AE-portal login must succeed ──────────────────────────────
describe("ACCOUNT_EXECUTIVE can log into the AE portal", () => {
  it("is not rejected by the portal-boundary role gate", async () => {
    const hash = await bcrypt.hash("Password123!", 10);
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "user-ae",
      email: "ae@silkroutelogistics.ai",
      firstName: "Ops",
      role: AE,
      isActive: true,
      passwordHash: hash,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    const req: any = {
      body: { email: "ae@silkroutelogistics.ai", password: "Password123!", expectedRole: "AE" },
      headers: {},
      ip: "127.0.0.1",
    };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await login(req, res);

    // The precise failure this guards: AE_ROLES omitting the new role returns
    // 401 ROLE_MISMATCH and the account can never sign in, whatever authorize()
    // would have allowed.
    const bodies = res.json.mock.calls.map((c: any[]) => c[0]);
    expect(bodies.some((b: any) => b?.code === "ROLE_MISMATCH")).toBe(false);
    expect(res.status).not.toHaveBeenCalledWith(401);
  });

  it("a role genuinely outside the AE portal is still rejected", async () => {
    const hash = await bcrypt.hash("Password123!", 10);
    mockPrisma.user.findFirst.mockResolvedValue({
      id: "user-carrier",
      email: "c@srl.invalid",
      firstName: "C",
      role: "CARRIER",
      isActive: true,
      passwordHash: hash,
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    const req: any = {
      body: { email: "c@srl.invalid", password: "Password123!", expectedRole: "AE" },
      headers: {},
      ip: "127.0.0.1",
    };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    const bodies = res.json.mock.calls.map((c: any[]) => c[0]);
    expect(bodies.some((b: any) => b?.code === "ROLE_MISMATCH")).toBe(true);
  });
});
