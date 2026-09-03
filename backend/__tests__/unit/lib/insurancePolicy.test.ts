/**
 * The insurance minimums a document PRINTS must be the ones SRL ENFORCES.
 *
 * The direction is the whole point and it is asymmetric. A gate that enforces
 * more than the Rate Confirmation printed is a carrier refused a load over a
 * figure they were never shown. That is the failure this guards, so the
 * assertion runs against a REAL RENDERED PDF rather than against a second copy
 * of the constant — comparing the constant to itself would pass while the
 * document printed anything at all (§19 Sub-pattern 16).
 *
 * The structural half matters too: three modules previously carried their own
 * literals, and nothing connected them. Re-introducing one is the regression,
 * so it is checked by name rather than left to review.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { INSURANCE_MINIMUMS, formatMinimum } from "../../../src/lib/insurancePolicy";
import { MIN_COVERAGE } from "../../../src/services/insuranceVerificationService";
import { generateEnhancedRateConfirmation } from "../../../src/services/pdfService";
import { RC_FIXTURE, RC_FORM_DATA } from "../../fixtures/pdfPinFixtures";

const SRC = path.resolve(__dirname, "../../../src");

/**
 * Rendered text via pdf-parse, which is what e2e/helpers/pdf.ts uses.
 *
 * The first version of this read inflated content streams directly and looked
 * for "Cargo:". It failed against a correct document: those streams are PDF
 * operators, and text drawn in an embedded subset font is not plain ASCII in
 * them. The extractor was wrong, not the render — verified by checking the same
 * document with pdf-parse, which finds the string.
 */
async function renderedText(doc: NodeJS.ReadableStream): Promise<string> {
  // @ts-expect-error pdf-parse ships no bundled types
  const pdfParse = (await import("pdf-parse")).default;
  const chunks: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => resolve());
    doc.on("error", reject);
  });
  const data = await pdfParse(Buffer.concat(chunks));
  return String(data.text).replace(/\s+/g, " ");
}
describe("insurance minimums are one fact", () => {
  it("the enforcing service reads the shared constant, not its own copy", () => {
    expect(MIN_COVERAGE).toBe(INSURANCE_MINIMUMS);
  });

  it("the Rate Confirmation PRINTS the enforced minimums", async () => {
    const text = await renderedText(generateEnhancedRateConfirmation(RC_FIXTURE, RC_FORM_DATA));

    // Self-test first. A broken extractor returns "" and every includes() below
    // would fail for the wrong reason, or — worse, if these were negated — pass.
    expect(text.length, "no inflatable content streams — the extractor is broken").toBeGreaterThan(1000);
    expect(text, "the requirements block should be on this document at all").toContain("Cargo:");

    for (const key of ["cargoInsurance", "autoLiability", "generalLiability"] as const) {
      const printed = formatMinimum(INSURANCE_MINIMUMS[key]);
      expect(
        text,
        `the Rate Confirmation must print ${printed} for ${key}. If this fails after a ` +
          `policy change, the document is promising a different minimum than the gate ` +
          `enforces — which is the carrier-facing half of the drift this constant exists ` +
          `to prevent.`,
      ).toContain(printed);
    }
  }, 30_000);

  it("no consumer re-introduces its own numeric literal", () => {
    // The three modules that previously each carried the figures. A literal here
    // is the exact regression: it compiles, renders, and silently disagrees.
    const consumers = [
      "services/pdfService.ts",
      "services/insuranceVerificationService.ts",
      "services/carrierVettingService.ts",
    ];
    const offenders: string[] = [];
    for (const rel of consumers) {
      const body = fs.readFileSync(path.join(SRC, rel), "utf8");
      body.split(/\r?\n/).forEach((line, i) => {
        if (/^\s*(\/\/|\*)/.test(line)) return; // prose may cite figures
        // A line that already READS the constant is correct even when it also
        // contains 1_000_000 — insuranceVerificationService divides by it to
        // print "$1M". Flagging those was the guard crying wolf on correct code.
        if (/(MIN_COVERAGE|INSURANCE_MINIMUMS)/.test(line)) return;
        if (!/(autoLiability|cargoInsurance|generalLiability|Liability|Insurance)/i.test(line)) return;
        if (/\b(1_000_000|1000000|100_000|100000)\b/.test(line)) {
          offenders.push(`${rel}:${i + 1}  ${line.trim().slice(0, 90)}`);
        }
      });
    }
    expect(
      offenders,
      "these lines carry an insurance-minimum literal instead of reading " +
        "INSURANCE_MINIMUMS from lib/insurancePolicy:\n  " + offenders.join("\n  "),
    ).toEqual([]);
  });

  it("the literal scanner is not vacuous (self-test)", () => {
    // If the pattern matched nothing regardless of input, the test above would
    // pass over a file that had reverted entirely.
    const sample = 'if (carrier.autoLiabilityAmount < 1000000) { deduct(); }';
    expect(/(autoLiability|cargoInsurance|generalLiability|Liability|Insurance)/i.test(sample)).toBe(true);
    expect(/\b(1_000_000|1000000|100_000|100000)\b/.test(sample)).toBe(true);
  });
});
