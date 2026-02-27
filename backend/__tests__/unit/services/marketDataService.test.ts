import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import {
  getLaneBenchmarks,
  getRegionIntelligence,
  getIntegrationStatuses,
  getNationalRateIndex,
} from "../../../src/services/marketDataService";

const mockPrisma = vi.mocked(prisma);

describe("marketDataService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── getLaneBenchmarks ───────────────────────────────────
  it("getLaneBenchmarks — returns benchmark rates from multiple sources", async () => {
    const benchmarks = await getLaneBenchmarks("IL", "TX", "Dry Van", 920);

    expect(benchmarks).toHaveLength(3);
    expect(benchmarks[0].source).toBe("DAT RateView");
    expect(benchmarks[1].source).toBe("Truckstop Rate");
    expect(benchmarks[2].source).toBe("Greenscreens");

    for (const b of benchmarks) {
      expect(b.equipmentType).toBe("Dry Van");
      expect(b.ratePerMile).toBeGreaterThan(0);
      expect(b.totalRate).toBeGreaterThan(0);
      expect(b.fuelSurcharge).toBeGreaterThan(0);
      expect(b.lastUpdated).toBeTruthy();
    }
  });

  it("getLaneBenchmarks — falls back to Dry Van rates for unknown equipment", async () => {
    const benchmarks = await getLaneBenchmarks("IL", "TX", "Unknown Type", 500);

    expect(benchmarks).toHaveLength(3);
    // Should use Dry Van base rates (around $2.45/mile)
    for (const b of benchmarks) {
      expect(b.ratePerMile).toBeGreaterThan(1.5);
      expect(b.ratePerMile).toBeLessThan(4.0);
    }
  });

  // ── getRegionIntelligence ───────────────────────────────
  it("getRegionIntelligence — returns market intelligence for region", async () => {
    const intel = await getRegionIntelligence("NORTHEAST");

    expect(intel.region).toBe("NORTHEAST");
    expect(intel.capacityIndex).toBe("TIGHT");
    expect(intel.rateTrend).toBe("up");
    expect(intel.truckToLoadRatio).toBeGreaterThan(0);
    expect(intel.benchmarks.length).toBeGreaterThan(0);
    expect(intel.spotRate.avg).toBeGreaterThan(0);
    expect(intel.contractRate.avg).toBeGreaterThan(0);
    expect(intel.dieselPrice).toBeGreaterThan(0);
  });

  // ── getIntegrationStatuses ──────────────────────────────
  it("getIntegrationStatuses — maps integration features from DB", async () => {
    mockPrisma.brokerIntegration.findMany.mockResolvedValue([
      { id: "int-1", provider: "DAT", name: "DAT Solutions", status: "ACTIVE", lastSyncAt: new Date() },
      { id: "int-2", provider: "MOTIVE", name: "Motive ELD", status: "INACTIVE", lastSyncAt: null },
    ] as any);

    const statuses = await getIntegrationStatuses();

    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toEqual(
      expect.objectContaining({
        provider: "DAT",
        rateDataAvailable: true,
        features: expect.arrayContaining(["Rate Benchmarks", "Load Board"]),
      })
    );
    expect(statuses[1]).toEqual(
      expect.objectContaining({
        provider: "MOTIVE",
        rateDataAvailable: false,
        features: expect.arrayContaining(["ELD Data", "GPS Tracking"]),
      })
    );
  });

  // ── getNationalRateIndex ────────────────────────────────
  it("getNationalRateIndex — returns rates for all equipment types", () => {
    const index = getNationalRateIndex();

    expect(index.length).toBeGreaterThanOrEqual(5);

    const equipTypes = index.map((i) => i.equipmentType);
    expect(equipTypes).toContain("Dry Van");
    expect(equipTypes).toContain("Reefer");
    expect(equipTypes).toContain("Flatbed");

    for (const entry of index) {
      expect(entry.spotRate).toBeGreaterThan(0);
      expect(entry.contractRate).toBeGreaterThan(0);
      expect(entry.fuelSurcharge).toBeGreaterThan(0);
    }
  });
});
