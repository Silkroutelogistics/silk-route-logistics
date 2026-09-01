/**
 * Every route in src/routes/*.ts must carry an explicit `authorize(...)` — at
 * the route itself or via a file-level `router.use(authorize(...))` — unless it
 * is on the documented inventory below.
 *
 * WHY THIS EXISTS. compliance.ts shipped three routes with no `authorize()`:
 * `PATCH /alerts/:id/dismiss`, `PATCH /alerts/:id/resolve`, `GET /stats`. Only
 * the file-level `authenticate` gated them, while every sibling on both sides
 * carried a role list — so the omission read as a decision and nobody looked
 * again. It was reachable by a CARRIER, because /api/compliance is not a
 * carrier-portal mount and resolveCookieCandidates falls back to the carrier
 * cookie there. A carrier could dismiss the compliance alert raised against
 * itself. Fixed in v3.8.aws; this guard is why it cannot come back quietly.
 *
 * WHY AN INVENTORY RATHER THAN A CLEAN ASSERTION. 144 of 788 routes have no
 * `authorize()` today. Most are legitimately public (auth login, blog, /health,
 * inbound webhooks) and the rest are authenticate-only reads that predate this
 * guard. Failing on all 144 would be a gate nobody could ship, and a gate
 * nobody can ship gets deleted. So the inventory is seeded from reality and the
 * rule is directional: **it may shrink, never grow.**
 *
 * Two failure modes, both deliberate:
 *   1. A NEW ungated route that is not listed  -> FAIL. This is the recurrence
 *      gate, and the only thing this guard really promises.
 *   2. A LISTED route that is now gated, or gone -> FAIL. A stale entry is
 *      permission granted to something that moved; the list has to shrink as
 *      routes get gated, or it rots into a rubber stamp.
 *
 * The inventory is a backlog, not an endorsement. Nothing on it has been
 * reviewed as safe — it is the set of routes that were ungated on 2026-08-31.
 *
 * PARSER NOTES. Comments are blanked before matching, offsets preserved, because
 * carrier.ts carries `// Mount order in router.post("/register", ...) below:` in
 * a comment and an earlier draft of this guard counted it as a real route.
 * Declarations are read by balancing parentheses rather than to end-of-line,
 * because analytics.ts and automation.ts wrap `router.get(` onto its own line
 * and a line-scoped matcher silently misses every one of them.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROUTES_DIR = path.join(__dirname, "..", "..", "..", "src", "routes");

/** Blank comments, preserving offsets so reported line numbers stay true. */
function stripComments(s: string): string {
  let o = "", i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i], d = s[i + 1];
    if (c === "/" && d === "/") { while (i < n && s[i] !== "\n") { o += " "; i++; } continue; }
    if (c === "/" && d === "*") {
      o += "  "; i += 2;
      while (i < n && !(s[i] === "*" && s[i + 1] === "/")) { o += s[i] === "\n" ? "\n" : " "; i++; }
      o += "  "; i += 2; continue;
    }
    if (c === '"' || c === "'" || c === "`") {
      const q = c; o += c; i++;
      while (i < n && s[i] !== q) {
        if (s[i] === "\\") { o += s[i] + (s[i + 1] ?? ""); i += 2; continue; }
        o += s[i]; i++;
      }
      o += s[i] ?? ""; i++; continue;
    }
    o += c; i++;
  }
  return o;
}

interface Route { key: string; file: string; line: number; gated: boolean }

