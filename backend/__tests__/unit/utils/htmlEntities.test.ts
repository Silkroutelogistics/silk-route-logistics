import { describe, it, expect } from "vitest";
import { decodeHtmlEntities } from "../../../src/utils/htmlEntities";

describe("decodeHtmlEntities", () => {
  it("decodes hex numeric apostrophe", () => {
    expect(decodeHtmlEntities("Dry Van 53&#x27;")).toBe("Dry Van 53'");
  });

  it("decodes hex inside a longer string", () => {
    expect(decodeHtmlEntities("West O&#x27;Hare Avenue")).toBe("West O'Hare Avenue");
  });

  it("decodes decimal numeric references", () => {
    expect(decodeHtmlEntities("It&#39;s fine")).toBe("It's fine");
  });

  it("decodes common named entities", () => {
    expect(decodeHtmlEntities("A &amp; B")).toBe("A & B");
    expect(decodeHtmlEntities("&lt;tag&gt;")).toBe("<tag>");
    expect(decodeHtmlEntities("&quot;q&quot;")).toBe('"q"');
    expect(decodeHtmlEntities("&apos;x&apos;")).toBe("'x'");
  });

  it("leaves unknown entities intact", () => {
    expect(decodeHtmlEntities("&notanentity;")).toBe("&notanentity;");
  });

  it("handles null and undefined", () => {
    expect(decodeHtmlEntities(null)).toBe("");
    expect(decodeHtmlEntities(undefined)).toBe("");
  });

  it("passes through plain strings unchanged", () => {
    expect(decodeHtmlEntities("no entities here")).toBe("no entities here");
  });

  it("decodes non-BMP hex references", () => {
    expect(decodeHtmlEntities("&#x1F600;")).toBe("\u{1F600}");
  });
});
