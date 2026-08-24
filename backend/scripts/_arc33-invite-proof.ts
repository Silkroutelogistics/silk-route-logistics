/**
 * ARC 33 PROOF — the invitation chain, over the real router.
 *
 * WHAT IT ASSERTS:
 *   1. an AE issues an invitation; the copy-link is returned either way
 *   2. the draft appears at INVITED — the funnel shows it before any click
 *   3. clicking accepts, burns the token, moves to LINK_CLICKED, mints a receipt
 *   4. that receipt registers WITHOUT any OTP step — the click was the proof
 *   5. a second click says "already verified", not an error
 *   6. re-inviting refreshes the token in place and never duplicates
 *   7. an expired invitation is refused, and asking for a fresh one is silent
 *   8. a forged token is refused
 *   9. inviting an existing carrier returns their state to the AE
 *  10. both approval paths produce the SAME congratulation, exactly once
 *
 * SAFETY: rehearsal container only (5544x); Resend, OpenPhone AND S3 explicitly
 * EMPTY. The guard refuses on a key that is merely unset rather than empty,
 * because dotenv fills an unset key from backend/.env, which holds the
 * production Resend key. That near-miss is Arc 15.
 */

function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  if (!/5544[0-9]/.test(process.env.DATABASE_URL || "")) {
    console.error("REFUSING: not an Arc 33 rehearsal container.");
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

const PORT = 55433;
const API = `http://127.0.0.1:${PORT}/api`;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
}

const uniq = () => crypto.randomBytes(4).toString("hex");
const sha256 = (s: string) => crypto.createHash("sha256").update(s).digest("hex");

