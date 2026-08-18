/**
 * v3.8.asd — SRL self-authority monitor.
 *
 * Covers the pure decision core (evaluateCriticalState). The surrounding
 * function is I/O — FMCSA fetch, SystemLog read/write, Resend send — and is
 * exercised in production by the daily cron; the value in a unit test is the
 * severity logic, because that is what decides whether compliance@ gets woken
 * up and whether the alert channel stays trustworthy.
 */

import { describe, it, expect } from "vitest";
import { evaluateCriticalState } from "../../../src/services/selfAuthorityMonitorService";

/** A clean, fully-authorized broker record — the expected steady state. */
function healthySnapshot() {
  return {
    verified: true,
    legalName: "SILK ROUTE LOGISTICS INC",
    mcNumber: "1794414",
    operatingStatus: "AUTHORIZED FOR Property",
    entityType: "BROKER",
    insuranceOnFile: true,
    outOfServiceDate: null,
    mcs150Outdated: false,
    phyStreet: "2317 S 35TH ST",
    phyCity: "GALESBURG",
    phyState: "MI",
    phyZipcode: "49053",
    phone: "(269) 220-6760",
  };
}

describe("evaluateCriticalState", () => {
  it("reports nothing on a clean, authorized record", () => {
    expect(evaluateCriticalState(healthySnapshot(), [])).toEqual([]);
  });

  it("raises CRITICAL when financial security is off file (BMC-84 lapse)", () => {
    const findings = evaluateCriticalState({ ...healthySnapshot(), insuranceOnFile: false }, []);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("CRITICAL");
    // The 7-day replenishment clock is the actionable fact; keep it in the copy.
    expect(findings[0].message).toContain("7 calendar days");
  });

  it("raises CRITICAL when operating status is not active", () => {
    const findings = evaluateCriticalState(
      { ...healthySnapshot(), operatingStatus: "NOT AUTHORIZED" },
      [],
    );
    expect(findings.some((f) => f.severity === "CRITICAL")).toBe(true);
  });

  it("accepts ACTIVE as well as AUTHORIZED without raising a finding", () => {
    expect(evaluateCriticalState({ ...healthySnapshot(), operatingStatus: "ACTIVE" }, [])).toEqual([]);
  });

  it("raises CRITICAL on an out-of-service date", () => {
    const findings = evaluateCriticalState(
      { ...healthySnapshot(), outOfServiceDate: "2026-08-01" },
      [],
    );
    expect(findings.some((f) => f.severity === "CRITICAL")).toBe(true);
    expect(findings.some((f) => f.message.includes("2026-08-01"))).toBe(true);
  });

  it("treats an outdated MCS-150 as WARNING, not CRITICAL", () => {
    const findings = evaluateCriticalState({ ...healthySnapshot(), mcs150Outdated: true }, []);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("WARNING");
  });

  // The false-positive guard. An unreachable FMCSA must not be reported as a
  // deactivated USDOT number, or a QCMobile outage emails compliance@ with an
  // emergency that isn't happening and the channel stops being believed.
  it("downgrades an unverified result to WARNING when the lookup itself errored", () => {
    const findings = evaluateCriticalState({ ...healthySnapshot(), verified: false }, [
      "FMCSA request timed out",
    ]);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("WARNING");
    expect(findings[0].message).toContain("did not complete");
  });

  it("keeps CRITICAL when the record is unverified but the lookup was clean", () => {
    const findings = evaluateCriticalState({ ...healthySnapshot(), verified: false }, []);
    expect(findings).toHaveLength(1);
    expect(findings[0].severity).toBe("CRITICAL");
    expect(findings[0].message).toContain("deactivated");
  });

  it("reports every failing condition at once rather than short-circuiting", () => {
    const findings = evaluateCriticalState(
      {
        ...healthySnapshot(),
        operatingStatus: "REVOKED",
        insuranceOnFile: false,
        outOfServiceDate: "2026-08-01",
        mcs150Outdated: true,
      },
      [],
    );
    expect(findings.filter((f) => f.severity === "CRITICAL")).toHaveLength(3);
    expect(findings.filter((f) => f.severity === "WARNING")).toHaveLength(1);
  });
});
