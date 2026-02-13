import { prisma } from "../config/database";
import { Prisma } from "@prisma/client";

/**
 * Shipment Monitor Service — AI-powered risk assessment for active loads.
 *
 * Continuously scans active shipments and assigns risk scores based on:
 *   - Carrier reliability + fall-off risk
 *   - Weather / route conditions (stub for future integration)
 *   - Check-call compliance
 *   - Proximity to delivery deadline
 *   - Lane historical performance
 *
 * COMPETITIVE EDGE: Proactive risk detection before problems occur.
 */

const toJson = (v: Record<string, unknown>): Prisma.InputJsonValue =>
  JSON.parse(JSON.stringify(v)) as Prisma.InputJsonValue;

interface ShipmentRisk {
  loadId: string;
  riskScore: number;    // 0-100
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  factors: Array<{ name: string; score: number; description: string }>;
  recommendation: string;
}

// ─── Assess Risk for a Single Load ───────────────────────────────────────────

export async function assessLoadRisk(loadId: string): Promise<ShipmentRisk> {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: {
      id: true,
      status: true,
      carrierId: true,
      pickupDate: true,
      deliveryDate: true,
      actualPickupDatetime: true,
      originState: true,
      destState: true,
      equipmentType: true,
      createdAt: true,
    },
  });

  if (!load) {
    return {
      loadId,
      riskScore: 0,
      riskLevel: "LOW",
      factors: [],
      recommendation: "Load not found",
    };
  }

  const factors: Array<{ name: string; score: number; description: string }> = [];

  // Factor 1: Carrier reliability (0-25 risk points, higher = more risk)
  if (load.carrierId) {
    const intel = await prisma.carrierIntelligence.findFirst({
      where: { carrierId: load.carrierId, laneKey: "__global__" },
    });

    if (intel) {
      const carrierRisk = Math.round((1 - intel.reliabilityScore / 100) * 25);
      factors.push({
        name: "Carrier Reliability",
        score: carrierRisk,
        description: `Reliability score: ${intel.reliabilityScore}/100`,
      });

      // Fall-off risk
      const fallOffRisk = Math.round(intel.fallOffRisk * 20);
      factors.push({
        name: "Fall-off Risk",
        score: fallOffRisk,
        description: `Fall-off probability: ${(intel.fallOffRisk * 100).toFixed(0)}%`,
      });
    }
  } else {
    factors.push({
      name: "No Carrier Assigned",
      score: 20,
      description: "Load has no carrier — high risk of non-coverage",
    });
  }

  // Factor 2: Deadline proximity (0-20 risk points)
  if (load.pickupDate) {
    const hoursToPickup = (new Date(load.pickupDate).getTime() - Date.now()) / 3_600_000;

    if (hoursToPickup < 0 && !load.actualPickupDatetime) {
      factors.push({
        name: "Overdue Pickup",
        score: 20,
        description: `Pickup was ${Math.abs(Math.round(hoursToPickup))} hours ago — no confirmation`,
      });
    } else if (hoursToPickup < 4 && !load.actualPickupDatetime) {
      factors.push({
        name: "Imminent Pickup",
        score: 12,
        description: `Pickup in ${Math.round(hoursToPickup)} hours — no confirmation yet`,
      });
    } else if (hoursToPickup < 24 && !load.actualPickupDatetime) {
      factors.push({
        name: "Upcoming Pickup",
        score: 5,
        description: `Pickup in ${Math.round(hoursToPickup)} hours`,
      });
    }
  }

  // Factor 3: Check-call compliance (0-15 risk points)
  const recentCheckCalls = await prisma.checkCall.count({
    where: {
      loadId,
      createdAt: { gte: new Date(Date.now() - 12 * 3_600_000) },
    },
  }).catch(() => 0);

  if (load.status === "IN_TRANSIT" && recentCheckCalls === 0) {
    factors.push({
      name: "Missing Check Calls",
      score: 15,
      description: "No check calls in last 12 hours while in transit",
    });
  } else if (load.status === "IN_TRANSIT" && recentCheckCalls < 2) {
    factors.push({
      name: "Low Check-Call Frequency",
      score: 8,
      description: `Only ${recentCheckCalls} check call(s) in last 12 hours`,
    });
  }

  // Factor 4: Lane volatility (0-10 risk points)
  if (load.originState && load.destState) {
    const laneKey = `${load.originState}:${load.destState}`;
    const laneIntel = await prisma.laneIntelligence.findUnique({ where: { laneKey } });

    if (laneIntel && laneIntel.demand === "HIGH") {
      factors.push({
        name: "High-Demand Lane",
        score: 5,
        description: "Lane is in high demand — carrier may receive competing offers",
      });
    }
  }

  // Calculate total risk
  const totalRisk = Math.min(100, factors.reduce((s, f) => s + f.score, 0));
  const riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" =
    totalRisk >= 70 ? "CRITICAL" : totalRisk >= 50 ? "HIGH" : totalRisk >= 25 ? "MEDIUM" : "LOW";

  let recommendation = "Shipment looks good — no action needed";
  if (riskLevel === "CRITICAL") recommendation = "URGENT: Immediate attention required — contact carrier and prepare backup";
  else if (riskLevel === "HIGH") recommendation = "High risk — proactively reach out to carrier for status update";
  else if (riskLevel === "MEDIUM") recommendation = "Moderate risk — schedule additional check call";

  return { loadId, riskScore: totalRisk, riskLevel, factors, recommendation };
}

// ─── Scan All Active Loads ───────────────────────────────────────────────────

export async function scanActiveShipments(): Promise<{
  scanned: number;
  highRisk: number;
  critical: number;
  risks: ShipmentRisk[];
}> {
  console.log("[ShipmentMonitor] Scanning active shipments...");

  const activeLoads = await prisma.load.findMany({
    where: {
      status: { in: ["BOOKED", "DISPATCHED", "IN_TRANSIT", "AT_PICKUP", "AT_DELIVERY"] },
    },
    select: { id: true },
  });

  const risks: ShipmentRisk[] = [];

  for (const load of activeLoads) {
    const risk = await assessLoadRisk(load.id);
    risks.push(risk);

    // Log high-risk shipments
    if (risk.riskLevel === "HIGH" || risk.riskLevel === "CRITICAL") {
      await prisma.shipmentRiskLog.create({
        data: {
          loadId: load.id,
          riskScore: risk.riskScore,
          riskLevel: risk.riskLevel,
          riskFactorsJson: toJson(
            Object.fromEntries(risk.factors.map((f) => [f.name, f.score]))
          ),
        },
      }).catch(() => {});
    }
  }

  const highRisk = risks.filter((r) => r.riskLevel === "HIGH").length;
  const critical = risks.filter((r) => r.riskLevel === "CRITICAL").length;

  console.log(`[ShipmentMonitor] Scanned ${activeLoads.length} loads: ${critical} critical, ${highRisk} high risk`);

  return { scanned: activeLoads.length, highRisk, critical, risks };
}

// ─── Get Risk Dashboard ──────────────────────────────────────────────────────

export async function getRiskDashboard() {
  const recent = await prisma.shipmentRiskLog.findMany({
    orderBy: { scannedAt: "desc" },
    take: 50,
  });

  const criticalCount = recent.filter((r) => r.riskLevel === "CRITICAL").length;
  const highCount = recent.filter((r) => r.riskLevel === "HIGH").length;

  return {
    recentRisks: recent,
    criticalCount,
    highCount,
    totalScanned: recent.length,
  };
}
