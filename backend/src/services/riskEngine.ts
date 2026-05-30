import { prisma } from "../config/database";
import { log } from "../lib/logger";
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

    // v3.7.a: Silver is Day-1 entry tier. No tier-based risk score —
    // risk is driven by on-time score + margin + compliance, not tenure.
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
    // v3.8.ali §13.3 Item 192 — select riskEmailMuted so the email gate
    // below can honor the per-load kill switch without a second query.
    select: { id: true, referenceNumber: true, posterId: true, riskEmailMuted: true },
  });

  let redCount = 0;
  let amberCount = 0;
  let emailsSent = 0;
  let emailsMuted = 0;

  for (const load of loads) {
    try {
      const risk = await calculateLoadRisk(load.id);

      // v3.8.ali §13.3 Item 192 — once-per-load-per-level cadence.
      // Read the PRIOR RiskLog level BEFORE writing the new one, so we
      // can detect a level CROSSING. The old 30-min-window dedup re-fired
      // hourly on a persistently-RED load (cron every 30 min, dedup
      // window 30 min → notification ages out → re-fires) which is what
      // produced the 2026-05-25 email flood. Now we alert only when the
      // load crosses INTO a new level. A load that sits at RED never
      // re-emails; it fires once on the GREEN/AMBER → RED crossing and
      // stays quiet until the level actually changes again.
      const prevLog = await prisma.riskLog.findFirst({
        where: { loadId: load.id },
        orderBy: { createdAt: "desc" },
        select: { level: true },
      });
      const prevLevel = prevLog?.level ?? "GREEN";
      const levelChanged = risk.level !== prevLevel;

      // Store risk log (every tick — keeps the dashboard risk history +
      // audit trail complete regardless of whether we alert).
      await prisma.riskLog.create({
        data: {
          loadId: load.id,
          score: risk.score,
          level: risk.level,
          factors: risk.factors as any,
          // notified reflects whether THIS tick alerted (level crossing
          // into a non-GREEN level), not merely non-GREEN.
          notified: levelChanged && risk.level !== "GREEN",
        },
      });

      // No level crossing → no alert of any kind this tick. This is the
      // core flood-killer: persistent RED/AMBER stays silent.
      if (!levelChanged) continue;

      if (risk.level === "AMBER") {
        amberCount++;
        // AMBER is IN-APP ONLY (never email) per Item 192 locked
        // decision. The external channel is reserved for RED urgency.
        await prisma.notification.create({
          data: {
            userId: load.posterId,
            type: "LOAD_UPDATE",
            title: `Risk AMBER: Load #${load.referenceNumber}`,
            message: risk.factors.map((f) => f.description).join("; "),
            actionUrl: `/dashboard/tracking`,
          },
        });
      }

      if (risk.level === "RED") {
        redCount++;
        // In-app notification ALWAYS fires on the RED crossing — the
        // kill switch is email-only, so the portal badge + teammates'
        // view are never suppressed.
        await prisma.notification.create({
          data: {
            userId: load.posterId,
            type: "LOAD_UPDATE",
            title: `RISK RED: Load #${load.referenceNumber}`,
            message: `URGENT — ${risk.factors.map((f) => f.description).join("; ")}`,
            actionUrl: `/dashboard/tracking`,
          },
        });

        // v3.8.ali §13.3 Item 192 — the per-load kill switch. The
        // external email is the only channel the AE can silence per
        // load (riskEmailMuted). When muted, the in-app notification
        // above still fired; we just skip the Gmail-bound email.
        if (load.riskEmailMuted) {
          emailsMuted++;
        } else {
          const poster = await prisma.user.findUnique({ where: { id: load.posterId }, select: { email: true, firstName: true } });
          if (poster) {
            try {
              const { sendRiskAlertEmail } = await import("./emailService");
              await sendRiskAlertEmail(poster.email, poster.firstName, load.referenceNumber, risk);
              emailsSent++;
            } catch { /* non-blocking */ }
          }
        }

        // If RED + unassigned, trigger fall-off recovery
        const hasUnassigned = risk.factors.some((f) => f.factor.startsWith("UNASSIGNED"));
        if (hasUnassigned) {
          log.info(`[Risk] RED + unassigned: Load ${load.referenceNumber} — consider fall-off recovery`);
        }
      }
    } catch (err) {
      log.error({ err: err }, `[Risk] Error processing load ${load.id}:`);
    }
  }

  log.info(`[Risk] Flagging complete: ${loads.length} loads, ${redCount} RED, ${amberCount} AMBER (level-crossings only); emails sent ${emailsSent}, muted ${emailsMuted}`);
}
