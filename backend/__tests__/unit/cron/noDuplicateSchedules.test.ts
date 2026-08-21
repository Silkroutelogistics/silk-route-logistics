// No function may be scheduled by both schedulers.
//
// WHY THIS EXISTS. `processExpiredTenders` was registered in cron/index.ts
// (`withGuard("tender-expiry-sweep")`) AND in schedulerService.ts
// (`withLock("tender-expiry")`) — two mechanisms, two keys, so neither excluded
// the other. `server.ts` boots both (`startSchedulers()` and `initCronJobs()`),
// so at :30 past every hour both fired against a read-then-write body, and
// every expired tender emailed the carrier and the AE twice. The Item 192 email
// flood class, arrived at by a scheduling accident rather than by threshold
// tuning. §13.3 Item 221.4.
//
// WHY THE EXISTING GUARD COULD NOT SEE IT. `scheduledJobs.test.ts` parses
// cron/index.ts and reconciles it against `SCHEDULED_JOB_NAMES` — both scoped
// to that one file by construction. schedulerService's jobs are invisible to
// it, to the boot inventory, and to the `/monitoring/crons` view. A duplicate
// that lives half in each file is in the blind spot of every check that
// existed. This one reads both.
//
// WHAT IT ASSERTS. Not "these two names differ" — names are exactly what
// diverged. It asserts on the FUNCTION each schedule invokes, which is the
// thing that actually runs twice.
//
// §19 Sub-pattern 16: a guard must exercise the property it claims. This is a
// static read, but the property IS static — which file schedules which
// function — so reading both files is the exercise. Verified by restoring the
// duplicate and watching it fail.

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.join(__dirname, "../../../src");
const FILES = {
  "cron/index.ts": fs.readFileSync(path.join(ROOT, "cron/index.ts"), "utf8"),
  "services/schedulerService.ts": fs.readFileSync(path.join(ROOT, "services/schedulerService.ts"), "utf8"),
};

/**
 * Functions invoked inside a `cron.schedule(...)` body, per file.
 *
 * Comments are stripped first: several `cron.schedule` blocks carry prose
 * naming the very functions under discussion (including this defect's own
 * explanation), and counting those would report a duplicate that does not run.
 * That is the comment-stripping lesson from the Item 199 schema-drift scanner,
 * applied here rather than relearned.
 */
function scheduledCalls(src: string): Set<string> {
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/\/\/.*$/, ""))
    .join("\n");

  const found = new Set<string>();
  let i = code.indexOf("cron.schedule(");
  while (i !== -1) {
    // Walk to the end of this schedule call by brace balance, so nested
    // callbacks are included and the next call is not.
    let depth = 0;
    let j = code.indexOf("(", i);
    const start = j;
    for (; j < code.length; j++) {
      if (code[j] === "(") depth++;
      else if (code[j] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    const body = code.slice(start, j);
    // Any identifier being called. Filter to the ones that are plausibly job
    // bodies rather than language plumbing.
    const re = /\b([a-z][A-Za-z0-9_]{4,})\s*\(/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(body)) !== null) found.add(m[1]);
    i = code.indexOf("cron.schedule(", j);
  }
  return found;
}

/** Plumbing that legitimately appears in both files and schedules nothing. */
const IGNORED = new Set([
  "schedule", "withGuard", "withLock", "require", "import",
  "setTimeout", "setInterval", "catch", "then", "toISOString",
  "getTime", "toLocaleDateString", "console", "String", "Number",
  "parseInt", "parseFloat", "filter", "forEach",
  "async", "create", "findMany", "findFirst", "findUnique", "update",
  "updateMany", "getFullYear", "getMonth", "getDate", "getHours", "toFixed",
  "toLocaleString", "padStart", "slice", "reduce", "toUpperCase",
]);

describe("no function is scheduled by both schedulers", () => {
  it("cron/index.ts and schedulerService.ts do not double-schedule any job", () => {
    const a = scheduledCalls(FILES["cron/index.ts"]);
    const b = scheduledCalls(FILES["services/schedulerService.ts"]);

    const both = [...a].filter((n) => b.has(n) && !IGNORED.has(n)).sort();

    expect(
      both,
      both.length
        ? `scheduled in BOTH files, so both fire and the work runs twice: ${both.join(", ")}. ` +
          "Keep exactly one registration — prefer cron/index.ts, which the boot " +
          "inventory and SCHEDULED_JOB_NAMES can see."
        : "",
    ).toEqual([]);
  });

  it("still sees real work in each file, so an empty pass cannot be vacuous", () => {
    // A parser that silently matched nothing would pass the check above
    // forever. This is the tripwire for that — the exact failure mode banked
    // as §19 Sub-pattern 16.
    const a = scheduledCalls(FILES["cron/index.ts"]);
    const b = scheduledCalls(FILES["services/schedulerService.ts"]);
    expect(a.size, "parsed no scheduled calls out of cron/index.ts").toBeGreaterThan(3);
    expect(b.size, "parsed no scheduled calls out of schedulerService.ts").toBeGreaterThan(3);
  });

  it("processExpiredTenders is scheduled in exactly one file", () => {
    // Named explicitly because it is the one this guard was built for, and a
    // future refactor that reintroduces it should fail on its own name rather
    // than in a generic list.
    const inCron = scheduledCalls(FILES["cron/index.ts"]).has("processExpiredTenders");
    const inSched = scheduledCalls(FILES["services/schedulerService.ts"]).has("processExpiredTenders");
    expect([inCron, inSched].filter(Boolean).length, "tender expiry must be registered once, not twice").toBe(1);
  });
});
