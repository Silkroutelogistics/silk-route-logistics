/**
 * The tracking factor is null until something measures it, and the two places
 * that used to write a number nobody measured no longer do.
 *
 * WHY THE SOURCE ASSERTIONS. The seed at approval wrote gpsCompliancePct: 80
 * and the weekly recalc wrote a constant 100 for every carrier without
 * eldEnabled, which nothing has ever set. Both were invisible to any unit test
 * of the composite, because the composite was fed a number and did its job.
 * The defect lived in the CALLERS, so the guard reads the callers.
 *
 * Phase 0 of the mandatory-ELD arc.
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";
import {
  resolveTrackingFactor,
  persistedTrackingPct,
  UNMEASURED_TRACKING_PCT,
} from "../../../src/lib/trackingFactor";

const INTEGRATION = path.join(__dirname, "../../../src/services/integrationService.ts");

describe("resolveTrackingFactor", () => {
  it("is null when no location source exists, whatever the loads say", () => {
    expect(resolveTrackingFactor({ eldEnabled: false, trackedLoads: 0, totalLoads: 0 })).toBeNull();
    expect(resolveTrackingFactor({ eldEnabled: false, trackedLoads: 9, totalLoads: 9 })).toBeNull();
  });

  it("is 100 for a connected carrier with no loads in the window", () => {
    expect(resolveTrackingFactor({ eldEnabled: true, trackedLoads: 0, totalLoads: 0 })).toBe(100);
  });

  it("measures coverage for a connected carrier", () => {
    expect(resolveTrackingFactor({ eldEnabled: true, trackedLoads: 2, totalLoads: 4 })).toBe(50);
    expect(resolveTrackingFactor({ eldEnabled: true, trackedLoads: 0, totalLoads: 4 })).toBe(0);
  });
});

describe("persistedTrackingPct", () => {
  it("writes the unmeasured sentinel for null and the value otherwise", () => {
    expect(UNMEASURED_TRACKING_PCT).toBe(0);
    expect(persistedTrackingPct(null)).toBe(UNMEASURED_TRACKING_PCT);
    expect(persistedTrackingPct(37.5)).toBe(37.5);
  });
});

describe("the two writers that used to assert a measurement", () => {
  const src = fs.readFileSync(INTEGRATION, "utf8").replace(/\r\n/g, "\n");

  function fnBody(name: string): string {
    const start = src.indexOf(`export async function ${name}(`);
    expect(start, `${name} not found in integrationService.ts`).toBeGreaterThan(-1);
    const next = src.indexOf("\nexport ", start + 1);
    return src.slice(start, next === -1 ? src.length : next);
  }

  it("the approval seed no longer writes gpsCompliancePct", () => {
    const body = fnBody("onCarrierApproved");
    // Vacuity tripwire: the seed is still there to be checked.
    expect(body).toContain("carrierScorecard.create(");
    expect(body).not.toMatch(/gpsCompliancePct:\s*\d/);
  });

  it("the weekly recalc resolves the factor and persists the sentinel", () => {
    const body = fnBody("recalculateCarrierCPP");
    expect(body).toContain("resolveTrackingFactor(");
    expect(body).toContain("persistedTrackingPct(");
    expect(body).not.toContain("let gpsCompliancePct = 100");
  });
});
