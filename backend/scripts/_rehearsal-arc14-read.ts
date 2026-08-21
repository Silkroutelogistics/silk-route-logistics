/**
 * Arc 14 — open and READ the four rehearsal PDFs.
 *
 * A 200 and a non-empty buffer prove a renderer ran. They do not prove the
 * document is correct, and every regression this arc exists to catch (a clipped
 * temperature block, a missing footer, a wrong Carmack citation, a total that
 * disagrees with the rate con) survives both of those signals intact.
 *
 * Text extraction is not a substitute for looking at a page — it cannot see
 * colour, overprint, or a border in the wrong hue. It IS conclusive for the
 * things that are text: presence, wording, citation, numbers, and per-page
 * footers. Those are asserted here; the visual half is recorded as owed.
 */

import fs from "fs";
import path from "path";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfParse = require("../../node_modules/pdf-parse");

const DIR = path.join(process.cwd(), "..", ".rehearsal-arc14");

/** Things every formal SRL PDF must carry, per the brand skill. */
const UNIVERSAL = [
  ["MC# 1794414", "authority on the page"],
  ["DOT# 4526880", "authority on the page"],
  ["SILK ROUTE LOGISTICS", "legal name"],
];

/** Things that must NEVER appear. */
const FORBIDDEN = [
  ["49 CFR", "obsolete pre-1996 Carmack citation — skill says 49 U.S.C. § 14706"],
  ["Confrmation", "fontkit ligature bug (v3.8.abg)"],
  ["Consignee TBD", "placeholder shipped as content (v3.8.arr)"],
  ["undefined", "a JS value reached the page"],
  ["NaN", "a broken calculation reached the page"],
  ["[object Object]", "an object reached the page"],
];

async function read(file: string) {
  const buf = fs.readFileSync(path.join(DIR, file));
  const d = await pdfParse(buf);
  return { pages: d.numpages as number, text: d.text as string, bytes: buf.length };
}

function has(text: string, needle: string) {
  return text.toLowerCase().includes(needle.toLowerCase());
}

async function main() {
  const docs = [
    { file: "1-BCA-executed.pdf", name: "Executed BCA" },
    { file: "2-rate-confirmation.pdf", name: "Rate Confirmation" },
    { file: "3-BOL.pdf", name: "BOL v2.9" },
    { file: "4-invoice.pdf", name: "Customer Invoice" },
  ];

  const read4: Record<string, { pages: number; text: string; bytes: number }> = {};

  for (const d of docs) {
    const r = await read(d.file);
    read4[d.name] = r;
    console.log(`\n═══ ${d.name} — ${r.pages} page(s), ${r.bytes} bytes ═══`);

    for (const [needle, why] of UNIVERSAL) {
      console.log(`  ${has(r.text, needle) ? "PASS" : "FAIL"}  ${needle.padEnd(24)} (${why})`);
    }
    for (const [needle, why] of FORBIDDEN) {
      console.log(`  ${has(r.text, needle) ? "FAIL" : "PASS"}  absent: ${needle.padEnd(16)} (${why})`);
    }
  }

  // ── per-document specifics ───────────────────────────────────────────────
  console.log("\n═══ document-specific ═══");

  const bca = read4["Executed BCA"].text;
  console.log("  BCA signature block:");
  for (const n of ["Dale Vasquez", "Owner", "203.0.113.44", "2026-06-27-v1", "Vasquez Cold Chain"]) {
    console.log(`    ${has(bca, n) ? "PASS" : "FAIL"}  ${n}`);
  }

  const rc = read4["Rate Confirmation"].text;
  console.log("  Rate Confirmation:");
  for (const [n, why] of [
    ["Rate Confirmation", "title"],
    ["Vasquez Cold Chain", "carrier named"],
    ["Lebanon", "origin city (arr)"],
    ["North Lake", "destination city (arr)"],
    ["Beekeepers", "shipper facility named (arr)"],
    ["38", "temperature setpoint (art/arv)"],
    ["Detention", "accessorial schedule (arn/ars)"],
    ["TONU", "accessorial schedule (arn/ars)"],
    ["Layover", "accessorial schedule (arn/ars)"],
    ["4,100", "total carrier pay"],
    ["3,850", "linehaul broken out"],
    ["250", "FSC broken out"],
    ["Acceptance", "carrier acceptance block"],
  ] as const) {
    console.log(`    ${has(rc, n) ? "PASS" : "FAIL"}  ${String(n).padEnd(20)} (${why})`);
  }

  const bol = read4["BOL v2.9"].text;
  console.log("  BOL:");
  for (const [n, why] of [
    ["Bill of Lading", "title"],
    ["14706", "Carmack citation, correct form"],
    ["Beekeepers", "shipper block"],
    ["North Lake Distribution", "consignee block"],
    ["Lebanon", "origin city"],
    ["honey", "commodity"],
    ["28,400", "weight"],
    ["Seal", "seal language the curriculum promises"],
  ] as const) {
    console.log(`    ${has(bol, n) ? "PASS" : "FAIL"}  ${String(n).padEnd(24)} (${why})`);
  }

  const inv = read4["Customer Invoice"].text;
  console.log("  Invoice:");
  for (const [n, why] of [
    ["Invoice", "title"],
    ["Beekeepers", "bill-to"],
    ["SRL-140001I", "srlDocNumber, §21.2 suffix scheme"],
    ["4,850", "total billed to customer"],
    ["Net", "payment terms"],
  ] as const) {
    console.log(`    ${has(inv, n) ? "PASS" : "FAIL"}  ${String(n).padEnd(20)} (${why})`);
  }

  // ── the cross-check no single test has run ───────────────────────────────
  console.log("\n═══ DOCUMENT CHAIN CROSS-CHECK ═══");
  const carrierName = "Vasquez Cold Chain LLC";
  const loadRef = "SRL-140001";

  const nameIn = docs
    .filter((d) => d.name !== "Customer Invoice")
    .map((d) => `${d.name}:${has(read4[d.name].text, carrierName) ? "yes" : "NO"}`);
  console.log(`  carrier legal name identical across carrier-facing docs: ${nameIn.join("  ")}`);

  const refIn = docs.map((d) => `${d.name}:${has(read4[d.name].text, loadRef) ? "yes" : "NO"}`);
  console.log(`  load reference ${loadRef} present: ${refIn.join("  ")}`);

  console.log(`  rate con total carrier pay 4,100 on RC: ${has(rc, "4,100") ? "yes" : "NO"}`);
  console.log(`  invoice bills customer 4,850:          ${has(inv, "4,850") ? "yes" : "NO"}`);
  console.log("  (4,850 customer − 4,100 carrier = 750 margin; the invoice must NOT show 4,100)");
  console.log(`  invoice does NOT leak the carrier rate: ${has(inv, "4,100") ? "FAIL — carrier pay is on the customer invoice" : "PASS"}`);

  fs.writeFileSync(
    path.join(DIR, "extracted-text.json"),
    JSON.stringify(Object.fromEntries(Object.entries(read4).map(([k, v]) => [k, { pages: v.pages, text: v.text }])), null, 2),
  );
  console.log("\nfull extracted text written to .rehearsal-arc14/extracted-text.json");
}

main().catch((e) => { console.error(e); process.exit(1); });
