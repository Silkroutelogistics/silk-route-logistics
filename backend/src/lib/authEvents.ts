// Structured log lines for authentication events.
//
// WHY THIS EXISTS. A read-only diagnostic on 2026-08-19 tried to answer "did
// anyone hit the broken password-reset path" and found the question
// unanswerable: password-reset attempts are recorded nowhere.
//
//   - neither resetPassword nor forgotPassword logs anything,
//   - neither route carries auditLog middleware,
//   - auditMiddleware excludes them three times over — skipPaths contains
//     "/api/auth" (auditTrail.ts:45), it only logs 2xx, and it requires
//     req.user. A reset is unauthenticated and the broken path returned 400.
//
// So the events a fraud investigation or a lockout postmortem most needs —
// who tried to reset what, which attempts failed and why, which TOTP challenges
// were rejected — are exactly the ones structurally excluded from every record
// the platform keeps. The only trace a reset leaves is an OtpCode row with the
// RESET: prefix, which says a reset was REQUESTED and nothing about whether it
// succeeded.
//
// Log lines, not a table: these events frequently have no authenticated user
// (a reset for an unknown email, a failed login), and AuditTrail is user-keyed.
// No new tables.
//
// IDENTITY CONVENTION, matched from the codebase rather than invented:
//   - userId when it is known — carrierAuth.ts:240/341/429 all log
//     `{ err, userId: user.id }` and never a raw email.
//   - a short sha256 prefix when the subject is an email with no user behind it
//     — carrierController.ts:52 hashes a colliding registration value to 16
//     chars for exactly this reason, and verifyController.ts:29 uses 12.
// Raw email is never logged, so a log dump does not become a mailing list and a
// support ticket can still be correlated by asking the user to reproduce.

import crypto from "crypto";
import { log } from "./logger";
import { extractClientIp } from "../services/geoService";

/**
 * What happened. Deliberately a closed set: a free-text event name makes these
 * lines ungreppable six months later, which is the state this file exists to
 * fix.
 */
export type AuthEvent =
  | "reset.requested"
  | "reset.completed"
  | "reset.failed"
  | "totp.challenge_failed"
  | "login.failed"
  | "login.locked_out"
  | "otp.failed"
  | "email.verified"
  // Arc 11 — mandatory carrier 2FA enrollment.
  | "totp.setup_started"
  | "totp.enrolled"
  | "totp.enrollment_failed"
  // Arc 11 B2 — step-up. Named separately rather than folded into totp.*: a
  // failed step-up on a LIVE session is a different signal from a failed
  // login, and the point of this file is that the interesting events are the
  // ones nobody thought to record.
  | "stepup.granted"
  | "stepup.failed";

/**
 * Why it failed, as a class rather than the message shown to the user.
 * Response copy is deliberately vague to avoid account enumeration; the log is
 * where the real reason belongs.
 */
export type AuthFailureReason =
  | "invalid_token"
  | "expired_token"
  | "totp_required"
  | "totp_invalid"
  | "bad_credentials"
  | "account_locked"
  | "user_not_found"
  | "otp_invalid"
  | "otp_expired";

/** Just enough of an Express request to find a client IP. */
type RequestLike = { ip?: string; headers?: unknown; socket?: { remoteAddress?: string } };

export interface AuthEventFields {
  userId?: string | null;
  /** Raw email — hashed on the way out, never emitted as given. */
  email?: string | null;
  reason?: AuthFailureReason;
  /**
   * The request. The IP is extracted in here rather than at the call site — see
   * the note on logAuthEvent about why that placement is load-bearing.
   */
  req?: RequestLike;
  role?: string | null;
}

/** Short, stable, non-reversible. Same construction as carrierController.ts:52. */
export function hashEmail(email: string): string {
  return crypto.createHash("sha256").update(email.trim().toLowerCase()).digest("hex").slice(0, 16);
}

/**
 * Emit one auth event.
 *
 * Never throws and returns nothing: observability must not be able to change
 * whether a login succeeds.
 *
 * That guarantee is why this takes `req` rather than a pre-extracted `ip`. The
 * first version of this took `ip: extractClientIp(req)`, which is evaluated as
 * an ARGUMENT — outside the try below — so a request whose shape surprised
 * extractClientIp threw straight through the helper and turned a clean 400 into
 * a 500. The pre-existing v3.7.m reset suite caught it: 8 of 9 red. A helper
 * that cannot throw is worth nothing if its arguments can, so the extraction
 * moved inside. IP is enrichment; failing to resolve one drops the field, never
 * the event.
 *
 * Never accepts a token, code, or password. There is no parameter for one, and
 * a test greps the call sites to keep it that way — a field that cannot be
 * passed cannot be leaked by a careless caller.
 */
export function logAuthEvent(event: AuthEvent, fields: AuthEventFields = {}): void {
  try {
    const payload: Record<string, unknown> = { authEvent: event };
    if (fields.userId) payload.userId = fields.userId;
    if (fields.email) payload.emailHash = hashEmail(fields.email);
    if (fields.reason) payload.reason = fields.reason;
    if (fields.role) payload.role = fields.role;

    if (fields.req) {
      try {
        const ip = extractClientIp(fields.req as Parameters<typeof extractClientIp>[0]);
        if (ip) payload.ip = ip;
      } catch {
        // Unexpected request shape. The event still matters; the IP does not.
      }
    }

    log.info(payload, `[Auth] ${event}`);
  } catch {
    // An observability failure must never surface to the caller.
  }
}
