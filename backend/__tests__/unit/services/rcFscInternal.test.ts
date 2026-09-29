/**
 * v3.8.boi — FSC is fully internal (owner ruling 2026-09-29). The carrier
 * never sees it: not as a row on the rate confirmation, not in its total, not
 * in the Quick Pay fee base, and not on the signing page.
 *
 * Built on an OLDER draft that still carries an FSC — fuelSurcharge 310 and a
 * totalCharges that includes it — because that is the only shape on which the
 * old behaviour and the new one differ. A draft with FSC 0 would pass either.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { generateEnhancedRateConfirmation } from "../../../src/services/pdfService";
import { RC_FIXTURE, RC_FORM_DATA } from "../../fixtures/pdfPinFixtures";

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

const OLD_DRAFT = { ...RC_FORM_DATA, lineHaulRate: 4100, fuelSurcharge: 310, totalCharges: 4410, accessorials: [] };

describe("the printed rate confirmation carries no FSC", () => {
  it("prints no fuel-surcharge row, even when the draft holds one", async () => {
    const text = await render(OLD_DRAFT);
    expect(text).not.toContain(squash("Fuel surcharge"));
    expect(text).not.toContain("$310.00");
  }, 60_000);

  it("totals the rows it prints, not the draft's FSC-inclusive totalCharges", async () => {
    const text = await render(OLD_DRAFT);
    expect(text).not.toContain("$4,410.00");
    // Line haul row and the total card both read $4,100.00.
    expect(text.split("$4,100.00").length - 1).toBeGreaterThanOrEqual(2);
  }, 60_000);

  it("prices Quick Pay on the line haul alone", async () => {
    const text = await render({ ...OLD_DRAFT, quickPaySpeed: "SEVEN_DAY", quickPayFeePercent: 3 });
    expect(text).toContain("$123.00"); // 3% of 4,100 — not 3% of 4,410 ($132.30)
    expect(text).toContain("$3,977.00");
    expect(text).not.toContain("$132.30");
  }, 60_000);

  it("vacuity: the accessorial row still prints when there is one", async () => {
    const text = await render({ ...OLD_DRAFT, accessorials: [{ type: "Lumper", description: "Lumper", amount: 150 }] });
    expect(text).toContain("$150.00");
    expect(text).toContain("$4,250.00");
  }, 60_000);
});

describe("the RC editor neither collects nor sends an FSC", () => {
  const src = fs.readFileSync(
    path.join(__dirname, "../../../../frontend/src/components/loads/RateConfirmationModal.tsx"),
    "utf8",
  );
  it("has no FSC input, no FSC row in the summary, and no FSC in carrier pay", () => {
    expect(src).not.toMatch(/Fuel Surcharge \(\$\)/);
    expect(src).not.toMatch(/financials\.fuel\b/);
    expect(src).not.toMatch(/form\.fuelSurcharge/);
    expect(src).toMatch(/const totalCarrier = lineHaul \+ accTotal;/);
  });
  it("sends an explicit 0, so saving an older draft clears its FSC", () => {
    expect(src).toMatch(/fuelSurcharge: 0,/);
  });
});
