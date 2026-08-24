/**
 * ARC 33 — every action URL in an email or in-app notification must point at a
 * page that exists.
 *
 * WHY A GUARD RATHER THAN A SWEEP. v3.8.abc (§13.3 Item 91) already fixed this
 * class once: three carrier emails pointed at AE-console paths. That fix
 * corrected the /dashboard → /carrier/dashboard prefix and landed on
 * `/carrier/dashboard/loads`, which is not a route — the carrier load pages are
 * `my-loads`, `available-loads` and `loadboard`. So the email every tendered
 * carrier receives shipped a 404 from that day until Arc 33, and nothing
 * noticed, because a wrong-but-plausible path looks exactly like a right one in
 * a diff. A sweep finds today's; only a guard finds tomorrow's.
 *
 * WHAT IT CHECKS. Static action URLs only. Interpolated ones (`${base}/x/${id}`)
 * cannot be resolved without running the code, so they are counted and REPORTED
 * rather than silently dropped — a guard that quietly ignores part of its
 * subject reads as coverage it does not have.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const REPO = path.resolve(__dirname, "../../../..");
const BACKEND_SRC = path.join(REPO, "backend", "src");
const APP_DIR = path.join(REPO, "frontend", "src", "app");
const PUBLIC_DIR = path.join(REPO, "frontend", "public");

const RE_PAGE = /[/\\]page\.tsx?$/;
const RE_ROUTE_GROUP = /^\(.*\)$/;
const RE_DYNAMIC_SEG = /^\[.*\]$/;
const RE_HTML_SUFFIX = /\.html$/;
const RE_INDEX_HTML = /\/index\.html$/;
const RE_ASSET = /\.(gif|png|jpe?g|svg|ico|css|js|pdf|webp|woff2?)$/i;
const RE_ABS_LINK = /https:\/\/silkroutelogistics\.ai(\/[^"'`\s)>]*)/g;
const RE_ACTION_URL = /actionUrl:\s*[`"']([^`"']*)[`"']/g;

function walk(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === ".next") continue;
      walk(p, out);
    } else out.push(p);
  }
  return out;
}

/** Routes the Next.js app router serves, plus the static HTML pages. */
function realRoutes(): Set<string> {
  const routes = new Set<string>(["/"]);

  for (const f of walk(APP_DIR)) {
    if (!RE_PAGE.test(f)) continue;
    const rel = path.relative(APP_DIR, path.dirname(f)).split(path.sep).join("/");
    // Route groups like (marketing) do not appear in the URL.
    const cleaned = rel.split("/").filter((s) => s && !RE_ROUTE_GROUP.test(s)).join("/");
    routes.add("/" + cleaned);
  }

  for (const f of walk(PUBLIC_DIR)) {
    if (!f.endsWith(".html")) continue;
    const rel = path.relative(PUBLIC_DIR, f).split(path.sep).join("/");
    routes.add("/" + rel.replace(RE_HTML_SUFFIX, ""));
    routes.add("/" + rel);
  }

  return routes;
}

/**
 * Served literally, via a dynamic segment (`/track/[token]` serves
 * `/track/abc`), or via a redirect that lands somewhere real.
 */
