/**
 * Commit-10c proof: an AE cannot accept for a carrier without saying how they
 * know the carrier agreed.
 *
 * An accept-on-behalf records a decision the carrier made somewhere SRL cannot
 * see. Without a pointer to it, an accept-on-behalf and an AE simply booking a
 * carrier who never agreed are the same row — and the carrier is the one left
 * holding a signed rate confirmation for a load they did not take.
 *
 * Also proves the delegation: the handler was a ~190-line copy of acceptTender
 * and now routes through it, so the shipment, the auto-RC and the notification
 * all still happen on the on-behalf path without a second implementation.
 *
 * Real router over HTTP, real database. Local container only; outbound keys
 * must be explicitly empty.
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

const PORT = 55923;
const BASE = `http://127.0.0.1:${PORT}/api`;

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  -- " + d : ""}`); }
};

async function main() {
  const { prisma } = await import("../src/config/database");
  const { registerSession } = await import("../src/middleware/auth");
  const { createTender } = await import("../src/services/tenderCreationService");
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

  const admin = await prisma.user.create({
    data: { email: `ob-admin-${stamp}@srl.invalid`, passwordHash: "x", firstName: "O", lastName: "B", role: "ADMIN" },
  });
  const token = jwt.sign({ userId: admin.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(admin.id, token, "ADMIN");
  const cookie = `srl_token_ae=${token}`;

  const cu = await prisma.user.create({
    data: { email: `ob-carrier-${stamp}@srl.invalid`, passwordHash: "x", firstName: "Good", lastName: "Co", role: "CARRIER" },
  });
  const carrier = await prisma.carrierProfile.create({
    data: {
      userId: cu.id, companyName: `OB Good ${stamp}`,
      onboardingStatus: "APPROVED", status: "APPROVED",
      insuranceExpiry: new Date(Date.now() + 365 * 86_400_000),
    },
  });
  await prisma.carrierAgreement.create({
    data: {
      carrierId: carrier.id, templateName: "broker-carrier", version: "test",
      status: "SIGNED", signedAt: new Date(), signedByName: "Good Co",
    },
  });

  async function makeLoad(ref: string) {
    const l = await prisma.load.create({
      data: {
        referenceNumber: `${ref}-${stamp}`, posterId: admin.id, status: "TENDERED",
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "75568",
        pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
        equipmentType: "Reefer", rate: 4100, carrierRate: 4100, customerId: null,
      },
    });
    madeLoads.push(l.id);
    return l;
  }
  const post = async (path: string, body: unknown) => {
    const r = await fetch(`${BASE}${path}`, {
      method: "POST",
      headers: { Cookie: cookie, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) as Record<string, unknown> };
  };

  // ── 1. refused without evidence ─────────────────────────────────────────────
  console.log("[1] an AE cannot accept for a carrier on their word alone");
  const l1 = await makeLoad("OB-A");
  const t1 = await createTender({ loadId: l1.id, carrierProfileId: carrier.id, offeredRate: 4100 });

  const noEvidence = await post(`/tenders/${t1.id}/accept-on-behalf`, {
    reason: "carrier confirmed by telephone this morning",
  });
  ok("refused with a 4xx", noEvidence.status >= 400 && noEvidence.status < 500, `status=${noEvidence.status}`);
  ok("and names what is missing", noEvidence.body.code === "EVIDENCE_REQUIRED", JSON.stringify(noEvidence.body).slice(0, 160));
  ok("the tender did not move", (await prisma.loadTender.findUniqueOrThrow({ where: { id: t1.id } })).status === "OFFERED");

  const badType = await post(`/tenders/${t1.id}/accept-on-behalf`, {
    reason: "carrier confirmed by telephone this morning",
    evidenceType: "a_note_i_made", evidenceRef: "trust me",
  });
  ok("an evidence type outside the vocabulary is refused", badType.status === 400,
     "free-form prose passes a length check and answers nothing in a dispute");

  const shortRef = await post(`/tenders/${t1.id}/accept-on-behalf`, {
    reason: "carrier confirmed by telephone this morning",
    evidenceType: "call_timestamp", evidenceRef: "x",
  });
  ok("an unusably short reference is refused", shortRef.status === 400);

  // ── 2. accepted with evidence, through the shared path ──────────────────────
  console.log("\n[2] with evidence, it goes through the real accept path");
  const good = await post(`/tenders/${t1.id}/accept-on-behalf`, {
    reason: "carrier confirmed by telephone this morning",
    evidenceType: "call_timestamp", evidenceRef: "2026-09-01T09:14:00Z",
  });
  ok("accepted", good.status < 400, `status=${good.status} ${JSON.stringify(good.body).slice(0, 160)}`);
  ok("the response says it was on behalf", good.body.onBehalf === true);

  const after = await prisma.loadTender.findUniqueOrThrow({ where: { id: t1.id } });
  ok("the tender is ACCEPTED", after.status === "ACCEPTED");
  ok("the evidence type is on the row", after.evidenceType === "CALL_TIMESTAMP");
  ok("and the reference with it", after.evidenceRef === "2026-09-01T09:14:00Z");

  const load1 = await prisma.load.findUniqueOrThrow({ where: { id: l1.id } });
  ok("the load is BOOKED with the carrier on it", load1.status === "BOOKED" && load1.carrierId === cu.id);
  ok("and at the agreed rate, not the customer rate", load1.carrierRate === 4100);
  ok("the shipment was created by the shared path", (await prisma.shipment.count({ where: { loadId: l1.id } })) === 1,
     "the on-behalf handler no longer has its own copy of this");

  // ── 3. history ──────────────────────────────────────────────────────────────
  console.log("\n[3] the history records what SRL relied on");
  const hist = await prisma.loadActivity.findMany({ where: { tenderId: t1.id }, orderBy: { createdAt: "asc" } });
  const acceptRow = hist.find((h) => ((h.metadata ?? {}) as Record<string, unknown>).to === "ACCEPTED");
  ok("there is an ACCEPTED transition row", !!acceptRow, `rows=${hist.length}`);
  const m = (acceptRow?.metadata ?? {}) as Record<string, unknown>;
  ok("marked on-behalf", m.onBehalf === true);
  ok("with the evidence type", m.evidenceType === "CALL_TIMESTAMP");
  ok("with the reference", m.evidenceRef === "2026-09-01T09:14:00Z");
  ok("and WHO pressed the button, which is not the carrier", m.onBehalfActorId === admin.id,
     "the actor is the carrier because it is their acceptance; the AE is recorded separately");

  const audit = await prisma.auditLog.findFirst({
    where: { entityId: t1.id, action: "TENDER_ACCEPTED_ON_BEHALF" },
  });
  ok("an audit row keeps it queryable apart from organic accepts", !!audit);

  // ── 4. an ordinary carrier accept needs no evidence ─────────────────────────
  console.log("\n[4] a carrier accepting for themselves needs no evidence");
  const l2 = await makeLoad("OB-B");
  const t2 = await createTender({ loadId: l2.id, carrierProfileId: carrier.id, offeredRate: 4100 });
  const ctok = jwt.sign({ userId: cu.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(cu.id, ctok, "CARRIER");
  const r4 = await fetch(`${BASE}/tenders/${t2.id}/accept`, {
    method: "POST",
    headers: { Cookie: `srl_token_carrier=${ctok}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  ok("the carrier's own accept succeeds with no evidence", r4.status < 400, `status=${r4.status}`);
  const t2after = await prisma.loadTender.findUniqueOrThrow({ where: { id: t2.id } });
  ok("and records none — null means nobody vouched, which is correct here",
     t2after.evidenceType === null && t2after.evidenceRef === null);

  console.log(`\n${pass}/${pass + fail} passed`);
  server.closeAllConnections?.();
  server.close();

  for (const id of madeLoads) {
    await prisma.loadActivity.deleteMany({ where: { loadId: id } });
    await prisma.rateConfirmation.deleteMany({ where: { loadId: id } });
    await prisma.shipment.deleteMany({ where: { loadId: id } });
    await prisma.loadTender.deleteMany({ where: { loadId: id } });
    await prisma.checkCall.deleteMany({ where: { loadId: id } });
    await prisma.load.delete({ where: { id } }).catch(() => {});
  }
  await prisma.auditLog.deleteMany({ where: { userId: admin.id } });
  await prisma.carrierAgreement.deleteMany({ where: { carrierId: carrier.id } });
  await prisma.carrierProfile.delete({ where: { id: carrier.id } }).catch(() => {});
  await prisma.staffSession.deleteMany({ where: { userId: { in: [admin.id, cu.id] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@srl.invalid` } } });
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
