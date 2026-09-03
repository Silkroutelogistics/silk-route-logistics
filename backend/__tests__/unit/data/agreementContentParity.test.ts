/**
 * The committed BCA body still matches the markdown it was generated from.
 *
 * docs/legal/bca-content-F11.md is the authoring source; the compiled constant
 * is what the running system hashes and renders. Two representations of one
 * legal text can drift, and the drift would be in the words a carrier signs --
 * so this fails rather than letting them.
 *
 * It also pins the parser's DELIBERATE drops. Those are the only two places the
 * parser does not reproduce the document verbatim, and each would be a real
 * defect if it silently stopped working:
 *
 *   The "# Signatures" body is a bracketed directive naming the broker
 *   signatory. Drawn as a clause it would print a stage direction into a signed
 *   agreement.
 *
 *   The trailing entity/tagline line is the page footer, which drawFooter
 *   already emits on every page. Kept, it prints twice, once as body text.
 */
import { describe, it, expect } from "vitest";
import path from "path";
import { parseAgreementFile } from "../../../scripts/agreementContentParser";
import {
  BCA_F11_VERSION, BCA_F11_TITLE, BCA_F11_SUBTITLE, BCA_F11_EFFECTIVE_NOTE,
  BCA_F11_PREAMBLE, BCA_F11_SECTIONS,
} from "../../../src/data/brokerCarrierAgreement.generated";

const MD = path.resolve(__dirname, "../../../../docs/legal/bca-content-F11.md");
const fresh = () => parseAgreementFile(MD);

describe("the compiled BCA body matches its markdown source", () => {
  it("every field round-trips", () => {
    const { agreement, version } = fresh();
    expect(
      { version, title: agreement.title, subtitle: agreement.subtitle, effectiveNote: agreement.effectiveNote },
      "the committed constant no longer matches docs/legal/bca-content-F11.md. Run " +
        "`npx tsx scripts/generate-agreement-content.ts` and commit both, or revert the markdown.",
    ).toEqual({
      version: BCA_F11_VERSION, title: BCA_F11_TITLE,
      subtitle: BCA_F11_SUBTITLE, effectiveNote: BCA_F11_EFFECTIVE_NOTE,
    });
    expect(agreement.preamble).toEqual(BCA_F11_PREAMBLE);
    expect(agreement.sections).toEqual(BCA_F11_SECTIONS);
  });

  it("the parse is substantial (vacuity tripwire)", () => {
    // A parser that had quietly stopped matching would return an empty document
    // and the equality above would pass against an equally empty constant.
    expect(BCA_F11_SECTIONS.length).toBeGreaterThan(35);
    expect(BCA_F11_SECTIONS.reduce((n, s) => n + s.clauses.length, 0)).toBeGreaterThan(120);
    expect(BCA_F11_PREAMBLE.length).toBeGreaterThan(2);
    expect(BCA_F11_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-F\d+$/);
  });

  it("both tables survived, with their figures", () => {
    // The accessorial figures and the tier terms are the numbers a carrier is
    // agreeing to. A parser that dropped a table would lose them silently.
    const tabled = BCA_F11_SECTIONS.filter((s) => s.table);
    expect(tabled.length, "expected the accessorial table and Schedule A").toBe(2);
    const flat = JSON.stringify(tabled);
    for (const v of ["Detention", "Layover", "Truck Order Not Used", "Silver", "Net-30", "Platinum", "Net-14"]) {
      expect(flat, "table value `" + v + "` is missing").toContain(v);
    }
  });

  it("the execution directive is DROPPED, not rendered as a clause", () => {
    const all = JSON.stringify({ p: BCA_F11_PREAMBLE, s: BCA_F11_SECTIONS });
    expect(all, "the [EXECUTION SECTION ...] directive reached the body").not.toContain("EXECUTION SECTION");
    expect(BCA_F11_SECTIONS.map((s) => s.heading)).not.toContain("Signatures");
  });

  it("the page footer is DROPPED, not repeated as body text", () => {
    const clauses = BCA_F11_SECTIONS.flatMap((s) => s.clauses);
    expect(clauses.some((c) => /Where Trust Travels/.test(c)), "the footer line reached the body").toBe(false);
  });

  it("Schedule A is kept, because it is substantive", () => {
    // The drops above are narrow on purpose. Schedule A sits after the
    // signatures heading and is real content -- tier payment terms under a
    // thirty-day notice clause -- so a drop rule that swallowed everything past
    // "# Signatures" would delete terms.
    const last = BCA_F11_SECTIONS[BCA_F11_SECTIONS.length - 1];
    expect(last.heading).toContain("Schedule A");
    expect(last.table, "Schedule A lost its tier table").toBeDefined();
  });
});
