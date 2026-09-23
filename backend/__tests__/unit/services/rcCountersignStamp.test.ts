/**
 * SRL's countersignature on a Rate Confirmation must be in the BYTES, and the
 * only thing that puts it there is ORDER.
 *
 * THE DEFECT THIS EXISTS TO CATCH is one field over in the same function, and
 * it shipped: rcTermsVersion was rendered, hashed and stored, and written to
 * the row only afterwards, so the frozen artifact printed "unversioned" while
 * the row said otherwise (rcTermsVersionInBytes.test.ts). A rate confirmation
 * is FROZEN at issuance -- contentHash is over the stored PDF -- so a stamp
 * decided after the render is a stamp the document does not carry, and no
 * later write can reach it. The row would claim a countersignature the carrier
 * never received.
 *
 * So these assert the ORDER and the SINGLE STATEMENT rather than the intent,
 * for the same reason that test does. The render assertions are C2's; this is
 * the half that would still be true if the renderer drew nothing at all.
 *
 * Adversarially verified at authoring: moving the countersign declaration below
 * the render/hash turns the ordering case red by name.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const FILE = path.resolve(__dirname, "../../../src/controllers/rateConfirmationController.ts");
const SRC = fs.readFileSync(FILE, "utf8");

/**
 * Comment lines stripped. Every identifier below also appears in prose
 * immediately above the code that uses it, and a test that matched a comment
 * would pass on a file whose code had been gutted.
 */
const code = SRC.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

/**
 * Where the ISSUANCE render happens, scoped to sendRateConfirmation.
 *
 * This was `code.indexOf("generateEnhancedRateConfirmation(rc.load, {")` — a
 * literal that encoded the call's ARGUMENT SHAPE, so it returned -1 the moment
 * the first argument changed (v3.8.bhp wrapped it to pass resolved dock
 * contacts) and the ordering cases failed against code whose ordering was
 * intact. The anchor now scopes to the function and matches the CALL, which is
 * the thing being ordered. The file holds a second render in
 * downloadRateConfirmationPdf; the scope is what excludes it.
 */
function issuanceRenderIndex(): number {
  const fn = code.indexOf("export async function sendRateConfirmation");
  if (fn < 0) return -1;
  const next = code.indexOf("export async function", fn + 1);
  const end = next < 0 ? code.length : next;
  const hit = code.indexOf("generateEnhancedRateConfirmation(", fn);
  return hit < 0 || hit > end ? -1 : hit;
}

/** The `data: { ... }` of the single issuance update, so "same statement" is measurable. */
function issuanceUpdateBlock(): string {
  // Scoped to sendRateConfirmation. The file holds several
  // prisma.rateConfirmation.update calls and the first is not this one -- an
  // unscoped indexOf measured a different statement entirely.
  const fn = code.indexOf("export async function sendRateConfirmation");
  expect(fn, "issuance must exist").toBeGreaterThan(-1);
  const start = code.indexOf("await prisma.rateConfirmation.update({", fn);
  expect(start, "the issuance update must exist").toBeGreaterThan(-1);
  const end = code.indexOf("\n  });", start);
  expect(end, "the issuance update must close").toBeGreaterThan(start);
  return code.slice(start, end);
}

describe("the Rate Confirmation countersignature is in the frozen bytes", () => {
  it("is decided BEFORE the render, and before the hash that covers it", () => {
    const decided = code.indexOf("const countersignAtIssuance");
    const render = issuanceRenderIndex();
    const hashed = code.indexOf("contentHash = hashPdfBytes(pdfBuffer)");
    const written = code.indexOf("counterSignedByName:");

    expect(decided, "the countersign must be decided at issuance").toBeGreaterThan(-1);
    expect(render, "the issuance render must exist").toBeGreaterThan(-1);
    expect(hashed, "the bytes must be hashed").toBeGreaterThan(-1);
    expect(written, "the columns must be written").toBeGreaterThan(-1);

    expect(decided, "decided before the render, or the document does not carry it").toBeLessThan(render);
    expect(render, "hashed after the render, so the hash covers what was drawn").toBeLessThan(hashed);
    expect(hashed, "written after the hash it describes").toBeLessThan(written);
  });

  it("reaches the renderer, so the document and the row cannot disagree", () => {
    const render = issuanceRenderIndex();
    const close = code.indexOf("});", render);
    expect(code.slice(render, close)).toContain("rcCountersign: countersignAtIssuance");
  });

  it("is written in the SAME statement as the hash of the bytes that carry it", () => {
    const block = issuanceUpdateBlock();
    expect(block, "the hash and the stamp must land together").toContain("contentHash,");
    expect(block).toContain("counterSignedByName: countersignAtIssuance.name");
    expect(block).toContain("counterSignedByTitle: countersignAtIssuance.title");
    expect(block).toContain("counterSignedAt: countersignAtIssuance.at");
  });

  it("a re-send does not restamp, for the reason the terms version does not", () => {
    // A re-send serves the FROZEN bytes. Restamping would move the row off the
    // instant the document was drawn and away from the only bytes that carry it.
    const block = issuanceUpdateBlock();
    const guard = block.indexOf("alreadyIssued");
    const stamp = block.indexOf("counterSignedByName:");
    expect(guard, "the re-send guard must be in the update").toBeGreaterThan(-1);
    expect(guard, "the stamp must sit behind the guard").toBeLessThan(stamp);
  });

  it("never enters formData, so there is one persisted copy and it cannot drift", () => {
    // renderFormData states the rule for rateConNumber and rcTermsVersion:
    // one copy on the row, injected for render. The countersign follows it.
    const fdStart = code.indexOf("const issuedFormData");
    const fdEnd = code.indexOf("\n  };", fdStart);
    expect(fdStart).toBeGreaterThan(-1);
    expect(code.slice(fdStart, fdEnd), "the stamp must not be persisted into the JSON blob").not.toContain("rcCountersign");

    const rf = code.indexOf("function renderFormData");
    // Anchored past the PARAMETER TYPE LITERAL: it closes with a column-0
    // brace too, so a bare search for the next one ends the slice inside the
    // signature and reads the body as empty.
    const rfBody = code.indexOf("): Record<string, any> {", rf);
    expect(rfBody, "renderFormData must have a body").toBeGreaterThan(rf);
    const body = code.slice(rfBody, code.indexOf(String.fromCharCode(10) + "}", rfBody));
    expect(body, "the fallback re-render must inject it from the columns").toContain("rcCountersign:");
    expect(body, "all three columns or none").toContain("rc.counterSignedByName && rc.counterSignedByTitle && rc.counterSignedAt");
  });

  it("a draft is never stamped: issuance is the only writer", () => {
    const writes = code.split("counterSignedByName:").length - 1;
    expect(writes, "exactly one write site").toBe(1);
    const send = code.indexOf("export async function sendRateConfirmation");
    const create = code.indexOf("export async function createRateConfirmation");
    expect(create, "the draft creator must exist").toBeGreaterThan(-1);
    expect(code.indexOf("counterSignedByName:"), "the write must be inside issuance").toBeGreaterThan(send);
  });

  it("vacuity tripwire: the file was actually read", () => {
    expect(SRC.length).toBeGreaterThan(5000);
    expect(code).toContain("export async function sendRateConfirmation");
  });
});
