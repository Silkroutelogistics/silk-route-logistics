/**
 * Google Workspace SSO routes — mounted at /api/auth/sso.
 *
 * Distinct from the Gmail OAuth at /api/auth/google/*, which serves Lead Hunter
 * reply tracking with its own client. Those routes are untouched.
 *
 * Flow:
 *   GET  /api/auth/sso/google           top-level navigation -> Google consent
 *   GET  /api/auth/sso/google/callback  Google redirects back with ?code&state
 *
 * The callback sets the session cookie on ITS OWN response and then 302s to the
 * SPA. It does NOT rely on the cookie riding the top-level redirect: the
 * production cookie is sameSite:"strict", and a cookie set during a cross-site
 * navigation chain is not reliably sent on the landing request. The SPA's
 * existing loadUser() call is same-site (both hosts share the registrable
 * domain silkroutelogistics.ai) and does carry it, so state is established
 * there.
 *
 * The minted session is IDENTICAL to a password login's: signToken({userId})
 * with no extra claims, then setTokenCookie(res, token, user.role). Adding any
 * `purpose` claim would make the token unusable — tryAuthenticateToken rejects
 * those outright (middleware/auth.ts) — and the failure would present as a
 * cookie or CORS problem rather than a token problem.
 */
import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { log } from "../lib/logger";
import { logAuthEvent } from "../lib/authEvents";
import { signToken } from "../controllers/authController";
import { setTokenCookie } from "../utils/cookies";
import { registerSession } from "../middleware/auth";
import { ssoClient, ssoConfigured, verifyGoogleIdToken } from "../services/ssoService";

const router = Router();

/** Short-lived, httpOnly. Binds the OAuth `state` nonce to this browser. */
const STATE_COOKIE = "srl_sso_state";
const STATE_TTL_MS = 10 * 60 * 1000;
const isProduction = process.env.NODE_ENV === "production";

function stateCookieOpts() {
  return {
    httpOnly: true,
    secure: isProduction,
    // NOT "strict": this cookie must survive the return trip from Google,
    // which is a cross-site top-level navigation. "lax" is sent on exactly
    // that and is the correct choice for a CSRF nonce.
    sameSite: "lax" as const,
    path: "/api/auth/sso",
    maxAge: STATE_TTL_MS,
    ...(isProduction ? { domain: ".silkroutelogistics.ai" } : {}),
  };
}

/** Start: redirect to Google. Top-level navigation, never XHR. */
router.get("/google", (req, res) => {
  if (!ssoConfigured()) {
    res.status(503).json({ error: "SSO is not configured on this server" });
    return;
  }

  const state = crypto.randomBytes(32).toString("base64url");
  res.cookie(STATE_COOKIE, state, stateCookieOpts());

  const url = ssoClient().generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    prompt: "select_account",
    state,
    // Narrows the account picker to our domain. A UX hint only — the binding
    // check is the `hd` claim verified server-side, never this.
    hd: "silkroutelogistics.ai",
  } as Parameters<ReturnType<typeof ssoClient>["generateAuthUrl"]>[0]);

  res.redirect(url);
});

/** Callback: verify state, exchange code, verify id_token, resolve, mint. */
router.get("/google/callback", async (req, res) => {
  const fail = (reason: string) => {
    const u = new URL(env.SSO_FAILURE_REDIRECT as string);
    u.searchParams.set("sso_error", reason);
    res.redirect(u.toString());
  };

  if (!ssoConfigured()) return fail("not_configured");

  const { code, state } = req.query as { code?: string; state?: string };
  const cookieState = (req.cookies || {})[STATE_COOKIE];
  res.clearCookie(STATE_COOKIE, { ...stateCookieOpts(), maxAge: undefined });

  // CSRF: the nonce must match the one bound to this browser. Constant-time so
  // the comparison itself leaks nothing.
  const stateOk =
    typeof state === "string" &&
    typeof cookieState === "string" &&
    state.length === cookieState.length &&
    crypto.timingSafeEqual(Buffer.from(state), Buffer.from(cookieState));

  if (!stateOk) {
    logAuthEvent("sso.token_invalid", { email: "(unknown)", req });
    return fail("bad_state");
  }
  if (!code) return fail("no_code");

  // Exchange the authorization code for tokens.
  let idToken: string | undefined;
  try {
    const { tokens } = await ssoClient().getToken(code);
    idToken = tokens.id_token ?? undefined;
  } catch (err) {
    log.warn({ err }, "[SSO] code exchange failed");
    logAuthEvent("sso.token_invalid", { email: "(unknown)", req });
    return fail("exchange_failed");
  }
  if (!idToken) {
    logAuthEvent("sso.token_invalid", { email: "(unknown)", req });
    return fail("no_id_token");
  }

  const verified = await verifyGoogleIdToken(idToken);
  if (!verified.ok) {
    logAuthEvent(verified.event, { email: verified.email ?? "(unknown)", req });
    log.warn({ event: verified.event, detail: verified.detail }, "[SSO] token refused");
    return fail(verified.event.replace("sso.", ""));
  }

  // Resolve the identity: googleSub first (stable), then verified email.
  // NO AUTO-PROVISIONING — an unmatched identity is refused, not created.
  let user = await prisma.user.findFirst({
    where: { googleSub: verified.googleSub },
    select: { id: true, email: true, role: true, isActive: true, googleSub: true },
  });

  if (!user) {
    user = await prisma.user.findFirst({
      where: { email: { equals: verified.email, mode: "insensitive" } },
      select: { id: true, email: true, role: true, isActive: true, googleSub: true },
    });
    // Bind the subject id on first successful SSO so later logins match on the
    // stable claim even if the address is renamed.
    if (user && !user.googleSub) {
      await prisma.user
        .update({ where: { id: user.id }, data: { googleSub: verified.googleSub } })
        .catch((err) => log.error({ err }, "[SSO] googleSub backfill failed"));
    }
  }

  if (!user) {
    logAuthEvent("sso.unknown_identity", { email: verified.email, req });
    return fail("unknown_identity");
  }
  if (!user.isActive) {
    logAuthEvent("sso.inactive_account", { email: verified.email, userId: user.id, req });
    return fail("inactive");
  }

  // Mint a session identical in shape to the password path's.
  const token = signToken(user.id);
  registerSession(user.id, token, user.role);
  setTokenCookie(res, token, user.role);

  await prisma.auditLog
    .create({
      data: {
        userId: user.id,
        action: "LOGIN",
        entity: "Session",
        changes: "SSO (Google Workspace)",
        ipAddress: (req.headers["x-forwarded-for"] as string) || req.ip || "",
        userAgent: req.headers["user-agent"] || "",
      },
    })
    .catch((err) => log.error({ err }, "[SSO] audit write failed"));

  logAuthEvent("sso.success", { email: user.email, userId: user.id, req, role: user.role });

  res.redirect(env.SSO_SUCCESS_REDIRECT as string);
});

export default router;
