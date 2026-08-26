/**
 * Load.rate must not spread further through the frontend.
 *
 * §13.3 Item 227 retired Load.rate to a write-only mirror and shipped a guard —
 * but that guard scopes itself to backend/src (noLoadRateReads.test.ts), so the
 * frontend has been invisible to it the whole time. T5 found the consequence:
 * "Revenue This Week" summed Load.rate over loads whose PICKUP fell in the
 * week, reporting $4,850 from a single TENDERED load picking up TOMORROW while
 * "Revenue MTD" showed $0. A drop migration for that column is waiting on
 * hold/retire-load-rate; when it merges, every remaining reader breaks.
 *
 * This is a RATCHET, not a clean-tree assertion. ~19 reads remain across 7
 * files, several with real display semantics (rate/distance, margin
 * arithmetic, and carrier-side `carrierRate || rate` fallbacks that would
 * render $0 for a load nobody has accepted yet). Purging those needs per-site
 * judgement, so they are pinned at their current counts instead: the number may
 * fall, never rise. A new read in a new file fails; a new read in an existing
 * file fails too, because the count moves.
 *
 * CRLF-SAFE BY CONSTRUCTION. Three guards in this repo parse their own source
 * with \n-anchored regexes and are consequently broken on any Windows checkout
 * — noLoadRateReads itself reports phantom findings, and publicSurfaceProbes
 * parses zero entries and would pass vacuously if its tripwire had not caught
 * it. Every line here is stripped of \r before matching, and a test asserts
 * that stripping actually happens.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const FRONTEND_SRC = path.resolve(__dirname, "../../../../frontend/src");

/**
 * Files permitted to read `.rate`, with the count they currently hold.
 *
 * Lower a number when you purge a read. Never raise one. CeoOverview is
 * deliberately ABSENT — its two reads were removed in this commit, so restoring
 * either one fails this guard, which is the point.
 */
const RATCHET: Record<string, number> = {
  // AE surfaces — the real Load.rate readers.
  "app/dashboard/loads/page.tsx": 11,          // rate/distance + margin arithmetic
  "app/dashboard/waterfall/WaterfallDrawer.tsx": 2,
  "app/dashboard/waterfall/tabs/DetailsTab.tsx": 1,
  "app/dashboard/waterfall/BoardTable.tsx": 1,
  "app/dashboard/track-trace/tabs/FinanceTab.tsx": 1,
  "app/dashboard/orders/page.tsx": 1,
  "app/dashboard/loads-calendar/page.tsx": 1,
  "app/dashboard/crm/tabs/OrdersTab.tsx": 1,   // customerRate ?? rate fallback
  "app/dashboard/backhaul-discovery/page.tsx": 1,
  "components/dashboard/EmployeeOverview.tsx": 1,
  "components/loads/CreateLoadModal.tsx": 2,
  "components/loads/RateConfirmationModal.tsx": 4,

  // Carrier portal — ZERO. The `carrierRate || rate` fallbacks are gone.
  //
  // The note that used to sit here said dropping the fallback "renders $0 for a
  // load nobody has accepted yet, so these need the carrierRate backfill
  // question answered first". That framed the fallback as protective. It was
  // not: Load.rate is the CUSTOMER rate on the primary creation path, so the
  // fallback showed SRL's revenue to the carrier we pay out of it. The answer
  // was never a backfill — it was that an un-accepted load has no carrier rate
  // and should say so. They render an em-dash (lib/rateDisplay).
  "app/carrier/dashboard/available-loads/page.tsx": 0,
  "app/carrier/dashboard/my-loads/page.tsx": 0,
  "app/carrier/dashboard/page.tsx": 0,
  "app/carrier/dashboard/loadboard/page.tsx": 0,

  // Shipper portal.
  "app/shipper/dashboard/page.tsx": 2,
  "app/shipper/dashboard/shipments/page.tsx": 2,
  "app/shipper/dashboard/tracking/page.tsx": 1,
  "components/shipper/ShipmentDetailDrawer.tsx": 1,

  // NOT Load.rate — pinned only so the ratchet has no holes. LessonAudio is
  // speech playback rate; InvoiceLineItemsEditor is an invoice line item. They
  // are counted because the matcher is deliberately a superset (see below) and
  // over-inclusion is harmless for a growth ratchet.
  "components/driver/LessonAudio.tsx": 1,
  "components/invoices/InvoiceLineItemsEditor.tsx": 1,
};

/**
 * `.rate` reads that are NOT Load.rate and must never be counted:
 *   li.rate    invoice LINE ITEM rate
 *   item.rate  invoice line item, spelled out (accounting/invoices)
 *   r.rate     contract rate per mile (RatesTab)
 *   row.rate   accessorial rate (ProfileTab)
 *   form.rate  an input's own state
 * Different models entirely; sweeping them in would make this guard cry wolf,
 * and a guard that cries wolf is one people learn to ignore. `item` was added
 * after the first run flagged accounting/invoices — the guard finding a false
 * positive on its own first execution is the reason to run it before trusting
 * it.
 */
const NOT_LOAD_RATE = /\b(li|item|r|row|form|f)\.rate\b/;

