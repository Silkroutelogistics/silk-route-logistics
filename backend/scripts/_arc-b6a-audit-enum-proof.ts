/**
 * Lifecycle-gaps B6a proof — the two new AuditAction values are writable
 * through the real client, and lib/lifecycleAudit lands rows a reader can
 * distinguish by actionDetail. Runs against a LOCAL container only; refuses a
 * non-local DATABASE_URL because it writes rows.
 *
 *   DATABASE_URL=postgresql://ci:ci@127.0.0.1:55445/ci \
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= S3_BUCKET_NAME= AWS_ACCESS_KEY_ID= \
 *   npx tsx scripts/_arc-b6a-audit-enum-proof.ts
 */
const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("REFUSING: DATABASE_URL is not local. This script writes rows.");
  process.exit(2);
}

import { prisma } from "../src/config/database";
import { recordLifecycleEvent } from "../src/lib/lifecycleAudit";

let pass = 0;
let fail = 0;
function ok(cond: boolean, label: string, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); }
}

(async () => {
  const stamp = Date.now();
  const actor = await prisma.user.create({
    data: { email: `b6a-${stamp}@srl.invalid`, passwordHash: "x", firstName: "Audit", lastName: "Proof", role: "ADMIN" },
  });

  console.log("\n── 1. DEACTIVATE and CANCEL are live enum values ──");
  const labels = await prisma.$queryRaw<{ enumlabel: string }[]>`
    select enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'AuditAction'`;
  const names = labels.map((l) => l.enumlabel);
  ok(names.includes("CANCEL"), "CANCEL is on the type", names);
  ok(names.includes("DEACTIVATE"), "DEACTIVATE is on the type", names);

  console.log("\n── 2. a customer inactivation and a load cancel land as distinguishable rows ──");
  await recordLifecycleEvent({
    actionDetail: "CUSTOMER_INACTIVATED", entityType: "Customer", entityId: `c-${stamp}`, entityName: "Acme",
    reason: "credit hold", previous: { isActive: true }, new: { isActive: false },
    actor: { userId: actor.id, email: actor.email },
  });
  await recordLifecycleEvent({
    actionDetail: "LOAD_CANCELLED", entityType: "Load", entityId: `l-${stamp}`, entityName: "SRL-1",
    reasonCode: "SHIPPER_CANCELLED", faultParty: "SHIPPER", previous: { status: "BOOKED" }, new: { status: "CANCELLED" },
    actor: { userId: actor.id },
  });
  const rows = await prisma.auditTrail.findMany({
    where: { performedById: actor.id }, orderBy: { performedAt: "asc" },
    select: { action: true, entityType: true, changedFields: true },
  });
  ok(rows.length === 2, "two rows written", rows.length);
  const [a, b] = rows as any[];
  ok(a?.action === "DEACTIVATE" && a?.changedFields?.actionDetail === "CUSTOMER_INACTIVATED", "row 1 is DEACTIVATE / CUSTOMER_INACTIVATED", a);
  ok(a?.changedFields?.previous?.isActive === true && a?.changedFields?.new?.isActive === false, "row 1 carries previous/new", a?.changedFields);
  ok(b?.action === "CANCEL" && b?.changedFields?.actionDetail === "LOAD_CANCELLED", "row 2 is CANCEL / LOAD_CANCELLED", b);
  ok(b?.changedFields?.faultParty === "SHIPPER" && b?.changedFields?.reasonCode === "SHIPPER_CANCELLED", "row 2 carries fault party + reason code", b?.changedFields);
  ok(b?.changedFields?.actor?.userId === actor.id, "row 2 names the actor inside changedFields as well as performedById", b?.changedFields?.actor);

  console.log("\n── 3. the read surface returns them with the performer joined ──");
  const joined = await prisma.auditTrail.findMany({
    where: { performedById: actor.id },
    include: { performedBy: { select: { email: true, role: true } } },
  });
  ok(joined.every((r) => r.performedBy.email === actor.email), "performedBy join resolves on both rows");

  await prisma.auditTrail.deleteMany({ where: { performedById: actor.id } });
  await prisma.user.delete({ where: { id: actor.id } });
  await prisma.$disconnect();
  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
