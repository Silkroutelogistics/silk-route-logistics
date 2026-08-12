/** READ-ONLY: what loads exist, and which are stale/test? */
import { prisma } from "../src/config/database";
async function main() {
  const loads = await prisma.load.findMany({
    select: {
      id: true, referenceNumber: true, status: true, isTestAccount: true, deletedAt: true,
      pickupDate: true, createdAt: true, carrierId: true, customerRate: true,
      customer: { select: { name: true, deletedAt: true } },
      _count: { select: { checkCalls: true, invoices: true, documents: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const ACTIVE = ["POSTED","TENDERED","BOOKED","CONFIRMED","DISPATCHED","AT_PICKUP","LOADED","IN_TRANSIT","AT_DELIVERY"];
  console.log(`Loads: ${loads.length}  (deleted: ${loads.filter(l=>l.deletedAt).length}, flagged test: ${loads.filter(l=>l.isTestAccount).length})\n`);
  for (const l of loads) {
    const base = l.pickupDate ?? l.createdAt;
    const age = Math.floor((Date.now() - new Date(base).getTime()) / 86_400_000);
    const active = ACTIVE.includes(l.status as string);
    console.log(
      `${l.deletedAt ? "[del]" : active ? "[ACTIVE]" : "[  -  ]"} ${String(l.referenceNumber).padEnd(15)} ${String(l.status).padEnd(11)} ` +
      `test=${l.isTestAccount ? "Y" : "n"} age=${String(age).padStart(3)}d cust="${l.customer?.name ?? "-"}"${l.customer?.deletedAt ? "(del)" : ""} ` +
      `inv=${l._count.invoices} docs=${l._count.documents}`
    );
  }
  console.log(`\n>>> ACTIVE + not-deleted + not-flagged (these drive crons/analytics):`);
  const live = loads.filter(l => !l.deletedAt && !l.isTestAccount && ACTIVE.includes(l.status as string));
  for (const l of live) {
    const age = Math.floor((Date.now() - new Date(l.pickupDate ?? l.createdAt).getTime()) / 86_400_000);
    console.log(`    ${l.referenceNumber} ${l.status} age=${age}d id=${l.id}`);
  }
  if (!live.length) console.log("    (none)");
  await prisma.$disconnect();
}
main().catch(async (e) => { console.error("FAILED:", e?.message ?? e); await prisma.$disconnect(); process.exit(1); });
