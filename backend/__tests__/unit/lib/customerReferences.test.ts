/**
 * Customer references — the rule that decides whether a customer row may be
 * deleted (lifecycle-gaps B5a, decision 4 of 2026-09-18).
 *
 * "Open" is read from the state machine, never from a local list, so the
 * Cancel button, the status endpoint and this census cannot disagree about
 * which loads an AE can still cancel.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import {
  censusCustomerReferences,
  describeReferences,
  isCancellableStatus,
  referenceTotal,
  type CustomerReferenceCensus,
} from "../../../src/lib/customerReferences";
import { getAllowedNextStatuses } from "../../../src/lib/loadStateMachine";
import type { LoadStatus } from "@prisma/client";

const mockPrisma = vi.mocked(prisma) as any;

const EMPTY: CustomerReferenceCensus = {
  loads: [],
  invoices: 0,
  shipments: 0,
  orders: 0,
  contractRates: 0,
  facilities: 0,
  contacts: 0,
  rfpBids: 0,
  routingGuides: 0,
  exceptionAlerts: 0,
  activeSequences: 0,
  shipperUser: null,
};

describe("isCancellableStatus reads the AE map", () => {
  it("open: the statuses the AE map lets an AE cancel from", () => {
    for (const s of ["POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED", "AT_PICKUP"]) {
      expect(isCancellableStatus(s), s).toBe(true);
    }
  });

  it("history: LOADED onward, and the terminal states, are not cancellable (decision 1)", () => {
    for (const s of ["LOADED", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED", "CANCELLED", "TONU"]) {
      expect(isCancellableStatus(s), s).toBe(false);
    }
  });

  it("agrees with the AE map for every status (vacuity tripwire on the status list)", () => {
    const ALL: LoadStatus[] = ["DRAFT", "PLANNED", "POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED", "AT_PICKUP", "LOADED", "PICKED_UP", "IN_TRANSIT", "AT_DELIVERY", "DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED", "TONU", "CANCELLED"];
    let open = 0;
    for (const from of ALL) {
      const expected = getAllowedNextStatuses(from, "AE").includes("CANCELLED");
      if (expected) open++;
      expect(isCancellableStatus(from), from).toBe(expected);
    }
    expect(open, "tripwire: the AE map allows cancelling from somewhere").toBeGreaterThanOrEqual(6);
  });
});

describe("referenceTotal + describeReferences", () => {
  it("an empty census totals zero and describes nothing", () => {
    expect(referenceTotal(EMPTY)).toBe(0);
    expect(describeReferences(EMPTY)).toBe("");
  });

  it("every class counts, and a shipper login counts as one", () => {
    const c: CustomerReferenceCensus = {
      ...EMPTY,
      loads: [{ id: "a", referenceNumber: "SRL-1", status: "COMPLETED", cancellable: false }],
      invoices: 2,
      shipments: 1,
      orders: 1,
      contractRates: 1,
      facilities: 1,
      contacts: 3,
      rfpBids: 1,
      routingGuides: 1,
      exceptionAlerts: 1,
      activeSequences: 1,
      shipperUser: { id: "u", email: "ap@example.com" },
    };
    expect(referenceTotal(c)).toBe(1 + 2 + 1 + 1 + 1 + 1 + 3 + 1 + 1 + 1 + 1 + 1);
  });

  it("names open and history loads separately, then the rest in acting order", () => {
    const c: CustomerReferenceCensus = {
      ...EMPTY,
      loads: [
        { id: "a", referenceNumber: "SRL-1", status: "BOOKED", cancellable: true },
        { id: "b", referenceNumber: "SRL-2", status: "COMPLETED", cancellable: false },
        { id: "c", referenceNumber: "SRL-3", status: "CANCELLED", cancellable: false },
      ],
      contacts: 1,
      activeSequences: 2,
      shipperUser: { id: "u", email: "ap@example.com" },
    };
    expect(describeReferences(c)).toBe(
      "3 loads (1 open, 2 history), 1 contact, 2 in-flight email sequences, a shipper login (ap@example.com)",
    );
  });
});

describe("censusCustomerReferences", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const m of ["invoice", "shipment", "order", "contractRate", "customerFacility", "customerContact", "rfpBid", "routingGuide", "exceptionAlert", "emailSequence"]) {
      mockPrisma[m].count.mockResolvedValue(0);
    }
    mockPrisma.load.findMany.mockResolvedValue([]);
    mockPrisma.customer.findUnique.mockResolvedValue({ user: null });
  });

  it("classifies each load by the state machine and keeps archived loads in the count", async () => {
    mockPrisma.load.findMany.mockResolvedValue([
      { id: "a", referenceNumber: "SRL-10", status: "BOOKED" },
      { id: "b", referenceNumber: "SRL-11", status: "DELIVERED" },
      { id: "c", referenceNumber: "SRL-12", status: "CANCELLED" },
    ]);
    const c = await censusCustomerReferences("cust-1");
    expect(c.loads.map((l) => [l.referenceNumber, l.cancellable])).toEqual([
      ["SRL-10", true],
      ["SRL-11", false],
      ["SRL-12", false],
    ]);
    // The load query does not filter deletedAt: an archived load still points at the customer.
    const where = mockPrisma.load.findMany.mock.calls[0][0].where;
    expect(where).toEqual({ customerId: "cust-1" });
  });

  it("counts invoices through the load, and sequences only while in flight", async () => {
    mockPrisma.invoice.count.mockResolvedValue(2);
    mockPrisma.emailSequence.count.mockResolvedValue(1);
    const c = await censusCustomerReferences("cust-1");
    expect(c.invoices).toBe(2);
    expect(c.activeSequences).toBe(1);
    expect(mockPrisma.invoice.count.mock.calls[0][0].where).toEqual({ load: { customerId: "cust-1" } });
    expect(mockPrisma.emailSequence.count.mock.calls[0][0].where).toEqual({
      prospectId: "cust-1",
      status: { in: ["ACTIVE", "PAUSED"] },
    });
  });

  it("a shipper login is a reference", async () => {
    mockPrisma.customer.findUnique.mockResolvedValue({ user: { id: "u-1", email: "ap@example.com" } });
    const c = await censusCustomerReferences("cust-1");
    expect(c.shipperUser).toEqual({ id: "u-1", email: "ap@example.com" });
    expect(referenceTotal(c)).toBe(1);
  });
});
