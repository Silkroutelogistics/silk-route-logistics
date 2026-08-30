/**
 * ARC 32 — email verification between Step 1 and Step 2 of carrier onboarding.
 *
 * WHY A DRAFT EXISTS AT ALL. Before this, the whole five-step wizard lived in
 * React state and the first server write was `POST /carrier/register` at the
 * very end. There was nothing to verify against and nothing to resume from: a
 * closed tab lost the application. The draft is what makes both possible.
 *
 * WHY NOT OtpCode. `OtpCode.userId` is a required FK to `User`, and the point
 * of this gate is that no User exists yet — verification happens before the
 * account, not after. The Driver Academy hit the same wall (§13.3 Item 193 T2)
 * and solved it with a purpose-specific row; `DriverPhoneVerification` is the
 * precedent this follows.
 *
 * TWO PATHS, ONE OUTCOME. The email carries a 6-digit code AND a one-click
 * link. Either marks the draft verified and mints the same receipt. The link
 * exists because the code path fails in a specific, common way: the carrier
 * opens the mail on their phone and the wizard is on their laptop. The poll in
 * the wizard is what closes that loop.
 *
 * WHY A RECEIPT RATHER THAN READING THE DRAFT. Enforcement could look the draft
 * up by email and check `verifiedAt`. It must not: a browser that edits the
 * email field would then be checked against a DIFFERENT draft, and if that one
 * happened to be verified it would pass. The receipt binds {email, nonce}, and
 * the nonce rotates on any email change — so a receipt is only ever valid for
 * the exact address that was actually verified.
 */

import crypto from "crypto";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { log } from "../lib/logger";
import { logAuthEvent } from "../lib/authEvents";

/** Just enough of an Express request for logAuthEvent to find a client IP. */
type RequestLike = { ip?: string; headers?: unknown; socket?: { remoteAddress?: string } };
import { sendEmail, wrap } from "./emailService";
import { validateEmailDomain } from "./identityVerificationService";
import { extractClientIp, resolveCountry } from "./geoService";

export const CODE_TTL_MS = 10 * 60 * 1000;
export const MAX_ATTEMPTS = 5;
export const RESEND_COOLDOWN_MS = 60 * 1000;
/** The receipt outlives the code deliberately — a carrier may take an hour over Step 3. */
export const RECEIPT_TTL_MS = 24 * 60 * 60 * 1000;

const PORTAL_BASE = "https://silkroutelogistics.ai";

/** Separate from JWT_SECRET so a receipt can never be confused for a session. */
function receiptKey(): string {
  return `onboarding-receipt:${env.JWT_SECRET}`;
}

const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");
const normalizeEmail = (e: string) => e.trim().toLowerCase();

// ── the receipt ──────────────────────────────────────────────────────

export type Receipt = { email: string; verifiedAt: number; nonce: string };

/**
 * `{payload}.{hmac}`, base64url. Not a JWT on purpose: a JWT here would be one
 * `verify()` mistake away from being accepted as a session token, and this
 * proves one narrow thing — that a mailbox was reached.
 */
