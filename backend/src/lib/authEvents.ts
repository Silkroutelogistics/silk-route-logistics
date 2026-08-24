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
import { prisma } from "../config/database";

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
  | "stepup.failed"
  // Google Workspace SSO. Each refusal class is named separately because
  // "sso failed" is useless during an incident: a wrong-domain attempt and a
  // forged signature are different events needing different responses.
  | "sso.success"
  | "sso.unknown_identity"
  | "sso.wrong_domain"
  | "sso.email_unverified"
  | "sso.token_invalid"
  | "sso.inactive_account"
  // authMethod enforcement.
  | "password.refused_sso_only"
  | "reset.refused_staff"
  // Session policy. Ceiling and idle are distinct: one means the session was
  // simply old, the other that it went unused.
  | "session.expired_ceiling"
  | "session.expired_idle"
  // Arc 32 — email verification BEFORE an account exists. Named separately
  // from email.verified, which is the post-account confirmation: this one has
  // no userId to correlate on, so the hashed email is the only handle there is.
  | "onboarding.code_sent"
  | "onboarding.verified"
  | "onboarding.verify_failed"
  // Arc 33 — AE-issued invitations. The accept is named separately from
  // onboarding.verified because it proves the mailbox by a different route,
  // and "which route" is the first question in any onboarding dispute.
  | "onboarding.invited"
  | "onboarding.invite_accepted"
  | "onboarding.invite_reopened"
  | "onboarding.invite_failed";

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
  | "otp_expired"
  // Arc 32. The other onboarding failures reuse members above that already fit
  // exactly — a wrong code is otp_invalid, a dead link is invalid_token.
  | "too_many_attempts"
  | "onboarding_draft_missing";

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

  // Also persist to auth_events.
  //
  // The log line above stays HASHED: a log dump must not become a mailing list.
  // The table stores the raw email, which is not a widening — `users` already
  // holds every address, and an events table you cannot join to an account is
  // not much of an audit trail.
  //
  // Fire-and-forget and swallowed on purpose: this helper's contract is that
  // observability can never change whether a login succeeds, and that outranks
  // capturing any single row. Optional-chained so it no-ops on an un-migrated
  // database rather than throwing.
  try {
    if (fields.email) {
      void (prisma as unknown as { authEvent?: { create: (a: unknown) => Promise<unknown> } }).authEvent
        ?.create({
          data: {
            type: event,
            email: fields.email.trim().toLowerCase().slice(0, 255),
            userId: fields.userId ?? null,
            ip: fields.req ? safeIp(fields.req) : null,
            userAgent: readUserAgent(fields.req),
          },
        })
        .catch(() => {});
    }
  } catch {
    // Same guarantee as above.
  }
}

/** IP extraction that cannot throw — see the note on logAuthEvent. */
function safeIp(req: RequestLike): string | null {
  try {
    return extractClientIp(req as Parameters<typeof extractClientIp>[0]) ?? null;
  } catch {
    return null;
  }
}

function readUserAgent(req?: RequestLike): string | null {
  try {
    const h = req?.headers as Record<string, unknown> | undefined;
    const ua = h?.["user-agent"];
    return typeof ua === "string" ? ua.slice(0, 512) : null;
  } catch {
    return null;
  }
}
