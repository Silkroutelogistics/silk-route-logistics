/**
 * Every custom header the frontend sends must be allowed by CORS.
 *
 * THE BUG THIS EXISTS FOR. Arc 11 added `x-step-up-token` on the CLIENT —
 * useStepUp replays the original write with it after a code is accepted — and
 * nothing on the server was updated. `Access-Control-Allow-Headers` listed
 * Content-Type, Authorization and X-Requested-With, so the browser refused the
 * preflight and blocked EVERY step-up-gated write before it was sent.
 *
 * Measured on production before the fix:
 *
 *   OPTIONS /api/carrier-auth/quickpay-election
 *     Access-Control-Request-Headers: content-type,x-step-up-token
 *   ->  access-control-allow-headers: Content-Type,Authorization,X-Requested-With
 *
 * A blocked preflight throws a network error with no response, so the portal
 * fell through to its generic message and told a carrier entering a CORRECT
 * code that the code was wrong. It took a screenshot from production to find.
 *
 * §19 Sub-pattern 5 — the two ends of a contract, changed one at a time. The
 * client end was right, the server end was never told, and nothing compared
 * them. This compares them, and derives the requirement from the frontend
 * SOURCE rather than a second list that would drift the same way.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "fs";
import { join } from "path";

const REPO = join(__dirname, "../../../../");
const serverSrc = readFileSync(join(REPO, "backend/src/server.ts"), "utf8").replace(/\r\n/g, "\n");

/** Walk the frontend for custom x-* request headers it sets. */
function collectFrontendHeaders(): { header: string; file: string }[] {
  const out: { header: string; file: string }[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) {
        walk(p);
        continue;
      }
      if (!/\.tsx?$/.test(name)) continue;
      const body = readFileSync(p, "utf8");
      for (const m of body.matchAll(/["'](x-[a-z0-9-]+)["']\s*:/gi)) {
        out.push({ header: m[1].toLowerCase(), file: p.replace(REPO, "") });
      }
    }
  };
  walk(join(REPO, "frontend/src"));
  return out;
}

const frontendHeaders = collectFrontendHeaders();

/** The single constant both CORS surfaces are built from. */
const allowList = (() => {
  const m = serverSrc.match(/const ALLOWED_REQUEST_HEADERS = \[([^\]]+)\]/);
  if (!m) return null;
  return m[1]
    .split(",")
    .map((s) => s.trim().replace(/^["']|["']$/g, "").toLowerCase())
    .filter(Boolean);
})();

describe("CORS allows every custom header the client sends", () => {
  it("the scan reached both ends (tripwire)", () => {
    // If either side stops matching, this fails FIRST and names why, instead of
    // an empty-set comparison passing vacuously — the exact shape that would
    // hide the next occurrence of this bug.
    expect(allowList, "ALLOWED_REQUEST_HEADERS not found in server.ts").not.toBeNull();
    expect(allowList!.length, "allow-list parsed empty").toBeGreaterThan(2);
    expect(
      frontendHeaders.length,
      "no custom x-* headers found in frontend/src — the walker matched nothing",
    ).toBeGreaterThan(0);
  });

  it("every custom header the frontend sets is in the allow-list", () => {
    for (const { header, file } of frontendHeaders) {
      expect(
        allowList,
        header + " is sent by " + file + " but is not in ALLOWED_REQUEST_HEADERS — the browser blocks the request before it is sent",
      ).toContain(header);
    }
  });

  it("x-step-up-token specifically, because it was the one that shipped broken", () => {
    expect(allowList).toContain("x-step-up-token");
  });

  it("BOTH cors surfaces are built from the constant, not from literals", () => {
    // The explicit app.options("*") handler runs FIRST and is what a browser
    // actually reads on a preflight; cors(corsOptions) covers the real request.
    // Two literals would agree only until somebody edited one of them.
    expect(serverSrc).toContain("allowedHeaders: ALLOWED_REQUEST_HEADERS");
    expect(serverSrc).toContain('res.setHeader("Access-Control-Allow-Headers", ALLOWED_REQUEST_HEADERS.join(","))');
    // And no stale hard-coded list survives anywhere in the file.
    expect(serverSrc).not.toContain('"Content-Type,Authorization,X-Requested-With"');
  });
});
