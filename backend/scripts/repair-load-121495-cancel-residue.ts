/**
 * C3 — clear the cancellation residue left on SRL-121495.
 *
 * WHAT IS ACTUALLY WRONG. The load is POD_RECEIVED — delivered, paperwork in —
 * and still carries `cancelledAt`, `cancelledById` and `cancellationFaultParty`
 * = SHIPPER. A delivered load that names a party at fault for cancelling it is a
 * record that contradicts itself, on the row a dispute reads.
 *
 *   (The arc brief said DELIVERED. Production says POD_RECEIVED. The repair is
 *   the same either way, but the difference is recorded rather than smoothed
 *   over — POD_RECEIVED is one step further on and means the paperwork landed.)
 *
 * WHY THE RESIDUE HAS THIS EXACT SHAPE, which is the part worth knowing. The
 * canonical reversal (`services/uncancelLoad.ts`) clears SIX columns:
 * reasonCode, faultParty, reason, cancelledAt, cancelledById, snapshot. Arc 1's
 * `reactivate-load-121495.ts` predates that endpoint and cleared TWO — its own
 * header says "reasonCode + reason, so the load stops claiming it was
 * cancelled." That was true of the two columns it named and false of the row:
 * three more kept claiming it. This finishes that job, and the target state is
 * defined by the canonical path rather than by a hand-made list — after this
 * runs, the row is byte-for-byte what `uncancelLoad` would have left.
 *
 * WHO READS THESE COLUMNS — the inventory the brief asked for first, derived
 * 2026-09-25 by grepping backend/src and frontend/src:
 *
 *   cancellationFaultParty  TWO writers, ONE clear, ZERO readers. Nothing
 *     reports, scores or bills on it. (There IS an `@@index` on it — an index
 *     for a reader that does not exist yet.) So SRL-121495 is counted in nothing
 *     because of it, today. It is wrong rather than harmful.
 *
 *   cancelledAt   The reversal queue (`GET /loads?reversible=true`) filters on
 *     it — but sets `where.status = "CANCELLED"` on the line above, so a
 *     POD_RECEIVED load is excluded by status before cancelledAt is consulted.
 *     Its other readers are all inside the uncancel flow, which refuses at
 *     `uncancelPolicy.ts:110` on `status !== "CANCELLED"`.
 *
 *   cancelledById   Writers and one clear. Zero readers. (The `cancelledById`
 *     hits in infoRequestService are a DIFFERENT model's column.)
 *
 * So: SRL-121495 is currently counted in NO report, scorecard or metric on
 * account of these three. The repair corrects a record, and does not move a
 * number anywhere. That is worth stating plainly rather than implying urgency
 * the evidence does not support.
 *
 *   ONE THING CHECKED AND FOUND NOT TO APPLY: `loadController.ts:537` computes
 *   `reversible: cancellationSnapshot !== null` on EVERY list row with no status
 *   gate, so a stale snapshot would offer a reverse affordance on a delivered
 *   load. SRL-121495's snapshot is NULL, so it does not. Recorded because the
 *   ungated flag is real and the next such row may not be so lucky.
 *
 * SAFETY. Targeted by id AND referenceNumber — both must match, so a copied
 * command cannot hit a different row. Refuses a genuinely CANCELLED load and
 * refuses one carrying a snapshot, because both of those belong to
 * `PUT /loads/:id/uncancel` and this script must not compete with it. The write
 * is a compare-and-swap pinned to the values just read, so a concurrent change
 * aborts rather than clobbers. Idempotent: a row already clean exits 0.
 *
 *   DRY RUN BY DEFAULT. `--commit` writes.
 *
 *   CREDENTIALS, AND THEY ARE DELIBERATELY ASYMMETRIC. A dry run resolves the
 *   read-only credential the ordinary way. A write will not go looking for one
 *   at all: it demands REPAIR_COMMIT_DATABASE_URL, so committing takes TWO
 *   deliberate acts and cannot happen because a script found a file on disk.
 *   (resolveCensusCredential REFUSES neondb_owner by design, so it could not
 *   have served the write path even if that had been the shape.)
 *
 *     REPAIR_ENV_FILE=/path/to/backend/.env.production.readonly \
 *       npx tsx scripts/repair-load-121495-cancel-residue.ts
 *
 *     REPAIR_COMMIT_DATABASE_URL='postgresql://...neon.tech/...' \
 *       npx tsx scripts/repair-load-121495-cancel-residue.ts --commit
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { resolveCensusCredential } from "./_census-credential";

const LOAD_ID = "cmuct8gnk001vma2db2hbgrsj";
const REFERENCE = "SRL-121495";
/** Gitignored via `.gitignore:79` — `backend/scripts/_*-undo.json`. */
const UNDO = path.join(__dirname, "_c3-121495-residue-undo.json");

