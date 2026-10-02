/**
 * Every scheduled job's run, recorded in cron_registry.
 *
 * WHY. cron_registry was a seeded catalogue, not a ledger: registerCronJob had
 * no callers, so on 2026-10-02 22 of its 23 rows had never recorded a run and
 * the digest's staleness check was judging one job out of ~64. The one it did
 * judge, compass-score-recalc, recorded its start and never its end, so it sat
 * at RUNNING forever. (health-digest arc.)
 *
 * HOW, without touching 64 call sites. `cron.schedule` below is node-cron's,
 * with the fire's expression and task carried into the run through
 * AsyncLocalStorage. A job's NAME exists only inside withGuard (cron/index.ts)
 * and withLock (schedulerService.ts), so both call recordRun — the one wrapper.
 * A skipped run (guard held, lock held) never reaches it and records nothing.
 *
 * ERRORS. Most cron/index.ts jobs catch their own error and log.error it, so
 * nothing throws out of them. A run is FAILED if it throws OR if it logs at
 * error level while it runs (lib/logger.ts's observer). Without the second
 * half, every one of those jobs would record SUCCESS while failing.
 *
 * NEVER THROWS ON ITS OWN ACCOUNT. A registry write that fails is a warn line;
 * recording a run must not be able to stop it.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import nodeCron from "node-cron";
import { prisma } from "../config/database";
import { log, setErrorObserver } from "./logger";

interface Fire { schedule: string; nextRun: () => Date | null }
interface Run { firstError?: string }

const fireCtx = new AsyncLocalStorage<Fire>();
const runCtx = new AsyncLocalStorage<Run>();

setErrorObserver((message) => {
  const run = runCtx.getStore();
  if (run && run.firstError === undefined) run.firstError = message;
});

/** node-cron, with the expression carried into each fire. Drop-in for `cron.schedule`. */
export const cron = {
  schedule(expression: string, fn: () => unknown, options?: Parameters<typeof nodeCron.schedule>[2]) {
    const task = nodeCron.schedule(
      expression,
      () => fireCtx.run({ schedule: expression, nextRun: () => task.getNextRun() }, fn),
      options,
    );
    return task;
  },
};

/** Run `fn` as `jobName`, recording start, end, status, duration and error. */
export async function recordRun(jobName: string, fn: () => Promise<void>): Promise<void> {
  const fire = fireCtx.getStore();
  if (!fire) return fn(); // not a scheduled fire (a manual call): nothing to record against

  // A disabled row means "do not run": POST /monitoring/crons/:name/toggle was
  // decorative until this read (health-digest arc D1). It reads the JOB'S OWN
  // row. The AR switch (ar-reminder-emails) is a different row that
  // ar-daily-reminders consults inside the job, and is untouched by this.
  // A failed read fails OPEN: the job runs, exactly as before the toggle counted.
  let enabled = true;
  try {
    enabled = (await prisma.cronRegistry.findUnique({ where: { jobName }, select: { enabled: true } }))?.enabled ?? true;
  } catch (err) {
    log.warn({ err, job: jobName }, "[CronRun] could not read enabled; running");
  }
  if (!enabled) {
    await quietly(jobName, () => prisma.cronRegistry.update({
      where: { jobName },
      data: { lastStatus: "SKIPPED", lastError: null, nextRun: fire.nextRun() },
    }));
    log.info({ job: jobName }, "[CronRun] disabled in cron_registry: skipped");
    return;
  }

  const startedAt = new Date();
  await quietly(jobName, () => prisma.cronRegistry.upsert({
    where: { jobName },
    update: { schedule: fire.schedule, lastRun: startedAt, lastStatus: "RUNNING" },
    create: { jobName, schedule: fire.schedule, lastRun: startedAt, lastStatus: "RUNNING" },
  }));

  const run: Run = {};
  let thrown: unknown;
  try {
    await runCtx.run(run, fn);
  } catch (err) {
    thrown = err ?? new Error("job threw a nullish value");
  }
  const error = thrown !== undefined ? String((thrown as Error)?.message ?? thrown) : run.firstError;

  await quietly(jobName, () => prisma.cronRegistry.update({
    where: { jobName },
    data: {
      lastStatus: error === undefined ? "SUCCESS" : "FAILED",
      lastDuration: Date.now() - startedAt.getTime(),
      lastError: error === undefined ? null : error.slice(0, 500),
      runCount: { increment: 1 },
      ...(error !== undefined && { failCount: { increment: 1 } }),
      nextRun: fire.nextRun(),
    },
  }));
  if (thrown !== undefined) throw thrown;
}

async function quietly(jobName: string, write: () => Promise<unknown>) {
  try {
    await write();
  } catch (err) {
    // warn, not error: an error here would mark the run itself FAILED.
    log.warn({ err, job: jobName }, "[CronRun] could not record to cron_registry");
  }
}
