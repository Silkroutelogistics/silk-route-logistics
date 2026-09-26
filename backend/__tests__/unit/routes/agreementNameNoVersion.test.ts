/**
 * Carriers see the agreements by name, never by version (2026-09-26) — the
 * backend half. The frontend half is agreementNames.test.ts beside the
 * activation page.
 *
 * Three backend strings reached a carrier with the version in them: the
 * per-load Quick Pay election sentence, the executed PDF's download and
 * attachment filenames, and the 409 shown when a signed version is missing
 * from the archive. The executed-copy email subject and body are pinned in
 * executedCopyDelivery.test.ts.
 *
 * What stays, deliberately: the version on the signature row, inside the
 * signed text (the effective note and the attestation line are hashed at
 * signature), in the executed PDF's document reference, and on the Quick Pay
 * election row. Those are the evidence of which text a carrier signed.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src");
const read = (p: string) => fs.readFileSync(path.join(SRC, p), "utf8");

describe("agreement names reach carriers without a version", () => {
  it("the Quick Pay election sentence names the agreement only", () => {
    const src = read("routes/carrierPayments.ts");
    const line = src.split(/\r?\n/).find((l) => l.includes("I elect this Quick Pay option"));
    expect(line, "attestation line not found").toBeTruthy();
    expect(line).toContain("under the Caravan Quick Pay Agreement. The fee");
    expect(line).not.toMatch(/version/i);
  });

  it("the executed PDF filenames carry no version", () => {
    const pdf = read("services/agreementPdfService.ts");
    const fn = pdf.slice(pdf.indexOf("export function agreementPdfFilename"));
    const body = fn.slice(0, fn.indexOf("\n}"));
    expect(body).toContain("return `${");
    expect(body).not.toContain("version");

    const auth = read("routes/carrierAuth.ts");
    expect(auth).toContain('fileName: "SRL-Broker-Carrier-Agreement.pdf"');
    expect(auth).toContain('fileName: "SRL-Caravan-Quick-Pay-Agreement.pdf"');
    expect(auth).not.toMatch(/fileName: `SRL-[\w-]+-\$\{/);
  });

  it("the unarchived-version 409 does not print the version to the carrier", () => {
    const auth = read("routes/carrierAuth.ts");
    const i = auth.indexOf('code: "AGREEMENT_VERSION_UNARCHIVED"');
    expect(i).toBeGreaterThan(-1);
    const block = auth.slice(auth.lastIndexOf("res.status(409)", i), i);
    expect(block).not.toMatch(/\$\{signed\.version\}/);
  });

  it("the version is still recorded where it is evidence", () => {
    const auth = read("routes/carrierAuth.ts");
    // Both signing paths still stamp the served version on the row.
    expect(auth).toContain("quickPayVersion: version");
    expect(read("lib/canonicalAgreementText.ts")).toContain("Agreement version ${sig.version}");
  });
});
