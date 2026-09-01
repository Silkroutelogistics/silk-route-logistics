/**
 * Commit-8 proof: releasing a carrier settles everything, or nothing.
 *
 * Before this, `fallOffRecovery` cleared the carrier and re-posted the load but
 * left the tender reading ACCEPTED forever — a load back on the board with a
 * tender still claiming a carrier had taken it. This asserts the whole act:
 * carrier off, tender RELEASED with its reason, live paper voided, executed
 * paper untouched, fall-off recorded except when the fault was SRL's, and the
 * load returned to wherever it came from.
 *
 * Local-only. Run with outbound keys explicitly EMPTY (§19 Sub-pattern 20).
 */
import { prisma } from "../src/config/database";
import { createTender } from "../src/services/tenderCreationService";
import { assignCarrier } from "../src/services/carrierAssignmentService";
import { releaseCarrier, withdrawTender, RELEASE_REASONS } from "../src/services/carrierReleaseService";
import { getTenderActivity } from "../src/services/loadActivityService";

const url = process.env.DATABASE_URL ?? "";
if (!/localhost|127\.0\.0\.1/.test(url)) {
  console.error("REFUSING: DATABASE_URL is not local. This script writes and deletes rows.");
  process.exit(1);
}

let pass = 0, fail = 0;
const ok = (n: string, c: boolean, d = "") => {
  if (c) { pass++; console.log(`  PASS  ${n}`); } else { fail++; console.log(`  FAIL  ${n}${d ? "  — " + d : ""}`); }
};

