/**
 * Slice 2 — RC terms version (decision 5) and the explicit electronic-records
 * consent step (decision 10).
 *
 * The consent field MUST be declared on both signing schemas. validateBody
 * replaces req.body with the parsed result and z.object() strips undeclared
 * keys, so an undeclared field arrives as undefined — and since the handlers
 * block on it being true, EVERY execution would fail with the consent reason
 * while the client was sending it correctly. That is Sub-pattern 5, and the
 * TONU 422 shipped in exactly that shape. The first two cases here exist to
 * make that failure loud rather than mysterious.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

import { RC_TERMS_VERSION, CURRENT_VERSIONS } from "../../../src/lib/agreementVersions";

const SRC = path.resolve(__dirname, "../../../src");
const carrierAuth = fs.readFileSync(path.join(SRC, "routes/carrierAuth.ts"), "utf8");
const rcController = fs.readFileSync(path.join(SRC, "controllers/rateConfirmationController.ts"), "utf8");
const pdfService = fs.readFileSync(path.join(SRC, "services/pdfService.ts"), "utf8");
const chrome = fs.readFileSync(path.join(SRC, "lib/srl-chrome.ts"), "utf8");
const agreementPdf = fs.readFileSync(path.join(SRC, "services/agreementPdfService.ts"), "utf8");

describe("consent field is DECLARED on both schemas — or every execution blocks", () => {
  it("signBcaSchema declares electronicRecordsConsent", () => {
    const schema = carrierAuth.slice(
      carrierAuth.indexOf("const signBcaSchema"),
      carrierAuth.indexOf("router.post(\"/sign-bca\""),
    );
    expect(schema, "undeclared => stripped => every sign-bca blocks on a consent the client sent")
      .toContain("electronicRecordsConsent");
  });

  it("quickPayElectionSchema declares electronicRecordsConsent", () => {
    const schema = carrierAuth.slice(
      carrierAuth.indexOf("const quickPayElectionSchema"),
      carrierAuth.indexOf("router.post(\"/quickpay-election\""),
    );
    expect(schema).toContain("electronicRecordsConsent");
  });
});

describe("consent blocks execution with the named reason", () => {
  it("both handlers refuse with 'Electronic records consent not given'", () => {
    const hits = carrierAuth.split("Electronic records consent not given").length - 1;
    expect(hits, "expected the BCA and QP handlers to each carry the named reason").toBe(2);
    expect(carrierAuth).toContain("ELECTRONIC_RECORDS_CONSENT_REQUIRED");
  });

  it("both gate on === true, so absent and false both block", () => {
    // `!== true` rather than a falsy check: undefined (stripped/absent) and
    // false must behave identically, and a truthy non-boolean must not pass.
    const gates = carrierAuth.split("req.body.electronicRecordsConsent !== true").length - 1;
    expect(gates).toBe(2);
  });

  it("the QP gate only applies when ENABLING — opting out needs no consent", () => {
    expect(carrierAuth).toContain("if (enabled && req.body.electronicRecordsConsent !== true)");
  });
});

describe("consentAt is server time, never body-supplied", () => {
  it("both handlers assign it from the request's own clock", () => {
    // `now` is the single new Date() per request that already stamps signedAt,
    // so consent and signature carry the same instant and cannot disagree.
    const assigns = carrierAuth.split("const consentAt = now").length - 1;
    expect(assigns).toBe(2);
  });

  it("nothing reads a consentAt off the request body", () => {
    expect(carrierAuth).not.toContain("req.body.consentAt");
    expect(carrierAuth).not.toContain("body.consentAt");
  });

  it("a body carrying consentAt is ignored — it is not on either schema", () => {
    // Zod strips it, so it cannot reach the handler even if a client sends it.
    const bcaSchema = carrierAuth.slice(
      carrierAuth.indexOf("const signBcaSchema"),
      carrierAuth.indexOf("router.post(\"/sign-bca\""),
    );
    const qpSchema = carrierAuth.slice(
      carrierAuth.indexOf("const quickPayElectionSchema"),
      carrierAuth.indexOf("router.post(\"/quickpay-election\""),
    );
    expect(bcaSchema).not.toContain("consentAt");
    expect(qpSchema).not.toContain("consentAt");
  });

  it("is persisted on the signature row by both paths", () => {
    expect(carrierAuth.split("consentAt,").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("is rendered beneath the signature with the awj UTC discipline", () => {
    // RE-ANCHORED in v3.8.awo. The attestation moved into the canonical assembly
    // the renderer consumes, so the sentence that is hashed and the sentence
    // that is drawn are one construction. Same guarantee — UTC-labelled, ISO
    // instant, and OMITTED rather than faked when absent.
    const canonical = fs.readFileSync(path.join(SRC, "lib/canonicalAgreementText.ts"), "utf8");
    expect(canonical).toContain("Electronic records and signatures consented to on");
    expect(canonical).toContain("iso(sig.consentAt)");
    // Conditional, so an execution with no recorded consent renders no line.
    expect(canonical).toContain("sig.consentAt");
    // And the renderer draws that segment rather than rebuilding it.
    expect(agreementPdf).toContain('seg("attestation")');
  });
});

describe("RC terms version", () => {
  it("is a constant alongside BCA and QP", () => {
    expect(RC_TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}-v\d+$/);
  });

  it("is NOT a CURRENT_VERSIONS entry", () => {
    // assessVersions reports any CURRENT_VERSIONS key with no signed
    // CarrierAgreement row as `missing`, and no agreement row is ever a rate
    // confirmation. Adding it there would mark EVERY carrier as missing a
    // document that cannot exist.
    expect(Object.keys(CURRENT_VERSIONS)).toEqual(["broker-carrier", "quick-pay"]);
    expect(Object.values(CURRENT_VERSIONS)).not.toContain(RC_TERMS_VERSION);
  });

  it("is stamped at ISSUANCE, not at render", () => {
    const send = rcController.slice(rcController.indexOf("export async function sendRateConfirmation"));
    expect(send).toContain("rcTermsVersion: RC_TERMS_VERSION");
    // The renderer must not reach for the constant — that would report today's
    // version over yesterday's terms on a re-download.
    expect(pdfService).not.toContain("RC_TERMS_VERSION");
  });

  it("a re-send cannot restamp an already-issued document", () => {
    // The assertion above used to match a bare `rcTermsVersion:
    // RC_TERMS_VERSION,` and passed while the send handler restamped on EVERY
    // send -- so a re-send after a terms change wrote today's version over
    // yesterday's text, which is precisely what the comment above forbids one
    // layer up. The test named the property and checked a string.
    //
    // v3.8 commit 11b guards the stamp on `alreadyIssued`. This asserts the
    // guard rather than the literal, so the property cannot regress behind a
    // passing text match again.
    const send = rcController.slice(rcController.indexOf("export async function sendRateConfirmation"));
    const stampAt = send.indexOf("rcTermsVersion: RC_TERMS_VERSION");
    expect(stampAt).toBeGreaterThan(-1);
    const guarded = send.slice(Math.max(0, stampAt - 200), stampAt).includes("alreadyIssued");
    expect(guarded, "the terms version must be stamped only on first issuance").toBe(true);
  });

  it("is injected for render from the row, not stored in formData", () => {
    expect(rcController).toContain("rcTermsVersion: rc.rcTermsVersion ?? null,");
  });

  it("renders in the footer, and says 'unversioned' when the row has none", () => {
    expect(pdfService).toContain('termsVersion: fd.rcTermsVersion || "unversioned",');
    expect(chrome).toContain("Terms version ${termsVersion}");
  });

  it("the footer renders it on its own line, not appended to the identity line", () => {
    // Sub-pattern 8.a: the identity line measures ~190pt against a tagline
    // centred from ~268pt. Appending would overprint.
    // v3.8.azj — this asserted a local named `leftText` sitting above
    // `footerY + 4`. C5 dissolved that local into drawFooterContentLine, the
    // shared line used by both footers, so the name is gone while the property
    // it guarded is intact. Re-aimed at the property: the identity line renders
    // at footerY + 4 and the terms version at footerY + 13, on its own line
    // below it. Asserting the vanished variable would fail against correct code;
    // deleting the case would drop the only check that they are separate lines.
    const footer = chrome.slice(chrome.indexOf("export function drawFooter"));
    expect(footer).toContain("footerY + 13");
    expect(footer).toMatch(/drawFooterContentLine\([\s\S]*footerY \+ 4/);
    // and the shared line still draws the identity text it took over
    expect(chrome).toMatch(/function drawFooterContentLine\([\s\S]*MC# \$\{BRAND\.mc\}/);
  });

  it("other documents are unaffected — termsVersion is optional", () => {
    const footer = chrome.slice(chrome.indexOf("export function drawFooter"));
    expect(footer).toContain("termsVersion?: string | null;");
    expect(footer).toContain("if (termsVersion) {");
  });
});
