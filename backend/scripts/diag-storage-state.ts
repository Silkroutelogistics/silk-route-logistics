/**
 * READ-ONLY diagnostic: what storage backend has production actually been using?
 *
 * The definitive test is not the code or the env — it is what got persisted.
 * A fileUrl starting with "s3://" proves S3 was active at write time.
 * A fileUrl starting with "/uploads/" proves the ephemeral-disk fallback was active.
 *
 * No writes. Safe to run against prod.
 */
import { prisma } from "../src/config/database";

function classify(url: string | null | undefined): string {
  if (!url) return "(null/empty)";
  if (url.startsWith("s3://")) return "s3:// (S3 ACTIVE)";
  if (url.startsWith("/uploads/")) return "/uploads/ (EPHEMERAL DISK)";
  if (url.startsWith("http")) return "http(s) (external URL)";
  return `other: ${url.slice(0, 24)}`;
}

async function main() {
  console.log("=== PRODUCTION STORAGE STATE (read-only) ===\n");

  const docs = await prisma.document.findMany({
    select: { id: true, fileUrl: true, docType: true, createdAt: true, entityType: true },
    orderBy: { createdAt: "desc" },
  });

  console.log(`Document rows: ${docs.length}`);
  const buckets = new Map<string, { count: number; newest: Date | null; oldest: Date | null }>();
  for (const d of docs) {
    const k = classify(d.fileUrl);
    const b = buckets.get(k) ?? { count: 0, newest: null, oldest: null };
    b.count++;
    if (!b.newest || d.createdAt > b.newest) b.newest = d.createdAt;
    if (!b.oldest || d.createdAt < b.oldest) b.oldest = d.createdAt;
    buckets.set(k, b);
  }
  for (const [k, b] of buckets) {
    console.log(`  ${k}: ${b.count}  (oldest ${b.oldest?.toISOString().slice(0, 10)}, newest ${b.newest?.toISOString().slice(0, 10)})`);
  }

  console.log("\n-- 10 most recent documents --");
  for (const d of docs.slice(0, 10)) {
    console.log(`  ${d.createdAt.toISOString().slice(0, 10)}  ${String(d.docType).padEnd(22)} ${d.entityType ?? "-"}  ${d.fileUrl ?? "(none)"}`);
  }

  // Executed agreements are the legally-significant ones.
  const agreements = await prisma.carrierAgreement.findMany({
    select: { id: true, templateName: true, status: true, documentUrl: true, signedAt: true },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  console.log(`\n-- CarrierAgreement rows: ${agreements.length} --`);
  for (const a of agreements) {
    console.log(`  ${a.templateName ?? "?"} / ${a.status} / signed ${a.signedAt?.toISOString().slice(0, 10) ?? "-"} -> ${classify(a.documentUrl)}`);
  }

  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e?.message ?? e);
  await prisma.$disconnect();
  process.exit(1);
});
