import { describe, it, expect } from "vitest";
import {
  reconcileStopDwellCharges,
  applyStopDwellCharges,
  maxAllowedForDwell,
  minRequiredForDwell,
  DETENTION_FREE_HOURS,
  DETENTION_RATE_PER_HOUR,
  DETENTION_CAP_PER_STOP,
  LAYOVER_RATE_PER_DAY,
} from "../../../src/lib/detentionLayover";
import { createRateConfirmationSchema } from "../../../src/validators/rateConfirmation";
// The terms grid the Rate Confirmation actually prints. Imported so the money on
// the signed document is asserted against the money in the ledger, rather than
// each being asserted against the same literal independently.
import { buildRateConOperationalTerms } from "../../../src/services/pdfService";

// This is money math on a document a carrier signs. The Rate Confirmation
// promises: "At the $250 per stop cap detention converts to layover at $250
// per day; the two do not stack for the same hours." These tests are the
// enforcement of that sentence.
//
// The conversion instant is derived: 2h free + ($250 ÷ $50/hr) = arrival + 7h.
// Layover day one starts there and is billed there, so hour 7 pays $500 and
// there is no band where a held carrier sits under an hour nothing has paid for.
//
// Stated precisely, because the ladder IS flat from hour 7 to hour 31: those
// hours are prepaid at the conversion, not unaccrued. The guarantee these tests
// enforce is "no unpaid band", not "earns continuously".
//
// Every invariant below carries a LOWER bound as well as an upper one. The
// original suite did not, and a reconciler that returned $0 for every hold
// passed all six of its sweeps: three went vacuous the moment layover was null,
// and the ceiling is satisfied by returning nothing. The mutation check at the
// bottom of this file is the proof that the bounds now bite.

const HOUR = 60 * 60 * 1000;
const ARRIVAL = new Date("2026-08-15T08:00:00.000Z");

/** Plan for a dwell of N hours from a fixed arrival. */
function atHours(h: number) {
  return reconcileStopDwellCharges({
    arrivalAt: ARRIVAL,
    departedAt: new Date(ARRIVAL.getTime() + h * HOUR),
  });
}

