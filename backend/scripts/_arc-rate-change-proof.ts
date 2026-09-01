/**
 * Commit-11d proof: changing the rate undoes the acceptance, and an unsigned
 * rate confirmation does not carry a load forward.
 *
 * Two claims, one theme. A carrier accepted a NUMBER; changing it does not
 * produce a carrier who accepted the new number, so the tender must go back to
 * them and the document stating the old terms must stop being signable. And the
 * bill of lading -- the document that sends a truck to a shipper's dock -- must
 * not reach a carrier who has not signed.
 *
 * The void assertions check the SIGNING TOKEN as well as the status, because a
 * voided document that is still signable is the worse half: the link is already
 * in a carrier's inbox.
 *
 * Real router over HTTP, real database. Local container only; outbound keys
 * must be explicitly empty.
 */
function guard() {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  require("dotenv").config();
  const url = process.env.DATABASE_URL || "";
  if (!/localhost|127\.0\.0\.1/.test(url)) {
    console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
    process.exit(1);
  }
  for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY"]) {
    const v = process.env[k];
    if (v === undefined) {
      console.error("REFUSING: " + k + " UNSET -- dotenv would fill it from backend/.env.");
      process.exit(1);
    }
    if (v !== "") {
      console.error("REFUSING: " + k + " set to a real value. Outbound would be LIVE.");
      process.exit(1);
    }
  }
  console.log("guard: local DB; outbound keys explicitly empty (post-dotenv)\n");
}
guard();

import jwt from "jsonwebtoken";
import type { Server } from "http";

const PORT = 55941;
const BASE = "http://127.0.0.1:" + PORT + "/api";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log("  PASS  " + n); }
  else { fail++; console.log("  FAIL  " + n + (d ? "  -- " + d : "")); }
};