async function main() {
  const stamp = Date.now();
  const poster = await prisma.user.create({
    data: { email: `rl-p-${stamp}@srl.invalid`, passwordHash: "x", firstName: "A", lastName: "E", role: "BROKER" },
  });
  const cu = await prisma.user.create({
    data: { email: `rl-c-${stamp}@srl.invalid`, passwordHash: "x", firstName: "C", lastName: "Co", role: "CARRIER" },
  });
  const profile = await prisma.carrierProfile.create({ data: { userId: cu.id, companyName: `RL ${stamp}` } });

  async function seed(tag: string, dispatchMethod: string | null) {
    const load = await prisma.load.create({
      data: {
        referenceNumber: `RL-${stamp}-${tag}`, posterId: poster.id, status: "BOOKED",
        originCity: "Lebanon", originState: "NH", originZip: "03766",
        destCity: "North Lake", destState: "TX", destZip: "75568",
        pickupDate: new Date(), deliveryDate: new Date(Date.now() + 864e5),
        equipmentType: "Reefer", rate: 5100, carrierRate: 4100,
        dispatchMethod, driverName: "Sam", driverPhone: "+12695550101",
      },
    });
    const t = await createTender({ loadId: load.id, carrierProfileId: profile.id, offeredRate: 4100 });
    await prisma.loadTender.update({ where: { id: t.id }, data: { status: "ACCEPTED", respondedAt: new Date() } });
    await assignCarrier({ loadId: load.id, carrierUserId: cu.id, status: "BOOKED", carrierRate: 4100 });
    return { load, tender: t };
  }

  // ── 1. the ordinary release: carrier walked ─────────────────────────────
  const a = await seed("a", "loadboard");
  const liveRc = await prisma.rateConfirmation.create({
    data: { loadId: a.load.id, formData: {}, status: "SENT", createdById: poster.id, carrierRate: 4100 },
  });
  const signedRc = await prisma.rateConfirmation.create({
    data: { loadId: a.load.id, formData: {}, status: "SIGNED", createdById: poster.id, carrierRate: 4100, signed: true },
  });

  const r = await releaseCarrier({ loadId: a.load.id, reason: "carrier_fell_off", actorId: poster.id, note: "no-show" });
  ok("reports it released", r.released === true);

  const loadA = await prisma.load.findUnique({ where: { id: a.load.id }, select: { carrierId: true, status: true, driverName: true } });
  ok("the carrier comes off the load", loadA!.carrierId === null);
  ok("the load returns to POSTED", loadA!.status === "POSTED", loadA!.status);
  ok("driver details are cleared with them", loadA!.driverName === null);

  const tA = await prisma.loadTender.findUnique({ where: { id: a.tender.id }, select: { status: true, statusReason: true } });
  ok("the tender settles to RELEASED — not left reading ACCEPTED", tA!.status === "RELEASED", tA!.status);
  ok("with the coded reason", tA!.statusReason === "carrier_fell_off");

  ok("a live RC is voided", (await prisma.rateConfirmation.findUnique({ where: { id: liveRc.id } }))!.status === "VOID");
  ok("a SIGNED RC is not touched", (await prisma.rateConfirmation.findUnique({ where: { id: signedRc.id } }))!.status === "SIGNED");
  ok("the void count is reported", r.rcVoided === 1, String(r.rcVoided));

  const hist = await getTenderActivity(a.tender.id);
  ok("the release is in the tender's history", hist.some((h) => /→ RELEASED/.test(h.description)));
  ok("and the history names the reason", hist.some((h) => (h.metadata as any)?.reason === "carrier_fell_off"));

  ok("a fall-off is recorded against the carrier", r.faultRecorded === true);
  ok("and it points at the released carrier",
     (await prisma.fallOffEvent.count({ where: { loadId: a.load.id, originalCarrierId: cu.id } })) === 1);

  // ── 2. srl_error records no fault ───────────────────────────────────────
  const b = await seed("b", "loadboard");
  const rb = await releaseCarrier({ loadId: b.load.id, reason: "srl_error", actorId: poster.id });
  ok("srl_error still releases the carrier", rb.released === true);
  ok("but records NO fall-off — our mistake is not their mark", rb.faultRecorded === false);
  ok("and no fall-off row exists", (await prisma.fallOffEvent.count({ where: { loadId: b.load.id } })) === 0);

  // ── 3. the load goes back where it came from ────────────────────────────
  const c = await seed("c", "waterfall");
  const rc = await releaseCarrier({ loadId: c.load.id, reason: "compliance_lapse" });
  ok("a waterfall load is routed back to its cascade", rc.returnedTo === "waterfall", rc.returnedTo);
  ok("a board load is routed back to the board", r.returnedTo === "loadboard", r.returnedTo);

  // ── 4. idempotent ───────────────────────────────────────────────────────
  const again = await releaseCarrier({ loadId: a.load.id, reason: "carrier_fell_off" });
  ok("releasing an already-released load is a no-op, not an error", again.released === false);
  ok("and does not record a second fall-off",
     (await prisma.fallOffEvent.count({ where: { loadId: a.load.id } })) === 1);

  // ── 5. withdraw is a different act ──────────────────────────────────────
  const d = await seed("d", "loadboard");
  const live = await createTender({ loadId: d.load.id, carrierProfileId: profile.id, offeredRate: 4100 });
  const w = await withdrawTender({ tenderId: live.id, actorId: poster.id });
  ok("withdrawing a live offer needs no reason", w.status === "WITHDRAWN");
  ok("and records a default code rather than nothing", w.statusReason === "ae_withdrew");
  let refused = false;
  try { await withdrawTender({ tenderId: d.tender.id }); } catch { refused = true; }
  ok("withdraw REFUSES an accepted tender — that is a release, not a withdrawal", refused);

  ok("every reason code is exercised or declared", RELEASE_REASONS.length === 5, String(RELEASE_REASONS.length));

  // cleanup
  const ref = { referenceNumber: { startsWith: `RL-${stamp}` } };
  await prisma.fallOffEvent.deleteMany({ where: { load: ref } });
  await prisma.rateConfirmation.deleteMany({ where: { load: ref } });
  await prisma.loadActivity.deleteMany({ where: { load: ref } });
  await prisma.loadTender.deleteMany({ where: { load: ref } });
  await prisma.load.deleteMany({ where: ref });
  await prisma.carrierProfile.delete({ where: { id: profile.id } });
  await prisma.user.deleteMany({ where: { id: { in: [cu.id, poster.id] } } });

  console.log(`\n${pass}/${pass + fail} passed`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
