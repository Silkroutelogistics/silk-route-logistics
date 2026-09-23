/**
 * C4a — the acceptance-evidence writer.
 *
 * Two properties make the record trustworthy, and both are enforced by the
 * WHERE clause rather than by a read-then-check, so neither can be defeated by
 * concurrency or by a caller forgetting to ask first.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { stampCarrierAcceptance, ACCEPTANCE_VIA } from "../../../src/lib/acceptanceEvidence";

const AT = new Date("2026-09-22T12:00:00.000Z");
const LOAD = "load-1";
const CARRIER = "u-carrier";

function db(updateCount: number, load: unknown) {
  return {
    load: {
      updateMany: vi.fn().mockResolvedValue({ count: updateCount }),
      findUnique: vi.fn().mockResolvedValue(load),
    },
  } as never;
}

describe("the stamp names the party whose act it was", () => {
  it("writes all four columns, with the carrier it was stamped for", async () => {
    const d = db(1, null);
    const r = await stampCarrierAcceptance(
      { loadId: LOAD, via: "TENDER_ACCEPT", carrierUserId: CARRIER, byUserId: "u-carrier", at: AT },
      d,
    );

    expect(r).toEqual({ stamped: true });
    expect((d as any).load.updateMany).toHaveBeenCalledWith({
      where: { id: LOAD, carrierAcceptedAt: null, carrierId: CARRIER },
      data: {
        carrierAcceptedAt: AT,
        carrierAcceptedVia: "TENDER_ACCEPT",
        carrierAcceptedByUserId: "u-carrier",
        carrierAcceptedCarrierId: CARRIER,
      },
    });
  });

  it("records a null byUserId where there is no session, rather than inventing one", async () => {
    const d = db(1, null);
    await stampCarrierAcceptance(
      { loadId: LOAD, via: "RC_SIGNATURE", carrierUserId: CARRIER, byUserId: null, at: AT },
      d,
    );
    expect((d as any).load.updateMany.mock.calls[0][0].data.carrierAcceptedByUserId).toBeNull();
  });
});

describe("first write wins, and the database is what enforces it", () => {
  it("scopes the update to carrierAcceptedAt: null, so a second act matches nothing", async () => {
    const d = db(1, null);
    await stampCarrierAcceptance({ loadId: LOAD, via: "TENDER_ACCEPT", carrierUserId: CARRIER, at: AT }, d);
    // Not a read-then-check: two concurrent acts cannot both land, because one
    // of them matches zero rows. A pre-check would leave a window between the
    // read and the write (v3.8.axu, where six concurrent replays wrote five times).
    expect((d as any).load.updateMany.mock.calls[0][0].where.carrierAcceptedAt).toBeNull();
  });

  it("reports already_stamped without overwriting the first act", async () => {
    const d = db(0, { carrierId: CARRIER, carrierAcceptedAt: new Date("2026-09-01T00:00:00.000Z") });
    const r = await stampCarrierAcceptance(
      { loadId: LOAD, via: "PICKUP_ARRIVAL", carrierUserId: CARRIER, at: AT },
      d,
    );
    expect(r).toEqual({ stamped: false, reason: "already_stamped" });
  });
});

describe("a stamp that names the wrong carrier writes nothing and is never coerced", () => {
  it("refuses a carrier who does not hold the load", async () => {
    const d = db(0, { carrierId: "u-somebody-else", carrierAcceptedAt: null });
    const r = await stampCarrierAcceptance(
      { loadId: LOAD, via: "BID_AWARD_ACCEPT", carrierUserId: CARRIER, at: AT },
      d,
    );
    // Not rewritten onto the load's current carrier: a disagreement means one
    // of the two is wrong, and guessing which puts a confident-looking name on
    // a record a dispute reads.
    expect(r).toEqual({ stamped: false, reason: "carrier_mismatch" });
    expect((d as any).load.updateMany.mock.calls[0][0].where.carrierId).toBe(CARRIER);
  });

  it("reports load_not_found distinctly — nothing-written is three facts, not one", async () => {
    const d = db(0, null);
    const r = await stampCarrierAcceptance(
      { loadId: LOAD, via: "TENDER_ACCEPT", carrierUserId: CARRIER, at: AT },
      d,
    );
    expect(r).toEqual({ stamped: false, reason: "load_not_found" });
  });
});

describe("the vocabulary is closed", () => {
  it("names exactly the six acts that can establish acceptance", () => {
    expect([...ACCEPTANCE_VIA].sort()).toEqual([
      "BID_AWARD_ACCEPT", "PICKUP_ARRIVAL", "RC_SIGNATURE",
      "STATUS_BOOKED", "STATUS_CONFIRMED", "TENDER_ACCEPT",
    ]);
  });
});
