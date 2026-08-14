/**
 * Spacing audit: extract every text item's Y coordinate from the rendered BOL
 * so the layout discussion is about measured numbers, not eyeballing.
 * PDF user space: origin bottom-left; we convert to top-down (612x792 letter).
 */
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
  const items = tc.items
    .map((it:any)=>({ y: Math.round((792 - it.transform[5])*10)/10, x: Math.round(it.transform[4]), s: String(it.str).trim() }))
    .filter((i:any)=>i.s.length>0)
    .sort((a:any,b:any)=>a.y-b.y || a.x-b.x);
  // Landmarks only — first item at each distinct y band with a meaningful label
  const landmarks = ["SILK ROUTE","Bill of Lading","DATE ISSUED","PARTIES","SHIPPER · PICKUP","Virun","SHIPMENT DETAILS","PCS","TOTALS","SPECIAL INSTRUCTIONS","RELEASED VALUE","Per 49","SHIPPER · REPRESENTATIVE","SIGNATURE","PRINT NAME","PIECES TENDERED","TRAILER LOADED","By shipper","FREIGHT COUNTED","By driver / pieces","CARRIER LEGAL NAME","SEAL #","Non-negotiable","MC# 1794414","Page 1 of 1"];
  let prevY = 0;
  console.log("   Y     gap   text");
  for(const it of items){
    if(landmarks.some(l=>it.s.startsWith(l))){
      console.log(String(it.y).padStart(6) + String(Math.round((it.y-prevY)*10)/10).padStart(7) + "   " + it.s.slice(0,60));
      prevY = it.y;
    }
  }
})().catch(e=>{console.error("FAILED:",e?.message??e);process.exit(1);});
