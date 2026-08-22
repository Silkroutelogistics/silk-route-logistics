#!/usr/bin/env node
/**
 * SYNTHETIC MONITORING OF THE PUBLIC SURFACE — Arc 28.
 *
 * WHY THIS EXISTS
 *
 * Carrier login returned 401 "No token provided" in production for ~27 hours
 * and nothing noticed. Not CI (it was green — the defect was a routing change
 * that compiled and tested fine), not the health check (`/api/health` was 200
 * throughout), not error rates (a 401 is not an error). It was found by the
 * founder walking the site.
 *
 * THE LESSON THAT SHAPES THIS FILE: assert the SHAPE, not the status.
 *
 * A status-only table reads broken-as-fixed and fixed-as-broken. During Arc 27
 * the FIXED login returned 401 — the handler's own "Invalid credentials" for a
 * garbage password — which is indistinguishable by status code from the BROKEN
 * login's 401 "No token provided" from the middleware. Same number, opposite
 * meaning. Every probe below therefore states what the body must and must not
 * contain, and `mustNotContain` is doing the real work: "No token provided" on
 * a public route is precisely the outage this exists to catch.
 *
 * WHAT FAILURE LOOKS LIKE
 *
 * Non-zero exit → the scheduled workflow fails → GitHub emails Wasi. That is
 * the same channel that already reaches him, so there is no new alerting
 * infrastructure to keep alive, and no secret beyond what the repo has.
 *
 * ADDING A PUBLIC ROUTE
 *
 * Add a probe here. `publicSurfaceProbes.test.ts` fails if a route reachable
 * without a session has no probe — same shape as the SCHEDULED_JOB_NAMES guard,
 * and for the same reason: a list nobody is forced to update is a list that
 * silently goes stale.
 */

const BASE = process.env.PROBE_BASE_URL || "https://api.silkroutelogistics.ai/api";
const TIMEOUT_MS = 20_000;

/**
 * Each probe names the healthy SHAPE of one public production surface.
 *
 *   expectStatus   — array, because several are legitimately variable
 *                    (a validation 400 and a 404 for an unknown token are both
 *                    healthy; what matters is that the route was REACHED).
 *   mustNotContain — the outage signature. Usually the middleware's refusal,
 *                    which on a public route means the front door is locked.
 *   mustContain    — positive proof the handler ran, where there is one.
 */
export const PROBES = [
  // ── the six that were down (Arc 27) ────────────────────────────────
  {
    name: "carrier login",
    why: "Arc 27: this returned 401 'No token provided' for ~27h. Nobody could sign in.",
    method: "POST",
    path: "/carrier-auth/login",
    body: { email: "probe@srl-monitor.invalid", password: "not-a-real-password" },
    // The handler's own refusal of an unknown user. 401 is CORRECT here — the
    // body is the only thing separating healthy from the outage.
    expectStatus: [401],
    mustContain: ["Invalid credentials"],
    mustNotContain: ["No token provided"],
  },
  {
    name: "carrier OTP verify",
    why: "step 2 of login; same mount, went down with it",
    method: "POST",
    path: "/carrier-auth/verify-otp",
    body: {},
    expectStatus: [400],
    mustContain: ["Validation failed"],
    mustNotContain: ["No token provided"],
  },
  {
    name: "carrier TOTP verify",
    why: "step 3 of login; same mount",
    method: "POST",
    path: "/carrier-auth/totp-verify",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
  },
  {
    name: "carrier resend OTP",
    why: "recovery path for step 2; same mount",
    method: "POST",
    path: "/carrier-auth/resend-otp",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
  },
  {
    name: "carrier email verification",
    why: "clicked from an email by someone with no session; same mount",
    method: "POST",
    path: "/carrier-auth/verify-email",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
  },
  {
    name: "public agreement text (onboarding Step 4)",
    why: "the reported symptom. A prospect cannot register without this.",
    method: "GET",
    path: "/carrier-auth/agreement/broker-carrier",
    expectStatus: [200],
    // The version string is the point: a 200 carrying an empty or wrong-shaped
    // body would still hang the click-through, which is fail-closed by design.
    mustContain: ['"version"', '"sections"', "Broker-Carrier"],
    mustNotContain: ["No token provided"],
  },

  // ── the nine that were healthy, kept so a future mount change is caught ──
  {
    name: "FMCSA lookup by DOT (onboarding step 1)",
    why: "prospect enters a DOT; this fills the form",
    method: "GET",
    path: "/carrier/fmcsa-lookup/4526880",
    expectStatus: [200],
    mustNotContain: ["No token provided"],
  },
  {
    name: "FMCSA lookup by MC (onboarding step 1)",
    why: "the MC-number half of the same lookup",
    method: "GET",
    path: "/carrier/fmcsa-mc-lookup/1794414",
    expectStatus: [200],
    mustNotContain: ["No token provided"],
  },
  {
    name: "carrier registration submit",
    why: "the end of onboarding. A 400 proves the validator ran.",
    method: "POST",
    path: "/carrier/register",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
  },
  {
    name: "public shipment tracking (BOL QR target)",
    why: "every printed BOL carries a QR pointing here; a dock worker scans it",
    method: "GET",
    path: "/tracking/SRLMONITORPROBE",
    // 404 for a token that does not exist is the healthy answer.
    expectStatus: [404],
    mustNotContain: ["No token provided"],
  },
  {
    name: "shipper quote form",
    why: "/shippers.html#quote-form posts here; it is the inbound lead path",
    method: "POST",
    path: "/leads/website",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
  },
  {
    name: "contact form",
    why: "/contact.html posts here",
    method: "POST",
    path: "/contact/website",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
  },
  {
    name: "tender-action magic link",
    why: "carrier accepts/declines a tender from an email with no session",
    method: "GET",
    path: "/tender-action/SRLMONITORPROBE",
    expectStatus: [200, 400, 404],
    mustNotContain: ["No token provided"],
  },
  {
    name: "AE + shipper login",
    why: "the other portal's front door. Unaffected by Arc 27, probed anyway.",
    method: "POST",
    path: "/auth/login",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
  },
  {
    name: "driver portal login",
    why: "SRL Driver Academy front door; separate mount, separate cookie",
    method: "POST",
    path: "/driver-auth/login",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
  },

  // ── liveness, so a total outage is distinguishable from a routing bug ──
  {
    name: "health",
    why: "if this is the only failure, the service is down rather than mis-routed",
    method: "GET",
    path: "/health",
    expectStatus: [200],
    mustContain: ['"status":"ok"'],
  },
];

