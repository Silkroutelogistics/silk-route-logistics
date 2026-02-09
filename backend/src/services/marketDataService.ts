/**
 * Market Data Integration Service
 * Simulates DAT, Truckstop, and other load board benchmark data.
 * When API keys are configured, this service will pull live rates.
 * Until then, it generates realistic simulated benchmarks based on
 * historical patterns and regional rate data.
 */

import { prisma } from "../config/database";

// National average rates by equipment type (simulated from industry data)
const NATIONAL_BENCHMARKS: Record<string, { ratePerMile: number; fuelSurcharge: number }> = {
  "Dry Van": { ratePerMile: 2.45, fuelSurcharge: 0.62 },
  "Reefer": { ratePerMile: 2.85, fuelSurcharge: 0.68 },
  "Flatbed": { ratePerMile: 2.95, fuelSurcharge: 0.58 },
  "Step Deck": { ratePerMile: 3.10, fuelSurcharge: 0.58 },
  "Car Hauler": { ratePerMile: 3.50, fuelSurcharge: 0.55 },
  "Power Only": { ratePerMile: 1.85, fuelSurcharge: 0.45 },
};

// Regional multipliers (some regions are more expensive)
const REGIONAL_MULTIPLIERS: Record<string, number> = {
  GREAT_LAKES: 0.95,
  UPPER_MIDWEST: 0.90,
  SOUTHEAST: 0.92,
  SOUTH_CENTRAL: 0.88,
  NORTHEAST: 1.15,
  WEST: 1.10,
};

// Simulated market conditions
const MARKET_CONDITIONS: Record<string, { truckToLoadRatio: number; capacityIndex: string; trend: string }> = {
  GREAT_LAKES: { truckToLoadRatio: 2.8, capacityIndex: "BALANCED", trend: "stable" },
  UPPER_MIDWEST: { truckToLoadRatio: 3.2, capacityIndex: "LOOSE", trend: "down" },
  SOUTHEAST: { truckToLoadRatio: 2.1, capacityIndex: "TIGHT", trend: "up" },
  SOUTH_CENTRAL: { truckToLoadRatio: 2.5, capacityIndex: "BALANCED", trend: "stable" },
  NORTHEAST: { truckToLoadRatio: 1.8, capacityIndex: "TIGHT", trend: "up" },
  WEST: { truckToLoadRatio: 2.3, capacityIndex: "BALANCED", trend: "up" },
};

function addNoise(value: number, pct: number = 0.05): number {
  return +(value * (1 + (Math.random() - 0.5) * 2 * pct)).toFixed(2);
}

export interface BenchmarkRate {
  source: string;
  equipmentType: string;
  ratePerMile: number;
  totalRate: number;
  fuelSurcharge: number;
  lastUpdated: string;
}

export interface MarketIntelligence {
  region: string;
  truckToLoadRatio: number;
  capacityIndex: string;
  rateTrend: string;
  benchmarks: BenchmarkRate[];
  spotRate: { low: number; avg: number; high: number };
  contractRate: { low: number; avg: number; high: number };
  dieselPrice: number;
  weekOverWeekChange: number;
}

export interface IntegrationStatus {
  provider: string;
  name: string;
  status: string;
  lastSyncAt: string | null;
  rateDataAvailable: boolean;
  features: string[];
}

/**
 * Get simulated benchmark rates for a lane
 */
export async function getLaneBenchmarks(
  originState: string,
  destState: string,
  equipmentType: string,
  distance: number
): Promise<BenchmarkRate[]> {
  const base = NATIONAL_BENCHMARKS[equipmentType] || NATIONAL_BENCHMARKS["Dry Van"];
  const now = new Date().toISOString();

  // Simulate rates from multiple sources with slight variation
  return [
    {
      source: "DAT RateView",
      equipmentType,
      ratePerMile: addNoise(base.ratePerMile, 0.08),
      totalRate: Math.round(addNoise(base.ratePerMile, 0.08) * distance),
      fuelSurcharge: addNoise(base.fuelSurcharge, 0.05),
      lastUpdated: now,
    },
    {
      source: "Truckstop Rate",
      equipmentType,
      ratePerMile: addNoise(base.ratePerMile, 0.10),
      totalRate: Math.round(addNoise(base.ratePerMile, 0.10) * distance),
      fuelSurcharge: addNoise(base.fuelSurcharge, 0.06),
      lastUpdated: now,
    },
    {
      source: "Greenscreens",
      equipmentType,
      ratePerMile: addNoise(base.ratePerMile, 0.07),
      totalRate: Math.round(addNoise(base.ratePerMile, 0.07) * distance),
      fuelSurcharge: addNoise(base.fuelSurcharge, 0.04),
      lastUpdated: now,
    },
  ];
}

