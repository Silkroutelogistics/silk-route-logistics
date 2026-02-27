import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { authorize } from "../../../src/middleware/auth";

const mockPrisma = vi.mocked(prisma);

function mockReqResNext(user?: any) {
  return {
    req: {
      user,
      method: "GET",
      originalUrl: "/api/test",
      headers: {},
      ip: "127.0.0.1",
    } as any,
    res: {
      status: vi.fn().mockReturnThis(),
      json: vi.fn().mockReturnThis(),
    } as any,
    next: vi.fn(),
  };
}

describe("authorize middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("allows access when user has an allowed role", () => {
    const middleware = authorize("ADMIN", "BROKER");
    const { req, res, next } = mockReqResNext({ id: "u1", role: "ADMIN", email: "admin@test.com" });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("returns 403 when user role is not in allowed list", () => {
    const middleware = authorize("ADMIN", "BROKER");
    const { req, res, next } = mockReqResNext({ id: "u2", role: "SHIPPER", email: "shipper@test.com" });

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Insufficient permissions" });
  });

  it("returns 403 when req.user is missing (not authenticated)", () => {
    const middleware = authorize("ADMIN");
    const { req, res, next } = mockReqResNext(undefined);

    middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: "Insufficient permissions" });
  });

  it("allows multiple roles — DISPATCH can access employee routes", () => {
    const middleware = authorize("ADMIN", "DISPATCH", "OPERATIONS", "BROKER");
    const { req, res, next } = mockReqResNext({ id: "u3", role: "DISPATCH", email: "dispatch@test.com" });

    middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });
});
