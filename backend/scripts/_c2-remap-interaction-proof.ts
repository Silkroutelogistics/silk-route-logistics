/**
 * C2 — AT_PICKUP reads as DISPATCHED, and that does NOT put the carrier back
 * on the pre-tracing chase.
 *
 * WHY THIS PROOF EXISTS AT ALL. `runPreTracing` selects shipments on
 * `status in (BOOKED, DISPATCHED)`. C2 moves AT_PICKUP's projection INTO that
 * set, so on its own it re-creates the exact defect C1 had just closed --
 * emailing "are you on schedule for pickup?" to a carrier standing on the dock
 * -- through a different door. C1's load-level filter is what holds it shut.
 *
 * That interaction is the whole reason the two had to ship in this order, and
 * it is proven here rather than reasoned about: the adversarial run removes
 * C1's filter and watches the dock load start being chased again.
 *
 * THE FIXTURE TAKES THE SHIPMENT STATUS FROM THE REAL MAPPER, never from a
 * literal. A proof that hardcodes "DISPATCHED" is asserting my own reading of
 * the mapping; asking `shipmentSyncFor` means the fixture moves if the mapping
 * does, and the assertion is then about the system rather than about my copy
 * of it (§13.3 Item 222.5).
 *
 *   RESEND_API_KEY= OPENPHONE_API_KEY= npx tsx scripts/_c2-remap-interaction-proof.ts
 *
 * Outbound is neutralised by EXPLICITLY EMPTY keys, never by absence
 * (§19 Sub-pattern 20).
 */
import { prisma } from "../src/config/database";
import { runPreTracing } from "../src/services/schedulerService";
import { shipmentSyncFor } from "../src/lib/shipmentStatusFor";

const results: { ok: boolean; label: string; detail?: string }[] = [];
function check(ok: boolean, label: string, detail?: string) {
  results.push({ ok, label, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "\n        " + detail : ""}`);
}

const RUN = "C2PROOF" + Date.now().toString().slice(-8);

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

/**
 * A load in the pre-tracing window, with the shipment status the REAL mapper
 * produces for that load status.
 */
async function scenario(label: string, loadStatus: string) {
  const c = await carrier(label);
  const pickup = new Date(Date.now() + 20 * 60 * 60 * 1000);
  const deliver = new Date(Date.now() + 60 * 60 * 60 * 1000);
  const ref = `${RUN}-${label}`;
  const sync = shipmentSyncFor(loadStatus as never);
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
      status: sync.status,
      ...(sync.setActualPickup ? { actualPickup: new Date() } : {}),
      loadId: load.id,
    },
  });
  return { ref, label, shipmentStatus: sync.status, stamped: sync.setActualPickup };
}

async function chased(ref: string) {
  return prisma.notification.count({
    where: { type: "LOAD_UPDATE", title: { contains: `Pre-Tracing 24H: ${ref}` } },
  });
}

async function main() {
  console.log(`\n=== C2 remap / C1 interaction proof (run ${RUN}) ===\n`);
  console.log(`Resend configured: ${Boolean(process.env.RESEND_API_KEY)}\n`);

  // --- the remap itself ----------------------------------------------------
  const atPickup = shipmentSyncFor("AT_PICKUP" as never);
  const loaded = shipmentSyncFor("LOADED" as never);
  check(
    atPickup.status === "DISPATCHED",
    "AT_PICKUP projects to DISPATCHED, not PICKED_UP",
    `got ${atPickup.status} — arriving is not loading`,
  );
  check(
    atPickup.setActualPickup === false,
    "AT_PICKUP no longer stamps actualPickup",
    "the status and the timestamp are one claim; a DISPATCHED row must not carry a pickup time",
  );
  check(
    loaded.status === "PICKED_UP" && loaded.setActualPickup === true,
    "LOADED still means picked up, and still stamps",
    `the stamp is DEFERRED to the moment it is true, not lost (LOADED -> ${loaded.status})`,
  );

  // --- the interaction that made the order matter --------------------------
  const control = await scenario("CONTROL-DISPATCHED", "DISPATCHED");
  const dock = await scenario("DOCK-ATPICKUP", "AT_PICKUP");

  check(
    dock.shipmentStatus === control.shipmentStatus,
    "the dock load's SHIPMENT is now indistinguishable from a dispatched one",
    `both read ${dock.shipmentStatus} — which is precisely why runPreTracing's shipment-level ` +
      "filter can no longer tell them apart, and why the load-level filter has to",
  );

  await runPreTracing();

  const nControl = await chased(control.ref);
  const nDock = await chased(dock.ref);

  check(
    nControl === 1,
    "CONTROL: a genuinely DISPATCHED load is still chased",
    `chased ${nControl}x (expected 1) — without this the zero below proves nothing`,
  );
  check(
    nDock === 0,
    "DOCK: the AT_PICKUP load gets ZERO despite its shipment reading DISPATCHED",
    `chased ${nDock}x (expected 0) — C1's load filter is the only thing separating these two`,
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