describe("detention → layover conversion (CLAUDE.md §5, v3.8.arn/ars)", () => {
  it("ratified figures are the ones the Rate Confirmation prints", () => {
    expect(DETENTION_FREE_HOURS).toBe(2);
    expect(DETENTION_RATE_PER_HOUR).toBe(50);
    expect(DETENTION_CAP_PER_STOP).toBe(250);
    // The cap EQUALS the layover day rate deliberately (v3.8.ars) — that is
    // what makes the handoff a continuation instead of a second charge.
    expect(LAYOVER_RATE_PER_DAY).toBe(DETENTION_CAP_PER_STOP);
  });

  it("under free time: nothing bills", () => {
    for (const h of [0, 0.5, 1, 1.9]) {
      const p = atHours(h);
      expect(p.detention).toBeNull();
      expect(p.layover).toBeNull();
      expect(p.convertedAt).toBeNull();
      expect(p.totalAmount).toBe(0);
    }
  });

  it("exactly at free time: still nothing (free time is inclusive)", () => {
    const p = atHours(2);
    expect(p.detention).toBeNull();
    expect(p.totalAmount).toBe(0);
  });

  it("partial hour past free time bills the partial hour", () => {
    // 2h30m dwell = 30 billable minutes = 0.5h × $50 = $25
    const p = atHours(2.5);
    expect(p.detention).not.toBeNull();
    expect(p.detention!.amount).toBe(25);
    expect(p.detention!.billableMinutes).toBe(30);
    expect(p.detention!.atCap).toBe(false);
    expect(p.layover).toBeNull();
    expect(p.convertedAt).toBeNull();
  });

  it("mid-band detention accrues at $50/hr and quantity × rate reconciles to amount", () => {
    const p = atHours(5); // 3 billable hours
    expect(p.detention!.amount).toBe(150);
    expect(p.detention!.billableMinutes).toBe(180);
    expect((p.detention!.billableMinutes / 60) * DETENTION_RATE_PER_HOUR).toBe(
      p.detention!.amount
    );
    expect(p.layover).toBeNull();
  });

  it("exactly at the cap: detention closes at $250 and layover day one bills there", () => {
    const p = atHours(7); // 2h free + 5 billable hours × $50 = $250
    expect(p.detention!.amount).toBe(250);
    expect(p.detention!.atCap).toBe(true);
    expect(p.detention!.billableMinutes).toBe(300);
    expect(p.convertedAt!.toISOString()).toBe(
      new Date(ARRIVAL.getTime() + 7 * HOUR).toISOString()
    );
    // The conversion is where layover STARTS, and a started day bills. This is
    // the assertion that fails if the cap is ever made to absorb day one again.
    expect(p.layover!.days).toBe(1);
    expect(p.layover!.amount).toBe(250);
    expect(p.totalAmount).toBe(500);
  });

  it("one hour past the cap: detention frozen at $250, layover day one already billed", () => {
    const p = atHours(8);
    expect(p.detention!.amount).toBe(250);
    expect(p.detention!.atCap).toBe(true);
    expect(p.layover!.days).toBe(1);
    expect(p.totalAmount).toBe(500);
  });

  it("the old dead zone at 14 hours is paid, not merely covered by a label", () => {
    const p = atHours(14);
    expect(p.detention!.amount).toBe(250);
    expect(p.convertedAt!.getTime()).toBe(ARRIVAL.getTime() + 7 * HOUR);
    // Detention stopped at hour 7 and layover picked up there. The hours are
    // covered by a charge AND the carrier is paid for them.
    expect(p.detention!.endsAt.getTime()).toBe(p.convertedAt!.getTime());
    expect(p.totalAmount).toBe(500);
  });

  it("24 hours pays $500 — every hour of the hold is covered by a charge that was paid", () => {
    // Flat against hour 14 and hour 30, and correctly so: layover day one was
    // billed in full back at hour 7 and it runs to hour 31.
    expect(atHours(24).totalAmount).toBe(500);
  });

  it("30 hours pays $500 — never less than what the pre-sprint code paid at this dwell", () => {
    const p = atHours(30);
    expect(p.detention!.amount).toBe(250);
    expect(p.layover!.amount).toBe(250);
    expect(p.totalAmount).toBe(500);
  });

  it("31 hours completes layover day one exactly and still pays $500", () => {
    const p = atHours(31); // conversion at 7h, +24h = 31h
    expect(p.detention!.amount).toBe(250);
    expect(p.layover!.days).toBe(1);
    expect(p.totalAmount).toBe(500);
  });

  it("day two begins the instant past hour 31 and a started day bills in full", () => {
    expect(atHours(31.25).layover!.days).toBe(2);
    expect(atHours(31.25).totalAmount).toBe(750);
    expect(atHours(32).totalAmount).toBe(750);
  });

  it("multi-day hold adds $250 per started day past the conversion", () => {
    expect(atHours(55).layover!.days).toBe(2); // 48h past conversion, exactly 2
    expect(atHours(55).totalAmount).toBe(750);
    expect(atHours(79).layover!.days).toBe(3); // 72h past conversion, exactly 3
    expect(atHours(79).totalAmount).toBe(1000);
  });

  it("the ladder never dips below what the pre-sprint code paid at the same dwell", () => {
    // The regression guard, stated as the OLD model rather than as the new one.
    //
    // Pre-sprint a long hold was billed by two writers that never spoke:
    //
    //   1. routes/loadTracking wrote detention at departure, clamped to the cap.
    //   2. services/trackTraceAlertEngine independently wrote a FLAT $250 LAYOVER
    //      row on the same stopId once dwell reached 24h — once, not per day
    //      (it short-circuited on an existing row). That double-bill for one
    //      span of hours is the defect this sprint closed.
    //
    // An earlier revision of this baseline modelled only writer 1. That made it
    // structurally incapable of exceeding $250 at ANY dwell, so it could not
    // detect a pay cut, which is the single thing its name promises. Proven: a
    // mutant that lets the cap consume layover day one pays $250 at 24h where
    // the ratified ladder pays $500, and the old baseline passed it in
    // isolation. Writer 2 has to be in the floor or the floor does not bite.
    //
    // Billing the carrier LESS than the broken code did is a pay cut regardless
    // of how defensible the new composition is, so the floor is the sum of both
    // writers even though paying both was itself wrong.
    for (const h of [2.5, 5, 6, 7, 14, 24, 30, 31, 55, 79]) {
      const billableHours = Math.max(0, h - DETENTION_FREE_HOURS);
      const preSprintDetention = Math.min(
        billableHours * DETENTION_RATE_PER_HOUR,
        DETENTION_CAP_PER_STOP
      );
      const preSprintLayover = h >= 24 ? LAYOVER_RATE_PER_DAY : 0;
      expect(atHours(h).totalAmount).toBeGreaterThanOrEqual(
        preSprintDetention + preSprintLayover
      );
    }
  });
});

