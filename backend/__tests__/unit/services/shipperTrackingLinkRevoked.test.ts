/**
 * A shipper must not be emailed a Track Shipment button for a cancelled load.
 *
 * WHY THIS IS STRUCTURAL RATHER THAN BEHAVIOURAL. The predicate is three tokens
 * long and file-local; driving it end to end would mean standing up the whole
 * notification path to prove `a && !b`. The real risk is not that the expression
 * is wrong, it is DRIFT -- this file has two independent readers of the token
 * and an explicit `select` that has to fetch the column they test. Sub-pattern 5
 * is exactly that shape: a filter on a field the query never fetched reads
 * `undefined`, which is falsy, so a revoked token would look ACTIVE and the
 * button would ship. These assertions hold the three ends together.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src/services/shipperLoadNotifyService.ts");
const src = fs.readFileSync(SRC, "utf8");
/** Strip comments so prose about the column cannot satisfy a check about code. */
const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");

describe("revoked tracking tokens — v3.8.bis", () => {
  it("finds the file at all (vacuity tripwire)", () => {
    expect(code.length, "the source read produced nothing — the test is broken, not the file").toBeGreaterThan(2000);
    expect(code).toContain("function activeTrackingToken");
  });

  it("the predicate tests the revoked column, not merely presence", () => {
    const m = code.match(/function activeTrackingToken\([\s\S]*?\n\}/);
    expect(m, "activeTrackingToken was not found").toBeTruthy();
    expect(
      /trackingTokenRevokedAt/.test(m![0]),
      "activeTrackingToken ignores trackingTokenRevokedAt — a revoked token would read as active",
    ).toBe(true);
  });

  it("the explicit select FETCHES the column the predicate tests", () => {
    // Sub-pattern 5, both ends. A select that omits it makes the predicate read
    // undefined -> falsy -> the token reads ACTIVE on a cancelled load.
    const sel = code.match(/select:\s*\{[\s\S]*?trackingToken:\s*true[\s\S]*?\}/);
    expect(sel, "no explicit select of trackingToken was found").toBeTruthy();
    expect(
      /trackingTokenRevokedAt:\s*true/.test(sel![0]),
      "the select fetches trackingToken but not trackingTokenRevokedAt",
    ).toBe(true);
  });

  it("NO reader tests load.trackingToken bare — both go through the one predicate", () => {
    // The helper is allowed to; it is the definition. Everything else must not.
    const withoutHelper = code.replace(/function activeTrackingToken\([\s\S]*?\n\}/, "");
    const bare = [...withoutHelper.matchAll(/load\.trackingToken(?!\w)/g)];
    expect(
      bare.length,
      "a reader still tests load.trackingToken directly, so it cannot see a revocation",
    ).toBe(0);
  });

  it("both readers call the predicate", () => {
    const calls = [...code.matchAll(/activeTrackingToken\(load\)/g)];
    expect(calls.length, "expected the button and the fan-out to both use it").toBeGreaterThanOrEqual(2);
  });
});
