import { prisma } from "../config/database";

/**
 * Facility Rating Service — Crowd-sourced facility intelligence from carriers.
 *
 * Carriers rate pickup/delivery facilities after each load. The system
 * aggregates ratings into FacilityProfile records that help dispatchers
 * set realistic expectations and carriers make informed decisions.
 *
 * COMPETITIVE EDGE: Google-Maps-style facility ratings — rare in TMS platforms.
 */

interface FacilityRatingInput {
  facilityName: string;
  facilityAddress: string;
  facilityCity: string;
  facilityState: string;
  facilityZip: string;
  carrierId: string;
  loadId: string;
  locationType: "PICKUP" | "DELIVERY";
  waitTimeMinutes?: number;
  dockAccess: number;       // 1-5
  communication: number;    // 1-5
  safety: number;           // 1-5
  overall: number;          // 1-5
  comments?: string;
}

// ─── Submit a Rating ─────────────────────────────────────────────────────────

export async function submitFacilityRating(input: FacilityRatingInput): Promise<{
  ratingId: string;
  facilityProfileId: string;
}> {
  // Create the individual rating
  const rating = await prisma.facilityRating.create({
    data: {
      facilityName: input.facilityName,
      facilityAddress: input.facilityAddress,
      facilityCity: input.facilityCity,
      facilityState: input.facilityState,
      facilityZip: input.facilityZip,
      carrierId: input.carrierId,
      loadId: input.loadId,
      locationType: input.locationType,
      waitTimeMinutes: input.waitTimeMinutes ?? null,
      dockAccess: input.dockAccess,
      communication: input.communication,
      safety: input.safety,
      overall: input.overall,
      comments: input.comments ?? null,
    },
  });

  // Update the facility profile (aggregate)
  const profile = await updateFacilityProfile(
    input.facilityAddress,
    input.facilityCity,
    input.facilityState,
    input.facilityName,
    input.facilityZip
  );

  return { ratingId: rating.id, facilityProfileId: profile.id };
}

// ─── Update Facility Profile (Aggregate Ratings) ─────────────────────────────

async function updateFacilityProfile(
  address: string,
  city: string,
  state: string,
  name: string,
  zip: string
) {
  // Get all ratings for this facility
  const ratings = await prisma.facilityRating.findMany({
    where: { facilityAddress: address, facilityCity: city, facilityState: state },
  });

  if (ratings.length === 0) {
    return prisma.facilityProfile.upsert({
      where: { address_city_state: { address, city, state } },
      create: { facilityName: name, address, city, state, zip },
      update: {},
    });
  }

  const avg = (arr: number[]) => arr.reduce((s, v) => s + v, 0) / arr.length;
  const waitTimes = ratings.filter((r) => r.waitTimeMinutes != null).map((r) => r.waitTimeMinutes!);

  return prisma.facilityProfile.upsert({
    where: { address_city_state: { address, city, state } },
    create: {
      facilityName: name,
      address,
      city,
      state,
      zip,
      avgWaitTime: waitTimes.length > 0 ? Math.round(avg(waitTimes)) : 0,
      avgDockAccess: Math.round(avg(ratings.map((r) => r.dockAccess)) * 10) / 10,
      avgCommunication: Math.round(avg(ratings.map((r) => r.communication)) * 10) / 10,
      avgSafety: Math.round(avg(ratings.map((r) => r.safety)) * 10) / 10,
      avgOverall: Math.round(avg(ratings.map((r) => r.overall)) * 10) / 10,
      totalRatings: ratings.length,
      lastRatedAt: new Date(),
    },
    update: {
      avgWaitTime: waitTimes.length > 0 ? Math.round(avg(waitTimes)) : 0,
      avgDockAccess: Math.round(avg(ratings.map((r) => r.dockAccess)) * 10) / 10,
      avgCommunication: Math.round(avg(ratings.map((r) => r.communication)) * 10) / 10,
      avgSafety: Math.round(avg(ratings.map((r) => r.safety)) * 10) / 10,
      avgOverall: Math.round(avg(ratings.map((r) => r.overall)) * 10) / 10,
      totalRatings: ratings.length,
      lastRatedAt: new Date(),
    },
  });
}

// ─── Get Facility Profile ────────────────────────────────────────────────────

export async function getFacilityProfile(address: string, city: string, state: string) {
  return prisma.facilityProfile.findUnique({
    where: { address_city_state: { address, city, state } },
  });
}

// ─── Search Facilities ───────────────────────────────────────────────────────

export async function searchFacilities(params: {
  state?: string;
  city?: string;
  zip?: string;
  minRating?: number;
  limit?: number;
}) {
  return prisma.facilityProfile.findMany({
    where: {
      ...(params.state ? { state: params.state } : {}),
      ...(params.city ? { city: { contains: params.city, mode: "insensitive" as const } } : {}),
      ...(params.zip ? { zip: params.zip } : {}),
      ...(params.minRating ? { avgOverall: { gte: params.minRating } } : {}),
    },
    orderBy: { avgOverall: "desc" },
    take: params.limit ?? 20,
  });
}

// ─── Get Ratings for a Facility ──────────────────────────────────────────────

export async function getFacilityRatings(address: string, city: string, state: string) {
  return prisma.facilityRating.findMany({
    where: { facilityAddress: address, facilityCity: city, facilityState: state },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

// ─── Get Facility Dashboard (top/worst) ──────────────────────────────────────

export async function getFacilityDashboard() {
  const [topFacilities, worstFacilities, longestWait, recentRatings] = await Promise.all([
    prisma.facilityProfile.findMany({
      where: { totalRatings: { gte: 3 } },
      orderBy: { avgOverall: "desc" },
      take: 10,
    }),
    prisma.facilityProfile.findMany({
      where: { totalRatings: { gte: 3 } },
      orderBy: { avgOverall: "asc" },
      take: 10,
    }),
    prisma.facilityProfile.findMany({
      where: { totalRatings: { gte: 2 }, avgWaitTime: { gt: 0 } },
      orderBy: { avgWaitTime: "desc" },
      take: 10,
    }),
    prisma.facilityRating.findMany({
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  const totalFacilities = await prisma.facilityProfile.count();
  const totalRatings = await prisma.facilityRating.count();

  return {
    totalFacilities,
    totalRatings,
    topFacilities,
    worstFacilities,
    longestWait,
    recentRatings,
  };
}