function isServed(urlPath: string, routes: Set<string>): boolean {
  const clean = urlPath.replace(/[?#].*$/, "").replace(/\/+$/, "") || "/";
  if (routes.has(clean)) return true;

  // A .html variant 301/308s to its extensionless route — verified on
  // production for /ae/loads.html and /carrier/login.html. A redirect lands the
  // reader somewhere real, so flagging it is a false positive, and a guard that
  // cries wolf is one people learn to ignore.
  if (RE_INDEX_HTML.test(clean) && routes.has(clean.replace(RE_INDEX_HTML, ""))) return true;
  if (RE_HTML_SUFFIX.test(clean) && routes.has(clean.replace(RE_HTML_SUFFIX, ""))) return true;
  // The legacy /ae/* surface is redirect-served (confirmed 301 on production).
  if (clean.startsWith("/ae/")) return true;

  const parts = clean.split("/").filter(Boolean);
  for (const r of routes) {
    const rp = r.split("/").filter(Boolean);
    if (rp.length !== parts.length) continue;
    if (rp.every((seg, i) => seg === parts[i] || RE_DYNAMIC_SEG.test(seg))) return true;
  }
  return false;
}

type Found = { file: string; line: number; url: string };

/** Absolute links and in-app actionUrls, from anything that emails or notifies. */
function collect(): { statics: Found[]; dynamicCount: number } {
  const statics: Found[] = [];
  let dynamicCount = 0;

  for (const f of walk(BACKEND_SRC).filter((x) => x.endsWith(".ts") && !x.endsWith(".d.ts"))) {
    const rel = path.relative(REPO, f).split(path.sep).join("/");
    fs.readFileSync(f, "utf8").split(/\r?\n/).forEach((line, i) => {
      const hits: string[] = [];
      for (const m of line.matchAll(RE_ABS_LINK)) hits.push(m[1]);
      for (const m of line.matchAll(RE_ACTION_URL)) hits.push(m[1]);

      for (const h of hits) {
        // Interpolated — needs the runtime. Counted, never silently dropped.
        if (h.includes("${") || h.includes("`")) { dynamicCount++; continue; }
        if (!h.startsWith("/")) continue;
        if (RE_ASSET.test(h)) continue;                       // asset, not a page
        if (h.includes("<") || h.includes(">")) continue;     // doc-comment placeholder
        if (h.startsWith("/api/")) continue;                  // backend, not the router
        statics.push({ file: rel, line: i + 1, url: h });
      }
    });
  }
  return { statics, dynamicCount };
}

describe("email + notification action URLs point at pages that exist", () => {
  const routes = realRoutes();
  const { statics, dynamicCount } = collect();

  it("tripwire: the route map and the URL scan both found real data", () => {
    // Without this, an empty scan or an empty route set would make everything
    // below pass while checking nothing.
    expect(routes.size).toBeGreaterThan(40);
    expect(statics.length).toBeGreaterThan(10);
    expect(routes.has("/carrier/dashboard/my-loads")).toBe(true);
    // The exact path that shipped a 404 for months. If it ever becomes real the
    // guard stops meaning what it says, so assert it is still not a route.
    expect(routes.has("/carrier/dashboard/loads")).toBe(false);
  });

  it("every static action URL resolves to a real page", () => {
    const broken = statics.filter((s) => !isServed(s.url, routes));
    expect(
      broken.map((b) => `${b.file}:${b.line} -> ${b.url}`),
      "These point at pages that do not exist. Whoever clicks them gets a 404.",
    ).toEqual([]);
  });

  it("the all-roles password reminder resolves its path from the recipient", () => {
    // The Arc 28 audience class, narrowed to the one case judgeable statically.
    // schedulerService emails EVERY role — its query has no role filter — so a
    // hardcoded destination is wrong for most recipients.
    //
    // A filename-based version of this check was written first and REMOVED: it
    // flagged carrierLoads.ts and shipperNotificationService.ts, whose
    // notifications go to load.posterId — the AE — where /dashboard/* is
    // correct. Recipient is not statically derivable in general, and false
    // positives are how a guard gets ignored.
    const scheduler = fs.readFileSync(
      path.join(BACKEND_SRC, "services", "schedulerService.ts"),
      "utf8",
    );
    expect(scheduler).toContain("settingsPathForRole(user.role)");
    expect(scheduler).toContain("daysLeft, user.role)");
    expect(scheduler).not.toContain('actionUrl: "/dashboard/settings"');
  });

  it("reports how many URLs it could not check, rather than hiding them", () => {
    // Not a correctness assertion — a statement of this guard's reach.
    // Interpolated URLs need the runtime; the arc proof scripts cover those.
    // Silent truncation is what makes a guard read as broader than it is.
    expect(dynamicCount).toBeGreaterThanOrEqual(0);
    console.log(
      `  [action-url guard] ${statics.length} static URLs checked, ${dynamicCount} interpolated skipped (runtime-resolved; covered by the arc proofs).`,
    );
  });
});
