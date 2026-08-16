/**
 * Detention → layover reconciliation for ONE stop.
 *
 * The signed Rate Confirmation promises this in writing (pdfService.ts
 * `governingClauses`, v3.8.ars):
 *
 *   "At the $250 per stop cap detention converts to layover at $250 per day;
 *    the two do not stack for the same hours."
 *
 * Nothing performed that conversion. Three writers each owned a piece of the
 * money and none of them talked to each other:
 *
 *   - routes/loadTracking.ts wrote DETENTION_PU / DETENTION_DEL at departure,
 *     clamped to the cap, and stopped there.
 *   - services/trackTraceAlertEngine.ts independently wrote a LAYOVER row on
 *     the SAME stopId once dwell passed 24h.
 *   - Neither reconciled against the other.
 *
 * The result on a real hold: detention dead-ended at the cap around hour 7,
 * layover did not fire until hour 24, so hours 7→24 accrued nothing while the
 * document said layover was already running. Then past hour 24 both rows
 * existed on one stop covering one span of hours — $500 where the document
 * says $250.
 *
 * ─── The model this file implements ────────────────────────────────────────
 *
 * A stop's dwell splits into three windows, and each hour belongs to exactly
 * one of them:
 *
 *   [arrival, arrival+2h)          free time. Not billable.
 *   [arrival+2h, conversion)       detention at $50/hr.
 *   [conversion, departure)        layover at $250/day.
 *
 * `conversion` is the instant detention reaches the cap: 2h free + ($250 ÷
 * $50/hr) = 5 billable hours = arrival + 7h. It is derived, never hardcoded,
 * so changing the cap or the rate moves the handoff with it.
 *
 * The cap payment does NOT absorb layover day one. Detention bills $250 for the
 * hours it covers — arrival+2h to arrival+7h — and layover bills its own day
 * one starting AT the conversion instant. Those are different hours, so billing
 * both is not stacking. Each further started 24h past conversion adds $250.
 *
 * An earlier revision of this file made the cap CONSUME layover day one, so the
 * ladder sat flat at $250 from hour 7 to hour 31 and a 30-hour hold paid $250.
 * That reopened the exact gap the ratified rationale exists to close: "at $200
 * detention stopped accruing at billable hour 4 while auto-layover only fired
 * at hour 24, leaving an 18-hour gap where a held carrier earned nothing."
 * Moving the cap to $250 without also starting layover at the conversion just
 * relocated the dead band from hours 4-24 to hours 7-31. It also contradicted
 * what SRL teaches drivers in data/trainingCurriculum.ts: "The cap and the
 * layover day rate are set equal on purpose so a long hold never leaves you
 * earning nothing while you sit." The correct reading of "equal on purpose" is
 * that a day of waiting is worth the same number whichever instrument pays it,
 * not that the second instrument starts out already paid.
 *
 * The ladder this file produces at a single stop:
 *
 *    6h → $200   detention only, still accruing
 *    7h → $500   cap reached. $250 detention + $250 layover day one
 *   14h → $500
 *   24h → $500
 *   30h → $500
 *   31h → $500   layover day one runs [7h, 31h] and is exactly complete here
 *   32h → $750   day two has started
 *   55h → $750
 *   79h → $1000
 *
 * A started layover day bills a full day, matching how every published broker
 * schedule handles it and matching `maxAllowedForDwell` below. Day two therefore
 * begins the instant past hour 31, not at hour 32 — 32h is quoted above because
 * it is the round number on the far side of that boundary.
 *
 * What this ladder does NOT do is add money for every further hour the carrier
 * sits, and nothing here should claim it does. Hours 7 through 31 are flat at
 * $500. A carrier held 14 hours and a carrier held 30 hours are paid the same.
 *
 * That band is defensible, for a specific reason: those hours are not unpaid,
 * they are PREPAID in full at the conversion instant, because a started layover
 * day bills as a whole day. That is the exact opposite of the pre-sprint defect,
 * where the hours past the cap were covered by no instrument at all and a held
 * carrier genuinely earned nothing for sitting through them.
 *
 * So the provable claim, and the one the tests assert, is that there is no
 * UNPAID band. It is not that a held carrier earns continuously. The distinction
 * is worth the paragraph because the next reader will check these comments
 * against the code, and a comment that overstates the guarantee is the reason
 * someone eventually "fixes" a flat band that was correct.
 *
 * Three properties hold for every input and are asserted in the unit tests:
 *   1. Detention and layover never cover the same hour.
 *   2. Total never exceeds what the policy ceiling allows for the elapsed time.
 *   3. Total is never LESS than the policy floor. Property 3 is the one that
 *      fails on a mutant with the conversion removed, and it is why the tests
 *      carry lower bounds and not only upper bounds.
 *
 * ─── Not handled here (deliberately) ───────────────────────────────────────
 * The RC also says detention is not payable if the carrier arrives outside the
 * appointment window. No writer checks that today. It is a separate defect and
 * a separate money decision; this file takes arrival as given.
 */

