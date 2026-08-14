/** v3.8.arl — measured Y-map of the Rate Confirmation, both pages. */
import { generateEnhancedRateConfirmation } from "../src/services/pdfService";
const load: any = {
  id:"t", referenceNumber:"SRL-121488",
  originCompany:"Virun", originAddress:"1750 North 8th Street", originCity:"Colton", originState:"CA", originZip:"92324",
  originContactName:"Monika Pape", destCompany:"Mainfreight North Lake",
  destAddress:"17801 Interstate 35 West Service Road", destCity:"Northlake", destState:"TX", destZip:"76262",
  pickupDate:new Date("2026-08-13"), deliveryDate:new Date("2026-08-17"),
  equipmentType:"Dry Van 53'", commodity:"Liposomal Suppliments", weight:16500, pieces:26, miles:1350,
  rate:4100, customerRate:4850, specialInstructions:"Driver Assist is Needed", poNumbers:["PO1770"],
  carrier:{ firstName:"Test", lastName:"Carrier", company:"ZO Enterprises LLC", phone:"555-555-5555",
            carrierProfile:{ mcNumber:"MC-596655", dotNumber:"1911857", tier:"SILVER", contactEmail:"d@x.com" } },
  poster:{ firstName:"Wasi", lastName:"Haider", phone:"(269) 220-6760", email:"whaider@silkroutelogistics.ai" },
  customer:{ name:"Beekeepers Naturals USA Inc." },
  lineItems:[{lineNumber:1,pieces:26,packageType:"PLT",description:"Liposomal Suppliments",weight:16500,freightClass:"50"}],
};
(async()=>{
  const doc = generateEnhancedRateConfirmation(load, { carrierRate:4100, fuelSurcharge:0, totalCarrierPay:4100 });
  const chunks:Buffer[]=[]; doc.on("data",(c:Buffer)=>chunks.push(c));
  await new Promise<void>(r=>doc.on("end",()=>r()));
  const buf=Buffer.concat(chunks);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const d = await pdfjs.getDocument({ data:new Uint8Array(buf) }).promise;
  console.log("PAGES:", d.numPages);
  for(let pn=1; pn<=d.numPages; pn++){
    const page = await d.getPage(pn); const tc = await page.getTextContent();
    const bands = new Map<number,{x:number,s:string}[]>();
    for(const it of tc.items as any[]){
      const y = Math.round((792-it.transform[5])*2)/2; const s=String(it.str); if(!s.trim()) continue;
      let k=[...bands.keys()].find(kk=>Math.abs(kk-y)<=1.5); if(k===undefined){k=y;bands.set(k,[]);}
      bands.get(k)!.push({x:it.transform[4],s});
    }
    const rows=[...bands.entries()].sort((a,b)=>a[0]-b[0])
      .map(([y,items])=>({y,text:items.sort((a,b)=>a.x-b.x).map(i=>i.s).join("").replace(/\s+/g," ").trim().slice(0,74)}));
    let prev=0; console.log(`\n─── PAGE ${pn} ───`);
    for(const r of rows){ console.log(String(r.y).padStart(6)+String(Math.round((r.y-prev)*10)/10).padStart(7)+"  "+r.text); prev=r.y; }
  }
})().catch(e=>{console.error("FAILED:",e?.message??e);process.exit(1);});
