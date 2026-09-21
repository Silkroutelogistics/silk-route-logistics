/**
 * Sprint A0 (v3.8.bbv): the auto-reversal switches on the suspension cause.
 *
 * Every case below is one row of the ruling:
 *
 *   FMCSA_* and INSURANCE_EXPIRED  reinstated by the FMCSA facts
 *   VETTING_CRITICAL               only with a fresh, non-CRITICAL vet dated
 *                                  after the suspension
 *   OFAC_MATCH, AE_MANUAL          never; FMCSA is not even consulted
 *   null                           held and surfaced once as an alert
 *
 * plus the record: a cron reinstatement lands on SystemLog naming the job, a
 * button press lands on AuditTrail naming the user, a cron suspension lands on
 * SystemLog naming the job, and the recorder never throws.
 *
 * The first VETTING_CRITICAL case is AEROSWIFT exactly: suspended 2026-09-01
 * 07:00 on score 0, last vetted at that same moment, FMCSA clean. The old
 * reversal reinstated it on 2026-09-07. This one must not.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma, mockLog } = vi.hoisted(() => ({
  mockPrisma: {
    carrierProfile: { findMany: vi.fn(), update: vi.fn() },
    complianceAlert: { findFirst: vi.fn(), create: vi.fn() },
    systemLog: { create: vi.fn() },
    auditTrail: { create: vi.fn() },
    notification: { create: vi.fn() },
  },
  mockLog: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));
vi.mock("../../../src/lib/logger", () => ({ log: mockLog }));
vi.mock("../../../src/services/emailService", () => ({ sendEmail: vi.fn(), wrap: (s: string) => s }));
vi.mock("../../../src/services/fmcsaService", () => ({
  verifyCarrierWithFMCSA: vi.fn(),
  calendarMonthsBetween: () => 24,
}));
vi.mock("../../../src/services/carrierVettingService", () => ({ vetAndStoreReport: vi.fn() }));

import { checkAutoReversal, monthlyCarrierReVetting } from "../../../src/services/complianceMonitorService";
import { verifyCarrierWithFMCSA } from "../../../src/services/fmcsaService";
import { vetAndStoreReport } from "../../../src/services/carrierVettingService";
import { recordCarrierStatusTransition, actionDetailFor } from "../../../src/lib/carrierStatusAudit";

const NOW = new Date("2026-09-14T12:00:00Z");
const SUSPENDED_AT = new Date("2026-09-01T07:00:02Z");
const FMCSA_CLEAN = { verified: true, operatingStatus: "AUTHORIZED", outOfServiceDate: null, insuranceOnFile: true };
const FMCSA_REVOKED = { verified: true, operatingStatus: "NOT AUTHORIZED", outOfServiceDate: null, insuranceOnFile: true };

function row(over: Record<string, unknown> = {}) {
  return {
    id: "cp_aero",
    dotNumber: "4333584",
    companyName: "AEROSWIFT LLC",
    autoSuspendCause: "VETTING_CRITICAL",
    autoSuspendedAt: SUSPENDED_AT,
    lastVettingRisk: "CRITICAL",
    lastVettedAt: SUSPENDED_AT,
    insuranceExpiry: new Date("2026-12-31T00:00:00Z"),
    user: { company: "AEROSWIFT LLC", firstName: "Stu", lastName: "Cook", email: "c@example.invalid" },
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  mockPrisma.carrierProfile.update.mockResolvedValue({});
  mockPrisma.complianceAlert.findFirst.mockResolvedValue(null);
  mockPrisma.complianceAlert.create.mockResolvedValue({});
  mockPrisma.systemLog.create.mockResolvedValue({});
  mockPrisma.auditTrail.create.mockResolvedValue({});
  mockPrisma.notification.create.mockResolvedValue({});
  (verifyCarrierWithFMCSA as any).mockResolvedValue(FMCSA_CLEAN);
});

function reinstateCall() {
  return mockPrisma.carrierProfile.update.mock.calls.find((c) => c[0]?.data?.onboardingStatus === "APPROVED");
}

describe("checkAutoReversal switches on autoSuspendCause", () => {
  it("AEROSWIFT: VETTING_CRITICAL with the last vet AT the suspension is held, FMCSA clean or not", async () => {
    mockPrisma.carrierProfile.findMany.mockResolvedValue([row()]);
    const r = await checkAutoReversal();
    expect(r).toMatchObject({ checked: 1, reinstated: 0, held: 1, unclassified: 0 });
    expect(reinstateCall(), "the old reversal did this; the new one must not").toBeUndefined();
    expect(mockPrisma.systemLog.create).not.toHaveBeenCalled();
  });

  it("VETTING_CRITICAL with a fresh non-CRITICAL vet dated after the suspension is reinstated", async () => {
    mockPrisma.carrierProfile.findMany.mockResolvedValue([
      row({ lastVettingRisk: "MEDIUM", lastVettedAt: new Date("2026-09-10T15:00:00Z") }),
    ]);
    const r = await checkAutoReversal();
    expect(r).toMatchObject({ reinstated: 1, held: 0 });
    const call = reinstateCall();
    expect(call?.[0].data).toMatchObject({
      onboardingStatus: "APPROVED",
      status: "APPROVED",
      autoSuspendedAt: null,
      autoSuspendReason: null,
      autoSuspendCause: null,
    });
  });

  it("VETTING_CRITICAL with a fresh vet that is STILL CRITICAL is held", async () => {
    mockPrisma.carrierProfile.findMany.mockResolvedValue([
      row({ lastVettingRisk: "CRITICAL", lastVettedAt: new Date("2026-09-10T15:00:00Z") }),
    ]);
    const r = await checkAutoReversal();
    expect(r).toMatchObject({ reinstated: 0, held: 1 });
  });

  it("FMCSA_AUTHORITY is reinstated by the FMCSA facts alone, with no vetting condition", async () => {
    mockPrisma.carrierProfile.findMany.mockResolvedValue([
      row({ autoSuspendCause: "FMCSA_AUTHORITY", lastVettingRisk: "CRITICAL", lastVettedAt: SUSPENDED_AT }),
    ]);
    const r = await checkAutoReversal();
    expect(r).toMatchObject({ reinstated: 1 });
    expect(reinstateCall()).toBeDefined();
  });

  it("FMCSA_AUTHORITY stays held while FMCSA still reports the authority revoked", async () => {
    (verifyCarrierWithFMCSA as any).mockResolvedValue(FMCSA_REVOKED);
    mockPrisma.carrierProfile.findMany.mockResolvedValue([row({ autoSuspendCause: "FMCSA_AUTHORITY" })]);
    const r = await checkAutoReversal();
    expect(r).toMatchObject({ reinstated: 0, held: 1 });
  });

  it("INSURANCE_EXPIRED is held while the profile's own expiry is still in the past", async () => {
    mockPrisma.carrierProfile.findMany.mockResolvedValue([
      row({ autoSuspendCause: "INSURANCE_EXPIRED", insuranceExpiry: new Date("2026-08-01T00:00:00Z") }),
    ]);
    const r = await checkAutoReversal();
    expect(r, "reinstating here would be undone by the 11:00 insurance sweep the same day").toMatchObject({ reinstated: 0, held: 1 });
  });

  it("INSURANCE_EXPIRED is reinstated once the expiry on file is in the future and FMCSA is clean", async () => {
    mockPrisma.carrierProfile.findMany.mockResolvedValue([row({ autoSuspendCause: "INSURANCE_EXPIRED" })]);
    const r = await checkAutoReversal();
    expect(r).toMatchObject({ reinstated: 1 });
  });

  it.each(["OFAC_MATCH", "AE_MANUAL"])("%s is never auto-reinstated and FMCSA is not consulted", async (cause) => {
    mockPrisma.carrierProfile.findMany.mockResolvedValue([row({ autoSuspendCause: cause })]);
    const r = await checkAutoReversal();
    expect(r).toMatchObject({ reinstated: 0, held: 1 });
    expect(verifyCarrierWithFMCSA).not.toHaveBeenCalled();
    expect(reinstateCall()).toBeUndefined();
  });

  it("a null cause is held and surfaced ONCE as a SUSPENSION_CAUSE_UNKNOWN alert", async () => {
    mockPrisma.carrierProfile.findMany.mockResolvedValue([row({ autoSuspendCause: null })]);
    let r = await checkAutoReversal();
    expect(r).toMatchObject({ reinstated: 0, unclassified: 1 });
    expect(mockPrisma.complianceAlert.create).toHaveBeenCalledTimes(1);
    expect(mockPrisma.complianceAlert.create.mock.calls[0][0].data).toMatchObject({
      type: "SUSPENSION_CAUSE_UNKNOWN",
      entityType: "CarrierProfile",
      entityId: "cp_aero",
      severity: "WARNING",
    });
    expect(verifyCarrierWithFMCSA).not.toHaveBeenCalled();

    // the next weekly run finds the alert already open and does not pile on
    mockPrisma.complianceAlert.findFirst.mockResolvedValue({ id: "alert_1" });
    r = await checkAutoReversal();
    expect(r.unclassified).toBe(1);
    expect(mockPrisma.complianceAlert.create).toHaveBeenCalledTimes(1);
  });
});

describe("both transitions leave a record naming the actor", () => {
  it("a cron reinstatement lands on SystemLog with the job as source and the cause in details", async () => {
    mockPrisma.carrierProfile.findMany.mockResolvedValue([row({ autoSuspendCause: "FMCSA_RATING" })]);
    await checkAutoReversal();
    expect(mockPrisma.auditTrail.create).not.toHaveBeenCalled();
    expect(mockPrisma.systemLog.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.systemLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ logType: "STATUS_CHANGE", severity: "INFO", source: "cron/auto-reversal" });
    expect(data.details).toMatchObject({
      actionDetail: "CARRIER_REINSTATED",
      carrierId: "cp_aero",
      previousStatus: "SUSPENDED",
      newStatus: "APPROVED",
      cause: "FMCSA_RATING",
      actor: { kind: "CRON", source: "auto-reversal" },
    });
    expect(String(data.details.reason)).toContain("FMCSA reports authority active");
  });

  it("a reinstatement from the manual check-reversals button lands on AuditTrail naming the user", async () => {
    mockPrisma.carrierProfile.findMany.mockResolvedValue([row({ autoSuspendCause: "FMCSA_AUTHORITY" })]);
    await checkAutoReversal({ triggeredByUserId: "user_admin" });
    expect(mockPrisma.systemLog.create).not.toHaveBeenCalled();
    expect(mockPrisma.auditTrail.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.auditTrail.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ action: "STATUS_CHANGE", entityType: "CarrierProfile", entityId: "cp_aero", performedById: "user_admin" });
    expect(data.changedFields).toMatchObject({ actionDetail: "CARRIER_REINSTATED", previousStatus: "SUSPENDED", newStatus: "APPROVED", cause: "FMCSA_AUTHORITY" });
  });

  it("a cron suspension (monthly re-vetting, CRITICAL) lands on SystemLog with cause VETTING_CRITICAL", async () => {
    mockPrisma.carrierProfile.findMany.mockResolvedValue([
      { id: "cp_aero", dotNumber: "4333584", mcNumber: "MC-1692309", companyName: "AEROSWIFT LLC", userId: "u_aero" },
    ]);
    (vetAndStoreReport as any).mockResolvedValue({ riskLevel: "CRITICAL", score: 0, flags: ["a", "b", "c", "d"] });
    const r = await monthlyCarrierReVetting();
    expect(r).toMatchObject({ revetted: 1, critical: 1, suspended: 1 });
    const upd = mockPrisma.carrierProfile.update.mock.calls[0][0].data;
    expect(upd).toMatchObject({ onboardingStatus: "SUSPENDED", status: "SUSPENDED", autoSuspendCause: "VETTING_CRITICAL" });
    expect(upd.autoSuspendedAt).toBeInstanceOf(Date);
    expect(mockPrisma.systemLog.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.systemLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ logType: "STATUS_CHANGE", severity: "WARNING", source: "cron/monthly-carrier-revet" });
    expect(data.details).toMatchObject({ actionDetail: "CARRIER_SUSPENDED", previousStatus: "APPROVED", newStatus: "SUSPENDED", cause: "VETTING_CRITICAL" });
  });
});

describe("recordCarrierStatusTransition", () => {
  const base = {
    carrierId: "cp_1",
    carrierName: "X",
    previousStatus: "SUSPENDED",
    newStatus: "APPROVED" as const,
    cause: "FMCSA_AUTHORITY",
    reason: "r",
  };

  it("never throws: a failed write is logged and the transition stands", async () => {
    mockPrisma.systemLog.create.mockRejectedValue(new Error("db down"));
    await expect(recordCarrierStatusTransition({ ...base, actor: { kind: "CRON", source: "x" } })).resolves.toBeUndefined();
    expect(mockLog.error).toHaveBeenCalledTimes(1);
    mockPrisma.auditTrail.create.mockRejectedValue(new Error("db down"));
    await expect(recordCarrierStatusTransition({ ...base, actor: { kind: "USER", userId: "u" } })).resolves.toBeUndefined();
    expect(mockLog.error).toHaveBeenCalledTimes(2);
  });

  it("names the action for a reader of either table", () => {
    expect(actionDetailFor({ previousStatus: "APPROVED", newStatus: "SUSPENDED" })).toBe("CARRIER_SUSPENDED");
    expect(actionDetailFor({ previousStatus: "SUSPENDED", newStatus: "APPROVED" })).toBe("CARRIER_REINSTATED");
    expect(actionDetailFor({ previousStatus: "PENDING", newStatus: "APPROVED" })).toBe("CARRIER_STATUS_CHANGE");
  });

  it("never attributes a cron to a person", async () => {
    await recordCarrierStatusTransition({ ...base, actor: { kind: "CRON", source: "auto-reversal" } });
    expect(mockPrisma.auditTrail.create).not.toHaveBeenCalled();
    const data = mockPrisma.systemLog.create.mock.calls[0][0].data;
    expect(data.userId).toBeUndefined();
    expect(data.source).toBe("cron/auto-reversal");
  });
});
