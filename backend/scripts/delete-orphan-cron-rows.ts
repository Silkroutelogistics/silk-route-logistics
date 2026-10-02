/**
 * Delete the cron_registry rows that no scheduled job will ever write.
 *
 * WHAT. A row is an orphan when it has NEVER recorded a run (lastRun is null),
 * its name is not a withGuard/withLock job name in cron/index.ts or
 * schedulerService.ts, and it is not PROTECTED. Measured 2026-10-02
 * (health-digest arc B6) against the code at this commit, two:
 *
 *   cpp-weekly-recalc   — the weekly recalc now runs as "compass-score-recalc"
 *   daily-cpp-tiers     — superseded by "daily-cpp-cleanup" (cron/index.ts)
 *
 * ar-reminders-daily also meets the definition (the credit block records as
 * "overdue-credit-block-daily") but is PROTECTED: its description is an owner
 * ruling (v3.8.bnn, 2026-09-27 item 5, arReminderSwitch.test.ts). Deleting it
 * is the owner's call, not this script's.
 *
 * The same commit removes both from seedCronRegistry. Until that is
 * DEPLOYED, any restart re-creates them, so --execute only after the deploy.
 *
 * HOW.
 *   npx tsx scripts/delete-orphan-cron-rows.ts            dry run (default)
 *   npx tsx scripts/delete-orphan-cron-rows.ts --execute  owner go only
 *   --env-dir <dir>   where the two credential files live (default backend/), so
 *                     a worktree can use the main checkout's files without copies
 *
 * Dry run: srl_readonly via _census-credential (refuses the owner role), in a
 * READ ONLY transaction that is always rolled back. --execute: the owner URL
 * from backend/.env.production.local, refused unless its Neon endpoint is the
 * one the read-only credential reaches; the set is recomputed inside the write
 * transaction and the delete is rolled back unless it removes exactly the
 * expected rows. Either mode aborts if the orphan set is not EXACTLY EXPECTED.
 */
import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { resolveCensusCredential } from "./_census-credential";
import { AR_REMINDER_SWITCH } from "../src/lib/arReminderSwitch";

export const EXPECTED_ORPHANS = ["cpp-weekly-recalc", "daily-cpp-tiers"];
/** Never orphans: a switch row that holds state, and a row whose text is an owner ruling. */
export const PROTECTED = [AR_REMINDER_SWITCH, "ar-reminders-daily"];

const SRC = path.join(__dirname, "../src");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

