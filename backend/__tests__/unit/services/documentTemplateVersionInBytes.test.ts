// THE DOCUMENT SAYS WHICH TEMPLATE DREW IT.
//
// Before v2.10 the BOL's template version lived only in a source comment, so a
// printed or stored BOL could not be asked which layout produced it and
// "archived BOLs stay version-faithful" was a convention nobody could check
// from the artifact. The artifact is what turns up in a dispute.
//
// THIS ASSERTS THE RENDERED PAGE, not the constant. A source check would pass
// on a constant nothing draws — which is precisely the state being fixed.
//
// IT IS ALSO THE OTHER HALF OF A PAIR. verify-bol-matrix excludes
// "Template v..." from its body-content measurement, because drawFooter draws
// it and the matrix asserts that nothing but the footer sits below the footer
// rule. An exclusion with no matching presence assertion would let the marker
// silently disappear and report health. This is that assertion.

import { describe, it, expect } from "vitest";
import { generateBOLFromLoad, generateEnhancedRateConfirmation } from "../../../src/services/pdfService";
import { BOL_TEMPLATE_VERSION, RC_TEMPLATE_VERSION } from "../../../src/lib/documentTemplateVersions";

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

const LOAD = {
  id: "tv-load", referenceNumber: "SRL-TV0001", loadNumber: "SRL-TV0001",
  originCity: "Erlanger", originState: "KY", destCity: "Hebron", destState: "KY",
  originCompany: "Steuart Nutrition Kentucky", destCompany: "Pattern Warehouse",
  pickupDate: new Date("2026-09-24T12:00:00.000Z"),
  deliveryDate: new Date("2026-09-24T20:00:00.000Z"),
  rate: 4100, customerRate: 5100, carrierRate: 4100,
  equipmentType: "Reefer", commodity: "Frozen dairy", weight: 28400, pieces: 12,
};

describe("the template version reaches the page", () => {
  it("the bill of lading names its template version", async () => {
    const text = await renderedText(await generateBOLFromLoad(LOAD as any));
    expect(text.length, "nothing extracted — assertion would be vacuous").toBeGreaterThan(200);
    expect(
      text.replace(/\s+/g, " "),
      "the BOL does not state which template drew it",
    ).toContain(`Template v${BOL_TEMPLATE_VERSION}`);
  }, 60_000);

  it("the rate confirmation names its template version", async () => {
    const text = await renderedText(
      generateEnhancedRateConfirmation(LOAD as any, { rateConNumber: "SRL-TV0001R" }),
    );
    expect(text.length, "nothing extracted — assertion would be vacuous").toBeGreaterThan(200);
    expect(
      text.replace(/\s+/g, " "),
      "the RC does not state which template drew it",
    ).toContain(`Template v${RC_TEMPLATE_VERSION}`);
  }, 60_000);

  it("the two documents do not share one version — they are separate templates", () => {
    // Guards the dual-meaning drift this module's header warns about: one
    // constant for two layouts would make a BOL bump silently restate the RC's.
    expect(BOL_TEMPLATE_VERSION).not.toBe(RC_TEMPLATE_VERSION);
  });
});
