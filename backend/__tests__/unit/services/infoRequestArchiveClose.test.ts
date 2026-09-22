/**
 * Carrier-archive recut C3 (2026-09-19) — open info requests are closed by the
 * archive through the Item 260 chokepoint, and the announcement says only what
 * happened.
 *
 * An ARCHIVED carrier is deliberately NOT told: the archive deactivates their
 * login in the same transaction, the archive itself sends them no notice, and
 * the withdrawal template links to a portal that now refuses them. The AE IS
 * told, once, and the sentence that used to claim "the carrier has been told"
 * must not claim it for an act that told them nothing.
 *
 * The SUSPENDED control case proves the gate is specific to ARCHIVED rather than
 * a notice that stopped firing for everyone.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const { notifyWithdrawn, mockPrisma } = vi.hoisted(() => ({
  notifyWithdrawn: vi.fn(async () => true),
  mockPrisma: {
    carrierProfile: { findUnique: vi.fn() },
    notification: { create: vi.fn(), findFirst: vi.fn() },
    infoRequest: { updateManyAndReturn: vi.fn() },
  },
}));

vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));
vi.mock("../../../src/lib/logger", () => ({ log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() } }));
vi.mock("../../../src/services/emailService", () => ({ sendEmail: vi.fn(), wrap: (s: string) => s }));
vi.mock("../../../src/services/onboardingLifecycleService", () => ({
  notifyInfoRequestWithdrawn: notifyWithdrawn,
  confirmInfoRequestAnswered: vi.fn(async () => true),
}));

import {
  announceInfoRequestsClosedByStatus,
  closeOpenInfoRequestsForStatus,
  CLOSED_BY_STATUS_REASON,
} from "../../../src/services/infoRequestService";

const CLOSED = [
  { id: "ir-1", category: "COI_UPDATE", createdById: "ae-1" },
  { id: "ir-2", category: "W9_UPDATE", createdById: "ae-1" },
];

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.notification.create.mockResolvedValue({});
});

describe("closing on archive", () => {
  it("ARCHIVED is a reason the close can write, and it names the archive rather than a status", async () => {
    expect(CLOSED_BY_STATUS_REASON.ARCHIVED).toBe("Closed automatically — this carrier's record was archived.");
    const tx = { infoRequest: { updateManyAndReturn: vi.fn().mockResolvedValue([{ id: "ir-9", category: "COI_UPDATE", createdById: "ae-1" }]) } } as any;
    const moved = await closeOpenInfoRequestsForStatus({ carrierId: "cp-1", newStatus: "ARCHIVED", closedById: "ae-1" }, tx);
    expect(moved).toEqual([{ id: "ir-9", category: "COI_UPDATE", createdById: "ae-1" }]);
    expect(tx.infoRequest.updateManyAndReturn.mock.calls[0][0]).toMatchObject({
      where: { carrierId: "cp-1", status: "OPEN" },
      data: { status: "CANCELLED", cancelledById: "ae-1", cancelReason: CLOSED_BY_STATUS_REASON.ARCHIVED },
    });
  });

  it("ARCHIVED tells the carrier nothing and tells the AE once, in words that do not claim the carrier was told", async () => {
    await announceInfoRequestsClosedByStatus(CLOSED, { carrierId: "cp-1", carrierName: "Peace Transport", newStatus: "ARCHIVED" });
    expect(notifyWithdrawn).not.toHaveBeenCalled();
    const aeNotes = mockPrisma.notification.create.mock.calls.map((c: any) => c[0].data);
    expect(aeNotes).toHaveLength(1);
    expect(aeNotes[0]).toMatchObject({ userId: "ae-1", type: "ONBOARDING", title: "Info requests closed — Peace Transport" });
    expect(aeNotes[0].message).toContain("2 open info requests");
    expect(aeNotes[0].message).toContain("closed because this carrier was archived");
    expect(aeNotes[0].message).toContain("The carrier was not notified; their login is deactivated.");
    expect(aeNotes[0].message).not.toContain("has been told");
  });

  it("control — SUSPENDED still tells the carrier per request and says so to the AE", async () => {
    await announceInfoRequestsClosedByStatus(CLOSED, { carrierId: "cp-1", carrierName: "Peace Transport", newStatus: "SUSPENDED" });
    expect(notifyWithdrawn).toHaveBeenCalledTimes(2);
    for (const call of notifyWithdrawn.mock.calls) expect((call[0] as any).closedByStatus).toBe("SUSPENDED");
    const aeNotes = mockPrisma.notification.create.mock.calls.map((c: any) => c[0].data);
    expect(aeNotes[0].message).toContain("moved to SUSPENDED");
    expect(aeNotes[0].message).toContain("The carrier has been told to stop work on them.");
  });

  it("nothing closed, nothing announced", async () => {
    await announceInfoRequestsClosedByStatus([], { carrierId: "cp-1", carrierName: "Peace Transport", newStatus: "ARCHIVED" });
    expect(notifyWithdrawn).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });
});
