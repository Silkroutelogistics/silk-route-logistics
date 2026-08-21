/**
 * ARC 18 — the ratified termination-mid-load policy, proved live.
 *
 * THE POLICY (§14, ratified 2026-08-21): in-flight loads complete and pay
 * normally; termination blocks future tenders only. Freight-cause exceptions are
 * human-handled and out of code scope.
 *
 * Arc 17 pinned the *behaviour* while the decision was pending, with the comment
 * "so it cannot drift unnoticed while undecided". The behaviour has not changed;
 * the reason for pinning it has. These assertions now say what the platform
 * PROMISES rather than what it happens to do — and they add the two things Arc
 * 18 built on top: the AE is told, and the watch tightens.
 *
 * Presence is not function (§19 Sub-pattern 16): every claim below goes through
 * the real endpoint over HTTP with a real admin session, not through a
 * reproduction of what the endpoint does.
 *
 * SAFETY: rehearsal container only; both outbound keys explicitly EMPTY.
 */

function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!url.includes("55432") && !url.includes("55433")) {
    console.error("REFUSING: DATABASE_URL is not a rehearsal container."); process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY"]) {
    const v = process.env[k];
    if (v === undefined) { console.error(`REFUSING: ${k} UNSET — dotenv would fill it from backend/.env.`); process.exit(1); }
    if (v !== "") { console.error(`REFUSING: ${k} set to a real value. Outbound would be LIVE.`); process.exit(1); }
  }
  console.log("guard: rehearsal DB; outbound keys explicitly empty (post-dotenv)\n");
}
guard();

import jwt from "jsonwebtoken";
import type { Server } from "http";

