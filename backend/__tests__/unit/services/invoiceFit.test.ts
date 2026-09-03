/**
 * THE INVOICE IS ONE PAGE, AND NOTHING ON IT REACHES THE FOOTER.
 *
 * The gate this document never had. generateInvoicePDF draws linearly and
 * hardcodes `Page 1 of 1` in its footer, so an overflow does not fail, does not
 * warn, and does not even change the page count it prints: PDFKit opens a
 * second page carrying no header and no footer, and page one goes on claiming
 * to be the whole document.
 *
 * That is why this asserts the RENDERED page — extracted with pdfjs, the same
 * way verify-rc-matrix reads the Rate Confirmation — rather than any internal y
 * the renderer believes it reached. The render pin next door proves the invoice
 * did not CHANGE; this proves it FITS, and they fail for different reasons.
 *
 * 738 is the RC matrix's floor and is used here for the same reason: drawFooter
 * puts its gold rule at PAGE_H - MARGIN - 16 = 740, so 738 buys 2pt of baseline
 * clearance. maxY is the baseline of the last body line, so its descenders sit
 * below it — the threshold is deliberately not the rule itself.
 *
 * Fixtures are local and deliberately NOT the pin fixture. The pin fixture is
 * minimal on purpose; a fit test run against minimal data proves nothing about
 * the invoices anybody receives.
 */
import { describe, it, expect } from "vitest";
import { generateInvoicePDF } from "../../../src/services/pdfService";

const FOOTER_FLOOR = 738;

/** Footer text, which is allowed below the floor because it IS the footer. */
const isFooter = (s: string) =>
  s.includes("Page ") || s.startsWith("MC# 1794414 · DOT#") || s.startsWith("Where Trust Travels");

async function measure(data: any): Promise<{ pages: number; maxY: number; items: number; text: string }> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = generateInvoicePDF(data);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  await new Promise<void>((r) => doc.on("end", () => r()));
  const d = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(chunks)) }).promise;
  let maxY = 0, items = 0, text = "";
  for (let pn = 1; pn <= d.numPages; pn++) {
    const tc = await (await d.getPage(pn)).getTextContent();
    for (const it of tc.items as any[]) {
      const s = String(it.str).trim();
      if (!s) continue;
      items++; text += s + " ";
      if (isFooter(s)) continue;
      maxY = Math.max(maxY, Math.round((792 - it.transform[5]) * 2) / 2);
    }
  }
  return { pages: d.numPages, maxY, items, text };
}

const LANE = {
  originCity: "Lebanon", originState: "NH", destCity: "North Lake", destState: "TX",
  pickupDate: new Date("2026-09-04T12:00:00Z"), deliveryDate: new Date("2026-09-07T12:00:00Z"),
};

/** A real customer: long legal name, an attention line, a long street. */
const CUSTOMER = {
  name: "Granite Peak Organics Incorporated", contactName: "Dana Park",
  billingContactName: "Granite Peak Organics Incorporated — Accounts Payable",
  paymentTerms: "Net 30", billingAddress: "10 Burton Drive, Building C, Suite 400",
  billingCity: "Lebanon", billingState: "NH", billingZip: "03766",
};

const base = (over: Record<string, unknown> = {}): any => ({
  invoiceNumber: "INV-90001", srlDocNumber: "SRL-121485I", amount: 6126, status: "SENT",
  createdAt: new Date("2026-09-09T12:00:00Z"), dueDate: new Date("2026-10-09T12:00:00Z"),
  lineHaulAmount: 5940, fuelSurchargeAmount: 0, accessorialsAmount: 186, totalAmount: 6126,
  load: { referenceNumber: "SRL-121485", loadNumber: "SRL-121485", ...LANE, customer: CUSTOMER },
  ...over,
});

const items = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    type: "ACCESSORIAL",
    description: `Accessorial ${i + 1} · pre-approved at origin, receipt attached to this invoice`,
    amount: 100 + i,
  }));

/** Line items replace the structured columns, so those must be cleared. */
const withItems = (n: number, over: Record<string, unknown> = {}) =>
  base({ lineItems: items(n), lineHaulAmount: null, fuelSurchargeAmount: null,
         accessorialsAmount: null, ...over });

const CASES: [string, any][] = [
  ["structured charges, unpaid", base()],
  ["structured charges, part paid", base({ paidAmount: 2000 })],
  ["no customer at all (email-attach path)", base({ load: { referenceNumber: "SRL-121485", ...LANE } })],
  ["supplemental", base({ invoiceKind: "SUPPLEMENTAL", srlDocNumber: "SRL-121485S" })],
  ["4 line items", withItems(4)],
  ["8 line items, part paid", withItems(8, { paidAmount: 2000 })],
  ["20 line items, part paid", withItems(20, { paidAmount: 2000 })],
  ["60 line items", withItems(60)],
  ["a charge whose note wraps", base({
    lineHaulAmount: 5940,
    load: { referenceNumber: "SRL-121485", ...LANE, customer: CUSTOMER,
            originCity: "Wilkes-Barre/Scranton International Airport Industrial Park",
            destCity: "Dallas-Fort Worth Alliance Global Logistics Hub" } })],
  ["long payment terms", base({ paidAmount: 2000,
    load: { referenceNumber: "SRL-121485", ...LANE,
            customer: { ...CUSTOMER, paymentTerms: "Net 45 from receipt of a clean signed POD and lumper receipt" } } })],
];

describe("the invoice fits one page", () => {
  for (const [name, data] of CASES) {
    it(`${name}`, async () => {
      const { pages, maxY, items: n } = await measure(data);

      // Self-test. A broken extractor reports zero items and maxY 0, which would
      // satisfy every assertion below for the wrong reason.
      expect(n, "the extractor found no text — it is broken, not the document").toBeGreaterThan(30);

      expect(
        pages,
        `the invoice ran to ${pages} pages. Page 2 carries no header and no footer, ` +
          `and page 1 still prints "Page 1 of 1", so this is invisible on the document ` +
          `itself. Cap the content rather than letting it spill.`,
      ).toBe(1);

      expect(
        maxY,
        `the last body baseline is ${maxY}, at or below the footer rule at 740. ` +
          `Fix this through the layout — the floor is not the thing to move.`,
      ).toBeLessThanOrEqual(FOOTER_FLOOR);
    }, 20_000);
  }

  it("a capped charge list says so, and still bills every charge", async () => {
    const { text } = await measure(withItems(20));
    expect(text, "a capped list must tell the reader it was capped").toMatch(/further charges/);
    // 20 items at 100..119 = 2190. The total is over every charge, not the drawn ones.
    expect(text.replace(/\s+/g, "")).toContain("$2,190.00");
  }, 20_000);

  it("an uncapped list carries no overflow notice", async () => {
    // The complement. Without it, a block that ALWAYS printed the notice would
    // satisfy the assertion above.
    const { text } = await measure(withItems(3));
    expect(text).not.toMatch(/further charge/);
  }, 20_000);
});
