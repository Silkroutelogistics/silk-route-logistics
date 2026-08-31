/**
 * Slice 3 — the executed copy reaches the signer, and the row says whether it did
 * (decision 6). The registration click-wrap row was halted — see the note at the
 * end of this file.
 *
 * The byte-equality case is the load-bearing one. PDF renders are NOT
 * byte-stable — the v3.8.awj audit got two different hashes for one agreement at
 * identical length — so emailing a REGENERATED copy would send the carrier a
 * different file than the one on record for that execution. The only way the two
 * can match is for the same Buffer to be used twice, and that is a structural
 * property of the call, not something a value assertion can check.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src");
const carrierAuth = fs.readFileSync(path.join(SRC, "routes/carrierAuth.ts"), "utf8");
const emailService = fs.readFileSync(path.join(SRC, "services/emailService.ts"), "utf8");
const aePage = fs.readFileSync(
  path.resolve(__dirname, "../../../../frontend/src/app/dashboard/carriers/page.tsx"), "utf8");

/** The delivery helper, extracted so its branches can be reasoned about. */
function helper(): string {
  const i = carrierAuth.indexOf("async function deliverExecutedCopy");
  expect(i, "deliverExecutedCopy not found").toBeGreaterThan(-1);
  return carrierAuth.slice(i, carrierAuth.indexOf("async function loadActivationProfile"));
}

describe("the executed copy is emailed at execution", () => {
  it("both execution paths deliver it", () => {
    expect(carrierAuth).toContain('documentTitle: "Broker-Carrier Agreement"');
    expect(carrierAuth).toContain('documentTitle: "Caravan Quick Pay Agreement"');
    expect(carrierAuth.split("await deliverExecutedCopy(").length - 1).toBe(2);
  });

  it("emails the SAME buffer that was stored — never a regeneration", () => {
    // Both call sites must pass `pdf: buf`, the variable already uploaded. A
    // second generateAgreementBuffer call anywhere in those blocks would mean
    // the emailed file and the stored file are different bytes for one signing.
    expect(carrierAuth.split("pdf: buf,").length - 1).toBe(2);
    // Exactly two generations in the whole file: one per execution path.
    expect(carrierAuth.split("generateAgreementBuffer(").length - 1).toBe(2);
  });

  it("sends from operations@ with the document and version in the subject, and no marketing", () => {
    const fn = emailService.slice(
      emailService.indexOf("export async function sendExecutedAgreementEmail"),
      emailService.indexOf("export async function sendCarrierTrainingCompletionEmail"),
    );
    expect(fn).toContain('replyTo: "operations@silkroutelogistics.ai"');
    expect(fn).toContain("`Executed ${params.documentTitle} — version ${params.version}`");
    expect(fn).toContain('contentType: "application/pdf"');
    // One line of body. No call-to-action button, no tracking link.
    expect(fn).not.toContain("href=");
    expect(fn.match(/<p /g)?.length ?? 0).toBe(1);
  });

  it("runs after the row commits and cannot roll the signature back", () => {
    // Both deliveries sit inside the post-response fire-and-forget block, after
    // the agreement create and after res.json.
    const bcaCreate = carrierAuth.indexOf("templateName: \"broker-carrier\",");
    const bcaDeliver = carrierAuth.indexOf("documentTitle: \"Broker-Carrier Agreement\"");
    expect(bcaCreate).toBeGreaterThan(-1);
    expect(bcaDeliver).toBeGreaterThan(bcaCreate);
    expect(carrierAuth.indexOf("res.status(201).json({ signed: true, agreement })")).toBeGreaterThan(bcaCreate);
  });
});

describe("the send report is persisted, and a failure is not swallowed", () => {
  it("success writes sent + sentAt and clears any prior error", () => {
    expect(helper()).toContain("executedCopySent: true, executedCopySentAt: new Date(), executedCopySendError: null");
  });

  it("failure writes the reason", () => {
    const h = helper();
    expect(h).toContain("executedCopySent: false");
    expect(h).toContain("executedCopySendError: reason");
  });

  it("NEVER throws — an error escaping would be eaten by the caller's .catch(() => {})", () => {
    const h = helper();
    expect(h).toContain("try {");
    expect(h).toContain("} catch (err: any) {");
    // Even the report-write failure is contained.
    expect(h).toContain(".catch(() => {");
  });

  it("a missing address is a recorded failure, not a silent skip", () => {
    expect(helper()).toContain('throw new Error("No email on file for the signer")');
  });

  it("the AE console surfaces a failure visibly", () => {
    expect(aePage).toContain("ag.executedCopySent === false");
    expect(aePage).toContain("Executed copy NOT delivered");
    expect(aePage).toContain("#9B2C2C"); // danger token, not a muted note
  });

  it("null is distinguishable from false on the surface", () => {
    // `=== false` and `=== true`, never truthiness: null means never attempted
    // and must not render as a failure.
    expect(aePage).toContain("ag.executedCopySent === true");
    expect(aePage).not.toContain("!ag.executedCopySent");
  });
});

/**
 * The registration-click-wrap agreement row (item 3) was HALTED, not shipped.
 * Two consequences the brief did not state, both verified before deciding:
 *
 *  1. The onboarding page collects NO electronic-records consent — grep returns
 *     zero. Writing consentAt there would record an ESIGN §101(c)
 *     acknowledgement that was never given. That is worse than the decorative
 *     checkbox refused in v3.8.awm: it manufactures the record rather than the
 *     appearance.
 *
 *  2. A SIGNED broker-carrier row satisfies the tender gate. Creating one at
 *     registration would make a carrier tenderable WITHOUT the in-portal
 *     signing that awm had just made consent-gated — undoing that guarantee one
 *     commit later.
 *
 * Both need a product decision (does onboarding collect consent, or is
 * registration assent recorded as something other than SIGNED). Surfaced in the
 * regression log; decision 9 stays open.
 */
