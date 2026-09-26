/**
 * An EXECUTED agreement names who signed it in the signature block, not only in
 * the attestation strip.
 *
 * WHAT THIS CAUGHT. The executed BCA printed the carrier's identity — legal
 * name, MC, DOT, EIN — and left PRINT NAME, TITLE and DATE blank, while the
 * attestation two inches below read "Electronically signed by Pat Pin, Owner".
 * One document with two answers to "who bound the carrier", and the blank one
 * is the one that looks like the signature block.
 *
 * WHY IT ASSERTS POSITIONS. The names appear in the attestation either way, so
 * a text search cannot tell whether the COLUMN was filled. Column membership is
 * decided by x, read from the render.
 *
 * THE SIGNATURE LINES (reversed 2026-09-26, owner-ratified). They used to stay
 * blank, on the reasoning that a typed name there would assert a mark nobody
 * made. The carrier's typed name IS the signature they adopted: typing it and
 * accepting is how they signed. So the line now carries that name in the
 * signature face with "Electronically signed" under it, and the broker's line
 * carries the countersigning officer's scanned signature, or their name in the
 * same face. The caption is what keeps either from passing for wet ink. A
 * specimen, which nobody has signed, still leaves both lines open.
 */
import { describe, it, expect } from "vitest";
import zlib from "zlib";
import { generateAgreementBuffer } from "../../../src/services/agreementPdfService";
import { BROKER_CARRIER_AGREEMENT } from "../../../src/data/agreements";
import { PIN_CARRIER, PIN_SIGNATURE } from "../../fixtures/pdfPinFixtures";
import { SIGNATORY_NAME, SIGNATORY_TITLE } from "../../../src/config/authority";

type Run = { x: number; y: number; s: string };

const COUNTERSIGN = { name: "Pat Officer", title: "President", at: new Date("2026-09-01T12:00:00.000Z") };

/** A small black RGB PNG, built rather than pasted so it is certainly valid. */
function png(w: number, h: number): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(body) >>> 0);
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // truecolour
  const rows = Buffer.alloc((w * 3 + 1) * h); // filter byte 0 per row, black pixels
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", zlib.deflateSync(rows)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}
const TINY_PNG = png(12, 4);

async function render(o: {
  signed: boolean;
  countersigned?: boolean;
  signatureImage?: (name: string) => Buffer | null;
}): Promise<Buffer> {
  return generateAgreementBuffer(BROKER_CARRIER_AGREEMENT, {
    carrier: PIN_CARRIER as never,
    ...(o.signed ? { signature: PIN_SIGNATURE as never } : {}),
    ...(o.countersigned ? { countersign: COUNTERSIGN } : {}),
    // Never the assets directory: this suite must not depend on which image
    // files happen to be in the tree.
    signatureImage: o.signatureImage ?? (() => null),
  } as never);
}

async function lastPageRuns(buf: Buffer): Promise<Run[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const tc = await (await doc.getPage(doc.numPages)).getTextContent();
  return (tc.items as { str: string; transform: number[] }[])
    .filter((i) => i.str.trim())
    .map((i) => ({ x: i.transform[4], y: i.transform[5], s: i.str.trim() }));
}

async function executionPage(signed: boolean): Promise<Run[]> {
  return lastPageRuns(await render({ signed }));
}

/** Everything drawn in a column between its SIGNATURE label and its DATE label. */
function signatureLine(runs: Run[], colX: number): string[] {
  const col = runs.filter((r) => Math.abs(r.x - colX) < 2 || (r.x > colX && r.x < colX + 250));
  const sig = col.find((r) => r.s === "SIGNATURE" && Math.abs(r.x - colX) < 2);
  const date = col.find((r) => r.s === "DATE" && Math.abs(r.x - colX) < 2);
  if (!sig || !date) throw new Error("SIGNATURE or DATE label not rendered in that column");
  // Top to bottom, as a reader meets them: the mark, then the caption under the line.
  return col.filter((r) => r.y < sig.y && r.y > date.y).sort((p, q) => q.y - p.y || p.x - q.x).map((r) => r.s);
}

function brokerColumnX(runs: Run[]): number {
  return Math.min(...runs.filter((r) => r.s === "PRINT NAME").map((r) => r.x));
}

/** The value drawn under a label, in the same column, immediately below it. */
function valueUnder(runs: Run[], label: string, colX: number): string | null {
  const lab = runs.find((r) => r.s === label && Math.abs(r.x - colX) < 2);
  if (!lab) throw new Error("label not rendered in that column: " + label);
  const below = runs
    .filter((r) => Math.abs(r.x - colX) < 2 && r.y < lab.y && r.y > lab.y - 18 && r.s !== label)
    .sort((a, b) => b.y - a.y);
  return below.length ? below[0].s : null;
}

function carrierColumnX(runs: Run[]): number {
  const head = runs.find((r) => r.s === "CARRIER");
  if (!head) throw new Error("CARRIER column header not rendered");
  return head.x;
}

