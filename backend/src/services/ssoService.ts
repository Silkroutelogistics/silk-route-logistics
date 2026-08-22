/**
 * Google Workspace SSO — token verification and identity resolution.
 *
 * Deliberately separate from the Gmail OAuth in routes/auth.ts (/google/*),
 * which serves Lead Hunter reply tracking with its own client and its own
 * GOOGLE_OAUTH_* env vars. That path is untouched; this one uses a distinct
 * client (GOOGLE_SSO_*) with scopes openid/email/profile only.
 *
 * NO AUTO-PROVISIONING, on purpose. A verified Google identity in the right
 * domain is not an authorisation to exist here — it only proves who is asking.
 * An identity with no matching User is refused with 403 and recorded. That is
 * what stops a new Workspace hire from silently acquiring a platform account.
 */
import { OAuth2Client } from "google-auth-library";
import { env } from "../config/env";
import { log } from "../lib/logger";

/** Only this Workspace domain may authenticate. Checked against the `hd` claim. */
export const ALLOWED_HD = "silkroutelogistics.ai";

const GOOGLE_ISSUERS = ["accounts.google.com", "https://accounts.google.com"];

export type SsoFailure =
  | "sso.token_invalid"
  | "sso.email_unverified"
  | "sso.wrong_domain";

export type SsoVerified = {
  ok: true;
  googleSub: string;
  email: string;
  name: string | null;
};

export type SsoRejected = {
  ok: false;
  event: SsoFailure;
  detail: string;
  /** The asserted identity when we got far enough to read one. */
  email: string | null;
};

export function ssoConfigured(): boolean {
  return !!env.GOOGLE_SSO_CLIENT_ID && !!env.GOOGLE_SSO_CLIENT_SECRET;
}

export function ssoClient(): OAuth2Client {
  return new OAuth2Client({
    clientId: env.GOOGLE_SSO_CLIENT_ID,
    clientSecret: env.GOOGLE_SSO_CLIENT_SECRET,
    redirectUri: env.GOOGLE_SSO_REDIRECT_URI,
  });
}

/**
 * Verify a Google-issued ID token against the full ratified validation set.
 *
 * verifyIdToken covers the parts that must not be hand-rolled — JWKS signature
 * against Google's rotating keys, `exp`, and `aud` (passed explicitly so a
 * token minted for ANY other client is rejected, which is the forged-audience
 * class). Everything verifyIdToken does not decide is checked here explicitly:
 *
 *   iss            — must be a Google issuer
 *   email_verified — must be literally true; an unverified address on a
 *                    Workspace account is not an identity proof
 *   hd             — must be our domain. This is the check that stops any
 *                    gmail.com account, and it is why `hd` is read rather than
 *                    the email suffix: the suffix can be spoofed by a
 *                    lookalike domain, `hd` is asserted by Google.
 *
 * Returns a discriminated result rather than throwing, so every refusal class
 * gets its own auth_event instead of collapsing into one "sso failed".
 */
export async function verifyGoogleIdToken(idToken: string): Promise<SsoVerified | SsoRejected> {
  if (!ssoConfigured()) {
    return { ok: false, event: "sso.token_invalid", detail: "SSO is not configured on this server", email: null };
  }

  let payload: Record<string, unknown>;
  try {
    const ticket = await ssoClient().verifyIdToken({
      idToken,
      audience: env.GOOGLE_SSO_CLIENT_ID as string,
    });
    const p = ticket.getPayload();
    if (!p) return { ok: false, event: "sso.token_invalid", detail: "token carried no payload", email: null };
    payload = p as unknown as Record<string, unknown>;
  } catch (err) {
    // Bad signature, wrong audience, expired — all land here by design.
    log.warn({ err }, "[SSO] verifyIdToken rejected a token");
    return { ok: false, event: "sso.token_invalid", detail: (err as Error)?.message ?? "verifyIdToken failed", email: null };
  }

  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;

  const iss = typeof payload.iss === "string" ? payload.iss : "";
  if (!GOOGLE_ISSUERS.includes(iss)) {
    return { ok: false, event: "sso.token_invalid", detail: `unexpected iss: ${iss}`, email };
  }

  if (payload.email_verified !== true) {
    return { ok: false, event: "sso.email_unverified", detail: "email_verified is not true", email };
  }

  const hd = typeof payload.hd === "string" ? payload.hd.toLowerCase() : null;
  if (hd !== ALLOWED_HD) {
    // Covers both a personal gmail.com account (no hd at all) and any other
    // Workspace domain.
    return { ok: false, event: "sso.wrong_domain", detail: `hd=${hd ?? "(absent)"}`, email };
  }

  const googleSub = typeof payload.sub === "string" ? payload.sub : null;
  if (!googleSub || !email) {
    return { ok: false, event: "sso.token_invalid", detail: "token lacked sub or email", email };
  }

  return {
    ok: true,
    googleSub,
    email,
    name: typeof payload.name === "string" ? payload.name : null,
  };
}
