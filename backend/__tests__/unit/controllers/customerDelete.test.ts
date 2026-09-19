/**
 * deleteCustomer — decision 4 of 2026-09-18 (lifecycle-gaps B5a).
 *
 * No delete-time cascade. A customer with any reference is refused with a 409
 * that NAMES the references and the next action; a customer with none is
 * hard-deleted. The cascade this replaces cancelled loads under a free-text
 * reason, voided invoices, zeroed credit and deactivated the shipper login, so
 * the load-bearing assertions here are the ones about what is NOT written.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/lib/customerReferences", async (orig) => {
  const real = await orig<typeof import("../../../src/lib/customerReferences")>();
  return { ...real, censusCustomerReferences: vi.fn() };
});
import { censusCustomerReferences, type CustomerReferenceCensus } from "../../../src/lib/customerReferences";
import { deleteCustomer } from "../../../src/controllers/customerController";

const mockPrisma = vi.mocked(prisma) as any;
const census = vi.mocked(censusCustomerReferences);

const EMPTY: CustomerReferenceCensus = {
  loads: [], invoices: 0, shipments: 0, orders: 0, contractRates: 0, facilities: 0, contacts: 0,
  rfpBids: 0, routingGuides: 0, exceptionAlerts: 0, activeSequences: 0, shipperUser: null,
};

function call(id = "cust-1") {
  const req = { params: { id }, body: {}, user: { id: "ae-1", email: "ae@srl.test", role: "ADMIN" }, headers: {} } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  return { req, res, run: () => deleteCustomer(req, res) };
}

/** Every write the old cascade performed. None of them may fire on any path. */
function expectNoCascade() {
  expect(mockPrisma.customer.update, "soft-delete write").not.toHaveBeenCalled();
  expect(mockPrisma.load.update, "load cancellation").not.toHaveBeenCalled();
  expect(mockPrisma.load.updateMany, "load cancellation").not.toHaveBeenCalled();
  expect(mockPrisma.invoice.updateMany, "invoice void").not.toHaveBeenCalled();
  expect(mockPrisma.user.update, "shipper login deactivation").not.toHaveBeenCalled();
}

