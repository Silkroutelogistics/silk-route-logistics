/**
 * PO integrity (ruled 2026-09-26): the invoice prints its PO from the load
 * record only, never from a manual fill-in. A load with no PO prints
 * "PO: none on file" and a warning is logged.
 *
 * Asserted on the rendered text. Two delivered BKN packets printed POs their
 * own loads do not hold (TO3665 on 121492I, PO1861 on 121494I), both through a
 * hand-filled template, so the property that matters is what reaches the page.
 */
import { describe, it, expect, vi, afterEach } from "vitest";
import { generateInvoicePDF } from "../../../src/services/pdfService";
import { log } from "../../../src/lib/logger";
import { INVOICE_FIXTURE } from "../../fixtures/pdfPinFixtures";

async function render(over: Record<string, unknown>, loadOver: Record<string, unknown>) {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = generateInvoicePDF({
    ...(INVOICE_FIXTURE as any),
    createdAt: new Date("2026-09-26"),
    srlDocNumber: "121498I",
    ...over,
    load: { ...(INVOICE_FIXTURE as any).load, referenceNumber: "121498", loadNumber: "121498", ...loadOver },
  } as any);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  await new Promise<void>((r) => doc.on("end", () => r()));
  const d = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(chunks)) }).promise;
  let t = "";
  for (let p = 1; p <= d.numPages; p++) for (const i of (await (await d.getPage(p)).getTextContent()).items as any[]) t += i.str + " ";
  return { text: t.replace(/\s+/g, " "), pages: d.numPages as number };
}

// Values a caller could hand the renderer that are NOT the load's PO list.
const NOT_THE_PO = {
  invoice: { poNumber: "FILLIN-9001", bill_to: { po_number: "V3FILL-9005" } },
  load: { shipperReference: "SHIPREF-9002", customerRef: "CUSTREF-9003", shipperPoNumber: "SPO-9004" },
};
const NOT_THE_PO_STRINGS = ["FILLIN-9001", "V3FILL-9005", "SHIPREF-9002", "CUSTREF-9003", "SPO-9004"];

describe("the PO an invoice prints", () => {
  // Restore only the spy this suite installs (see __tests__/unit/ci/noRestoreAllMocks.test.ts).
  afterEach(() => (log.warn as unknown as { mockRestore?: () => void }).mockRestore?.());

  it("prints the load's PO", async () => {
    const warn = vi.spyOn(log, "warn");
    const { text } = await render({}, { poNumbers: ["TO3667"] });
    expect(text.length, "extraction is not vacuous").toBeGreaterThan(200);
    expect(text).toContain("PO: TO3667");
    expect(warn).not.toHaveBeenCalled();
  }, 60_000);

  it("joins every PO on the load", async () => {
    const { text } = await render({}, { poNumbers: ["PO1861", "PO1862", "PO1863"] });
    expect(text).toContain("PO: PO1861, PO1862, PO1863");
  }, 60_000);

  it("a load with no PO says so on the page and logs a warning", async () => {
    const warn = vi.spyOn(log, "warn");
    const { text } = await render({}, { poNumbers: [] });
    expect(text).toContain("PO: none on file");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][1])).toContain("no PO on the load record");
  }, 60_000);

  it("a missing list, or blank entries, count as no PO", async () => {
    for (const poNumbers of [null, undefined, ["  ", ""]]) {
      const { text } = await render({}, { poNumbers });
      expect(text, JSON.stringify(poNumbers)).toContain("PO: none on file");
    }
  }, 60_000);

  it("never prints a hand fill-in or another reference column, with or without a PO", async () => {
    const none = await render(NOT_THE_PO.invoice, { ...NOT_THE_PO.load, poNumbers: [] });
    expect(none.text).toContain("PO: none on file");
    const withPo = await render(NOT_THE_PO.invoice, { ...NOT_THE_PO.load, poNumbers: ["TO3667"] });
    expect(withPo.text).toContain("PO: TO3667");
    for (const s of NOT_THE_PO_STRINGS) {
      expect(none.text.includes(s), `${s} printed on an invoice with no PO`).toBe(false);
      expect(withPo.text.includes(s), `${s} printed beside the load's PO`).toBe(false);
    }
  }, 60_000);

  it("a load with many POs still prints them all on one page", async () => {
    const many = Array.from({ length: 12 }, (_, i) => `PO-${String(700100 + i)}`);
    const { text, pages } = await render({}, { poNumbers: many });
    expect(pages).toBe(1);
    for (const po of many) expect(text.includes(po), po).toBe(true);
  }, 60_000);
});
