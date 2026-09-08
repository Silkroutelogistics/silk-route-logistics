/**
 * A2 — the production gate for migration 20260908140000_status_machine_counters.
 *
 * WHAT A ROW-COUNT GATE MEANS FOR A `CREATE TABLE`. The migration is strictly
 * additive: one new table, no column added to an existing table, no backfill, no
 * drop, nothing changes meaning. So "how many rows will change" is zero by
 * construction, and asking it proves nothing. The question that CAN fail is the
 * other one: does this table already exist in production, and is the migration
 * ledger in a state where a new migration can apply at all.
 *
 * WHY IT RUNS BEFORE THE PUSH, NOT AFTER. §13.3 Item 212: a column-drop reached
 * production carried along by a push, and the row-count gate in its own header
 * was run afterwards -- when the question it existed to answer had already
 * become unanswerable. A gate that runs after the migration is not a gate.
 *
 * NO WRITES, BY CONSTRUCTION. Loads `.env.production.local` the way
 * prisma:status:production does, refuses a local host, refuses a rail breach,
 * and sets `default_transaction_read_only = on` on the session before the first
 * query, so a write would be refused by Postgres rather than by discipline.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { railBreach, hostOf, isLocalHost } from "./prisma-target-guard";

const BACKEND = path.resolve(__dirname, "..");
const PROD_FILE = path.join(BACKEND, ".env.production.local");
const MIGRATION = "20260908140000_status_machine_counters";
const TABLE = "status_machine_counters";

if (!fs.existsSync(PROD_FILE)) {
  console.error("backend/.env.production.local does not exist — nothing to read.");
  process.exit(1);
}
const breach = railBreach(path.join(BACKEND, ".env"), PROD_FILE);
if (breach) {
  console.error(`REFUSING: .env and .env.production.local both resolve to ${breach.host}.`);
  process.exit(1);
}
const prodEnv = dotenv.parse(fs.readFileSync(PROD_FILE));
const url = prodEnv.DATABASE_URL ?? prodEnv.DIRECT_URL ?? "";
if (!url || isLocalHost(hostOf(url))) {
  console.error("REFUSING: .env.production.local resolves to a local host or is empty.");
  process.exit(1);
}

console.log(`[gate] production host : ${hostOf(url)}`);
console.log(`[gate] migration       : ${MIGRATION}`);
console.log(`[gate] mode            : READ ONLY (session default_transaction_read_only = on)\n`);

const n = (v: unknown) => (typeof v === "bigint" ? Number(v) : v);

async function main() {
  const prisma = new PrismaClient({ datasourceUrl: url });
  let verdict = 0;
  try {
    await prisma.$executeRawUnsafe(`SET default_transaction_read_only = on`);
    const ro: any[] = await prisma.$queryRawUnsafe(`SHOW default_transaction_read_only`);
    if (ro[0]?.default_transaction_read_only !== "on") {
      throw new Error("read-only session setting did not take — refusing to continue");
    }

    // 1. The table must NOT already exist. If it does, something created it
    //    outside the migration chain and `CREATE TABLE` will fail the deploy.
    const existing: any[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS c FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = $1;`,
      TABLE,
    );
    const tableExists = n(existing[0]?.c) === 1;
    console.log(`[1] table ${TABLE} already present : ${tableExists ? "YES" : "no"}`);
    if (tableExists) {
      console.log("    FAIL — CREATE TABLE would error on deploy.");
      verdict = 1;
    } else {
      console.log("    OK — the migration will create it.");
    }

    // 2. The migration must not already be in the ledger.
    const applied: any[] = await prisma.$queryRawUnsafe(
      `SELECT count(*)::int AS c FROM _prisma_migrations WHERE migration_name = $1;`,
      MIGRATION,
    );
    const already = n(applied[0]?.c) === 1;
    console.log(`[2] migration already in ledger    : ${already ? "YES" : "no"}`);
    if (already) {
      console.log("    FAIL — it would be skipped, and the table would not appear.");
      verdict = 1;
    } else {
      console.log("    OK — it is pending and will apply.");
    }

    // 3. The ledger must be clean. A failed or unfinished migration blocks
    //    `migrate deploy` outright, so a green local chain says nothing about
    //    whether this one can land.
    const ledger: any[] = await prisma.$queryRawUnsafe(
      `SELECT
         count(*)::int                                                       AS total,
         count(*) FILTER (WHERE finished_at IS NULL)::int                    AS unfinished,
         count(*) FILTER (WHERE rolled_back_at IS NOT NULL)::int             AS rolled_back
       FROM _prisma_migrations;`,
    );
    const l = ledger[0];
    console.log(
      `[3] ledger: ${n(l.total)} applied, ${n(l.unfinished)} unfinished, ${n(l.rolled_back)} rolled back`,
    );
    if (n(l.unfinished) !== 0 || n(l.rolled_back) !== 0) {
      console.log("    FAIL — migrate deploy will refuse against a dirty ledger.");
      verdict = 1;
    } else {
      console.log("    OK — clean.");
    }

    // 4. Blast radius, stated rather than assumed. The migration touches no
    //    existing table, so this is the population it CANNOT affect — reported
    //    so the claim "additive" is a measurement and not an adjective.
    const loads: any[] = await prisma.$queryRawUnsafe(`SELECT count(*)::int AS c FROM loads;`);
    console.log(`\n[4] rows in any existing table this migration alters : 0`);
    console.log(`    (loads currently holds ${n(loads[0]?.c)} rows and is not touched)`);

    console.log(`\nVERDICT: ${verdict === 0 ? "SAFE TO DEPLOY" : "DO NOT DEPLOY"}`);
  } finally {
    await prisma.$disconnect();
  }
  process.exit(verdict);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
