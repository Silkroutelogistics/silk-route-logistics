/**
 * §21.2 ruling 6 — exact first, legacy SRL- exact with it, substring after.
 *
 * The cases that matter are the ones a flat substring OR gets wrong, and under
 * the bare scheme there are more of them than there used to be: a load number is
 * now a short run of digits, so "5001" is a substring of 50010 and 15001 and of
 * every accessorial number hanging off them.
 */
import { describe, it, expect } from "vitest";
import { buildDocumentSearch, excludingIds, runRankedSearch } from "../../../src/lib/documentSearch";
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
// The runner is where the two passes become one page. Its arithmetic is the
// part three hand-written copies would have got subtly different — whether a
// page straddling the boundary repeats a row, drops one, or comes up short.
describe("runRankedSearch", () => {
  function recorder(...responses: any[][]) {
    const calls: Array<{ where: any; skip: number; take: number }> = [];
    let n = 0;
    const findMany = async (where: any, skip: number, take: number) => {
      calls.push({ where, skip, take });
      const rows = responses[n++] ?? [];
      return rows.slice(skip, skip + take);
    };
    return { calls, findMany };
  }
  const ids = (rows: any[]) => rows.map((r) => r.id);
  const rowsOf = (...xs: string[]) => xs.map((id) => ({ id }));

  it("makes NO exact query when there is no term, and behaves as it always did", async () => {
    const { calls, findMany } = recorder(rowsOf("a", "b"));
    const out = await runRankedSearch({
      exact: null, substring: null, baseWhere: { status: "DRAFT" },
      skip: 0, take: 25, findMany, count: async () => 2,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0].where).toEqual({ status: "DRAFT" });
    expect(ids(out.rows)).toEqual(["a", "b"]);
    expect(out.total).toBe(2);
  });

  it("puts the exact hits at the front and fills the page from the substring pass", async () => {
    const { findMany } = recorder(rowsOf("x"), rowsOf("r1", "r2", "r3"));
    const out = await runRankedSearch({
      exact: { OR: [] }, substring: { OR: [] }, baseWhere: {},
      skip: 0, take: 3, findMany, count: async () => 3,
    });
    expect(ids(out.rows)).toEqual(["x", "r1", "r2"]);
    expect(out.total, "the exact hits must be counted in the total").toBe(4);
  });

  it("carries a page boundary that falls INSIDE the exact hits", async () => {
    // Two exact hits and a page size of 1: page 2 is the second exact hit, not
    // the first substring row. Getting this wrong drops a row silently.
    const { findMany } = recorder(rowsOf("x1", "x2"), rowsOf("r1"));
    const out = await runRankedSearch({
      exact: { OR: [] }, substring: { OR: [] }, baseWhere: {},
      skip: 1, take: 1, findMany, count: async () => 1,
    });
    expect(ids(out.rows)).toEqual(["x2"]);
  });

  it("offsets the substring pass by the exact hits already shown", async () => {
    // Page 2 with 2 exact hits and a page size of 2 starts the substring pass at
    // its own row 0 — not at row 2, which would skip rows nobody ever saw.
    const { calls, findMany } = recorder(rowsOf("x1", "x2"), rowsOf("r1", "r2"));
    const out = await runRankedSearch({
      exact: { OR: [] }, substring: { OR: [] }, baseWhere: {},
      skip: 2, take: 2, findMany, count: async () => 2,
    });
    expect(calls[1].skip).toBe(0);
    expect(ids(out.rows)).toEqual(["r1", "r2"]);
  });

  it("excludes the exact rows from the substring pass", async () => {
    const { calls, findMany } = recorder(rowsOf("x1"), []);
    await runRankedSearch({
      exact: { OR: [] }, substring: { OR: [{ n: 1 }] }, baseWhere: {},
      skip: 0, take: 10, findMany, count: async () => 0,
    });
    expect(JSON.stringify(calls[1].where)).toContain('"notIn":["x1"]');
  });

  it("returns total NULL when no count was asked for, never 0", async () => {
    // A board that reports no total must not be handed a number that reads as
    // "none found".
    const { findMany } = recorder(rowsOf("x"), rowsOf("r"));
    const out = await runRankedSearch({
      exact: { OR: [] }, substring: { OR: [] }, baseWhere: {},
      skip: 0, take: 500, findMany,
    });
    expect(out.total).toBeNull();
    expect(ids(out.rows)).toEqual(["x", "r"]);
  });

  it("bounds the exact fetch by the cap rather than the page size", async () => {
    const { calls, findMany } = recorder(rowsOf("x"), []);
    await runRankedSearch({
      exact: { OR: [] }, substring: { OR: [] }, baseWhere: {},
      skip: 0, take: 25, findMany, count: async () => 0, exactCap: 7,
    });
    expect(calls[0].take).toBe(7);
    expect(calls[0].skip).toBe(0);
  });
});
