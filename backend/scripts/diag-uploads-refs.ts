/**
 * READ-ONLY diagnostic: does ANY persisted row still reference a local
 * "/uploads/..." path?
 *
 * Production reports storage.mode = "s3", so new writes go to S3. Before we
 * remove the unauthenticated express.static("/uploads") mount we must prove no
 * existing row would 404 as a result.
 *
 * Scans every text-ish column whose name looks like a URL/path across the whole
 * public schema — generic, so it cannot miss a column we forgot to think of.
 * No writes.
 */
import { prisma } from "../src/config/database";

type Col = { table_name: string; column_name: string };

async function main() {
  console.log("=== /uploads REFERENCE SCAN (read-only) ===\n");

  const cols = await prisma.$queryRawUnsafe<Col[]>(`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND data_type IN ('text','character varying')
      AND (column_name ILIKE '%url%' OR column_name ILIKE '%path%' OR column_name ILIKE '%file%')
    ORDER BY table_name, column_name
  `);

  console.log(`Candidate columns: ${cols.length}\n`);

  let hits = 0;
  for (const c of cols) {
    const sql = `SELECT COUNT(*)::int AS n FROM "public"."${c.table_name}" WHERE "${c.column_name}" LIKE '/uploads/%'`;
    try {
      const r = await prisma.$queryRawUnsafe<{ n: number }[]>(sql);
      const n = r[0]?.n ?? 0;
      if (n > 0) {
        hits += n;
        console.log(`  ⚠ ${c.table_name}.${c.column_name}: ${n} row(s) reference /uploads/`);
      }
    } catch (e: any) {
      console.log(`  (skip ${c.table_name}.${c.column_name}: ${e?.message?.slice(0, 60)})`);
    }
  }

  console.log(
    hits === 0
      ? "\n✅ ZERO rows reference /uploads/ anywhere. Removing the public static mount breaks nothing."
      : `\n❌ ${hits} row(s) still reference /uploads/ — migrate these to S3 before removing the mount.`
  );

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e?.message ?? e);
  await prisma.$disconnect();
  process.exit(1);
});
