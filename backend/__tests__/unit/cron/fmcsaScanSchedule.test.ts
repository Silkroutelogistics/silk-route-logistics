/**
 * T4 — the FMCSA scan runs at 3 AM Eastern, and an empty run says so.
 *
 * Two defects, one card. The schedule "0 3 * * *" carried no timezone, so it
 * meant 03:00 UTC — 11 PM Eastern the PREVIOUS day — while three strings on the
 * dashboard said "3 AM Eastern". And a run that scanned nobody wrote severity
 * INFO, identical to a clean scan of a real fleet, because the ternary consulted
 * only `results.errors`. Ninety summary rows exist; eighty-six of them scanned
 * no one, and every one of them logged as healthy.
 *
 * The scan population is fenced to `isTestAccount: false` (§13.3 Item 190),
 * which is correct — it keeps live FMCSA calls and auto-suspend decisions off
 * seed data. But every APPROVED carrier in production is currently a test
 * account, so the fence that protects the scan is also what empties it. That is
 * the condition these tests make loud.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

/** \r-stripped: three guards in this repo are broken on CRLF checkouts. */
function readSource(rel: string): string {
  return fs
    .readFileSync(path.resolve(__dirname, rel), "utf8")
    .split(/\r?\n/)
    .map((l) => l.replace(/\r$/, ""))
    .join("\n");
}

describe("the schedule means Eastern, not UTC", () => {
  it("the FMCSA block passes timezone America/New_York", () => {
    const src = readSource("../../../src/cron/index.ts");
    const start = src.indexOf('cron.schedule("0 3 * * *"');
    expect(start, 'the "0 3 * * *" registration should exist').toBeGreaterThan(-1);

    // The block closes at the next `}));` or `}), {`. Take a generous window
    // and assert the timezone option lands inside it.
    const block = src.slice(start, start + 3000);
    const close = block.search(/\}\)\s*,\s*\{[^}]*timezone|\}\)\s*\)\s*;/);
    expect(close, "the registration should close within the sampled window").toBeGreaterThan(-1);
    expect(block.slice(0, close + 200)).toMatch(/timezone:\s*"America\/New_York"/);
  });

  it("node-cron actually supports the option — not assumed", () => {
    // A timezone silently ignored by the library would look identical to a fix.
    const dts = readSource("../../../node_modules/node-cron/dist/cjs/tasks/scheduled-task.d.ts");
    expect(dts).toMatch(/timezone\?:\s*string/);
  });

  it("3 AM Eastern is a different instant from 3 AM UTC, in both DST halves", () => {
    // The bug in one assertion: without a tz the expression fires at 03:00 UTC,
    // which is 11 PM Eastern the previous DAY — the card's label was wrong by a
    // calendar day, and by a different number of hours in summer than winter.
    const hourEt = (iso: string) =>
      new Intl.DateTimeFormat("en-US", {
        timeZone: "America/New_York", hour: "2-digit", hour12: false,
      }).format(new Date(iso));

    expect(hourEt("2026-08-24T03:00:00Z")).toMatch(/\b23\b/); // EDT: 11 PM prior day
    expect(hourEt("2026-01-15T03:00:00Z")).toMatch(/\b22\b/); // EST: 10 PM prior day
    // And the offset differs between them — which is why a hardcoded UTC hour
    // cannot be "3 AM Eastern" year-round even if someone picked a better one.
    expect(hourEt("2026-08-24T03:00:00Z")).not.toBe(hourEt("2026-01-15T03:00:00Z"));
  });

  it("the timezone convention block no longer calls this job internal", () => {
    // It used to name the FMCSA scan in the UTC-by-design list. Leaving that
    // would be a comment contradicting the code three hundred lines below it —
    // the exact defect class this arc keeps finding.
    const src = readSource("../../../src/cron/index.ts");
    const conventionBlock = src.slice(0, src.indexOf("SCHEDULED_JOB_NAMES"));
    const internalList = conventionBlock.slice(conventionBlock.indexOf("- Internal recompute"));
    expect(internalList.slice(0, 200)).not.toMatch(/FMCSA scan/);
  });
});

describe("a run that scanned nobody is not a clean run", () => {
  const svc = () => readSource("../../../src/services/complianceMonitorService.ts");

  it("summary severity escalates on an empty population, not only on errors", () => {
    // The old expression was `results.errors > 0 ? "WARNING" : "INFO"`.
    // carriersScanned was never consulted, which is the single line that let 86
    // empty scans read as healthy.
    expect(svc()).toMatch(/severity:\s*results\.errors > 0 \|\| emptyPopulation \? "WARNING" : "INFO"/);
  });

  it("a distinct SystemLog line names the count AND the fence that produced it", () => {
    const s = svc();
    expect(s).toMatch(/ZERO eligible carriers/);
    expect(s).toMatch(/isTestAccount/);
    // Both numbers, so an operator can tell "no carriers at all" from
    // "carriers exist but all are test accounts" without running a query.
    expect(s).toMatch(/approvedTotal/);
    expect(s).toMatch(/approvedReal/);
  });

  it("emptyPopulation rides in details so the card need not infer it from a zero", () => {
    expect(svc()).toMatch(/emptyPopulation,/);
  });

  it("the summary message distinguishes the two states in words", () => {
    expect(svc()).toMatch(/0 carriers were eligible — nothing was scanned/);
  });
});

describe("the card renders the empty run as a warning", () => {
  const ceo = () => readSource("../../../../frontend/src/components/dashboard/CeoOverview.tsx");

  it("carriersScanned === 0 gets warning colour, matching its siblings", () => {
    // alertsCreated and autoSuspended already escalate above zero; this cell
    // escalated on nothing, so 0-scanned looked exactly like a healthy scan.
    expect(ceo()).toMatch(/lastScan\.carriersScanned === 0 \? "text-yellow-400" : "text-white"/);
  });

  it("an explicit banner states it, because zeros alone cannot", () => {
    const s = ceo();
    expect(s).toMatch(/lastScan\.emptyPopulation \?/);
    expect(s).toMatch(/Nothing was scanned\./);
  });

  it("all schedule copy says Eastern, and nothing says the old ET shorthand", () => {
    const s = ceo();
    const mentions = s.match(/3:00 AM Eastern/g) ?? [];
    expect(mentions.length).toBe(3);
    expect(s).not.toMatch(/3 AM ET\b/);
    expect(s).not.toMatch(/3am Eastern/);
  });
});

describe("the guard cannot pass vacuously", () => {
  it("it is reading real files, not empty strings", () => {
    expect(readSource("../../../src/cron/index.ts").length).toBeGreaterThan(5000);
    expect(readSource("../../../src/services/complianceMonitorService.ts").length).toBeGreaterThan(5000);
    expect(readSource("../../../../frontend/src/components/dashboard/CeoOverview.tsx").length).toBeGreaterThan(5000);
  });
});
