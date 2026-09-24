/**
 * §21.2 ruling 6 — exact first, legacy SRL- exact with it, substring after.
 *
 * The cases that matter are the ones a flat substring OR gets wrong, and under
 * the bare scheme there are more of them than there used to be: a load number is
 * now a short run of digits, so "5001" is a substring of 50010 and 15001 and of
 * every accessorial number hanging off them.
 */
import { describe, it, expect } from "vitest";
import { buildDocumentSearch, excludingIds } from "../../../src/lib/documentSearch";
import { legacySearchForm, LEGACY_PREFIX } from "../../../src/lib/documentNumber";

const FIELDS = {
  numberFields: ["invoiceNumber", "srlDocNumber", "load.referenceNumber"],
  textFields: ["load.customer.name"],
};

describe("buildDocumentSearch", () => {
  it("matches the bare number exactly before anything else", () => {
    const { exact } = buildDocumentSearch("5001", FIELDS);
    expect(exact).toEqual({
      OR: [
        { invoiceNumber: { equals: "5001", mode: "insensitive" } },
        { invoiceNumber: { equals: "SRL-5001", mode: "insensitive" } },
        { srlDocNumber: { equals: "5001", mode: "insensitive" } },
        { srlDocNumber: { equals: "SRL-5001", mode: "insensitive" } },
        { load: { referenceNumber: { equals: "5001", mode: "insensitive" } } },
        { load: { referenceNumber: { equals: "SRL-5001", mode: "insensitive" } } },
      ],
    });
  });

  it("finds a legacy load from the digits an AE actually types", () => {
    // Nobody reading SRL-121485 off a printed page types the prefix.
    const { exact } = buildDocumentSearch("121485", FIELDS);
    const forms = (exact as any).OR.map((c: any) => c.invoiceNumber?.equals).filter(Boolean);
    expect(forms).toEqual(["121485", "SRL-121485"]);
  });

  it("does not double the prefix when the AE did type it", () => {
    const { exact } = buildDocumentSearch("SRL-121485", FIELDS);
    const forms = (exact as any).OR.map((c: any) => c.invoiceNumber?.equals).filter(Boolean);
    expect(forms).toEqual(["SRL-121485"]);
    expect(JSON.stringify(exact)).not.toContain("SRL-SRL-");
  });

  it("carries a suffixed document number through unchanged", () => {
    const { exact } = buildDocumentSearch("SRL-121485I", FIELDS);
    expect(JSON.stringify(exact)).toContain("SRL-121485I");
  });

  it("keeps text columns OUT of the exact pass and IN the substring pass", () => {
    // An exact match on a city name is noise: nobody pastes "Detroit" expecting
    // it ranked above a load number.
    const { exact, substring } = buildDocumentSearch("Detroit", FIELDS);
    expect(JSON.stringify(exact)).not.toContain("customer");
    expect(JSON.stringify(substring)).toContain("customer");
  });

  it("still matches everything the old flat OR matched", () => {
    // The substring pass IS the old behaviour. Ordering must not narrow what a
    // search finds — only what it puts first.
    const { substring } = buildDocumentSearch("500", FIELDS);
    expect(substring).toEqual({
      OR: [
        { invoiceNumber: { contains: "500", mode: "insensitive" } },
        { srlDocNumber: { contains: "500", mode: "insensitive" } },
        { load: { referenceNumber: { contains: "500", mode: "insensitive" } } },
        { load: { customer: { name: { contains: "500", mode: "insensitive" } } } },
      ],
    });
  });

  it("RETURNS NULL FOR A BLANK TERM, never an empty OR", () => {
    // { OR: [] } matches NOTHING in Prisma. A caller spreading that into its
    // where would show an empty table for an empty search box, which reads as
    // "you have no invoices" rather than "you have not searched yet".
    for (const blank of ["", "   ", null, undefined]) {
      expect(buildDocumentSearch(blank as any, FIELDS)).toEqual({ exact: null, substring: null });
    }
  });

  it("trims, so a pasted number with trailing space still matches exactly", () => {
    const { exact } = buildDocumentSearch("  5001  ", FIELDS);
    expect(JSON.stringify(exact)).toContain('"equals":"5001"');
  });
});

describe("excludingIds", () => {
  it("removes the exact hits so no row appears twice in one list", () => {
    const clause = { OR: [{ invoiceNumber: { contains: "5001" } }] };
    expect(excludingIds(clause, ["inv-1", "inv-2"])).toEqual({
      AND: [clause, { id: { notIn: ["inv-1", "inv-2"] } }],
    });
  });

  it("leaves the clause alone when the exact pass found nothing", () => {
    const clause = { OR: [{ invoiceNumber: { contains: "5001" } }] };
    expect(excludingIds(clause, [])).toBe(clause);
  });

  it("passes a null clause straight through", () => {
    expect(excludingIds(null, ["inv-1"])).toBeNull();
  });
});


// The legacy spelling lives in documentNumber because that module owns the
// scheme. The permanence guard is what makes that binding rather than tidy: it
// failed when this helper built the prefixed string itself, which is one place
// too many for a rule about what numbers look like.
describe("legacySearchForm", () => {
  it("prefixes a term that does not already carry it", () => {
    expect(legacySearchForm("121485")).toBe("SRL-121485");
    expect(legacySearchForm("121485I")).toBe("SRL-121485I");
  });

  it("returns null when the term is already legacy, so the prefix cannot double", () => {
    expect(legacySearchForm("SRL-121485")).toBeNull();
    expect(legacySearchForm("srl-121485")).toBeNull(); // AEs do not hold shift
  });

  it("returns null for a blank term", () => {
    for (const blank of ["", "   ", null, undefined]) {
      expect(legacySearchForm(blank as any)).toBeNull();
    }
  });

  it("trims before deciding, so a pasted term is not prefixed twice", () => {
    expect(legacySearchForm("  SRL-121485  ")).toBeNull();
    expect(legacySearchForm("  121485  ")).toBe("SRL-121485");
  });

  it("is the ONE definition of the prefix", () => {
    expect(LEGACY_PREFIX).toBe("SRL-");
    expect(legacySearchForm("5001")).toBe(LEGACY_PREFIX + "5001");
  });
});