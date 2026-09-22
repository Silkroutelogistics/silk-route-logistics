/**
 * The compass mark PDFKit draws is the committed SVG master, and nothing else.
 *
 * `lib/srlMark.ts` carries the three <path> elements of
 * frontend/public/brand/srl-logo-fullcolour.svg as TypeScript constants so the
 * PDF chrome can draw the mark through PDFKit's native doc.path() -- a true
 * vector, exact fills, no raster and no svg-to-pdfkit dependency. A constant
 * copied from a file is a second source of truth by construction, so this test
 * pins it to the file: any divergence in a `d=` string or a fill hex goes red.
 *
 * Two halves, deliberately:
 *   1. STRUCTURAL -- the constants equal the SVG, character for character.
 *   2. BEHAVIOURAL -- drawing the mark into a real PDFDocument emits path
 *      operators and the two brand colours, and no image XObject. A pin on the
 *      strings alone would stay green if drawSrlMark stopped being called
 *      (§19 Sub-pattern 16: presence is not function).
 *
 * The SVG is read with `\r?` tolerance because core.autocrlf rewrites it on a
 * Windows checkout; the attribute VALUES are single-line and unaffected.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import PDFDocument from "pdfkit";

import { SRL_MARK_PATHS, SRL_MARK_VIEWBOX, drawSrlMark } from "../../../src/lib/srlMark";
import { TOKENS, drawCompassMark } from "../../../src/lib/srl-chrome";

const SVG = path.resolve(__dirname, "../../../../frontend/public/brand/srl-logo-fullcolour.svg");

function parseSvg(): { viewBox: string; paths: { fill: string; d: string }[] } {
  const text = fs.readFileSync(SVG, "utf8");
  const viewBox = (text.match(/viewBox="([^"]+)"/) || [])[1] ?? "";
  const paths = [...text.matchAll(/<path\s+fill="(#[0-9A-Fa-f]{6})"\s+d="([^"]+)"\s*\/>/g)].map((m) => ({
    fill: m[1].toUpperCase(),
    d: m[2],
  }));
  return { viewBox, paths };
}

async function renderToContentStream(draw: (doc: PDFKit.PDFDocument) => void): Promise<string> {
  const doc = new PDFDocument({ size: "LETTER", margin: 0, compress: false });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<void>((r) => doc.on("end", () => r()));
  draw(doc);
  doc.end();
  await done;
  return Buffer.concat(chunks).toString("latin1");
}

describe("srlMark -- the PDF compass mark is the committed SVG master", () => {
  const svg = parseSvg();

  it("the SVG master is where it is claimed to be, and parses (vacuity tripwire)", () => {
    expect(fs.existsSync(SVG), `master missing at ${SVG}`).toBe(true);
    expect(svg.viewBox).toBe("0 0 512 512");
    expect(svg.paths.length).toBeGreaterThanOrEqual(3);
    for (const p of svg.paths) {
      expect(p.d.length).toBeGreaterThan(100);
      expect(p.d, "a path with no curve commands is not this mark").toMatch(/[cC]/);
    }
  });

  it("SRL_MARK_VIEWBOX matches the SVG viewBox", () => {
    expect(svg.viewBox).toBe(`0 0 ${SRL_MARK_VIEWBOX} ${SRL_MARK_VIEWBOX}`);
  });

  it("every path's d= data and fill hex equal the SVG, in order, character for character", () => {
    expect(SRL_MARK_PATHS.length).toBe(svg.paths.length);
    svg.paths.forEach((p, i) => {
      expect(SRL_MARK_PATHS[i].fill.toUpperCase(), `path ${i} fill`).toBe(p.fill);
      expect(SRL_MARK_PATHS[i].d, `path ${i} d= diverges from the SVG master`).toBe(p.d);
    });
  });

  it("the fills are the two brand tokens the chrome already names, and nothing else", () => {
    const fills = new Set(SRL_MARK_PATHS.map((p) => p.fill.toUpperCase()));
    expect(fills).toEqual(new Set([TOKENS.navy.toUpperCase(), TOKENS.goldDark.toUpperCase()]));
    expect(TOKENS.navy.toUpperCase()).toBe("#0A2540");
    expect(TOKENS.goldDark.toUpperCase()).toBe("#BA7517");
  });

  it("drawSrlMark emits vector path operators and the exact brand fills -- no image XObject", async () => {
    const pdf = await renderToContentStream((doc) => drawSrlMark(doc, 36, 36, 72));
    expect((pdf.match(/\/Subtype\s*\/Image/g) || []).length).toBe(0);
    // The master has 49 bezier segments across its three paths (PDFKit turns
    // SVG "s" into "c" too); assert a floor well below that but far above what
    // a placeholder ring (one circle = 4 curves) or an image would emit.
    const curves = (pdf.match(/\bc\n/g) || []).length;
    expect(curves, "expected the mark's bezier operators in the content stream").toBeGreaterThan(40);
    // PDFKit writes fills as "/DeviceRGB cs r g b scn" (or "r g b rg") with the
    // channel as value/255 -- 10/255, 37/255, 64/255 for #0A2540.
    const navy = /0\.0392\d*\s+0\.1450\d*\s+0\.2509\d*\s+(scn|rg)\b/;
    const gold = /0\.7294\d*\s+0\.4588\d*\s+0\.0901\d*\s+(scn|rg)\b/;
    expect(pdf, "#0A2540 fill not found in the content stream").toMatch(navy);
    expect(pdf, "#BA7517 fill not found in the content stream").toMatch(gold);
  });

  it("drawCompassMark in srl-chrome draws THIS mark (delegation, not a leftover raster)", async () => {
    const pdf = await renderToContentStream((doc) => drawCompassMark(doc, 36, 36, 72));
    expect((pdf.match(/\/Subtype\s*\/Image/g) || []).length).toBe(0);
    expect((pdf.match(/\bc\n/g) || []).length).toBeGreaterThan(40);
  });

  it("scaling is size/viewBox and the mark occupies exactly [x, x+size] (placement contract)", async () => {
    // PDFKit writes translate and scale as two consecutive cm operators:
    //   "1 0 0 1 x y cm" then "s 0 0 s 0 0 cm", s = size/512 (72/512 = 0.140625 exactly).
    const pdf = await renderToContentStream((doc) => drawSrlMark(doc, 36, 40, 72));
    expect(pdf, "expected the placement translate").toMatch(/\b1\s+0\s+0\s+1\s+36\s+40\s+cm\b/);
    expect(pdf, "expected the size/viewBox scale").toMatch(/\b0\.140625\s+0\s+0\s+0\.140625\s+0\s+0\s+cm\b/);
  });
});
