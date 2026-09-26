// THE LOAD NUMBER A PAGE PRINTS (§21.2, corrected 2026-09-26). New pages print
// the bare number, a legacy load's included; a page already issued with SRL-
// keeps the reference it was issued with. Asserted on the rendered text.
import { describe, it, expect } from "vitest";
import {
  generateBOLFromLoad, generateEnhancedRateConfirmation, generateInvoicePDF, generateShipperLoadConfirmation,
} from "../../../src/services/pdfService";
import { BOL_FIXTURE, RC_FIXTURE, RC_FORM_DATA, INVOICE_FIXTURE } from "../../fixtures/pdfPinFixtures";

async function text(doc: any): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  await new Promise<void>((r) => doc.on("end", () => r()));
  const d = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(chunks)) }).promise;
  let t = "";
  for (let p = 1; p <= d.numPages; p++) for (const i of (await (await d.getPage(p)).getTextContent()).items as any[]) t += i.str;
  return t;
}
const num = (n: string) => ({ referenceNumber: n, loadNumber: n, srlBolNumber: null });
const pages = async (n: string, issued: { bol?: string; rc?: string; inv: string }) => ({
  BOL: await text(await generateBOLFromLoad({ ...BOL_FIXTURE, ...num(n), srlBolNumber: issued.bol ?? null } as any)),
  RC: await text(generateEnhancedRateConfirmation({ ...RC_FIXTURE, ...num(n) } as any, { ...RC_FORM_DATA, rateConNumber: issued.rc ?? null })),
  INV: await text(generateInvoicePDF({ ...INVOICE_FIXTURE, createdAt: new Date("2026-09-26"), srlDocNumber: issued.inv,
    load: { ...(INVOICE_FIXTURE as any).load, ...num(n) } } as any)),
  LC: await text(generateShipperLoadConfirmation({ ...RC_FIXTURE, ...num(n) } as any, {})),
});

describe("the load number printed on a document", () => {
  it("a new load prints 121498 on its BOL, RC and load confirmation, 121498I on its invoice, and no SRL-", async () => {
    const p = await pages("121498", { inv: "121498I" });
    expect(p.BOL.length, "extraction is not vacuous").toBeGreaterThan(200);
    for (const [doc, t] of Object.entries(p)) { expect(t.includes("121498"), doc).toBe(true); expect(t.includes("SRL-"), `${doc} prints SRL-`).toBe(false); }
    expect(p.INV.includes("121498I")).toBe(true);
  }, 60_000);

  it("a new page for a legacy SRL- load prints its digits and no SRL-", async () => {
    const p = await pages("SRL-121494", { inv: "121494I" });
    for (const [doc, t] of Object.entries(p)) { expect(t.includes("121494"), doc).toBe(true); expect(t.includes("SRL-"), `${doc} prints SRL-`).toBe(false); }
  }, 60_000);

  it("a page already issued with SRL- is regenerated as issued: no bare 121494 anywhere", async () => {
    const p = await pages("SRL-121494", { bol: "SRL-121494B", rc: "SRL-121494R", inv: "SRL-121494I" });
    for (const doc of ["BOL", "RC", "INV"] as const) {
      expect(p[doc].includes(`SRL-121494${doc === "INV" ? "I" : doc[0]}`), doc).toBe(true);
      expect(/(?<!SRL-)121494/.test(p[doc]), `${doc} prints a bare 121494`).toBe(false);
    }
  }, 60_000);
});
