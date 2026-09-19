/**
 * DELETE /customers/:id/facilities/:facilityId — lifecycle-gaps B5b-2,
 * finding #21. Load.originFacilityId / destFacilityId are bare strings with no
 * FK, so the hard delete dangled ids on every load built from the facility.
 * The real router over HTTP, auth mocked: a referenced facility is refused
 * with the loads named; an unreferenced one still deletes.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "http";

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-ae", email: "ae@srl.test", role: "ADMIN" };
      next();
    },
  };
});
vi.mock("../../../src/services/customerActivityService", () => ({
  logCustomerActivity: vi.fn().mockResolvedValue(undefined),
  getCustomerActivity: vi.fn().mockResolvedValue([]),
}));

import crmCustomerRouter from "../../../src/routes/crmCustomer";
import { prisma } from "../../../src/config/database";
import { logCustomerActivity } from "../../../src/services/customerActivityService";

const mockPrisma = prisma as any;
let server: Server;
let base = "";

beforeEach(async () => {
  vi.clearAllMocks();
  if (!server) {
    const app = express();
    app.use(express.json());
    app.use("/customers", crmCustomerRouter);
    await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
    const addr = server.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}/customers`;
  }
  mockPrisma.customerFacility.findUnique = vi.fn().mockResolvedValue({ id: "f-1", customerId: "c-1", name: "QCC Distribution Center" });
  mockPrisma.customerFacility.delete = vi.fn().mockResolvedValue({});
  mockPrisma.load.count.mockResolvedValue(0);
  mockPrisma.load.findMany.mockResolvedValue([]);
});

describe("DELETE /customers/:id/facilities/:facilityId", () => {
  it("a facility on two loads is refused: 409, both loads named, nothing deleted", async () => {
    mockPrisma.load.count.mockResolvedValue(2);
    mockPrisma.load.findMany.mockResolvedValue([
      { referenceNumber: "SRL-121490", status: "COMPLETED" },
      { referenceNumber: "SRL-121492", status: "BOOKED" },
    ]);
    const res = await fetch(`${base}/c-1/facilities/f-1`, { method: "DELETE" });
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error).toBe("FACILITY_REFERENCED");
    expect(body.message).toContain('"QCC Distribution Center" is on 2 loads and cannot be removed: SRL-121490, SRL-121492');
    expect(body.message).toContain("edited, not removed");
    expect(body.total).toBe(2);
    expect(mockPrisma.customerFacility.delete).not.toHaveBeenCalled();
    expect(logCustomerActivity).not.toHaveBeenCalled();
    // Both columns are checked — a facility used only as a destination still blocks.
    const where = mockPrisma.load.count.mock.calls[0][0].where;
    expect(where).toEqual({ OR: [{ originFacilityId: "f-1" }, { destFacilityId: "f-1" }] });
  });

  it("an unreferenced facility deletes and is logged (unchanged)", async () => {
    const res = await fetch(`${base}/c-1/facilities/f-1`, { method: "DELETE" });
    expect(res.status).toBe(200);
    expect(mockPrisma.customerFacility.delete).toHaveBeenCalledWith({ where: { id: "f-1" } });
    expect(logCustomerActivity).toHaveBeenCalledTimes(1);
  });

  it("404 when the facility is not the customer's (unchanged)", async () => {
    mockPrisma.customerFacility.findUnique.mockResolvedValue({ id: "f-1", customerId: "someone-else", name: "X" });
    const res = await fetch(`${base}/c-1/facilities/f-1`, { method: "DELETE" });
    expect(res.status).toBe(404);
    expect(mockPrisma.load.count).not.toHaveBeenCalled();
  });
});
