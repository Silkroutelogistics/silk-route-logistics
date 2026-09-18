/**
 * Lifecycle-gaps B2b proof: the TENDERED cancel path, end to end, for the
 * trigger case — a load offered to a carrier, then the shipper's freight is
 * not ready.
 *
 * Real router over HTTP, real database. Asserts what the AE could not do on
 * 2026-09-18: cancel a TENDERED load, with a reason code, and have the code,
 * the fault party, the actor and the time land on the row in one write; the
 * OFFERED tender withdrawn (never DECLINED); and no write at all when the code
 * is missing. Then the PRODUCTION shape (BOOKED + ACCEPTED + DRAFT RC) is
 * exercised and its post-cancel state PRINTED, not asserted, so the B4a/B3c
 * commits have a recorded before-picture.
 *
 * Local container only; outbound keys must be explicitly empty.
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
    if (v === undefined) { console.error(`REFUSING: ${k} UNSET — dotenv would fill it from backend/.env.`); process.exit(1); }
    if (v !== "") { console.error(`REFUSING: ${k} set to a real value. Outbound would be LIVE.`); process.exit(1); }
  }
  console.log("guard: local DB; outbound keys explicitly empty (post-dotenv)\n");
}
guard();

import jwt from "jsonwebtoken";
import type { Server } from "http";

const PORT = 55931;
const BASE = `http://127.0.0.1:${PORT}/api`;

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  -- " + d : ""}`); }
};

async function main() {
  const { prisma } = await import("../src/config/database");
  const { registerSession } = await import("../src/middleware/auth");
  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const routes = (await import("../src/routes")).default;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((r) => { const s = app.listen(PORT, "127.0.0.1", () => r(s)); });
  console.log(`app: real router mounted on :${PORT}\n`);

  const stamp = Date.now();
  const madeLoads: string[] = [];

  const ae = await prisma.user.create({
    data: { email: `lc-ops-${stamp}@srl.invalid`, passwordHash: "x", firstName: "Ops", lastName: "AE", role: "OPERATIONS" },
  });
  const token = jwt.sign({ userId: ae.id, nonce: stamp }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(ae.id, token, "OPERATIONS");
  const cookie = `srl_token_ae=${token}`;

  const cu = await prisma.user.create({
    data: { email: `lc-carrier-${stamp}@srl.invalid`, passwordHash: "x", firstName: "Peace", lastName: "Transport", role: "CARRIER" },
  });
  const carrier = await prisma.carrierProfile.create({
    data: { userId: cu.id, companyName: `Peace Transport ${stamp}`, onboardingStatus: "APPROVED", status: "APPROVED",
      insuranceExpiry: new Date(Date.now() + 365 * 86_400_000) },
  });

  async function makeLoad(ref: string, status: "TENDERED" | "BOOKED", carrierUserId: string | null) {
    const l = await prisma.load.create({
      data: {
        referenceNumber: `${ref}-${stamp}`, posterId: ae.id, status,
        carrierId: carrierUserId,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "75568",
        pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
        equipmentType: "Reefer", rate: 4100, carrierRate: 4100, customerId: null,
      },
    });
    madeLoads.push(l.id);
    return l;
  }
  const patchStatus = async (id: string, body: unknown) => {
    const r = await fetch(`${BASE}/loads/${id}/status`, {
      method: "PATCH", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    return { status: r.status, json: await r.json().catch(() => ({})) };
  };

  try {
    // ── [1] THE TRIGGER: TENDERED + OFFERED, freight not ready ──
    console.log("[1] TENDERED load, OFFERED tender — cancel with SHIPPER_FREIGHT_NOT_READY");
    const l1 = await makeLoad("LC-TRIGGER", "TENDERED", null);
    const t1 = await prisma.loadTender.create({
      data: { loadId: l1.id, carrierId: carrier.id, status: "OFFERED", offeredRate: 4100, expiresAt: new Date(Date.now() + 864e5) },
    });

    const miss = await patchStatus(l1.id, { status: "CANCELLED", reason: "freight not ready" });
    ok("no reason code → 400 from the schema (never reaches the handler)", miss.status === 400, `got ${miss.status}`);
    ok("…and the refusal names cancellationReasonCode", JSON.stringify(miss.json).includes("cancellationReasonCode"), JSON.stringify(miss.json));
    const untouched = await prisma.load.findUnique({ where: { id: l1.id } });
    ok("…and the load did not move", untouched?.status === "TENDERED" && !untouched.cancelledAt, untouched?.status);

    const r1 = await patchStatus(l1.id, { status: "CANCELLED", cancellationReasonCode: "SHIPPER_FREIGHT_NOT_READY" });
    ok("with the code → 200", r1.status === 200, `got ${r1.status} ${JSON.stringify(r1.json)}`);
    const after = await prisma.load.findUnique({ where: { id: l1.id } });
    ok("load is CANCELLED", after?.status === "CANCELLED", after?.status);
    ok("reason code persisted", after?.cancellationReasonCode === "SHIPPER_FREIGHT_NOT_READY", String(after?.cancellationReasonCode));
    ok("fault party is SHIPPER, derived — never the carrier's", after?.cancellationFaultParty === "SHIPPER", String(after?.cancellationFaultParty));
    ok("cancelledById is the AE, cancelledAt stamped", after?.cancelledById === ae.id && after.cancelledAt instanceof Date);
    ok("statusUpdatedById also the AE (the existing audit field still written)", after?.statusUpdatedById === ae.id);

    // the reversal is fire-and-forget; give it a moment
    await new Promise((r) => setTimeout(r, 400));
    const tAfter = await prisma.loadTender.findUnique({ where: { id: t1.id } });
    ok("tender WITHDRAWN, not DECLINED — the carrier refused nothing", tAfter?.status === "WITHDRAWN", String(tAfter?.status));
    ok("…with statusReason load_cancelled and no respondedAt", tAfter?.statusReason === "load_cancelled" && tAfter.respondedAt === null, `${tAfter?.statusReason} ${tAfter?.respondedAt}`);
    const act = await prisma.loadActivity.findFirst({ where: { loadId: l1.id, eventType: "cancel_cascade" } });
    ok("one cancel_cascade activity row", !!act);
    const notes = await prisma.notification.findMany({ where: { userId: cu.id, title: "Load Cancelled" } });
    ok("carrier told 'Load Cancelled' with the reason spelled out (no carrierId on this load → none expected)", notes.length === 0);

    // ── [2] Repeat cancel is a no-op 200, not a 409 or a second write ──
    console.log("\n[2] repeat cancel on the cancelled load");
    const r2 = await patchStatus(l1.id, { status: "CANCELLED", cancellationReasonCode: "SHIPPER_CANCELLED" });
    ok("same-state transition is allowed (200)", r2.status === 200, `got ${r2.status}`);
    const again = await prisma.load.findUnique({ where: { id: l1.id } });
    ok("…but the ORIGINAL reason code is not overwritten", again?.cancellationReasonCode === "SHIPPER_FREIGHT_NOT_READY", String(again?.cancellationReasonCode));

    // ── [3] LOADED cannot be cancelled: the ratified cut-off ──
    console.log("\n[3] cut-off");
    const l3 = await makeLoad("LC-LOADED", "BOOKED", cu.id);
    await prisma.load.update({ where: { id: l3.id }, data: { status: "LOADED" } });
    const r3 = await patchStatus(l3.id, { status: "CANCELLED", cancellationReasonCode: "SHIPPER_CANCELLED" });
    ok("LOADED → CANCELLED refused (400 from the state machine)", r3.status === 400 || r3.status === 409, `got ${r3.status}`);

    // ── [4] THE PRODUCTION SHAPE, printed not asserted ──
    console.log("\n[4] production shape: BOOKED + ACCEPTED tender + DRAFT RC — before-picture for B4a/B3c");
    const l4 = await makeLoad("LC-PROD-SHAPE", "BOOKED", cu.id);
    const t4 = await prisma.loadTender.create({
      data: { loadId: l4.id, carrierId: carrier.id, status: "ACCEPTED", offeredRate: 4100, respondedAt: new Date(), expiresAt: new Date(Date.now() + 864e5) },
    });
    const rc4 = await prisma.rateConfirmation.create({
      data: { loadId: l4.id, createdById: ae.id, status: "DRAFT", formData: {} } as any,
    });
    const r4 = await patchStatus(l4.id, { status: "CANCELLED", cancellationReasonCode: "SHIPPER_FREIGHT_NOT_READY" });
    ok("BOOKED → CANCELLED with code → 200", r4.status === 200, `got ${r4.status} ${JSON.stringify(r4.json)}`);
    await new Promise((r) => setTimeout(r, 400));
    const l4a = await prisma.load.findUnique({ where: { id: l4.id } });
    const t4a = await prisma.loadTender.findUnique({ where: { id: t4.id } });
    const rc4a = await prisma.rateConfirmation.findUnique({ where: { id: rc4.id } });
    const n4 = await prisma.notification.findFirst({ where: { userId: cu.id, title: "Load Cancelled" } });
    console.log(`      load.status=${l4a?.status} carrierId=${l4a?.carrierId ? "STILL SET" : "cleared"} fault=${l4a?.cancellationFaultParty}`);
    console.log(`      tender.status=${t4a?.status} (ACCEPTED means B3c has not run yet — expected before-picture)`);
    console.log(`      rc.status=${rc4a?.status} (DRAFT means B4a has not run yet — expected before-picture)`);
    console.log(`      carrier notification: ${n4 ? JSON.stringify(n4.message) : "NONE"}`);
    ok("carrier is told, and the message carries the reason, not 'no reason provided'", !!n4 && /freight not ready/i.test(n4.message) && !/no reason provided/i.test(n4.message), n4?.message);
  } finally {
    // cleanup: everything this run created
    await prisma.notification.deleteMany({ where: { userId: cu.id } });
    await prisma.loadActivity.deleteMany({ where: { loadId: { in: madeLoads } } });
    await prisma.rateConfirmation.deleteMany({ where: { loadId: { in: madeLoads } } });
    await prisma.loadTender.deleteMany({ where: { loadId: { in: madeLoads } } });
    await prisma.shipment.deleteMany({ where: { loadId: { in: madeLoads } } });
    await prisma.load.deleteMany({ where: { id: { in: madeLoads } } });
    await prisma.carrierProfile.deleteMany({ where: { id: carrier.id } });
    // The route-level auditLog middleware wrote rows for the AE; they hold the
    // user by FK. Sweep this run and any earlier run that died in cleanup.
    const stale = await prisma.user.findMany({ where: { email: { startsWith: "lc-" , endsWith: "@srl.invalid" } }, select: { id: true } });
    const ids = Array.from(new Set([ae.id, cu.id, ...stale.map((u) => u.id)]));
    await prisma.auditLog.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditTrail.deleteMany({ where: { performedById: { in: ids } } });
    await prisma.carrierProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    server.close();
    await prisma.$disconnect();
  }
  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
