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
  QP_VERSION,
  CARAVAN_QUICK_PAY_AGREEMENT,
} from "../../../src/data/agreements";
import { BROKER_CARRIER_AGREEMENT_2026_06_27_V1 } from "../../../src/data/archive/brokerCarrierAgreement.2026-06-27-v1";
import { CARAVAN_QUICK_PAY_AGREEMENT_2026_08_16_V4 } from "../../../src/data/archive/caravanQuickPayAgreement.2026-08-16-v4";
import { BROKER_CARRIER_AGREEMENT_2026_09_03_F11 } from "../../../src/data/archive/brokerCarrierAgreement.2026-09-03-F11";
import { CARAVAN_QUICK_PAY_AGREEMENT_2026_09_04_V5 } from "../../../src/data/archive/caravanQuickPayAgreement.2026-09-04-v5";
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

/**
 * THE QUICK PAY ARCHIVE.
 *
 * One carrier executed the QP at 2026-08-16-v4: AEROSWIFT LLC (MC-1692309),
 * signed by Stu Cook, President, on 2026-09-01. Not a test account — verified
 * read-only against production before the swap, contentHash and executed PDF
 * both present.
 *
 * WHY AEROSWIFT'S ACTUAL HASH IS NOT PINNED HERE. Re-deriving it requires that
 * row's real inputs, one of which is the signer's IP address. This codebase
 * keeps real IPs out of source deliberately — PIN_SIGNATURE uses 203.0.113.10,
 * which is RFC 5737 documentation space — and a carrier officer's IP committed
 * to git is there permanently for everyone with repo access. Not worth it for a
 * guarantee obtainable another way.
 *
 * So the split is: THIS file proves the archived text is FROZEN, using
 * synthetic inputs, which is the property that would break the verification;
 * and scripts/_readonly-qp-archive-verify.ts re-derives AEROSWIFT's actual
 * stored hash against production on demand. Run it before any future QP body
 * change. Today's run matched:
 *   a8592a8dc771cf03edfefc63a81b44d398b93a248f5962d1a2b33945860e3a53
 */
const QP_ARCHIVED_V = "2026-08-16-v4";
const QP_SIGNATURE = { ...SIGNATURE, version: QP_ARCHIVED_V };
/** Canonical hash of the ARCHIVED text under the synthetic inputs above. */
const QP_ARCHIVED_TEXT_HASH = "0f34e030ad2d3d38cb2e3a66668fe5018e78ed9fbb2468b969233c02e2e7d967";

describe("the archived Quick Pay body still resolves", () => {
  it("getAgreement resolves the archived QP version by name", () => {
    expect(getAgreement("quick-pay", QP_ARCHIVED_V)).toBe(CARAVAN_QUICK_PAY_AGREEMENT_2026_08_16_V4);
  });

  it("every alias resolves it too", () => {
    for (const alias of ["quick-pay", "quickpay", "qp"]) {
      expect(getAgreement(alias, QP_ARCHIVED_V), alias).toBe(CARAVAN_QUICK_PAY_AGREEMENT_2026_08_16_V4);
    }
  });

  it("no version still means the CURRENT QP body", () => {
    expect(getAgreement("quick-pay")).toBe(CARAVAN_QUICK_PAY_AGREEMENT);
  });

  it("an unknown QP version falls back to current rather than returning null", () => {
    expect(getAgreement("quick-pay", "1999-01-01-v0")).toBe(CARAVAN_QUICK_PAY_AGREEMENT);
  });

  it("the archived QP version is a LITERAL and does not track QP_VERSION", () => {
    expect(CARAVAN_QUICK_PAY_AGREEMENT_2026_08_16_V4.version).toBe(QP_ARCHIVED_V);
    expect(CARAVAN_QUICK_PAY_AGREEMENT_2026_08_16_V4.effectiveNote).toContain(QP_ARCHIVED_V);
    // Once QP_VERSION has moved, the archived body must NOT have moved with it.
    if (QP_VERSION !== QP_ARCHIVED_V) {
      expect(CARAVAN_QUICK_PAY_AGREEMENT_2026_08_16_V4.version).not.toBe(QP_VERSION);
      expect(CARAVAN_QUICK_PAY_AGREEMENT_2026_08_16_V4.effectiveNote).not.toContain(QP_VERSION);
    }
  });

  it("the archived QP text is FROZEN — its canonical hash does not move", () => {
    // Synthetic inputs. What is pinned is the TEXT: any edit to the archived
    // body changes this, which is exactly the change that would make
    // AEROSWIFT's stored hash un-derivable.
    const h = agreementContentHash(CARAVAN_QUICK_PAY_AGREEMENT_2026_08_16_V4, {
      carrier: CARRIER,
      signature: QP_SIGNATURE,
    });
    expect(
      h,
      "the archived Quick Pay body has changed. A signature was taken against " +
        "this text by a real carrier; editing it makes that signature " +
        "un-verifiable, which is the single failure this archive prevents.",
    ).toBe(QP_ARCHIVED_TEXT_HASH);
  });

  it("the CURRENT body diverges from the archive once the version has moved", () => {
    // Before the v5 bump these are the same text and this is a tautology; after
    // it, this is what shows the archive is load-bearing rather than decorative.
    if (QP_VERSION === QP_ARCHIVED_V) return;
    const h = agreementContentHash(CARAVAN_QUICK_PAY_AGREEMENT, { carrier: CARRIER, signature: QP_SIGNATURE });
    expect(h).not.toBe(QP_ARCHIVED_TEXT_HASH);
  });
});

