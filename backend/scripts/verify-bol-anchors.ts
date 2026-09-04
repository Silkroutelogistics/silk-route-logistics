/**
 * BOL parity gate. Renders the pin fixture and compares measured text anchors
 * against a committed baseline.
 *
 * WHY THIS EXISTS, AND WHY IT IS NOT A RENDER PIN. The chrome migration moves
 * the BOL onto shared primitives, so its render pin moves by construction on
 * almost every commit of that arc - a moved pin proves a change happened and
 * says nothing about whether the document still looks right. Acceptance is
 * PARITY, and parity needs numbers, so this measures them.
 *
 * THE TWO HALVES ARE JUDGED DIFFERENTLY, which is the whole point:
 *
 *   BODY anchors must hold to v2.9. The body is pixel-verified canon and the
 *   migration is not supposed to move it. A drift here is a regression.
 *
 *   LETTERHEAD anchors are EXPECTED to move, once, to the operational
 *   register's 72pt compass - the same letterhead the Rate Confirmation and
 *   Invoice already draw. They are recorded rather than enforced, so the
 *   baseline can be re-captured deliberately at that commit and the diff is
 *   visible instead of silent.
 *
 * Tolerance is 1pt. Text extraction rounds, and sub-point noise is not drift.
 *
 * Re-capture:  npx tsx scripts/verify-bol-anchors.ts --capture
 */
import fs from "fs";
import path from "path";
import { generateBOLFromLoad } from "../src/services/pdfService";
import { BOL_FIXTURE } from "../__tests__/fixtures/pdfPinFixtures";

const BASELINE = path.resolve(__dirname, "../__tests__/fixtures/bol-v29-anchors.json");
const TOLERANCE = 1;

/**
 * Anchors are keyed by the text they sit on rather than by index, so inserting
 * a row above one does not silently re-point every anchor below it.
 *
 * Matching is on a PREFIX because extraction splits some runs, and on the FIRST
 * match top-down because a label can legitimately repeat across columns.
 */
const BODY_ANCHORS = [
  "Bill of Lading",
  "PARTIES",
  "SHIPMENT DETAILS",
  "TOTALS:",
  "SPECIAL INSTRUCTIONS",
  "RELEASED VALUE",
  "Per 49 U.S.C.",
  "SHIPPER · REPRESENTATIVE",
  "CARRIER · DRIVER",
  "CONSIGNEE · RECEIVER",
];

const LETTERHEAD_ANCHORS = [
  "SILK ROUTE LOGISTICS INC.",
  "Where Trust Travels.",
  "TRACK",
];

type Anchor = { y: number; x: number };
type Baseline = { capturedAt: string; body: Record<string, Anchor>; letterhead: Record<string, Anchor> };

/** Uppercase labels render letter-spaced ("PA R T I E S"), so compare squeezed. */
const squeeze = (s: string) => s.replace(/\s+/g, "").toUpperCase();

