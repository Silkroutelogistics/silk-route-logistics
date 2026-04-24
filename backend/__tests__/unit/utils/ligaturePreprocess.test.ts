import { describe, it, expect } from "vitest";
import { preserveLigatures } from "../../../src/utils/ligaturePreprocess";

const ZWNJ = "‌";

describe("preserveLigatures", () => {
  it("inserts ZWNJ between f and i in 'classified'", () => {
    expect(preserveLigatures("classified")).toBe(`classif${ZWNJ}ied`);
  });

  it("inserts ZWNJ between f and i in 'specified'", () => {
    expect(preserveLigatures("specified")).toBe(`specif${ZWNJ}ied`);
  });

  it("inserts ZWNJ between f and l in 'filed'", () => {
    expect(preserveLigatures("filed")).toBe(`f${ZWNJ}iled`);
  });

  it("handles multiple fi occurrences in one string", () => {
    expect(preserveLigatures("certifications and notifications")).toBe(
      `certif${ZWNJ}ications and notif${ZWNJ}ications`,
    );
  });

  it("handles ffi triple sequence in 'traffic'", () => {
    expect(preserveLigatures("traffic")).toBe(`traff${ZWNJ}ic`);
  });

  it("handles ffl triple sequence in 'shuffle'", () => {
    expect(preserveLigatures("shuffle")).toBe(`shuff${ZWNJ}le`);
  });

  it("leaves plain text unchanged", () => {
    expect(preserveLigatures("hello world")).toBe("hello world");
  });

  it("handles empty string", () => {
    expect(preserveLigatures("")).toBe("");
  });

  it("doesn't double-insert when ZWNJ already present", () => {
    const already = `f${ZWNJ}ield`;
    // This call will re-process — we don't guard against already-preprocessed
    // strings because the safe() wrapper always calls this exactly once
    // per input at the PDFKit input boundary. Document the behavior:
    // a pre-existing ZWNJ between f and i means no new substitution
    // will match (/fi/ no longer matches when the i is preceded by ZWNJ).
    expect(preserveLigatures(already)).toBe(already);
  });
});