export function mintReceipt(r: Receipt): string {
  const body = Buffer.from(JSON.stringify(r)).toString("base64url");
  const sig = crypto.createHmac("sha256", receiptKey()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

export type ReceiptCheck =
  | { ok: true; receipt: Receipt }
  | { ok: false; reason: "malformed" | "bad_signature" | "expired" | "email_mismatch" | "nonce_stale" };

/**
 * Verifies signature, expiry, the email it is being used FOR, and that the
 * nonce still matches the draft. The nonce check is what makes an email edit
 * re-gate: rotating it invalidates every receipt already issued.
 */
export async function verifyReceipt(token: string | undefined, forEmail: string): Promise<ReceiptCheck> {
  if (!token || !token.includes(".")) return { ok: false, reason: "malformed" };
  const [body, sig] = token.split(".");
  if (!body || !sig) return { ok: false, reason: "malformed" };

  const expected = crypto.createHmac("sha256", receiptKey()).update(body).digest("base64url");
  // Constant-time, and length-guarded because timingSafeEqual throws on a
  // length mismatch — which would itself be a signal.
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return { ok: false, reason: "bad_signature" };

  let parsed: Receipt;
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!parsed?.email || !parsed?.nonce || typeof parsed.verifiedAt !== "number") {
    return { ok: false, reason: "malformed" };
  }
  if (Date.now() - parsed.verifiedAt > RECEIPT_TTL_MS) return { ok: false, reason: "expired" };
  if (parsed.email !== normalizeEmail(forEmail)) return { ok: false, reason: "email_mismatch" };

  const draft = await prisma.onboardingDraft.findFirst({
    where: { email: parsed.email, verifiedAt: { not: null } },
    orderBy: { updatedAt: "desc" },
  });
  if (!draft || draft.nonce !== parsed.nonce) return { ok: false, reason: "nonce_stale" };

  return { ok: true, receipt: parsed };
}

// ── the draft ────────────────────────────────────────────────────────

export type Step1 = {
  email: string;
  mcNumber: string;
  dotNumber?: string;
  company?: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
};

/**
 * Upsert on (email, mcNumber) — re-submitting Step 1 updates rather than
 * duplicating. A CHANGED email is a different key and therefore a different
 * draft, which is exactly right: the old one keeps its verification and the new
 * one has none, so the wizard re-gates.
 */
export async function upsertDraft(s: Step1) {
  const email = normalizeEmail(s.email);
  const domain = await validateEmailDomain(email).catch(() => null);

  const fields = {
    dotNumber: s.dotNumber ?? null,
    company: s.company ?? null,
    firstName: s.firstName ?? null,
    lastName: s.lastName ?? null,
    phone: s.phone ?? null,
    address: s.address ?? null,
    city: s.city ?? null,
    state: s.state ?? null,
    zip: s.zip ?? null,
    emailIsDisposable: domain?.isDisposable ?? false,
  };

  return prisma.onboardingDraft.upsert({
    where: { email_mcNumber: { email, mcNumber: s.mcNumber } },
    // Updating Step 1 answers does NOT clear verification — the email is the
    // subject, and it has not changed if we are on this key.
    update: fields,
    create: { email, mcNumber: s.mcNumber, nonce: crypto.randomBytes(16).toString("hex"), ...fields },
  });
}

// ── sending ──────────────────────────────────────────────────────────

export type SendResult =
  | { ok: true; cooldownMs: 0 }
  | { ok: false; reason: "cooldown"; cooldownMs: number };

/**
 * Rotates the nonce on every send, so a code issued now invalidates any receipt
 * minted from a previous round.
 */
export async function sendVerification(draftId: string, req?: RequestLike): Promise<SendResult> {
  const draft = await prisma.onboardingDraft.findUnique({ where: { id: draftId } });
  if (!draft) return { ok: true, cooldownMs: 0 }; // neutral; caller must not leak existence

  if (draft.lastSentAt) {
    const since = Date.now() - draft.lastSentAt.getTime();
    if (since < RESEND_COOLDOWN_MS) {
      return { ok: false, reason: "cooldown", cooldownMs: RESEND_COOLDOWN_MS - since };
    }
  }

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const linkToken = crypto.randomBytes(32).toString("base64url");
  const nonce = crypto.randomBytes(16).toString("hex");

  await prisma.onboardingDraft.update({
    where: { id: draft.id },
    data: {
      code,
      codeExpiresAt: new Date(Date.now() + CODE_TTL_MS),
      attempts: 0,
      lastSentAt: new Date(),
      linkTokenHash: sha256(linkToken),
      nonce,
      // A re-send un-verifies: the carrier asked to prove the mailbox again.
      verifiedAt: null,
    },
  });

  const link = `${PORTAL_BASE}/onboarding/verify?token=${encodeURIComponent(linkToken)}`;
  await sendEmail(
    draft.email,
    "Your Silk Route Logistics verification code",
    wrap(`
      <h2 style="margin:0 0 12px;font-family:Georgia,serif;color:#0A2540;">Confirm your email</h2>
      <p style="color:#3A4A5F;">You are part-way through a carrier application with Silk Route Logistics.
      Confirm this address to continue to the next step.</p>
      <p style="font-size:13px;color:#6B7685;margin:20px 0 6px;letter-spacing:.08em;text-transform:uppercase;">Your code</p>
      <p style="font-size:32px;letter-spacing:.28em;font-weight:700;color:#0A2540;margin:0 0 4px;">${code}</p>
      <p style="color:#6B7685;font-size:13px;margin:0 0 22px;">Expires in 10 minutes.</p>
      <p style="color:#3A4A5F;">Or confirm in one click — this works even if you opened this email on a different device:</p>
      <p style="margin:16px 0 24px;">
        <a href="${link}" style="background:#BA7517;color:#FFFFFF;padding:12px 22px;border-radius:8px;text-decoration:none;font-weight:600;">Confirm my email</a>
      </p>
      <p style="color:#6B7685;font-size:12px;">If you did not start an application with us, ignore this message and nothing further happens.</p>
    `),
    undefined,
    { replyTo: "operations@silkroutelogistics.ai" },
  ).catch((err) => {
    // Never let a transport failure surface as a different answer to the
    // caller — that difference is an enumeration oracle.
    log.error({ err }, "[Onboarding] verification email failed");
  });

  logAuthEvent("onboarding.code_sent", { email: draft.email, req });
  return { ok: true, cooldownMs: 0 };
}

// ── verifying ────────────────────────────────────────────────────────

/**
 * Why a verification attempt failed. Exported so the routes can key their user-
 * facing copy off THIS union exhaustively — a `Record<string, string>` lookup
 * silently yields undefined on a renamed member, which is how the carrier ended
 * up seeing a 400 with no message at all.
 */
export type VerifyFailureReason =
  | "onboarding_draft_missing"
  | "expired"
  | "wrong_code"
  | "too_many_attempts";

export type VerifyOutcome =
  | { ok: true; receipt: string; email: string }
  | { ok: false; reason: VerifyFailureReason };

/**
 * Record the proof, and WHERE it came from.
 *
 * The origin is captured here rather than at either call site so the code path
 * and the link path cannot diverge — the whole point is that an AE reading the
 * carrier panel sees the same three facts whichever way the carrier proved their
 * mailbox. Both callers already hold `req`; neither has to remember to do
 * anything.
 *
 * SERVER-EXTRACTED ONLY. `extractClientIp` reads the connection and the proxy
 * headers Render sets; nothing here is taken from a request body. A
 * self-reported origin is worth nothing as a fraud signal, and a field a client
 * can set is a field a client will set. Pinned by test.
 *
 * Geo resolution is best-effort and must never cost the verification: an
 * unresolvable IP stores a null country and the carrier still gets through. The
 * same reasoning as logAuthEvent — enrichment never gates the act it describes.
 */
async function markVerified(
  draft: { id: string; email: string; nonce: string },
  req?: RequestLike,
) {
  const verifiedAt = new Date();

  let ip: string | null = null;
  let country: string | null = null;
  let userAgent: string | null = null;
  if (req) {
    try {
      ip = extractClientIp(req as Parameters<typeof extractClientIp>[0]) || null;
      country = resolveCountry(ip);
      const raw = (req.headers as Record<string, unknown> | undefined)?.["user-agent"];
      userAgent = typeof raw === "string" ? raw.slice(0, 500) : null;
    } catch {
      // A request shape that surprises the extractor drops the enrichment; it
      // never fails the verification the carrier just completed.
    }
  }

  await prisma.onboardingDraft.update({
    where: { id: draft.id },
    // Code and link both cleared: single-use in both directions.
    data: {
      verifiedAt,
      code: null,
      codeExpiresAt: null,
      linkTokenHash: null,
      attempts: 0,
      verifiedFromIp: ip,
      verifiedFromCountry: country,
      verifiedUserAgent: userAgent,
    },
  });
  return mintReceipt({ email: draft.email, verifiedAt: verifiedAt.getTime(), nonce: draft.nonce });
}

export async function verifyCode(email: string, code: string, req?: RequestLike): Promise<VerifyOutcome> {
  const e = normalizeEmail(email);
  const draft = await prisma.onboardingDraft.findFirst({
    where: { email: e, code: { not: null } },
    orderBy: { updatedAt: "desc" },
  });
  if (!draft || !draft.code || !draft.codeExpiresAt) {
    logAuthEvent("onboarding.verify_failed", { email: e, req, reason: "onboarding_draft_missing" });
    return { ok: false, reason: "onboarding_draft_missing" };
  }
  if (draft.attempts >= MAX_ATTEMPTS) {
    logAuthEvent("onboarding.verify_failed", { email: e, req, reason: "too_many_attempts" });
    return { ok: false, reason: "too_many_attempts" };
  }
  if (draft.codeExpiresAt.getTime() < Date.now()) {
    logAuthEvent("onboarding.verify_failed", { email: e, req, reason: "otp_expired" });
    return { ok: false, reason: "expired" };
  }

  // Constant-time compare on equal-length 6-digit strings.
  const a = Buffer.from(draft.code);
  const b = Buffer.from(String(code).trim());
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  if (!match) {
    await prisma.onboardingDraft.update({ where: { id: draft.id }, data: { attempts: { increment: 1 } } });
    logAuthEvent("onboarding.verify_failed", { email: e, req, reason: "otp_invalid" });
    return { ok: false, reason: "wrong_code" };
  }

  const receipt = await markVerified(draft, req);
  logAuthEvent("onboarding.verified", { email: e, req });
  return { ok: true, receipt, email: e };
}

export async function verifyLink(token: string, req?: RequestLike): Promise<VerifyOutcome> {
  const draft = await prisma.onboardingDraft.findFirst({ where: { linkTokenHash: sha256(token) } });
  if (!draft) {
    // Covers both a forged token and a link already used — deliberately the
    // same answer, and the confirmation page words it for a human.
    logAuthEvent("onboarding.verify_failed", { req, reason: "invalid_token" });
    return { ok: false, reason: "onboarding_draft_missing" };
  }
  if (draft.codeExpiresAt && draft.codeExpiresAt.getTime() < Date.now()) {
    logAuthEvent("onboarding.verify_failed", { email: draft.email, req, reason: "expired_token" });
    return { ok: false, reason: "expired" };
  }
  const receipt = await markVerified(draft, req);
  logAuthEvent("onboarding.verified", { email: draft.email, req });
  return { ok: true, receipt, email: draft.email };
}

/** The 5-second poll. Neutral by construction: unverified and unknown look the same. */
export async function draftStatus(email: string, mcNumber: string) {
  const draft = await prisma.onboardingDraft.findUnique({
    where: { email_mcNumber: { email: normalizeEmail(email), mcNumber } },
  });
  if (!draft?.verifiedAt) return { verified: false as const };
  return {
    verified: true as const,
    receipt: mintReceipt({ email: draft.email, verifiedAt: draft.verifiedAt.getTime(), nonce: draft.nonce }),
  };
}
