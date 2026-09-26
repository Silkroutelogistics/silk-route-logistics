/**
 * Carrier-archive B6a (2026-09-19) — every LIST picker fences archived carriers.
 *
 * A "picker" is a carrierProfile.findMany whose rows are offered freight, put on
 * freight, recommended for freight, or sent an offer: the AE list behind the
 * tender/RC modals, smart match, the bench board, the auto-dispatch pool, the
 * capacity feed, proactive outreach, and the AI recommendations endpoint.
 * §14 says an archived carrier is out of the operation with its record kept, so
 * every one of those must carry `deletedAt: null` — directly, through one of
 * the two helpers in lib/carrierOperational that carry it, through a hoisted
 * const, or (the AE list) through the opt-in `include_deleted` fence.
 *
 * WHY A CENSUS AND NOT A GREP. The v3.8.alm isTestAccount census fenced 37 sites
 * and missed the auto-dispatch pool, because a count is only as good as the
 * list it is checked against. This test ENUMERATES every carrierProfile.findMany
 * in backend/src and refuses to pass while any site is unclassified: a new
 * picker must be added to PICKERS with the fence it carries, and a new non-picker
 * must be listed with the reason it is not one. Sites are keyed by enclosing
 * function and ordinal, not by line, so an edit above them does not move them.
 *
 * WHAT IT READS. Two of the fenced pickers hide their fence from a call-body
 * regex — getAllCarriers builds `base` as a hoisted const and spreads it, and
 * the bench board spreads BENCH_WHERE (§19 Sub-pattern 18) — so each picker
 * names the SCOPE its fence lives in and the fence is asserted there.
 *
 * Wrapped chains (`prisma.carrierProfile\n  .findMany(`) are matched: the
 * matcher is self-tested against that shape below (§19 Sub-pattern 17).
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SRC_ROOT = path.resolve(__dirname, "../../../src");

/* ── the scanner ─────────────────────────────────────────────────────────── */

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.isFile() && p.endsWith(".ts") && !p.endsWith(".d.ts")) out.push(p);
  }
  return out;
}