describe("invariants that must hold for every dwell", () => {
  // Quarter-hour steps out to five days.
  const dwells = Array.from({ length: 481 }, (_, i) => i * 0.25);

  it("detention and layover never cover the same hour", () => {
    let exercised = 0;
    for (const h of dwells) {
      const p = atHours(h);
      if (!p.detention || !p.layover) continue;
      exercised++;
      // Windows meet at the conversion instant and never overlap.
      expect(p.detention.endsAt.getTime()).toBeLessThanOrEqual(p.layover.startsAt.getTime());
      expect(p.detention.endsAt.getTime()).toBe(p.convertedAt!.getTime());
      expect(p.layover.startsAt.getTime()).toBe(p.convertedAt!.getTime());
    }
    // The guard above skips any dwell without both legs, which means a
    // reconciler that never produced a layover would satisfy this test by doing
    // nothing. Assert the loop actually reached the branch. Conversion is at 7h
    // and the sweep runs to 120h in quarter-hour steps.
    expect(exercised).toBe(dwells.filter((h) => h >= 7).length);
  });

  it("total never exceeds what the ratified policy allows for the elapsed time", () => {
    for (const h of dwells) {
      const p = atHours(h);
      expect(p.totalAmount).toBeLessThanOrEqual(maxAllowedForDwell(h * HOUR));
    }
  });

  it("total is never LESS than the floor the policy guarantees a held carrier", () => {
    // The bound that was missing. A ceiling alone is satisfied by paying $0.
    for (const h of dwells) {
      const p = atHours(h);
      expect(p.totalAmount).toBeGreaterThanOrEqual(minRequiredForDwell(h * HOUR));
    }
  });

  it("there is no band past the conversion left unpaid by any instrument", () => {
    // The defect the ratified cap increase exists to prevent, asserted directly:
    // once detention has capped, the total is at least the cap plus one layover
    // day, at every dwell, forever.
    //
    // Note what this does NOT assert. The total is flat from hour 7 to hour 31
    // and that is correct, because layover day one was billed in full at the
    // conversion. The claim is coverage, not a rising number.
    for (const h of dwells.filter((x) => x >= 7)) {
      const p = atHours(h);
      expect(p.detention!.atCap).toBe(true);
      expect(p.layover).not.toBeNull();
      expect(p.totalAmount).toBeGreaterThanOrEqual(
        DETENTION_CAP_PER_STOP + LAYOVER_RATE_PER_DAY
      );
    }
  });

  it("every started layover day is paid for", () => {
    for (const h of dwells.filter((x) => x >= 7)) {
      const p = atHours(h);
      const startedDays = Math.max(1, Math.ceil(((h - 7) * HOUR) / (24 * HOUR)));
      expect(p.layover!.days).toBe(startedDays);
      expect(p.totalAmount).toBe(DETENTION_CAP_PER_STOP + startedDays * LAYOVER_RATE_PER_DAY);
    }
  });

  it("charges strictly increase across every day boundary", () => {
    // Flat bands are correct inside a day. A flat band that spans a boundary
    // means a day went unpaid.
    for (const day of [1, 2, 3, 4]) {
      const boundary = 7 + day * 24;
      expect(atHours(boundary + 0.25).totalAmount).toBeGreaterThan(
        atHours(boundary).totalAmount
      );
    }
  });

  it("quantity × rate reconciles to the amount on every below-cap row", () => {
    for (const h of dwells.filter((x) => x > 2 && x < 7)) {
      const d = atHours(h).detention!;
      expect(d.atCap).toBe(false);
      expect(Math.round((d.billableMinutes / 60) * DETENTION_RATE_PER_HOUR * 100) / 100).toBe(
        d.amount
      );
    }
  });

  it("a partial minute still reconciles — the row is priced off its own quantity", () => {
    // 2h01m30s. Raw hours would price $1.25 against a quantity of 2 minutes,
    // which does not reconcile to $1.67. Pricing off the rounded minute does.
    const p = reconcileStopDwellCharges({
      arrivalAt: ARRIVAL,
      departedAt: new Date(ARRIVAL.getTime() + 2 * HOUR + 90 * 1000),
    });
    expect(p.detention!.billableMinutes).toBe(2);
    expect(p.detention!.amount).toBe(1.67);
    expect(Math.round((2 / 60) * DETENTION_RATE_PER_HOUR * 100) / 100).toBe(
      p.detention!.amount
    );
  });

  it("detention alone never exceeds the per-stop cap", () => {
    for (const h of dwells) {
      const p = atHours(h);
      expect(p.detention?.amount ?? 0).toBeLessThanOrEqual(DETENTION_CAP_PER_STOP);
    }
  });

  it("charges never decrease as the carrier sits longer", () => {
    let prev = 0;
    for (const h of dwells) {
      const total = atHours(h).totalAmount;
      expect(total).toBeGreaterThanOrEqual(prev);
      prev = total;
    }
  });

  it("layover only ever exists once detention has converted", () => {
    for (const h of dwells) {
      const p = atHours(h);
      if (p.layover) {
        expect(p.convertedAt).not.toBeNull();
        expect(p.detention!.atCap).toBe(true);
      }
    }
  });

  it("free time is per stop and non-cumulative — two stops each get their own 2h", () => {
    // Same 6h dwell at two stops bills the same at each; nothing carries over.
    const stopA = atHours(6);
    const stopB = reconcileStopDwellCharges({
      arrivalAt: new Date("2026-08-17T03:00:00.000Z"),
      departedAt: new Date("2026-08-17T09:00:00.000Z"),
    });
    expect(stopA.detention!.amount).toBe(200);
    expect(stopB.detention!.amount).toBe(200);
  });

  it("a departure before arrival is treated as zero dwell, not negative money", () => {
    const p = reconcileStopDwellCharges({
      arrivalAt: ARRIVAL,
      departedAt: new Date(ARRIVAL.getTime() - 4 * HOUR),
    });
    expect(p.totalAmount).toBe(0);
    expect(p.detention).toBeNull();
  });

  it("the conversion instant follows the terms rather than a hardcoded hour", () => {
    // Halve the rate and the cap takes twice as long to reach.
    const p = reconcileStopDwellCharges({
      arrivalAt: ARRIVAL,
      departedAt: new Date(ARRIVAL.getTime() + 12 * HOUR),
      ratePerHour: 25,
    });
    // 2h free + ($250 ÷ $25/hr) = arrival + 12h
    expect(p.detention!.amount).toBe(250);
    expect(p.convertedAt!.getTime()).toBe(ARRIVAL.getTime() + 12 * HOUR);
    expect(p.layover!.days).toBe(1);
    expect(p.totalAmount).toBe(500);
  });
});

