/**
 * §21.2 ruling 3 — THE INVOICE PRINTS ONE NUMBER, AND IT WAS ACTUALLY ISSUED.
 *
 * The document used to print two. The header filing slot showed a number
 * derived from the load while the meta strip and the payment reference showed
 * the invoiceNumber column, and on the accounting path those two were different
 * strings by construction: the page was headed 5001 and its wire memo read
 * INV-20260924-0001. A customer told to quote their invoice number had two to
 * choose from, and the one in the payment reference — the one they would put on
 * the wire — was the one the ruling retires.
 *
 * The render pin next door proves the invoice did not CHANGE on the pin fixture,
 * where the two columns already agreed. That is why it cannot catch this: it is
 * blind to a divergence its fixture does not contain. This asserts the rendered
 * text on fixtures built to DIVERGE, which is the only shape that can fail.
 */
import { describe, it, expect } from "vitest";
import { generateInvoicePDF } from "../../../src/services/pdfService";

const LANE = {
  originCity: "Lebanon", originState: "NH", destCity: "North Lake", destState: "TX",
  equipmentType: "Reefer", commodity: "Frozen dairy", weight: 28400,
};

async function renderText(invoice: any): Promise<string> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = generateInvoicePDF(invoice);
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

function makeInvoice(overrides: Record<string, any>) {
  return {
    amount: 5100, status: "SENT",
    createdAt: new Date("2026-09-20T09:00:00.000Z"),
    dueDate: new Date("2026-10-20T09:00:00.000Z"),
    load: { referenceNumber: "5001", loadNumber: "5001", ...LANE },
    ...overrides,
  } as any;
}

describe("the invoice prints one number", () => {
  it("prints the DOCUMENT number and not a second internal one", async () => {
    // The accounting path's old shape: a document number on the row and a
    // separate INV- sequence number beside it. Whatever the columns hold, the
    // page a customer receives must carry one reference.
    const text = await renderText(
      makeInvoice({ srlDocNumber: "5001", invoiceNumber: "INV-20260924-0001" }),
    );
    expect(text).toContain("5001");
    expect(text, "the retired internal number reached the customer's page").not.toContain(
      "INV-20260924-0001",
    );
  });

  it("A LEGACY INVOICE KEEPS ITS OWN NUMBER — it is never re-derived", async () => {
    // srlDocNumber is null on every invoice raised before the scheme existed.
    // documentNumberFor would cheerfully derive 5001I from the load here, and
    // that string was never issued to this invoice: the customer has INV-1043 in
    // their accounts-payable system and on the remittance advice they already
    // sent. Printing a derived reference on a regenerated copy would put a
    // number in front of them that exists nowhere in their records.
    const text = await renderText(
      makeInvoice({ srlDocNumber: null, invoiceNumber: "INV-1043" }),
    );
    expect(text, "a legacy invoice lost the number the customer holds").toContain("INV-1043");
    expect(text, "a reference was derived for an invoice that already had one").not.toContain(
      "5001I",
    );
  });

  it("a new invoice's two columns agree, so the page reads the same either way", async () => {
    // The mirror, seen from the document: C1a/C1b make invoiceNumber === the
    // document number on every new invoice, so there is no divergence left to
    // choose between.
    const text = await renderText(
      makeInvoice({ srlDocNumber: "5001", invoiceNumber: "5001" }),
    );
    expect(text).toContain("5001");
    expect(text).not.toContain("INV-");
  });
});
