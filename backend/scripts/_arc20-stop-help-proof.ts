/**
 * ARC 20 — STOP and HELP, proved through the real inbound webhook.
 *
 * WHY THIS IS BLOCKING. The Arc 19 consent text promises "Reply STOP to stop.
 * Reply HELP for help." Promising STOP and not honouring it is worse than never
 * promising it — it is the conduct TCPA penalises, and the promise is already
 * in writing on every consent record stored. (§13.3 Item 225 → 226.)
 *
 * Real router over HTTP, real database. Presence is not function: the keywords
 * go in through `POST /api/webhooks/openphone-checkcall`, the same door a real
 * OpenPhone inbound uses — not through a direct call to the service behind it.
 *
 * SAFETY: rehearsal container only; both outbound keys explicitly EMPTY, so
 * every send is captured on the dead branch and nothing leaves the building.
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

import type { Server } from "http";

const PORT = 56020;
const BASE = `http://127.0.0.1:${PORT}/api`;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
}

/** Every SMS the platform TRIED to send, captured off the dead branch. */
const sent: Array<{ to: string; body: string }> = [];

async function main() {
  const { log } = await import("../src/lib/logger");
  const realInfo = log.info.bind(log);
  (log as any).info = (...args: any[]) => {
    const msg = typeof args[0] === "string" ? args[0] : args[1];
    // Both dead branches: [SMS][NoAPI] is every direct sendSMS, and
    // [CheckCall][SMS] is the check-call wrapper, which logs before it
    // delegates. Capturing only one would miss half the traffic.
    if (typeof msg === "string" && (msg.includes("[SMS][NoAPI]") || msg.includes("[CheckCall][SMS]"))) {
      const m = msg.match(/To: (\S+) \| (.*)$/);
      if (m) sent.push({ to: m[1], body: m[2] });
    }
    return realInfo(...(args as [any]));
  };

  const { prisma } = await import("../src/config/database");
  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const routes = (await import("../src/routes")).default;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((r) => { const s = app.listen(PORT, "127.0.0.1", () => r(s)); });
  console.log(`app: real router mounted on :${PORT}\n`);

  const inbound = (from: string, body: string) =>
    fetch(`${BASE}/webhooks/openphone-checkcall`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from, body }),
    });

  // ══ 1. every carrier-standard keyword opts the number out ═══════════════
  console.log("══ 1. the keyword table ═════════════════════════════════════════");
  {
    const { STOP_KEYWORDS, HELP_KEYWORDS, classifyInbound } = await import("../src/services/smsComplianceService");

    const variants = [
      "STOP", "stop", "  Stop  ", "STOPALL", "unsubscribe",
      "Cancel", "END", "quit", "STOP.", "STOP!",
    ];
    const misread = variants.filter((v) => classifyInbound(v) !== "STOP");
    check(
      "every opt-out variant classifies as STOP, whatever the case or punctuation",
      misread.length === 0,
      misread.length ? `missed: ${misread.join(", ")}` : `${variants.length} variants, all recognised`,
    );

    const helps = ["HELP", "help", "Info", " HELP "].filter((v) => classifyInbound(v) !== "HELP");
    check("HELP and INFO classify as HELP", helps.length === 0, helps.length ? `missed: ${helps.join(", ")}` : "recognised");

    // The false-positive guard that matters most: a driver ANSWERING is not
    // opting out. "stop by the gate" is a sentence, not a keyword.
    const sentences = ["stop by the gate when you arrive", "3 - in transit", "help me find the dock", "2"];
    const overreach = sentences.filter((v) => classifyInbound(v) === "STOP");
    check(
      "a sentence that merely starts with a keyword word is NOT an opt-out",
      overreach.length === 0,
      overreach.length
        ? `WRONGLY opted out: ${overreach.join(", ")}`
        : `"stop by the gate…" reads as ${classifyInbound("stop by the gate when you arrive") ?? "not a keyword"} — the whole message must be the keyword`,
    );
    void STOP_KEYWORDS; void HELP_KEYWORDS; void sentences;
  }

  // ══ 2. the round trip, through the real webhook ═════════════════════════
  console.log("\n══ 2. STOP through the real webhook ═════════════════════════════");
  const stamp = Date.now();
  const DRIVER = "+12695550188";

  const customer = await prisma.customer.create({
    data: { name: `S20 ${stamp}`, email: `c-${stamp}@arc20.invalid`, phone: "2692206760" },
  });
  const ae = await prisma.user.create({
    data: { email: `ae-${stamp}@arc20.invalid`, passwordHash: "x", firstName: "S", lastName: "AE", role: "BROKER" },
  });
  const cu = await prisma.user.create({
    data: {
      email: `car-${stamp}@arc20.invalid`, passwordHash: "x", firstName: "S", lastName: "Carrier",
      role: "CARRIER", company: "OptOut Trucking", phone: "+12695550101",
    },
  });
  await prisma.carrierProfile.create({
    data: {
      userId: cu.id, companyName: "OptOut Trucking", mcNumber: `MC-S20-${stamp}`.slice(0, 30),
      dotNumber: `${String(stamp).slice(-6)}1`, onboardingStatus: "APPROVED", status: "APPROVED",
      cppTier: "SILVER", contactPhone: "+12695550101",
    },
  });
  const load = await prisma.load.create({
    data: {
      referenceNumber: `S20-${stamp}`, posterId: ae.id, customerId: customer.id, carrierId: cu.id,
      originCity: "Lebanon", originState: "NH", originZip: "03766",
      destCity: "North Lake", destState: "TX", destZip: "76247",
      equipmentType: "REEFER", pickupDate: new Date(Date.now() - 3600_000),
      deliveryDate: new Date(Date.now() + 2 * 86400_000),
      rate: 5100, carrierRate: 4100, status: "IN_TRANSIT",
      driverName: "Ramon Diaz", driverPhone: DRIVER,
      driverPhoneVerified: DRIVER, driverPhoneVerifiedAt: new Date(),
      driverConsentAt: new Date(), driverConsentText: "arc20 fixture consent",
    },
  });

  {
    const before = sent.length;
    const res = await inbound(DRIVER, "STOP");
    const body: any = await res.json().catch(() => ({}));
    const row = await prisma.smsOptOut.findUnique({ where: { phone: DRIVER } });

    check(
      "the webhook accepts STOP and records the opt-out",
      res.status === 200 && !!row && row.optedInAgainAt === null,
      `HTTP ${res.status}, keyword=${body?.keyword}, row=${row ? `optedOutAt ${row.optedOutAt.toISOString().slice(0, 19)}` : "MISSING"}`,
    );

    const confirmations = sent.slice(before);
    check(
      "exactly ONE confirmation goes out — the single permitted post-STOP send",
      confirmations.length === 1 && /unsubscribed/i.test(confirmations[0]?.body || ""),
      confirmations.length === 1
        ? `"${confirmations[0].body.slice(0, 72)}…"`
        : `${confirmations.length} sends — must be exactly one`,
    );

    // A second STOP must not produce a second confirmation. Texting an
    // opted-out handset twice is the violation, even to confirm.
    const before2 = sent.length;
    await inbound(DRIVER, "STOP");
    check(
      "a repeat STOP sends nothing further",
      sent.length === before2,
      `${sent.length - before2} send(s) on the repeat — silence is the correct answer`,
    );
  }

  // ══ 3. the choke point — every later send refuses ═══════════════════════
  console.log("\n══ 3. the choke point ═══════════════════════════════════════════");
  {
    const { sendSMS } = await import("../src/services/openPhoneService");
    const r: any = await sendSMS(DRIVER, "This must never arrive.");
    check(
      "sendSMS itself refuses an opted-out number",
      r?.skipped === true && r?.reason === "OPTED_OUT",
      `returned ${JSON.stringify(r)} — one gate, so every send site inherits it`,
    );

    // The whole point of a choke point: a site nobody thought about is covered.
    const { startDriverVerification } = await import("../src/services/driverVerificationService");
    const before = sent.length;
    const other = await prisma.load.create({
      data: {
        referenceNumber: `S20B-${stamp}`, posterId: ae.id, customerId: customer.id, carrierId: cu.id,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "76247",
        equipmentType: "REEFER", pickupDate: new Date(), deliveryDate: new Date(Date.now() + 86400_000),
        rate: 5100, carrierRate: 4100, status: "BOOKED",
      },
    });
    await startDriverVerification({ loadId: other.id, phone: DRIVER, driverName: "Ramon Diaz" });
    const verifySends = sent.slice(before).filter((s) => s.to.includes("5550188"));
    check(
      "a NEW load's verification code does not reach an opted-out handset",
      verifySends.length === 0,
      `${verifySends.length} send(s) — assigning another load must not silently re-enrol them`,
    );

    // And the check-call sweep: carrier still texted, driver link suppressed.
    const beforeSweep = sent.length;
    await prisma.checkCallSchedule.create({
      data: {
        loadId: load.id, type: "TRANSIT_AM", scheduledTime: new Date(Date.now() - 600_000),
        status: "PENDING", carrierPhone: "+12695550101",
      },
    });
    const { processDueCheckCalls } = await import("../src/services/checkCallAutomation");
    await processDueCheckCalls();
    const swept = sent.slice(beforeSweep);
    const toDriver = swept.filter((s) => s.to.includes("5550188"));
    const toCarrier = swept.filter((s) => s.to.includes("5550101"));
    check(
      "the sweep sends ZERO to the opted-out driver",
      toDriver.length === 0,
      `${toDriver.length} send(s) to the driver`,
    );
    check(
      "the carrier's check call still goes out — the channel that always carried it",
      toCarrier.length >= 1,
      `${toCarrier.length} send(s) to the carrier's dispatch number — an opt-out is a tracking gap, not a blackout`,
    );
  }

  // ══ 4. the AE is told, once, and told what actually changed ═════════════
  console.log("\n══ 4. the operational consequence ═══════════════════════════════");
  {
    const notif = await prisma.notification.findMany({
      where: { userId: ae.id, title: { contains: "opted out" } },
    });
    check(
      "the AE on the active load is notified exactly once",
      notif.length === 1,
      `${notif.length} notification(s)`,
    );
    check(
      "the notification says what stops and what does NOT",
      /not a problem with the carrier/i.test(notif[0]?.message || "") &&
        /Check calls are unaffected/i.test(notif[0]?.message || ""),
      notif[0] ? `"…${notif[0].message.slice(60, 190)}…"` : "n/a",
    );

    const { calculateLoadRisk } = await import("../src/services/riskEngine");
    const risk = await calculateLoadRisk(load.id);
    check(
      "OPT-OUT IS NOT A FRAUD SIGNAL",
      !risk.factors.find((f: any) => f.factor === "DRIVER_PHONE_UNVERIFIED"),
      `factors: ${risk.factors.map((f: any) => f.factor).join(", ") || "none"} — a driver exercising a legal right must not score`,
    );
  }

  // ══ 5. HELP, and its required content ═══════════════════════════════════
  console.log("\n══ 5. HELP ══════════════════════════════════════════════════════");
  {
    const CLEAN = "+12695550222";
    const before = sent.length;
    const res = await inbound(CLEAN, "HELP");
    const reply = sent.slice(before).find((s) => s.to.includes("5550222"));
    check("HELP is answered", res.status === 200 && !!reply, `HTTP ${res.status}, reply ${reply ? "sent" : "MISSING"}`);

    const body = reply?.body || "";
    const required: Array<[string, boolean]> = [
      ["identifies Silk Route Logistics", /Silk Route Logistics/.test(body)],
      ["states the MC number", /MC# 1794414/.test(body)],
      ["says what the messages are", /check calls/i.test(body)],
      ["gives a human contact", /operations@silkroutelogistics\.ai|\(269\) 220-6760/.test(body)],
      ["restates STOP", /Reply STOP to opt out/i.test(body)],
      ["states rates may apply", /rates may apply/i.test(body)],
    ];
    const missing = required.filter(([, ok]) => !ok).map(([n]) => n);
    check(
      "the HELP reply carries every element carriers require",
      missing.length === 0,
      missing.length ? `missing: ${missing.join("; ")}` : required.map(([n]) => n).join(" · "),
    );

    const optedOutByHelp = await prisma.smsOptOut.findUnique({ where: { phone: CLEAN } });
    check("HELP does not opt anyone out", !optedOutByHelp, optedOutByHelp ? "HELP created an opt-out row" : "no state change");
  }

  // ══ 6. re-consent is explicit, never silent ═════════════════════════════
  console.log("\n══ 6. opt-out survives re-verification ══════════════════════════");
  {
    const stillOut = await prisma.smsOptOut.findUnique({ where: { phone: DRIVER } });
    check(
      "being assigned a new load did NOT clear the opt-out",
      !!stillOut && stillOut.optedInAgainAt === null,
      `optedInAgainAt=${stillOut?.optedInAgainAt ?? "null"} — assignment is not consent`,
    );

    // The only thing that clears it: a completed verification. Drive it
    // through the service the same way the carrier endpoint does.
    const target = await prisma.load.findFirst({ where: { referenceNumber: `S20B-${stamp}` } });
    const vrow = await prisma.driverPhoneVerification.findFirst({
      where: { loadId: target!.id, verifiedAt: null }, orderBy: { createdAt: "desc" },
    });
    const { confirmDriverVerification } = await import("../src/services/driverVerificationService");
    await confirmDriverVerification({ loadId: target!.id, code: vrow!.code, consented: true });

    const after = await prisma.smsOptOut.findUnique({ where: { phone: DRIVER } });
    check(
      "a FRESH verification with consent re-opens the channel",
      !!after?.optedInAgainAt,
      after?.optedInAgainAt ? "re-consent recorded, history kept" : "still opted out after an explicit re-consent",
    );

    const { sendSMS } = await import("../src/services/openPhoneService");
    const r: any = await sendSMS(DRIVER, "Now permitted.");
    // NOT_CONFIGURED and OPTED_OUT are both "skipped" and mean opposite things.
    // In a rehearsal every send is NOT_CONFIGURED, so asserting on `skipped`
    // alone conflates "SMS is off here" with "this handset refused us" — which
    // is why the two carry distinct reason codes.
    check(
      "sends resume only after that explicit act",
      r?.reason !== "OPTED_OUT",
      r?.reason === "OPTED_OUT"
        ? "still refusing after re-consent"
        : `no longer blocked by opt-out (reason: ${r?.reason ?? "sent"})`,
    );

    const row = await prisma.smsOptOut.findUnique({ where: { phone: DRIVER } });
    check(
      "the opt-out row is kept, not deleted — it is the evidence we honoured it",
      !!row && !!row.optedOutAt && row.keyword.length > 0,
      row ? `keyword "${row.keyword}" at ${row.optedOutAt.toISOString().slice(0, 19)} retained` : "row deleted",
    );
  }

  const failed = results.filter((r) => !r.ok);
  console.log("\n" + "=".repeat(68));
  console.log(`${results.length - failed.length}/${results.length} passed`);
  if (failed.length) {
    console.log("\nFAILURES:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
    server.close(); await prisma.$disconnect(); process.exit(1);
  }
  console.log("STOP AND HELP ARE HONOURED — one choke point, one confirmation,");
  console.log("no silent re-enrolment, and opting out is not treated as fraud.");
  server.close(); await prisma.$disconnect(); process.exit(0);
}

main().catch((e) => { console.error(e); process.exit(1); });
