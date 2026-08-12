import { prisma } from "../src/config/database";
async function main(){
  const rows = await prisma.notification.findMany({
    where:{ type:"LOAD_UPDATE" },
    select:{ title:true, message:true, createdAt:true },
    orderBy:{ createdAt:"desc" },
  });
  console.log(`LOAD_UPDATE total: ${rows.length}`);
  const byTitle = new Map<string,{n:number; newest:Date; oldest:Date}>();
  for(const r of rows){
    const k=r.title;
    const e=byTitle.get(k)??{n:0,newest:r.createdAt,oldest:r.createdAt};
    e.n++; if(r.createdAt>e.newest)e.newest=r.createdAt; if(r.createdAt<e.oldest)e.oldest=r.createdAt;
    byTitle.set(k,e);
  }
  console.log(`\nby title:`);
  for(const [k,v] of [...byTitle].sort((a,b)=>b[1].n-a[1].n).slice(0,12))
    console.log(`  ${String(v.n).padStart(4)}x  ${k.slice(0,52).padEnd(52)} ${v.oldest.toISOString().slice(0,10)} -> ${v.newest.toISOString().slice(0,16)}`);
  await prisma.$disconnect();
}
main().catch(async(e)=>{console.error(e?.message);await prisma.$disconnect();process.exit(1);});
