import { generateBOLFromLoad } from "../src/services/pdfService";
import fs from "fs";
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
  const buf=Buffer.concat(chunks); fs.writeFileSync("bol-out.pdf",buf);
  const pdf=require("pdf-parse"); const d=await pdf(buf);
  console.log("PAGES:", d.numpages, d.numpages===1?"[OK one page]":"[FAIL]");
  console.log("--- extracted text (tail 900 chars) ---");
  console.log(d.text.slice(-900));
})().catch(e=>{console.error("FAILED:",e?.message??e);process.exit(1);});
