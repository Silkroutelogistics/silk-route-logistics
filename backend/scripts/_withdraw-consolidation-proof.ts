/**
 * Commit-8b proof: one helper withdraws live tenders, and it withdraws the ones
 * the six hand-rolled copies were missing.
 *
 * Every one of those six sites filtered on status "OFFERED" alone. A COUNTERED
 * sibling therefore survived being covered by another carrier, stayed live, and
 * could afterwards be accepted onto a load that was already booked. That gap is
 * the headline assertion here.
 *
 * Calls the real withdrawLiveTenders through the real singleton client. A proof
 * that reproduces the write it is testing proves only that the author can copy
 * (§13.3 Item 222.5), and the earlier sibling proof did exactly that.
 *
 * Local-only: it writes and deletes rows.
 */
import { prisma } from "../src/config/database";
import { withdrawLiveTenders, settleTender, settleTenders } from "../src/services/tenderTransitionService";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  -- " + d : ""}`); }
};

const stamp = Date.now();
let posterId = "";
const madeLoads: string[] = [];

async function makeLoad(ref: string) {
  const load = await prisma.load.create({
    data: {
      referenceNumber: `${ref}-${stamp}`, posterId, status: "TENDERED",
      originCity: "Lebanon", originState: "NH", originZip: "03766",
      destCity: "North Lake", destState: "TX", destZip: "75568",
      pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
      equipmentType: "Reefer", rate: 4100,
    },
  });
  madeLoads.push(load.id);
  return load;
}

let carrierSeq = 0;
let seedCarrierUser = "";
async function makeTender(loadId: string, status: string, extra: Record<string, unknown> = {}) {
  const n = ++carrierSeq;
  const u = await prisma.user.create({
    data: { email: `w8b-${n}-${stamp}@srl.invalid`, passwordHash: "x", firstName: `C${n}`, lastName: "Co", role: "CARRIER" },
  });
  const p = await prisma.carrierProfile.create({ data: { userId: u.id, companyName: `W8B ${n} ${stamp}` } });
  if (!seedCarrierUser) seedCarrierUser = u.id;
  return prisma.loadTender.create({
    data: {
      loadId, carrierId: p.id, offeredRate: 4100,
      expiresAt: new Date(Date.now() + 7.2e6),
      status: status as never,
      ...extra,
    },
  });
}

const history = (tenderId: string) =>
  prisma.loadActivity.findMany({ where: { tenderId }, orderBy: { createdAt: "asc" } });

const after = (id: string) => prisma.loadTender.findUniqueOrThrow({ where: { id } });

