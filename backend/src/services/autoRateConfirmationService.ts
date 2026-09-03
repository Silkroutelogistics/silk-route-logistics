/**
 * Sprint Phase 2 (v3.8.acd) — Auto-RC generation on tender accept.
 *
 * Pre-Sprint-Phase-2, RC creation was 100% AE-driven: tender accept fired
 * the BOOKED transition + carrier confirmation email (Sprint 54 Item 7),
 * then AE had to manually open the load, click "Create Rate Confirmation",
 * fill the modal, and click "Send" — minutes-to-hours of AE latency before
 * the carrier received the binding document.
 *
 * Industry standard (CHR, Coyote, RXO, Echo): RC auto-generated server-side
 * within seconds of accept. This helper produces a DRAFT RC pre-filled from
 * canonical Load + Tender + Carrier values. AE then reviews accessorials /
 * fuel surcharge / quick-pay tier (the fields that need human judgment) and
 * fires the existing POST /api/rate-confirmations/:id/send manual flow to
 * deliver the PDF to the carrier.
 *
 * Decision lock (Phase A ratification, 2026-05-17):
 *   A — auto-DRAFT (status="DRAFT", AE reviews + sends). Auto-send deferred
 *       to §13.3 Item 171 once auto-fill mapping proves correct over real
 *       test loads.
 *   B — direct paths only (acceptTender + acceptTenderOnBehalf). Bulk paths
 *       (waterfall, loadbid) banked as §13.3 Item 172 for after the direct-
 *       path auto-fill mapping is proven.
 *
 * Call site: tenderController.acceptTender + acceptTenderOnBehalf, fired
 * in a non-blocking try/catch after the atomic transaction + Shipment
 * creation. Same shape as Sprint 38 Item 52 tracking-link fan-out — tender
 * accept must succeed even if RC auto-generation throws (RC can be created
 * manually via the existing AE flow).
 */
import type { PrismaClient, QuickPaySpeed } from "@prisma/client";
import { prisma } from "../config/database";
import { ENTITY_NAME, PHONE, OPERATIONS_EMAIL } from "../config/authority";
import { log } from "../lib/logger";
import { quickPayFeePercent, standardNetDays, normalizeTier } from "../lib/quickPayPricing";
import { resolveLoadStem, withDocumentNumber } from "../lib/documentNumber";
import { DETENTION_RATE_PER_HOUR } from "../lib/accessorialPolicy";

// Sprint 59 (v3.8.acj) Item 176 — transaction-aware Prisma client. New
// POST /api/loads/with-tender atomic endpoint passes its transaction
// client so the RC.create row commits/rolls back with the Load + Tender
// rows. Existing callers (acceptTender + acceptTenderOnBehalf) pass
// nothing and use the global prisma client. Reads at lines 70-87 stay
// on global prisma per Risk 4 resolution (pure reads, no benefit from
// transaction enrolment).
type PrismaTxClient = Omit<PrismaClient, "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends">;

const PAYMENT_TERMS_BY_TIER: Record<string, string> = {
  PLATINUM: "Net-14",
  GOLD: "Net-21",
  SILVER: "Net-30",
};

// v3.8.azg C2 — SRL_BROKER folded into config/authority. Broker identity is one
// fact; this was a fourth copy of it, and its name was missing the "Inc." the
// entity actually carries, so a stored rate confirmation recorded the broker
// under a name the company does not have.
//
// This value is STORED on the RateConfirmation row and is NOT printed: the RC
// renderer draws broker identity from the srl-chrome BRAND constants and never
// reads fd.brokerName. Checked rather than assumed — which is also why the
// rate-confirmation render pin does not move on this commit.

function timeWindow(start?: string | null, end?: string | null): string | undefined {
  if (!start && !end) return undefined;
  if (start && end) return `${start} – ${end}`;
  return start || end || undefined;
}

/**
 * v3.8.art — human-readable reefer summary for the RC `tempRequirements` line,
 * the free-text field an AE can override on the RC modal.
 *
 * Every numeric test here is `!= null`, never truthiness. 0°F is a legitimate
 * setpoint for frozen freight, and `if (setpoint)` would silently drop it —
 * the same defect class as the v3.8.arn `detentionRate: 0`, which published
 * "DETENTION $0/hr" to every accepting carrier because the renderer's `?? 50`
 * default does not catch a literal zero.
 */
