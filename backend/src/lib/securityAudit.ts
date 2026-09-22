/**
 * B2 (2026-09-17) — MFA events reach the Audit Log.
 *
 * Enrolling an authenticator, failing its challenge, and having it reset are
 * the security events an AE most needs to see and were recorded nowhere the
 * Audit Log page reads: the carrier enrollment path called logAuthEvent with
 * no email, so auth_events never got a row, and the global audit middleware
 * only sees /carrier-auth as CREATE/CARRIER_AUTH. This writes audit_logs rows
 * under entity "Security", which is the table that page reads. The Action and
 * Entity filters there are built from distinct values, so the new actions and
 * the new entity appear the first time a row is written.
 *
 * MFA_CHALLENGE_SUCCESS is deliberately NOT an action here: a passed
 * authenticator challenge at login IS the LOGIN row, and it carries
 * details.mfaUsed = true (B3a). A second row per login would be noise.
 * MFA_RESET has one writer, the admin unenroll (B1c); self-service disable is
 * refused for carriers (B1b) and out of this recorder's scope for other roles.
 *
 * RC_SIGN_REFUSED (BCA Commit 2, 2026-09-21) — a rate-confirmation signature
 * refused because the carrier on the load holds no executed Broker-Carrier
 * Agreement, or a terminated one. Written by routes/rcSign.ts with the carrier
 * as subject; the token is NOT consumed on a refusal, so the same carrier
 * re-trying after signing the BCA produces one refusal row and one signature.
 *
 * Never throws. Recording an act must not be able to prevent it (Item 235.5).
 */

import { prisma } from "../config/database";
import { clientIp, clientUserAgent, IpBearingRequest } from "./clientIp";
import { log } from "./logger";

export type SecurityAuditAction = "MFA_ENROLLED" | "MFA_CHALLENGE_FAILED" | "MFA_RESET" | "RC_SIGN_REFUSED";

/** The Entity filter value. One word, so it reads beside "Session" and "Carrier". */
export const SECURITY_ENTITY = "Security";

export interface SecurityAuditInput {
  userId: string;
  action: SecurityAuditAction;
  /** The prose `changes` column — what an AE reads in the Note cell. */
  note: string;
  req?: IpBearingRequest;
  /** Small, structured, never secret-bearing. Lands in audit_logs.details. */
  details?: Record<string, string | number | boolean | null>;
}

export async function recordSecurityEvent(input: SecurityAuditInput): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        entity: SECURITY_ENTITY,
        changes: input.note,
        ipAddress: input.req ? clientIp(input.req) : null,
        userAgent: input.req ? clientUserAgent(input.req) : null,
        details: input.details ?? undefined,
      },
    });
  } catch (err) {
    // An observability failure must never surface to the caller.
    log.error({ err, action: input.action, userId: input.userId }, "[securityAudit] write failed");
  }
}
