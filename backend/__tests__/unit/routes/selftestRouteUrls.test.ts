/**
 * The documented selftest URLs must resolve against the REAL router.
 *
 * 2026-08-31, closing Arc PARSER. Arc PARSER's close-out told the founder to open
 * `/api/monitoring/document-chain/selftest`. That path does not exist. The
 * monitoring router's sole mount is `/admin` (routes/index.ts), so the real URL
 * is `/api/admin/document-chain/selftest`, and the wrong one was published in a
 * commit message, a close-out summary, and the version-note block.
 *
 * ═══ WHY A SOURCE GUARD AND NOT A MONITOR PROBE ═══════════════════════════
 *
 * The obvious instinct is a Public Surface Monitor probe: hit the URL tokenless,
 * assert a JSON 401 rather than a plain-text "Cannot GET", and treat a 404 as a
 * missing route. On THIS API that probe cannot discriminate, and shipping it
 * would be a guard that is green whether or not the route exists.
 *
 * Measured against production, 2026-08-31:
 *
 *   GET /api/admin/document-chain/selftest  -> 401 {"error":"No token provided"}
 *   GET /api/admin/no-such-route-xyz        -> 401 {"error":"No token provided"}
 *   GET /api/totally-made-up-namespace/x    -> 401 {"error":"No token provided"}
 *
 * Byte-identical, down to a shared etag.
 *
 * The mechanism is a catch-all: `router.use("/", tenderRoutes)` sits at
 * index.ts:315, `tenders.ts:12` is `router.use(authenticate)`, and `/admin` is
 * mounted at index.ts:349. Every tokenless request not matched by an earlier
 * mount falls into the tender router and is refused there — BEFORE routing ever
 * reaches `/admin`. A 401 proves that middleware ran. It says nothing at all
 * about whether the route on the other side exists.
 *
 * So existence is unobservable without a token, and the monitor holds no
 * credentials. This guard answers the question the probe could not: it reads the
 * actual mount and the actual route definitions, composes the URLs, and fails if
 * the documentation names a path that would not resolve.
 *
 * §19 Sub-pattern 16, eleventh fire — a guard proves the property it asserts,
 * not the property you meant. A JSON-401 assertion asserts "something
 * authenticated"; it does not assert "this route is reachable", and on this API
 * the two answers are the same bytes.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const read = (p: string) => readFileSync(join(__dirname, "../../../", p), "utf8").replace(/\r\n/g, "\n");
const readRepo = (p: string) =>
  readFileSync(join(__dirname, "../../../../", p), "utf8").replace(/\r\n/g, "\n");

const indexSrc = read("src/routes/index.ts");
const monitoringSrc = read("src/routes/monitoring.ts");
const launchDoc = readRepo("docs/internal/launch-readiness.md");
/** The version-note block is where the wrong URL actually shipped. */
const versionFooter = readRepo("frontend/src/components/ui/VersionFooter.tsx");

/** Every mount of the monitoring router, in source order. */
const mounts = [...indexSrc.matchAll(/router\.use\(\s*"([^"]+)"\s*,\s*monitoringRoutes\s*\)/g)].map(
  (m) => m[1],
);

/** Every selftest route the monitoring router defines. */
const selftestPaths = [...monitoringSrc.matchAll(/router\.get\(\s*"(\/[^"]*selftest)"/g)].map(
  (m) => m[1],
);

const RETIRED = "/api/monitoring/";

describe("documented selftest URLs resolve against the real router", () => {
  it("the guard found something to check (reach tripwire)", () => {
    // A guard that silently matched nothing would pass forever. If either regex
    // stops matching — a rename, a reformat, a different mount style — this fails
    // first and names the reason rather than letting the rest go green.
    expect(mounts.length, "no mount of monitoringRoutes found in routes/index.ts").toBeGreaterThan(0);
    expect(selftestPaths.length, "no selftest routes found in routes/monitoring.ts").toBeGreaterThan(0);
    expect(launchDoc.length, "launch-readiness.md read empty").toBeGreaterThan(1000);
    expect(versionFooter.length, "VersionFooter.tsx read empty").toBeGreaterThan(1000);
  });

  it("the monitoring router has exactly ONE mount, so the URLs are unambiguous", () => {
    // Two mounts would mean two working URLs and a doc that is only half right.
    expect(mounts).toEqual(["/admin"]);
  });

  it("both selftests are still defined", () => {
    expect([...selftestPaths].sort()).toEqual(["/document-chain/selftest", "/storage/selftest"]);
  });

  it("launch-readiness.md names the RESOLVED url for every selftest", () => {
    const mount = mounts[0];
    for (const p of selftestPaths) {
      const resolved = "/api" + mount + p;
      expect(launchDoc, "launch-readiness.md must name " + resolved).toContain(resolved);
    }
  });

  it("the retired path appears on NEITHER surface that once published it", () => {
    // Checked on both: the readiness doc, and the version-note block where it
    // actually shipped. A future session writing a version note is the likeliest
    // route back in, because those are written by copying the previous one.
    expect(launchDoc, "retired path reappeared in launch-readiness.md").not.toContain(RETIRED);
    expect(versionFooter, "retired path reappeared in VersionFooter.tsx").not.toContain(RETIRED);
  });

  it("both selftests are admin-gated at the route, not merely by an upstream catch-all", () => {
    // The 401 an unauthenticated caller sees comes from the tender router's
    // catch-all, not from these routes. That is an accident of mount order and
    // must not be mistaken for the gate — so the gate is asserted at the source.
    for (const p of selftestPaths) {
      const line = monitoringSrc.split("\n").find((l) => l.includes('router.get("' + p + '"'));
      expect(line, "no definition line found for " + p).toBeTruthy();
      expect(line, p + " must call authenticate").toContain("authenticate");
      expect(line, p + " must be authorize()-gated").toContain("authorize(");
    }
  });
});