const COMMIT = process.argv.includes("--commit");
const ENV_FILE = process.env.REPAIR_ENV_FILE;

type Row = {
  id: string;
  referenceNumber: string | null;
  status: string;
  cancelledAt: Date | null;
  cancelledById: string | null;
  cancellationFaultParty: string | null;
  cancellationReasonCode: string | null;
  cancellationReason: string | null;
  snapshot_is_null: boolean;
  deletedAt: Date | null;
  updatedAt: Date;
};

function j(v: unknown): string {
  return JSON.stringify(v, (_k, x) => (typeof x === "bigint" ? Number(x) : x), 2);
}

async function readRow(prisma: PrismaClient): Promise<Row | null> {
  const rows = await prisma.$queryRawUnsafe<Row[]>(
    `SELECT id, "referenceNumber", status, "cancelledAt", "cancelledById",
            "cancellationFaultParty", "cancellationReasonCode", "cancellationReason",
            ("cancellationSnapshot" IS NULL) AS snapshot_is_null,
            "deletedAt", "updatedAt"
       FROM loads
      WHERE id = $1 AND "referenceNumber" = $2`,
    LOAD_ID,
    REFERENCE,
  );
  return rows[0] ?? null;
}

/**
 * THE WRITE CREDENTIAL IS NEVER FOUND, ONLY HANDED OVER.
 *
 * `resolveCensusCredential` REFUSES neondb_owner by design (§13.3 Item 303.1), so
 * it cannot serve the commit path at all — and that is the right shape rather
 * than something to work around. A dry run resolves the read-only credential the
 * ordinary way; a write demands an explicitly-passed URL, so it takes TWO
 * deliberate acts (`--commit` and the variable) and cannot happen because a
 * script picked a file up off disk.
 */
function resolveUrl(): { url: string; host: string; user: string } {
  if (!COMMIT) return ENV_FILE ? resolveCensusCredential(ENV_FILE) : resolveCensusCredential();

  const url = process.env.REPAIR_COMMIT_DATABASE_URL;
  if (!url) {
    console.error("REFUSING: --commit requires REPAIR_COMMIT_DATABASE_URL to be passed explicitly.");
    console.error("The read-only census credential cannot write, and this script will not go");
    console.error("looking for one that can.");
    process.exit(1);
  }
  let u: globalThis.URL;
  try {
    u = new URL(url);
  } catch {
    console.error("REFUSING: REPAIR_COMMIT_DATABASE_URL is not a URL.");
    process.exit(1);
  }
  // Positive check: the host must BE Neon, rather than merely not-localhost, so
  // a host nobody anticipated is refused instead of allowed (§13.3 Item 303.1).
  if (!u.hostname.endsWith(".neon.tech")) {
    console.error(`REFUSING: host is "${u.hostname}", which is not a Neon endpoint.`);
    process.exit(1);
  }
  return { url, host: u.hostname, user: decodeURIComponent(u.username) };
}

