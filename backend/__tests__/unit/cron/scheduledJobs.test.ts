// The boot inventory must match the jobs actually scheduled.
//
// SCHEDULED_JOB_NAMES is logged once at boot so a deployed process can be asked
// what it scheduled — the only external oracle available, since `cron_registry`
// covers a different set of jobs written by a different service, and node-cron
// has no name to read (the name is an argument to withGuard inside the
// callback, which does not run until the job first fires).
//
// A hand-maintained list rots. This parses the withGuard names straight out of
// cron/index.ts and asserts both directions, so adding a job without listing it
// — or listing one that no longer exists — fails here rather than turning the
// boot log into a comfortable lie.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import { SCHEDULED_JOB_NAMES } from "../../../src/cron";

const source = fs.readFileSync(path.join(__dirname, "../../../src/cron/index.ts"), "utf8");

/** Job names as they appear in the withGuard calls — the ground truth. */
function withGuardNames(): string[] {
  const names = new Set<string>();
  const re = /withGuard\(\s*["']([^"']+)["']/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source)) !== null) names.add(m[1]);
  return [...names].sort();
}

describe("cron boot inventory", () => {
  it("lists every job that is actually scheduled", () => {
    const actual = withGuardNames();
    const declared = [...SCHEDULED_JOB_NAMES].sort();
    const missing = actual.filter((n) => !declared.includes(n));
    expect(missing, `scheduled but not in SCHEDULED_JOB_NAMES: ${missing.join(", ")}`).toEqual([]);
  });

  it("does not list jobs that no longer exist", () => {
    const actual = withGuardNames();
    const declared = [...SCHEDULED_JOB_NAMES].sort();
    const stale = declared.filter((n) => !actual.includes(n));
    expect(stale, `listed but no longer scheduled: ${stale.join(", ")}`).toEqual([]);
  });

  it("includes pod-reminders — the job this oracle was built to confirm", () => {
    expect(SCHEDULED_JOB_NAMES).toContain("pod-reminders");
    expect(withGuardNames()).toContain("pod-reminders");
  });

  it("includes the other jobs added across this arc", () => {
    expect(SCHEDULED_JOB_NAMES).toContain("authority-date-resolution");
  });

  it("has no duplicates", () => {
    expect(new Set(SCHEDULED_JOB_NAMES).size).toBe(SCHEDULED_JOB_NAMES.length);
  });
});
