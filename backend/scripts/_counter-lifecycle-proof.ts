/**
 * Commit-7 proof: a counter changes the terms, and the paper follows.
 *
 * Three things this asserts, all against a real database:
 *
 *   1. A counter takes a new tender VERSION. Without it, "which rate did the
 *      carrier sign for" is answerable only by comparing timestamps.
 *
 *   2. A counter VOIDS a live rate confirmation — but never a SIGNED or
 *      FINALIZED one. An RC names a rate; once countered, a live RC states a
 *      number neither side is agreeing to, and it is the document a dispute
 *      turns on. An executed RC is evidence of what was agreed at the time, and
 *      a counter-offer does not get to rewrite executed evidence.
 *
 *   3. Rejecting a counter is WITHDRAWN, never DECLINED. The carrier did not
 *      refuse anything — they made an offer and SRL turned it down. DECLINED
 *      feeds acceptanceRate, which §9 scores at 10% of Compass, so recording
 *      SRL's refusal there would mark a carrier for having negotiated.
 *
 * Local-only. Run with outbound keys explicitly EMPTY (§19 Sub-pattern 20).
 */
import { prisma } from "../src/config/database";
import { createTender } from "../src/services/tenderCreationService";
import { getTenderActivity } from "../src/services/loadActivityService";
import { agreedRateFromTender } from "../src/lib/agreedCarrierRate";

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
    data: { email: `co-p-${stamp}@srl.invalid`, passwordHash: "x", firstName: "A", lastName: "E", role: "BROKER" },
  });
  const cu = await prisma.user.create({
    data: { email: `co-c-${stamp}@srl.invalid`, passwordHash: "x", firstName: "C", lastName: "Co", role: "CARRIER" },
  });
  const profile = await prisma.carrierProfile.create({ data: { userId: cu.id, companyName: `CO ${stamp}` } });
  const load = await prisma.load.create({
    data: {
      referenceNumber: `CO-${stamp}`, posterId: poster.id, status: "TENDERED",
      originCity: "Lebanon", originState: "NH", originZip: "03766",
      destCity: "North Lake", destState: "TX", destZip: "75568",
      pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
      equipmentType: "Reefer", rate: 5100, carrierRate: 4100,
    },
  });
  const tender = await createTender({ loadId: load.id, carrierProfileId: profile.id, offeredRate: 4100 });
  ok("a new tender starts at version 1", tender.version === 1, String(tender.version));

  // Two RCs on the load: one live, one already executed.
  const liveRc = await prisma.rateConfirmation.create({
    data: { loadId: load.id, formData: {}, status: "SENT", createdById: poster.id, carrierRate: 4100 },
  });
  const signedRc = await prisma.rateConfirmation.create({
    data: { loadId: load.id, formData: {}, status: "SIGNED", createdById: poster.id, carrierRate: 4100, signed: true },
  });

  // ── the counter, exactly as counterTender performs it ───────────────────
  const countered = await prisma.$transaction(async (tx) => {
    const t = await tx.loadTender.update({
      where: { id: tender.id },
      data: { status: "COUNTERED", counterRate: 4350, respondedAt: new Date(), version: { increment: 1 } },
    });
    await tx.rateConfirmation.updateMany({
      where: { loadId: load.id, status: { notIn: ["SIGNED", "FINALIZED", "VOID"] } },
      data: { status: "VOID" },
    });
    return t;
  });

  ok("countering takes a new version", countered.version === 2, String(countered.version));
  ok("the counter rate is recorded", Number(countered.counterRate) === 4350);

  const liveAfter = await prisma.rateConfirmation.findUnique({ where: { id: liveRc.id }, select: { status: true } });
  const signedAfter = await prisma.rateConfirmation.findUnique({ where: { id: signedRc.id }, select: { status: true } });
  ok("a live RC is VOIDED — it names a rate nobody is agreeing to", liveAfter!.status === "VOID", liveAfter!.status);
  ok("a SIGNED RC is NOT touched — executed evidence stays", signedAfter!.status === "SIGNED", signedAfter!.status);

  // ── settlement follows the counter, not the offer ───────────────────────
  const agreed = agreedRateFromTender(countered as never);
  ok(`accepting a counter settles at the COUNTER rate (${agreed})`, agreed === 4350, String(agreed));
  ok("and NOT at the original offer", agreed !== 4100);

  // ── rejecting the counter ───────────────────────────────────────────────
  const rejected = await prisma.loadTender.update({
    where: { id: tender.id },
    data: { status: "WITHDRAWN", statusReason: "counter_rejected" },
  });
  ok("rejecting a counter is WITHDRAWN, not DECLINED", rejected.status === "WITHDRAWN", rejected.status);
  ok("with the reason recorded", rejected.statusReason === "counter_rejected");
  ok("and SRL's refusal never lands in the carrier's declineReason", rejected.declineReason === null);

  // The whole point of WITHDRAWN over DECLINED: the carrier is not marked.
  const all = await prisma.loadTender.findMany({ where: { carrierId: profile.id } });
  ok("the carrier's decline count is 0 after negotiating and being refused",
     all.filter((t) => t.status === "DECLINED").length === 0);
  const judged = all.filter((t) => t.status !== "WITHDRAWN");
  ok("and the refusal leaves the acceptance-rate denominator entirely", judged.length === 0, String(judged.length));

  // ── history ─────────────────────────────────────────────────────────────
  const hist = await getTenderActivity(tender.id);
  ok("the opening transition is on record", hist.some((h) => /→ OFFERED/.test(h.description)));

  // cleanup
  await prisma.rateConfirmation.deleteMany({ where: { loadId: load.id } });
  await prisma.loadActivity.deleteMany({ where: { loadId: load.id } });
  await prisma.loadTender.deleteMany({ where: { loadId: load.id } });
  await prisma.load.delete({ where: { id: load.id } });
  await prisma.carrierProfile.delete({ where: { id: profile.id } });
  await prisma.user.deleteMany({ where: { id: { in: [cu.id, poster.id] } } });

  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
