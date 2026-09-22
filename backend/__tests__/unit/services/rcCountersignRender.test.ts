/**
 * The countersignature is on the PAGE, and only when there is one.
 *
 * The broker column used to print a name and a title over two ruled lines that
 * nothing could fill. This asserts what now fills them, that the CARRIER column
 * is untouched, and that a document which has not been issued still shows an
 * open date line rather than a countersignature it never received.
 *
 * Read out of the rendered bytes rather than the source, because the source can
 * be right about a prefill key that the renderer never draws: drawSignatureBlock
 * resolves a ROLE-SCOPED key first and a bare field name second, so a mis-keyed
 * prefill silently renders nothing at all, which on a signature page looks
 * exactly like a field meant to be signed by hand.
 *
 * Adversarially verified at authoring: restoring the two-key sigPrefill turns
 * the marker and DATE cases red; dropping the drawn statement turns the
 * statement case red.
 */
import { describe, it, expect } from "vitest";
import { generateEnhancedRateConfirmation } from "../../../src/services/pdfService";
import { RC_FIXTURE, RC_FORM_DATA } from "../../fixtures/pdfPinFixtures";
import {
  buildRcCountersign,
  RC_COUNTERSIGN_MARKER,
  rcCountersignDate,
} from "../../../src/lib/rcCountersign";

const AT = new Date("2026-09-22T14:31:07.000Z");
const CS = buildRcCountersign(AT);

async function render(fd: Record<string, unknown>): Promise<{ text: string; pages: number }> {
  // @ts-expect-error pdf-parse ships no bundled types
  const pdfParse = (await import("pdf-parse")).default;
  const chunks: Buffer[] = [];
  const stream = generateEnhancedRateConfirmation(RC_FIXTURE as never, fd as never);
  await new Promise<void>((res, rej) => {
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => res());
    stream.on("error", rej);
  });
  const parsed = await pdfParse(Buffer.concat(chunks));
  return { text: String(parsed.text).replace(/\s+/g, " "), pages: Number(parsed.numpages) };
}

const issued = () => render({ ...RC_FORM_DATA, rcCountersign: CS });
const draft = () => render({ ...RC_FORM_DATA });

/**
 * Text on the last page WITH ITS COLUMN, because "somewhere on the page" is
 * not the same claim as "in the broker cell".
 *
 * The first draft of this file asserted the ISO date with toContain, and the
 * adversarial injection did NOT turn it red: the drawn statement also carries
 * that date, so the assertion was satisfied by a different element entirely
 * and would have passed with the DATE cell permanently blank. drawSignatureBlock
 * lays the broker column out at MARGIN + CONTENT_W / 2 + 6 = 312pt, so the cell
 * is addressable and the claim can be made precisely.
 */
const BROKER_X = 312;

async function brokerColumnOfLastPage(fd: Record<string, unknown>): Promise<string[]> {
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const chunks: Buffer[] = [];
  const stream = generateEnhancedRateConfirmation(RC_FIXTURE as never, fd as never);
  await new Promise<void>((res, rej) => {
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", () => res());
    stream.on("error", rej);
  });
  const doc = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(chunks)), useSystemFonts: true }).promise;
  const page = await doc.getPage(doc.numPages);
  const content = await page.getTextContent();
  return (content.items as any[])
    .filter((it) => Math.abs(it.transform[4] - BROKER_X) < 2)
    .map((it) => String(it.str).trim())
    .filter(Boolean);
}

describe("an issued Rate Confirmation carries SRL's countersignature", () => {
  it("states it in the broker SIGNATURE cell", async () => {
    expect(await brokerColumnOfLastPage({ ...RC_FORM_DATA, rcCountersign: CS })).toContain(RC_COUNTERSIGN_MARKER);
  }, 60_000);

  it("fills the broker DATE in ISO, matching the agreements", async () => {
    expect(rcCountersignDate(CS)).toBe("2026-09-22");
    // IN THE CELL. See brokerColumnOfLastPage: asserting this against the whole
    // page text passes on the drawn statement and proves nothing about the cell.
    expect(await brokerColumnOfLastPage({ ...RC_FORM_DATA, rcCountersign: CS })).toContain("2026-09-22");
  }, 60_000);

  it("draws the full statement, with the ISO instant beside the human one", async () => {
    const { text } = await issued();
    expect(text).toContain(
      "Countersigned for Silk Route Logistics Inc. by Wasi Haider, President on 2026-09-22 14:31 UTC, " +
        "applied automatically on issuance of this Rate Confirmation.",
    );
    // The reconcilable half: a reader can check the rendered string against the
    // stored column without trusting the human rendering of it.
    expect(text).toContain("Countersigned at (UTC, ISO 8601): 2026-09-22T14:31:07.000Z");
  }, 60_000);

  it("says it ONCE, so the carrier column is untouched", async () => {
    // Both roles carry a field called SIGNATURE. A bare prefill key would fill
    // BOTH, printing SRL on the line the carrier signs, which is the whole
    // reason the key is role-scoped. Two occurrences would be that defect.
    const { text } = await issued();
    expect(text.split(RC_COUNTERSIGN_MARKER).length - 1).toBe(1);
  }, 60_000);

  it("stays three pages", async () => {
    expect((await issued()).pages).toBe(3);
  }, 60_000);
});

describe("a Rate Confirmation that has not been issued shows an open date line", () => {
  it("carries no marker, no statement and no countersign date", async () => {
    // The BCA specimen rule: there is no date until there is an execution, and
    // a draft that printed one would assert an act that has not happened.
    const { text, pages } = await draft();
    expect(text).not.toContain(RC_COUNTERSIGN_MARKER);
    expect(text).not.toContain("Countersigned for");
    expect(text).not.toContain("Countersigned at (UTC, ISO 8601)");
    expect(pages).toBe(3);
  }, 60_000);

  it("vacuity tripwire: the draft render is a real document", async () => {
    // Without this, every not.toContain above would pass on an empty string.
    const { text } = await draft();
    expect(text).toContain("SILK ROUTE LOGISTICS INC.");
    expect(text).toContain("CARRIER");
    expect(text.length).toBeGreaterThan(2000);
  }, 60_000);
});