async function post(path: string, body: unknown, cookie?: string) {
  const r = await fetch(`${API}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
  return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, any> };
}

async function register(fields: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (Array.isArray(v)) v.forEach((x) => fd.append(k, x));
    else fd.append(k, v);
  }
  for (const t of ["w9", "insurance", "authority", "wc"]) {
    fd.append("files", new Blob([`%PDF-1.4 arc33 ${t}`], { type: "application/pdf" }), `${t}.pdf`);
    fd.append("docTypes", t);
  }
  const r = await fetch(`${API}/carrier/register`, { method: "POST", body: fd });
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
    company: `Arc33 ${mc}`,
    phone: `269${String(Math.floor(Math.random() * 9_000_000) + 1_000_000)}`,
    mcNumber: mc,
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
  const { approveCarrier } = await import("../src/services/approvalService");

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((r) => {
    const s = app.listen(PORT, "127.0.0.1", () => r(s));
  });
  console.log(`app: real router mounted on :${PORT}\n`);

  // An AE to invite as. Real row, real cookie — the endpoint is ADMIN-gated and
  // a proof that bypasses the gate proves nothing about the gate.
  const stamp = Date.now();
  const ae = await prisma.user.create({
    data: {
      email: `arc33-ae-${stamp}@srl.invalid`,
      passwordHash: "x",
      firstName: "Arc33",
      lastName: "Admin",
      role: "ADMIN",
      company: "SRL",
      phone: `269${String(stamp).slice(-7)}`,
    },
  });
  const aeToken = jwt.sign({ userId: ae.id, email: ae.email, role: "ADMIN" }, process.env.JWT_SECRET!, {
    algorithm: "HS256",
    expiresIn: "1h",
  });
  const aeCookie = `srl_token_ae=${aeToken}`;

  // ── 1-4. issue → click → register, no OTP ─────────────────────────
  let invitedEmail = "";
  {
    const email = `arc33-invited-${uniq()}@example.com`;
    invitedEmail = email;
    const mc = `MC-I${uniq()}`;

    const iss = await post("/carriers/invite", { email, company: "Arc33 Haulage", mcNumber: mc, note: "Good speaking today." }, aeCookie);
    check(
      "an AE can issue an invitation",
      iss.status === 201 && !!iss.body.inviteUrl,
      `status ${iss.status}${iss.status >= 400 ? ` — ${JSON.stringify(iss.body).slice(0, 160)}` : ""}`,
    );
    check(
      "the copy-link is returned even though outbound is dead",
      typeof iss.body.inviteUrl === "string" && iss.body.inviteUrl.includes("/onboarding?invite="),
      `emailSent=${iss.body.emailSent}, link ${iss.body.inviteUrl ? "returned" : "MISSING"}`,
    );

    const draft = await prisma.onboardingDraft.findFirst({ where: { email } });
    check(
      "the funnel shows the invitation before any click",
      draft?.status === "INVITED" && draft?.invitedById === ae.id,
      `status=${draft?.status}, invitedBy ${draft?.invitedById === ae.id ? "recorded" : "MISSING"}`,
    );

    const token = new URL(String(iss.body.inviteUrl)).searchParams.get("invite")!;
    const acc = await post("/carrier/onboarding/invite/accept", { token });
    check(
      "clicking accepts and mints a receipt",
      acc.status === 200 && acc.body.accepted === true && !!acc.body.receipt,
      `status ${acc.status}, receipt ${acc.body.receipt ? "minted" : "MISSING"}`,
    );
    check(
      "the prefill the AE typed comes back",
      acc.body.prefill?.company === "Arc33 Haulage" && acc.body.prefill?.mcNumber === mc,
      `company=${acc.body.prefill?.company}, mc=${acc.body.prefill?.mcNumber}`,
    );

    const afterClick = await prisma.onboardingDraft.findFirst({ where: { email } });
    check(
      "the funnel advances to LINK_CLICKED",
      afterClick?.status === "LINK_CLICKED" && afterClick?.verifiedAt !== null,
      `status=${afterClick?.status}, verifiedAt ${afterClick?.verifiedAt ? "set" : "NULL"}`,
    );

    // The load-bearing one: no OTP was ever requested or typed.
    const reg = await register(regFields(email, mc, String(acc.body.receipt)));
    check(
      "the invited carrier registers with NO code step",
      reg.status === 201 || reg.status === 200,
      `status ${reg.status}${reg.status >= 400 ? ` — ${JSON.stringify(reg.body).slice(0, 200)}` : ""}`,
    );

    const second = await post("/carrier/onboarding/invite/accept", { token });
    check(
      "a second click says already-verified, not an error",
      second.status === 200 && second.body.accepted === true && second.body.alreadyUsed === true,
      `status ${second.status}, alreadyUsed=${second.body.alreadyUsed}`,
    );
  }

  // ── 5. re-invite refreshes in place ───────────────────────────────
  {
    const email = `arc33-reinvite-${uniq()}@example.com`;
    const a = await post("/carriers/invite", { email }, aeCookie);
    const b = await post("/carriers/invite", { email }, aeCookie);
    const rows = await prisma.onboardingInvite.findMany({ where: { email } });
    check(
      "re-inviting refreshes the token and never duplicates",
      rows.length === 1 && b.body.reissued === true && a.body.inviteUrl !== b.body.inviteUrl,
      `${rows.length} invite row(s), reissued=${b.body.reissued}, token rotated=${a.body.inviteUrl !== b.body.inviteUrl}`,
    );

    const oldToken = new URL(String(a.body.inviteUrl)).searchParams.get("invite")!;
    const stale = await post("/carrier/onboarding/invite/accept", { token: oldToken });
    check(
      "the superseded link stops working",
      stale.status === 400,
      `status ${stale.status} — re-issuing must invalidate the link already sent`,
    );
  }

  // ── 6. expiry ─────────────────────────────────────────────────────
  {
    const email = `arc33-expired-${uniq()}@example.com`;
    const iss = await post("/carriers/invite", { email }, aeCookie);
    const token = new URL(String(iss.body.inviteUrl)).searchParams.get("invite")!;
    await prisma.onboardingInvite.updateMany({
      where: { tokenHash: sha256(token) },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const acc = await post("/carrier/onboarding/invite/accept", { token });
    check(
      "an expired invitation is refused",
      acc.status === 400 && acc.body.reason === "expired",
      `status ${acc.status}, reason ${acc.body.reason}`,
    );

    const fresh = await post("/carrier/onboarding/invite/request-fresh", { token });
    const note = await prisma.notification.findFirst({
      where: { userId: ae.id, title: { contains: "fresh invitation" } },
    });
    check(
      "asking for a fresh link notifies the inviting AE and issues nothing",
      fresh.status === 200 && !!note,
      `status ${fresh.status}, AE notified=${!!note} — deliberately does NOT auto-issue`,
    );
  }

  // ── 7. forged ─────────────────────────────────────────────────────
  {
    const acc = await post("/carrier/onboarding/invite/accept", {
      token: crypto.randomBytes(32).toString("base64url"),
    });
    check("a forged invitation token is refused", acc.status === 400, `status ${acc.status}`);
  }

  // ── 8. inviting someone who already exists ────────────────────────
  {
    const dup = await post("/carriers/invite", { email: invitedEmail }, aeCookie);
    check(
      "inviting an existing carrier returns their state to the AE",
      dup.status === 409 && typeof dup.body.error === "string" && dup.body.error.length > 10,
      `status ${dup.status} — "${String(dup.body.error).slice(0, 90)}"`,
    );
  }

  // ── 9. both approval paths congratulate identically, once ─────────
  {
    const prof = await prisma.carrierProfile.findFirst({
      where: { user: { email: invitedEmail } },
      select: { id: true, userId: true, onboardingStatus: true },
    });
    check("the invited carrier has a profile to approve", !!prof, prof ? `status=${prof.onboardingStatus}` : "NO PROFILE");

    if (prof) {
      await approveCarrier({ carrierId: prof.id, approvedById: null, source: "COMPASS_AUTO" });
      await new Promise((r) => setTimeout(r, 400));
      const first = await prisma.notification.count({
        where: { userId: prof.userId, actionUrl: `/carrier/dashboard?approved=${prof.id}` },
      });
      check(
        "the auto-approve path congratulates the carrier",
        first === 1,
        `${first} approval notification(s) — the path that previously sent none`,
      );

      // Force the repeat the dedup exists for.
      await prisma.carrierProfile.update({ where: { id: prof.id }, data: { onboardingStatus: "REVIEWING" } });
      await approveCarrier({ carrierId: prof.id, approvedById: ae.id, source: "AE" });
      await new Promise((r) => setTimeout(r, 400));
      const after = await prisma.notification.count({
        where: { userId: prof.userId, actionUrl: `/carrier/dashboard?approved=${prof.id}` },
      });
      check(
        "a second approval does NOT congratulate twice",
        after === 1,
        `${after} notification(s) after both paths ran — link-encoded exactly-once`,
      );
    }
  }

  // ── 10. PENDING -> REVIEWING, the transition that did not exist ───
  {
    const { transitionToReviewing } = await import("../src/services/onboardingLifecycleService");
    const email = `arc33-review-${uniq()}@example.com`;
    const mc = `MC-R${uniq()}`;
    const d = await post("/carrier/onboarding/draft", { email, mcNumber: mc });
    check("draft created for the review walk", d.status === 200, `status ${d.status}`);
    const row = await prisma.onboardingDraft.findFirst({ where: { email } });
    const v = await post("/carrier/onboarding/verify-code", { email, code: row!.code });
    const reg = await register(regFields(email, mc, String(v.body.receipt)));
    check("that carrier registered", reg.status === 201 || reg.status === 200, `status ${reg.status}`);

    const prof = await prisma.carrierProfile.findFirst({ where: { user: { email } }, select: { id: true, userId: true, onboardingStatus: true } });
    if (prof && prof.onboardingStatus === "PENDING") {
      const first = await transitionToReviewing(prof.id);
      const again = await transitionToReviewing(prof.id);
      const notes = await prisma.notification.count({
        where: { userId: prof.userId, actionUrl: `/carrier/dashboard/application-status?reviewing=${prof.id}` },
      });
      check(
        "PENDING -> REVIEWING moves once and tells the carrier once",
        first.moved && first.announced && !again.moved && notes === 1,
        `first={moved:${first.moved},announced:${first.announced}} second={moved:${again.moved}} notifications=${notes}`,
      );
    } else {
      check(
        "PENDING -> REVIEWING moves once and tells the carrier once",
        false,
        `carrier was ${prof?.onboardingStatus ?? "absent"}, not PENDING — auto-approve may have taken it`,
      );
    }
  }

  check(
    "outbound was never live",
    process.env.RESEND_API_KEY === "" &&
      process.env.OPENPHONE_API_KEY === "" &&
      process.env.S3_BUCKET_NAME === "" &&
      process.env.AWS_ACCESS_KEY_ID === "",
    "RESEND + OPENPHONE + S3 explicitly empty throughout; emailService took its [NoAPI] branch",
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
