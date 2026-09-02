/**
 * The session race (Item: session-race Phase B).
 *
 * Run with outbound keys EXPLICITLY EMPTY (§19 Sub-pattern 20):
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= S3_BUCKET_NAME= \
 *     npx tsx scripts/_arc-session-race-proof.ts
 *
 * WHAT IS BEING PROVEN, and why it needs a real database.
 *
 * registerSession persists the session row fire-and-forget, so a login that is
 * answered fast enough leaves an upsert in flight. The refusal path used to
 * delete unconditionally, and the read directly above it had already returned
 * null -- so the delete could ONLY ever destroy a row written concurrently.
 * When it did, the session was dead for good rather than failing once and
 * working on retry.
 *
 * That interleaving cannot be reproduced by hoping: the window is a few
 * milliseconds wide. It is made DETERMINISTIC here by intercepting the real
 * findUnique, letting it do its real read, and landing the delayed upsert
 * before it returns. The middleware then runs its own unmodified logic on top.
 * Nothing about the code under test is reimplemented -- only the TIMING of a
 * dependency is controlled, which is the whole subject.
 */
function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
    process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY"]) {
    const v = process.env[k];
    if (v === undefined) {
      console.error("REFUSING: " + k + " UNSET -- dotenv would fill it from backend/.env.");
      process.exit(1);
    }
    if (v !== "") {
      console.error("REFUSING: " + k + " set to a real value. Outbound would be LIVE.");
      process.exit(1);
    }
  }
  console.log("guard: local DB; outbound keys explicitly empty (post-dotenv)\n");
}
guard();

import jwt from "jsonwebtoken";
import type { Server } from "http";

const PORT = 55951;
const BASE = "http://127.0.0.1:" + PORT + "/api";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log("  PASS  " + n); }
  else { fail++; console.log("  FAIL  " + n + (d ? "  -- " + d : "")); }
};

