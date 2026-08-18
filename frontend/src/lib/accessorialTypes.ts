/**
 * The AccessorialType enum, as a list a human can pick from.
 *
 * These `value`s are the Prisma enum members verbatim. They are the key that
 * `Customer.defaultAccessorialRates` is looked up by when the backend prices a
 * customer's accessorial (invoiceService.customerPriceFor), so a value that
 * differs by even its casing resolves to nothing and the line silently bills at
 * cost — on an invoice that looks completely normal.
 *
 * That is not hypothetical. The CRM rate-card editor was a free-text box
 * placeheld "e.g. Detention, Layover, TONU": sentence case, and there is no
 * DETENTION in the enum at all — it splits by leg. Every rate card typed from
 * that placeholder matched nothing.
 *
 * KEEP IN STEP WITH backend/prisma/schema.prisma `enum AccessorialType`. Adding a
 * member there and not here means an AE cannot select it; adding it here and not
 * there means they can select something the database will reject.
 *
 * NOTE — a separate, DIVERGENT list lives at dashboard/orders/page.tsx and feeds
 * the Order Builder. That one writes the `Load.accessorials` JSON column rather
 * than the LoadAccessorial table, so its sentence-case labels are not this enum
 * and reconciling them changes what the Rate Confirmation renders. Deliberately
 * left alone here; tracked separately.
 */
export const ACCESSORIAL_TYPES: { value: string; label: string }[] = [
  { value: "DETENTION_PU", label: "Detention — pickup" },
  { value: "DETENTION_DEL", label: "Detention — delivery" },
  { value: "LAYOVER", label: "Layover" },
  { value: "TONU", label: "TONU (truck ordered not used)" },
  { value: "LUMPER", label: "Lumper" },
  { value: "DEADHEAD", label: "Deadhead" },
  { value: "DRIVER_ASSIST", label: "Driver assist" },
  { value: "REEFER_FUEL", label: "Reefer fuel" },
  { value: "HAZMAT", label: "Hazmat" },
  { value: "INSIDE_DELIVERY", label: "Inside delivery" },
  { value: "LIFTGATE", label: "Liftgate" },
  { value: "PALLET_EXCHANGE", label: "Pallet exchange" },
];
