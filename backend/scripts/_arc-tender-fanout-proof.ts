/**
 * One live offer at a time, unless the load is fanning out (row 4a).
 *
 * Run with outbound keys EXPLICITLY EMPTY (§19 Sub-pattern 20):
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= S3_BUCKET_NAME= \
 *     DATABASE_URL=<local> DIRECT_URL=<local> npx tsx scripts/_arc-fanout-proof.ts
 *
 * A SEQUENTIAL load with two live tenders can be accepted twice, and the second
 * acceptance lands on a load that already has a carrier. Broadcast is the one
 * path that legitimately wants simultaneous offers, and it declares that by
 * setting the flag before it creates them.
 */
import { prisma } from "../src/config/database";
import { createTender } from "../src/services/tenderCreationService";
import { launchBroadcast } from "../src/services/broadcastTenderService";

let pass = 0;
let fail = 0;
function check(label: string, cond: boolean, detail = "") {
  if (cond) { pass++; console.log("  ok   " + label); }
  else { fail++; console.log("  FAIL " + label + (detail ? "  -- " + detail : "")); }
}

async function main() {
  const host = (process.env.DIRECT_URL ?? "").replace(/.*@/, "");
  console.log("target: " + host);
  if (!/127\.0\.0\.1|localhost/.test(host)) {
    console.error("REFUSING: this proof writes rows and must run against a local container.");
    process.exit(1);
  }
  console.log("Resend configured: " + Boolean(process.env.RESEND_API_KEY));

  const stamp = Date.now();
  const mkCarrier = async (n: number) => {
    const u = await prisma.user.create({
      data: { email: "fan" + n + "-" + stamp + "@srl.invalid", passwordHash: "x", firstName: "F", lastName: String(n), role: "CARRIER" },
      select: { id: true },
    });
    const p = await prisma.carrierProfile.create({
      data: {
        userId: u.id, mcNumber: "MC-FAN" + n + stamp, dotNumber: String(stamp + n).slice(-7),
        companyName: "Fanout Carrier " + n, contactName: "F " + n, contactPhone: "(269) 555-010" + n,
        onboardingStatus: "APPROVED", status: "APPROVED", approvedAt: new Date(), tier: "SILVER", cppTier: "SILVER",
      },
      select: { id: true },
    });
    return { userId: u.id, profileId: p.id };
  };

  const c1 = await mkCarrier(1);
  const c2 = await mkCarrier(2);
  const c3 = await mkCarrier(3);
  const customer = await prisma.customer.create({
    data: { name: "Fanout Cust " + stamp, email: "fanc-" + stamp + "@srl.invalid" },
    select: { id: true },
  });

  const mkLoad = async (tag: string) =>
    prisma.load.create({
      data: {
        loadNumber: (tag + stamp).slice(0, 20), referenceNumber: (tag + stamp).slice(0, 20),
        status: "POSTED", customerId: customer.id, posterId: c1.userId,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "76262",
        rate: 5100, customerRate: 5100, carrierRate: 4100,
        pickupDate: new Date(), deliveryDate: new Date(Date.now() + 86400000),
        equipmentType: "Reefer", commodity: "FAN-PROOF", weight: 28400,
      },
      select: { id: true, tenderFanout: true },
    });

  const seqLoad = await mkLoad("FANS-");
  const parLoad = await mkLoad("FANP-");
  const later = new Date(Date.now() + 86400000);

  console.log("\n[1] a new load defaults to SEQUENTIAL");
  check("default is SEQUENTIAL", seqLoad.tenderFanout === "SEQUENTIAL", String(seqLoad.tenderFanout));

  console.log("\n[2] a SEQUENTIAL load refuses a second live offer");
  const t1 = await createTender({
    loadId: seqLoad.id, carrierProfileId: c1.profileId, offeredRate: 4100, expiresAt: later,
    actor: { id: c1.userId, type: "USER" },
  });
  check("the first offer is created", !!t1?.id);

  let conflict: any = null;
  try {
    await createTender({
      loadId: seqLoad.id, carrierProfileId: c2.profileId, offeredRate: 4150, expiresAt: later,
      actor: { id: c1.userId, type: "USER" },
    });
  } catch (e) { conflict = e; }
  check("the second offer is refused", conflict !== null);
  check("with a 409", conflict?.status === 409, String(conflict?.status));
  check("and the conflict code", conflict?.code === "SEQUENTIAL_TENDER_CONFLICT", String(conflict?.code));
  check("naming the live tender", conflict?.liveTenderId === t1.id, String(conflict?.liveTenderId));
  const seqLive = await prisma.loadTender.count({
    where: { loadId: seqLoad.id, status: { in: ["OFFERED", "COUNTERED"] }, deletedAt: null },
  });
  check("still exactly one live tender", seqLive === 1, String(seqLive));

  console.log("\n[3] a COUNTERED tender is live too");
  // The omission that let six hand-rolled sibling sweeps disagree.
  await prisma.loadTender.update({ where: { id: t1.id }, data: { status: "COUNTERED" } });
  let conflict2: any = null;
  try {
    await createTender({
      loadId: seqLoad.id, carrierProfileId: c2.profileId, offeredRate: 4150, expiresAt: later,
      actor: { id: c1.userId, type: "USER" },
    });
  } catch (e) { conflict2 = e; }
  check("a countered tender still blocks a second offer", conflict2?.code === "SEQUENTIAL_TENDER_CONFLICT");

  console.log("\n[4] once the live tender is settled, the next offer is allowed");
  await prisma.loadTender.update({ where: { id: t1.id }, data: { status: "WITHDRAWN" } });
  const t2 = await createTender({
    loadId: seqLoad.id, carrierProfileId: c2.profileId, offeredRate: 4150, expiresAt: later,
    actor: { id: c1.userId, type: "USER" },
  });
  check("a replacement offer is created", !!t2?.id);

  console.log("\n[5] a broadcast load carries N live offers");
  const res = await launchBroadcast({
    loadId: parLoad.id,
    candidates: [
      { carrierId: c1.profileId, carrierUserId: c1.userId, companyName: "Fanout Carrier 1", offeredRate: 4100 },
      { carrierId: c2.profileId, carrierUserId: c2.userId, companyName: "Fanout Carrier 2", offeredRate: 4100 },
      { carrierId: c3.profileId, carrierUserId: c3.userId, companyName: "Fanout Carrier 3", offeredRate: 4100 },
    ],
    expirationMinutes: 60,
    createdById: c1.userId,
  });
  check("the broadcast returns three tenders", (res?.tenders?.length ?? 0) === 3, String(res?.tenders?.length));
  const parAfter = await prisma.load.findUnique({ where: { id: parLoad.id }, select: { tenderFanout: true } });
  check("the load is flagged PARALLEL", parAfter?.tenderFanout === "PARALLEL", String(parAfter?.tenderFanout));
  const parLive = await prisma.loadTender.count({
    where: { loadId: parLoad.id, status: { in: ["OFFERED", "COUNTERED"] }, deletedAt: null },
  });
  check("three live tenders coexist", parLive === 3, String(parLive));

  console.log("\n[6] REGRESSION: accepting on a broadcast load still settles the siblings");
  const { withdrawLiveTenders } = await import("../src/services/tenderTransitionService");
  const winner = res.tenders[0];
  await withdrawLiveTenders({ loadId: parLoad.id, exceptTenderId: winner.id, reason: "load_covered" });
  const stillLive = await prisma.loadTender.count({
    where: { loadId: parLoad.id, status: { in: ["OFFERED", "COUNTERED"] }, deletedAt: null },
  });
  check("only the winner is left live", stillLive === 1, String(stillLive));
  const withdrawn = await prisma.loadTender.count({ where: { loadId: parLoad.id, status: "WITHDRAWN" } });
  check("the losers are WITHDRAWN, not DECLINED", withdrawn === 2, String(withdrawn));

  await prisma.loadTender.deleteMany({ where: { loadId: { in: [seqLoad.id, parLoad.id] } } });
  await prisma.load.deleteMany({ where: { id: { in: [seqLoad.id, parLoad.id] } } });
  await prisma.carrierProfile.deleteMany({ where: { id: { in: [c1.profileId, c2.profileId, c3.profileId] } } });
  await prisma.customer.delete({ where: { id: customer.id } });
  await prisma.user.deleteMany({ where: { id: { in: [c1.userId, c2.userId, c3.userId] } } });

  console.log("\n" + pass + "/" + (pass + fail) + " passed");
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