/** Every job name a scheduled fire can record under. */
export function scheduledJobNames(srcRoot = SRC): Set<string> {
  const names = new Set<string>();
  for (const f of ["cron/index.ts", "services/schedulerService.ts"]) {
    for (const m of strip(fs.readFileSync(path.join(srcRoot, f), "utf8")).matchAll(/with(?:Guard|Lock)\(\s*"([^"]+)"/g)) names.add(m[1]);
  }
  if (names.size < 50) throw new Error(`only ${names.size} job names parsed; the extractor is blind, refusing`);
  return names;
}

/** Names still seeded at boot. A deleted row whose name is here comes back on the next restart. */
export function seededNames(srcRoot = SRC): string[] {
  const src = strip(fs.readFileSync(path.join(srcRoot, "services/cronRegistryService.ts"), "utf8"));
  const list = src.slice(src.indexOf("const jobs = ["), src.indexOf("];", src.indexOf("const jobs = [")));
  return [...list.matchAll(/jobName:\s*"([^"]+)"/g)].map((m) => m[1]);
}

export function resolveOrphans(rows: { jobName: string; lastRun: Date | null }[], jobs: Set<string>): string[] {
  return rows
    .filter((r) => r.lastRun === null && !jobs.has(r.jobName) && !PROTECTED.includes(r.jobName))
    .map((r) => r.jobName)
    .sort();
}

/** Throws unless `found` is exactly EXPECTED_ORPHANS. */
export function assertExpected(found: string[]): void {
  const want = [...EXPECTED_ORPHANS].sort();
  if (found.length !== want.length || found.some((n, i) => n !== want[i])) {
    throw new Error(`orphan set mismatch — expected [${want.join(", ")}] (${want.length}), found [${found.join(", ")}] (${found.length}); ABORTING`);
  }
}

/** The Neon endpoint a URL reaches, pooled or direct. */
export const endpointOf = (url: string) => new URL(url).hostname.replace("-pooler", "");
const masked = (host: string) => `*.neon.tech (endpoint ${crypto.createHash("sha256").update(endpointOf(`postgres://${host}`)).digest("hex").slice(0, 8)})`;

async function main() {
  const execute = process.argv.includes("--execute");
  const at = process.argv.indexOf("--env-dir");
  const envDir = at > 0 ? path.resolve(process.argv[at + 1]) : path.join(__dirname, "..");
  const jobs = scheduledJobNames();
  const stillSeeded = EXPECTED_ORPHANS.filter((n) => seededNames().includes(n));
  if (stillSeeded.length) throw new Error(`still seeded at boot in this checkout: ${stillSeeded.join(", ")}; deletion would be undone, refusing`);

  const ro = resolveCensusCredential(path.join(envDir, ".env.production.readonly"));
  console.log(`[orphans] read-only target: ${masked(ro.host)} as ${ro.user}`);
  const reader = new PrismaClient({ datasourceUrl: ro.url });
  let found: string[] = [];
  try {
    await reader.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
      // A SET that did not take reads exactly like one that did; read it back.
      const [{ transaction_read_only: ro_on }] = await tx.$queryRawUnsafe<{ transaction_read_only: string }[]>("SHOW transaction_read_only");
      if (ro_on !== "on") throw new Error(`read-only transaction did not take (transaction_read_only=${ro_on}); refusing`);
      const rows = await tx.cronRegistry.findMany({ select: { jobName: true, lastRun: true } });
      found = resolveOrphans(rows, jobs);
      console.log(`[orphans] rows ${rows.length} | job names ${jobs.size} | orphans ${found.length}: ${found.join(", ")}`);
      throw new Error("__rollback__");
    }).catch((e) => { if (e.message !== "__rollback__") throw e; });
  } finally {
    await reader.$disconnect();
  }
  assertExpected(found);
  console.log("[orphans] matches the expected list.");
  if (!execute) return console.log("[orphans] DRY RUN — nothing deleted. Pass --execute on owner go, after the seed change is deployed.");

  const ownerUrl = dotenv.parse(fs.readFileSync(path.join(envDir, ".env.production.local"))).DATABASE_URL;
  if (!ownerUrl) throw new Error("backend/.env.production.local carries no DATABASE_URL");
  if (endpointOf(ownerUrl) !== endpointOf(ro.url)) throw new Error("owner URL reaches a different endpoint than the dry run; refusing");
  console.log(`[orphans] EXECUTE against ${masked(new URL(ownerUrl).hostname)}`);
  const owner = new PrismaClient({ datasourceUrl: ownerUrl });
  try {
    await owner.$transaction(async (tx) => {
      const rows = await tx.cronRegistry.findMany({ select: { jobName: true, lastRun: true } });
      assertExpected(resolveOrphans(rows, jobs));
      const { count } = await tx.cronRegistry.deleteMany({ where: { jobName: { in: EXPECTED_ORPHANS }, lastRun: null } });
      if (count !== EXPECTED_ORPHANS.length) throw new Error(`deleted ${count}, expected ${EXPECTED_ORPHANS.length}; rolled back`);
      console.log(`[orphans] deleted ${count}.`);
    });
  } finally {
    await owner.$disconnect();
  }
}

if (require.main === module) main().catch((e) => { console.error(`[orphans] ${e.message}`); process.exit(1); });
