/**
 * One-off reconciliation for SRL-121488 — return it to the board.
 *
 * The load reads TENDERED with ZERO LoadTender rows: startWaterfall flipped the
 * status before any tender existed, the cascade took its fallback-only branch,
 * and nothing was ever offered to anyone. It is stranded rather than lost — an
 * AE can still see it on the Load Board — but every automated path is
 * POSTED-gated (carrier loadboard, outreach, re-cascade), and the tender expiry
 * sweep derives its set from EXPIRED tenders, of which this load has none. So
 * no code path will ever heal it, including the fix that prevents recurrence.
 *
 * DRY RUN unless --commit.
 *
 * The guards are the point. This must refuse to touch a load that is
 * legitimately TENDERED — one with a live offer out to a carrier — because
 * carrierId is null on those too by design (the carrier lives on LoadTender).
 * The defect signature is specifically TENDERED *with no tender at all*.
 */
import "dotenv/config";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const TARGET = "SRL-121488";
const ok = (b: boolean) => (b ? "PASS" : "FAIL");

async function main() {
  console.log(`DB host: ${(process.env.DATABASE_URL || "").split("@")[1]?.split("/")[0]}`);
  console.log(COMMIT ? "MODE: COMMIT\n" : "MODE: DRY RUN (pass --commit to apply)\n");

  const load = await prisma.load.findFirst({
    where: { loadNumber: TARGET },
    select: {
      id: true, loadNumber: true, status: true, carrierId: true, deletedAt: true,
      visibility: true, tenderedAt: true, tenderedById: true, posterId: true,
    },
  });
  if (!load) throw new Error(`${TARGET} not found`);

  const tenderCount = await prisma.loadTender.count({ where: { loadId: load.id } });

  console.log("CURRENT");
  console.log(`  loadNumber   ${load.loadNumber}`);
  console.log(`  status       ${load.status}`);
  console.log(`  carrierId    ${load.carrierId ?? "null"}`);
  console.log(`  visibility   ${load.visibility ?? "null"}`);
  console.log(`  tenderedAt   ${load.tenderedAt?.toISOString() ?? "null"}`);
  console.log(`  LoadTender   ${tenderCount} row(s)`);
  console.log(`  deletedAt    ${load.deletedAt?.toISOString() ?? "null"}`);

  // Idempotent: already healed (by this script, or by the DAT-promotion heal
  // that now runs in the fixed code) is success, not an error.
  if (load.status === "POSTED") {
    console.log("\nAlready POSTED — nothing to do. Idempotent exit.");
    return;
  }

  const guards: Array<[string, boolean]> = [
    ["status is TENDERED (the stranded state)", load.status === "TENDERED"],
    ["ZERO LoadTender rows — nothing was ever offered", tenderCount === 0],
    ["no carrier assigned", load.carrierId === null],
    ["not soft-deleted", load.deletedAt === null],
  ];

  console.log("\nGUARDS");
  let green = true;
  for (const [label, pass] of guards) {
    if (!pass) green = false;
    console.log(`  [${ok(pass)}] ${label}`);
  }
  if (!green) {
    throw new Error(
      "guards failed — refusing to write. A TENDERED load WITH tender rows is " +
        "legitimately out to a carrier and must not be reverted.",
    );
  }

  if (!COMMIT) {
    console.log(`\nWOULD WRITE: status ${load.status} -> POSTED (+ SystemLog)`);
    console.log("\nDry run complete. Nothing written.");
    return;
  }

  await prisma.$transaction([
    prisma.load.update({ where: { id: load.id }, data: { status: "POSTED" } }),
    prisma.systemLog.create({
      data: {
        logType: "STATUS_CHANGE",
        severity: "WARNING",
        source: "reconcile-srl-121488",
        message:
          `${TARGET} reverted TENDERED -> POSTED. The load held status TENDERED with ` +
          `zero LoadTender rows: startWaterfall wrote the status before any tender ` +
          `existed and the cascade took its fallback-only branch, so nothing was ever ` +
          `offered. Every automated re-dispatch path is POSTED-gated and the expiry ` +
          `sweep reads only EXPIRED tenders, so no code path could heal it. ` +
          `Recurrence is prevented by moving the status write into tenderPosition.`,
        details: {
          loadId: load.id,
          loadNumber: load.loadNumber,
          previousStatus: load.status,
          newStatus: "POSTED",
          tenderCount,
          visibility: load.visibility,
          reconciledAt: new Date().toISOString(),
        },
      },
    }),
  ]);

  const after = await prisma.load.findUnique({
    where: { id: load.id },
    select: { status: true, carrierId: true, visibility: true },
  });
  const stillNoTenders = (await prisma.loadTender.count({ where: { loadId: load.id } })) === 0;

  console.log("\nPOST-WRITE");
  console.log(`  status     ${after?.status}`);
  console.log(`  carrierId  ${after?.carrierId ?? "null"}`);
  console.log(`  visibility ${after?.visibility ?? "null"}`);

  const checks: Array<[string, boolean]> = [
    ["status is POSTED", after?.status === "POSTED"],
    ["no carrier was invented", after?.carrierId === null],
    ["no tender rows were fabricated", stillNoTenders],
  ];
  console.log("\nVERIFICATION");
  let allGreen = true;
  for (const [label, pass] of checks) {
    if (!pass) allGreen = false;
    console.log(`  [${ok(pass)}] ${label}`);
  }
  console.log(allGreen ? "\nALL GREEN — the load is back on the board." : "\nSOME CHECKS FAILED");
}

main()
  .catch((e) => { console.error("ERR:", e.message); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); });