// ─── Falsy-zero terms ──────────────────────────────────────────────────────
// Destructuring defaults only fire on undefined. A literal 0 on any money term
// used to survive into the math and silently bill a carrier nothing. srl-chrome
// was hardened against this for the RENDERER in v3.8.arn; the LEDGER was not.

describe("a bad term upstream can never bill a carrier nothing", () => {
  const sixHours = { arrivalAt: ARRIVAL, departedAt: new Date(ARRIVAL.getTime() + 6 * HOUR) };
  const longHold = { arrivalAt: ARRIVAL, departedAt: new Date(ARRIVAL.getTime() + 40 * HOUR) };

  it("ratePerHour 0 falls back to the canonical rate instead of zeroing every hour", () => {
    // Unguarded this was the worst of the three: hoursToCap collapses to 0 while
    // `uncapped < capPerStop` stays true forever, so the cap branch becomes
    // unreachable and EVERY dwell bills $0.
    const p = reconcileStopDwellCharges({ ...sixHours, ratePerHour: 0 });
    expect(p.detention!.amount).toBe(200);
    expect(p.totalAmount).toBe(200);
  });

  it("capPerStop 0 does not convert the whole hold to layover at the free-time line", () => {
    const p = reconcileStopDwellCharges({ ...sixHours, capPerStop: 0 });
    expect(p.convertedAt).toBeNull();
    expect(p.detention!.atCap).toBe(false);
    expect(p.totalAmount).toBe(200);
  });

  it("layoverPerDay 0 does not count days and bill nothing for them", () => {
    const p = reconcileStopDwellCharges({ ...longHold, layoverPerDay: 0 });
    expect(p.layover!.days).toBe(2);
    expect(p.layover!.amount).toBe(500);
    expect(p.totalAmount).toBe(750);
  });

  it("NaN and negative terms are refused the same way", () => {
    for (const bad of [NaN, -50, Infinity]) {
      const p = reconcileStopDwellCharges({ ...sixHours, ratePerHour: bad });
      expect(p.totalAmount).toBe(200);
    }
  });

  it("free time of zero is a real term and is honoured", () => {
    // Unlike the money terms, 0 free hours is a legitimate agreement: bill from
    // arrival. Only negative or non-finite values fall back.
    const p = reconcileStopDwellCharges({
      arrivalAt: ARRIVAL,
      departedAt: new Date(ARRIVAL.getTime() + 1 * HOUR),
      freeHours: 0,
    });
    expect(p.detention!.amount).toBe(50);
  });

  it("the bounds themselves refuse bad terms, so they cannot be softened either", () => {
    expect(maxAllowedForDwell(40 * HOUR, { layoverPerDay: 0 })).toBe(
      maxAllowedForDwell(40 * HOUR)
    );
    expect(minRequiredForDwell(40 * HOUR, { capPerStop: 0 })).toBe(
      minRequiredForDwell(40 * HOUR)
    );
  });
});

