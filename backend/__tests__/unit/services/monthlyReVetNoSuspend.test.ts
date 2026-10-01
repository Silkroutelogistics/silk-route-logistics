/**
 * carrier-unsuspend arc (2026-10-01): the monthly re-vet raises an AE alert
 * for a CRITICAL score and never suspends.
 *
 * Its 2026-10-01 run suspended six AUTHORIZED, insured carriers. AEs had
 * approved every one of them at the same CRITICAL grade, and about 46 points
 * of each score came from checks that never ran. The carrier was blocked from
 * the portal and sent an in-app "Account Suspended" notice. This file holds
 * the three halves of the fix: no carrier write, no carrier notification, and
 * one AE-facing alert.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    carrierProfile: { findMany: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    complianceAlert: { create: vi.fn() },
    notification: { create: vi.fn() },
  },
}));

vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));
vi.mock("../../../src/lib/logger", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("../../../src/services/emailService", () => ({ sendEmail: vi.fn(), wrap: (s: string) => s }));
vi.mock("../../../src/services/fmcsaService", () => ({ verifyCarrierWithFMCSA: vi.fn(), calendarMonthsBetween: () => 24 }));
vi.mock("../../../src/services/carrierVettingService", () => ({ vetAndStoreReport: vi.fn() }));

import { monthlyCarrierReVetting } from "../../../src/services/complianceMonitorService";
import { vetAndStoreReport } from "../../../src/services/carrierVettingService";
import { sendEmail } from "../../../src/services/emailService";

const CARRIERS = [
  { id: "cp_cj", dotNumber: "3459123", mcNumber: "MC-1300321", companyName: "CJ MASTER FREIGHT INC", userId: "u_cj" },
  { id: "cp_ok", dotNumber: "1111111", mcNumber: "MC-1", companyName: "FINE CARRIER", userId: "u_ok" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.carrierProfile.findMany.mockResolvedValue(CARRIERS);
  mockPrisma.complianceAlert.create.mockResolvedValue({});
  (vetAndStoreReport as any).mockImplementation(async (_dot: string, id: string) =>
    id === "cp_cj"
      ? { riskLevel: "CRITICAL", score: 4, flags: ["Probationary carrier: 0/3 loads"] }
      : { riskLevel: "LOW", score: 88, flags: [] },
  );
});

describe("monthlyCarrierReVetting: CRITICAL alerts the AE and never suspends", () => {
  it("writes nothing to any carrier profile", async () => {
    await monthlyCarrierReVetting();
    expect(mockPrisma.carrierProfile.update).not.toHaveBeenCalled();
    expect(mockPrisma.carrierProfile.updateMany).not.toHaveBeenCalled();
  });

  it("sends the carrier no notification and no email", async () => {
    await monthlyCarrierReVetting();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("raises one CRITICAL AE alert naming the carrier and its score, and none for a LOW carrier", async () => {
    const r = await monthlyCarrierReVetting();
    expect(r).toEqual({ total: 2, revetted: 2, critical: 1, errors: 0 });
    expect(mockPrisma.complianceAlert.create).toHaveBeenCalledTimes(1);
    const data = mockPrisma.complianceAlert.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ type: "VETTING_DECLINE", entityType: "CARRIER", entityId: "cp_cj", severity: "CRITICAL", status: "ACTIVE" });
    expect(data.entityName).toContain("CJ MASTER FREIGHT INC");
    expect(data.entityName).toContain("4/100");
  });

  it("still scans only APPROVED, non-test carriers (the alert is about carriers that can haul)", async () => {
    await monthlyCarrierReVetting();
    expect(mockPrisma.carrierProfile.findMany.mock.calls[0][0].where).toMatchObject({ onboardingStatus: "APPROVED", isTestAccount: false });
  });
});
