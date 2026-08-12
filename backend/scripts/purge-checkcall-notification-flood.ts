/**
 * v3.8.aqv — one-time purge of the CHECK_CALL_DUE notification flood.
 *
 * The check-call cron had no notification-level dedup: its only time window was
 * on CHECK CALLS, not on the notifications, so a load with zero check calls
 * re-notified every 5 minutes forever (288/day per admin). One stale test load
 * generated ~47k rows = 98% of the notification table over ~3 months, burying
 * every real notification in the CEO dashboard bell.
 *
 * The cron itself is fixed in the same commit (dedup + test-load exclusion +
 * 14-day staleness guard). This clears the backlog those bugs already produced.
 *
 * DEFAULT IS A DRY RUN. Nothing is deleted unless you pass --apply.
 *
 *   npx tsx scripts/purge-checkcall-notification-flood.ts             # report only
 *   npx tsx scripts/purge-checkcall-notification-flood.ts --apply     # delete
 *
 * Scope is deliberately narrow: ONLY type="CHECK_CALL_DUE". Every other
 * notification type is untouched. By default it also KEEPS the most recent 24h
 * of check-call notifications so any genuinely current alert survives; pass
 * --all to remove those too.
 */
import { prisma } from "../src/config/database";

async function main() {
  const apply = process.argv.includes("--apply");
  const all = process.argv.includes("--all");

  const cutoff = new Date(Date.now() - 24 * 3600_000);
  const where = all
    ? { type: "CHECK_CALL_DUE" }
    : { type: "CHECK_CALL_DUE", createdAt: { lt: cutoff } };

  const totalAll = await prisma.notification.count();
  const totalCcd = await prisma.notification.count({ where: { type: "CHECK_CALL_DUE" } });
  const targeted = await prisma.notification.count({ where });

  console.log("=== CHECK_CALL_DUE flood purge ===");
  console.log(`  notifications (all types): ${totalAll}`);
  console.log(`  CHECK_CALL_DUE:            ${totalCcd}  (${totalAll ? Math.round((totalCcd / totalAll) * 100) : 0}% of table)`);
  console.log(`  targeted by this run:      ${targeted}${all ? "  (--all: including last 24h)" : "  (keeping last 24h)"}`);
  console.log(`  would remain after purge:  ${totalAll - targeted}`);

  if (!apply) {
    console.log("\nDRY RUN — nothing deleted. Re-run with --apply to execute.");
    await prisma.$disconnect();
    return;
  }

  // Delete in batches so a ~47k delete can't blow up a single statement.
  let removed = 0;
  for (;;) {
    const batch = await prisma.notification.findMany({ where, select: { id: true }, take: 5000 });
    if (batch.length === 0) break;
    const res = await prisma.notification.deleteMany({ where: { id: { in: batch.map((b) => b.id) } } });
    removed += res.count;
    console.log(`  …deleted ${removed}/${targeted}`);
  }

  const after = await prisma.notification.count();
  console.log(`\nDone. Removed ${removed}. Notification table now: ${after} rows.`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e?.message ?? e);
  await prisma.$disconnect();
  process.exit(1);
});
