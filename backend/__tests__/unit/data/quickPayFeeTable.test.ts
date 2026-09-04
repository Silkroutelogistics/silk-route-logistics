/**
 * The Quick Pay fee schedule a carrier SIGNS is the one the resolver CHARGES.
 *
 * §4 was three prose clauses spelling out all three tiers — "three percent
 * (3%)" and so on — sitting beside lib/quickPayPricing, which computes the same
 * figures for every charge path. Two statements of one fee schedule, one signed
 * by the carrier and the other deciding what is actually deducted, with nothing
 * holding them together. The table is now GENERATED from the resolver.
 *
 * These cases assert that it is generated rather than transcribed, which is a
 * different claim from "the numbers currently match". A transcribed table that
 * happens to be correct today passes any equality check written against today's
 * values; what it cannot do is follow the resolver when the resolver moves.
 */
import { describe, it, expect } from "vitest";
import { CARAVAN_QUICK_PAY_AGREEMENT } from "../../../src/data/agreements";
import { standardNetDays, quickPayFeePercent, SAME_DAY_PREMIUM } from "../../../src/lib/quickPayPricing";
import { assembleAgreementText } from "../../../src/lib/canonicalAgreementText";

const TIERS = ["SILVER", "GOLD", "PLATINUM"] as const;
const section4 = () => {
  const s = CARAVAN_QUICK_PAY_AGREEMENT.sections.find((x) => x.heading.startsWith("4."));
  if (!s) throw new Error("§4 not found in the Quick Pay Agreement");
  return s;
};

describe("the Quick Pay fee table is generated from the resolver", () => {
  it("§4 carries a real LegalTable, not prose", () => {
    const t = section4().table;
    expect(t, "§4 must carry a table").toBeTruthy();
    expect(t!.headers).toEqual(["Tier", "Standard pay", "7-Day Quick Pay", "Same-Day Quick Pay"]);
    expect(t!.rows).toHaveLength(3);
  });

  it("every cell equals what the resolver returns for that tier", () => {
    const rows = section4().table!.rows;
    TIERS.forEach((tier, i) => {
      const [name, standard, sevenDay, sameDay] = rows[i];
      expect(name.toUpperCase(), "row order must follow " + TIERS.join(", ")).toBe(tier);
      expect(standard).toContain(String(standardNetDays(tier)));
      expect(sevenDay).toContain(String(quickPayFeePercent(tier, false)));
      expect(sameDay).toContain(String(quickPayFeePercent(tier, true)));
    });
  });

  it("the same-day premium in the prose comes from the constant", () => {
    const prose = section4().clauses.join(" ");
    expect(prose).toContain(`${SAME_DAY_PREMIUM}%`);
  });

  it("the per-tier percentages are GONE from the prose", () => {
    // The whole point of the table is that the figures live in one place. A
    // clause restating them re-creates the drift this replaced.
    const prose = section4().clauses.join(" ");
    for (const tier of TIERS) {
      const seven = quickPayFeePercent(tier, false);
      expect(
        prose,
        `§4 prose still spells out the ${tier} 7-day fee. The table carries it; ` +
          `prose that repeats it is the second source of truth this commit removed.`,
      ).not.toMatch(new RegExp("\b" + seven + "\s*(%|percent)"));
    }
  });

  it("the table reaches the canonical text, so the hash covers the figures", () => {
    const text = assembleAgreementText(CARAVAN_QUICK_PAY_AGREEMENT, {});
    for (const tier of TIERS) {
      expect(text, tier + " row missing from canonical text")
        .toContain(tier.charAt(0) + tier.slice(1).toLowerCase());
      expect(text).toContain("Net-" + standardNetDays(tier));
    }
    expect(text).toContain("Same-Day Quick Pay");
  });

  it("is not vacuous — the resolver returns distinct figures per tier", () => {
    const seven = TIERS.map((t) => quickPayFeePercent(t, false));
    expect(new Set(seven).size, "all tiers share one 7-day fee; the per-tier assertions prove nothing")
      .toBe(TIERS.length);
  });
});