async function main() {
  const { prisma } = await import("../src/config/database");
  const { registerSession } = await import("../src/middleware/auth");
  const { createTender } = await import("../src/services/tenderCreationService");
  const { settleTender } = await import("../src/services/tenderTransitionService");
  const { mintRcSignToken } = await import("../src/lib/rcSignToken");
  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const routes = (await import("../src/routes")).default;

  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((r) => {
    const s = app.listen(PORT, "127.0.0.1", () => r(s));
  });
  console.log("app: real router mounted on :" + PORT + "\n");

  const stamp = Date.now();
  const madeLoads: string[] = [];
  const ae = await prisma.user.create({
    data: { email: "rch-ae-" + stamp + "@srl.invalid", passwordHash: "x", firstName: "R", lastName: "C", role: "ADMIN" },
  });
  const cu = await prisma.user.create({
    data: {
      email: "rch-ca-" + stamp + "@srl.invalid", passwordHash: "x",
      firstName: "Rate", lastName: "Co", role: "CARRIER", totpEnabled: true,
    },
  });
  const profile = await prisma.carrierProfile.create({ data: { userId: cu.id, companyName: "RCH " + stamp } });

  async function makeAcceptedLoad(ref: string) {
    const load = await prisma.load.create({
      data: {
        referenceNumber: ref + "-" + stamp, posterId: ae.id, status: "BOOKED", carrierId: cu.id,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "75568",
        pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
        equipmentType: "Reefer", rate: 4100, customerRate: 5100, carrierRate: 4100,
      },
    });
    madeLoads.push(load.id);
    const tender = await createTender({ loadId: load.id, carrierProfileId: profile.id, offeredRate: 4100 });
    await settleTender({ tenderId: tender.id, to: "ACCEPTED", from: "OFFERED", actor: { id: cu.id, type: "CARRIER" } });
    const tok = mintRcSignToken();
    const rc = await prisma.rateConfirmation.create({
      data: {
        loadId: load.id, createdById: ae.id, status: "SENT",
        formData: { carrierName: "Rate Co", lineHaulRate: 4100 } as any,
        carrierRate: 4100, totalCharges: 4100,
        contentHash: "a".repeat(64), pdfUrl: "/uploads/fake.pdf",
        signTokenHash: tok.tokenHash, signTokenId: tok.tokenId, signTokenExpiresAt: tok.expiresAt,
      },
    });
    return { load, tender, rc, signToken: tok.token };
  }

  const aeTok = jwt.sign({ userId: ae.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(ae.id, aeTok, "AE");
  const caTok = jwt.sign({ userId: cu.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(cu.id, caTok, "CARRIER");

  // ── 1. the rate change ──
  console.log("[1] changing the rate after acceptance re-offers the load");
  const a = await makeAcceptedLoad("RCH-CHANGE");
  const put = await fetch(BASE + "/loads/" + a.load.id, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: "srl_token_ae=" + aeTok },
    body: JSON.stringify({ carrierRate: 4500 }),
  });
  ok("the rate change succeeds", put.status === 200, "status=" + put.status + " " + (await put.clone().text()).slice(0, 160));

  const t1 = await prisma.loadTender.findUniqueOrThrow({ where: { id: a.tender.id } });
  ok("the tender is back to OFFERED", t1.status === "OFFERED", "status=" + t1.status);
  ok("at the NEW rate", t1.offeredRate === 4500,
    "returning to OFFERED still showing the old number re-offers a rate that no longer stands: got " + t1.offeredRate);
  ok("the terms took a new version", (t1.version ?? 1) > 1, "version=" + t1.version);
  ok("respondedAt was cleared", t1.respondedAt === null,
    "a stale respondedAt makes a carrier who has not answered look like they already had");

  const rc1 = await prisma.rateConfirmation.findUniqueOrThrow({ where: { id: a.rc.id } });
  ok("the rate confirmation is voided", rc1.status === "VOID", "status=" + rc1.status);
  ok("and is no longer signable", rc1.signTokenHash === null,
    "a voided document that is still signable is the worse half -- the link is already in the carrier's inbox");

  console.log("\n[1b] and the dead link actually stops working");
  const deadLink = await fetch(BASE + "/rc-sign/" + a.signToken);
  ok("the superseded signing link is refused", deadLink.status === 404, "status=" + deadLink.status);

  // ── 2. an executed document is not rewritten ──
  console.log("\n[2] a rate change cannot rewrite an executed document");
  const b = await makeAcceptedLoad("RCH-SIGNED");
  await prisma.rateConfirmation.update({ where: { id: b.rc.id }, data: { status: "SIGNED", signed: true, signedAt: new Date(), signerName: "Already Signed" } });
  await settleTender({ tenderId: b.tender.id, to: "CONFIRMED", from: "ACCEPTED" });
  const put2 = await fetch(BASE + "/loads/" + b.load.id, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Cookie: "srl_token_ae=" + aeTok },
    body: JSON.stringify({ carrierRate: 4800 }),
  });
  ok("the rate change still succeeds", put2.status === 200, "status=" + put2.status);
  const rc2 = await prisma.rateConfirmation.findUniqueOrThrow({ where: { id: b.rc.id } });
  ok("the signed document survives", rc2.status === "SIGNED",
    "voiding it would not undo the agreement, only destroy the record OF the agreement");
  ok("the signer is untouched", rc2.signerName === "Already Signed");
  const t2 = await prisma.loadTender.findUniqueOrThrow({ where: { id: b.tender.id } });
  ok("the confirmed tender is not re-offered", t2.status === "CONFIRMED", "status=" + t2.status);

  // ── 3. the BOL gate ──
  console.log("\n[3] the bill of lading waits for the signature");
  const c = await makeAcceptedLoad("RCH-BOL");
  const bolUnsigned = await fetch(BASE + "/pdf/bol-load/" + c.load.id, { headers: { Cookie: "srl_token_carrier=" + caTok } });
  ok("an unsigned carrier is refused the BOL", bolUnsigned.status === 403, "status=" + bolUnsigned.status);
  const bolBody = await bolUnsigned.clone().json().catch(() => ({} as any));
  ok("and told to sign, with somewhere to go", bolBody.error === "RC_NOT_SIGNED" && !!bolBody.action?.href,
    "a refusal that does not name the remedy is a dead end: got " + JSON.stringify(bolBody).slice(0, 120));

  const bolAe = await fetch(BASE + "/pdf/bol-load/" + c.load.id, { headers: { Cookie: "srl_token_ae=" + aeTok } });
  ok("the AE is NOT gated", bolAe.status === 200,
    "gating the AE would make the document unreachable by the person chasing the signature: status=" + bolAe.status);

  await settleTender({ tenderId: c.tender.id, to: "CONFIRMED", from: "ACCEPTED" });
  const bolSigned = await fetch(BASE + "/pdf/bol-load/" + c.load.id, { headers: { Cookie: "srl_token_carrier=" + caTok } });
  ok("once confirmed the carrier gets the BOL", bolSigned.status === 200, "status=" + bolSigned.status);

  console.log("\n" + pass + "/" + (pass + fail) + " passed");
  server.closeAllConnections?.();
  server.close();

  for (const id of madeLoads) {
    await prisma.loadActivity.deleteMany({ where: { loadId: id } });
    await prisma.rateConfirmation.deleteMany({ where: { loadId: id } });
    await prisma.loadTender.deleteMany({ where: { loadId: id } });
    await prisma.shipment.deleteMany({ where: { loadId: id } }).catch(() => {});
    await prisma.load.delete({ where: { id } }).catch(() => {});
  }
  await prisma.carrierProfile.deleteMany({ where: { companyName: { contains: String(stamp) } } });
  await prisma.staffSession.deleteMany({ where: { userId: { in: [ae.id, cu.id] } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ae.id, cu.id] } } }).catch(() => {});
  await prisma.auditTrail.deleteMany({ where: { userId: { in: [ae.id, cu.id] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: "-" + stamp + "@srl.invalid" } } });
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
