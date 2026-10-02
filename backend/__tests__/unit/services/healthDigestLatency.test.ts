// The digest's DB probe and headline. 10 of the 30 digests before this test
// existed read UNHEALTHY on a single cold-start SELECT 1 (1214 ms on
// 2026-10-02), and 30 of 30 were held off HEALTHY by a missing Sentry DSN.
import { describe, it, expect } from "vitest";
import { measureDbLatency, overallStatus } from "../../../src/services/healthDigestService";

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
