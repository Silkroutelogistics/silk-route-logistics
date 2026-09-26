/**
 * Move load_number_seq so the next load is 121498 (§21.2, corrected 2026-09-26).
 *
 * There is no new series: loads continue from the last legacy load, SRL-121497.
 * Production's sequence sits in the withdrawn start (loads 5001 and 5002 came
 * from it and keep their numbers; next would be 5003), and generateLoadNumber
 * refuses anything below LOAD_NUMBER_FLOOR, so until this runs production
 * refuses to create a load. That is deliberate: a production sequence moves by a
 * write somebody chose to take, here, never by code on deploy.
 *
 * The write is setval('load_number_seq', 121497, true), so nextval() returns
 * 121498. It moves FORWARD only, and refuses:
 *   - a next value already past 121498 (moving it would go backwards);
 *   - a highest SRL-<digits> load other than 121497 (the ruling's anchor; if it
 *     has moved, re-read the ruling, not this script);
 *   - any load already holding a bare number at or above 121498 (setval would
 *     issue it again, and the unique constraints would throw on arrival).
 * No sequence yet, or one already continuing at 121498, is a no-op.
 *
 * Dry run by default: it prints the current value and the plan. A write needs
 * --execute, and against production --target=prod with PRISMA_TARGET=production
 * (scripts/_prodTarget.ts). The URL comes from --env-file, never backend/.env.
 *
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= \
 *   npx tsx scripts/restart-load-number-sequence.ts --env-file=<file>
 */
import { openTarget } from "./_prodTarget";
import { LAST_LEGACY_LOAD_NUMBER, LOAD_NUMBER_FLOOR } from "../src/lib/documentNumber";

export interface SequenceFacts {
  lastValue: number | null; // null: the sequence does not exist yet
  isCalled: boolean;
  maxLegacyStem: number | null;
  lowestBareAtOrAboveFloor: number | null;
}

/** Pure: the setval to run, or why not. */
export function planSequenceMove(f: SequenceFacts): { setTo?: number; noop?: string; refuse?: string } {
  if (f.maxLegacyStem !== LAST_LEGACY_LOAD_NUMBER) {
    return { refuse: `the highest SRL- load is ${f.maxLegacyStem ?? "none"}, not ${LAST_LEGACY_LOAD_NUMBER}` };
  }
  if (f.lowestBareAtOrAboveFloor !== null) {
    return { refuse: `load ${f.lowestBareAtOrAboveFloor} already holds a number at or above ${LOAD_NUMBER_FLOOR}` };
  }
  if (f.lastValue === null) return { noop: `no sequence yet; generateLoadNumber creates it at ${LOAD_NUMBER_FLOOR}` };
  const next = f.isCalled ? f.lastValue + 1 : f.lastValue;
  if (next === LOAD_NUMBER_FLOOR) return { noop: `already continuing: next is ${next}` };
  if (next > LOAD_NUMBER_FLOOR) return { refuse: `next is ${next}; moving it to ${LOAD_NUMBER_FLOOR} would go backwards` };
  return { setTo: LAST_LEGACY_LOAD_NUMBER };
}

const num = (v: bigint | null | undefined) => (v === null || v === undefined ? null : Number(v));

async function readFacts(prisma: any): Promise<SequenceFacts> {
  const [reg] = await prisma.$queryRaw`SELECT to_regclass('load_number_seq') IS NOT NULL AS present`;
  const [seq] = reg.present
    ? await prisma.$queryRaw`SELECT last_value, is_called FROM load_number_seq`
    : [{ last_value: null, is_called: false }];
  const [legacy] = await prisma.$queryRaw`SELECT MAX(n) AS n FROM (
      SELECT CAST(SUBSTRING("referenceNumber" FROM 5) AS BIGINT) AS n FROM loads WHERE "referenceNumber" ~ '^SRL-[0-9]+$'
      UNION ALL SELECT CAST(SUBSTRING("loadNumber" FROM 5) AS BIGINT) FROM loads WHERE "loadNumber" ~ '^SRL-[0-9]+$') s`;
  const [bare] = await prisma.$queryRaw`SELECT MIN(n) AS n FROM (
      SELECT CAST("referenceNumber" AS BIGINT) AS n FROM loads WHERE "referenceNumber" ~ '^[0-9]+$'
      UNION ALL SELECT CAST("loadNumber" AS BIGINT) FROM loads WHERE "loadNumber" ~ '^[0-9]+$') s
    WHERE n >= ${LOAD_NUMBER_FLOOR}`;
  return { lastValue: num(seq.last_value), isCalled: seq.is_called, maxLegacyStem: num(legacy.n), lowestBareAtOrAboveFloor: num(bare.n) };
}

async function main() {
  const t = openTarget("seq-move");
  const { prisma } = await import("../src/config/database");
  try {
    const before = await readFacts(prisma);
    console.log("[seq-move] BEFORE", JSON.stringify(before));
    const plan = planSequenceMove(before);
    if (plan.refuse) { console.error(`[seq-move] REFUSED: ${plan.refuse}`); process.exit(2); }
    if (plan.noop) { console.log(`[seq-move] nothing to do: ${plan.noop}`); return; }
    console.log(`[seq-move] PLAN setval('load_number_seq', ${plan.setTo}, true): next load ${plan.setTo! + 1}`);
    if (!t.write) { console.log("[seq-move] DRY RUN — nothing written."); return; }
    await prisma.$queryRaw`SELECT setval('load_number_seq', ${plan.setTo!}::bigint, true)`;
    console.log("[seq-move] AFTER", JSON.stringify(await readFacts(prisma)));
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  main().catch((e) => { console.error("[seq-move] FAILED:", e); process.exit(1); });
}
