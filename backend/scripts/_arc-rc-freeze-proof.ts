/**
 * Commit-11b proof: issuing a rate confirmation freezes it.
 *
 * The claim under test is narrow and load-bearing. contentHash is only evidence
 * if the bytes it describes still exist and are what gets served back. PDFKit
 * output is not reproducible -- v3.8.awj got two different hashes for one
 * agreement at identical byte length -- so a hash over a re-render could never
 * re-verify, which is why CarrierAgreement hashes canonical text instead. The
 * rate confirmation can hash bytes ONLY because the bytes are stored.
 *
 * So the assertions that matter are: the stored object hashes to the recorded
 * hash, and the download endpoint returns THOSE bytes rather than a fresh
 * render that merely resembles them.
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

import crypto from "crypto";
import jwt from "jsonwebtoken";
import type { Server } from "http";

const PORT = 55931;
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
  const { getFileStream } = await import("../src/services/storageService");
  const express = (await import("express")).default;
  const cookieParser = (await import("cookie-parser")).default;
  const routes = (await import("../src/routes")).default;

  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use("/api", routes);
  const server: Server = await new Promise((r) => {
    const s = app.listen(PORT, "127.0.0.1", () => r(s));
  });
  console.log("app: real router mounted on :" + PORT + "\n");

  const stamp = Date.now();
  const ae = await prisma.user.create({
    data: { email: "rcf-ae-" + stamp + "@srl.invalid", passwordHash: "x", firstName: "R", lastName: "F", role: "ADMIN" },
  });
  const cu = await prisma.user.create({
    data: {
      email: "rcf-ca-" + stamp + "@srl.invalid", passwordHash: "x",
      firstName: "Frozen", lastName: "Co", role: "CARRIER", totpEnabled: true,
    },
  });
  const profile = await prisma.carrierProfile.create({
    data: { userId: cu.id, companyName: "RCF " + stamp },
  });

  const load = await prisma.load.create({
    data: {
      referenceNumber: "RCF-" + stamp, posterId: ae.id, status: "BOOKED", carrierId: cu.id,
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
      formData: { carrierName: "Frozen Co", lineHaulRate: 4100 } as any,
      carrierRate: 4100, totalCharges: 4100,
    },
  });

  const tok = jwt.sign({ userId: ae.id }, process.env.JWT_SECRET as string, { expiresIn: "1h" });
  registerSession(ae.id, tok, "AE");
  const send = () => fetch(BASE + "/rate-confirmations/" + rc.id + "/send", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: "srl_token_ae=" + tok },
    body: JSON.stringify({ recipientEmail: "rcf-ca-" + stamp + "@srl.invalid", recipientName: "Frozen Co" }),
  });

  console.log("[1] issuing freezes the document");
  const r1 = await send();
  ok("the send succeeds", r1.status === 200, "status=" + r1.status + " " + (await r1.clone().text()).slice(0, 200));

  const after = await prisma.rateConfirmation.findUniqueOrThrow({ where: { id: rc.id } });
  ok("status is SENT", after.status === "SENT");
  ok("a content hash was recorded", !!after.contentHash && /^[0-9a-f]{64}$/.test(after.contentHash));
  ok("the bytes were stored", !!after.pdfUrl, "without stored bytes the hash describes something nobody kept");
  ok("a signing token was minted", !!after.signTokenId && !!after.signTokenHash);
  ok("the token is unused", after.signTokenUsedAt === null);
  ok("the token expires", !!after.signTokenExpiresAt && after.signTokenExpiresAt > new Date());

  console.log("\n[2] the stored object IS what the hash describes");
  const chunks: Buffer[] = [];
  const stream = await getFileStream(after.pdfUrl as string);
  await new Promise<void>((res2, rej) => {
    stream.on("data", (c: Buffer) => chunks.push(c));
    stream.on("end", res2);
    stream.on("error", rej);
  });
  const storedHash = crypto.createHash("sha256").update(Buffer.concat(chunks)).digest("hex");
  ok("the stored bytes hash to the recorded hash", storedHash === after.contentHash,
    "stored=" + storedHash.slice(0, 16) + " recorded=" + String(after.contentHash).slice(0, 16));

  console.log("\n[3] download returns the frozen artifact, not a fresh render");
  const dl = await fetch(BASE + "/rate-confirmations/" + rc.id + "/pdf", { headers: { Cookie: "srl_token_ae=" + tok } });
  ok("the download succeeds", dl.status === 200, "status=" + dl.status);
  const dlHash = crypto.createHash("sha256").update(Buffer.from(await dl.arrayBuffer())).digest("hex");
  ok("the downloaded bytes are byte-identical to the stored ones", dlHash === after.contentHash,
    "a re-render would differ here even with identical content, because PDFKit output is not reproducible (v3.8.awj)");

  console.log("\n[4] the tender says the document is out");
  const t2 = await prisma.loadTender.findUniqueOrThrow({ where: { id: tender.id } });
  ok("the tender moved to RC_SENT", t2.status === "RC_SENT", "status=" + t2.status);
  ok("statusChangedAt was stamped", !!t2.statusChangedAt,
    "Needs Attention measures RC_SIGN_SLA_HOURS against this; without it an unsigned RC has nothing to age");
  const act = await prisma.loadActivity.findMany({ where: { tenderId: tender.id } });
  ok("the move left a history row", act.some((a) => JSON.stringify(a).includes("RC_SENT")), "rows=" + act.length);

  console.log("\n[5] a re-send supersedes the previous link");
  const r2 = await send();
  ok("the re-send succeeds", r2.status === 200, "status=" + r2.status);
  const after2 = await prisma.rateConfirmation.findUniqueOrThrow({ where: { id: rc.id } });
  ok("a fresh token replaced the old one", after2.signTokenHash !== after.signTokenHash,
    "the secret is unrecoverable from the hash, so the same link cannot be re-sent; minting again costs the carrier nothing because the DOCUMENT is untouched");
  ok("the re-send did not regenerate the document", after2.contentHash === after.contentHash,
    "same terms must mean the same bytes and the same hash");

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
