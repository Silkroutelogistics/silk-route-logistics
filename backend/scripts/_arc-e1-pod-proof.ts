/**
 * Task E1 proof (rulings 2026-09-21): a POD, on whichever route carried it, is
 * the delivery event when nothing else was — and only then, and only once.
 *
 * Real routers over HTTP, real database, real hooks: the seam
 * (services/loadDocumentService) is NOT mocked, and neither is
 * integrationService, so what is asserted below is what production does.
 * Unit tests hold the seam's contract with the hooks stubbed; this is the
 * half they cannot see — that createCarrierPayOnDelivery really writes one
 * row, that onPODUploaded really sets its dueDate, that the CPP counter
 * really moves once.
 *
 * Scenarios:
 *   [1] DELIVERED first (carrier status route), then the POD (carrier route)
 *       -> the flip paid; the POD does not pay again.
 *   [2] POD at AT_DELIVERY (carrier route) -> THE P0: the POD is the delivery.
 *   [3] a second POD on that load -> nothing fires twice.
 *   [4] POD at AT_DELIVERY through /documents/upload (AE route) -> same outcome.
 *   [5] a VOID CarrierPay on the load -> does not block the real one.
 * Every scenario: exactly ONE non-VOID CarrierPay, dueDate set, docPod true,
 * cppTotalLoads incremented exactly once per delivered load.
 *
 * Rehearsal container only; outbound keys must be explicitly EMPTY (section 19
 * Sub-pattern 20 — absence is not neutralization; dotenv fills an absent key).
 *
 * Run:
 *   DATABASE_URL=postgres://...127.0.0.1... RESEND_API_KEY= QUO_API_KEY= OPENPHONE_API_KEY= \
 *   S3_BUCKET_NAME= AWS_ACCESS_KEY_ID= npx tsx scripts/_arc-e1-pod-proof.ts
 */
function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
    process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "QUO_API_KEY", "OPENPHONE_API_KEY", "S3_BUCKET_NAME", "AWS_ACCESS_KEY_ID"]) {
    const v = process.env[k];
    if (v === undefined) { console.error(`REFUSING: ${k} UNSET — dotenv would fill it from backend/.env.`); process.exit(1); }
    if (v !== "") { console.error(`REFUSING: ${k} set to a real value. Outbound would be LIVE.`); process.exit(1); }
  }
  console.log("guard: local DB; outbound + storage keys explicitly empty (post-dotenv)\n");
}
guard();

import jwt from "jsonwebtoken";
import fs from "fs";
import path from "path";
import type { Server } from "http";

