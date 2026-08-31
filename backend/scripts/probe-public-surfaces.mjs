#!/usr/bin/env node
/**
 * SYNTHETIC MONITORING OF THE PUBLIC SURFACE — Arc 28, hardened Arc 29.
 *
 * WHY THIS EXISTS
 *
 * Carrier login returned 401 "No token provided" in production for ~27 hours
 * and nothing noticed. Not CI (green — the defect compiled and tested fine),
 * not the health check (`/api/health` was 200 throughout), not error rates (a
 * 401 is not an error). It was found by the founder walking the site.
 *
 * THE LESSON THAT SHAPES THIS FILE: assert the SHAPE, not the status.
 *
 * A status-only table reads broken-as-fixed and fixed-as-broken. The FIXED
 * login returns 401 — the handler's own "Invalid credentials" for a garbage
 * password — which is indistinguishable by status code from the BROKEN login's
 * 401 "No token provided" from the middleware. Same number, opposite meaning.
 * Every probe states what its body must and must not contain, and
 * `mustNotContain` does the real work: "No token provided" on a public route is
 * precisely the outage this exists to catch.
 *
 * ARC 29 — ALERT HYGIENE
 *
 * An alert channel is only worth having if every message in it is real. Three
 * changes serve that:
 *
 *   1. Each probe carries a `hint` — the first thing to check when it goes red.
 *      A 3am alert that says only "surface down" costs a wake-up to rediscover
 *      what the arc that wrote it already knew.
 *   2. On failure this writes a self-explaining summary to the GitHub job
 *      summary, so the notification email is readable without opening the run.
 *   3. `--self-test` verifies the harness detects a wrong shape WITHOUT the run
 *      failing. Arc 28 proved that by pushing a deliberately broken probe to a
 *      branch and taking a real red email for it. Doing that repeatedly would
 *      train the inbox to ignore this workflow, which is the one outcome that
 *      would make all of the above worthless.
 *
 * MODES
 *   (none)        probe production; exit non-zero if any surface is unhealthy
 *   --self-test   prove the harness catches a wrong shape; ALWAYS exits 0 on success
 *   --fire-drill  deliberately fail one probe to exercise the email channel
 */

// ESM: appendFileSync must be imported. A require() here throws, and it throws
// INSIDE the failure path — so a real outage would have fired an alert with no
// explanation in it. Caught pre-ship by rendering the summary locally rather
// than trusting that the code which writes it runs. Presence is not function,
// and a failure-only code path is where that bites hardest: it is never
// exercised by a healthy run.
import { pathToFileURL } from "url";
import { appendFileSync } from "node:fs";

const BASE = process.env.PROBE_BASE_URL || "https://api.silkroutelogistics.ai/api";
const TIMEOUT_MS = 20_000;

/**
 * Each probe names the healthy SHAPE of one public production surface.
 *
 *   expectStatus   — array, because several are legitimately variable (a
 *                    validation 400 and a 404 for an unknown token are both
 *                    healthy; what matters is that the route was REACHED).
 *   mustNotContain — the outage signature. Usually the middleware's refusal,
 *                    which on a public route means the front door is locked.
 *   mustContain    — positive proof the handler ran, where there is one.
 *   hint           — what to check first when this goes red. Written by the arc
 *                    that understood the failure, for whoever is woken by it.
 */
