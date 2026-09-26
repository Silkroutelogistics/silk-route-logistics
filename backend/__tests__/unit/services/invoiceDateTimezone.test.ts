/**
 * Invoice PDF dates do not depend on the host's timezone (invoicing audit G-14).
 *
 * Due, pickup and delivery dates are stored as midnight UTC. Formatted in the
 * server's local zone, a host west of UTC printed them a day early — the Phase A
 * render on an EDT machine showed Sep 21/22 for Sep 22/23. Render runs in UTC,
 * so production was correct by accident of the host; this pins the format to
 * UTC so the invoice says the same thing wherever it is generated.
 *
 * Read from the rendered bytes, with the process moved to a zone west of UTC,
 * because that is the only condition under which the defect shows.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { generateInvoicePDF } from "../../../src/services/pdfService";

const PRIOR_TZ = process.env.TZ;
beforeAll(() => { process.env.TZ = "America/Chicago"; });
afterAll(() => { if (PRIOR_TZ === undefined) delete process.env.TZ; else process.env.TZ = PRIOR_TZ; });

async function text(): Promise<string> {
  // @ts-expect-error pdf-parse ships no bundled types
  const pdfParse = (await import("pdf-parse")).default;
  const doc = generateInvoicePDF({
    invoiceNumber: "INV-1", srlDocNumber: "5001", amount: 250, status: "SENT", totalAmount: 250,
    createdAt: new Date("2026-09-23T00:00:00Z"), dueDate: new Date("2026-10-23T00:00:00Z"),
    load: {
      referenceNumber: "5001", loadNumber: "5001", originCity: "Fort Worth", originState: "TX",
      destCity: "Las Vegas", destState: "NV",
      pickupDate: new Date("2026-09-18T00:00:00Z"), deliveryDate: new Date("2026-09-22T00:00:00Z"),
      customer: { name: "Beekeepers Naturals USA Inc.", paymentTerms: "Net 30" },
    },
    lineItems: [],
  } as never);
  const chunks: Buffer[] = [];
  await new Promise<void>((res, rej) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => res());
    doc.on("error", rej);
  });
  return String((await pdfParse(Buffer.concat(chunks))).text).replace(/\s+/g, " ");
}

describe("invoice PDF dates are formatted in UTC", () => {
  it("the process really is west of UTC for this test", () => {
    expect(new Date("2026-09-23T00:00:00Z").getDate()).toBe(22);
  });

  it("issued, due, pickup and delivery print the stored calendar day", async () => {
    const t = await text();
    expect(t).toContain("Sep 23, 2026");
    expect(t).toContain("Oct 23, 2026");
    expect(t).toContain("Sep 18, 2026");
    expect(t).toContain("Sep 22, 2026");
    expect(t).not.toContain("Oct 22, 2026");
    expect(t).not.toContain("Sep 17, 2026");
  });
});
