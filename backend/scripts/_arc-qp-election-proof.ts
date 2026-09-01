/**
 * Quick Pay election — provenance proof (Row 7a + the portal wiring).
 *
 * Run with the outbound keys EXPLICITLY EMPTY, not merely unset (§19
 * Sub-pattern 20 — dotenv fills an absent key from .env, which is how a guard
 * once reported "both absent" while holding the production key):
 *
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= S3_BUCKET_NAME= \
 *     DATABASE_URL=<local> DIRECT_URL=<local> npx tsx scripts/_arc-qp-election-proof.ts
 *
 * Asserts the SERVICE contract, which is what 7a shipped. The end-to-end
 * carrier-portal path is asserted by the E2E once 7b lands.
 */
import { prisma } from "../src/config/database";
import { record, voidForTender, liveElectionForTender } from "../src/services/quickPayElectionService";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log(`  ok   ${label}`); }
  else { fail++; console.log(`  FAIL ${label}${detail ? "  -- " + detail : ""}`); }
}

async function main() {
  const host = (process.env.DIRECT_URL ?? "").replace(/.*@/, "");
  console.log(`target: ${host}`);
  if (!/127\.0\.0\.1|localhost/.test(host)) {
    console.error("REFUSING: this proof writes rows and must run against a local container.");
    process.exit(1);
  }
  console.log(`Resend configured: ${Boolean(process.env.RESEND_API_KEY)}`);

  const stamp = Date.now();
  const user = await prisma.user.create({
    data: { email: `qpe-${stamp}@srl.invalid`, passwordHash: "x", firstName: "Q", lastName: "P", role: "CARRIER" },
    select: { id: true },
  });
  const profile = await prisma.carrierProfile.create({
    data: {
      userId: user.id, mcNumber: `MC-QPE${stamp}`, dotNumber: `${stamp}`.slice(-7),
      companyName: "QP Election Proof Carrier", contactName: "Q P", contactPhone: "(269) 555-0100",
      onboardingStatus: "APPROVED", status: "APPROVED", approvedAt: new Date(),
      tier: "GOLD", cppTier: "GOLD",
    },
    select: { id: true, tier: true },
  });
  const customer = await prisma.customer.create({
    data: { name: `QPE Cust ${stamp}`, email: `qpec-${stamp}@srl.invalid` },
    select: { id: true },
  });
  const load = await prisma.load.create({
    data: {
      loadNumber: `QPE-${stamp}`.slice(0, 20), referenceNumber: `QPE-${stamp}`.slice(0, 20),
      status: "BOOKED", customerId: customer.id, posterId: user.id, carrierId: user.id,
      originCity: "Lebanon", originState: "NH", originZip: "03766",
      destCity: "North Lake", destState: "TX", destZip: "76262",
      // Load.rate is REQUIRED by the schema and is the retired write-only mirror
      // of the customer rate (§13.3 Item 227). Written, never read.
      rate: 5100, customerRate: 5100, carrierRate: 4100,
      pickupDate: new Date(), deliveryDate: new Date(Date.now() + 86400000),
      equipmentType: "Reefer", commodity: "QPE-PROOF", weight: 28400,
    },
    select: { id: true },
  });
  const tender = await prisma.loadTender.create({
    data: { loadId: load.id, carrierId: profile.id, status: "ACCEPTED", offeredRate: 4100, expiresAt: new Date(Date.now() + 86400000) },
    select: { id: true },
  });

  console.log("\n[1] a carrier election records provenance");
  const r1 = await record({
    tenderId: tender.id, loadId: load.id, carrierProfileId: profile.id,
    speed: "SEVEN_DAY", tier: profile.tier, decidedVia: "PORTAL",
    signerIp: "203.0.113.9", signerUserAgent: "ProofAgent/1.0",
  });
  check("record() succeeds", r1.ok === true);
  const row1 = await prisma.quickPayElection.findFirst({ where: { tenderId: tender.id, status: "ELECTED" } });
  check("an ELECTED row exists", !!row1);
  check("speed is what was chosen", row1?.speed === "SEVEN_DAY", String(row1?.speed));
  // GOLD 7-day is 2% per the LOCKED §8 ladder. Asserted as a number so a
  // ladder change has to be a deliberate edit here too.
  check("fee is priced from the tier, not passed in", row1?.feePercent === 2, String(row1?.feePercent));
  check("channel recorded", row1?.decidedVia === "PORTAL");
  check("carrier decided, so no AE is named", row1?.decidedByUserId === null);
  check("ip captured", row1?.signerIp === "203.0.113.9");
  check("user agent captured", row1?.signerUserAgent === "ProofAgent/1.0");

  console.log("\n[2] re-election supersedes rather than duplicating");
  const r2 = await record({
    tenderId: tender.id, loadId: load.id, carrierProfileId: profile.id,
    speed: "SAME_DAY", tier: profile.tier, decidedVia: "PORTAL",
  });
  check("second record() succeeds", r2.ok === true);
  check("it reports superseding", r2.ok === true && r2.superseded === true);
  const live = await prisma.quickPayElection.count({ where: { tenderId: tender.id, status: "ELECTED" } });
  check("exactly ONE live election on the tender", live === 1, `found ${live}`);
  const voided = await prisma.quickPayElection.count({ where: { tenderId: tender.id, status: "VOIDED" } });
  check("the superseded row is VOIDED, not deleted", voided === 1, `found ${voided}`);
  const cur = await liveElectionForTender(tender.id);
  check("SAME_DAY on GOLD prices at 4 (2 + universal 2 premium)", cur?.feePercent === 4, String(cur?.feePercent));

  console.log("\n[3] ON_BEHALF without evidence is refused, and writes nothing");
  const before = await prisma.quickPayElection.count({ where: { tenderId: tender.id } });
  const r3 = await record({
    tenderId: tender.id, loadId: load.id, carrierProfileId: profile.id,
    speed: "SEVEN_DAY", tier: profile.tier, decidedVia: "ON_BEHALF", decidedByUserId: user.id,
  });
  check("refused", r3.ok === false);
  check("with the axq contract code", r3.ok === false && r3.code === "EVIDENCE_REQUIRED", r3.ok === false ? r3.code : "");
  check("naming both missing fields", r3.ok === false && (r3.details?.length ?? 0) === 2);
  const after = await prisma.quickPayElection.count({ where: { tenderId: tender.id } });
  check("no row was written", before === after, `${before} -> ${after}`);

  console.log("\n[4] evidence on a carrier-made election is refused");
  const r4 = await record({
    tenderId: tender.id, loadId: load.id, carrierProfileId: profile.id,
    speed: "SEVEN_DAY", tier: profile.tier, decidedVia: "PORTAL",
    evidenceType: "EMAIL_SUBJECT", evidenceRef: "RE: something",
  });
  check("refused", r4.ok === false && r4.code === "EVIDENCE_NOT_APPLICABLE");

  console.log("\n[5] ON_BEHALF WITH evidence records the AE as decider");
  const r5 = await record({
    tenderId: tender.id, loadId: load.id, carrierProfileId: profile.id,
    speed: "SEVEN_DAY", tier: profile.tier, decidedVia: "ON_BEHALF", decidedByUserId: user.id,
    evidenceType: "CALL_TIMESTAMP", evidenceRef: "2026-09-01T12:00:00Z",
  });
  check("accepted", r5.ok === true);
  const ob = await liveElectionForTender(tender.id);
  check("the AE is named", ob?.decidedByUserId === user.id);
  check("channel is ON_BEHALF", ob?.decidedVia === "ON_BEHALF");

  console.log("\n[6] voiding settles the election without deleting it");
  const n = await voidForTender(tender.id, "released");
  check("one row voided", n === 1, String(n));
  check("nothing live remains", (await liveElectionForTender(tender.id)) === null);
  const total = await prisma.quickPayElection.count({ where: { tenderId: tender.id } });
  check("the history survives", total >= 3, `${total} rows`);

  // Cleanup, so a re-run is not polluted by the last one (§ the dirty-database
  // lesson: stale rows make a correct fix look broken).
  await prisma.quickPayElection.deleteMany({ where: { tenderId: tender.id } });
  await prisma.loadTender.deleteMany({ where: { loadId: load.id } });
  await prisma.load.delete({ where: { id: load.id } });
  await prisma.carrierProfile.delete({ where: { id: profile.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
  await prisma.user.delete({ where: { id: user.id } });

  console.log(`\n${pass}/${pass + fail} passed`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
