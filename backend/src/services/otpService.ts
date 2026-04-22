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

/**
 * Peek at a password reset token without consuming it.
 *
 * v3.7.m refactor: the previous `verifyPasswordResetToken`
 * atomically validated AND consumed the token, which caused
 * the reset flow to burn the token on the first POST even
 * when validation later rejected the request (missing TOTP,
 * email mismatch, etc.). Callers should peek first, validate
 * all other requirements, then call `consumePasswordResetToken`
 * inside the same `$transaction` as the password update.
 *
 * Returns `{ userId, otpId }` on a valid, unexpired, unused
 * token row. Returns `null` otherwise. Never mutates.
 */
export async function peekPasswordResetToken(
  token: string,
): Promise<{ userId: string; otpId: string } | null> {
  const otp = await prisma.otpCode.findFirst({
    where: {
      code: `RESET:${token}`,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) return null;
  return { userId: otp.userId, otpId: otp.id };
}

/**
 * Mark a password reset token as consumed.
 *
 * Intended to be called inside the same `prisma.$transaction`
 * that writes the new password hash so both succeed or both
 * roll back atomically. Callers using `$transaction([...])`
 * batched form can inline `prisma.otpCode.update({ where: {
 * id: otpId }, data: { used: true } })` instead — this helper
 * exists for symmetry with `peekPasswordResetToken` and for
 * direct non-transactional use (e.g. admin force-invalidate).
 */
export async function consumePasswordResetToken(
  otpId: string,
): Promise<void> {
  await prisma.otpCode.update({
    where: { id: otpId },
    data: { used: true },
  });
}

export async function getLastOtpCreatedAt(userId: string): Promise<Date | null> {
  const last = await prisma.otpCode.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return last?.createdAt || null;
}
