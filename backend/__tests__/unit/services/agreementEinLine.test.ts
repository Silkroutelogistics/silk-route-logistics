/**
 * The EIN line on an executed agreement (v3.8.blr).
 *
 * Owner, 2026-09-26: the EIN the carrier gave at onboarding fills the line, and
 * "if we are not able to automatically populate then we need to remove it".
 * So the line is present exactly when an EIN is on file.
 *
 * Asserted on the RENDERED pages, both agreements, both states. The EIN value
 * used here appears nowhere else in either document, so finding it proves the
 * field printed it (a value shared with another field would prove nothing).
 */
import { describe, it, expect } from "vitest";
import { generateAgreementBuffer, signatureRoles } from "../../../src/services/agreementPdfService";
import { BROKER_CARRIER_AGREEMENT, CARAVAN_QUICK_PAY_AGREEMENT } from "../../../src/data/agreements";
import { MASTER_AGREEMENT_SIGNATURE_ROLES } from "../../../src/lib/srl-chrome";
import { einDigits, formatEin, formatEinInput } from "../../../../shared/constants/ein";

const UNIQUE_EIN = "98-7654321";
const SIGNATURE = {
  signedByName: "Pat Pin", signedByTitle: "Owner",
  signedAt: new Date("2026-09-01T12:00:00.000Z"),
  signerIp: "203.0.113.10", version: "TEST",
  consentAt: new Date("2026-09-01T12:00:00.000Z"),
};
const carrier = (ein: string | null) => ({
  legalName: "Ein Test Carrier LLC", mcNumber: "MC-999002", dotNumber: "9990022", ein,
});

async function pageTexts(buf: Buffer): Promise<string[]> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const d = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise;
  const items: string[] = [];
  for (let p = 1; p <= d.numPages; p++) {
    const tc = await (await d.getPage(p)).getTextContent();
    for (const i of tc.items as any[]) {
      const s = String(i.str).trim();
      if (s) items.push(s);
    }
  }
  return items;
}

describe("EIN helper — one definition for the field, the route and the agreement", () => {
  it("accepts nine digits in either shape and nothing else", () => {
    expect(einDigits("123456789")).toBe("123456789");
    expect(einDigits("12-3456789")).toBe("123456789");
    expect(einDigits(" 12 3456789 ")).toBe("123456789");
    expect(einDigits("12-345678")).toBeNull();
    expect(einDigits("1234567890")).toBeNull();
    expect(einDigits("")).toBeNull();
    expect(einDigits(null)).toBeNull();
  });

  it("prints XX-XXXXXXX, and nothing for an incomplete value", () => {
    expect(formatEin("123456789")).toBe("12-3456789");
    expect(formatEin("12-3456789")).toBe("12-3456789");
    expect(formatEin("1234")).toBeNull();
    expect(formatEin(undefined)).toBeNull();
  });

  it("formats progressively as the carrier types, and caps at nine digits", () => {
    expect(formatEinInput("1")).toBe("1");
    expect(formatEinInput("12")).toBe("12");
    expect(formatEinInput("123")).toBe("12-3");
    expect(formatEinInput("12-3456789000")).toBe("12-3456789");
    expect(formatEinInput("ab12cd")).toBe("12");
  });
});

describe("signature roles follow the EIN", () => {
  it("with an EIN, the shared roles are used unchanged", () => {
    expect(signatureRoles(UNIQUE_EIN)).toBe(MASTER_AGREEMENT_SIGNATURE_ROLES);
  });

  it("without one, only the carrier's EIN field goes; everything else stays", () => {
    const roles = signatureRoles(null);
    expect(roles[0]).toEqual(MASTER_AGREEMENT_SIGNATURE_ROLES[0]);
    expect(roles[1].fields).toEqual(MASTER_AGREEMENT_SIGNATURE_ROLES[1].fields.filter((f) => f !== "EIN"));
    expect(roles[1].fields).not.toContain("EIN");
    // The shared constant is not mutated by the removal.
    expect(MASTER_AGREEMENT_SIGNATURE_ROLES[1].fields).toContain("EIN");
  });
});

describe.each([
  ["Broker-Carrier Agreement", BROKER_CARRIER_AGREEMENT],
  ["Quick Pay Agreement", CARAVAN_QUICK_PAY_AGREEMENT],
])("%s — the EIN line on the rendered pages", (_name, agreement) => {
  it("an executed copy with an EIN on file prints the label and the number", async () => {
    const items = await pageTexts(
      await generateAgreementBuffer(agreement, { carrier: carrier(UNIQUE_EIN), signature: SIGNATURE, shell: true }),
    );
    expect(items.length, "no text extracted — the harness is broken").toBeGreaterThan(50);
    expect(items.filter((s) => s === "EIN").length).toBe(1);
    expect(items.some((s) => s.includes(UNIQUE_EIN))).toBe(true);
  }, 30_000);

  it("an executed copy with no EIN on file omits the line entirely", async () => {
    const items = await pageTexts(
      await generateAgreementBuffer(agreement, { carrier: carrier(null), signature: SIGNATURE, shell: true }),
    );
    expect(items.length).toBeGreaterThan(50);
    // The rest of the carrier block is still there, so the absence is the EIN
    // line and not a missing block.
    expect(items.some((s) => s.includes("Ein Test Carrier LLC"))).toBe(true);
    expect(items.some((s) => s === "DOT #")).toBe(true);
    expect(items.filter((s) => s === "EIN")).toEqual([]);
  }, 30_000);

  it("an unsigned specimen has no EIN on file either, so it has no EIN line", async () => {
    const items = await pageTexts(await generateAgreementBuffer(agreement, { shell: true }));
    expect(items.some((s) => s === "MC #")).toBe(true);
    expect(items.filter((s) => s === "EIN")).toEqual([]);
  }, 30_000);
});
