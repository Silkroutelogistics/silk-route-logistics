/**
 * ARC 34 — PROOF BY LOGIN. The release condition for hold/arc34-session-policy.
 *
 * THE ONE ASSERTION THAT MATTERS is "an authenticated request SUCCEEDS through
 * the flipped middleware". A unit test currently fails on exactly that
 * (`sets req.user and calls next for valid token`), and the two readings of
 * that failure are "the fixture predates the row requirement" and "I broke
 * authentication". Nothing distinguishes them except this file.
 *
 * SCOPE, STATED PRECISELY so nobody reads more into it than is here.
 * Sessions are minted through `registerSession` — the seam that EVERY login
 * path already calls (11 call sites, verified with the multi-line-aware
 * instrument at scripts/find-prisma-calls.ts). Driving the seam proves the
 * mechanism for every portal that routes through it. It does NOT re-prove that
 * each login *flow* reaches the seam; that is what the 11 call sites and their
 * own tests cover, and re-proving it here would mean defeating a mandatory 2FA
 * wall and a PIN gate for no additional information about the policy.
 *
 * Every request below is real HTTP through the real router and the real
 * middleware, against a real Postgres. Clock compression is done by writing
 * `lastSeenAt` and by minting tokens with a chosen `iat` — never by waiting,
 * and never by stubbing the policy.
 *
 * SAFETY: rehearsal container only (5544x); Resend, OpenPhone and S3 explicitly
 * EMPTY — the guard refuses on a key that is merely unset, because dotenv fills
 * an unset key from backend/.env which holds the production Resend key.
 */

function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  if (!/5544[0-9]/.test(process.env.DATABASE_URL || "")) {
    console.error("REFUSING: not an Arc 34 rehearsal container.");
    process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY", "S3_BUCKET_NAME", "AWS_ACCESS_KEY_ID"]) {
    if (process.env[k] !== "") {
      console.error(`REFUSING: ${k} must be explicitly EMPTY (is: ${process.env[k] === undefined ? "unset" : "set"}).`);
      process.exit(1);
    }
  }
  console.log("guard: rehearsal DB on 5544x; RESEND + OPENPHONE + S3 explicitly empty\n");
}
guard();

import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Server } from "http";

const PORT = 4034; // the Express app; the DB is the 5544x container
const API = `http://127.0.0.1:${PORT}/api`;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
}

const uniq = () => crypto.randomBytes(4).toString("hex");
/** The derivation the middleware reads by. 32 chars — the lockout catch. */
const readerHash = (t: string) => crypto.createHash("sha256").update(t).digest("hex").slice(0, 32);

