/**
 * v3.8.aqw — soft-delete contract for load-consuming crons/services.
 *
 * A soft-deleted load (deletedAt set) must be operationally invisible. This was
 * NOT true before aqw: six queries filtered only on status, so the July prod
 * cleanup soft-deleted every load and the check-call cron kept alerting on one
 * of them for ~3 months (46,928 notifications = 98% of the table). The same gap
 * let deleted loads inflate weekly/monthly financial reports, raise risk alerts,
 * and skew carrier match scoring.
 *
 * This is a source-level contract test: it asserts the query sites still carry
 * `deletedAt: null`. It intentionally reads the source rather than mocking each
 * service, because the defect was a MISSING WHERE CLAUSE — a behavioral mock
 * would happily pass while the clause was absent.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..", "..", "src");
const read = (rel: string) => readFileSync(join(SRC, rel), "utf8");

/** Extract the `where: { ... }` block that follows a query call site. */
function blockAfter(source: string, marker: string, lines = 16): string {
  const idx = source.indexOf(marker);
  expect(idx, `expected to find query marker: ${marker}`).toBeGreaterThan(-1);
  return source.slice(idx).split("\n").slice(0, lines).join("\n");
}

describe("v3.8.aqw — soft-deleted loads must be operationally invisible", () => {
  it("check-call reminder cron excludes deleted loads (the flood's root cause)", () => {
    const src = read("cron/index.ts");
    const block = blockAfter(src, 'status: { in: ["IN_TRANSIT", "DISPATCHED", "AT_PICKUP", "LOADED"] }');
    expect(block).toContain("deletedAt: null");
  });

  it("check-call reminder cron also excludes test loads and stale pickups", () => {
    const src = read("cron/index.ts");
    const block = blockAfter(src, 'status: { in: ["IN_TRANSIT", "DISPATCHED", "AT_PICKUP", "LOADED"] }');
    expect(block).toContain("isTestAccount: false");
    expect(block).toContain("pickupDate:");
  });

  it("check-call reminder cron dedups per load so it cannot re-fire every tick", () => {
    const src = read("cron/index.ts");
    // The flood existed because the only time window was on check CALLS.
    // There must now be a lookback over prior CHECK_CALL_DUE notifications.
    expect(src).toContain('type: "CHECK_CALL_DUE"');
    expect(src).toMatch(/alreadyNotifiedLoadIds|recentlyNotified/);
  });

  it("risk engine excludes deleted loads", () => {
    const src = read("services/riskEngine.ts");
    const block = blockAfter(src, "status: { in: activeStatuses as any[] }");
    expect(block).toContain("deletedAt: null");
  });

  it("weekly report counts exclude deleted loads (revenue integrity)", () => {
    const src = read("cron/index.ts");
    expect(blockAfter(src, "where: { createdAt: { gte: weekAgo }", 3)).toContain("deletedAt: null");
    expect(blockAfter(src, 'status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED"] }, deliveryDate', 3)).toContain("deletedAt: null");
    expect(blockAfter(src, "where: { deliveryDate: { gte: weekAgo }, customerRate", 3)).toContain("deletedAt: null");
  });

  it("monthly P&L summary excludes deleted loads", () => {
    const src = read("services/schedulerService.ts");
    const block = blockAfter(src, 'status: { in: ["DELIVERED", "COMPLETED", "POD_RECEIVED", "INVOICED"] }');
    expect(block).toContain("deletedAt: null");
  });

  it("smart-match nearby-delivery signal excludes deleted loads", () => {
    const src = read("services/smartMatchService.ts");
    const block = blockAfter(src, 'status: { in: ["IN_TRANSIT", "AT_DELIVERY"] }');
    expect(block).toContain("deletedAt: null");
  });
});