/** Blank // and block comments so prose never reads as a call (Sub-pattern 17). Offsets are preserved. */
function blankComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`])\/\/[^\n]*/g, (m, pre: string) => pre + " ".repeat(m.length - pre.length));
}

/** `carrierProfile.findMany(` with any whitespace/newline before `.findMany` (the formatter wraps long chains). */
const CALL = /\bcarrierProfile\s*\.\s*findMany\s*\(/g;

/** Bracket-walk from the "(" of the call to its matching ")". */
function callBody(src: string, openIdx: number): string {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === "(" || c === "{" || c === "[") depth++;
    else if (c === ")" || c === "}" || c === "]") {
      depth--;
      if (depth === 0) return src.slice(openIdx, i + 1);
    }
  }
  throw new Error("unbalanced call");
}

const DECL = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)\s*\(|^router\.(?:get|post|put|patch|delete)\(\s*["'`]([^"'`]+)|^(?:export\s+)?const\s+(\w+)\s*=/gm;

/** The enclosing top-level declaration (name) and where it starts. */
function enclosing(src: string, at: number): { name: string; start: number } {
  let best: { name: string; start: number } | null = null;
  for (const m of src.matchAll(DECL)) {
    if (m.index! > at) break;
    best = { name: m[1] || m[2] || m[3], start: m.index! };
  }
  if (!best) throw new Error("no enclosing declaration");
  return best;
}

type Site = { file: string; fn: string; nth: number; call: string; fnBody: string; src: string; line: number };

function census(files: string[]): Site[] {
  const sites: Site[] = [];
  for (const f of files) {
    const raw = fs.readFileSync(f, "utf8").replace(/\r\n/g, "\n");
    const src = blankComments(raw);
    const perFn = new Map<string, number>();
    for (const m of src.matchAll(CALL)) {
      const openIdx = m.index! + m[0].length - 1;
      const call = callBody(src, openIdx);
      const enc = enclosing(src, m.index!);
      const nth = (perFn.get(enc.name) ?? 0) + 1;
      perFn.set(enc.name, nth);
      const line = src.slice(0, m.index!).split("\n").length;
      sites.push({
        file: path.relative(SRC_ROOT, f).replace(/\\/g, "/"),
        fn: enc.name,
        nth,
        call,
        fnBody: src.slice(enc.start, openIdx + call.length),
        src,
        line,
      });
    }
  }
  return sites;
}

const key = (s: { file: string; fn: string; nth: number }) => `${s.file} :: ${s.fn} #${s.nth}`;

/* ── the classification ─────────────────────────────────────────────────── */

type Fence =
  | { scope: "call"; must: RegExp[] }
  | { scope: "function"; must: RegExp[] }
  | { scope: "const"; name: string; must: RegExp[] };

const DELETED_AT_NULL = /\bdeletedAt\s*:\s*null\b/;
const TEST_FENCE = /\bisTestAccount\s*:\s*false\b/;

/** Every list picker, and the scope its archive fence lives in. */
const PICKERS: Record<string, { why: string; fence: Fence }> = {
  "controllers/carrierController.ts :: getAllCarriers #1": {
    why: "GET /carrier/all — the AE list behind the tender and RC modals",
    fence: { scope: "function", must: [/includeDeleted\s*\?\s*\{\}\s*:\s*\{\s*deletedAt\s*:\s*null\s*\}/] },
  },
  "services/smartMatchService.ts :: matchCarriersForLoad #1": {
    why: "smart match — feeds waterfall build, outreach, auto-match, fall-off recovery",
    fence: { scope: "call", must: [/dispatchableCarrierWhere\s*\(\s*\)/] },
  },
  "services/benchBoardService.ts :: buildBenchBoard #1": {
    why: "the Carrier Bench — the board AEs pick tenderable carriers from",
    fence: { scope: "const", name: "BENCH_WHERE", must: [DELETED_AT_NULL, TEST_FENCE] },
  },
  "services/waterfallScoringService.ts :: getEligibleCarriers #1": {
    why: "the auto-dispatch pool — no human between this query and the tender",
    fence: { scope: "call", must: [DELETED_AT_NULL, TEST_FENCE] },
  },
  "routes/carrier.ts :: /capacity-feed #1": {
    why: "capacity feed — availability posts surfaced to AE/broker/dispatch for matching",
    fence: { scope: "call", must: [DELETED_AT_NULL, TEST_FENCE] },
  },
  "services/carrierOutreachService.ts :: notifyMatchedCarriers #2": {
    why: "proactive outreach fallback — emails carriers an offer",
    fence: { scope: "call", must: [DELETED_AT_NULL, TEST_FENCE] },
  },
  "services/smartRecommendationService.ts :: getRecommendationsForLoad #1": {
    why: "GET /ai/recommendations/:loadId — recommends carriers for a load",
    fence: { scope: "call", must: [DELETED_AT_NULL, TEST_FENCE] },
  },
};

/**
 * Every other carrierProfile.findMany, with the reason it is not a picker.
 * MONITOR = compliance/screening sweeps over the monitored population (B5
 * territory; four already use monitoredCarrierWhere()). ANALYTICS / ADMIN_LIST /
 * DIRECTORY / RECALC / CRON / DOWNSTREAM / GATE as named. Adding a findMany means
 * adding it here or to PICKERS — the test fails until you decide.
 */
const NOT_PICKERS: Record<string, string> = {
  "controllers/complianceController.ts :: scanCompliance #1": "MONITOR — admin scan",
  "controllers/marketController.ts :: getCapacity #1": "ANALYTICS — market capacity",
  "cron/index.ts :: initCronJobs #1": "CRON — daily sweep",
  "cron/index.ts :: initCronJobs #2": "CRON — pending-identity validation (carries deletedAt: null)",
  "cron/index.ts :: initCronJobs #3": "CRON — rejected-reapply reminder (carries deletedAt: null)",
  "routes/cpp.ts :: /recalculate #1": "RECALC — milestone recalc",
  "routes/cpp.ts :: /leaderboard #1": "ADMIN_LIST — CPP leaderboard",
  "services/authorityHistoryService.ts :: resolveMissingAuthorityDates #1": "CRON — authority-date resolution",
  "services/carrierIntelligenceService.ts :: runCarrierLearningCycle #1": "ANALYTICS — learning cycle",
  "services/carrierOutreachService.ts :: notifyMatchedCarriers #1": "DOWNSTREAM — resolves the userIds smart match (fenced) returned",
  "services/chameleonDetectionService.ts :: runFullChameleonScan #1": "MONITOR — chameleon subjects (carries deletedAt: null)",
  "services/complianceForecastService.ts :: runComplianceForecastCycle #1": "ANALYTICS — AI forecast",
  "services/complianceMonitorService.ts :: complianceCheckMany #1": "GATE — batched verdicts for ids the caller already chose (B2 territory)",
  "services/complianceMonitorService.ts :: getDashboardData #1": "ADMIN_LIST — compliance dashboard",
  "services/complianceMonitorService.ts :: getOverviewMatrix #1": "ADMIN_LIST — overview matrix",
  "services/complianceMonitorService.ts :: fmcsaComplianceScan #1": "MONITOR — daily FMCSA scan",
  "services/complianceMonitorService.ts :: dailyComplianceReminders #1": "MONITOR — reminders",
  "services/complianceMonitorService.ts :: checkAutoReversal #1": "MONITOR — auto-reversal (carries deletedAt: null; reversible causes only, Item 323)",
  "services/complianceMonitorService.ts :: processInsuranceExpiryEnforcement #1": "MONITOR — insurance expiry",
  "services/complianceMonitorService.ts :: processInsuranceExpiryEnforcement #2": "MONITOR — insurance expiry",
  "services/complianceMonitorService.ts :: processInsuranceExpiryEnforcement #3": "MONITOR — insurance expiry",
  "services/complianceMonitorService.ts :: monthlyCarrierReVetting #1": "MONITOR — monthly re-vetting",
  "services/complianceMonitorService.ts :: detectFmcsaAuthorityChanges #1": "MONITOR — authority-change watcher",
  "services/complianceMonitorService.ts :: processDocumentExpiryAlerts #1": "MONITOR — document expiry",
  "services/csaBasicService.ts :: batchUpdateCsaScores #1": "MONITOR — CSA sweep (monitoredCarrierWhere)",
  "services/eldValidationService.ts :: validateAllCarrierElds #1": "MONITOR — ELD sweep (monitoredCarrierWhere)",
  "services/insuranceVerificationService.ts :: checkExpiringInsurance #1": "MONITOR — expiring insurance (monitoredCarrierWhere)",
  "services/integrationService.ts :: processAllCPPRecalculations #1": "RECALC — CPP recalc",
  "services/marcoPoloService.ts :: searchCarriers #1": "DIRECTORY — staff chat lookup of the carrier directory, not a dispatch pick",
  "services/ofacScreeningService.ts :: weeklyOfacRescan #1": "MONITOR — OFAC rescan (monitoredCarrierWhere)",
  "services/overbookingService.ts :: checkAllCarrierOverbooking #1": "MONITOR — overbooking check",
};

/* ── the tests ──────────────────────────────────────────────────────────── */

describe("carrier list pickers fence archived carriers (census)", () => {
  const files = walk(SRC_ROOT);
  const sites = census(files);
  const byKey = new Map(sites.map((s) => [key(s), s]));

  it("the census is not vacuous and every site is classified exactly once", () => {
    expect(sites.length).toBeGreaterThanOrEqual(30);
    const unclassified = sites.map(key).filter((k) => !(k in PICKERS) && !(k in NOT_PICKERS));
    expect(
      unclassified,
      `unclassified carrierProfile.findMany — add to PICKERS (with its fence) or NOT_PICKERS (with a reason):\n  ${unclassified.join("\n  ")}`,
    ).toEqual([]);
    const both = Object.keys(PICKERS).filter((k) => k in NOT_PICKERS);
    expect(both).toEqual([]);
  });

  it("no PICKERS or NOT_PICKERS entry is stale (a listed site that no longer exists is dead permission)", () => {
    const stale = [...Object.keys(PICKERS), ...Object.keys(NOT_PICKERS)].filter((k) => !byKey.has(k));
    expect(stale, `stale entries:\n  ${stale.join("\n  ")}`).toEqual([]);
  });

  for (const [k, { why, fence }] of Object.entries(PICKERS)) {
    it(`${k} — ${why} — carries its archive fence`, () => {
      const site = byKey.get(k);
      expect(site, `picker not found: ${k}`).toBeTruthy();
      const s = site!;
      let scope: string;
      if (fence.scope === "call") scope = s.call;
      else if (fence.scope === "function") scope = s.fnBody;
      else {
        const m = s.src.match(new RegExp(`\\bconst\\s+${fence.name}\\s*=\\s*\\{[\\s\\S]*?\\}\\s*as\\s+const`));
        expect(m, `const ${fence.name} not found in ${s.file}`).toBeTruthy();
        scope = m![0];
        expect(s.call, `${k} does not spread ${fence.name}`).toMatch(new RegExp(`\\b${fence.name}\\b`));
      }
      for (const re of fence.must) expect(scope, `${k}: ${re} missing from ${fence.scope} scope`).toMatch(re);
    });
  }

  it("matcher self-test — sees the wrapped chain and blanks a call inside a comment", () => {
    const wrapped = blankComments("export async function x() {\n  const a = await prisma.carrierProfile\n    .findMany({ where: { deletedAt: null } });\n}\n");
    expect([...wrapped.matchAll(CALL)]).toHaveLength(1);
    const commented = blankComments("export async function y() {\n  // prisma.carrierProfile.findMany({ where: {} })\n  return 1;\n}\n");
    expect([...commented.matchAll(CALL)]).toHaveLength(0);
    expect(callBody("(a, { b: [1, { c: 2 }] })", 0)).toBe("(a, { b: [1, { c: 2 }] })");
  });
});
