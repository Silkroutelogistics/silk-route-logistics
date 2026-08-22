/**
 * v3.8.auf — public self-registration role allowlist.
 *
 * POST /api/auth/register is UNAUTHENTICATED and authController.register
 * spreads the validated body straight into prisma.user.create with no second
 * role check, so registerSchema is the ONLY thing deciding what role a
 * stranger can mint. These tests hold that line.
 *
 * Both layers are exercised: the schema (what is accepted) and the controller
 * (that a rejected role mints no row). A schema test alone would not prove the
 * absence of a bypass in the controller.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { registerSchema, PUBLIC_REGISTERABLE_ROLES } from "../../../src/validators/auth";
import { register } from "../../../src/controllers/authController";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;

const body = (role: string) => ({
  email: "stranger@example.com",
  password: "Password123!x",
  firstName: "A",
  lastName: "B",
  role,
});

beforeEach(() => {
  // Explicit reset — clearAllMocks clears call history but leaves
  // mockResolvedValue in place, so a truthy user leaks into the next test
  // (the v3.8.alh leakage bug).
  mockPrisma.user.findFirst.mockReset();
  mockPrisma.user.findFirst.mockResolvedValue(null);
  mockPrisma.user.create.mockReset();
  mockPrisma.user.create.mockResolvedValue(null);
  mockPrisma.customer.findFirst.mockReset();
  mockPrisma.customer.findFirst.mockResolvedValue(null);
  mockPrisma.customer.create.mockReset();
  mockPrisma.customer.create.mockResolvedValue(null);
  mockPrisma.systemLog.create.mockReset();
  mockPrisma.systemLog.create.mockResolvedValue({});
});

describe("public registration role allowlist — staff roles rejected", () => {
  // Every role that must never be self-assignable from the open internet.
  const forbidden = [
    "BROKER", // the live hole this closes: BROKER is in AE_ROLES and reaches ~278 gates
    "ACCOUNT_EXECUTIVE",
    "AE",
    "ADMIN",
    "CEO",
    "DISPATCH",
    "OPERATIONS",
    "ACCOUNTING",
    "READONLY",
  ];

  for (const role of forbidden) {
    it(`rejects role ${role}`, () => {
      const r = registerSchema.safeParse(body(role));
      expect(r.success).toBe(false);
    });
  }

  it("BROKER is not in the allowlist", () => {
    expect(PUBLIC_REGISTERABLE_ROLES).not.toContain("BROKER");
  });

  it("ACCOUNT_EXECUTIVE is not in the allowlist", () => {
    expect(PUBLIC_REGISTERABLE_ROLES).not.toContain("ACCOUNT_EXECUTIVE");
  });

  it("the allowlist is exactly the three self-service roles", () => {
    expect([...PUBLIC_REGISTERABLE_ROLES].sort()).toEqual(["CARRIER", "FACTOR", "SHIPPER"]);
  });
});

describe("public registration role allowlist — self-service roles accepted", () => {
  for (const role of ["CARRIER", "SHIPPER", "FACTOR"]) {
    it(`accepts role ${role}`, () => {
      const r = registerSchema.safeParse(body(role));
      expect(r.success).toBe(true);
    });
  }
});

describe("the controller mints no row for a rejected role", () => {
  it("does not call prisma.user.create when role is BROKER", async () => {
    const req: any = { body: body("BROKER"), headers: {}, ip: "127.0.0.1" };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    // registerSchema.parse throws on a rejected role; in production
    // validateBody rejects it with 400 before the controller is reached.
    // Either way the contract under test is that NO user row is created.
    await register(req, res).catch(() => {});

    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("does not call prisma.user.create when role is ACCOUNT_EXECUTIVE", async () => {
    const req: any = { body: body("ACCOUNT_EXECUTIVE"), headers: {}, ip: "127.0.0.1" };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await register(req, res).catch(() => {});

    expect(mockPrisma.user.create).not.toHaveBeenCalled();
  });

  it("does reach prisma.user.create for an allowed role (proves the test is not vacuous)", async () => {
    mockPrisma.user.create.mockResolvedValue({
      id: "u1",
      email: "stranger@example.com",
      firstName: "A",
      lastName: "B",
      role: "CARRIER",
      company: null,
    });

    const req: any = { body: body("CARRIER"), headers: {}, ip: "127.0.0.1" };
    const res: any = { status: vi.fn().mockReturnThis(), json: vi.fn() };

    await register(req, res).catch(() => {});

    expect(mockPrisma.user.create).toHaveBeenCalled();
  });
});
