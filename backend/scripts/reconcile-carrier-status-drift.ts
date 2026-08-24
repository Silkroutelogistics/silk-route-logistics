/**
 * One-off: reconcile CarrierProfile rows where the two status enums disagree.
 *
 * Twenty writers set `onboardingStatus` and left `status` at whatever it was,
 * usually its @default(NEW). B2 fixed the writers, so nothing NEW drifts — but
 * rows written before the fix still carry the disagreement, and four compliance
 * sweeps read `status`. The resolver's inclusive rule already scans them, so
 * this is not what makes them safe; it is what makes the invariant true, so the
 * next reader does not have to know about the exception.
 *
 * DRY RUN BY DEFAULT. Pass --commit to write.
 *
 * Guarded:
 *   - only rows where the pairing is genuinely wrong
 *   - never touches a row whose onboardingStatus has no paired value
 *   - one SystemLog row per carrier changed, with both before/after values
 *   - idempotent: a second run finds nothing, because the condition is the
 *     disagreement itself rather than a flag
 *
 * PRODUCTION EXPECTATION at time of writing: at most the three test carriers
 * and one PENDING carrier, all four soft-deleted on 2026-07-07 — so most likely
 * ZERO live rows. Report the count either way; a surprise here is more
 * interesting than a clean run.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";
import { pairedApplicationStatus } from "../src/lib/carrierOperational";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const INCLUDE_DELETED = process.argv.includes("--include-deleted");

async function main() {
  const where = INCLUDE_DELETED ? {} : { deletedAt: null };
  const carriers = await prisma.carrierProfile.findMany({
    where,
    select: {
      id: true,
      companyName: true,
      mcNumber: true,
      onboardingStatus: true,
      status: true,
      isTestAccount: true,
      deletedAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Scanned ${carriers.length} carrier profiles` + (INCLUDE_DELETED ? " (including soft-deleted)" : " (excluding soft-deleted)"));

  const drifted = carriers
    .map((c) => ({ c, want: pairedApplicationStatus(c.onboardingStatus) }))
    .filter(({ c, want }) => want !== null && c.status !== want);

  if (drifted.length === 0) {
    console.log("\nNo drift. Every carrier's two status enums already agree.");
    console.log("The invariant holds; nothing to do.");
    return;
  }

  console.log(`\n${drifted.length} row(s) where the enums disagree:\n`);
  for (const { c, want } of drifted) {
    console.log(
      `  ${c.companyName ?? "(no company name)"}  ${c.mcNumber ?? "(no MC)"}` +
      (c.isTestAccount ? "  [TEST]" : "") +
      (c.deletedAt ? "  [DELETED]" : "") +
      `\n     onboardingStatus = ${c.onboardingStatus}` +
      `\n     status           = ${c.status}  ->  ${want}`,
    );
  }

  if (!COMMIT) {
    console.log("\nDRY RUN. Re-run with --commit to apply.");
    return;
  }

  let changed = 0;
  for (const { c, want } of drifted) {
    await prisma.$transaction([
      prisma.carrierProfile.update({
        where: { id: c.id },
        data: { status: want! },
      }),
      prisma.systemLog.create({
        data: {
          logType: "STATUS_CHANGE",
          severity: "INFO",
          source: "reconcile-carrier-status-drift",
          message:
            `CarrierProfile ${c.id} (${c.companyName ?? "no name"}, ${c.mcNumber ?? "no MC"}) ` +
            `status reconciled ${c.status} -> ${want} to match onboardingStatus ${c.onboardingStatus}. ` +
            `B2 — four compliance sweeps read this field.`,
        },
      }),
    ]);
    changed++;
  }

  console.log(`\nReconciled ${changed} row(s). Re-run to confirm it now reports no drift.`);
}

main()
  .catch((e) => {
    console.error("FAILED:", e.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
