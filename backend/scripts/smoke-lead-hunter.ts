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
  getCustomers,
  getCustomerById,
  getCustomerIndustries,
  updateCustomer,
  getActivityFeed,
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
  const SRL_LOG_SOURCES = [
    "LeadHunter.bulkUpdateStage",
    "LeadHunter.updateCustomer",
    "LeadHunter.bulkImport",
  ];
  if (rows.length === 0) {
    await prisma.systemLog.deleteMany({ where: { source: { in: SRL_LOG_SOURCES } } });
    return;
  }
  const ids = rows.map((r) => r.id);
  await prisma.communication.deleteMany({ where: { entityType: "SHIPPER", entityId: { in: ids } } });
  await prisma.shipperCredit.deleteMany({ where: { customerId: { in: ids } } });
  await prisma.systemLog.deleteMany({ where: { source: { in: SRL_LOG_SOURCES } } });
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

  // ─── Test 6: industry filter on GET /customers ──────────────────────
  console.log("\n6. getCustomers — industry + city filters");
  await prisma.customer.update({
    where: { id: allIds[1] },
    data: { industryType: "smoketest-widgets", city: "Kalamazoo" },
  });
  const byIndustry = await call(getCustomers, {
    ...reqBase,
    query: { industry: "smoketest-widgets", page: "1", limit: "10" },
  });
  assert(byIndustry.body.customers.length === 1, `1 row by industry filter (got ${byIndustry.body.customers.length})`);
  assert(byIndustry.body.customers[0].id === allIds[1], `correct row returned`);

  const byCity = await call(getCustomers, {
    ...reqBase,
    query: { city: "kalamazoo", page: "1", limit: "10" },
  });
  assert(byCity.body.customers.some((c: any) => c.id === allIds[1]), `city filter (case-insensitive) matches`);

  // ─── Test 7: distinct industries endpoint ──────────────────────────
  console.log("\n7. getCustomerIndustries — distinct dropdown values");
  const industries = await call(getCustomerIndustries, { ...reqBase });
  assert(Array.isArray(industries.body), `returns array`);
  assert(industries.body.includes("smoketest-widgets"), `includes our test industry`);

  // ─── Test 8: IMPORT SystemLog written on bulk upsert ────────────────
  console.log("\n8. bulkCreateCustomers — writes IMPORT SystemLog");
  const recentImportLogs = await prisma.systemLog.findMany({
    where: {
      source: "LeadHunter.bulkImport",
      createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
    },
    orderBy: { createdAt: "desc" },
  });
  assert(recentImportLogs.length >= 2, `at least 2 import logs from tests 1+2 (found ${recentImportLogs.length})`);
  const lastImport = recentImportLogs[0];
  const importDetails = lastImport.details as any;
  assert(typeof importDetails.created === "number", `import log details.created set`);
  assert(typeof importDetails.updated === "number", `import log details.updated set`);

  // ─── Test 9: single-row PATCH writes STATUS_CHANGE log ──────────────
  console.log("\n9. updateCustomer — writes STATUS_CHANGE log on stage change");
  await call(updateCustomer, {
    ...reqBase,
    params: { id: allIds[2] },
    body: { status: "Proposal" },
  });
  const patchLogs = await prisma.systemLog.findMany({
    where: {
      source: "LeadHunter.updateCustomer",
      createdAt: { gte: new Date(Date.now() - 60000) },
    },
  });
  assert(patchLogs.length >= 1, `STATUS_CHANGE log written on single-row PATCH`);
  const patchDetails = patchLogs[0].details as any;
  assert(patchDetails.customerId === allIds[2], `log references correct customer`);
  assert(patchDetails.to === "Proposal", `log captures target stage`);

  // No-op PATCH (same status) should NOT write a log
  const beforeNoop = await prisma.systemLog.count({
    where: { source: "LeadHunter.updateCustomer" },
  });
  await call(updateCustomer, {
    ...reqBase,
    params: { id: allIds[2] },
    body: { status: "Proposal" },
  });
  const afterNoop = await prisma.systemLog.count({
    where: { source: "LeadHunter.updateCustomer" },
  });
  assert(afterNoop === beforeNoop, `no-op PATCH writes no STATUS_CHANGE log`);

  // PATCH without status field should NOT write a log
  await call(updateCustomer, {
    ...reqBase,
    params: { id: allIds[2] },
    body: { phone: "555-9999" },
  });
  const afterPhoneOnly = await prisma.systemLog.count({
    where: { source: "LeadHunter.updateCustomer" },
  });
  assert(afterPhoneOnly === afterNoop, `non-status PATCH writes no STATUS_CHANGE log`);

  // ─── Test 10: GET /customers/:id returns inlined communications ────
  console.log("\n10. getCustomerById — inlines communications");
  // Seed a Communication row so we have something to assert on
  await prisma.communication.create({
    data: {
      type: "NOTE",
      entityType: "SHIPPER",
      entityId: allIds[0],
      subject: "Smoke test note",
      body: "Checking that detail endpoint inlines activities",
      userId: user.id,
      metadata: { source: "smoke-test" },
    },
  });
  const detail = await call(getCustomerById, {
    ...reqBase,
    params: { id: allIds[0] },
    query: {},
  });
  assert(Array.isArray(detail.body.communications), `communications array present`);
  assert(detail.body.communications.length >= 1, `at least 1 communication inlined`);
  assert(
    detail.body.communications[0].body === "Checking that detail endpoint inlines activities",
    `most recent communication first`,
  );

  // ─── Test 11: activity feed merges Communication + SystemLog ───────
  console.log("\n11. getActivityFeed — merged Communication + SystemLog");
  const feed = await call(getActivityFeed, { ...reqBase, query: { limit: "200" } });
  assert(Array.isArray(feed.body.events), `events array present`);
  const kinds = new Set(feed.body.events.map((e: any) => e.kind));
  assert(kinds.has("note"), `feed includes note events`);
  assert(kinds.has("stage_change"), `feed includes stage_change events`);
  assert(kinds.has("import"), `feed includes import events`);
  // Verify reverse-chronological order
  const timestamps = feed.body.events.slice(0, 5).map((e: any) => new Date(e.timestamp).getTime());
  assert(
    timestamps.every((t: number, i: number) => i === 0 || t <= timestamps[i - 1]),
    `events sorted reverse-chronologically`,
  );

  // Filter by type
  const feedStageOnly = await call(getActivityFeed, {
    ...reqBase,
    query: { type: "stage_change", limit: "50" },
  });
  assert(
    feedStageOnly.body.events.every((e: any) => e.kind === "stage_change"),
    `type=stage_change filter returns only stage changes`,
  );

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