import type { PrismaClient } from "@prisma/client";

const MS_PER_HOUR = 60 * 60 * 1000;
const MS_PER_MINUTE = 60 * 1000;
const MS_PER_DAY = 24 * MS_PER_HOUR;

// Canonical figures — CLAUDE.md §5, principal-ratified 2026-08-14 (v3.8.arn,
// amended v3.8.ars). Flat: no tier and no equipment differentiation.
export const DETENTION_FREE_HOURS = 2;
export const DETENTION_RATE_PER_HOUR = 50;
export const DETENTION_CAP_PER_STOP = 250;
export const LAYOVER_RATE_PER_DAY = 250;

export interface DwellChargeTerms {
  freeHours?: number;
  ratePerHour?: number;
  capPerStop?: number;
  layoverPerDay?: number;
}

export interface DwellChargeInput extends DwellChargeTerms {
  arrivalAt: Date;
  /** Departure, or "now" while the stop is still open. */
  departedAt: Date;
}

export interface DetentionLeg {
  /** Dollars. Never exceeds the per-stop cap. */
  amount: number;
  /**
   * Minutes the charge covers. This is the row's `quantity`, so an AE reading
   * the row can check the arithmetic: (billableMinutes ÷ 60) × rate === amount,
   * exact to the cent, for every dwell below the cap. At the cap `amount` is the
   * cap by definition, so the identity holds only to the value of the one minute
   * `billableMinutes` is rounded to — a cent or two when cap ÷ rate does not land
   * on a whole minute. It is exact at the ratified $250 ÷ $50/hr = 300 minutes.
   */
  billableMinutes: number;
  /** arrival + free time. */
  startsAt: Date;
  /** Departure, or the conversion instant once the cap is reached. */
  endsAt: Date;
  atCap: boolean;
}

export interface LayoverLeg {
  /** Dollars. days × layoverPerDay. */
  amount: number;
  /**
   * Started 24h blocks from the conversion instant. Day one starts AT the
   * conversion and is billed there, so this is never 0 once detention has
   * capped.
   */
  days: number;
  startsAt: Date;
  endsAt: Date;
}

