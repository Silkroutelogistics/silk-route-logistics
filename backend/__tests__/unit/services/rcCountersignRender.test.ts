/**
 * The Rate Confirmation closes with its Agreement to be Bound, carries no
 * signature fields, and states SRL's countersignature only once it has one.
 *
 * v3.8.bls — owner, 2026-09-26: the binding clause goes at the end of the Rate
 * Confirmation "so no signature field for broker and carrier exists". Before
 * this the document ended in a two-column acceptance strip (ruled lines for a
 * carrier signatory and a broker cell reading "Countersigned electronically"),
 * and its acceptance clause pointed at "Carrier's signature below". A carrier
 * accepts through the signing link or by moving the freight, so the strip asked
 * for a mark this process never collects.
 *
 * Read out of the rendered bytes, because the source can be right about a
 * section the renderer never draws. Text is compared with whitespace removed on
 * both sides: headings render letter-spaced and the extractor splits runs, so a
 * plain toContain would fail on a correct page (§19 Sub-pattern 9).
 */
import { describe, it, expect } from "vitest";
import { generateEnhancedRateConfirmation, RC_AGREEMENT_TO_BE_BOUND } from "../../../src/services/pdfService";
import { RC_FIXTURE, RC_FORM_DATA } from "../../fixtures/pdfPinFixtures";
import { buildRcCountersign } from "../../../src/lib/rcCountersign";

const AT = new Date("2026-09-22T14:31:07.000Z");
const CS = buildRcCountersign(AT);
const squash = (s: string) => s.replace(/\s+/g, "");

async function render(fd: Record<string, unknown>): Promise<string> {
  // @ts-expect-error pdf-parse ships no bundled types
  const pdfParse = (await import("pdf-parse")).default;
  const chunks: Buffer[] = [];
  const stream = generateEnhancedRateConfirmation(RC_FIXTURE as never, fd as never);
  await new Promise<void>((res, rej) => {
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => res());
    stream.on("error", rej);
  });
  return squash(String((await pdfParse(Buffer.concat(chunks))).text));
}

const issued = () => render({ ...RC_FORM_DATA, rcCountersign: CS });
const draft = () => render({ ...RC_FORM_DATA });
const CLAUSE = squash(RC_AGREEMENT_TO_BE_BOUND);
const STATEMENT =
  "Countersigned for Silk Route Logistics Inc. by Wasi Haider, President on 2026-09-22 14:31 UTC, " +
  "applied automatically on issuance of this Rate Confirmation.";

describe.each([
  ["a draft", draft],
  ["an issued copy", issued],
])("%s closes with the Agreement to be Bound", (_label, get) => {
  it("carries the heading and the clause, word for word", async () => {
    const text = await get();
    expect(text).toContain(squash("AGREEMENT TO BE BOUND"));
    expect(text).toContain(CLAUSE);
    expect(text.split(CLAUSE).length - 1, "the clause is stated once").toBe(1);
  }, 60_000);

  it("the clause comes after every other section", async () => {
    const text = await get();
    const at = text.indexOf(CLAUSE);
    for (const earlier of ["GOVERNING TERMS", "Put the SRL load number on the invoice", "verify us independently"]) {
      const i = text.indexOf(squash(earlier));
      expect(i, `vacuity: "${earlier}" must be on the page`).toBeGreaterThan(-1);
      expect(at, `the clause must follow "${earlier}"`).toBeGreaterThan(i);
    }
  }, 60_000);

  it("has no signature fields and no return-by-email instruction", async () => {
    const text = await get();
    for (const pen of ["AUTHORIZED SIGNATORY", "Sign and return", "Countersigned electronically", "signature below"]) {
      expect(text, `"${pen}" is a signature field or asks for one`).not.toContain(squash(pen));
    }
  }, 60_000);

  it("states acceptance once: Governing Terms no longer carries its own clause", async () => {
    const text = await get();
    expect(text).not.toContain(squash("Acceptance: Carrier"));
    expect(text).not.toContain(squash("constitutes binding acceptance"));
  }, 60_000);
});

describe("SRL's countersignature is stated in full, and only once issued", () => {
  it("an issued copy states it after the clause, with the ISO instant", async () => {
    const text = await issued();
    const s = text.indexOf(squash(STATEMENT));
    expect(s, "the statement must be drawn").toBeGreaterThan(-1);
    expect(s, "the statement follows the clause").toBeGreaterThan(text.indexOf(CLAUSE));
    expect(text.split(squash(STATEMENT)).length - 1).toBe(1);
    expect(text).toContain(squash("Countersigned at (UTC, ISO 8601): 2026-09-22T14:31:07.000Z"));
  }, 60_000);

  it("a draft carries no statement", async () => {
    // The specimen rule: there is no countersignature until there is an
    // issuance, and a draft that printed one would assert an act that has not
    // happened.
    const text = await draft();
    expect(text).not.toContain(squash("Countersigned for"));
    expect(text).not.toContain(squash("Countersigned at (UTC, ISO 8601)"));
  }, 60_000);

  it("vacuity tripwire: the draft render is a real document", async () => {
    // Without this, every not.toContain above would pass on an empty string.
    const text = await draft();
    expect(text).toContain(squash("SILK ROUTE LOGISTICS INC."));
    expect(text.length).toBeGreaterThan(2000);
  }, 60_000);
});
