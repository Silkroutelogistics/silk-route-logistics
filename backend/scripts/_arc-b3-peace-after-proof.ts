/**
 * Lifecycle-gaps B3 halt — Peace Transport "after", computed by the REAL code
 * on a container seeded to production's exact shape, never by writing to
 * production.
 *
 * Production (read-only census, 2026-09-19): GUEST tier, APPROVED, not a test
 * account, eldEnabled false; ONE tender, ACCEPTED, on SRL-121492 at BOOKED;
 * zero check-call schedules; zero delivered loads; zero fall-offs; the only
 * persisted scorecard is the approval seed (88 / acceptance 100 /
 * communication 80 / docs 80).
 *
 * Wasi's planned action: flip SRL-121492 to TONU (fault CUSTOMER), then edit
 * the TONU accessorial to $250. This proof runs both through the real paths
 * (both money legs of the edit asserted: the carrier payable and the customer
 * DRAFT invoice) and then the real recalc, and runs the same shape through CANCELLED so the
 * two terminal states can be compared factor by factor.
 *
 * Refuses a non-local DATABASE_URL: it writes and deletes rows.
 */
import { prisma } from "../src/config/database";
import { createTender } from "../src/services/tenderCreationService";
import { assignCarrier } from "../src/services/carrierAssignmentService";
import { updateLoadStatus } from "../src/controllers/loadController";
import { makeCaptureRes } from "../src/lib/captureResponse";
import { recalculateCarrierCPP, syncCarrierPayAccessorials } from "../src/services/integrationService";
import { syncInvoiceAccessorials } from "../src/services/invoiceService";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
  process.exit(1);
}
let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d?: string) => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  — " + d : ""}`); }
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const FACTORS = ["onTimePickupPct", "onTimeDeliveryPct", "communicationScore", "claimRatio", "documentSubmissionTimeliness", "acceptanceRate", "gpsCompliancePct", "overallScore"] as const;

