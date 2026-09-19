/**
 * Lifecycle-gaps B5b proof — a carrier with any reference is refused with the
 * references named; a bare registration is archived and its login deactivated;
 * restore undoes both; suspension requires a reason. Real controllers, real
 * database.
 *
 * Refuses a non-local DATABASE_URL: it writes and deletes rows.
 */
import { prisma } from "../src/config/database";
import { archiveCarrier, restoreCarrier } from "../src/controllers/carrierController";
import { suspendCarrier } from "../src/controllers/complianceController";
import { createTender } from "../src/services/tenderCreationService";
import { assignCarrier } from "../src/services/carrierAssignmentService";
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
    data: { email: `b5b-ae-${stamp}@srl.invalid`, passwordHash: "x", firstName: "A", lastName: "E", role: "ADMIN" },
  });
  const actor = { id: ae.id, email: ae.email, role: "ADMIN", firstName: "A", lastName: "E" };
  const call = async (fn: (req: any, res: any) => Promise<any>, params: Record<string, string>, body: Record<string, unknown> = {}) => {
    const { shim, state } = makeCaptureRes();
    await fn({ params, body, user: actor, ip: "127.0.0.1", headers: {} } as any, shim);
    return state as { statusCode: number; body: any };
  };
  async function carrier(tag: string, onboardingStatus: any = "APPROVED") {
    const cu = await prisma.user.create({
      data: { email: `b5b-c-${tag}-${stamp}@srl.invalid`, passwordHash: "x", firstName: "P", lastName: "T", role: "CARRIER", company: `B5B ${tag} ${stamp}` },
    });
    const profile = await prisma.carrierProfile.create({ data: { userId: cu.id, companyName: `B5B ${tag} ${stamp}`, onboardingStatus } });
    return { cu, profile };
  }
  const row = (id: string) => prisma.carrierProfile.findUnique({ where: { id }, select: { deletedAt: true, onboardingStatus: true, autoSuspendCause: true, autoSuspendReason: true } });
  const login = (id: string) => prisma.user.findUnique({ where: { id }, select: { isActive: true } });

  console.log("\n── 1. a carrier on a load: refused, the in-flight load named, nothing touched ──");
  const A = await carrier("live");
  const load = await prisma.load.create({
    data: {
      referenceNumber: `B5B-${stamp}-live`, posterId: ae.id, status: "BOOKED",
      originCity: "Lebanon", originState: "NH", originZip: "03766", destCity: "North Lake", destState: "TX", destZip: "75568",
      pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5), equipmentType: "Reefer", rate: 5100, customerRate: 5100, carrierRate: 4100, dispatchMethod: "loadboard",
    },
  });
  const t = await createTender({ loadId: load.id, carrierProfileId: A.profile.id, offeredRate: 4100 });
  await prisma.loadTender.update({ where: { id: t.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });
  await assignCarrier({ loadId: load.id, carrierUserId: A.cu.id, status: "BOOKED", carrierRate: 4100 });
  const r1 = await call(archiveCarrier, { id: A.profile.id });
  ok("409 CARRIER_HAS_REFERENCES", r1.statusCode === 409 && r1.body?.error === "CARRIER_HAS_REFERENCES", `status=${r1.statusCode} ${JSON.stringify(r1.body).slice(0, 160)}`);
  ok("the load is read by USER id and named as in flight", r1.body?.remedy?.inFlightLoads?.[0] === load.referenceNumber, JSON.stringify(r1.body?.remedy));
  ok("the tender is read by PROFILE id and counted live", r1.body?.references?.tenders === 1 && r1.body.references.liveTenders === 1);
  ok("the message names both and states the end state", /1 load \(1 in flight\), 1 tender \(1 live\)/.test(r1.body?.message ?? "") && /suspended, not archived/.test(r1.body?.message ?? ""), r1.body?.message);
  ok("the remedy points at the suspend endpoint", r1.body?.remedy?.suspend === `POST /compliance/carrier/${A.profile.id}/suspend`);
  const a1 = await row(A.profile.id);
  ok("the profile is not archived and the login is still active", a1?.deletedAt === null && (await login(A.cu.id))?.isActive === true);

  console.log("\n── 2. a signed agreement alone refuses — evidence is never archived away ──");
  const B = await carrier("signed");
  await prisma.carrierAgreement.create({ data: { carrierId: B.profile.id, templateName: "broker-carrier", version: "2026-06-27-v1", status: "SIGNED" } });
  const r2 = await call(archiveCarrier, { id: B.profile.id });
  ok("409 with the agreement named", r2.statusCode === 409 && /1 signed agreement/.test(r2.body?.message ?? ""), r2.body?.message);

  console.log("\n── 3. suspension is the end state: a reason is required, then recorded ──");
  const r3a = await call(suspendCarrier, { carrierId: B.profile.id }, {});
  ok("no reason → 400, nothing written", r3a.statusCode === 400 && (await row(B.profile.id))?.onboardingStatus === "APPROVED", `status=${r3a.statusCode}`);
  const r3b = await call(suspendCarrier, { carrierId: B.profile.id }, { reason: "Repeated no-shows on booked loads" });
  const b3 = await row(B.profile.id);
  ok("with a reason → SUSPENDED, cause AE_MANUAL, the reason on the row", r3b.statusCode === 200 && b3?.onboardingStatus === "SUSPENDED" && b3.autoSuspendCause === "AE_MANUAL" && /Repeated no-shows/.test(b3.autoSuspendReason ?? ""), `status=${r3b.statusCode} ${JSON.stringify(b3)}`);
  ok("an audit trail row says who and why", (await prisma.auditTrail.count({ where: { action: "CARRIER_SUSPENDED", entityId: B.profile.id, performedById: ae.id } })) === 1);
  const r3c = await call(archiveCarrier, { id: B.profile.id });
  ok("archive is still refused afterwards, and no longer points at suspend", r3c.statusCode === 409 && r3c.body?.remedy?.suspend === null);

  console.log("\n── 4. a bare registration: archived, login deactivated, both undone by restore ──");
  const C = await carrier("bare", "PENDING");
  const r4 = await call(archiveCarrier, { id: C.profile.id });
  ok("200 archived + loginDeactivated", r4.statusCode === 200 && r4.body?.details?.archived === true && r4.body.details.loginDeactivated === true, `status=${r4.statusCode} ${JSON.stringify(r4.body)}`);
  const c4 = await row(C.profile.id);
  ok("the row is archived (soft), not gone", !!c4 && c4.deletedAt !== null);
  ok("the login is deactivated — the middleware answers 403 to it now", (await login(C.cu.id))?.isActive === false);
  const r4b = await call(archiveCarrier, { id: C.profile.id });
  ok("a second archive is 404", r4b.statusCode === 404);
  const r4r = await call(restoreCarrier, { id: C.profile.id });
  ok("restore → 200, row back, login active again", r4r.statusCode === 200 && (await row(C.profile.id))?.deletedAt === null && (await login(C.cu.id))?.isActive === true, `status=${r4r.statusCode}`);

  // cleanup
  await prisma.auditTrail.deleteMany({ where: { performedById: ae.id } });
  await prisma.notification.deleteMany({ where: { userId: { in: [ae.id, A.cu.id, B.cu.id, C.cu.id] } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ae.id, A.cu.id, B.cu.id, C.cu.id] } } });
  await prisma.loadActivity.deleteMany({ where: { loadId: load.id } });
  await prisma.rateConfirmation.deleteMany({ where: { loadId: load.id } });
  await prisma.loadTender.deleteMany({ where: { loadId: load.id } });
  await prisma.checkCallSchedule.deleteMany({ where: { loadId: load.id } });
  await prisma.shipment.deleteMany({ where: { loadId: load.id } });
  await prisma.load.delete({ where: { id: load.id } });
  await prisma.carrierAgreement.deleteMany({ where: { carrierId: B.profile.id } });
  await prisma.carrierProfile.deleteMany({ where: { id: { in: [A.profile.id, B.profile.id, C.profile.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ae.id, A.cu.id, B.cu.id, C.cu.id] } } });

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
