/**
 * The one place a rate-confirmation signing link is minted — Task E3
 * (ruling 3, 2026-09-21, docs/audits/carrier-front-lifecycle-audit.md §6).
 *
 * Two paths issue a signing link: the AE's send / re-send
 * (rateConfirmationController.sendRateConfirmation, which RESEND_RC on the
 * board calls) and, from E3, the carrier's own portal — "Sign it here" and
 * "Email me a new link". The ruling says the carrier path mints "through the
 * same function RESEND_RC uses", and this is that function. A second token
 * scheme is how two links to one document come to have different lifetimes.
 *
 * ROTATION IS REVOCATION. The row holds ONE token hash. Writing a fresh hash
 * is what kills the prior link — there is no separate revoke step to forget —
 * and `signTokenUsedAt` is cleared with it because it belonged to the token
 * that just died. The secret is returned to the caller ONCE and is never
 * persisted; only its sha256 is (lib/rcSignToken). Nothing here can hand back
 * a stored token, because nothing here can read one.
 *
 * THE CARRIER PATH IS RATE-LIMITED PER RC, and the audit row IS the counter.
 * Every carrier-side mint writes an audit_logs row (action
 * RC_SIGN_LINK_MINTED, entity RateConfirmation, entityId = rc.id); the limit
 * reads those rows back over the last hour. One source of truth, survives a
 * restart, per RC rather than per IP, and "audit-log every mint" is enforced
 * by construction rather than remembered.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "../config/database";
import { mintRcSignToken, rcSignUrl } from "../lib/rcSignToken";
import { rcSignSlaHours } from "../lib/tenderLifecycle";
import { sendEmail, wrap } from "./emailService";
import { log } from "../lib/logger";

export const RC_SIGN_LINK_MINT_ACTION = "RC_SIGN_LINK_MINTED";
/** Carrier-side mints per rate confirmation per rolling hour. */
export const RC_SIGN_LINK_MINTS_PER_HOUR = 3;

type Db = Prisma.TransactionClient | typeof prisma;

export interface RotatedSignLink {
  /** The secret. Goes in the redirect or the email; never stored, never logged. */
  token: string;
  tokenId: string;
  expiresAt: Date;
  /** Same-host path for a redirect: /api/rc-sign/<token>. */
  path: string;
  /** Absolute URL for an email. */
  url: string;
}

/**
 * Mint a fresh single-use signing token for a rate confirmation and store its
 * hash, superseding whatever link was live. Both issuing paths call this.
 */
export async function rotateRcSignToken(rcId: string, db: Db = prisma): Promise<RotatedSignLink> {
  const minted = mintRcSignToken();
  await db.rateConfirmation.update({
    where: { id: rcId },
    data: {
      signTokenId: minted.tokenId,
      signTokenHash: minted.tokenHash,
      signTokenExpiresAt: minted.expiresAt,
      signTokenUsedAt: null,
    },
  });
  return {
    token: minted.token,
    tokenId: minted.tokenId,
    expiresAt: minted.expiresAt,
    path: `/api/rc-sign/${minted.token}`,
    url: rcSignUrl(minted.token),
  };
}

/** How many carrier-side mints this RC has had in the last hour. */
export async function recentCarrierMints(rcId: string, db: Db = prisma): Promise<number> {
  return db.auditLog.count({
    where: {
      entity: "RateConfirmation",
      entityId: rcId,
      action: RC_SIGN_LINK_MINT_ACTION,
      createdAt: { gte: new Date(Date.now() - 3600_000) },
    },
  });
}

/**
 * The audit row, one per carrier-side mint. Awaited, not fire-and-forget: it
 * is also the rate limiter's counter, and a counter that might not have been
 * written is not a counter.
 */
export async function recordCarrierMint(input: {
  userId: string;
  rcId: string;
  loadId: string;
  tokenId: string;
  channel: "portal" | "email";
  ip?: string | null;
  userAgent?: string | null;
  sentTo?: string | null;
}, db: Db = prisma): Promise<void> {
  await db.auditLog.create({
    data: {
      userId: input.userId,
      action: RC_SIGN_LINK_MINT_ACTION,
      entity: "RateConfirmation",
      entityId: input.rcId,
      changes: input.channel === "email"
        ? `Carrier requested a new signing link by email`
        : `Carrier opened the signing page from the portal`,
      ipAddress: input.ip ?? null,
      userAgent: input.userAgent ?? null,
      // The token id, never the token. The id is what the certificate names.
      details: { channel: input.channel, signTokenId: input.tokenId, loadId: input.loadId, sentTo: input.sentTo ?? null },
    },
  });
}

/**
 * Where a carrier's paperwork goes: `contactEmail` first, the login email as
 * the fallback — the precedence the executed-copy send and the tender emails
 * use. The request body is never consulted; a link that signs a document for
 * this carrier goes only to an address this carrier put on file.
 */
export async function carrierEmailOnFile(userId: string, db: Db = prisma): Promise<string | null> {
  const u = await db.user.findUnique({
    where: { id: userId },
    select: { email: true, carrierProfile: { select: { contactEmail: true } } },
  });
  return u?.carrierProfile?.contactEmail || u?.email || null;
}

/** The "here is your new signing link" email. The document is not re-attached; it has not changed. */
export async function sendSignLinkEmail(to: string, loadRef: string, url: string): Promise<void> {
  const hours = rcSignSlaHours();
  const html = wrap(`
    <h2 style="color:#0A2540">Your signing link for load ${loadRef}</h2>
    <p>You asked for a new link to sign the rate confirmation for load <strong>${loadRef}</strong>. The rate confirmation itself has not changed; only the link is new.</p>
    <div style="text-align:center;margin:24px 0">
      <a href="${url}" style="display:inline-block;background:#BA7517;color:#FFFFFF;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px">Review and sign</a>
    </div>
    <p style="color:#6B7685;font-size:13px">This link signs the rate confirmation once and then stops working. It is good for ${hours} hours; any earlier link for this rate confirmation no longer works. If you did not request it, ignore this email.</p>
  `);
  await sendEmail(to, `Sign rate confirmation for load ${loadRef}`, html, undefined, { replyTo: "operations@silkroutelogistics.ai" });
  log.info({ loadRef }, "[RC] carrier-requested signing link sent");
}
