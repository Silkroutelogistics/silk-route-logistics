/**
 * A carrier downloads the agreement they SIGNED, not the one that is current.
 *
 * WHAT THIS CAUGHT. GET /agreement/:type/pdf called getAgreement(type) with no
 * version, so it rendered the LIVE body while the attestation printed the
 * version actually signed. Reproduced on the one real Quick Pay carrier in
 * production: a single PDF carrying both "2026-09-04-v5" in the body and
 * "2026-08-16-v4" in the attestation. A carrier who signed v4 was shown v5 and
 * told they had signed it.
 *
 * WHY THE RENDER IS ASSERTED, NOT THE CALL. A source check that the route
 * passes `signed.version` proves an argument is threaded, not that a different
 * document comes out - and the failure mode here is precisely a document that
 * renders fine and says the wrong thing. So these read the pages (§19
 * Sub-pattern 16).
 *
 * THE THREE SOURCES, in order of fidelity: the stored copy (bytes generated and
 * hashed at signing) wins when it exists; the archived body re-rendered is the
 * fallback; and a signed version that resolves to a DIFFERENT body is refused,
 * because getAgreement silently falls back to the current body and re-serving
 * that fallback would reinstate the defect in the place it was removed from.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { generateAgreementBuffer } from "../../../src/services/agreementPdfService";
import {
  getAgreement,
  BROKER_CARRIER_AGREEMENT,
  CARAVAN_QUICK_PAY_AGREEMENT,
} from "../../../src/data/agreements";
import { PIN_CARRIER } from "../../fixtures/pdfPinFixtures";

const ROUTE = fs.readFileSync(
  path.resolve(__dirname, "../../../src/routes/carrierAuth.ts"),
  "utf8",
);
const code = ROUTE.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

/** The PDF download handler, from its router.get to the end of the handler. */
function handler(): string {
  const at = code.indexOf('router.get("/agreement/:type/pdf"');
  expect(at, "the agreement PDF route has moved or gone").toBeGreaterThan(-1);
  const end = code.indexOf('router.get("', at + 10);
  return code.slice(at, end > at ? end : at + 6000);
}

async function pages(buf: Buffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  let text = "";
  for (let p = 1; p <= doc.numPages; p++) {
    text += (await doc.getPage(p).then((pg) => pg.getTextContent()))
      .items.map((i) => (i as { str: string }).str).join(" ") + " ";
  }
  return text.replace(/\s+/g, " ");
}

/** The two templates, each with the version production actually holds signed. */
const CASES = [
  {
    template: "broker-carrier",
    archivedVersion: "2026-06-27-v1",
    live: BROKER_CARRIER_AGREEMENT,
    signedByName: "Pat Pin",
  },
  {
    template: "quick-pay",
    archivedVersion: "2026-08-16-v4",
    live: CARAVAN_QUICK_PAY_AGREEMENT,
    signedByName: "Stu Pin",
  },
] as const;

