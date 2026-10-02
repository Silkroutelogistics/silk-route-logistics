// scripts/delete-orphan-cron-rows.ts — what counts as an orphan, and the
// refusals that keep the delete to exactly the expected rows (health-digest B6).
import { describe, it, expect } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";
import {
  EXPECTED_ORPHANS, PROTECTED, assertExpected, endpointOf, resolveOrphans, scheduledJobNames, seededNames,
} from "../../../scripts/delete-orphan-cron-rows";

const never = (jobName: string) => ({ jobName, lastRun: null });

describe("scheduledJobNames", () => {
  const jobs = scheduledJobNames();

  it("reads both schedulers, including the jobs that superseded the orphan names", () => {
    for (const n of ["daily-cpp-cleanup", "compass-score-recalc", "overdue-credit-block-daily", "monthly-carrier-revet"]) {
      expect(jobs.has(n)).toBe(true);
    }
    for (const n of EXPECTED_ORPHANS) expect(jobs.has(n)).toBe(false);
  });

  it("refuses when it parses almost nothing — a blind extractor would call every row an orphan", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "orphans-"));
    fs.mkdirSync(path.join(dir, "cron"));
    fs.mkdirSync(path.join(dir, "services"));
    fs.writeFileSync(path.join(dir, "cron/index.ts"), 'withGuard("only-one", fn)');
    fs.writeFileSync(path.join(dir, "services/schedulerService.ts"), "");
    expect(() => scheduledJobNames(dir)).toThrow(/extractor is blind/);
  });
});

describe("resolveOrphans", () => {
  it("returns exactly the never-recorded rows no job writes, and never a protected row", () => {
    const rows = [
      never("cpp-weekly-recalc"),
      never("daily-cpp-tiers"),
      never("ar-reminder-emails"), // the switch: holds state
      never("ar-reminders-daily"), // owner ruling v3.8.bnn
      never("pre-tracing"), // a live withLock name, not yet recorded
      { jobName: "ghost-but-ran", lastRun: new Date() }, // recorded once: not "never recorded"
    ];
    const found = resolveOrphans(rows, scheduledJobNames());
    expect(found).toEqual(["cpp-weekly-recalc", "daily-cpp-tiers"]);
    expect(PROTECTED).toEqual(expect.arrayContaining(["ar-reminder-emails", "ar-reminders-daily"]));
  });
});

describe("assertExpected", () => {
  it("passes on exactly the expected set and aborts on one extra or one missing", () => {
    expect(() => assertExpected(["cpp-weekly-recalc", "daily-cpp-tiers"])).not.toThrow();
    expect(() => assertExpected(["cpp-weekly-recalc", "daily-cpp-tiers", "surprise"])).toThrow(/ABORTING/);
    expect(() => assertExpected(["daily-cpp-tiers"])).toThrow(/ABORTING/);
  });
});

describe("seed list", () => {
  it("no longer seeds the orphans, so a restart cannot re-create them; the ruled row is still seeded", () => {
    const seeded = seededNames();
    for (const n of EXPECTED_ORPHANS) expect(seeded).not.toContain(n);
    expect(seeded).toContain("ar-reminders-daily");
    expect(seeded.length).toBeGreaterThan(15);
  });
});

describe("endpointOf", () => {
  it("treats the pooled and direct hosts of one Neon endpoint as the same, and two endpoints as different", () => {
    const pooled = "postgresql://u:p@ep-cool-river-123-pooler.us-east-2.aws.neon.tech/db";
    const direct = "postgresql://owner:x@ep-cool-river-123.us-east-2.aws.neon.tech/db";
    const other = "postgresql://owner:x@ep-other-456.us-east-2.aws.neon.tech/db";
    expect(endpointOf(pooled)).toBe(endpointOf(direct));
    expect(endpointOf(pooled)).not.toBe(endpointOf(other));
  });
});
