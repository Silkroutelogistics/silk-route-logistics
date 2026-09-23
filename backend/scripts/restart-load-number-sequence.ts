/**
 * One-off: restart load_number_seq at 5001.
 *
 * WHY A SCRIPT AND NOT JUST THE CODE EDIT. generateLoadNumber issues
 * `CREATE SEQUENCE IF NOT EXISTS load_number_seq START WITH 5001`. The
 * `IF NOT EXISTS` means the START WITH clause applies ONLY where the sequence
 * does not yet exist — a fresh CI database, a local container. On production the
 * sequence already exists at ~121497, so the code edit alone changes nothing
 * there. This is the other half; without it the code and the database drift and
 * the next load still comes out SRL-121498.
 *
 * WHY GOING BACKWARDS IS SAFE. Live loads occupy SRL-121472..121497. Restarting
 * at 5001 issues SRL-5001 upward, and the two ranges cannot meet until 116,471
 * more loads. Every column the stem feeds is @unique — Load.referenceNumber,
 * Load.loadNumber, Load.srlBolNumber, RateConfirmation.rateConNumber,
 * Invoice.srlDocNumber, CarrierPay.srlDocNumber — so even a collision throws
 * rather than silently overwriting a number on a carrier's signed paperwork.
 *
 * THE PRE-FLIGHT MEASURES HEADROOM, NOT OCCUPANCY. Its first version counted any
 * load holding a stem in [5001, currentValue] and refused on 18 — which were the
 * existing SRL-1214xx loads themselves. A blunt occupancy count refuses on the
 * very rows that define the high-water mark, so it can never pass. What actually
 * matters is the LOWEST occupied stem at or above the restart point, because
 * that is where the first collision lands; everything below it is free. The
 * check is re-run at execution time against the target database, since a census
 * taken minutes earlier is evidence about that moment and not about this one.
 *
 * Loads issued before the restart keep their SRL-121xxx stems. A number already
 * printed on a bill of lading is never rewritten.
 *
 *   BACKFILL_DATABASE_URL="postgres://..." \
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= \
 *   npx tsx scripts/restart-load-number-sequence.ts --commit
 */
import { PrismaClient } from "@prisma/client";
import { hostOf, isLocalHost } from "./prisma-target-guard";

const RESTART_AT = 5001;
/** Refuse if fewer than this many loads fit before the first existing stem. */
const MIN_HEADROOM = 1000;

const COMMIT = process.argv.includes("--commit");

function refuse(msg: string): never {
  console.error(`REFUSING: ${msg}`);
  process.exit(1);
}

function assertOutboundSilent(): void {
  for (const key of ["RESEND_API_KEY", "OPENPHONE_API_KEY", "QUO_API_KEY"]) {
    if (process.env[key]) refuse(`${key} is set to a real value. Outbound would be LIVE. Pass it empty.`);
  }
}

async function main(): Promise<void> {
  assertOutboundSilent();

  const url = process.env.BACKFILL_DATABASE_URL;
  if (!url) refuse("set BACKFILL_DATABASE_URL to the target database. See the header.");

  const host = hostOf(url);
  console.log(`[seq-restart] target : ${host}`);
  console.log(
    `[seq-restart] note   : ${isLocalHost(host) ? "LOCAL host" : "REMOTE host -- writes here are production writes"}`,
  );
  console.log(`[seq-restart] mode   : ${COMMIT ? "COMMIT" : "DRY RUN"}\n`);

  const prisma = new PrismaClient({ datasourceUrl: url });
  try {
    const seq = await prisma.$queryRawUnsafe<{ last_value: bigint; is_called: boolean }[]>(
      "SELECT last_value, is_called FROM load_number_seq",
    );
    if (!seq?.length) refuse("load_number_seq does not exist on this database.");
    const current = Number(seq[0].last_value);
    const nextIfUnchanged = seq[0].is_called ? current + 1 : current;
    console.log(`load_number_seq last_value = ${current} (next would be ${nextIfUnchanged})`);

    if (current < RESTART_AT) {
      console.log(`Nothing to do: the sequence is already below ${RESTART_AT}.`);
      return;
    }

    // Pre-flight, at execution time against THIS database.
    //
    // The question is NOT "does anything sit above RESTART_AT" — the existing
    // SRL-1214xx loads do, by definition, and a blunt count refuses on the very
    // rows that define the high-water mark. The question is HEADROOM: the
    // sequence issues RESTART_AT upward, so the first collision is at the LOWEST
    // occupied stem at or above RESTART_AT, and what matters is how many loads
    // fit before it.
    const nearest = await prisma.$queryRawUnsafe<{ lowest: bigint | null }[]>(
      `SELECT MIN(stem)::bigint AS lowest FROM (
         SELECT CAST(SUBSTRING("referenceNumber" FROM 5) AS BIGINT) AS stem FROM loads
           WHERE "referenceNumber" ~ '^SRL-[0-9]+$'
         UNION ALL
         SELECT CAST(SUBSTRING("loadNumber" FROM 5) AS BIGINT) AS stem FROM loads
           WHERE "loadNumber" ~ '^SRL-[0-9]+$'
       ) s WHERE stem >= $1`,
      RESTART_AT,
    );
    const lowestAbove = nearest[0].lowest === null ? null : Number(nearest[0].lowest);

    if (lowestAbove === null) {
      console.log(`no existing load holds a stem at or above ${RESTART_AT} — unlimited headroom`);
    } else {
      const headroom = lowestAbove - RESTART_AT;
      console.log(`lowest existing stem at or above ${RESTART_AT} : ${lowestAbove}`);
      console.log(`headroom before the first collision              : ${headroom.toLocaleString()} loads`);
      if (headroom < MIN_HEADROOM) {
        refuse(
          `only ${headroom} load(s) of headroom before SRL-${lowestAbove} is re-issued, ` +
            `below the ${MIN_HEADROOM} minimum. The unique constraints would throw on arrival. ` +
            `Pick a different restart point.`,
        );
      }
    }

    console.log(`\nPLANNED: ALTER SEQUENCE load_number_seq RESTART WITH ${RESTART_AT};`);
    console.log(`         next load number becomes SRL-${RESTART_AT}`);
    console.log(`         existing SRL-121xxx loads keep their numbers\n`);

    if (!COMMIT) {
      console.log("DRY RUN -- nothing written. Re-run with --commit to apply.");
      return;
    }

    await prisma.$executeRawUnsafe(`ALTER SEQUENCE load_number_seq RESTART WITH ${RESTART_AT}`);

    const after = await prisma.$queryRawUnsafe<{ last_value: bigint; is_called: boolean }[]>(
      "SELECT last_value, is_called FROM load_number_seq",
    );
    const nowVal = Number(after[0].last_value);
    console.log(`COMMITTED. last_value = ${nowVal}, is_called = ${after[0].is_called}`);
    console.log(`Next load will be SRL-${after[0].is_called ? nowVal + 1 : nowVal}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("FAILED:", e);
  process.exit(1);
});
