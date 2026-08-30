/**
 * PROOF — the mailbox is proven ONCE, and that proof carries forward.
 *
 * The defect this closes: a carrier proved their mailbox at the onboarding gate,
 * and registration then sent them a SECOND verification email and left
 * User.emailVerifiedAt null — so the Compass auto-approve gate held them until
 * they proved the same mailbox a second time. Fixed in v3.8.avb; this is the
 * wire-level evidence that it works, which was owed and never produced.
 *
 * WHY THIS SCRIPT WAS REWRITTEN. Its first version was committed unrun and would
 * have reported a misleading pass:
 *   - it drove the SERVICE directly, so the "forged geo is ignored" assertion
 *     never met validateBody — the very thing that strips the field;
 *   - it never touched registration at all, so the carry-forward, the second
 *     email and the receipt gate were unasserted;
 *   - its "no second verification email" check passed a literal `true`.
 * Everything below goes over HTTP through the real router.
 *
 *   docker run -d --name srl-vfix -e POSTGRES_PASSWORD=srl -e POSTGRES_USER=srl \
 *     -e POSTGRES_DB=srl -p 55442:5432 postgres:16
 *   DATABASE_URL=postgresql://srl:srl@127.0.0.1:55442/srl?sslmode=disable \
 *   DIRECT_URL=$DATABASE_URL npx prisma migrate deploy
 *   RESEND_API_KEY= OPENPHONE_API_KEY= S3_BUCKET_NAME= AWS_ACCESS_KEY_ID= \
 *   JWT_SECRET=proof NODE_ENV=development \
 *   DATABASE_URL=... npx tsx scripts/_arcfix-verification-carryforward-proof.ts
 */

function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  if (!/5544[0-9]/.test(process.env.DATABASE_URL || "")) {
    console.error("REFUSING: not a rehearsal container (expected a 5544x port).");
    process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY", "S3_BUCKET_NAME", "AWS_ACCESS_KEY_ID"]) {
    if (process.env[k] !== "") {
      console.error(`REFUSING: ${k} must be explicitly EMPTY (is: ${process.env[k] === undefined ? "unset" : "set"}).`);
      console.error("dotenv fills an UNSET key from backend/.env, which holds the production Resend key.");
      process.exit(1);
    }
  }
  console.log("guard: rehearsal DB; RESEND + OPENPHONE + S3 explicitly empty\n");
}
guard();

import crypto from "crypto";
import type { Server } from "http";

const PORT = 4791;
const BASE = `http://127.0.0.1:${PORT}/api/carrier`;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
const check = (name: string, ok: boolean, detail: string) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
};
const uniq = () => crypto.randomBytes(4).toString("hex");

/**
 * Outbound capture. With RESEND_API_KEY empty the service takes its [NoAPI]
 * branch and logs — so counting sends means reading what it logged, which also
 * proves the send path was REACHED rather than that nothing was attempted.
 */
const sends: string[] = [];

/**
 * 32-byte randomBytes values seen during a send. The link token is one of them;
 * which one is settled by hashing, never by assumption.
 */
let tokenCandidates: Buffer[] = [];
{
  const orig = crypto.randomBytes.bind(crypto);
  (crypto as any).randomBytes = (n: number, cb?: unknown) => {
    const out = (orig as any)(n, cb);
    if (n === 32 && Buffer.isBuffer(out)) tokenCandidates.push(out);
    return out;
  };
}

/** Two distinct public IPs, so "which context proved it" is answerable. */
const IP_DESKTOP = "8.8.8.8";       // where the application is filled in
const IP_PHONE = "139.130.4.5";     // where the emailed link is opened (AU)

/** Body carries a hostile self-reported origin on every call. It must be ignored. */
const HOSTILE = { verifiedFromCountry: "ZZ", verifiedFromIp: "9.9.9.9" };

async function post(path: string, body: unknown, ip: string) {
  const r = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-forwarded-for": ip,
      "user-agent": `ProofAgent/${ip}`,
    },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, any> };
}

const REQUIRED_DOCS = ["w9", "insurance", "authority", "wc"];

async function register(fields: Record<string, string | string[]>, ip: string) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
    else fd.append(k, v);
  }
  for (const t of REQUIRED_DOCS) {
    fd.append("files", new Blob([`%PDF-1.4 vfix ${t}`], { type: "application/pdf" }), `${t}.pdf`);
    fd.append("docTypes", t);
  }
  const r = await fetch(`${BASE}/register`, {
    method: "POST",
    body: fd,
    headers: { "x-forwarded-for": ip, "user-agent": `ProofAgent/${ip}` },
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, any> };
}

