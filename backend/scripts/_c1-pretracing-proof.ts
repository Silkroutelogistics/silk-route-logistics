/**
 * C1 — a load at the dock gets ZERO pre-tracing email.
 *
 * Drives the REAL `runPreTracing` against a REAL database. It does not
 * reproduce the query: a proof that rebuilds the code under test is testing
 * its own copy (§13.3 Item 222.5).
 *
 * THE CONTROL IS WHAT MAKES THE ZERO MEAN ANYTHING. "The dock load got no
 * email" is trivially true of a job that emailed nobody — a broken fixture, a
 * filter that excludes everything, an exception swallowed upstream all produce
 * it. So a DISPATCHED load in the identical window runs alongside and MUST be
 * emailed. Only the two together say the filter discriminates.
 *
 *   node --env-file=... npx tsx scripts/_c1-pretracing-proof.ts
 *
 * Outbound is neutralised by EXPLICITLY EMPTY keys, never by absence
 * (§19 Sub-pattern 20) — dotenv fills an unset key from .env, which is how a
 * guard once reported "both absent" while holding the production key.
 */
import { prisma } from "../src/config/database";
import { runPreTracing } from "../src/services/schedulerService";

const results: { ok: boolean; label: string; detail?: string }[] = [];
function check(ok: boolean, label: string, detail?: string) {
  results.push({ ok, label, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "\n        " + detail : ""}`);
}

const RUN = "C1PROOF" + Date.now().toString().slice(-8);

async function carrier(suffix: string) {
  return prisma.user.create({
    data: {
      email: `carrier-${suffix}-${RUN}@srl.invalid`,
      passwordHash: "x",
      firstName: "Dock",
      lastName: "Tester",
      role: "CARRIER",
      company: "Proof Carrier " + suffix,
    },
  });
}

/** A load + its shipment, both in the pre-tracing window. */
async function scenario(label: string, loadStatus: string, shipmentStatus: string) {
  const c = await carrier(label);
  const pickup = new Date(Date.now() + 20 * 60 * 60 * 1000); // inside 24h
  const deliver = new Date(Date.now() + 60 * 60 * 60 * 1000);
  const ref = `${RUN}-${label}`;
  const load = await prisma.load.create({
    data: {
      referenceNumber: ref,
      originCity: "Lebanon",
      originState: "NH",
      originZip: "03766",
      destCity: "North Lake",
      destState: "TX",
      destZip: "76247",
      pickupDate: pickup,
      deliveryDate: deliver,
      equipmentType: "REEFER",
      rate: 0,
      status: loadStatus as never,
      posterId: c.id,
      carrierId: c.id,
    },
  });
  await prisma.shipment.create({
    data: {
      shipmentNumber: `S-${ref}`,
      originCity: "Lebanon",
      originState: "NH",
      originZip: "03766",
      destCity: "North Lake",
      destState: "TX",
      destZip: "76247",
      equipmentType: "REEFER",
      rate: 0,
      pickupDate: pickup,
      deliveryDate: deliver,
      status: shipmentStatus as never,
      loadId: load.id,
    },
  });
  return { carrierId: c.id, ref, label };
}

/** Pre-tracing notifications raised for one load reference. */
async function chased(ref: string) {
  return prisma.notification.count({
    where: { type: "LOAD_UPDATE", title: { contains: `Pre-Tracing 24H: ${ref}` } },
  });
}

async function main() {
  console.log(`\n=== C1 pre-tracing proof (run ${RUN}) ===\n`);
  console.log(`Resend configured: ${Boolean(process.env.RESEND_API_KEY)}\n`);

  // Four scenarios, all inside the 48h window, all with a BOOKED shipment —
  // so the ONLY thing that differs is Load.status, which is the whole point.
  const control = await scenario("CONTROL-DISPATCHED", "DISPATCHED", "BOOKED");
  const booked = await scenario("CONTROL-BOOKED", "BOOKED", "BOOKED");
  const dock = await scenario("DOCK-ATPICKUP", "AT_PICKUP", "BOOKED");
  const loaded = await scenario("PAST-LOADED", "LOADED", "BOOKED");
  const tonu = await scenario("TONU", "TONU", "BOOKED");

  await runPreTracing();

  const nControl = await chased(control.ref);
  const nBooked = await chased(booked.ref);
  const nDock = await chased(dock.ref);
  const nLoaded = await chased(loaded.ref);
  const nTonu = await chased(tonu.ref);

  // --- the control half: the job must actually be working ------------------
  check(
    nControl === 1,
    "CONTROL: a DISPATCHED load inside the window IS chased",
    `chased ${nControl}x (expected 1) — without this the zeros below prove nothing`,
  );
  check(nBooked === 1, "CONTROL: a BOOKED load inside the window IS chased", `chased ${nBooked}x`);

  // --- the finding ---------------------------------------------------------
  check(
    nDock === 0,
    "DOCK: a load at AT_PICKUP inside the window gets ZERO pre-tracing email",
    `chased ${nDock}x (expected 0) — this is the carrier standing at the dock`,
  );
  check(
    nLoaded === 0,
    "PAST: a load already LOADED gets ZERO",
    `chased ${nLoaded}x (expected 0)`,
  );
  check(
    nTonu === 0,
    "TONU: a truck-ordered-not-used load gets ZERO",
    `chased ${nTonu}x (expected 0) — newly excluded; TONU was not filtered before`,
  );

  // --- the job keyed on the LOAD, not the shipment -------------------------
  // All five shipments are BOOKED. If the filter still read Shipment.status
  // every one of them would have been chased.
  const totalChased = nControl + nBooked + nDock + nLoaded + nTonu;
  check(
    totalChased === 2,
    "the filter discriminates on Load.status while every SHIPMENT is BOOKED",
    `${totalChased} of 5 chased (expected exactly 2) — a shipment-keyed filter would chase all 5`,
  );

  const passed = results.filter((r) => r.ok).length;
  console.log(`\n${passed}/${results.length} assertions passed\n`);
  return passed === results.length ? 0 : 1;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exitCode = code;
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exitCode = 1;
  });
