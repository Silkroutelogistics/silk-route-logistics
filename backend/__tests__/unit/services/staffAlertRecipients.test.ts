/**
 * Item 329, second half — the risk alert and the fall-off alert went to the
 * load's poster. On a load the shipper posted in their portal the poster is the
 * SHIPPER, so the shipper was told the load's margin ("Margin: 5.0%") and which
 * carrier fell off their freight. Both now go to staff, through the same
 * resolver as the tender emails: the poster when staff, else the customer's
 * active account rep, else operations@ with no in-app row.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/services/emailService", () => ({
  sendRiskAlertEmail: vi.fn().mockResolvedValue(undefined),
  sendFallOffAlertEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/carrierReleaseService", () => ({ releaseCarrier: vi.fn() }));
vi.mock("../../../src/services/smartMatchService", () => ({ matchCarriersForLoad: vi.fn().mockResolvedValue({ matches: [] }) }));
vi.mock("../../../src/services/carrierAssignmentService", () => ({ assignCarrier: vi.fn() }));

import { prisma } from "../../../src/config/database";
import { sendRiskAlertEmail, sendFallOffAlertEmail } from "../../../src/services/emailService";
import { releaseCarrier } from "../../../src/services/carrierReleaseService";
import { runRiskFlagging } from "../../../src/services/riskEngine";
import { executeFallOffRecovery } from "../../../src/services/fallOffRecovery";

const p = prisma as any;
// The shared mock has no checkCallSchedule (the risk score counts missed calls),
// and its riskLog has only findMany; attach what the flagging loop reads and writes.
p.checkCallSchedule = { count: vi.fn() };
Object.assign(p.riskLog, { findFirst: vi.fn(), create: vi.fn() });

const SHIPPER = { id: "shipper-user-1", email: "logistics@shipper.example", firstName: "Sam", role: "SHIPPER" };
const REP = { id: "rep-user-1", email: "rep@silkroutelogistics.ai", firstName: "Rae", role: "ACCOUNT_EXECUTIVE", isActive: true };

// Unassigned for five hours scores RED on its own; the thin margin adds the factor
// a shipper must never read.
function shipperLoad(accountRep: typeof REP | null) {
  return {
    id: "load-1", referenceNumber: "SRL-1", posterId: SHIPPER.id, riskEmailMuted: false,
    carrierId: "u-carrier", createdAt: new Date(Date.now() - 5 * 3600_000), pickupDate: new Date(Date.now() + 72 * 3600_000),
    status: "POSTED", customerRate: 1000, carrierRate: 950,
    originCity: "A", originState: "AA", destCity: "B", destState: "BB",
    carrier: { id: "u-carrier", firstName: "P", lastName: "T", company: "PEACE TRANSPORT", carrierProfile: null },
    poster: SHIPPER,
    customer: { accountRep },
  };
}

const inAppUsers = () => p.notification.create.mock.calls.map((c: any[]) => c[0].data.userId);

beforeEach(() => {
  vi.clearAllMocks();
  p.checkCallSchedule.count.mockResolvedValue(0);
  p.riskLog.findFirst.mockResolvedValue(null);
  p.riskLog.create.mockResolvedValue({});
  p.notification.create.mockResolvedValue({});
  p.user.findUnique.mockImplementation(async ({ where }: any) =>
    where.id === REP.id ? { email: REP.email, firstName: REP.firstName, preferences: null } : null);
  p.carrierProfile.findFirst.mockResolvedValue(null);
  p.fallOffEvent.update.mockResolvedValue({});
  p.fallOffEvent.findMany.mockResolvedValue([]);
  vi.mocked(releaseCarrier).mockResolvedValue({ released: true, fallOffEventId: "ev-1" } as any);
});

describe("the RED risk alert", () => {
  for (const [label, rep, to, users] of [
    ["reaches the account rep, never the shipper", REP, REP.email, [REP.id]],
    ["with no active staff, emails operations@ and writes no in-app row", { ...REP, isActive: false }, "operations@silkroutelogistics.ai", []],
  ] as const) {
    it(label, async () => {
      const load = { ...shipperLoad(rep as typeof REP), carrierId: null, carrier: null };
      p.load.findMany.mockResolvedValue([load]);
      p.load.findUnique.mockResolvedValue(load);
      await runRiskFlagging();
      expect(vi.mocked(sendRiskAlertEmail).mock.calls.map((c) => c[0])).toEqual([to]);
      expect(inAppUsers()).toEqual(users);
      expect(p.notification.create.mock.calls.map((c: any[]) => c[0].data.message).join(" ")).toMatch(users.length ? /Margin: 5\.0%/ : /^$/);
    });
  }
});

describe("the fall-off alert", () => {
  it("reaches the account rep, never the shipper", async () => {
    p.load.findUnique.mockResolvedValue(shipperLoad(REP));
    await executeFallOffRecovery("load-1");
    expect(vi.mocked(sendFallOffAlertEmail).mock.calls.map((c) => [c[0], c[1]])).toEqual([[REP.email, REP.firstName]]);
    expect(inAppUsers()).toContain(REP.id);
    expect(inAppUsers()).not.toContain(SHIPPER.id);
  });
});
