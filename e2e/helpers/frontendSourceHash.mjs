/**
 * carrier-portal-upgrade G48/F1 — is the static export in frontend/out built
 * from the frontend source as it is now?
 *
 * run-local.mjs reused frontend/out whenever the E2E API URL was baked into its
 * chunks. That answers "was it built for this backend", not "was it built from
 * this source", so a frontend edit went untested until somebody deleted out/
 * by hand: E2E passed against the previous build and read as proof of the
 * edit. Measured in the carrier-portal-upgrade arc, where three runs in a row
 * tested a build that predated the change under test.
 *
 * The answer is a content hash of everything the build reads (source, public
 * assets, shared constants, config, lockfile), stored next to the export after
 * a successful build and compared before the next run. Content, not mtime,
 * because a checkout or a stash rewrites mtimes without changing anything.
 * CRLF is normalised in text files so line-ending churn alone does not force a
 * rebuild.
 */
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";

/** What `next build` (and its prebuild) reads, relative to the repo root. */
export const FRONTEND_SOURCE_INPUTS = [
  "frontend/src",
  "frontend/public",
  "shared",
  "frontend/scripts",
  "frontend/next.config.ts",
  "frontend/postcss.config.mjs",
  "frontend/tsconfig.json",
  "frontend/package.json",
  "frontend/package-lock.json",
];

/** Where the hash of the source a build was made from is kept. Inside out/, so it goes when out/ goes. */
export const STAMP_PATH = "frontend/out/.e2e-source-hash";

const SKIP_DIRS = new Set(["node_modules", ".next", "out"]);
const TEXT = /\.(tsx?|jsx?|mjs|cjs|css|html|json|md|svg|txt|xml|webmanifest)$/i;

function walk(abs, rel, out) {
  if (!existsSync(abs)) return;
  const st = statSync(abs);
  if (st.isFile()) {
    out.push([rel, abs]);
    return;
  }
  for (const name of readdirSync(abs).sort()) {
    if (SKIP_DIRS.has(name)) continue;
    walk(path.join(abs, name), rel + "/" + name, out);
  }
}

/** sha256 over every input file's path and content, in a stable order. */
export function frontendSourceHash(root, inputs = FRONTEND_SOURCE_INPUTS) {
  const files = [];
  for (const rel of inputs) walk(path.join(root, rel), rel, files);
  files.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  const h = createHash("sha256");
  for (const [rel, abs] of files) {
    let buf = readFileSync(abs);
    if (TEXT.test(rel)) buf = Buffer.from(buf.toString("utf8").split("\r\n").join("\n"), "utf8");
    h.update(rel);
    h.update("\0");
    h.update(buf);
    h.update("\0");
  }
  return h.digest("hex");
}

/** The hash the current export was built from, or null when there is none. */
export function readStamp(root) {
  const p = path.join(root, STAMP_PATH);
  return existsSync(p) ? readFileSync(p, "utf8").trim() : null;
}

export function writeStamp(root, hash) {
  writeFileSync(path.join(root, STAMP_PATH), hash + "\n");
}

/**
 * Why the export cannot be reused, or null when it can. Both halves are needed:
 * the API URL says the build talks to this run's backend, and the stamp says it
 * was built from this source.
 */
export function staleReason({ apiUrlBaked, stamp, current }) {
  if (!apiUrlBaked) return "API URL not baked in";
  if (!stamp) return "no source stamp (built before this check existed, or by hand)";
  if (stamp !== current) return "frontend source changed since the last build";
  return null;
}