const PORT = 55923;
const BASE = `http://127.0.0.1:${PORT}/api`;
const PDF = Buffer.from("%PDF-1.4\n%proof bytes for the magic-byte check\n1 0 obj<<>>endobj\n%%EOF\n");

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  -- " + d : ""}`); }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const { prisma } = await import("../src/config/database");
  const { registerSession } = await import("../src/middleware/auth");
  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const routes = (await import("../src/routes")).default;
  const { errorHandler } = await import("../src/middleware/errorHandler");

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", routes);
  app.use(errorHandler);
  const server: Server = await new Promise((resolve) => {
    const srv = app.listen(PORT, "127.0.0.1", () => resolve(srv));
  });

  const stamp = Date.now();

  // An approved, activated, ENROLLED carrier with an executed BCA — the wall
  // reads totpEnabled, the activation gate reads the agreement row.
  const cu = await prisma.user.create({
    data: { email: `e1-carrier-${stamp}@srl.invalid`, passwordHash: "x", firstName: "E1", lastName: "Carrier", role: "CARRIER", totpEnabled: true },
  });
  const carrier = await prisma.carrierProfile.create({
    data: { userId: cu.id, companyName: `E1 Carrier ${stamp}`, onboardingStatus: "APPROVED", status: "APPROVED", activatedAt: new Date() },
  });
  await prisma.carrierAgreement.create({
    data: { carrierId: carrier.id, templateName: "broker-carrier", version: "test", status: "SIGNED", signedAt: new Date(), signedByName: "E1 Carrier" },
  });
  const ctoken = jwt.sign({ userId: cu.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(cu.id, ctoken, "CARRIER");
  const ccookie = `srl_token_carrier=${ctoken}`;

  const admin = await prisma.user.create({
    data: { email: `e1-admin-${stamp}@srl.invalid`, passwordHash: "x", firstName: "E1", lastName: "Admin", role: "ADMIN" },
  });
  const atoken = jwt.sign({ userId: admin.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(admin.id, atoken, "ADMIN");
  const acookie = `srl_token_ae=${atoken}`;

  const loadIds: string[] = [];
  let n = 0;
  async function mkLoad(status: string) {
    n += 1;
    const l = await prisma.load.create({
      data: {
        referenceNumber: `E1-${stamp}-${n}`,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "76247",
        destCompany: "Proof Consignee",
        pickupDate: new Date(Date.now() - 2 * 86400_000),
        deliveryDate: new Date(),
        equipmentType: "Reefer",
        rate: 5100,
        customerRate: 5100,
        carrierRate: 4100,
        status: status as any,
        posterId: admin.id,
        carrierId: cu.id,
        distance: 1900,
      },
    });
    loadIds.push(l.id);
    return l;
  }

  async function carrierPod(loadId: string, name = "pod.pdf") {
    const fd = new FormData();
    fd.set("docType", "POD");
    fd.set("file", new Blob([PDF], { type: "application/pdf" }), name);
    const r = await fetch(`${BASE}/carrier-loads/${loadId}/documents`, { method: "POST", headers: { Cookie: ccookie }, body: fd });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }
  async function aePod(loadId: string, name = "pod-ae.pdf") {
    const fd = new FormData();
    fd.set("docType", "POD");
    fd.set("loadId", loadId);
    fd.set("files", new Blob([PDF], { type: "application/pdf" }), name);
    const r = await fetch(`${BASE}/documents/upload`, { method: "POST", headers: { Cookie: acookie }, body: fd });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }
  async function carrierStatus(loadId: string, status: string) {
    const r = await fetch(`${BASE}/carrier-loads/${loadId}/status`, {
      method: "POST", headers: { Cookie: ccookie, "Content-Type": "application/json" }, body: JSON.stringify({ status }),
    });
    return { status: r.status, body: await r.json().catch(() => ({})) };
  }
  const pays = (loadId: string) => prisma.carrierPay.findMany({ where: { loadId }, orderBy: { createdAt: "asc" } });
  const livePays = (loadId: string) => prisma.carrierPay.findMany({ where: { loadId, status: { not: "VOID" } } });
  const loadStatus = async (id: string) => (await prisma.load.findUnique({ where: { id }, select: { status: true, podUrl: true, podReceivedAt: true } }))!;
  const cpp = async () => (await prisma.carrierProfile.findUnique({ where: { id: carrier.id }, select: { cppTotalLoads: true } }))!.cppTotalLoads;

  const cpp0 = await cpp();

  // ───────────────────────────────────────────────────────────────────────────
  console.log("[1] DELIVERED first, then the POD — the flip paid, the POD does not pay again");
  const l1 = await mkLoad("AT_DELIVERY");
  const f1 = await carrierStatus(l1.id, "DELIVERED");
  ok("carrier flips AT_DELIVERY -> DELIVERED (200)", f1.status === 200, `status=${f1.status} ${JSON.stringify(f1.body).slice(0, 160)}`);
  await sleep(600); // onLoadDelivered is fire-and-forget on the flip
  const p1a = await livePays(l1.id);
  ok("the DELIVERED flip created exactly one live CarrierPay", p1a.length === 1, `n=${p1a.length}`);
  ok("… with no dueDate yet (documentation not received)", p1a[0]?.dueDate == null, `dueDate=${p1a[0]?.dueDate}`);
  ok("… and docPod false", p1a[0]?.docPod === false);
  const cpp1 = await cpp();
  ok("cppTotalLoads +1 on the flip", cpp1 === cpp0 + 1, `${cpp0} -> ${cpp1}`);

  const u1 = await carrierPod(l1.id);
  ok("POD on the DELIVERED load is 200", u1.status === 200, `status=${u1.status} ${JSON.stringify(u1.body).slice(0, 160)}`);
  const s1 = await loadStatus(l1.id);
  // The flip awaited autoGenerateInvoice (customerRate is set), so a DRAFT
  // invoice exists; onPODUploaded advances it to SENT and the load to INVOICED.
  // That chain predates E1 and is what production does — asserted as-is.
  const inv1 = await prisma.invoice.findFirst({ where: { loadId: l1.id }, select: { status: true } });
  ok("POD advanced the load past POD_RECEIVED to INVOICED (the DRAFT invoice went SENT), podUrl stamped",
     s1.status === "INVOICED" && inv1?.status === "SENT" && !!s1.podUrl && !!s1.podReceivedAt, JSON.stringify({ ...s1, invoice: inv1?.status }));
  const p1b = await livePays(l1.id);
  ok("still exactly ONE live CarrierPay (the POD did not create a second)", p1b.length === 1, `n=${p1b.length}`);
  ok("… and it now has a dueDate (the payment clock started on the POD)", p1b[0]?.dueDate instanceof Date, `dueDate=${p1b[0]?.dueDate}`);
  ok("… and docPod is true", p1b[0]?.docPod === true);
  ok("cppTotalLoads did NOT move again on the POD", (await cpp()) === cpp1, `${cpp1} -> ${await cpp()}`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[2] POD at AT_DELIVERY — THE P0: the POD is the delivery event");
  const l2 = await mkLoad("AT_DELIVERY");
  const before2 = await livePays(l2.id);
  ok("no CarrierPay exists before the POD", before2.length === 0, `n=${before2.length}`);
  const u2 = await carrierPod(l2.id);
  ok("POD at AT_DELIVERY is 200", u2.status === 200, `status=${u2.status} ${JSON.stringify(u2.body).slice(0, 160)}`);
  const s2 = await loadStatus(l2.id);
  ok("load advanced AT_DELIVERY -> POD_RECEIVED (skipping DELIVERED)", s2.status === "POD_RECEIVED", JSON.stringify(s2));
  const p2 = await livePays(l2.id);
  ok("exactly ONE live CarrierPay was created BY THE POD", p2.length === 1, `n=${p2.length}`);
  ok("… with a dueDate set", p2[0]?.dueDate instanceof Date, `dueDate=${p2[0]?.dueDate}`);
  ok("… and docPod true", p2[0]?.docPod === true);
  ok("… at the agreed carrier rate, not the customer rate", p2[0]?.grossAmount === 4100, `gross=${p2[0]?.grossAmount}`);
  const cpp2 = await cpp();
  ok("cppTotalLoads +1 on the POD-as-delivery", cpp2 === cpp1 + 1, `${cpp1} -> ${cpp2}`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[3] a second POD on the same load — nothing fires twice");
  await sleep(600); // let the first POD's fire-and-forget autoGenerateInvoice land
  const u3 = await carrierPod(l2.id, "pod-again.pdf");
  ok("second POD is 200", u3.status === 200, `status=${u3.status}`);
  const docs3 = await prisma.document.count({ where: { loadId: l2.id, docType: "POD" } });
  ok("two POD documents are recorded", docs3 === 2, `n=${docs3}`);
  const p3 = await livePays(l2.id);
  ok("still exactly ONE live CarrierPay", p3.length === 1, `n=${p3.length}`);
  ok("… its dueDate did not move", p3[0]?.dueDate?.getTime() === p2[0]?.dueDate?.getTime(), `${p2[0]?.dueDate?.toISOString()} vs ${p3[0]?.dueDate?.toISOString()}`);
  ok("cppTotalLoads did NOT move on the second POD", (await cpp()) === cpp2, `${cpp2} -> ${await cpp()}`);
  // A second POD never regresses the load. It MAY advance it: the first POD's
  // autoGenerateInvoice left a DRAFT, and onPODUploaded moves that to SENT.
  const s3 = (await loadStatus(l2.id)).status;
  ok("load is POD_RECEIVED or INVOICED — never regressed", s3 === "POD_RECEIVED" || s3 === "INVOICED", s3);

  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[4] POD at AT_DELIVERY through /documents/upload (the AE route) — same seam, same outcome");
  const l4 = await mkLoad("AT_DELIVERY");
  const u4 = await aePod(l4.id);
  ok("AE upload with loadId is 201", u4.status === 201, `status=${u4.status} ${JSON.stringify(u4.body).slice(0, 160)}`);
  ok("response is the recorded document array", Array.isArray(u4.body) && u4.body.length === 1 && u4.body[0].docType === "POD", JSON.stringify(u4.body).slice(0, 160));
  const s4 = await loadStatus(l4.id);
  ok("load advanced AT_DELIVERY -> POD_RECEIVED", s4.status === "POD_RECEIVED", JSON.stringify(s4));
  const p4 = await livePays(l4.id);
  ok("exactly ONE live CarrierPay was created by the AE-route POD", p4.length === 1, `n=${p4.length}`);
  ok("… with a dueDate set", p4[0]?.dueDate instanceof Date, `dueDate=${p4[0]?.dueDate}`);
  ok("… and docPod true", p4[0]?.docPod === true);
  const cpp4 = await cpp();
  ok("cppTotalLoads +1 once", cpp4 === cpp2 + 1, `${cpp2} -> ${cpp4}`);
  const doc4 = await prisma.document.findFirst({ where: { loadId: l4.id }, select: { uploadSource: true, entityType: true, entityId: true } });
  ok("the row says AE_CONSOLE / LOAD, as the seam writes it", doc4?.uploadSource === "AE_CONSOLE" && doc4?.entityType === "LOAD" && doc4?.entityId === l4.id, JSON.stringify(doc4));

  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[5] a VOID CarrierPay on the load does not block the real one");
  const l5 = await mkLoad("AT_DELIVERY");
  await prisma.carrierPay.create({
    data: { loadId: l5.id, carrierId: cu.id, paymentNumber: `VOID-${stamp}`, amount: 1, grossAmount: 1, netAmount: 1, status: "VOID" } as any,
  });
  const u5 = await carrierPod(l5.id);
  ok("POD is 200", u5.status === 200, `status=${u5.status} ${JSON.stringify(u5.body).slice(0, 160)}`);
  const all5 = await pays(l5.id);
  const live5 = all5.filter((p) => p.status !== "VOID");
  ok("the VOID row is still there and exactly ONE live row was added beside it", all5.length === 2 && live5.length === 1, `all=${all5.length} live=${live5.length}`);
  ok("… the live one has a dueDate and docPod", live5[0]?.dueDate instanceof Date && live5[0]?.docPod === true);
  ok("cppTotalLoads +1 once", (await cpp()) === cpp4 + 1, `${cpp4} -> ${await cpp()}`);

  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[6] outbound: nothing left the building");
  ok("Resend is not configured in this process", process.env.RESEND_API_KEY === "");

  console.log(`\n${pass}/${pass + fail} passed`);
  server.closeAllConnections?.();
  server.close();

  // Let the fire-and-forget hooks (CPP recalc, milestone check, invoice) land
  // before the client disconnects, so their errors are theirs, not ours.
  await sleep(1500);

  // Cleanup — CarrierPay and RateConfirmation are Restrict on Load; delete them first.
  const docs = await prisma.document.findMany({ where: { loadId: { in: loadIds } }, select: { fileUrl: true } });
  for (const d of docs) {
    if (d.fileUrl.startsWith("/uploads/")) {
      const p = path.resolve(process.env.UPLOAD_DIR || "uploads", d.fileUrl.slice("/uploads/".length));
      fs.rmSync(p, { force: true });
    }
  }
  await prisma.carrierPay.deleteMany({ where: { loadId: { in: loadIds } } });
  await prisma.invoice.deleteMany({ where: { loadId: { in: loadIds } } }).catch(() => {});
  await prisma.document.deleteMany({ where: { loadId: { in: loadIds } } });
  await prisma.loadActivity.deleteMany({ where: { loadId: { in: loadIds } } }).catch(() => {});
  await prisma.notification.deleteMany({ where: { userId: { in: [cu.id, admin.id] } } }).catch(() => {});
  await prisma.load.deleteMany({ where: { id: { in: loadIds } } });
  await prisma.carrierScorecard.deleteMany({ where: { carrierId: carrier.id } }).catch(() => {});
  await prisma.carrierAgreement.deleteMany({ where: { carrierId: carrier.id } });
  await prisma.carrierProfile.delete({ where: { id: carrier.id } }).catch(() => {});
  await prisma.staffSession.deleteMany({ where: { userId: { in: [cu.id, admin.id] } } }).catch(() => {});
  await prisma.auditTrail.deleteMany({ where: { performedById: { in: [cu.id, admin.id] } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: { in: [cu.id, admin.id] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@srl.invalid` } } });
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
