/**
 * Commit-11e proof: the customer is told once, at the right moment, on both
 * kinds of path.
 *
 * The claim is deliberately asymmetric and that asymmetry is the risk. The
 * direct path announces at the SIGNATURE, because telling a customer their load
 * has a carrier is a commitment and an accept can still be re-offered at a
 * different rate. The auto-dispatch paths announce at ACCEPT, because they
 * dispatch without a signature and would otherwise leave a customer with no
 * tracking link at all.
 *
 * Both halves have to be asserted or the change is half-tested: proving the
 * direct path waits says nothing about whether auto-dispatch was silently
 * stranded, which is the regression this shape exists to avoid.
 *
 * Real database, real services. Local container only; outbound keys must be
 * explicitly empty.
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

import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import type { Server } from "http";

const PORT = 55947;
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
  const { sendTrackingLinkToCrmContacts } = await import("../src/services/shipperLoadNotifyService");
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
    data: { email: "fan-ae-" + stamp + "@srl.invalid", passwordHash: "x", firstName: "F", lastName: "O", role: "ADMIN" },
  });
  const cu = await prisma.user.create({
    data: {
      email: "fan-ca-" + stamp + "@srl.invalid", passwordHash: "x",
      firstName: "Fan", lastName: "Co", role: "CARRIER", totpEnabled: true,
    },
  });
  const profile = await prisma.carrierProfile.create({ data: { userId: cu.id, companyName: "FAN " + stamp } });
  const customer = await prisma.customer.create({ data: { name: "Fanout Customer " + stamp } });
  // A contact that WANTS the link, so "nothing was sent" can never be an
  // accident of there being nobody to send to.
  await prisma.customerContact.create({
    data: { customerId: customer.id, name: "Ops Desk", email: "ops-" + stamp + "@srl.invalid", receivesTrackingLink: true },
  });

  async function makeAccepted(ref: string) {
    const load = await prisma.load.create({
      data: {
        referenceNumber: ref + "-" + stamp, posterId: ae.id, status: "BOOKED", carrierId: cu.id,
        customerId: customer.id, trackingToken: (stamp + Math.random().toString(36).slice(2)).slice(-12),
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "75568",
        pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
        equipmentType: "Reefer", rate: 4100, customerRate: 5100, carrierRate: 4100,
      },
    });
    madeLoads.push(load.id);
    const tender = await createTender({ loadId: load.id, carrierProfileId: profile.id, offeredRate: 4100 });
    await settleTender({ tenderId: tender.id, to: "ACCEPTED", from: "OFFERED", actor: { id: cu.id, type: "CARRIER" } });
    return { load, tender };
  }

  const aeTok = jwt.sign({ userId: ae.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(ae.id, aeTok, "AE");

  // ── 1. the direct path waits for the signature ──
  console.log("[1] the direct path does not announce at accept");
  const a = await makeAccepted("FAN-DIRECT");
  const rcA = await prisma.rateConfirmation.create({
    data: {
      loadId: a.load.id, createdById: ae.id, status: "DRAFT",
      formData: { carrierName: "Fan Co", lineHaulRate: 4100 } as any,
      carrierRate: 4100, totalCharges: 4100,
    },
  });
  const l1 = await prisma.load.findUniqueOrThrow({ where: { id: a.load.id }, select: { trackingLinkSent: true } });
  ok("nothing was announced on accept", l1.trackingLinkSent !== true,
    "an accept can still be re-offered at a different rate; announcing it names a carrier who may come off the load");

  await fetch(BASE + "/rate-confirmations/" + rcA.id + "/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: "srl_token_ae=" + aeTok },
    body: JSON.stringify({ recipientEmail: "fan-ca-" + stamp + "@srl.invalid", recipientName: "Fan Co" }),
  });
  const l2 = await prisma.load.findUniqueOrThrow({ where: { id: a.load.id }, select: { trackingLinkSent: true } });
  ok("nor when the document goes out", l2.trackingLinkSent !== true,
    "an unsigned rate confirmation is not a commitment either");

  const tokA = mintRcSignToken();
  await prisma.rateConfirmation.update({
    where: { id: rcA.id },
    data: { signTokenHash: tokA.tokenHash, signTokenId: tokA.tokenId, signTokenExpiresAt: tokA.expiresAt, signTokenUsedAt: null },
  });
  const signed = await fetch(BASE + "/rc-sign/" + tokA.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "signerName=Fan+Signer&attest=yes",
  });
  ok("the signature is accepted", signed.status === 200, "status=" + signed.status);
  // The fan-out is fire-and-forget, so give it a beat rather than racing it.
  await new Promise((r) => setTimeout(r, 900));
  const l3 = await prisma.load.findUniqueOrThrow({ where: { id: a.load.id }, select: { trackingLinkSent: true } });
  ok("the customer is told at the SIGNATURE", l3.trackingLinkSent === true,
    "the signature is the commitment; this is the moment the customer learns a carrier is on their load");

  // ── 2. auto-dispatch is not stranded ──
  console.log("\n[2] auto-dispatch still announces at accept");
  const b = await makeAccepted("FAN-AUTO");
  // The auto paths call the service directly at accept; this is that call.
  const res = await sendTrackingLinkToCrmContacts(b.load.id);
  const lb = await prisma.load.findUniqueOrThrow({ where: { id: b.load.id }, select: { trackingLinkSent: true } });
  ok("a load that never signs still gets its link out", lb.trackingLinkSent === true,
    "waterfall and loadboard dispatch without a signature; moving them to CONFIRMED would strand the customer entirely: " + JSON.stringify(res));

  // ── 3. once, not twice ──
  console.log("\n[3] a load that hits both triggers announces once");
  const again = await sendTrackingLinkToCrmContacts(b.load.id);
  ok("a second fan-out is skipped", (again as any).skipped === "already_sent",
    "an auto-dispatched load whose RC is later signed would hit both triggers; got " + JSON.stringify(again));
  ok("and sends nothing", (again as any).sent === 0, JSON.stringify(again));

  // ── 4. no accept path still announces ──
  console.log("\n[4] no direct accept path still fires it");
  const SRC = path.resolve(__dirname, "..", "src");
  const readSrc = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const rel of ["controllers/tenderController.ts", "controllers/withTenderController.ts"]) {
    ok(rel + " no longer announces at accept", !readSrc(rel).includes("sendTrackingLinkToCrmContacts"),
      "the direct paths announce at the signature now");
  }
  // And the auto paths must NOT have been swept up with them.
  for (const rel of ["services/waterfallEngineService.ts", "routes/loadBids.ts"]) {
    ok(rel + " still announces at accept", readSrc(rel).includes("sendTrackingLinkToCrmContacts"),
      "these dispatch without a signature; removing this strands the customer");
  }

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
  await prisma.customerContact.deleteMany({ where: { customerId: customer.id } }).catch(() => {});
  await prisma.customer.delete({ where: { id: customer.id } }).catch(() => {});
  await prisma.carrierProfile.deleteMany({ where: { companyName: { contains: String(stamp) } } });
  await prisma.staffSession.deleteMany({ where: { userId: { in: [ae.id, cu.id] } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ae.id, cu.id] } } }).catch(() => {});
  await prisma.auditTrail.deleteMany({ where: { userId: { in: [ae.id, cu.id] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: "-" + stamp + "@srl.invalid" } } });
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
