/**
 * carrier-portal-upgrade G48/F1 — the local E2E runner never reuses a stale
 * frontend build.
 *
 * run-local.mjs reused frontend/out whenever the E2E API URL was baked in, so a
 * frontend edit went untested until out/ was deleted by hand. Reuse now also
 * needs the content hash stamped at the last build to equal the source as it
 * is. Two halves: the helper's behaviour on a fixture tree, and the runner
 * actually consulting it (a helper nobody calls is a guard that is off).
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

const REPO = path.resolve(__dirname, "../../../..");
const helper = path.join(REPO, "e2e/helpers/frontendSourceHash.mjs");

let tmp: string;
let H: any;
beforeEach(async () => {
  H = await import(helper);
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "e2e-hash-"));
  fs.mkdirSync(path.join(tmp, "frontend/src/app"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "frontend/out"), { recursive: true });
  fs.mkdirSync(path.join(tmp, "frontend/node_modules/x"), { recursive: true });
  fs.writeFileSync(path.join(tmp, "frontend/src/app/page.tsx"), 'export default () => "Notifications";\n');
  fs.writeFileSync(path.join(tmp, "frontend/node_modules/x/index.js"), "1");
});
afterEach(() => fs.rmSync(tmp, { recursive: true, force: true }));

describe("frontendSourceHash", () => {
  it("changes when a source string changes", () => {
    const before = H.frontendSourceHash(tmp);
    fs.writeFileSync(path.join(tmp, "frontend/src/app/page.tsx"), 'export default () => "Alerts";\n');
    expect(H.frontendSourceHash(tmp)).not.toBe(before);
  });

  it("does not change for line endings, mtimes, node_modules or the export itself", () => {
    const before = H.frontendSourceHash(tmp);
    fs.writeFileSync(path.join(tmp, "frontend/src/app/page.tsx"), 'export default () => "Notifications";\r\n');
    fs.utimesSync(path.join(tmp, "frontend/src/app/page.tsx"), new Date(2000, 0, 1), new Date(2000, 0, 1));
    fs.writeFileSync(path.join(tmp, "frontend/node_modules/x/index.js"), "2");
    fs.writeFileSync(path.join(tmp, "frontend/out/index.html"), "<html/>");
    expect(H.frontendSourceHash(tmp)).toBe(before);
  });

  it("round-trips the stamp, inside out/ so it goes when out/ goes", () => {
    expect(H.readStamp(tmp)).toBeNull();
    H.writeStamp(tmp, "abc");
    expect(H.readStamp(tmp)).toBe("abc");
    expect(H.STAMP_PATH.startsWith("frontend/out/")).toBe(true);
  });
});

describe("staleReason", () => {
  it("reuses only when the URL is baked in AND the stamp matches the source", () => {
    expect(H.staleReason({ apiUrlBaked: true, stamp: "h", current: "h" })).toBeNull();
    expect(H.staleReason({ apiUrlBaked: false, stamp: "h", current: "h" })).toMatch(/API URL/);
    expect(H.staleReason({ apiUrlBaked: true, stamp: null, current: "h" })).toMatch(/no source stamp/);
    expect(H.staleReason({ apiUrlBaked: true, stamp: "old", current: "new" })).toMatch(/source changed/);
  });
});

describe("e2e/run-local.mjs", () => {
  it("decides reuse with staleReason and stamps after every build", () => {
    const src = fs.readFileSync(path.join(REPO, "e2e/run-local.mjs"), "utf8").split("\r\n").join("\n");
    expect(src).toMatch(/staleReason\(\{\s*apiUrlBaked: baked,\s*stamp: readStamp\(ROOT\),\s*current: frontendSourceHash\(ROOT\)\s*\}\)/);
    const build = src.indexOf('run("npm", ["run", "build"]');
    const stamp = src.indexOf("writeStamp(ROOT, frontendSourceHash(ROOT))");
    expect(build).toBeGreaterThan(0);
    expect(stamp).toBeGreaterThan(build); // the stamp describes the tree the build left
    expect(src).not.toMatch(/if \(baked\) \{\s*say\("\[4\/5\] Frontend\s+\(reused/); // the URL-only rule is gone
  });
});
