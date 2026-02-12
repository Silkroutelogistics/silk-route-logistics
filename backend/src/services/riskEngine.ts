import { prisma } from "../config/database";
interface RiskFactor {
  factor: string;
  points: number;
  description: string;
}

interface RiskResult {
  score: number;
  level: "GREEN" | "AMBER" | "RED";
  factors: RiskFactor[];
}

/**
 * C.3 — Risk Flagging Engine
 * Scoring: 0-20=GREEN, 21-40=AMBER, 41+=RED
 */
export async function calculateLoadRisk(loadId: string): Promise<RiskResult> {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      carrier: {
        select: {
          id: true,
          email: true,
          firstName: true,
          carrierProfile: {
            select: { tier: true, scorecards: { orderBy: { calculatedAt: "desc" }, take: 1 } },
          },
        },
      },
      poster: { select: { id: true, email: true, firstName: true } },
    },
  });
  if (!load) throw new Error("Load not found");

  const factors: RiskFactor[] = [];
  const now = new Date();

  // --- Unassigned time ---
  if (!load.carrierId) {
    const hoursUnassigned = (now.getTime() - new Date(load.createdAt).getTime()) / (1000 * 60 * 60);
    if (hoursUnassigned >= 4) {
      factors.push({ factor: "UNASSIGNED_4HR", points: 50, description: `Unassigned for ${Math.round(hoursUnassigned)}h` });
    } else if (hoursUnassigned >= 2) {
      factors.push({ factor: "UNASSIGNED_2HR", points: 30, description: `Unassigned for ${Math.round(hoursUnassigned)}h` });
    }
  }

  // --- Missed check calls ---
  const missedCalls = await prisma.checkCallSchedule.count({
    where: { loadId, status: { in: ["ESCALATED", "MISSED"] } },
  });
  if (missedCalls >= 2) {
    factors.push({ factor: "MISSED_CHECKCALLS_2PLUS", points: 50, description: `${missedCalls} missed check calls` });
  } else if (missedCalls === 1) {
    factors.push({ factor: "MISSED_CHECKCALL", points: 25, description: "1 missed check call" });
  }

  // --- Pickup approaching without confirmation ---
  const hoursToPickup = (new Date(load.pickupDate).getTime() - now.getTime()) / (1000 * 60 * 60);
  const inTransitStatuses = ["DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED"];
  if (hoursToPickup > 0 && hoursToPickup <= 4 && !inTransitStatuses.includes(load.status)) {
    factors.push({ factor: "PICKUP_UNCONFIRMED", points: 40, description: `Pickup in ${Math.round(hoursToPickup)}h, no confirmation` });
  }

  // --- Carrier performance ---
  if (load.carrier?.carrierProfile) {
    const latestScore = load.carrier.carrierProfile.scorecards[0]?.overallScore || 0;
    if (latestScore > 0 && latestScore < 80) {
      factors.push({ factor: "LOW_OT_SCORE", points: 15, description: `On-time score: ${latestScore.toFixed(0)}%` });
    }

    if (load.carrier.carrierProfile.tier === "BRONZE") {
      factors.push({ factor: "BRONZE_TIER", points: 10, description: "Bronze tier carrier" });
    }
  }

  // --- Margin below 15% ---
  if (load.customerRate && load.carrierRate && load.customerRate > 0) {
    const marginPct = ((load.customerRate - load.carrierRate) / load.customerRate) * 100;
    if (marginPct < 15) {
      factors.push({ factor: "LOW_MARGIN", points: 15, description: `Margin: ${marginPct.toFixed(1)}%` });
    }
  }

  const score = factors.reduce((sum, f) => sum + f.points, 0);
  const level = score <= 20 ? "GREEN" : score <= 40 ? "AMBER" : "RED";

  return { score, level, factors };
}

/**
 * Cron job: run risk flagging for all active loads every 30 minutes
 */
export async function runRiskFlagging() {
  const activeStatuses = ["POSTED", "TENDERED", "BOOKED", "CONFIRMED", "DISPATCHED", "AT_PICKUP", "LOADED", "IN_TRANSIT", "AT_DELIVERY"];
  const loads = await prisma.load.findMany({
    where: { status: { in: activeStatuses as any[] } },
    select: { id: true, referenceNumber: true, posterId: true },
  });

  let redCount = 0;
  let amberCount = 0;

  for (const load of loads) {
    try {
      const risk = await calculateLoadRisk(load.id);

      // Store risk log
      await prisma.riskLog.create({
        data: {
          loadId: load.id,
          score: risk.score,
          level: risk.level,
          factors: risk.factors as any,
          notified: risk.level !== "GREEN",
        },
      });

      if (risk.level === "AMBER") {
        amberCount++;
        // In-console alert (dedup: only if no amber alert in last 30min)
        const recentAlert = await prisma.notification.findFirst({
          where: {
            userId: load.posterId,
            title: { contains: `Risk AMBER: Load #${load.referenceNumber}` },
            createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
          },
        });
        if (!recentAlert) {
          await prisma.notification.create({
            data: {
              userId: load.posterId,
              type: "LOAD_UPDATE",
              title: `Risk AMBER: Load #${load.referenceNumber}`,
              message: risk.factors.map((f) => f.description).join("; "),
              actionUrl: `/ae/loads.html`,
            },
          });
        }
      }

      if (risk.level === "RED") {
        redCount++;
        // In-console + email + push notification
        const recentAlert = await prisma.notification.findFirst({
          where: {
            userId: load.posterId,
            title: { contains: `RISK RED: Load #${load.referenceNumber}` },
            createdAt: { gte: new Date(Date.now() - 30 * 60 * 1000) },
          },
        });
        if (!recentAlert) {
          await prisma.notification.create({
            data: {
              userId: load.posterId,
              type: "LOAD_UPDATE",
              title: `RISK RED: Load #${load.referenceNumber}`,
              message: `URGENT — ${risk.factors.map((f) => f.description).join("; ")}`,
              actionUrl: `/ae/loads.html`,
            },
          });

          // Email the AE
          const poster = await prisma.user.findUnique({ where: { id: load.posterId }, select: { email: true, firstName: true } });
          if (poster) {
            try {
              const { sendRiskAlertEmail } = await import("./emailService");
              await sendRiskAlertEmail(poster.email, poster.firstName, load.referenceNumber, risk);
            } catch { /* non-blocking */ }
          }

          // If RED + unassigned, trigger fall-off recovery
          const hasUnassigned = risk.factors.some((f) => f.factor.startsWith("UNASSIGNED"));
          if (hasUnassigned) {
            console.log(`[Risk] RED + unassigned: Load ${load.referenceNumber} — consider fall-off recovery`);
          }
        }
      }
    } catch (err) {
      console.error(`[Risk] Error processing load ${load.id}:`, err);
    }
  }

  console.log(`[Risk] Flagging complete: ${loads.length} loads, ${redCount} RED, ${amberCount} AMBER`);
}
