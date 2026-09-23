// THE CONSIGNEE COLUMN CARRIES NO SECTION 7 TEXT (ruling 1).
//
// Section 7 non-recourse — "carrier shall not deliver without payment of
// freight and all other lawful charges" — is an election the CONSIGNOR makes.
// It was rendered at the bottom of the CONSIGNEE · RECEIVER signature column,
// which put it under the receiver's signature and implied the receiver was
// agreeing to it. That is the defect this pins closed.
//
// THIS ASSERTS POSITION, NOT JUST PRESENCE. A flat text scan cannot tell which
// column a string landed in, and the ruling is about the column. The guard
// reads each item's x from its pdfjs transform and scopes to the third
// signature column (SHIPPER x34 | CARRIER x219.3 | CONSIGNEE x404.7), so it
// keeps working under every outcome the ruling allows: the clause may later
// move into the Released Value box or the legal block without touching this
// test, and may NOT come back into this column.
//
// WHITESPACE IS SQUASHED BEFORE MATCHING, and that is load-bearing rather than
// tidiness. Labels are drawn with characterSpacing, which pdfjs extracts one
// glyph at a time — "PIECES RECEIVED" comes back as "P I E C E S  R E C E I V
// E D". The first cut of this guard matched the raw string, and its own
// vacuity check caught it failing against correct code.
//
// OUTCOME (c) SHIPPED. Neither candidate home fits, both measured here:
//   (a) Released Value box, 2nd row — fit matrix 7/7 at one page, but the box
//       grows 36->50 and the four elements below it (Per 49 U.S.C. and all
//       three signature titles) drift exactly -14pt, failing anchor parity.
//   (b) one line in the footer legal block — fails 7/7; maxContentY rises to
//       763-770 and crosses the footer rule (770) in three cases.
// Four earlier shipper-block variants failed 6, 5, 3 and 7 of 7.

import { describe, it, expect } from "vitest";
import { generateBOLFromLoad } from "../../../src/services/pdfService";

/** characterSpacing makes pdfjs emit glyph-by-glyph; compare without spaces. */
const squash = (s: string): string => s.replace(/\s+/g, "").toLowerCase();

const SECTION_7_SQUASHED = [
  "nonrecourse",
  "shallnotdeliver",
  "shallnotmakedelivery",
  "withoutpaymentoffreight",
];

/** The third signature column sits at x=404.7; the one before it at 219.3. */
const CONSIGNEE_COL_X = 400;

interface Placed { str: string; x: number; y: number }

async function placedItems(doc: any): Promise<Placed[]> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  await new Promise<void>((r) => doc.on("end", () => r()));
  const d = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(chunks)) }).promise;
  const out: Placed[] = [];
  for (let pn = 1; pn <= d.numPages; pn++) {
    const tc = await (await d.getPage(pn)).getTextContent();
    for (const it of tc.items as any[]) {
      if (typeof it.str === "string" && it.str.trim()) {
        out.push({ str: it.str, x: it.transform[4], y: it.transform[5] });
      }
    }
  }
  return out;
}

const hits = (items: Placed[]): string[] =>
  items
    .filter((i) => SECTION_7_SQUASHED.some((n) => squash(i.str).includes(n)))
    .map((i) => `x${i.x.toFixed(1)} y${i.y.toFixed(1)} ${JSON.stringify(i.str)}`);

const LOAD = {
  id: "s7-load", referenceNumber: "SRL-S70001", loadNumber: "SRL-S70001",
  originCity: "Erlanger", originState: "KY", originZip: "41018",
  destCity: "Hebron", destState: "KY", destZip: "41048",
  originCompany: "Steuart Nutrition Kentucky",
  destCompany: "Pattern Warehouse",
  originAddress: "18 Etna Road", destAddress: "4400 Mustang Way",
  pickupDate: new Date("2026-09-24T12:00:00.000Z"),
  deliveryDate: new Date("2026-09-24T20:00:00.000Z"),
  rate: 4100, customerRate: 5100, carrierRate: 4100,
  equipmentType: "Reefer", commodity: "Frozen dairy", weight: 28400, pieces: 12,
  piecesReceived: 12,
};

describe("Section 7 placement (ruling 1)", () => {
  it("the consignee column carries no Section 7 text", async () => {
    const items = await placedItems(await generateBOLFromLoad(LOAD as any));
    const consignee = items.filter((i) => i.x >= CONSIGNEE_COL_X);

    // VACUITY GUARD. If the column extraction found nothing — a changed x, a
    // renamed column, an extractor that lost positions — the assertion below
    // would pass over an empty array and prove nothing. This one has already
    // earned its place: it caught the characterSpacing split.
    expect(
      consignee.some((i) => squash(i.str).includes("piecesreceived")),
      "the consignee column was not found: this guard would pass vacuously",
    ).toBe(true);

    expect(
      hits(consignee),
      "Section 7 text is rendering in the CONSIGNEE column. It is a consignor " +
        "election; under the receiver's signature it reads as the receiver agreeing to it.",
    ).toEqual([]);
  }, 60_000);

  it("outcome (c): no Section 7 text renders anywhere on the document", async () => {
    // Pins the RULING, not the layout. A later arc that ships placement (a) or
    // (b) should turn exactly this test red and change it deliberately.
    const items = await placedItems(await generateBOLFromLoad(LOAD as any));
    expect(items.length, "nothing extracted — guard would be vacuous").toBeGreaterThan(40);

    expect(
      hits(items),
      "Section 7 text is on the page. Outcome (c) says it renders nowhere until " +
        "counsel rules on placement.",
    ).toEqual([]);
  }, 60_000);
});
