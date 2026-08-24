/**
 * ARC 32 PROOF — the email verification gate, both paths, over the real router.
 *
 * WHY OVER HTTP. Arc 16 shipped a proof that inlined the writes it was
 * checking, so deleting the real writer left it green. A proof whose subject is
 * a code path must ENTER that path — real router, real middleware chain, real
 * Zod, real database. Anything else is testing a copy of the code.
 *
 * WHAT IT ASSERTS, in the order that matters:
 *   1. the gate refuses with no receipt at all, and writes no User (fail-closed)
 *   2. code path verifies, and that application then registers
 *   3. link path verifies — the cross-device case the poll exists for
 *   4. a forged HMAC is refused
 *   5. a receipt minted for one address will not register another
 *   6. rotating the nonce (a re-send) kills a receipt already held
 *   7. code and link are each single-use
 *   8. five wrong attempts lock the draft — the CORRECT code then fails too
 *   9. status polling is neutral, and leaks no receipt, before verification
 *  10. re-submitting Step 1 updates the draft rather than duplicating it
 *
 * SAFETY: rehearsal container only (port 5544x); outbound keys explicitly
 * EMPTY — Resend, OpenPhone AND S3, because the register path uploads carrier
 * documents and object storage is an outbound channel like any other.
 * No email, no SMS, no upload leaves the machine — the guard refuses
 * to start otherwise, and refuses on a key that is merely *unset* rather than
 * empty, because dotenv would fill an unset key from backend/.env, which holds
 * the production Resend key. That exact near-miss is Arc 15.
 */

function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  if (!/5544[0-9]/.test(process.env.DATABASE_URL || "")) {
    console.error("REFUSING: not an Arc 32 rehearsal container.");
    process.exit(1);
  }
  // S3 included: the register path uploads carrier documents, so object
  // storage is an outbound channel too. With both empty, storageService takes
  // its local-disk branch and nothing leaves the machine.
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
import type { Server } from "http";

const PORT = 55432;
const BASE = `http://127.0.0.1:${PORT}/api/carrier`;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
}

const uniq = () => crypto.randomBytes(4).toString("hex");

async function postJson(path: string, body: unknown) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

async function getJson(path: string) {
  const r = await fetch(`${BASE}${path}`);
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

/**
 * Registration is multipart — the route's chain is multer → normalizer →
 * contact limiter → Zod. Sending FormData exercises all of it, which matters:
 * the field this gate reads has to survive that chain to reach the controller.
 */
/** The four the v3.8.alc gate requires when no Canadian region is selected. */
const REQUIRED_DOCS = ["w9", "insurance", "authority", "wc"];

async function register(fields: Record<string, string | string[]>, withDocs = true) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    // Repeated keys for array fields — the same shape the wizard sends, and
    // what the route's normalizer expects to see.
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
    else fd.append(k, v);
  }
  if (withDocs) {
    // Registration has gates BEYOND this arc's. Attaching the required docs
    // keeps those satisfied so a failure here means the verification gate,
    // and nothing else.
    for (const t of REQUIRED_DOCS) {
      fd.append("files", new Blob([`%PDF-1.4 arc32 ${t}`], { type: "application/pdf" }), `${t}.pdf`);
      fd.append("docTypes", t);
    }
  }
  const r = await fetch(`${BASE}/register`, { method: "POST", body: fd });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, unknown> };
}

function regFields(email: string, mc: string, receipt?: string) {
  const b: Record<string, string | string[]> = {
    // Required by carrierRegisterSchema with .min(1) — omitting them 400s at
    // validateBody, ahead of the controller, and the gate never runs.
    equipmentTypes: ["Dry Van"],
    operatingRegions: ["Midwest"],
    email,
    password: "Rehearsal!Passw0rd#2026",
    firstName: "Test",
    lastName: "Carrier",
    company: `Arc32 ${mc}`,
    // Unique per fixture: v3.8.ala rejects a duplicate phone, so a shared one
    // makes the second successful registration look like a gate failure.
    phone: `269${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`,
    mcNumber: mc,
    // Unique like the phone, and for the same reason — plus the container
    // persists between runs, so a fixed DOT collides with YESTERDAY's run and
    // reads as a gate failure today.
    dotNumber: String(Math.floor(Math.random() * 9_000_000) + 1_000_000),
    address: "2317 S 35th St",
    city: "Galesburg",
    state: "MI",
    zip: "49053",
    numberOfTrucks: "3",
  };
  if (receipt !== undefined) b.verificationReceipt = receipt;
  return b;
}

