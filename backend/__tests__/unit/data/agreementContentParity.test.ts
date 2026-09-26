/**
 * The committed BCA body still matches the markdown it was generated from.
 *
 * docs/legal/bca-content-R3.md is the authoring source; the compiled constant
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
  BCA_BODY_VERSION, BCA_BODY_TITLE, BCA_BODY_SUBTITLE, BCA_BODY_EFFECTIVE_NOTE,
  BCA_BODY_PREAMBLE, BCA_BODY_SECTIONS,
} from "../../../src/data/brokerCarrierAgreement.generated";
import { BROKER_CARRIER_AGREEMENT_2026_09_03_F11 } from "../../../src/data/archive/brokerCarrierAgreement.2026-09-03-F11";
import { CARRIER_PARTY_TOKEN } from "../../../../shared/constants/agreementParty";

const LEGAL = path.resolve(__dirname, "../../../../docs/legal");
const fresh = () => parseAgreementFile(path.join(LEGAL, "bca-content-R3.md"));

describe("the compiled BCA body matches its markdown source", () => {
  it("every field round-trips", () => {
    const { agreement, version } = fresh();
    expect(
      { version, title: agreement.title, subtitle: agreement.subtitle, effectiveNote: agreement.effectiveNote },
      "the committed constant no longer matches docs/legal/bca-content-R3.md. Run " +
        "`npx tsx scripts/generate-agreement-content.ts` and commit both, or revert the markdown.",
    ).toEqual({
      version: BCA_BODY_VERSION, title: BCA_BODY_TITLE,
      subtitle: BCA_BODY_SUBTITLE, effectiveNote: BCA_BODY_EFFECTIVE_NOTE,
    });
    expect(agreement.preamble).toEqual(BCA_BODY_PREAMBLE);
    expect(agreement.sections).toEqual(BCA_BODY_SECTIONS);
  });

  it("the parse is substantial (vacuity tripwire)", () => {
    // A parser that had quietly stopped matching would return an empty document
    // and the equality above would pass against an equally empty constant.
    expect(BCA_BODY_SECTIONS.length).toBeGreaterThan(35);
    expect(BCA_BODY_SECTIONS.reduce((n, s) => n + s.clauses.length, 0)).toBeGreaterThan(120);
    expect(BCA_BODY_PREAMBLE.length).toBeGreaterThan(2);
  });

  it("the version is the reference the document prints", () => {
    // From Revision 3 the stored version and the printed reference are one
    // string, so the cover and a signature row can never name different
    // editions.
    expect(BCA_BODY_VERSION).toMatch(/^SRL-BCA-\d{4}-R\d+$/);
    expect(BCA_BODY_EFFECTIVE_NOTE).toContain("Reference " + BCA_BODY_VERSION);
    expect(BCA_BODY_SUBTITLE).toMatch(/^REVISION \d+ · [A-Z]+ \d{4}$/);
  });

  it("the opening paragraph names the carrier through the placeholder, once", () => {
    // The Foundation Edition printed a blank line here. The placeholder is what
    // fillCarrierParty replaces with the carrier's legal name.
    const opening = BCA_BODY_PREAMBLE[0];
    expect(opening.split(CARRIER_PARTY_TOKEN).length - 1).toBe(1);
    expect(opening).toContain("Silk Route Logistics Inc., a Michigan corporation");
    expect(opening).not.toMatch(/_{8,}/);
    // The entity's legal name has no comma. The Foundation Edition had it wrong
    // in the opening paragraph AND in the notice address, so check everywhere.
    expect(JSON.stringify({ p: BCA_BODY_PREAMBLE, s: BCA_BODY_SECTIONS })).not.toContain("Silk Route Logistics, Inc.");
  });

  it("both tables survived, with their figures", () => {
    // The accessorial figures and the tier terms are the numbers a carrier is
    // agreeing to. A parser that dropped a table would lose them silently.
    const tabled = BCA_BODY_SECTIONS.filter((s) => s.table);
    expect(tabled.length, "expected the accessorial table and Schedule A").toBe(2);
    const flat = JSON.stringify(tabled);
    for (const v of ["Detention", "Layover", "Truck Order Not Used", "Silver", "Net-30", "Platinum", "Net-14"]) {
      expect(flat, "table value `" + v + "` is missing").toContain(v);
    }
  });

  it("the execution directive is DROPPED, not rendered as a clause", () => {
    const all = JSON.stringify({ p: BCA_BODY_PREAMBLE, s: BCA_BODY_SECTIONS });
    expect(all, "the [EXECUTION SECTION ...] directive reached the body").not.toContain("EXECUTION SECTION");
    expect(BCA_BODY_SECTIONS.map((s) => s.heading)).not.toContain("Signatures");
  });

  it("the page footer is DROPPED, not repeated as body text", () => {
    const clauses = BCA_BODY_SECTIONS.flatMap((s) => s.clauses);
    expect(clauses.some((c) => /Where Trust Travels/.test(c)), "the footer line reached the body").toBe(false);
  });

  it("Schedule A is kept, with its table, and its notes are numbered clauses", () => {
    // The drops above are narrow on purpose. Schedule A sits after the
    // signatures heading and is real content -- tier payment terms under a
    // thirty-day notice clause -- so a drop rule that swallowed everything past
    // "# Signatures" would delete terms.
    const schedule = BCA_BODY_SECTIONS.find((s) => s.heading.startsWith("Schedule A"));
    expect(schedule, "Schedule A is missing").toBeDefined();
    expect(schedule!.table, "Schedule A lost its tier table").toBeDefined();
    // The notes follow the table, one per clause. The Foundation Edition ran
    // all four into one line, which read as a single run-on paragraph.
    const last = BCA_BODY_SECTIONS[BCA_BODY_SECTIONS.length - 1];
    expect(last.heading).toBe("Notes to Schedule A");
    expect(last.clauses.map((c) => c.slice(0, 2))).toEqual(["1.", "2.", "3.", "4."]);
  });
});

describe("the Foundation Edition source still parses to its archive", () => {
  it("docs/legal/bca-content-F11.md round-trips against archive/brokerCarrierAgreement.2026-09-03-F11.ts", () => {
    // The archive is what four executed hashes re-derive against. Tying it to
    // the markdown it came from means neither can be edited alone.
    const { agreement, version } = parseAgreementFile(path.join(LEGAL, "bca-content-F11.md"));
    expect(version).toBe("2026-09-03-F11");
    expect({ ...agreement, templateName: "broker-carrier" }).toEqual(BROKER_CARRIER_AGREEMENT_2026_09_03_F11);
  });
});