function reeferSummary(load: {
  tempMin: number | null;
  tempMax: number | null;
  tempSetpoint: number | null;
  preCoolTo: number | null;
  reeferContinuous: boolean;
}): string {
  const parts: string[] = [];
  const hasAnyNumber =
    load.tempSetpoint != null ||
    load.tempMin != null ||
    load.tempMax != null ||
    load.preCoolTo != null;

  if (load.tempSetpoint != null) parts.push(`Set ${load.tempSetpoint}°F`);

  // Range prints when either bound is set — and also when the load is flagged
  // reefer but carries no numbers at all, so the resulting "?°F – ?°F" keeps the
  // missing temperature visible to the AE instead of rendering a clean line.
  if (load.tempMin != null || load.tempMax != null || !hasAnyNumber) {
    parts.push(`Range ${load.tempMin ?? "?"}°F – ${load.tempMax ?? "?"}°F`);
  }

  if (load.preCoolTo != null) parts.push(`Pre-cool ${load.preCoolTo}°F`);

  // Printed either way. Continuous is the corpus-mandated norm, and cycle-sentry
  // is a deliberate exception the carrier must be told about — so this is stated
  // explicitly rather than left to be inferred from silence.
  parts.push(load.reeferContinuous ? "Continuous" : "Cycle-sentry");

  return parts.join(" · ");
}

function brokerContact(poster?: { firstName: string | null; lastName: string | null } | null): string | undefined {
  if (!poster) return undefined;
  const name = `${poster.firstName ?? ""} ${poster.lastName ?? ""}`.trim();
  return name || undefined;
}

// ═══════════════════════════════════════════════════════════════════════════
// v3.8.asb — THE ELECTION RIDES THE TENDER
// ═══════════════════════════════════════════════════════════════════════════
//
// This file used to write `quickPayFeePercent: 0` unconditionally. The tender
// accept path is the PRIMARY booking path — it is how a carrier gets a load —
// and it therefore could never produce a Quick Pay election. Load.quickPayFee-
// Percent stayed null on every load it created, and every downstream gate
// (integrationService at delivery, /carrier-payments/:id/request-quickpay,
// accountingController.resolveElectedQuickPayFee) correctly refused to charge
// a fee that was recorded on nothing. Quick Pay was, in practice, unreachable
// for anyone who got their loads the normal way.
//
// So the pilot only becomes real here. When an approved pilot carrier is
// tendered, the rate confirmation now carries their election.
//
// QUICK PAY IS OFF UNLESS THE CARRIER TURNS IT ON (D1, ratified 2026-08-16).
//
// This resolver used to end `requestedSpeed ?? "SEVEN_DAY"`, so a load whose
// carrier had never said anything about Quick Pay was priced as seven-day
// Quick Pay and charged the tier fee. Load.quickPaySpeed is nullable with no
// default, and the only surface that writes it is
// PUT /api/carrier-payments/loads/:loadId/quickpay-speed — which had no caller
// in the frontend. So in practice EVERY pilot carrier's every load defaulted
// into a fee nobody elected. A Silver carrier running 20 loads a month lost
// about $1,200 a month to a default.
//
// The agreement says the opposite, twice, and so does /carriers: Quick Pay
// "does not apply automatically", and "If Carrier does not elect Quick Pay on a
// load, that load is paid on Carrier's standard tier payment terms at no fee."
// The code moves to match.
//
// WHERE THE PER-LOAD SPEED COMES FROM, plainly:
//
//   1. Load.quickPaySpeed, if the carrier set it before the rate confirmation
//      was issued. That is the per-load choice, and the surface for it is
//      PUT /api/carrier-payments/loads/:loadId/quickpay-speed.
//   2. Otherwise STANDARD, at no fee. NULL means the carrier was never asked
//      and never answered, and silence is not an election. It is not a guess in
//      SRL's favour either — the free tier terms are the product a carrier gets
//      by doing nothing, and taking 3% for a service they did not ask for is
//      not a default, it is a charge.
//   3. STANDARD, and a zero fee, if ANY of the three conditions fails.
//
// The three conditions are the same three every other charge path applies,
// checked here for the first time at the moment the number is set rather than
// only at the moment it is spent:
//      · an APPROVED QuickPayEnrollment           (the pilot)
//      · CarrierProfile.quickPayEnabled           (the carrier's own switch)
//      · a signed Caravan Quick Pay Agreement     (never a fee under an
//                                                  unsigned instrument)
// Every failure pays the carrier MORE, never less.
//
// NOTHING IS FROZEN HERE. This function decides what the rate confirmation
// SAYS; issuing it is what makes it binding. See the note above
// resolveIssuedElection.

