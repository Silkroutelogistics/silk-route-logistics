// Verify that Cloudflare Pages is SERVING a given commit.
//
//   node frontend/scripts/check-pages-deploy.mjs [sha] [--timeout=<s>] [--url=<origin>]
//
// Defaults: sha = `git rev-parse HEAD`, timeout = 420s, url = the production
// origin below. Exit 0 means the deployed site answered with that commit.
//
// THIS REPLACES READING AN ACTIONS JOB NAME FOR THE FRONTEND. Cloudflare Pages
// builds outside GitHub Actions entirely, so no Actions job -- green, red, or
// absent -- is evidence about what Cloudflare served. Citing one as frontend
// deploy verification is the §19 Sub-pattern 16 shape: the check ran, and it
// was not watching the thing its name implied.
//
// WHY IT READS THE SERVED BYTES RATHER THAN CLOUDFLARE'S API. The API reports
// what Cloudflare RECORDED; this reports what a browser RECEIVES, and only the
// second is what a halt card claims. A deployment can be recorded successful
// and still serve a stale bundle from an edge cache. The API mode is also
// unbuildable here and would be untestable if it were built: there is no
// CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID or project id in the repository
// or the environment (verified by `git grep` and `env`), and the Cloudflare MCP
// server reports it needs an authorization this session cannot perform. An
// unexercised verification path is a claim, not a capability -- §13.3 Item 238.
// If it is ever wanted it is strictly additive and belongs behind those three
// env vars, reporting the deployment stage ALONGSIDE this check, never instead
// of it.
//
// EVERY FAILURE IS DISTINCT, because the remedies are different:
//   0  served sha matches            -- deployed
//   1  served a DIFFERENT sha until the timeout  -- deploy is late, failed, or
//                                                   was never triggered
//   2  no marker served at all (404) -- either the deploy predates this script,
//                                       or Cloudflare's build command does not
//                                       run `npm run build` and so never runs
//                                       the postbuild stamp
//   3  marker served but unreadable  -- something is answering that is not the
//                                       marker (a redirect, an error page)
//   4  the check could not run       -- bad arguments, no sha to compare
//
// It NEVER exits 0 on "could not tell". That distinction is the entire reason
// this exists instead of another green tick.
//
// WHY IT SETS process.exitCode INSTEAD OF CALLING process.exit(). Calling
// process.exit() from inside a fetch continuation crashes Node on Windows --
// `Assertion failed: !(handle->flags & UV_HANDLE_CLOSING), src\win\async.c` --
// and the process then reports 127, which conventionally means "command not
// found". A caller would read that as this script being missing rather than as
// the deploy verdict. It was invisible against a localhost HTTP fixture, which
// tears its socket down cleanly, and appeared on the first run against real
// TLS: the fixture proved the logic, only the artifact proved the aim
// (§19 Sub-pattern 16). Setting exitCode and letting the loop drain removes the
// race by construction rather than by timing.
import { execFileSync } from "node:child_process";

const DEFAULT_ORIGIN = "https://silkroutelogistics.ai";
const MARKER_PATH = "/build-info.json";
const POLL_SECONDS = 10;

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const hit = args.find((a) => a.startsWith("--" + name + "="));
  return hit ? hit.slice(name.length + 3) : fallback;
};

