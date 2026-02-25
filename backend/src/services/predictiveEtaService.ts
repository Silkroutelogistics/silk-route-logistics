/**
 * Predictive ETA Service — Phase 4
 * Combines multiple signals to predict delivery ETA with confidence intervals:
 * 1. Basic: avg speed × remaining miles
 * 2. Historical: lane transit time data from delivered loads
 * 3. Check-call / tracking event ETA updates
 * Feeds accuracy back into the AI learning loop.
 */
import { prisma } from "../config/database";

export interface PredictedETA {
  optimistic: Date;
  expected: Date;
  pessimistic: Date;
  confidence: number; // 0-1
  method: "HISTORICAL" | "SPEED_BASED" | "LAST_UPDATE" | "SCHEDULED";
  remainingMiles?: number;
  avgSpeedMph?: number;
  historicalSamples?: number;
}

/**
 * Calculate predictive ETA for a load.
 */
export async function calculatePredictiveETA(loadId: string): Promise<PredictedETA | null> {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    include: {
      loadStops: {
        where: { stopType: "DELIVERY" },
        orderBy: { stopNumber: "desc" },
        take: 1,
      },
      trackingEvents: {
        where: { etaDestination: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      checkCalls: {
        where: { etaUpdate: { not: null } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });

  if (!load) return null;

  const deliveryStop = load.loadStops[0];
  const latestTrackingETA = load.trackingEvents[0]?.etaDestination;
  const latestCheckCallETA = load.checkCalls[0]?.etaUpdate;

  // Method 1: Use most recent ETA from tracking/check-call if fresh (<2hrs old)
  const freshETA = latestTrackingETA || latestCheckCallETA;
  const freshSource = latestTrackingETA ? load.trackingEvents[0] : load.checkCalls[0];
  if (freshETA && freshSource) {
    const ageHours = (Date.now() - new Date(freshSource.createdAt).getTime()) / (1000 * 60 * 60);
    if (ageHours < 2) {
      const etaDate = new Date(freshETA);
      const bufferHrs = Math.max(0.5, ageHours * 0.3); // Buffer grows with staleness
      return {
        optimistic: new Date(etaDate.getTime() - bufferHrs * 60 * 60 * 1000),
        expected: etaDate,
        pessimistic: new Date(etaDate.getTime() + bufferHrs * 2 * 60 * 60 * 1000),
        confidence: Math.max(0.5, 0.9 - ageHours * 0.15),
        method: "LAST_UPDATE",
      };
    }
  }

  // Method 2: Historical lane transit time
  const originState = load.originState;
  const destState = load.destState;
  if (originState && destState) {
    const historicalLoads = await prisma.load.findMany({
      where: {
        originState,
        destState,
        status: { in: ["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"] },
        actualPickupDatetime: { not: null },
        actualDeliveryDatetime: { not: null },
        deletedAt: null,
      },
      select: {
        actualPickupDatetime: true,
        actualDeliveryDatetime: true,
      },
      take: 50,
      orderBy: { actualDeliveryDatetime: "desc" },
    });

    if (historicalLoads.length >= 3) {
      // Calculate transit durations in hours
      const durations = historicalLoads
        .map((l) => {
          const pickup = new Date(l.actualPickupDatetime!).getTime();
          const delivery = new Date(l.actualDeliveryDatetime!).getTime();
          return (delivery - pickup) / (1000 * 60 * 60);
        })
        .filter((d) => d > 0 && d < 240); // Filter outliers (>10 days)

      if (durations.length >= 3) {
        durations.sort((a, b) => a - b);
        const median = durations[Math.floor(durations.length / 2)];
        const p25 = durations[Math.floor(durations.length * 0.25)];
        const p75 = durations[Math.floor(durations.length * 0.75)];

        // Determine starting reference point
        const startTime = load.actualPickupDatetime
          ? new Date(load.actualPickupDatetime).getTime()
          : new Date(load.pickupDate).getTime();

        // Calculate already elapsed transit time
        const elapsedHrs = (Date.now() - startTime) / (1000 * 60 * 60);
        const remainingMedian = Math.max(0, median - elapsedHrs);
        const remainingP25 = Math.max(0, p25 - elapsedHrs);
        const remainingP75 = Math.max(0, p75 - elapsedHrs);

        const now = Date.now();
        return {
          optimistic: new Date(now + remainingP25 * 60 * 60 * 1000),
          expected: new Date(now + remainingMedian * 60 * 60 * 1000),
          pessimistic: new Date(now + remainingP75 * 60 * 60 * 1000),
          confidence: Math.min(0.85, 0.4 + durations.length * 0.03),
          method: "HISTORICAL" as const,
          historicalSamples: durations.length,
        };
      }
    }
  }

  // Method 3: Basic speed × remaining miles (use mileage cache or time-based estimate)
  {
    // Try to get cached mileage for this lane
    const originText = `${load.originCity}, ${load.originState}`;
    const destText = `${load.destCity}, ${load.destState}`;
    const cached = await prisma.mileageCache.findFirst({
      where: { originText, destinationText: destText },
      select: { practicalMiles: true },
    }).catch(() => null);

    const totalMiles = cached?.practicalMiles || null;
    if (totalMiles && totalMiles > 0) {
      const pickupTime = (load.actualPickupDatetime || load.pickupDate)
        ? new Date(load.actualPickupDatetime || load.pickupDate).getTime()
        : null;
      const now = Date.now();

      if (pickupTime && now > pickupTime) {
        const scheduledDeliveryTime = new Date(load.deliveryDate).getTime();
        const totalScheduledMs = scheduledDeliveryTime - pickupTime;
        const elapsedMs = now - pickupTime;
        const pctComplete = totalScheduledMs > 0
          ? Math.min(0.95, Math.max(0, elapsedMs / totalScheduledMs))
          : 0;

        const remainingMiles = totalMiles * (1 - pctComplete);
        const avgSpeed = 45; // National avg for trucks in mph

        const remainingHours = remainingMiles / avgSpeed;
        return {
          optimistic: new Date(now + remainingHours * 0.85 * 60 * 60 * 1000),
          expected: new Date(now + remainingHours * 60 * 60 * 1000),
          pessimistic: new Date(now + remainingHours * 1.3 * 60 * 60 * 1000),
          confidence: 0.35,
          method: "SPEED_BASED" as const,
          remainingMiles: Math.round(remainingMiles),
          avgSpeedMph: avgSpeed,
        };
      }
    }
  }

  // Fallback: scheduled delivery date
  const scheduled = deliveryStop?.appointmentDate || load.deliveryDate;
  if (scheduled) {
    const scheduledDate = new Date(scheduled);
    return {
      optimistic: new Date(scheduledDate.getTime() - 2 * 60 * 60 * 1000),
      expected: scheduledDate,
      pessimistic: new Date(scheduledDate.getTime() + 4 * 60 * 60 * 1000),
      confidence: 0.2,
      method: "SCHEDULED" as const,
    };
  }

  return null;
}

/**
 * Record ETA prediction accuracy for AI learning loop feedback.
 */
export async function recordETAAccuracy(loadId: string, predictedETA: Date, actualDelivery: Date) {
  const errorHours = Math.abs(actualDelivery.getTime() - predictedETA.getTime()) / (1000 * 60 * 60);
  const withinWindow = errorHours <= 2; // Within 2-hour window = accurate

  try {
    await prisma.learningEventQueue.create({
      data: {
        eventType: "ETA_ACCURACY",
        payload: {
          loadId,
          predictedETA: predictedETA.toISOString(),
          actualDelivery: actualDelivery.toISOString(),
          errorHours: Math.round(errorHours * 100) / 100,
          withinWindow,
        },
      },
    });
  } catch {
    // Non-blocking — don't fail if learning queue is unavailable
  }
}
