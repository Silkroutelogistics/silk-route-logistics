/**
 * The expiry race between the direct sweep and the waterfall ticker (row 16a).
 *
 * Run with outbound keys EXPLICITLY EMPTY (§19 Sub-pattern 20):
 *   RESEND_API_KEY= OPENPHONE_API_KEY= QUO_API_KEY= S3_BUCKET_NAME= \
 *     DATABASE_URL=<local> DIRECT_URL=<local> npx tsx scripts/_arc-expiry-race-proof.ts
 *
 * WHAT IS BEING PROVEN. A cascade tender past its TTL is owned by
 * expireStalePositions, which expires the position and ADVANCES the waterfall.
 * processExpiredTenders is the hourly direct sweep and must leave it alone --
 * because when it wins the race it reverts the load to POSTED while the cascade
 * is still active, and the ticker then tenders the next carrier onto a load that
 * is back on the open board.
 *
 * The ticker is not started here. Each sweep is invoked directly, which is what
 * makes the ordering observable rather than a matter of timing.
 */
import { prisma } from "../src/config/database";
import { processExpiredTenders } from "../src/controllers/tenderController";
import { expireStalePositions } from "../src/services/waterfallEngineService";

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
  const user = await prisma.user.create({
    data: { email: "wfx-" + stamp + "@srl.invalid", passwordHash: "x", firstName: "W", lastName: "F", role: "CARRIER" },
    select: { id: true },
  });
  const profile = await prisma.carrierProfile.create({
    data: {
      userId: user.id, mcNumber: "MC-WFX" + stamp, dotNumber: String(stamp).slice(-7),
      companyName: "Waterfall Race Carrier", contactName: "W F", contactPhone: "(269) 555-0102",
      onboardingStatus: "APPROVED", status: "APPROVED", approvedAt: new Date(), tier: "SILVER", cppTier: "SILVER",
    },
    select: { id: true },
  });
  const customer = await prisma.customer.create({
    data: { name: "WFX Cust " + stamp, email: "wfxc-" + stamp + "@srl.invalid" },
    select: { id: true },
  });

  // Two loads, identical except for who owns the tender: one cascade, one direct.
  // The direct load is the CONTROL -- without it, "the sweep did nothing" could
  // equally mean the sweep is broken.
  const mkLoad = async (tag: string) =>
    prisma.load.create({
      data: {
        loadNumber: (tag + stamp).slice(0, 20), referenceNumber: (tag + stamp).slice(0, 20),
        status: "TENDERED", customerId: customer.id, posterId: user.id,
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "76262",
        rate: 5100, customerRate: 5100, carrierRate: 4100,
        pickupDate: new Date(), deliveryDate: new Date(Date.now() + 86400000),
        equipmentType: "Reefer", commodity: "WFX-PROOF", weight: 28400,
        dispatchMethod: "waterfall",
      },
      select: { id: true },
    });

  const wfLoad = await mkLoad("WFX-");
  const directLoad = await mkLoad("WFD-");

  const wf = await prisma.waterfall.create({
    data: { loadId: wfLoad.id, mode: "full_auto", status: "active", totalPositions: 2, currentPosition: 1, startedAt: new Date() },
    select: { id: true },
  });
  const past = new Date(Date.now() - 60_000);
  const pos = await prisma.waterfallPosition.create({
    data: {
      waterfallId: wf.id, carrierId: user.id, position: 1, status: "tendered",
      tenderSentAt: new Date(Date.now() - 3_600_000), tenderExpiresAt: past,
    },
    select: { id: true },
  });
  // A second position, so advancing has somewhere to go rather than exhausting
  // straight into the fallback chain.
  await prisma.waterfallPosition.create({
    data: { waterfallId: wf.id, carrierId: user.id, position: 2, status: "queued" },
  });

  const wfTender = await prisma.loadTender.create({
    data: {
      loadId: wfLoad.id, carrierId: profile.id, status: "OFFERED", offeredRate: 4100,
      expiresAt: past, waterfallPositionId: pos.id,
    },
    select: { id: true },
  });
  const directTender = await prisma.loadTender.create({
    data: { loadId: directLoad.id, carrierId: profile.id, status: "OFFERED", offeredRate: 4100, expiresAt: past },
    select: { id: true },
  });

  console.log("\n[1] the direct sweep leaves the cascade tender alone");
  await processExpiredTenders();

  const afterSweepWf = await prisma.loadTender.findUnique({ where: { id: wfTender.id }, select: { status: true } });
  const afterSweepLoad = await prisma.load.findUnique({ where: { id: wfLoad.id }, select: { status: true } });
  const afterSweepRun = await prisma.waterfall.findUnique({ where: { id: wf.id }, select: { status: true } });
  const afterSweepPos = await prisma.waterfallPosition.findUnique({ where: { id: pos.id }, select: { status: true } });

  check("the cascade tender is still OFFERED", afterSweepWf?.status === "OFFERED", String(afterSweepWf?.status));
  check("the load stays TENDERED", afterSweepLoad?.status === "TENDERED", String(afterSweepLoad?.status));
  check("the waterfall stays active", afterSweepRun?.status === "active", String(afterSweepRun?.status));
  check("the position is untouched", afterSweepPos?.status === "tendered", String(afterSweepPos?.status));

  console.log("\n[2] the CONTROL: the same sweep does expire a direct tender");
  // Without this, [1] passing could mean the sweep is simply broken.
  const afterSweepDirect = await prisma.loadTender.findUnique({ where: { id: directTender.id }, select: { status: true } });
  const afterSweepDirectLoad = await prisma.load.findUnique({ where: { id: directLoad.id }, select: { status: true } });
  check("the direct tender IS expired", afterSweepDirect?.status === "EXPIRED", String(afterSweepDirect?.status));
  check("its load IS returned to the board", afterSweepDirectLoad?.status === "POSTED", String(afterSweepDirectLoad?.status));

  console.log("\n[3] the cascade sweep expires the position and advances");
  await expireStalePositions();

  const tickPos = await prisma.waterfallPosition.findUnique({ where: { id: pos.id }, select: { status: true } });
  const tickTender = await prisma.loadTender.findUnique({ where: { id: wfTender.id }, select: { status: true, statusReason: true } });
  const tickRun = await prisma.waterfall.findUnique({ where: { id: wf.id }, select: { status: true, currentPosition: true } });

  check("the position is expired", tickPos?.status === "expired", String(tickPos?.status));
  check("the tender is EXPIRED", tickTender?.status === "EXPIRED", String(tickTender?.status));
  // NOT asserted: statusReason on the row. It is persisted only for WITHDRAWN
  // and RELEASED (Item 10d), and both sweeps use the same reason string
  // `ttl_elapsed` anyway, so it could never have told them apart. The reason
  // lives in the transition history, which is what is checked instead.
  const hist = await prisma.loadActivity.count({ where: { tenderId: wfTender.id } });
  check("the expiry left a transition row", hist > 0, String(hist) + " rows");
  // Advanced, whichever way it went: moved to the next position, or exhausted
  // into the fallback chain. Both are the CASCADE handling it, which is the point.
  check(
    "the cascade moved on",
    (tickRun?.currentPosition ?? 1) > 1 || tickRun?.status !== "active",
    "currentPosition=" + tickRun?.currentPosition + " status=" + tickRun?.status,
  );

  await prisma.loadTender.deleteMany({ where: { loadId: { in: [wfLoad.id, directLoad.id] } } });
  await prisma.waterfallPosition.deleteMany({ where: { waterfallId: wf.id } });
  await prisma.waterfall.delete({ where: { id: wf.id } });
  await prisma.load.deleteMany({ where: { id: { in: [wfLoad.id, directLoad.id] } } });
  await prisma.carrierProfile.delete({ where: { id: profile.id } });
  await prisma.customer.delete({ where: { id: customer.id } });
  await prisma.user.delete({ where: { id: user.id } });

  console.log("\n" + pass + "/" + (pass + fail) + " passed");
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
