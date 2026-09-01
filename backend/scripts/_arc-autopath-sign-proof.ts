/**
 * Commit-12c proof: an auto-dispatched load reaches CONFIRMED, and its customer
 * is told at the signature rather than at the accept.
 *
 * WHY THIS COULD NOT SIMPLY BE "MOVE THE NOTIFICATION". Before this commit the
 * waterfall issued no rate confirmation at all and the loadboard-bid path
 * drafted one and stopped, so no signing link ever reached the carrier. Moving
 * the announcement to CONFIRMED would have stranded every auto-dispatched
 * customer, because CONFIRMED was unreachable. The fix is that those paths now
 * ISSUE the document; the notification move is downstream of that.
 *
 * Both halves are asserted, and the second is the one that matters. A carrier
 * who signs gets the customer told once. A carrier who does NOT sign must leave
 * the load in a visible, chaseable state — RC_SENT with a Needs Attention row —
 * rather than a load that looks finished and is not.
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

import fs from "fs";
import path from "path";
import jwt from "jsonwebtoken";
import type { Server } from "http";

const PORT = 55953;
const BASE = "http://127.0.0.1:" + PORT + "/api";

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log("  PASS  " + n); }
  else { fail++; console.log("  FAIL  " + n + (d ? "  -- " + d : "")); }
};

async function main() {
  const { prisma } = await import("../src/config/database");
  const { registerSession } = await import("../src/middleware/auth");
  const { mintRcSignToken } = await import("../src/lib/rcSignToken");
  const { loadsNeedingAttention } = await import("../src/services/needsAttentionService");
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
    data: { email: "ap-ae-" + stamp + "@srl.invalid", passwordHash: "x", firstName: "A", lastName: "P", role: "ADMIN" },
  });
  const cu = await prisma.user.create({
    data: {
      email: "ap-ca-" + stamp + "@srl.invalid", passwordHash: "x",
      firstName: "Auto", lastName: "Co", role: "CARRIER", totpEnabled: true,
    },
  });
  // A carrier the compliance gate will actually pass. The first version of
  // this fixture omitted approval, tier, equipment, regions and the BCA, and
  // acceptPosition correctly SKIPPED the position — the tender came back
  // WITHDRAWN and the failure looked like a code defect when it was the gate
  // doing its job. Mirrors the Arc 17 waterfall-flight fixture.
  const profile = await prisma.carrierProfile.create({
    data: {
      userId: cu.id, companyName: "AP " + stamp,
      contactEmail: "desk-" + stamp + "@srl.invalid",
      mcNumber: "MC-AP-" + String(stamp).slice(-8),
      dotNumber: String(stamp).slice(-7),
      onboardingStatus: "APPROVED", status: "APPROVED",
      // cppTier is not decoration: scoring filters on it and it defaults to
      // GUEST, which makes a carrier invisible to the waterfall.
      cppTier: "SILVER", tier: "SILVER",
      equipmentTypes: ["REEFER"],
      operatingRegions: ["Northeast", "Southwest"],
    },
  });
  await prisma.carrierAgreement.create({
    data: {
      carrierId: profile.id, templateName: "broker-carrier", version: "autopath-proof",
      status: "SIGNED", signedAt: new Date(), signedByName: "Auto Co",
    },
  });
  const customer = await prisma.customer.create({ data: { name: "Autopath Customer " + stamp } });
  await prisma.customerContact.create({
    data: { customerId: customer.id, name: "Ops", email: "ops-" + stamp + "@srl.invalid", receivesTrackingLink: true },
  });

  /** A load with a live waterfall sitting on a tendered position for our carrier. */
  async function makeWaterfallLoad(ref: string) {
    const load = await prisma.load.create({
      data: {
        referenceNumber: ref + "-" + stamp, posterId: ae.id, status: "TENDERED",
        customerId: customer.id,
        trackingToken: (stamp + Math.random().toString(36).slice(2)).slice(-12),
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "75568",
        pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
        equipmentType: "REEFER", rate: 5100, customerRate: 5100, carrierRate: 4100,
      },
    });
    madeLoads.push(load.id);
    const wf = await prisma.waterfall.create({
      data: { loadId: load.id, mode: "full_auto", status: "active", totalPositions: 1, currentPosition: 1, createdById: ae.id },
    });
    const pos = await prisma.waterfallPosition.create({
      data: {
        waterfallId: wf.id, carrierId: cu.id, position: 1, status: "tendered",
        offeredRate: 4100, tenderSentAt: new Date(), tenderExpiresAt: new Date(Date.now() + 36e5),
      },
    });
    const { createTender } = await import("../src/services/tenderCreationService");
    const tender = await createTender({
      loadId: load.id, carrierProfileId: profile.id, offeredRate: 4100, waterfallPositionId: pos.id,
    });
    return { load, wf, pos, tender };
  }

  const aeTok = jwt.sign({ userId: ae.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(ae.id, aeTok, "AE");
  const caTok = jwt.sign({ userId: cu.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(cu.id, caTok, "CARRIER");

  const acceptPosition = (positionId: string) =>
    fetch(BASE + "/waterfalls/tenders/" + positionId + "/accept", {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: "srl_token_carrier=" + caTok },
    });

  /* ── 1. accept issues a document ─────────────────────────────────────── */
  console.log("[1] a waterfall accept now issues a rate confirmation");
  const a = await makeWaterfallLoad("AP-SIGN");
  const acc = await acceptPosition(a.pos.id);
  ok("the carrier can accept", acc.status === 200, "status=" + acc.status);
  await new Promise((r) => setTimeout(r, 1200)); // the issue is fire-and-forget

  const rcA = await prisma.rateConfirmation.findFirst({
    where: { loadId: a.load.id }, orderBy: { createdAt: "desc" },
  });
  ok("a rate confirmation exists", !!rcA,
    "before this commit the waterfall generated none at all, so a signature was impossible rather than late");
  ok("and it was ISSUED, not left as a draft", rcA?.status === "SENT", "status=" + rcA?.status);
  ok("with a live signing token", !!rcA?.signTokenHash && !!rcA?.signTokenExpiresAt);
  ok("and frozen bytes to sign", !!rcA?.contentHash && !!rcA?.pdfUrl);

  const tA = await prisma.loadTender.findUniqueOrThrow({ where: { id: a.tender.id } });
  ok("the tender sits at RC_SENT", tA.status === "RC_SENT", "status=" + tA.status);

  const l1 = await prisma.load.findUniqueOrThrow({ where: { id: a.load.id }, select: { trackingLinkSent: true } });
  ok("the customer has NOT been told yet", l1.trackingLinkSent !== true,
    "an accept without a signature is not a commitment, on this path either");

  /* ── 2. signing confirms, and tells the customer once ────────────────── */
  console.log("\n[2] signing confirms the load and announces once");
  const tok = mintRcSignToken();
  await prisma.rateConfirmation.update({
    where: { id: rcA!.id },
    data: { signTokenHash: tok.tokenHash, signTokenId: tok.tokenId, signTokenExpiresAt: tok.expiresAt, signTokenUsedAt: null },
  });
  const signed = await fetch(BASE + "/rc-sign/" + tok.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "signerName=Auto+Signer&attest=yes",
  });
  ok("the signature is accepted", signed.status === 200, "status=" + signed.status);
  await new Promise((r) => setTimeout(r, 1200));

  const tA2 = await prisma.loadTender.findUniqueOrThrow({ where: { id: a.tender.id } });
  ok("the tender reaches CONFIRMED", tA2.status === "CONFIRMED", "status=" + tA2.status);
  const l2 = await prisma.load.findUniqueOrThrow({ where: { id: a.load.id }, select: { trackingLinkSent: true } });
  ok("and NOW the customer is told", l2.trackingLinkSent === true);

  // Fired ONCE. The auto path used to announce at accept and the signature path
  // announces at CONFIRMED; a load hitting both must not mail the customer twice.
  const { sendTrackingLinkToCrmContacts } = await import("../src/services/shipperLoadNotifyService");
  const again = await sendTrackingLinkToCrmContacts(a.load.id);
  ok("a second announcement is refused", (again as { skipped?: string }).skipped === "already_sent",
    JSON.stringify(again));

  /* ── 3. abandoning leaves a chaseable state ──────────────────────────── */
  console.log("\n[3] a carrier who abandons leaves a chaseable load, not a silent one");
  const b = await makeWaterfallLoad("AP-ABANDON");
  const accB = await acceptPosition(b.pos.id);
  ok("the carrier accepts", accB.status === 200, "status=" + accB.status);
  await new Promise((r) => setTimeout(r, 1200));

  const tB = await prisma.loadTender.findUniqueOrThrow({ where: { id: b.tender.id } });
  ok("the tender is parked at RC_SENT", tB.status === "RC_SENT", "status=" + tB.status);
  const lB = await prisma.load.findUniqueOrThrow({ where: { id: b.load.id }, select: { trackingLinkSent: true } });
  ok("the customer is NOT told", lB.trackingLinkSent !== true,
    "announcing an unsigned carrier is what this whole change exists to stop");

  // Age it past the SLA so Needs Attention has something to find, then confirm
  // the queue surfaces it. Without this the load is invisible and the change
  // would have traded a wrong announcement for a silent stall.
  await prisma.loadTender.update({
    where: { id: b.tender.id },
    data: { statusChangedAt: new Date(Date.now() - 9 * 3600_000) },
  });
  const attention = await loadsNeedingAttention(500);
  const row = attention.find((x: { loadId: string }) => x.loadId === b.load.id);
  ok("Needs Attention surfaces the unsigned load", !!row,
    "an abandoned signature must be chaseable, or the load simply stalls");
  ok("and says why", !!row && row.reasons.includes("RC_UNSIGNED_PAST_SLA"),
    "reasons=" + JSON.stringify(row?.reasons));

  /* ── 4. no auto path still announces at accept ───────────────────────── */
  console.log("\n[4] neither auto path announces at accept any more");
  const SRC = path.resolve(__dirname, "..", "src");
  const readSrc = (rel: string) => fs.readFileSync(path.join(SRC, rel), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
  for (const rel of ["services/waterfallEngineService.ts", "routes/loadBids.ts"]) {
    ok(rel + " no longer announces at accept", !readSrc(rel).includes("sendTrackingLinkToCrmContacts"));
    ok(rel + " issues the rate confirmation instead", readSrc(rel).includes("autoIssueRateConfirmation"),
      "without issuing, CONFIRMED is unreachable and the customer is stranded");
  }

  console.log("\n" + pass + "/" + (pass + fail) + " passed");
  server.closeAllConnections?.();
  server.close();

  for (const id of madeLoads) {
    await prisma.loadActivity.deleteMany({ where: { loadId: id } });
    await prisma.rateConfirmation.deleteMany({ where: { loadId: id } });
    await prisma.loadTender.deleteMany({ where: { loadId: id } });
    await prisma.waterfallPosition.deleteMany({ where: { waterfall: { loadId: id } } }).catch(() => {});
    await prisma.waterfall.deleteMany({ where: { loadId: id } }).catch(() => {});
    await prisma.shipment.deleteMany({ where: { loadId: id } }).catch(() => {});
    await prisma.checkCallSchedule.deleteMany({ where: { loadId: id } }).catch(() => {});
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
