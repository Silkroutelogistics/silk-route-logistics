// NO TEMPLATE PLACEHOLDER MAY REACH THE PAGE (ruling 3).
//
// The bill of lading printed a literal `[HH:MM–HH:MM]` on any load with no
// appointment window. Measured on production 2026-09-23: 4 of 7 live loads,
// SRL-121497 among them — BOOKED, pickup 2026-09-24, BOL number SRL-121497B
// already issued. A driver reading that sees a form nobody finished, on the
// document that sends them to a dock.
//
// THIS ASSERTS THE RENDERED PAGE, not the template source. A source grep proves
// a string was deleted; only extraction proves nothing reconstructs it — the
// placeholder was built by interpolation, so a source check for the literal
// would have missed a version assembled from pieces.
//
// THE FIXTURE IS DELIBERATELY EMPTY WHERE IT MATTERS. Every field that can
// produce a placeholder is absent: no window, no contact, no facility, no
// reference numbers. A fixture with the data filled in cannot catch a
// placeholder, because none would render. This one carries the loaded gun.
//
// SCOPE, COMPLETED IN v2.10. The bracketed placeholders this guard deferred at
// C2 — `[Shipper Facility]`, `[Street Address]`, `[City, ST ZIP]` and the meta
// strip's empty cells — are gone (ruling 5), so "[" is now asserted too, along
// with the em-dash that filled every other empty cell. An empty field renders
// as space somebody can write in.
//
// "[" AND THE EM-DASH ARE BOL-ONLY. The rate confirmation is a different
// document under different rulings and its own bracket and dash use has not
// been audited here; asserting them would fail correct code. EN-dashes (–) are
// untouched on both: "Broker–Carrier Agreement" is a compound, not a placeholder.

import { describe, it, expect } from "vitest";
import { generateBOLFromLoad, generateEnhancedRateConfirmation } from "../../../src/services/pdfService";

/** Text of every page, as a reader sees it. */
async function renderedText(doc: any): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  await new Promise<void>((r) => doc.on("end", () => r()));
  const d = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(chunks)) }).promise;
  let text = "";
  for (let pn = 1; pn <= d.numPages; pn++) {
    const tc = await (await d.getPage(pn)).getTextContent();
    for (const it of tc.items as any[]) text += String(it.str);
  }
  return text;
}

/** SRL-121497's real shape: everything a placeholder could fill is missing. */
const BARE_LOAD = {
  id: "ph-load", referenceNumber: "SRL-PH0001", loadNumber: "SRL-PH0001",
  originCity: "Erlanger", originState: "KY", originZip: "41018",
  destCity: "Hebron", destState: "KY", destZip: "41048",
  originCompany: "Steuart Nutrition Kentucky",
  destCompany: "Pattern Warehouse",
  pickupDate: new Date("2026-09-24T12:00:00.000Z"),
  deliveryDate: new Date("2026-09-24T20:00:00.000Z"),
  // The whole point: no window, no contacts, no resolved contacts.
  pickupTimeStart: null, pickupTimeEnd: null,
  deliveryTimeStart: null, deliveryTimeEnd: null,
  originContactName: null, originContactPhone: null,
  destContactName: null, destContactPhone: null,
  stopContacts: null,
  rate: 4100, customerRate: 5100, carrierRate: 4100,
  equipmentType: "Reefer", commodity: "Frozen dairy", weight: 28400,
};

/**
 * Strings that mean "this template was never filled in".
 *
 * HH:MM is the one that shipped. The others are the shapes a future
 * placeholder would most plausibly take, so the guard is about the CLASS and
 * not only the instance that was found.
 */
const FORBIDDEN = [
  "HH:MM",
  "hh:mm",
  "MM/DD",
  "YYYY",
  "{{",
  "}}",
  "${",
  "TODO",
  "TBD",
  "XXX",
  "lorem",
];

async function assertNoPlaceholders(text: string, where: string) {
  for (const needle of FORBIDDEN) {
    expect(
      text.toLowerCase().includes(needle.toLowerCase()),
      `${where}: rendered text contains the template placeholder ${JSON.stringify(needle)}. ` +
        "A document handed to a driver must not show a form nobody finished.",
    ).toBe(false);
  }
}

