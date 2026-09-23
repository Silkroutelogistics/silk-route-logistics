/**
 * The transit cron asks its own question (Item 279 shape).
 *
 * Its query selected on status and customerId alone — no deletedAt, no
 * isTestAccount — and relied entirely on resolveOperationalRecipients refusing
 * afterwards. That works, and it is one layer deep: a second consumer of this
 * list inherits none of it, and iterating a soft-deleted or test load is work
 * that can have no recipient by construction.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/emailService", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
}));

import { processShipperTransitUpdates } from "../../../src/services/shipperNotificationService";

const mockPrisma = vi.mocked(prisma) as any;

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.load.findMany.mockResolvedValue([]);
});

describe("processShipperTransitUpdates scopes its own query", () => {
  it("excludes soft-deleted and test loads in the query, not downstream", async () => {
    await processShipperTransitUpdates();
    expect(mockPrisma.load.findMany).toHaveBeenCalledTimes(1);
    const where = mockPrisma.load.findMany.mock.calls[0][0].where;
    expect(where.deletedAt, "a soft-deleted load is not iterated").toBeNull();
    expect(where.isTestAccount, "a test load never reaches a real customer").toBe(false);
  });

  it("still selects the statuses it is for — vacuity", async () => {
    await processShipperTransitUpdates();
    const where = mockPrisma.load.findMany.mock.calls[0][0].where;
    expect(where.status.in).toEqual(["IN_TRANSIT", "LOADED", "AT_DELIVERY"]);
    expect(where.customerId).toEqual({ not: null });
  });

  it("the resolver keeps its own guards — this is defence in depth, not a move", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const resolver = fs.readFileSync(
      path.resolve(__dirname, "../../../src/services/customerRecipientResolver.ts"),
      "utf8",
    );
    expect(resolver).toContain("if (load.isTestAccount) return [];");
    expect(resolver).toContain("if (load.deletedAt) return [];");
  });
});
