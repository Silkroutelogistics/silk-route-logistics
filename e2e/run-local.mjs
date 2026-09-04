/**
 * Run the E2E lifecycle smoke locally, at CI parity, in one command.
 *
 * WHY THIS EXISTS. E2E is the job that goes red, and it is the job nobody runs
 * before pushing. On 2026-09-01 it was red across eighteen runs, and THREE of
 * the four root causes were the same shape: a contract changed (an added
 * required field, a new consent step, a retired override policy) and the E2E
 * fixture did not catch up in the same commit. Every one of those was
 * catchable in about a minute locally. None was caught, because "run it
 * locally" meant hand-assembling a Postgres container, an extension, a schema
 * push, a seed, a frontend rebuild with the right API URL baked in, and ten
 * environment variables — and getting any of them wrong fails in a way that
 * looks like a product bug rather than a setup bug.
 *
 * THE ENV IS READ OUT OF ci.yml, NOT COPIED FROM IT. A second hand-kept copy
 * of CI's environment is a copy that drifts, and the drift shows up as a local
 * PASS over a CI FAILURE — the most expensive outcome for a pre-push gate,
 * because it teaches you to distrust the red. So the e2e job's `env:` block is
 * parsed and used as-is, and REQUIRED_KEYS below fails loudly if that block
 * stops carrying something this script depends on.
 *
 * WHAT IS AND IS NOT AUTOMATED. A process holding the backend or frontend port
 * that this run did not start is reported with its PID and start time and left
 * alone. Killing a server somebody else is using, to save them one command, is
 * not a trade this script gets to make on their behalf.
 *
 * What it DOES stop is what it started. Playwright spawns those servers itself,
 * so this script never holds their PIDs — but it verifies both ports free
 * immediately before Playwright runs, so anything on them afterwards whose
 * process began after that moment is its own. Four consecutive PASSING runs
 * each left a live backend on 3010, and the next run tripped over it.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const CONTAINER = process.env.E2E_LOCAL_CONTAINER || "srl-e2e-local";
const PG_PORT = process.env.E2E_LOCAL_PG_PORT || "55440";
const BACKEND_PORT = 3110; // playwright.config.ts — dedicated, off the dev-server range
const FRONTEND_PORT = 4100; // playwright.config.ts

/** Keys this script relies on. Absent from ci.yml => fail, never guess. */
const REQUIRED_KEYS = [
  "JWT_SECRET",
  "ENCRYPTION_KEY",
  "E2E_BYPASS_OTP",
  "E2E_FIXTURES",
  "NEXT_PUBLIC_API_URL",
];

const say = (m) => console.log(m);
const die = (m) => {
  console.error("\n  x  " + m + "\n");
  process.exit(1);
};

// npm/npx are .cmd shims on Windows and need a shell; docker and node do
// not, and passing shell to them only earns a DEP0190 warning per call.
const needsShell = (cmd) => process.platform === "win32" && /^(npm|npx)$/.test(cmd);
const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", shell: needsShell(cmd), ...opts });
  if (r.status !== 0) die(cmd + " " + args.join(" ") + " failed (exit " + r.status + ")");
};
const quiet = (cmd, args, opts = {}) =>
  spawnSync(cmd, args, { encoding: "utf8", shell: needsShell(cmd), ...opts });

/**
 * Pull the e2e job's `env:` block out of ci.yml.
 *
 * Deliberately narrow: walk from the `e2e:` job key to its `env:` mapping and
 * read the flat KEY: value pairs beneath, stopping when the indent leaves that
 * mapping. A structural change in ci.yml makes this return too little, which
 * REQUIRED_KEYS turns into a loud failure rather than a silent fallback to
 * stale values.
 */
