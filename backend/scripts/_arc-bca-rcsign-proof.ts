/**
 * BCA Commit 2 proof: a rate confirmation cannot be signed by a carrier with no
 * executed Broker-Carrier Agreement, on either verb; a refusal writes nothing,
 * consumes no token, and leaves an audit row; signing the BCA makes the SAME
 * link work. Real router over HTTP, real database, real transaction.
 *
 * The unit guard (rcSignBcaRequired.test.ts) holds the shape with prisma
 * mocked. This is the half it cannot see: that the refusal really leaves the
 * row and the token untouched in Postgres, that audit_logs really gets the
 * row, and that the happy path really commits inside the transaction.
 *
 * Rehearsal container only; outbound keys must be explicitly EMPTY (section 19
 * Sub-pattern 20).
 *
 * Run:
 *   DATABASE_URL=postgres://...127.0.0.1... RESEND_API_KEY= QUO_API_KEY= OPENPHONE_API_KEY= \
 *   S3_BUCKET_NAME= AWS_ACCESS_KEY_ID= npx tsx scripts/_arc-bca-rcsign-proof.ts
 */
function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
    process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "QUO_API_KEY", "OPENPHONE_API_KEY", "S3_BUCKET_NAME", "AWS_ACCESS_KEY_ID"]) {
    const v = process.env[k];
    if (v === undefined) { console.error(`REFUSING: ${k} UNSET — dotenv would fill it from backend/.env.`); process.exit(1); }
    if (v !== "") { console.error(`REFUSING: ${k} set to a real value. Outbound would be LIVE.`); process.exit(1); }
  }
  console.log("guard: local DB; outbound + storage keys explicitly empty (post-dotenv)\n");
}
guard();

import type { Server } from "http";

const PORT = 55925;
const BASE = `http://127.0.0.1:${PORT}/api`;

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  -- " + d : ""}`); }
};

