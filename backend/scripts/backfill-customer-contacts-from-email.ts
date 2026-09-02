/**
 * One-off: give every customer that has loads but no CRM contacts a primary
 * contact built from customers.email.
 *
 * WHY. v3.8.ayq made operational mail resolve through CustomerContact and never
 * fall through to customers.email — the fallthrough is what put an AP address on
 * a delay alert (§13.3 Item 8.3). Measured against production before shipping
 * it, TWO of the four customers that have ever had a load resolve to nothing
 * under the new rule: Graphic Packaging and Gail & Rice have no contact rows at
 * all. Their next load would send nothing, silently.
 *
 * This moves the address they already receive on into the table an AE can edit.
 * Behaviour is preserved exactly; what changes is that the address is now
 * visible and editable rather than buried in a column shared with invoicing.
 *
 * SKIPS ANY CUSTOMER THAT ALREADY HAS A CONTACT. Beekeeper's Naturals has one —
 * logistics@ — and backfilling its customers.email would write the AP address
 * back in as a primary operational contact, recreating the incident this whole
 * arc exists to close. The skip is the load-bearing part of this script.
 *
 * receivesTrackingLink is FALSE on every row created. Tracking links are an
 * opt-in an AE turns on deliberately; inferring consent for them from the
 * existence of an email address is exactly the assumption that caused the
 * incident.
 *
 * WHY IT DOES NOT LOAD .env.production.local. The production rail allows
 * exactly two files to load that file, with a stale-entry check on the list. A
 * one-off backfill does not belong on a permanent allow-list, and adding it
 * would widen the rail for something that runs once. Instead the operator
 * supplies the URL explicitly — the same deliberate choice §2.2 describes for
 * psql, which has always been outside the rail:
 *
 *   BACKFILL_DATABASE_URL="postgres://..." \
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= \
 *   npx tsx scripts/backfill-customer-contacts-from-email.ts --commit
 *
 * DRY RUN BY DEFAULT. Without --commit it reports what it would do and writes
 * nothing. The before-image is written on both paths.
 */
import fs from "fs";
import path from "path";
import { PrismaClient } from "@prisma/client";
import { hostOf, isLocalHost } from "./prisma-target-guard";

const COMMIT = process.argv.includes("--commit");
const url = process.env.BACKFILL_DATABASE_URL ?? "";

if (!url) {
  console.error("BACKFILL_DATABASE_URL is not set. Supply the target explicitly — see the header.");
  process.exit(1);
}
// Outbound must be provably dead: this script touches customer records and a
// stray send would reach a real customer. Absence is not neutralisation (Arc 15).
for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY", "QUO_API_KEY"]) {
  if ((process.env[k] ?? "") !== "") {
    console.error(`REFUSING: ${k} is set to a real value. Outbound would be LIVE. Set it empty.`);
    process.exit(1);
  }
}

const host = hostOf(url);
console.log(`target host : ${host}`);
console.log(`mode        : ${COMMIT ? "COMMIT (will write)" : "DRY RUN (writes nothing)"}`);
if (isLocalHost(host)) console.log("note        : this is a LOCAL host\n");
else console.log("note        : this is a REMOTE host — writes here are production writes\n");

const db = new PrismaClient({ datasources: { db: { url } } });
const q = <T = any>(s: string, ...a: any[]) => db.$queryRawUnsafe<T[]>(s, ...a);

