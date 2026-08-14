/**
 * v3.8.ark — BOL fit matrix. Renders fixtures at 1..5 line-item rows (+hazmat,
 * +long special instructions) and asserts, for each:
 *   (a) exactly one page,
 *   (b) the terms strip is BELOW all signature/checkbox content,
 *   (c) nothing except the footer renders below the footer rule (y=770),
 *   (d) the title does not collide with the meta strip.
 */
import { generateBOLFromLoad } from "../src/services/pdfService";

function makeLoad(rows: number, opts: { hazmat?: boolean; longSi?: boolean } = {}): any {
  const items = Array.from({ length: rows }, (_, i) => ({
    lineNumber: i + 1, pieces: 10 + i, packageType: "PLT",
    description: `Commodity line ${i + 1} — mixed retail goods`,
    weight: 2000 + i * 500, freightClass: "70", lengthIn: 48, widthIn: 40, heightIn: 60,
    hazmat: opts.hazmat && i === 0, hazmatUnNumber: opts.hazmat && i === 0 ? "UN1993" : undefined,
    hazmatClass: opts.hazmat && i === 0 ? "3" : undefined,
  }));
  return {
    id: "t", referenceNumber: "SRL-TEST", loadNumber: "SRL-TEST",
    originCompany: "Virun", originAddress: "1750 North 8th Street", originCity: "Colton", originState: "CA", originZip: "92324",
    originContactName: "Monika Pape", destCompany: "Mainfreight North Lake",
    destAddress: "17801 Interstate 35 West Service Road", destCity: "Northlake", destState: "TX", destZip: "76262",
    pickupDate: new Date("2026-08-13"), deliveryDate: new Date("2026-08-17"),
    equipmentType: "Dry Van 53'", commodity: "Mixed", weight: 16500, pieces: 26,
    specialInstructions: opts.longSi
      ? "Driver Assist is Needed. Call ahead 2 hours before arrival. Dock 26 only; overnight parking not permitted on premises; PPE required at all times inside the facility; lumper receipt must be submitted with POD."
      : "Driver Assist is Needed",
    poNumbers: ["PO1770"], lineItems: items, carrier: null, customer: { name: "Beekeepers" }, driver: null,
  };
}

async function renderBands(load: any) {
  const doc = await generateBOLFromLoad(load, { trackingToken: "TESTTOKEN123" });
  const chunks: Buffer[] = []; doc.on("data", (c: Buffer) => chunks.push(c));
  await new Promise<void>((r) => doc.on("end", () => r()));
  const buf = Buffer.concat(chunks);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const d = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const pages = d.numPages;
  const page = await d.getPage(1);
  const tc = await page.getTextContent();
  const bands: { y: number; s: string }[] = [];
  for (const it of tc.items as any[]) {
    const s = String(it.str).trim(); if (!s) continue;
    bands.push({ y: Math.round((792 - it.transform[5]) * 2) / 2, s });
  }
  return { pages, bands };
}

(async () => {
  const cases: [string, any][] = [
    ["1 row", makeLoad(1)],
    ["2 rows", makeLoad(2)],
    ["3 rows", makeLoad(3)],
    ["4 rows", makeLoad(4)],
    ["5 rows (overflow)", makeLoad(5)],
    ["1 row + hazmat", makeLoad(1, { hazmat: true })],
    ["3 rows + long SI", makeLoad(3, { longSi: true })],
  ];
  let fails = 0;
  for (const [name, load] of cases) {
    const { pages, bands } = await renderBands(load);
    const termsBand = bands.find((b) => b.s.startsWith("Non-negotiable straight"));
    const footerBandY = Math.max(...bands.filter((b) => b.s.includes("Page 1 of")).map((b) => b.y), 0);
    const contentBands = bands.filter((b) => !b.s.includes("Page 1 of") && !b.s.startsWith("MC# 1794414 · DOT# 4526880 · silk") && !b.s.startsWith("Where Trust Travels") && !b.s.startsWith("Non-negotiable") && !(b.s.startsWith("months.")) && !(b.s.includes("licensed property broker")));
    const maxContentY = Math.max(...contentBands.map((b) => b.y));
    const titleY = bands.find((b) => b.s === "Bill of Lading")?.y ?? 0;
    const metaLabelY = bands.find((b) => b.s.includes("DAT E I S S U E D") || b.s.replace(/\s/g, "").startsWith("DATEISSUED"))?.y ?? 999;
    const problems: string[] = [];
    if (pages !== 1) problems.push(`pages=${pages}`);
    if (!termsBand) problems.push("terms strip missing");
    else if (termsBand.y <= maxContentY) problems.push(`terms(${termsBand.y}) NOT below content(max ${maxContentY})`);
    if (maxContentY > 768) problems.push(`content below footer rule: ${maxContentY}`);
    if (metaLabelY - titleY < 24) problems.push(`title/meta gap ${Math.round((metaLabelY - titleY) * 10) / 10} < 24 (overlap)`); // 24 baseline-gap ~= 4.5pt descender-to-border clearance at the shave floor
    const status = problems.length ? `FAIL  ${problems.join("; ")}` : "ok";
    if (problems.length) fails++;
    console.log(`${name.padEnd(20)} pages=${pages} maxContentY=${maxContentY} terms=${termsBand?.y ?? "-"} title=${titleY} :: ${status}`);
  }
  console.log(fails ? `\n${fails} case(s) FAILING` : "\nALL CASES PASS");
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1); });