async function main() {
  const { prisma } = await import("../src/config/database");
  const { mintRcSignToken, checkSignToken } = await import("../src/lib/rcSignToken");
  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const routes = (await import("../src/routes")).default;

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((r) => { const s = app.listen(PORT, "127.0.0.1", () => r(s)); });

  const stamp = Date.now();
  const ae = await prisma.user.create({
    data: { email: `bca2-ae-${stamp}@srl.invalid`, passwordHash: "x", firstName: "B", lastName: "A", role: "ADMIN" },
  });
  const cu = await prisma.user.create({
    data: { email: `bca2-ca-${stamp}@srl.invalid`, passwordHash: "x", firstName: "No", lastName: "Contract", role: "CARRIER", totpEnabled: true },
  });
  // APPROVED, activated, enrolled — and holding ONLY the registration click-wrap.
  // This is CJ MASTER's exact shape on production (Item 292 census).
  const profile = await prisma.carrierProfile.create({
    data: { userId: cu.id, companyName: `No Contract Co ${stamp}`, onboardingStatus: "APPROVED", status: "APPROVED", activatedAt: new Date() },
  });
  await prisma.carrierAgreement.create({
    data: { carrierId: profile.id, templateName: "broker-carrier", version: "2026-09-03-F11", status: "ACKNOWLEDGED" },
  });
  const load = await prisma.load.create({
    data: {
      referenceNumber: `BCA2-${stamp}`, posterId: ae.id, status: "BOOKED", carrierId: cu.id,
      originCity: "Lebanon", originState: "NH", originZip: "03766",
      destCity: "North Lake", destState: "TX", destZip: "76247",
      pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
      equipmentType: "Reefer", rate: 5100, customerRate: 5100, carrierRate: 4100,
    },
  });
  const known = mintRcSignToken();
  const rc = await prisma.rateConfirmation.create({
    data: {
      loadId: load.id, createdById: ae.id, status: "SENT",
      formData: { carrierName: "No Contract Co", lineHaulRate: 4100 } as any,
      carrierRate: 4100, totalCharges: 4100, contentHash: "proof-hash",
      signTokenHash: known.tokenHash, signTokenId: known.tokenId, signTokenExpiresAt: known.expiresAt, signTokenUsedAt: null,
    },
  });
  const link = `${BASE}/rc-sign/${known.token}`;
  const sign = () => fetch(link, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "signerName=Pat+Signer&attest=yes",
  });
  const rcRow = () => prisma.rateConfirmation.findUniqueOrThrow({ where: { id: rc.id } });
  const refusals = () => prisma.auditLog.count({ where: { userId: cu.id, action: "RC_SIGN_REFUSED" } });

  // ───────────────────────────────────────────────────────────────────────────
  console.log("[1] MISSING — click-wrap only");
  const g1 = await fetch(link);
  ok("GET is 409", g1.status === 409, `status=${g1.status}`);
  const g1h = await g1.text();
  ok("the page says to sign the agreement first and links the activation page", /Sign the Broker-Carrier Agreement first/.test(g1h) && g1h.includes("/carrier/dashboard/activation"));
  ok("and does not render the form", !g1h.includes('name="signerName"'));

  const p1 = await sign();
  ok("POST is 409", p1.status === 409, `status=${p1.status}`);
  const r1 = await rcRow();
  ok("the row is untouched: not signed, no signer, status still SENT", r1.signed === false && r1.signerName === null && r1.status === "SENT", JSON.stringify({ signed: r1.signed, signerName: r1.signerName, status: r1.status }));
  ok("the token was NOT consumed", r1.signTokenUsedAt === null && r1.signTokenHash === known.tokenHash);
  ok("… and still checks as valid", checkSignToken(r1).ok === true, JSON.stringify(checkSignToken(r1)));
  const a1 = await prisma.auditLog.findFirst({ where: { userId: cu.id, action: "RC_SIGN_REFUSED" }, orderBy: { createdAt: "desc" } });
  ok("one RC_SIGN_REFUSED audit row, against the carrier, reason BCA_REQUIRED", !!a1 && (a1.details as any)?.reason === "BCA_REQUIRED" && (a1.details as any)?.rateConfirmationId === rc.id, JSON.stringify(a1?.details));
  ok("… exactly one", (await refusals()) === 1);
  ok("no tender moved to CONFIRMED", (await prisma.loadTender.count({ where: { loadId: load.id, status: "CONFIRMED" } })) === 0);

  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[2] TERMINATED — signed once, revoked");
  await prisma.carrierAgreement.create({
    data: { carrierId: profile.id, templateName: "broker-carrier", version: "2026-06-27-v1", status: "TERMINATED",
      signedAt: new Date(Date.now() - 30 * 864e5), signedByName: "Pat Signer", terminatedAt: new Date(), terminationReason: "proof" },
  });
  const g2 = await fetch(link);
  const g2h = await g2.text();
  ok("GET is 409 with the termination copy, pointing at operations@", g2.status === 409 && /terminated/i.test(g2h) && g2h.includes("operations@silkroutelogistics.ai"), `status=${g2.status}`);
  const p2 = await sign();
  ok("POST is 409", p2.status === 409, `status=${p2.status}`);
  const r2 = await rcRow();
  ok("the row is still untouched and the token still valid", r2.signed === false && r2.signTokenUsedAt === null && checkSignToken(r2).ok === true);
  const a2 = await prisma.auditLog.findFirst({ where: { userId: cu.id, action: "RC_SIGN_REFUSED" }, orderBy: { createdAt: "desc" } });
  ok("a second refusal row, reason AGREEMENT_TERMINATED", (await refusals()) === 2 && (a2?.details as any)?.reason === "AGREEMENT_TERMINATED", JSON.stringify(a2?.details));

  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[3] the carrier signs the BCA — the SAME link now works");
  await prisma.carrierAgreement.create({
    data: { carrierId: profile.id, templateName: "broker-carrier", version: "2026-09-03-F11", status: "SIGNED",
      signedAt: new Date(), signedByName: "Pat Signer", signedByTitle: "Owner" },
  });
  const g3 = await fetch(link);
  ok("GET is 200 and renders the form", g3.status === 200 && (await g3.text()).includes('name="signerName"'), `status=${g3.status}`);
  const p3 = await sign();
  ok("POST is 200 — Signed", p3.status === 200 && /Signed/.test(await p3.text()), `status=${p3.status}`);
  const r3 = await rcRow();
  ok("the row is signed with the typed name, SIGNED, token consumed", r3.signed === true && r3.signerName === "Pat Signer" && r3.status === "SIGNED" && r3.signTokenUsedAt !== null, JSON.stringify({ signed: r3.signed, signerName: r3.signerName, status: r3.status }));
  ok("no third refusal row", (await refusals()) === 2);

  console.log("\n[4] a second submission after signing is ALREADY_USED, not a BCA refusal");
  const p4 = await sign();
  ok("409 already signed", p4.status === 409 && /already signed|is signed/i.test(await p4.text()), `status=${p4.status}`);
  ok("still no third refusal row", (await refusals()) === 2);

  console.log("\n[5] outbound: nothing left the building");
  ok("Resend is not configured in this process", process.env.RESEND_API_KEY === "");

  console.log(`\n${pass}/${pass + fail} passed`);
  server.closeAllConnections?.();
  server.close();
  await new Promise((r) => setTimeout(r, 500));

  await prisma.rateConfirmation.deleteMany({ where: { loadId: load.id } });
  await prisma.loadActivity.deleteMany({ where: { loadId: load.id } }).catch(() => {});
  await prisma.load.delete({ where: { id: load.id } });
  await prisma.carrierAgreement.deleteMany({ where: { carrierId: profile.id } });
  await prisma.carrierProfile.delete({ where: { id: profile.id } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [cu.id, ae.id] } } });
  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@srl.invalid` } } });
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