/**
 * THE 2026-09-26 SWAP: Foundation Edition BCA (2026-09-03-F11) and Quick Pay v5
 * (2026-09-04-v5), replaced by BCA Revision 3 and Quick Pay Revision 6.
 *
 * Four carriers executed F11 and two executed v5. Before the swap every stored
 * contentHash on those rows was re-derived READ-ONLY against production from
 * these archived bodies and matched. Their real inputs are not pinned here for
 * the reason given above -- a signer's IP does not belong in source -- so these
 * pins use the same synthetic inputs and hold the property that would break
 * verification: the archived TEXT does not move.
 */

const F11 = "2026-09-03-F11";
const V5 = "2026-09-04-v5";
const sigFor = (version: string) => ({ ...SIGNATURE, version });

describe("the Foundation Edition BCA and Quick Pay v5 are archived", () => {
  it("both resolve by the version stored on their signature rows, through every alias", () => {
    expect(getAgreement("broker-carrier", F11)).toBe(BROKER_CARRIER_AGREEMENT_2026_09_03_F11);
    expect(getAgreement("bca", F11)).toBe(BROKER_CARRIER_AGREEMENT_2026_09_03_F11);
    for (const alias of ["quick-pay", "quickpay", "qp"]) {
      expect(getAgreement(alias, V5), alias).toBe(CARAVAN_QUICK_PAY_AGREEMENT_2026_09_04_V5);
    }
  });

  it("the archived versions are literals, not the moved constants", () => {
    expect(BROKER_CARRIER_AGREEMENT_2026_09_03_F11.version).toBe(F11);
    expect(CARAVAN_QUICK_PAY_AGREEMENT_2026_09_04_V5.version).toBe(V5);
    expect(BCA_VERSION).not.toBe(F11);
    expect(QP_VERSION).not.toBe(V5);
    const flat = JSON.stringify([BROKER_CARRIER_AGREEMENT_2026_09_03_F11, CARAVAN_QUICK_PAY_AGREEMENT_2026_09_04_V5]);
    expect(flat, "an unresolved placeholder reached an archived text").not.toContain("${");
    // The carrier-name placeholder arrived with Revision 3; a body signed before
    // it must not carry one, or filling it would move that body's hash.
    expect(flat).not.toContain("{{CARRIER}}");
  });

  it("the archived F11 text is FROZEN", () => {
    const h = agreementContentHash(BROKER_CARRIER_AGREEMENT_2026_09_03_F11, { carrier: CARRIER, signature: sigFor(F11) });
    expect(
      h,
      "the archived Foundation Edition text changed. Four carriers signed it; their stored hashes no " +
        "longer re-derive. Revert rather than updating this pin.",
    ).toBe("7cbe92a9051acc9c3d3ed4abddc40ada86aa4d24fd5a35768f456e92ab6f34db");
  });

  it("the archived Quick Pay v5 text is FROZEN", () => {
    const h = agreementContentHash(CARAVAN_QUICK_PAY_AGREEMENT_2026_09_04_V5, { carrier: CARRIER, signature: sigFor(V5) });
    expect(
      h,
      "the archived Quick Pay v5 text changed. Two carriers signed it; their stored hashes no longer " +
        "re-derive. Revert rather than updating this pin.",
    ).toBe("13265ab80560fb9142082b1365fb12b377861bf6784050eb3345c8474e26c2ef");
  });

  it("the current bodies are different documents from the ones archived", () => {
    // What makes the archive load-bearing rather than decorative.
    expect(agreementContentHash(BROKER_CARRIER_AGREEMENT, { carrier: CARRIER, signature: sigFor(F11) }))
      .not.toBe("7cbe92a9051acc9c3d3ed4abddc40ada86aa4d24fd5a35768f456e92ab6f34db");
    expect(agreementContentHash(CARAVAN_QUICK_PAY_AGREEMENT, { carrier: CARRIER, signature: sigFor(V5) }))
      .not.toBe("13265ab80560fb9142082b1365fb12b377861bf6784050eb3345c8474e26c2ef");
  });
});
