/**
 * Load Field-Level Audit Trail Service
 * Tracks every field change on a Load for TMW-level audit compliance.
 */
import { prisma } from "../config/database";

export interface LoadFieldChange {
  field: string;
  oldValue: string | null;
  newValue: string | null;
}

/**
 * Log individual field changes for a load into the AuditLog table.
 */
export async function logLoadChanges(
  loadId: string,
  userId: string,
  changes: LoadFieldChange[],
  action: string = "UPDATE"
): Promise<void> {
  if (changes.length === 0) return;

  // Batch-insert all field changes in a single transaction
  await prisma.$transaction(
    changes.map((change) =>
      prisma.auditLog.create({
        data: {
          userId,
          action: `LOAD_${action}`,
          entity: "Load",
          entityId: loadId,
          changes: JSON.stringify({
            field: change.field,
            oldValue: change.oldValue,
            newValue: change.newValue,
          }),
        },
      })
    )
  );
}

/**
 * Compare old load record with incoming update data and return changed fields.
 */
const TRACKED_FIELDS = [
  "status", "rate", "customerRate", "carrierRate", "carrierId", "customerId",
  "originCity", "originState", "originZip", "originAddress", "originCompany",
  "destCity", "destState", "destZip", "destAddress", "destCompany",
  "shipperFacility", "consigneeFacility",
  "pickupDate", "deliveryDate", "pickupTimeStart", "pickupTimeEnd",
  "deliveryTimeStart", "deliveryTimeEnd",
  "equipmentType", "commodity", "weight", "pieces", "pallets",
  "freightClass", "distance", "rateType",
  "driverName", "driverPhone", "truckNumber", "trailerNumber",
  "sealNumber", "bolNumber", "appointmentNumber",
  "specialInstructions", "loadingType", "unloadingType",
  "hazmat", "hazmatClass", "hazmatUnNumber",
  "temperatureControlled", "tempMin", "tempMax",
  "nmfcCode", "declaredValue", "stackable", "turnable",
  "dockAssignment", "driverInstructions",
  "codAmount", "paymentTermsLoad",
  "fuelSurcharge", "accessorials",
];

export function diffLoadChanges(
  oldLoad: Record<string, any>,
  newData: Record<string, any>
): LoadFieldChange[] {
  const changes: LoadFieldChange[] = [];

  for (const field of TRACKED_FIELDS) {
    if (newData[field] === undefined) continue;

    const oldVal = oldLoad[field];
    const newVal = newData[field];

    // Normalize for comparison (handle dates, nulls, JSON)
    const oldStr = oldVal != null ? String(oldVal) : null;
    const newStr = newVal != null ? String(newVal) : null;

    if (oldStr !== newStr) {
      changes.push({
        field,
        oldValue: oldStr,
        newValue: newStr,
      });
    }
  }

  return changes;
}

/**
 * Log a load creation with all initial field values.
 */
export async function logLoadCreation(
  loadId: string,
  userId: string,
  data: Record<string, any>
): Promise<void> {
  const changes: LoadFieldChange[] = [];

  for (const [field, value] of Object.entries(data)) {
    if (value != null && value !== undefined && value !== "") {
      changes.push({
        field,
        oldValue: null,
        newValue: String(value),
      });
    }
  }

  await logLoadChanges(loadId, userId, changes, "CREATE");
}

/**
 * Log a status change specifically.
 */
export async function logStatusChange(
  loadId: string,
  userId: string,
  oldStatus: string,
  newStatus: string
): Promise<void> {
  await logLoadChanges(
    loadId,
    userId,
    [{ field: "status", oldValue: oldStatus, newValue: newStatus }],
    "STATUS_CHANGE"
  );
}

/**
 * Get field-level audit history for a load.
 */
export async function getLoadAuditHistory(loadId: string) {
  const logs = await prisma.auditLog.findMany({
    where: {
      entity: "Load",
      entityId: loadId,
      action: { startsWith: "LOAD_" },
    },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return logs.map((log) => ({
    id: log.id,
    action: log.action,
    user: log.user,
    change: log.changes ? JSON.parse(log.changes) : null,
    timestamp: log.createdAt,
  }));
}
