/**
 * The executed agreement names the carrier in its opening paragraph
 * (2026-09-26).
 *
 * The Foundation Edition read "by and between ________ ("CARRIER")" even on an
 * executed copy, while the carrier's legal name sat in the execution block and
 * in the hashed header. From BCA Revision 3 and Quick Pay Revision 6 the
 * opening paragraph carries a placeholder, and the canonical assembly -- which
 * is both what is hashed and what the PDF draws -- fills it.
 */
import { describe, it, expect } from "vitest";
import {
  BROKER_CARRIER_AGREEMENT, CARAVAN_QUICK_PAY_AGREEMENT, getAgreement,
} from "../../../src/data/agreements";
import { assembleAgreementSegments, agreementContentHash } from "../../../src/lib/canonicalAgreementText";
import { CARRIER_PARTY_BLANK, CARRIER_PARTY_TOKEN, fillCarrierParty } from "../../../../shared/constants/agreementParty";
import { runningEdition } from "../../../src/services/agreementPdfService";

const CARRIER = { legalName: "Pin Carrier LLC", mcNumber: "MC-999001", dotNumber: "9990011", ein: null };

describe("the carrier is named in the opening paragraph", () => {
  for (const agreement of [BROKER_CARRIER_AGREEMENT, CARAVAN_QUICK_PAY_AGREEMENT]) {
    it(agreement.title + ": filled when there is a carrier, a blank line when there is not", () => {
      const withName = assembleAgreementSegments(agreement, { carrier: CARRIER }).filter((s) => s.kind === "preamble");
      expect(withName[0].text).toContain("Pin Carrier LLC");
      expect(withName.map((s) => s.text).join(" ")).not.toContain(CARRIER_PARTY_TOKEN);

      const specimen = assembleAgreementSegments(agreement).filter((s) => s.kind === "preamble");
      expect(specimen[0].text).toContain(CARRIER_PARTY_BLANK);
      expect(specimen.map((s) => s.text).join(" ")).not.toContain(CARRIER_PARTY_TOKEN);
    });
  }

  it("the name is part of the hashed body, not only of the header", () => {
    // Two carriers with the same MC, DOT and EIN but different names still get
    // different hashes, and so do the body lines themselves.
    const a = assembleAgreementSegments(BROKER_CARRIER_AGREEMENT, { carrier: CARRIER });
    const b = assembleAgreementSegments(BROKER_CARRIER_AGREEMENT, { carrier: { ...CARRIER, legalName: "Other Carrier LLC" } });
    expect(a[1].text).not.toBe(b[1].text);
    expect(agreementContentHash(BROKER_CARRIER_AGREEMENT, { carrier: CARRIER }))
      .not.toBe(agreementContentHash(BROKER_CARRIER_AGREEMENT, { carrier: { ...CARRIER, legalName: "Other Carrier LLC" } }));
  });

  it("bodies signed before the placeholder existed are untouched by the fill", () => {
    // What keeps every stored hash on an archived version re-derivable.
    for (const [t, v] of [["broker-carrier", "2026-06-27-v1"], ["broker-carrier", "2026-09-03-F11"],
      ["quick-pay", "2026-08-16-v4"], ["quick-pay", "2026-09-04-v5"]] as const) {
      const a = getAgreement(t, v)!;
      expect(a.version).toBe(v);
      const filled = assembleAgreementSegments(a, { carrier: CARRIER });
      const raw = [a.effectiveNote, ...a.preamble];
      expect(filled.slice(0, raw.length).map((s) => s.text)).toEqual(raw.map((s) => s.replace(/[ \t]+/g, " ").trim()));
    }
  });

  it("fillCarrierParty: every occurrence, trimmed, and a pass-through without a token", () => {
    expect(fillCarrierParty("a {{CARRIER}} b {{CARRIER}}", "  Acme LLC ")).toBe("a Acme LLC b Acme LLC");
    expect(fillCarrierParty("a {{CARRIER}}", null)).toBe("a " + CARRIER_PARTY_BLANK);
    expect(fillCarrierParty("no placeholder here", "Acme LLC")).toBe("no placeholder here");
  });
});

describe("the running header names the edition in sentence case", () => {
  it("abbreviates a revision edition and leaves anything else as it is", () => {
    expect(runningEdition("REVISION 3 · SEPTEMBER 2026")).toBe("Rev. 3 · September 2026");
    expect(runningEdition(CARAVAN_QUICK_PAY_AGREEMENT.subtitle)).toBe("Rev. 6 · September 2026");
    expect(runningEdition(BROKER_CARRIER_AGREEMENT.subtitle)).toBe("Rev. 3 · September 2026");
    expect(runningEdition("FOUNDATION EDITION · 3 SEPTEMBER 2026")).toBe("FOUNDATION EDITION · 3 SEPTEMBER 2026");
  });
});