function collectRoutes(): Route[] {
  const out: Route[] = [];
  for (const file of fs.readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts"))) {
    const src = stripComments(fs.readFileSync(path.join(ROUTES_DIR, file), "utf8"));
    const fileLevelAuthorize = /router\.use\([^)]*authorize\s*\(/.test(src);
    const verb = /router\.(get|post|put|patch|delete)\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = verb.exec(src))) {
      let i = m.index + m[0].length - 1, depth = 0, end = i;
      for (; i < src.length; i++) {
        const c = src[i];
        if (c === "(") depth++;
        else if (c === ")") { depth--; if (depth === 0) { end = i; break; } }
      }
      const decl = src.slice(m.index, end + 1);
      const routePath = (decl.match(/["'`]([^"'`]*)["'`]/) ?? [])[1] ?? "?";
      out.push({
        key: `${file} ${m[1].toUpperCase()} ${routePath}`,
        file,
        line: src.slice(0, m.index).split("\n").length,
        gated: /\bauthorize\s*\(/.test(decl) || fileLevelAuthorize,
      });
    }
  }
  return out;
}

/**
 * Routes with no `authorize()` as of 2026-08-31 (v3.8.aws). MAY SHRINK, NEVER GROW.
 * Gating one of these is an improvement: gate it, then delete its line here.
 */
const KNOWN_UNGATED: readonly string[] = [
  "ai.ts GET /deadhead/backhaul",
  "ai.ts GET /facilities/search",
  "ai.ts GET /instant-book/eligible/:carrierId",
  "ai.ts GET /instant-book/load/:loadId",
  "ai.ts POST /facilities/rate",
  "ai.ts POST /instant-book",
  "analytics.ts GET /carriers",
  "analytics.ts GET /earnings",
  "analytics.ts GET /lane-rate/:origin/:dest",
  "analytics.ts GET /lanes",
  "analytics.ts GET /loads",
  "analytics.ts GET /on-time",
  "analytics.ts GET /revenue",
  "analytics.ts GET /shippers",
  "analytics.ts POST /export",
  "apiDocs.ts GET /",
  "auth.ts GET /google/callback",
  "auth.ts GET /me",
  "auth.ts GET /profile",
  "auth.ts PATCH /password",
  "auth.ts PATCH /preferences",
  "auth.ts PATCH /profile",
  "auth.ts POST /check-password",
  "auth.ts POST /e2e-token",
  "auth.ts POST /force-change-password",
  "auth.ts POST /forgot-password",
  "auth.ts POST /login",
  "auth.ts POST /logout",
  "auth.ts POST /refresh",
  "auth.ts POST /register",
  "auth.ts POST /resend-otp",
  "auth.ts POST /reset-password",
  "auth.ts POST /totp/disable",
  "auth.ts POST /totp/force-enable",
  "auth.ts POST /totp/force-setup",
  "auth.ts POST /totp/login-verify",
  "auth.ts POST /totp/setup",
  "auth.ts POST /totp/verify",
  "auth.ts POST /verify-otp",
  "blog.ts GET /categories",
  "blog.ts GET /posts",
  "blog.ts GET /posts/:slug",
  "blog.ts GET /posts/featured",
  "carrier.ts GET /bonuses",
  "carrier.ts GET /dashboard",
  "carrier.ts GET /fmcsa-lookup/:dotNumber",
  "carrier.ts GET /fmcsa-mc-lookup/:mcNumber",
  "carrier.ts GET /onboarding-status",
  "carrier.ts GET /onboarding/status",
  "carrier.ts GET /revenue",
  "carrier.ts GET /scorecard",
  "carrier.ts POST /documents",
  "carrier.ts POST /onboarding/draft",
  "carrier.ts POST /onboarding/invite/accept",
  "carrier.ts POST /onboarding/invite/request-fresh",
  "carrier.ts POST /onboarding/resend",
  "carrier.ts POST /onboarding/verify-code",
  "carrier.ts POST /onboarding/verify-link",
  "carrier.ts POST /register",
  "carrierAuth.ts GET /agreement/:type",
  "carrierAuth.ts POST /change-password",
  "carrierAuth.ts POST /force-change-password",
  "carrierAuth.ts POST /login",
  "carrierAuth.ts POST /logout",
  "carrierAuth.ts POST /resend-otp",
  "carrierAuth.ts POST /totp-verify",
  "carrierAuth.ts POST /verify-email",
  "carrierAuth.ts POST /verify-otp",
  "carriers.ts POST /",
  "chat.ts GET /history",
  "chat.ts GET /proactive",
  "chat.ts POST /",
  "chat.ts POST /new-conversation",
  "chat.ts POST /public",
  "checkCalls.ts GET /load/:loadId",
  "checkCalls.ts GET /recent",
  "delays.ts GET /load/:loadId",
  "documents.ts POST /",
  "documents.ts POST /upload",
  "driverAuth.ts GET /me",
  "driverAuth.ts POST /login",
  "driverAuth.ts POST /logout",
  "driverAuth.ts POST /set-pin",
  "driverPing.ts GET /:token",
  "driverPing.ts POST /:token",
  "driverTraining.ts GET /courses",
  "driverTraining.ts GET /courses/:slug",
  "driverTraining.ts GET /courses/:slug/certificate",
  "driverTraining.ts POST /courses/:slug/lesson-progress",
  "driverTraining.ts POST /courses/:slug/quiz",
  "driverTraining.ts POST /courses/:slug/quiz/check",
  "edi.ts GET /transactions",
  "edi.ts GET /transactions/:id",
  "emailTracking.ts POST /resend-webhook",
  "fmcsa.ts GET /my-profile",
  "index.ts GET /health",
  "integrations.ts GET /",
  "loadAccessorials.ts GET /:loadId",
  "loadBids.ts GET /loadboard",
  "loadBids.ts GET /loads/:loadId/notes",
  "loadBids.ts GET /market-rates",
  "loadExceptions.ts GET /:id",
  "loadExceptions.ts GET /load/:loadId",
  "loadExceptions.ts GET /taxonomy",
  "loadStops.ts GET /:loadId",
  "loadTracking.ts GET /:loadId/detention",
  "loadTracking.ts GET /:loadId/events",
  "loadTracking.ts GET /:loadId/location",
  "loadTracking.ts GET /:loadId/playback",
  "loads.ts GET /",
  "loads.ts GET /:id",
  "loads.ts GET /distance",
  "loads.ts GET /next-bol",
  "mileage.ts GET /calculate",
  "mileage.ts GET /provider",
  "mileage.ts POST /batch",
  "notifications.ts GET /",
  "notifications.ts GET /unread-count",
  "notifications.ts PATCH /:id/read",
  "notifications.ts PATCH /read-all",
  "openPhone.ts POST /webhook",
  "publicAssets.ts GET /brand.css",
  "publicAssets.ts GET /driver-ping.js",
  "quoteApprove.ts POST /",
  "sops.ts GET /",
  "sops.ts GET /:id",
  "sops.ts GET /:id/pdf",
  "ssoAuth.ts GET /google",
  "ssoAuth.ts GET /google/callback",
  // v3.8 commit 11c — the rate-confirmation e-signature. PUBLIC by necessity:
  // a carrier opens this from an email, routinely on a phone, and a login wall
  // between a carrier and the document we need signed is how an RC ages past its
  // SLA for reasons that have nothing to do with the carrier. The single-use,
  // expiring, RC-bound token IS the authorization and it authorizes exactly one
  // act. Same shape as tenderAction and driverPing directly above/below.
  "rcSign.ts GET /:token",
  "rcSign.ts POST /:token",
  "tenderAction.ts GET /:token",
  "trackTraceBoard.ts GET /tracking-token/:loadId",
  "tracking.ts GET /:token",
  "verify.ts GET /:token",
  "verifyCert.ts GET /:code",
  "webhooks.ts POST /inbound-checkcall",
  "webhooks.ts POST /inbound-email",
  "webhooks.ts POST /inbound-email-load",
  "webhooks.ts POST /motive",
  "webhooks.ts POST /openphone",
  "webhooks.ts POST /openphone-checkcall",
  "webhooks.ts POST /resend",
  "webhooks.ts POST /samsara",
  "website.ts POST /contact/website",
  "website.ts POST /leads/website",
];

describe("every route carries an explicit authorize()", () => {
  const routes = collectRoutes();

  it("parser reaches the whole route surface (vacuity tripwire)", () => {
    // If the parser silently stops matching, every assertion below passes for
    // the wrong reason. These floors are well under the 788/644 seen at v3.8.aws.
    expect(routes.length).toBeGreaterThan(700);
    expect(routes.filter((r) => r.gated).length).toBeGreaterThan(600);
    expect(new Set(routes.map((r) => r.file)).size).toBeGreaterThan(80);
  });

  it("no ungated route outside the documented inventory", () => {
    const allowed = new Set(KNOWN_UNGATED);
    const offenders = routes
      .filter((r) => !r.gated && !allowed.has(r.key))
      .map((r) => `${r.file}:${r.line}  ${r.key.split(" ").slice(1).join(" ")}`);

    expect(
      offenders,
      offenders.length
        ? `Route(s) with no authorize() and not on the documented inventory:\n  ` +
          offenders.join("\n  ") +
          `\n\nAdd authorize(...) to the route, or a file-level router.use(authorize(...)). ` +
          `If it is genuinely public, add its key to KNOWN_UNGATED with a reason in the PR.`
        : "",
    ).toEqual([]);
  });

  it("the inventory has no stale entries — it must shrink as routes get gated", () => {
    const live = new Map(routes.map((r) => [r.key, r]));
    const stale = KNOWN_UNGATED.filter((k) => {
      const r = live.get(k);
      return !r || r.gated;
    });

    expect(
      stale,
      stale.length
        ? `KNOWN_UNGATED lists route(s) that are now gated or no longer exist:\n  ` +
          stale.join("\n  ") +
          `\n\nDelete these lines. A stale entry is permission granted to something that moved.`
        : "",
    ).toEqual([]);
  });

  it("the three compliance routes this guard was written for are gated", () => {
    // Named explicitly so a future edit that re-opens them fails on the finding
    // itself, not only on the generic rule above.
    const named = [
      "compliance.ts PATCH /alerts/:id/dismiss",
      "compliance.ts PATCH /alerts/:id/resolve",
      "compliance.ts GET /stats",
    ];
    const byKey = new Map(routes.map((r) => [r.key, r]));
    for (const key of named) {
      const r = byKey.get(key);
      expect(r, `${key} not found — did the route move?`).toBeDefined();
      expect(r!.gated, `${key} lost its authorize()`).toBe(true);
    }
  });
});
