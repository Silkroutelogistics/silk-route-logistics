/**
 * Smoke test: Lead Hunter backend changes (v3.5.e)
 *   1. bulk-stage endpoint — atomic stage updates + SystemLog audit
 *   2. bulk import — email-keyed upsert (dedupe + update)
 *   3. customer stats — pipeline breakdown via groupBy
 *
 * Run: cd backend && npx ts-node scripts/smoke-lead-hunter.ts
 *
 * Cleans up all test rows on exit (pass --keep to leave them).
 */
import { Response } from "express";
import { prisma } from "../src/config/database";
import {
  bulkUpdateStage,
  bulkCreateCustomers,
  getCustomerStats,
} from "../src/controllers/customerController";
import { AuthRequest } from "../src/middleware/auth";

const TEST_TAG = "SMOKE_LEAD_HUNTER_TEST";
const keep = process.argv.includes("--keep");

function mockRes(): { res: Response; body: any; status: number } {
  const out = { body: null as any, status: 200 };
  const res = {
    status(code: number) { out.status = code; return this; },
    json(payload: any) { out.body = payload; return this; },
    send() { return this; },
  } as unknown as Response;
  return { res, body: out as any, status: out.status } as any;
}

async function call(handler: Function, req: Partial<AuthRequest>): Promise<{ status: number; body: any }> {
  const m = mockRes();
  await handler(req as AuthRequest, m.res);
  return { status: (m as any).body.status, body: (m as any).body.body };
}

function assert(cond: any, msg: string) {
  if (!cond) throw new Error(`❌ ${msg}`);
  console.log(`✓ ${msg}`);
}

async function cleanup() {
  // Catch rows tagged via notes AND any stragglers matching our test emails
  const rows = await prisma.customer.findMany({
    where: {
      OR: [
        { notes: { contains: TEST_TAG } },
        { email: { endsWith: "@smoketest.example" } },
      ],
    },
    select: { id: true },
  });
  if (rows.length === 0) {
    // Still prune audit logs from prior runs
    await prisma.systemLog.deleteMany({ where: { source: "LeadHunter.bulkUpdateStage" } });
    return;
  }
  const ids = rows.map((r) => r.id);
  await prisma.shipperCredit.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.systemLog.deleteMany({ where: { source: "LeadHunter.bulkUpdateStage" } });
  await prisma.customer.deleteMany({ where: { id: { in: ids } } });
  console.log(`  cleaned ${ids.length} test customers`);
}

async function getAdminUser() {
  const u = await prisma.user.findFirst({ where: { role: { in: ["ADMIN", "CEO", "BROKER"] }, isActive: true } });
  if (!u) throw new Error("No admin user found — seed first");
  return u;
}

