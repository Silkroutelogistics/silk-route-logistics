/**
 * Lifecycle-gaps B6b proof — every lifecycle writer leaves ONE AuditTrail row
 * through lib/lifecycleAudit, read back from a real database after driving
 * the REAL controllers: a load cancelled on the status path, a load marked
 * TONU, a load archived and restored, a customer inactivated, reactivated and
 * hard-deleted, a carrier archived and restored. Each row is checked for
 * actor, reason, fault party and previous/new.
 *
 * Refuses a non-local DATABASE_URL: it writes and deletes rows.
 *
 *   DATABASE_URL=postgresql://ci:ci@127.0.0.1:55445/ci DIRECT_URL=... \
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= S3_BUCKET_NAME= AWS_ACCESS_KEY_ID= \
 *   npx tsx scripts/_arc-b6b-lifecycle-audit-proof.ts
 */
import { prisma } from "../src/config/database";
import { deleteCustomer, inactivateCustomer, reactivateCustomer } from "../src/controllers/customerController";
import { updateLoadStatus, deleteLoad, restoreLoad } from "../src/controllers/loadController";
import { archiveCarrier, restoreCarrier } from "../src/controllers/carrierController";
import { makeCaptureRes } from "../src/lib/captureResponse";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d?: string) => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  — " + d : ""}`); }
};

