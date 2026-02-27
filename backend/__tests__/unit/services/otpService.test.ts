import { describe, it, expect, vi, beforeEach } from "vitest";
import { generateOtp, createOtp, verifyOtp, getLastOtpCreatedAt } from "../../../src/services/otpService";
import { prisma } from "../../../src/config/database";

const mockPrisma = vi.mocked(prisma);

describe("otpService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("generateOtp", () => {
    it("returns an 8-digit numeric string", () => {
      const otp = generateOtp();
      expect(otp).toMatch(/^\d{8}$/);
    });

    it("returns different values on subsequent calls", () => {
      const results = new Set(Array.from({ length: 10 }, () => generateOtp()));
      expect(results.size).toBeGreaterThan(1);
    });
  });

  describe("createOtp", () => {
    it("invalidates existing codes and creates a new one", async () => {
      mockPrisma.otpCode.updateMany.mockResolvedValue({ count: 1 });
      mockPrisma.otpCode.create.mockResolvedValue({
        id: "otp-1",
        userId: "user-1",
        code: "123456",
        expiresAt: new Date(),
        used: false,
        createdAt: new Date(),
      });

      const code = await createOtp("user-1");

      expect(code).toMatch(/^\d{8}$/);
      expect(mockPrisma.otpCode.updateMany).toHaveBeenCalledWith({
        where: { userId: "user-1", used: false },
        data: { used: true },
      });
      expect(mockPrisma.otpCode.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-1",
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });
  });

  describe("verifyOtp", () => {
    it("returns success for valid OTP", async () => {
      mockPrisma.otpCode.count.mockResolvedValue(0);
      mockPrisma.otpCode.findFirst.mockResolvedValue({
        id: "otp-1",
        userId: "user-1",
        code: "12345678",
        expiresAt: new Date(Date.now() + 60000),
        used: false,
        failedAttempts: 0,
        createdAt: new Date(),
      } as any);
      mockPrisma.otpCode.update.mockResolvedValue({} as any);

      const result = await verifyOtp("user-1", "12345678");

      expect(result.success).toBe(true);
    });

    it("returns failure for invalid OTP", async () => {
      mockPrisma.otpCode.count.mockResolvedValue(0);
      mockPrisma.otpCode.findFirst.mockResolvedValue(null);

      const result = await verifyOtp("user-1", "00000000");

      expect(result.success).toBe(false);
    });

    it("returns failure for expired OTP", async () => {
      mockPrisma.otpCode.count.mockResolvedValue(0);
      mockPrisma.otpCode.findFirst.mockResolvedValue(null);

      const result = await verifyOtp("user-1", "12345678");

      expect(result.success).toBe(false);
    });
  });

  describe("getLastOtpCreatedAt", () => {
    it("returns the createdAt of the last OTP", async () => {
      const date = new Date("2025-01-01");
      mockPrisma.otpCode.findFirst.mockResolvedValue({ createdAt: date } as any);

      const result = await getLastOtpCreatedAt("user-1");

      expect(result).toEqual(date);
    });

    it("returns null when no OTP exists", async () => {
      mockPrisma.otpCode.findFirst.mockResolvedValue(null);

      const result = await getLastOtpCreatedAt("user-1");

      expect(result).toBeNull();
    });
  });
});
