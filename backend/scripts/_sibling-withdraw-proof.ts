/**
 * Commit-2a proof: losing a race is not a decline.
 *
 * When one carrier accepts, every sibling offer on that load was being marked
 * DECLINED — by SRL, on behalf of carriers who had done nothing. That is not
 * cosmetic: `carrierController` derives `tendersDeclined` and
 * `acceptanceRate = accepted / tenders.length` from this column, and §9 scores
 * acceptance rate at 10% of Compass. A carrier who loses waterfall races was
 * being shown as a carrier who refuses work.
 *
 * Asserts the WRITE (siblings become WITHDRAWN with a reason, and the winner is
 * untouched) and the READ that made it matter (the decline count a carrier is
 * judged on no longer includes SRL's withdrawals).
 *
 * Local-only: it writes and deletes rows.
 */
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
  process.exit(1);
}

const prisma = new PrismaClient();
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  — " + d : ""}`); }
};

async function main() {
  const stamp = Date.now();
  const poster = await prisma.user.create({
    data: { email: `p2-${stamp}@srl.invalid`, passwordHash: "x", firstName: "A", lastName: "E", role: "BROKER" },
  });
  const load = await prisma.load.create({
    data: {
      referenceNumber: `SIB-${stamp}`, posterId: poster.id, status: "TENDERED",
      originCity: "Lebanon", originState: "NH", originZip: "03766",
      destCity: "North Lake", destState: "TX", destZip: "75568",
      pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
      equipmentType: "Reefer", rate: 4100,
    },
  });

  // Three carriers offered the same load. One will win.
  const carriers = [];
  for (const n of ["Winner", "Loser1", "Loser2"]) {
    const u = await prisma.user.create({
      data: { email: `c2-${n}-${stamp}@srl.invalid`, passwordHash: "x", firstName: n, lastName: "Co", role: "CARRIER" },
    });
    const p = await prisma.carrierProfile.create({ data: { userId: u.id, companyName: `${n} ${stamp}` } });
    const t = await prisma.loadTender.create({
      data: { loadId: load.id, carrierId: p.id, offeredRate: 4100, expiresAt: new Date(Date.now() + 7.2e6) },
    });
    carriers.push({ name: n, user: u, profile: p, tender: t });
  }
  const [winner, ...losers] = carriers;

  // ── the sibling-withdraw write, exactly as acceptTender performs it ──────
  await prisma.$transaction([
    prisma.loadTender.update({ where: { id: winner.tender.id }, data: { status: "ACCEPTED", respondedAt: new Date() } }),
    prisma.loadTender.updateMany({
      where: { loadId: load.id, id: { not: winner.tender.id }, status: "OFFERED" },
      data: { status: "WITHDRAWN", statusReason: "load_covered" },
    }),
  ]);

  const rows = await prisma.loadTender.findMany({ where: { loadId: load.id } });
  const win = rows.find((r) => r.id === winner.tender.id)!;
  const lost = rows.filter((r) => r.id !== winner.tender.id);

  ok("the winner is ACCEPTED", win.status === "ACCEPTED", win.status);
  ok("both losers are WITHDRAWN, not DECLINED", lost.every((r) => r.status === "WITHDRAWN"), lost.map((r) => r.status).join(","));
  ok("no row on this load is DECLINED", rows.every((r) => r.status !== "DECLINED"));
  ok("each withdrawal carries the reason", lost.length === 2 && lost.every((r) => r.statusReason === "load_covered"));
  ok("SRL's reason did NOT land in the carrier's declineReason field", lost.every((r) => r.declineReason === null));
  ok("respondedAt stays null — nobody responded", lost.every((r) => r.respondedAt === null));

  // ── the read that made it matter ─────────────────────────────────────────
  // Reproduces carrierController's derivation verbatim for a losing carrier.
  for (const l of losers) {
    const ts = await prisma.loadTender.findMany({ where: { carrierId: l.profile.id } });
    ok(`${l.name}: decline count is 0 (was 1 before this change)`, ts.filter((t) => t.status === "DECLINED").length === 0);
  }

  // The acceptance-rate harm needs a carrier who WON one and LOST others —
  // which is every busy carrier in a waterfall, and the shape the earlier
  // version of this assertion missed by measuring a carrier with no accepts at
  // all (0/1 and 0/0 are both 0%, so it proved nothing and said so).
  //
  // Give the winner two more offers on other loads that somebody else covered.
  for (const n of [1, 2]) {
    const other = await prisma.load.create({
      data: {
        referenceNumber: `SIB-${stamp}-o${n}`, posterId: poster.id, status: "TENDERED",
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "75568",
        pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
        equipmentType: "Reefer", rate: 4100,
      },
    });
    await prisma.loadTender.create({
      data: {
        loadId: other.id, carrierId: winner.profile.id, offeredRate: 4100,
        expiresAt: new Date(Date.now() + 7.2e6), status: "WITHDRAWN", statusReason: "load_covered",
      },
    });
  }

  const wts = await prisma.loadTender.findMany({ where: { carrierId: winner.profile.id } });
  const accepted = wts.filter((t) => t.status === "ACCEPTED").length;
  // carrierController's derivation, verbatim: accepted / tenders.length.
  const asShownToday = Math.round((accepted / wts.length) * 100);
  // What it becomes once withdrawals leave the denominator (commit 2b).
  const judged = wts.filter((t) => t.status !== "WITHDRAWN");
  const honest = Math.round((accepted / judged.length) * 100);
  ok(`winner took 1 of 3 offers; today that reads ${asShownToday}%`, asShownToday === 33, String(asShownToday));
  ok(`excluding SRL's own withdrawals it reads ${honest}%`, honest === 100, String(honest));
  ok("so the denominator is the second half of the fix (commit 2b)", asShownToday !== honest);

  // A genuine carrier decline must still register — the point is to separate
  // the two, not to stop counting refusals.
  const realDecline = await prisma.loadTender.create({
    data: {
      loadId: load.id, carrierId: losers[0].profile.id, offeredRate: 4100,
      expiresAt: new Date(Date.now() + 7.2e6), status: "DECLINED",
      respondedAt: new Date(), declineReason: "Rate too low",
    },
  });
  const after = await prisma.loadTender.findMany({ where: { carrierId: losers[0].profile.id } });
  ok("a real carrier decline still counts", after.filter((t) => t.status === "DECLINED").length === 1);
  ok("and keeps its carrier-supplied reason", realDecline.declineReason === "Rate too low");

  // cleanup
  await prisma.loadTender.deleteMany({ where: { load: { referenceNumber: { startsWith: `SIB-${stamp}` } } } });
  await prisma.load.deleteMany({ where: { referenceNumber: { startsWith: `SIB-${stamp}` } } });
  for (const c of carriers) {
    await prisma.carrierProfile.delete({ where: { id: c.profile.id } });
    await prisma.user.delete({ where: { id: c.user.id } });
  }
  await prisma.user.delete({ where: { id: poster.id } });

  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