export const PROBES = [
  // ── the AI surfaces (Arc: v3.8.awf) ─────────────────────────────────
  {
    name: "Marco Polo (public chatbot)",
    why: "v3.8.awf: Google retired gemini-2.0-flash and this replied 'having trouble connecting' to every question — a 200, flat error rates, no alert. Window unknown.",
    method: "POST",
    path: "/chat/public",
    body: { message: "What equipment types do you move?" },
    expectStatus: [200],
    // The outage signature, encoded. This is the whole point of the probe: the
    // broken chatbot and the working chatbot BOTH return 200 with a "reply"
    // field, and only the sentence separates them. A status check cannot see
    // this class at all.
    mustNotContain: ["having trouble connecting", "No token provided"],
    // Positive proof the model actually answered rather than a fallback: the
    // canonical prompt (§20.8.5) always names real equipment from the services
    // whitelist. A generic apology never will.
    mustContain: ["reply"],
    mustMatch: /dry van|reefer|flatbed|temperature|equipment/i,
    hint: "GEMINI_MODEL retired again? Check config/ai.ts, then /api/health parser.functional, then GEMINI_MODEL on Render — it is env-overridable so this is a config change, not a deploy.",
  },

  // ── the six that were down (Arc 27) ────────────────────────────────
  {
    name: "carrier login",
    why: "Arc 27: this returned 401 'No token provided' for ~27h. Nobody could sign in.",
    method: "POST",
    path: "/carrier-auth/login",
    body: { email: "probe@srl-monitor.invalid", password: "not-a-real-password" },
    // The handler's own refusal of an unknown user. 401 is CORRECT here — the
    // body is the only thing separating healthy from the outage.
    expectStatus: [401],
    mustContain: ["Invalid credentials"],
    mustNotContain: ["No token provided"],
    hint: "A public carrier route is sitting behind auth middleware. Check the /carrier-auth mount in backend/src/routes/index.ts and the allowlist in backend/src/middleware/allowPublicCarrierAuth.ts. This is the Arc 27 outage — CLAUDE.md Item 236.",
  },
  {
    name: "carrier invitation accept",
    why: "Arc 33: an AE-issued invitation link is the ONLY way an invited carrier reaches onboarding. If this sits behind auth, every invitation SRL sends is dead on arrival and the AE has no way to know.",
    method: "POST",
    path: "/carrier/onboarding/invite/accept",
    body: { token: "srl-monitor-probe-not-a-real-token" },
    // 400 is the handler refusing an unknown token — the correct answer, and
    // the one that proves the route is reachable without a session.
    expectStatus: [400],
    mustContain: ["accepted"],
    mustNotContain: ["No token provided"],
    hint: "The invitation-accept route has fallen behind auth middleware. It must sit ABOVE router.use(authenticate) in backend/src/routes/carrier.ts — an invited carrier has no account yet, which is the entire point.",
  },
  {
    name: "carrier OTP verify",
    why: "step 2 of login; same mount, went down with it",
    method: "POST",
    path: "/carrier-auth/verify-otp",
    body: {},
    expectStatus: [400],
    mustContain: ["Validation failed"],
    mustNotContain: ["No token provided"],
    hint: "Same mount as carrier login. If login is red too, this is one fault, not two — start there.",
  },
  {
    name: "carrier TOTP verify",
    why: "step 3 of login; same mount",
    method: "POST",
    path: "/carrier-auth/totp-verify",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
    hint: "Same mount as carrier login. Carriers with 2FA armed cannot finish signing in.",
  },
  {
    name: "carrier resend OTP",
    why: "recovery path for step 2; same mount",
    method: "POST",
    path: "/carrier-auth/resend-otp",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
    hint: "Same mount as carrier login. A carrier who lost their code has no way back in.",
  },
  {
    name: "carrier email verification",
    why: "clicked from an email by someone with no session; same mount",
    method: "POST",
    path: "/carrier-auth/verify-email",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
    hint: "Same mount as carrier login. Verification links already in carriers' inboxes are dead while this is red.",
  },
  {
    name: "public agreement text (onboarding Step 4)",
    why: "the reported symptom. A prospect cannot register without this.",
    method: "GET",
    path: "/carrier-auth/agreement/broker-carrier",
    expectStatus: [200],
    // The version string is the point: a 200 carrying an empty or wrong-shaped
    // body would still hang the click-through, which is fail-closed by design.
    mustContain: ['"version"', '"sections"', "Broker-Carrier"],
    mustNotContain: ["No token provided"],
    hint: "Onboarding Step 4 fails closed by design, so a prospect sees an error and cannot register. If the body is present but reshaped, check getAgreement in backend/src/data/agreements.ts.",
  },

  // ── the nine that were healthy, kept so a future mount change is caught ──
  {
    name: "FMCSA lookup by DOT (onboarding step 1)",
    why: "prospect enters a DOT; this fills the form",
    method: "GET",
    path: "/carrier/fmcsa-lookup/4526880",
    expectStatus: [200],
    mustNotContain: ["No token provided"],
    hint: "Either the /carrier mount gained a guard, or FMCSA QCMobile is down or rate-limiting. Check FMCSA_WEB_KEY on Render before assuming ours.",
  },
  {
    name: "FMCSA lookup by MC (onboarding step 1)",
    why: "the MC-number half of the same lookup",
    method: "GET",
    path: "/carrier/fmcsa-mc-lookup/1794414",
    expectStatus: [200],
    mustNotContain: ["No token provided"],
    hint: "Same as the DOT lookup — if both are red, suspect FMCSA rather than SRL.",
  },
  {
    name: "carrier registration submit",
    why: "the end of onboarding. A 400 proves the validator ran.",
    method: "POST",
    path: "/carrier/register",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
    hint: "Nobody can complete onboarding. A 500 here usually means a schema/client mismatch — check whether a migration shipped without its deploy.",
  },
  {
    name: "public shipment tracking (BOL QR target)",
    why: "every printed BOL carries a QR pointing here; a dock worker scans it",
    method: "GET",
    path: "/tracking/SRLMONITORPROBE",
    // 404 for a token that does not exist is the healthy answer.
    expectStatus: [404],
    mustNotContain: ["No token provided"],
    hint: "Every BOL already printed carries a QR pointing here. A dock worker scanning one gets nothing. See §13.3 Item 31 for the redirect class that broke this before.",
  },
  {
    name: "shipper quote form",
    why: "/shippers.html#quote-form posts here; it is the inbound lead path",
    method: "POST",
    path: "/leads/website",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
    hint: "Inbound leads are being silently lost — the form is on /shippers.html and will look like it worked. Revenue-affecting.",
  },
  {
    name: "contact form",
    why: "/contact.html posts here",
    method: "POST",
    path: "/contact/website",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
    hint: "Inbound contact messages are being lost. Same class as the quote form.",
  },
  {
    name: "tender-action magic link",
    why: "carrier accepts/declines a tender from an email with no session",
    method: "GET",
    path: "/tender-action/SRLMONITORPROBE",
    expectStatus: [200, 400, 404],
    mustNotContain: ["No token provided"],
    hint: "Carriers cannot accept or decline tenders from email. Loads will look unanswered when they are not. See §13.3 Item 142.",
  },
  {
    name: "AE + shipper login",
    why: "the other portal's front door. Unaffected by Arc 27, probed anyway.",
    method: "POST",
    path: "/auth/login",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
    hint: "Staff and shippers cannot sign in. Different mount from the carrier portal — check /auth in backend/src/routes/index.ts.",
  },
  {
    name: "driver portal login",
    why: "SRL Driver Academy front door; separate mount, separate cookie",
    method: "POST",
    path: "/driver-auth/login",
    body: {},
    expectStatus: [400],
    mustNotContain: ["No token provided"],
    hint: "Drivers cannot reach the Academy. Separate mount and separate cookie from the carrier portal — see §13.3 Item 193 T2.",
  },

  // ── liveness, so a total outage is distinguishable from a routing bug ──
  {
    name: "health",
    why: "if this is the only failure, the service is down rather than mis-routed",
    method: "GET",
    path: "/health",
    expectStatus: [200],
    mustContain: ['"status":"ok"'],
    hint: "If this is the ONLY red, the service is down or deploying — not mis-routed. Check Render. If everything else is red too, start here.",
  },
];

