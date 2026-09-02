/**
 * Golden-render pins for the whole document suite.
 *
 * WHY THIS IS THE FIRST COMMIT OF THE BCA SHELL WORK. `lib/srl-chrome.ts` is
 * shared by eight generators across four document families -- BOL, Rate
 * Confirmation, Invoice, Settlement, both agreements, and the certificates.
 * v3.8.aru is the precedent: ONE token changed from 6-digit to 8-digit hex and
 * every panel border and every signature underline on every SRL PDF rendered
 * bright red-orange at once. Nothing failed. It was found by eye.
 *
 * A design shell is about to be ported into that library. These pins turn
 * "I did not mean to change the Quick Pay Agreement" into something CI checks
 * rather than something a person has to notice.
 *
 * WHAT IS HASHED, AND WHY IT IS NOT THE BYTES. Raw PDF bytes are NOT
 * reproducible across processes, which confirms §13.3 Item 250's conclusion --
 * but the cause is narrower than "PDFKit is nondeterministic". Two things move:
 * the random `/ID` in the trailer, and `/CreationDate`, which PDFKit writes as
 * an INDIRECT object (`/CreationDate 30 0 R` -> `30 0 obj (D:2026...)`). The
 * date is therefore not a fixed-width inline string: when it changes length or
 * content, every xref offset after it shifts, so the difference cascades far
 * beyond the timestamp itself. A regex over `/CreationDate (D:...)` matches
 * nothing at all, which is how the first version of this pin was written and
 * why it appeared stable inside one process and was unstable across two.
 *
 * So the pin hashes the DECOMPRESSED CONTENT STREAMS, in object order. Those
 * are the drawing operators -- text, coordinates, colours, lines -- and they are
 * stable across processes, verified below. Metadata, offsets and the trailer are
 * excluded, and none of them is something a shell change would alter.
 *
 * This does NOT reopen Item 250 for the RC evidence hash. A stream hash still
 * moves when PDFKit or a font is upgraded, which is right for a test and wrong
 * for a legal record that must verify years later. Canonical text remains
 * correct there. This is a test instrument.
 *
 * WHEN A PIN FAILS it is telling you a document changed. Update the golden ONLY
 * after confirming the change was intended, and say in the commit which document
 * moved and why. A pin updated reflexively is worse than no pin.
 */
import { describe, it, expect } from "vitest";
import crypto from "crypto";
import zlib from "zlib";
import fs from "fs";
import path from "path";
import type PDFDocument from "pdfkit";

import {
  generateBOLFromLoad,
  generateEnhancedRateConfirmation,
  generateInvoicePDF,
  generateSettlementPDF,
} from "../../../src/services/pdfService";
import { generateAgreementBuffer } from "../../../src/services/agreementPdfService";
import { BROKER_CARRIER_AGREEMENT, CARAVAN_QUICK_PAY_AGREEMENT } from "../../../src/data/agreements";
import {
  BOL_FIXTURE, RC_FIXTURE, RC_FORM_DATA, INVOICE_FIXTURE, SETTLEMENT_FIXTURE,
  PIN_SIGNATURE, PIN_CARRIER,
} from "../../fixtures/pdfPinFixtures";

const GOLDEN = path.resolve(__dirname, "../../fixtures/document-render-pins.json");

/** Every FlateDecode stream that inflates, keyed by object number. */
function inflatedStreams(buf: Buffer): Map<number, Buffer> {
  const out = new Map<number, Buffer>();
  const s = buf.toString("latin1");
  const re = /(\d+)\s+0\s+obj\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const sIdx = s.indexOf("stream", m.index);
    const eIdx = s.indexOf("endstream", m.index);
    if (sIdx < 0 || eIdx < 0 || eIdx < sIdx) continue;
    let start = sIdx + "stream".length;
    if (s[start] === "\r") start++;
    if (s[start] === "\n") start++;
    try { out.set(Number(m[1]), zlib.inflateSync(buf.slice(start, eIdx))); } catch { /* not a flate stream */ }
  }
  return out;
}