async function main() {
  // Customers with at least one load and zero contact rows.
  const targets = await q(`
    SELECT c.id, c.name, c.email,
           (SELECT count(*)::int FROM loads l WHERE l."customerId" = c.id) AS loads
    FROM customers c
    WHERE EXISTS (SELECT 1 FROM loads l WHERE l."customerId" = c.id)
      AND NOT EXISTS (SELECT 1 FROM customer_contacts x WHERE x."customerId" = c.id)
    ORDER BY c.name`);

  const skipped = await q(`
    SELECT c.name, (SELECT count(*)::int FROM customer_contacts x WHERE x."customerId" = c.id) AS contacts
    FROM customers c
    WHERE EXISTS (SELECT 1 FROM loads l WHERE l."customerId" = c.id)
      AND EXISTS (SELECT 1 FROM customer_contacts x WHERE x."customerId" = c.id)
    ORDER BY c.name`);

  console.log(`SKIPPED — already has contacts (${skipped.length}):`);
  for (const s of skipped) console.log(`  ${s.name}  (${s.contacts} contact row(s))`);

  console.log(`\nTARGETS — loads but no contacts (${targets.length}):`);
  for (const t of targets) console.log(`  ${t.name}  loads=${t.loads}  email=${JSON.stringify(t.email)}`);

  const eligible = targets.filter((t: any) => (t.email ?? "").trim().length > 0);
  const noEmail = targets.filter((t: any) => (t.email ?? "").trim().length === 0);
  if (noEmail.length) {
    console.log(`\n  ${noEmail.length} target(s) have no customers.email and cannot be backfilled:`);
    for (const n of noEmail) console.log(`    ${n.name} — an AE must add a contact by hand`);
  }

  const before = path.join(__dirname, "_backfill-customer-contacts-before.json");
  fs.writeFileSync(before, JSON.stringify({ at: new Date().toISOString(), host, targets, skipped }, null, 2));
  console.log(`\nbefore-image: ${path.basename(before)}`);

  if (!COMMIT) {
    console.log(`\nDRY RUN — would create ${eligible.length} contact row(s). Re-run with --commit to apply.`);
    await db.$disconnect();
    return;
  }

  let created = 0;
  for (const t of eligible) {
    // Guarded per row rather than trusting the snapshot: if a contact appeared
    // between the query and the write, this must not add a second one.
    const n = await q<{ n: number }>(
      `SELECT count(*)::int AS n FROM customer_contacts WHERE "customerId" = $1`, t.id);
    if (n[0].n > 0) { console.log(`  skip ${t.name} — a contact appeared since the scan`); continue; }
    await db.$executeRawUnsafe(
      `INSERT INTO customer_contacts
         (id, "customerId", name, title, email, phone, "isPrimary", "createdAt",
          receives_tracking_link, is_billing, role, sales_role, introduced_via, do_not_contact)
       VALUES (gen_random_uuid()::text, $1, $2, NULL, $3, NULL, true, now(),
               false, false, NULL, NULL, NULL, false)`,
      t.id, t.name, (t.email as string).trim());
    created++;
    console.log(`  created primary contact for ${t.name} -> ${t.email}`);
  }

  console.log("\nPROOF — every customer with loads, and what the resolver now finds:");
  const after = await q(`
    SELECT c.name,
           (SELECT count(*)::int FROM loads l WHERE l."customerId" = c.id) AS loads,
           (SELECT count(*)::int FROM customer_contacts x
              WHERE x."customerId" = c.id AND x.do_not_contact = false
                AND (x."isPrimary" = true OR x.receives_tracking_link = true)
                AND x.email IS NOT NULL) AS operational_contacts
    FROM customers c
    WHERE EXISTS (SELECT 1 FROM loads l WHERE l."customerId" = c.id)
    ORDER BY c.name`);
  let silenced = 0;
  for (const a of after) {
    const ok = a.operational_contacts > 0;
    if (!ok) silenced++;
    console.log(`  ${ok ? "RESOLVES" : "SILENCED"}  ${String(a.name).padEnd(34)} loads=${a.loads} operationalContacts=${a.operational_contacts}`);
  }
  console.log(`\nrows created: ${created}`);
  console.log(`customers still silenced: ${silenced}`);
  await db.$disconnect();
}

main().catch(async (e) => {
  console.error("ERR " + String(e).slice(0, 400));
  await db.$disconnect();
  process.exit(1);
});
