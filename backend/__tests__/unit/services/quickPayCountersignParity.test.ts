/**
 * The Quick Pay Agreement is countersigned exactly as the BCA is - proved, not
 * inherited by assumption.
 *
 * Quick Pay is a SEPARATELY executed instrument. It is signed on its own day,
 * hashed on its own text, and stored as its own CarrierAgreement row, so it
 * does not inherit the BCA's countersignature and must resolve one of its own.
 * agreementCountersign.test.ts already proves the structural half for both
 * paths - each writes counterSignedByName, each agreementContentHash call
 * carries the countersign. What it does NOT prove is the behavioural half for
 * Quick Pay: that the segment enters the QP canonical text, and that the QP
 * execution page renders the broker column filled.
 *
 * Those are different claims from "the code passes an argument", and this file
 * asserts them against a rendered document and a real hash (SS19 Sub-pattern 16
 * - a structural guard proves a thing is written, never that it comes out).
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { generateAgreementBuffer } from "../../../src/services/agreementPdfService";
import { CARAVAN_QUICK_PAY_AGREEMENT, BROKER_CARRIER_AGREEMENT } from "../../../src/data/agreements";
import { agreementContentHash, assembleAgreementSegments } from "../../../src/lib/canonicalAgreementText";
import { PIN_CARRIER, PIN_SIGNATURE } from "../../fixtures/pdfPinFixtures";
import { SIGNATORY_NAME, SIGNATORY_TITLE } from "../../../src/config/authority";

const CS = { name: SIGNATORY_NAME, title: SIGNATORY_TITLE, at: new Date("2026-09-04T15:00:00.000Z") };

type Run = { x: number; y: number; s: string };

async function executionPage(opts: Record<string, unknown>): Promise<Run[]> {
  const buf = await generateAgreementBuffer(CARAVAN_QUICK_PAY_AGREEMENT, opts as never);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const tc = await (await doc.getPage(doc.numPages)).getTextContent();
  return (tc.items as { str: string; transform: number[] }[])
    .filter((i) => i.str.trim())
    .map((i) => ({ x: i.transform[4], y: i.transform[5], s: i.str.trim() }));
}

/**
 * The two signature columns, derived from the RENDER rather than from a guessed
 * label.
 *
 * The first version of this looked for a run reading "BROKER" and two cases
 * went red against a correct document. There is no such header: the broker
 * column is titled "SILK ROUTE LOGISTICS INC." and the carrier column "CARRIER",
 * and the BCA renders exactly the same way. The instrument was wrong, not the
 * subject (SS19 Sub-pattern 16 — a RED result needs verifying too).
 *
 * So the carrier column is anchored on its header, and the broker column is the
 * OTHER x at which PRINT NAME is drawn. That cannot silently follow a rename.
 */
function columns(runs: Run[]): { carrier: number; broker: number } {
  const head = runs.find((r) => r.s === "CARRIER");
  if (!head) throw new Error("CARRIER column header not rendered on the QP execution page");
  const xs = [...new Set(runs.filter((r) => r.s === "PRINT NAME").map((r) => r.x))];
  if (xs.length !== 2) {
    throw new Error("expected PRINT NAME in exactly two columns, found " + xs.length);
  }
  const broker = xs.find((x) => Math.abs(x - head.x) >= 2);
  if (broker === undefined) throw new Error("both PRINT NAME runs sit in the carrier column");
  return { carrier: head.x, broker };
}

function valueUnder(runs: Run[], label: string, colX: number): string | null {
  const lab = runs.find((r) => r.s === label && Math.abs(r.x - colX) < 2);
  if (!lab) throw new Error("label not rendered in that column: " + label);
  const below = runs
    .filter((r) => Math.abs(r.x - colX) < 2 && r.y < lab.y && r.y > lab.y - 18 && r.s !== label)
    .sort((a, b) => b.y - a.y);
  return below.length ? below[0].s : null;
}

