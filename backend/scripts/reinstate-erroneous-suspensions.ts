/**
 * carrier-unsuspend arc (2026-10-01): reinstate the five carriers that the
 * monthly re-vet suspended in error at 2026-10-01 07:00 UTC.
 *
 * Manual, one-off, and outside the app build (tsconfig includes src only).
 * Run it from backend/:
 *
 *   npx tsx scripts/reinstate-erroneous-suspensions.ts             # dry run, READ ONLY
 *   npx tsx scripts/reinstate-erroneous-suspensions.ts --execute   # applies
 *
 * Production only, and explicitly so. Nothing comes from backend/.env, which
 * is the local container (§2.2 rail).
 *   dry run    connects as srl_readonly through _census-credential.ts, the
 *              route every production read takes (Item 304.2). Postgres
 *              itself refuses a write, and the transaction is READ ONLY as
 *              well.
 *   --execute  connects with DATABASE_URL from .env.production.local, read
 *              with dotenv.parse so process.env is untouched. Like the other
 *              tracked write scripts, it keeps the owner credential. Its
 *              endpoint must be the one the dry run read, or it refuses.
 * The masked endpoint is printed before anything runs.
 *
 * WHY DIRECT WRITES. The UI exit is lift (to REVIEWING) and then approve.
 * That sends each carrier two emails and two in-app notices, which is what
 * happened to DREAM TRANS on 2026-10-01. This script imports no service, so
 * no hook, email or notification can fire. It only writes the rows named
 * below:
 *
 *   carrier_profiles  onboardingStatus SUSPENDED -> APPROVED. status is set to
 *                     APPROVED as its pair (lib/carrierOperational). The three
 *                     autoSuspend* columns are cleared, because
 *                     loadComplianceService.ts:188 flags any load whose carrier
 *                     has autoSuspendedAt set.
 *   notifications     the one "Account Suspended — Compliance Review Failed"
 *                     notice the 07:00 run inserted for each carrier is
 *                     DELETED, so there is no portal trace.
 *   system_logs       one STATUS_CHANGE row per carrier, actor=system
 *                     (userId null). It keeps the previous cause, reason and
 *                     timestamp.
 *
 * SCOPE IS PROVEN, NOT ASSUMED. The five carriers are resolved by MC digits
 * (JETEX is stored as "585393" with no MC- prefix). Each must be SUSPENDED
 * with cause VETTING_CRITICAL, stamped inside the 07:00 run window, and not
 * archived. Any other state aborts the whole run, and AE_MANUAL is named
 * explicitly. A carrier that this script already reinstated counts as done,
 * so a second run finds 0 in scope and exits 0. All writes for all carriers
 * go in one transaction. Every guarded update must move exactly one row, and
 * every notice delete must remove exactly one, or the whole run rolls back.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { hostOf, isLocalHost } from "./prisma-target-guard";
import { resolveCensusCredential, announceCensusTarget } from "./_census-credential";

const EXECUTE = process.argv.includes("--execute");
const MC_DIGITS = ["1387981", "1697621", "585393", "99226", "1300321"];
const RUN_FROM = new Date("2026-10-01T07:00:00Z");
const RUN_TO = new Date("2026-10-01T07:05:00Z");
const NOTICE_TITLE = "Account Suspended — Compliance Review Failed";
const REASON = "erroneous auto-suspension; vetting checks never ran";
const SOURCE = "script/reinstate-erroneous-suspensions";

function refuse(msg: string): never {
  console.error("REFUSING: " + msg);
  process.exit(4);
}
/** Pooled and direct hostnames name one endpoint; compare the endpoint. */
const endpointOf = (h: string) => h.split(":")[0].toLowerCase().replace("-pooler", "");
const digest = (h: string) => crypto.createHash("sha256").update(endpointOf(h)).digest("hex").slice(0, 8);

const census = resolveCensusCredential(); // refuses unless Neon and not the owner role
announceCensusTarget(census, "reinstate");
let url = census.url;
if (EXECUTE) {
  const PROD_FILE = path.resolve(__dirname, "..", ".env.production.local");
  if (!fs.existsSync(PROD_FILE)) refuse("backend/.env.production.local does not exist.");
  const owner = dotenv.parse(fs.readFileSync(PROD_FILE)).DATABASE_URL;
  if (!owner) refuse(".env.production.local has no DATABASE_URL.");
  const host = hostOf(owner);
  if (isLocalHost(host)) refuse(`.env.production.local resolves to a local host (${host}).`);
  if (endpointOf(host) !== endpointOf(census.host)) {
    refuse(`.env.production.local (endpoint ${digest(host)}) is not the endpoint the dry run reads (${digest(census.host)}).`);
  }
  console.log(`[reinstate] write  : endpoint ${digest(host)} via .env.production.local (owner credential)`);
  url = owner;
}
console.log(`mode        : ${EXECUTE ? "EXECUTE (writes)" : "DRY RUN (read only)"}`);

const prisma = new PrismaClient({ datasourceUrl: url });

type Row = Awaited<ReturnType<typeof load>>[number];
async function load(db: Pick<PrismaClient, "carrierProfile">) {
  const all = await db.carrierProfile.findMany({
    where: { mcNumber: { not: null } },
    select: {
      id: true, mcNumber: true, companyName: true, userId: true, deletedAt: true,
      onboardingStatus: true, status: true,
      autoSuspendCause: true, autoSuspendedAt: true, autoSuspendReason: true,
    },
  });
  return all.filter((c) => MC_DIGITS.includes((c.mcNumber ?? "").replace(/\D/g, "")));
}

