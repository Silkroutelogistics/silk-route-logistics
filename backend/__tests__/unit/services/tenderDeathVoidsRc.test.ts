// Item 342 (v3.8.bol) — a tender that dies takes its offer-time rate
// confirmation with it, and only its own.
//
// The RC is issued with the offer on the direct paths, so a declined, expired
// or withdrawn offer would otherwise leave a live signing link in the carrier's
// inbox for a load that is covered, or an offer that ran out. The void happens
// in applySettle, the one place every settlement passes through, keyed on the
// tenders that actually moved.
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/services/waterfallEventService", () => ({
  logTenderTransition: vi.fn().mockResolvedValue(undefined),
}));

import { settleTender, withdrawLiveTenders } from "../../../src/services/tenderTransitionService";

function makeDb(snapshot: Array<{ id: string; loadId: string; status: string }>, movedCount = snapshot.length) {
  return {
    loadTender: {
      findMany: vi.fn().mockResolvedValueOnce(snapshot).mockResolvedValue(snapshot.slice(0, movedCount).map((t) => ({ id: t.id }))),
      updateMany: vi.fn().mockResolvedValue({ count: movedCount }),
    },
    rateConfirmation: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  } as any;
}

const voidCall = (db: any) => db.rateConfirmation.updateMany.mock.calls[0]?.[0];

describe("a dead tender voids its own rate confirmation", () => {
  beforeEach(() => vi.clearAllMocks());

  it.each(["DECLINED", "EXPIRED", "WITHDRAWN"] as const)("%s voids the tender's RC and kills its link", async (to) => {
    const db = makeDb([{ id: "t1", loadId: "L1", status: "OFFERED" }]);
    await settleTender(
      { tenderId: "t1", to, from: "OFFERED", actor: { id: "c1", type: "CARRIER" }, reason: to === "WITHDRAWN" ? "srl_withdrew" : null },
      db,
    );
    const call = voidCall(db);
    expect(call.where).toEqual({ tenderId: { in: ["t1"] }, status: { notIn: ["SIGNED", "FINALIZED", "VOID"] } });
    expect(call.data).toMatchObject({ status: "VOID", signTokenHash: null, signTokenId: null, signTokenExpiresAt: null });
    // The number is cancelled, never freed: a void does not touch rateConNumber.
    expect(call.data).not.toHaveProperty("rateConNumber");
  });

  it.each(["ACCEPTED", "COUNTERED", "RC_SENT", "CONFIRMED"] as const)("%s does not void anything here", async (to) => {
    const db = makeDb([{ id: "t1", loadId: "L1", status: "OFFERED" }]);
    await settleTender({ tenderId: "t1", to, actor: { id: "c1", type: "CARRIER" } }, db);
    expect(db.rateConfirmation.updateMany).not.toHaveBeenCalled();
  });

  it("withdrawing the losers voids only the losers' documents, never the winner's", async () => {
    const db = makeDb([
      { id: "loser-a", loadId: "L1", status: "OFFERED" },
      { id: "loser-b", loadId: "L1", status: "COUNTERED" },
    ]);
    await withdrawLiveTenders({ loadId: "L1", exceptTenderId: "winner", reason: "load_covered" }, db);
    expect(voidCall(db).where.tenderId).toEqual({ in: ["loser-a", "loser-b"] });
  });

  it("a tender that raced to accepted keeps its document", async () => {
    // Snapshot saw two, only one actually moved: the void follows the move.
    const db = makeDb(
      [
        { id: "moved", loadId: "L1", status: "OFFERED" },
        { id: "raced", loadId: "L1", status: "OFFERED" },
      ],
      1,
    );
    await withdrawLiveTenders({ loadId: "L1", reason: "load_covered" }, db);
    expect(voidCall(db).where.tenderId).toEqual({ in: ["moved"] });
  });

  it("nothing moved, nothing voided", async () => {
    const db = makeDb([]);
    await settleTender({ tenderId: "t1", to: "EXPIRED", from: "OFFERED", reason: "ttl_elapsed" }, db);
    expect(db.rateConfirmation.updateMany).not.toHaveBeenCalled();
  });
});
