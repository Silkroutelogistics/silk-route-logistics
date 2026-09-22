/**
 * A prefill lands in ONE role's column, not in both.
 *
 * Both roles of a master agreement carry fields named PRINT NAME, TITLE,
 * SIGNATURE and DATE, and the lookup used to be by bare field name. So filling
 * the broker's PRINT NAME also filled the CARRIER's — printing the broker's
 * signatory on the line the carrier signs. That is why the broker block could
 * not be prefilled at all, and why the execution page shipped blank.
 *
 * Asserted against the RENDERED page with coordinates, not against the map that
 * was passed in: the whole defect was about WHERE a value comes out.
 */
import { describe, it, expect } from "vitest";
import PDFDocument from "pdfkit";
import {
  registerSkillFonts, drawSignatureBlock, roleFieldKey,
  MASTER_AGREEMENT_SIGNATURE_ROLES, RATE_CON_SIGNATURE_ROLES, PAGE_W, MARGIN,
} from "../../../src/lib/srl-chrome";

const BROKER = MASTER_AGREEMENT_SIGNATURE_ROLES[0].title;
const CARRIER = MASTER_AGREEMENT_SIGNATURE_ROLES[1].title;
const MID = PAGE_W / 2;

/** Every text item with its x, so a value can be attributed to a column. */
async function render(prefilledValues: Record<string, string>) {
  const doc: any = new PDFDocument({ size: "LETTER", margin: 0 });
  registerSkillFonts(doc);
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  drawSignatureBlock(doc, 100, { roles: MASTER_AGREEMENT_SIGNATURE_ROLES, height: 250, prefilledValues });
  doc.end();
  await new Promise<void>((r) => doc.on("end", () => r()));
  const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const d = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(chunks)) }).promise;
  const tc = await (await d.getPage(1)).getTextContent();
  return (tc.items as any[])
    .map((i) => ({ s: String(i.str).trim(), x: i.transform[4] }))
    .filter((i) => i.s);
}

const columnsHolding = (items: { s: string; x: number }[], needle: string) => {
  const hits = items.filter((i) => i.s.includes(needle));
  return {
    left: hits.some((h) => h.x < MID),
    right: hits.some((h) => h.x >= MID),
    count: hits.length,
  };
};

describe("signature prefills are role-scoped", () => {
  it("a role-scoped value lands in that role's column ONLY", async () => {
    const items = await render({ [roleFieldKey(BROKER, "PRINT NAME")]: "ZZBROKERNAMEZZ" });

    // Self-test: the extractor sees the page at all.
    expect(items.length, "no text extracted — the harness is broken, not the code")
      .toBeGreaterThan(10);

    const c = columnsHolding(items, "ZZBROKERNAMEZZ");
    expect(c.count, "the role-scoped prefill did not render at all").toBeGreaterThan(0);
    expect(c.left, "the broker value is missing from the broker column").toBe(true);
    expect(c.right, "the broker value LEAKED into the carrier column — this is the defect").toBe(false);
  }, 20_000);

  it("the carrier role is scoped the same way, in the other direction", async () => {
    const items = await render({ [roleFieldKey(CARRIER, "PRINT NAME")]: "ZZCARRIERNAMEZZ" });
    const c = columnsHolding(items, "ZZCARRIERNAMEZZ");
    expect(c.count).toBeGreaterThan(0);
    expect(c.right, "the carrier value is missing from the carrier column").toBe(true);
    expect(c.left, "the carrier value leaked into the broker column").toBe(false);
  }, 20_000);

  it("a BARE key still fills every role that has the field (legacy behaviour)", async () => {
    // The fallback is what makes this a pure widening rather than a break. Every
    // existing caller passes bare keys; if this stopped working the carrier
    // identity prefill shipped in v3.8.abj would silently vanish.
    const items = await render({ "PRINT NAME": "ZZBAREZZ" });
    const c = columnsHolding(items, "ZZBAREZZ");
    expect(c.left && c.right, "a bare key no longer fills both columns — the fallback is gone").toBe(true);
  }, 20_000);

  it("role-scoped beats bare for the same field", async () => {
    const items = await render({
      "PRINT NAME": "ZZBAREZZ",
      [roleFieldKey(BROKER, "PRINT NAME")]: "ZZSCOPEDZZ",
    });
    const scoped = columnsHolding(items, "ZZSCOPEDZZ");
    const bare = columnsHolding(items, "ZZBAREZZ");
    expect(scoped.left, "the scoped value should win in the broker column").toBe(true);
    expect(bare.left, "the bare value should have been overridden in the broker column").toBe(false);
    expect(bare.right, "the bare value should still fill the unscoped carrier column").toBe(true);
  }, 20_000);

  it("the key helper is what the block actually uses", () => {
    // Cheap, but it is the thing a separator typo would break, and a typo
    // produces a prefill that silently does not appear.
    expect(roleFieldKey("A", "B")).toBe("A::B");
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../../src/lib/srl-chrome.ts"), "utf8");
    expect(src.includes("prefilledValues[roleFieldKey(role.title, f)]"),
      "drawSignatureBlock no longer resolves through roleFieldKey").toBe(true);
  });
});

