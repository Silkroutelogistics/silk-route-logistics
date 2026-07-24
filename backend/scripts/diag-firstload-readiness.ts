/**
 * READ-ONLY: ground-truth the actual production state for a first real load.
 * The code audit reasons about what COULD happen; this reports what IS.
 * No writes.
 */
import { prisma } from "../src/config/database";

function line(label: string, val: unknown) {
  console.log(`  ${label.padEnd(34)} ${val}`);
}

async function main() {
  console.log("=== FIRST-LOAD READINESS: PRODUCTION STATE (read-only) ===\n");

  // ── Customers (the shipper side) ──────────────────────────
  const customers = await prisma.customer.findMany({
    select: {
      id: true, name: true, onboardingStatus: true, isActive: true,
      creditStatus: true, taxId: true, contractUrl: true, userId: true,
      approvedAt: true, deletedAt: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const liveCustomers = customers.filter((c) => !c.deletedAt);
  console.log(`CUSTOMERS: ${customers.length} total, ${liveCustomers.length} not-deleted`);
  for (const c of liveCustomers.slice(0, 10)) {
    console.log(
      `  - ${c.name?.slice(0, 28).padEnd(28)} status=${String(c.onboardingStatus).padEnd(12)} active=${c.isActive} ` +
        `credit=${c.creditStatus ?? "-"} tin=${c.taxId ? "set" : "MISSING"} contract=${c.contractUrl ? "set" : "MISSING"} ` +
        `linkedUser=${c.userId ? "yes" : "NO"} approvedAt=${c.approvedAt ? "yes" : "no"}`
    );
  }
  const approvedCustomers = liveCustomers.filter((c) => c.onboardingStatus === "APPROVED");
  console.log(`  -> APPROVED + can be posted against: ${approvedCustomers.length}`);

  // ── Carriers (the haul side) ──────────────────────────────
  console.log("");
  const carriers = await prisma.carrierProfile.findMany({
    select: {
      id: true, companyName: true, onboardingStatus: true, mcNumber: true,
      quickPayEnabled: true, tier: true, cppJoinedDate: true, cppTotalLoads: true,
      isTestAccount: true, deletedAt: true, userId: true,
      authorityGrantedDate: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const liveCarriers = carriers.filter((c) => !c.deletedAt);
  console.log(`CARRIERS: ${carriers.length} total, ${liveCarriers.length} not-deleted`);
  for (const c of liveCarriers.slice(0, 12)) {
    console.log(
      `  - ${(c.companyName ?? "(no name)").slice(0, 26).padEnd(26)} status=${String(c.onboardingStatus).padEnd(11)} ` +
        `tier=${c.tier ?? "-"} qp=${c.quickPayEnabled} joined=${c.cppJoinedDate ? "SET" : "NULL"} ` +
        `loads=${c.cppTotalLoads ?? 0} test=${c.isTestAccount} authDate=${c.authorityGrantedDate ? "set" : "NULL"} user=${c.userId ? "yes" : "NO"}`
    );
  }
  const approvedRealCarriers = liveCarriers.filter(
    (c) => c.onboardingStatus === "APPROVED" && !c.isTestAccount
  );
  console.log(`  -> APPROVED + non-test: ${approvedRealCarriers.length}`);
  const frozenTier = approvedRealCarriers.filter((c) => !c.cppJoinedDate);
  console.log(`  -> APPROVED non-test with NULL cppJoinedDate (tier advancement frozen): ${frozenTier.length}`);

  // ── Signed agreements ─────────────────────────────────────
  console.log("");
  const agreements = await prisma.carrierAgreement.groupBy({
    by: ["templateName", "status"],
    _count: true,
  }).catch(() => []);
  console.log(`CARRIER AGREEMENTS (signature records):`);
  if (agreements.length === 0) console.log("  (none)");
  for (const a of agreements) console.log(`  - ${a.templateName ?? "?"} / ${a.status}: ${a._count}`);

  // ── Loads ─────────────────────────────────────────────────
  console.log("");
  const loads = await prisma.load.groupBy({ by: ["status"], _count: true }).catch(() => []);
  const loadTotal = await prisma.load.count();
  console.log(`LOADS: ${loadTotal} total`);
  for (const l of loads) console.log(`  - ${String(l.status).padEnd(14)} ${l._count}`);

  // ── Invoices + settlements + documents (has anything ever flowed?) ─
  console.log("");
  const [invCount, setlCount, docCount] = await Promise.all([
    prisma.invoice.count(),
    prisma.settlement.count(),
    prisma.document.count(),
  ]);
  line("Invoices ever created:", invCount);
  line("Settlements ever created:", setlCount);
  line("Documents ever stored:", docCount);

  console.log("\n=== END ===");
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error("FAILED:", e?.message ?? e);
  await prisma.$disconnect();
  process.exit(1);
});
