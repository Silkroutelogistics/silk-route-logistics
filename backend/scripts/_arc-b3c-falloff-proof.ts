/**
 * Lifecycle-gaps B3c proof — one fall-off record per fall-off, shipper
 * cancellations kept but not counted, and a shipper-fault CANCEL recording no
 * fall-off at all. Real services, real controller, real database.
 *
 * Refuses a non-local DATABASE_URL: it writes and deletes rows.
 */
import { prisma } from "../src/config/database";
import { createTender } from "../src/services/tenderCreationService";
import { assignCarrier } from "../src/services/carrierAssignmentService";
import { releaseCarrier } from "../src/services/carrierReleaseService";
import { executeFallOffRecovery } from "../src/services/fallOffRecovery";
import { updateLoadStatus } from "../src/controllers/loadController";
import { makeCaptureRes } from "../src/lib/captureResponse";
import { reviewableFallOffCount } from "../src/lib/fallOffScoring";

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
  const poster = await prisma.user.create({
    data: { email: `b3c-p-${stamp}@srl.invalid`, passwordHash: "x", firstName: "A", lastName: "E", role: "BROKER" },
  });
  const cu = await prisma.user.create({
    data: { email: `b3c-c-${stamp}@srl.invalid`, passwordHash: "x", firstName: "P", lastName: "T", role: "CARRIER", company: `PEACE ${stamp}` },
  });
  const profile = await prisma.carrierProfile.create({ data: { userId: cu.id, companyName: `PEACE ${stamp}`, onboardingStatus: "APPROVED" } });

  async function seed(tag: string) {
    const load = await prisma.load.create({
      data: {
        referenceNumber: `B3C-${stamp}-${tag}`, posterId: poster.id, status: "BOOKED",
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "75568",
        pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
        equipmentType: "Reefer", rate: 5100, carrierRate: 4100, dispatchMethod: "loadboard",
      },
    });
    const t = await createTender({ loadId: load.id, carrierProfileId: profile.id, offeredRate: 4100 });
    await prisma.loadTender.update({ where: { id: t.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });
    await assignCarrier({ loadId: load.id, carrierUserId: cu.id, status: "BOOKED", carrierRate: 4100 });
    return load;
  }
  const reviewNotices = () =>
    prisma.notification.count({ where: { userId: poster.id, title: { contains: "Deactivation Review" } } });

  console.log("\n── 1. one fall-off, one record ──");
  const l1 = await seed("1");
  const r1 = await executeFallOffRecovery(l1.id, "driver quit");
  const rows1 = await prisma.fallOffEvent.findMany({ where: { loadId: l1.id } });
  ok("exactly ONE FallOffEvent for the load (was two: recovery's own + the release's)", rows1.length === 1, `got ${rows1.length}`);
  ok("it is the release's event, and recovery returned its id", rows1[0]?.id === r1.eventId);
  ok("its reason leads with the code", (rows1[0]?.reason ?? "").startsWith("carrier_fell_off"));
  ok("it names the released carrier", rows1[0]?.originalCarrierId === cu.id);
  ok("recovery updated THAT row (backupsSent written)", typeof rows1[0]?.backupsSent === "number");
  const load1 = await prisma.load.findUnique({ where: { id: l1.id }, select: { carrierId: true, status: true } });
  ok("the carrier is off the load and it is back on the board", load1!.carrierId === null && load1!.status === "POSTED");
  ok("the first fall-off on a clean carrier flags NO review (the double record used to make it 2)", (await reviewNotices()) === 0);

  console.log("\n── 2. two shipper cancellations: recorded, not counted ──");
  const l2 = await seed("2"), l3 = await seed("3");
  const r2 = await releaseCarrier({ loadId: l2.id, reason: "customer_cancel", actorId: poster.id, note: "shipper pulled it" });
  const r3 = await releaseCarrier({ loadId: l3.id, reason: "customer_cancel", actorId: poster.id });
  ok("each customer_cancel release records a fall-off (decision 2 keeps the record)", r2.faultRecorded && r3.faultRecorded);
  ok("and returns the event it recorded", !!r2.fallOffEventId && !!r3.fallOffEventId);
  const all = await prisma.fallOffEvent.findMany({ where: { originalCarrierId: cu.id }, select: { reason: true } });
  ok("three rows stand against the carrier", all.length === 3, `got ${all.length}`);
  ok("of which ONE counts toward review", reviewableFallOffCount(all) === 1);
  ok("no review notice from the release path", (await reviewNotices()) === 0);

  console.log("\n── 3. a second fall-off of the carrier's own crosses the threshold ──");
  const l4 = await seed("4");
  await executeFallOffRecovery(l4.id, "no show");
  const all2 = await prisma.fallOffEvent.findMany({ where: { originalCarrierId: cu.id }, select: { reason: true } });
  ok("four rows, two reviewable", all2.length === 4 && reviewableFallOffCount(all2) === 2, `rows=${all2.length} reviewable=${reviewableFallOffCount(all2)}`);
  const notices = await prisma.notification.findMany({ where: { userId: poster.id, title: { contains: "Deactivation Review" } } });
  ok("exactly one review notice, on the second of the carrier's own", notices.length === 1, `got ${notices.length}`);
  ok("and it says the count is theirs, not the shipper's", /2 fall-offs of their own/.test(notices[0]?.message ?? ""));

  console.log("\n── 4. a shipper-fault CANCEL records no fall-off ──");
  const l5 = await seed("5");
  const { shim, state } = makeCaptureRes();
  const req = {
    params: { id: l5.id },
    body: { status: "CANCELLED", cancellationReasonCode: "SHIPPER_FREIGHT_NOT_READY" },
    user: { id: poster.id, email: poster.email, role: "BROKER", firstName: "A", lastName: "E" },
    ip: "127.0.0.1", headers: {},
  } as any;
  await updateLoadStatus(req, shim);
  ok("the cancel is accepted", state.statusCode === 200, `status=${state.statusCode} body=${JSON.stringify(state.body).slice(0, 140)}`);
  const load5 = await prisma.load.findUnique({ where: { id: l5.id }, select: { status: true, carrierId: true, cancellationFaultParty: true } });
  ok("status CANCELLED with fault party SHIPPER", load5!.status === "CANCELLED" && load5!.cancellationFaultParty === "SHIPPER");
  ok("ZERO FallOffEvent rows for the cancelled load", (await prisma.fallOffEvent.count({ where: { loadId: l5.id } })) === 0);
  ok("the carrier's reviewable count is unchanged by the cancellation", reviewableFallOffCount(await prisma.fallOffEvent.findMany({ where: { originalCarrierId: cu.id }, select: { reason: true } })) === 2);
  ok("the carrier stays on the cancelled load's record (cancel is not release)", load5!.carrierId === cu.id);

  // cleanup
  const ref = { referenceNumber: { startsWith: `B3C-${stamp}-` } };
  await prisma.fallOffEvent.deleteMany({ where: { load: ref } });
  await prisma.notification.deleteMany({ where: { userId: { in: [poster.id, cu.id] } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [poster.id, cu.id] } } });
  await prisma.loadActivity.deleteMany({ where: { load: ref } });
  await prisma.rateConfirmation.deleteMany({ where: { load: ref } });
  await prisma.loadTender.deleteMany({ where: { load: ref } });
  await prisma.checkCallSchedule.deleteMany({ where: { load: ref } });
  await prisma.shipment.deleteMany({ where: { load: ref } });
  await prisma.load.deleteMany({ where: ref });
  await prisma.carrierProfile.delete({ where: { id: profile.id } });
  await prisma.user.deleteMany({ where: { id: { in: [poster.id, cu.id] } } });

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
