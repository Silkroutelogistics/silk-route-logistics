/**
 * The executed agreements paginate like a document (2026-09-26).
 *
 * The executed Broker-Carrier Agreement a carrier received had three defects a
 * reader sees at once and no string check can:
 *
 *   - the last line of a paragraph alone at the top of a page ("load." opened
 *     page 10, "binding under the ESIGN Act and UETA." opened page 17);
 *   - a lead-in ending in a colon at the foot of a page with its list on the
 *     next ("Minimum coverages:" closed page 5);
 *   - a heading alone at the foot of a page, its clause on the next.
 *
 * WHY BY CONTENT. A line is identified by the source clause it belongs to, not
 * by where it sits: "the top line of this page is the END of a clause that is
 * longer than the line" can only be true of a paragraph that began on the
 * previous page. Positional grouping could not see that.
 *
 * The production path renders with the shell (carrierAuth.ts), so that is the
 * path measured here.
 */
import { describe, it, expect } from "vitest";
import { generateAgreementBuffer } from "../../../src/services/agreementPdfService";
import { BROKER_CARRIER_AGREEMENT, CARAVAN_QUICK_PAY_AGREEMENT } from "../../../src/data/agreements";
import { assembleAgreementSegments } from "../../../src/lib/canonicalAgreementText";
import { PAGE_H, SHELL_MARGIN } from "../../../src/lib/srl-chrome";
import { PIN_CARRIER, PIN_SIGNATURE } from "../../fixtures/pdfPinFixtures";

type Line = { y: number; text: string };

const squash = (s: string) =>
  s.replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, " ").trim();
const tight = (s: string) => squash(s).toUpperCase().replace(/\s+/g, "");

// The body band in PDF user space (origin bottom-left). Above it is the running
// header, below it the footer; both are excluded so the first and last lines
// found are body text.
const BODY_TOP_Y = PAGE_H - SHELL_MARGIN - 20;
const BODY_BOTTOM_Y = SHELL_MARGIN + 26;

async function pagesOf(buf: Buffer): Promise<Line[][]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const pages: Line[][] = [];
  for (let p = 2; p <= doc.numPages; p++) { // page 1 is the cover
    const tc = await (await doc.getPage(p)).getTextContent();
    const runs = (tc.items as { str: string; width: number; transform: number[] }[])
      .filter((i) => i.str.trim())
      .map((i) => ({ x: i.transform[4], y: i.transform[5], w: i.width, s: i.str }));
    const rows = new Map<number, typeof runs>();
    for (const r of runs) {
      const key = [...rows.keys()].find((k) => Math.abs(k - r.y) < 1) ?? r.y;
      rows.set(key, [...(rows.get(key) ?? []), r]);
    }
    const lines = [...rows.entries()]
      .map(([y, rs]) => {
        rs.sort((a, b) => a.x - b.x);
        // Adjacent fragments of one word are joined without a space; a real
        // gap between runs is a word break.
        let text = "";
        rs.forEach((r, i) => {
          const prev = rs[i - 1];
          text += i === 0 ? r.s : (r.x - (prev.x + prev.w) > 1 ? " " : "") + r.s;
        });
        return { y, text: squash(text) };
      })
      .filter((l) => l.y > BODY_BOTTOM_Y && l.y < BODY_TOP_Y)
      .sort((a, b) => b.y - a.y);
    pages.push(lines);
  }
  return pages;
}

const CASES = [
  { name: "Broker-Carrier Agreement", agreement: BROKER_CARRIER_AGREEMENT },
  { name: "Caravan Quick Pay Agreement", agreement: CARAVAN_QUICK_PAY_AGREEMENT },
];

describe("executed agreements paginate like a document", () => {
  for (const { name, agreement } of CASES) {
    const opts = { carrier: PIN_CARRIER, signature: PIN_SIGNATURE, shell: true } as never;
    const segments = assembleAgreementSegments(agreement, { carrier: PIN_CARRIER, signature: PIN_SIGNATURE } as never);
    const paragraphs = segments
      .filter((s) => s.kind === "clause" || s.kind === "preamble")
      .map((s) => squash(s.text));
    const headings = segments.filter((s) => s.kind === "heading").map((s) => tight(s.text));

    it(`${name}: no page opens on a paragraph's last line alone`, async () => {
      const pages = await pagesOf(await generateAgreementBuffer(agreement, opts));
      const offenders: string[] = [];
      let attributed = 0;
      pages.forEach((lines, i) => {
        const top = lines[0];
        if (!top) return;
        if (paragraphs.some((p) => p.includes(top.text)) || headings.includes(tight(top.text))) attributed++;
        const owner = paragraphs.find((p) => p.endsWith(top.text) && p.length > top.text.length);
        if (owner) offenders.push(`page ${i + 2} opens on "${top.text}", the last line of "${owner.slice(0, 60)}…"`);
      });
      // Vacuity: if extraction stopped producing matchable text, every page
      // would pass. Most page tops must be recognisable as source text.
      expect(attributed, "page tops attributable to the source").toBeGreaterThanOrEqual(Math.floor(pages.length / 2));
      expect(offenders, offenders.join("\n")).toEqual([]);
    }, 60_000);

    it(`${name}: no page ends on a heading or a lead-in whose list is overleaf`, async () => {
      const pages = await pagesOf(await generateAgreementBuffer(agreement, opts));
      const leadIns = paragraphs.filter((p) => /:$/.test(p));
      const offenders: string[] = [];
      pages.slice(0, -1).forEach((lines, i) => {
        const bottom = lines[lines.length - 1];
        if (!bottom) return;
        if (headings.includes(tight(bottom.text))) offenders.push(`page ${i + 2} ends on the heading "${bottom.text}"`);
        if (leadIns.some((p) => p.endsWith(bottom.text))) offenders.push(`page ${i + 2} ends on the lead-in "${bottom.text}"`);
      });
      if (name === "Broker-Carrier Agreement") {
        // The rule has something to act on in this document.
        expect(leadIns.length, "lead-ins in the source").toBeGreaterThan(0);
      }
      expect(offenders, offenders.join("\n")).toEqual([]);
    }, 60_000);
  }
});
