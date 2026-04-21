// Regression guard for the Shipper Tracking Token service (v3.7.k, Phase 5E.a).
// Expiry rule per decision F3:
//   - actualDeliveryDatetime set → expiresAt = actualDeliveryDatetime + 180d
//   - actualDeliveryDatetime null → expiresAt = createdAt + 90d (failsafe)
// Delivery refresh never shortens an existing longer expiry.

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.hoisted() runs before vi.mock() factories so the mock references stay
// accessible to tests after the hoist.
const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    load: { findUnique: vi.fn() },
    shipperTrackingToken: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("../../../src/config/database", () => ({
  prisma: mockPrisma,
}));

vi.mock("../../../src/lib/logger", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

import {
  generateBOLPrintToken,
  refreshBOLTrackingTokenExpiry,
  computeExpiresAt,
} from "../../../src/services/shipperTrackingTokenService";

const DAY_MS = 24 * 60 * 60 * 1000;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("shipperTrackingTokenService.computeExpiresAt", () => {
  it("pre-delivery: createdAt + 90 days", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const result = computeExpiresAt({
      createdAt,
      actualDeliveryDatetime: null,
    });
    expect(result.getTime()).toBe(createdAt.getTime() + 90 * DAY_MS);
  });

  it("post-delivery: actualDeliveryDatetime + 180 days", () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const actualDeliveryDatetime = new Date("2026-02-01T00:00:00Z");
    const result = computeExpiresAt({ createdAt, actualDeliveryDatetime });
    expect(result.getTime()).toBe(
      actualDeliveryDatetime.getTime() + 180 * DAY_MS,
    );
  });
});

describe("shipperTrackingTokenService.generateBOLPrintToken", () => {
  it("creates STATUS_ONLY token for a fresh pre-delivery load", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1",
      customerId: "shipper-1",
      createdAt,
      actualDeliveryDatetime: null,
    });
    mockPrisma.shipperTrackingToken.findFirst.mockResolvedValue(null);
    mockPrisma.shipperTrackingToken.create.mockImplementation(
      async ({ data }) => ({ id: "token-1", ...data }),
    );

    const token = await generateBOLPrintToken("load-1", "shipper-1");

    expect(token.loadId).toBe("load-1");
    expect(token.shipperId).toBe("shipper-1");
    expect(token.accessLevel).toBe("STATUS_ONLY");
    expect((token.expiresAt as Date).getTime()).toBe(
      createdAt.getTime() + 90 * DAY_MS,
    );
    expect((token.token as string).length).toBe(12);
  });

  it("creates STATUS_ONLY token with 180-day expiry for a delivered load", async () => {
    const createdAt = new Date("2026-01-01T00:00:00Z");
    const actualDeliveryDatetime = new Date("2026-02-10T12:00:00Z");
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-2",
      customerId: "shipper-2",
      createdAt,
      actualDeliveryDatetime,
    });
    mockPrisma.shipperTrackingToken.findFirst.mockResolvedValue(null);
    mockPrisma.shipperTrackingToken.create.mockImplementation(
      async ({ data }) => ({ id: "token-2", ...data }),
    );

    const token = await generateBOLPrintToken("load-2", "shipper-2");

    expect((token.expiresAt as Date).getTime()).toBe(
      actualDeliveryDatetime.getTime() + 180 * DAY_MS,
    );
  });

  it("is idempotent: returns existing non-expired STATUS_ONLY token for BOL re-print", async () => {
    const existingExpiresAt = new Date(Date.now() + 30 * DAY_MS);
    const existing = {
      id: "existing-1",
      loadId: "load-3",
      shipperId: "shipper-3",
      token: "ABCDEFGH2345",
      accessLevel: "STATUS_ONLY",
      expiresAt: existingExpiresAt,
      createdAt: new Date(),
      lastAccessedAt: null,
      accessCount: 0,
    };
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-3",
      customerId: "shipper-3",
      createdAt: new Date(),
      actualDeliveryDatetime: null,
    });
    mockPrisma.shipperTrackingToken.findFirst.mockResolvedValue(existing);

    const token = await generateBOLPrintToken("load-3", "shipper-3");

    expect(token).toBe(existing);
    expect(mockPrisma.shipperTrackingToken.create).not.toHaveBeenCalled();
  });

  it("regenerates when existing token is expired", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-4",
      customerId: "shipper-4",
      createdAt: new Date(),
      actualDeliveryDatetime: null,
    });
    // findFirst filters to expiresAt: { gt: now }, so an expired token
    // would NOT be returned by the real query — simulate that here.
    mockPrisma.shipperTrackingToken.findFirst.mockResolvedValue(null);
    mockPrisma.shipperTrackingToken.create.mockImplementation(
      async ({ data }) => ({ id: "new-token", ...data }),
    );

    const token = await generateBOLPrintToken("load-4", "shipper-4");

    expect(mockPrisma.shipperTrackingToken.create).toHaveBeenCalledOnce();
    expect(token.id).toBe("new-token");
  });

  it("throws on unknown loadId", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(null);
    await expect(
      generateBOLPrintToken("nonexistent-load", "shipper-x"),
    ).rejects.toThrow(/Load not found/);
  });

  it("throws on cross-shipper leak (shipperId mismatches load.customerId)", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-5",
      customerId: "shipper-legit",
      createdAt: new Date(),
      actualDeliveryDatetime: null,
    });
    await expect(
      generateBOLPrintToken("load-5", "shipper-attacker"),
    ).rejects.toThrow(/Shipper mismatch/);
  });

  it("accepts a load with no customer (customerId null) without throwing", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-6",
      customerId: null,
      createdAt: new Date(),
      actualDeliveryDatetime: null,
    });
    mockPrisma.shipperTrackingToken.findFirst.mockResolvedValue(null);
    mockPrisma.shipperTrackingToken.create.mockImplementation(
      async ({ data }) => ({ id: "token-6", ...data }),
    );

    const token = await generateBOLPrintToken("load-6", "caller-provided-id");

    expect(token.shipperId).toBe("caller-provided-id");
  });
});

