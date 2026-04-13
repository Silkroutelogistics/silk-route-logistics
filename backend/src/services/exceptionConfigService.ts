import { prisma } from "../config/database";

// ─── Seed Default Exception Types ───────────────────────

const DEFAULT_EXCEPTIONS = [
  // Appointment
  { code: "UNCONFIRMED_APPOINTMENT", name: "Unconfirmed Appointment", category: "APPOINTMENT", severity: "WARNING", description: "Appointment has not been confirmed more than 7 days after being requested.", thresholdValue: 7, thresholdUnit: "days" },
  { code: "MISSING_APPOINTMENT_AFTER_CREATION", name: "Missing Appointment After Creation", category: "APPOINTMENT", severity: "WARNING", description: "Required appointment has not been scheduled more than 24 hours after the load was created.", thresholdValue: 24, thresholdUnit: "hours" },
  { code: "MISSING_APPOINTMENT_AS_DATE_APPROACHES", name: "Missing Appointment As Date Approaches", category: "APPOINTMENT", severity: "CRITICAL", description: "Required appointment has not been scheduled and is less than 24 hours before expected date.", thresholdValue: 24, thresholdUnit: "hours" },

  // Stop Penalties
  { code: "STOP_PENALTY_APPROACHING", name: "Stop Penalty Approaching", category: "STOP", severity: "WARNING", description: "Warning that the detention/demurrage range is approaching at the stop.", thresholdValue: 1, thresholdUnit: "hours" },
  { code: "STOP_PENALTY_ACCRUING", name: "Stop Penalty Accruing", category: "STOP", severity: "CRITICAL", description: "Detention/demurrage is actively accruing at the stop.", thresholdValue: 2, thresholdUnit: "hours" },
  { code: "STOP_ACTUAL_DATES_NOT_PROVIDED", name: "Stop Actual Dates Not Provided", category: "STOP", severity: "WARNING", description: "Expected dates on stop have passed without actual dates provided. Needs to be the broker to resolve this.", thresholdValue: 48, thresholdUnit: "hours" },

  // Order
  { code: "ORDER_REJECTED", name: "Order Rejected", category: "ORDER", severity: "CRITICAL", description: "Order statuses do not match and either party has rejected the order." },
  { code: "ORDER_CANCELLED", name: "Order Cancelled", category: "ORDER", severity: "CRITICAL", description: "Order statuses do not match and either party has cancelled the order." },

  // Document / BOL
  { code: "ORDER_MISSING_ITEMS", name: "Order Missing Items", category: "DOCUMENT", severity: "WARNING", description: "Missing SKU/items on the BOL or Receipt." },
  { code: "ORDER_HAS_EXTRA_ITEMS", name: "Order Has Extra Items", category: "DOCUMENT", severity: "WARNING", description: "Unexpected SKU/items found on BOL or Receipt." },
  { code: "ORDER_BOL_RECEIPT_MISMATCH", name: "Order BOL and Receipt Mismatch", category: "DOCUMENT", severity: "WARNING", description: "SKU/item quantities on BOL vs Receipt do not match." },
  { code: "ORDER_QUANTITY_MISMATCH", name: "Order Quantity Mismatch", category: "DOCUMENT", severity: "WARNING", description: "Differences in unit quantities cannot be explained by standard losses." },
  { code: "ORDER_MISSING_LOT_CODE", name: "Order Missing Lot Code", category: "DOCUMENT", severity: "INFO", description: "Expected lot code is missing on the BOL or Receipt." },
  { code: "ORDER_HAS_EXTRA_LOT_CODE", name: "Order Has Extra Lot Code", category: "DOCUMENT", severity: "INFO", description: "Unexpected lot code on the BOL or Receipt." },
  { code: "LOT_CODE_BOL_RECEIPT_MISMATCH", name: "Lot Code BOL and Receipt Mismatch", category: "DOCUMENT", severity: "WARNING", description: "Lot code quantities on BOL vs Receipt do not match." },
  { code: "LOT_CODE_QUANTITY_MISMATCH", name: "Lot Code Quantity Mismatch", category: "DOCUMENT", severity: "WARNING", description: "Differences in lot code quantities cannot be explained." },

  // Financial
  { code: "MULTIPLE_LINEHAULS", name: "Multiple Linehauls", category: "FINANCIAL", severity: "WARNING", description: "Extra linehaul found on the invoice." },
  { code: "INCONSISTENT_INVOICE_CURRENCIES", name: "Inconsistent Invoice Currencies", category: "FINANCIAL", severity: "CRITICAL", description: "Forwarded line items for invoices have different currencies." },
  { code: "EXCESSIVE_FUEL_SURCHARGE", name: "Excessive Fuel Surcharge", category: "FINANCIAL", severity: "WARNING", description: "Fuel surcharge is greater than a specified percentage of linehaul invoice for receivers.", thresholdValue: 30, thresholdUnit: "percent" },
  { code: "INVOICE_PRICE_MISMATCH", name: "Invoice Price Mismatch from Quoted Price", category: "FINANCIAL", severity: "CRITICAL", description: "Carrier invoice amount does not match the quoted/booked rate.", thresholdValue: 5, thresholdUnit: "percent" },

  // Carrier
  { code: "TENDERED_BUT_NOT_ACCEPTED", name: "Tendered But Not Accepted", category: "CARRIER", severity: "WARNING", description: "Tender has been sent but carrier has not accepted. Needs to be the broker to follow up.", thresholdValue: 4, thresholdUnit: "hours" },
  { code: "CARRIER_INSURANCE_EXPIRING", name: "Carrier Insurance Expiring", category: "CARRIER", severity: "CRITICAL", description: "Carrier's insurance certificate is expiring within the threshold period.", thresholdValue: 30, thresholdUnit: "days" },
  { code: "CARRIER_NO_TRACKING_UPDATE", name: "Carrier No Tracking Update", category: "CARRIER", severity: "WARNING", description: "No tracking update received from carrier within expected interval.", thresholdValue: 6, thresholdUnit: "hours" },
  { code: "LATE_PICKUP", name: "Late Pickup", category: "CARRIER", severity: "WARNING", description: "Carrier has not arrived at pickup by the scheduled time." },
  { code: "LATE_DELIVERY", name: "Late Delivery", category: "CARRIER", severity: "CRITICAL", description: "Carrier has not arrived at delivery by the scheduled time." },
];

