/** READ-ONLY: scale of the CHECK_CALL_DUE notification flood */
import { prisma } from "../src/config/database";
async function main() {
  const total = await prisma.notification.count();
  const ccd = await prisma.notification.count({ where: { type: "CHECK_CALL_DUE" } });
  console.log(`Notifications total: ${total}   CHECK_CALL_DUE: ${ccd}  (${total ? Math.round(ccd/total*100) : 0}%)`);

  const unread = await prisma.notification.count({ where: { type: "CHECK_CALL_DUE", read: false } }).catch(() => -1);
  console.log(`CHECK_CALL_DUE unread: ${unread}`);

  const oldest = await prisma.notification.findFirst({ where: { type: "CHECK_CALL_DUE" }, orderBy: { createdAt: "asc" }, select: { createdAt: true, message: true } });
  const newest = await prisma.notification.findFirst({ where: { type: "CHECK_CALL_DUE" }, orderBy: { createdAt: "desc" }, select: { createdAt: true, message: true } });
  console.log(`oldest: ${oldest?.createdAt.toISOString()} :: ${oldest?.message}`);
  console.log(`newest: ${newest?.createdAt.toISOString()} :: ${newest?.message}`);

  // Which loads are driving it, and are they test/stale?
  const loads = await prisma.load.findMany({
    where: { status: { in: ["IN_TRANSIT", "DISPATCHED", "AT_PICKUP", "LOADED"] } },
    select: { id: true, referenceNumber: true, status: true, isTestAccount: true, pickupDate: true, createdAt: true, carrierId: true,
              _count: { select: { checkCalls: true } } },
  });
  console.log(`\nLoads currently matching the cron's status filter: ${loads.length}`);
  for (const l of loads) {
    const ageDays = Math.floor((Date.now() - new Date(l.pickupDate ?? l.createdAt).getTime()) / 86_400_000);
    console.log(`  ${l.referenceNumber} status=${l.status} test=${l.isTestAccount} checkCalls=${l._count.checkCalls} pickupAge=${ageDays}d carrier=${l.carrierId ? "yes" : "NONE"}`);
  }

  // How many admins receive each round?
  const admins = await prisma.user.count({ where: { role: { in: ["ADMIN", "DISPATCH"] }, isActive: true } });
  console.log(`\nActive ADMIN/DISPATCH recipients: ${admins}`);
  console.log(`=> per day: ${loads.length} loads x ${admins} admins x 288 ticks = ${loads.length * admins * 288} notifications/day`);
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("FAILED:", e?.message ?? e); await prisma.$disconnect(); process.exit(1); });
