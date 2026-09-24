// Write the commit this build came from into the exported site, so the SHA a
// browser receives can be read back.
//
// WHY THIS EXISTS. Cloudflare Pages deploys on its own, outside GitHub Actions,
// and until now the only way to claim "the frontend deployed" was to read an
// Actions job name -- which reports what CI did, never what Cloudflare served.
// The two can disagree: a Pages build can fail, or land, or serve a stale
// bundle from cache, and every one of those looks identical from the Actions
// side. §19 Sub-pattern 16, which is the whole reason this pair of scripts
// exists rather than another green tick.
//
// THE SHA WAS ALREADY HERE AND HAD NO READER. next.config.ts:13 has read
// CF_PAGES_COMMIT_SHA into NEXT_PUBLIC_BUILD_ID for a long time, and
// frontend/src/config/env.ts:45 exports it as BUILD_ID -- with ZERO importers,
// verified by grep. The deployment's own identity was computed on every
// Cloudflare build and then discarded. This writes it somewhere a check can
// reach instead of inventing a new source for it.
//
// WRITES TO out/, NEVER TO public/. public/ is tracked; out/ is gitignored
// (.gitignore:8). Stamping into public/ would dirty a tracked file on every
// build -- which is not hypothetical: inject-chrome.mjs:441-442 rewrites the
// two _partials on every build and they show as modified with an EMPTY diff
// forever after, because git checks them out CRLF and node writes them LF
// (§13.3 Item 268). One of those is enough.
import { writeFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

const OUT_DIR = path.resolve(process.cwd(), "out");
const MARKER = path.join(OUT_DIR, "build-info.json");

/**
 * Where the SHA came from is part of the answer, not trivia: "CF_PAGES" means
 * Cloudflare built it, "GITHUB_SHA" means CI did, "git" means somebody's
 * laptop did, and a checker that cannot tell those apart cannot tell a real
 * deploy from a local one somebody uploaded.
 */
function resolveSha() {
  if (process.env.CF_PAGES_COMMIT_SHA) {
    return { sha: process.env.CF_PAGES_COMMIT_SHA, source: "CF_PAGES_COMMIT_SHA" };
  }
  if (process.env.GITHUB_SHA) {
    return { sha: process.env.GITHUB_SHA, source: "GITHUB_SHA" };
  }
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    if (/^[0-9a-f]{40}$/.test(sha)) return { sha, source: "git" };
  } catch {
    // No git, or not a repository. Fall through -- an honest null beats a guess.
  }
  return { sha: null, source: "unknown" };
}

// A missing out/ after a SUCCESSFUL build means the export target moved
// (next.config.ts `output`), and every later deploy would ship unstamped while
// the check reported a missing marker with no idea why. Fail here, where the
// cause is one line away, rather than there.
if (!existsSync(OUT_DIR)) {
  console.error(
    "[stamp-build] " + OUT_DIR + " does not exist after a successful build.\n" +
      "             next.config.ts sets output: \"export\", which writes out/.\n" +
      "             If that changed, point this script at the new directory --\n" +
      "             leaving it unstamped makes the Pages check unable to verify\n" +
      "             any deploy, and it would fail as 'marker absent' with no cause.",
  );
  process.exit(1);
}

const { sha, source } = resolveSha();
const marker = {
  sha,
  shortSha: sha ? sha.slice(0, 7) : null,
  source,
  ref: process.env.CF_PAGES_BRANCH || process.env.GITHUB_REF_NAME || null,
  builtAt: new Date().toISOString(),
};

writeFileSync(MARKER, JSON.stringify(marker, null, 2) + "\n", "utf8");
console.log(
  "[stamp-build] build-info.json -> " + (marker.shortSha ?? "(no sha)") + " (" + source + ")",
);
