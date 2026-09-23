// A new render site must not be able to skip the dock-contact resolver.
//
// The bill of lading and the rate confirmation both printed the customer's
// BILLING contact when the load carried no stop contact of its own — SRL-121497
// prints "Monika Pape" on the document that sends a driver to Steuart
// Nutrition's dock. lib/stopContact replaced the guessing, and the wiring is
// five call sites across three files.
//
// Five is enough to forget one, and forgetting fails QUIETLY: the renderer
// reads `load.stopContacts?.shipper`, an un-wired site leaves that undefined,
// and the document simply renders a blank contact. No error, no type
// complaint — just a bill of lading with nobody on it. So the wiring is
// asserted here rather than left to memory.
//
// This is a SOURCE census, so it proves the call is written, not that it ran.
// What it runs was proven in stopContact.test.ts against the real resolver;
// what this adds is that every renderer is fed by it.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src");

const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8");

// Comments name the defect constantly in this codebase; a scanner that reads
// prose as code finds the old fallback in every explanation of why it is gone.
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

/** Files that render a BOL or an RC, and therefore must resolve contacts. */
const RENDER_CALLERS = [
  "controllers/pdfController.ts",
  "controllers/rateConfirmationController.ts",
];

const RENDERERS = /generate(BOLFromLoad|EnhancedRateConfirmation)\s*\(/g;

describe("every document renderer is fed by the dock-contact resolver", () => {
  it("the census is not vacuous — the renderers are actually found", () => {
    let total = 0;
    for (const f of RENDER_CALLERS) {
      total += (stripComments(read(f)).match(RENDERERS) ?? []).length;
    }
    // If a rename makes this zero, every assertion below passes for free.
    expect(total).toBeGreaterThanOrEqual(5);
  });

  for (const f of RENDER_CALLERS) {
    it(`${f} resolves stop contacts for every render call it makes`, () => {
      const code = stripComments(read(f));
      const renderCalls = (code.match(RENDERERS) ?? []).length;
      const resolveCalls = (code.match(/resolveStopContacts\s*\(/g) ?? []).length;
      expect(renderCalls).toBeGreaterThan(0);
      // One resolve per render. Fewer means a site was added without wiring;
      // the count is the thing that catches the sixth site nobody remembered.
      expect(resolveCalls).toBe(renderCalls);
      expect(code).toMatch(/from\s+"\.\.\/lib\/stopContact"/);
    });

    it(`${f} passes the resolved contacts into the renderer`, () => {
      const code = stripComments(read(f));
      expect(code).toMatch(/stopContacts/);
    });
  }
});

describe("neither document can reach a billing contact", () => {
  const pdfService = stripComments(read("services/pdfService.ts"));

  it("pdfService never reads a customer-level contact for a dock contact line", () => {
    // The exact two reads that shipped the defect:
    //   load.originContactName || load.customer?.contactName   (BOL)
    //   ... || load.customer?.phone                            (RC)
    expect(pdfService).not.toMatch(/customer\s*\??\.\s*contactName/);
    // `customer?.phone` had exactly one use and it was the RC's contact line.
    expect(pdfService).not.toMatch(/customer\s*\??\.\s*phone/);
  });

  it("both renderers read the resolved contacts instead", () => {
    const shipper = (pdfService.match(/stopContacts\s*\??\.\s*shipper/g) ?? []).length;
    const consignee = (pdfService.match(/stopContacts\s*\??\.\s*consignee/g) ?? []).length;
    // One pair in the BOL's renderParty, one pair in the RC's parties block.
    expect(shipper).toBeGreaterThanOrEqual(2);
    expect(consignee).toBeGreaterThanOrEqual(2);
  });

  it("the stripComments helper does not itself hide a real read", () => {
    // Guard the guard: a comment mentioning the old fallback must be stripped,
    // and a real line must survive. Without this, a broken stripper would make
    // the assertions above pass over code that still carries the defect.
    const sample = [
      "// load.customer?.contactName -- the old fallback, described",
      "/* load.customer?.phone in a block comment */",
      "const x = load.customer?.contactName;",
    ].join("\n");
    const stripped = stripComments(sample);
    expect(stripped).not.toMatch(/old fallback/);
    expect(stripped).not.toMatch(/block comment/);
    expect(stripped).toMatch(/const x = load\.customer\?\.contactName;/);
  });
});