function pin(buf: Buffer): string {
  const m = inflatedStreams(buf);
  const h = crypto.createHash("sha256");
  for (const k of [...m.keys()].sort((a, b) => a - b)) { h.update(String(k)); h.update(m.get(k)!); }
  return h.digest("hex").slice(0, 32);
}

function collect(doc: InstanceType<typeof PDFDocument>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

/** Every pinned document, by the name that appears in the golden file. */
const DOCUMENTS: Record<string, () => Promise<Buffer>> = {
  "bol": async () => collect(await generateBOLFromLoad(BOL_FIXTURE)),
  "rate-confirmation": async () => collect(generateEnhancedRateConfirmation(RC_FIXTURE, RC_FORM_DATA)),
  "invoice": async () => collect(generateInvoicePDF(INVOICE_FIXTURE)),
  "settlement": async () => collect(generateSettlementPDF(SETTLEMENT_FIXTURE)),
  "agreement-bca": () => generateAgreementBuffer(BROKER_CARRIER_AGREEMENT, {}),
  "agreement-qp": () => generateAgreementBuffer(CARAVAN_QUICK_PAY_AGREEMENT, {}),
  "agreement-qp-executed": () =>
    generateAgreementBuffer(CARAVAN_QUICK_PAY_AGREEMENT, { carrier: PIN_CARRIER, signature: PIN_SIGNATURE }),
};

const golden: Record<string, string> = JSON.parse(fs.readFileSync(GOLDEN, "utf8"));

describe("document render pins", () => {
  it.each(Object.keys(DOCUMENTS))("%s renders as pinned", async (name) => {
    expect(
      pin(await DOCUMENTS[name]()),
      "`" + name + "` no longer renders as pinned. If you changed it deliberately, update " +
        "__tests__/fixtures/document-render-pins.json and name the document in the commit. " +
        "If you did not, a change in lib/srl-chrome.ts has reached a document you were not " +
        "editing -- which is exactly what this pin is for.",
    ).toBe(golden[name]);
  }, 30_000);

  it("the golden file covers every pinned document (vacuity tripwire)", () => {
    // A missing key would compare undefined to undefined for a document nobody
    // is watching, and the suite would stay green over an unpinned render.
    expect(Object.keys(golden).sort()).toEqual(Object.keys(DOCUMENTS).sort());
    for (const [k, v] of Object.entries(golden)) {
      expect(v, k + " has no golden value").toMatch(/^[0-9a-f]{32}$/);
    }
  });

  it("the pin is stable across renders and MOVES when the document changes", async () => {
    // Both halves matter. Stability alone is satisfied by hashing a constant;
    // discrimination alone by hashing something random. A pin that cannot tell a
    // change from no-change is decoration (§19 Sub-pattern 16).
    const a = await generateAgreementBuffer(CARAVAN_QUICK_PAY_AGREEMENT, {});
    const b = await generateAgreementBuffer(CARAVAN_QUICK_PAY_AGREEMENT, {});
    expect(a.equals(b), "raw bytes DO differ -- trailer /ID and the date object").toBe(false);
    expect(pin(a), "content streams must be identical").toBe(pin(b));

    const altered = await generateAgreementBuffer(
      { ...CARAVAN_QUICK_PAY_AGREEMENT, title: CARAVAN_QUICK_PAY_AGREEMENT.title + " (ALTERED)" },
      {},
    );
    expect(pin(altered), "a one-word change must move the pin").not.toBe(pin(a));
  }, 30_000);

  it("the stream extractor actually finds streams (self-test)", async () => {
    // If the extractor silently matched nothing, every pin would be the hash of
    // an empty digest -- identical for all seven documents and stable forever.
    const m = inflatedStreams(await generateAgreementBuffer(CARAVAN_QUICK_PAY_AGREEMENT, {}));
    expect(m.size, "no inflatable streams found -- the extractor is broken").toBeGreaterThan(10);
    expect([...m.values()].reduce((n, b) => n + b.length, 0)).toBeGreaterThan(10_000);
    expect(new Set(Object.values(golden)).size, "pins must not all be equal").toBe(Object.keys(golden).length);
  }, 30_000);
});
