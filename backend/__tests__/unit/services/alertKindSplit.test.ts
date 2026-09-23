/**
 * R3/R4 — a customer hears about a DELAY, never about our own silence.
 *
 * SRL-121494 had four check calls, all inside 24 seconds on 2026-09-22 and all
 * with null location, and nothing after. The alert engine read that absence as
 * a CRITICAL delay and sent six of them to logistics@beekeepersnaturals.com in
 * fourteen hours, each with a larger hour count than the last. Nothing about
 * the freight was known to be wrong. What was true is that nobody had filed a
 * located report — a gap in OUR data, and not a claim we can put to a customer.
 */
import { describe, it, expect } from "vitest";
import {
  assessAlertLevel,
  hasLocatedReport,
  NO_DATA_LOOKBACK_HOURS,
} from "../../../src/services/trackTraceAlertEngine";

const hoursAgo = (h: number) => new Date(Date.now() - h * 3600_000);

describe("R4 — the two kinds are distinguishable", () => {
  it("silence is NO_TRACKING_DATA, not a delay", () => {
    const a = assessAlertLevel(null, null, null, hoursAgo(39), "IN_TRANSIT");
    expect(a.kind).toBe("NO_TRACKING_DATA");
  });

  it("its reason carries NO hour count, so it cannot escalate", () => {
    const at33 = assessAlertLevel(null, null, null, hoursAgo(33), "IN_TRANSIT");
    const at39 = assessAlertLevel(null, null, null, hoursAgo(39), "IN_TRANSIT");
    expect(at33.reason).toBe(at39.reason);
    expect(at39.reason).not.toMatch(/\d+\s*h/);
  });

  it("a real ETA overrun is LATE", () => {
    const appt = hoursAgo(5);
    const a = assessAlertLevel(new Date(), appt, "08:00", new Date(), "IN_TRANSIT");
    expect(a.level).not.toBe("GREEN");
    expect(a.kind).toBe("LATE");
  });
});

describe("R3 — located evidence is what lets a customer be told", () => {
  it("a check call with no location cannot place the freight", () => {
    expect(
      hasLocatedReport(
        { location: null, city: null, state: null, createdAt: hoursAgo(1) },
        null,
        NO_DATA_LOOKBACK_HOURS,
      ),
    ).toBe(false);
  });

  it("THE SRL-121494 SHAPE — four null-location check calls, none of them evidence", () => {
    const calls = [0.01, 0.02, 0.03, 0.04].map((h) => ({
      location: null, city: null, state: null, createdAt: hoursAgo(h),
    }));
    for (const c of calls) {
      expect(hasLocatedReport(c, null, NO_DATA_LOOKBACK_HOURS)).toBe(false);
    }
  });

  it("a city is enough; so is a bare location string", () => {
    expect(hasLocatedReport({ city: "Toledo", state: "OH", createdAt: hoursAgo(1) }, null, 6)).toBe(true);
    expect(hasLocatedReport({ location: "I-80 MM 210", createdAt: hoursAgo(1) }, null, 6)).toBe(true);
  });

  it("a located report older than the lookback is stale, not evidence", () => {
    expect(hasLocatedReport({ city: "Toledo", createdAt: hoursAgo(20) }, null, 6)).toBe(false);
  });

  it("a telematics event inside the lookback counts on its own", () => {
    expect(hasLocatedReport(null, { createdAt: hoursAgo(1) }, 6)).toBe(true);
  });

  it("nothing at all is not evidence", () => {
    expect(hasLocatedReport(null, null, 6)).toBe(false);
  });
});

describe("the customer gate is wired to both facts, not one", () => {
  it("the scanner requires kind !== NO_TRACKING_DATA AND a located report", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../src/services/trackTraceAlertEngine.ts"),
      "utf8",
    );
    expect(src).toContain('alert.kind !== "NO_TRACKING_DATA" && located');
    // vacuity: the send it guards is still here
    expect(src).toContain("sendShipperDelayNotification(load, alert, lastDelivery)");
    expect(src).toContain("if (tellCustomer) await sendShipperDelayNotification");
  });

  it("NO_TRACKING_DATA is capped at 12h while LATE stays at 30 minutes", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../src/services/trackTraceAlertEngine.ts"),
      "utf8",
    );
    expect(src).toContain('alert.kind === "NO_TRACKING_DATA" ? 12 * 60 * 60 * 1000 : 30 * 60 * 1000');
  });
});