/** Compare one response against a probe's declared shape. */
function evaluate(p, status, text) {
  const problems = [];
  if (!p.expectStatus.includes(status)) {
    problems.push(`status ${status}, expected ${p.expectStatus.join(" or ")}`);
  }
  for (const s of p.mustContain || []) {
    if (!text.includes(s)) problems.push(`body is missing ${JSON.stringify(s)}`);
  }
  for (const s of p.mustNotContain || []) {
    if (text.includes(s)) {
      problems.push(`body contains ${JSON.stringify(s)} — THIS IS THE OUTAGE SIGNATURE`);
    }
  }
  // v3.8.awg — mustMatch, for surfaces whose healthy body cannot be pinned to a
  // fixed string. Marco Polo's answer varies with the model, so no literal
  // proves it replied; a pattern over the equipment it must name does. Declared
  // as a regex, checked here, because a probe field the runner does not read is
  // a probe that silently checks nothing.
  if (p.mustMatch && !p.mustMatch.test(text)) {
    problems.push(`body does not match ${p.mustMatch} — the handler ran but did not answer`);
  }
  return problems;
}

async function probe(p) {
  const url = `${BASE}${p.path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  const at = new Date().toISOString();
  try {
    const res = await fetch(url, {
      method: p.method,
      headers: p.body ? { "Content-Type": "application/json" } : undefined,
      body: p.body ? JSON.stringify(p.body) : undefined,
      signal: ctrl.signal,
    });
    const text = (await res.text()).slice(0, 2000);
    return { ...p, url, at, status: res.status, body: text, problems: evaluate(p, res.status, text) };
  } catch (err) {
    const aborted = err instanceof Error && err.name === "AbortError";
    return {
      ...p, url, at, status: 0, body: "",
      problems: [aborted ? `no response within ${TIMEOUT_MS}ms` : `request failed: ${err.message}`],
    };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The failure notification, written where GitHub puts it in the email.
 *
 * The reader is someone who got an email and has not opened the run. Everything
 * needed to decide "is this real and how bad" goes above the fold: what broke,
 * what it means for a customer, and where to look first.
 */
function writeSummary(failures, total, fireDrill = false) {
  const out = process.env.GITHUB_STEP_SUMMARY;
  if (!out) return;
  const L = [];
  if (fireDrill) {
    // A drill that reads as a real outage is worse than no drill: it spends the
    // alarm it was meant to test. Say so first, before anything alarming.
    L.push("# 🟡 THIS IS A FIRE DRILL — production is fine");
    L.push("");
    L.push("Nothing is down. One probe was deliberately pointed at an expectation");
    L.push("production will never return, to prove this alert channel works end to end");
    L.push("and to show what a real alert will look like.");
    L.push("");
    L.push("**This is the last drill.** The `fire-drill` input is removed in the same");
    L.push("change that ran it, so it cannot be triggered casually. From here on, every");
    L.push("red run of this workflow is a real production fault.");
    L.push("");
    L.push("Below is the real alert format, rendered from the deliberate failure.");
    L.push("");
    L.push("---");
    L.push("");
  }
  L.push(`# ${fireDrill ? "🟡 (drill) " : "🔴 "}${failures.length} of ${total} public production surfaces are DOWN`);
  L.push("");
  L.push("These are pages and links **customers and carriers reach with no session**.");
  // Only true of a real alert. Saying it during a drill would contradict the
  // header two lines above, and a notice that argues with itself is one the
  // reader stops trusting.
  L.push(
    fireDrill
      ? "In a real alert, a failure here is visible to the outside world right now."
      : "A failure here is visible to the outside world right now.",
  );
  L.push("");
  for (const f of failures) {
    L.push(`## ${f.name}`);
    L.push("");
    L.push(`**What it means:** ${f.why}`);
    L.push("");
    L.push(`**Check first:** ${f.hint}`);
    L.push("");
    L.push("| | |");
    L.push("|---|---|");
    L.push(`| URL | \`${f.method} ${f.url}\` |`);
    L.push(`| Expected | status ${f.expectStatus.join(" or ")}${f.mustContain ? `, body containing ${f.mustContain.map((s) => `\`${s}\``).join(", ")}` : ""}${f.mustNotContain ? `, body NOT containing ${f.mustNotContain.map((s) => `\`${s}\``).join(", ")}` : ""} |`);
    L.push(`| Received | status **${f.status || "no response"}** |`);
    // Detected-at, not first-seen: this run has no memory of previous runs, and
    // saying "first seen" would claim knowledge the harness does not have.
    L.push(`| Detected at | ${f.at} (this run; the probe runs every 15 min, so the fault began within ~15 min of this) |`);
    L.push("");
    L.push("**Failed because:**");
    for (const p of f.problems) L.push(`- ${p}`);
    L.push("");
    L.push("<details><summary>Response body (truncated)</summary>");
    L.push("");
    L.push("```");
    L.push((f.body || "(empty)").slice(0, 600));
    L.push("```");
    L.push("");
    L.push("</details>");
    L.push("");
  }
  L.push("---");
  L.push("");
  L.push("*Every run of this workflow that fails is a real production fault. Adversarial");
  L.push("self-tests run inside a passing job and never reach this inbox — see Arc 29.*");
  appendFileSync(out, L.join("\n") + "\n");
}

