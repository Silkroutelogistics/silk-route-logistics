import { prisma } from "../config/database";

/**
 * Instant Book Service — One-click load booking for qualified carriers.
 *
 * Qualified carriers (GOLD/PLATINUM tier, active compliance) can instantly
 * book loads at the posted rate without negotiation. This reduces booking
 * friction and dramatically improves time-to-cover.
 *
 * COMPETITIVE EDGE: Amazon-like "Buy Now" for freight. Reduces cover time
 * from hours to seconds.
 */

interface InstantBookResult {
  success: boolean;
  loadId: string;
  carrierId: string;
  bookedRate: number | null;
  timeToBookSeconds: number;
  reason?: string;
}

// ─── Check if Carrier Qualifies for Instant Book ─────────────────────────────

export async function canInstantBook(carrierId: string): Promise<{
  eligible: boolean;
  reasons: string[];
}> {
  const carrier = await prisma.carrierProfile.findUnique({
    where: { id: carrierId },
    select: {
      onboardingStatus: true,
      srcppTier: true,
      insuranceExpiry: true,
      companyName: true,
    },
  });

  if (!carrier) {
    return { eligible: false, reasons: ["Carrier not found"] };
  }

  const reasons: string[] = [];

  if (carrier.onboardingStatus !== "APPROVED") {
    reasons.push("Carrier not approved");
  }

  // Only GOLD and PLATINUM can instant book
  if (!["GOLD", "PLATINUM"].includes(carrier.srcppTier || "")) {
    reasons.push(`Tier ${carrier.srcppTier || "BRONZE"} — GOLD or PLATINUM required`);
  }

  // Check insurance
  if (carrier.insuranceExpiry && new Date(carrier.insuranceExpiry) < new Date()) {
    reasons.push("Insurance expired");
  }

  return {
    eligible: reasons.length === 0,
    reasons: reasons.length > 0 ? reasons : ["Carrier qualifies for instant book"],
  };
}

// ─── Check if Load Supports Instant Book ─────────────────────────────────────

export async function isLoadInstantBookable(loadId: string): Promise<{
  bookable: boolean;
  rate: number | null;
  reason: string;
}> {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: {
      status: true,
      carrierId: true,
      customerRate: true,
      carrierRate: true,
    },
  });

  if (!load) return { bookable: false, rate: null, reason: "Load not found" };
  if (load.carrierId) return { bookable: false, rate: null, reason: "Load already has a carrier" };
  if (!["POSTED", "AVAILABLE", "QUOTING"].includes(load.status)) {
    return { bookable: false, rate: null, reason: `Load status ${load.status} not eligible` };
  }

  // Rate must be posted
  const rate = load.carrierRate ?? (load.customerRate ? load.customerRate * 0.85 : null);
  if (!rate) return { bookable: false, rate: null, reason: "No rate posted for instant book" };

  return { bookable: true, rate, reason: "Load is instant-bookable" };
}

// ─── Instant Book a Load ─────────────────────────────────────────────────────

export async function instantBook(
  loadId: string,
  carrierId: string
): Promise<InstantBookResult> {
  const startTime = Date.now();

  // Check carrier eligibility
  const { eligible, reasons: carrierReasons } = await canInstantBook(carrierId);
  if (!eligible) {
    return {
      success: false,
      loadId,
      carrierId,
      bookedRate: null,
      timeToBookSeconds: (Date.now() - startTime) / 1000,
      reason: carrierReasons.join("; "),
    };
  }

  // Check load eligibility
  const { bookable, rate, reason } = await isLoadInstantBookable(loadId);
  if (!bookable || !rate) {
    return {
      success: false,
      loadId,
      carrierId,
      bookedRate: null,
      timeToBookSeconds: (Date.now() - startTime) / 1000,
      reason,
    };
  }

  // Book the load
  try {
    await prisma.load.update({
      where: { id: loadId },
      data: {
        carrierId,
        carrierRate: rate,
        status: "BOOKED",
      },
    });

    const timeToBook = (Date.now() - startTime) / 1000;

    // Log the instant book
    await prisma.instantBookLog.create({
      data: {
        loadId,
        postedRate: rate,
        accepted: true,
        carrierId,
        timeToBookSeconds: Math.round(timeToBook),
      },
    });

    return {
      success: true,
      loadId,
      carrierId,
      bookedRate: rate,
      timeToBookSeconds: timeToBook,
    };
  } catch (err) {
    return {
      success: false,
      loadId,
      carrierId,
      bookedRate: null,
      timeToBookSeconds: (Date.now() - startTime) / 1000,
      reason: err instanceof Error ? err.message : "Booking failed",
    };
  }
}

// ─── Get Instant Book Analytics ──────────────────────────────────────────────

export async function getInstantBookAnalytics(days = 30) {
  const since = new Date(Date.now() - days * 86_400_000);

  const logs = await prisma.instantBookLog.findMany({
    where: { createdAt: { gte: since } },
  });

  const total = logs.length;
  const accepted = logs.filter((l) => l.accepted).length;
  const avgTimeToBook =
    logs.filter((l) => l.accepted && l.timeToBookSeconds)
      .reduce((s, l) => s + (l.timeToBookSeconds ?? 0), 0) /
    Math.max(1, accepted);

  const avgRate =
    logs.filter((l) => l.accepted).reduce((s, l) => s + l.postedRate, 0) /
    Math.max(1, accepted);

  return {
    total,
    accepted,
    declined: total - accepted,
    acceptanceRate: total > 0 ? Math.round((accepted / total) * 1000) / 1000 : 0,
    avgTimeToBookSeconds: Math.round(avgTimeToBook * 10) / 10,
    avgBookedRate: Math.round(avgRate),
  };
}
