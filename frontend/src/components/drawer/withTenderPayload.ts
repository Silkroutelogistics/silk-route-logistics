import type { DrawerFormState, DrawerLineItemRest } from "./CarrierEngagementDrawer";

/**
 * The POST /api/loads/with-tender body, built from the drawer's form.
 *
 * v3.8.bog — lifted out of the submit mutation so it can be tested without a
 * searched, compliance-checked carrier, and so the load's totals are computed
 * from the SAME line array that is sent. Before, the primary line defaulted to
 * one piece while the total counted zero, and the load's weight was line 1
 * alone, so a multi-line Rate Confirmation printed a partial weight.
 *
 * Everything the Rate Confirmation prints travels here: both appointments, the
 * pickup number and references, the cargo value, the pallet count and the
 * driver's instructions. The schema on the other end declares each of them
 * (backend validators/withTender.ts); an undeclared key is stripped there.
 */
export function buildWithTenderPayload(
  data: DrawerFormState,
  ctx: {
    orderId?: string;
    customerId: string;
    carrierId: string;
    lineItemsRest?: DrawerLineItemRest[];
    now?: number;
    /** Item 342 (v3.8.bor) — the AE's Quick Pay election; undefined is standard terms. */
    quickPay?: { speed: "SEVEN_DAY" | "SAME_DAY"; evidenceType: string; evidenceRef: string };
  },
) {
  const rest = ctx.lineItemsRest ?? [];
  const expiresAtHours = Number(data.expiresAtHours) || 24;
  const expiresAt = new Date((ctx.now ?? Date.now()) + expiresAtHours * 60 * 60 * 1000).toISOString();
  const poNumbers = data.poNumbersText.split(",").map((s) => s.trim()).filter(Boolean);

  // Sprint 59.b (v3.8.act) Item 176 — the primary line (from the form) plus
  // the pass-through lines, so a multi-line BOL round-trips without loss.
  const lineItems = [
    {
      lineNumber: 1,
      pieces: parseInt(data.pieces, 10) || 1,
      packageType: data.packageType || "PLT",
      description: data.description || "General Freight",
      weight: Number(data.weight) || 0,
      hazmat: data.hazmat,
    },
    ...rest.map((li, i) => ({
      lineNumber: i + 2,
      pieces: li.pieces,
      packageType: li.packageType || "PLT",
      description: li.description,
      weight: li.weight,
      freightClass: li.freightClass ?? null,
      nmfcCode: li.nmfcCode ?? null,
      hazmat: li.hazmat ?? false,
      hazmatUnNumber: li.hazmatUnNumber ?? null,
      hazmatClass: li.hazmatClass ?? null,
    })),
  ];
  const sum = (f: (l: (typeof lineItems)[number]) => number) => lineItems.reduce((n, l) => n + (f(l) || 0), 0);
  const weight = sum((l) => l.weight);
  const pieces = sum((l) => l.pieces);
  const pallets = sum((l) => (l.packageType === "PLT" ? l.pieces : 0));

  return {
    orderId: ctx.orderId ?? undefined,
    customerId: ctx.customerId,
    originCity: data.originCity, originState: data.originState, originZip: data.originZip,
    originAddress: data.originAddress || null,
    originCompany: data.originCompany || null,
    originContactName: data.originContactName || null,
    originContactPhone: data.originContactPhone || null,
    destCity: data.destCity, destState: data.destState, destZip: data.destZip,
    destAddress: data.destAddress || null,
    destCompany: data.destCompany || null,
    destContactName: data.destContactName || null,
    destContactPhone: data.destContactPhone || null,
    distance: data.distance ? Number(data.distance) : null,
    equipmentType: data.equipmentType,
    commodity: data.commodity || null,
    // The LOAD's totals. Null rather than 0 when nothing was entered.
    weight: weight > 0 ? weight : null,
    pieces: pieces > 0 ? pieces : null,
    pallets: pallets > 0 ? pallets : null,
    lineItems,
    // Any line: a hazmat line 3 is still hazmat freight.
    hazmat: lineItems.some((l) => l.hazmat),
    temperatureControlled: data.temperatureControlled,
    tempMin: data.tempMin ? Number(data.tempMin) : null,
    tempMax: data.tempMax ? Number(data.tempMax) : null,
    tempSetpoint: data.tempSetpoint ? Number(data.tempSetpoint) : null,
    preCoolTo: data.preCoolTo ? Number(data.preCoolTo) : null,
    reeferContinuous: data.reeferContinuous,
    pickupDate: new Date(data.pickupDate).toISOString(),
    pickupTimeStart: data.pickupTimeStart || null,
    pickupTimeEnd: data.pickupTimeEnd || null,
    deliveryDate: new Date(data.deliveryDate).toISOString(),
    deliveryTimeStart: data.deliveryTimeStart || null,
    deliveryTimeEnd: data.deliveryTimeEnd || null,
    isMultiStop: false,
    poNumbers,
    appointmentNumber: data.appointmentNumber || null,
    pickupAppointment: data.pickupAppointment || null,
    deliveryAppointment: data.deliveryAppointment || data.appointmentNumber || null,
    pickupNumber: data.pickupNumber || null,
    shipperReference: data.shipperReference || null,
    deliveryReference: data.deliveryReference || null,
    // `!== ""` rather than truthiness: a declared value of 0 is a statement.
    cargoValue: data.cargoValue !== "" && data.cargoValue != null ? Number(data.cargoValue) : null,
    tender: {
      carrierId: ctx.carrierId,
      offeredRate: Number(data.offeredRate),
      expiresAt,
      quickPay: ctx.quickPay,
    },
    customerRate: data.customerRate ? Number(data.customerRate) : null,
    specialInstructions: data.specialInstructions || null,
    pickupInstructions: data.pickupInstructions || null,
    deliveryInstructions: data.deliveryInstructions || null,
    driverInstructions: data.driverInstructions || null,
  };
}
