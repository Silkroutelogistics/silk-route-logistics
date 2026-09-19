/**
 * Carrier references — the rule that decides whether a carrier row may be
 * archived (lifecycle-gaps B5b; the B5a customer rule, decision 4 of
 * 2026-09-18, applied to carriers).
 *
 * The id-semantics cases are the load-bearing ones: this codebase has shipped
 * a User id into a CarrierProfile lookup before (§13.3 Item 222.4) and the
 * census reads both kinds. Each class is asserted against the id it must use.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import {
  censusCarrierReferences,
  carrierReferenceTotal,
  describeCarrierReferences,
  type CarrierReferenceCensus,
} from "../../../src/lib/carrierReferences";

const mockPrisma = vi.mocked(prisma) as any;
const PROFILE = "cp-1", USER = "u-1";

const EMPTY: CarrierReferenceCensus = {
  loads: [], tenders: 0, liveTenders: 0, bids: 0, waterfallPositions: 0, carrierPays: 0, unpaidCarrierPays: 0,
  settlements: 0, disputes: 0, agreements: 0, documents: 0, drivers: 0, fallOffs: 0, chameleonMatches: 0,
  infoRequests: 0, overrides: 0, fraudReports: 0, quickPayEnrollments: 0, routingGuideEntries: 0, dockSchedules: 0,
  ediTransactions: 0, exceptionAlerts: 0,
};

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
      loads: [
        { id: "a", referenceNumber: "SRL-1", status: "IN_TRANSIT", inFlight: true },
        { id: "b", referenceNumber: "SRL-2", status: "COMPLETED", inFlight: false },
      ],
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
  });

  it("loads, bids, waterfall positions, payables, fall-offs: the USER id", async () => {
    mockPrisma.load.findMany.mockResolvedValue([
      { id: "a", referenceNumber: "SRL-10", status: "DISPATCHED" },
      { id: "b", referenceNumber: "SRL-11", status: "TONU" },
    ]);
    const c = await censusCarrierReferences(PROFILE, USER);
    expect(c.loads.map((l) => [l.referenceNumber, l.inFlight])).toEqual([["SRL-10", true], ["SRL-11", false]]);
    expect(mockPrisma.load.findMany.mock.calls[0][0].where).toEqual({ carrierId: USER });
    expect(mockPrisma.loadBid.count.mock.calls[0][0].where).toEqual({ carrierId: USER });
    expect(mockPrisma.waterfallPosition.count.mock.calls[0][0].where).toEqual({ carrierId: USER });
    expect(mockPrisma.fallOffEvent.count.mock.calls[0][0].where).toEqual({ originalCarrierId: USER });
    const payWheres = mockPrisma.carrierPay.count.mock.calls.map((x: any) => x[0].where);
    expect(payWheres[0]).toEqual({ carrierId: USER });
    expect(payWheres[1]).toEqual({ carrierId: USER, status: { notIn: ["PAID", "VOID"] } });
  });

  it("tenders, agreements, documents, matches, info requests, overrides, drivers: the PROFILE id", async () => {
    await censusCarrierReferences(PROFILE, USER);
    expect(mockPrisma.loadTender.count.mock.calls[0][0].where).toEqual({ carrierId: PROFILE });
    expect(mockPrisma.loadTender.count.mock.calls[1][0].where).toEqual({ carrierId: PROFILE, status: { in: ["OFFERED", "COUNTERED", "ACCEPTED", "RC_SENT", "CONFIRMED"] } });
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
    mockPrisma.load.findMany.mockResolvedValue([{ id: "a", referenceNumber: "SRL-1", status: "COMPLETED" }]);
    const c = await censusCarrierReferences(PROFILE, USER);
    // 19 count models are 19 classes (the live/unpaid calls are qualifiers on the same two models),
    // plus the one load = 20.
    expect(carrierReferenceTotal(c)).toBe(20);
    expect(c.liveTenders).toBe(1);
    expect(c.unpaidCarrierPays).toBe(1);
  });
});