/**
 * Prove the harness detects a wrong shape, WITHOUT failing the run.
 *
 * Arc 28 verified this by pushing a broken probe to a branch and taking a real
 * red email. That works once. Doing it whenever the probes change would teach
 * the inbox that red is sometimes a drill, and the value of this channel is
 * entirely that it never is.
 *
 * Three checks, because the harness has three ways to be wrong: it could miss a
 * bad status, miss a missing string, or — the one that matters most — miss the
 * outage signature appearing in a body.
 */
async function selfTest() {
  console.log("ADVERSARIAL SELF-TEST — proving the harness detects a wrong shape.\n");
  // Pinned BY NAME, not by index. This used to read PROBES[0], so prepending
  // a probe silently re-pointed every fixture below at a different subject
  // and the self-test failed for a reason that had nothing to do with the
  // harness. Found by adding the Arc 33 invitation probe.
  const FIXTURE = PROBES.find((p) => p.name === "carrier login");
  if (!FIXTURE) {
    console.log("SELF-TEST FAILED — the 'carrier login' probe it pins to is gone.");
    process.exit(1);
  }

  const cases = [
    {
      label: "a wrong status is detected",
      probe: { ...FIXTURE, expectStatus: [999] },
      status: 401, body: '{"error":"Invalid credentials"}',
      expectProblem: /status 401, expected 999/,
    },
    {
      label: "a missing required string is detected",
      probe: { ...FIXTURE, mustContain: ["a string production will never return"] },
      status: 401, body: '{"error":"Invalid credentials"}',
      expectProblem: /body is missing/,
    },
    {
      label: "THE OUTAGE SIGNATURE is detected",
      probe: FIXTURE,
      // The exact body production returned for 27 hours.
      status: 401, body: '{"error":"No token provided"}',
      expectProblem: /OUTAGE SIGNATURE/,
    },
    {
      label: "a healthy response produces NO problem (the harness is not just always-red)",
      probe: FIXTURE,
      status: 401, body: '{"error":"Invalid credentials"}',
      expectProblem: null,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const problems = evaluate(c.probe, c.status, c.body);
    const ok = c.expectProblem
      ? problems.some((p) => c.expectProblem.test(p))
      : problems.length === 0;
    if (!ok) failed++;
    console.log(`  ${ok ? "ok  " : "FAIL"} ${c.label}`);
    if (!ok) console.log(`       problems were: ${JSON.stringify(problems)}`);
  }

  console.log("");
  if (failed) {
    console.log(`SELF-TEST FAILED (${failed}/${cases.length}) — the harness cannot be trusted to`);
    console.log("detect an outage, which means a green run from it means nothing.");
    process.exit(1);
  }
  // The line the workflow greps for.
  console.log("adversarial self-test passed — the harness detects wrong shapes, including");
  console.log("the exact body production returned during the 27-hour outage. No alert was");
  console.log("sent: this ran inside a passing job, by design.");
  process.exit(0);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes("--self-test")) return selfTest();

  const fireDrill = args.includes("--fire-drill");
  const probes = fireDrill
    ? PROBES.map((p, i) =>
        i === 0
          ? { ...p, mustContain: ["FIRE DRILL — an expectation production will never return"] }
          : p,
      )
    : PROBES;

  if (fireDrill) {
    console.log("FIRE DRILL: one probe is deliberately pointed at an impossible expectation.");
    console.log("This run WILL fail and WILL email, on purpose, to demonstrate the alert");
    console.log("format end to end. Production itself is fine.\n");
  }

  console.log(`Probing ${probes.length} public surfaces at ${BASE}\n`);
  // Sequential on purpose: a burst of 16 from one IP against rate-limited
  // endpoints is the sort of thing that makes the monitor the incident.
  const results = [];
  for (const p of probes) results.push(await probe(p));

  const failures = results.filter((r) => r.problems.length > 0);
  for (const r of results) {
    const ok = r.problems.length === 0;
    console.log(`${ok ? "  ok  " : "  FAIL"} ${String(r.status).padEnd(4)} ${r.method.padEnd(5)} ${r.path}`);
    console.log(`         ${r.name} — ${r.why}`);
    if (!ok) {
      for (const problem of r.problems) console.log(`         ✗ ${problem}`);
      console.log(`         hint: ${r.hint}`);
      console.log(`         body: ${r.body.slice(0, 160)}`);
    }
  }

  console.log(`\n${results.length - failures.length}/${results.length} public surfaces healthy`);
  if (failures.length) {
    writeSummary(failures, results.length, fireDrill);
    process.exit(1);
  }
}

// v3.8.awg — only self-run when EXECUTED, not when imported.
//
// Without this the module probes production the moment anything imports it,
// which is why the self-test guard reads this file as text instead. Text checks
// can prove a probe is DECLARED; only importing `evaluate` can prove it would
// actually catch an outage body. Guarding the entrypoint makes that possible
// without changing what `node scripts/probe-public-surfaces.mjs` does.
const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
  main().catch((e) => {
    console.error("probe harness itself failed:", e);
    process.exit(1);
  });
}

export { evaluate };