/** Siblings that merely start with "rate" and are unrelated to the column. */
const SAFE_SIBLING = /\.rate(Type|PerMile|Con|Confirmation|s)\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    // Test files are excluded. The guard's subject is SURFACES — code that
    // renders a number to somebody — and a test proving the Load.rate fallback
    // is gone has to be able to write `rate:` in a fixture to prove it. Counting
    // those would make the guard fight the tests that enforce it.
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Count `.rate` reads in a file, comments stripped.
 *
 * The \r strip on the first line of the loop is load-bearing: split("\n") on a
 * CRLF file leaves \r at the end of every line, and JS regex `.` never matches
 * \r, so /\/\/.*$/ cannot match a comment that ends in one. Without it the
 * comment stripping silently no-ops and this guard reports its own prose.
 */
function countRateReads(file: string): number {
  const lines = fs.readFileSync(file, "utf8").split("\n");
  let inBlock = false;
  let count = 0;

  for (const rawLine of lines) {
    let line = rawLine.replace(/\r$/, ""); // ← CRLF safety, before any matching
    if (inBlock) {
      if (line.includes("*/")) { inBlock = false; line = line.slice(line.indexOf("*/") + 2); }
      else continue;
    }
    if (line.includes("/*")) { inBlock = !line.includes("*/"); line = line.slice(0, line.indexOf("/*")); }
    line = line.replace(/\/\/.*$/, "").trim();
    if (!line) continue;

    if (SAFE_SIBLING.test(line)) continue;
    if (NOT_LOAD_RATE.test(line)) continue;
    const hits = line.match(/\.rate\b/g);
    if (hits) count += hits.length;
  }
  return count;
}

/**
 * Memoized because every it() block called scan(), and scan() re-walked the
 * whole of frontend/src reading each file. Several walks of a few hundred files
 * is enough I/O to cross vitest's 5s default under full-suite load — this guard
 * went red at 6735ms while passing 5/5 in isolation, and on the next run a
 * DIFFERENT assertion in the same file crossed instead, which is the tell that
 * the file is slow rather than any one test being wrong.
 *
 * A guard that flakes is a guard somebody eventually deletes, and the failure
 * reads as "Load.rate came back" rather than "the disk was busy", so the
 * misdiagnosis costs time too. The walk is genuinely needed; doing it once per
 * test was not.
 */
let scanCache: Record<string, number> | null = null;

function scan(): Record<string, number> {
  if (scanCache) return scanCache;
  const found: Record<string, number> = {};
  for (const file of walk(FRONTEND_SRC)) {
    const n = countRateReads(file);
    if (n > 0) found[path.relative(FRONTEND_SRC, file).replace(/\\/g, "/")] = n;
  }
  scanCache = found;
  return found;
}

describe("Load.rate does not spread through the frontend", () => {
  it("no file exceeds its pinned count, and no unpinned file reads it", () => {
    const found = scan();
    const problems: string[] = [];

    for (const [file, n] of Object.entries(found)) {
      const pin = RATCHET[file];
      if (pin === undefined) {
        problems.push(
          `${file}: ${n} read(s) of .rate in a file that is not on the ratchet. ` +
            `Use customerRate for what the shipper pays and carrierRate for what SRL pays ` +
            `(§13.3 Item 227). Load.rate is a write-only mirror under a drop migration.`,
        );
      } else if (n > pin) {
        problems.push(`${file}: ${n} read(s), pinned at ${pin}. The ratchet only goes down.`);
      }
    }
    expect(problems, problems.join("\n  ")).toEqual([]);
  });

  it("CeoOverview reads Load.rate nowhere — the T5 revenue defect", () => {
    // Named separately from the ratchet so the failure message points at the
    // actual regression rather than at a count.
    expect(scan()["components/dashboard/CeoOverview.tsx"]).toBeUndefined();
  });

  it("a pinned count that has dropped should be lowered", () => {
    const found = scan();
    const slack = Object.entries(RATCHET)
      .filter(([file, pin]) => (found[file] ?? 0) < pin)
      .map(([file, pin]) => `${file}: pinned ${pin}, actually ${found[file] ?? 0} — lower the pin`);
    expect(slack, slack.join("\n  ")).toEqual([]);
  });
});

describe("the guard cannot pass vacuously", () => {
  it("actually parses real files and finds the known remaining reads", () => {
    const found = scan();
    // If the walk or the matcher broke, this collapses to {} and every
    // assertion above would pass while checking nothing.
    expect(Object.keys(found).length).toBeGreaterThanOrEqual(5);
    expect(found["app/dashboard/loads/page.tsx"]).toBeGreaterThan(0);
  });

  it("comment stripping survives CRLF", () => {
    // The exact failure mode of the three broken guards in this repo: with \r
    // left on, /\/\/.*$/ cannot match and the commented read is counted.
    const withCrlf = "const x = 1;\r\n// const y = load.rate;\r\n";
    const tmp = path.join(__dirname, "__crlf_probe.tsx");
    fs.writeFileSync(tmp, withCrlf);
    try {
      expect(countRateReads(tmp)).toBe(0);
    } finally {
      fs.unlinkSync(tmp);
    }
  });
});
