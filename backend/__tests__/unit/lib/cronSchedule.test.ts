// lib/cronSchedule.ts — each job judged against its own expression. The flat
// 25-hour rule this replaced called compass-score-recalc (weekly) stale six days
// in seven, and never judged a job that had started and not ended.
import { describe, it, expect, vi, afterEach } from "vitest";

vi.mock("../../../src/config/database", () => ({
  prisma: { cronRegistry: { upsert: vi.fn().mockResolvedValue({}) } },
}));

import { expectedIntervalMs, isStale, nextFire } from "../../../src/lib/cronSchedule";
import { prisma } from "../../../src/config/database";
import { seedCronRegistry } from "../../../src/services/cronRegistryService";

const H = 3_600_000;
const D = 24 * H;
const NOW = new Date("2026-10-02T12:00:00.000Z");
const ago = (ms: number) => new Date(NOW.getTime() - ms);

describe("expectedIntervalMs", () => {
  it.each([
    ["0,30 * * * *", 30 * 60_000],
    ["15 */2 * * *", 2 * H],
    ["7 7 * * *", D],
    ["0 23 * * 0", 7 * D],
    ["0 7 1 * *", 31 * D],
    ["0 9 * * 1-5", 3 * D],
  ])("%s → longest gap %d ms", (expr, ms) => {
    expect(expectedIntervalMs(expr)).toBe(ms);
  });

  it("is null for an expression it cannot read, which is then not judged", () => {
    expect(expectedIntervalMs("manual")).toBeNull();
    expect(isStale({ enabled: true, schedule: "manual", lastRun: ago(400 * D) }, NOW)).toBe(false);
  });
});

describe("nextFire", () => {
  it("the monthly re-vet next fires 2026-11-01 07:00Z", () => {
    expect(nextFire("0 7 1 * *", NOW)?.toISOString()).toBe("2026-11-01T07:00:00.000Z");
  });
});

describe("isStale", () => {
  it("a weekly job inside its week stays fresh — the flat 25h rule called this stale", () => {
    expect(isStale({ enabled: true, schedule: "0 23 * * 0", lastRun: ago(4 * D) }, NOW)).toBe(false);
  });

  it("a job that started and never ended, beyond 1.5x its interval, is stale", () => {
    // RUNNING since 40h ago on a daily job: the guard holds, later fires skip, lastRun stops moving.
    expect(isStale({ enabled: true, schedule: "7 7 * * *", lastRun: ago(40 * H) }, NOW)).toBe(true);
  });

  it("the 1.5x grace: a daily job last started 30h ago is still fresh", () => {
    expect(isStale({ enabled: true, schedule: "7 7 * * *", lastRun: ago(30 * H) }, NOW)).toBe(false);
  });

  it("a half-hourly job silent for an hour is stale; one 20 minutes ago is not", () => {
    expect(isStale({ enabled: true, schedule: "0,30 * * * *", lastRun: ago(H) }, NOW)).toBe(true);
    expect(isStale({ enabled: true, schedule: "0,30 * * * *", lastRun: ago(20 * 60_000) }, NOW)).toBe(false);
  });

  it("a disabled job, or one that has never recorded a run, is not judged", () => {
    expect(isStale({ enabled: false, schedule: "7 7 * * *", lastRun: ago(30 * D) }, NOW)).toBe(false);
    expect(isStale({ enabled: true, schedule: "7 7 * * *", lastRun: null }, NOW)).toBe(false);
  });
});

describe("seedCronRegistry", () => {
  afterEach(() => vi.useRealTimers());

  it("registers monthly-carrier-revet with its real next run", async () => {
    vi.useFakeTimers({ now: NOW });
    await seedCronRegistry();
    const call = vi.mocked(prisma.cronRegistry.upsert).mock.calls.find((c: any) => c[0].where.jobName === "monthly-carrier-revet");
    expect(call?.[0].create).toMatchObject({ schedule: "0 7 1 * *", enabled: true, nextRun: new Date("2026-11-01T07:00:00.000Z") });
  });
});