const PORT = 55818;
const BASE = `http://127.0.0.1:${PORT}/api`;
const AGREED = 4100;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
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
  const server: Server = await new Promise((resolve) => {
    const srv = app.listen(PORT, "127.0.0.1", () => resolve(srv));
  });
  console.log(`app: real router mounted on :${PORT}\n`);

  const stamp = Date.now();
  const customer = await prisma.customer.create({
    data: { name: `T18 ${stamp}`, email: `t18-${stamp}@arc18.invalid`, phone: "2692206760" },
  });
  const ae = await prisma.user.create({
    data: { email: `ae-${stamp}@arc18.invalid`, passwordHash: "x", firstName: "T18", lastName: "AE", role: "BROKER" },
  });
  const admin = await prisma.user.create({
    data: { email: `adm-${stamp}@arc18.invalid`, passwordHash: "x", firstName: "T18", lastName: "Admin", role: "ADMIN" },
  });
  const cu = await prisma.user.create({
    data: {
      email: `car-${stamp}@arc18.invalid`, passwordHash: "x", firstName: "T18", lastName: "Carrier",
      role: "CARRIER", company: "Terminated Trucking LLC", phone: "+12695550188",
    },
  });
  const cp = await prisma.carrierProfile.create({
    data: {
      userId: cu.id, companyName: "Terminated Trucking LLC",
      mcNumber: `MC-T18-${stamp}`.slice(0, 30), dotNumber: `${String(stamp).slice(-6)}1`,
      onboardingStatus: "APPROVED", status: "APPROVED", cppTier: "SILVER",
      equipmentTypes: ["REEFER"], operatingRegions: ["Northeast"],
    },
  });
  const bca = await prisma.carrierAgreement.create({
    data: {
      carrierId: cp.id, templateName: "broker-carrier", version: "arc18",
      status: "SIGNED", signedAt: new Date(), signedByName: "T18 Carrier",
    },
  });

  let n = 0;
  async function makeLoad(status: string) {
    n += 1;
    return prisma.load.create({
      data: {
        referenceNumber: `T18-${stamp}-${n}`, posterId: ae.id, customerId: customer.id, carrierId: cu.id,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "76247",
        equipmentType: "REEFER",
        pickupDate: new Date(Date.now() + 3600_000),
        deliveryDate: new Date(Date.now() + 3 * 86400_000),
        rate: 5100, customerRate: 5100, carrierRate: AGREED,
        status: status as any,
      },
    });
  }

  // Three loads: one mid-haul, one delivered-but-paperwork-pending, and one
  // already complete. The third must NOT be swept up — it needs paying, not
  // watching.
  const inTransit = await makeLoad("IN_TRANSIT");
  const delivered = await makeLoad("DELIVERED");
  const done = await makeLoad("COMPLETED");

  const beforeCalls = await prisma.checkCallSchedule.count({ where: { loadId: inTransit.id } });

  const cookie = `srl_token_ae=${jwt.sign({ userId: admin.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" })}`;
  const res = await fetch(`${BASE}/carriers/${cp.id}/agreements/${bca.id}/terminate`, {
    method: "POST",
    headers: { Cookie: cookie, "Content-Type": "application/json" },
    body: JSON.stringify({ reason: "Arc 18 policy proof — terminating with freight on the road." }),
  });
  const body: any = await res.json().catch(() => ({}));

  console.log("── the endpoint ──────────────────────────────────────────────────");
  check("termination succeeds through the real endpoint", res.status === 200, `HTTP ${res.status}`);

  console.log("\n── what STOPS ────────────────────────────────────────────────────");
  {
    const { complianceCheck } = await import("../src/services/complianceMonitorService");
    const c = await complianceCheck(cp.id);
    check(
      "future tenders are blocked immediately",
      !c.allowed,
      `blocked: ${(c.blocked_reasons || []).join("; ")}`,
    );
  }

  console.log("\n── what DOES NOT stop — the ratified policy ──────────────────────");
  {
    const after = await prisma.load.findUnique({ where: { id: inTransit.id } });
    check(
      "an in-flight load stays with the carrier and keeps its status",
      after?.status === "IN_TRANSIT" && after?.carrierId === cu.id,
      `${after?.status}, carrier still assigned — RATIFIED: in-flight loads complete normally`,
    );
    check(
      "the agreed carrier rate is untouched, so it will pay normally",
      Number(after?.carrierRate) === AGREED,
      `carrierRate still $${after?.carrierRate} — termination is not a reason to stop paying for freight already hauled`,
    );

    // And it really does settle. The whole point of "pay normally".
    const { onLoadDelivered } = await import("../src/services/integrationService");
    await prisma.load.update({ where: { id: delivered.id }, data: { status: "DELIVERED" } });
    await onLoadDelivered(delivered.id);
    const pay = await prisma.carrierPay.findFirst({ where: { loadId: delivered.id } });
    check(
      "a load delivered by a TERMINATED carrier still produces a settlement",
      !!pay && Number(pay.lineHaul) === AGREED,
      pay ? `CarrierPay at $${pay.lineHaul}` : "NO settlement — the carrier hauled it and would not be paid",
    );
  }

  console.log("\n── what ARC 18 ADDS — a human is told, and the watch tightens ────");
  {
    check(
      "the response reports the in-flight loads honestly",
      body?.inFlight?.count === 2,
      `count=${body?.inFlight?.count} (expected 2: IN_TRANSIT + DELIVERED; the COMPLETED load is excluded)`,
    );
    const refs = (body?.inFlight?.loads || []).map((l: any) => l.referenceNumber);
    check(
      "a COMPLETED load is NOT swept up",
      !refs.includes(done.referenceNumber),
      refs.includes(done.referenceNumber)
        ? "the finished load was escalated — it needs paying, not watching"
        : `listed: ${refs.join(", ")}`,
    );

    const notif = await prisma.notification.findFirst({
      where: { userId: ae.id, title: { contains: "still in flight" } },
      orderBy: { createdAt: "desc" },
    });
    check(
      "the AE who owns the loads is told, by load number",
      !!notif && notif.message.includes(inTransit.referenceNumber),
      notif ? `"${notif.title}"` : "no AE notification — the Arc 17 gap",
    );
    check(
      "the notification states the policy rather than just the fact",
      !!notif && /complete and pay normally/.test(notif.message),
      notif ? `message says: "…${notif.message.slice(0, 90)}…"` : "n/a",
    );

    const afterCalls = await prisma.checkCallSchedule.count({ where: { loadId: inTransit.id } });
    const urgency = await prisma.load.findUnique({ where: { id: inTransit.id }, select: { urgencyLevel: true } });
    check(
      "the in-flight load moves to the tighter check-call cadence",
      urgency?.urgencyLevel === "EXPEDITED" && afterCalls > 0,
      `urgencyLevel=${urgency?.urgencyLevel}, ${beforeCalls} → ${afterCalls} scheduled call(s) — reuses the existing EXPEDITED protocol`,
    );
    const doneUrgency = await prisma.load.findUnique({ where: { id: done.id }, select: { urgencyLevel: true } });
    check(
      "the COMPLETED load's cadence is left alone",
      doneUrgency?.urgencyLevel !== "EXPEDITED",
      `urgencyLevel=${doneUrgency?.urgencyLevel}`,
    );
  }

  console.log("\n── scope: a Quick Pay termination is not a dispatch event ────────");
  {
    const qpAgreement = await prisma.carrierAgreement.create({
      data: {
        carrierId: cp.id, templateName: "quick-pay", version: "arc18",
        status: "SIGNED", signedAt: new Date(), signedByName: "T18 Carrier",
      },
    });
    const load = await makeLoad("IN_TRANSIT");
    await prisma.load.update({ where: { id: load.id }, data: { urgencyLevel: "STANDARD" } });
    const r = await fetch(`${BASE}/carriers/${cp.id}/agreements/${qpAgreement.id}/terminate`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Arc 18 proof — Quick Pay only, dispatch must be unaffected." }),
    });
    const qpBody: any = await r.json().catch(() => ({}));
    const after = await prisma.load.findUnique({ where: { id: load.id }, select: { urgencyLevel: true } });
    check(
      "terminating Quick Pay does NOT escalate check calls",
      r.status === 200 && (qpBody?.inFlight?.count ?? 0) === 0 && after?.urgencyLevel !== "EXPEDITED",
      `HTTP ${r.status}, inFlight.count=${qpBody?.inFlight?.count}, urgency=${after?.urgencyLevel} — a fee change is not a dispatch risk`,
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n" + "=".repeat(68));
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFAILURES:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    server.close();
    await prisma.$disconnect();
    process.exit(1);
  }
  console.log("POLICY HOLDS — termination stops the next tender and nothing else;");
  console.log("freight already on the road completes, pays, and is watched harder.");
  server.close();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
