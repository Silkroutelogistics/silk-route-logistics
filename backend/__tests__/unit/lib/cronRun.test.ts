// lib/cronRun.ts — every scheduled run is recorded in cron_registry, and a job
// that catches and logs its own failure still records FAILED. Before this,
// 22 of 23 registry rows had never recorded a run (health-digest arc).
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/config/database", () => ({
  prisma: { cronRegistry: { upsert: vi.fn(), update: vi.fn() } },
}));

const fires: Array<() => unknown> = [];
const NEXT = new Date("2026-11-01T07:00:00.000Z");
vi.mock("node-cron", () => ({
  default: {
    schedule: vi.fn((_expr: string, fn: () => unknown) => {
      fires.push(fn);
      return { getNextRun: () => NEXT };
    }),
  },
}));

import { prisma } from "../../../src/config/database";
import { cron, recordRun } from "../../../src/lib/cronRun";
import { log } from "../../../src/lib/logger";

const reg = vi.mocked(prisma).cronRegistry as any;

/** Schedule `body` under `expr`, fire it once, and return what the fire returned. */
async function fireOnce(expr: string, body: () => Promise<void>) {
  cron.schedule(expr, () => body());
  return fires[fires.length - 1]();
}

beforeEach(() => {
  reg.upsert.mockReset().mockResolvedValue({});
  reg.update.mockReset().mockResolvedValue({});
});

describe("recordRun", () => {
  it("records RUNNING at start, then SUCCESS with duration, count and node-cron's next run", async () => {
    await fireOnce("0 7 1 * *", () => recordRun("monthly-carrier-revet", async () => {}));
    const start = reg.upsert.mock.calls[0][0];
    expect(start.where).toEqual({ jobName: "monthly-carrier-revet" });
    expect(start.create).toMatchObject({ schedule: "0 7 1 * *", lastStatus: "RUNNING" });
    const end = reg.update.mock.calls[0][0].data;
    expect(end).toMatchObject({ lastStatus: "SUCCESS", lastError: null, runCount: { increment: 1 }, nextRun: NEXT });
    expect(end.failCount).toBeUndefined();
    expect(typeof end.lastDuration).toBe("number");
  });

  it("a job that catches its own error and logs it records FAILED", async () => {
    await fireOnce("0,30 * * * *", () => recordRun("check-call-reminders", async () => {
      try {
        throw new Error("carrier lookup timed out");
      } catch (err) {
        log.error({ err }, "[Cron] Check call reminder error:");
      }
    }));
    const end = reg.update.mock.calls[0][0].data;
    expect(end.lastStatus).toBe("FAILED");
    expect(end.lastError).toContain("carrier lookup timed out");
    expect(end.failCount).toEqual({ increment: 1 });
  });

  it("a job that throws records FAILED and the error still propagates", async () => {
    await expect(
      fireOnce("0 7 * * *", () => recordRun("fmcsa-compliance", async () => { throw new Error("FMCSA 503"); })),
    ).rejects.toThrow("FMCSA 503");
    expect(reg.update.mock.calls[0][0].data).toMatchObject({ lastStatus: "FAILED", lastError: "FMCSA 503" });
  });

  it("one run's logged error does not leak into the next run of the same fire", async () => {
    await fireOnce("0 11 * * *", async () => {
      await recordRun("first", async () => { log.error("first failed"); });
      await recordRun("second", async () => {});
    });
    expect(reg.update.mock.calls.map((c: any) => c[0].data.lastStatus)).toEqual(["FAILED", "SUCCESS"]);
  });

  it("a registry that cannot be written does not stop the job", async () => {
    reg.upsert.mockRejectedValue(new Error("registry down"));
    reg.update.mockRejectedValue(new Error("registry down"));
    const body = vi.fn(async () => {});
    await fireOnce("0 * * * *", () => recordRun("invoice-aging", body));
    expect(body).toHaveBeenCalledTimes(1);
  });

  it("outside a scheduled fire (a manual call) it runs the job and records nothing", async () => {
    const body = vi.fn(async () => {});
    await recordRun("manual", body);
    expect(body).toHaveBeenCalledTimes(1);
    expect(reg.upsert).not.toHaveBeenCalled();
  });
});

// The wrapper only records what reaches it. If either scheduler imports node-cron
// directly or its guard stops calling recordRun, every case above stays green
// while nothing is recorded — so the wiring is asserted from the source.
describe("both schedulers are wired through it", () => {
  const fs = require("fs") as typeof import("fs");
  const path = require("path") as typeof import("path");
  const read = (rel: string) => fs.readFileSync(path.join(__dirname, "../../../src", rel), "utf8");
  const body = (src: string, fn: string) => {
    const at = src.indexOf(`async function ${fn}(`);
    return at < 0 ? "" : src.slice(at, src.indexOf("\n}", at));
  };

  for (const [file, guard] of [["cron/index.ts", "withGuard"], ["services/schedulerService.ts", "withLock"]]) {
    it(`${file}: schedules through lib/cronRun, and ${guard} runs the job via recordRun`, () => {
      const src = read(file);
      expect(src).not.toMatch(/from\s+["']node-cron["']/);
      expect(src).toMatch(/import \{ cron, recordRun \} from "\.\.\/lib\/cronRun"/);
      expect(body(src, guard)).toContain("await recordRun(jobName, fn)");
    });
  }
});
