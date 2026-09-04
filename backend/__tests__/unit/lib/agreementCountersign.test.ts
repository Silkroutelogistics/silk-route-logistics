/**
 * SRL's countersignature is part of what was signed, and it is the BROKER's.
 *
 * Two properties, and they fail in different directions:
 *
 *   COVERED   the countersign is inside the content hash. A countersignature
 *             the hash does not cover is a line on a page that anyone could
 *             change without the document noticing — which is the whole reason
 *             assembleAgreementSegments exists.
 *
 *   SCOPED    it lands in the broker columns and never in the carrier's.
 *             signedByName / signedByTitle / signatureData record who the
 *             CARRIER sent; writing SRL into them would forge the carrier's
 *             signature on the company's own paper, and it would look entirely
 *             normal on the row.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import {
  assembleAgreementSegments, agreementContentHash, countersignText,
} from "../../../src/lib/canonicalAgreementText";
import { BROKER_CARRIER_AGREEMENT } from "../../../src/data/agreements";
import { SIGNATORY_NAME, SIGNATORY_TITLE } from "../../../src/config/authority";

const CARRIER = { legalName: "Pin Carrier LLC", mcNumber: "MC-999001", dotNumber: "9990011", ein: "99-9990011" };
const SIG = {
  signedByName: "Pat Pin", signedByTitle: "Owner",
  signedAt: new Date("2026-09-01T12:00:00.000Z"), signerIp: "203.0.113.10",
  version: "PINNED", consentAt: new Date("2026-09-01T12:00:00.000Z"),
};
const CS = { name: SIGNATORY_NAME, title: SIGNATORY_TITLE, at: new Date("2026-09-01T12:00:00.000Z") };

describe("the countersign is hashed, and it is the broker's", () => {
  it("an unsigned assembly carries no countersign segment", () => {
    const kinds = assembleAgreementSegments(BROKER_CARRIER_AGREEMENT, {}).map((s) => s.kind);
    expect(kinds).not.toContain("countersign");
  });

  it("the countersign is a segment, so the hash covers it", () => {
    const withOut = agreementContentHash(BROKER_CARRIER_AGREEMENT, { carrier: CARRIER, signature: SIG });
    const withIt = agreementContentHash(BROKER_CARRIER_AGREEMENT, { carrier: CARRIER, signature: SIG, countersign: CS });
    expect(withIt).not.toBe(withOut);

    const seg = assembleAgreementSegments(BROKER_CARRIER_AGREEMENT, { carrier: CARRIER, signature: SIG, countersign: CS })
      .find((s) => s.kind === "countersign");
    expect(seg, "the countersign segment is missing from the assembly").toBeTruthy();
    expect(seg!.text).toContain(SIGNATORY_NAME);
    expect(seg!.text).toContain(SIGNATORY_TITLE);
    // The ISO instant, so a reader can reconcile the page against the columns.
    expect(seg!.text).toContain("2026-09-01T12:00:00.000Z");
  });

  it("it sits between the witness line and the attestation", () => {
    // Order is arbitrary but must be FIXED: a moved segment is a changed hash
    // for an unchanged document.
    const kinds = assembleAgreementSegments(BROKER_CARRIER_AGREEMENT,
      { carrier: CARRIER, signature: SIG, countersign: CS }).map((s) => s.kind);
    expect(kinds.indexOf("countersign")).toBeGreaterThan(kinds.indexOf("witness"));
    expect(kinds.indexOf("countersign")).toBeLessThan(kinds.indexOf("attestation"));
  });

  it("the same countersign hashes the same twice", () => {
    expect(countersignText(CS)).toBe(countersignText({ ...CS }));
  });

  it("no write site puts the broker signatory in a CARRIER column", () => {
    // Structural, and it is the one that matters. Both acceptance paths write a
    // row carrying both parties; a transposed field is invisible in review and
    // invisible on the row.
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../src/routes/carrierAuth.ts"), "utf8",
    ).split("\r\n").join("\n");

    const carrierColumns = ["signedByName", "signedByTitle", "signatureData"];
    const offenders: string[] = [];
    src.split("\n").forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return;         // prose may name both
      if (!/SIGNATORY_(NAME|TITLE)|Countersign\.(name|title)/.test(line)) return;
      for (const col of carrierColumns) {
        // String.raw, NOT a bare template literal. In a template literal \\b is
        // the BACKSPACE escape and \\s is just s, so the first version of this
        // compiled to a regex matching a control character and flagged nothing.
        // The adversarial injection is what found it — the self-test above
        // passed throughout, because it used a regex LITERAL and the code under
        // test used a template. §19 Sub-pattern 16, in the guard itself.
        if (new RegExp(String.raw`\b${col}\s*:`).test(line)) {
          offenders.push(`carrierAuth.ts:${i + 1}  ${line.trim().slice(0, 88)}`);
        }
      }
    });
    expect(
      offenders,
      "the broker signatory is being written into a carrier signature column: " + offenders.join(" | "),
    ).toEqual([]);
  });

  it("the scanner is not vacuous (self-test)", () => {
    const bad = "      signedByName: bcaCountersign.name,";
    // Built the SAME WAY the scanner builds it. The first version of this
    // self-test used regex literals while the scanner used a template literal,
    // so it passed while the scanner matched nothing — a self-test that does
    // not share the construction it is testing proves nothing about it.
    expect(new RegExp(String.raw`\bsignedByName\s*:`).test(bad)).toBe(true);
    expect(/SIGNATORY_(NAME|TITLE)|Countersign\.(name|title)/.test(bad)).toBe(true);
    expect(/\bsignedByName\s*:/.test(bad)).toBe(true);
  });

  it("both acceptance paths actually write the broker columns", () => {
    // The complement: a guard that only bans is satisfied by writing nothing.
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../src/routes/carrierAuth.ts"), "utf8");
    expect((src.match(/counterSignedByName:/g) ?? []).length,
      "expected the BCA and Quick Pay paths to each write a countersignature").toBe(2);

    // EVERY hash call carries one. Counting occurrences of the identifier was
    // the first version, and it broke the moment B10 also passed the object to
    // the RENDER calls — a count is a proxy for the property, and the property
    // is that nothing hashes an agreement while omitting the countersignature
    // the row will go on to claim.
    const hashCalls = src.split("agreementContentHash(").slice(1)
      .map((tail) => tail.slice(0, tail.indexOf("});")));
    expect(hashCalls.length, "expected two agreementContentHash call sites").toBe(2);
    for (const call of hashCalls) {
      expect(call, "an agreementContentHash call omits the countersign").toContain("countersign:");
    }
  });
});
