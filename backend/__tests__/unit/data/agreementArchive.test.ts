/**
 * A superseded agreement body still resolves, so the signatures taken against
 * it remain verifiable.
 *
 * Two carriers executed the BCA at 2026-06-27-v1 -- AEROSWIFT LLC on 2026-09-01
 * and AMERICAN EAGLE FLEET INC on 2026-09-02 -- and each row stores a
 * contentHash computed over that text. Only one CURRENT body per agreement
 * lives in the code, so swapping in the Foundation Edition without archiving
 * would have left those hashes un-recomputable: the executed PDFs survive, but
 * the ability to demonstrate that a stored hash corresponds to what was signed
 * does not. Archiving is cheap before a swap and impossible after.
 *
 * These cases hold the archive to the only property that matters: the text is
 * FROZEN. Anything that lets it move -- following BCA_VERSION, tracking a
 * constant it interpolates -- silently breaks the verification it exists for.
 */
import { describe, it, expect } from "vitest";
import {
  getAgreement,
  BCA_VERSION,
  BROKER_CARRIER_AGREEMENT,
} from "../../../src/data/agreements";
import { BROKER_CARRIER_AGREEMENT_2026_06_27_V1 } from "../../../src/data/archive/brokerCarrierAgreement.2026-06-27-v1";
import { agreementContentHash } from "../../../src/lib/canonicalAgreementText";

const ARCHIVED_V = "2026-06-27-v1";

/** Fixed inputs, so the pin below moves only when the archived TEXT moves. */
const CARRIER = { legalName: "Pin Carrier LLC", mcNumber: "MC-999001", dotNumber: "9990011", ein: null };
const SIGNATURE = {
  signedByName: "Pat Pin",
  signedByTitle: "Owner",
  signedAt: new Date("2026-09-01T12:00:00.000Z"),
  signerIp: "203.0.113.10",
  version: ARCHIVED_V,
  consentAt: new Date("2026-09-01T12:00:00.000Z"),
};

describe("the archived BCA body still resolves", () => {
  it("getAgreement resolves the archived version by name", () => {
    const a = getAgreement("broker-carrier", ARCHIVED_V);
    expect(a, "the archived body no longer resolves -- two executed hashes just became un-recomputable").toBe(
      BROKER_CARRIER_AGREEMENT_2026_06_27_V1,
    );
    expect(a!.version).toBe(ARCHIVED_V);
  });

  it("the alias resolves it too", () => {
    expect(getAgreement("bca", ARCHIVED_V)).toBe(BROKER_CARRIER_AGREEMENT_2026_06_27_V1);
  });

  it("no version still means the CURRENT body", () => {
    // Every signing path calls getAgreement without a version and must keep
    // getting the live text, not an archived one.
    expect(getAgreement("broker-carrier")).toBe(BROKER_CARRIER_AGREEMENT);
    expect(getAgreement("bca")).toBe(BROKER_CARRIER_AGREEMENT);
  });

  it("an unknown version falls back to current rather than returning null", () => {
    // Every row signed before archiving existed carries a version no archive
    // entry will ever exist for. Returning null there would turn a resolvable
    // lookup into a crash at the call site.
    expect(getAgreement("broker-carrier", "1999-01-01-v0")).toBe(BROKER_CARRIER_AGREEMENT);
  });

  it("the archived version is a LITERAL and does not track BCA_VERSION", () => {
    // The single most important property. If the archived body followed
    // BCA_VERSION, the swap would carry it along, its text would change, and
    // the hashes it exists to preserve would stop re-deriving.
    expect(BROKER_CARRIER_AGREEMENT_2026_06_27_V1.version).toBe(ARCHIVED_V);
    expect(BROKER_CARRIER_AGREEMENT_2026_06_27_V1.effectiveNote).toContain(ARCHIVED_V);
    if (BCA_VERSION !== ARCHIVED_V) {
      expect(
        BROKER_CARRIER_AGREEMENT_2026_06_27_V1.version,
        "the archived body followed BCA_VERSION when it moved",
      ).not.toBe(BCA_VERSION);
    }
  });

  it("the archived text carries no interpolated constant", () => {
    // The live body resolves the paperwork deadline from PAPERWORK_DUE_HOURS so
    // the clause and the Compass grading window cannot drift apart. An archive
    // must not track a moving constant: the value is frozen at what it read
    // when these signatures were taken.
    const flat = JSON.stringify(BROKER_CARRIER_AGREEMENT_2026_06_27_V1);
    expect(flat).toContain("within 24 hours of delivery");
    expect(flat, "an unresolved placeholder reached the archived text").not.toContain("${");
  });

  it("the archived content hash is pinned", () => {
    // Fixed carrier and signature, so this moves only when the archived TEXT
    // moves. That is the tripwire: any edit to a body nobody should be editing
    // fails here by name.
    const h = agreementContentHash(BROKER_CARRIER_AGREEMENT_2026_06_27_V1, {
      carrier: CARRIER,
      signature: SIGNATURE,
    });
    expect(
      h,
      "the archived 2026-06-27-v1 text changed. It is the text two carriers signed; " +
        "their stored hashes no longer re-derive. Revert rather than updating this pin.",
    ).toBe("af6617df6cb9d54b0c54f834612e99675047017153b1ef7d78c05e330a60b183");
  });

  it("archived and current are genuinely different objects (vacuity tripwire)", () => {
    // Before the swap these hold the same text, so this asserts identity rather
    // than content -- after the swap it also catches an archive that quietly
    // became an alias for the live body.
    expect(BROKER_CARRIER_AGREEMENT_2026_06_27_V1).not.toBe(BROKER_CARRIER_AGREEMENT);
  });
});
