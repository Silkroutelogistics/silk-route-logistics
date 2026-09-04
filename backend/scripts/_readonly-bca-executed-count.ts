/**
 * READ-ONLY. Counts executed Broker-Carrier Agreements per version.
 *
 * This is the B4 precondition: replacing the BCA body removes the outgoing text
 * from the running code, and a stored contentHash for a signature taken against
 * it becomes un-recomputable. Archiving the outgoing body is cheap before a swap
 * and impossible after, so the count decides whether the swap is clean.
 *
 * It loads .env.production.local EXPLICITLY. Per §2.2 the production rail keeps
 * those credentials out of .env precisely so that reaching production is a
 * deliberate act rather than something a command picks up by accident. This is
 * that deliberate act, and it issues SELECT only.
 */
import fs from "fs";
import path from "path";

const PROD_ENV = path.resolve(__dirname, "../.env.production.local");

function loadProdEnv(): void {
  if (!fs.existsSync(PROD_ENV)) {
    console.error("REFUSING: .env.production.local not found. Nothing to read.");
    process.exit(1);
  }
  for (const line of fs.readFileSync(PROD_ENV, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
  const host = (process.env.DATABASE_URL ?? "").replace(/.*@/, "").split("/")[0];
  if (/localhost|127\.0\.0\.1/.test(host)) {
    console.error("REFUSING: .env.production.local resolves to a LOCAL host (" + host + ").");
    console.error("That is the rail breach §2.2 describes -- production credentials pasted into the wrong file.");
    process.exit(1);
  }
  console.log("target (read-only): " + host + "\n");
}

/**
 * The TEMPLATE and the OUTGOING version — the body about to be replaced.
 *
 * v3.8.azk — the version was the literal "2026-06-27-v1" in five places, pinned
 * to the swap it was written for. At the NEXT swap it counted the wrong version
 * and printed "VERDICT: NONZERO -- HALT" while the body actually going out had
 * zero signatures against it, contradicting the evidence printed directly above.
 *
 * Phase B commit 1 — the TEMPLATE was still hardcoded to broker-carrier in both
 * queries, so the tool could not answer the Quick Pay question at all. Asked to
 * check the QP it would have reported on BCA rows at a QP version, found none,
 * and said "clean swap" about a body a real carrier had executed. A precondition
 * tool that answers the wrong question confidently is worse than one that
 * refuses, so the template is now a parameter with the same defaulting rule as
 * the version: correct by construction for the common case, overridable.
 *
 *   npx tsx scripts/_readonly-bca-executed-count.ts                  -> BCA at BCA_VERSION
 *   npx tsx scripts/_readonly-bca-executed-count.ts quick-pay        -> QP at QP_VERSION
 *   npx tsx scripts/_readonly-bca-executed-count.ts quick-pay 2026-08-16-v4
 */
type Target = { template: string; aliases: string[]; version: string };

async function resolveTarget(): Promise<Target> {
  const tmplArg = process.argv[2];
  const verArg = process.argv[3];
  const mod = await import("../src/data/agreements");
  if (tmplArg && /^quick-?pay$|^qp$/i.test(tmplArg)) {
    return { template: "quick-pay", aliases: ["quick-pay", "quickpay", "qp"], version: verArg || mod.QP_VERSION };
  }
  if (tmplArg && !/^broker-?carrier$|^bca$/i.test(tmplArg)) {
    console.error("Unknown template: " + tmplArg + " (expected broker-carrier|bca|quick-pay|qp)");
    process.exit(1);
  }
  return { template: "broker-carrier", aliases: ["broker-carrier", "bca"], version: verArg || mod.BCA_VERSION };
}

async function main() {
  loadProdEnv();
  const { prisma } = await import("../src/config/database");
  const TARGET = await resolveTarget();
  const OUTGOING = TARGET.version;
  console.log("template under test: " + TARGET.template +
    (process.argv[2] ? "  (from argv)" : "  (default)"));
  console.log("outgoing version under test: " + OUTGOING +
    (process.argv[3] ? "  (from argv)" : "  (the version currently in code)") + "\n");

  const byVersion = await prisma.$queryRawUnsafe<Array<{ version: string; status: string; n: bigint }>>(
    `SELECT version, status::text AS status, COUNT(*) AS n
       FROM carrier_agreements
      WHERE "templateName" = ANY($1::text[])
      GROUP BY version, status
      ORDER BY version, status`,
    TARGET.aliases,
  );

  console.log(TARGET.template + " agreements, by version and status:");
  if (!byVersion.length) console.log("  (no rows at all)");
  for (const r of byVersion) console.log("  " + r.version.padEnd(22) + r.status.padEnd(12) + String(r.n));

  const executedTarget = byVersion
    .filter((r) => r.version === OUTGOING && r.status === "SIGNED")
    .reduce((n, r) => n + Number(r.n), 0);

  const anyTarget = byVersion
    .filter((r) => r.version === OUTGOING)
    .reduce((n, r) => n + Number(r.n), 0);

  console.log("\nEXECUTED (SIGNED) at " + OUTGOING + " : " + executedTarget);
  console.log("ANY STATUS at " + OUTGOING + "        : " + anyTarget);
  console.log(
    "\nVERDICT: " +
      (executedTarget === 0
        ? "ZERO executed at the outgoing version -- clean swap."
        : "NONZERO -- HALT. Archive the outgoing body before swapping."),
  );

  // Who they are decides what archiving is actually required: a signature by a
  // test account is a different fact from a signature by a real carrier.
  const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
    `SELECT ca.id, ca.version, ca.status::text AS status, ca."signedAt", ca."signedByName",
            ca."signedByTitle", ca."contentHash" IS NOT NULL AS has_hash,
            ca."documentUrl" IS NOT NULL AS has_pdf,
            cp."companyName", cp."mcNumber", cp."isTestAccount", cp."onboardingStatus"
       FROM carrier_agreements ca
       JOIN carrier_profiles cp ON cp.id = ca."carrierId"
      WHERE ca."templateName" = ANY($2::text[]) AND ca.version = $1
      ORDER BY ca."signedAt" NULLS LAST`,
    OUTGOING,
    TARGET.aliases,
  );
  console.log("\nRows at " + OUTGOING + ":");
  for (const r of rows) {
    console.log(
      "  " + String(r.status).padEnd(13) +
      " test=" + String(r.isTestAccount).padEnd(6) +
      " " + String(r.companyName ?? "?").slice(0, 30).padEnd(31) +
      " MC=" + String(r.mcNumber ?? "-").padEnd(12) +
      " signedAt=" + (r.signedAt ? new Date(r.signedAt as string).toISOString().slice(0, 10) : "-") +
      " hash=" + r.has_hash + " pdf=" + r.has_pdf +
      " by=" + JSON.stringify(r.signedByName ?? null),
    );
  }

  await prisma.$disconnect();
  process.exit(0);
}

main().catch(async (e) => { console.error(e); process.exit(1); });