export async function seedExceptionConfigs() {
  for (const exc of DEFAULT_EXCEPTIONS) {
    await prisma.exceptionConfig.upsert({
      where: { code: exc.code },
      update: {},
      create: {
        code: exc.code,
        name: exc.name,
        category: exc.category,
        severity: exc.severity as any,
        description: exc.description,
        thresholdValue: exc.thresholdValue,
        thresholdUnit: exc.thresholdUnit,
        notifyRoles: ["ADMIN", "OPERATIONS", "DISPATCH"],
      },
    });
  }
}

// ─── Config CRUD ────────────────────────────────────────

export async function getExceptionConfigs(category?: string) {
  const where: any = {};
  if (category) where.category = category;
  return prisma.exceptionConfig.findMany({ where, orderBy: [{ category: "asc" }, { name: "asc" }] });
}

export async function updateExceptionConfig(id: string, data: { isEnabled?: boolean; severity?: string; thresholdValue?: number; thresholdUnit?: string; notifyRoles?: string[]; autoResolve?: boolean }) {
  return prisma.exceptionConfig.update({ where: { id }, data: data as any });
}

// ─── Alert CRUD ─────────────────────────────────────────

export async function createExceptionAlert(data: { configId: string; loadId?: string; invoiceId?: string; carrierId?: string; customerId?: string; entityType: string; entityId: string; severity: string; message: string; details?: any }) {
  return prisma.exceptionAlert.create({ data: data as any });
}

export async function getExceptionAlerts(filters: { status?: string; entityType?: string; entityId?: string; loadId?: string; severity?: string; page: number; limit: number }) {
  const where: any = {};
  if (filters.status) where.status = filters.status;
  if (filters.entityType) where.entityType = filters.entityType;
  if (filters.entityId) where.entityId = filters.entityId;
  if (filters.loadId) where.loadId = filters.loadId;
  if (filters.severity) where.severity = filters.severity;

  const [items, total] = await Promise.all([
    prisma.exceptionAlert.findMany({
      where,
      include: {
        config: { select: { code: true, name: true, category: true } },
        resolvedBy: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (filters.page - 1) * filters.limit,
      take: filters.limit,
    }),
    prisma.exceptionAlert.count({ where }),
  ]);

  return { items, total, totalPages: Math.ceil(total / filters.limit) };
}

export async function resolveExceptionAlert(id: string, resolvedById: string, note?: string) {
  return prisma.exceptionAlert.update({
    where: { id },
    data: { status: "RESOLVED", resolvedAt: new Date(), resolvedById, resolvedNote: note },
  });
}

export async function dismissExceptionAlert(id: string, resolvedById: string, note?: string) {
  return prisma.exceptionAlert.update({
    where: { id },
    data: { status: "DISMISSED", resolvedAt: new Date(), resolvedById, resolvedNote: note },
  });
}

export async function getExceptionAlertStats() {
  const [open, acknowledged, resolvedToday] = await Promise.all([
    prisma.exceptionAlert.count({ where: { status: "OPEN" } }),
    prisma.exceptionAlert.count({ where: { status: "ACKNOWLEDGED" } }),
    prisma.exceptionAlert.count({
      where: { status: "RESOLVED", resolvedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } },
    }),
  ]);
  return { open, acknowledged, resolvedToday, total: open + acknowledged };
}
