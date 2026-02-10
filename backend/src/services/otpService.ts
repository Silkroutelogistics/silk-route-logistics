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

export async function getLastOtpCreatedAt(userId: string): Promise<Date | null> {
  const last = await prisma.otpCode.findFirst({
    where: { userId },
    orderBy: { createdAt: "desc" },
    select: { createdAt: true },
  });
  return last?.createdAt || null;
}
