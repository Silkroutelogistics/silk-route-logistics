/**
 * C4c — an AE's accept is not the carrier's own act.
 *
 * `acceptPosition` labelled the settle actor `{ id: actorId ?? pos.carrierId,
 * type: "CARRIER" }` unconditionally, while its route is
 * authorize("CARRIER", ...AE_ROLES). So an AE clicking accept was recorded as
 * the carrier accepting. `declinePosition` solved the mirror of this in
 * v3.8.axk, in this same file and on the adjacent route; this brings accept to
 * parity.
 *
 * It also adds the ownership check the accept route has never had. Nothing
 * compared the caller to the position's carrier, so any authenticated CARRIER
 * could accept any cascade position by id.
 *
 * The ownership check is a BOUNDARY, so it is exercised through the real
 * router rather than asserted from source — §19 Sub-pattern 16 fifth fire:
 * a guard over a gate must send a request and read the answer.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";

// Identity is the subject here, so the mock takes the user id from a header
// instead of deriving it from the role. `authorize` is left real: the 403 this
// file asserts must come from the ownership check, not from role refusal.
vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, res: any, next: any) => {
      const role = req.headers["x-test-role"];
      if (!role) return res.status(401).json({ error: "No token provided" });
      req.user = {
        id: req.headers["x-test-user-id"] || `u-${String(role).toLowerCase()}`,
        email: `${role}@srl.invalid`,
        role,
      };
      next();
    },
  };
});

vi.mock("../../../src/services/waterfallEventService", () => ({
  logWaterfallEvent: vi.fn().mockResolvedValue(undefined),
  logTenderTransition: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/routes/trackTraceSSE", () => ({ broadcastSSE: vi.fn() }));

// settleTenders is the sole writer of the tender's settled state, and its
// `actor` argument is what this file is about.
const settleTenders = vi.fn().mockResolvedValue({ count: 1, tenderIds: ["t-1"] });
vi.mock("../../../src/services/tenderTransitionService", () => ({
  settleTenders: (...a: unknown[]) => settleTenders(...a),
  withdrawLiveTenders: vi.fn().mockResolvedValue({ count: 0, tenderIds: [] }),
}));

const assignCarrier = vi.fn().mockResolvedValue(undefined);
vi.mock("../../../src/services/carrierAssignmentService", () => ({
  assignCarrier: (...a: unknown[]) => assignCarrier(...a),
  clearCarrier: vi.fn(),
}));

// Dynamically imported inside acceptPosition.
const complianceCheck = vi.fn();
vi.mock("../../../src/services/complianceMonitorService", () => ({
  complianceCheck: (...a: unknown[]) => complianceCheck(...a),
}));
vi.mock("../../../src/services/checkCallAutomation", () => ({
  createCheckCallSchedule: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/notificationService", () => ({
  notifyTenderAction: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/autoRateConfirmationService", () => ({
  autoGenerateRateConfirmation: vi.fn().mockResolvedValue(null),
}));
vi.mock("../../../src/services/rateConfirmationAutoIssue", () => ({
  autoIssueRateConfirmation: vi.fn().mockResolvedValue({ issued: false, reason: "stubbed" }),
}));
vi.mock("../../../src/lib/carrierEligibility", () => ({
  assertEligibleByProfileId: vi.fn().mockResolvedValue({ allowed: true }),
  assertEligibleByUserId: vi.fn().mockResolvedValue({ carrierProfileId: "cp-1", verdict: { allowed: true } }),
  isCarrierIneligible: () => false,
}));

import { prisma } from "../../../src/config/database";
import { acceptPosition } from "../../../src/services/waterfallEngineService";

const mockPrisma = prisma as any;

/** The position's carrier. A User.id — buildWaterfall stores User.id here. */
const OWNER = "u-owner-carrier";
const POS_ID = "p-1";
const LOAD_ID = "load-1";

beforeEach(() => {
  vi.clearAllMocks();
  settleTenders.mockResolvedValue({ count: 1, tenderIds: ["t-1"] });
  assignCarrier.mockResolvedValue(undefined);
  complianceCheck.mockResolvedValue({
    allowed: true, blocked_reasons: [], blocked_codes: [], released: [], warnings: [],
  });

  mockPrisma.waterfallPosition = {
    findUnique: vi.fn().mockResolvedValue({
      id: POS_ID,
      position: 1,
      status: "tendered",
      carrierId: OWNER,
      offeredRate: 1200,
      waterfall: { id: "wf-1", loadId: LOAD_ID },
    }),
    update: vi.fn().mockResolvedValue({}),
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  };
  mockPrisma.waterfall = { update: vi.fn().mockResolvedValue({}) };
  mockPrisma.carrierProfile.findFirst = vi.fn().mockResolvedValue({ id: "cp-1" });
  mockPrisma.loadTender.findFirst = vi.fn().mockResolvedValue({ id: "t-1" });
  mockPrisma.load.findUnique = vi.fn().mockResolvedValue({ posterId: "u-ae" });
});

/** The single `actor` the accept handed to settleTenders. */
function settleActor() {
  const accept = settleTenders.mock.calls.find((c: any[]) => c[0]?.to === "ACCEPTED");
  return accept?.[0];
}