/**
 * Get market intelligence for a region
 */
export async function getRegionIntelligence(region: string): Promise<MarketIntelligence> {
  const multiplier = REGIONAL_MULTIPLIERS[region] || 1.0;
  const conditions = MARKET_CONDITIONS[region] || MARKET_CONDITIONS.GREAT_LAKES;
  const base = NATIONAL_BENCHMARKS["Dry Van"];

  const avgSpot = base.ratePerMile * multiplier;
  const avgContract = avgSpot * 0.92; // contracts typically 8% below spot

  return {
    region,
    truckToLoadRatio: addNoise(conditions.truckToLoadRatio, 0.1),
    capacityIndex: conditions.capacityIndex,
    rateTrend: conditions.trend,
    benchmarks: Object.entries(NATIONAL_BENCHMARKS).map(([equip, rates]) => ({
      source: "Market Composite",
      equipmentType: equip,
      ratePerMile: addNoise(rates.ratePerMile * multiplier, 0.05),
      totalRate: 0,
      fuelSurcharge: addNoise(rates.fuelSurcharge, 0.05),
      lastUpdated: new Date().toISOString(),
    })),
    spotRate: {
      low: addNoise(avgSpot * 0.85, 0.03),
      avg: addNoise(avgSpot, 0.03),
      high: addNoise(avgSpot * 1.20, 0.03),
    },
    contractRate: {
      low: addNoise(avgContract * 0.90, 0.03),
      avg: addNoise(avgContract, 0.03),
      high: addNoise(avgContract * 1.10, 0.03),
    },
    dieselPrice: addNoise(3.85, 0.05),
    weekOverWeekChange: addNoise(0, 0.5) * (conditions.trend === "up" ? 1 : conditions.trend === "down" ? -1 : 0.2),
  };
}

/**
 * Get integration statuses from DB
 */
export async function getIntegrationStatuses(): Promise<IntegrationStatus[]> {
  const integrations = await prisma.brokerIntegration.findMany({
    orderBy: { name: "asc" },
  });

  return integrations.map((i) => {
    let features: string[] = [];
    if (i.provider === "DAT") features = ["Rate Benchmarks", "Load Board", "Lane Analytics", "Carrier Search"];
    else if (i.provider === "TRUCKSTOP") features = ["Rate Data", "Load Posting", "Carrier Vetting", "Book It Now"];
    else if (i.provider === "MOTIVE") features = ["ELD Data", "GPS Tracking", "HOS Monitoring", "DVIR"];
    else if (i.provider === "SAMSARA") features = ["ELD Data", "Asset Tracking", "Route Optimization", "Fuel Analytics"];
    else if (i.provider === "OMNITRACS") features = ["ELD Compliance", "Fleet Tracking", "Messaging", "Workflow"];
    else if (i.provider === "MCLEOD") features = ["TMS Integration", "Load Planning", "Dispatch", "Accounting"];

    return {
      provider: i.provider,
      name: i.name,
      status: i.status,
      lastSyncAt: i.lastSyncAt?.toISOString() || null,
      rateDataAvailable: ["DAT", "TRUCKSTOP"].includes(i.provider),
      features,
    };
  });
}

/**
 * Get national rate index (composite of all equipment types)
 */
export function getNationalRateIndex(): { equipmentType: string; spotRate: number; contractRate: number; fuelSurcharge: number; weekChange: number }[] {
  return Object.entries(NATIONAL_BENCHMARKS).map(([equip, rates]) => ({
    equipmentType: equip,
    spotRate: addNoise(rates.ratePerMile, 0.03),
    contractRate: addNoise(rates.ratePerMile * 0.92, 0.03),
    fuelSurcharge: addNoise(rates.fuelSurcharge, 0.03),
    weekChange: addNoise(0, 2),
  }));
}
