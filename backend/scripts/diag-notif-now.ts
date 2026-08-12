import { prisma } from "../src/config/database";
// Deploy that fixed the check-call flood went live 2026-08-12T09:48:38Z
const FIX = new Date("2026-08-12T09:48:38Z");
async function main(){
  const now = new Date();
  console.log(`now=${now.toISOString()}  fix deployed=${FIX.toISOString()}\n`);
  const rows = await prisma.notification.findMany({
    select:{ type:true, title:true, message:true, createdAt:true, read:true },
    orderBy:{ createdAt:"desc" }, take:40,
  });
  console.log(`Total notifications in table: ${await prisma.notification.count()}`);
  const byType = await prisma.notification.groupBy({ by:["type"], _count:true });
  for(const t of byType) console.log(`  ${String(t.type).padEnd(18)} ${t._count}`);

  console.log(`\n--- created AFTER the fix (these are NEW generation) ---`);
  const after = rows.filter(r=>r.createdAt>FIX);
  if(!after.length) console.log("  (none)");
  for(const r of after) console.log(`  ${r.createdAt.toISOString()} [${r.type}] ${r.title} :: ${r.message.slice(0,70)}`);

  console.log(`\n--- 10 most recent overall ---`);
  for(const r of rows.slice(0,10)) console.log(`  ${r.createdAt.toISOString()} ${r.createdAt>FIX?"NEW ":"pre "} [${r.type}] ${r.title}`);

  // Is the risk engine repeating on the same load?
  const risk = rows.filter(r=>String(r.type).includes("RISK")||r.title.startsWith("Risk"));
  console.log(`\nRisk notifications in last 40: ${risk.length}`);
  for(const r of risk) console.log(`  ${r.createdAt.toISOString()} ${r.title}`);
  await prisma.$disconnect();
}
main().catch(async(e)=>{console.error("FAILED:",e?.message);await prisma.$disconnect();process.exit(1);});
