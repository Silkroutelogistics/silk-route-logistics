/**
 * The carrier form's Send button and the server's 422 read one predicate.
 *
 * v3.8.bbz. The card that renders this lives inside a Next page file, which
 * cannot export the component for a render test without breaking the page's
 * export typing, so the decision is a pure function in the shared module and
 * is pinned here; the page passes its state straight in. The server gate
 * (v3.8.bby) is tested over the real router in the backend suite; this is the
 * client half, and the set both halves read is the same export.
 */
import { describe, it, expect } from "vitest";
import {
  canSubmitInfoRequestAnswer,
  requiresAttachment,
  INFO_REQUEST_REQUIRES_ATTACHMENT,
  INFO_REQUEST_CATEGORIES,
} from "@shared/constants/infoRequestCategories";

describe("canSubmitInfoRequestAnswer", () => {
  it("a document request with no file cannot be sent", () => {
    expect(canSubmitInfoRequestAnswer({ note: "Doc attached", fileCount: 0, requiresAttachment: true })).toBe(false);
  });
  it("a document request with a file can be sent", () => {
    expect(canSubmitInfoRequestAnswer({ note: "Doc attached", fileCount: 1, requiresAttachment: true })).toBe(true);
  });
  it("a prose request with no file can be sent", () => {
    expect(canSubmitInfoRequestAnswer({ note: "Here are two references…", fileCount: 0, requiresAttachment: false })).toBe(true);
  });
  it("an empty or whitespace note cannot be sent, file or not", () => {
    expect(canSubmitInfoRequestAnswer({ note: "", fileCount: 1, requiresAttachment: true })).toBe(false);
    expect(canSubmitInfoRequestAnswer({ note: "   ", fileCount: 0, requiresAttachment: false })).toBe(false);
  });
  it("an in-flight submission blocks a second click", () => {
    expect(canSubmitInfoRequestAnswer({ note: "x", fileCount: 1, requiresAttachment: true, pending: true })).toBe(false);
  });
});

describe("the required set is the ratified five, and every category has a verdict", () => {
  it("is exactly COI, W-9, authority letter, voided check, proof of address", () => {
    expect([...INFO_REQUEST_REQUIRES_ATTACHMENT].sort()).toEqual(
      ["ADDRESS_PROOF", "AUTHORITY_LETTER", "COI_UPDATE", "VOIDED_CHECK", "W9_UPDATE"],
    );
  });
  it("every category resolves to a boolean, none is undefined", () => {
    for (const c of INFO_REQUEST_CATEGORIES) expect(typeof requiresAttachment(c)).toBe("boolean");
    expect(INFO_REQUEST_CATEGORIES.filter(requiresAttachment)).toHaveLength(5);
  });
  it("an unknown category is not required — the server would 400 it first", () => {
    expect(requiresAttachment("NOT_A_CATEGORY")).toBe(false);
  });
});
