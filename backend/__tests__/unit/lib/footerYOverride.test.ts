/**
 * drawFooter's Y is overridable, and omitting the override changes nothing.
 *
 * WHY THE OPTION EXISTS. The Bill of Lading draws its footer rule at 770; the
 * chrome default is 744. That 26pt is not a style preference — the BOL is
 * fit-gated to one page and its adaptive budget already saturates at four line
 * items, so forcing 744 would spend 30pt of a ~67pt elasticity and cost roughly
 * a row and a half of freight. The alternative was leaving the BOL drawing its
 * own footer forever, which is the drift the shared chrome exists to end.
 *
 * WHY THE DEFAULT IS ASSERTED SEPARATELY. Seven call sites omit the option and
 * must be unchanged. The render pins are the real proof — they hash the
 * decompressed content streams of every document, and all seventeen held when
 * this option landed — but a pin failing says "something moved", not "the footer
 * default changed". This names it.
 *
 * These compare POSITIONS, not bytes. PDFKit stamps a CreationDate and a
 * document ID, so two independent renders of identical content are never
 * byte-equal; the first version of this file asserted that and failed against
 * correct code.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";
import { drawFooter, registerSkillFonts, PAGE_H, MARGIN } from "../../../src/lib/srl-chrome";

const SRC = path.resolve(__dirname, "../../../src");

/**
 * The y of every text run drawn by the footer.
 *
 * NOT a byte comparison: PDFKit stamps a CreationDate and a document ID, so two
 * independent renders of identical content are never byte-equal. That is why
 * the render pins hash decompressed content streams rather than files, and why
 * the first version of this test failed against correct code.
 */
async function footerYs(opts: Parameters<typeof drawFooter>[1]): Promise<number[]> {
  const buf = await render(opts);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const d = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const tc = await (await d.getPage(1)).getTextContent();
  return (tc.items as Array<{ str: string; transform: number[] }>)
    .filter((i) => i.str.trim())
    .map((i) => Math.round(i.transform[5] * 10) / 10)
    .sort((a, b) => a - b);
}

async function render(opts: Parameters<typeof drawFooter>[1]): Promise<Buffer> {
  const doc = new PDFDocument({ size: "LETTER", margins: { top: 36, bottom: 0, left: 36, right: 36 } });
  registerSkillFonts(doc);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  drawFooter(doc, opts);
  doc.end();
  await new Promise<void>((res) => doc.on("end", () => res()));
  return Buffer.concat(chunks);
}

describe("drawFooter footerY override", () => {
  it("omitting it draws in exactly the historical position", async () => {
    // The default was PAGE_H - MARGIN - 12 before the option existed. If these
    // two ever diverge, every document that omits the option has silently moved.
    const [omitted, explicit] = await Promise.all([
      footerYs({ pageNum: 1, totalPages: 1 }),
      footerYs({ pageNum: 1, totalPages: 1, footerY: PAGE_H - MARGIN - 12 }),
    ]);
    expect(omitted.length, "the footer drew no text — the probe is broken").toBeGreaterThan(0);
    expect(omitted).toEqual(explicit);
  }, 30_000);

  it("the override actually moves the footer", async () => {
    // Vacuity tripwire. Every assertion here is satisfied by an option that is
    // accepted and ignored.
    const [dflt, moved] = await Promise.all([
      footerYs({ pageNum: 1, totalPages: 1 }),
      footerYs({ pageNum: 1, totalPages: 1, footerY: 770 }),
    ]);
    expect(dflt.length).toBeGreaterThan(0);
    expect(
      moved,
      "footerY was accepted and ignored — the option is inert",
    ).not.toEqual(dflt);
    // And it moves by the amount asked for: 770 vs 744 is 26pt UP the page,
    // which is DOWN in pdfjs bottom-up coords.
    expect(Math.round((dflt[0] - moved[0]) * 10) / 10).toBe(26);
  }, 30_000);

  it("every existing call site still omits it", () => {
    // The byte-identity claim above only covers callers that omit the option.
    // If one starts passing it, that caller's document moved and this test is
    // the place that says so, by name, rather than a pin diff nobody can read.
    const files = [
      "services/agreementPdfService.ts",
      "services/certificatePdfService.ts",
      "services/signatureCertificateService.ts",
    ];
    const offenders: string[] = [];
    for (const rel of files) {
      const body = fs.readFileSync(path.join(SRC, rel), "utf8");
      // Multi-line calls are normal here, so scan a window past each call.
      let i = body.indexOf("drawFooter(doc");
      while (i >= 0) {
        const win = body.slice(i, i + 260);
        if (/footerY\s*:/.test(win)) offenders.push(rel);
        i = body.indexOf("drawFooter(doc", i + 1);
      }
    }
    expect(
      offenders,
      "these call sites now pass footerY — their footers have moved:\n  " + offenders.join("\n  "),
    ).toEqual([]);
  });

  it("the scanner is not vacuous (self-test)", () => {
    // If the pattern matched nothing regardless of input, the case above would
    // pass over a file that had changed entirely.
    expect(/footerY\s*:/.test("drawFooter(doc, { pageNum: 1, footerY: 770 })")).toBe(true);
    expect(/footerY\s*:/.test("drawFooter(doc, { pageNum: 1, totalPages: 1 })")).toBe(false);
    const chrome = fs.readFileSync(path.join(SRC, "lib/srl-chrome.ts"), "utf8");
    expect(chrome, "the option is gone from the chrome").toContain("footerY?: number;");
  });
});
