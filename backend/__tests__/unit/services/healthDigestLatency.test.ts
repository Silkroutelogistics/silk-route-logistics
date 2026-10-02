// The digest's DB probe and headline. 10 of the 30 digests before this test
// existed read UNHEALTHY on a single cold-start SELECT 1 (1214 ms on
// 2026-10-02), and 30 of 30 were held off HEALTHY by a missing Sentry DSN.
import { describe, it, expect } from "vitest";
import { judgeCrons, measureDbLatency, overallStatus } from "../../../src/services/healthDigestService";

/** A query whose successive calls take the given times; call 0 is the warm-up. */
function queryTaking(ms: number[]) {
  let call = 0;
  return () => new Promise((resolve) => setTimeout(resolve, ms[Math.min(call++, ms.length - 1)]));
}

describe("measureDbLatency", () => {
  it("one slow sample among fast ones is not UNHEALTHY — the median decides", async () => {
    const r = await measureDbLatency(queryTaking([0, 600, 5, 5]));
    expect(r.samplesMs).toHaveLength(3);
    expect(r.medianMs).toBeLessThan(100);
    expect(r.status).toBe("healthy");
  });

  it("a slow cold start is the warm-up, and its time is discarded", async () => {
    const r = await measureDbLatency(queryTaking([700, 5, 5, 5]));
    expect(r.status).toBe("healthy");
    expect(Math.max(...r.samplesMs)).toBeLessThan(100);
  });

  it("a consistently slow database caps at DEGRADED", async () => {
    const r = await measureDbLatency(queryTaking([0, 550, 550, 550]));
    expect(r.medianMs).toBeGreaterThanOrEqual(500);
    expect(r.status).toBe("degraded");
  });

  it("a query that throws is UNHEALTHY", async () => {
    let call = 0;
    const r = await measureDbLatency(() => (call++ < 2 ? Promise.resolve() : Promise.reject(new Error("connection reset"))));
    expect(r.status).toBe("unhealthy");
    expect(r.detail).toContain("connection reset");
  });

  it("a query that never returns is UNHEALTHY once the timeout passes", async () => {
    const r = await measureDbLatency(() => new Promise(() => {}), 50);
    expect(r.status).toBe("unhealthy");
    expect(r.detail).toContain("exceeded 50ms");
  });
});

describe("overallStatus", () => {
  it("a WARN row (missing Sentry DSN) does not move the headline", () => {
    expect(overallStatus([{ status: "healthy" }, { status: "warn" }])).toBe("HEALTHY");
  });

  it("degraded and unhealthy still do", () => {
    expect(overallStatus([{ status: "warn" }, { status: "degraded" }])).toBe("DEGRADED");
    expect(overallStatus([{ status: "degraded" }, { status: "unhealthy" }])).toBe("UNHEALTHY");
  });
});

// The digest's cron row, judged per job. Under the flat 25h rule this replaced,
// the weekly row below read stale and the stuck daily row was the only kind caught.
describe("judgeCrons", () => {
  const NOW = new Date("2026-10-02T12:00:00.000Z");
  const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 3_600_000);
  const row = (jobName: string, schedule: string, lastRun: Date | null, lastStatus: string | null) =>
    ({ jobName, schedule, enabled: true, lastRun, lastStatus });

  it("a weekly job inside its week stays fresh, and the row stays healthy", () => {
    const r = judgeCrons([row("compass-score-recalc", "0 23 * * 0", hoursAgo(4 * 24 + 13), "SUCCESS")], NOW);
    expect(r.staleCrons).toHaveLength(0);
    expect(r.component.status).toBe("healthy");
  });

  it("a job that started and never ended, beyond its interval, flags stale", () => {
    const r = judgeCrons([row("health-digest", "7 7 * * *", hoursAgo(40), "RUNNING")], NOW);
    expect(r.staleCrons.map((c) => c.jobName)).toEqual(["health-digest"]);
    expect(r.component.status).toBe("degraded");
  });

  it("a never-run job past its seeded nextRun plus grace is stale in the digest (C2)", () => {
    const r = judgeCrons([{ ...row("monthly-carrier-revet", "0 7 1 * *", null, null), nextRun: new Date("2026-10-01T07:00:00.000Z") }], NOW);
    expect(r.staleCrons.map((c) => c.jobName)).toEqual(["monthly-carrier-revet"]);
  });

  it("counts cron failures in the last 24h apart from web errors, and never-run rows without judging them", () => {
    const r = judgeCrons([
      row("ofac-rescan", "0 4 * * 1", hoursAgo(2), "FAILED"),
      row("old-failure", "0 4 * * 1", hoursAgo(30), "FAILED"),
      row("pre-tracing", "0 * * * *", null, null),
    ], NOW);
    expect(r.cronFailures24h).toBe(1);
    expect(r.component.detail).toContain("Never recorded: 1");
    expect(r.staleCrons).toHaveLength(0);
  });
});