describe("no template placeholder reaches the rendered page", () => {
  it("the extraction is not vacuous — the fixture really does render", async () => {
    const text = await renderedText(await generateBOLFromLoad(BARE_LOAD as any));
    // If extraction silently returned "", every assertion below passes for free.
    expect(text.length).toBeGreaterThan(200);
    expect(text).toContain("Steuart Nutrition Kentucky");
  }, 60_000);

  it("the bill of lading, on a load with no window and no contact", async () => {
    const text = await renderedText(await generateBOLFromLoad(BARE_LOAD as any));
    await assertNoPlaceholders(text, "BOL");
    // And it still says what it does know: the date, without a fake time.
    expect(text).toMatch(/Window:\s*\w{3},\s*\w{3}\s*\d+,\s*\d{4}/);
  }, 60_000);

  it("the bill of lading prints no bracket and no em-dash (ruling 5)", async () => {
    // Empty fields used to render either a bracketed italic label or an
    // em-dash: the contact line, every unfilled cell of the shipment table,
    // the totals row and the meta strip. Both are marks a reader has to
    // interpret. Blank is what "we do not have this" looks like, and it is
    // writable at a dock.
    const bare = await renderedText(await generateBOLFromLoad(BARE_LOAD as any));
    expect(bare, "BOL (no data) still prints a bracket").not.toContain("[");
    expect(bare, "BOL (no data) still prints an em-dash").not.toContain("\u2014");

    // Again with data, because a different set of cells fills in.
    const full = await renderedText(await generateBOLFromLoad({
      ...BARE_LOAD,
      originAddress: "18 Etna Road", destAddress: "4400 Mustang Way",
      pickupTimeStart: "08:00", pickupTimeEnd: "14:00",
      pieces: 12, freightClass: "70",
      stopContacts: {
        shipper: { name: "Dana Whitfield", phone: "603-555-0142", email: null, source: "LOAD" },
        consignee: { name: "Marcus Reyes", phone: "940-555-0188", email: null, source: "LOAD" },
      },
    } as any));
    expect(full, "BOL (populated) still prints a bracket").not.toContain("[");
    expect(full, "BOL (populated) still prints an em-dash").not.toContain("\u2014");

    // Vacuity guard: the en-dash in "Broker–Carrier Agreement" must survive, or
    // an extractor that ate every dash would make the assertions above pass.
    expect(bare, "the terms strip's en-dash should be intact").toContain("\u2013");
  }, 60_000);

  it("the rate confirmation, on the same load", async () => {
    const text = await renderedText(
      generateEnhancedRateConfirmation(BARE_LOAD as any, { rateConNumber: "SRL-PH0001R" }),
    );
    await assertNoPlaceholders(text, "RC");
  }, 60_000);

  it("a window that IS recorded renders as a real range, on both documents", async () => {
    const withWindow = {
      ...BARE_LOAD,
      pickupTimeStart: "08:00", pickupTimeEnd: "14:00",
      deliveryTimeStart: "09:00", deliveryTimeEnd: null,
    };
    const bol = await renderedText(await generateBOLFromLoad(withWindow as any));
    expect(bol).toContain("08:00 to 14:00 local");
    expect(bol).toContain("09:00 local");
    await assertNoPlaceholders(bol, "BOL with window");

    const rc = await renderedText(
      generateEnhancedRateConfirmation(withWindow as any, { rateConNumber: "SRL-PH0001R" }),
    );
    expect(rc).toContain("08:00 to 14:00 local");
    await assertNoPlaceholders(rc, "RC with window");
  }, 60_000);

  it("neither document claims a timezone it does not hold", async () => {
    const withWindow = { ...BARE_LOAD, pickupTimeStart: "08:00", pickupTimeEnd: "14:00" };
    for (const [where, text] of [
      ["BOL", await renderedText(await generateBOLFromLoad(withWindow as any))],
      ["RC", await renderedText(generateEnhancedRateConfirmation(withWindow as any, { rateConNumber: "R" }))],
    ] as const) {
      // Ruling 1: no zone is recorded anywhere, and the two states SRL ships
      // are both split-timezone, so an abbreviation could only be a guess.
      // The footer legitimately carries neither, so a whole-document scan is safe.
      expect(text, `${where} must not print a timezone abbreviation`)
        .not.toMatch(/\d{2}:\d{2}[^\n]{0,12}\b(EST|EDT|CST|CDT|MST|MDT|PST|PDT)\b/);
    }
  }, 60_000);
});
