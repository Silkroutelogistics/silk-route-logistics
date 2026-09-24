/**
 * Render review PDFs for a fresh LOADBOARD load carrying every field this arc
 * fixed: both appointments, dock contacts, stop windows, pallets.
 *
 * LOCAL DATABASE ONLY. It refuses any non-local host — this writes rows, and the
 * §2.2 rail exists precisely so a write script cannot wander onto Neon. It does
 * not go through prisma-target-guard because it is not a Prisma CLI command, so
 * it carries the same check itself rather than assuming one ran.
 *
 * The load is created through createLoad — the real controller, the real
 * loadboard body shape — rather than a hand-built row, so the PDFs are rendered
 * from data that actually travelled the fixed path. A fixture written by hand
 * would prove the renderers work and nothing about the controller.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";

const url = process.env.DATABASE_URL ?? "";
const host = (() => { try { return new URL(url).host; } catch { return ""; } })();
if (!/^(127\.0\.0\.1|localhost)(:\d+)?$/.test(host)) {
  console.error(`REFUSING: DATABASE_URL host is "${host}", not local. This script WRITES.`);
  process.exit(1);
}
console.log(`[review] target : ${host} (local)`);

const OUT = path.resolve(__dirname, "../../out");
fs.mkdirSync(OUT, { recursive: true });

const prisma = new PrismaClient({ datasourceUrl: url });

/** Exactly what the Order Builder puts on the wire for a loadboard load. */
const BODY = {
  originCompany: "Steuart Nutrition Kentucky",
  originAddress: "Erlanger Road", originCity: "Erlanger", originState: "KY", originZip: "41018",
  destCompany: "Pattern Warehouse",
  destAddress: "2250 Progress Drive", destCity: "Hebron", destState: "KY", destZip: "41048",
  // Flat dock contacts — the shape C2 taught the controller to read.
  originContactName: "Carlos", originContactPhone: "(972) 490-3300",
  destContactName: "Brynn", destContactPhone: "(502) 219-3219",
  pickupDate: "2026-09-24T00:00:00.000Z",
  deliveryDate: "2026-09-25T00:00:00.000Z",
  // Window spelling with NO discriminator — the shape C3 stopped dropping.
  pickupWindowOpen: "09:00", pickupWindowClose: "10:00",
  deliveryWindowOpen: "15:30", deliveryWindowClose: "16:30",
  // Both appointments, named — C8a.
  pickupAppointment: "PU-4471", deliveryAppointment: "15160360",
  pallets: 7,
  weight: 3150, pieces: 7,
  equipmentType: "Dry Van 53'", commodity: "Wellness Supplements",
  poNumbers: ["PO1602", "PO1978"],
  customerRate: 650, carrierRate: 500, rate: 500, rateType: "FLAT",
  dispatchMethod: "loadboard", visibility: "open",
  specialInstructions: "Dock 14. Driver to check in at the guard shack.",
};

function captureRes() {
  const chunks: any[] = [];
  return {
    statusCode: 0,
    body: null as any,
    status(c: number) { (this as any).statusCode = c; return this; },
    json(b: any) { (this as any).body = b; return this; },
    setHeader() { return this; },
    _chunks: chunks,
  } as any;
}

async function main() {
  const poster = await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "BROKER"] } } });
  if (!poster) { console.error("No ADMIN/BROKER user in the local DB — run the seed first."); process.exit(1); }
  const customer = await prisma.customer.findFirst();

  const { createLoad } = await import("../src/controllers/loadController");
  const req: any = {
    body: { ...BODY, customerId: customer?.id },
    user: { id: poster.id, role: poster.role },
    params: {}, query: {}, headers: {},
  };
  const res = captureRes();
  await createLoad(req, res);
  if (res.statusCode !== 201) {
    console.error(`createLoad returned ${res.statusCode}:`, JSON.stringify(res.body));
    process.exit(1);
  }
  const loadId = res.body.id;

  const load: any = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      carrier: { select: { id: true, firstName: true, lastName: true, company: true, phone: true } },
      customer: { select: { name: true, contactName: true, email: true, phone: true, address: true, city: true, state: true, zip: true } },
      lineItems: true,
    },
  });

  // What actually landed — the point of creating through the controller.
  console.log("\n[review] persisted by the REAL create path:");
  for (const k of ["loadNumber","srlBolNumber","pickupDate","deliveryDate","pickupTimeStart","pickupTimeEnd",
                   "deliveryTimeStart","deliveryTimeEnd","pickupAppointment","deliveryAppointment",
                   "originContactName","originContactPhone","destContactName","destContactPhone","pallets","pieces"]) {
    console.log(`  ${k.padEnd(22)} = ${JSON.stringify(load[k])}`);
  }

  // Resolve the dock contacts the way the real pdfController does. Passing
  // null here would print blank Contact lines and prove nothing — the BOL reads
  // ONLY the resolved value (bho), never the raw columns.
  const { resolveStopContacts } = await import("../src/lib/stopContact");
  const stopContacts = await resolveStopContacts(load as any, prisma as any);
  console.log("\n[review] resolved stop contacts:", JSON.stringify(stopContacts));

  const { generateBOLFromLoad, generateEnhancedRateConfirmation } = await import("../src/services/pdfService");

  const bolPath = path.join(OUT, `REVIEW-${load.loadNumber}-BOL.pdf`);
  const bolDoc = await generateBOLFromLoad({ ...load, stopContacts } as any, {});
  await new Promise<void>((resolve, reject) => {
    const ws = fs.createWriteStream(bolPath);
    bolDoc.pipe(ws); // generator already called end()
    ws.on("finish", () => resolve()); ws.on("error", reject);
  });
  console.log(`\n[review] BOL -> ${bolPath}  (${fs.statSync(bolPath).size} bytes)`);

  const rcPath = path.join(OUT, `REVIEW-${load.loadNumber}-RC.pdf`);
  const rcDoc = generateEnhancedRateConfirmation({ ...load, stopContacts } as any, {
    loadNumber: load.loadNumber,
    shipperName: load.originCompany, consigneeName: load.destCompany,
    lineHaulRate: 500, totalCharges: 500, paymentTerms: "Net-30",
  });
  await new Promise<void>((resolve, reject) => {
    const ws = fs.createWriteStream(rcPath);
    rcDoc.pipe(ws); // generator already called end()
    ws.on("finish", () => resolve()); ws.on("error", reject);
  });
  console.log(`[review] RC  -> ${rcPath}  (${fs.statSync(rcPath).size} bytes)`);

  await prisma.$disconnect();
}
main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
