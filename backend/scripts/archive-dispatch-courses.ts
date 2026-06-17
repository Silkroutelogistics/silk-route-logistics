/**
 * v3.8.anf — Archive the dispatch-oriented courses from the SRL Driver Academy.
 *
 * IFTA Fundamentals + IRP Apportioned Registration are office/dispatch tasks, not
 * driver tasks (their driver-relevant slices fold into "Weigh Stations, Size &
 * Weight"). They were removed from the seeded CURRICULUM, so the seed no longer
 * touches them — but the previously-PUBLISHED rows linger live until flipped.
 * This sets them to ARCHIVED: hidden from drivers, the carrier matrix, the AE
 * Training tab, and the expiry cron, while preserving any historical progress.
 *
 *   npx tsx scripts/archive-dispatch-courses.ts
 *
 * Reads DATABASE_URL from the environment, falling back to backend/.env.
 * Idempotent — re-running is a no-op once the courses are archived.
 */
import fs from "fs";
import path from "path";

const ARCHIVE_SLUGS = ["ifta-fundamentals", "irp-apportioned"];

function loadDbUrl(): void {
  if (process.env.DATABASE_URL) return;
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    const m = fs.readFileSync(envPath, "utf8").match(/^DATABASE_URL\s*=\s*"?([^"\r\n]+)"?/m);
    if (m) process.env.DATABASE_URL = m[1];
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL not set (env or backend/.env)");
}

async function main(): Promise<void> {
  loadDbUrl();
  const { PrismaClient } = await import("@prisma/client");
  const prisma = new PrismaClient();
  try {
    for (const slug of ARCHIVE_SLUGS) {
      const existing = await prisma.trainingCourse.findUnique({ where: { slug }, select: { status: true } });
      if (!existing) { console.log(`  ${slug.padEnd(20)} not present — skip`); continue; }
      const r = await prisma.trainingCourse.update({ where: { slug }, data: { status: "ARCHIVED" } });
      console.log(`  ${slug.padEnd(20)} ${existing.status} -> ${r.status}`);
    }
    console.log("\nArchive complete.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