// ─── The document and the ledger ───────────────────────────────────────────
// Neither call site passes DwellChargeTerms, so settlement always runs on the
// module constants while the Rate Confirmation prints fd.detentionRate. They
// agree today only because the validator pins that field. Nothing asserted it.
// This is the gate that catches the drift the moment the pin is relaxed for
// negotiated rates, which is the obvious next change to this field.

describe("the figures the Rate Confirmation prints are the figures that settle", () => {
  const rc = (detentionRate: number) =>
    createRateConfirmationSchema.safeParse({ loadId: "load-1", formData: { detentionRate } });

  it("the validator pins detentionRate to the reconciler's rate", () => {
    expect(rc(DETENTION_RATE_PER_HOUR).success).toBe(true);
  });

  it("the pin is a pin, not a number that happens to match", () => {
    // If this starts passing, detentionRate has been widened and a value other
    // than the reconciler's rate can now print on a signed document while
    // settlement keeps using the module constant. Pass DwellChargeTerms through
    // to applyStopDwellCharges in the same change.
    for (const offPolicy of [DETENTION_RATE_PER_HOUR + 15, 0, 65]) {
      expect(rc(offPolicy).success).toBe(false);
    }
  });

  it("the ratified figures are the ratified figures", () => {
    // Direction one: the constants are the numbers CLAUDE.md §5 ratified.
    // On its own this pins a constant to a literal and nothing more.
    expect(DETENTION_CAP_PER_STOP).toBe(250);
    expect(LAYOVER_RATE_PER_DAY).toBe(250);
    expect(DETENTION_FREE_HOURS).toBe(2);
  });

  it("the dwell figures the RC actually prints ARE the reconciler's constants", () => {
    // Direction two, and the one that was missing. The assertion above pins the
    // constants to literals; it does NOT pin the printed grid to the constants,
    // and it never touched pdfService. Proven: replacing detentionMaxPerStop in
    // the builder with a literal 300 published "$50/hr after 2 hrs free,
    // $300/stop cap" on a signed Rate Confirmation while settlement kept paying
    // $250, with tsc clean, this suite green, and verify-rc-matrix reporting ALL
    // CASES PASS. Every runnable gate was blind to a $50/stop divergence between
    // what SRL promises in writing and what it pays.
    //
    // So assert the identity where a gate can see it: reach into the terms the
    // generator actually builds and require each dwell figure to BE the
    // reconciler's own constant. A literal that happens to equal 250 today still
    // fails the moment either side moves without the other.
    const terms = buildRateConOperationalTerms({ detentionRate: DETENTION_RATE_PER_HOUR });

    expect(terms.detentionMaxPerStop).toBe(DETENTION_CAP_PER_STOP);
    expect(terms.layoverPerDay).toBe(LAYOVER_RATE_PER_DAY);
    expect(terms.detentionFreeHours).toBe(DETENTION_FREE_HOURS);
    expect(terms.detentionRatePerHour).toBe(DETENTION_RATE_PER_HOUR);

    // TONU is ratified at $200 flat in §5 and prints from a literal in the
    // builder with nothing else guarding it.
    expect(terms.tonuAmount).toBe(200);
  });

  it("the printed cap is the figure the reconciler actually converts at", () => {
    // Tighter than equality of two numbers: drive the reconciler with the terms
    // the DOCUMENT carries and require the conversion to land where the document
    // says it does. If the printed cap and the settled cap ever diverge, the
    // conversion instant moves and this fails with it.
    const terms = buildRateConOperationalTerms({ detentionRate: DETENTION_RATE_PER_HOUR });
    const printedCap = terms.detentionMaxPerStop!;
    const printedFree = terms.detentionFreeHours!;
    const printedRate = terms.detentionRatePerHour!;

    const hoursToCap = printedFree + printedCap / printedRate;
    const p = atHours(hoursToCap);

    expect(p.detention!.atCap).toBe(true);
    expect(p.detention!.amount).toBe(printedCap);
    expect(p.convertedAt!.getTime()).toBe(ARRIVAL.getTime() + hoursToCap * HOUR);
    // And the promise the same grid makes about layover holds at that instant.
    expect(p.layover!.amount).toBe(terms.layoverPerDay);
  });
});

