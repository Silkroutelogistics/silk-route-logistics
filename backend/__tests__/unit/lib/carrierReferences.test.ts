/**
 * Carrier references — what the archive reads (carrier-archive recut C3,
 * CLAUDE.md §14 "CARRIER ARCHIVE — RATIFIED 2026-09-19").
 *
 * The id-semantics cases are the load-bearing ones: this codebase has shipped
 * a User id into a CarrierProfile lookup before (§13.3 Item 222.4) and the
 * census reads both kinds. Each class is asserted against the id it must use.
 *
 * Under the ruling the census answers two questions in one read — what BLOCKS
 * (in-flight loads by either signal) and what the transaction WITHDRAWS (open
 * tender ids, open cascade positions) — and every class is still COUNTED.
 * The last describe gives every class a DISTINCT count and asserts each field
 * by name: a census returning the right total for the wrong reason (a class
 * dropped, or a field wired to another class's query) passes a total and
 * fails this.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import {
  censusCarrierReferences,
  carrierReferenceTotal,
  describeCarrierReferences,
  inFlightBlockers,
  type CarrierReferenceCensus,
} from "../../../src/lib/carrierReferences";
import { BINDING_TENDER_STATES } from "../../../src/lib/carrierArchiveGuard";

const mockPrisma = vi.mocked(prisma) as any;
const PROFILE = "cp-1", USER = "u-1";

const EMPTY: CarrierReferenceCensus = {
  loads: [], tenders: 0, liveTenders: 0, withdrawableTenderIds: [], holdingTenders: [], bids: 0,
  waterfallPositions: 0, openWaterfallPositions: [], carrierPays: 0, unpaidCarrierPays: 0,
  settlements: 0, disputes: 0, agreements: 0, documents: 0, drivers: 0, fallOffs: 0, chameleonMatches: 0,
  infoRequests: 0, overrides: 0, fraudReports: 0, quickPayEnrollments: 0, routingGuideEntries: 0, dockSchedules: 0,
  ediTransactions: 0, exceptionAlerts: 0,
};

function loadRef(id: string, ref: string, status: string, inFlight: boolean) {
  return { id, loadNumber: `SRL-${ref}`, referenceNumber: ref, status, inFlight };
}
function holdingRef(id: string, status: string, l: { id: string; ref: string; status: string; deletedAt?: Date | null }) {
  return { id, status, load: { id: l.id, loadNumber: `SRL-${l.ref}`, referenceNumber: l.ref, status: l.status, deletedAt: l.deletedAt ?? null } } as any;
}

const COUNT_MODELS = ["loadTender", "loadBid", "waterfallPosition", "carrierPay", "settlement", "paymentDispute",
  "carrierAgreement", "document", "driver", "fallOffEvent", "chameleonMatch", "infoRequest", "complianceOverride",
  "fraudReport", "quickPayEnrollment", "routingGuideEntry", "dockSchedule", "eDITransaction", "exceptionAlert"];

describe("carrierReferenceTotal + describeCarrierReferences", () => {
  it("empty totals zero and describes nothing", () => {
    expect(carrierReferenceTotal(EMPTY)).toBe(0);
    expect(describeCarrierReferences(EMPTY)).toBe("");
  });

  it("live things are named first and qualified", () => {
    const c: CarrierReferenceCensus = {
      ...EMPTY,
      loads: [loadRef("a", "1", "IN_TRANSIT", true), loadRef("b", "2", "COMPLETED", false)],
      tenders: 3, liveTenders: 1,
      carrierPays: 2, unpaidCarrierPays: 1,
      agreements: 1, documents: 4,
    };
    expect(describeCarrierReferences(c)).toBe(
      "2 loads (1 in flight), 3 tenders (1 live), 2 carrier payables (1 unpaid), 1 signed agreement, 4 documents",
    );
    expect(carrierReferenceTotal(c)).toBe(2 + 3 + 2 + 1 + 4);
  });

  it("live sub-counts are qualifiers, not additional references (no double counting)", () => {
    const c = { ...EMPTY, tenders: 2, liveTenders: 2, carrierPays: 1, unpaidCarrierPays: 1 };
    expect(carrierReferenceTotal(c)).toBe(3);
  });
});

describe("censusCarrierReferences reads each class by the right id", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const m of COUNT_MODELS) mockPrisma[m].count.mockResolvedValue(0);
    mockPrisma.load.findMany.mockResolvedValue([]);
    mockPrisma.loadTender.findMany.mockResolvedValue([]);
    mockPrisma.waterfallPosition.findMany.mockResolvedValue([]);
  });

  it("loads, bids, waterfall positions, payables, fall-offs: the USER id", async () => {
    mockPrisma.load.findMany.mockResolvedValue([
      { id: "a", loadNumber: "SRL-10", referenceNumber: "10", status: "DISPATCHED" },
      { id: "d", loadNumber: null, referenceNumber: "12", status: "DELIVERED" },
      { id: "b", loadNumber: "SRL-11", referenceNumber: "11", status: "TONU" },
    ]);
    const c = await censusCarrierReferences(PROFILE, USER);
    // DELIVERED is in flight: the POD is still owed. TONU is history.
    expect(c.loads.map((l) => [l.referenceNumber, l.inFlight])).toEqual([["10", true], ["12", true], ["11", false]]);
    expect(mockPrisma.load.findMany.mock.calls[0][0].where).toEqual({ carrierId: USER });
    expect(mockPrisma.loadBid.count.mock.calls[0][0].where).toEqual({ carrierId: USER });
    expect(mockPrisma.waterfallPosition.count.mock.calls[0][0].where).toEqual({ carrierId: USER });
    expect(mockPrisma.waterfallPosition.findMany.mock.calls[0][0].where).toEqual({ carrierId: USER, status: { in: ["queued", "tendered"] } });
    expect(mockPrisma.fallOffEvent.count.mock.calls[0][0].where).toEqual({ originalCarrierId: USER });
    const payWheres = mockPrisma.carrierPay.count.mock.calls.map((x: any) => x[0].where);
    expect(payWheres[0]).toEqual({ carrierId: USER });
    expect(payWheres[1]).toEqual({ carrierId: USER, status: { notIn: ["PAID", "VOID"] } });
  });

  it("tenders, agreements, documents, matches, info requests, overrides, drivers: the PROFILE id", async () => {
    await censusCarrierReferences(PROFILE, USER);
    expect(mockPrisma.loadTender.count.mock.calls[0][0].where).toEqual({ carrierId: PROFILE });
    // The binding tenders are READ, not counted, because the split (withdraw vs
    // hold) needs each one's state and the load it sits on.
    expect(mockPrisma.loadTender.findMany.mock.calls[0][0].where).toEqual({ carrierId: PROFILE, deletedAt: null, status: { in: BINDING_TENDER_STATES } });
    expect([...BINDING_TENDER_STATES].sort()).toEqual(["ACCEPTED", "CONFIRMED", "COUNTERED", "OFFERED", "RC_SENT"]);
    expect(mockPrisma.carrierAgreement.count.mock.calls[0][0].where).toEqual({ carrierId: PROFILE });
    expect(mockPrisma.document.count.mock.calls[0][0].where).toEqual({ entityType: "CARRIER", entityId: PROFILE });
    expect(mockPrisma.chameleonMatch.count.mock.calls[0][0].where).toEqual({ OR: [{ carrierId: PROFILE }, { matchedCarrierId: PROFILE }] });
    expect(mockPrisma.infoRequest.count.mock.calls[0][0].where).toEqual({ carrierId: PROFILE });
    expect(mockPrisma.complianceOverride.count.mock.calls[0][0].where).toEqual({ carrierId: PROFILE });
    expect(mockPrisma.driver.count.mock.calls[0][0].where).toEqual({ carrierProfileId: PROFILE });
    expect(mockPrisma.quickPayEnrollment.count.mock.calls[0][0].where).toEqual({ carrierProfileId: PROFILE });
  });

  it("settlements, disputes, EDI and exception alerts: writer does not say, so BOTH ids (over-refuse, never under)", async () => {
    await censusCarrierReferences(PROFILE, USER);
    for (const m of ["settlement", "paymentDispute", "eDITransaction", "exceptionAlert"]) {
      expect(mockPrisma[m].count.mock.calls[0][0].where, m).toEqual({ carrierId: { in: [USER, PROFILE] } });
    }
  });

  it("every class reaches the total (vacuity tripwire over the count models)", async () => {
    for (const m of COUNT_MODELS) mockPrisma[m].count.mockResolvedValue(1);
    mockPrisma.load.findMany.mockResolvedValue([{ id: "a", loadNumber: "SRL-1", referenceNumber: "1", status: "COMPLETED" }]);
    mockPrisma.loadTender.findMany.mockResolvedValue([{ id: "t1", status: "OFFERED", load: null }]);
    const c = await censusCarrierReferences(PROFILE, USER);
    // 19 count models are 19 classes (the unpaid call is a qualifier on carrierPay; liveTenders is the
    // binding read on loadTender), plus the one load = 20.
    expect(carrierReferenceTotal(c)).toBe(20);
    expect(c.liveTenders).toBe(1);
    expect(c.unpaidCarrierPays).toBe(1);
  });

  it("splits the binding tenders: OFFERED/COUNTERED are withdrawable, holds carry their load, settled ones are not read at all", async () => {
    mockPrisma.loadTender.findMany.mockResolvedValue([
      { id: "t-off", status: "OFFERED", load: { id: "l5", loadNumber: null, referenceNumber: "5", status: "POSTED", deletedAt: null } },
      { id: "t-ctr", status: "COUNTERED", load: { id: "l6", loadNumber: "SRL-6", referenceNumber: "6", status: "TENDERED", deletedAt: null } },
      { id: "t-conf", status: "CONFIRMED", load: { id: "l7", loadNumber: "SRL-7", referenceNumber: "7", status: "DISPATCHED", deletedAt: null } },
      { id: "t-acc", status: "ACCEPTED", load: { id: "l8", loadNumber: "SRL-8", referenceNumber: "8", status: "COMPLETED", deletedAt: null } },
    ]);
    const c = await censusCarrierReferences(PROFILE, USER);
    expect(c.liveTenders).toBe(4);
    expect(c.withdrawableTenderIds).toEqual(["t-off", "t-ctr"]);
    expect(c.holdingTenders.map((h) => [h.id, h.status, h.load.status])).toEqual([["t-conf", "CONFIRMED", "DISPATCHED"], ["t-acc", "ACCEPTED", "COMPLETED"]]);
  });

  it("reads the open cascade positions with the load each cascade is for", async () => {
    mockPrisma.waterfallPosition.findMany.mockResolvedValue([
      { id: "p1", waterfallId: "wf1", position: 3, status: "queued", waterfall: { loadId: "l-a" } },
      { id: "p2", waterfallId: "wf2", position: 1, status: "tendered", waterfall: { loadId: "l-b" } },
    ]);
    const c = await censusCarrierReferences(PROFILE, USER);
    expect(c.openWaterfallPositions).toEqual([
      { id: "p1", waterfallId: "wf1", loadId: "l-a", position: 3, status: "queued" },
      { id: "p2", waterfallId: "wf2", loadId: "l-b", position: 1, status: "tendered" },
    ]);
  });
});

describe("inFlightBlockers — the two signals, deduplicated, history excluded", () => {
  it("names an assigned in-flight load once even when a hold sits on the same load, and adds a hold-only load as committed_tender", () => {
    const c: CarrierReferenceCensus = {
      ...EMPTY,
      loads: [loadRef("l1", "1", "BOOKED", true), loadRef("l2", "2", "COMPLETED", false)],
      holdingTenders: [
        holdingRef("t1", "CONFIRMED", { id: "l1", ref: "1", status: "BOOKED" }),
        holdingRef("t2", "RC_SENT", { id: "l3", ref: "3", status: "DELIVERED" }),
      ],
    };
    expect(inFlightBlockers(c)).toEqual([
      expect.objectContaining({ id: "l1", via: "assignment", status: "BOOKED" }),
      expect.objectContaining({ id: "l3", via: "committed_tender", status: "DELIVERED" }),
    ]);
  });

  it("a hold on a terminal or soft-deleted load is history, and a census with no in-flight signal blocks nothing", () => {
    const c: CarrierReferenceCensus = {
      ...EMPTY,
      loads: [loadRef("l2", "2", "POD_RECEIVED", false)],
      holdingTenders: [
        holdingRef("t1", "CONFIRMED", { id: "l4", ref: "4", status: "COMPLETED" }),
        holdingRef("t2", "ACCEPTED", { id: "l5", ref: "5", status: "DISPATCHED", deletedAt: new Date() }),
      ],
      agreements: 3, unpaidCarrierPays: 2, disputes: 1, withdrawableTenderIds: ["t-open"],
    };
    expect(inFlightBlockers(c)).toEqual([]);
  });
});

/**
 * Every class gets its OWN count, so each census field is asserted against the
 * query that must feed it. Removing one class from the census, or wiring a
 * field to another class's query, changes exactly the fields it touches and
 * the failure names them — a total-only assertion is satisfied by any census
 * that happens to add up.
 */
