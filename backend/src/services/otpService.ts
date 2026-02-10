import crypto from "crypto";
import { prisma } from "../config/database";

export function generateOtp(): string {
  return crypto.randomInt(100000, 999999).toString();
}

export async function createOtp(userId: string): Promise<string> {
  // Mark all existing unused codes as used
  await prisma.otpCode.updateMany({
    where: { userId, used: false },
    data: { used: true },
  });

  const code = generateOtp();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

  await prisma.otpCode.create({
    data: { userId, code, expiresAt },
  });

  return code;
}

export async function verifyOtp(userId: string, code: string): Promise<boolean> {
  const otp = await prisma.otpCode.findFirst({
    where: {
      userId,
      code,
      used: false,
      expiresAt: { gt: new Date() },
    },
    orderBy: { createdAt: "desc" },
  });

  if (!otp) return false;

  await prisma.otpCode.update({
    where: { id: otp.id },
    data: { used: true },
  });

  return true;
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
