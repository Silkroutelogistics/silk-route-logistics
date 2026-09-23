/**
 * P6 — the 8-contact action table, read-only as srl_readonly.
 *
 * customer | contact | isPrimary | last operational email sent | active loads
 *
 * "Active loads" = a load for that customer in a status from which the freight
 * has not yet been delivered, using the same pre-delivery set the arc treats as
 * in-flight. "Last operational email" is the newest email_logs row addressed to
 * that contact's address; email_logs only exists since v3.8.anl, so an older
 * send is invisible and is reported as such rather than as "never".
 */
import { PrismaClient } from "@prisma/client";
import { resolveCensusCredential, announceCensusTarget } from "./_census-credential";

const ACTIVE = [
  "DRAFT", "PLANNED", "POSTED", "TENDERED", "CONFIRMED", "BOOKED",
  "DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY",
];

async function main() {
  const t = resolveCensusCredential();
  announceCensusTarget(t, "P6 eight-table");
  const prisma = new PrismaClient({ datasourceUrl: t.url });
  try {
    await prisma.$executeRawUnsafe("SET default_transaction_read_only = on");

    const oldest = await prisma.$queryRawUnsafe<{ m: Date | null }[]>(
      `SELECT MIN("createdAt") AS m FROM email_logs`
    );
    console.log("\nemail_logs oldest row: " + (oldest[0].m ? oldest[0].m.toISOString() : "(table empty)"));

    const rows = await prisma.$queryRawUnsafe<
      {
        customer: string;
        contact: string;
        email: string | null;
        is_primary: boolean;
        last_op: Date | null;
        active_loads: bigint;
      }[]
    >(
      `SELECT c.name AS customer,
              cc.name AS contact,
              cc.email,
              cc."isPrimary" AS is_primary,
              (SELECT MAX(el."createdAt") FROM email_logs el
                WHERE lower(el."to") = lower(cc.email) AND el.status = 'SENT') AS last_op,
              (SELECT COUNT(*) FROM loads l
                WHERE l."customerId" = c.id
                  AND l."deletedAt" IS NULL
                  AND l.status::text = ANY($1::text[])) AS active_loads
         FROM customer_contacts cc
         JOIN customers c ON c.id = cc."customerId"
        WHERE cc.do_not_contact = false
          AND (cc."isPrimary" = true OR cc.receives_tracking_link = true)
        ORDER BY c.name`,
      ACTIVE
    );

    const pad = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1) + "…" : s.padEnd(n));
    console.log("");
    console.log(
      pad("CUSTOMER", 24) + pad("CONTACT", 18) + pad("EMAIL", 32) + pad("PRIMARY", 9) + pad("LAST OPS EMAIL", 19) + "ACTIVE LOADS"
    );
    for (const r of rows) {
      console.log(
        pad(r.customer, 24) +
          pad(r.contact, 18) +
          pad(r.email ?? "(none)", 32) +
          pad(r.is_primary ? "yes" : "no", 9) +
          pad(r.last_op ? r.last_op.toISOString().slice(0, 16).replace("T", " ") : "never", 19) +
          String(r.active_loads)
      );
    }
    console.log("\nrows: " + rows.length);
    const totalActive = rows.reduce((a, r) => a + Number(r.active_loads), 0);
    console.log("total active loads behind these contacts: " + totalActive);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("FAILED: " + (e?.message ?? e));
  process.exit(1);
});
