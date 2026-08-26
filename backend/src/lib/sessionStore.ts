/**
 * ARC 34 — the one place a session row is created, touched, revoked or swept.
 *
 * WHY ONE MODULE. Before this, sessions were governed four different ways: SSO
 * wrote a row, staff-password deliberately wrote none, carrier and shipper had
 * an in-memory Map, and the driver portal had nothing at all. Four mechanisms
 * meant four answers to "is this session still valid", and three of them reset
 * on every deploy because a Map lives in the process.
 *
 * ONE CREATION PATTERN, FIVE CALL SITES. Every login path calls createSession.
 * The SSO path's existing upsert was extended rather than duplicated — a second
 * writer for the same row is how two writers end up disagreeing about the
 * shape.
 *
 * THE TABLE NAME IS HISTORICAL. `StaffSession` now holds carrier, shipper and
 * driver sessions too. Renaming it would read better and would conflict with
 * the concurrent session's commits; `portal` carries the meaning instead.
 *
 * DRIVERS ARE NOT USERS. `userId` holds a Driver.id when portal is DRIVER —
 * there is no FK, and §13.3 Item 193 T2 is why drivers have no User row.
 */

import crypto from "crypto";
import { prisma } from "../config/database";
import { log } from "./logger";
import { SESSION_ABSOLUTE_MS, SESSION_IDLE_MS } from "./sessionPolicy";

export type SessionPortalName = "AE" | "CARRIER" | "SHIPPER" | "DRIVER";

/**
 * MUST match middleware/auth.ts getTokenHash EXACTLY, including the truncation.
 *
 * The first version of this returned the full 64-char digest while the
 * middleware looks up by the first 32. Every row would have been written under
 * a key the reader could never find, so every session would have failed closed
 * — a total lockout across all four portals, produced by a comment I wrote
 * justifying the duplication ("to keep this module free of a middleware
 * dependency"). The other session's test caught it, which is the argument for
 * never deleting another session's tests to make your own change pass.
 *
 * Still duplicated rather than imported, because middleware/auth imports THIS
 * module and the cycle would be worse. sessionHashParity.test.ts pins them
 * equal, so the duplication cannot drift again.
 */
export function sessionTokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex").slice(0, 32);
}

/**
 * Record a freshly minted session.
 *
 * Upsert, not create: a repeated callback or a re-login on the same token must
 * not collide on the unique tokenHash. Fire-and-forget at the call sites —
 * a failure here must never block a login that has already succeeded, and the
 * fail-closed policy means a missing row costs the user a re-auth rather than
 * granting them an unbounded session.
 */
export async function createSession(args: {
  token: string;
  userId: string;
  portal: SessionPortalName;
  rememberMe?: boolean;
}): Promise<void> {
  const tokenHash = sessionTokenHash(args.token);
  const now = new Date();
  await prisma.staffSession.upsert({
    where: { tokenHash },
    create: {
      tokenHash,
      userId: args.userId,
      portal: args.portal,
      rememberMe: args.rememberMe === true,
      lastSeenAt: now,
    },
    update: {
      userId: args.userId,
      portal: args.portal,
      // rememberMe is DELIBERATELY absent from the update: only a writer that
      // actually knows the answer should ever change it, and this function is
      // never told. Belt-and-braces — the SSO path now opts out of the
      // registerSession persist entirely (see persistSession below), so there
      // is no second writer on that row today.
      lastSeenAt: now,
    },
  });
}

/** Idle clock. Throttled by the caller via the policy's shouldTouch. */
export async function touchSession(tokenHash: string): Promise<void> {
  await prisma.staffSession
    .update({ where: { tokenHash }, data: { lastSeenAt: new Date() } })
    .catch(() => {
      // The row was swept or revoked between the read and this write. The next
      // request fails closed, which is the correct outcome, so this is not an
      // error worth surfacing.
    });
}

export async function revokeSession(tokenHash: string): Promise<void> {
  await prisma.staffSession.delete({ where: { tokenHash } }).catch(() => {});
}

/**
 * One-time rollout sweep plus the recurring cleanup, same function.
 *
 * Anything older than the absolute cap cannot be valid under any policy, so
 * deleting it is not a judgement call. Rows idle past the idle window are also
 * dead — keeping them would leave the table growing with sessions that can
 * only ever be refused.
 */
export async function sweepExpiredSessions(now = Date.now()): Promise<{ absolute: number; idle: number }> {
  const absoluteCutoff = new Date(now - SESSION_ABSOLUTE_MS);
  const idleCutoff = new Date(now - SESSION_IDLE_MS);

  const absolute = await prisma.staffSession.deleteMany({ where: { issuedAt: { lt: absoluteCutoff } } });
  const idle = await prisma.staffSession.deleteMany({ where: { lastSeenAt: { lt: idleCutoff } } });

  if (absolute.count || idle.count) {
    log.info(
      { absolute: absolute.count, idle: idle.count },
      "[Session] swept expired sessions",
    );
  }
  return { absolute: absolute.count, idle: idle.count };
}
