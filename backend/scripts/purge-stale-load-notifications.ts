/**
 * v3.8.arc — purge notifications about loads that no longer exist operationally.
 *
 * All three generators are now fixed and quiet (check-call dedup + soft-delete
 * filtering in aqv/aqw, risk-cron guards in ali/alj). What remains in the bell
 * is accumulated BACKLOG from before those fixes — floods fired against test
 * loads that were soft-deleted in the July cleanup.
 *
 * Scope is deliberately narrow and evidence-based: a notification is removed
 * only when its message references the referenceNumber of a load that is
 * SOFT-DELETED. Notifications about live loads are never touched, regardless of
 * type or age. Non-load notifications (password expiry, onboarding, payments,
 * invoices) are never touched.
 *
 * DRY RUN by default. Pass --apply to delete.
 */
import { prisma } from "../src/config/database";

async function main() {
  const apply = process.argv.includes("--apply");

  const deletedLoads = await prisma.load.findMany({
    where: { deletedAt: { not: null } },
    select: { referenceNumber: true },
  });
  const liveLoads = await prisma.load.findMany({
    where: { deletedAt: null },
    select: { referenceNumber: true },
  });
  const deadRefs = deletedLoads.map((l) => l.referenceNumber).filter(Boolean) as string[];
  const liveRefs = new Set(liveLoads.map((l) => l.referenceNumber).filter(Boolean) as string[]);

  console.log(`Soft-deleted loads: ${deadRefs.length}   Live loads: ${liveRefs.size}`);
  if (liveRefs.size) console.log(`  live (never purged): ${[...liveRefs].join(", ")}`);
  if (!deadRefs.length) { console.log("Nothing to do."); await prisma.$disconnect(); return; }

  const total = await prisma.notification.count();
  // Match on message OR title — the flood titles embed the ref too.
  const where = {
    OR: deadRefs.flatMap((ref) => [
      { message: { contains: ref } },
      { title: { contains: ref } },
    ]),
  };
  const targeted = await prisma.notification.count({ where });

  console.log(`\nNotifications total: ${total}`);
  console.log(`Referencing a soft-deleted load: ${targeted}`);
  console.log(`Would remain: ${total - targeted}`);

  const sample = await prisma.notification.findMany({
    where, select: { type: true, title: true, createdAt: true },
    orderBy: { createdAt: "desc" }, take: 5,
  });
  console.log("\nnewest targeted:");
  for (const s of sample) console.log(`  ${s.createdAt.toISOString()} [${s.type}] ${s.title}`);

  if (!apply) { console.log("\nDRY RUN — nothing deleted. Re-run with --apply."); await prisma.$disconnect(); return; }

  let removed = 0;
  for (;;) {
    const batch = await prisma.notification.findMany({ where, select: { id: true }, take: 5000 });
    if (!batch.length) break;
    const res = await prisma.notification.deleteMany({ where: { id: { in: batch.map((b) => b.id) } } });
    removed += res.count;
    console.log(`  …deleted ${removed}/${targeted}`);
  }
  console.log(`\nDone. Removed ${removed}. Table now: ${await prisma.notification.count()} rows.`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("FAILED:", e?.message ?? e); await prisma.$disconnect(); process.exit(1); });