describe("shipperTrackingTokenService.refreshBOLTrackingTokenExpiry", () => {
  it("extends expiry on delivery event when newExpiresAt > existing", async () => {
    const actualDeliveryDatetime = new Date("2026-03-01T00:00:00Z");
    const newExpiresAt = new Date(
      actualDeliveryDatetime.getTime() + 180 * DAY_MS,
    );
    const existingToken = {
      id: "token-refresh-1",
      loadId: "load-7",
      token: "XYZA234KLMNP",
      accessLevel: "STATUS_ONLY",
      expiresAt: new Date("2026-04-01T00:00:00Z"), // earlier than newExpiresAt
    };
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-7",
      actualDeliveryDatetime,
    });
    mockPrisma.shipperTrackingToken.findMany.mockResolvedValue([existingToken]);

    await refreshBOLTrackingTokenExpiry("load-7");

    expect(mockPrisma.shipperTrackingToken.update).toHaveBeenCalledWith({
      where: { id: "token-refresh-1" },
      data: { expiresAt: newExpiresAt },
    });
  });

  it("NEVER shortens an existing longer expiry", async () => {
    // Delivered 1 day ago; token was issued for a cancelled-load failsafe
    // that's still 89 days out (longer than delivery + 180d would give).
    const actualDeliveryDatetime = new Date(Date.now() - 1 * DAY_MS);
    const longerExistingExpiry = new Date(
      actualDeliveryDatetime.getTime() + 181 * DAY_MS, // 1 day longer than the refresh rule would give
    );
    const existingToken = {
      id: "token-refresh-2",
      loadId: "load-8",
      token: "LONGERLIVE23",
      accessLevel: "STATUS_ONLY",
      expiresAt: longerExistingExpiry,
    };
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-8",
      actualDeliveryDatetime,
    });
    mockPrisma.shipperTrackingToken.findMany.mockResolvedValue([existingToken]);

    await refreshBOLTrackingTokenExpiry("load-8");

    expect(mockPrisma.shipperTrackingToken.update).not.toHaveBeenCalled();
  });

  it("is no-op when load is not delivered yet", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-9",
      actualDeliveryDatetime: null,
    });

    await refreshBOLTrackingTokenExpiry("load-9");

    expect(mockPrisma.shipperTrackingToken.findMany).not.toHaveBeenCalled();
    expect(mockPrisma.shipperTrackingToken.update).not.toHaveBeenCalled();
  });

  it("only touches STATUS_ONLY tokens — FULL tokens from shipper-portal-share flow are unaffected", async () => {
    // The findMany query filters by accessLevel: 'STATUS_ONLY' directly,
    // so FULL tokens are never returned to the update loop.
    const actualDeliveryDatetime = new Date("2026-03-01T00:00:00Z");
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-10",
      actualDeliveryDatetime,
    });
    mockPrisma.shipperTrackingToken.findMany.mockResolvedValue([]);

    await refreshBOLTrackingTokenExpiry("load-10");

    // Verify the query scoped to STATUS_ONLY
    expect(mockPrisma.shipperTrackingToken.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          loadId: "load-10",
          accessLevel: "STATUS_ONLY",
        }),
      }),
    );
    expect(mockPrisma.shipperTrackingToken.update).not.toHaveBeenCalled();
  });
});