describe("Quick Pay countersign parity", () => {
  it("the countersign is a segment of the QP canonical text, so the hash covers it", () => {
    const withOut = agreementContentHash(CARAVAN_QUICK_PAY_AGREEMENT, {
      carrier: PIN_CARRIER as never, signature: PIN_SIGNATURE as never,
    } as never);
    const withIt = agreementContentHash(CARAVAN_QUICK_PAY_AGREEMENT, {
      carrier: PIN_CARRIER as never, signature: PIN_SIGNATURE as never, countersign: CS,
    } as never);
    expect(
      withIt,
      "the QP hash does not move when a countersignature is added - the segment " +
        "is outside the hash, so the broker's binding is not evidenced by it",
    ).not.toBe(withOut);

    const kinds = assembleAgreementSegments(CARAVAN_QUICK_PAY_AGREEMENT, {
      carrier: PIN_CARRIER as never, signature: PIN_SIGNATURE as never, countersign: CS,
    } as never).map((s) => s.kind);
    expect(kinds).toContain("countersign");
  });

  it("the QP countersign segment carries the SAME text as the BCA's", () => {
    // Parity in the literal sense the instruction asks for: not merely that a
    // countersign exists on the QP, but that it is the same attestation. A
    // divergent sentence on one instrument is how two documents come to make
    // different claims about the same act.
    const seg = (agreement: typeof BROKER_CARRIER_AGREEMENT) =>
      assembleAgreementSegments(agreement, {
        carrier: PIN_CARRIER as never, signature: PIN_SIGNATURE as never, countersign: CS,
      } as never).find((s) => s.kind === "countersign")?.text;
    expect(seg(CARAVAN_QUICK_PAY_AGREEMENT)).toBeTruthy();
    expect(seg(CARAVAN_QUICK_PAY_AGREEMENT)).toBe(seg(BROKER_CARRIER_AGREEMENT));
  });

  it("an unsigned QP specimen carries NO countersign (self-test)", () => {
    // Without this, every assertion above is satisfied by a document that
    // countersigns unconditionally - including specimens nobody has signed.
    const kinds = assembleAgreementSegments(CARAVAN_QUICK_PAY_AGREEMENT, {} as never).map((s) => s.kind);
    expect(kinds).not.toContain("countersign");
  });

  it("the executed QP renders the BROKER column from authority.ts", async () => {
    const runs = await executionPage({
      carrier: PIN_CARRIER, signature: PIN_SIGNATURE, countersign: CS,
    });
    const x = columns(runs).broker;
    expect(
      valueUnder(runs, "PRINT NAME", x),
      "the QP broker column PRINT NAME is not the countersignatory - the " +
        "document does not say who bound SRL",
    ).toBe(SIGNATORY_NAME);
    expect(valueUnder(runs, "TITLE", x)).toBe(SIGNATORY_TITLE);
  }, 30_000);

  it("the executed QP renders the CARRIER column from the signature", async () => {
    // The v3.8.azy prefill, which was built on the BCA and must reach the QP
    // through the same role-scoped path rather than by a second implementation.
    const runs = await executionPage({
      carrier: PIN_CARRIER, signature: PIN_SIGNATURE, countersign: CS,
    });
    const x = columns(runs).carrier;
    expect(valueUnder(runs, "PRINT NAME", x)).toBe(PIN_SIGNATURE.signedByName);
    expect(
      valueUnder(runs, "PRINT NAME", x),
      "the carrier column shows the BROKER's signatory - the columns are crossed",
    ).not.toBe(SIGNATORY_NAME);
  }, 30_000);

  it("execution is evidenced by the DATE, and each column carries its OWN act", async () => {
    // THE EXPECTATION THIS REPLACED WAS WRONG, and measuring is what found it.
    // The first version asserted both columns are blank on an unsigned specimen.
    // They are not, on either instrument: the broker PRINT NAME and TITLE are
    // pre-printed, because who signs for SRL is known before any carrier is.
    // What is NOT known in advance is whether anyone executed - and that is what
    // the DATE says. So the real property is per-column provenance, not
    // blankness (SS19 Sub-pattern 16: a red result needs verifying too).
    const unsigned = await executionPage({ carrier: PIN_CARRIER });
    const uc = columns(unsigned);
    expect(
      valueUnder(unsigned, "DATE", uc.broker),
      "an UNSIGNED specimen dates the broker column - it asserts SRL bound " +
        "itself to an agreement nobody has accepted",
    ).toBeNull();
    expect(valueUnder(unsigned, "DATE", uc.carrier)).toBeNull();
    expect(
      valueUnder(unsigned, "PRINT NAME", uc.carrier),
      "an UNSIGNED specimen names a carrier signatory",
    ).toBeNull();

    const signed = await executionPage({
      carrier: PIN_CARRIER, signature: PIN_SIGNATURE, countersign: CS,
    });
    const sc = columns(signed);
    const brokerDate = valueUnder(signed, "DATE", sc.broker);
    const carrierDate = valueUnder(signed, "DATE", sc.carrier);
    expect(brokerDate, "the executed QP does not date the countersignature").toBe(
      CS.at.toISOString().slice(0, 10));
    expect(carrierDate).toBe(new Date(PIN_SIGNATURE.signedAt).toISOString().slice(0, 10));
    // The two acts happen on different days, and the document must not collapse
    // them. Equal dates here would pass a weaker assertion while the broker
    // column silently echoed the carrier signature.
    expect(
      brokerDate,
      "both columns show the same date - one column is echoing the other act",
    ).not.toBe(carrierDate);

    // SIGNATURE stays open on BOTH columns, signed or not: that line is where a
    // wet or drawn mark goes, and the electronic execution is evidenced by the
    // attestation strip rather than by a typed name on a signature rule.
    for (const x of [sc.broker, sc.carrier]) {
      expect(valueUnder(signed, "SIGNATURE", x)).toBeNull();
    }
  }, 30_000);

  it("the QP acceptance path resolves its countersign from authority.ts, before the hash", () => {
    // Ordering is the property. A countersignature written to the row AFTER the
    // hash is computed is a claim the hash does not cover, so re-deriving the
    // hash later would not reproduce the document the row describes.
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../src/routes/carrierAuth.ts"), "utf8");
    const anchor = src.indexOf("const qpCountersign");
    expect(anchor, "qpCountersign is not resolved on this path").toBeGreaterThan(-1);
    const block = src.slice(anchor);
    const iHash = block.indexOf("agreementContentHash(CARAVAN_QUICK_PAY_AGREEMENT");
    const iRow = block.indexOf("counterSignedByName: qpCountersign.name");
    expect(iHash, "the QP hash call moved or no longer follows the countersign").toBeGreaterThan(-1);
    expect(iRow, "the QP row does not write the resolved countersignature").toBeGreaterThan(-1);
    expect(iHash, "the row is written BEFORE the hash it is supposed to carry").toBeLessThan(iRow);

    const resolve = block.slice(0, iHash);
    expect(resolve, "the QP countersign is not read from authority.ts").toContain("SIGNATORY_NAME");
    expect(resolve).toContain("SIGNATORY_TITLE");
  });
});