async function main(): Promise<void> {
  const cred = resolveUrl();
  console.log(`\n${REFERENCE} cancellation-residue repair — ${COMMIT ? "COMMIT" : "DRY RUN"}`);
  console.log(`  host : ${cred.host}`);
  console.log(`  user : ${cred.user}\n`);

  const prisma = new PrismaClient({ datasourceUrl: cred.url });
  try {
    if (!COMMIT) {
      // Belt and braces on top of the role: a dry run must not be able to write
      // even if someone hands it an owner credential.
      await prisma.$executeRawUnsafe("SET default_transaction_read_only = on");
    }

    const before = await readRow(prisma);
    if (!before) {
      console.error(`REFUSING: no load matches BOTH id ${LOAD_ID} and reference ${REFERENCE}.`);
      process.exitCode = 1;
      return;
    }

    console.log("BEFORE:");
    console.log(j(before));
    console.log("");

    // ── Refusals ─────────────────────────────────────────────────────────────
    if (before.status === "CANCELLED") {
      console.error(
        "REFUSING: the load is CANCELLED. That is a real cancellation, not residue —\n" +
          "reverse it with PUT /loads/:id/uncancel, which restores the whole cascade.",
      );
      process.exitCode = 1;
      return;
    }
    if (!before.snapshot_is_null) {
      console.error(
        "REFUSING: the load carries a cancellationSnapshot, so the canonical uncancel\n" +
          "path applies and this script must not compete with it.",
      );
      process.exitCode = 1;
      return;
    }

    const dirty =
      before.cancelledAt !== null ||
      before.cancelledById !== null ||
      before.cancellationFaultParty !== null;
    if (!dirty) {
      console.log("Nothing to do — all three columns are already null. Exiting clean.");
      return;
    }

    console.log("WOULD CLEAR:");
    console.log(`  cancelledAt             ${j(before.cancelledAt)} -> null`);
    console.log(`  cancelledById           ${j(before.cancelledById)} -> null`);
    console.log(`  cancellationFaultParty  ${j(before.cancellationFaultParty)} -> null`);
    console.log(`  (status stays ${before.status}; nothing else is touched)\n`);

    // The before-image goes to disk BEFORE the write, on both paths. A dry run
    // that produces the undo file means the operator running --commit is not
    // depending on this process to have got that far.
    fs.writeFileSync(
      UNDO,
      JSON.stringify({ capturedAt: new Date().toISOString(), host: cred.host, before }, null, 2),
    );
    console.log(`before-image written: ${UNDO}`);

    if (!COMMIT) {
      console.log("\nDRY RUN — nothing was written. Re-run with --commit and an owner credential.");
      return;
    }

    // ── The write ────────────────────────────────────────────────────────────
    // Compare-and-swap: the WHERE pins every value read above, so if anything
    // moved between the read and the write this matches zero rows and reports it
    // rather than overwriting somebody else's change.
    const res = await prisma.load.updateMany({
      where: {
        id: LOAD_ID,
        referenceNumber: REFERENCE,
        status: before.status as never,
        cancelledAt: before.cancelledAt,
        cancelledById: before.cancelledById,
        cancellationFaultParty: before.cancellationFaultParty as never,
      },
      data: { cancelledAt: null, cancelledById: null, cancellationFaultParty: null },
    });

    if (res.count !== 1) {
      console.error(
        `REFUSING: the compare-and-swap matched ${res.count} rows, not 1.\n` +
          "The row changed between the read and the write. Nothing was written; re-run.",
      );
      process.exitCode = 1;
      return;
    }

    // A repair leaves a trace. SystemLog rather than AuditTrail because
    // AuditTrail.performedById is a required FK to a real user and a script has
    // no actor — the same reason the chameleon rescan retirement uses SystemLog
    // (§13.3 Item, chameleon arc v3.8.bbw).
    await prisma.systemLog.create({
      data: {
        logType: "STATUS_CHANGE",
        severity: "INFO",
        source: "c3-121495-cancel-residue-repair",
        message:
          `Cleared cancellation residue on ${REFERENCE} (${before.status}): ` +
          `cancelledAt, cancelledById, cancellationFaultParty. ` +
          `Arc 1's reactivation cleared reasonCode+reason only; this finishes it.`,
        details: { loadId: LOAD_ID, referenceNumber: REFERENCE, before, undoFile: UNDO },
      },
    });

    // ── Read-only verify ─────────────────────────────────────────────────────
    const after = await readRow(prisma);
    console.log("\nAFTER:");
    console.log(j(after));

    const ok =
      after !== null &&
      after.cancelledAt === null &&
      after.cancelledById === null &&
      after.cancellationFaultParty === null &&
      after.status === before.status &&
      after.deletedAt === before.deletedAt;

    console.log(`\n${ok ? "VERIFIED" : "VERIFY FAILED"} — the three columns are ${ok ? "null" : "NOT as expected"}, status unchanged at ${after?.status}.`);
    if (!ok) process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error("\nREPAIR ERRORED:", err);
  process.exitCode = 1;
});
