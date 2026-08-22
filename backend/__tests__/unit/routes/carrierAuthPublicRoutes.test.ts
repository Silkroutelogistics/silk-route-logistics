/**
 * ARC 27 — the guard that would have caught the 27-hour carrier lockout.
 *
 * Arc 15 added `authenticate` to the /carrier-auth mount so the 2FA wall would
 * actually gate. It did — and it also gated POST /login, so logging in required
 * already being logged in. Production answered 401 "No token provided" to every
 * carrier sign-in, every OTP step, every email-verification click and the public
 * onboarding agreement fetch, for roughly 27 hours.
 *
 * The mount-parity test in requireTotpEnrolled.test.ts could not have caught it.
 * It reads routes/index.ts as TEXT and asserts the string "authenticate" appears
 * on each mount line. The string being present is precisely what broke login.
 * §19 Sub-pattern 16 in the direction people forget: a guard can confirm a wall
 * is mounted and be blind to the wall blocking the front door.
 *
 * So this test does not read the file. It builds the real mount chain and sends
 * real requests with no cookie, asserting BOTH directions:
 *
 *   - every route that must be public is reachable without a session
 *   - a route that must not be is still refused
 *
 * The second half matters as much as the first. A "fix" that dropped the mount
 * guard entirely would make every assertion in the first half pass.
 */

import { describe, it, expect, vi } from "vitest";
import express from "express";
import request from "supertest";

// The real middleware under test.
import {
  makeAllowPublicCarrierAuth,
  isPublicCarrierAuthRoute,
  PUBLIC_CARRIER_AUTH_ROUTES,
} from "../../../src/middleware/allowPublicCarrierAuth";

/**
 * A stand-in for carrierAuthRoutes. Using the real router would drag in prisma,
 * Resend and OpenPhone for a test about ROUTING, and a handler that 500s on a
 * missing database is indistinguishable from one that was never reached.
 *
 * What matters is which requests ARRIVE. Every handler answers 200 with a
 * marker, so "did it get through the chain" is unambiguous, and the assertions
 * are about reachability rather than about what the handler then does.
 */
function makeFakeCarrierRouter() {
  const r = express.Router();
  const ok = (name: string) => (_req: express.Request, res: express.Response) =>
    res.status(200).json({ reached: name });

  r.post("/login", ok("login"));
  r.post("/verify-otp", ok("verify-otp"));
  r.post("/totp-verify", ok("totp-verify"));
  r.post("/resend-otp", ok("resend-otp"));
  r.post("/verify-email", ok("verify-email"));
  r.get("/agreement/:type", ok("agreement"));
  // Carrier-only. Must NEVER be reachable without a session.
  r.get("/agreement/:type/pdf", ok("agreement-pdf"));
  r.get("/me", ok("me"));
  r.get("/application-status", ok("application-status"));
  return r;
}

/** The real mount shape: allowlist → authenticate → gate → router. */
function makeApp() {
  const carrierAuthRoutes = makeFakeCarrierRouter();
  const app = express();
  app.use(express.json());

  // Stands in for `authenticate`: refuses with the exact production body.
  const authenticate: express.RequestHandler = (req, res, next) => {
    if (!req.headers.cookie) {
      res.status(401).json({ error: "No token provided" });
      return;
    }
    next();
  };
  // Stands in for `requireTotpEnrolled`. Never reached without a session.
  const requireTotpEnrolled: express.RequestHandler = (_req, _res, next) => next();

  app.use(
    "/api/carrier-auth",
    makeAllowPublicCarrierAuth(carrierAuthRoutes),
    authenticate,
    requireTotpEnrolled,
    carrierAuthRoutes,
  );
  return app;
}

describe("Arc 27 — /carrier-auth public routes survive the mount guard", () => {
  const app = makeApp();

  // ── direction 1: the front door is open ────────────────────────────
  const mustBeReachable: Array<[string, string, string]> = [
    ["post", "/api/carrier-auth/login", "login"],
    ["post", "/api/carrier-auth/verify-otp", "verify-otp"],
    ["post", "/api/carrier-auth/totp-verify", "totp-verify"],
    ["post", "/api/carrier-auth/resend-otp", "resend-otp"],
    ["post", "/api/carrier-auth/verify-email", "verify-email"],
    ["get", "/api/carrier-auth/agreement/broker-carrier", "agreement"],
    ["get", "/api/carrier-auth/agreement/quick-pay", "agreement"],
  ];

  for (const [method, url, marker] of mustBeReachable) {
    it(`${method.toUpperCase()} ${url} is reachable with NO session`, async () => {
      const res = await (request(app) as any)[method](url).send({});
      expect(res.status, `got ${res.status} ${JSON.stringify(res.body)}`).toBe(200);
      expect(res.body.reached).toBe(marker);
    });
  }

  // ── direction 2: everything else is still refused ──────────────────
  // Without these, dropping the mount guard entirely would pass this file.
  const mustBeRefused: Array<[string, string]> = [
    ["get", "/api/carrier-auth/me"],
    ["get", "/api/carrier-auth/application-status"],
    // Carrier-only sibling of a public route. The `$` in the allowlist regex is
    // the only thing separating them, so it gets its own case.
    ["get", "/api/carrier-auth/agreement/broker-carrier/pdf"],
    // Method-aware: only POST /login is public.
    ["get", "/api/carrier-auth/login"],
  ];

  for (const [method, url] of mustBeRefused) {
    it(`${method.toUpperCase()} ${url} STILL requires a session`, async () => {
      const res = await (request(app) as any)[method](url).send({});
      expect(res.status, `expected 401, got ${res.status}`).toBe(401);
      expect(res.body.error).toBe("No token provided");
    });
  }

  // ── the allowlist is a list of decisions, and each carries its reason ──
  it("every allowlist entry states why it must be public", () => {
    expect(PUBLIC_CARRIER_AUTH_ROUTES.length).toBeGreaterThan(0);
    for (const r of PUBLIC_CARRIER_AUTH_ROUTES) {
      expect(r.why.length, `${r.method} ${r.path} has no stated reason`).toBeGreaterThan(10);
    }
  });

  it("the predicate is method-aware and anchored", () => {
    expect(isPublicCarrierAuthRoute("POST", "/login")).toBe(true);
    expect(isPublicCarrierAuthRoute("GET", "/login")).toBe(false);
    expect(isPublicCarrierAuthRoute("GET", "/agreement/broker-carrier")).toBe(true);
    // The pdf variant is carrier-only; this is the anchor doing its job.
    expect(isPublicCarrierAuthRoute("GET", "/agreement/broker-carrier/pdf")).toBe(false);
    // No prefix-matching escape.
    expect(isPublicCarrierAuthRoute("POST", "/login/../me")).toBe(false);
    expect(isPublicCarrierAuthRoute("POST", "/loginx")).toBe(false);
  });

  // ── vacuity tripwire ───────────────────────────────────────────────
  // If the fake router stopped answering, every "reachable" case would fail
  // rather than silently pass, but the refused cases would still pass on a
  // 404-vs-401 confusion. This pins that the app under test is really wired.
  it("TRIPWIRE: the chain is wired — a session reaches a protected route", async () => {
    const res = await request(app)
      .get("/api/carrier-auth/me")
      .set("Cookie", "srl_token_carrier=stub")
      .send();
    expect(res.status).toBe(200);
    expect(res.body.reached).toBe("me");
  });
});
