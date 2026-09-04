/**
 * The paragraph 24 accessorial table must not interleave its rows.
 *
 * WHAT THIS CAUGHT. `table()` laid rows at a fixed `ROW_H = 18` while the Terms
 * cells run 300+ characters and wrap to five or six lines at a 262pt column. y
 * advanced 18pt per row regardless, so on the executed BCA "Layover" sat at
 * y=505 beside Detention's fourth line at y=499.7, and "Truck Order Not Used"
 * at 487 beside Layover's continuation at 493. Reading down the Terms column
 * gave sentences from four different charges, alternating -- on the instrument
 * that states what SRL pays a carrier for detention.
 *
 * WHY IT ASSERTS POSITIONS RATHER THAN STRINGS. Every string was present and
 * correct the whole time; pdf-parse would have reported a healthy document.
 * The defect is geometric and only a coordinate can see it. Text is extracted
 * with pdfjs, which reports each run's x, y and width in PDF user space.
 *
 * THE BAND RULE. Each row occupies a y-band from its topmost to its bottommost
 * text run. Two rows of the same table may not overlap. Column membership is
 * decided by x: a run belongs to the column whose bounds contain its left edge,
 * and its right edge must stay inside those bounds.
 */
import { describe, it, expect } from "vitest";
import { generateAgreementBuffer } from "../../../src/services/agreementPdfService";
import { BROKER_CARRIER_AGREEMENT } from "../../../src/data/agreements";
import { PIN_CARRIER, PIN_SIGNATURE } from "../../fixtures/pdfPinFixtures";

type Run = { x: number; y: number; w: number; s: string };

/** The five row labels of the paragraph 24 table, in document order. */
const ROW_LABELS = ["Detention", "Layover", "Truck Order Not Used", "Carrier release window", "Lumper"];

async function tablePages(shell: boolean): Promise<{ page: number; runs: Run[] }[]> {
  const buf = await generateAgreementBuffer(BROKER_CARRIER_AGREEMENT, {
    carrier: PIN_CARRIER as never,
    signature: PIN_SIGNATURE as never,
    shell,
  } as never);
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise;
  const out: { page: number; runs: Run[] }[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const runs: Run[] = (tc.items as { str: string; width: number; transform: number[] }[])
      .filter((i) => i.str.trim())
      .map((i) => ({ x: i.transform[4], y: i.transform[5], w: i.width, s: i.str }));
    // A page carries table content when the header is on it. The header is
    // REPEATED on a continuation page, which is what makes this the right
    // marker for a table that spans a break.
    if (runs.some((r) => r.s.trim() === "Charge") && runs.some((r) => r.s.trim() === "Terms")) {
      out.push({ page: p, runs });
    }
  }
  if (!out.length) throw new Error("paragraph 24 table not found in the rendered agreement");
  return out;
}

/**
 * The table's runs, isolated from the rest of the page by their x.
 *
 * Cells are indented PAD_X from the block margin, so every table run sits at
 * one of exactly two left edges while surrounding paragraphs sit at the margin
 * itself. Deriving the columns from the header ("Charge" / "Terms") rather
 * than restating them keeps this honest on both the legacy and shell paths,
 * whose margins differ by 18pt.
 *
 * The first version of this bounded the last row by -Infinity and swept up
 * every following paragraph and the footer, reporting five column edges for a
 * two-column table. It failed against a correct document.
 */
function tableRuns(runs: Run[]): { runs: Run[]; cols: [number, number] } {
  const head0 = runs.find((r) => r.s.trim() === "Charge");
  const head1 = runs.find((r) => r.s.trim() === "Terms");
  if (!head0 || !head1) throw new Error("table header not rendered");
  const cols: [number, number] = [head0.x, head1.x];
  const atCol = (r: Run) => Math.abs(r.x - cols[0]) < 1 || Math.abs(r.x - cols[1]) < 1;
  return { runs: runs.filter((r) => r.y <= head0.y + 0.5 && atCol(r)), cols };
}

/**
 * The five body rows of the paragraph 24 table, read from the SOURCE rather
 * than restated here, so the guard cannot drift from the document.
 */
function sourceRows(): { label: string; terms: string }[] {
  const sec = BROKER_CARRIER_AGREEMENT.sections.find((s) => s.table && s.heading.startsWith("24."));
  if (!sec?.table) throw new Error("paragraph 24 table not found in the agreement source");
  return sec.table.rows.map((r) => ({ label: r[0], terms: r[1] }));
}

const squash = (s: string) => s.replace(/\s+/g, " ").replace(/[\u2018\u2019]/g, "'").trim();

