/**
 * B11 — the countersignature, proved against a real database.
 *
 * Not a unit test with a mocked Prisma: the properties here are about COLUMNS
 * and about a hash taken over what those columns say, and a mock has neither.
 * Runs against a throwaway container, never production — the URL is asserted
 * local before anything is written.
 *
 * Outbound keys must be explicitly EMPTY (§19 Sub-pattern 20).
 */
import * as crypto from "crypto";
import { PrismaClient } from "@prisma/client";
import { agreementContentHash } from "../src/lib/canonicalAgreementText";
import {
  BROKER_CARRIER_AGREEMENT, CARAVAN_QUICK_PAY_AGREEMENT, BCA_VERSION, QP_VERSION,
} from "../src/data/agreements";
import { SIGNATORY_NAME, SIGNATORY_TITLE } from "../src/config/authority";
import { generateAgreementBuffer } from "../src/services/agreementPdfService";

for (const k of ["RESEND_API_KEY", "OPENPHONE_API_KEY", "QUO_API_KEY", "S3_BUCKET_NAME"]) {
  if (process.env[k] !== "") {
    console.error("REFUSING: " + k + " must be explicitly EMPTY");
    process.exit(1);
  }
}
const DB = process.env.DATABASE_URL ?? "";
if (!/@(localhost|127\.0\.0\.1):/.test(DB)) {
  console.error("REFUSING: DATABASE_URL is not local");
  process.exit(1);
}

const prisma = new PrismaClient();
let pass = 0;
let fail = 0;
function ok(c: boolean, m: string): void {
  if (c) { pass++; console.log("  PASS  " + m); } else { fail++; console.log("  FAIL  " + m); }
}
const uniq = crypto.randomBytes(4).toString("hex");