async function main() {
  const stamp = Date.now().toString(36);
  const poster = await prisma.user.create({
    data: { email: `pa-p-${stamp}@srl.invalid`, passwordHash: "x", firstName: "A", lastName: "E", role: "BROKER" },
  });

  async function carrier(tag: string) {
    const cu = await prisma.user.create({
      data: { email: `pa-c-${tag}-${stamp}@srl.invalid`, passwordHash: "x", firstName: "P", lastName: "T", role: "CARRIER", company: `PEACE ${tag} ${stamp}` },
    });
    const profile = await prisma.carrierProfile.create({
      data: { userId: cu.id, companyName: `PEACE ${tag} ${stamp}`, onboardingStatus: "APPROVED", tier: "GUEST", cppTier: "GUEST", eldEnabled: false },
    });
    const load = await prisma.load.create({
      data: {
        referenceNumber: `PA-${stamp}-${tag}`, posterId: poster.id, status: "BOOKED",
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "75568",
        pickupDate: new Date(Date.now() + 864e5), deliveryDate: new Date(Date.now() + 2 * 864e5),
        equipmentType: "Reefer", rate: 5100, carrierRate: 4100, dispatchMethod: "loadboard",
      },
    });
    const t = await createTender({ loadId: load.id, carrierProfileId: profile.id, offeredRate: 4100 });
    await prisma.loadTender.update({ where: { id: t.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });
    await assignCarrier({ loadId: load.id, carrierUserId: cu.id, status: "BOOKED", carrierRate: 4100 });
    return { cu, profile, load };
  }
  const latestCard = (profileId: string) =>
    prisma.carrierScorecard.findFirst({ where: { carrierId: profileId }, orderBy: { calculatedAt: "desc" } });
  const flip = async (loadId: string, body: Record<string, unknown>) => {
    const { shim, state } = makeCaptureRes();
    await updateLoadStatus({ params: { id: loadId }, body, user: { id: poster.id, email: poster.email, role: "BROKER" }, ip: "127.0.0.1", headers: {} } as any, shim);
    return state;
  };

  console.log("\n── A. today's shape: BOOKED, one ACCEPTED tender, nothing else ──");
  const A = await carrier("today");
  ok("recalc writes for a GUEST carrier below the promotion band", (await recalculateCarrierCPP(A.profile.id)) === "written");
  const cardA = (await latestCard(A.profile.id))!;
  console.log("   scorecard:", Object.fromEntries(FACTORS.map((f) => [f, cardA[f]])));
  ok("acceptance 100 — the one tender is ACCEPTED", cardA.acceptanceRate === 100);
  ok("communication is the 0 sentinel — no call was ever judged", cardA.communicationScore === 0);
  ok("on-time and docs are the 0 sentinel — no delivered load", cardA.onTimePickupPct === 0 && cardA.onTimeDeliveryPct === 0 && cardA.documentSubmissionTimeliness === 0);

  console.log("\n── B. after Wasi's action: TONU, fault CUSTOMER, then the $250 edit ──");
  const B = await carrier("tonu");
  const sB = await flip(B.load.id, { status: "TONU", tonuFaultSide: "CUSTOMER" });
  ok("the TONU flip is accepted", sB.statusCode === 200, `status=${sB.statusCode} ${JSON.stringify(sB.body).slice(0, 120)}`);
  await sleep(1500); // the reversal + payable are fire-and-forget after the flip
  const tonuRow = await prisma.loadAccessorial.findFirst({ where: { loadId: B.load.id, type: "TONU" } });
  ok("the ledger mints the $200 TONU obligation, billed to SHIPPER", !!tonuRow && Number(tonuRow.amount) === 200 && tonuRow.billedTo === "SHIPPER");
  const payB = await prisma.carrierPay.findFirst({ where: { loadId: B.load.id }, orderBy: { createdAt: "desc" } });
  ok("the carrier payable is raised at $200, status PREPARED (open, not committed)", !!payB && payB.status === "PREPARED" && payB.amount === 200, `status=${payB?.status} amount=${payB?.amount}`);
  const tenderB = await prisma.loadTender.findFirst({ where: { loadId: B.load.id } });
  ok("the accepted tender is untouched by the TONU (only live offers are withdrawn)", tenderB?.status === "ACCEPTED");

  // The customer leg at the flip: raiseTonuCustomerCharge creates the empty
  // DRAFT BASE invoice and syncInvoiceAccessorials folds the $200 row into it,
  // stamping shipperInvoiceId on the row (exactly-once by MARKING, Item 205).
  const invB = await prisma.invoice.findFirst({ where: { loadId: B.load.id, invoiceKind: "BASE", status: { not: "VOID" } }, include: { lineItems: true } });
  ok("the customer charge is raised as a DRAFT BASE invoice carrying the $200 TONU line", !!invB && invB.status === "DRAFT" && Number(invB.accessorialsAmount) === 200 && invB.lineItems.some((li) => Number(li.amount) === 200), `status=${invB?.status} acc=${invB?.accessorialsAmount} lines=${invB?.lineItems.map((l) => l.amount).join(",")}`);
  const stamped = await prisma.loadAccessorial.findUnique({ where: { id: tonuRow!.id }, select: { shipperInvoiceId: true } });
  ok("and the TONU ledger row is stamped with that invoice", !!invB && stamped?.shipperInvoiceId === invB.id);

  // The planned edit: PUT /api/load-accessorials/item/:id with amount 250 on
  // the APPROVED row runs the update and then BOTH money-path syncs
  // (routes/loadAccessorials.ts:177 → pushAccessorialToMoneyPaths). No frontend
  // calls this route with an amount; the edit is an API call.
  await prisma.loadAccessorial.update({ where: { id: tonuRow!.id }, data: { amount: 250, notes: "Agreed by phone at $250 before the policy figure was known." } });
  await syncCarrierPayAccessorials(B.load.id);
  await syncInvoiceAccessorials(B.load.id);
  const payB2 = await prisma.carrierPay.findFirst({ where: { loadId: B.load.id }, orderBy: { createdAt: "desc" } });
  const queued = await prisma.approvalQueue.count({ where: { referenceId: payB!.id, referenceType: "CARRIER_PAY" } });
  ok("the $250 edit RE-PRICES the PREPARED payable in place — same row, amount 250", payB2?.id === payB?.id && payB2?.amount === 250 && payB2?.accessorialsTotal === 250, `amount=${payB2?.amount} total=${payB2?.accessorialsTotal}`);
  ok("and escalates nothing — no ApprovalQueue row", queued === 0, `queued=${queued}`);
  // The carrier leg reconciles TOTALS, so it follows the edit. The customer leg
  // marks ROWS — and until 282c (v3.8.bdx) a marked row was invisible to the
  // sync, so this assertion was named FINDING and asserted $200. Now the sync
  // re-reads the draft's stamped lines against the ledger (repriceDraftInvoice)
  // and the line follows the edit, keyed by InvoiceLineItem.accessorialId (282a).
  const invB2 = await prisma.invoice.findUnique({ where: { id: invB!.id }, include: { lineItems: true } });
  ok("the customer invoice line FOLLOWS the edit — $250, matching the carrier payable (282c; was the FINDING)", !!invB2 && Number(invB2.accessorialsAmount) === 250 && Number(invB2.totalAmount) === 250 && invB2.lineItems.length === 1 && Number(invB2.lineItems[0].amount) === 250 && invB2.lineItems[0].accessorialId === tonuRow!.id, `acc=${invB2?.accessorialsAmount} total=${invB2?.totalAmount} lines=${invB2?.lineItems.map((l) => `${l.amount}@${l.accessorialId}`).join(",")}`);

  ok("recalc writes after the TONU", (await recalculateCarrierCPP(B.profile.id)) === "written");
  const cardB = (await latestCard(B.profile.id))!;
  console.log("   scorecard:", Object.fromEntries(FACTORS.map((f) => [f, cardB[f]])));
  ok("acceptance still 100 — the TONU does not touch the tender's classification", cardB.acceptanceRate === 100);
  ok("communication still the 0 sentinel — the TONU adds no judged call", cardB.communicationScore === 0);
  ok("on-time still the 0 sentinel — a TONU load is not a delivered load", cardB.onTimePickupPct === 0 && cardB.onTimeDeliveryPct === 0);
  ok("every factor identical to the BOOKED shape", FACTORS.every((f) => cardA[f] === cardB[f]), FACTORS.filter((f) => cardA[f] !== cardB[f]).join(","));

  console.log("\n── C. the same shape CANCELLED (shipper fault) — is a TONU treated differently anywhere in recalc? ──");
  const C = await carrier("cancel");
  const sC = await flip(C.load.id, { status: "CANCELLED", cancellationReasonCode: "SHIPPER_FREIGHT_NOT_READY" });
  ok("the cancel is accepted", sC.statusCode === 200);
  await sleep(1500);
  ok("recalc writes after the cancel", (await recalculateCarrierCPP(C.profile.id)) === "written");
  const cardC = (await latestCard(C.profile.id))!;
  console.log("   scorecard:", Object.fromEntries(FACTORS.map((f) => [f, cardC[f]])));
  ok("TONU and CANCELLED produce the same scorecard, factor for factor", FACTORS.every((f) => cardB[f] === cardC[f]), FACTORS.filter((f) => cardB[f] !== cardC[f]).join(","));

  // cleanup
  const ref = { referenceNumber: { startsWith: `PA-${stamp}-` } };
  const users = [poster.id, A.cu.id, B.cu.id, C.cu.id];
  await prisma.approvalQueue.deleteMany({ where: { referenceId: payB!.id } });
  await prisma.carrierPay.deleteMany({ where: { load: ref } });
  await prisma.invoice.deleteMany({ where: { load: ref } });
  await prisma.loadAccessorial.deleteMany({ where: { load: ref } });
  await prisma.fallOffEvent.deleteMany({ where: { load: ref } });
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.auditLog.deleteMany({ where: { userId: { in: users } } });
  // v3.8.bdk/bdl: the TONU flip and the cancel now write lifecycle rows to audit_trails, keyed to the actor.
  await prisma.auditTrail.deleteMany({ where: { performedById: { in: users } } });
  await prisma.loadActivity.deleteMany({ where: { load: ref } });
  await prisma.rateConfirmation.deleteMany({ where: { load: ref } });
  await prisma.loadTender.deleteMany({ where: { load: ref } });
  await prisma.checkCallSchedule.deleteMany({ where: { load: ref } });
  await prisma.shipment.deleteMany({ where: { load: ref } });
  await prisma.load.deleteMany({ where: ref });
  await prisma.carrierScorecard.deleteMany({ where: { carrierId: { in: [A.profile.id, B.profile.id, C.profile.id] } } });
  await prisma.carrierProfile.deleteMany({ where: { id: { in: [A.profile.id, B.profile.id, C.profile.id] } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });

  console.log(`\n${pass}/${pass + fail} passed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error(e); process.exit(1); });
