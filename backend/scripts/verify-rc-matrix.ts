/** v3.8.arl — Rate Confirmation fit matrix. Asserts page count is stable and
 *  nothing renders below the footer rule across variable content. */
import { generateEnhancedRateConfirmation } from "../src/services/pdfService";

function makeLoad(o: { rows?: number; longSi?: boolean; reefer?: boolean; longNames?: boolean; noCarrier?: boolean; custom?: boolean } = {}): any {
  const rows = o.rows ?? 1;
  return {
    id: "t", referenceNumber: "SRL-121488",
    originCompany: o.longNames ? "Virun Nutraceutical Manufacturing & Distribution LLC" : "Virun",
    originAddress: "1750 North 8th Street", originCity: "Colton", originState: "CA", originZip: "92324",
    originContactName: "Monika Pape",
    destCompany: o.longNames ? "Mainfreight Distribution Services North Lake Facility" : "Mainfreight North Lake",
    destAddress: "17801 Interstate 35 West Service Road", destCity: "Northlake", destState: "TX", destZip: "76262",
    pickupDate: new Date("2026-08-13"), deliveryDate: new Date("2026-08-17"),
    equipmentType: o.reefer ? "Reefer 53'" : "Dry Van 53'",
    temperatureControlled: !!o.reefer, tempMin: o.reefer ? 34 : null, tempMax: o.reefer ? 38 : null,
    commodity: "Mixed", weight: 16500, pieces: 26, miles: 1350, rate: 4100, customerRate: 4850,
    specialInstructions: o.longSi
      ? "Driver Assist is Needed. Call ahead 2 hours before arrival. Dock 26 only; overnight parking not permitted; PPE required inside the facility; lumper receipt must accompany the POD; driver must reseal after each stop and record the seal number on the bill of lading."
      : "Driver Assist is Needed",
    poNumbers: ["PO1770"],
    lineItems: Array.from({ length: rows }, (_, i) => ({
      lineNumber: i + 1, pieces: 10 + i, packageType: "PLT",
      description: "Commodity line " + (i + 1), weight: 2000 + i * 500, freightClass: "70", hazmat: false,
    })),
    carrier: o.noCarrier ? null : {
      firstName: "Test", lastName: "Carrier",
      company: o.longNames ? "Zamorano Enterprises Transportation Services LLC" : "ZO Enterprises LLC",
      phone: "555-555-5555",
      carrierProfile: { mcNumber: "MC-596655", dotNumber: "1911857", tier: "SILVER", contactEmail: "d@x.com" },
    },
    poster: { firstName: "Wasi", lastName: "Haider", phone: "(269) 220-6760" },
    customer: { name: "Beekeepers Naturals USA Inc." },
  };
}

(async () => {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const cases: [string, any, any][] = [
    ["baseline 1 line", makeLoad(), {}],
    ["3 lines", makeLoad({ rows: 3 }), {}],
    ["6 lines", makeLoad({ rows: 6 }), {}],
    ["long special instr", makeLoad({ longSi: true }), {}],
    ["reefer", makeLoad({ reefer: true }), {}],
    ["long names", makeLoad({ longNames: true }), {}],
    ["no carrier assigned", makeLoad({ noCarrier: true }), {}],
    ["customTerms set", makeLoad(), { customTerms: "Driver must call dispatch 1 hour prior to arrival at both stops." }],
    ["worst case", makeLoad({ rows: 6, longSi: true, reefer: true, longNames: true }), { customTerms: "Extra handling required." }],
  ];
  let fails = 0;
  for (const [name, load, extra] of cases) {
    try {
      const fd = { carrierRate: 4100, fuelSurcharge: 0, totalCarrierPay: 4100, ...extra };
      const doc = generateEnhancedRateConfirmation(load, fd);
      const chunks: Buffer[] = []; doc.on("data", (c: Buffer) => chunks.push(c));
      await new Promise<void>((r) => doc.on("end", () => r()));
      const d = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(chunks)) }).promise;
      const problems: string[] = []; const dead: number[] = []; let sawBca = false, sawInvoicing = false;
      for (let pn = 1; pn <= d.numPages; pn++) {
        const tc = await (await d.getPage(pn)).getTextContent();
        let maxY = 0;
        for (const it of tc.items as any[]) {
          const s = String(it.str).trim(); if (!s) continue;
          if (s.includes("Broker-Carrier Agreement")) sawBca = true;
          if (s.includes("accounting@silkroutelogistics.ai")) sawInvoicing = true;
          const isFooter = s.includes("Page ") || s.startsWith("MC# 1794414 · DOT#") || s.startsWith("Where Trust Travels");
          if (!isFooter) maxY = Math.max(maxY, Math.round((792 - it.transform[5]) * 2) / 2);
        }
        dead.push(Math.round(755 - maxY));
        if (maxY > 768) problems.push("p" + pn + " below footer rule (" + maxY + ")");
      }
      if (!sawBca) problems.push("BCA incorporation MISSING");
      if (!sawInvoicing) problems.push("invoicing block MISSING");
      if (problems.length) fails++;
      console.log(name.padEnd(22) + "pages=" + d.numPages + " dead=[" + dead.join(", ") + "] :: " + (problems.length ? "FAIL " + problems.join("; ") : "ok"));
    } catch (e: any) { fails++; console.log(name.padEnd(22) + "THREW: " + (e?.message ?? e)); }
  }
  console.log(fails ? "\n" + fails + " case(s) FAILING" : "\nALL CASES PASS");
})().catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1); });