async function main() {
  const { prisma } = await import("../src/config/database");
  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const routes = (await import("../src/routes")).default;
  const { registerSession, BACKGROUND_POLL_HEADER } = await import("../src/middleware/auth");
  const { SESSION_IDLE_MS, SESSION_ABSOLUTE_MS } = await import("../src/lib/sessionPolicy");

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((r) => { const s = app.listen(PORT, "127.0.0.1", () => r(s)); });
  console.log(`app: real router + real middleware on :${PORT}\n`);

  const stamp = Date.now();
  const mkUser = async (role: string, tag: string) =>
    prisma.user.create({
      data: {
        email: `arc34-${tag}-${uniq()}@srl.invalid`,
        passwordHash: "x", firstName: "Arc34", lastName: tag, role: role as never,
        company: "Arc34", phone: `269${String(stamp).slice(-7)}`,
      },
    });

  /** Mint the same shape the real login paths mint. */
  const mintToken = (userId: string, email: string, role: string, iatMs = Date.now()) =>
    jwt.sign(
      { userId, email, role, iat: Math.floor(iatMs / 1000) },
      process.env.JWT_SECRET!,
      { algorithm: "HS256", expiresIn: "30d" },
    );

  /** A real authenticated request through the real middleware. */
  const authed = async (token: string, opts: { poll?: boolean } = {}) => {
    const r = await fetch(`${API}/auth/me`, {
      // Bearer, not cookies. The cookie path runs a fallback LOOP, and its
      // failure branch DELETES the row before trying the next candidate — so a
      // second identical cookie is judged against state the first one destroyed,
      // and the code reported is whichever attempt lost last. Bearer is one
      // token, one attempt, one verdict. A proof harness must not have to reason
      // about which of three attempts produced the answer it printed.
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.poll ? { [BACKGROUND_POLL_HEADER]: "1" } : {}),
      },
    });
    return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, any> };
  };

  const rowFor = (token: string) =>
    prisma.staffSession.findUnique({ where: { tokenHash: readerHash(token) } });

  // ── 1 + 2. per portal: row written correctly, then a real request works ──
  const PORTALS: Array<{ role: string; portal: string }> = [
    { role: "ADMIN", portal: "AE" },
    { role: "CARRIER", portal: "CARRIER" },
    { role: "SHIPPER", portal: "SHIPPER" },
  ];
  const minted: Record<string, { token: string; userId: string }> = {};

  for (const { role, portal } of PORTALS) {
    const u = await mkUser(role, portal.toLowerCase());
    const token = mintToken(u.id, u.email, role);
    registerSession(u.id, token, role);
    await new Promise((r) => setTimeout(r, 250)); // fire-and-forget write
    minted[portal] = { token, userId: u.id };

    const row = await rowFor(token);
    check(
      `${portal}: row written, correct portal, keyed by the 32-char hash`,
      !!row && row.portal === portal && row.tokenHash.length === 32,
      row ? `portal=${row.portal}, key=${row.tokenHash.length} chars` : "NO ROW — the lockout shape",
    );

    const res = await authed(token);
    check(
      `${portal}: an authenticated request SUCCEEDS through the flipped middleware`,
      res.status === 200,
      `GET /auth/me -> ${res.status}${res.status !== 200 ? ` (${JSON.stringify(res.body).slice(0, 120)})` : ""}`,
    );
  }

  // DRIVER: registerSession maps role -> portal; drivers do not carry a User
  // role, so this proves the mapping, not the driver login flow (which uses its
  // own middleware and cookie).
  {
    const token = mintToken("driver-" + uniq(), "d@srl.invalid", "DRIVER");
    registerSession("driver-" + uniq(), token, "DRIVER");
    await new Promise((r) => setTimeout(r, 250));
    const row = await rowFor(token);
    check(
      "DRIVER: row written with portal=DRIVER",
      !!row && row.portal === "DRIVER",
      row ? `portal=${row.portal}` : "NO ROW",
    );
  }

  // SSO: its callback owns the row (persistSession=false), so the assertion is
  // that registerSession does NOT write a second one.
  {
    const u = await mkUser("ADMIN", "sso");
    const token = mintToken(u.id, u.email, "ADMIN");
    registerSession(u.id, token, "ADMIN", false, false);
    await new Promise((r) => setTimeout(r, 250));
    const row = await rowFor(token);
    check(
      "SSO: registerSession defers — no second writer on that row",
      row === null,
      row ? "a row WAS written — two writers again" : "no row, as designed (their upsert owns it)",
    );
  }

  // ── 3. idle ───────────────────────────────────────────────────────
  {
    const { token } = minted.AE;
    await prisma.staffSession.update({
      where: { tokenHash: readerHash(token) },
      data: { lastSeenAt: new Date(Date.now() - SESSION_IDLE_MS - 60_000) },
    });
    const res = await authed(token);
    check(
      "idle past 30m -> 401 SESSION_IDLE_EXPIRED",
      res.status === 401 && res.body.code === "SESSION_IDLE_EXPIRED",
      `${res.status} / ${res.body.code ?? "(no code)"}`,
    );
  }

  // ── 4. activity at minute 29 still works ──────────────────────────
  {
    const u = await mkUser("ADMIN", "m29");
    const token = mintToken(u.id, u.email, "ADMIN");
    registerSession(u.id, token, "ADMIN");
    await new Promise((r) => setTimeout(r, 250));
    await prisma.staffSession.update({
      where: { tokenHash: readerHash(token) },
      data: { lastSeenAt: new Date(Date.now() - 29 * 60 * 1000) },
    });
    const res = await authed(token);
    const after = await rowFor(token);
    const reset = !!after && Date.now() - after.lastSeenAt.getTime() < 60_000;
    check(
      "activity at minute 29 succeeds AND resets the idle clock",
      res.status === 200 && reset,
      `${res.status}; lastSeenAt ${reset ? "reset" : "NOT reset"}`,
    );
  }

  // ── 5. absolute ───────────────────────────────────────────────────
  {
    const u = await mkUser("ADMIN", "abs");
    const token = mintToken(u.id, u.email, "ADMIN", Date.now() - SESSION_ABSOLUTE_MS - 60_000);
    registerSession(u.id, token, "ADMIN");
    await new Promise((r) => setTimeout(r, 250));
    const res = await authed(token);
    check(
      "absolute 12h fires despite a fresh idle clock",
      res.status === 401 && res.body.code === "SESSION_ABSOLUTE_EXPIRED",
      `${res.status} / ${res.body.code ?? "(no code)"} — row was just touched, so only the ceiling can refuse this`,
    );
  }

  // ── 6. pre-policy session gets the honest code ────────────────────
  {
    const u = await mkUser("ADMIN", "pre");
    // Older than the rollout instant, newer than the 12h ceiling: the only
    // window where the rollout code is the correct answer.
    const token = mintToken(u.id, u.email, "ADMIN", Date.parse("2026-08-24T19:00:00Z"));
    const res = await authed(token); // deliberately NO row — that is the point
    check(
      "a pre-policy session is told the truth, not 'you went idle'",
      res.status === 401 && res.body.code === "SESSION_REVOKED_POLICY_ROLLOUT",
      `${res.status} / ${res.body.code ?? "(no code)"}`,
    );
  }

  // ── 7 + 8. the load-bearing adversarial ───────────────────────────
  {
    const u = await mkUser("ADMIN", "poll");
    const token = mintToken(u.id, u.email, "ADMIN");
    registerSession(u.id, token, "ADMIN");
    await new Promise((r) => setTimeout(r, 250));

    const backdate = () =>
      prisma.staffSession.update({
        where: { tokenHash: readerHash(token) },
        data: { lastSeenAt: new Date(Date.now() - 29 * 60 * 1000) },
      });

    await backdate();
    const pollRes = await authed(token, { poll: true });
    const afterPoll = await rowFor(token);
    const pollAged = afterPoll ? Date.now() - afterPoll.lastSeenAt.getTime() : 0;
    check(
      "a MARKED background poll authenticates but does NOT reset the idle clock",
      pollRes.status === 200 && pollAged > 25 * 60 * 1000,
      `${pollRes.status}; lastSeenAt still ${Math.round(pollAged / 60000)}m old — an abandoned desk stays abandoned`,
    );

    await backdate();
    const userRes = await authed(token); // same request, marker removed
    const afterUser = await rowFor(token);
    const userAged = afterUser ? Date.now() - afterUser.lastSeenAt.getTime() : 0;
    check(
      "ADVERSARIAL: unmark that same poll and it DOES reset — the marker is load-bearing",
      userRes.status === 200 && userAged < 60_000,
      `identical request without the header: lastSeenAt ${Math.round(userAged / 1000)}s old`,
    );
  }

  // ── 9. remember-me shortens re-auth, not idle ─────────────────────
  {
    const u = await mkUser("ADMIN", "remember");
    const token = mintToken(u.id, u.email, "ADMIN");
    registerSession(u.id, token, "ADMIN", true);
    await new Promise((r) => setTimeout(r, 250));
    await prisma.staffSession.update({
      where: { tokenHash: readerHash(token) },
      data: { rememberMe: true, lastSeenAt: new Date(Date.now() - SESSION_IDLE_MS - 60_000) },
    });
    const res = await authed(token);
    check(
      "a REMEMBERED session still idles out at 30m (reachable for the first time)",
      res.status === 401 && res.body.code === "SESSION_IDLE_EXPIRED",
      `${res.status} / ${res.body.code ?? "(no code)"} — remember-me shortens re-auth, never idle`,
    );
  }

  check(
    "outbound never live",
    process.env.RESEND_API_KEY === "" && process.env.OPENPHONE_API_KEY === "" &&
      process.env.S3_BUCKET_NAME === "" && process.env.AWS_ACCESS_KEY_ID === "",
    "RESEND + OPENPHONE + S3 explicitly empty throughout",
  );

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) console.log(results.filter((r) => !r.ok).map((r) => `  FAILED: ${r.name}`).join("\n"));
  else console.log("\nRELEASE CONDITION MET");
  server.close();
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); process.exit(1); });