async function main() {
  const poster = await prisma.user.create({
    data: { email: `w8b-ae-${stamp}@srl.invalid`, passwordHash: "x", firstName: "A", lastName: "E", role: "BROKER" },
  });
  posterId = poster.id;

  // 1. the gap it closes: a COUNTERED sibling is live and must be withdrawn
  console.log("\n[1] OFFERED and COUNTERED siblings both come off");
  const l1 = await makeLoad("W8B-A");
  const winner = await makeTender(l1.id, "OFFERED");
  const offered = await makeTender(l1.id, "OFFERED");
  const countered = await makeTender(l1.id, "COUNTERED", { counterRate: 4500 });
  const declined = await makeTender(l1.id, "DECLINED", { declineReason: "rate too low" });
  const expired = await makeTender(l1.id, "EXPIRED");
  const deleted = await makeTender(l1.id, "OFFERED", { deletedAt: new Date() });

  const r1 = await withdrawLiveTenders(
    { loadId: l1.id, exceptTenderId: winner.id, reason: "load_covered", actor: { id: poster.id, type: "USER" } },
  );

  ok("the OFFERED sibling is withdrawn", (await after(offered.id)).status === "WITHDRAWN");
  const counteredAfter = await after(countered.id);
  ok("THE COUNTERED SIBLING IS WITHDRAWN -- the gap the six copies all had",
     counteredAfter.status === "WITHDRAWN", `countered is ${counteredAfter.status}`);
  ok("the winner is untouched", (await after(winner.id)).status === "OFFERED");
  ok("an already-declined tender is not rewritten", (await after(declined.id)).status === "DECLINED");
  ok("an already-expired tender is not rewritten", (await after(expired.id)).status === "EXPIRED");
  ok("a soft-deleted tender is left alone", (await after(deleted.id)).status === "OFFERED");
  ok("the count is what moved, not what matched", r1.count === 2, `count=${r1.count}`);

  const w1 = await after(offered.id);
  ok("the coded reason is on the row", w1.statusReason === "load_covered");
  ok("respondedAt stays null -- nobody responded", w1.respondedAt === null);

  // 2. history
  console.log("\n[2] every withdraw leaves a transition row");
  const h = await history(countered.id);
  ok("one history row for the countered sibling", h.length === 1, `rows=${h.length}`);
  const meta = (h[0]?.metadata ?? {}) as Record<string, unknown>;
  ok("it records the true FROM state, not a guess", meta.from === "COUNTERED", `from=${meta.from}`);
  ok("it records TO=WITHDRAWN", meta.to === "WITHDRAWN");
  ok("it records the coded reason", meta.reason === "load_covered");
  ok("the actor is the AE who accepted", h[0]?.actorId === poster.id && h[0]?.actorType === "USER");
  ok("the row is linked to its tender", h[0]?.tenderId === countered.id);
  ok("no history was written for the untouched winner", (await history(winner.id)).length === 0);

  // 3. atomicity
  console.log("\n[3] inside a transaction, tender and history commit together");
  const l2 = await makeLoad("W8B-B");
  const t2 = await makeTender(l2.id, "OFFERED");
  await prisma.$transaction(async (tx) => {
    await withdrawLiveTenders({ loadId: l2.id, reason: "load_cancelled" }, tx);
  });
  ok("the tender moved", (await after(t2.id)).status === "WITHDRAWN");
  ok("the history row is there after the commit", (await history(t2.id)).length === 1);

  // The ROLLBACK case is what actually detects an unthreaded `db` here, and it
  // is worth saying why the commit case does not. In createTender the tender is
  // itself new inside the transaction, so a history row written on the shared
  // client points at an invisible row and Postgres rejects it (§13.3, commit
  // 6b). Withdrawing is different: the tender already exists and is committed,
  // so the foreign key holds either way and the row lands. The only thing that
  // separates them is whether it survives a rollback. Verified by injection:
  // dropping the `db` argument leaves [3] green and turns [4] red.
  console.log("\n[4] a rolled-back transaction leaves nothing behind");
  const l3 = await makeLoad("W8B-C");
  const t3 = await makeTender(l3.id, "OFFERED");
  try {
    await prisma.$transaction(async (tx) => {
      await withdrawLiveTenders({ loadId: l3.id, reason: "ae_withdrew" }, tx);
      throw new Error("deliberate rollback");
    });
  } catch { /* expected */ }
  ok("the tender is still live", (await after(t3.id)).status === "OFFERED");
  ok("and no orphan history row survived", (await history(t3.id)).length === 0);

  // 5. scope and options
  console.log("\n[5] scope, soft delete, idempotence, refusal");
  const l4 = await makeLoad("W8B-D");
  const t4 = await makeTender(l4.id, "OFFERED");
  await withdrawLiveTenders({ loadId: l4.id, reason: "load_cancelled", softDelete: true });
  const a4 = await after(t4.id);
  ok("softDelete: true also soft-deletes", a4.deletedAt !== null);
  ok("the default does NOT soft-delete", (await after(offered.id)).deletedAt === null,
     "hiding a tender from a carrier's own history is right only when the load is gone");

  const again = await withdrawLiveTenders({ loadId: l1.id, exceptTenderId: winner.id, reason: "load_covered" });
  ok("a second call withdraws nothing", again.count === 0, `count=${again.count}`);

  let refused = false;
  try { await withdrawLiveTenders({ reason: "ae_withdrew" } as never); } catch { refused = true; }
  ok("it refuses a call with no scope at all", refused,
     "an unscoped updateMany here would withdraw every live tender in the database");

  const l5 = await makeLoad("W8B-E");
  const wf = await prisma.waterfall.create({ data: { loadId: l5.id, mode: "manual", status: "active" } });
  const seed = await makeTender(l5.id, "OFFERED");
  const pos = await prisma.waterfallPosition.create({
    data: { waterfallId: wf.id, position: 1, carrierId: seed.carrierId, status: "tendered" },
  });
  const inPos = await makeTender(l5.id, "OFFERED", { waterfallPositionId: pos.id });
  const r5 = await withdrawLiveTenders({ waterfallPositionId: pos.id, reason: "position_skipped" });
  ok("position scope withdraws only that position", r5.count === 1 && (await after(inPos.id)).status === "WITHDRAWN",
     `count=${r5.count}`);
  ok("a tender elsewhere on the same load is untouched", (await after(seed.id)).status === "OFFERED");

  // 6. settleTender / settleTenders — the rest of the consolidation (8c)
  console.log("\n[6] single and bulk settles, and who is allowed to decline");
  const l6 = await makeLoad("W8B-F");
  const t6 = await makeTender(l6.id, "OFFERED");

  // The `from` rail: a settle that names a state the tender is no longer in
  // moves nothing, rather than overwriting whatever happened first.
  const stale = await settleTender({ tenderId: t6.id, to: "ACCEPTED", from: "COUNTERED" });
  ok("a settle naming the wrong FROM state moves nothing", stale.count === 0 && (await after(t6.id)).status === "OFFERED",
     "an accept that raced a decline must settle nothing, not overwrite it");

  await settleTender({
    tenderId: t6.id, to: "DECLINED", from: "OFFERED",
    declineReason: "rate too low", respondedAt: new Date(),
    actor: { id: seedCarrierUser, type: "CARRIER" },
  });
  const d6 = await after(t6.id);
  ok("a carrier decline lands with its reason", d6.status === "DECLINED" && d6.declineReason === "rate too low");
  const h6 = await history(t6.id);
  ok("and it left one transition row", h6.length === 1, `rows=${h6.length}`);
  ok("recorded as the carrier's own, not on-behalf",
     ((h6[0]?.metadata ?? {}) as Record<string, unknown>).onBehalf === false);

  // The case the file-level allow-list could not see.
  const l7 = await makeLoad("W8B-G");
  const t7 = await makeTender(l7.id, "OFFERED");
  let refusedDecline = false;
  try {
    await settleTender({ tenderId: t7.id, to: "DECLINED", actor: { id: posterId, type: "USER" } });
  } catch (e) { refusedDecline = (e as { code?: string }).code === "DECLINE_NOT_CARRIER_INITIATED"; }
  ok("an AE cannot silently record a decline as the carrier's own", refusedDecline);
  ok("and the tender is untouched by the refusal", (await after(t7.id)).status === "OFFERED");

  await settleTender({
    tenderId: t7.id, to: "DECLINED", onBehalf: true,
    actor: { id: posterId, type: "USER" },
  });
  const h7 = await history(t7.id);
  ok("an AE may record one the carrier gave, marked as on-behalf",
     ((h7[0]?.metadata ?? {}) as Record<string, unknown>).onBehalf === true);

  // The expiry sweep, which never wrote history at all before this.
  const l8 = await makeLoad("W8B-H");
  const t8a = await makeTender(l8.id, "OFFERED");
  const t8b = await makeTender(l8.id, "COUNTERED");
  const r8 = await settleTenders({ tenderIds: [t8a.id, t8b.id], to: "EXPIRED", reason: "ttl_elapsed", respondedAt: new Date() });
  ok("a bulk expire moves both", r8.count === 2, `count=${r8.count}`);
  ok("and each one now leaves a trace it never used to",
     (await history(t8a.id)).length === 1 && (await history(t8b.id)).length === 1);

  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail) process.exitCode = 1;
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1; })
  .finally(async () => {
    for (const id of madeLoads) {
      await prisma.loadActivity.deleteMany({ where: { loadId: id } });
      await prisma.loadTender.deleteMany({ where: { loadId: id } });
      await prisma.waterfallPosition.deleteMany({ where: { waterfall: { loadId: id } } });
      await prisma.waterfall.deleteMany({ where: { loadId: id } });
      await prisma.load.delete({ where: { id } }).catch(() => {});
    }
    await prisma.carrierProfile.deleteMany({ where: { companyName: { contains: `${stamp}` } } });
    await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@srl.invalid` } } });
    await prisma.$disconnect();
  });