async function main() {
  const { prisma } = await import("../src/config/database");
  const { createSession, sessionTokenHash } = await import("../src/lib/sessionStore");
  const { blacklistToken } = await import("../src/utils/tokenBlacklist");
  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const routes = (await import("../src/routes")).default;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((r) => {
    const s = app.listen(PORT, "127.0.0.1", () => r(s));
  });
  console.log("app: real router mounted on :" + PORT + "\n");

  const stamp = Date.now();
  const ae = await prisma.user.create({
    data: {
      email: "race-" + stamp + "@srl.invalid", passwordHash: "x",
      firstName: "R", lastName: "C", role: "ADMIN", isActive: true,
    },
  });

  const secret = process.env.JWT_SECRET as string;
  const call = (tok: string) =>
    fetch(BASE + "/auth/me", { headers: { Cookie: "srl_token_ae=" + tok } });
  // Ages are EXPLICIT because the grace window is age-sensitive. A token minted
  // now sits inside it, so the refusal-path sections below deliberately mint
  // OUTSIDE it -- otherwise they would stop exercising the delete at all and
  // would silently stop proving the thing they are named for.
  // The nonce is load-bearing, not decoration. jwt.sign is DETERMINISTIC: the
  // same payload and secret produce a byte-identical token, and iat is floored
  // to the second -- so two mint(PAST_GRACE) calls inside the same second
  // returned THE SAME TOKEN. Two sections that believed they held different
  // tokens were sharing one, and a row created for the first silently satisfied
  // the second. Both fixture failures in this proof came from that, not from
  // the code under test.
  let mintSeq = 0;
  const mint = (ageMs = 0) =>
    jwt.sign(
      { userId: ae.id, n: ++mintSeq, iat: Math.floor((Date.now() - ageMs) / 1000) },
      secret,
      { expiresIn: "12h" },
    );
  const PAST_GRACE = 60_000;

  const rowFor = (tok: string) =>
    prisma.staffSession.findUnique({ where: { tokenHash: sessionTokenHash(tok) } });

  // ── 1. CONTROL: the delete still fires when a row WAS read ──
  // Without this, "the row survived" in [2] could equally mean the delete is
  // simply broken, which would be a different and worse defect.
  console.log("[1] CONTROL: a genuinely idle session is still cleaned up");
  const idleTok = mint();
  await createSession({ token: idleTok, userId: ae.id, portal: "AE" });
  await prisma.staffSession.update({
    where: { tokenHash: sessionTokenHash(idleTok) },
    data: { lastSeenAt: new Date(Date.now() - 40 * 60 * 1000) },
  });
  const r1 = await call(idleTok);
  ok("an idle session is refused", r1.status === 401, "status=" + r1.status);
  ok("and its row IS removed", (await rowFor(idleTok)) === null,
    "the delete must still work on a row the refusal actually read");

  // ── 2. THE PERMANENT KILL, reproduced deterministically ──
  console.log("\n[2] the delayed upsert lands between the read and the delete");
  const raceTok = mint(PAST_GRACE);
  const delegate = prisma.staffSession as unknown as Record<string, any>;
  const origFindUnique = delegate.findUnique.bind(delegate);
  let injected = 0;
  let sawNullAtRead: boolean | null = null;
  delegate.findUnique = async (args: any) => {
    const real = await origFindUnique(args);
    // Fire exactly once, and only for the token under test, so an unrelated
    // lookup elsewhere in the request cannot move the result.
    if (injected === 0 && args?.where?.tokenHash === sessionTokenHash(raceTok)) {
      injected++;
      sawNullAtRead = real === null;
      // THIS is the in-flight upsert landing. Real writer, real row.
      await createSession({ token: raceTok, userId: ae.id, portal: "AE" });
    }
    return real;
  };

  const r2 = await call(raceTok);
  delegate.findUnique = origFindUnique;

  ok("the injection actually fired (vacuity tripwire)", injected === 1,
    "if this is 0 the whole section proved nothing; injected=" + injected);
  ok("and the read genuinely saw nothing", sawNullAtRead === true,
    "the race only exists when findUnique returned null; sawNull=" + sawNullAtRead);
  ok("the request is refused", r2.status === 401,
    "correct: the read saw no row. status=" + r2.status);

  const survived = await rowFor(raceTok);
  ok("THE ROW SURVIVES the refusal", survived !== null,
    "a delete after a null read can only destroy a row written concurrently -- " +
      "without the conditional this row is gone and the session is dead for good");

  const r3 = await call(raceTok);
  ok("and the retry SUCCEEDS", r3.status === 200,
    "this is the difference between a recoverable 401 and a permanently killed " +
      "session; status=" + r3.status);

  // ── 3. the ordinary transient, unchanged ──
  // Passes with or without the fix. It is here so the baseline behaviour is
  // pinned: a refusal that reads nothing and races nothing must still refuse,
  // and must still recover once the row lands.
  console.log("\n[3] the ordinary case: no row yet, nothing racing");
  const plainTok = mint(PAST_GRACE);
  const r4 = await call(plainTok);
  ok("refused while the row is absent", r4.status === 401, "status=" + r4.status);
  await createSession({ token: plainTok, userId: ae.id, portal: "AE" });
  const r5 = await call(plainTok);
  ok("succeeds once the row lands", r5.status === 200, "status=" + r5.status);

  // ── 4. the grace window ──
  console.log(String.fromCharCode(10) + "[4] the grace: a login whose row has not landed yet");
  // The maximal delay: no row exists AT ALL when the request arrives, which is
  // strictly worse than any real in-flight upsert could be.
  const freshTok = mint();
  const g1 = await call(freshTok);
  ok("a fresh token with NO row is allowed", g1.status === 200,
    "this is the login the race was breaking; status=" + g1.status);
  ok("and no row was conjured for it", (await rowFor(freshTok)) === null,
    "the grace must not write a session -- the in-flight upsert owns that row");

  // Revocation during the grace. This is the load-bearing safety question: the
  // grace is only defensible because revocation is caught EARLIER, by the
  // blacklist, before the row is ever read. Commit 3 pins that ordering.
  const revokedTok = mint();
  await blacklistToken(revokedTok, ae.id, "proof-revocation-during-grace");
  const g2 = await call(revokedTok);
  ok("a token revoked INSIDE the grace is still refused", g2.status === 401,
    "if this ever passes the grace has opened a revocation gap; status=" + g2.status);

  // And the window really is a window.
  const staleTok = mint(PAST_GRACE);
  const g3 = await call(staleTok);
  ok("a token past the window with no row is refused", g3.status === 401,
    "the grace clears a database round trip, not an absence; status=" + g3.status);

  console.log("\n" + pass + "/" + (pass + fail) + " passed");
  server.closeAllConnections?.();
  server.close();

  await prisma.staffSession.deleteMany({ where: { userId: ae.id } });
  await prisma.tokenBlacklist.deleteMany({ where: { userId: ae.id } }).catch(() => {});
  await prisma.authEvent?.deleteMany?.({ where: { userId: ae.id } }).catch(() => {});
  await prisma.user.delete({ where: { id: ae.id } }).catch(() => {});
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
