/**
 * The Documents panel's header and its rows read one number.
 *
 * v3.8.bcb. "DOCUMENTS (7)" over six rows, in production, because the count
 * was `docs.length` and the rows came from an exact-match category filter
 * with no catch-all. The seventh document was a Workers' Comp certificate.
 *
 * The parity assertions are the lock: the number the header shows must equal
 * the number of rows every group renders, over a fixture that includes the
 * exact types that used to vanish.
 */
import { describe, it, expect } from "vitest";
import { groupCarrierDocuments, isUncategorizedDocType, DOC_CATEGORIES, OTHER_KEY } from "./carrierDocumentGroups";

/** CJ MASTER FREIGHT's seven rows, plus two shapes that also used to vanish. */
const SEVEN = [
  { id: "1", docType: "W9" },
  { id: "2", docType: "COI" },
  { id: "3", docType: "AUTHORITY" },
  { id: "4", docType: "OTHER" },
  { id: "5", docType: "OTHER" },
  { id: "6", docType: "OTHER" },
  { id: "7", docType: "WORKERS_COMP" },
];
const NINE = [...SEVEN, { id: "8", docType: "INFO_REQUEST_RESPONSE" }, { id: "9", docType: null }];

const rowsRendered = <T extends { id: string }>(g: { groups: { docs: T[] }[] }) => g.groups.flatMap((x) => x.docs);

describe("groupCarrierDocuments", () => {
  it("the production seven: total is 7 and seven rows render", () => {
    const g = groupCarrierDocuments(SEVEN);
    expect(g.total).toBe(7);
    expect(rowsRendered(g)).toHaveLength(7);
  });

  it("parity: header count === rendered rows === input, for every fixture", () => {
    for (const docs of [[], SEVEN, NINE]) {
      const g = groupCarrierDocuments(docs);
      expect(g.total).toBe(docs.length);
      expect(rowsRendered(g)).toHaveLength(docs.length);
      expect(new Set(rowsRendered(g).map((d) => d.id)).size).toBe(docs.length); // no row twice
    }
  });

  it("WORKERS_COMP has its own group, labelled, and is not lumped under Other", () => {
    const g = groupCarrierDocuments(SEVEN);
    const wc = g.groups.find((x) => x.key === "WORKERS_COMP");
    expect(wc?.label).toBe("Workers' Comp");
    expect(wc?.docs.map((d) => d.id)).toEqual(["7"]);
  });

  it("a type the map does not name lands under Other beside the literal OTHER rows, and is flagged as uncategorized", () => {
    const g = groupCarrierDocuments(NINE);
    const other = g.groups.find((x) => x.key === OTHER_KEY)!;
    expect(other.docs.map((d) => d.id).sort()).toEqual(["4", "5", "6", "8", "9"]);
    expect(isUncategorizedDocType("INFO_REQUEST_RESPONSE")).toBe(true);
    expect(isUncategorizedDocType(null)).toBe(true);
    expect(isUncategorizedDocType("OTHER")).toBe(false);
    expect(isUncategorizedDocType("W9")).toBe(false);
  });

  it("groups render in category order and empty groups are omitted", () => {
    const g = groupCarrierDocuments(SEVEN);
    expect(g.groups.map((x) => x.key)).toEqual(["W9", "COI", "AUTHORITY", "WORKERS_COMP", "OTHER"]);
  });

  it("the category list is the same one the upload dropdown offers, and OTHER is last", () => {
    expect(DOC_CATEGORIES[DOC_CATEGORIES.length - 1].key).toBe(OTHER_KEY);
    expect(new Set(DOC_CATEGORIES.map((c) => c.key)).size).toBe(DOC_CATEGORIES.length);
  });
});
