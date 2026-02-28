import { prisma } from "../config/database";

const ACTIVE_LOAD_STATUSES: any[] = [
  "IN_TRANSIT",
  "DISPATCHED",
  "AT_PICKUP",
  "LOADED",
  "BOOKED",
  "CONFIRMED",
];

type OverbookingRisk = "NONE" | "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

/**
 * Determine the overbooking risk level based on active loads vs fleet capacity.
 */
function calculateRiskLevel(
  activeLoads: number,
  numberOfTrucks: number | null
): OverbookingRisk {
  if (numberOfTrucks === null || numberOfTrucks === 0) {
    if (activeLoads > 1) return "HIGH";
    if (activeLoads === 1) return "MEDIUM";
    return "NONE";
  }

  if (activeLoads <= numberOfTrucks * 0.8) return "NONE";
  if (activeLoads <= numberOfTrucks) return "LOW";
  if (activeLoads <= numberOfTrucks * 1.2) return "MEDIUM";
  if (activeLoads <= numberOfTrucks * 1.5) return "HIGH";
  return "CRITICAL";
}

/**
 * Check overbooking risk for a single carrier.
 * Counts active loads, compares against fleet size, updates CarrierProfile,
 * and creates alerts/notifications for HIGH/CRITICAL risk.
 */
export async function checkOverbooking(carrierId: string) {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    select: {
      id: true,
      userId: true,
      numberOfTrucks: true,
      companyName: true,
    },
  });

  if (!carrier) {
    throw new Error(`CarrierProfile not found: ${carrierId}`);
  }

  const activeLoadCount = await prisma.load.count({
    where: {
      carrierId: carrier.userId,
      status: { in: ACTIVE_LOAD_STATUSES },
    },
  });

  const risk = calculateRiskLevel(activeLoadCount, carrier.numberOfTrucks);

  // Update carrier profile with overbooking data
  await prisma.carrierProfile.update({
    where: { id: carrierId },
    data: {
      overbookingRisk: risk,
      overbookingLastCheck: new Date(),
      activeLoadCount,
    },
  });

  // Create ComplianceAlert for HIGH or CRITICAL
  if (risk === "HIGH" || risk === "CRITICAL") {
    const entityName =
      carrier.companyName || `Carrier ${carrierId.slice(0, 8)}`;
    const trucks = carrier.numberOfTrucks ?? 0;
    const utilization =
      trucks > 0
        ? Math.round((activeLoadCount / trucks) * 100)
        : activeLoadCount > 0
          ? 999
          : 0;

    await prisma.complianceAlert.create({
      data: {
        type: "OVERBOOKING",
        entityType: "CARRIER",
        entityId: carrierId,
        entityName,
        severity: risk === "CRITICAL" ? "CRITICAL" : "WARNING",
        expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        status: "ACTIVE",
      },
    });

    // Notify ADMIN and DISPATCH users for CRITICAL risk
    if (risk === "CRITICAL") {
      const adminsAndDispatch = await prisma.user.findMany({
        where: {
          role: { in: ["ADMIN", "DISPATCH"] },
          isActive: true,
        },
        select: { id: true },
      });

      const title = `CRITICAL Overbooking: ${entityName}`;
      const message =
        `${entityName} has ${activeLoadCount} active loads but only ${trucks} truck(s) — ` +
        `${utilization}% utilization. Possible double-brokering.`;

      await prisma.notification.createMany({
        data: adminsAndDispatch.map((user) => ({
          userId: user.id,
          type: "SYSTEM_ERROR" as const,
          title,
          message,
          link: `/carriers/${carrierId}`,
        })),
      }).catch(() => {});
    }
  }

  return {
    carrierId,
    activeLoadCount,
    numberOfTrucks: carrier.numberOfTrucks,
    risk,
  };
}

/**
 * Batch check all carriers that currently have active loads.
 * Returns summary statistics.
 */
export async function checkAllCarrierOverbooking() {
  // Find all carriers with at least one active load
  const carriersWithLoads = await prisma.load.groupBy({
    by: ["carrierId"],
    where: {
      carrierId: { not: null },
      status: { in: ACTIVE_LOAD_STATUSES },
    },
    _count: { id: true },
  });

  // Map carrierId (userId) back to CarrierProfile IDs
  const userIds = carriersWithLoads
    .map((c) => c.carrierId)
    .filter((id): id is string => id !== null);

  const profiles = await prisma.carrierProfile.findMany({
    where: { userId: { in: userIds } },
    select: { id: true, userId: true },
  });

  const userToProfile = new Map(profiles.map((p) => [p.userId, p.id]));

  const results = {
    total: 0,
    checked: 0,
    byRisk: { NONE: 0, LOW: 0, MEDIUM: 0, HIGH: 0, CRITICAL: 0 } as Record<
      OverbookingRisk,
      number
    >,
    errors: [] as { carrierId: string; error: string }[],
  };

  results.total = carriersWithLoads.length;

  for (const entry of carriersWithLoads) {
    const profileId = userToProfile.get(entry.carrierId!);
    if (!profileId) {
      results.errors.push({
        carrierId: entry.carrierId!,
        error: "No CarrierProfile found for userId",
      });
      continue;
    }

    try {
      const result = await checkOverbooking(profileId);
      results.checked++;
      results.byRisk[result.risk]++;
    } catch (err: any) {
      results.errors.push({
        carrierId: profileId,
        error: err.message || "Unknown error",
      });
    }
  }

  return results;
}

/**
 * Get a detailed overbooking report for a specific carrier,
 * including the list of active loads with reference numbers.
 */
export async function getOverbookingReport(carrierId: string) {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    select: {
      id: true,
      userId: true,
      numberOfTrucks: true,
      companyName: true,
      overbookingRisk: true,
      overbookingLastCheck: true,
      activeLoadCount: true,
    },
  });

  if (!carrier) {
    throw new Error(`CarrierProfile not found: ${carrierId}`);
  }

  const activeLoads = await prisma.load.findMany({
    where: {
      carrierId: carrier.userId,
      status: { in: ACTIVE_LOAD_STATUSES },
    },
    select: {
      id: true,
      referenceNumber: true,
      status: true,
      originCity: true,
      originState: true,
      destCity: true,
      destState: true,
      pickupDate: true,
      deliveryDate: true,
      carrierRate: true,
    },
    orderBy: { pickupDate: "asc" },
  });

  const trucks = carrier.numberOfTrucks ?? 0;
  const utilization =
    trucks > 0
      ? Math.round((activeLoads.length / trucks) * 100)
      : activeLoads.length > 0
        ? 999
        : 0;

  const risk = calculateRiskLevel(activeLoads.length, carrier.numberOfTrucks);

  return {
    carrierId,
    companyName: carrier.companyName,
    fleetSize: carrier.numberOfTrucks,
    activeLoadCount: activeLoads.length,
    utilizationPercent: utilization,
    risk,
    lastChecked: carrier.overbookingLastCheck,
    activeLoads: activeLoads.map((load) => ({
      id: load.id,
      referenceNumber: load.referenceNumber,
      status: load.status,
      origin: `${load.originCity}, ${load.originState}`,
      destination: `${load.destCity}, ${load.destState}`,
      pickupDate: load.pickupDate,
      deliveryDate: load.deliveryDate,
      carrierRate: load.carrierRate,
    })),
  };
}
