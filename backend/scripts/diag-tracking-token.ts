import { prisma } from "../src/config/database";
async function main() {
  const loads = await prisma.load.findMany({
    select: { referenceNumber: true, status: true, trackingToken: true, shipperCode: true, createdAt: true },
    orderBy: { createdAt: "desc" }, take: 20,
  });
  console.log(`Loads: ${loads.length}`);
  let withTok = 0;
  for (const l of loads) {
    if (l.trackingToken) withTok++;
    console.log(`  ${String(l.status).padEnd(12)} ref=${l.referenceNumber ?? "-"}  trackingToken=${l.trackingToken ? l.trackingToken.slice(0,8)+"…" : "NULL"}  shipperCode=${l.shipperCode ?? "NULL"}`);
  }
  console.log(`\n-> ${withTok}/${loads.length} have a trackingToken populated`);
  await prisma.$disconnect();
}
main().catch(async(e)=>{console.error(e?.message);await prisma.$disconnect();process.exit(1);});
