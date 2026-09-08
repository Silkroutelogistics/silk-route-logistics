/**
 * A Compass recalc run is answerable from the database afterwards.
 *
 * WHY THIS EXISTS. When the 2026-09-06 run produced no scorecard rows, there
 * was no way to tell from the database whether the job had run, been skipped by
 * the mutex, or crashed. Every path of it logged through pino only, so the
 * absence of a trace proved nothing: there was never going to be one.
 * cron_registry was no better, with lastRun NULL on all 22 of its rows and no
 * row for this job at all.
 *
 * Two things are pinned here. The batch now returns a tally rather than a bare
 * count, because a run that wrote nothing and a run that wrote a row for
 * everyone reported identically before. And the recorder that writes that tally
 * NEVER THROWS: recording that a job ran must not be able to stop it running.
 *
 * Phase 1 of the mandatory-ELD arc, commit 2 of 7.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

vi.mock("../../../src/config/database", () => ({
  prisma: {
    carrierProfile: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
    load: { findMany: vi.fn(), count: vi.fn() },
    checkCallSchedule: { findMany: vi.fn() },
    paymentDispute: { count: vi.fn() },
    document: { findMany: vi.fn() },
    loadTender: { findMany: vi.fn() },
    loadTrackingEvent: { findMany: vi.fn() },
    invoice: { aggregate: vi.fn() },
    carrierScorecard: { create: vi.fn() },
    carrierBonus: { create: vi.fn() },
    notification: { create: vi.fn() },
    systemLog: { create: vi.fn() },
    cronRegistry: { upsert: vi.fn() },
  },
}));

import { prisma } from "../../../src/config/database";
import {
  recalculateCarrierCPP,
  processAllCPPRecalculations,
} from "../../../src/services/integrationService";
import { recordCompassRecalcRun } from "../../../src/cron";

const p = vi.mocked(prisma) as any;

function profile(over: Record<string, unknown> = {}) {
  return {
    id: "cp_1",
    userId: "u_1",
    tier: "SILVER",
    cppTier: "SILVER",
    eldEnabled: false,
    user: { id: "u_1", firstName: "T", company: "T Co" },
    scorecards: [],
    ...over,
  };
}

function emptyWorld() {
  p.load.findMany.mockResolvedValue([]);
  p.load.count.mockResolvedValue(0);
  p.checkCallSchedule.findMany.mockResolvedValue([]);
  p.paymentDispute.count.mockResolvedValue(0);
  p.document.findMany.mockResolvedValue([]);
  p.loadTender.findMany.mockResolvedValue([]);
  p.loadTrackingEvent.findMany.mockResolvedValue([]);
  p.invoice.aggregate.mockResolvedValue({ _sum: { amount: 0 } });
  p.systemLog.create.mockResolvedValue({});
  p.cronRegistry.upsert.mockResolvedValue({});
}

describe("recalculateCarrierCPP reports why it did or did not write", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emptyWorld();
  });

  it("returns written when it writes", async () => {
    p.carrierProfile.findUnique.mockResolvedValue(profile());
    expect(await recalculateCarrierCPP("cp_1")).toBe("written");
  });

  it("returns no-profile when the carrier is gone", async () => {
    p.carrierProfile.findUnique.mockResolvedValue(null);
    expect(await recalculateCarrierCPP("cp_gone")).toBe("no-profile");
    expect(p.carrierScorecard.create).not.toHaveBeenCalled();
  });

  it("returns promoted when the run advances a GUEST carrier out of GUEST", async () => {
    // The §10 M1 gate: 3 or more completed loads and a latest score of 70 or
    // better. This asserts the outcome is REPORTED, not that the gate changed.
    // The gate itself is untouched by this arc.
    p.carrierProfile.findUnique.mockResolvedValue(
      profile({ tier: "GUEST", cppTier: "GUEST", scorecards: [{ overallScore: 88 }] }),
    );
    p.load.count.mockResolvedValue(3);

    expect(await recalculateCarrierCPP("cp_1")).toBe("promoted");
    expect(p.carrierProfile.update, "the promotion itself must still happen").toHaveBeenCalled();
    expect(p.carrierScorecard.create, "a promoted run writes no scorecard").not.toHaveBeenCalled();
  });
});

describe("processAllCPPRecalculations returns a tally, not a bare count", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emptyWorld();
  });

  it("counts written, promoted and missing separately", async () => {
    p.carrierProfile.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }, { id: "c" }]);
    p.carrierProfile.findUnique
      .mockResolvedValueOnce(profile({ id: "a" }))
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(
        profile({ id: "c", tier: "GUEST", cppTier: "GUEST", scorecards: [{ overallScore: 88 }] }),
      );
    // Only the third carrier reaches checkGuestPromotion, and it promotes.
    p.load.count.mockResolvedValue(3);

    const r: any = await processAllCPPRecalculations();

    expect(r.selected).toBe(3);
    expect(r.written).toBe(1);
    expect(r.noProfile).toBe(1);
    expect(r.promoted).toBe(1);
    expect(r.errors).toBe(0);
    // A run that wrote one row of three selected must not report as three
    // processed, which is what the old shape did.
    expect(r.written).not.toBe(r.selected);
  });

  it("counts an error without abandoning the rest of the batch", async () => {
    p.carrierProfile.findMany.mockResolvedValue([{ id: "a" }, { id: "b" }]);
    p.carrierProfile.findUnique
      .mockRejectedValueOnce(new Error("db blew up"))
      .mockResolvedValueOnce(profile({ id: "b" }));

    const r: any = await processAllCPPRecalculations();

    expect(r.errors).toBe(1);
    expect(r.written, "the second carrier must still be processed").toBe(1);
  });

  it("keeps the legacy recalculated key pointing at rows actually written", async () => {
    p.carrierProfile.findMany.mockResolvedValue([{ id: "a" }]);
    p.carrierProfile.findUnique.mockResolvedValue(profile({ id: "a" }));

    const r: any = await processAllCPPRecalculations();
    expect(r.recalculated).toBe(r.written);
  });
});

describe("recordCompassRecalcRun leaves the trace, and can never stop the run", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    emptyWorld();
  });

  it("writes a system_logs row a later reader can find by source", async () => {
    await recordCompassRecalcRun("start", { startedAt: "2026-09-06T23:00:00.000Z" }, "INFO");

    expect(p.systemLog.create).toHaveBeenCalledTimes(1);
    const row = p.systemLog.create.mock.calls[0][0].data;
    expect(row.logType).toBe("CRON_JOB");
    expect(row.source, "the source is how anyone finds these rows later").toBe(
      "cron:compass-score-recalc",
    );
    expect(row.severity).toBe("INFO");
    expect(row.details.startedAt).toBe("2026-09-06T23:00:00.000Z");
  });

  it("upserts cron_registry on start, because this job has never had a row", async () => {
    await recordCompassRecalcRun("start", {}, "INFO");

    expect(p.cronRegistry.upsert).toHaveBeenCalledTimes(1);
    const arg = p.cronRegistry.upsert.mock.calls[0][0];
    expect(arg.where.jobName).toBe("compass-score-recalc");
    // An update against a row that does not exist throws on the first run, so
    // the create branch is the load-bearing half rather than a formality.
    expect(arg.create.jobName).toBe("compass-score-recalc");
    expect(arg.update.lastRun).toBeInstanceOf(Date);
  });

  it("does not touch cron_registry on end, so lastRun means when the run began", async () => {
    await recordCompassRecalcRun("end", { rowsWritten: 2 }, "INFO");

    expect(p.systemLog.create).toHaveBeenCalledTimes(1);
    expect(p.cronRegistry.upsert).not.toHaveBeenCalled();
  });

  it("carries the severity it is given, so an errored run is greppable", async () => {
    await recordCompassRecalcRun("end", { errors: 3 }, "WARNING");
    expect(p.systemLog.create.mock.calls[0][0].data.severity).toBe("WARNING");
  });

  // THE LOAD-BEARING CASE. Recording that a job ran must not be able to stop it
  // running — the same rule the compliance-override record follows (§14). If
  // this ever throws, a database hiccup in the LOGGING turns a healthy recalc
  // into a failed one, which is the opposite of what the trace is for.
  it("never throws when system_logs is unwritable", async () => {
    p.systemLog.create.mockRejectedValue(new Error("system_logs is on fire"));
    await expect(recordCompassRecalcRun("end", {}, "ERROR")).resolves.toBeUndefined();
  });

  it("never throws when cron_registry is unwritable, and still wrote the log row", async () => {
    p.cronRegistry.upsert.mockRejectedValue(new Error("registry is on fire"));
    await expect(recordCompassRecalcRun("start", {}, "INFO")).resolves.toBeUndefined();
    expect(p.systemLog.create, "one write failing must not skip the other").toHaveBeenCalledTimes(1);
  });
});

describe("the cron body records both ends of a run", () => {
  // STRUCTURAL, and its limits are stated rather than implied. The recalc job
  // lives inside a cron.schedule callback that no unit test can invoke without
  // starting the scheduler, so this reads the source to prove the recorder is
  // WIRED at both ends and on the error path. What the recorder then DOES is
  // proven behaviourally above; this only proves it is called.
  const src = fs.readFileSync(path.join(__dirname, "../../../src/cron/index.ts"), "utf8");
  const start = src.indexOf('withGuard("compass-score-recalc"');
  const next = src.indexOf("cron.schedule", start);
  const job = src.slice(start, next > 0 ? next : src.length);

  // Whitespace-tolerant BY CONSTRUCTION: this codebase's formatter wraps a call
  // whose arguments are long, and the two "end" calls are both wrapped. A
  // matcher requiring the literal on the same line as the call name found ZERO
  // of them and reported a clean tree — §19 Sub-pattern 18, committed inside a
  // guard written against a different blindness. The fixtures below are the
  // gate; the count alone is not.
  const callsWith = (body: string, arg: string) =>
    body.match(new RegExp(`recordCompassRecalcRun\\(\\s*"${arg}"`, "g"))?.length ?? 0;

  it("its own matcher sees a wrapped call, which is the shape the file uses", () => {
    expect(callsWith('recordCompassRecalcRun("end", {}, "INFO")', "end")).toBe(1);
    expect(callsWith('recordCompassRecalcRun(\n      "end",\n      {},\n    )', "end")).toBe(1);
    expect(callsWith('recordCompassRecalcRun(\r\n  "end",\r\n)', "end")).toBe(1);
    expect(callsWith('recordCompassRecalcRun("start", {}, "INFO")', "end")).toBe(0);
  });

  it("calls the recorder once at start and on both end paths", () => {
    expect(callsWith(job, "start")).toBe(1);
    // Success and catch. An end row on only one of them means a crashed run
    // leaves a start with no end, which is exactly the signal being built.
    expect(callsWith(job, "end"), "success and error paths both record an end").toBe(2);
  });

  it("reports the tally fields the batch returns", () => {
    for (const k of ["carriersSelected", "rowsWritten", "skippedPromoted", "skippedNoProfile", "errors"]) {
      expect(job, `the end row must carry ${k}`).toContain(k);
    }
  });

  it("finds the job it is reading, so a rename cannot make this vacuous", () => {
    expect(start, "the guarded block must still be in this file").toBeGreaterThan(-1);
    expect(job.length).toBeGreaterThan(400);
  });
});