/**
 * Bands attributed by CONTENT, not by position — and that distinction is the
 * whole guard.
 *
 * The first version grouped runs by "nearest label at or above", which cannot
 * detect interleaving: a run belonging to Detention but drawn below Layover's
 * label is simply reassigned to Layover, so the bands never overlap however
 * badly the rows are laid out. It passed the ROW_H injection. A grouping rule
 * that is itself positional can never observe a positional defect.
 *
 * Each run is instead matched to the row whose Terms text CONTAINS it. A run
 * matching two rows is ambiguous and skipped rather than guessed; the caller
 * asserts a floor on how many were attributed, so skipping cannot hollow the
 * check out.
 */
function contentBands(runs: Run[]): { label: string; top: number; bottom: number; n: number }[] {
  const src = sourceRows().map((r) => ({ ...r, hay: squash(r.terms) }));
  const acc = new Map<string, number[]>();

  for (const r of runs) {
    const frag = squash(r.s);
    if (frag.length < 8) continue; // too short to attribute safely
    const hits = src.filter((s) => s.hay.includes(frag));
    if (hits.length !== 1) continue;
    const arr = acc.get(hits[0].label) ?? [];
    arr.push(r.y);
    acc.set(hits[0].label, arr);
  }
  // The label cell belongs to its own row's band too.
  for (const s of src) {
    const hit = runs.find((r) => squash(r.s) === squash(s.label));
    if (hit) acc.set(s.label, [...(acc.get(s.label) ?? []), hit.y]);
  }

  return [...acc.entries()]
    .map(([label, ys]) => ({ label, top: Math.max(...ys), bottom: Math.min(...ys), n: ys.length }))
    .sort((a, b) => b.top - a.top);
}

describe("agreement table rows do not interleave", () => {
  for (const shell of [false, true]) {
    const path = shell ? "shell" : "legacy";

    it(`${path}: no two rows of the paragraph 24 table share a y-band`, async () => {
      const pages = await tablePages(shell);
      const seen: string[] = [];
      let sawWrappedRow = false;

      for (const pg of pages) {
        const bands = contentBands(tableRuns(pg.runs).runs);
        expect(bands.length, `page ${pg.page} carries the table header but no attributable rows`).toBeGreaterThan(0);
        // Floor on attributed runs: ambiguous fragments are skipped, and without
        // this a guard that attributed almost nothing would pass on any layout.
        for (const b of bands) {
          expect(b.n, `row "${b.label}" on p${pg.page} attributed only ${b.n} run(s)`).toBeGreaterThanOrEqual(2);
        }
        for (const b of bands) seen.push(b.label);
        if (bands.some((b) => b.top - b.bottom > 12)) sawWrappedRow = true;

        for (let i = 0; i + 1 < bands.length; i++) {
          const above = bands[i];
          const below = bands[i + 1];
          expect(
            below.top,
            `p${pg.page}: rows "${above.label}" and "${below.label}" overlap — "${above.label}" ` +
              `runs down to y=${above.bottom.toFixed(1)} while "${below.label}" starts at ` +
              `y=${below.top.toFixed(1)}. This is the fixed-ROW_H interleave.`,
          ).toBeLessThan(above.bottom);
        }
      }

      // Self-tests. A broken extractor yields no bands and every overlap check
      // above passes vacuously; a fixture whose Terms cells stopped wrapping
      // would no longer exercise the case the interleave came from.
      expect(seen.sort(), "every row of the paragraph 24 table must render exactly once")
        .toEqual([...ROW_LABELS].sort());
      expect(sawWrappedRow, "at least one Terms cell must wrap to multiple lines").toBe(true);
    }, 30_000);

    it(`${path}: every table cell stays inside its column`, async () => {
      const pages = await tablePages(shell);
      const offenders: string[] = [];

      for (const pg of pages) {
        const { runs, cols } = tableRuns(pg.runs);
        const colW = cols[1] - cols[0];
        for (const r of runs) {
          const inCol0 = Math.abs(r.x - cols[0]) < 1;
          const right = r.x + r.w;
          if (inCol0 && right > cols[1]) {
            offenders.push(`p${pg.page} col0 overruns into col1: "${r.s.slice(0, 46)}" right=${right.toFixed(1)} >= ${cols[1].toFixed(1)}`);
          }
          if (!inCol0 && right > cols[1] + colW) {
            offenders.push(`p${pg.page} col1 overruns the block: "${r.s.slice(0, 46)}" right=${right.toFixed(1)} > ${(cols[1] + colW).toFixed(1)}`);
          }
        }
      }
      expect(offenders, offenders.join("\n")).toEqual([]);
    }, 30_000);

    it(`${path}: a table that spans a page repeats its header`, async () => {
      const pages = await tablePages(shell);
      for (const pg of pages) {
        expect(
          pg.runs.filter((r) => r.s.trim() === "Charge").length,
          `p${pg.page} must carry the Charge/Terms header. A continued table whose ` +
            `columns are unlabelled is a column of dollar figures with nothing ` +
            `saying what they charge for.`,
        ).toBe(1);
      }
    }, 30_000);
  }
});