describe("every class is counted by its own query (per-class distinct values)", () => {
  const DISTINCT: Record<string, number> = {
    loadTender: 2, loadBid: 3, waterfallPosition: 4, carrierPay: 5, settlement: 6, paymentDispute: 7,
    carrierAgreement: 8, document: 9, driver: 10, fallOffEvent: 11, chameleonMatch: 12, infoRequest: 13,
    complianceOverride: 14, fraudReport: 15, quickPayEnrollment: 16, routingGuideEntry: 17, dockSchedule: 18,
    eDITransaction: 19, exceptionAlert: 20,
  };

  it("each field carries its own model's count and nothing else's", async () => {
    vi.clearAllMocks();
    for (const [m, n] of Object.entries(DISTINCT)) mockPrisma[m].count.mockResolvedValue(n);
    // carrierPay is counted twice (all / unpaid): make the second call distinct too.
    mockPrisma.carrierPay.count.mockResolvedValueOnce(5).mockResolvedValueOnce(50);
    mockPrisma.load.findMany.mockResolvedValue([{ id: "a", loadNumber: "SRL-1", referenceNumber: "1", status: "COMPLETED" }]);
    mockPrisma.loadTender.findMany.mockResolvedValue([]);
    mockPrisma.waterfallPosition.findMany.mockResolvedValue([]);
    const c = await censusCarrierReferences(PROFILE, USER);
    expect({
      loads: c.loads.length, tenders: c.tenders, bids: c.bids, waterfallPositions: c.waterfallPositions,
      carrierPays: c.carrierPays, unpaidCarrierPays: c.unpaidCarrierPays, settlements: c.settlements,
      disputes: c.disputes, agreements: c.agreements, documents: c.documents, drivers: c.drivers,
      fallOffs: c.fallOffs, chameleonMatches: c.chameleonMatches, infoRequests: c.infoRequests,
      overrides: c.overrides, fraudReports: c.fraudReports, quickPayEnrollments: c.quickPayEnrollments,
      routingGuideEntries: c.routingGuideEntries, dockSchedules: c.dockSchedules,
      ediTransactions: c.ediTransactions, exceptionAlerts: c.exceptionAlerts,
    }).toEqual({
      loads: 1, tenders: 2, bids: 3, waterfallPositions: 4, carrierPays: 5, unpaidCarrierPays: 50, settlements: 6,
      disputes: 7, agreements: 8, documents: 9, drivers: 10, fallOffs: 11, chameleonMatches: 12, infoRequests: 13,
      overrides: 14, fraudReports: 15, quickPayEnrollments: 16, routingGuideEntries: 17, dockSchedules: 18,
      ediTransactions: 19, exceptionAlerts: 20,
    });
    // And every count model was actually asked (a field carrying a hardcoded number would pass the map above).
    for (const m of Object.keys(DISTINCT)) expect(mockPrisma[m].count, m).toHaveBeenCalled();
  });
});