async function probe(p) {
  const url = `${BASE}${p.path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: p.method,
      headers: p.body ? { "Content-Type": "application/json" } : undefined,
      body: p.body ? JSON.stringify(p.body) : undefined,
      signal: ctrl.signal,
    });
    const text = (await res.text()).slice(0, 2000);
    const problems = [];

    if (!p.expectStatus.includes(res.status)) {
      problems.push(`status ${res.status}, expected one of ${p.expectStatus.join("/")}`);
    }
    for (const s of p.mustContain || []) {
      if (!text.includes(s)) problems.push(`body is missing ${JSON.stringify(s)}`);
    }
    for (const s of p.mustNotContain || []) {
      if (text.includes(s)) problems.push(`body contains ${JSON.stringify(s)} — THIS IS THE OUTAGE SIGNATURE`);
    }
    return { ...p, status: res.status, snippet: text.slice(0, 160), problems };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ...p, status: 0, snippet: "",
      problems: [aborted ? `no response within ${TIMEOUT_MS}ms` : `request failed: ${err.message}`],
    };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  console.log(`Probing ${PROBES.length} public surfaces at ${BASE}\n`);
  // Sequential on purpose: a burst of 16 from one IP against rate-limited
  // endpoints is the sort of thing that makes the monitor the incident.
  const results = [];
  for (const p of PROBES) results.push(await probe(p));

  let failed = 0;
  for (const r of results) {
    const ok = r.problems.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? "  ok  " : "  FAIL"} ${String(r.status).padEnd(4)} ${r.method.padEnd(5)} ${r.path}`);
    console.log(`         ${r.name} — ${r.why}`);
    if (!ok) {
      for (const problem of r.problems) console.log(`         ✗ ${problem}`);
      console.log(`         body: ${r.snippet}`);
    }
  }

  console.log(`\n${results.length - failed}/${results.length} public surfaces healthy`);
  if (failed) {
    console.log("\nA PUBLIC SURFACE IS DOWN. These are the pages and links customers and");
    console.log("carriers reach with no session — a failure here is visible to the outside");
    console.log("world right now. If the signature is \"No token provided\" on a route that");
    console.log("should be public, a mount-level guard has been added in front of it:");
    console.log("see backend/src/middleware/allowPublicCarrierAuth.ts and CLAUDE.md Item 236.");
    process.exit(1);
  }
}

main().catch((e) => {
  console.error("probe harness itself failed:", e);
  process.exit(1);
});
