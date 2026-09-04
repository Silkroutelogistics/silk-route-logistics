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
 * SIGNATURE STAYS BLANK ON BOTH COLUMNS, deliberately. That line is where a wet
 * or drawn mark goes; the electronic execution is evidenced by the attestation
 * strip, and printing a typed name there would assert a mark nobody made.
 */
import { describe, it, expect } from "vitest";
import { generateAgreementBuffer } from "../../../src/services/agreementPdfService";
import { BROKER_CARRIER_AGREEMENT } from "../../../src/data/agreements";
import { PIN_CARRIER, PIN_SIGNATURE } from "../../fixtures/pdfPinFixtures";
import { SIGNATORY_NAME, SIGNATORY_TITLE } from "../../../src/config/authority";

type Run = { x: number; y: number; s: string };

async function executionPage(signed: boolean): Promise<Run[]> {
  const buf = await generateAgreementBuffer(BROKER_CARRIER_AGREEMENT, {
    carrier: PIN_CARRIER as never,
    ...(signed ? { signature: PIN_SIGNATURE as never } : {}),
  } as never);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const tc = await (await doc.getPage(doc.numPages)).getTextContent();
  return (tc.items as { str: string; transform: number[] }[])
    .filter((i) => i.str.trim())
    .map((i) => ({ x: i.transform[4], y: i.transform[5], s: i.str.trim() }));
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

  it("SIGNATURE stays blank on the carrier column even when executed", async () => {
    const runs = await executionPage(true);
    expect(
      valueUnder(runs, "SIGNATURE", carrierColumnX(runs)),
      "a typed name on the signature line asserts a mark nobody made",
    ).toBeNull();
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
