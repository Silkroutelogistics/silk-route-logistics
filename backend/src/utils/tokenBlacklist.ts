import crypto from "crypto";
import { prisma } from "../config/database";

/**
 * Token Blacklist — Revokes JWTs on logout
 * Uses SHA-256 hash of the token (never stores raw tokens)
 */

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export async function blacklistToken(token: string, userId: string, reason = "logout"): Promise<void> {
  const tokenHash = hashToken(token);
  // Set expiry to match JWT max lifetime (24h from now as safety margin)
  const expiresAt = new Date(Date.now() + 25 * 60 * 60 * 1000);

  await prisma.tokenBlacklist.upsert({
    where: { tokenHash },
    create: { tokenHash, userId, expiresAt, reason },
    update: { reason },
  });
}

export async function isTokenBlacklisted(token: string): Promise<boolean> {
  const tokenHash = hashToken(token);
  const entry = await prisma.tokenBlacklist.findUnique({
    where: { tokenHash },
  });
  if (!entry) return false;
  // v3.8.amz (review fix) — respect the entry's own expiry. A blacklist row
  // past expiresAt is stale (the JWT it revoked has itself expired); the
  // daily cleanup cron may not have purged it yet. Treat as not-blacklisted
  // so the row's lifetime, not the cron cadence, bounds revocation.
  if (entry.expiresAt <= new Date()) return false;
  return true;
}

/**
 * Cleanup expired blacklist entries (run periodically)
 * Entries past their expiresAt are no longer needed since the token itself has expired
 */
export async function cleanupBlacklist(): Promise<number> {
  const result = await prisma.tokenBlacklist.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return result.count;
}
