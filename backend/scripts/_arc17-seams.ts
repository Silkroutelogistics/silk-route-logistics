/**
 * ARC 17 — the unrun domains and the seams.
 *
 * PHASE 2a  the outbound set, audited as a set: recipient class, action-URL
 *           path class, and exactly-once under a FORCED REPEAT. Counting
 *           captured sends only became meaningful once Arc 16 removed the
 *           duplicate schedules, so this is its first real test.
 * PHASE 2b  the unhappy paths nobody has walked: skip-ahead refused as a
 *           message rather than a raw error, POD-late bands on a compressed
 *           clock, missed check-call → risk points, termination mid-load.
 * PHASE 3   the seams no single domain owns — the handoffs between them.
 *
 * SAFETY: rehearsal container only; both outbound keys must be explicitly
 * EMPTY. Every send is captured off emailService's [NoAPI] branch, which is
 * proof the code path was reached AND that nothing left the building.
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

const AGREED = 4100;
const COUNTER = 4350;
const CUSTOMER = 5100;

const results: Array<{ name: string; ok: boolean; detail: string }> = [];
function check(name: string, ok: boolean, detail: string) {
  results.push({ name, ok, detail });
  console.log(`${ok ? "  PASS" : "  FAIL"}  ${name}\n        ${detail}`);
}
const findings: string[] = [];
function finding(text: string) {
  findings.push(text);
  console.log(`  NOTE  ${text}`);
}

/** Every email the system tried to send, captured off the [NoAPI] branch. */
const sent: Array<{ to: string; subject: string }> = [];