describe("acceptPosition attributes the act to the party who performed it", () => {
  it("a carrier accepting their own position is recorded as the CARRIER", async () => {
    const r = await acceptPosition(POS_ID, OWNER, { onBehalf: false });

    expect(r).toMatchObject({ accepted: true, onBehalf: false, carrierUserId: OWNER, loadId: LOAD_ID });
    const call = settleActor();
    expect(call.to).toBe("ACCEPTED");
    expect(call.actor).toEqual({ id: OWNER, type: "CARRIER" });
    expect(call.onBehalf).toBe(false);
  });

  it("an AE accepting on the carrier's behalf is recorded as the AE, not the carrier", async () => {
    const r = await acceptPosition(POS_ID, "u-ae", { onBehalf: true });

    expect(r).toMatchObject({ accepted: true, onBehalf: true });
    const call = settleActor();
    // The AE's own id, typed USER. Before C4c this read
    // { id: "u-ae", type: "CARRIER" } — the AE's click wearing the carrier's name.
    expect(call.actor).toEqual({ id: "u-ae", type: "USER" });
    expect(call.onBehalf).toBe(true);
    // The load still dispatches to the carrier: who ACTED and who HAULS are
    // different questions, and only the first one changed.
    expect(assignCarrier).toHaveBeenCalledWith(expect.objectContaining({ carrierUserId: OWNER }));
  });

  it("a system accept with no actor is attributed to nobody, not to the carrier", async () => {
    await acceptPosition(POS_ID, null, { onBehalf: false });
    // Mirrors declinePosition's `actorId ?? null`. The pre-C4c fallback was
    // `?? pos.carrierId`, which signed the carrier's name to an unattributed act.
    expect(settleActor().actor).toEqual({ id: null, type: "CARRIER" });
  });
});

describe("a carrier may accept only their own cascade position", () => {
  it("refuses a position belonging to another carrier, and writes nothing", async () => {
    const r = await acceptPosition(POS_ID, "u-someone-else", { onBehalf: false });

    expect(r).toEqual({ accepted: false, reason: "not_owner" });
    expect(settleTenders).not.toHaveBeenCalled();
    expect(assignCarrier).not.toHaveBeenCalled();
    expect(mockPrisma.waterfallPosition.update).not.toHaveBeenCalled();
  });

  it("does not gate an AE, who legitimately accepts a position that is not theirs", async () => {
    const r = await acceptPosition(POS_ID, "u-ae", { onBehalf: true });
    expect(r).toMatchObject({ accepted: true });
  });

  // The gate is EXERCISED, not read. A source assertion could only prove the
  // check is written; this proves it answers.
  describe("through the real router", () => {
    async function post(userId: string, role: string) {
      const waterfalls = (await import("../../../src/routes/waterfalls")).default;
      const a = express();
      a.use(express.json());
      a.use("/api/waterfalls", waterfalls);
      return request(a)
        .post(`/api/waterfalls/tenders/${POS_ID}/accept`)
        .set("x-test-role", role)
        .set("x-test-user-id", userId)
        .send({});
    }

    it("403s a carrier reaching for another carrier's tender", async () => {
      const res = await post("u-someone-else", "CARRIER");
      expect(res.status).toBe(403);
      expect(assignCarrier).not.toHaveBeenCalled();
    });

    it("200s the carrier the tender belongs to", async () => {
      const res = await post(OWNER, "CARRIER");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, onBehalf: false });
    });

    it("200s an AE and reports the accept as on-behalf", async () => {
      const res = await post("u-ae", "BROKER");
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ ok: true, onBehalf: true });
      expect(settleActor().actor.type).toBe("USER");
    });
  });
});

/**
 * C4c Phase A finding, pinned so it stays visible.
 *
 * The brief asked that acceptance rate not be credited on an on-behalf accept.
 * That does not follow from the actor fix above, and this pins why: every
 * acceptance-rate computation in the codebase derives from LoadTender.status
 * alone — integrationService.ts (the PERSISTED Compass factor, §9 10% weight)
 * selects `{ status: true }` and nothing else; carrierController and
 * analytics both go through summarizeTenders, which takes `{ status }`.
 *
 * `onBehalf` and the actor land in the LoadActivity transition row. No scorer
 * reads it. So an on-behalf accept is, to the scorer, indistinguishable from
 * the carrier's own — and making it distinguishable means marking the TENDER
 * row (statusReason, the mechanism v3.8.axj already uses for WITHDRAWN and
 * RELEASED so a reader can tell SRL's act from the carrier's) and teaching
 * summarizeTenders to leave it out of the numerator AND the denominator, the
 * way v3.8.awx leaves withdrawals out.
 *
 * That is a scoring-semantics change to a shared pure lib feeding three
 * surfaces including the persisted Compass factor. It is reported, not taken
 * silently from inside a waterfall-scoped commit.
 */
describe("FINDING: the tender row carries no on-behalf signal for the scorer", () => {
  it("an on-behalf accept settles to ACCEPTED, exactly as the carrier's own does", async () => {
    await acceptPosition(POS_ID, "u-ae", { onBehalf: true });
    expect(settleActor().to).toBe("ACCEPTED");
  });

  it("summarizeTenders credits an ACCEPTED row with no way to ask who accepted it", async () => {
    const { summarizeTenders } = await import("../../../src/lib/tenderScoring");
    // The shape the Compass factor reads: status and nothing else.
    expect(summarizeTenders([{ status: "ACCEPTED" }]).acceptanceRate).toBe(100);
    // Contrast: SRL's own withdrawal DOES leave the denominator, because that
    // distinction was pushed onto the row. The on-behalf accept has no equivalent.
    expect(summarizeTenders([{ status: "WITHDRAWN" }]).acceptanceRate).toBeNull();
  });
});