function fail(code, message) {
  console.error("\n[pages-check] FAIL: " + message);
  return code;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One read. Returns a verdict rather than throwing, so the caller can decide
 *  whether a given state is worth waiting through or is terminal. */
async function readMarker(target) {
  let res;
  try {
    // no-store on the request pairs with the _headers rule on the response.
    // Both are needed: the header rule keeps the edge from holding a copy, and
    // this keeps any intermediary from handing us one it already has.
    res = await fetch(target, {
      headers: { "Cache-Control": "no-cache, no-store", Pragma: "no-cache" },
      redirect: "follow",
    });
  } catch (e) {
    return { state: "unreachable", detail: e.message };
  }
  const cache = res.headers.get("cf-cache-status");
  const age = res.headers.get("age");
  if (res.status === 404) return { state: "absent", cache, age };
  if (!res.ok) return { state: "unreachable", detail: "HTTP " + res.status, cache, age };

  const body = await res.text();
  let marker;
  try {
    marker = JSON.parse(body);
  } catch {
    return { state: "unparseable", detail: body.slice(0, 120).replace(/\s+/g, " "), cache, age };
  }
  if (typeof marker.sha !== "string" || !marker.sha) {
    return { state: "unstamped", detail: "source=" + marker.source, marker, cache, age };
  }
  return { state: "stamped", marker, cache, age };
}

async function main() {
  const origin = flag("url", DEFAULT_ORIGIN).replace(/\/+$/, "");
  const timeoutSeconds = Number(flag("timeout", "420"));
  const positional = args.find((a) => !a.startsWith("--"));

  if (!Number.isFinite(timeoutSeconds) || timeoutSeconds <= 0) {
    return fail(4, "--timeout must be a positive number of seconds, got " + flag("timeout", "420"));
  }

  let expected = positional;
  if (!expected) {
    try {
      expected = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
    } catch (e) {
      return fail(4, "no sha argument and `git rev-parse HEAD` failed: " + e.message);
    }
  }
  if (!/^[0-9a-f]{7,40}$/.test(expected)) {
    return fail(4, "'" + expected + "' is not a commit sha. Pass the full 40-character sha you pushed.");
  }

  const target = origin + MARKER_PATH;
  console.log("[pages-check] expecting " + expected.slice(0, 7) + " at " + target);
  console.log("[pages-check] polling every " + POLL_SECONDS + "s for up to " + timeoutSeconds + "s");

  const deadline = Date.now() + timeoutSeconds * 1000;
  let last = null;
  let sawMarker = false;

  while (true) {
    const r = await readMarker(target);
    last = r;
    const cacheNote = r.cache
      ? "  [cf-cache-status: " + r.cache + (r.age ? ", age=" + r.age : "") + "]"
      : "";

    if (r.state === "stamped") {
      sawMarker = true;
      // Accept a prefix match so a short sha can be passed, but compare on the
      // SHORTER of the two so a 7-char served sha cannot silently satisfy a
      // different 40-char expectation.
      const n = Math.min(r.marker.sha.length, expected.length);
      if (r.marker.sha.slice(0, n) === expected.slice(0, n)) {
        console.log(
          "\n[pages-check] PASS: Cloudflare Pages is serving " +
            r.marker.sha.slice(0, 7) +
            " (source " +
            r.marker.source +
            ", built " +
            r.marker.builtAt +
            ")" +
            cacheNote,
        );
        return 0;
      }
      console.log(
        "[pages-check] serving " +
          r.marker.sha.slice(0, 7) +
          ", waiting for " +
          expected.slice(0, 7) +
          cacheNote,
      );
    } else if (r.state === "absent") {
      console.log("[pages-check] no marker at " + MARKER_PATH + " yet" + cacheNote);
    } else if (r.state === "unstamped") {
      sawMarker = true;
      console.log("[pages-check] marker served but carries no sha (" + r.detail + ")" + cacheNote);
    } else if (r.state === "unparseable") {
      sawMarker = true;
      console.log("[pages-check] marker did not parse as JSON: " + r.detail + cacheNote);
    } else {
      console.log("[pages-check] unreachable: " + r.detail + cacheNote);
    }

    if (Date.now() + POLL_SECONDS * 1000 >= deadline) break;
    await sleep(POLL_SECONDS * 1000);
  }

  // Timed out. Which failure it is decides what to do next, so say which.
  if (last.state === "absent" && !sawMarker) {
    return fail(
      2,
      MARKER_PATH +
        " is not served at " +
        origin +
        " after " +
        timeoutSeconds +
        "s.\n" +
        "       Either the deployed commit predates this check, or Cloudflare's build\n" +
        "       command does not run `npm run build` and so never runs the postbuild\n" +
        "       stamp (frontend/package.json `postbuild` -> scripts/stamp-build.mjs).\n" +
        "       Cloudflare's build command is dashboard state and cannot be read from\n" +
        "       here -- check it in the Pages project settings.",
    );
  }
  if (last.state === "unparseable") {
    return fail(3, MARKER_PATH + " is served but is not the marker: " + last.detail);
  }
  if (last.state === "unstamped") {
    return fail(
      3,
      MARKER_PATH +
        " is served with no sha (" +
        last.detail +
        ") -- the build could not resolve a commit, so the deploy cannot be " +
        "attributed to one.",
    );
  }
  if (last.state === "unreachable") {
    return fail(4, "could not reach " + target + ": " + last.detail);
  }
  return fail(
    1,
    "after " +
      timeoutSeconds +
      "s the site still serves " +
      last.marker.sha.slice(0, 7) +
      ", not " +
      expected.slice(0, 7) +
      ".\n" +
      "       The Pages build for this commit is late, failed, or was never triggered.",
  );
}

process.exitCode = await main();