async function main() {
  const { prisma } = await import("../src/config/database");
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
  console.log(`app: real router mounted on :${PORT}\n`);

  /** The row is the only place the code exists — outbound is dead. */
  const draftFor = (email: string, mcNumber: string) =>
    prisma.onboardingDraft.findUnique({ where: { email_mcNumber: { email, mcNumber } } });

  /** The 60s cooldown is real; age the row rather than sleeping through it. */
  const ageSend = (email: string, mcNumber: string) =>
    prisma.onboardingDraft.update({
      where: { email_mcNumber: { email, mcNumber } },
      data: { lastSentAt: new Date(Date.now() - 120_000) },
    });

  // ── 1. fail-closed ────────────────────────────────────────────────
  {
    const email = `arc32-nogate-${uniq()}@example.com`;
    const mc = `MC-A${uniq()}`;
    const r = await register(regFields(email, mc));
    check(
      "registration with NO receipt is refused",
      r.status === 403 && r.body.code === "EMAIL_NOT_VERIFIED",
      `status ${r.status}, code ${r.body.code ?? "(none)"}`,
    );
    const created = await prisma.user.findFirst({ where: { email } });
    check("…and no User row was written", !created, created ? "a User EXISTS" : "no User row");
  }

  // ── 2. code path, end to end ──────────────────────────────────────
  {
    const email = `arc32-code-${uniq()}@example.com`;
    const mc = `MC-B${uniq()}`;

    const d1 = await postJson("/onboarding/draft", { email, mcNumber: mc });
    check("Step 1 submit creates a draft", d1.status === 200 && d1.body.ok === true, `status ${d1.status}`);

    const draft = await draftFor(email, mc);
    check(
      "a 6-digit code and a link token are on the row",
      !!draft?.code && draft.code.length === 6 && !!draft.linkTokenHash,
      `code ${draft?.code ? "present" : "MISSING"}, linkTokenHash ${draft?.linkTokenHash ? "present" : "MISSING"}`,
    );

    const poll = await getJson(`/onboarding/status?email=${encodeURIComponent(email)}&mcNumber=${encodeURIComponent(mc)}`);
    check(
      "status poll reports NOT verified, and leaks no receipt",
      poll.status === 200 && poll.body.verified === false && !poll.body.receipt,
      `verified=${poll.body.verified}, receipt ${poll.body.receipt ? "LEAKED" : "absent"}`,
    );

    const v = await postJson("/onboarding/verify-code", { email, code: draft!.code });
    check(
      "the code verifies and mints a receipt",
      v.status === 200 && v.body.verified === true && !!v.body.receipt,
      `status ${v.status}`,
    );

    const reg = await register(regFields(email, mc, String(v.body.receipt)));
    check(
      "the verified application registers",
      reg.status === 201 || reg.status === 200,
      `status ${reg.status}${reg.status >= 400 ? ` — ${JSON.stringify(reg.body).slice(0, 200)}` : ""}`,
    );

    const again = await postJson("/onboarding/verify-code", { email, code: draft!.code });
    check(
      "the same code cannot be used twice",
      again.status === 400 && again.body.verified !== true,
      `status ${again.status}, reason ${again.body.reason ?? "(none)"}`,
    );
  }

  // ── 3. link path — the cross-device case ──────────────────────────
  {
    const email = `arc32-link-${uniq()}@example.com`;
    const mc = `MC-C${uniq()}`;
    await postJson("/onboarding/draft", { email, mcNumber: mc });

    // The plaintext token only ever exists inside the email body. Writing a
    // known token's HASH substitutes for the transport and nothing else — the
    // verify path still does its own hash-and-match against the stored value.
    const token = crypto.randomBytes(32).toString("base64url");
    await prisma.onboardingDraft.update({
      where: { email_mcNumber: { email, mcNumber: mc } },
      data: { linkTokenHash: crypto.createHash("sha256").update(token).digest("hex") },
    });

    const v = await postJson("/onboarding/verify-link", { token });
    check("the one-click link verifies", v.status === 200 && v.body.verified === true, `status ${v.status}`);

    const poll = await getJson(`/onboarding/status?email=${encodeURIComponent(email)}&mcNumber=${encodeURIComponent(mc)}`);
    check(
      "the 5s poll now sees it — this is the cross-device loop closing",
      poll.body.verified === true && !!poll.body.receipt,
      `verified=${poll.body.verified}, receipt ${poll.body.receipt ? "present" : "MISSING"}`,
    );

    const reuse = await postJson("/onboarding/verify-link", { token });
    check("the link is single-use", reuse.status === 400, `status ${reuse.status}`);

    const reg = await register(regFields(email, mc, String(poll.body.receipt)));
    check(
      "the link-verified application registers",
      reg.status === 201 || reg.status === 200,
      `status ${reg.status}${reg.status >= 400 ? ` — ${JSON.stringify(reg.body).slice(0, 200)}` : ""}`,
    );
  }

  // ── 4. forged receipt ─────────────────────────────────────────────
  {
    const email = `arc32-forge-${uniq()}@example.com`;
    const mc = `MC-D${uniq()}`;
    await postJson("/onboarding/draft", { email, mcNumber: mc });
    const payload = Buffer.from(
      JSON.stringify({ email, verifiedAt: Date.now(), nonce: "whatever" }),
    ).toString("base64url");
    const forged = `${payload}.${crypto.randomBytes(32).toString("base64url")}`;

    const r = await register(regFields(email, mc, forged));
    check(
      "a forged HMAC is refused",
      r.status === 403 && r.body.code === "EMAIL_NOT_VERIFIED",
      `status ${r.status}, code ${r.body.code ?? "(none)"}`,
    );
  }

  // ── 5. a receipt is bound to ONE address ──────────────────────────
  {
    const mine = `arc32-mine-${uniq()}@example.com`;
    const other = `arc32-other-${uniq()}@example.com`;
    const mc = `MC-E${uniq()}`;
    await postJson("/onboarding/draft", { email: mine, mcNumber: mc });
    const d = await draftFor(mine, mc);
    const v = await postJson("/onboarding/verify-code", { email: mine, code: d!.code });

    const r = await register(regFields(other, `MC-F${uniq()}`, String(v.body.receipt)));
    check(
      "a receipt for one address will not register another",
      r.status === 403 && r.body.code === "EMAIL_NOT_VERIFIED",
      `status ${r.status} registering ${other} on ${mine}'s receipt`,
    );
  }

  // ── 6. nonce rotation — what makes editing the email re-gate ──────
  {
    const email = `arc32-nonce-${uniq()}@example.com`;
    const mc = `MC-G${uniq()}`;
    await postJson("/onboarding/draft", { email, mcNumber: mc });
    const d1 = await draftFor(email, mc);
    const v = await postJson("/onboarding/verify-code", { email, code: d1!.code });
    const heldReceipt = String(v.body.receipt);

    await ageSend(email, mc);
    await postJson("/onboarding/resend", { email, mcNumber: mc });

    const r = await register(regFields(email, mc, heldReceipt));
    check(
      "rotating the nonce kills a receipt already held",
      r.status === 403 && r.body.code === "EMAIL_NOT_VERIFIED",
      `status ${r.status} — the mechanism behind re-gating on an edited address`,
    );
  }

  // ── 7. attempt cap ────────────────────────────────────────────────
  {
    const email = `arc32-attempts-${uniq()}@example.com`;
    const mc = `MC-H${uniq()}`;
    await postJson("/onboarding/draft", { email, mcNumber: mc });
    const d = await draftFor(email, mc);
    const wrong = d!.code === "000000" ? "111111" : "000000";

    for (let i = 0; i < 5; i++) await postJson("/onboarding/verify-code", { email, code: wrong });
    const locked = await postJson("/onboarding/verify-code", { email, code: d!.code });
    check(
      "five wrong attempts lock the draft — the CORRECT code then fails too",
      locked.status === 400 && locked.body.reason === "too_many_attempts",
      `correct code after 5 wrong → ${locked.status}/${locked.body.reason}`,
    );
  }

  // ── 8. upsert, not duplicate ──────────────────────────────────────
  {
    const email = `arc32-upsert-${uniq()}@example.com`;
    const mc = `MC-I${uniq()}`;
    await postJson("/onboarding/draft", { email, mcNumber: mc, company: "First Co" });
    await ageSend(email, mc);
    await postJson("/onboarding/draft", { email, mcNumber: mc, company: "Second Co" });
    const rows = await prisma.onboardingDraft.findMany({ where: { email } });
    check(
      "re-submitting Step 1 updates the draft, never duplicates",
      rows.length === 1 && rows[0].company === "Second Co",
      `${rows.length} row(s), company=${rows[0]?.company}`,
    );
  }

  // ── 9. neutrality ─────────────────────────────────────────────────
  {
    const r = await postJson("/onboarding/resend", {
      email: `arc32-ghost-${uniq()}@example.com`,
      mcNumber: "MC-NOPE",
    });
    check(
      "resend for an unknown address answers as if sent",
      r.status === 200 && r.body.ok === true,
      `status ${r.status} — a 404 would enumerate applications in flight`,
    );
  }

  // ── 10. genuinely public ──────────────────────────────────────────
  {
    const r = await postJson("/onboarding/draft", {
      email: `arc32-public-${uniq()}@example.com`,
      mcNumber: `MC-J${uniq()}`,
    });
    check(
      "verification routes need no session — the subject has no account yet",
      r.status !== 401 && r.status !== 403,
      `status ${r.status} with no cookie and no bearer token`,
    );
  }

  // ── outbound ──────────────────────────────────────────────────────
  check(
    "outbound was never live",
    process.env.RESEND_API_KEY === "" &&
      process.env.OPENPHONE_API_KEY === "" &&
      process.env.S3_BUCKET_NAME === "" &&
      process.env.AWS_ACCESS_KEY_ID === "",
    "RESEND + OPENPHONE + S3 explicitly empty throughout; emailService took its [NoAPI] branch, storage took local disk",
  );

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  if (failed) console.log(results.filter((r) => !r.ok).map((r) => `  FAILED: ${r.name}`).join("\n"));
  server.close();
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  process.exit(1);
});
