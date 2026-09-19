/**
 * archiveCarrier / restoreCarrier / suspendCarrier — lifecycle-gaps B5b.
 *
 * The B5a customer rule applied to carriers: a carrier with any reference is
 * refused with the references named and Suspend pointed at; a bare
 * registration is archived AND its login deactivated in one transaction, and
 * restore undoes both. Suspension now requires a reason.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/lib/carrierReferences", async (orig) => {
  const real = await orig<typeof import("../../../src/lib/carrierReferences")>();
  return { ...real, censusCarrierReferences: vi.fn() };
});
vi.mock("../../../src/services/infoRequestService", () => ({
  closeOpenInfoRequestsForStatus: vi.fn().mockResolvedValue([]),
  announceInfoRequestsClosedByStatus: vi.fn().mockResolvedValue(undefined),
}));
import { censusCarrierReferences, type CarrierReferenceCensus } from "../../../src/lib/carrierReferences";
import { archiveCarrier, restoreCarrier } from "../../../src/controllers/carrierController";
import { suspendCarrier } from "../../../src/controllers/complianceController";

const mockPrisma = vi.mocked(prisma) as any;
const census = vi.mocked(censusCarrierReferences);

const EMPTY: CarrierReferenceCensus = {
  loads: [], tenders: 0, liveTenders: 0, bids: 0, waterfallPositions: 0, carrierPays: 0, unpaidCarrierPays: 0,
  settlements: 0, disputes: 0, agreements: 0, documents: 0, drivers: 0, fallOffs: 0, chameleonMatches: 0,
  infoRequests: 0, overrides: 0, fraudReports: 0, quickPayEnrollments: 0, routingGuideEntries: 0, dockSchedules: 0,
  ediTransactions: 0, exceptionAlerts: 0,
};
const PROFILE = { id: "cp-1", userId: "u-1", companyName: "Peace Transport", deletedAt: null, onboardingStatus: "APPROVED" };

function call(fn: (req: any, res: any) => Promise<any>, params: Record<string, string>, body: Record<string, unknown> = {}) {
  const req = { params, body, user: { id: "ae-1", email: "ae@srl.test", role: "ADMIN" }, headers: {} } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  return { req, res, run: () => fn(req, res) };
}

describe("archiveCarrier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.carrierProfile.findUnique.mockResolvedValue(PROFILE);
    mockPrisma.$transaction.mockImplementation(async (ops: any) => (typeof ops === "function" ? ops(mockPrisma) : Promise.all(ops)));
    mockPrisma.carrierProfile.update.mockResolvedValue({});
    mockPrisma.user.update.mockResolvedValue({});
    census.mockResolvedValue(EMPTY);
  });

  it("404 for unknown or already-archived; the census is not even taken", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ ...PROFILE, deletedAt: new Date() });
    const { res, run } = call(archiveCarrier, { id: "cp-1" });
    await run();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(census).not.toHaveBeenCalled();
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });

  it("an in-flight load refuses: 409, the load named as the thing to release first, Suspend pointed at", async () => {
    census.mockResolvedValue({
      ...EMPTY,
      loads: [
        { id: "l1", referenceNumber: "SRL-121492", status: "BOOKED", inFlight: true },
        { id: "l2", referenceNumber: "SRL-121400", status: "COMPLETED", inFlight: false },
      ],
      tenders: 2, liveTenders: 1, carrierPays: 1, unpaidCarrierPays: 1,
    });
    const { res, run } = call(archiveCarrier, { id: "cp-1" });
    await run();
    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.error).toBe("CARRIER_HAS_REFERENCES");
    expect(body.message).toContain("Peace Transport cannot be archived: 2 loads (1 in flight), 2 tenders (1 live), 1 carrier payable (1 unpaid)");
    expect(body.message).toContain("suspended, not archived");
    expect(body.remedy.inFlightLoads).toEqual(["SRL-121492"]);
    expect(body.remedy.releaseInFlightLoadsFirst).toMatch(/Release the carrier from this load first/);
    expect(body.remedy.suspend).toBe("POST /compliance/carrier/cp-1/suspend");
    expect(body.references.total).toBe(5);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(mockPrisma.carrierProfile.update).not.toHaveBeenCalled();
    expect(mockPrisma.user.update).not.toHaveBeenCalled();
    // A refusal is not a lifecycle act: no row.
    expect(mockPrisma.auditTrail.create).not.toHaveBeenCalled();
  });

  it("a signed agreement alone refuses — evidence is never archived away; an already-SUSPENDED carrier gets no suspend remedy", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ ...PROFILE, onboardingStatus: "SUSPENDED" });
    census.mockResolvedValue({ ...EMPTY, agreements: 1 });
    const { res, run } = call(archiveCarrier, { id: "cp-1" });
    await run();
    expect(res.status).toHaveBeenCalledWith(409);
    const body = res.json.mock.calls[0][0];
    expect(body.message).toContain("1 signed agreement");
    expect(body.remedy.suspend).toBeNull();
  });

  it("zero references: archived (soft) AND the login deactivated, in one transaction", async () => {
    const { res, run } = call(archiveCarrier, { id: "cp-1" });
    await run();
    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(mockPrisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mockPrisma.carrierProfile.update).toHaveBeenCalledWith({
      where: { id: "cp-1" },
      data: { deletedAt: expect.any(Date), deletedBy: "ae@srl.test" },
    });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "u-1" }, data: { isActive: false } });
    expect(res.json.mock.calls[0][0]).toMatchObject({ success: true, details: { archived: true, loginDeactivated: true, references: 0 } });
    // B6b (#24) — the lifecycle record carries both rows the transaction moved.
    expect(mockPrisma.auditTrail.create).toHaveBeenCalledTimes(1);
    const row = mockPrisma.auditTrail.create.mock.calls[0][0].data;
    expect(row).toEqual(expect.objectContaining({ action: "DEACTIVATE", entityType: "CarrierProfile", entityId: "cp-1", performedById: "ae-1" }));
    expect(row.changedFields).toEqual(expect.objectContaining({
      actionDetail: "CARRIER_ARCHIVED",
      entityName: "Peace Transport",
      previous: { deletedAt: null, loginActive: true, onboardingStatus: "APPROVED" },
    }));
    expect(row.changedFields.new).toEqual(expect.objectContaining({ loginActive: false, onboardingStatus: "APPROVED" }));
    expect(typeof row.changedFields.new.deletedAt).toBe("string");
  });
});

describe("restoreCarrier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (ops: any) => (typeof ops === "function" ? ops(mockPrisma) : Promise.all(ops)));
    mockPrisma.carrierProfile.update.mockResolvedValue({});
    mockPrisma.user.update.mockResolvedValue({});
  });

  it("undoes both halves of the archive: the row and the login", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", userId: "u-1", deletedAt: new Date(), companyName: "Peace Transport" });
    const { res, run } = call(restoreCarrier, { id: "cp-1" });
    await run();
    expect(mockPrisma.carrierProfile.update).toHaveBeenCalledWith({ where: { id: "cp-1" }, data: { deletedAt: null, deletedBy: null } });
    expect(mockPrisma.user.update).toHaveBeenCalledWith({ where: { id: "u-1" }, data: { isActive: true } });
    expect(res.json.mock.calls[0][0]).toMatchObject({ details: { restored: true, loginReactivated: true } });
    // B6b (#24) — the restore is a lifecycle act too.
    expect(mockPrisma.auditTrail.create).toHaveBeenCalledTimes(1);
    const row = mockPrisma.auditTrail.create.mock.calls[0][0].data;
    expect(row).toEqual(expect.objectContaining({ action: "STATUS_CHANGE", entityType: "CarrierProfile", entityId: "cp-1", performedById: "ae-1" }));
    expect(row.changedFields.actionDetail).toBe("CARRIER_RESTORED");
    expect(row.changedFields.entityName).toBe("Peace Transport");
    expect(typeof row.changedFields.previous.deletedAt).toBe("string");
    expect(row.changedFields.new).toEqual({ deletedAt: null, loginActive: true });
  });

  it("404 when the carrier is not archived", async () => {
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1", userId: "u-1", deletedAt: null });
    const { res, run } = call(restoreCarrier, { id: "cp-1" });
    await run();
    expect(res.status).toHaveBeenCalledWith(404);
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("suspendCarrier requires a reason (B5b)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.$transaction.mockImplementation(async (ops: any) => (typeof ops === "function" ? ops(mockPrisma) : Promise.all(ops)));
    mockPrisma.carrierProfile.findUnique.mockResolvedValue({ ...PROFILE, user: { company: "Peace Transport", firstName: "P", lastName: "T" } });
    mockPrisma.carrierProfile.update.mockResolvedValue({ id: "cp-1" });
    mockPrisma.auditTrail.create.mockResolvedValue({});
  });

  it("no reason, or a four-character one, is refused 400 before any write", async () => {
    for (const body of [{}, { reason: "dupe" }]) {
      vi.clearAllMocks();
      const { res, run } = call(suspendCarrier, { carrierId: "cp-1" }, body);
      await run();
      expect(res.status, JSON.stringify(body)).toHaveBeenCalledWith(400);
      expect(mockPrisma.$transaction).not.toHaveBeenCalled();
      expect(mockPrisma.carrierProfile.update).not.toHaveBeenCalled();
    }
  });

  it("a real reason is recorded on the row and in the audit trail", async () => {
    const { run } = call(suspendCarrier, { carrierId: "cp-1" }, { reason: "Repeated no-shows on booked loads" });
    await run();
    expect(mockPrisma.carrierProfile.update).toHaveBeenCalledTimes(1);
    const data = mockPrisma.carrierProfile.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ onboardingStatus: "SUSPENDED", autoSuspendCause: "AE_MANUAL" });
    expect(data.autoSuspendReason).toBe("Suspended by an administrator: Repeated no-shows on booked loads");
    expect(mockPrisma.auditTrail.create.mock.calls[0][0].data.changedFields.reason).toContain("Repeated no-shows");
  });
});

describe("the route stays controller-backed and audited (source guard)", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../../src/routes/carriers.ts"), "utf8").replace(/\/\/[^\n]*/g, "");
  it("archiveCarrier archives (soft) and never hard-deletes the profile or the login", () => {
    const ctrl = fs.readFileSync(path.join(__dirname, "../../../src/controllers/carrierController.ts"), "utf8").replace(/\/\/[^\n]*/g, "");
    const start = ctrl.indexOf("export async function archiveCarrier(");
    const end = ctrl.indexOf("export async function restoreCarrier(");
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const body = ctrl.slice(start, end);
    // B6b captured the timestamp (`const archivedAt = new Date()`) so the audit row
    // and the soft-delete carry the same instant; either spelling is the soft write.
    expect(body).toMatch(/deletedAt: (new Date\(\)|archivedAt)[,\s]/);
    expect(body).toMatch(/const archivedAt = new Date\(\)|deletedAt: new Date\(\)/);
    expect(body).toMatch(/isActive: false/);
    expect(body).not.toMatch(/carrierProfile\.delete\(/);
    expect(body).not.toMatch(/user\.delete\(/);
  });

  it("DELETE /:id runs archiveCarrier behind an audit row; restore likewise", () => {
    expect(src).toMatch(/router\.delete\("\/:id",[^\n]*auditLog\("DELETE", "Carrier"\),\s*archiveCarrier\)/);
    expect(src).toMatch(/router\.put\("\/:id\/restore",[^\n]*restoreCarrier\)/);
    expect(src).not.toMatch(/data: \{ deletedAt: new Date\(\), deletedBy/); // the inline soft-delete is gone
  });
  it("suspend is scoped to ADMIN, CEO, OPERATIONS (decision 5)", () => {
    const compliance = fs.readFileSync(path.join(__dirname, "../../../src/routes/compliance.ts"), "utf8");
    expect(compliance).toMatch(/router\.post\("\/carrier\/:carrierId\/suspend", authorize\("ADMIN", "CEO", "OPERATIONS"\), suspendCarrier\)/);
  });
});
