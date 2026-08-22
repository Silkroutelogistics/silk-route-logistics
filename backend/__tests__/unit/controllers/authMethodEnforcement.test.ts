/**
 * authMethod enforcement + staff reset refusal.
 *
 * Paired with the enforcement in the same commit: a gate that ships untested is
 * a gate nobody can prove fires. Every case drives the real controller.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { login, forgotPassword } from "../../../src/controllers/authController";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;

const PW = "Password123!x";
let hash: string;

function res() {
  return { status: vi.fn().mockReturnThis(), json: vi.fn() } as any;
}
function req(body: any) {
  return { body, headers: { "user-agent": "vitest" }, ip: "127.0.0.1" } as any;
}
const bodies = (r: any) => r.json.mock.calls.map((c: any[]) => c[0]);

function userRow(over: Record<string, unknown> = {}) {
  return {
    id: "u-1",
    email: "staff@silkroutelogistics.ai",
    firstName: "S",
    lastName: "T",
    role: "ADMIN",
    isActive: true,
    passwordHash: hash,
    failedLoginAttempts: 0,
    lockedUntil: null,
    authMethod: "PASSWORD",
    ...over,
  };
}

beforeEach(async () => {
  if (!hash) hash = await bcrypt.hash(PW, 10);
  // Explicit reset — clearAllMocks clears call history but leaves
  // mockResolvedValue in place, so a row leaks into the next test.
  mockPrisma.user.findFirst.mockReset();
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.user.update.mockReset();
  mockPrisma.user.update.mockResolvedValue({});
  mockPrisma.otpCode.updateMany.mockReset();
  mockPrisma.otpCode.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.otpCode.create.mockReset();
  mockPrisma.otpCode.create.mockResolvedValue({ id: "o1", code: "12345678" });
  mockPrisma.systemLog.create.mockReset();
  mockPrisma.systemLog.create.mockResolvedValue({});
  if (mockPrisma.authEvent) {
    mockPrisma.authEvent.create.mockReset();
    mockPrisma.authEvent.create.mockResolvedValue({});
  }
});

describe("SSO_ONLY refuses password login", () => {
  it("401s with code SSO_ONLY and never reaches the OTP step", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(userRow({ authMethod: "SSO_ONLY" }));
    const r = res();
    await login(req({ email: "staff@silkroutelogistics.ai", password: PW, expectedRole: "AE" }), r);

    expect(r.status).toHaveBeenCalledWith(401);
    expect(bodies(r).some((b: any) => b?.code === "SSO_ONLY")).toBe(true);
    // Refused before any OTP was minted — proves the gate sits ahead of the
    // credential/OTP path rather than after it.
    expect(mockPrisma.otpCode.create).not.toHaveBeenCalled();
  });

  it("refuses even when the password is correct (not a credential failure)", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(userRow({ authMethod: "SSO_ONLY" }));
    const r = res();
    await login(req({ email: "staff@silkroutelogistics.ai", password: PW }), r);
    expect(bodies(r).some((b: any) => b?.code === "SSO_ONLY")).toBe(true);
  });

  it("refuses a WRONG password with the same SSO_ONLY code — no password oracle", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(userRow({ authMethod: "SSO_ONLY" }));
    const r = res();
    await login(req({ email: "staff@silkroutelogistics.ai", password: "totally-wrong" }), r);
    // Same response whether or not the password was right: the gate runs before
    // the hash comparison, so this cannot be used to test passwords.
    expect(bodies(r).some((b: any) => b?.code === "SSO_ONLY")).toBe(true);
  });
});

describe("PASSWORD and HYBRID are unaffected", () => {
  for (const authMethod of ["PASSWORD", "HYBRID"]) {
    it(`${authMethod} still reaches the OTP step`, async () => {
      mockPrisma.user.findFirst.mockResolvedValue(userRow({ authMethod }));
      const r = res();
      await login(req({ email: "staff@silkroutelogistics.ai", password: PW, expectedRole: "AE" }), r);

      expect(bodies(r).some((b: any) => b?.code === "SSO_ONLY")).toBe(false);
      // The break-glass property: an OTP was actually minted, so the password
      // path is genuinely still open — not merely "not refused".
      expect(mockPrisma.otpCode.create).toHaveBeenCalled();
    });
  }

  it("HYBRID with a wrong password still fails as a credential error, not SSO_ONLY", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(userRow({ authMethod: "HYBRID" }));
    const r = res();
    await login(req({ email: "staff@silkroutelogistics.ai", password: "wrong" }), r);
    expect(bodies(r).some((b: any) => b?.code === "SSO_ONLY")).toBe(false);
    expect(r.status).toHaveBeenCalledWith(401);
  });
});

describe("reset-token refusal for staff roles", () => {
  const GENERIC = "If an account with that email exists, a password reset link has been sent.";

  for (const role of ["ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING", "ACCOUNT_EXECUTIVE"]) {
    it(`refuses ${role} without minting a reset token`, async () => {
      mockPrisma.user.findFirst.mockResolvedValue(userRow({ role }));
      const r = res();
      await forgotPassword(req({ email: "staff@silkroutelogistics.ai" }), r);

      // No RESET: token row was created.
      expect(mockPrisma.otpCode.create).not.toHaveBeenCalled();
      // And the response is the ordinary generic one.
      expect(bodies(r)).toContainEqual({ message: GENERIC });
    });
  }

  for (const role of ["CARRIER", "SHIPPER", "FACTOR"]) {
    it(`${role} keeps self-service reset`, async () => {
      mockPrisma.user.findFirst.mockResolvedValue(userRow({ role }));
      const r = res();
      await forgotPassword(req({ email: "carrier@example.com" }), r);

      // A token WAS minted for a portal role — proves the refusal is scoped to
      // staff rather than switching reset off for everyone.
      expect(mockPrisma.otpCode.create).toHaveBeenCalled();
    });
  }

  it("staff refusal is byte-identical to the unknown-email response — no enumeration oracle", async () => {
    mockPrisma.user.findFirst.mockResolvedValue(userRow({ role: "ADMIN" }));
    const staffRes = res();
    await forgotPassword(req({ email: "staff@silkroutelogistics.ai" }), staffRes);

    mockPrisma.user.findFirst.mockResolvedValue(null);
    const unknownRes = res();
    await forgotPassword(req({ email: "nobody@example.com" }), unknownRes);

    // This is the assertion that matters: the first draft of the refusal used a
    // slightly different sentence, which by itself would have told an attacker
    // which addresses are staff.
    expect(bodies(staffRes)).toEqual(bodies(unknownRes));
  });
});
