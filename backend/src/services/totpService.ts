import * as OTPAuth from "otpauth";
import * as QRCode from "qrcode";
import crypto from "crypto";
import { prisma } from "../config/database";
import { encrypt, decrypt } from "../utils/encryption";
import bcrypt from "bcryptjs";

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

  // v3.8.atm — backup codes are HASHED, not merely encrypted.
  //
  // They were AES-encrypted, which is reversible: anyone holding ENCRYPTION_KEY
  // could recover every code. That was defensible while TOTP was optional and a
  // backup code was a convenience. Under MANDATORY carrier 2FA a backup code is
  // a complete authentication factor — password-equivalent — and the bar for a
  // password is that the system itself cannot read it back.
  //
  // Hashed with bcrypt at the same cost factor as passwords. They are returned
  // in plaintext HERE, once, to be shown to the carrier, and are unrecoverable
  // afterwards. That is the point: losing them means using the admin unenroll
  // path, not asking someone to look them up.
  //
  // The encrypt() wrapper stays on the JSON envelope. It is now belt over
  // braces rather than the protection itself, and keeping it avoids changing
  // how this column is read and written everywhere else.
  const encryptedSecret = encrypt(secret);
  const hashedBackupCodes = await Promise.all(backupCodes.map((c) => bcrypt.hash(c, 12)));
  const encryptedBackupCodes = encrypt(JSON.stringify(hashedBackupCodes));

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

  // Check backup codes.
  if (user.totpBackupCodes) {
    try {
      const stored: string[] = JSON.parse(decrypt(user.totpBackupCodes));
      const candidate = code.toUpperCase();

      // Entries are bcrypt hashes (v3.8.atm). A legacy entry is a plaintext
      // code from before that change; it is matched directly so an existing
      // carrier is never locked out by the upgrade, and the whole set is
      // rewritten as hashes the moment one is used. bcrypt output always begins
      // "$2", which no generated code can, so the two are unambiguous.
      let index = -1;
      for (let i = 0; i < stored.length; i++) {
        const entry = stored[i];
        const matches = entry.startsWith("$2")
          ? await bcrypt.compare(candidate, entry)
          : entry.toUpperCase() === candidate;
        if (matches) { index = i; break; }
      }
      if (index === -1) return false;

      const remaining = stored.filter((_, i) => i !== index);
      // Re-hash any surviving legacy entries so the set converges on hashes.
      const rewritten = await Promise.all(
        remaining.map((e) => (e.startsWith("$2") ? Promise.resolve(e) : bcrypt.hash(e.toUpperCase(), 12))),
      );

      // COMPARE-AND-SWAP, not a blind write.
      //
      // The previous version read the list, spliced, and wrote it back. Two
      // requests presenting the SAME backup code concurrently would both read a
      // list containing it, both find it, and both succeed — a consume-once
      // credential consumed twice, which is exactly the case a backup code
      // exists to make impossible.
      //
      // The where clause pins the exact ciphertext that was read. If anything
      // else consumed a code in between, the stored value differs, the update
      // matches nothing, and this attempt loses rather than double-spending.
      const { count } = await prisma.user.updateMany({
        where: { id: userId, totpBackupCodes: user.totpBackupCodes },
        data: { totpBackupCodes: encrypt(JSON.stringify(rewritten)) },
      });
      if (count !== 1) return false;

      return true;
    } catch {
      // Unreadable backup-code payload: fail closed rather than fall through to
      // a success path.
      return false;
    }
  }

  return false;
}

/**
 * Issue a fresh set of backup codes, returning them in plaintext ONCE.
 *
 * WHY THIS EXISTS SEPARATELY FROM generateTotpSetup. Since v3.8.atl the stored
 * codes are bcrypt hashes, so they cannot be read back — which is the point, and
 * which means the only moment they can be shown is the moment they are created.
 *
 * The carrier enrollment flow needs that moment to be AFTER the authenticator is
 * proven working, not before. Codes handed out at setup time belong to a device
 * that may never have been successfully paired: the carrier walks away holding
 * recovery codes for a second factor they never armed, and the codes for the
 * factor they DID arm were never shown. So enrollment calls this at confirm,
 * once a valid code has proven the pairing, and whatever setup generated is
 * superseded here.
 *
 * generateTotpSetup keeps returning codes for the existing AE flow (routes/auth
 * shows them at setup), so this is additive rather than a change to that path.
 */
export async function issueBackupCodes(userId: string): Promise<string[]> {
  const codes: string[] = [];
  for (let i = 0; i < 8; i++) {
    codes.push(crypto.randomBytes(4).toString("hex").toUpperCase());
  }
  const hashed = await Promise.all(codes.map((c) => bcrypt.hash(c, 12)));
  await prisma.user.update({
    where: { id: userId },
    data: { totpBackupCodes: encrypt(JSON.stringify(hashed)) },
  });
  return codes;
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
