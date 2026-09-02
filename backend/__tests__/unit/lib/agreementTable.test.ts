/**
 * Tables inside a legal agreement.
 *
 * WHY THE SHAPE GAINED ONE. The Foundation Edition BCA carries a Schedule A of
 * tier payment terms as a markdown table -- Silver Net-30, Gold Net-21,
 * Platinum Net-14. `LegalSection` could only hold `clauses: string[]`, so the
 * options were to flatten those into prose or to support the structure. Turning
 * `| Silver | Net-30 |` into a sentence is a rewrite of a signed instrument, and
 * doing it silently is worse than not supporting tables at all.
 *
 * THE INVARIANT THESE CASES EXIST TO HOLD: what is DRAWN is what is HASHED
 * (v3.8.awo). The renderer draws the table by splitting the hashed segment back
 * apart rather than re-reading `agreement.sections`, so a table cannot become
 * text the content hash does not cover. That split is only lossless while no
 * cell contains a separator, which is why the assembly refuses one rather than
 * mis-splitting -- wrong figures on a signed page is the failure being
 * prevented, and it would be silent.
 */
import { describe, it, expect } from "vitest";
import {
  assembleAgreementSegments,
  assembleAgreementText,
  agreementContentHash,
  CELL_SEP,
  ROW_SEP,
} from "../../../src/lib/canonicalAgreementText";
import { generateAgreementBuffer } from "../../../src/services/agreementPdfService";
import type { LegalAgreement } from "../../../src/data/agreements";

const withTable = (rows: string[][]): LegalAgreement => ({
  templateName: "broker-carrier",
  title: "Table Fixture Agreement",
  subtitle: "Fixture",
  version: "TABLE-FIXTURE",
  effectiveNote: "Fixture note",
  preamble: ["Preamble."],
  sections: [
    { heading: "1. Terms", clauses: ["A clause."] },
    {
      heading: "Schedule A",
      clauses: ["Broker may update this Schedule on thirty days notice."],
      table: { headers: ["Tier", "Standard payment terms"], rows },
    },
  ],
});

const TIERS = [["Silver", "Net-30"], ["Gold", "Net-21"], ["Platinum", "Net-14"]];

describe("agreement tables are content, not decoration", () => {
  it("every cell reaches the canonical text, so the hash covers it", () => {
    const text = assembleAgreementText(withTable(TIERS));
    for (const cell of ["Tier", "Standard payment terms", "Silver", "Net-30", "Gold", "Net-21", "Platinum", "Net-14"]) {
      expect(text, "cell `" + cell + "` is drawn but not hashed").toContain(cell);
    }
  });

  it("moving a value between columns changes the hash", () => {
    // The figures ARE the agreement here. A flattening that could not tell
    // "Silver Net-30" from "Net-30 Silver" would hash two different documents
    // to the same value.
    const a = agreementContentHash(withTable(TIERS));
    const b = agreementContentHash(withTable([["Net-30", "Silver"], ["Gold", "Net-21"], ["Platinum", "Net-14"]]));
    expect(b).not.toBe(a);
  });

  it("a changed figure changes the hash", () => {
    const a = agreementContentHash(withTable(TIERS));
    const b = agreementContentHash(withTable([["Silver", "Net-31"], ["Gold", "Net-21"], ["Platinum", "Net-14"]]));
    expect(b).not.toBe(a);
  });

  it("the table is one segment, and it survives a round trip through the separators", () => {
    const seg = assembleAgreementSegments(withTable(TIERS)).filter((s) => s.kind === "table");
    expect(seg).toHaveLength(1);
    const rows = seg[0].text.split(ROW_SEP).map((r) => r.split(CELL_SEP));
    expect(rows).toEqual([["Tier", "Standard payment terms"], ...TIERS]);
  });

  it("a cell containing a separator is REFUSED, not mis-split", () => {
    // Failing closed is the whole point: a silent mis-split puts the wrong
    // figures on a page somebody signs.
    for (const bad of [CELL_SEP.trim(), ROW_SEP.trim()]) {
      expect(
        () => assembleAgreementSegments(withTable([["Silver", "Net-30 " + bad + " maybe"]])),
        "a cell containing " + JSON.stringify(bad) + " must throw rather than flatten ambiguously",
      ).toThrow(/reserved separator/);
    }
  });

  it("an agreement with a table renders, and differs from the same one without", async () => {
    // Without this, the capability could be hashed correctly and draw nothing.
    const bare = { ...withTable(TIERS) };
    bare.sections = bare.sections.map((s) => ({ heading: s.heading, clauses: s.clauses }));
    const withT = await generateAgreementBuffer(withTable(TIERS), {});
    const without = await generateAgreementBuffer(bare, {});
    expect(withT.length).toBeGreaterThan(1000);
    expect(withT.length, "the table must actually add drawn content").toBeGreaterThan(without.length);
  }, 30_000);
});
