/**
 * The single-use link a carrier signs a rate confirmation through.
 *
 * WHY A RECORD RATHER THAN A JWT. The sibling magic link, tenderActionToken, is
 * a signed JWT because it only needs to prove who is asking. A signing token
 * needs three further things a JWT cannot give on its own: it must be usable
 * exactly once, it must be revocable the instant the RC is re-issued, and the
 * fact of its use must be part of the signature evidence. All three are row
 * state, so the row is the token — mirroring OnboardingInvite (Arc 33), where
 * revocation is an update rather than a blacklist entry.
 *
 * THE SECRET IS NEVER STORED. Only its sha256 reaches the database, so a
 * leaked row does not yield a working link. sha256 rather than bcrypt is
 * correct here and is the same reasoning as OtpCode: this is a 256-bit random
 * value, not a password, so there is no dictionary to slow an attacker down
 * against and the constant-time comparison below is what matters.
 */

import crypto from "crypto";
import { rcSignSlaHours } from "./tenderLifecycle";

const API_BASE = "https://api.silkroutelogistics.ai";

export interface MintedSignToken {
  /** The secret. Goes in the link and is never persisted. */
  token: string;
  /** Identity of this token. Safe to log, safe to show an AE. */
  tokenId: string;
  /** What the RC row stores. */
  tokenHash: string;
  expiresAt: Date;
}

export function hashRcSignToken(token: string): string {
  return crypto.createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Expiry is RC_SIGN_SLA_HOURS, the same constant Needs Attention chases an
 * unsigned RC on. One number: an AE is told the RC is overdue at the moment the
 * carrier's link stops working, rather than chasing a carrier whose link died
 * hours ago or holding a live link on an RC nobody is watching.
 */
export function mintRcSignToken(): MintedSignToken {
  const token = crypto.randomBytes(32).toString("hex");
  return {
    token,
    tokenId: crypto.randomUUID(),
    tokenHash: hashRcSignToken(token),
    expiresAt: new Date(Date.now() + rcSignSlaHours() * 3600_000),
  };
}

export function rcSignUrl(token: string): string {
  return `${API_BASE}/api/rc-sign/${token}`;
}

export type SignTokenVerdict =
  | { ok: true }
  | { ok: false; reason: "NOT_FOUND" | "ALREADY_USED" | "EXPIRED" };

/**
 * Is this row's token still good?
 *
 * Order is the design. ALREADY_USED outranks EXPIRED because a carrier who
 * already signed and clicks their old link must be told the signature landed,
 * not that they missed a deadline — the second reading sends them chasing an AE
 * over work that is done.
 */
export function checkSignToken(rc: {
  signTokenHash: string | null;
  signTokenUsedAt: Date | null;
  signTokenExpiresAt: Date | null;
}, now: Date = new Date()): SignTokenVerdict {
  if (!rc.signTokenHash) return { ok: false, reason: "NOT_FOUND" };
  if (rc.signTokenUsedAt) return { ok: false, reason: "ALREADY_USED" };
  if (!rc.signTokenExpiresAt || rc.signTokenExpiresAt.getTime() <= now.getTime()) {
    return { ok: false, reason: "EXPIRED" };
  }
  return { ok: true };
}

/**
 * sha256 of the issued PDF bytes.
 *
 * Over the STORED artifact, never a re-render. PDFKit output is not
 * reproducible — v3.8.awj got two different hashes for one agreement at
 * identical byte length — which is why CarrierAgreement hashes canonical text
 * instead. The RC can hash bytes precisely because the bytes are frozen at
 * issuance and served back rather than regenerated, so the hash re-verifies by
 * construction. Re-render the RC and this number is meaningless; store it and
 * it is proof.
 */
export function hashPdfBytes(buf: Buffer): string {
  return crypto.createHash("sha256").update(buf).digest("hex");
}