describe("the executed agreement fills the carrier signature column", () => {
  it("an unsigned specimen leaves PRINT NAME, TITLE and DATE open", async () => {
    const runs = await executionPage(false);
    const x = carrierColumnX(runs);
    // Self-test: the column exists and its identity fields ARE filled, so a
    // blank result below means "not prefilled" rather than "nothing rendered".
    expect(valueUnder(runs, "CARRIER LEGAL NAME", x)).toBe(PIN_CARRIER.legalName);
    for (const f of ["PRINT NAME", "TITLE", "DATE"]) {
      expect(valueUnder(runs, f, x), `${f} must stay open on a specimen`).toBeNull();
    }
  }, 30_000);

  it("an executed copy names the signer, their title and the date", async () => {
    const runs = await executionPage(true);
    const x = carrierColumnX(runs);
    expect(valueUnder(runs, "PRINT NAME", x)).toBe(PIN_SIGNATURE.signedByName);
    expect(valueUnder(runs, "TITLE", x)).toBe(PIN_SIGNATURE.signedByTitle);
    expect(valueUnder(runs, "DATE", x)).toBe(
      new Date(PIN_SIGNATURE.signedAt).toISOString().slice(0, 10),
    );
  }, 30_000);

  it("an executed copy puts the signer's adopted signature on the carrier SIGNATURE line, captioned", async () => {
    const runs = await executionPage(true);
    expect(signatureLine(runs, carrierColumnX(runs))).toEqual([
      PIN_SIGNATURE.signedByName,
      "Electronically signed",
    ]);
  }, 30_000);

  it("the adopted signature is set in the signature face, and only once someone has signed", async () => {
    const face = (b: Buffer) => b.toString("latin1").includes("AlexBrush-Regular");
    // A face enters a PDF only when text uses it, so its presence is the
    // signature being drawn in it, not merely registered.
    expect(face(await render({ signed: true })), "executed copy").toBe(true);
    expect(face(await render({ signed: false })), "specimen").toBe(false);
  }, 60_000);

  it("a specimen leaves both SIGNATURE lines open for a pen", async () => {
    const runs = await executionPage(false);
    expect(signatureLine(runs, carrierColumnX(runs))).toEqual([]);
    expect(signatureLine(runs, brokerColumnX(runs))).toEqual([]);
  }, 30_000);
});

describe("the broker SIGNATURE line carries the countersigning officer's mark", () => {
  it("with no scanned signature on file, the officer's name in the signature face, captioned", async () => {
    const runs = await lastPageRuns(await render({ signed: true, countersigned: true }));
    expect(signatureLine(runs, brokerColumnX(runs))).toEqual([COUNTERSIGN.name, "Countersigned electronically"]);
  }, 30_000);

  it("with a scanned signature on file, the image instead of the typed name", async () => {
    const buf = await render({ signed: true, countersigned: true, signatureImage: () => TINY_PNG });
    const runs = await lastPageRuns(buf);
    expect(signatureLine(runs, brokerColumnX(runs))).toEqual(["Countersigned electronically"]);
    expect(buf.toString("latin1")).toMatch(/\/Subtype\s*\/Image/);
  }, 30_000);

  it("the image is looked up by the name ON THE COUNTERSIGN, not today's signatory", async () => {
    const asked: string[] = [];
    await render({ signed: true, countersigned: true, signatureImage: (n) => (asked.push(n), null) });
    expect(COUNTERSIGN.name).not.toBe(SIGNATORY_NAME); // the fixture must tell the two apart
    expect(asked).toEqual([COUNTERSIGN.name]);
  }, 30_000);

  it("without a countersign the broker line stays open even on an executed copy", async () => {
    const asked: string[] = [];
    const runs = await lastPageRuns(await render({ signed: true, signatureImage: (n) => (asked.push(n), null) }));
    expect(signatureLine(runs, brokerColumnX(runs))).toEqual([]);
    expect(asked).toEqual([]);
  }, 30_000);

  it("the broker column names the BROKER's signatory, not the carrier's", async () => {
    const runs = await executionPage(true);
    const carrierX = carrierColumnX(runs);
    const brokerX = Math.min(...runs.filter((r) => r.s === "PRINT NAME").map((r) => r.x));
    expect(brokerX, "the two columns must be at different x").toBeLessThan(carrierX - 10);

    // POSITIVE, not "is not the carrier's name". The first version of this
    // asserted the negative and PASSED an injected bare-key prefill — because
    // the broker's own role-scoped key wins that lookup regardless, so the
    // negative was already true for a reason unrelated to the thing under test.
    // §19 Sub-pattern 16, in the guard written to prove role scoping works.
    expect(valueUnder(runs, "PRINT NAME", brokerX)).toBe(SIGNATORY_NAME);
    expect(valueUnder(runs, "TITLE", brokerX)).toBe(SIGNATORY_TITLE);
  }, 30_000);
});