describe("deleteCustomer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.customer.findUnique.mockResolvedValue({ id: "cust-1", name: "Acme Foods", deletedAt: null });
    mockPrisma.customer.delete.mockResolvedValue({ id: "cust-1" });
    mockPrisma.user.findMany.mockResolvedValue([{ id: "ae-1" }, { id: "ae-2" }]);
    mockPrisma.notification.createMany.mockResolvedValue({ count: 2 });
    census.mockResolvedValue(EMPTY);
  });

  it("404 for an unknown or already-archived customer, and reads nothing else", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue(null);
    const a = call("nope");
    await a.run();
    expect(a.res.status).toHaveBeenCalledWith(404);
    expect(census).not.toHaveBeenCalled();

    mockPrisma.customer.findUnique.mockResolvedValue({ id: "cust-1", name: "Old", deletedAt: new Date() });
    const b = call();
    await b.run();
    expect(b.res.status).toHaveBeenCalledWith(404);
    expect(mockPrisma.customer.delete).not.toHaveBeenCalled();
  });

  it("a customer with ONE historical load is refused: 409, the load named, no next action but Inactivate", async () => {
    census.mockResolvedValue({
      ...EMPTY,
      loads: [{ id: "l-1", referenceNumber: "SRL-121400", status: "COMPLETED", cancellable: false }],
      invoices: 1,
    });
    const { res, run } = call();
    await run();
    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe("CUSTOMER_HAS_REFERENCES");
    expect(body.message).toContain("Acme Foods cannot be deleted");
    expect(body.message).toContain("1 load (1 history), 1 invoice");
    expect(body.message).toContain("inactivated, not deleted");
    expect(body.references.loads[0]).toMatchObject({ referenceNumber: "SRL-121400", cancellable: false });
    expect(body.references.total).toBe(2);
    expect(body.remedy.openLoads).toEqual([]);
    expect(body.remedy.cancelOpenLoadsFirst).toBeNull();
    expect(body.remedy.inactivate).toBe("POST /customers/cust-1/inactivate");
    expect(mockPrisma.customer.delete).not.toHaveBeenCalled();
    expectNoCascade();
    // A refusal is not a lifecycle act: no row.
    expect(mockPrisma.auditTrail.create).not.toHaveBeenCalled();
  });

  it("an OPEN load is listed as the thing to cancel first — with a reason code, by the AE, not by this endpoint", async () => {
    census.mockResolvedValue({
      ...EMPTY,
      loads: [
        { id: "l-1", referenceNumber: "SRL-121401", status: "BOOKED", cancellable: true },
        { id: "l-2", referenceNumber: "SRL-121402", status: "DELIVERED", cancellable: false },
      ],
    });
    const { res, run } = call();
    await run();
    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.remedy.openLoads).toEqual(["SRL-121401"]);
    expect(body.remedy.cancelOpenLoadsFirst).toMatch(/Cancel this load individually.*reason code/);
    expect(body.message).toContain("2 loads (1 open, 1 history)");
    // The decision-4 property: the endpoint never cancels the load itself.
    expectNoCascade();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it("a contact alone blocks; an in-flight sequence alone blocks and says to stop it", async () => {
    census.mockResolvedValue({ ...EMPTY, contacts: 2 });
    const a = call();
    await a.run();
    expect(a.res.status).toHaveBeenCalledWith(409);
    expect(a.res.json.mock.calls[0][0].message).toContain("2 contacts");

    vi.clearAllMocks();
    mockPrisma.customer.findUnique.mockResolvedValue({ id: "cust-1", name: "Acme Foods", deletedAt: null });
    census.mockResolvedValue({ ...EMPTY, activeSequences: 1 });
    const b = call();
    await b.run();
    expect(b.res.status).toHaveBeenCalledWith(409);
    expect(b.res.json.mock.calls[0][0].remedy.stopSequencesFirst).toBe(true);
    expect(mockPrisma.customer.delete).not.toHaveBeenCalled();
  });

  it("zero references: the row is hard-deleted, nothing is soft-deleted, and the AEs are told", async () => {
    const { res, run } = call();
    await run();
    expect(mockPrisma.customer.delete).toHaveBeenCalledWith({ where: { id: "cust-1" } });
    expect(res.status).not.toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body).toMatchObject({ success: true, message: "Customer deleted", details: { hardDeleted: true, references: 0 } });
    expectNoCascade();
    const notice = mockPrisma.notification.createMany.mock.calls[0][0].data[0];
    expect(notice.title).toBe("Customer Deleted");
    expect(notice.message).toContain("had no loads, orders, contracts, facilities or contacts");
    expect(notice.message).not.toMatch(/cancelled|voided/);
    // B6b (#24) — the lifecycle record of a hard delete outlives the row it names.
    expect(mockPrisma.auditTrail.create).toHaveBeenCalledTimes(1);
    const row = mockPrisma.auditTrail.create.mock.calls[0][0].data;
    expect(row).toEqual(expect.objectContaining({ action: "DELETE", entityType: "Customer", entityId: "cust-1", performedById: "ae-1" }));
    expect(row.changedFields).toEqual(expect.objectContaining({
      actionDetail: "CUSTOMER_DELETED",
      entityName: "Acme Foods",
      previous: { exists: true, references: 0 },
      new: { exists: false },
      actor: { kind: "USER", userId: "ae-1", email: "ae@srl.test" },
    }));
  });
});

describe("the cascade cannot come back (source guard)", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../../src/controllers/customerController.ts"), "utf8");
  const strip = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  const start = src.indexOf("export async function deleteCustomer(");
  const end = src.indexOf("export async function restoreCustomer(");
  const body = strip(src.slice(start, end));

  it("deleteCustomer is found and is not trivial (vacuity tripwire)", () => {
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    expect(body).toContain("censusCustomerReferences(");
    expect(body).toContain("customer.delete(");
  });

  it("writes no load status, voids no invoice, deactivates no login, soft-deletes nothing", () => {
    expect(body).not.toMatch(/status:\s*"CANCELLED"/);
    expect(body).not.toMatch(/invoice\.updateMany/);
    expect(body).not.toMatch(/isActive:\s*false/);
    expect(body).not.toMatch(/deletedAt:\s*(now|new Date)/);
    expect(body).not.toMatch(/customer\.update\(/);
  });

  it("scanner self-test: those patterns are still findable where they belong", () => {
    const loadController = strip(fs.readFileSync(path.join(__dirname, "../../../src/controllers/loadController.ts"), "utf8"));
    expect(loadController).toMatch(/"CANCELLED"/);
    expect(strip(src)).toMatch(/isActive:\s*false/); // inactivateCustomer still writes it, deliberately
  });
});