function ciEnv() {
  const file = path.join(ROOT, ".github/workflows/ci.yml");
  if (!existsSync(file)) die("ci.yml not found at " + file);
  const lines = readFileSync(file, "utf8").split(/\r?\n/);

  const jobAt = lines.findIndex((l) => /^ {2}e2e:\s*$/.test(l));
  if (jobAt === -1) die("no `e2e:` job in ci.yml — CI layout changed; update e2e/run-local.mjs");

  let envAt = -1;
  for (let i = jobAt + 1; i < lines.length; i++) {
    if (/^ {2}\S/.test(lines[i])) break; // reached the next top-level job
    if (/^ {4}env:\s*$/.test(lines[i])) {
      envAt = i;
      break;
    }
  }
  if (envAt === -1) die("`e2e:` job has no `env:` block — update e2e/run-local.mjs");

  const out = {};
  for (let i = envAt + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*(#.*)?$/.test(line)) continue; // blank or comment
    if (!/^ {6}\S/.test(line)) break; // left the env mapping
    const m = line.match(/^ {6}([A-Z0-9_]+):\s*(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

/**
 * Is anything LISTENING on this port, on any interface?
 *
 * This used to bind 127.0.0.1 and report free if the bind succeeded. On Windows
 * that is not the same question: a server bound to 0.0.0.0 does NOT prevent a
 * second bind to 127.0.0.1, so the check returned "free" over a live server and
 * the run died three steps later inside Playwright with a confusing message.
 * Measured: with a holder on 0.0.0.0, binding 127.0.0.1 SUCCEEDS and binding
 * 0.0.0.0 gives EADDRINUSE.
 *
 * Connecting answers the question that is actually being asked — is someone
 * serving here — and is the same answer Playwright's own probe gets, which is
 * what makes this refuse before Playwright does rather than after.
 */
const portInUse = (port) =>
  new Promise((resolve) => {
    const s = net.connect({ port, host: "127.0.0.1" });
    const done = (v) => { s.destroy(); resolve(v); };
    s.once("connect", () => done(true));
    s.once("error", () => done(false));
    s.setTimeout(1500, () => done(false));
  });

/**
 * PID listening on a port, or null. Best effort: used for reporting and for
 * attribution, never as the sole basis for killing anything.
 *
 * Parsed by TOKEN rather than by regex, deliberately. The first version matched
 * the line against a RegExp built with a backslash escape, the escape was eaten
 * on its way into this file, and the pattern silently became ":3010s" — which
 * matches nothing, so every port reported "pid unknown" while the netstat call
 * itself was working perfectly. Splitting on spaces needs no escape at all and
 * is stricter: it compares the local-address column rather than searching the
 * whole line, so a foreign port that merely CONTAINS these digits cannot match.
 */
function portPid(port) {
  if (process.platform === "win32") {
    const r = quiet("netstat", ["-ano"]);
    for (const line of (r.stdout || "").split("\n")) {
      const p = line.trim().split(" ").filter(Boolean);
      // TCP  <local>  <foreign>  LISTENING  <pid>
      if (p.length < 5 || p[3] !== "LISTENING") continue;
      if (!p[1].endsWith(":" + port)) continue;
      const pid = Number(p[4]);
      if (Number.isInteger(pid) && pid > 0) return pid;
    }
    return null;
  }
  const r = quiet("sh", ["-c", "lsof -t -i:" + port + " -sTCP:LISTEN 2>/dev/null | head -1"]);
  const pid = Number((r.stdout || "").trim());
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function pidStartedAt(pid) {
  if (pid == null) return null;
  if (process.platform === "win32") {
    const r = quiet("powershell", ["-NoProfile", "-Command",
      "(Get-Process -Id " + pid + " -ErrorAction SilentlyContinue).StartTime.ToUniversalTime().ToString('o')"]);
    const t = Date.parse((r.stdout || "").trim());
    return Number.isFinite(t) ? t : null;
  }
  const r = quiet("sh", ["-c", "ps -o lstart= -p " + pid + " 2>/dev/null"]);
  const t = Date.parse((r.stdout || "").trim());
  return Number.isFinite(t) ? t : null;
}

function killPid(pid) {
  if (process.platform === "win32") quiet("taskkill", ["/F", "/PID", String(pid)]);
  else quiet("kill", ["-9", String(pid)]);
}

/**
 * THE RUN OWNS WHAT IT STARTED, AND NOTHING ELSE.
 *
 * Playwright spawns the backend and frontend itself (its `webServer` blocks),
 * so this script never holds their PIDs directly — it cannot simply record what
 * it spawned. What it CAN establish is that both ports were verified free
 * immediately before Playwright started. Anything listening on them afterwards
 * whose process began AFTER that moment was therefore started by this run.
 *
 * A process that predates the run is somebody else's and is left alone, loudly.
 * That is the same rule the header states about never killing a server somebody
 * else is using; what changes is that the run now cleans up after ITSELF, which
 * it was not doing — four consecutive passing runs each left a live backend on
 * 3010, and the next run then tripped over it.
 *
 * Registered on `exit` rather than written as a `finally`, because `die()` calls
 * process.exit and a finally would not run on that path. Exit handlers must be
 * synchronous, which is why every helper above uses spawnSync.
 */
let runStartedAt = null;
let cleanupArmed = false;
function cleanupOwnServers() {
  if (runStartedAt == null) return;
  for (const [port, what] of [[BACKEND_PORT, "backend"], [FRONTEND_PORT, "frontend"]]) {
    const pid = portPid(port);
    if (pid == null) continue;
    const started = pidStartedAt(pid);
    if (started != null && started < runStartedAt - 2000) {
      say("  !  port " + port + " (" + what + ") is held by pid " + pid +
          " started " + new Date(started).toISOString() + ", which predates this run. Left alone.");
      continue;
    }
    killPid(pid);
    say("  ·  stopped " + what + " (pid " + pid + ") on port " + port);
  }
}

// ── 0. preflight ────────────────────────────────────────────────────────────
if (quiet("docker", ["version", "--format", "{{.Server.Version}}"]).status !== 0) {
  die("Docker is not available. It hosts the throwaway Postgres this run needs.");
}

for (const [port, what] of [[BACKEND_PORT, "backend"], [FRONTEND_PORT, "frontend"]]) {
  if (await portInUse(port)) {
    const pid = portPid(port);
    const started = pidStartedAt(pid);
    const how = process.platform === "win32"
      ? "taskkill /F /PID " + (pid ?? "<pid>")
      : "kill " + (pid ?? "<pid>");
    die(
      "Port " + port + " (" + what + ") is already serving.\n" +
        "     Held by pid " + (pid ?? "unknown") +
        (started ? ", started " + new Date(started).toISOString() : ", start time unavailable") + ".\n" +
        "     Playwright starts its own servers and will not reuse it.\n" +
        "     This run did not start that process, so it will not stop it.\n" +
        "     If it is yours:  " + how
    );
  }
}

// Both ports verified free. From here anything appearing on them belongs to
// this run, which is what makes the exit cleanup safe.
runStartedAt = Date.now();
if (!cleanupArmed) {
  process.on("exit", cleanupOwnServers);
  cleanupArmed = true;
}

const env = ciEnv();
const missing = REQUIRED_KEYS.filter((k) => !(k in env));
if (missing.length) {
  die("ci.yml e2e env is missing: " + missing.join(", ") + " — update e2e/run-local.mjs");
}

// The local Postgres replaces CI's service container; everything else is CI's.
const DB = "postgresql://ci:ci@localhost:" + PG_PORT + "/ci";
const E = {
  ...process.env,
  ...env,
  DATABASE_URL: DB,
  DIRECT_URL: DB,
  // §19 Sub-pattern 20 — absence is not neutralization. Explicitly empty, so a
  // path that would send is inert rather than picking a real key out of
  // backend/.env via dotenv.
  RESEND_API_KEY: "",
  QUO_API_KEY: "",
  OPENPHONE_API_KEY: "",
  S3_BUCKET_NAME: "",
  AWS_ACCESS_KEY_ID: "",
};

// ── 1. throwaway database ───────────────────────────────────────────────────
say("\n[1/5] Postgres  (container " + CONTAINER + ", port " + PG_PORT + ")");
if (quiet("docker", ["inspect", "-f", "{{.State.Running}}", CONTAINER]).stdout.trim() !== "true") {
  quiet("docker", ["rm", "-f", CONTAINER]);
  run(
    "docker",
    ["run", "-d", "--name", CONTAINER,
      "-e", "POSTGRES_USER=ci", "-e", "POSTGRES_PASSWORD=ci", "-e", "POSTGRES_DB=ci",
      "-p", PG_PORT + ":5432", "postgres:16"],
    { stdio: "ignore" }
  );
}
// Probe with a real query, not pg_isready. The postgres entrypoint runs a
// TEMPORARY server during initdb, and pg_isready answers yes to it — so a
// readiness check that trusts it races the real server coming up, and the
// first actual statement then fails with a bare "exit 2". Ask the database
// the question you actually need answered.
let ready = false;
for (let i = 0; i < 60; i++) {
  if (quiet("docker", ["exec", CONTAINER, "psql", "-U", "ci", "-d", "ci", "-tAc", "SELECT 1"]).stdout.trim() === "1") {
    ready = true;
    break;
  }
  await new Promise((r) => setTimeout(r, 1000));
}
if (!ready) die("Postgres did not accept a query within 60s.");
// citext: User.email is @db.Citext (v3.8.ale), and `db push` bypasses the
// migration that would otherwise create the extension.
run("docker", ["exec", CONTAINER, "psql", "-U", "ci", "-d", "ci", "-c", "CREATE EXTENSION IF NOT EXISTS citext;"], {
  stdio: "ignore",
});

// ── 2. schema ───────────────────────────────────────────────────────────────
say("[2/5] Schema     (prisma db push)");
run("npx", ["prisma", "db", "push", "--skip-generate"], { cwd: path.join(ROOT, "backend"), env: E });

// ── 3. seed ─────────────────────────────────────────────────────────────────
say("[3/5] Seed       (E2E fixtures)");
const seed = quiet("npx", ["prisma", "db", "seed"], { cwd: path.join(ROOT, "backend"), env: E });
if (seed.status !== 0) {
  process.stdout.write(seed.stdout || "");
  process.stderr.write(seed.stderr || "");
  die("seed failed");
}
// "The seed command has been executed" prints even when the command was
// tokenised away and nothing ran (§19 Sub-pattern 16, ninth fire). The fixture
// lines are the only proof the seed actually did its work.
const fixtures = (seed.stdout.match(/E2E fixtures:/g) || []).length;
if (fixtures === 0) {
  die("seed reported success but wrote no E2E fixtures — check E2E_FIXTURES and prisma/seed.ts");
}
say("       " + fixtures + " fixture groups written");

// ── 4. frontend ─────────────────────────────────────────────────────────────
// NEXT_PUBLIC_* is INLINED AT BUILD TIME. A build made without the E2E API URL
// leaves the browser calling the wrong origin, and the test then dies at B5
// with "element(s) not found" — which reads exactly like a frontend
// regression. Verify the artifact rather than assume the build is current.
const apiUrl = E.NEXT_PUBLIC_API_URL;
const chunkDir = path.join(ROOT, "frontend/out/_next/static/chunks");
const baked =
  existsSync(chunkDir) &&
  readdirSync(chunkDir)
    .filter((f) => f.endsWith(".js"))
    .some((f) => readFileSync(path.join(chunkDir, f), "utf8").includes(apiUrl));

if (baked) {
  say("[4/5] Frontend   (reused — " + apiUrl + " already baked in)");
} else {
  say("[4/5] Frontend   (rebuilding — needs " + apiUrl + " baked in)");
  run("npm", ["run", "build"], { cwd: path.join(ROOT, "frontend"), env: E });
}

// ── 5. test ─────────────────────────────────────────────────────────────────
say("[5/5] Playwright\n");
const t = spawnSync("npx", ["playwright", "test", "--reporter=list", ...process.argv.slice(2)], {
  cwd: ROOT,
  stdio: "inherit",
  shell: needsShell("npx"),
  env: { ...E, CI: "true" }, // retries + no server reuse, exactly as CI runs it
});
say("\nDatabase left running for inspection:  docker exec -it " + CONTAINER + " psql -U ci -d ci");
say("Remove it with:                        docker rm -f " + CONTAINER + "\n");
process.exit(t.status ?? 1);
