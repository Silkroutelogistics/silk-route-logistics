/**
 * The carrier receives the SHELL Broker-Carrier Agreement, and the Quick Pay
 * Agreement is left alone.
 *
 * WHY THIS EXISTS SEPARATELY FROM THE PINS. `documentRenderPins` calls the
 * renderer directly with an explicit `shell` value, so it pins both variants
 * and is blind to which one the ROUTE asks for. Flipping a caller moves no pin
 * by construction — which is precisely why the flip needs a guard of its own.
 * Without this, `shell: true` could be reverted at either site and every pin,
 * every typecheck and the whole suite would stay green while carriers silently
 * went back to receiving the old document.
 *
 * TWO SITES, ONE ANSWER. The stored executed copy (written at signing) and the
 * on-demand download must agree. A stored copy that does not look like the copy
 * the carrier can pull is two documents for one agreement, and the one in a
 * dispute is whichever they happen to be holding.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { generateAgreementBuffer } from "../../../src/services/agreementPdfService";
import { BROKER_CARRIER_AGREEMENT, CARAVAN_QUICK_PAY_AGREEMENT } from "../../../src/data/agreements";
import { PIN_CARRIER } from "../../fixtures/pdfPinFixtures";

const ROUTE = fs.readFileSync(
  path.resolve(__dirname, "../../../src/routes/carrierAuth.ts"),
  "utf8",
);

/** Comments may discuss the flag; only code may set it. */
const code = ROUTE.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");

describe("the BCA shell flip is wired at both carrier-facing sites", () => {
  it("the on-demand download asks for the shell, and only for the BCA", () => {
    expect(
      code,
      "the carrier download route must request the shell for the Broker-Carrier " +
        "Agreement. This route serves BOTH agreements, so the flag must be " +
        "conditional on the template rather than unconditional.",
    ).toContain("shell: agreement.templateName === BROKER_CARRIER_AGREEMENT.templateName");
  });

  it("the stored executed copy asks for the shell", () => {
    const at = code.indexOf("generateAgreementBuffer(BROKER_CARRIER_AGREEMENT");
    expect(at, "the executed-BCA render site has moved or gone").toBeGreaterThan(-1);
    const call = code.slice(at, at + 900);
    expect(
      call,
      "the executed copy stored at signing must render through the same shell as " +
        "the download, or the copy on file and the copy in hand are different " +
        "documents for one agreement.",
    ).toContain("shell: true");
  });

  it("the Quick Pay executed copy is NOT flipped", () => {
    const at = code.indexOf("generateAgreementBuffer(CARAVAN_QUICK_PAY_AGREEMENT");
    expect(at, "the executed-QP render site has moved or gone").toBeGreaterThan(-1);
    const call = code.slice(at, at + 900);
    expect(
      call,
      "the Quick Pay Agreement has no shell pin. Rendering it through the shell " +
        "would restyle a second signed instrument on evidence nobody has taken.",
    ).not.toContain("shell: true");
  });

  it("the flag is not inert — shell and legacy are different documents", async () => {
    const opts = { carrier: PIN_CARRIER as never };
    const [legacy, shell] = await Promise.all([
      generateAgreementBuffer(BROKER_CARRIER_AGREEMENT, { ...opts } as never),
      generateAgreementBuffer(BROKER_CARRIER_AGREEMENT, { ...opts, shell: true } as never),
    ]);
    // Vacuity tripwire. If `shell` ever stopped doing anything, every source
    // assertion above would still pass while the flip achieved nothing.
    expect(legacy.length, "the legacy render produced nothing").toBeGreaterThan(10_000);
    expect(
      shell.length,
      "shell and legacy rendered to the same byte length — the flag is inert",
    ).not.toBe(legacy.length);
  }, 30_000);

  it("the QP agreement still renders (it is not collateral damage)", async () => {
    const buf = await generateAgreementBuffer(CARAVAN_QUICK_PAY_AGREEMENT, {
      carrier: PIN_CARRIER as never,
    } as never);
    expect(buf.length).toBeGreaterThan(10_000);
  }, 30_000);
});
