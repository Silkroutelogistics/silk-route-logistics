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
import { prisma } from "../config/database";
import { log } from "../lib/logger";

const PAYMENT_TERMS_BY_TIER: Record<string, string> = {
  PLATINUM: "Net-14",
  GOLD: "Net-21",
  SILVER: "Net-30",
};

const SRL_BROKER = {
  name: "Silk Route Logistics",
  phone: "(269) 220-6760",
  email: "operations@silkroutelogistics.ai",
};

function timeWindow(start?: string | null, end?: string | null): string | undefined {
  if (!start && !end) return undefined;
  if (start && end) return `${start} – ${end}`;
  return start || end || undefined;
}

function brokerContact(poster?: { firstName: string | null; lastName: string | null } | null): string | undefined {
  if (!poster) return undefined;
  const name = `${poster.firstName ?? ""} ${poster.lastName ?? ""}`.trim();
  return name || undefined;
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

  const carrier = tender.carrier;
  const carrierUser = carrier.user;
  const tier = (carrier.tier ?? "SILVER").toString().toUpperCase();
  const paymentTerms = PAYMENT_TERMS_BY_TIER[tier] ?? "Net-30";

  const carrierName =
    carrier.companyName ||
    `${carrierUser.firstName ?? ""} ${carrierUser.lastName ?? ""}`.trim() ||
    "Carrier";

  const formData = {
    // Section 1 — Broker / Load Information
    referenceNumber: load.referenceNumber,
    loadNumber: load.loadNumber ?? load.referenceNumber,
    brokerName: SRL_BROKER.name,
    brokerContact: brokerContact(load.poster),
    brokerPhone: SRL_BROKER.phone,
    brokerEmail: SRL_BROKER.email,

    // Section 2 — Shipper / Pickup
    shipperName: load.originCompany ?? "",
    shipperAddress: load.originAddress ?? "",
    shipperCity: load.originCity,
    shipperState: load.originState,
    shipperZip: load.originZip,
    shipperContact: load.originContactName ?? "",
    shipperPhone: load.originContactPhone ?? "",
    shipperRefNumber: load.shipperReference ?? load.poNumbers?.[0] ?? "",
    pickupNumber: load.pickupNumber ?? "",
    pickupHours: load.pickupHours ?? timeWindow(load.pickupTimeStart, load.pickupTimeEnd) ?? "",
    loadingType: load.loadingType ?? "",
    poNumber: load.poNumbers?.[0] ?? load.shipperPoNumber ?? "",

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
    tempRequirements: load.temperatureControlled
      ? `${load.tempMin ?? "?"}°F – ${load.tempMax ?? "?"}°F`
      : "",

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
    detentionRate: 0,
    accessorials: [],
    totalCharges: tender.offeredRate,

    // Section 8 — Payment Terms (tier-derived per CLAUDE.md §8)
    carrierPaymentTier: tier,
    quickPayFeePercent: 0,
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

  const rc = await prisma.rateConfirmation.create({
    data: {
      loadId,
      formData: formData as unknown as object,
      autoGenerated: true,
      createdById: createdByUserId,
      carrierRate: tender.offeredRate,
      fuelSurcharge: 0,
      accessorialTotal: 0,
      totalCharges: tender.offeredRate,
    },
  });

  log.info(
    { loadId, tenderId, rcId: rc.id, carrierId: carrier.id, tier },
    "[autoRC] Auto-generated DRAFT RC on tender accept",
  );

  return rc;
}