async function main(): Promise<void> {
  const user = await prisma.user.create({
    data: {
      email: "b11-" + uniq + "@srl.invalid", passwordHash: "x", role: "CARRIER",
      firstName: "Luis", lastName: "Ortega", phone: "+1269555" + uniq.slice(0, 4),
    },
  });
  const profile = await prisma.carrierProfile.create({
    data: {
      userId: user.id, companyName: "Blackwater Trucking LLC",
      mcNumber: "MC-" + uniq, dotNumber: "DOT-" + uniq,
      onboardingStatus: "APPROVED", status: "APPROVED",
    },
  });

  const now = new Date("2026-09-04T14:05:00.000Z");
  const identity = {
    legalName: profile.companyName, mcNumber: profile.mcNumber as string,
    dotNumber: profile.dotNumber as string,
  };
  const countersign = { name: SIGNATORY_NAME, title: SIGNATORY_TITLE, at: now };
  const bcaSig = {
    signedByName: "Luis Ortega", signedByTitle: "Owner", signedAt: now,
    signerIp: "203.0.113.44", version: BCA_VERSION, consentAt: now,
  };

  console.log("");
  console.log("[1] BCA — the countersign is written and round-trips");
  const bcaHash = agreementContentHash(BROKER_CARRIER_AGREEMENT, { carrier: identity, signature: bcaSig, countersign });
  const bca = await prisma.carrierAgreement.create({
    data: {
      carrierId: profile.id, version: BCA_VERSION, templateName: "broker-carrier",
      status: "SIGNED", contentHash: bcaHash, signedAt: now,
      signedByName: bcaSig.signedByName, signedByTitle: bcaSig.signedByTitle,
      signatureData: bcaSig.signedByName, signerIp: bcaSig.signerIp,
      signerUserAgent: "proof", consentAt: now,
      counterSignedByName: countersign.name, counterSignedByTitle: countersign.title,
      counterSignedAt: now,
    },
  });
  const row = await prisma.carrierAgreement.findUniqueOrThrow({ where: { id: bca.id } });
  ok(row.counterSignedByName === SIGNATORY_NAME, "counterSignedByName round-trips as the officer");
  ok(row.counterSignedByTitle === SIGNATORY_TITLE, "counterSignedByTitle round-trips");
  ok(row.counterSignedAt !== null && row.counterSignedAt.toISOString() === now.toISOString(), "counterSignedAt round-trips");

  console.log("");
  console.log("[2] THE COUNTERSIGN IS NOT IN A CARRIER COLUMN");
  ok(row.signedByName === "Luis Ortega", "signedByName is the CARRIER, not SRL");
  ok(row.signedByTitle === "Owner", "signedByTitle is the CARRIER title");
  ok(row.signatureData === "Luis Ortega", "signatureData is the CARRIER typed name");
  ok(row.signedByName !== SIGNATORY_NAME, "the broker name did NOT land on the carrier line");

  console.log("");
  console.log("[3] THE HASH ACTUALLY COVERS IT");
  const without = agreementContentHash(BROKER_CARRIER_AGREEMENT, { carrier: identity, signature: bcaSig });
  ok(row.contentHash === bcaHash, "the stored hash is the one taken WITH the countersign");
  ok(row.contentHash !== without, "and it differs from the hash taken without it");
  const tampered = agreementContentHash(BROKER_CARRIER_AGREEMENT, {
    carrier: identity, signature: bcaSig,
    countersign: { name: "Someone Else", title: SIGNATORY_TITLE, at: now },
  });
  ok(tampered !== bcaHash, "changing the countersigner changes the hash");

  console.log("");
  console.log("[4] QUICK PAY countersigns separately");
  const qpSig = Object.assign({}, bcaSig, { version: QP_VERSION });
  const qpHash = agreementContentHash(CARAVAN_QUICK_PAY_AGREEMENT, { carrier: identity, signature: qpSig, countersign });
  const qp = await prisma.carrierAgreement.create({
    data: {
      carrierId: profile.id, version: QP_VERSION, templateName: "quick-pay",
      status: "SIGNED", contentHash: qpHash, signedAt: now,
      signedByName: qpSig.signedByName, signedByTitle: qpSig.signedByTitle,
      signatureData: qpSig.signedByName, signerIp: qpSig.signerIp,
      signerUserAgent: "proof", consentAt: now,
      counterSignedByName: countersign.name, counterSignedByTitle: countersign.title,
      counterSignedAt: now,
    },
  });
  const qpRow = await prisma.carrierAgreement.findUniqueOrThrow({ where: { id: qp.id } });
  ok(qpRow.counterSignedByName === SIGNATORY_NAME, "the Quick Pay row is countersigned too");
  ok(qpRow.contentHash !== row.contentHash, "the two instruments hash differently");

  console.log("");
  console.log("[5] A PRE-B8 ROW STAYS NULL AND KEEPS ITS HASH");
  const legacySig = Object.assign({}, bcaSig, { version: "2026-06-27-v1" });
  const legacyHash = agreementContentHash(BROKER_CARRIER_AGREEMENT, { carrier: identity, signature: legacySig });
  const legacy = await prisma.carrierAgreement.create({
    data: {
      carrierId: profile.id, version: "2026-06-27-v1", templateName: "broker-carrier",
      status: "SIGNED", contentHash: legacyHash, signedAt: now,
      signedByName: "Luis Ortega", signatureData: "Luis Ortega",
      signerIp: "203.0.113.44", signerUserAgent: "proof",
    },
  });
  const legacyRow = await prisma.carrierAgreement.findUniqueOrThrow({ where: { id: legacy.id } });
  ok(legacyRow.counterSignedByName === null, "a pre-B8 row is NULL, not backfilled");
  ok(legacyRow.contentHash === legacyHash, "and its stored hash is untouched");

  console.log("");
  console.log("[6] BOTH DOCUMENTS RENDER, EXECUTED AND UNSIGNED");
  const renders: Array<[string, Buffer]> = [
    ["BCA executed", await generateAgreementBuffer(BROKER_CARRIER_AGREEMENT, { carrier: identity, signature: bcaSig, countersign })],
    ["QP executed", await generateAgreementBuffer(CARAVAN_QUICK_PAY_AGREEMENT, { carrier: identity, signature: qpSig, countersign })],
    ["BCA specimen", await generateAgreementBuffer(BROKER_CARRIER_AGREEMENT, { shell: true })],
  ];
  const pdfParse = (await import("pdf-parse")).default as any;
  for (const entry of renders) {
    const label = entry[0];
    const text = String((await pdfParse(entry[1])).text);
    ok(text.length > 2000, label + ": extractor produced text (self-test)");
    ok(text.indexOf(SIGNATORY_NAME) >= 0, label + ": names the broker signatory");
    ok(text.indexOf(SIGNATORY_TITLE) >= 0, label + ": names the broker title");
    if (label.indexOf("executed") >= 0) {
      ok(text.indexOf("Countersigned for Silk Route Logistics Inc.") >= 0, label + ": carries the countersign line");
      ok(text.indexOf("2026-09-04T14:05:00.000Z") >= 0, label + ": carries the countersign ISO instant");
    } else {
      ok(text.indexOf("Countersigned for") < 0, label + ": an unsigned specimen carries NO countersign");
      ok(text.indexOf("Upon execution") >= 0, label + ": effective date reads Upon execution, not blank");
    }
  }

  await prisma.carrierAgreement.deleteMany({ where: { carrierId: profile.id } });
  await prisma.carrierProfile.delete({ where: { id: profile.id } });
  await prisma.user.delete({ where: { id: user.id } });
}

main()
  .then(async () => {
    console.log("");
    console.log(pass + "/" + (pass + fail) + " assertions passed");
    await prisma.$disconnect();
    process.exit(fail ? 1 : 0);
  })
  .catch(async (e) => {
    console.error("THREW: " + (e && e.message ? e.message : e));
    await prisma.$disconnect();
    process.exit(1);
  });
