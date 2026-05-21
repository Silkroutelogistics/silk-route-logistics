// Smoke coverage for `getCarrierAuthority` — v3.8.ahj (Item 182, sprint 1 of 5).
// Covers the three load-bearing behaviors the rest of the epic will assume:
//   1. Happy path — GRANT entry parses out a date + computes positive age in months.
//   2. Empty/no-GRANT path — null grant date + non-empty errors, never throws.
//   3. Multiple GRANTS — earliest wins (the policy anchor).
//
// `fetch` is mocked at the global level rather than calling the live FMCSA
// API per Sub-pattern 11 (CI-parity) — CI doesn't have FMCSA_WEB_KEY, and
// real network calls produce flaky tests + slow runs. The env import is
// also mocked so the function takes the "happy" code path through the
// webKey-present branch regardless of CI environment state.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../../src/lib/logger", () => ({
  log: { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() },
}));

vi.mock("../../../src/config/env", () => ({
  env: { FMCSA_WEB_KEY: "test-webkey" },
}));

// Import AFTER mocks so the service file picks up the mocked env + logger.
import { getCarrierAuthority } from "../../../src/services/fmcsaService";

describe("fmcsaService.getCarrierAuthority — v3.8.ahj smoke", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("returns a grant date and a positive age in months for a carrier with a single GRANT", async () => {
    // GRANT served ~2 years ago — well past the 18-month threshold the
    // eventual gate (v3.8.ahl) will enforce.
    const grant = new Date();
    grant.setFullYear(grant.getFullYear() - 2);
    grant.setDate(1); // first-of-month sidesteps day-adjust edge cases
    const grantIso = grant.toISOString().slice(0, 10);

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          {
            carrierAuthority: {
              docketNumber: "MC-100001",
              authorityType: "COMMON",
              originalAction: "GRANT",
              originalServedDate: grantIso,
              dispositionAction: "GRANT",
              dispositionServedDate: grantIso,
            },
          },
        ],
      }),
    } as Response);

    const result = await getCarrierAuthority("4526880");

    expect(result.dotNumber).toBe("4526880");
    expect(result.authorityGrantDate).toBe(grantIso);
    expect(result.authorityType).toBe("COMMON");
    expect(result.errors).toEqual([]);
    expect(result.rawHistoryCount).toBe(1);
    // ~24 months ± 1 to absorb same-day rollover near month boundaries.
    expect(result.authorityAgeMonths).toBeGreaterThanOrEqual(23);
    expect(result.authorityAgeMonths).toBeLessThanOrEqual(25);
  });

  it("returns null grant date and surfaces an error when no GRANT history exists", async () => {
    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ content: [] }),
    } as Response);

    const result = await getCarrierAuthority("9999991");

    expect(result.authorityGrantDate).toBeNull();
    expect(result.authorityAgeMonths).toBeNull();
    expect(result.authorityType).toBeNull();
    expect(result.rawHistoryCount).toBe(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("picks the earliest GRANT when multiple authority entries are present (COMMON + CONTRACT)", async () => {
    // Two GRANTS, the COMMON one is older. The function must pick it as
    // the canonical anchor — that's the policy-relevant date.
    const olderDate = "2010-03-15";
    const newerDate = "2018-07-22";

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          // Newer entry first to confirm sort works regardless of array order.
          {
            carrierAuthority: {
              docketNumber: "MC-200002",
              authorityType: "CONTRACT",
              originalAction: "GRANT",
              originalServedDate: newerDate,
            },
          },
          {
            carrierAuthority: {
              docketNumber: "MC-200001",
              authorityType: "COMMON",
              originalAction: "GRANT",
              originalServedDate: olderDate,
            },
          },
        ],
      }),
    } as Response);

    const result = await getCarrierAuthority("9999992");

    expect(result.authorityGrantDate).toBe(olderDate);
    expect(result.authorityType).toBe("COMMON");
    expect(result.rawHistoryCount).toBe(2);
    // Mid-2010 → 2026 is well over 15 years; ageMonths should reflect that.
    expect(result.authorityAgeMonths).toBeGreaterThan(180);
  });

  it("ignores REVOCATION / REINSTATEMENT entries — only GRANT actions anchor the date", async () => {
    // Per the reinstatement-continuity caveat documented on the function:
    // the function returns the ORIGINAL grant date, not the reinstatement.
    // This test pins that behavior so future refactors don't accidentally
    // re-anchor on the reinstatement date and surprise the policy gate.
    const grantDate = "2015-01-10";

    globalThis.fetch = vi.fn().mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        content: [
          {
            carrierAuthority: {
              docketNumber: "MC-300003",
              authorityType: "COMMON",
              originalAction: "REVOCATION",
              originalServedDate: "2020-06-01",
            },
          },
          {
            carrierAuthority: {
              docketNumber: "MC-300003",
              authorityType: "COMMON",
              originalAction: "REINSTATEMENT",
              originalServedDate: "2023-03-15",
            },
          },
          {
            carrierAuthority: {
              docketNumber: "MC-300003",
              authorityType: "COMMON",
              originalAction: "GRANT",
              originalServedDate: grantDate,
            },
          },
        ],
      }),
    } as Response);

    const result = await getCarrierAuthority("9999993");

    expect(result.authorityGrantDate).toBe(grantDate);
    expect(result.rawHistoryCount).toBe(3);
  });
});