/**
 * The Rate Confirmation block has the same hazard and now the same exposure.
 *
 * Its two roles both carry TITLE, SIGNATURE and DATE. Since v3.8.bga the
 * BROKER column is prefilled with a countersignature marker and an ISO date,
 * so a bare key here would print SRL "Countersigned electronically" on the line
 * the CARRIER signs, on the document that binds them to the rate. The master
 * agreement cases above cover the same mechanism; this covers the roles the
 * rate confirmation actually renders with.
 */
describe("the Rate Confirmation roles are scoped too", () => {
  const RC_CARRIER = RATE_CON_SIGNATURE_ROLES[0].title;
  const RC_BROKER = RATE_CON_SIGNATURE_ROLES[1].title;

  async function renderRc(prefilledValues: Record<string, string>) {
    const doc: any = new PDFDocument({ size: "LETTER", margin: 0 });
    registerSkillFonts(doc);
    const chunks: Buffer[] = [];
    doc.on("data", (c: Buffer) => chunks.push(c));
    drawSignatureBlock(doc, 100, { roles: RATE_CON_SIGNATURE_ROLES, height: 140, prefilledValues });
    doc.end();
    await new Promise<void>((r) => doc.on("end", () => r()));
    const pdfjs: any = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const d = await pdfjs.getDocument({ data: new Uint8Array(Buffer.concat(chunks)) }).promise;
    const tc = await (await d.getPage(1)).getTextContent();
    return (tc.items as any[])
      .map((i) => ({ s: String(i.str).trim(), x: i.transform[4] }))
      .filter((i) => i.s);
  }

  it("the countersign marker and date land in the BROKER column only", async () => {
    const items = await renderRc({
      [roleFieldKey(RC_BROKER, "SIGNATURE")]: "COUNTERMARK",
      [roleFieldKey(RC_BROKER, "DATE")]: "2026-09-22",
    });
    const mark = items.filter((i) => i.s === "COUNTERMARK");
    const date = items.filter((i) => i.s === "2026-09-22");
    expect(mark.length, "the marker must be drawn exactly once").toBe(1);
    expect(date.length, "the date must be drawn exactly once").toBe(1);
    expect(mark[0].x, "the marker belongs to the broker half").toBeGreaterThan(MID);
    expect(date[0].x, "the date belongs to the broker half").toBeGreaterThan(MID);
  }, 60_000);

  it("a bare SIGNATURE key would fill BOTH, which is what the scoping prevents", async () => {
    // Not a wish: this is the legacy lookup still working, and it is exactly
    // what the production prefill must never use for these four field names.
    const items = await renderRc({ SIGNATURE: "BARE" });
    const both = items.filter((i) => i.s === "BARE");
    expect(both.length).toBe(2);
    expect(both.some((i) => i.x < MID), "one lands in the carrier half").toBe(true);
    expect(both.some((i) => i.x > MID), "the other in the broker half").toBe(true);
  }, 60_000);

  it("vacuity tripwire: the RC block renders its own labels", async () => {
    const items = await renderRc({});
    const labels = items.map((i) => i.s);
    expect(labels).toContain("AUTHORIZED SIGNATORY (PRINT)");
    expect(labels.filter((l) => l === "SIGNATURE").length).toBe(2);
    expect(RC_CARRIER).not.toBe(RC_BROKER);
  }, 60_000);
});
