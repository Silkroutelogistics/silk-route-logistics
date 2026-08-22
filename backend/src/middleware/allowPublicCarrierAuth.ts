/**
 * ARC 27 — the routes under /carrier-auth that must work with NO session.
 *
 * WHY THIS EXISTS
 *
 * `/carrier-auth` is mounted as `authenticate → requireTotpEnrolled → router`.
 * The gate genuinely needs `authenticate` ahead of it: `requireTotpEnrolled`
 * short-circuits on `!req.user`, so without it the wall is inert (Arc 15).
 *
 * But `/carrier-auth` is also the one carrier mount that holds routes a person
 * with no account and no cookie has to be able to reach — starting with the
 * login endpoint itself. Putting `authenticate` on the mount made logging in
 * require already being logged in, and production returned 401 to every carrier
 * for roughly 27 hours.
 *
 * So the mount keeps its guard, and this runs in front of it: for an allowlisted
 * (method, path) pair it hands the request straight to the router; for anything
 * else it calls next() and the guard chain runs exactly as before.
 *
 * WHAT MAY GO IN THE LIST
 *
 * Only routes that CANNOT function with a session requirement — the login
 * sequence, the email-verification link, and the public agreement text. Not
 * "routes that would be convenient without auth". Every entry below is a route
 * whose own definition in carrierAuth.ts deliberately omits `authenticate`;
 * this list mirrors those definitions rather than making a new decision, which
 * is the same mirror rule the compliance gate's absolute set follows.
 *
 * ADDING ONE: omit `authenticate` at the route, add it here, and add a case to
 * carrierAuthPublicRoutes.test.ts. That test sends real requests through the
 * real chain — a text assertion cannot tell a mounted wall from a locked door.
 *
 * WHAT THIS DOES NOT WIDEN
 *
 * None of these grant portal access. `requireTotpEnrolled` exists to force
 * enrollment before a carrier can use the portal; the login sequence is how a
 * carrier arrives at that wall in the first place, and the agreement text is
 * read by prospects who have no account at all. Its own exemption list
 * (/totp/setup, /totp/confirm, /me, /logout) is untouched and still runs behind
 * `authenticate`, as it must.
 */

import { Request, Response, NextFunction, Router } from "express";

/**
 * Method-aware on purpose. Only POST /login is public; GET /login is not, and
 * should fall through to the guard rather than be silently reachable.
 */
const PUBLIC_CARRIER_AUTH: ReadonlyArray<{ method: string; path: RegExp; why: string }> = [
  { method: "POST", path: /^\/login$/, why: "logging in cannot require being logged in" },
  { method: "POST", path: /^\/verify-otp$/, why: "step 2 of that same login" },
  { method: "POST", path: /^\/totp-verify$/, why: "step 3 of that same login" },
  { method: "POST", path: /^\/resend-otp$/, why: "the recovery path for step 2" },
  { method: "POST", path: /^\/verify-email$/, why: "clicked from an email, by someone with no session" },
  // The `$` is load-bearing: it keeps this from matching /agreement/:type/pdf,
  // which is authenticate + authorize("CARRIER") and must stay that way.
  { method: "GET", path: /^\/agreement\/[^/]+$/, why: "the public onboarding click-through reads this" },
];

export function isPublicCarrierAuthRoute(method: string, path: string): boolean {
  return PUBLIC_CARRIER_AUTH.some((r) => r.method === method.toUpperCase() && r.path.test(path));
}

/** Exported for the guard test, so the list and the assertions cannot drift. */
export const PUBLIC_CARRIER_AUTH_ROUTES = PUBLIC_CARRIER_AUTH;

/**
 * Hands allowlisted requests to `router`, skipping the mount's auth chain.
 * Everything else falls through untouched.
 *
 * Note on fall-through: if a path is allowlisted but the router has no handler
 * for it, the router calls next() and the request continues into `authenticate`
 * on the outer chain. That is the safe direction — an unmatched public path
 * ends up guarded rather than open.
 */
export function makeAllowPublicCarrierAuth(router: Router) {
  return function allowPublicCarrierAuth(req: Request, res: Response, next: NextFunction): void {
    if (isPublicCarrierAuthRoute(req.method, req.path)) {
      router(req, res, next);
      return;
    }
    next();
  };
}
