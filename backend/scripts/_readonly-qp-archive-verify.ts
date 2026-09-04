/**
 * READ-ONLY. Re-derives AEROSWIFT LLC's stored Quick Pay contentHash from the
 * ARCHIVED 2026-08-16-v4 body, against production.
 *
 * WHY THIS IS A SCRIPT AND NOT A UNIT TEST. Re-deriving that hash needs the
 * row's real inputs, one of which is the signer's IP address. This codebase
 * keeps real IPs out of source deliberately (PIN_SIGNATURE uses 203.0.113.10,
 * RFC 5737 documentation space), and a carrier officer's IP committed to git is
 * there permanently. agreementArchive.test.ts therefore pins the archived
 * TEXT's canonical hash under synthetic inputs — which is the property that
 * would break — and this proves the linkage to the actual executed row.
 *
 * RUN IT BEFORE ANY FUTURE QUICK PAY BODY CHANGE. A pass means the archive
 * still backs the signature; a fail means a real carrier's executed agreement
 * has become un-verifiable.
 *
 * Loads .env.production.local explicitly per §2.2 and issues SELECT only.
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
    process.exit(1);
  }
  console.log("target (read-only): " + host + "\n");
}

async function main(): Promise<void> {
  loadProdEnv();
  const { prisma } = await import("../src/config/database");
  const { agreementContentHash } = await import("../src/lib/canonicalAgreementText");
  const { getAgreement } = await import("../src/data/agreements");

  const rows = await prisma.$queryRawUnsafe<Array<Record<string, string | Date | null>>>(
    `SELECT ca.id, ca.version, ca."contentHash", ca."signedByName", ca."signedByTitle",
            ca."signedAt", ca."signerIp", ca."consentAt", ca."counterSignedByName",
            ca."counterSignedByTitle", ca."counterSignedAt",
            cp."companyName", cp."mcNumber", cp."dotNumber"
       FROM carrier_agreements ca
       JOIN carrier_profiles cp ON cp.id = ca."carrierId"
      WHERE ca."templateName" = 'quick-pay' AND ca.status = 'SIGNED'
      ORDER BY ca."signedAt"`,
  );

  if (!rows.length) {
    console.log("No executed Quick Pay agreements. Nothing to verify.");
    process.exit(0);
  }

  let bad = 0;
  for (const r of rows) {
    const version = String(r.version);
    const body = getAgreement("quick-pay", version);
    if (!body) { console.log(version + ": NO BODY RESOLVES — archive missing"); bad++; continue; }

    // The identity shape mirrors loadCarrierIdentity exactly: legalName is the
    // profile's companyName and ein is always null on that path. Getting either
    // wrong yields a different hash, which is how the shape was confirmed.
    const h = agreementContentHash(body, {
      carrier: {
        legalName: (r.companyName as string) || "Carrier",
        mcNumber: (r.mcNumber as string) || null,
        dotNumber: (r.dotNumber as string) || null,
        ein: null,
      },
      signature: {
        signedByName: r.signedByName as string,
        signedByTitle: (r.signedByTitle as string) || null,
        signedAt: new Date(r.signedAt as Date),
        signerIp: (r.signerIp as string) || null,
        version,
        consentAt: r.consentAt ? new Date(r.consentAt as Date) : null,
      },
      countersign: r.counterSignedByName
        ? {
            name: r.counterSignedByName as string,
            title: r.counterSignedByTitle as string,
            at: new Date(r.counterSignedAt as Date),
          }
        : undefined,
    });

    const ok = h === r.contentHash;
    if (!ok) bad++;
    console.log(
      (ok ? "MATCH " : "FAIL  ") + version.padEnd(16) +
      String(r.companyName).slice(0, 24).padEnd(25) +
      "resolves via " + (body.version === version ? "archive/current" : "?") +
      (ok ? "" : "\n   stored:   " + r.contentHash + "\n   derived:  " + h),
    );
  }

  console.log("\nVERDICT: " + (bad === 0
    ? "every executed Quick Pay agreement still re-derives from the body that backs it."
    : bad + " row(s) DO NOT re-derive — a signature is un-verifiable."));
  await prisma.$disconnect();
  process.exit(bad === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); process.exit(1); });
