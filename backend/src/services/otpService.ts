import crypto from "crypto";
import { prisma } from "../config/database";

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_VERIFY_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes after max attempts
const RESEND_COOLDOWN_MS = 60 * 1000; // 60 seconds between resends

export function generateOtp(): string {
  // 8-digit OTP (100 million combinations) for brute-force resistance
  return crypto.randomInt(10000000, 99999999).toString();
}

export async function createOtp(userId: string): Promise<string> {
  // Mark all existing unused codes as used
  await prisma.otpCode.updateMany({
    where: { userId, used: false },
    data: { used: true },
  });

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + OTP_EXPIRY_MS);

  await prisma.otpCode.create({
    data: { userId, code, expiresAt },
  });

  return code;
}

export async function verifyOtp(userId: string, code: string): Promise<{ success: boolean; locked?: boolean; attemptsRemaining?: number }> {
  // Check if user is currently locked out from too many failed attempts
  const recentFailures = await prisma.otpCode.count({
    where: {
      userId,
      used: false,
      failedAttempts: { gte: MAX_VERIFY_ATTEMPTS },
      createdAt: { gte: new Date(Date.now() - LOCKOUT_DURATION_MS) },
    },
  });

  if (recentFailures > 0) {
    return { success: false, locked: true, attemptsRemaining: 0 };
  }

  const otp = await prisma.otpCode.findFirst({
    where: {
      userId,
      used: false,
      expiresAt: { gt: new Date() },
      code: { not: { startsWith: "RESET:" } },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) return { success: false, attemptsRemaining: 0 };

  // Check if this specific OTP has too many failed attempts
  if ((otp.failedAttempts || 0) >= MAX_VERIFY_ATTEMPTS) {
    return { success: false, locked: true, attemptsRemaining: 0 };
  }

  if (otp.code !== code) {
    // Increment failed attempts using constant-time comparison awareness
    const newAttempts = (otp.failedAttempts || 0) + 1;
    await prisma.otpCode.update({
      where: { id: otp.id },
      data: { failedAttempts: newAttempts },
    });

    const remaining = MAX_VERIFY_ATTEMPTS - newAttempts;

    // Log failed attempt for security monitoring
    await prisma.systemLog.create({
      data: {
        logType: "SECURITY",
        severity: remaining <= 1 ? "ERROR" : "WARNING",
        source: "otpService",
        message: `Failed OTP verification for user ${userId} (${remaining} attempts remaining)`,
      },
    }).catch(() => {});

    return { success: false, attemptsRemaining: Math.max(0, remaining) };
  }

  // Success — mark as used
  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { used: true },
  });

  return { success: true };
}

export async function createPasswordResetToken(userId: string): Promise<string> {
  // Invalidate existing unused reset tokens for this user
  await prisma.otpCode.updateMany({
    where: { userId, used: false, code: { startsWith: "RESET:" } },
    data: { used: true },
  });

  const token = crypto.randomBytes(32).toString("hex"); // 64-char hex
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes

  await prisma.otpCode.create({
    data: { userId, code: `RESET:${token}`, expiresAt },
  });

  return token;
}

export async function verifyPasswordResetToken(token: string): Promise<string | null> {
  const otp = await prisma.otpCode.findFirst({
    where: {
      code: `RESET:${token}`,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) return null;

  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { used: true },
  });

  return otp.userId;
}

export async function getLastOtpCreatedAt(userId: string): Promise<Date | null> {
  const last = await prisma.otpCode.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return last?.createdAt || null;
}
