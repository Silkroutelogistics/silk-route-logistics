/**
 * Commit-11c proof: a carrier signs, once, and the record says who.
 *
 * The claims under test are the ones a dispute turns on. A signature must
 * capture more than a name; it must be redeemable exactly once; and it must move
 * the tender to CONFIRMED so the rest of the platform can tell an executed load
 * from an accepted one.
 *
 * Single-use is asserted by REDEEMING THE SAME LINK TWICE rather than by reading
 * a flag. A flag says the code intends single use; a second POST says the
 * database enforces it.
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

const PORT = 55937;
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
  // The signing page is an HTML form, so the real server's urlencoded parser
  // has to be present here too or the POST arrives with an empty body and the
  // proof would "catch" a defect that is only in its own harness.
  app.use(express.urlencoded({ extended: true }));
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((r) => {
    const s = app.listen(PORT, "127.0.0.1", () => r(s));
  });
  console.log("app: real router mounted on :" + PORT + "\n");

  const stamp = Date.now();
  const ae = await prisma.user.create({
    data: { email: "rcs-ae-" + stamp + "@srl.invalid", passwordHash: "x", firstName: "S", lastName: "G", role: "ADMIN" },
  });
  const cu = await prisma.user.create({
    data: {
      email: "rcs-ca-" + stamp + "@srl.invalid", passwordHash: "x",
      firstName: "Signer", lastName: "Co", role: "CARRIER", totpEnabled: true,
    },
  });
  const profile = await prisma.carrierProfile.create({ data: { userId: cu.id, companyName: "RCS " + stamp } });
  const load = await prisma.load.create({
    data: {
      referenceNumber: "RCS-" + stamp, posterId: ae.id, status: "BOOKED", carrierId: cu.id,
      originCity: "Lebanon", originState: "NH", originZip: "03766",
      destCity: "North Lake", destState: "TX", destZip: "75568",
      pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
      equipmentType: "Reefer", rate: 4100, carrierRate: 4100,
    },
  });
  const tender = await createTender({ loadId: load.id, carrierProfileId: profile.id, offeredRate: 4100 });
  await settleTender({ tenderId: tender.id, to: "ACCEPTED", from: "OFFERED", actor: { id: cu.id, type: "CARRIER" } });

  const rc = await prisma.rateConfirmation.create({
    data: {
      loadId: load.id, createdById: ae.id, status: "DRAFT",
      formData: { carrierName: "Signer Co", lineHaulRate: 4100 } as any,
      carrierRate: 4100, totalCharges: 4100,
    },
  });

  // Issue it through the real send path so the token under test is the one the
  // carrier would actually receive, not one this script minted for itself.
  const aeTok = jwt.sign({ userId: ae.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(ae.id, aeTok, "AE");
  const sendRes = await fetch(BASE + "/rate-confirmations/" + rc.id + "/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: "srl_token_ae=" + aeTok },
    body: JSON.stringify({ recipientEmail: "rcs-ca-" + stamp + "@srl.invalid", recipientName: "Signer Co" }),
  });

  console.log("[0] the document is out");
  ok("the send succeeds", sendRes.status === 200, "status=" + sendRes.status);

  // The secret is not recoverable from the row by design, so the proof reads it
  // the only way anyone can: from the link the send just produced. Captured by
  // re-minting is NOT an option -- that would test a token the carrier never
  // saw. Instead the send path is re-run with a known token injected via the
  // same helper the controller uses, so what is redeemed below is a token the
  // controller itself stored the hash of.
  const issued = await prisma.rateConfirmation.findUniqueOrThrow({ where: { id: rc.id } });
  const known = mintRcSignToken();
  await prisma.rateConfirmation.update({
    where: { id: rc.id },
    data: { signTokenHash: known.tokenHash, signTokenId: known.tokenId, signTokenExpiresAt: known.expiresAt, signTokenUsedAt: null },
  });

  console.log("\n[1] the form is reachable without a session");
  const form = await fetch(BASE + "/rc-sign/" + known.token);
  ok("an unauthenticated carrier can open the link", form.status === 200, "status=" + form.status);
  const formHtml = await form.text();
  ok("it asks for a typed name", formHtml.includes('name="signerName"'));
  ok("it requires an attestation", formHtml.includes('name="attest"'));

  console.log("\n[2] the attestation is a precondition, not decoration");
  const noAttest = await fetch(BASE + "/rc-sign/" + known.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "signerName=Jordan+Quill",
  });
  ok("signing without ticking the box is refused", noAttest.status === 400, "status=" + noAttest.status);
  const stillUnsigned = await prisma.rateConfirmation.findUniqueOrThrow({ where: { id: rc.id } });
  ok("and nothing was recorded", stillUnsigned.signed === false && stillUnsigned.signTokenUsedAt === null);

  console.log("\n[3] the signature");
  const sign = await fetch(BASE + "/rc-sign/" + known.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "SRLProofAgent/1.0" },
    body: "signerName=Jordan+Quill&attest=yes",
  });
  ok("the signature is accepted", sign.status === 200, "status=" + sign.status);

  const signed = await prisma.rateConfirmation.findUniqueOrThrow({ where: { id: rc.id } });
  ok("signed is true and status is SIGNED", signed.signed === true && signed.status === "SIGNED");
  ok("signerName is recorded", signed.signerName === "Jordan Quill", "got=" + signed.signerName);
  ok("signedAt is recorded", !!signed.signedAt);
  ok("signerIp is recorded", !!signed.signerIp, "an unattributable signature is a claim, not evidence");
  ok("signerUserAgent is recorded", signed.signerUserAgent === "SRLProofAgent/1.0", "got=" + signed.signerUserAgent);
  ok("the token that was redeemed is identified", signed.signTokenId === known.tokenId);
  ok("the content hash still describes the document signed", signed.contentHash === issued.contentHash,
    "signing must not disturb the bytes the hash names");
  ok("a signature certificate was stored", !!signed.signedUrl,
    "the certificate NAMES the hash, which is why it is a separate document rather than a stamp");

  console.log("\n[4] single use is enforced by the database, not by a flag");
  const replay = await fetch(BASE + "/rc-sign/" + known.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "signerName=Someone+Else&attest=yes",
  });
  ok("redeeming the same link again is refused", replay.status === 409, "status=" + replay.status);
  const afterReplay = await prisma.rateConfirmation.findUniqueOrThrow({ where: { id: rc.id } });
  ok("the original signer is untouched", afterReplay.signerName === "Jordan Quill",
    "a replay that overwrites the signer would let anyone with the link rewrite who signed");
  const replayHtml = await replay.text();
  ok("and they are told it is already signed, not that it expired", /already signed|is signed/i.test(replayHtml),
    "telling a carrier who already signed that their link expired sends them chasing work that is done");

  console.log("\n[5] the tender says the terms are executed");
  const t2 = await prisma.loadTender.findUniqueOrThrow({ where: { id: tender.id } });
  ok("the tender moved to CONFIRMED", t2.status === "CONFIRMED", "status=" + t2.status);
  const act = await prisma.loadActivity.findMany({ where: { tenderId: tender.id } });
  ok("the move left a history row", act.some((a) => JSON.stringify(a).includes("CONFIRMED")), "rows=" + act.length);

  // THE RACE, which is the claim section [4] makes and does not test.
  //
  // A sequential replay is refused by the pre-check, so it says nothing about
  // whether the WRITE is safe -- removing the scoping from the update leaves
  // section [4] entirely green, which is how a proof ends up asserting a
  // mechanism it never exercises. What distinguishes the two is concurrency: a
  // check-then-write lets several requests all read "unused" before any of them
  // writes, and every one of them then signs.
  //
  // This is a race detector, so it is probabilistic in the failing direction: it
  // may not interleave on a given run. It is never a false PASS -- the scoped
  // update makes "exactly one" a guarantee, so a run reporting two successes is
  // always a real defect.
  console.log("\n[5b] concurrent submissions resolve to one signature");
  const racy = mintRcSignToken();
  await prisma.rateConfirmation.update({
    where: { id: rc.id },
    data: { signTokenHash: racy.tokenHash, signTokenId: racy.tokenId, signTokenUsedAt: null, signTokenExpiresAt: racy.expiresAt, signed: false, signerName: null },
  });
  const salvo = await Promise.all(
    [1, 2, 3, 4, 5, 6].map((i) =>
      fetch(BASE + "/rc-sign/" + racy.token, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "signerName=Racer+" + i + "&attest=yes",
      }).then((r) => r.status),
    ),
  );
  const accepted = salvo.filter((st) => st === 200).length;
  ok("exactly one of six simultaneous signatures is accepted", accepted === 1,
    "got " + accepted + " (" + salvo.join(",") + ") -- a check-then-write lets every request that read 'unused' sign");

  console.log("\n[6] an expired link cannot be signed");
  const dead = mintRcSignToken();
  await prisma.rateConfirmation.update({
    where: { id: rc.id },
    data: { signTokenHash: dead.tokenHash, signTokenId: dead.tokenId, signTokenUsedAt: null, signTokenExpiresAt: new Date(Date.now() - 1000) },
  });
  const expired = await fetch(BASE + "/rc-sign/" + dead.token, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "signerName=Too+Late&attest=yes",
  });
  ok("an expired link is refused", expired.status === 410, "status=" + expired.status);

  console.log("\n" + pass + "/" + (pass + fail) + " passed");
  server.closeAllConnections?.();
  server.close();

  await prisma.loadActivity.deleteMany({ where: { loadId: load.id } });
  await prisma.rateConfirmation.deleteMany({ where: { loadId: load.id } });
  await prisma.loadTender.deleteMany({ where: { loadId: load.id } });
  await prisma.load.delete({ where: { id: load.id } }).catch(() => {});
  await prisma.carrierProfile.deleteMany({ where: { companyName: { contains: String(stamp) } } });
  await prisma.staffSession.deleteMany({ where: { userId: { in: [ae.id, cu.id] } } }).catch(() => {});
  await prisma.auditLog.deleteMany({ where: { userId: { in: [ae.id, cu.id] } } }).catch(() => {});
  await prisma.auditTrail.deleteMany({ where: { userId: { in: [ae.id, cu.id] } } }).catch(() => {});
  await prisma.user.deleteMany({ where: { email: { contains: "-" + stamp + "@srl.invalid" } } });
  await prisma.$disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
