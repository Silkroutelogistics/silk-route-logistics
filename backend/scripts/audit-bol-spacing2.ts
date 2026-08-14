import { generateBOLFromLoad } from "../src/services/pdfService";
const load: any = {
  id:"t", referenceNumber:"SRL-121488", loadNumber:"SRL-121488",
  originCompany:"Virun", originAddress:"1750 North 8th Street", originCity:"Colton", originState:"CA", originZip:"92324",
  originContactName:"Monika Pape", destCompany:"Mainfreight North Lake",
  destAddress:"17801 Interstate 35 West Service Road", destCity:"Northlake", destState:"TX", destZip:"76262",
  pickupDate:new Date("2026-08-13"), deliveryDate:new Date("2026-08-17"),
  equipmentType:"Dry Van 53'", commodity:"Liposomal Suppliments", weight:16500, pieces:26,
  specialInstructions:"Driver Assist is Needed", poNumbers:["PO1770"],
  lineItems:[{lineNumber:1,pieces:26,packageType:"PLT",description:"Liposomal Suppliments",weight:16500,freightClass:"50",lengthIn:48,widthIn:40,heightIn:52,hazmat:false}],
  carrier:null, customer:{name:"Beekeepers Naturals USA Inc."}, driver:null,
};
(async()=>{
  const doc = await generateBOLFromLoad(load, { trackingToken:"TESTTOKEN123" });
  const chunks:Buffer[]=[]; doc.on("data",(c:Buffer)=>chunks.push(c));
  await new Promise<void>(r=>doc.on("end",()=>r()));
  const buf=Buffer.concat(chunks);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const d = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const page = await d.getPage(1);
  const tc = await page.getTextContent();
  // group items into y-bands (1.5pt tolerance), join fragments left→right
  const bands = new Map<number, {x:number,s:string}[]>();
  for(const it of tc.items as any[]){
    const y = Math.round((792 - it.transform[5])*2)/2;
    const s = String(it.str); if(!s.trim()) continue;
    let key = [...bands.keys()].find(k=>Math.abs(k-y)<=1.5);
    if(key===undefined){ key=y; bands.set(key,[]); }
    bands.get(key)!.push({x: it.transform[4], s});
  }
  const rows = [...bands.entries()].sort((a,b)=>a[0]-b[0])
    .map(([y,items])=>({ y, text: items.sort((a,b)=>a.x-b.x).map(i=>i.s).join("").replace(/\s+/g," ").trim().slice(0,72) }));
  let prev=0;
  for(const r of rows){ console.log(String(r.y).padStart(6)+String(Math.round((r.y-prev)*10)/10).padStart(8)+"  "+r.text); prev=r.y; }
})().catch(e=>{console.error("FAILED:",e?.message??e);process.exit(1);});