function classify(c: Row): "IN_SCOPE" | "DONE" | string {
  if (c.deletedAt) return "ABORT: archived";
  if (c.autoSuspendCause === "AE_MANUAL") return "ABORT: AE_MANUAL suspension, not a system one";
  if (c.onboardingStatus === "APPROVED" && c.status === "APPROVED" && !c.autoSuspendCause && !c.autoSuspendedAt) return "DONE";
  const at = c.autoSuspendedAt;
  if (
    c.onboardingStatus === "SUSPENDED" && c.status === "SUSPENDED" &&
    c.autoSuspendCause === "VETTING_CRITICAL" && at && at >= RUN_FROM && at < RUN_TO
  ) return "IN_SCOPE";
  return `ABORT: off-state ${c.onboardingStatus}/${c.status} cause=${c.autoSuspendCause} at=${at?.toISOString()}`;
}

class Rollback extends Error {}

async function main() {
  const startedAt = new Date();
  let applied = 0;
  try {
    await prisma.$transaction(async (tx) => {
      if (!EXECUTE) {
        await tx.$executeRawUnsafe("SET TRANSACTION READ ONLY");
        const ro = await tx.$queryRawUnsafe<{ transaction_read_only: string }[]>("SHOW transaction_read_only");
        if (ro[0]?.transaction_read_only !== "on") throw new Error("dry run could not lock READ ONLY");
      }

      const rows = await load(tx);
      const byDigits = new Map(rows.map((r) => [(r.mcNumber ?? "").replace(/\D/g, ""), r]));
      if (rows.length !== MC_DIGITS.length || byDigits.size !== MC_DIGITS.length) {
        throw new Error(`expected exactly ${MC_DIGITS.length} carriers by MC, resolved ${rows.length}: ${rows.map((r) => r.mcNumber).join(", ")}`);
      }

      const verdicts = rows.map((c) => ({ c, v: classify(c) }));
      const aborts = verdicts.filter((x) => x.v.startsWith("ABORT"));
      for (const { c, v } of verdicts) console.log(`  ${(c.mcNumber ?? "").padEnd(11)} ${(c.companyName ?? "").padEnd(24)} ${v}`);
      if (aborts.length) throw new Error(`${aborts.length} carrier(s) outside scope; nothing written`);
      const inScope = verdicts.filter((x) => x.v === "IN_SCOPE").map((x) => x.c);
      console.log(`in scope    : ${inScope.length} (done already: ${rows.length - inScope.length})`);

      for (const c of inScope) {
        const notices = await tx.notification.findMany({
          where: { userId: c.userId, title: NOTICE_TITLE, createdAt: { gte: RUN_FROM, lt: RUN_TO } },
          select: { id: true, read: true },
        });
        if (notices.length !== 1) throw new Error(`${c.mcNumber}: expected 1 suspension notice, found ${notices.length}`);
        console.log(`\n  ${c.mcNumber} ${c.companyName} (${c.id})`);
        console.log(`    onboardingStatus  ${c.onboardingStatus} -> APPROVED`);
        console.log(`    status            ${c.status} -> APPROVED`);
        console.log(`    autoSuspendCause  ${c.autoSuspendCause} -> null`);
        console.log(`    autoSuspendedAt   ${c.autoSuspendedAt?.toISOString()} -> null`);
        console.log(`    autoSuspendReason "${(c.autoSuspendReason ?? "").slice(0, 60)}…" -> null`);
        console.log(`    notice delete     ${notices[0].id} (read=${notices[0].read})`);
        console.log(`    system_logs       +1 STATUS_CHANGE source=${SOURCE}`);
        if (!EXECUTE) continue;

        const moved = await tx.carrierProfile.updateMany({
          where: {
            id: c.id, deletedAt: null, onboardingStatus: "SUSPENDED", status: "SUSPENDED",
            autoSuspendCause: "VETTING_CRITICAL", autoSuspendedAt: { gte: RUN_FROM, lt: RUN_TO },
          },
          data: {
            onboardingStatus: "APPROVED",
            status: "APPROVED", // paired; see lib/carrierOperational
            autoSuspendCause: null,
            autoSuspendedAt: null,
            autoSuspendReason: null,
          },
        });
        if (moved.count !== 1) throw new Error(`${c.mcNumber}: guarded update moved ${moved.count} rows`);
        const gone = await tx.notification.deleteMany({ where: { id: notices[0].id, userId: c.userId, title: NOTICE_TITLE } });
        if (gone.count !== 1) throw new Error(`${c.mcNumber}: notice delete removed ${gone.count} rows`);
        await tx.systemLog.create({
          data: {
            logType: "STATUS_CHANGE",
            severity: "INFO",
            source: SOURCE,
            userId: null,
            message: `Carrier ${c.companyName} (${c.mcNumber}) reinstated SUSPENDED -> APPROVED: ${REASON}`,
            details: {
              actionDetail: "CARRIER_REINSTATED",
              actor: "system",
              carrierId: c.id,
              previousStatus: "SUSPENDED",
              newStatus: "APPROVED",
              previousCause: c.autoSuspendCause,
              previousReason: c.autoSuspendReason,
              previousSuspendedAt: c.autoSuspendedAt?.toISOString() ?? null,
              deletedNotificationId: notices[0].id,
              reason: REASON,
            },
          },
        });
        applied++;
      }
      if (!EXECUTE) throw new Rollback();
    }, { timeout: 60_000 });
  } catch (e) {
    if (!(e instanceof Rollback)) throw e;
  }

  const emails = await prisma.emailLog.count({ where: { createdAt: { gte: startedAt } } });
  console.log(`\n${EXECUTE ? `applied     : ${applied}` : "dry run     : rolled back, nothing written"}`);
  console.log(`email_logs rows created during run (any recipient): ${emails}`);
}

main()
  .catch((e) => { console.error("ABORTED:", e.message); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
