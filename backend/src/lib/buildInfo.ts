// What build is this process actually running?
//
// Until now the answer was inference. `/api/health` reported version "1.0.0"
// straight from package.json, which never changes, so confirming a deploy meant
// correlating the reported uptime against the time of a push and hoping the
// arithmetic held. That is not verification — it cannot distinguish "the deploy
// landed" from "the service restarted for an unrelated reason a minute later".
//
// Render injects RENDER_GIT_COMMIT into the runtime environment on every
// deploy, with no API key required, so the deployed commit can simply be read.
//
// The SHA is exposed in its short (8-char) form, which is what anyone actually
// compares against `git rev-parse --short HEAD`. The repository is private, so a
// commit hash on its own identifies a build to an operator and gives an outsider
// nothing to act on — this is the same build-identity convention most production
// APIs expose, and it is the whole point of the endpoint.

/**
 * Captured once, at module load — which for a module imported by server.ts is
 * process start. Deliberately not recomputed per request: `uptime` already
 * answers "how long has this been up", and what was missing is a fixed instant
 * that can be compared against a deploy time.
 */
const BOOTED_AT = new Date().toISOString();

/**
 * The deployed commit. RENDER_GIT_COMMIT is what Render sets; GIT_COMMIT and
 * SOURCE_VERSION are accepted so the same endpoint stays truthful under other
 * runners rather than silently reporting "local" in CI or a container.
 */
const RAW_SHA =
  process.env.RENDER_GIT_COMMIT ||
  process.env.GIT_COMMIT ||
  process.env.SOURCE_VERSION ||
  "local";

export const BUILD_SHA_FULL = RAW_SHA;
export const BUILD_SHA = RAW_SHA === "local" ? "local" : RAW_SHA.slice(0, 8);

export interface BuildInfo {
  /** Short commit SHA, or "local" when no runner injected one. */
  sha: string;
  /** ISO timestamp of process start. Fixed for the life of the process. */
  bootedAt: string;
  /** package.json version. Kept for backwards compatibility with existing consumers. */
  version: string;
}

export function buildInfo(): BuildInfo {
  return { sha: BUILD_SHA, bootedAt: BOOTED_AT, version: "1.0.0" };
}
