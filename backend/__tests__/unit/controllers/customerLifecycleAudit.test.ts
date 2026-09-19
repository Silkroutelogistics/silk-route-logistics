/**
 * Customer inactivate / reactivate / restore — lifecycle-gaps B6b, finding #24.
 * Each act leaves ONE AuditTrail row through lib/lifecycleAudit carrying the
 * actor, the reason where the act has one, and previous/new. The real
 * controllers are driven; only prisma and the CRM timeline writer are mocked.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/customerActivityService", () => ({
  logCustomerActivity: vi.fn().mockResolvedValue(undefined),
  getCustomerActivity: vi.fn().mockResolvedValue([]),
}));
vi.mock("../../../src/services/emailService", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  sendPortalInviteEmail: vi.fn().mockResolvedValue(undefined),
}));

import { inactivateCustomer, reactivateCustomer, restoreCustomer } from "../../../src/controllers/customerController";

const mockPrisma = vi.mocked(prisma) as any;

function call(fn: (req: any, res: any) => Promise<any>, body: Record<string, unknown> = {}, id = "cust-1") {
  const req = { params: { id }, body, user: { id: "ae-1", email: "ae@srl.test", role: "OPERATIONS" }, headers: {} } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  return { req, res, run: () => fn(req, res) };
}

function theRow() {
  expect(mockPrisma.auditTrail.create, "exactly one lifecycle row").toHaveBeenCalledTimes(1);
  return mockPrisma.auditTrail.create.mock.calls[0][0].data;
}

describe("customer lifecycle writers leave the audit row", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.customer.update.mockResolvedValue({ id: "cust-1" });
    mockPrisma.user.update.mockResolvedValue({});
    mockPrisma.user.findMany.mockResolvedValue([]);
    mockPrisma.invoice.updateMany.mockResolvedValue({ count: 0 });
    mockPrisma.notification.createMany.mockResolvedValue({ count: 0 });
  });

  it("inactivate: DEACTIVATE / CUSTOMER_INACTIVATED with the reason and isActive true → false", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", name: "Acme Foods", isActive: true });
    const { res, run } = call(inactivateCustomer, { reason: "  Credit hold pending remittance  " });
    await run();
    expect(res.status).toHaveBeenCalledWith(200);
    const row = theRow();
    expect(row).toEqual(expect.objectContaining({ action: "DEACTIVATE", entityType: "Customer", entityId: "cust-1", performedById: "ae-1" }));
    expect(row.changedFields).toEqual(expect.objectContaining({
      actionDetail: "CUSTOMER_INACTIVATED",
      entityName: "Acme Foods",
      reason: "Credit hold pending remittance",
      previous: { isActive: true },
      new: { isActive: false },
      actor: { kind: "USER", userId: "ae-1", email: "ae@srl.test" },
    }));
  });

  it("inactivate on an already-inactive customer is a no-op with no row — nothing changed, so nothing is recorded", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", name: "Acme Foods", isActive: false });
    const { run } = call(inactivateCustomer, { reason: "Credit hold" });
    await run();
    expect(mockPrisma.customer.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditTrail.create).not.toHaveBeenCalled();
  });

  it("reactivate: STATUS_CHANGE / CUSTOMER_REACTIVATED, and previous keeps the reason the update clears", async () => {
    mockPrisma.customer.findFirst.mockResolvedValue({ id: "cust-1", name: "Acme Foods", isActive: false, inactivationReason: "Credit hold" });
    const { run } = call(reactivateCustomer);
    await run();
    const row = theRow();
    expect(row).toEqual(expect.objectContaining({ action: "STATUS_CHANGE", entityType: "Customer", entityId: "cust-1", performedById: "ae-1" }));
    expect(row.changedFields).toEqual(expect.objectContaining({
      actionDetail: "CUSTOMER_REACTIVATED",
      previous: { isActive: false, inactivationReason: "Credit hold" },
      new: { isActive: true, inactivationReason: null },
    }));
    // The reactivation's reason lookup is in the SAME select as the flag — one read, not a second query.
    expect(mockPrisma.customer.findFirst.mock.calls[0][0].select).toEqual(expect.objectContaining({ inactivationReason: true }));
  });

  it("restore: STATUS_CHANGE / CUSTOMER_RESTORED with deletedAt → null and the shipper login's flip when it has one", async () => {
    const deletedAt = new Date("2026-09-01T12:00:00Z");
    mockPrisma.customer.findUnique.mockResolvedValue({ id: "cust-1", name: "Acme Foods", deletedAt, userId: "shipper-1" });
    const { run } = call(restoreCustomer);
    await run();
    const row = theRow();
    expect(row.changedFields).toEqual(expect.objectContaining({
      actionDetail: "CUSTOMER_RESTORED",
      previous: { deletedAt: deletedAt.toISOString(), loginActive: false },
      new: { deletedAt: null, loginActive: true },
    }));
  });

  it("restore of a customer with no login records loginActive as null on both sides — not as a flip that never happened", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ id: "cust-1", name: "Acme Foods", deletedAt: new Date(), userId: null });
    const { run } = call(restoreCustomer);
    await run();
    const row = theRow();
    expect(row.changedFields.previous.loginActive).toBeNull();
    expect(row.changedFields.new.loginActive).toBeNull();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
  });
});