async function main() {
  console.log("── Lead Hunter smoke test ──\n");

  // Fresh slate
  await cleanup();

  const user = await getAdminUser();
  const reqBase = { user: { id: user.id, email: user.email, role: user.role } } as Partial<AuthRequest>;

  // ─── Test 1: bulk import (create path) ────────────────────────────
  console.log("\n1. bulkCreateCustomers — initial create");
  const initialImport = await call(bulkCreateCustomers, {
    ...reqBase,
    body: {
      customers: [
        { name: "Smoke Test Alpha Inc", email: "alpha@smoketest.example", contactName: "Alice", notes: TEST_TAG },
        { name: "Smoke Test Bravo LLC", email: "bravo@smoketest.example", contactName: "Bob", notes: TEST_TAG },
        { name: "Smoke Test Charlie Co", email: "charlie@smoketest.example", contactName: "Carol", notes: TEST_TAG },
      ],
    },
  });
  assert(initialImport.status === 201, `initial import returns 201 (got ${initialImport.status})`);
  assert(initialImport.body.created === 3, `3 created (got ${initialImport.body.created})`);
  assert(initialImport.body.updated === 0, `0 updated on first import`);

  // Tag them so cleanup can find them (controller drops unknown fields, so tag via separate update)
  const created = await prisma.customer.findMany({
    where: { email: { in: ["alpha@smoketest.example", "bravo@smoketest.example", "charlie@smoketest.example"] } },
    select: { id: true, email: true, status: true },
  });
  assert(created.length === 3, `3 rows found in DB`);
  await prisma.customer.updateMany({
    where: { id: { in: created.map((c) => c.id) } },
    data: { notes: TEST_TAG },
  });
  for (const c of created) assert(c.status === "Prospect", `${c.email} defaulted to Prospect stage`);

  // ─── Test 2: bulk import (upsert path — same email, different case) ───
  console.log("\n2. bulkCreateCustomers — re-import same emails (case-insensitive dedupe)");
  const reimport = await call(bulkCreateCustomers, {
    ...reqBase,
    body: {
      customers: [
        { name: "Smoke Test Alpha Inc (renamed)", email: "ALPHA@smoketest.example", phone: "555-0001" },
        { name: "Smoke Test Bravo LLC", email: "bravo@smoketest.example", phone: "555-0002" },
        { name: "Smoke Test Delta Corp", email: "delta@smoketest.example", contactName: "Dan" },
      ],
    },
  });
  assert(reimport.body.created === 1, `1 new (Delta) — got ${reimport.body.created}`);
  assert(reimport.body.updated === 2, `2 updated (Alpha, Bravo) — got ${reimport.body.updated}`);

  const alphaAfter = await prisma.customer.findFirst({ where: { email: "alpha@smoketest.example" } });
  assert(alphaAfter?.phone === "555-0001", `Alpha phone patched`);
  assert(alphaAfter?.contactName === "Alice", `Alpha contactName NOT erased (empty fields ignored)`);

  const deltaAfter = await prisma.customer.findFirst({ where: { email: "delta@smoketest.example" } });
  assert(deltaAfter != null, `Delta created on second pass`);
  if (deltaAfter) await prisma.customer.update({ where: { id: deltaAfter.id }, data: { notes: TEST_TAG } });

  // ─── Test 3: bulk-stage (atomic + audit log) ────────────────────────
  console.log("\n3. bulkUpdateStage — atomic stage transition");
  const allIds = [...created.map((c) => c.id), deltaAfter!.id];
  const bulk = await call(bulkUpdateStage, {
    ...reqBase,
    body: { ids: allIds, status: "Contacted" },
  });
  assert(bulk.body.updated === 4, `4 rows updated (got ${bulk.body.updated})`);
  assert(bulk.body.changed === 4, `4 transitions logged (got ${bulk.body.changed})`);

  const afterBulk = await prisma.customer.findMany({ where: { id: { in: allIds } }, select: { status: true } });
  assert(afterBulk.every((c) => c.status === "Contacted"), `all 4 now Contacted`);

  const auditLogs = await prisma.systemLog.findMany({
    where: { source: "LeadHunter.bulkUpdateStage", createdAt: { gte: new Date(Date.now() - 60000) } },
  });
  assert(auditLogs.length >= 4, `audit logs written (found ${auditLogs.length})`);

  // Second bulk call — same stage — should update but log 0 transitions
  const noop = await call(bulkUpdateStage, {
    ...reqBase,
    body: { ids: allIds, status: "Contacted" },
  });
  assert(noop.body.updated === 4, `updateMany still touches 4 rows`);
  assert(noop.body.changed === 0, `no NEW transitions logged when already in target stage`);

  // ─── Test 4: customer stats pipeline breakdown ──────────────────────
  console.log("\n4. getCustomerStats — pipeline breakdown");
  const stats = await call(getCustomerStats, { ...reqBase, query: {} });
  assert(stats.body.pipeline != null, `pipeline field present`);
  assert(typeof stats.body.pipeline.lead === "number", `pipeline.lead is number`);
  assert(typeof stats.body.pipeline.contacted === "number", `pipeline.contacted is number`);
  assert(stats.body.pipeline.contacted >= 4, `contacted count includes our 4 test rows (${stats.body.pipeline.contacted})`);
  assert(typeof stats.body.winRate === "number", `winRate is number`);

  // ─── Test 5: one prospect to Qualified ──────────────────────────────
  console.log("\n5. bulkUpdateStage — single-row via bulk endpoint");
  const single = await call(bulkUpdateStage, {
    ...reqBase,
    body: { ids: [allIds[0]], status: "Qualified" },
  });
  assert(single.body.updated === 1, `1 row updated`);
  assert(single.body.changed === 1, `1 transition (Contacted → Qualified)`);

  console.log("\n✅ All Lead Hunter smoke tests passed\n");

  if (!keep) {
    console.log("── cleanup ──");
    await cleanup();
  } else {
    console.log("── --keep flag set, leaving test rows in DB ──");
  }
}

main()
  .catch(async (e) => {
    console.error("\n", e);
    try { await cleanup(); } catch {}
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
