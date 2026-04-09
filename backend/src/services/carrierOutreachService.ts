import { prisma } from "../config/database";
import { sendEmail, wrap } from "./emailService";
import { matchCarriersForLoad } from "./smartMatchService";
import { log } from "../lib/logger";

/**
 * AI Carrier Outreach Service
 * When a load is posted, automatically emails the top matched carriers
 * to notify them of the available load opportunity.
 */

// ── Anti-spam: track which carriers were already notified per load ──
const notifiedCarriersPerLoad = new Map<string, Set<string>>();

// ── Rate limiter: max 20 outreach emails per hour ──
const outreachTimestamps: number[] = [];
const MAX_OUTREACH_PER_HOUR = 20;

function canSendOutreach(): boolean {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  // Prune old timestamps
  while (outreachTimestamps.length > 0 && outreachTimestamps[0] < oneHourAgo) {
    outreachTimestamps.shift();
  }
  return outreachTimestamps.length < MAX_OUTREACH_PER_HOUR;
}

function recordOutreach(): void {
  outreachTimestamps.push(Date.now());
}

// ── Region mapping: state → region name ──
const STATE_TO_REGION: Record<string, string> = {
  // Northeast
  CT: "Northeast", DE: "Northeast", MA: "Northeast", MD: "Northeast",
  ME: "Northeast", NH: "Northeast", NJ: "Northeast", NY: "Northeast",
  PA: "Northeast", RI: "Northeast", VT: "Northeast",
  // Southeast
  AL: "Southeast", FL: "Southeast", GA: "Southeast", KY: "Southeast",
  MS: "Southeast", NC: "Southeast", SC: "Southeast", TN: "Southeast",
  VA: "Southeast", WV: "Southeast",
  // Midwest
  IA: "Midwest", IL: "Midwest", IN: "Midwest", KS: "Midwest",
  MI: "Midwest", MN: "Midwest", MO: "Midwest", ND: "Midwest",
  NE: "Midwest", OH: "Midwest", SD: "Midwest", WI: "Midwest",
  // Southwest
  AR: "Southwest", AZ: "Southwest", NM: "Southwest", OK: "Southwest", TX: "Southwest",
  // West
  CA: "West", CO: "West", HI: "West", ID: "West", MT: "West",
  NV: "West", OR: "West", UT: "West", WA: "West", WY: "West",
  // Canada / cross-border
  AB: "Canada", BC: "Canada", MB: "Canada", NB: "Canada",
  NL: "Canada", NS: "Canada", NT: "Canada", NU: "Canada",
  ON: "Canada", PE: "Canada", QC: "Canada", SK: "Canada", YT: "Canada",
};

function getRegionsForLoad(originState: string, destState: string): string[] {
  const regions = new Set<string>();
  const originRegion = STATE_TO_REGION[originState];
  const destRegion = STATE_TO_REGION[destState];
  if (originRegion) regions.add(originRegion);
  if (destRegion) regions.add(destRegion);
  // Also add the raw state codes so carriers who list states directly can match
  regions.add(originState);
  regions.add(destState);
  return Array.from(regions);
}

/**
 * Generate branded HTML email for carrier outreach
 */
export function generateOutreachEmail(
  load: {
    originCity: string;
    originState: string;
    destCity: string;
    destState: string;
    equipmentType: string;
    weight: number | null;
    pickupDate: Date;
    rate: number;
  },
  carrierName: string,
): string {
  const route = `${load.originCity}, ${load.originState} &rarr; ${load.destCity}, ${load.destState}`;
  const pickupStr = load.pickupDate.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const weightStr = load.weight ? `${load.weight.toLocaleString()} lbs` : "TBD";
  const rateStr = `$${load.rate.toLocaleString()}`;

  return wrap(`
    <h2 style="color:#0f172a">New Load Available</h2>
    <p>Hi ${carrierName},</p>
    <p>A new load matching your equipment and regions is available:</p>
    <table style="width:100%;border-collapse:collapse;margin:16px 0">
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Route</td><td style="padding:8px;border:1px solid #e2e8f0">${route}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Equipment</td><td style="padding:8px;border:1px solid #e2e8f0">${load.equipmentType}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Weight</td><td style="padding:8px;border:1px solid #e2e8f0">${weightStr}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Pickup</td><td style="padding:8px;border:1px solid #e2e8f0">${pickupStr}</td></tr>
      <tr><td style="padding:8px;border:1px solid #e2e8f0;font-weight:bold">Rate</td><td style="padding:8px;border:1px solid #e2e8f0">${rateStr}</td></tr>
    </table>
    <div style="text-align:center;margin:24px 0">
      <a href="https://silkroutelogistics.ai/carrier/dashboard/available-loads" style="display:inline-block;background:#d4a574;color:#0f172a;padding:14px 32px;text-decoration:none;border-radius:6px;font-weight:bold;font-size:16px">Accept This Load</a>
    </div>
    <p style="color:#64748b;font-size:13px">This load was matched to you based on your equipment type and operating regions.</p>
    <p style="color:#94a3b8;font-size:12px;margin-top:16px">&mdash; Silk Route Logistics<br/>Kalamazoo, Michigan</p>
  `);
}

/**
 * Main function: find top 5 matched carriers and notify them via email + in-app notification.
 */