function regFields(email: string, mc: string, receipt?: string) {
  const b: Record<string, string | string[]> = {
    equipmentTypes: ["Dry Van"],
    operatingRegions: ["Midwest"],
    email,
    password: "Rehearsal!Passw0rd#2026",
    firstName: "Test",
    lastName: "Carrier",
    company: `VFix ${mc}`,
    phone: `269${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`,
    mcNumber: mc,
    dotNumber: String(Math.floor(Math.random() * 9_000_000) + 1_000_000),
    address: "2317 S 35th St",
    city: "Galesburg",
    state: "MI",
    zip: "49053",
    numberOfTrucks: "3",
    // Hostile on the registration wire too.
    ...HOSTILE,
  };
  if (receipt !== undefined) b.verificationReceipt = receipt;
  return b;
}

async function main() {
  const { prisma } = await import("../src/config/database");
  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const routes = (await import("../src/routes")).default;
  const { log: logger } = (await import("../src/lib/logger")) as any;

  // Hook the logger the email service actually uses, so a send is counted where
  // it happens rather than inferred from absence.
  for (const lvl of ["info", "warn", "error"] as const) {
    const orig = logger[lvl].bind(logger);
    logger[lvl] = (...a: unknown[]) => {
      const line = a.map((x) => (typeof x === "string" ? x : JSON.stringify(x))).join(" ");
      if (/\[Email\]/.test(line)) sends.push(line);
      return orig(...a);
    };
  }

  const app = express();
  app.set("trust proxy", 1);
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((r) => {
    const s = app.listen(PORT, "127.0.0.1", () => r(s));
  });
  console.log(`app: real router mounted on :${PORT}\n`);

  const draftFor = (email: string, mcNumber: string) =>
    prisma.onboardingDraft.findUnique({ where: { email_mcNumber: { email, mcNumber } } });

  // ── Both verification paths ────────────────────────────────────────────────
  for (const path of ["LINK", "CODE"] as const) {
    console.log(`── ${path} path`);
    const email = `vfix-${path.toLowerCase()}-${uniq()}@srl.invalid`;
    const mc = `MC-${uniq()}`;

    // Step 1 of the wizard, from the desktop. Reset the candidate window so the
    // token recovered below can only have come from THIS send.
    tokenCandidates = [];
    const d = await post("/onboarding/draft", { email, mcNumber: mc, dotNumber: "1558158", ...HOSTILE }, IP_DESKTOP);
    check(`${path}: draft created + verification sent`, d.status === 200 && d.body.ok === true, `HTTP ${d.status}`);

    const row = await draftFor(email, mc);
    if (!row) { check(`${path}: draft row exists`, false, "no row"); continue; }

    let verified: { status: number; body: Record<string, any> };
    if (path === "LINK") {
      // The emailed link, opened from a DIFFERENT context — the common real
      // case: application filled in on a laptop, email opened on a phone.
      //
      // The raw token exists only inside the email body, and the [NoAPI] log
      // line carries To/Subject and nothing else — so it cannot be read out of
      // captured outbound. It is recovered instead from the randomBytes calls
      // made while the send ran, and the RIGHT candidate is IDENTIFIED by
      // hashing it and matching the linkTokenHash the service stored. That is
      // self-verifying: a wrong guess cannot match.
      const token = tokenCandidates
        .map((b) => b.toString("base64url"))
        .find((t) => crypto.createHash("sha256").update(t).digest("hex") === row.linkTokenHash);
      if (!token) {
        check(`${path}: link token recovered and identified by its stored hash`, false,
          `${tokenCandidates.length} candidate(s), none hashing to the stored linkTokenHash`);
        continue;
      }
      check(`${path}: link token recovered and identified by its stored hash`, true,
        `matched linkTokenHash ${String(row.linkTokenHash).slice(0, 12)}…`);
      verified = await post("/onboarding/verify-link", { token, ...HOSTILE }, IP_PHONE);
    } else {
      verified = await post("/onboarding/verify-code", { email, code: row.code, ...HOSTILE }, IP_PHONE);
    }
    check(`${path}: verification accepted`, verified.status === 200 && verified.body.verified === true,
      `HTTP ${verified.status} verified=${verified.body.verified}`);
    const receipt: string | undefined = verified.body.receipt;
    if (!receipt) { check(`${path}: receipt minted`, false, "no receipt"); continue; }

    const after = await draftFor(email, mc);
    check(`${path}: the draft records WHERE it was proven from`,
      !!after?.verifiedFromIp && !!after?.verifiedUserAgent,
      `ip=${after?.verifiedFromIp} country=${after?.verifiedFromCountry} ua=${String(after?.verifiedUserAgent).slice(0, 22)}`);

    check(`${path}: the origin is the VERIFYING context, not where the form was filled in`,
      after?.verifiedFromIp === IP_PHONE,
      `recorded ${after?.verifiedFromIp}; draft was created from ${IP_DESKTOP}`);

    check(`${path}: the self-reported origin on the wire is IGNORED`,
      after?.verifiedFromCountry !== "ZZ" && after?.verifiedFromIp !== "9.9.9.9",
      `body claimed ZZ / 9.9.9.9; stored ${after?.verifiedFromCountry} / ${after?.verifiedFromIp}`);

    // ── Registration, carrying the receipt ───────────────────────────────────
    const beforeReg = sends.length;
    const reg = await register(regFields(email, mc, receipt), IP_DESKTOP);
    check(`${path}: registration accepted with the receipt`, reg.status === 201,
      `HTTP ${reg.status}${reg.status !== 201 ? " body=" + JSON.stringify(reg.body).slice(0, 120) : ""}`);
    if (reg.status !== 201) continue;

    const user = await prisma.user.findFirst({ where: { email } });
    check(`${path}: the proof carries onto the User`,
      !!user?.emailVerifiedAt && !!user?.emailVerifiedFromIp,
      `emailVerifiedAt=${user?.emailVerifiedAt?.toISOString()} ip=${user?.emailVerifiedFromIp} country=${user?.emailVerifiedFromCountry}`);

    check(`${path}: the carried origin matches the draft's, not the registering context`,
      user?.emailVerifiedFromIp === after?.verifiedFromIp,
      `user=${user?.emailVerifiedFromIp} draft=${after?.verifiedFromIp} (registered from ${IP_DESKTOP})`);

    // The defect, stated as a count: registration must send NO verification mail.
    const regSends = sends.slice(beforeReg);
    const verifySends = regSends.filter((s) => /verif/i.test(s));
    check(`${path}: NO second verification email at registration`,
      verifySends.length === 0,
      `${regSends.length} outbound during registration, ${verifySends.length} of them verification-shaped` +
      (verifySends.length ? ` :: ${verifySends[0].slice(0, 90)}` : ""));

    // The auto-approve gate's precondition — the thing avb changed. Compass
    // grading itself needs live FMCSA and is NOT asserted here.
    check(`${path}: the Compass auto-approve gate's email precondition is satisfied at registration`,
      !!user?.emailVerifiedAt,
      user?.emailVerifiedAt ? "emailVerifiedAt set — the gate no longer holds this carrier" : "null — gate would hold");
    console.log("");
  }

  // ── Adversarial: the Arc 32 gate is unchanged ──────────────────────────────
  console.log("── adversarial");
  {
    const email = `vfix-noreceipt-${uniq()}@srl.invalid`;
    const mc = `MC-${uniq()}`;
    await post("/onboarding/draft", { email, mcNumber: mc, dotNumber: "1558158" }, IP_DESKTOP);
    const noReceipt = await register(regFields(email, mc), IP_DESKTOP);
    check("registration WITHOUT a receipt is refused", noReceipt.status === 403 || noReceipt.status === 400,
      `HTTP ${noReceipt.status} ${JSON.stringify(noReceipt.body).slice(0, 90)}`);

    const forged = await register(regFields(email, mc, "forged.receipt.value"), IP_DESKTOP);
    check("a forged receipt is refused", forged.status === 403 || forged.status === 400,
      `HTTP ${forged.status} ${JSON.stringify(forged.body).slice(0, 90)}`);
  }

  // ── The AE surface reads the FIRST verification ────────────────────────────
  //
  // Verifying the display, not rebuilding it: SecuritySignalsCard already renders
  // a three-point geo grid and a country-mismatch alert. What changed in avb is
  // that emailVerifiedFromCountry is now populated from the ORIGINAL gate rather
  // than a second email nobody sent. This drives the endpoint the card reads.
  console.log("\n── AE security-signals surface");
  {
    const jwt = (await import("jsonwebtoken")).default;
    const { registerSession } = await import("../src/middleware/auth");

    const admin = await prisma.user.create({
      data: {
        email: `vfix-adm-${uniq()}@srl.invalid`, passwordHash: "x",
        firstName: "Proof", lastName: "Admin", role: "ADMIN",
      },
    });
    const token = jwt.sign({ userId: admin.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
    // Arc 34: a minted token that was never registered authenticates once and is
    // refused thereafter. Register it, or this reads as an authz failure.
    registerSession(admin.id, token, "ADMIN");
    const H = { Cookie: `srl_token_ae=${token}` };

    // A carrier proven from a DIFFERENT country than they applied from.
    const email = `vfix-geo-${uniq()}@srl.invalid`;
    const mc = `MC-${uniq()}`;
    tokenCandidates = [];
    await post("/onboarding/draft", { email, mcNumber: mc, dotNumber: "1558158" }, IP_DESKTOP);
    const row = await draftFor(email, mc);
    const v = await post("/onboarding/verify-code", { email, code: row!.code }, IP_PHONE);
    const reg = await register(regFields(email, mc, v.body.receipt), IP_DESKTOP);
    check("cross-country fixture registers", reg.status === 201, `HTTP ${reg.status}`);

    if (reg.status === 201) {
      const u = await prisma.user.findFirst({ where: { email } });
      const prof = await prisma.carrierProfile.findFirst({ where: { userId: u!.id } });
      const r = await fetch(`http://127.0.0.1:${PORT}/api/carriers/${prof!.id}/security-signals`, { headers: H });
      const sig = (await r.json().catch(() => ({}))) as any;

      check("the AE endpoint answers", r.status === 200, `HTTP ${r.status}`);
      check("email-verify point renders from the FIRST verification",
        !!sig?.geo?.emailVerifiedAt && sig?.geo?.emailVerifiedFromIp === IP_PHONE,
        `at=${sig?.geo?.emailVerifiedAt} ip=${sig?.geo?.emailVerifiedFromIp} country=${sig?.geo?.emailVerifiedFromCountry}`);
      check("the three-point baseline is populated, not empty",
        !!sig?.geo?.registrationCountry && !!sig?.geo?.emailVerifiedFromCountry,
        `registration=${sig?.geo?.registrationCountry} emailVerify=${sig?.geo?.emailVerifiedFromCountry} lastLogin=${sig?.geo?.lastLoginCountry ?? "(never)"}`);
      check("the cross-country mismatch alert fires",
        sig?.geo?.geoMismatch === true,
        `geoMismatch=${sig?.geo?.geoMismatch} (${sig?.geo?.registrationCountry} → ${sig?.geo?.emailVerifiedFromCountry})`);

      // ── The two AE riders. Verified, not rebuilt — both shipped in v3.8.avc.
      const ev = sig?.authEvents ?? [];
      check("auth-timeline panel is populated for this carrier",
        Array.isArray(ev) && ev.length > 0,
        `${ev.length} event(s); types: ${[...new Set(ev.map((e: any) => e.type))].join(", ") || "(none)"}`);
      check("auth events carry the shape the panel renders",
        ev.length > 0 && ev.every((e: any) => e.type && e.createdAt),
        ev.length ? `first: type=${ev[0].type} ip=${ev[0].ip ?? "(none)"} at=${ev[0].createdAt}` : "no events");
      check("the timeline is keyed by EMAIL, so pre-account events are included",
        ev.some((e: any) => String(e.type).startsWith("onboarding.")),
        `onboarding.* events present: ${ev.filter((e: any) => String(e.type).startsWith("onboarding.")).length}` +
        " — these predate the User row, which is why the panel keys on email");

      // A carrier who has never signed in correctly has none. That is the empty
      // state the panel renders, not a defect — asserted as a contract, not
      // fabricated into a population.
      check("session panel returns its contract (empty for a never-logged-in carrier)",
        Array.isArray(sig?.sessions),
        `sessions=${Array.isArray(sig?.sessions) ? sig.sessions.length : "(absent)"} — this fixture never signed in, so 0 is correct`);
    }
  }

  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  server.close();
  await prisma.$disconnect();
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
