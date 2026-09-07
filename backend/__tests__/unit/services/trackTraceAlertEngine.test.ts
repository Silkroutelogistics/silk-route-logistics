/**
 * The CRITICAL no-update rule cannot reset itself.
 *
 * runAlertScanner reads each active load's latest tracking event as "when did
 * we last hear anything", and it also WRITES tracking events: an ALERT row
 * when it fires, a TEMPERATURE row in the reefer pass. With no eventType
 * filter, the ALERT it wrote at six hours became the newest event, and the
 * next scan read a thirty-minute-old update and went quiet. A load nobody had
 * heard from for a day produced one CRITICAL, then silence.
 *
 * The database does the filtering, so this test's load mock applies the
 * include's where clause to the fixture the way Postgres would. Take the
 * clause out of the query and the ALERT row is first again, which is the
 * defect.
 *
 * Phase 0 of the mandatory-ELD arc.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/config/database", () => ({
  prisma: {
    load: { findMany: vi.fn() },
    loadTrackingEvent: { findFirst: vi.fn(), create: vi.fn() },
    checkCallSchedule: { updateMany: vi.fn() },
    loadStop: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("../../../src/services/shipperNotificationService", () => ({ sendShipperDelayNotification: vi.fn() }));
vi.mock("../../../src/services/notificationService", () => ({ createNotification: vi.fn() }));
vi.mock("../../../src/routes/trackTraceSSE", () => ({ broadcastSSE: vi.fn() }));
vi.mock("../../../src/lib/detentionLayover", () => ({
  applyStopDwellCharges: vi.fn(),
  LAYOVER_RATE_PER_DAY: 250,
  DETENTION_CAP_PER_STOP: 250,
}));

import { prisma } from "../../../src/config/database";
import { runAlertScanner, assessAlertLevel } from "../../../src/services/trackTraceAlertEngine";

const db = prisma as unknown as {
  load: { findMany: ReturnType<typeof vi.fn> };
  loadTrackingEvent: { findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
};

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);
const daysAhead = (d: number) => new Date(Date.now() + d * 86400_000);

/** The rows this load would have in the table, newest first. */
type Row = { eventType: string; createdAt: Date; latitude?: number; longitude?: number };

/**
 * Serve a load the way Postgres would: honour `include.trackingEvents.where`
 * (only `eventType.notIn` is modelled, which is the clause under test) and
 * `take`. A mock that returned the fixture verbatim would pass with the
 * filter deleted, which is the vacuous pass this file exists to avoid.
 */
function serveLoad(rows: Row[]) {
  db.load.findMany.mockImplementation(async (args: any) => {
    const inc = args?.include?.trackingEvents ?? {};
    const notIn: string[] = inc.where?.eventType?.notIn ?? [];
    const visible = rows
      .filter((r) => !notIn.includes(r.eventType))
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, inc.take ?? rows.length);
    return [
      {
        id: "L1",
        loadNumber: "SRL-1",
        referenceNumber: "SRL-1",
        status: "IN_TRANSIT",
        posterId: "ae-1",
        deliveryDate: daysAhead(3),
        deliveryTimeStart: null,
        loadStops: [],
        trackingEvents: visible,
        checkCalls: [],
        carrier: { id: "c-1", firstName: "A", lastName: "B", company: "Carrier" },
        customer: { id: "cu-1", name: "Customer" },
      },
    ];
  });
}

describe("assessAlertLevel", () => {
  it("six hours without an update on an in-transit load is CRITICAL", () => {
    const r = assessAlertLevel(null, daysAhead(3), null, hoursAgo(7), "IN_TRANSIT");
    expect(r.level).toBe("CRITICAL");
  });
  it("a recent update with a distant appointment is GREEN", () => {
    const r = assessAlertLevel(null, daysAhead(3), null, hoursAgo(1), "IN_TRANSIT");
    expect(r.level).toBe("GREEN");
  });
});

describe("runAlertScanner", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.loadTrackingEvent.findFirst.mockResolvedValue(null);
    db.loadTrackingEvent.create.mockResolvedValue({});
  });

  it("asks the database for the last update that is not one of its own rows", async () => {
    serveLoad([]);
    await runAlertScanner();
    const inc = db.load.findMany.mock.calls[0][0].include.trackingEvents;
    expect(inc.where.eventType.notIn).toEqual(expect.arrayContaining(["ALERT", "TEMPERATURE"]));
    expect(inc.take).toBe(1);
  });

  it("a status event 7h ago with an ALERT row 1h ago still fires CRITICAL", async () => {
    serveLoad([
      { eventType: "STATUS_CHANGE", createdAt: hoursAgo(7), latitude: 41, longitude: -87 },
      { eventType: "ALERT", createdAt: hoursAgo(1), latitude: 41, longitude: -87 },
    ]);
    await runAlertScanner();
    const written = db.loadTrackingEvent.create.mock.calls.map((c) => c[0].data);
    expect(written).toHaveLength(1);
    expect(written[0]).toMatchObject({ loadId: "L1", eventType: "ALERT", alertLevel: "CRITICAL" });
    expect(written[0].notes).toMatch(/No location update for 7h/);
  });

  it("a TEMPERATURE row from the reefer pass does not count as an update either", async () => {
    serveLoad([
      { eventType: "LOCATION_UPDATE", createdAt: hoursAgo(9) },
      { eventType: "TEMPERATURE", createdAt: hoursAgo(1) },
    ]);
    await runAlertScanner();
    expect(db.loadTrackingEvent.create).toHaveBeenCalledTimes(1);
    expect(db.loadTrackingEvent.create.mock.calls[0][0].data.alertLevel).toBe("CRITICAL");
  });

  it("a carrier update 1h ago on a load with a distant appointment writes nothing", async () => {
    serveLoad([
      { eventType: "LOCATION_UPDATE", createdAt: hoursAgo(1) },
      { eventType: "ALERT", createdAt: hoursAgo(8) },
    ]);
    await runAlertScanner();
    expect(db.loadTrackingEvent.create).not.toHaveBeenCalled();
  });
});