export async function notifyMatchedCarriers(
  loadId: string,
): Promise<{ notified: number; carriers: string[] }> {
  // Fetch load
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: {
      id: true,
      referenceNumber: true,
      status: true,
      originCity: true,
      originState: true,
      destCity: true,
      destState: true,
      equipmentType: true,
      weight: true,
      pickupDate: true,
      rate: true,
    },
  });

  if (!load || load.status !== "POSTED") {
    log.info(`[CarrierOutreach] Load ${loadId} not found or not POSTED, skipping`);
    return { notified: 0, carriers: [] };
  }

  // Try AI smart matching first, fall back to simple equipment/region matching
  let top5: Array<{
    userId: string;
    user: { id: string; email: string; firstName: string | null; lastName: string | null; company: string | null; isVerified: boolean };
    operatingRegions: string[];
    equipmentTypes: string[];
  }> = [];

  try {
    const smartResult = await matchCarriersForLoad(loadId);
    if (smartResult.matches.length > 0) {
      // Fetch full user info for each smart-matched carrier
      const smartCarrierProfiles = await prisma.carrierProfile.findMany({
        where: { userId: { in: smartResult.matches.slice(0, 5).map((m) => m.userId) } },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, company: true, isVerified: true },
          },
        },
      });
      top5 = smartCarrierProfiles;
      log.info(`[CarrierOutreach] Smart match found ${smartResult.matches.length} candidates for load ${load.referenceNumber}`);
    }
  } catch (e: any) {
    log.info(`[CarrierOutreach] Smart match unavailable, falling back to simple matching: ${e.message}`);
  }

  // Fallback: simple equipment/region matching if smart match returned nothing
  if (top5.length === 0) {
    const loadRegions = getRegionsForLoad(load.originState, load.destState);

    const matchingCarriers = await prisma.carrierProfile.findMany({
      where: {
        onboardingStatus: "APPROVED",
        equipmentTypes: { hasSome: [load.equipmentType] },
      },
      include: {
        user: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            company: true,
            isVerified: true,
          },
        },
      },
    });

    const regionMatched = matchingCarriers.filter((cp) => {
      if (cp.operatingRegions.length === 0) return true;
      return cp.operatingRegions.some((r) => loadRegions.includes(r));
    });

    const withCapacity: typeof regionMatched = [];
    for (const carrier of regionMatched) {
      const activeLoads = await prisma.load.count({
        where: {
          carrierId: carrier.userId,
          status: { in: ["BOOKED", "DISPATCHED", "AT_PICKUP", "LOADED", "PICKED_UP", "IN_TRANSIT", "AT_DELIVERY"] },
        },
      });
      if (activeLoads < 3) {
        withCapacity.push(carrier);
      }
    }

    top5 = withCapacity.slice(0, 5);
  }

  if (top5.length === 0) {
    log.info(`[CarrierOutreach] No matching carriers found for load ${load.referenceNumber}`);
    return { notified: 0, carriers: [] };
  }

  // Get or create the notified set for this load
  if (!notifiedCarriersPerLoad.has(loadId)) {
    // Also check the notifications table for previously notified carriers
    const existingNotifs = await prisma.notification.findMany({
      where: {
        title: "New Load Available",
        message: { contains: load.referenceNumber },
        userId: { in: top5.map((c) => c.userId) },
      },
      select: { userId: true },
    });
    const alreadyNotified = new Set(existingNotifs.map((n) => n.userId));
    notifiedCarriersPerLoad.set(loadId, alreadyNotified);
  }
  const notifiedSet = notifiedCarriersPerLoad.get(loadId)!;

  const notifiedCarrierNames: string[] = [];
  let emailsSent = 0;

  const route = `${load.originCity}, ${load.originState} → ${load.destCity}, ${load.destState}`;
  const subject = `New Load Available: ${load.originCity}, ${load.originState} → ${load.destCity}, ${load.destState}`;

  for (const carrier of top5) {
    // Skip if already notified about this load
    if (notifiedSet.has(carrier.userId)) {
      continue;
    }

    // Skip carriers without verified email
    if (!carrier.user.isVerified || !carrier.user.email) {
      continue;
    }

    // Check rate limit
    if (!canSendOutreach()) {
      log.info(`[CarrierOutreach] Rate limit reached (${MAX_OUTREACH_PER_HOUR}/hr), stopping outreach for load ${load.referenceNumber}`);
      break;
    }

    const carrierName = carrier.user.company || `${carrier.user.firstName} ${carrier.user.lastName}`;

    // Send email
    try {
      const html = generateOutreachEmail(load, carrierName);
      await sendEmail(carrier.user.email, subject, html);
      recordOutreach();
      emailsSent++;
    } catch (err: any) {
      log.error({ err: err }, `[CarrierOutreach] Email failed for ${carrier.user.email}:`);
      // Continue to next carrier on email failure
    }

    // Create in-app notification
    await prisma.notification.create({
      data: {
        userId: carrier.userId,
        type: "LOAD_UPDATE",
        title: "New Load Available",
        message: `New ${load.equipmentType} load available: ${route}${load.rate ? ` — $${load.rate.toLocaleString()}` : ""} (${load.referenceNumber})`,
        actionUrl: "/carrier/dashboard/available-loads",
      },
    });

    // Mark as notified
    notifiedSet.add(carrier.userId);
    notifiedCarrierNames.push(carrierName);
  }

  // Log the outreach in SystemLog
  if (emailsSent > 0) {
    await prisma.systemLog.create({
      data: {
        logType: "INTEGRATION",
        severity: "INFO",
        source: "CarrierOutreachService",
        message: `Outreach sent for load ${load.referenceNumber}: ${emailsSent} carrier(s) notified`,
        details: {
          loadId: load.id,
          referenceNumber: load.referenceNumber,
          route,
          equipmentType: load.equipmentType,
          rate: load.rate,
          carriers: notifiedCarrierNames,
          emailsSent,
        } as any,
      },
    });
  }

  log.info(`[CarrierOutreach] Load ${load.referenceNumber}: ${emailsSent} email(s) sent to [${notifiedCarrierNames.join(", ")}]`);
  return { notified: emailsSent, carriers: notifiedCarrierNames };
}
