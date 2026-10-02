// A schedule's comment must not promise minutes its expression does not fire on.
//
// v3.8.arh (8d05ec65) moved the cron fleet onto :00/:30 so Neon can suspend, and
// left the old offsets in the comments ("at :03, :18, :33, :48", "every 5
// minutes"). On 2026-10-02 those comments were read as the intended schedule
// and nearly reverted the consolidation (health-digest arc B4). Only two claim
// forms are checked, because only those are unambiguous: "at :NN[, :NN]" and
// "every N minutes", in the comment block directly above a cron.schedule.
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.join(__dirname, "../../../src");
const FILES = ["cron/index.ts", "services/schedulerService.ts"];

function minuteSet(field: string): number[] {
  const out = new Set<number>();
  for (const part of field.split(",")) {
    const m = /^(\*|\d+)(?:-(\d+))?(?:\/(\d+))?$/.exec(part);
    if (!m) throw new Error(`unreadable minute field ${field}`);
    const lo = m[1] === "*" ? 0 : Number(m[1]);
    const hi = m[2] ? Number(m[2]) : m[1] === "*" || m[3] ? 59 : lo;
    for (let v = lo; v <= hi; v += Number(m[3] ?? 1)) out.add(v);
  }
  return [...out].sort((a, b) => a - b);
}

interface Sched { where: string; expr: string; comment: string }

export function schedulesWithComments(file: string, src: string): Sched[] {
  const lines = src.split(/\r?\n/);
  const out: Sched[] = [];
  lines.forEach((line, i) => {
    const m = /cron\.schedule\(\s*"([^"]+)"/.exec(line);
    if (!m) return;
    const block: string[] = [];
    for (let j = i - 1; j >= 0 && /^\s*\/\//.test(lines[j]); j--) block.unshift(lines[j]);
    out.push({ where: `${file}:${i + 1}`, expr: m[1], comment: block.join("\n") });
  });
  return out;
}

/** Every way the comment above `s` disagrees with its expression. */
export function drift(s: Sched): string[] {
  const [minField, hourField] = s.expr.split(/\s+/);
  const mins = minuteSet(minField);
  const problems: string[] = [];
  for (const m of s.comment.matchAll(/\bat\s+(:\d{2}(?:\s*(?:,|and)\s*:\d{2})*)/gi)) {
    for (const c of m[1].match(/\d{2}/g)!.map(Number)) {
      if (!mins.includes(c)) problems.push(`claims :${String(c).padStart(2, "0")}, fires on :${mins.join(",:")}`);
    }
  }
  for (const m of s.comment.matchAll(/\bevery\s+(\d+)\s+minutes\b/gi)) {
    const n = Number(m[1]);
    const gaps = mins.map((v, i) => (i ? v - mins[i - 1] : v + 60 - mins[mins.length - 1]));
    if (hourField !== "*" || gaps.some((g) => g !== n)) problems.push(`claims every ${n} minutes, expression is "${s.expr}"`);
  }
  return problems.map((p) => `${s.where} ${p}`);
}

const ALL = FILES.flatMap((f) => schedulesWithComments(f, fs.readFileSync(path.join(SRC, f), "utf8")));

describe("schedule comments", () => {
  it("reads every schedule in both files (a blind reader would pass anything)", () => {
    expect(ALL.length).toBe(64);
  });

  it("no comment promises a minute or cadence its expression does not have", () => {
    expect(ALL.flatMap(drift)).toEqual([]);
  });

  it("catches the drift that existed before B4 (self-test)", () => {
    const stale = { where: "fixture", expr: "0,30 * * * *", comment: "  // ELD GPS sync: every 15 minutes at :03, :18, :33, :48" };
    expect(drift(stale)).toHaveLength(5);
    expect(drift({ where: "fixture", expr: "0,30 * * * *", comment: "  // every 30 minutes at :00 and :30" })).toEqual([]);
  });
});

describe("the health digest's minute", () => {
  it("is 7 7 * * * (America/Toronto), and no other schedule fires at minute :07", () => {
    const digest = ALL.filter((s) => s.expr === "7 7 * * *");
    expect(digest).toHaveLength(1);
    const sharing = ALL.filter((s) => s !== digest[0] && minuteSet(s.expr.split(/\s+/)[0]).includes(7));
    expect(sharing.map((s) => `${s.where} ${s.expr}`)).toEqual([]);
  });
});
