/**
 * The carrier receives the SHELL rendering of BOTH master agreements.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE PINS. `documentRenderPins` calls the
 * renderer directly with an explicit `shell` value, so it pins both variants
 * and is blind to which one the ROUTE asks for. Flipping a caller moves no pin
 * by construction - which is precisely why the flip needs a guard of its own.
 * Without this, `shell: true` could be reverted at any site and every pin,
 * every typecheck and the whole suite would stay green while carriers silently
 * went back to receiving the old document.
 *
 * THREE SITES, ONE ANSWER. The two stored executed copies (written at signing,
 * one per agreement) and the on-demand download must agree. A stored copy that
 * does not look like the copy the carrier can pull is two documents for one
 * agreement, and the one that counts in a dispute is whichever they happen to
 * be holding.
 *
 * WHAT CHANGED, and why the assertion inverted. This file used to require that
 * Quick Pay was NOT flipped, and that was right at the time: the flag was
 * conditional on the template because Quick Pay had no shell pin, and shipping
 * it through the shell would have restyled a second signed instrument on
 * evidence nobody had taken. That evidence now exists - quick-pay
 * 2026-08-16-v4 is archived as a frozen literal, both QP pins cover the shell
 * render, and quickPayCountersignParity proves the countersign block comes out
 * on the execution page. So the requirement is inverted rather than deleted:
 * reverting either agreement to the legacy render is now the regression.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { generateAgreementBuffer } from "../../../src/services/agreementPdfService";
import { BROKER_CARRIER_AGREEMENT, CARAVAN_QUICK_PAY_AGREEMENT } from "../../../src/data/agreements";
import { PIN_CARRIER, PIN_SIGNATURE } from "../../fixtures/pdfPinFixtures";
import { SIGNATORY_NAME, SIGNATORY_TITLE } from "../../../src/config/authority";

const ROUTE = fs.readFileSync(
  path.resolve(__dirname, "../../../src/routes/carrierAuth.ts"),
  "utf8",
);

/** Comments may discuss the flag; only code may set it. */
const code = ROUTE.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

/** The options object of a render call, from its opening brace to its close. */
function renderCall(needle: string): string {
  const at = code.indexOf(needle);
  expect(at, "render site has moved or gone: " + needle).toBeGreaterThan(-1);
  return code.slice(at, at + 900);
}

describe("the shell flip is wired at every carrier-facing site", () => {
  it("the on-demand download asks for the shell, unconditionally", () => {
    const call = renderCall("generateAgreementPdf(agreement, {");
    expect(
      call,
      "the carrier download route must request the shell. This route serves " +
        "BOTH master agreements and both are now flipped, so the flag is " +
        "unconditional - and a third agreement added later inherits the house " +
        "style rather than silently rendering in the retired one.",
    ).toContain("shell: true");
    expect(
      call,
      "the flag is conditional on the template again. Both agreements are " +
        "flipped; a condition here can only exclude one of them.",
    ).not.toContain("shell: agreement.templateName");
  });

  it("the stored executed BCA asks for the shell", () => {
    expect(
      renderCall("generateAgreementBuffer(BROKER_CARRIER_AGREEMENT"),
      "the executed copy stored at signing must render through the same shell " +
        "as the download, or the copy on file and the copy in hand are " +
        "different documents for one agreement.",
    ).toContain("shell: true");
  });

  it("the stored executed Quick Pay asks for the shell", () => {
    // INVERTED in v3.8.bad. This case previously required the opposite.
    expect(
      renderCall("generateAgreementBuffer(CARAVAN_QUICK_PAY_AGREEMENT"),
      "the executed Quick Pay copy stored at signing is rendering in the " +
        "retired style while the download serves the shell - the copy on file " +
        "and the copy in hand are different documents for one agreement.",
    ).toContain("shell: true");
  });

  it("the flag is not inert on EITHER agreement", async () => {
    // Vacuity tripwire, and it now has to hold for both. If `shell` stopped
    // doing anything to the Quick Pay document specifically, every source
    // assertion above would still pass while the flip achieved nothing for it -
    // which is the new claim and so the one that needs its own evidence.
    for (const agreement of [BROKER_CARRIER_AGREEMENT, CARAVAN_QUICK_PAY_AGREEMENT]) {
      const opts = { carrier: PIN_CARRIER as never };
      const [legacy, shell] = await Promise.all([
        generateAgreementBuffer(agreement, { ...opts } as never),
        generateAgreementBuffer(agreement, { ...opts, shell: true } as never),
      ]);
      expect(legacy.length, agreement.templateName + ": the legacy render produced nothing").toBeGreaterThan(10_000);
      expect(
        shell.length,
        agreement.templateName + ": shell and legacy rendered to the same byte " +
          "length - the flag is inert for this agreement",
      ).not.toBe(legacy.length);
    }
  }, 60_000);

  it("the shell-rendered executed Quick Pay still carries the countersign block", async () => {
    // The reason the flip was withheld was that restyling a signed instrument
    // could drop something the signature depends on. So the check is not "it
    // renders" - it is that the execution evidence survives the restyle.
    const buf = await generateAgreementBuffer(CARAVAN_QUICK_PAY_AGREEMENT, {
      carrier: PIN_CARRIER,
      signature: PIN_SIGNATURE,
      countersign: { name: SIGNATORY_NAME, title: SIGNATORY_TITLE, at: new Date("2026-09-04T15:00:00.000Z") },
      shell: true,
    } as never);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
    const page = await doc.getPage(doc.numPages);
    const text = (await page.getTextContent()).items
      .map((i) => (i as { str: string }).str).join(" ").replace(/\s+/g, " ");

    expect(text.length, "the execution page extracted as empty - the probe is broken").toBeGreaterThan(200);
    expect(
      text,
      "the shell-rendered executed Quick Pay does not name the countersignatory " +
        "- the restyle dropped the block that says who bound SRL",
    ).toContain(SIGNATORY_NAME);
    expect(text).toContain("Countersigned for");
    expect(text, "the carrier signatory is missing from the shell render").toContain(PIN_SIGNATURE.signedByName);
  }, 30_000);
});
