/** v3.8.asg — a document number that is DERIVED at print time is not allocated.
 *
 *  The two creators that fire on every delivered load — autoGenerateInvoice and
 *  createCarrierPayOnDelivery — wrote no srlDocNumber. The renderers' fallback
 *  derived `SRL-<stem>I` / `…P` at print time, so a customer or a carrier
 *  received a document that looked correctly numbered while the column stayed
 *  NULL.
 *
 *  That is worse than an unnumbered document, and this file pins why:
 *  nextDocumentNumber allocates by scanning `startsWith(stem + suffix)` on the
 *  STORAGE COLUMN. A NULL matches no prefix, so the scan cannot see the row, the
 *  next allocation on that load computes revision 1 again, and the @unique index
 *  cannot arbitrate because Postgres treats NULLs as distinct. Two documents on
 *  one load, printing the same number.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  formatDocumentNumber,
  parseDocumentRevision,
  resolveLoadStem,
  DOCUMENT_SUFFIX,
} from "../../../src/lib/documentNumber";

describe("document number suffixes", () => {
  it("gives each document type its own letter on a shared stem", () => {
    // The whole scheme: one stem, suffixed per document, so every document for a
    // load sorts together in any system that sorts a text column. A PREFIX scheme
    // (BOL-…, RC-…) destroys exactly that, which is why this is a suffix.
    expect(formatDocumentNumber("SRL-121485", "BOL")).toBe("SRL-121485B");
    expect(formatDocumentNumber("SRL-121485", "RATE_CONFIRMATION")).toBe("SRL-121485R");
    expect(formatDocumentNumber("SRL-121485", "INVOICE")).toBe("SRL-121485I");
    expect(formatDocumentNumber("SRL-121485", "SUPPLEMENTAL_INVOICE")).toBe("SRL-121485S");
    expect(formatDocumentNumber("SRL-121485", "SETTLEMENT")).toBe("SRL-121485P");
  });

  it("never gives the settlement and the supplemental invoice the same letter", () => {
    // A carrier and a customer must never be handed the same string for different
    // documents. P for pay, S for supplemental — the reason P was chosen.
    expect(DOCUMENT_SUFFIX.SETTLEMENT).not.toBe(DOCUMENT_SUFFIX.SUPPLEMENTAL_INVOICE);
  });

  it("omits the digit on revision 1 and shows it from revision 2", () => {
    expect(formatDocumentNumber("SRL-121485", "RATE_CONFIRMATION", 1)).toBe("SRL-121485R");
    expect(formatDocumentNumber("SRL-121485", "RATE_CONFIRMATION", 2)).toBe("SRL-121485R2");
  });

  it("refuses a nonsense revision rather than printing one", () => {
    expect(() => formatDocumentNumber("SRL-121485", "INVOICE", 0)).toThrow();
    expect(() => formatDocumentNumber("SRL-121485", "INVOICE", 1.5)).toThrow();
  });

  it("round-trips a number back to its revision", () => {
    expect(parseDocumentRevision("SRL-121485I", "SRL-121485", "INVOICE")).toBe(1);
    expect(parseDocumentRevision("SRL-121485I3", "SRL-121485", "INVOICE")).toBe(3);
  });

  it("does not mistake one document type's number for another's", () => {
    // SRL-121485S is a supplemental invoice. Read as a SETTLEMENT it must not
    // parse, or a re-issue would collide with a document already in a carrier's
    // hands.
    expect(parseDocumentRevision("SRL-121485S", "SRL-121485", "SETTLEMENT")).toBeNull();
    expect(parseDocumentRevision("SRL-121485P", "SRL-121485", "SUPPLEMENTAL_INVOICE")).toBeNull();
  });
});

describe("resolveLoadStem", () => {
  it("prefers the canonical load number over the legacy reference", () => {
    expect(resolveLoadStem({ loadNumber: "SRL-121485", referenceNumber: "OLD-1" })).toBe("SRL-121485");
  });

  it("falls back to the legacy reference for loads predating the generator", () => {
    expect(resolveLoadStem({ loadNumber: null, referenceNumber: "OLD-1" })).toBe("OLD-1");
  });

  it("returns null when a load has neither, so callers bill without a number", () => {
    // Refusing to invoice a customer over a missing internal reference would be
    // the wrong failure. Both creators build(null) in this case.
    expect(resolveLoadStem({ loadNumber: null, referenceNumber: null })).toBeNull();
    expect(resolveLoadStem(null)).toBeNull();
    expect(resolveLoadStem({ loadNumber: "   ", referenceNumber: null })).toBeNull();
  });
});
