/**
 * Commit-1 proof: LoadActivity is tender-scoped, and tender history outlives
 * the tender.
 *
 * Drives the REAL services (`logTenderTransition`, `getTenderActivity`) against
 * a REAL database — not a mock. A mocked Prisma returns whatever it is told,
 * so it can prove the code compiles and nothing about whether the column,
 * the FK rule, or the filter work.
 *
 * REFUSES to run against anything but a local throwaway database. The whole
 * point is that it writes and then deletes rows.
 *
 * Usage:
 *   DATABASE_URL=postgresql://postgres:t@localhost:55471/srl?sslmode=disable \
 *   DIRECT_URL=$DATABASE_URL npx tsx scripts/_tender-activity-proof.ts
 */
import { PrismaClient } from "@prisma/client";
import { logTenderTransition } from "../src/services/waterfallEventService";
import { getTenderActivity, getLoadActivity } from "../src/services/loadActivityService";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
  process.exit(1);
}

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (name: string, cond: boolean, detail = "") => {
  if (cond) { pass++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? "  — " + detail : ""}`); }
};

async function main() {
  // ── fixture ────────────────────────────────────────────────────────────
  const stamp = Date.now();
  const user = await prisma.user.create({
    data: { email: `proof-${stamp}@srl.invalid`, passwordHash: "x", firstName: "P", lastName: "Roof", role: "CARRIER" },
  });
  const profile = await prisma.carrierProfile.create({
    data: { userId: user.id, companyName: `Proof Carrier ${stamp}` },
  });
  const poster = await prisma.user.create({
    data: { email: `poster-${stamp}@srl.invalid`, passwordHash: "x", firstName: "A", lastName: "E", role: "BROKER" },
  });
  const load = await prisma.load.create({
    data: {
      referenceNumber: `PROOF-${stamp}`, posterId: poster.id, status: "POSTED",
      originCity: "Lebanon", originState: "NH", destCity: "North Lake", destState: "TX",
      equipmentType: "Reefer", rate: 4100, originZip: "03766", destZip: "75568",
      pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
    },
  });
  const mk = (rate: number) => prisma.loadTender.create({
    data: { loadId: load.id, carrierId: profile.id, offeredRate: rate, expiresAt: new Date(Date.now() + 7.2e6) },
  });
  const tenderA = await mk(4100);
  const tenderB = await mk(4200);

  // ── 1. transitions are written and scoped ──────────────────────────────
  await logTenderTransition({ tenderId: tenderA.id, loadId: load.id, from: null, to: "OFFERED" });
  await logTenderTransition({ tenderId: tenderA.id, loadId: load.id, from: "OFFERED", to: "ACCEPTED", actorType: "CARRIER", actorId: user.id });
  await logTenderTransition({ tenderId: tenderB.id, loadId: load.id, from: "OFFERED", to: "WITHDRAWN", reason: "load_covered" });

  const aHist = await getTenderActivity(tenderA.id);
  const bHist = await getTenderActivity(tenderB.id);
  ok("tender A history holds exactly its own 2 events", aHist.length === 2, `got ${aHist.length}`);
  ok("tender B history holds exactly its own 1 event", bHist.length === 1, `got ${bHist.length}`);
  // Tripwire on the `.every()`: an empty set satisfies it vacuously. The
  // adversarial run of this proof (tenderId write neutered) made both histories
  // empty and this assertion PASSED on nothing — a test green for a reason
  // unrelated to its name is worse than no test at all (§19 Sub-pattern 16).
  ok("no A event leaks into B", bHist.length > 0 && bHist.every((e) => e.tenderId === tenderB.id));

  // THE point of the column: before it, this was one undifferentiated list.
  const loadHist = await getLoadActivity(load.id);
  ok("the load timeline still sees all 3 (nothing was hidden)", loadHist.length === 3, `got ${loadHist.length}`);
  ok("load-level read WOULD have mixed them (proves the gap was real)",
     new Set(loadHist.map((e) => e.tenderId)).size === 2);

  // ── 2. the reason and the arrow survive ────────────────────────────────
  const withdrawn = bHist[0];
  const meta = withdrawn.metadata as Record<string, unknown>;
  ok("reason persisted in metadata", meta?.reason === "load_covered", String(meta?.reason));
  ok("from/to persisted", meta?.from === "OFFERED" && meta?.to === "WITHDRAWN");
  ok("description names the transition", /OFFERED → WITHDRAWN/.test(withdrawn.description), withdrawn.description);
  ok("eventType is the canonical one", withdrawn.eventType === "tender_transition", withdrawn.eventType);

  // ── 3. history OUTLIVES the tender (this is why SET NULL, not CASCADE) ──
  await prisma.loadTender.delete({ where: { id: tenderB.id } });
  const survivors = await prisma.loadActivity.findMany({ where: { loadId: load.id } });
  ok("deleting a tender does NOT delete its history", survivors.length === 3, `got ${survivors.length}`);
  const orphan = survivors.find((e) => e.description.includes("WITHDRAWN"));
  ok("the orphaned row survives with tenderId nulled", !!orphan && orphan.tenderId === null);
  ok("its reason is still readable after the tender is gone",
     (orphan!.metadata as Record<string, unknown>)?.reason === "load_covered");

  // ── 4. non-tender events still work (nullable is load-bearing) ─────────
  const { logLoadActivity } = await import("../src/services/loadActivityService");
  const plain = await logLoadActivity({ loadId: load.id, eventType: "check_call_done", description: "Check call" });
  ok("a load event with no tender is accepted", plain.tenderId === null);
  ok("and does not appear in any tender history", (await getTenderActivity(tenderA.id)).length === 2);

  // ── cleanup ────────────────────────────────────────────────────────────
  await prisma.loadActivity.deleteMany({ where: { loadId: load.id } });
  await prisma.loadTender.deleteMany({ where: { loadId: load.id } });
  await prisma.load.delete({ where: { id: load.id } });
  await prisma.carrierProfile.delete({ where: { id: profile.id } });
  await prisma.user.deleteMany({ where: { id: { in: [user.id, poster.id] } } });

  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