async function measure(): Promise<{ body: Record<string, Anchor>; letterhead: Record<string, Anchor>; pages: number }> {
  // Same token the render pin uses: every production BOL has one, so the
  // gate must measure the shape carriers actually receive.
  const doc = await generateBOLFromLoad(BOL_FIXTURE as never, { trackingToken: "PINTOKEN0001" });
  const chunks: Buffer[] = [];
  const buf: Buffer = await new Promise((res, rej) => {
    doc.on("data", (c: Buffer) => chunks.push(c));
    doc.on("end", () => res(Buffer.concat(chunks)));
    doc.on("error", rej);
  });
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const d = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const tc = await (await d.getPage(1)).getTextContent();
  const runs = (tc.items as Array<{ str: string; transform: number[] }>)
    .filter((i) => i.str.trim())
    .map((i) => ({
      x: Math.round(i.transform[4] * 10) / 10,
      y: Math.round(i.transform[5] * 10) / 10,
      s: i.str.trim(),
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  const pick = (labels: string[]): Record<string, Anchor> => {
    const out: Record<string, Anchor> = {};
    for (const label of labels) {
      const want = squeeze(label);
      const hit = runs.find((r) => squeeze(r.s).startsWith(want));
      if (hit) out[label] = { y: hit.y, x: hit.x };
    }
    return out;
  };
  return { body: pick(BODY_ANCHORS), letterhead: pick(LETTERHEAD_ANCHORS), pages: d.numPages };
}

(async () => {
  const capture = process.argv.includes("--capture");
  const { body, letterhead, pages } = await measure();

  // Self-test. A broken extractor finds nothing and every comparison below
  // would pass vacuously against an empty set (§19 Sub-pattern 16).
  const missing = BODY_ANCHORS.filter((a) => !body[a]);
  if (missing.length) {
    console.error("EXTRACTION FAILED — body anchors not found: " + missing.join(", "));
    console.error("Either the document lost these sections, or the matcher is broken. Both matter.");
    process.exit(1);
  }

  if (capture) {
    const next: Baseline = { capturedAt: new Date().toISOString().slice(0, 10), body, letterhead };
    fs.writeFileSync(BASELINE, JSON.stringify(next, null, 2) + "\n");
    console.log("captured " + Object.keys(body).length + " body + " +
      Object.keys(letterhead).length + " letterhead anchors -> " + path.basename(BASELINE));
    process.exit(0);
  }

  if (!fs.existsSync(BASELINE)) {
    console.error("No baseline. Run with --capture first.");
    process.exit(1);
  }
  const base: Baseline = JSON.parse(fs.readFileSync(BASELINE, "utf8"));

  console.log("BOL ANCHOR PARITY  (baseline captured " + base.capturedAt + ", tolerance " + TOLERANCE + "pt)");
  console.log("pages=" + pages + (pages === 1 ? "" : "   <-- NOT ONE PAGE"));

  let drift = 0;
  console.log("\nBODY — must hold to v2.9:");
  for (const label of BODY_ANCHORS) {
    const was = base.body[label];
    const now = body[label];
    if (!was) { console.log("  NEW      " + label + "  (not in baseline)"); continue; }
    const dy = Math.round((now.y - was.y) * 10) / 10;
    const dx = Math.round((now.x - was.x) * 10) / 10;
    const ok = Math.abs(dy) <= TOLERANCE && Math.abs(dx) <= TOLERANCE;
    if (!ok) drift++;
    console.log("  " + (ok ? "ok   " : "DRIFT") + "  " + label.padEnd(26) +
      " y" + now.y + " (" + (dy >= 0 ? "+" : "") + dy + ")  x" + now.x + " (" + (dx >= 0 ? "+" : "") + dx + ")");
  }

  console.log("\nLETTERHEAD — expected to move to RC/invoice parity, reported not enforced:");
  for (const label of LETTERHEAD_ANCHORS) {
    const was = base.letterhead[label];
    const now = letterhead[label];
    if (!now) { console.log("  GONE     " + label); continue; }
    if (!was) { console.log("  NEW      " + label); continue; }
    const dy = Math.round((now.y - was.y) * 10) / 10;
    const dx = Math.round((now.x - was.x) * 10) / 10;
    const moved = Math.abs(dy) > TOLERANCE || Math.abs(dx) > TOLERANCE;
    console.log("  " + (moved ? "moved" : "same ") + "  " + label.padEnd(26) +
      " y" + now.y + " (" + (dy >= 0 ? "+" : "") + dy + ")  x" + now.x + " (" + (dx >= 0 ? "+" : "") + dx + ")");
  }

  if (pages !== 1) { console.error("\nFAIL: the BOL is not one page."); process.exit(1); }
  if (drift) {
    console.error("\nFAIL: " + drift + " body anchor(s) drifted beyond " + TOLERANCE + "pt.");
    console.error("The body is pixel-verified v2.9 canon. If a move is intended, say so and re-capture.");
    process.exit(1);
  }
  console.log("\nBODY PARITY HOLDS.");
})().catch((e) => { console.error("FAILED:", e?.message ?? e); process.exit(1); });
