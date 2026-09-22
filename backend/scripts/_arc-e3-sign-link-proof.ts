/**
 * E3 proof (ruling 3): the carrier signs from the portal through a link the
 * portal minted; a new mint kills the old link; the email path sends only to
 * the address on file; the fourth mint in an hour is refused; every mint is an
 * audit row; and a portal-minted link signs for real, moving the tender to
 * CONFIRMED. Real router over HTTP, real database, real rotation.
 *
 * The unit guard (carrierRcSignLink.test.ts) holds the shape with prisma
 * mocked. This is the half it cannot see: that rotation really invalidates
 * the prior token in Postgres, that the redirect target really renders the
 * form, and that the signature through it really commits.
 *
 * Rehearsal container only; outbound keys must be explicitly EMPTY.
 *
 * Run:
 *   DATABASE_URL=postgres://...127.0.0.1... RESEND_API_KEY= QUO_API_KEY= OPENPHONE_API_KEY= \
 *   S3_BUCKET_NAME= AWS_ACCESS_KEY_ID= npx tsx scripts/_arc-e3-sign-link-proof.ts
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

import jwt from "jsonwebtoken";
import type { Server } from "http";

const PORT = 55929;
const BASE = `http://127.0.0.1:${PORT}/api`;

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  -- " + d : ""}`); }
};

async function main() {
  const { prisma } = await import("../src/config/database");
  const { registerSession } = await import("../src/middleware/auth");
  const { mintRcSignToken } = await import("../src/lib/rcSignToken");
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
    data: { email: `e3-ae-${stamp}@srl.invalid`, passwordHash: "x", firstName: "A", lastName: "E", role: "ADMIN" },
  });
  const cu = await prisma.user.create({
    data: { email: `e3-login-${stamp}@srl.invalid`, passwordHash: "x", firstName: "Sign", lastName: "Here", role: "CARRIER", totpEnabled: true },
  });
  const onFile = `e3-dispatch-${stamp}@srl.invalid`;
  const profile = await prisma.carrierProfile.create({
    data: { userId: cu.id, companyName: `E3 Co ${stamp}`, onboardingStatus: "APPROVED", status: "APPROVED", activatedAt: new Date(), contactEmail: onFile },
  });
  await prisma.carrierAgreement.create({
    data: { carrierId: profile.id, templateName: "broker-carrier", version: "test", status: "SIGNED", signedAt: new Date(), signedByName: "Sign Here" },
  });
  const ctoken = jwt.sign({ userId: cu.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(cu.id, ctoken, "CARRIER");
  const cookie = `srl_token_carrier=${ctoken}`;

  const load = await prisma.load.create({
    data: {
      referenceNumber: `E3-${stamp}`, loadNumber: `SRL-E3${String(stamp).slice(-6)}`, posterId: ae.id, status: "BOOKED", carrierId: cu.id,
      originCity: "Lebanon", originState: "NH", originZip: "03766",
      destCity: "North Lake", destState: "TX", destZip: "76247",
      pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
      equipmentType: "Reefer", rate: 5100, customerRate: 5100, carrierRate: 4100,
    },
  });
  const tender = await prisma.loadTender.create({
    data: { loadId: load.id, carrierId: profile.id, status: "RC_SENT", offeredRate: 4100, expiresAt: new Date(Date.now() + 864e5) },
  });
  // The AE's send left a live token behind — the link in the email.
  const emailed = mintRcSignToken();
  const rc = await prisma.rateConfirmation.create({
    data: {
      loadId: load.id, createdById: ae.id, status: "SENT",
      formData: { carrierName: "E3 Co", lineHaulRate: 4100 } as any,
      carrierRate: 4100, totalCharges: 4100, contentHash: "proof-hash",
      signTokenHash: emailed.tokenHash, signTokenId: emailed.tokenId, signTokenExpiresAt: emailed.expiresAt, signTokenUsedAt: null,
    },
  });

  const portalMint = () => fetch(`${BASE}/carrier-loads/${load.id}/rc-sign-link`, { method: "POST", headers: { Cookie: cookie }, redirect: "manual" });
  const emailMint = (body: unknown) => fetch(`${BASE}/carrier-loads/${load.id}/rc-sign-link/email`, {
    method: "POST", headers: { Cookie: cookie, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const mints = () => prisma.auditLog.count({ where: { entity: "RateConfirmation", entityId: rc.id, action: "RC_SIGN_LINK_MINTED" } });
  const rcRow = () => prisma.rateConfirmation.findUniqueOrThrow({ where: { id: rc.id } });

  // ───────────────────────────────────────────────────────────────────────────
  console.log("[1] sign it here: the portal mints and sends the carrier to the form");
  const m1 = await portalMint();
  ok("303", m1.status === 303, `status=${m1.status}`);
  const loc1 = m1.headers.get("location") || "";
  ok("Location is /api/rc-sign/<fresh token>", /^\/api\/rc-sign\/[0-9a-f]{64}$/.test(loc1), loc1);
  const tok1 = loc1.slice("/api/rc-sign/".length);
  const form1 = await fetch(`http://127.0.0.1:${PORT}${loc1}`);
  ok("the redirect target renders the signing form (200)", form1.status === 200 && (await form1.text()).includes('name="signerName"'), `status=${form1.status}`);
  const old = await fetch(`${BASE}/rc-sign/${emailed.token}`);
  ok("the link from the AE's email is DEAD now (rotation revoked it): 404", old.status === 404, `status=${old.status}`);
  ok("the row's hash is the new token's, and the token id changed", (await rcRow()).signTokenId !== emailed.tokenId);
  ok("one audit row", (await mints()) === 1);

  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[2] email me a new link — to the address on file, whatever the body says");
  const m2 = await emailMint({ email: "attacker@evil.test", to: "attacker@evil.test" });
  const b2 = await m2.json();
  ok("200 with sentTo = the contact email on file", m2.status === 200 && b2.sentTo === onFile, JSON.stringify(b2));
  const dead1 = await fetch(`http://127.0.0.1:${PORT}${loc1}`);
  ok("the portal link from [1] is DEAD now: 404", dead1.status === 404, `status=${dead1.status}`);
  ok("two audit rows", (await mints()) === 2);
  const a2 = await prisma.auditLog.findFirst({ where: { entity: "RateConfirmation", entityId: rc.id, action: "RC_SIGN_LINK_MINTED" }, orderBy: { createdAt: "desc" } });
  ok("the row says channel email, sentTo on file, and never the attacker's address", (a2?.details as any)?.channel === "email" && (a2?.details as any)?.sentTo === onFile && !JSON.stringify(a2).includes("attacker"), JSON.stringify(a2?.details));
  ok("the token is in no audit row", !JSON.stringify(await prisma.auditLog.findMany({ where: { entityId: rc.id } })).includes(tok1));

  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[3] the limit: 3 mints per RC per hour");
  const m3 = await portalMint();
  ok("third mint is 303", m3.status === 303, `status=${m3.status}`);
  const loc3 = m3.headers.get("location") || "";
  const m4 = await portalMint();
  ok("fourth mint is 429", m4.status === 429, `status=${m4.status}`);
  ok("… as a page that names the limit", /Too many signing links/.test(await m4.text()));
  const m4e = await emailMint({});
  ok("… and the email route agrees, 429 JSON", m4e.status === 429 && (await m4e.json()).code === "SIGN_LINK_RATE_LIMITED", `status=${m4e.status}`);
  ok("still exactly three audit rows", (await mints()) === 3);
  ok("the third link is still the live one (a refused mint rotated nothing)", (await fetch(`http://127.0.0.1:${PORT}${loc3}`)).status === 200);

  // ───────────────────────────────────────────────────────────────────────────
  console.log("\n[4] the third link signs for real");
  const sign = await fetch(`http://127.0.0.1:${PORT}${loc3}`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "signerName=Pat+Signer&attest=yes",
  });
  ok("200 Signed", sign.status === 200 && /Signed/.test(await sign.text()), `status=${sign.status}`);
  await new Promise((r) => setTimeout(r, 400)); // the CONFIRMED transition is fire-and-forget
  const r4 = await rcRow();
  ok("the RC is SIGNED with the typed name and the token consumed", r4.signed === true && r4.signerName === "Pat Signer" && r4.signTokenUsedAt !== null);
  const t4 = await prisma.loadTender.findUnique({ where: { id: tender.id }, select: { status: true } });
  ok("the tender moved RC_SENT -> CONFIRMED (the BOL gate opens)", t4?.status === "CONFIRMED", `status=${t4?.status}`);

  console.log("\n[5] after signing, the portal has nothing to mint");
  const m5 = await portalMint();
  ok("409 already signed", m5.status === 409 && /signed/i.test(await m5.text()), `status=${m5.status}`);
  ok("no fourth audit row", (await mints()) === 3);

  console.log("\n[6] outbound: nothing left the building");
  ok("Resend is not configured in this process", process.env.RESEND_API_KEY === "");

  console.log(`\n${pass}/${pass + fail} passed`);
  server.closeAllConnections?.();
  server.close();
  await new Promise((r) => setTimeout(r, 500));

  await prisma.rateConfirmation.deleteMany({ where: { loadId: load.id } });
  await prisma.loadActivity.deleteMany({ where: { loadId: load.id } }).catch(() => {});
  await prisma.loadTender.deleteMany({ where: { loadId: load.id } });
  await prisma.load.delete({ where: { id: load.id } });
  await prisma.carrierAgreement.deleteMany({ where: { carrierId: profile.id } });
  await prisma.carrierProfile.delete({ where: { id: profile.id } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: [cu.id, ae.id] } } });
  await prisma.staffSession.deleteMany({ where: { userId: { in: [cu.id, ae.id] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: `-${stamp}@srl.invalid` } } });
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