async function main() {
  const stamp = Date.now().toString(36);
  const ae = await prisma.user.create({
    data: { email: `b6b-ae-${stamp}@srl.invalid`, passwordHash: "x", firstName: "A", lastName: "E", role: "ADMIN" },
  });
  const actor = { id: ae.id, email: ae.email, role: "ADMIN", firstName: "A", lastName: "E" };
  const call = async (fn: (req: any, res: any) => Promise<any>, params: Record<string, string>, body: Record<string, unknown> = {}) => {
    const { shim, state } = makeCaptureRes();
    await fn({ params, body, user: actor, ip: "127.0.0.1", headers: { "user-agent": "b6b-proof" } } as any, shim);
    return state as { statusCode: number; body: any };
  };
  const mkLoad = (tag: string, status: string, customerId?: string) =>
    prisma.load.create({
      data: {
        referenceNumber: `B6B-${stamp}-${tag}`, posterId: ae.id, customerId, status: status as any,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "75568",
        pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
        equipmentType: "Reefer", rate: 5100, customerRate: 5100, carrierRate: 4100, dispatchMethod: "loadboard",
      },
    });
  const rowsFor = (entityType: string, entityId: string) =>
    prisma.auditTrail.findMany({ where: { entityType, entityId, performedById: ae.id }, orderBy: { performedAt: "asc" } });
  const cf = (r: any) => r.changedFields as any;

  // ── 1. a load cancelled on the status path ─────────────────────────────
  console.log("\n── 1. status path: TENDERED → CANCELLED with a reason code ──");
  const l1 = await mkLoad("cancel", "TENDERED");
  const r1 = await call(updateLoadStatus, { id: l1.id }, { status: "CANCELLED", cancellationReasonCode: "SHIPPER_FREIGHT_NOT_READY" });
  ok("the cancel succeeded", r1.statusCode === 200, `status=${r1.statusCode} ${JSON.stringify(r1.body).slice(0, 120)}`);
  const a1 = await rowsFor("Load", l1.id);
  ok("exactly one lifecycle row", a1.length === 1, `rows=${a1.length}`);
  ok("action CANCEL / LOAD_CANCELLED", a1[0]?.action === "CANCEL" && cf(a1[0])?.actionDetail === "LOAD_CANCELLED");
  ok("actor = the AE (performedById and changedFields.actor)", a1[0]?.performedById === ae.id && cf(a1[0])?.actor?.userId === ae.id);
  ok("reason code + fault party recorded", cf(a1[0])?.reasonCode === "SHIPPER_FREIGHT_NOT_READY" && cf(a1[0])?.faultParty === "SHIPPER", JSON.stringify(cf(a1[0])));
  ok("previous/new status recorded", cf(a1[0])?.previous?.status === "TENDERED" && cf(a1[0])?.new?.status === "CANCELLED");
  ok("ip recorded from the request", a1[0]?.ipAddress === "127.0.0.1", String(a1[0]?.ipAddress));

  // ── 2. a load marked TONU ──────────────────────────────────────────────
  console.log("\n── 2. status path: BOOKED → TONU, customer's fault ──");
  const l2 = await mkLoad("tonu", "BOOKED");
  const r2 = await call(updateLoadStatus, { id: l2.id }, { status: "TONU", tonuFaultSide: "CUSTOMER", reason: "Dock closed on arrival" });
  ok("the TONU succeeded", r2.statusCode === 200, `status=${r2.statusCode} ${JSON.stringify(r2.body).slice(0, 120)}`);
  const a2 = await rowsFor("Load", l2.id);
  ok("exactly one lifecycle row", a2.length === 1, `rows=${a2.length}`);
  ok("action CANCEL / LOAD_TONU", a2[0]?.action === "CANCEL" && cf(a2[0])?.actionDetail === "LOAD_TONU");
  ok("fault party in the FaultParty vocabulary (CUSTOMER → SHIPPER), raw side in new", cf(a2[0])?.faultParty === "SHIPPER" && cf(a2[0])?.new?.tonuFaultSide === "CUSTOMER", JSON.stringify(cf(a2[0])));
  ok("the free-text reason is on the row", cf(a2[0])?.reason === "Dock closed on arrival");

  // ── 3. a load archived (cancel + hide) then restored ───────────────────
  console.log("\n── 3. archive path: a POSTED load archived with DUPLICATE_ENTRY, then restored ──");
  const l3 = await mkLoad("arch", "POSTED");
  const r3 = await call(deleteLoad, { id: l3.id }, { cancellationReasonCode: "DUPLICATE_ENTRY", reason: "Entered twice" });
  ok("the archive succeeded", r3.statusCode === 200, `status=${r3.statusCode} ${JSON.stringify(r3.body).slice(0, 120)}`);
  const r3b = await call(restoreLoad, { id: l3.id });
  ok("the restore succeeded", r3b.statusCode === 200, `status=${r3b.statusCode}`);
  const a3 = await rowsFor("Load", l3.id);
  ok("two lifecycle rows, in order", a3.length === 2, `rows=${a3.length}`);
  ok("row 1 CANCEL / LOAD_CANCELLED with fault party NONE and the archive instant in new", a3[0]?.action === "CANCEL" && cf(a3[0])?.actionDetail === "LOAD_CANCELLED" && cf(a3[0])?.faultParty === "NONE" && typeof cf(a3[0])?.new?.deletedAt === "string", JSON.stringify(cf(a3[0])));
  ok("row 2 STATUS_CHANGE / LOAD_RESTORED, deletedAt back to null", a3[1]?.action === "STATUS_CHANGE" && cf(a3[1])?.actionDetail === "LOAD_RESTORED" && cf(a3[1])?.new?.deletedAt === null, JSON.stringify(cf(a3[1])));

  // ── 4. customer inactivated, reactivated, hard-deleted ────────────────
  console.log("\n── 4. customer: inactivate → reactivate → delete (zero references) ──");
  const c4 = await prisma.customer.create({ data: { name: `B6B cust ${stamp}`, email: `b6b-c-${stamp}@srl.invalid` } });
  const r4a = await call(inactivateCustomer, { id: c4.id }, { reason: "Credit hold pending remittance" });
  const r4b = await call(reactivateCustomer, { id: c4.id });
  const r4c = await call(deleteCustomer, { id: c4.id });
  ok("all three succeeded", r4a.statusCode === 200 && r4b.statusCode === 200 && r4c.statusCode === 200, `${r4a.statusCode}/${r4b.statusCode}/${r4c.statusCode} ${JSON.stringify(r4c.body).slice(0, 120)}`);
  const a4 = await rowsFor("Customer", c4.id);
  ok("three lifecycle rows, in order", a4.length === 3, `rows=${a4.length}`);
  ok("DEACTIVATE / CUSTOMER_INACTIVATED with the reason and isActive true → false", a4[0]?.action === "DEACTIVATE" && cf(a4[0])?.actionDetail === "CUSTOMER_INACTIVATED" && cf(a4[0])?.reason === "Credit hold pending remittance" && cf(a4[0])?.previous?.isActive === true && cf(a4[0])?.new?.isActive === false, JSON.stringify(cf(a4[0])));
  ok("STATUS_CHANGE / CUSTOMER_REACTIVATED keeps the cleared reason in previous", a4[1]?.action === "STATUS_CHANGE" && cf(a4[1])?.actionDetail === "CUSTOMER_REACTIVATED" && cf(a4[1])?.previous?.inactivationReason === "Credit hold pending remittance", JSON.stringify(cf(a4[1])));
  ok("DELETE / CUSTOMER_DELETED outlives the row (the customer is gone, the record is not)", a4[2]?.action === "DELETE" && cf(a4[2])?.actionDetail === "CUSTOMER_DELETED" && (await prisma.customer.findUnique({ where: { id: c4.id } })) === null);

  // ── 5. carrier archived then restored ─────────────────────────────────
  console.log("\n── 5. carrier: archive (zero references) → restore ──");
  const cu = await prisma.user.create({ data: { email: `b6b-carrier-${stamp}@srl.invalid`, passwordHash: "x", firstName: "C", lastName: "R", role: "CARRIER" } });
  const cp = await prisma.carrierProfile.create({ data: { userId: cu.id, companyName: `B6B Carrier ${stamp}`, mcNumber: `MC-B6B${stamp}`.slice(0, 20), onboardingStatus: "PENDING" } });
  const r5a = await call(archiveCarrier, { id: cp.id }, { reason: "Registration abandoned" });
  const r5b = await call(restoreCarrier, { id: cp.id });
  ok("archive and restore succeeded", r5a.statusCode === 200 && r5b.statusCode === 200, `${r5a.statusCode}/${r5b.statusCode} ${JSON.stringify(r5a.body).slice(0, 160)}`);
  const a5 = await rowsFor("CarrierProfile", cp.id);
  ok("two lifecycle rows, in order", a5.length === 2, `rows=${a5.length}`);
  ok("DEACTIVATE / CARRIER_ARCHIVED with both rows moved (deletedAt set, login off) and the reason", a5[0]?.action === "DEACTIVATE" && cf(a5[0])?.actionDetail === "CARRIER_ARCHIVED" && cf(a5[0])?.previous?.loginActive === true && cf(a5[0])?.new?.loginActive === false && typeof cf(a5[0])?.new?.deletedAt === "string" && cf(a5[0])?.reason === "Registration abandoned", JSON.stringify(cf(a5[0])));
  ok("STATUS_CHANGE / CARRIER_RESTORED with login back on", a5[1]?.action === "STATUS_CHANGE" && cf(a5[1])?.actionDetail === "CARRIER_RESTORED" && cf(a5[1])?.new?.loginActive === true, JSON.stringify(cf(a5[1])));
  const loginNow = await prisma.user.findUnique({ where: { id: cu.id }, select: { isActive: true } });
  ok("and the login really is active again", loginNow?.isActive === true);

  // ── 6. the lifecycle rows are distinguishable from the route-middleware rows ──
  console.log("\n── 6. one reader convention: every lifecycle row carries actionDetail; no row carries a secret ──");
  const all = await prisma.auditTrail.findMany({ where: { performedById: ae.id } });
  ok("every row written by this proof carries changedFields.actionDetail", all.length === 9 && all.every((r) => typeof cf(r)?.actionDetail === "string"), `rows=${all.length}`);
  ok("no row carries a password hash, token or key", all.every((r) => !/passwordHash|token|secret|apiKey/i.test(JSON.stringify(r.changedFields))));

  // cleanup — best-effort on a throwaway container. The TONU raised a customer
  // invoice (Restrict on load delete) and logStatusChange wrote audit_logs rows
  // that Restrict the AE's deletion; both are removed first, and a leftover
  // never fails the proof, whose assertions are all above.
  console.log(`\n${pass} passed, ${fail} failed`);
  const quiet = (p: Promise<unknown>) => p.catch(() => {});
  await quiet(prisma.auditTrail.deleteMany({ where: { performedById: ae.id } }));
  await quiet(prisma.auditLog.deleteMany({ where: { userId: ae.id } }));
  await quiet(prisma.invoice.deleteMany({ where: { loadId: { in: [l1.id, l2.id, l3.id] } } }));
  for (const l of [l1, l2, l3]) await quiet(prisma.load.delete({ where: { id: l.id } }));
  await quiet(prisma.carrierProfile.delete({ where: { id: cp.id } }));
  await quiet(prisma.user.delete({ where: { id: cu.id } }));
  await quiet(prisma.user.delete({ where: { id: ae.id } }));
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
