/**
 * A POD upload delivers nothing to the customer, so onPODUploaded never marks an
 * invoice SENT. It used to flip the load's DRAFT to SENT, which started the
 * reminder ladder and dated a delivery that never happened. The load itself
 * still advances, because that part was never a claim about the customer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { onPODUploaded } from "../../../src/services/integrationService";

const mockPrisma = vi.mocked(prisma, true) as any;
const DRAFT = { id: "inv-2", invoiceKind: "BASE", invoiceNumber: "121494I", status: "DRAFT" };

function arm() {
  mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", status: "DELIVERED" });
  mockPrisma.load.update.mockResolvedValue({});
  mockPrisma.invoice.findFirst.mockResolvedValue(DRAFT);
  mockPrisma.invoice.update.mockResolvedValue({});
  mockPrisma.carrierPay.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.carrierPay.findMany.mockResolvedValue([]);
}

describe("onPODUploaded never marks an invoice SENT", () => {
  beforeEach(() => vi.clearAllMocks());

  it("leaves the only invoice on the load a DRAFT: no status, no sentDate, nothing written", async () => {
    arm();
    await onPODUploaded("load-1");
    expect(mockPrisma.invoice.findFirst).toHaveBeenCalled(); // it did look, so the silence is a decision
    expect(mockPrisma.invoice.update).not.toHaveBeenCalled();
  });

  it("still moves the load to POD_RECEIVED and then INVOICED", async () => {
    arm();
    await onPODUploaded("load-1");
    const statuses = mockPrisma.load.update.mock.calls.map((c: any[]) => c[0].data.status);
    expect(statuses).toEqual(["POD_RECEIVED", "INVOICED"]);
  });
});