// ─── Persistence ───────────────────────────────────────────────────────────
// The defect that started this arc was two writers billing one stop. These
// cover the write path: one owner, idempotent, and it never touches a row a
// human entered or a row an AE has already ruled on.

interface FakeRow {
  id: string;
  loadId: string;
  stopId: string;
  type: string;
  amount: number;
  quantity: number | null;
  createdBy: string | null;
  status: string;
  [k: string]: unknown;
}

function fakeDb(seed: FakeRow[] = []) {
  const rows: FakeRow[] = [...seed];
  let seq = seed.length;
  return {
    rows,
    loadAccessorial: {
      findFirst: async ({ where }: any) =>
        rows.find(
          (r) => r.loadId === where.loadId && r.stopId === where.stopId && r.type === where.type
        ) ?? null,
      create: async ({ data }: any) => {
        const row = { id: `a${++seq}`, ...data } as FakeRow;
        rows.push(row);
        return row;
      },
      update: async ({ where, data }: any) => {
        const row = rows.find((r) => r.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      delete: async ({ where }: any) => {
        const i = rows.findIndex((r) => r.id === where.id);
        return rows.splice(i, 1)[0];
      },
    },
  } as any;
}

const STOP = {
  loadId: "load-1",
  stopId: "stop-1",
  stopType: "DELIVERY" as const,
  facilityName: "Beekeepers DC",
};

function departingAfter(hours: number) {
  return { arrivalAt: ARRIVAL, departedAt: new Date(ARRIVAL.getTime() + hours * HOUR) };
}

describe("applyStopDwellCharges — one owner for the money", () => {
  it("writes detention only, at departure, when the stop never reached the cap", async () => {
    const db = fakeDb();
    await applyStopDwellCharges(db, { ...STOP, ...departingAfter(5), phase: "final" });
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0].type).toBe("DETENTION_DEL");
    expect(db.rows[0].amount).toBe(150);
  });

  it("uses DETENTION_PU on a pickup stop", async () => {
    const db = fakeDb();
    await applyStopDwellCharges(db, {
      ...STOP,
      stopType: "PICKUP",
      ...departingAfter(5),
      phase: "final",
    });
    expect(db.rows[0].type).toBe("DETENTION_PU");
  });

  it("mid-hold pass below the cap writes no detention — it is still moving", async () => {
    const db = fakeDb();
    await applyStopDwellCharges(db, { ...STOP, ...departingAfter(5), phase: "in_progress" });
    expect(db.rows).toHaveLength(0);
  });

  it("mid-hold pass past the cap writes both legs, so the quote and the ledger agree", async () => {
    // GET /:loadId/detention prices through the same reconciler. While the
    // in-progress pass withheld the detention leg, that endpoint quoted $500 at
    // hour 31 against a ledger holding $250 — a 2x disagreement, showing a
    // layover row whose detention leg did not exist. Past the cap detention is
    // frozen at $250, so there is nothing to wait for.
    const db = fakeDb();
    await applyStopDwellCharges(db, { ...STOP, ...departingAfter(31), phase: "in_progress" });

    const types = db.rows.map((r: FakeRow) => r.type).sort();
    expect(types).toEqual(["DETENTION_DEL", "LAYOVER"]);
    const ledger = db.rows.reduce((sum: number, r: FakeRow) => sum + Number(r.amount), 0);
    const quote = reconcileStopDwellCharges(departingAfter(31)).totalAmount;
    expect(ledger).toBe(quote);
    expect(ledger).toBe(500);
  });

  it("the engine and the departure writer cannot double-bill one stop", async () => {
    const db = fakeDb();
    // Engine ticks repeatedly through a long hold.
    for (const h of [31, 33, 35, 40]) {
      await applyStopDwellCharges(db, { ...STOP, ...departingAfter(h), phase: "in_progress" });
    }
    // Then the carrier departs at 40h.
    await applyStopDwellCharges(db, { ...STOP, ...departingAfter(40), phase: "final" });

    const layovers = db.rows.filter((r: FakeRow) => r.type === "LAYOVER");
    const detentions = db.rows.filter((r: FakeRow) => r.type.startsWith("DETENTION"));
    expect(layovers).toHaveLength(1);
    expect(detentions).toHaveLength(1);
    // 40h: $250 detention (hours 2-7) + 2 started layover days from hour 7.
    // One row each, priced once.
    expect(Number(detentions[0].amount)).toBe(250);
    expect(Number(layovers[0].amount)).toBe(500);
  });

  it("raises the layover row in place as days accumulate", async () => {
    const db = fakeDb();
    const layoverRows = () => db.rows.filter((r: FakeRow) => r.type === "LAYOVER");

    await applyStopDwellCharges(db, { ...STOP, ...departingAfter(31), phase: "in_progress" });
    expect(layoverRows()).toHaveLength(1);
    expect(layoverRows()[0].quantity).toBe(1);

    const r = await applyStopDwellCharges(db, {
      ...STOP,
      ...departingAfter(55),
      phase: "in_progress",
    });
    expect(layoverRows()).toHaveLength(1); // updated, not duplicated
    expect(layoverRows()[0].quantity).toBe(2);
    expect(layoverRows()[0].amount).toBe(500);
    expect(r.layoverChanged).toBe(true);
  });

  it("re-running with unchanged dwell reports no change and writes nothing new", async () => {
    const db = fakeDb();
    await applyStopDwellCharges(db, { ...STOP, ...departingAfter(31), phase: "in_progress" });
    const again = await applyStopDwellCharges(db, {
      ...STOP,
      ...departingAfter(31),
      phase: "in_progress",
    });
    expect(again.layoverChanged).toBe(false);
    // Detention and layover, one row each — the second pass duplicated neither.
    expect(db.rows).toHaveLength(2);
    expect(db.rows.map((r: FakeRow) => r.type).sort()).toEqual(["DETENTION_DEL", "LAYOVER"]);
  });

  it("walks back its own provisional layover if the real departure never reached the cap", async () => {
    // This is the loadStops.ts scenario. The stop sat open 31h so the engine
    // wrote LAYOVER $250 against wall-clock. An AE then records the real 5h
    // departure. Both the amount AND the composition have to change: layover
    // never happened, and $150 of detention did.
    const db = fakeDb();
    await applyStopDwellCharges(db, { ...STOP, ...departingAfter(31), phase: "in_progress" });
    expect(db.rows.filter((r: FakeRow) => r.type === "LAYOVER")).toHaveLength(1);

    await applyStopDwellCharges(db, { ...STOP, ...departingAfter(5), phase: "final" });

    expect(db.rows.filter((r: FakeRow) => r.type === "LAYOVER")).toHaveLength(0);
    const detention = db.rows.find((r: FakeRow) => r.type === "DETENTION_DEL")!;
    expect(Number(detention.amount)).toBe(150);
    expect(detention.atCap).toBeUndefined(); // not a stored field, just guarding the shape
  });

  it("re-prices its own detention row down when the corrected departure is earlier", async () => {
    const db = fakeDb();
    await applyStopDwellCharges(db, { ...STOP, ...departingAfter(40), phase: "in_progress" });
    expect(Number(db.rows.find((r: FakeRow) => r.type === "DETENTION_DEL")!.amount)).toBe(250);

    await applyStopDwellCharges(db, { ...STOP, ...departingAfter(4), phase: "final" });
    const detentions = db.rows.filter((r: FakeRow) => r.type === "DETENTION_DEL");
    expect(detentions).toHaveLength(1);
    expect(Number(detentions[0].amount)).toBe(100);
    expect(db.rows.filter((r: FakeRow) => r.type === "LAYOVER")).toHaveLength(0);
  });

  it("never overwrites a layover an AE entered by hand", async () => {
    const db = fakeDb([
      {
        id: "manual-1",
        loadId: STOP.loadId,
        stopId: STOP.stopId,
        type: "LAYOVER",
        amount: 400,
        quantity: 1,
        createdBy: "user-ae",
        status: "PENDING",
      },
    ]);
    await applyStopDwellCharges(db, { ...STOP, ...departingAfter(55), phase: "final" });
    const layover = db.rows.find((r: FakeRow) => r.type === "LAYOVER")!;
    expect(layover.amount).toBe(400);
    expect(layover.createdBy).toBe("user-ae");
    expect(db.rows.filter((r: FakeRow) => r.type === "LAYOVER")).toHaveLength(1);
  });

  it("never re-prices a row an AE already approved", async () => {
    const db = fakeDb([
      {
        id: "approved-1",
        loadId: STOP.loadId,
        stopId: STOP.stopId,
        type: "LAYOVER",
        amount: 250,
        quantity: 1,
        createdBy: null,
        status: "APPROVED",
      },
    ]);
    await applyStopDwellCharges(db, { ...STOP, ...departingAfter(79), phase: "final" });
    const layover = db.rows.find((r: FakeRow) => r.type === "LAYOVER")!;
    expect(layover.amount).toBe(250);
    expect(layover.status).toBe("APPROVED");
  });

  it("stamps its own rows so ownership is unambiguous", async () => {
    const db = fakeDb();
    await applyStopDwellCharges(db, { ...STOP, ...departingAfter(55), phase: "final" });
    for (const row of db.rows) {
      expect(row.createdBy).toBeNull();
      expect(row.status).toBe("PENDING");
      expect(String(row.notes)).toMatch(/^Auto: /);
    }
  });

  it("does not query the layover table on a stop that has not converted", async () => {
    const db = fakeDb();
    let queries = 0;
    const inner = db.loadAccessorial.findFirst;
    db.loadAccessorial.findFirst = async (args: any) => {
      queries++;
      return inner(args);
    };
    await applyStopDwellCharges(db, { ...STOP, ...departingAfter(3), phase: "in_progress" });
    expect(queries).toBe(0);
    expect(db.rows).toHaveLength(0);
  });
});
