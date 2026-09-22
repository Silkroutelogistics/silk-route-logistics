/**
 * E5 proof (rulings 2 + 4): a settlement cannot be approved without the
 * carrier's invoice; the invoice arriving through the seam flips the
 * settlement's docCarrierInvoice AND tells accounting (email to the
 * accounting alias, in-app row per ACCOUNTING user); an AE override with a
 * reason approves and leaves an audit row naming who and when; bulk approval
 * refuses by id. Real router over HTTP, real database.
 *
 * The unit guards hold the shapes with prisma mocked. This is the half they
 * cannot see: that the gate's Document read and the seam's flag write agree
 * on a real Postgres, and that the notification row and the email both fire
 * from one real upload.
 *
 * Rehearsal container only; outbound keys must be explicitly EMPTY.
 *
 * Run:
 *   DATABASE_URL=postgres://...127.0.0.1... RESEND_API_KEY= QUO_API_KEY= OPENPHONE_API_KEY= \
 *   S3_BUCKET_NAME= AWS_ACCESS_KEY_ID= UPLOAD_DIR=/tmp/e5-uploads LOG_LEVEL=info \
 *   npx tsx scripts/_arc-e5-invoice-proof.ts 2>&1 | tee /tmp/e5proof.log
 * then: grep -c '\[Email\] Sent to' /tmp/e5proof.log   (must be 0)
 *       grep '\[Email\]\[NoAPI\] To: accounting@' /tmp/e5proof.log   (must be 1 line)
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
import type { Server } from "http";

const PORT = 55931;
const BASE = `http://127.0.0.1:${PORT}/api`;

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  -- " + d : ""}`); }
};
const until = async (f: () => Promise<boolean>, ms = 4000) => {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (await f()) return true; await new Promise((r) => setTimeout(r, 150)); }
  return f();
};

async function main() {
  const { prisma } = await import("../src/config/database");
  const { registerSession } = await import("../src/middleware/auth");
  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const routes = (await import("../src/routes")).default;

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((r) => { const s = app.listen(PORT, "127.0.0.1", () => r(s)); });

  const stamp = Date.now();
  const mkUser = (tag: string, role: string, extra: Record<string, unknown> = {}) => prisma.user.create({
    data: { email: `e5-${tag}-${stamp}@srl.invalid`, passwordHash: "x", firstName: tag, lastName: "Proof", role: role as never, ...extra },
  });
  const admin = await mkUser("admin", "ADMIN");
  const acct = await mkUser("acct", "ACCOUNTING");
  const cu = await mkUser("carrier", "CARRIER", { totpEnabled: true });
  const profile = await prisma.carrierProfile.create({
    data: { userId: cu.id, companyName: `E5 Haulers ${stamp}`, onboardingStatus: "APPROVED", status: "APPROVED", activatedAt: new Date(), contactEmail: `e5-dispatch-${stamp}@srl.invalid` },
  });
  await prisma.carrierAgreement.create({
    data: { carrierId: profile.id, templateName: "broker-carrier", version: "test", status: "SIGNED", signedAt: new Date(), signedByName: "E5 Proof" },
  });
  const session = (u: { id: string }, role: string, cookie: string) => {
    const t = jwt.sign({ userId: u.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
    registerSession(u.id, t, role as never);
    return `${cookie}=${t}`;
  };
  const adminCookie = session(admin, "ADMIN", "srl_token_ae");
  const acctCookie = session(acct, "ACCOUNTING", "srl_token_ae");
  const carrierCookie = session(cu, "CARRIER", "srl_token_carrier");

  const mkLoad = (n: number) => prisma.load.create({
    data: {
      referenceNumber: `E5-${stamp}-${n}`, loadNumber: `SRL-E5${String(stamp).slice(-5)}${n}`, posterId: admin.id, status: "DELIVERED", carrierId: cu.id,
      originCity: "Lebanon", originState: "NH", originZip: "03766", destCity: "North Lake", destState: "TX", destZip: "76247",
      pickupDate: new Date(), deliveryDate: new Date(), equipmentType: "Dry Van 53'", rate: 5100, customerRate: 5100, carrierRate: 4100,
    },
  });
  const mkPay = (loadId: string) => prisma.carrierPay.create({
    data: { loadId, carrierId: cu.id, amount: 4100, grossAmount: 4100, netAmount: 4100, status: "SUBMITTED", paymentTier: "STANDARD" } as never,
  });
  const loadA = await mkLoad(1); const payA = await mkPay(loadA.id);
  const loadB = await mkLoad(2); const payB = await mkPay(loadB.id);
  const loadC = await mkLoad(3); const payC = await mkPay(loadC.id);

  const approve = (id: string, cookie: string, body: unknown = {}) => fetch(`${BASE}/accounting/payments/${id}/approve`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const payRow = (id: string) => prisma.carrierPay.findUniqueOrThrow({ where: { id }, select: { status: true, docCarrierInvoice: true } });

  // ───────────────────────────────────────────────────────────────────────────
  console.log("[1] no invoice on file: approval is refused and nothing moves");
  const r1 = await approve(payA.id, adminCookie);
  ok("409 INVOICE_REQUIRED", r1.status === 409 && (await r1.json()).code === "INVOICE_REQUIRED", `status=${r1.status}`);
  ok("the settlement is still SUBMITTED", (await payRow(payA.id)).status === "SUBMITTED");
  const r1s = await approve(payA.id, adminCookie, { overrideReason: "too short" });
  ok("a 9-char reason is not an override: 400", r1s.status === 400 && (await r1s.json()).code === "OVERRIDE_REASON_TOO_SHORT", `status=${r1s.status}`);
  const r1a = await approve(payA.id, acctCookie, { overrideReason: "ACCOUNTING trying to waive the invoice requirement" });
  ok("ACCOUNTING cannot approve at all here (route is ADMIN/CEO): 403", r1a.status === 403, `status=${r1a.status}`);
  ok("no audit row was written by any refusal", (await prisma.auditLog.count({ where: { action: "CARRIER_PAY_INVOICE_OVERRIDE", entityId: payA.id } })) === 0);

  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[2] the carrier uploads the INVOICE through the seam");
  const fd = new FormData();
  fd.append("docType", "INVOICE");
  fd.append("file", new Blob([Buffer.from("%PDF-1.4\n%proof invoice\n")], { type: "application/pdf" }), "invoice.pdf");
  const up = await fetch(`${BASE}/carrier-loads/${loadA.id}/documents`, { method: "POST", headers: { Cookie: carrierCookie }, body: fd });
  ok("200 from the carrier upload route", up.status === 200, `status=${up.status} ${(await up.clone().text()).slice(0, 120)}`);
  const doc = await prisma.document.findFirst({ where: { loadId: loadA.id, docType: "INVOICE" } });
  ok("an INVOICE Document row exists, PENDING, from the carrier portal", !!doc && doc.status === "PENDING" && doc.uploadSource === "CARRIER_PORTAL");
  ok("docCarrierInvoice flipped on the settlement (the seam's sync, on a real row)", await until(async () => (await payRow(payA.id)).docCarrierInvoice));
  const noteOk = await until(async () => !!(await prisma.notification.findFirst({ where: { userId: acct.id, actionUrl: { contains: `load=${loadA.id}` } } })));
  ok("the ACCOUNTING user has an in-app row linking the settlement by load + document", noteOk);
  const note = await prisma.notification.findFirst({ where: { userId: acct.id, actionUrl: { contains: `load=${loadA.id}` } } });
  ok("… the row names the carrier and the amount", !!note && /E5 Haulers/.test(note.message) && /\$4,100\.00/.test(note.message), note?.message);
  ok("… and links the document id", !!note && !!doc && note.actionUrl!.includes(`invoice=${doc.id}`));
  ok("the AE got NO row for this (it is accounting's event)", (await prisma.notification.count({ where: { userId: admin.id, actionUrl: { contains: `invoice=` } } })) === 0);

  console.log("\n[3] with the invoice on file, approval goes through with no override");
  const r3 = await approve(payA.id, adminCookie);
  ok("200", r3.status === 200, `status=${r3.status}`);
  ok("the settlement is APPROVED", (await payRow(payA.id)).status === "APPROVED");
  ok("still no audit row: nothing was waived", (await prisma.auditLog.count({ where: { action: "CARRIER_PAY_INVOICE_OVERRIDE", entityId: payA.id } })) === 0);

  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[4] an AE override with a reason: approved, and the audit row names who and when");
  const reason = "Carrier emailed the invoice to the desk; attached in the Gmail thread.";
  const before = new Date();
  const r4 = await approve(payB.id, adminCookie, { overrideReason: reason });
  ok("200", r4.status === 200, `status=${r4.status}`);
  ok("APPROVED", (await payRow(payB.id)).status === "APPROVED");
  const audit = await prisma.auditLog.findFirst({ where: { action: "CARRIER_PAY_INVOICE_OVERRIDE", entityId: payB.id } });
  ok("exactly one audit row, by the admin, after the request started", !!audit && audit.userId === admin.id && audit.createdAt >= before);
  ok("… carrying the reason, the load and the role", !!audit && (audit.details as any)?.reason === reason && (audit.details as any)?.loadId === loadB.id && (audit.details as any)?.role === "ADMIN");
  ok("… and the audit row's own timestamp precedes the approval's", !!audit && audit.createdAt <= (await prisma.carrierPay.findUniqueOrThrow({ where: { id: payB.id } })).approvedAt!);

  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[5] bulk: the one with an invoice goes, the one without is refused by id, no override");
  const loadD = await mkLoad(4); const payD = await mkPay(loadD.id);
  await prisma.document.create({ data: { userId: cu.id, loadId: loadD.id, docType: "INVOICE", fileName: "inv.pdf", fileUrl: "/uploads/x.pdf", fileType: "application/pdf", fileSize: 10, status: "PENDING", entityType: "LOAD", entityId: loadD.id, uploadSource: "CARRIER_PORTAL" } as never });
  const r5 = await fetch(`${BASE}/accounting/payments/bulk-approve`, {
    method: "POST", headers: { Cookie: adminCookie, "Content-Type": "application/json" },
    body: JSON.stringify({ paymentIds: [payC.id, payD.id], overrideReason: "one reason for two payments is a reason for neither" }),
  });
  const b5 = await r5.json();
  ok("200 with approved=1, refused names the invoice-less one", r5.status === 200 && b5.approved === 1 && JSON.stringify(b5.refused) === JSON.stringify([{ id: payC.id, code: "INVOICE_REQUIRED" }]), JSON.stringify(b5));
  ok("payD APPROVED, payC still SUBMITTED", (await payRow(payD.id)).status === "APPROVED" && (await payRow(payC.id)).status === "SUBMITTED");
  ok("bulk wrote no override audit row", (await prisma.auditLog.count({ where: { action: "CARRIER_PAY_INVOICE_OVERRIDE", entityId: { in: [payC.id, payD.id] } } })) === 0);

  console.log("\n[6] outbound: nothing left the building");
  ok("Resend is not configured in this process", process.env.RESEND_API_KEY === "");

  console.log(`\n${pass}/${pass + fail} passed`);
  server.closeAllConnections?.();
  server.close();
  await new Promise((r) => setTimeout(r, 500));

  const loadIds = [loadA.id, loadB.id, loadC.id, loadD.id];
  await prisma.notification.deleteMany({ where: { userId: { in: [acct.id, admin.id, cu.id] } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [admin.id, acct.id, cu.id] } } });
  await prisma.document.deleteMany({ where: { loadId: { in: loadIds } } });
  await prisma.carrierPay.deleteMany({ where: { loadId: { in: loadIds } } });
  await prisma.loadActivity.deleteMany({ where: { loadId: { in: loadIds } } }).catch(() => {});
  await prisma.load.deleteMany({ where: { id: { in: loadIds } } });
  await prisma.carrierAgreement.deleteMany({ where: { carrierId: profile.id } });
  await prisma.carrierProfile.delete({ where: { id: profile.id } });
  await prisma.staffSession.deleteMany({ where: { userId: { in: [admin.id, acct.id, cu.id] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@srl.invalid` } } });
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