type QuickPayElection = {
  speed: QuickPaySpeed;
  feePercent: number;
  /** Short label for the rate confirmation TERMS cell. Kept short on purpose. */
  paymentTerms: string;
  /** Why it landed where it landed. Logged, never shown to the carrier. */
  reason: string;
};

/**
 * Resolve the Quick Pay election for ONE load at rate-confirmation time.
 *
 * `tier` is the carrier's Caravan tier and is the ONLY thing the fee is
 * derived from, per §8. Speed says how fast, tier says how much.
 */
async function resolveQuickPayElection(
  carrierProfileId: string,
  quickPayEnabled: boolean,
  tier: string,
  requestedSpeed: QuickPaySpeed | null,
): Promise<QuickPayElection> {
  const caravanTier = normalizeTier(tier);
  const standard: QuickPayElection = {
    speed: "STANDARD",
    feePercent: 0,
    paymentTerms: `Net-${standardNetDays(caravanTier)}`,
    reason: "",
  };

  // Condition 1 — the pilot. Read from the enrolment rather than trusting the
  // quickPayEnabled cache, so a fee cannot be recorded on the strength of a
  // stale flag alone.
  const enrollment = await prisma.quickPayEnrollment.findFirst({
    where: { carrierProfileId, status: "APPROVED" },
    select: { id: true },
  });
  if (!enrollment) return { ...standard, reason: "not approved into the Quick Pay pilot" };

  // Condition 2 — the carrier's own switch. They keep the right to turn Quick
  // Pay off, and a load tendered while it is off is priced at standard terms.
  if (quickPayEnabled !== true) return { ...standard, reason: "Quick Pay switched off on the account" };

  // Condition 3 — a signed agreement. Never deduct a fee under an unsigned
  // instrument, and never PRINT one either: the rate confirmation is what
  // tells the carrier what they will be charged.
  const signed = await prisma.carrierAgreement.findFirst({
    where: { carrierId: carrierProfileId, status: "SIGNED", templateName: "quick-pay" },
    select: { id: true },
  });
  if (!signed) return { ...standard, reason: "Caravan Quick Pay Agreement not signed" };

  // The carrier may have explicitly chosen standard on this load. That is a
  // real election, distinct from never having chosen, and it is honoured.
  if (requestedSpeed === "STANDARD") {
    return { ...standard, reason: "carrier elected standard terms on this load" };
  }

  // D1 — no election is not an election. An approved, enabled, signed-up pilot
  // carrier who said nothing about THIS load pays their free tier terms on it.
  if (requestedSpeed === null || requestedSpeed === undefined) {
    return { ...standard, reason: "no Quick Pay elected on this load" };
  }

  const speed: QuickPaySpeed = requestedSpeed;
  const sameDay = speed === "SAME_DAY";
  return {
    speed,
    feePercent: quickPayFeePercent(caravanTier, sameDay),
    // Short by necessity. This lands in the rate confirmation meta strip,
    // whose cells are roughly 67pt wide at CONTENT_W 540 / 8 cells; a longer
    // string overprints the neighbouring cell, which is the Item 152 defect.
    paymentTerms: sameDay ? "Same day" : "7 days",
    reason: "carrier elected this speed on the load",
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// THE ELECTION IS FROZEN WHEN THE RATE CONFIRMATION IS ISSUED
// ═══════════════════════════════════════════════════════════════════════════
//
// Quick Pay Agreement §3 cl.3: the fee is "recorded on that load when Broker
// ISSUES the rate confirmation for it". Issuing means sending it. Until then
// the document is a draft nobody outside SRL has seen.
//
// The freeze used to happen at DRAFT creation, seconds after tender accept, and
// nothing anywhere required the draft to ever be sent. On a one-operator desk
// that is not an exotic race, it is a Friday afternoon: a load tendered through
// the drawer, a draft nobody opens until Monday, and a carrier who hauls it,
// delivers it and is charged under a rate confirmation that was never sent and
// that they could not see, because Load.rateConfirmationPdfUrl is also the
// carrier portal's visibility gate.
//
// So the freeze moved to the send path, which is the only thing that issues.
// That choice over the alternative — letting the freeze stand at draft and
// refusing to FUND a load whose rateConfirmationPdfUrl is null — for one
// reason: it is fail-safe by construction rather than by vigilance. Every
// charge path reads Load.quickPayFeePercent (integrationService at delivery,
// /carrier-payments/:id/request-quickpay, accountingController's
// resolveElectedQuickPayFee). If the column is only ever written by the send
// path, an unissued rate confirmation charges nothing ANYWHERE, with no new
// guard in any of those three files to remember, maintain, or miss. The
// funding-guard alternative needs the same check added to all three and stays
// correct only as long as a fourth funding path is never added without it.
//
// The one hole in that argument was real and is closed in this sprint:
// integrationService resolved `load.quickPayFeePercent ?? rc.formData
// .quickPayFeePercent`, so a DRAFT's formData could still price a settlement.
// That fallback is deleted — the Load column is the single source of the
// frozen number, and formData is only ever the proposal.
//
// SPEED AND FEE MOVE TOGETHER, ALWAYS.
//
// They are frozen in one statement, from one resolution, and neither is ever
// written without the other. The two ways they used to diverge:
//
//   · the speed control wrote Load.quickPaySpeed while the frozen fee stayed
//     put, so flipping to SAME_DAY after issue bought same-day money at the
//     7-day price. The speed control now refuses once the fee is frozen.
//   · a stored STANDARD next to a positive fee was called "a contradiction",
//     discarded, and the fee charged anyway. That pair can no longer be
//     created: this resolver refuses to issue it.
//
// Refusals are 422s with the reason, never a silent correction, because the
// number is about to be printed on a document a carrier signs.

export type IssuedElection =
  | { ok: true; speed: QuickPaySpeed; feePercent: number }
  | { ok: false; code: string; error: string };

const QP_SPEED_VALUES: QuickPaySpeed[] = ["STANDARD", "SEVEN_DAY", "SAME_DAY"];

/**
 * The pair to freeze onto a load when its rate confirmation is issued, resolved
 * from the rate confirmation's own formData and the carrier's Caravan tier.
 *
 * formData is AE-editable and reaches this function from two different eras of
 * the product, so it is read defensively:
 *
 *   both present and agreeing            → frozen as-is
 *   neither present                      → STANDARD at no fee (D1)
 *   speed only                           → fee derived from the §8 ladder
 *   fee only (the AE modal, which has
 *   never sent a speed)                  → speed derived from the ladder rung
 *
 * A fee BELOW the rung for its speed is allowed: that is a discretionary
 * discount and it pays the carrier more. A fee ABOVE the rung is refused — §8
 * is locked, and no AE typing into a form gets to price above it.
 */
export function resolveIssuedElection(
  fd: Record<string, unknown> | null | undefined,
  tier: string | null | undefined,
): IssuedElection {
  const caravanTier = normalizeTier(tier);
  const sevenRung = quickPayFeePercent(caravanTier);
  const sameDayRung = quickPayFeePercent(caravanTier, true);

  const rawSpeed = typeof fd?.quickPaySpeed === "string" ? fd.quickPaySpeed.toUpperCase() : null;
  const speed = QP_SPEED_VALUES.includes(rawSpeed as QuickPaySpeed) ? (rawSpeed as QuickPaySpeed) : null;
  if (rawSpeed !== null && speed === null) {
    return {
      ok: false,
      code: "QP_SPEED_UNRECOGNISED",
      error: `The rate confirmation carries a Quick Pay speed of "${rawSpeed}", which is not one of ${QP_SPEED_VALUES.join(", ")}. Fix the speed on the rate confirmation before sending it.`,
    };
  }

  const rawFee = fd?.quickPayFeePercent;
  const fee = typeof rawFee === "number" && Number.isFinite(rawFee) ? rawFee : null;
  if (rawFee !== undefined && rawFee !== null && fee === null) {
    return {
      ok: false,
      code: "QP_FEE_UNRECOGNISED",
      error:
        "The rate confirmation carries a Quick Pay fee that is not a number. Clear it or set a percentage before sending it.",
    };
  }

  // Nothing elected. The carrier keeps their free tier terms, which is the
  // state the overwhelming majority of loads are in.
  if (speed === null && (fee === null || fee <= 0)) {
    return { ok: true, speed: "STANDARD", feePercent: 0 };
  }

  // An explicit standard election alongside a fee is the one pair that cannot
  // be reconciled in either direction: honouring the speed voids a fee the
  // document printed, honouring the fee charges a carrier who was told they
  // would not be charged. Refuse and make a human decide.
  if (speed === "STANDARD") {
    if (fee !== null && fee > 0) {
      return {
        ok: false,
        code: "QP_SPEED_FEE_CONTRADICTION",
        error: `The rate confirmation says standard terms and also carries a ${fee}% Quick Pay fee. Set one or the other before sending it.`,
      };
    }
    return { ok: true, speed: "STANDARD", feePercent: 0 };
  }

  if (speed !== null) {
    const rung = speed === "SAME_DAY" ? sameDayRung : sevenRung;
    if (fee === null) return { ok: true, speed, feePercent: rung };
    if (fee <= 0) {
      return {
        ok: false,
        code: "QP_SPEED_FEE_CONTRADICTION",
        error: `The rate confirmation elects ${speed === "SAME_DAY" ? "same-day" : "7-day"} Quick Pay but carries no fee. Set the fee to ${rung}% or change the speed to standard before sending it.`,
      };
    }
    if (fee > rung) {
      return {
        ok: false,
        code: "QP_FEE_ABOVE_LADDER",
        error: `A ${fee}% Quick Pay fee is above the published ${caravanTier} ${speed === "SAME_DAY" ? "same-day" : "7-day"} rate of ${rung}%. Lower it before sending.`,
      };
    }
    return { ok: true, speed, feePercent: fee };
  }

  // A fee with no speed beside it. This is the AE rate-confirmation modal,
  // which has only ever sent a percentage. Read the speed off the rung the
  // percentage sits on, so the stored pair is coherent from here on.
  if (fee! > sameDayRung) {
    return {
      ok: false,
      code: "QP_FEE_ABOVE_LADDER",
      error: `A ${fee}% Quick Pay fee is above the published ${caravanTier} same-day rate of ${sameDayRung}%. Lower it before sending.`,
    };
  }
  if (Math.abs(fee! - sameDayRung) < 0.01) return { ok: true, speed: "SAME_DAY", feePercent: fee! };
  if (fee! > sevenRung) {
    // Between the two rungs, so the percentage does not say which product the
    // carrier is buying, and the two differ by a fortnight of pay date.
    return {
      ok: false,
      code: "QP_SPEED_AMBIGUOUS",
      error: `A ${fee}% Quick Pay fee sits between the ${caravanTier} 7-day rate (${sevenRung}%) and same-day rate (${sameDayRung}%), so it does not say which one the carrier gets. Set the Quick Pay speed on the load before sending.`,
    };
  }
  return { ok: true, speed: "SEVEN_DAY", feePercent: fee! };
}

/**
 * Auto-generate a DRAFT RateConfirmation on tender accept.
 *
 * Returns the created RC record. Caller wraps in try/catch — non-blocking.
 * On any failure, log the error and let tender accept continue; AE can
 * fall back to the manual POST /api/rate-confirmations/ flow.
 */
export async function autoGenerateRateConfirmation(
  loadId: string,
  tenderId: string,
  createdByUserId: string,
  prismaClient?: PrismaTxClient,
) {
  const [load, tender] = await Promise.all([
    prisma.load.findUnique({
      where: { id: loadId },
      include: {
        poster: { select: { firstName: true, lastName: true, phone: true, email: true } },
      },
    }),
    prisma.loadTender.findUnique({
      where: { id: tenderId },
      include: {
        carrier: {
          include: {
            user: { select: { firstName: true, lastName: true, phone: true, email: true } },
          },
        },
      },
    }),
  ]);

  if (!load) {
    log.warn({ loadId, tenderId }, "[autoRC] Load not found — skipping auto-RC");
    return null;
  }
  if (!tender) {
    log.warn({ loadId, tenderId }, "[autoRC] Tender not found — skipping auto-RC");
    return null;
  }

  // v3.8.arc — idempotency. Pre-arc this created a RateConfirmation
  // unconditionally on every accept, and the AE's Rate Conf modal POSTed a NEW
  // one on every save, so a single load accumulated 19 RCs in production. An
  // RC is a document about a load, not an event log: one working DRAFT per load
  // is the correct cardinality. If a DRAFT already exists we return it and let
  // the caller/AE edit that one instead of stacking another.
  const rcReader = prismaClient ?? prisma;
  const existingDraft = await rcReader.rateConfirmation.findFirst({
    where: { loadId, status: "DRAFT" },
    orderBy: { createdAt: "desc" },
  });
  if (existingDraft) {
    log.info({ loadId, tenderId, rcId: existingDraft.id }, "[autoRC] DRAFT already exists for this load — reusing it");
    return existingDraft;
  }

  const carrier = tender.carrier;
  const carrierUser = carrier.user;
  const tier = (carrier.tier ?? "SILVER").toString().toUpperCase();

  // v3.8.asb — the election. See the block above resolveQuickPayElection for
  // where the per-load speed comes from and why the default is seven-day.
  const election = await resolveQuickPayElection(
    carrier.id,
    carrier.quickPayEnabled === true,
    tier,
    load.quickPaySpeed ?? null,
  );
  // Standard terms keep the tier's free net days, which is what the tier table
  // above has always produced. Quick Pay overrides it with the elected speed.
  const paymentTerms =
    election.speed === "STANDARD"
      ? (PAYMENT_TERMS_BY_TIER[tier] ?? election.paymentTerms)
      : election.paymentTerms;

  const carrierName =
    carrier.companyName ||
    `${carrierUser.firstName ?? ""} ${carrierUser.lastName ?? ""}`.trim() ||
    "Carrier";

  const formData = {
    // Section 1 — Broker / Load Information
    referenceNumber: load.referenceNumber,
    loadNumber: load.loadNumber ?? load.referenceNumber,
    brokerName: ENTITY_NAME,
    brokerContact: brokerContact(load.poster),
    brokerPhone: PHONE,
    brokerEmail: OPERATIONS_EMAIL,

    // Section 2 — Shipper / Pickup
    shipperName: load.originCompany ?? "",
    shipperAddress: load.originAddress ?? "",
    shipperCity: load.originCity,
    shipperState: load.originState,
    shipperZip: load.originZip,
    shipperContact: load.originContactName ?? "",
    shipperPhone: load.originContactPhone ?? "",
    shipperRefNumber: load.shipperReference ?? load.poNumbers?.[0] ?? "",
    // Arc 13 — was seeded from Load.pickupNumber, a column nothing writes, so
    // this only ever seeded an empty string. The AE fills it on the RC.
    pickupNumber: "",
    pickupHours: load.pickupHours ?? timeWindow(load.pickupTimeStart, load.pickupTimeEnd) ?? "",
    loadingType: load.loadingType ?? "",
    // Arc 13 — the shipperPoNumber link is gone; poNumbers is the populated one.
    poNumber: load.poNumbers?.[0] ?? "",

    // Section 3 — Consignee / Delivery
    consigneeName: load.destCompany ?? "",
    consigneeAddress: load.destAddress ?? "",
    consigneeCity: load.destCity,
    consigneeState: load.destState,
    consigneeZip: load.destZip,
    consigneeContact: load.destContactName ?? "",
    consigneePhone: load.destContactPhone ?? "",
    consigneeRefNumber: load.deliveryReference ?? "",
    deliveryRef: load.deliveryReference ?? "",
    appointmentNumber: load.appointmentNumber ?? load.deliveryAppointment ?? "",
    deliveryHours: load.deliveryHours ?? timeWindow(load.deliveryTimeStart, load.deliveryTimeEnd) ?? "",
    unloadingType: load.unloadingType ?? "",

    // Section 4 — Multi-stop
    isMultiStop: load.isMultiStop,
    stops: undefined,
    extraStopPay: load.extraStopPay ?? 0,

    // Section 5 — Carrier / Driver Assignment
    assignmentType: "PARTNER_CARRIER" as const,
    carrierId: carrier.id,
    carrierName,
    carrierMcNumber: carrier.mcNumber ?? "",
    carrierDotNumber: carrier.dotNumber ?? "",
    carrierContact: `${carrierUser.firstName ?? ""} ${carrierUser.lastName ?? ""}`.trim(),
    carrierPhone: carrierUser.phone ?? "",
    carrierEmail: carrier.contactEmail ?? carrierUser.email,
    dispatcherName: load.carrierDispatcherName ?? "",
    dispatcherPhone: load.carrierDispatcherPhone ?? "",
    driverName: load.driverName ?? "",
    driverPhone: load.driverPhone ?? "",
    truckNumber: load.truckNumber ?? "",
    trailerNumber: load.trailerNumber ?? "",

    // Section 5b — Equipment & Commodity
    equipmentType: load.equipmentType,
    commodity: load.commodity ?? "",
    weight: load.weight ?? undefined,
    pieces: load.pieces ?? undefined,
    hazmat: load.hazmat,
    tempRequirements: load.temperatureControlled ? reeferSummary(load) : "",
    // v3.8.art — structured reefer fields alongside the summary string above.
    // The string is what an AE free-text overrides; these are what the renderer
    // reads for labelled fields.
    //
    // `?? undefined` and NOT `|| undefined`: 0°F is a legitimate setpoint for
    // frozen freight and `0 || undefined` is undefined — the v3.8.arn
    // `detentionRate: 0` defect class, which shipped "DETENTION $0/hr".
    //
    // reeferContinuous is passed through un-coerced so a deliberate false
    // survives to the carrier. It is gated on temperatureControlled only, so a
    // dry-van RC carries undefined rather than a fabricated "Continuous".
    tempSetpoint: load.temperatureControlled ? (load.tempSetpoint ?? undefined) : undefined,
    preCoolTo: load.temperatureControlled ? (load.preCoolTo ?? undefined) : undefined,
    reeferContinuous: load.temperatureControlled ? load.reeferContinuous : undefined,

    // Section 6 — Dates & Times
    pickupDate: load.pickupDate.toISOString(),
    pickupTimeWindow: timeWindow(load.pickupTimeStart, load.pickupTimeEnd) ?? "",
    deliveryDate: load.deliveryDate.toISOString(),
    deliveryTimeWindow: timeWindow(load.deliveryTimeStart, load.deliveryTimeEnd) ?? "",

    // Section 7 — Financials
    // Base rate from accepted tender. FSC + accessorials left blank for AE
    // to fill during review — those require operational judgment.
    customerRate: load.customerRate ?? undefined,
    lineHaulRate: tender.offeredRate,
    rateType: "FLAT" as const,
    fuelSurcharge: 0,
    fuelSurchargeType: "FLAT" as const,
    // v3.8.arn — was 0, which is not "unset": the renderer's `?? 50` default
    // does not catch a literal 0, so every auto-generated RC published
    // "DETENTION $0/hr" to the accepting carrier. Write the canonical rate
    // explicitly so the stored formData is self-describing.
    // v3.8.asc — and read it from policy rather than typing it. This writer
    // bypasses the Zod validator and writes formData straight to Prisma, so it is
    // the copy that decides the stored rate on nearly every RC in the system. A
    // literal here would have outlived a policy change in every existing row.
    detentionRate: DETENTION_RATE_PER_HOUR,
    accessorials: [],
    totalCharges: tender.offeredRate,

    // Section 8 — Payment Terms (tier-derived per CLAUDE.md §8)
    carrierPaymentTier: tier,
    // v3.8.asb — the fee APPLIED TO THIS LOAD, not a placeholder zero and not
    // the tier ladder. This is the number the carrier is charged, and it is
    // what the rate confirmation has to state.
    quickPayFeePercent: election.feePercent,
    // The speed applied to this load. New field: the renderer needs it because
    // the fee alone is ambiguous (3% is Silver seven-day AND Platinum
    // same-day), and the carrier is owed both halves of what they elected.
    quickPaySpeed: election.speed,
    // v3.8.asb — quickPayCellValue DELETED, do not reintroduce.
    //
    // It was a pre-measured display string for the meta strip QUICK PAY cell,
    // and its own comment claimed the strings fit. They did not: "Same-day · 5%"
    // measures 69.6pt against a 67.5pt cell and would have overprinted TERMS.
    // The renderer measures its own geometry (pdfService, the qpCellValue
    // ladder) and never read this. Its only consumers were three tests
    // asserting it had been written, which is what made a dead value look
    // alive. Speed and percentage are carried by quickPaySpeed and
    // quickPayFeePercent above; the document derives its own text from those.
    paymentTerms,
    docChecklist: {
      signedRateCon: true,
      signedBol: true,
      pod: true,
      carrierInvoice: true,
    },

    // Section 9 — Special Instructions
    specialInstructions: load.specialInstructions ?? "",
    pickupInstructions: load.pickupInstructions ?? "",
    deliveryInstructions: load.deliveryInstructions ?? "",
    appointmentRequired: Boolean(load.deliveryAppointment),

    // Section 9b — Terms & Conditions (AE must verify during review)
    termsAccepted: false,
  };

  // Sprint 59 (v3.8.acj) — use prismaClient param when provided (transaction-
  // enrolled write from POST /api/loads/with-tender). Default to global
  // prisma for acceptTender + acceptTenderOnBehalf callers.
  const rcWriter = prismaClient ?? prisma;

  // Allocate the rate confirmation's document number HERE, at creation, exactly
  // as the AE-driven createRateConfirmation does.
  //
  // Auto-generated rate confirmations were created with rateConNumber null, and
  // a NULL is invisible to the allocator: nextDocumentNumber scans
  // `{ startsWith: stem + "R" }`, a NULL matches no prefix, so a re-issue
  // computed revision 1 again and allocated the same SRL-…R that the auto one
  // was already rendering. The @unique column cannot catch that either, because
  // Postgres treats NULLs as distinct — nothing collides, so nothing throws.
  // Two rate confirmations, one number on their faces, silently.
  //
  // The printed string does not change for the first rate confirmation on a
  // load: the renderer already fell back to `documentNumberFor(null, load, …)`,
  // which derives that same revision-1 number. What changes is that the number
  // is now RECORDED, so the next one is R2.
  //
  // attempts=1 inside a caller's transaction, on purpose. withDocumentNumber
  // normally rescans and retries on a P2002, but Postgres aborts a transaction
  // on a failed statement, so a retry inside POST /api/loads/with-tender would
  // fail on the aborted transaction and bury the real error. There it takes one
  // attempt and lets the caller roll back honestly. Contention is a second rate
  // confirmation on the same load in the same instant, and the early return
  // above means there is no draft to contend with.
  const stem = resolveLoadStem(load);
  const build = (rateConNumber: string | null) =>
    rcWriter.rateConfirmation.create({
      data: {
        loadId,
        rateConNumber,
        formData: formData as unknown as object,
        autoGenerated: true,
        createdById: createdByUserId,
        carrierRate: tender.offeredRate,
        fuelSurcharge: 0,
        accessorialTotal: 0,
        totalCharges: tender.offeredRate,
      },
    });

  const rc = stem
    ? await withDocumentNumber("RATE_CONFIRMATION", stem, build, prismaClient ? 1 : 6, rcWriter)
    : await build(null);

  // ── NOTHING IS FROZEN ONTO THE LOAD HERE ──
  //
  // This used to write election.feePercent and election.speed onto the Load
  // immediately after the create, i.e. at DRAFT. See the note above
  // resolveIssuedElection: §3 cl.3 records the fee when SRL ISSUES the rate
  // confirmation, and the only thing that issues one is an AE sending it. The
  // freeze lives in rateConfirmationController.sendRateConfirmation, in the
  // same update that writes Load.rateConfirmationPdfUrl.
  //
  // The election still travels: it is in this draft's formData, it prints on
  // the document, and the send path resolves and freezes it from there. Until
  // then Load.quickPayFeePercent stays NULL, which every charge path already
  // reads as "no fee recorded on this load, pay standard terms".

  log.info(
    {
      loadId,
      tenderId,
      rcId: rc.id,
      carrierId: carrier.id,
      tier,
      quickPaySpeed: election.speed,
      quickPayFeePercent: election.feePercent,
      quickPayReason: election.reason,
      rateConNumber: rc.rateConNumber,
    },
    "[autoRC] Auto-generated DRAFT RC on tender accept — election proposed, not yet frozen",
  );

  return rc;
}
