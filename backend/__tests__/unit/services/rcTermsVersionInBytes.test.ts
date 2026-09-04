/**
 * The terms version a Rate Confirmation PRINTS must be the one its row stores.
 *
 * WHAT THIS CAUGHT. `sendRateConfirmation` rendered the PDF, hashed it and
 * stored it, and only THEN wrote `rcTermsVersion` to the row. So the frozen
 * artifact — the bytes that are hashed, emailed, and served on every later
 * download — printed "Terms version unversioned" while the row said
 * 2026-08-31-v1. Found by downloading an issued RC through the carrier portal
 * route and reading the footer; the row and the document disagreed about the
 * terms the carrier was signing under.
 *
 * The code's own comment already claimed the version was "frozen with the
 * bytes". It was the ordering that defeated it, which is why this asserts the
 * ORDER rather than the intent.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { generateEnhancedRateConfirmation } from "../../../src/services/pdfService";
import { RC_FIXTURE, RC_FORM_DATA } from "../../fixtures/pdfPinFixtures";
import { RC_TERMS_VERSION } from "../../../src/lib/agreementVersions";

async function footerVersion(fd: Record<string, unknown>): Promise<string | null> {
  // @ts-expect-error pdf-parse ships no bundled types
  const pdfParse = (await import("pdf-parse")).default;
  const chunks: Buffer[] = [];
  const stream = generateEnhancedRateConfirmation(RC_FIXTURE as never, fd as never);
  await new Promise<void>((res, rej) => {
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => res());
    stream.on("error", rej);
  });
  const text = String((await pdfParse(Buffer.concat(chunks))).text).replace(/\s+/g, " ");
  const m = text.match(/Terms version ([^\s·]+)/);
  return m ? m[1] : null;
}

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../../../src/controllers/rateConfirmationController.ts"),
  "utf8",
);
const code = SRC.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

describe("the Rate Confirmation terms version is in the bytes", () => {
  it("the renderer prints the version it is given", async () => {
    expect(await footerVersion({ ...RC_FORM_DATA, rcTermsVersion: RC_TERMS_VERSION })).toBe(RC_TERMS_VERSION);
  }, 30_000);

  it("and says so honestly when there is none", async () => {
    // Not blank and not today's constant: an RC issued before the version
    // existed was issued under terms nobody recorded, and it should say that
    // rather than imply a version it cannot prove.
    expect(await footerVersion({ ...RC_FORM_DATA })).toBe("unversioned");
  }, 30_000);

  it("issuance puts the version into the rendered formData, BEFORE the render", () => {
    const decided = code.indexOf("const termsVersionAtIssuance");
    const inFormData = code.indexOf("rcTermsVersion: termsVersionAtIssuance");
    const render = code.indexOf("generateEnhancedRateConfirmation(rc.load");
    expect(decided, "the version must be decided at issuance").toBeGreaterThan(-1);
    expect(inFormData, "the rendered formData must carry the version").toBeGreaterThan(-1);
    expect(render, "the issuance render site has moved").toBeGreaterThan(-1);
    expect(
      inFormData,
      "the version must be written into formData BEFORE the PDF is rendered, or " +
        "the frozen artifact prints 'unversioned' while the row claims a version.",
    ).toBeLessThan(render);
  });

  it("the row is stamped with the same value the bytes were rendered with", () => {
    expect(
      code,
      "the update must stamp `termsVersionAtIssuance`, the value the render used. " +
        "Stamping RC_TERMS_VERSION separately lets the row and the bytes drift.",
    ).toContain("rcTermsVersion: termsVersionAtIssuance }");
  });
});
