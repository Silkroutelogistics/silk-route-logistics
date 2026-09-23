/**
 * P5 — read-only verification of the customer-mail-consent arc, as srl_readonly.
 *
 * Connects through the read-only rail (Item 303): the credential comes from
 * backend/.env.production.readonly via resolveCensusCredential, which refuses
 * the owner role and refuses a non-Neon host. The session is additionally set
 * read_only before the first query, so a write is refused by Postgres rather
 * than by discipline.
 *
 * Usage:  npx tsx scripts/_readonly-p5-mail-consent-verify.ts <deployedAtISO>
 *
 * Asserts nothing and exits 0 regardless — this REPORTS. The caller reads it.
 */
import { PrismaClient } from "@prisma/client";
import { resolveCensusCredential, announceCensusTarget } from "./_census-credential";

const deployedAt = process.argv[2];
if (!deployedAt || Number.isNaN(Date.parse(deployedAt))) {
  console.error("usage: _readonly-p5-mail-consent-verify.ts <deployedAtISO>");
  process.exit(1);
}

async function main() {
  const t = resolveCensusCredential();
  announceCensusTarget(t, "P5 mail-consent verify");

  const prisma = new PrismaClient({ datasourceUrl: t.url });
  try {
    await prisma.$executeRawUnsafe("SET default_transaction_read_only = on");
    const who = await prisma.$queryRawUnsafe<{ u: string }[]>("SELECT current_user AS u");
    console.log("\nconnected as    : " + who[0].u);
    console.log("deploy boundary : " + new Date(deployedAt).toISOString());

    // ---- 1. the column exists, with the shape the migration declared ----
    const col = await prisma.$queryRawUnsafe<
      { column_name: string; data_type: string; is_nullable: string; column_default: string | null }[]
    >(
      `SELECT column_name, data_type, is_nullable, column_default
         FROM information_schema.columns
        WHERE table_schema='public' AND table_name='customer_contacts'
          AND column_name='receives_operational_updates'`
    );
    console.log("\n[1] COLUMN");
    if (!col.length) {
      console.log("    ABSENT — migration has NOT applied");
    } else {
      const c = col[0];
      console.log(`    present: ${c.data_type}, nullable=${c.is_nullable}, default=${c.column_default}`);
    }

    const idx = await prisma.$queryRawUnsafe<{ indexname: string }[]>(
      `SELECT indexname FROM pg_indexes
        WHERE schemaname='public' AND tablename='customer_contacts'
          AND indexdef ILIKE '%receives_operational_updates%'`
    );
    console.log(`    index: ${idx.length ? idx.map((i) => i.indexname).join(", ") : "NONE"}`);

    // ---- 2. every row backfilled false ----
    const rows = await prisma.$queryRawUnsafe<{ total: bigint; on_count: bigint; off_count: bigint }[]>(
      `SELECT COUNT(*) AS total,
              COUNT(*) FILTER (WHERE receives_operational_updates) AS on_count,
              COUNT(*) FILTER (WHERE NOT receives_operational_updates) AS off_count
         FROM customer_contacts`
    );
    const r = rows[0];
    console.log("\n[2] BACKFILL");
    console.log(`    contacts total=${r.total}  opted-in=${r.on_count}  opted-out=${r.off_count}`);

    // ---- 3. resolver eligibility: operational recipients per customer ----
    // Post-R2 the operational predicate is exactly:
    //   doNotContact = false AND receivesOperationalUpdates = true
    // isPrimary is inert; receivesTrackingLink governs the link only.
    const elig = await prisma.$queryRawUnsafe<{ eligible: bigint }[]>(
      `SELECT COUNT(*) AS eligible
         FROM customer_contacts
        WHERE do_not_contact = false AND receives_operational_updates = true`
    );
    console.log("\n[3] RESOLVER — operational recipients");
    console.log(`    eligible contacts across ALL customers: ${elig[0].eligible}`);

    const perCustomer = await prisma.$queryRawUnsafe<
      { name: string; contacts: bigint; eligible: bigint }[]
    >(
      `SELECT c.name,
              COUNT(cc.id) AS contacts,
              COUNT(*) FILTER (WHERE cc.do_not_contact = false AND cc.receives_operational_updates) AS eligible
         FROM customers c
         JOIN customer_contacts cc ON cc."customerId" = c.id
        GROUP BY c.name
        ORDER BY c.name`
    );
    console.log(`    customers with contacts: ${perCustomer.length}`);
    const nonEmpty = perCustomer.filter((p) => Number(p.eligible) > 0);
    console.log(`    customers resolving NON-empty: ${nonEmpty.length}`);
    for (const p of nonEmpty) console.log(`      ! ${p.name}: ${p.eligible} eligible`);

    // ---- 4. the 8-contact action table (P6 input) ----
    console.log("\n[4] THE 8 — contacts eligible under the OLD rule, not under the new");
    const eight = await prisma.$queryRawUnsafe<
      {
        customer: string;
        contact: string;
        email: string | null;
        is_primary: boolean;
        tracking: boolean;
        operational: boolean;
      }[]
    >(
      `SELECT c.name AS customer, cc.name AS contact, cc.email,
              cc."isPrimary" AS is_primary,
              cc.receives_tracking_link AS tracking,
              cc.receives_operational_updates AS operational
         FROM customer_contacts cc
         JOIN customers c ON c.id = cc."customerId"
        WHERE cc.do_not_contact = false
          AND (cc."isPrimary" = true OR cc.receives_tracking_link = true)
        ORDER BY c.name`
    );
    console.log(`    count: ${eight.length}`);
    for (const e of eight) {
      console.log(
        `      ${e.customer} | ${e.contact} | ${e.email ?? "(no email)"} | primary=${e.is_primary} | ops=${e.operational}`
      );
    }

    // ---- 5. outbound since deploy ----
    console.log("\n[5] EMAIL since deploy");
    const sent = await prisma.$queryRawUnsafe<{ to: string; subject: string; status: string; createdAt: Date }[]>(
      `SELECT "to", subject, status, "createdAt"
         FROM email_logs
        WHERE "createdAt" >= $1::timestamptz
        ORDER BY "createdAt"`,
      deployedAt
    );
    console.log(`    email_logs rows since deploy: ${sent.length}`);

    const contactEmails = new Set(
      (
        await prisma.$queryRawUnsafe<{ email: string | null }[]>(
          `SELECT DISTINCT email FROM customer_contacts WHERE email IS NOT NULL`
        )
      )
        .map((x) => (x.email ?? "").toLowerCase())
        .filter(Boolean)
    );
    const custEmails = new Set(
      (
        await prisma.$queryRawUnsafe<{ email: string | null }[]>(
          `SELECT DISTINCT email FROM customers WHERE email IS NOT NULL`
        )
      )
        .map((x) => (x.email ?? "").toLowerCase())
        .filter(Boolean)
    );

    const toCustomer = sent.filter(
      (s) => contactEmails.has((s.to ?? "").toLowerCase()) || custEmails.has((s.to ?? "").toLowerCase())
    );
    console.log(`    of those, addressed to a customer contact or customer: ${toCustomer.length}`);
    for (const s of toCustomer) {
      console.log(`      ! ${s.createdAt.toISOString()} ${s.status} -> ${s.to} :: ${s.subject}`);
    }
    if (sent.length && !toCustomer.length) {
      console.log("    (all sends since deploy were internal/carrier — none to a customer)");
      for (const s of sent.slice(0, 8)) {
        console.log(`      . ${s.createdAt.toISOString()} ${s.status} -> ${s.to} :: ${s.subject.slice(0, 70)}`);
      }
    }
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("FAILED: " + (e?.message ?? e));
  process.exit(1);
});
