import { describe, it, expect, vi, beforeEach } from "vitest";
import bcrypt from "bcryptjs";
import { prisma } from "../../../src/config/database";

// Mock email service before importing controller
vi.mock("../../../src/services/emailService", () => ({
  sendOtpEmail: vi.fn().mockResolvedValue(undefined),
  sendPasswordResetEmail: vi.fn().mockResolvedValue(undefined),
}));

import { register, login, handleVerifyOtp, handleResendOtp, changePassword } from "../../../src/controllers/authController";

const mockPrisma = vi.mocked(prisma);

function mockReqRes(body: Record<string, any> = {}, user?: any) {
  const req: any = {
    body,
    headers: { "x-forwarded-for": "127.0.0.1", "user-agent": "test" },
    ip: "127.0.0.1",
    user,
  };
  const res: any = {
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
  };
  return { req, res };
}

describe("authController", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("register", () => {
    it("creates a user and returns token on success", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({
        id: "user-1",
        email: "test@test.com",
        firstName: "John",
        lastName: "Doe",
        role: "BROKER",
      } as any);

      const { req, res } = mockReqRes({
        email: "test@test.com",
        password: "Password123!",
        firstName: "John",
        lastName: "Doe",
        role: "BROKER",
      });

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ email: "test@test.com" }),
          token: expect.any(String),
        }),
      );
    });

    it("returns 409 for duplicate email", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({ id: "existing" } as any);

      const { req, res } = mockReqRes({
        email: "test@test.com",
        password: "Password123!",
        firstName: "John",
        lastName: "Doe",
        role: "BROKER",
      });

      await register(req, res);

      expect(res.status).toHaveBeenCalledWith(409);
      expect(res.json).toHaveBeenCalledWith({ error: "Email already registered" });
    });
  });

  describe("login", () => {
    it("sends OTP for valid credentials", async () => {
      const hash = await bcrypt.hash("Password123!", 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@test.com",
        firstName: "John",
        passwordHash: hash,
      } as any);

      // Mock createOtp via prisma calls
      mockPrisma.otpCode.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.otpCode.create.mockResolvedValue({
        id: "otp-1",
        userId: "user-1",
        code: "123456",
        expiresAt: new Date(),
        used: false,
        createdAt: new Date(),
      });

      const { req, res } = mockReqRes({
        email: "test@test.com",
        password: "Password123!",
      });

      await login(req, res);

      expect(res.json).toHaveBeenCalledWith({
        pendingOtp: true,
        email: "test@test.com",
      });
    });

    it("returns 401 for bad credentials", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const { req, res } = mockReqRes({
        email: "test@test.com",
        password: "wrong",
      });

      await login(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid credentials" });
    });
  });

  describe("handleVerifyOtp", () => {
    it("returns 400 when email or code missing", async () => {
      const { req, res } = mockReqRes({ email: "test@test.com" });

      await handleVerifyOtp(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("returns token on valid OTP", async () => {
      const user = {
        id: "user-1",
        email: "test@test.com",
        firstName: "John",
        lastName: "Doe",
        role: "BROKER",
        passwordChangedAt: new Date(),
        createdAt: new Date(),
      };
      mockPrisma.user.findUnique.mockResolvedValue(user as any);
      // verifyOtp will call findFirst
      mockPrisma.otpCode.findFirst.mockResolvedValue({
        id: "otp-1",
        userId: "user-1",
        code: "123456",
        expiresAt: new Date(Date.now() + 60000),
        used: false,
        createdAt: new Date(),
      });
      mockPrisma.otpCode.update.mockResolvedValue({} as any);
      mockPrisma.auditLog.create.mockResolvedValue({} as any);

      const { req, res } = mockReqRes({ email: "test@test.com", code: "123456" });

      await handleVerifyOtp(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          user: expect.objectContaining({ id: "user-1" }),
          token: expect.any(String),
        }),
      );
    });

    it("returns passwordExpired for expired password", async () => {
      const oldDate = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // 90 days ago
      const user = {
        id: "user-1",
        email: "test@test.com",
        firstName: "John",
        lastName: "Doe",
        role: "BROKER",
        passwordChangedAt: oldDate,
        createdAt: oldDate,
      };
      mockPrisma.user.findUnique.mockResolvedValue(user as any);
      mockPrisma.otpCode.findFirst.mockResolvedValue({
        id: "otp-1",
        userId: "user-1",
        code: "123456",
        expiresAt: new Date(Date.now() + 60000),
        used: false,
        createdAt: new Date(),
      });
      mockPrisma.otpCode.update.mockResolvedValue({} as any);

      const { req, res } = mockReqRes({ email: "test@test.com", code: "123456" });

      await handleVerifyOtp(req, res);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          passwordExpired: true,
          tempToken: expect.any(String),
        }),
      );
    });

    it("returns 401 for invalid OTP code", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@test.com",
      } as any);
      mockPrisma.otpCode.findFirst.mockResolvedValue(null);

      const { req, res } = mockReqRes({ email: "test@test.com", code: "000000" });

      await handleVerifyOtp(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Invalid or expired code" });
    });
  });

  describe("handleResendOtp", () => {
    it("sends a new code on success", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@test.com",
        firstName: "John",
      } as any);
      // getLastOtpCreatedAt
      mockPrisma.otpCode.findFirst.mockResolvedValue({
        createdAt: new Date(Date.now() - 120000), // 2 min ago
      } as any);
      // createOtp
      mockPrisma.otpCode.updateMany.mockResolvedValue({ count: 0 });
      mockPrisma.otpCode.create.mockResolvedValue({
        id: "otp-2",
        userId: "user-1",
        code: "654321",
        expiresAt: new Date(),
        used: false,
        createdAt: new Date(),
      });

      const { req, res } = mockReqRes({ email: "test@test.com" });

      await handleResendOtp(req, res);

      expect(res.json).toHaveBeenCalledWith({ message: "Code sent" });
    });

    it("returns 429 when rate limited", async () => {
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "test@test.com",
        firstName: "John",
      } as any);
      mockPrisma.otpCode.findFirst.mockResolvedValue({
        createdAt: new Date(), // just now
      } as any);

      const { req, res } = mockReqRes({ email: "test@test.com" });

      await handleResendOtp(req, res);

      expect(res.status).toHaveBeenCalledWith(429);
    });

    it("returns generic message for unknown user", async () => {
      mockPrisma.user.findUnique.mockResolvedValue(null);

      const { req, res } = mockReqRes({ email: "unknown@test.com" });

      await handleResendOtp(req, res);

      expect(res.json).toHaveBeenCalledWith({
        message: "If an account exists, a new code has been sent",
      });
    });
  });

  describe("changePassword", () => {
    it("updates password on success", async () => {
      const hash = await bcrypt.hash("OldPassword123!", 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        passwordHash: hash,
      } as any);
      mockPrisma.user.update.mockResolvedValue({} as any);

      const { req, res } = mockReqRes(
        { currentPassword: "OldPassword123!", newPassword: "NewPassword456!" },
        { id: "user-1" },
      );

      await changePassword(req, res);

      expect(res.json).toHaveBeenCalledWith({ message: "Password updated successfully" });
    });

    it("returns 401 for wrong current password", async () => {
      const hash = await bcrypt.hash("CorrectPassword!", 10);
      mockPrisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        passwordHash: hash,
      } as any);

      const { req, res } = mockReqRes(
        { currentPassword: "WrongPassword!", newPassword: "NewPassword456!" },
        { id: "user-1" },
      );

      await changePassword(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({ error: "Current password is incorrect" });
    });
  });
});
