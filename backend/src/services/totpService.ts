import * as OTPAuth from "otpauth";
import * as QRCode from "qrcode";
import crypto from "crypto";
import { prisma } from "../config/database";
import { encrypt, decrypt } from "../utils/encryption";

const ISSUER = "Silk Route Logistics";

/**
 * Generate a new TOTP secret and QR code for setup
 */
export async function generateTotpSetup(userId: string, email: string) {
  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    label: email,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
  });

  const secret = totp.secret.base32;
  const uri = totp.toString();
  const qrCodeDataUrl = await QRCode.toDataURL(uri);

  // Generate 8 backup codes
  const backupCodes: string[] = [];
  for (let i = 0; i < 8; i++) {
    backupCodes.push(crypto.randomBytes(4).toString("hex").toUpperCase());
  }

  // Store encrypted secret and backup codes (not yet enabled)
  const encryptedSecret = encrypt(secret);
  const encryptedBackupCodes = encrypt(JSON.stringify(backupCodes));

  await prisma.user.update({
    where: { id: userId },
    data: {
      totpSecret: encryptedSecret,
      totpBackupCodes: encryptedBackupCodes,
      // totpEnabled stays false until verified
    },
  });

  return { qrCodeDataUrl, secret, backupCodes };
}

/**
 * Verify a TOTP code and enable 2FA if this is the setup verification
 */
export async function verifyTotpCode(userId: string, code: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpSecret: true, totpEnabled: true, totpBackupCodes: true },
  });

  if (!user?.totpSecret) return false;

  const secret = decrypt(user.totpSecret);

  const totp = new OTPAuth.TOTP({
    issuer: ISSUER,
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });

  // Check TOTP code (allow 1 period of drift)
  const delta = totp.validate({ token: code, window: 1 });
  if (delta !== null) return true;

  // Check backup codes
  if (user.totpBackupCodes) {
    try {
      const backupCodes: string[] = JSON.parse(decrypt(user.totpBackupCodes));
      const upperCode = code.toUpperCase();
      const index = backupCodes.indexOf(upperCode);
      if (index !== -1) {
        // Remove used backup code
        backupCodes.splice(index, 1);
        await prisma.user.update({
          where: { id: userId },
          data: { totpBackupCodes: encrypt(JSON.stringify(backupCodes)) },
        });
        return true;
      }
    } catch {
      // Invalid backup codes format
    }
  }

  return false;
}

/**
 * Enable TOTP after successful setup verification
 */
export async function enableTotp(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: true },
  });
}

/**
 * Disable TOTP
 */
export async function disableTotp(userId: string): Promise<void> {
  await prisma.user.update({
    where: { id: userId },
    data: { totpEnabled: false, totpSecret: null, totpBackupCodes: null },
  });
}

/**
 * Check if user has TOTP enabled
 */
export async function isTotpEnabled(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { totpEnabled: true },
  });
  return user?.totpEnabled ?? false;
}
