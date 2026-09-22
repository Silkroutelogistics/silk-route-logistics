/**
 * B5 gate — the seven carrier_profiles foreign keys, read off a LOCAL database.
 *
 * The migration at prisma/migrations/20260921120000_carrier_profile_fk_restrict (moved from _pending_migrations/ 2026-09-22, v3.8.bfw)
 * turns seven ON DELETE CASCADE / SET NULL constraints into RESTRICT by DROP +
 * ADD, by NAME and without IF EXISTS. A name that is not on the target fails the
 * deploy loudly (Item 208). So before the file moved into prisma/migrations/,
 * the names and their delete rules were read off the target, and the file moved
 * only once all seven were present with the rule each expects. Wasi ran that
 * read against production by hand on 2026-09-22: 7 rows, c x5 / n x2, 0 orphans.
 * This runner stays LOCAL-ONLY (see below) and is kept for re-verifying a
 * container, not for re-gating production.
 *
 * Two shapes:
 *   --expect pre   (default)  5 x CASCADE ('c') + 2 x SET NULL ('n')  — before the migration
 *   --expect post             7 x RESTRICT ('r')                       — after it
 * plus the orphan census: rows whose carrier FK names no carrier_profiles row.
 * Impossible while the constraints hold, so a non-zero count means a constraint
 * is missing on the target, not merely differently named.
 *
 * LOCAL ONLY, BY CONSTRUCTION. This script refuses any non-local host. It has
 * no --production mode and loads no production env file: the §2.2 rail counts
 * the ways production can be reached, and its guard sees `dotenv.config` —
 * a script that parsed .env.production.local with `dotenv.parse` would reach
 * production while the guard reported a clean tree. Against production the
 * header SQL is run by hand (psql / Neon SQL editor), which §2.2 states is
 * outside the rail and is a deliberate choice; the expected shape is stated
 * there and here so the by-hand result can be read against it.
 *
 * The session is set read-only before the first query, so a write would be
 * refused by Postgres rather than by discipline. Exit 0 only when the shape
 * matches --expect; exit 1 otherwise, printing every row.
 */
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";
import { hostOf, isLocalHost } from "./prisma-target-guard";

const BACKEND = path.resolve(__dirname, "..");
const ENV_FILE = path.join(BACKEND, ".env");

const args = process.argv.slice(2);
const expectArg = args[args.indexOf("--expect") + 1];
const expect: "pre" | "post" = args.includes("--expect") && expectArg === "post" ? "post" : "pre";

/** conname -> the delete rule the migration expects to FIND (pre) / LEAVE (post). */
const EXPECTED: Record<string, { pre: "c" | "n"; table: string; column: string; nullable: boolean }> = {
  load_tenders_carrierId_fkey:                          { pre: "c", table: "load_tenders",                  column: "carrierId",          nullable: false },
  quick_pay_enrollments_carrier_profile_id_fkey:        { pre: "c", table: "quick_pay_enrollments",         column: "carrier_profile_id", nullable: false },
  quick_pay_elections_carrier_profile_id_fkey:          { pre: "c", table: "quick_pay_elections",           column: "carrier_profile_id", nullable: false },
  carrier_training_requirements_carrierProfileId_fkey:  { pre: "c", table: "carrier_training_requirements", column: "carrierProfileId",   nullable: false },
  info_requests_carrierId_fkey:                         { pre: "c", table: "info_requests",                 column: "carrierId",          nullable: false },
  drivers_carrierProfileId_fkey:                        { pre: "n", table: "drivers",                       column: "carrierProfileId",   nullable: true  },
  dock_schedules_carrierId_fkey:                        { pre: "n", table: "dock_schedules",                column: "carrierId",          nullable: true  },
};
const NAMES = Object.keys(EXPECTED);

function resolveUrl(): string {
  const url =
    process.env.DATABASE_URL ||
    (fs.existsSync(ENV_FILE) ? dotenv.parse(fs.readFileSync(ENV_FILE)).DATABASE_URL : undefined);
  if (!url) {
    console.error("No DATABASE_URL — set it to a LOCAL container.");
    process.exit(1);
  }
  if (!isLocalHost(hostOf(url))) {
    console.error(`REFUSING: this gate is local-only; got ${hostOf(url)}. Against production, run the header SQL by hand.`);
    process.exit(1);
  }
  return url;
}

async function main() {
  const url = resolveUrl();
  console.log(`[b5-gate] target host : ${hostOf(url)} (local)`);
  console.log(`[b5-gate] expect      : ${expect === "pre" ? "5 x CASCADE + 2 x SET NULL (before the migration)" : "7 x RESTRICT (after it)"}`);
  console.log(`[b5-gate] mode        : READ ONLY (session default_transaction_read_only = on)\n`);

  const prisma = new PrismaClient({ datasourceUrl: url });
  let failures = 0;
  try {
    await prisma.$executeRawUnsafe(`SET default_transaction_read_only = on`);
    const ro: Array<{ default_transaction_read_only: string }> = await prisma.$queryRawUnsafe(`SHOW default_transaction_read_only`);
    if (ro[0]?.default_transaction_read_only !== "on") {
      console.error("REFUSING: could not set the session read-only.");
      process.exit(1);
    }

    // ── 1. the constraints, by name, with their delete rule ─────────────────
    const rows: Array<{ conname: string; confdeltype: string }> = await prisma.$queryRawUnsafe(
      `SELECT conname, confdeltype FROM pg_constraint
        WHERE contype = 'f' AND confrelid = 'public.carrier_profiles'::regclass
          AND conname = ANY($1::text[]) ORDER BY conname`,
      NAMES,
    );
    const found = new Map(rows.map((r) => [r.conname, r.confdeltype]));
    console.log("constraint                                            found  expected");
    for (const name of NAMES) {
      const want = expect === "pre" ? EXPECTED[name].pre : "r";
      const got = found.get(name);
      const ok = got === want;
      if (!ok) failures++;
      console.log(`${ok ? "  ok " : "  !! "} ${name.padEnd(52)} ${(got ?? "MISSING").padEnd(7)} ${want}`);
    }

    // ── 2. orphans: a child row whose carrier FK names no carrier ───────────
    console.log("\norphan census (must be 0 on every row)");
    for (const name of NAMES) {
      const { table, column, nullable } = EXPECTED[name];
      const notNull = nullable ? `c."${column}" IS NOT NULL AND ` : "";
      const r: Array<{ n: bigint }> = await prisma.$queryRawUnsafe(
        `SELECT count(*)::bigint AS n FROM "${table}" c LEFT JOIN carrier_profiles p ON p.id = c."${column}"
          WHERE ${notNull}p.id IS NULL`,
      );
      const n = Number(r[0]?.n ?? 0);
      if (n !== 0) failures++;
      console.log(`${n === 0 ? "  ok " : "  !! "} ${table.padEnd(32)} ${n}`);
    }
  } finally {
    await prisma.$disconnect();
  }

  if (failures) {
    console.log(`\n[b5-gate] ${failures} deviation(s) from the ${expect} shape — the migration must NOT move until this reads clean.`);
    process.exit(1);
  }
  console.log(`\n[b5-gate] OK — the target carries the ${expect} shape: all seven present, no orphans.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