export interface DwellChargePlan {
  dwellMinutes: number;
  detention: DetentionLeg | null;
  layover: LayoverLeg | null;
  /** The instant detention hit the cap and handed off, or null if it never did. */
  convertedAt: Date | null;
  /** detention + layover. */
  totalAmount: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Destructuring defaults only fire on `undefined`, so a literal 0 reaching any
 * of the money terms is kept and quietly poisons the math:
 *
 *   ratePerHour: 0    → hoursToCap 0, but `uncapped < capPerStop` stays true
 *                       forever, so the cap branch is unreachable and every
 *                       dwell bills $0.
 *   capPerStop: 0     → conversion at the free-time boundary; the whole hold
 *                       reclassifies to layover.
 *   layoverPerDay: 0  → days are counted and billed at nothing while the alert
 *                       engine announces "$0" to the AE.
 *
 * srl-chrome.ts hardened the RENDERER against exactly this in v3.8.arn. The
 * LEDGER was left open. Same rule here: a non-positive or non-finite money term
 * is not a term, it is a bad write upstream, and the canonical figure stands.
 */
function money(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Free time is the one term where 0 is a real answer — a shipper with no free
 * time bills from arrival. Only negative or non-finite values are refused.
 */
function freeTime(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Reconcile one stop's dwell into the accessorial rows that should exist.
 *
 * Pure. Same inputs always produce the same plan, which is what makes the
 * money on a signed document testable.
 */
export function reconcileStopDwellCharges(input: DwellChargeInput): DwellChargePlan {
  const { arrivalAt, departedAt } = input;
  const freeHours = freeTime(input.freeHours, DETENTION_FREE_HOURS);
  const ratePerHour = money(input.ratePerHour, DETENTION_RATE_PER_HOUR);
  const capPerStop = money(input.capPerStop, DETENTION_CAP_PER_STOP);
  const layoverPerDay = money(input.layoverPerDay, LAYOVER_RATE_PER_DAY);

  const arrivalMs = arrivalAt.getTime();
  const dwellMs = Math.max(0, departedAt.getTime() - arrivalMs);
  const dwellMinutes = Math.round(dwellMs / MS_PER_MINUTE);

  const freeMs = freeHours * MS_PER_HOUR;

  const empty: DwellChargePlan = {
    dwellMinutes,
    detention: null,
    layover: null,
    convertedAt: null,
    totalAmount: 0,
  };

  // Inside free time — including landing exactly on it — costs nothing.
  if (dwellMs <= freeMs) return empty;

  // Hours it takes to reach the cap, derived from the rate so the handoff
  // follows the numbers instead of a second hardcoded constant. `money()` above
  // guarantees ratePerHour > 0, so this cannot divide by zero.
  const hoursToCap = capPerStop / ratePerHour;
  const conversionMs = freeMs + hoursToCap * MS_PER_HOUR;

  const billableMs = dwellMs - freeMs;

  // Price off the rounded minute count, not raw milliseconds, so the row an AE
  // reads reconciles: (quantity ÷ 60) × rate === amount. Deciding the cap branch
  // on the same rounded figure keeps a dwell that rounds up to exactly the cap
  // out of the below-cap branch, where it would have produced a leg sitting at
  // the cap with atCap false and no layover behind it.
  const billableMinutes = Math.round(billableMs / MS_PER_MINUTE);
  const uncapped = round2((billableMinutes / 60) * ratePerHour);

  const detentionStartsAt = new Date(arrivalMs + freeMs);

  // Below the cap: detention only. No conversion, no layover.
  if (uncapped < capPerStop) {
    const detention: DetentionLeg = {
      amount: uncapped,
      billableMinutes,
      startsAt: detentionStartsAt,
      endsAt: new Date(departedAt.getTime()),
      atCap: false,
    };
    return { ...empty, detention, totalAmount: detention.amount };
  }

  // At or past the cap: detention closes at exactly the cap and layover opens
  // at that same instant. The two windows meet, they never overlap.
  const convertedAt = new Date(arrivalMs + conversionMs);
  const detention: DetentionLeg = {
    amount: round2(capPerStop),
    billableMinutes: Math.round(hoursToCap * 60),
    startsAt: detentionStartsAt,
    endsAt: convertedAt,
    atCap: true,
  };

  // Layover day one starts AT the conversion and bills there. The cap paid for
  // the hours before the conversion; it does not also pay for the day after it.
  // Each further started 24h adds a day, so the step lands the instant past
  // conversion + 24h rather than a full day later.
  const postConversionMs = dwellMs - conversionMs;
  const days = Math.max(1, Math.ceil(postConversionMs / MS_PER_DAY));

  const layover: LayoverLeg = {
    amount: round2(days * layoverPerDay),
    days,
    startsAt: convertedAt,
    endsAt: new Date(departedAt.getTime()),
  };

  return {
    dwellMinutes,
    detention,
    layover,
    convertedAt,
    totalAmount: round2(detention.amount + layover.amount),
  };
}

/**
 * Ceiling the ratified policy allows for a given dwell.
 *
 * Deliberately loose below the cap — it says "no more than the cap" where the
 * actual accrual may be a fraction of that — because an upper bound that tracks
 * the implementation exactly is not a bound, it is a copy. Its job is to catch
 * OVER-billing, and it is paired with `minRequiredForDwell` because on its own
 * it is satisfied by returning $0.
 */
export function maxAllowedForDwell(dwellMs: number, terms: DwellChargeTerms = {}): number {
  const freeHours = freeTime(terms.freeHours, DETENTION_FREE_HOURS);
  const ratePerHour = money(terms.ratePerHour, DETENTION_RATE_PER_HOUR);
  const capPerStop = money(terms.capPerStop, DETENTION_CAP_PER_STOP);
  const layoverPerDay = money(terms.layoverPerDay, LAYOVER_RATE_PER_DAY);

  const freeMs = freeHours * MS_PER_HOUR;
  if (dwellMs <= freeMs) return 0;

  const conversionMs = freeMs + (capPerStop / ratePerHour) * MS_PER_HOUR;
  if (dwellMs < conversionMs) return capPerStop;

  const days = Math.max(1, Math.ceil((dwellMs - conversionMs) / MS_PER_DAY));
  return round2(capPerStop + days * layoverPerDay);
}

/**
 * Floor the ratified policy guarantees a held carrier for a given dwell.
 *
 * This is the bound that matters, and the one that was missing. Every invariant
 * in the original test file was an upper bound or went vacuous when layover was
 * null, so a reconciler that returned $0 for every hold satisfied all of them.
 * A suite that cannot fail in the direction of the defect is not a gate.
 *
 * Stated as policy rather than as a copy of the implementation:
 *
 *   - Inside free time nothing is owed.
 *   - Past free time and short of the cap, detention has accrued and the carrier
 *     is owed at least the whole minutes elapsed at the agreed rate.
 *   - At or past the cap the carrier is ON LAYOVER. The cap is fully earned and
 *     layover day one is earned at the conversion instant. That is the floor the
 *     ratified rationale exists to guarantee: no band where a held carrier sits
 *     under an hour that no instrument has paid for. Flat is fine, because a
 *     started layover day is prepaid in full. Unpaid is not.
 *
 * It deliberately stops counting after day one. Extra days are asserted by the
 * explicit ladder cases in the tests, which keeps this function a statement
 * about policy instead of a second implementation that would agree with a
 * broken reconciler by construction.
 */
export function minRequiredForDwell(dwellMs: number, terms: DwellChargeTerms = {}): number {
  const freeHours = freeTime(terms.freeHours, DETENTION_FREE_HOURS);
  const ratePerHour = money(terms.ratePerHour, DETENTION_RATE_PER_HOUR);
  const capPerStop = money(terms.capPerStop, DETENTION_CAP_PER_STOP);
  const layoverPerDay = money(terms.layoverPerDay, LAYOVER_RATE_PER_DAY);

  const freeMs = freeHours * MS_PER_HOUR;
  if (dwellMs <= freeMs) return 0;

  const conversionMs = freeMs + (capPerStop / ratePerHour) * MS_PER_HOUR;
  if (dwellMs >= conversionMs) return round2(capPerStop + layoverPerDay);

  // Whole minutes only, so this stays under the reconciler's rounded minute
  // count rather than racing it.
  const wholeMinutes = Math.floor((dwellMs - freeMs) / MS_PER_MINUTE);
  return Math.floor((wholeMinutes / 60) * ratePerHour * 100) / 100;
}

// ─── Persistence ───────────────────────────────────────────────────────────
// Both writers call this. Nothing else creates DETENTION_* or LAYOVER rows for
// a stop, which is the whole point: one owner for the money.

export type DwellPhase = "in_progress" | "final";

export interface ApplyDwellChargesInput extends DwellChargeTerms {
  loadId: string;
  stopId: string;
  stopType: "PICKUP" | "DELIVERY" | string;
  arrivalAt: Date;
  departedAt: Date;
  /**
   * "final" at departure — writes both legs against the reported departure.
   * "in_progress" mid-hold — writes layover, and writes detention too once it
   * has capped. Past the cap the detention figure is frozen: it is $250 no
   * matter how much longer the carrier sits. Withholding it mid-hold was what
   * made GET /:loadId/detention quote $500 at hour 31 while the ledger held
   * $250 and showed a layover row whose detention leg did not exist. Below the
   * cap detention is still moving, so it is left alone rather than rewritten on
   * every engine tick.
   */
  phase: DwellPhase;
  facilityName?: string | null;
}

/**
 * Rows this reconciler owns are stamped with a null createdBy. Every manual
 * accessorial goes through POST /load-accessorials, which always writes the
 * acting user's id, so the null is an unambiguous "the system wrote this".
 * The reconciler only ever mutates its own rows — an AE who hand-enters a
 * layover keeps it, and a row someone already approved or rejected is never
 * silently re-priced.
 */
const SYSTEM_OWNED = { createdBy: null, status: "PENDING" } as const;

export interface ApplyDwellChargesResult {
  plan: DwellChargePlan;
  detentionWritten: boolean;
  /** True only when a layover row was created or its day count increased. */
  layoverChanged: boolean;
  layoverDays: number;
}

/**
 * Write the reconciled rows for one stop, idempotently.
 *
 * Safe to call repeatedly and safe to call from both writers on the same stop:
 * rows are matched on (loadId, stopId, type) and updated in place rather than
 * duplicated. A row an AE has already approved or rejected is left alone —
 * automation does not silently re-price a decision a human made.
 *
 * ─── KNOWN GAP: idempotent against sequential calls, NOT against concurrent
 *     ones. Needs a migration, so it is stated here rather than fixed here. ───
 *
 * Every branch below is findFirst-then-create across an `await`, with no
 * transaction and no uniqueness in the database to fall back on. `LoadAccessorial`
 * (prisma/schema.prisma) carries only:
 *
 *     @@index([loadId])
 *     @@index([status])
 *
 * Neither is unique, so nothing stops two rows of the same type existing on one
 * stop. Interleave two callers on a single 31h stop and both findFirst calls
 * return null before either create lands: two DETENTION rows and two LAYOVER
 * rows, $1000 on a stop the ratified schedule prices at $500.
 *
 * Reachability is rising, not falling. This function had two entry points when
 * it was written. The loadStops fix took it to four, and routing geofence
 * departure through it takes it to five:
 *
 *     routes/loadStops.ts          (AE stop edit, ×1)
 *     routes/loadTracking.ts       (carrier status writes, ×2)
 *     services/trackTraceAlertEngine.ts  (cron, every open stop, every tick)
 *     services/geofenceService.ts  (cron scan + ELD webhook)
 *
 * The cron and the webhook are the realistic collision: `scanGeofences` and the
 * alert engine can both be mid-sweep over the same stop, and `processGpsUpdate`
 * fires on inbound ELD pings independent of either.
 *
 * The fix is a two-part change and both parts are required:
 *
 *   1. Migration — a partial unique index, so the database refuses the second
 *      row even if the application logic is bypassed:
 *
 *          @@unique([loadId, stopId, type], name: "load_accessorial_stop_type")
 *
 *      `stopId` is nullable and load-level accessorials legitimately repeat with
 *      a null stopId, so in Postgres this must be a PARTIAL index:
 *
 *          CREATE UNIQUE INDEX CONCURRENTLY load_accessorial_stop_type
 *            ON load_accessorials (load_id, stop_id, type)
 *            WHERE stop_id IS NOT NULL;
 *
 *      Prisma cannot express the WHERE clause, so the index is authored in raw
 *      SQL in the migration and the model carries a comment pointing at it.
 *      Back-fill first: the index will not build while duplicates already exist.
 *
 *   2. This function — replace each findFirst-then-create pair with an `upsert`
 *      on that unique target, and wrap the detention and layover passes in a
 *      single `db.$transaction` so a stop is never left with one leg written and
 *      the other lost. The `Pick<PrismaClient, "loadAccessorial">` parameter
 *      widens to include `$transaction`, and the ownership guards
 *      (`createdBy === null && status === "PENDING"`) move into the update half
 *      of the upsert so a human-entered or already-approved row is still never
 *      touched.
 */
export async function applyStopDwellCharges(
  db: Pick<PrismaClient, "loadAccessorial">,
  input: ApplyDwellChargesInput
): Promise<ApplyDwellChargesResult> {
  const {
    loadId,
    stopId,
    stopType,
    arrivalAt,
    departedAt,
    phase,
    facilityName,
    ...terms
  } = input;

  const plan = reconcileStopDwellCharges({ arrivalAt, departedAt, ...terms });
  // Same guards the reconciler applies, so a bad term cannot make the ledger and
  // the row's printed rate disagree.
  const layoverPerDay = money(terms.layoverPerDay, LAYOVER_RATE_PER_DAY);
  const ratePerHour = money(terms.ratePerHour, DETENTION_RATE_PER_HOUR);

  let detentionWritten = false;
  let layoverChanged = false;

  // Detention is settled at departure, and also settled mid-hold once it has
  // capped, because past the cap the number cannot move. Writing it at that
  // point is what keeps the mid-hold quote and the ledger from disagreeing.
  const detentionIsSettled = plan.detention !== null && (phase === "final" || plan.detention.atCap);

  if (detentionIsSettled && plan.detention) {
    const detentionType = stopType === "PICKUP" ? "DETENTION_PU" : "DETENTION_DEL";
    const existing = await db.loadAccessorial.findFirst({
      where: { loadId, stopId, type: detentionType as any },
    });

    const facility = facilityName || "stop";
    const data = {
      amount: plan.detention.amount,
      quantity: plan.detention.billableMinutes,
      unit: "minutes",
      rate: ratePerHour,
      notes: plan.detention.atCap
        ? `Auto: detention at ${facility} reached the $${plan.detention.amount} per stop cap and converted to layover. Covers the ${plan.detention.billableMinutes} billable minutes before the conversion only.`
        : `Auto: detention at ${facility}. ${plan.detention.billableMinutes} billable minutes at $${ratePerHour}/hr after ${DETENTION_FREE_HOURS}h free.`,
    };

    if (!existing) {
      await db.loadAccessorial.create({
        data: {
          loadId,
          stopId,
          type: detentionType as any,
          billedTo: "SHIPPER",
          ...SYSTEM_OWNED,
          ...data,
        } as any,
      });
      detentionWritten = true;
    } else if (existing.createdBy === null && existing.status === "PENDING") {
      await db.loadAccessorial.update({ where: { id: existing.id }, data: data as any });
      detentionWritten = true;
    }
  }

  // Only touch the layover table when there is something to write or something
  // to walk back. The alert engine calls this for every open stop on every
  // tick, and most stops never reach the cap.
  const needsLayoverPass = plan.layover !== null || phase === "final";
  const existingLayover = needsLayoverPass
    ? await db.loadAccessorial.findFirst({
        where: { loadId, stopId, type: "LAYOVER" as any },
      })
    : null;
  const layoverIsOurs =
    existingLayover?.createdBy === null && existingLayover?.status === "PENDING";

  if (plan.layover) {
    const facility = facilityName || "stop";
    const data = {
      amount: plan.layover.amount,
      quantity: plan.layover.days,
      unit: "days",
      rate: layoverPerDay,
      notes: `Auto: layover at ${facility}. ${plan.layover.days} day${
        plan.layover.days === 1 ? "" : "s"
      } at $${layoverPerDay}/day past the $${DETENTION_CAP_PER_STOP} detention cap. Detention covers the hours before the conversion, layover the hours after. The two do not overlap.`,
    };

    if (!existingLayover) {
      await db.loadAccessorial.create({
        data: {
          loadId,
          stopId,
          type: "LAYOVER" as any,
          billedTo: "SHIPPER",
          ...SYSTEM_OWNED,
          ...data,
        } as any,
      });
      layoverChanged = true;
    } else if (layoverIsOurs && Number(existingLayover.quantity) !== plan.layover.days) {
      await db.loadAccessorial.update({
        where: { id: existingLayover.id },
        data: data as any,
      });
      layoverChanged = true;
    }
  } else if (phase === "final" && layoverIsOurs) {
    // The engine writes layover against wall-clock while the stop is open. If
    // the carrier then reports a departure short of the conversion, the hold
    // never reached the cap and the layover we provisionally billed never
    // happened. Remove our own row rather than leave a $250 charge the
    // reconciler no longer supports. The detention branch above re-prices its
    // own row against the corrected departure in the same call, so the stop is
    // left both correct in amount and correct in composition.
    //
    // This is reachable only because departure now always routes through here.
    // While routes/loadStops.ts wrote actualDeparture directly, the engine's
    // query (actualDeparture: null) dropped the stop the instant it was set and
    // no "final" pass ever ran, so this walk-back could never fire.
    await db.loadAccessorial.delete({ where: { id: existingLayover!.id } });
    layoverChanged = true;
  }

  return {
    plan,
    detentionWritten,
    layoverChanged,
    layoverDays: plan.layover?.days ?? 0,
  };
}