describe("agreement downloads are version-faithful", () => {
  it("the fixtures are meaningful: archived version differs from live (self-test)", () => {
    // Every case below is vacuous if the archived and live versions are equal —
    // "served the archived body" and "served the live body" would be the same
    // assertion. This is the tripwire for the day a version stops moving.
    for (const c of CASES) {
      expect(c.archivedVersion, c.template + ": archived == live, the cases prove nothing")
        .not.toBe(c.live.version);
      const archived = getAgreement(c.template, c.archivedVersion);
      expect(archived, c.template + ": the archived body no longer resolves").toBeTruthy();
      expect(archived!.version).toBe(c.archivedVersion);
    }
  });

  for (const c of CASES) {
    it(c.template + ": a carrier signed on an ARCHIVED version gets that body, never the live one", async () => {
      const executed = getAgreement(c.template, c.archivedVersion)!;
      const buf = await generateAgreementBuffer(executed, {
        carrier: PIN_CARRIER,
        signature: {
          signedByName: c.signedByName,
          signedByTitle: "Owner",
          signedAt: new Date("2026-09-01T12:00:00.000Z"),
          signerIp: "203.0.113.10",
          version: c.archivedVersion,
        },
        shell: true,
      } as never);
      const text = await pages(buf);

      expect(text.length, "the document extracted as empty — the probe is broken").toBeGreaterThan(500);
      expect(
        text,
        "the signed version is missing from the document the carrier receives",
      ).toContain(c.archivedVersion);
      expect(
        text,
        "the LIVE version string appears in a document signed on " + c.archivedVersion +
          " — body and attestation disagree, which is the defect this closed",
      ).not.toContain(c.live.version);
      expect(text).toContain(c.signedByName);
    }, 30_000);

    it(c.template + ": a carrier signed on the CURRENT version gets it unchanged", async () => {
      const buf = await generateAgreementBuffer(c.live, {
        carrier: PIN_CARRIER,
        signature: {
          signedByName: c.signedByName,
          signedByTitle: "Owner",
          signedAt: new Date("2026-09-04T12:00:00.000Z"),
          signerIp: "203.0.113.10",
          version: c.live.version,
        },
        shell: true,
      } as never);
      const text = await pages(buf);
      expect(text).toContain(c.live.version);
      expect(
        text,
        "an archived version string leaked into a document signed on the current one",
      ).not.toContain(c.archivedVersion);
    }, 30_000);

    it(c.template + ": an UNSIGNED carrier gets the live specimen", async () => {
      const buf = await generateAgreementBuffer(c.live, {
        carrier: PIN_CARRIER,
        shell: true,
      } as never);
      const text = await pages(buf);
      expect(text).toContain(c.live.version);
      expect(text, "an unsigned specimen names a signatory").not.toContain(c.signedByName);
      expect(text, "an unsigned specimen carries a countersignature").not.toContain("Countersigned for");
    }, 30_000);
  }

  it("the route resolves the SIGNED version, not the live one", () => {
    // The structural half. The render cases above cannot see which version the
    // ROUTE asks for — they are handed one. This is the assertion an injection
    // that reverts to versionless resolution has to fail, and it fails for both
    // templates at once because one line serves both.
    const h = handler();
    expect(
      h,
      "the route resolves the agreement without a version again. It will render " +
        "the live body under the signed attestation — for BOTH the " +
        "Broker-Carrier Agreement and the Quick Pay Agreement, since this one " +
        "line serves both templates.",
    ).toContain("getAgreement(req.params.type, signed.version)");
  });

  it("the route prefers the STORED copy when one exists", () => {
    // ASSERT THE CONDITION, NOT THE IDENTIFIER. The first version of this
    // checked that "signed.documentUrl" appeared somewhere in the handler, and
    // an injection of `if (false && signed.documentUrl)` PASSED it — the
    // string was still there while the branch was dead. §19 Sub-pattern 16, in
    // the guard rather than the code.
    const h = handler();
    expect(
      h,
      "the stored executed copy is no longer the first source, or its branch is " +
        "short-circuited — the carrier gets a re-render instead of the bytes " +
        "that were hashed at signing",
    ).toContain("if (signed.documentUrl) {");
    expect(h, "the stored copy is not streamed back").toContain("getFileStream(signed.documentUrl)");
  });

  it("an unarchived signed version is REFUSED, not silently downgraded", () => {
    // getAgreement falls back to the current body when a version is not
    // archived. Serving that fallback here would reinstate the defect in the
    // place it was removed from, so the route compares and refuses.
    const h = handler();
    expect(h).toContain("AGREEMENT_VERSION_UNARCHIVED");
    expect(
      h,
      "the route no longer checks that the resolved body IS the signed version",
    ).toMatch(/executed\.version\s*!==\s*signed\.version/);
  });

  it("the unsigned path still serves the live body", () => {
    // The complement: a route that served the archive unconditionally would
    // pass every case above and hand a specimen-seeking carrier nothing.
    const h = handler();
    expect(h).toContain("generateAgreementPdf(agreement, {");
  });
});
