/**
 * A geofence row carries the source of the POSITION that tripped it.
 *
 * checkGeofence accepted a `source` argument and ignored it: every row it
 * wrote hardcoded locationSource GEOFENCE, so a driver's one-tap portal share
 * (Arc 19, CARRIER_PORTAL) arrived on the load timeline labelled as if a
 * telematics device had produced it, and the tracking factor could not tell
 * the two apart. The eventType already says GEOFENCE; locationSource now
 * says where the fix came from.
 *
 * Phase 0 of the mandatory-ELD arc.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import * as fs from "fs";
import * as path from "path";

vi.mock("../../../src/config/database", () => ({
  prisma: {
    load: { findUnique: vi.fn(), update: vi.fn() },
    loadStop: { update: vi.fn() },
    geofenceEvent: { create: vi.fn() },
    detentionRecord: { create: vi.fn() },
    loadTrackingEvent: { create: vi.fn() },
  },
}));
vi.mock("../../../src/routes/trackTraceSSE", () => ({ broadcastSSE: vi.fn() }));
vi.mock("../../../src/routes/loadTracking", () => ({
  DETENTION_FREE_MINUTES: 120,
  DETENTION_RATE_PER_HOUR: 50,
  detentionCharge: vi.fn().mockReturnValue(0),
}));

import { prisma } from "../../../src/config/database";
import { checkGeofence, asLocationSource } from "../../../src/services/geofenceService";

const db = prisma as unknown as {
  load: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  loadTrackingEvent: { create: ReturnType<typeof vi.fn> };
};

// A dispatched load with one pickup stop the ping lands directly on.
const LOAD = {
  id: "L1",
  status: "DISPATCHED",
  loadStops: [
    {
      id: "S1", stopNumber: 1, stopType: "PICKUP",
      latitude: 41.5, longitude: -87.5,
      actualArrival: null, actualDeparture: null,
      facilityName: "Dock A", city: "Gary", state: "IN",
    },
  ],
};

function writtenSources(): string[] {
  return db.loadTrackingEvent.create.mock.calls.map((c) => c[0].data.locationSource);
}

describe("checkGeofence records the position's source", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    db.load.findUnique.mockResolvedValue(LOAD);
  });

  it("a driver's portal share is recorded as CARRIER_PORTAL on both rows", async () => {
    const events = await checkGeofence("L1", 41.5, -87.5, "CARRIER_PORTAL");
    expect(events).toHaveLength(1);
    // Arrival auto-advance writes STATUS_CHANGE, then the GEOFENCE entry row.
    expect(db.loadTrackingEvent.create).toHaveBeenCalledTimes(2);
    expect(writtenSources()).toEqual(["CARRIER_PORTAL", "CARRIER_PORTAL"]);
    const types = db.loadTrackingEvent.create.mock.calls.map((c) => c[0].data.eventType);
    expect(types).toEqual(["STATUS_CHANGE", "GEOFENCE"]);
  });

  it("an ELD ping is recorded as ELD", async () => {
    await checkGeofence("L1", 41.5, -87.5, "ELD");
    expect(writtenSources()).toEqual(["ELD", "ELD"]);
  });

  it("the default is ELD, matching every telematics caller", async () => {
    await checkGeofence("L1", 41.5, -87.5);
    expect(writtenSources()).toEqual(["ELD", "ELD"]);
  });

  it("a ping outside the radius writes nothing", async () => {
    await checkGeofence("L1", 42.5, -87.5, "CARRIER_PORTAL");
    expect(db.loadTrackingEvent.create).not.toHaveBeenCalled();
  });
});

describe("asLocationSource narrows untrusted input", () => {
  it("passes a real enum member through", () => {
    expect(asLocationSource("CARRIER_PORTAL")).toBe("CARRIER_PORTAL");
    expect(asLocationSource("CHECK_CALL_EMAIL")).toBe("CHECK_CALL_EMAIL");
  });
  it("falls back to ELD for anything else, including null and a body string", () => {
    expect(asLocationSource(null)).toBe("ELD");
    expect(asLocationSource(undefined)).toBe("ELD");
    expect(asLocationSource("eld")).toBe("ELD");
    expect(asLocationSource("DROP TABLE")).toBe("ELD");
    expect(asLocationSource(7)).toBe("ELD");
  });
});

describe("no writer hardcodes the source any more", () => {
  const src = fs.readFileSync(path.join(__dirname, "../../../src/services/geofenceService.ts"), "utf8");
  const eld = fs.readFileSync(path.join(__dirname, "../../../src/routes/eld.ts"), "utf8");

  it("geofenceService writes the argument, never the literal", () => {
    expect(src).not.toContain('locationSource: "GEOFENCE"');
    // Vacuity tripwire: the writes are still there to be checked.
    expect(src.split("locationSource: source").length - 1).toBeGreaterThanOrEqual(2);
  });

  it("the ELD webhook narrows the body value before it reaches a row", () => {
    expect(eld).toContain("asLocationSource(source)");
  });
});
