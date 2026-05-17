import { Response } from "express";

const isProduction = process.env.NODE_ENV === "production";

/**
 * Sprint 53 (v3.8.aca) — Per-portal cookie isolation.
 * Pre-Sprint-53 a single shared `srl_token` cookie collided across AE
 * Console, Carrier Portal, and Shipper Portal in the same browser —
 * logging into one role overwrote any other role's session. Items 9, 10,
 * 11 + §13.3 Item 161 reopen all surfaced from that single bug.
 *
 * One cookie per portal, name derived from the JWT role at mint time.
 * Middleware (auth.ts) picks the right cookie based on req.baseUrl
 * prefix with fallback chain for shared endpoints. Legacy `srl_token`
 * cookie still read by middleware as one-deploy migration grace.
 */
export type Portal = "ae" | "carrier" | "shipper";

export const COOKIE_NAMES: Record<Portal, string> = {
  ae: "srl_token_ae",
  carrier: "srl_token_carrier",
  shipper: "srl_token_shipper",
};

export const LEGACY_COOKIE_NAME = "srl_token";

export function portalForRole(role: string): Portal {
  if (role === "CARRIER") return "carrier";
  if (role === "SHIPPER") return "shipper";
  return "ae";
}

function cookieOpts(extra: Record<string, unknown> = {}) {
  return {
    httpOnly: true,
    secure: isProduction,
    sameSite: (isProduction ? "strict" : "lax") as "strict" | "lax",
    path: "/",
    ...(isProduction ? { domain: ".silkroutelogistics.ai" } : {}),
    ...extra,
  };
}

/**
 * Set a JWT token as an httpOnly, secure cookie scoped to the user's portal.
 * The role argument selects which cookie name to write (srl_token_ae /
 * srl_token_carrier / srl_token_shipper) so concurrent sessions across
 * portals in the same browser don't collide.
 */
export function setTokenCookie(res: Response, token: string, role: string, maxAgeMs?: number) {
  const name = COOKIE_NAMES[portalForRole(role)];
  res.cookie(name, token, cookieOpts({ maxAge: maxAgeMs || 2 * 24 * 60 * 60 * 1000 }));
}

/**
 * Clear the portal-specific JWT cookie on logout. Also clears the legacy
 * `srl_token` cookie so pre-Sprint-53 sessions get cleaned up on the next
 * logout any user performs.
 */
export function clearTokenCookie(res: Response, role: string) {
  const name = COOKIE_NAMES[portalForRole(role)];
  res.clearCookie(name, cookieOpts());
  // Migration: wipe legacy single-cookie name if still present.
  res.clearCookie(LEGACY_COOKIE_NAME, cookieOpts());
}

/**
 * Defensive logout — clears all three portal cookies plus the legacy
 * single cookie. Use when role can't be determined (e.g. expired/invalid
 * session cleanup) or for an explicit "log me out everywhere" action.
 */
export function clearAllTokenCookies(res: Response) {
  for (const name of [...Object.values(COOKIE_NAMES), LEGACY_COOKIE_NAME]) {
    res.clearCookie(name, cookieOpts());
  }
}
