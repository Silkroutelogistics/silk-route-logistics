import { describe, it, expect, vi, beforeEach } from "vitest";
import jwt from "jsonwebtoken";
import { authenticate, authorize } from "../../../src/middleware/auth";
import { prisma } from "../../../src/config/database";
import { env } from "../../../src/config/env";

const mockPrisma = vi.mocked(prisma);

function mockReqRes(overrides: Record<string, any> = {}) {
  const req: any = {
    headers: {},
    ...overrides,
  };
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  const next = vi.fn();
  return { req, res, next };
}

describe("auth middleware", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("authenticate", () => {
    it("returns 401 when no authorization header", async () => {
      const { req, res, next } = mockReqRes();

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "No token provided" });
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 for invalid token", async () => {
      const { req, res, next } = mockReqRes({
        headers: { authorization: "Bearer invalid-token" },
      });

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid token" });
      expect(next).not.toHaveBeenCalled();
    });

    it("returns 401 when user not found", async () => {
      const token = jwt.sign({ userId: "nonexistent" }, env.JWT_SECRET);
      const { req, res, next } = mockReqRes({
        headers: { authorization: `Bearer ${token}` },
      });
      mockPrisma.user.findUnique.mockResolvedValue(null);

      await authenticate(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "User not found" });
      expect(next).not.toHaveBeenCalled();
    });

    it("sets req.user and calls next for valid token", async () => {
      const token = jwt.sign({ userId: "user-1" }, env.JWT_SECRET);
      const { req, res, next } = mockReqRes({
        headers: { authorization: `Bearer ${token}` },
      });
      const mockUser = { id: "user-1", email: "test@test.com", role: "ADMIN", isActive: true };
      mockPrisma.user.findUnique.mockResolvedValue(mockUser as any);

      // Arc 34 (2026-08-25) — a persisted staff_sessions row is now REQUIRED to
      // authenticate. Idle cannot be derived from a token, so the policy reads
      // `lastSeenAt` off a row and fails CLOSED when there is none; every real
      // login path writes one via registerSession.
      //
      // This mock is the fixture catching up to that requirement, not a
      // workaround for it. The distinction was settled by evidence rather than
      // argued: when this test first went red it had two readings — "the
      // fixture predates the row requirement" or "authentication is broken" —
      // and a proof harness (scripts/_arc34-proof-by-login.ts) drove real HTTP
      // through the real middleware on AE, CARRIER and SHIPPER and got 200 on
      // all three. The row was the only thing missing here.
      mockPrisma.staffSession.findUnique.mockResolvedValue({ lastSeenAt: new Date() } as any);

      await authenticate(req, res, next);

      expect(req.user).toEqual(expect.objectContaining({ id: "user-1", role: "ADMIN" }));
      expect(next).toHaveBeenCalled();
    });
  });

  describe("authorize", () => {
    it("returns 403 for wrong role", () => {
      const middleware = authorize("ADMIN");
      const { req, res, next } = mockReqRes();
      req.user = { id: "user-1", email: "test@test.com", role: "CARRIER" };

      middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({ error: "Insufficient permissions" });
      expect(next).not.toHaveBeenCalled();
    });

    it("calls next for correct role", () => {
      const middleware = authorize("ADMIN", "BROKER");
      const { req, res, next } = mockReqRes();
      req.user = { id: "user-1", email: "test@test.com", role: "ADMIN" };

      middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });
  });
});
