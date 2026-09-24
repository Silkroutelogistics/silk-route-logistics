/**
 * C3 — a carrier reporting arrival stops counting against the enforcement gate.
 *
 * WHAT THIS IS ACTUALLY ABOUT. `status_machine.unexpected_cumulative` on
 * /api/health is THE ENFORCEMENT GATE (§13.3 Item 194): enforcement of the
 * canonical state machine is switched on once it has been zero across a full
 * deploy cycle. Production has recorded exactly ONE unexpected edge --
 * `BOOKED -> AT_PICKUP` -- and that edge is a carrier reporting arrival, which
 * `CARRIER_ALLOWED_TRANSITIONS` exists to permit and which `carrierLoads`
 * validates as CARRIER before writing.
 *
 * So the gate could never close. Not because anything was wrong, but because
 * the observer judged every write against the AE lens and tagged `expected`
 * from AUTO alone, with no CARRIER branch. A gate that cannot close is one
 * people stop reading (§13.3 Item 214).
 *
 * WHY THIS NEEDS A REAL DATABASE. `unexpected_cumulative` is DERIVED AT READ
 * TIME from stored rows, never stored -- which is what lets a map change
 * reclassify history. The claim being proven is therefore about a real stored
 * row being re-read, not about a function's return value, and a unit test with
 * a fake store cannot make it.
 *
 *   RESEND_API_KEY= OPENPHONE_API_KEY= npx tsx scripts/_c3-carrier-lens-proof.ts
 */
import { prisma } from "../src/config/database";
import {
  cumulativeStatusMachineCounters,
  __resetCumulativeCache,
} from "../src/lib/statusMachineCounters";
import { observeLoadTransition, statusMachineCounters } from "../src/lib/loadTransitionObserver";
import { accountedByLens } from "../src/lib/loadStateMachine";

const results: { ok: boolean; label: string; detail?: string }[] = [];
function check(ok: boolean, label: string, detail?: string) {
  results.push({ ok, label, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? "\n        " + detail : ""}`);
}

async function seedCounter(from: string, to: string, count: number) {
  await prisma.statusMachineCounter.upsert({
    where: { fromStatus_toStatus: { fromStatus: from as never, toStatus: to as never } },
    update: { count },
    create: { fromStatus: from as never, toStatus: to as never, count },
  });
}

async function main() {
  console.log("\n=== C3 carrier-lens / enforcement-gate proof ===\n");
  console.log(`Resend configured: ${Boolean(process.env.RESEND_API_KEY)}\n`);

  // --- the predicate --------------------------------------------------------
  check(
    accountedByLens("BOOKED" as never, "AT_PICKUP" as never) === "CARRIER",
    "BOOKED -> AT_PICKUP is accounted for by the CARRIER lens",
    "this is production's one recorded unexpected edge, and it is a carrier doing its job",
  );
  check(
    accountedByLens("POSTED" as never, "DISPATCHED" as never) === "AUTO",
    "the AUTO lens still answers for auto-pilot dispatch",
    "widening must not have displaced the lens that was already there",
  );
  check(
    accountedByLens("BOOKED" as never, "DELIVERED" as never) === null,
    "a genuine skip is accounted for by NO lens (vacuity tripwire)",
    "if this ever returns a lens the gate reads zero for the wrong reason",
  );

  // --- the durable gate, over real rows ------------------------------------
  // Start from a clean table so the numbers below are this proof's own and not
  // residue from an earlier run -- a dirty fixture makes a correct fix look
  // broken and an incorrect one look fine (§13.3 Item 304.1).
  await prisma.statusMachineCounter.deleteMany({});

  await seedCounter("BOOKED", "AT_PICKUP", 3); // production's shape
  await seedCounter("POSTED", "DISPATCHED", 5); // auto-pilot, already accounted
  __resetCumulativeCache();
  const clean = await cumulativeStatusMachineCounters(prisma as never);

  check(
    clean.violations_cumulative === 8,
    "every observation is still counted as a violation",
    `violations_cumulative=${clean.violations_cumulative} (expected 8) — the AE map still ` +
      "rejects these, and C3 must not have hidden them",
  );
  check(
    clean.unexpected_cumulative === 0,
    "THE GATE CLOSES: unexpected_cumulative is 0 with only accounted-for edges stored",
    `unexpected_cumulative=${clean.unexpected_cumulative} (expected 0) — before C3 the ` +
      "carrier arrival counted here and the gate could never reach zero",
  );
  check(
    clean.unexpected_edges.length === 0,
    "and nothing is left in unexpected_edges for somebody to go and read",
    `${clean.unexpected_edges.length} edge(s) listed`,
  );

  // --- the gate must still be able to OPEN ---------------------------------
  await seedCounter("BOOKED", "DELIVERED", 2);
  __resetCumulativeCache();
  const dirty = await cumulativeStatusMachineCounters(prisma as never);

  check(
    dirty.unexpected_cumulative === 2,
    "a genuinely unaccounted edge still holds the gate open",
    `unexpected_cumulative=${dirty.unexpected_cumulative} (expected 2) — the widened lens ` +
      "must not have made the gate unconditionally green",
  );
  check(
    dirty.unexpected_edges.some((e) => e.from === "BOOKED" && e.to === "DELIVERED"),
    "and it is NAMED, so the next reader knows which edge to go and look at",
    dirty.unexpected_edges.map((e) => `${e.from}->${e.to}x${e.count}`).join(", ") || "(none)",
  );

  // --- the live observer agrees with the durable counter -------------------
  const before = statusMachineCounters();
  observeLoadTransition({ from: "BOOKED" as never, to: "AT_PICKUP" as never, loadId: "c3-proof" });
  observeLoadTransition({ from: "BOOKED" as never, to: "DELIVERED" as never, loadId: "c3-proof" });
  const after = statusMachineCounters();

  check(
    after.violations_since_boot - before.violations_since_boot === 2,
    "the in-memory counter saw both transitions",
    `+${after.violations_since_boot - before.violations_since_boot} violations`,
  );
  check(
    after.unexpected_since_boot - before.unexpected_since_boot === 1,
    "in-memory and durable agree: the carrier arrival is expected, the skip is not",
    `+${after.unexpected_since_boot - before.unexpected_since_boot} unexpected (expected +1) — ` +
      "two derivations of 'accounted for' would let the health field and the logs disagree " +
      "about whether the gate had closed, which is why they share one predicate",
  );

  await prisma.statusMachineCounter.deleteMany({});

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
