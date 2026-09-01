/**
 * Commit-4 proof: the single-writer service preserves transaction atomicity.
 *
 * assignCarrier / clearCarrier return an UN-AWAITED PrismaPromise so they can be
 * composed into `prisma.$transaction([...])`, the array form acceptTender uses.
 * That design is the whole risk of this commit: if the returned promise were
 * eager, it would execute OUTSIDE the transaction and silently undo the
 * atomicity Sprint 38 added deliberately (§13.3 Item 53 — before it, a partial
 * failure left the load BOOKED while its tender was still OFFERED).
 *
 * A unit test cannot check this. With Prisma mocked, the mock returns whatever
 * it is told and every composition "works". Only a real database can show a
 * rollback actually rolling back.
 *
 * Local-only: it writes and deletes rows.
 */
// The APP's singleton, deliberately — not a fresh PrismaClient.
//
// The first version of this proof used `new PrismaClient()` and the atomicity
// assertion FAILED. That was the test, not the code: a PrismaPromise built on
// one client cannot be enrolled into a different client's $transaction, so the
// assignment executed independently and survived the rollback.
//
// It is recorded here because it is a real footgun, not a quirk of the test —
// any caller passing a `db` from a different client silently loses atomicity,
// with no error. Production is safe because acceptTender and the service share
// this singleton.
import { prisma } from "../src/config/database";
import { assignCarrier, clearCarrier } from "../src/services/carrierAssignmentService";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  — " + d : ""}`); }
};

async function main() {
  const stamp = Date.now();
  const poster = await prisma.user.create({
    data: { email: `ca-p-${stamp}@srl.invalid`, passwordHash: "x", firstName: "A", lastName: "E", role: "BROKER" },
  });
  const cu = await prisma.user.create({
    data: { email: `ca-c-${stamp}@srl.invalid`, passwordHash: "x", firstName: "C", lastName: "Co", role: "CARRIER" },
  });
  const profile = await prisma.carrierProfile.create({ data: { userId: cu.id, companyName: `CA ${stamp}` } });
  const load = await prisma.load.create({
    data: {
      referenceNumber: `CA-${stamp}`, posterId: poster.id, status: "TENDERED",
      originCity: "Lebanon", originState: "NH", originZip: "03766",
      destCity: "North Lake", destState: "TX", destZip: "75568",
      pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
      equipmentType: "Reefer", rate: 4100,
    },
  });
  const tender = await prisma.loadTender.create({
    data: { loadId: load.id, carrierId: profile.id, offeredRate: 4000, expiresAt: new Date(Date.now() + 7.2e6) },
  });

  // ── 1. the promise is LAZY — building it must not write ─────────────────
  const pending = assignCarrier({ loadId: load.id, carrierUserId: cu.id, status: "BOOKED", carrierRate: 4000 });
  const beforeAwait = await prisma.load.findUnique({ where: { id: load.id }, select: { carrierId: true } });
  ok("building the promise does not write (it is lazy)", beforeAwait!.carrierId === null, String(beforeAwait!.carrierId));
  await pending;
  const afterAwait = await prisma.load.findUnique({ where: { id: load.id }, select: { carrierId: true, status: true, carrierRate: true } });
  ok("awaiting it assigns the carrier", afterAwait!.carrierId === cu.id);
  ok("status rides in the same update", afterAwait!.status === "BOOKED");
  ok("carrierRate rides in the same update", afterAwait!.carrierRate === 4000);

  // ── 2. it composes into $transaction([...]) — the acceptTender shape ────
  await clearCarrier({ loadId: load.id, status: "TENDERED" });
  await prisma.$transaction([
    prisma.loadTender.update({ where: { id: tender.id }, data: { status: "ACCEPTED", respondedAt: new Date() } }),
    assignCarrier({ loadId: load.id, carrierUserId: cu.id, status: "BOOKED", carrierRate: 4000 }),
  ]);
  const composed = await prisma.load.findUnique({ where: { id: load.id }, select: { carrierId: true, status: true } });
  const ct = await prisma.loadTender.findUnique({ where: { id: tender.id }, select: { status: true } });
  ok("composed into a transaction, both writes land", composed!.carrierId === cu.id && ct!.status === "ACCEPTED");

  // ── 3. ATOMICITY — the assignment rolls back with its transaction ───────
  // This is the assertion the design exists for. A failing sibling operation
  // must take the carrier assignment down with it.
  await clearCarrier({ loadId: load.id, status: "TENDERED" });
  let threw = false;
  try {
    await prisma.$transaction([
      assignCarrier({ loadId: load.id, carrierUserId: cu.id, status: "BOOKED" }),
      // Guaranteed failure: a tender id that does not exist.
      prisma.loadTender.update({ where: { id: "does-not-exist-" + stamp }, data: { status: "ACCEPTED" } }),
    ]);
  } catch { threw = true; }
  ok("a failing sibling operation aborts the transaction", threw);
  const rolled = await prisma.load.findUnique({ where: { id: load.id }, select: { carrierId: true, status: true } });
  ok("the carrier assignment ROLLED BACK with it", rolled!.carrierId === null, String(rolled!.carrierId));
  ok("and the status rolled back too", rolled!.status === "TENDERED", rolled!.status);

  // ── 4. clearCarrier moves status in the same write ──────────────────────
  await assignCarrier({ loadId: load.id, carrierUserId: cu.id, status: "BOOKED" });
  await clearCarrier({ loadId: load.id, status: "POSTED", extra: { driverName: null } });
  const cleared = await prisma.load.findUnique({ where: { id: load.id }, select: { carrierId: true, status: true } });
  ok("clearCarrier removes the carrier", cleared!.carrierId === null);
  ok("and re-posts in the same update — never carrier-less while BOOKED", cleared!.status === "POSTED");

  // cleanup
  await prisma.loadTender.deleteMany({ where: { loadId: load.id } });
  await prisma.load.delete({ where: { id: load.id } });
  await prisma.carrierProfile.delete({ where: { id: profile.id } });
  await prisma.user.deleteMany({ where: { id: { in: [cu.id, poster.id] } } });

  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
