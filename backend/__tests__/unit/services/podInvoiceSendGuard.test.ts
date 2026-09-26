/**
 * The POD path is the second place an invoice becomes SENT (queue amendment,
 * item 4). onPODUploaded flips a load's DRAFT to SENT; with another BASE
 * invoice on the load already sent, that draft is a duplicate and must stay
 * DRAFT, while the load itself still advances to INVOICED.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { onPODUploaded } from "../../../src/services/integrationService";

const mockPrisma = vi.mocked(prisma, true) as any;
const DRAFT = { id: "inv-2", invoiceKind: "BASE", invoiceNumber: "SRL-121494I", status: "DRAFT" };

function arm(prior: unknown) {
  mockPrisma.load.findUnique.mockResolvedValue({ id: "load-1", status: "DELIVERED" });
  mockPrisma.load.update.mockResolvedValue({});
  // First findFirst: the DRAFT to advance. Second: the guard's prior-sent lookup.
  mockPrisma.invoice.findFirst.mockResolvedValueOnce(DRAFT).mockResolvedValueOnce(prior);
  mockPrisma.invoice.update.mockResolvedValue({});
  mockPrisma.carrierPay.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.carrierPay.findMany.mockResolvedValue([]);
}

const flippedToSent = () =>
  mockPrisma.invoice.update.mock.calls.some((c: any[]) => c[0]?.data?.status === "SENT");

describe("onPODUploaded and the one-invoice-per-load rule", () => {
  beforeEach(() => vi.clearAllMocks());

  it("does not flip a duplicate draft to SENT when another BASE invoice was already sent", async () => {
    arm({ id: "inv-1", invoiceNumber: "INV-9", srlDocNumber: "SRL-121494I", status: "SENT" });
    await onPODUploaded("load-1");
    expect(flippedToSent()).toBe(false);
    expect(mockPrisma.load.update).toHaveBeenCalledWith(expect.objectContaining({ data: { status: "INVOICED" } }));
  });

  it("flips the draft to SENT when it is the only invoice on the load", async () => {
    arm(null);
    await onPODUploaded("load-1");
    expect(flippedToSent()).toBe(true);
  });
});