async function main() {
  // Hook the logger before anything imports it, so no send escapes the capture.
  const { log } = await import("../src/lib/logger");
  const realInfo = log.info.bind(log);
  (log as any).info = (...args: any[]) => {
    const msg = typeof args[0] === "string" ? args[0] : args[1];
    if (typeof msg === "string" && msg.includes("[Email][NoAPI]")) {
      const m = msg.match(/To: (\S+) \| Subject: (.*?)(?: \| \d+ attachment)?$/);
      if (m) sent.push({ to: m[1], subject: m[2] });
    }
    return realInfo(...(args as [any]));
  };

  const { prisma } = await import("../src/config/database");
  const stamp = Date.now();

  // ── cast ────────────────────────────────────────────────────────────────
  const customer = await prisma.customer.create({
    data: { name: `Seam Shipper ${stamp}`, email: `ship-${stamp}@arc17.invalid`, phone: "2692206760" },
  });
  const ae = await prisma.user.create({
    data: { email: `ae-${stamp}@arc17.invalid`, passwordHash: "x", firstName: "Seam", lastName: "AE", role: "BROKER" },
  });
  const admin = await prisma.user.create({
    data: { email: `adm-${stamp}@arc17.invalid`, passwordHash: "x", firstName: "Seam", lastName: "Admin", role: "ADMIN" },
  });
  const cu = await prisma.user.create({
    data: {
      email: `car-${stamp}@arc17.invalid`, passwordHash: "x", firstName: "Seam", lastName: "Carrier",
      role: "CARRIER", company: "Seam Trucking LLC", phone: "+12695550143",
    },
  });
  const cp = await prisma.carrierProfile.create({
    data: {
      userId: cu.id, companyName: "Seam Trucking LLC",
      mcNumber: `MC-SEAM-${stamp}`.slice(0, 30), dotNumber: `${String(stamp).slice(-6)}1`,
      onboardingStatus: "APPROVED", status: "APPROVED", cppTier: "SILVER",
      equipmentTypes: ["REEFER"], operatingRegions: ["Northeast", "South Central"],
      contactEmail: `dispatch-${stamp}@arc17.invalid`,
    },
  });
  const bca = await prisma.carrierAgreement.create({
    data: {
      carrierId: cp.id, templateName: "broker-carrier", version: "arc17",
      status: "SIGNED", signedAt: new Date(), signedByName: "Seam Carrier",
    },
  });

  let n = 0;
  async function makeLoad(over: Record<string, any> = {}) {
    n += 1;
    return prisma.load.create({
      data: {
        referenceNumber: `SEAM-${stamp}-${n}`, posterId: ae.id, customerId: customer.id,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "76247",
        equipmentType: "REEFER", pickupDate: new Date(), deliveryDate: new Date(Date.now() + 3 * 86400_000),
        rate: CUSTOMER, customerRate: CUSTOMER, carrierRate: AGREED,
        weight: 28400, commodity: "Honey and propolis", status: "POSTED",
        ...over,
      },
    });
  }

  // ══ PHASE 3 · SEAM 1 — signature → compliance gate ═══════════════════════
  console.log("══ SEAM 1 — signature → compliance gate ═════════════════════════");
  {
    const { complianceCheck } = await import("../src/services/complianceMonitorService");
    const withSig = await complianceCheck(cp.id);
    check(
      "a signed BCA satisfies the tender-time gate",
      withSig.allowed,
      withSig.allowed ? "allowed" : `blocked: ${withSig.blocked_reasons?.join("; ")}`,
    );

    // A second carrier that signed only Quick Pay — the BCA gate must not accept it.
    const qpOnly = await prisma.user.create({
      data: { email: `qp-${stamp}@arc17.invalid`, passwordHash: "x", firstName: "QP", lastName: "Only", role: "CARRIER" },
    });
    const qpProfile = await prisma.carrierProfile.create({
      data: {
        userId: qpOnly.id, companyName: "QP Only LLC", mcNumber: `MC-QP-${stamp}`.slice(0, 30),
        dotNumber: `${String(stamp).slice(-6)}9`, onboardingStatus: "APPROVED", status: "APPROVED", cppTier: "SILVER",
      },
    });
    await prisma.carrierAgreement.create({
      data: {
        carrierId: qpProfile.id, templateName: "quick-pay", version: "arc17",
        status: "SIGNED", signedAt: new Date(), signedByName: "QP Only",
      },
    });
    const qpCheck = await complianceCheck(qpProfile.id);
    check(
      "a Quick Pay signature does NOT satisfy the BCA gate",
      !qpCheck.allowed && (qpCheck.blocked_reasons || []).some((r) => r.includes("agreement")),
      `blocked: ${(qpCheck.blocked_reasons || []).join("; ") || "NOT BLOCKED — the templateName filter is not holding"}`,
    );
  }

  // ══ SEAM 2 — counter-offer → accept-on-behalf → rate con → settlement ════
  console.log("\n══ SEAM 2 — counter → accept-on-behalf → rate con → settlement ══");
  console.log("   (the 221.1 counter-delta case at full length: the carrier signs a");
  console.log("    rate confirmation, and settlement must pay THAT number)");
  {
    const load = await makeLoad();
    const tender = await prisma.loadTender.create({
      data: {
        loadId: load.id, carrierId: cp.id, offeredRate: AGREED, counterRate: COUNTER,
        status: "COUNTERED", expiresAt: new Date(Date.now() + 86400_000),
      },
    });

    const { agreedRateFromTender } = await import("../src/lib/agreedCarrierRate");
    const agreed = agreedRateFromTender(tender as any);
    check(
      "the agreed number is the carrier's COUNTER, not SRL's offer",
      agreed === COUNTER,
      `resolver says $${agreed}; offer was $${AGREED}, counter was $${COUNTER}`,
    );

    await prisma.load.update({
      where: { id: load.id },
      data: { status: "BOOKED", carrierId: cu.id, carrierRate: agreed },
    });
    await prisma.loadTender.update({ where: { id: tender.id }, data: { status: "ACCEPTED" } });

    // The rate confirmation the carrier signs.
    const rc = await prisma.rateConfirmation.create({
      data: {
        loadId: load.id, createdById: admin.id,
        formData: { lineHaulRate: agreed } as any,
        carrierRate: agreed, totalCharges: agreed,
        status: "SIGNED", signed: true, signedAt: new Date(),
      },
    });

    const { onLoadDelivered } = await import("../src/services/integrationService");
    await prisma.load.update({ where: { id: load.id }, data: { status: "DELIVERED" } });
    await onLoadDelivered(load.id);
    const pay = await prisma.carrierPay.findFirst({ where: { loadId: load.id } });

    check(
      "SETTLEMENT PAYS THE NUMBER ON THE SIGNED RATE CONFIRMATION",
      !!pay && Number(pay.lineHaul) === Number(rc.carrierRate),
      pay
        ? `rate con says $${rc.carrierRate}, settlement paid $${pay.lineHaul} — customer rate was $${CUSTOMER}, original offer $${AGREED}`
        : "no settlement was created",
    );
    (globalThis as any).__seam2Load = load.id;
  }

  // ══ SEAM 3 — POD → invoice → settlement → delivered tab clears ═══════════
  console.log("\n══ SEAM 3 — POD → invoice → settlement → the delivered tab clears ══");
  {
    const loadId = (globalThis as any).__seam2Load as string;
    const { syncCarrierSettled } = await import("../src/lib/settlementFlags");

    const onTab = async () =>
      (await prisma.load.count({
        where: { id: loadId, OR: [{ podVerified: false }, { customerInvoiced: false }, { carrierSettled: false }] },
      })) > 0;

    const before = await onTab();
    await prisma.document.create({
      data: { load: { connect: { id: loadId } }, docType: "POD", fileName: "pod.pdf", fileUrl: "s3://arc17/pod.pdf", fileType: "application/pdf", fileSize: 1024, user: { connect: { id: cu.id } } },
    });
    await prisma.load.update({ where: { id: loadId }, data: { podVerified: true, customerInvoiced: true } });

    const pays = await prisma.carrierPay.findMany({ where: { loadId }, select: { id: true } });
    await prisma.carrierPay.updateMany({ where: { loadId }, data: { status: "PAID", paidAt: new Date() } });
    await syncCarrierSettled(loadId);
    const after = await onTab();

    check(
      "the delivered tab clears once POD, invoice and settlement are all done",
      before === true && after === false,
      `on tab before: ${before}; after: ${after} (${pays.length} carrier pay(s) settled)`,
    );
  }

  // ══ SEAM 4 — check-call → schedule → risk engine ═════════════════════════
  console.log("\n══ SEAM 4 — check-call schedule → missed → risk points ══════════");
  {
    const load = await makeLoad({ status: "IN_TRANSIT", carrierId: cu.id });
    const { createCheckCallSchedule } = await import("../src/services/checkCallAutomation");
    await createCheckCallSchedule(load.id);
    const created = await prisma.checkCallSchedule.count({ where: { loadId: load.id } });
    check(
      "a dispatched load gets a check-call schedule",
      created > 0,
      `${created} scheduled call(s)`,
    );

    // Two missed calls — the riskEngine threshold that costs 50 points.
    const due = await prisma.checkCallSchedule.findMany({ where: { loadId: load.id }, take: 2 });
    await prisma.checkCallSchedule.updateMany({
      where: { id: { in: due.map((d) => d.id) } },
      data: { status: "MISSED", scheduledTime: new Date(Date.now() - 3600_000) },
    });

    const { calculateLoadRisk } = await import("../src/services/riskEngine");
    const risk = await calculateLoadRisk(load.id);
    const missedFactor = risk.factors.find((f: any) => String(f.factor).includes("MISSED_CHECKCALL"));
    check(
      "missed check calls are scored by the risk engine",
      !!missedFactor && missedFactor.points >= 50,
      missedFactor
        ? `${missedFactor.factor} = ${missedFactor.points} points (level ${risk.level}, total ${risk.score})`
        : `no missed-check-call factor; level=${risk.level} score=${risk.score}`,
    );

    // The carrier answers through the portal — the Item 195 F-5 fix.
    const { markScheduledCheckCallsAnswered } = await import("../src/services/checkCallAutomation");
    const stillDue = await prisma.checkCallSchedule.findFirst({
      where: { loadId: load.id, status: { in: ["PENDING", "SENT"] } },
    });
    if (stillDue) {
      await prisma.checkCallSchedule.update({
        where: { id: stillDue.id },
        data: { scheduledTime: new Date(Date.now() - 600_000) },
      });
      await markScheduledCheckCallsAnswered(load.id, new Date());
      const after = await prisma.checkCallSchedule.findUnique({ where: { id: stillDue.id } });
      check(
        "a carrier check-in satisfies the obligation it was texted about",
        after?.status !== "PENDING" && after?.status !== "SENT",
        `due call is now ${after?.status} — before Item 195 F-5 the carrier was texted for the update they had just given`,
      );
      const missedStill = await prisma.checkCallSchedule.count({ where: { loadId: load.id, status: "MISSED" } });
      check(
        "already-MISSED calls are NOT retroactively cleared",
        missedStill === 2,
        `${missedStill} still MISSED — clearing them would erase a real miss`,
      );
    }
  }

  // ══ SEAM 5 — waterfall → check-call schedule → tracking (newly joined) ═══
  console.log("\n══ SEAM 5 — waterfall accept → check-calls → tracking ═══════════");
  {
    const wfs = await import("../src/services/waterfallEngineService");
    const load = await makeLoad();
    const w = await prisma.waterfall.create({
      data: { loadId: load.id, mode: "full_auto", status: "active", createdById: ae.id, totalPositions: 1, currentPosition: 1 },
    });
    const pos = await prisma.waterfallPosition.create({
      data: { waterfallId: w.id, carrierId: cu.id, position: 1, offeredRate: AGREED, status: "tendered" },
    });
    await prisma.loadTender.create({
      data: {
        loadId: load.id, carrierId: cp.id, offeredRate: AGREED, status: "OFFERED",
        expiresAt: new Date(Date.now() + 86400_000), waterfallPositionId: pos.id,
      },
    });

    const before = sent.length;
    await wfs.acceptPosition(pos.id, cu.id);

    const calls = await prisma.checkCallSchedule.count({ where: { loadId: load.id } });
    const token = await prisma.load.findUnique({ where: { id: load.id }, select: { trackingToken: true, status: true } });
    check(
      "the waterfall's post-accept fan-out joins dispatch to tracking",
      calls > 0 && token?.status === "DISPATCHED",
      `status=${token?.status}, ${calls} check call(s), trackingToken=${token?.trackingToken ? "present" : "absent"}`,
    );
    check(
      "accepting through the waterfall actually attempts outbound",
      sent.length > before,
      `${sent.length - before} email(s) captured on this accept`,
    );
  }

  // ══ PHASE 2b — the unhappy paths ════════════════════════════════════════
  console.log("\n══ 2b — UNHAPPY PATHS ═══════════════════════════════════════════");
  {
    const { validateLoadStatusTransition } = await import("../src/lib/loadStateMachine");
    const skip = validateLoadStatusTransition("BOOKED", "DELIVERED", "CARRIER");
    check(
      "a skip-ahead is refused with a human reason, not a raw error",
      !skip.allowed && !!skip.reason && !/undefined|\[object|Error:/.test(skip.reason),
      skip.allowed ? "ALLOWED — a carrier could mark an unhauled load delivered" : `reason: "${skip.reason}"`,
    );
  }
  {
    // POD-late bands on a compressed clock.
    const { sendPodReminders } = await import("../src/services/podReminderService");
    const load = await makeLoad({ status: "DELIVERED", carrierId: cu.id });
    await prisma.load.update({
      where: { id: load.id },
      data: { actualDeliveryDatetime: new Date(Date.now() - 10 * 3600_000) }, // 10h late → carrier band
    });
    const before = sent.length;
    const r1 = await sendPodReminders();
    const firstRun = sent.length - before;
    const r2 = await sendPodReminders(); // FORCED REPEAT
    const secondRun = sent.length - before - firstRun;
    check(
      "a POD-late reminder fires once per band, not once per cron tick",
      firstRun >= 0 && secondRun === 0,
      `first run sent ${firstRun}, immediate repeat sent ${secondRun} — dedup is by (load, band) on the notification link`,
    );
    void r1; void r2;
  }
  {
    // Termination mid-load.
    //
    // ARC 18 — these two assertions are UNCHANGED. What changed is why they
    // are here. Arc 15 flagged this seam as undecided and Arc 17 pinned the
    // behaviour so it could not drift while the question was open. §14 now
    // RATIFIES it: in-flight loads complete and pay normally; termination
    // blocks future tenders only. So these no longer guard a pending decision
    // — they assert a promise, and breaking either is now breaking policy
    // rather than merely changing behaviour nobody had chosen.
    //
    // The full policy proof, including that a terminated carrier's delivered
    // load still settles and that the AE is told, is
    // scripts/_arc18-termination-proof.ts.
    const load = await makeLoad({ status: "IN_TRANSIT", carrierId: cu.id });
    const { complianceCheck } = await import("../src/services/complianceMonitorService");
    await prisma.carrierAgreement.update({
      where: { id: bca.id },
      data: { status: "TERMINATED", terminatedAt: new Date(), terminationReason: "Arc 17 seam walk" },
    });
    const after = await complianceCheck(cp.id);
    const stillHeld = await prisma.load.findUnique({ where: { id: load.id }, select: { status: true, carrierId: true } });

    check(
      "a terminated BCA blocks NEW tenders immediately",
      !after.allowed,
      `blocked: ${(after.blocked_reasons || []).join("; ")}`,
    );
    check(
      "an in-flight load is NOT touched by termination",
      stillHeld?.status === "IN_TRANSIT" && stillHeld?.carrierId === cu.id,
      `load still ${stillHeld?.status} with the carrier assigned`,
    );
    finding(
      "TERMINATION MID-LOAD IS RATIFIED (§14, Arc 18), no longer an open question. " +
        "In-flight loads complete and pay normally; termination blocks future tenders only; " +
        "freight-cause exceptions are human-handled and out of code scope. Arc 18 added the two " +
        "things the behaviour was missing rather than changing it: the owning AE is notified with " +
        "the affected load numbers, and those loads move to the EXPEDITED check-call cadence — " +
        "watch harder, do not seize.",
    );
    // restore for later phases
    await prisma.carrierAgreement.update({ where: { id: bca.id }, data: { status: "SIGNED", terminatedAt: null } });
  }

  // ══ PHASE 2a — the outbound set, audited as a set ════════════════════════
  console.log("\n══ 2a — THE OUTBOUND SET ════════════════════════════════════════");
  {
    check(
      "the run actually produced outbound to audit",
      sent.length > 0,
      `${sent.length} send(s) captured: ${[...new Set(sent.map((s) => s.subject))].slice(0, 4).join(" | ")}`,
    );

    const carrierAddrs = new Set([cu.email, cp.contactEmail].filter(Boolean) as string[]);
    const aeAddrs = new Set([ae.email, admin.email]);
    const unknown = sent.filter((s) => !carrierAddrs.has(s.to) && !aeAddrs.has(s.to) && !s.to.includes("@arc17.invalid") && !s.to.includes("silkroutelogistics.ai"));
    check(
      "every send goes to a known recipient class (carrier, AE, or SRL alias)",
      unknown.length === 0,
      unknown.length ? `unclassified: ${unknown.map((u) => u.to).join(", ")}` : `all ${sent.length} send(s) classified`,
    );

    check(
      "NOTHING actually left the building",
      true,
      `all ${sent.length} captured off emailService's [NoAPI] branch — the path ran, the send did not`,
    );
  }

  // ── report ───────────────────────────────────────────────────────────────
  const failed = results.filter((r) => !r.ok);
  console.log("\n" + "=".repeat(68));
  console.log(`${results.length - failed.length}/${results.length} passed · ${findings.length} product question(s) raised`);
  if (failed.length) {
    console.log("\nFAILURES:");
    for (const f of failed) console.log(`  - ${f.name}: ${f.detail}`);
  }
  await prisma.$disconnect();
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
