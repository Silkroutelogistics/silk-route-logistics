/**
 * The two expiry sweeps, and the boundary between them.
 *
 * TWO SWEEPS OWN TENDER EXPIRY, on purpose:
 *
 *   processExpiredTenders   (hourly cron)      -- direct tenders. Expires them
 *                                                 and returns the load to the
 *                                                 board when none is left live.
 *   expireStalePositions    (adaptive ticker)  -- cascade tenders. Expires the
 *                                                 position and ADVANCES the
 *                                                 waterfall to the next carrier.
 *
 * They are not merged because they do genuinely different things, and merging
 * would put cascade knowledge into a path that has none.
 *
 * THE RACE THIS PREVENTS. waterfallEngineService writes ONE instant to both
 * LoadTender.expiresAt and WaterfallPosition.tenderExpiresAt, so both sweeps
 * become eligible at the same moment and only scheduler order decides which
 * runs. If the hourly cron wins, it expires a cascade tender and reverts the
 * load to POSTED while the waterfall is still ACTIVE -- and the ticker then
 * advances the cascade and tenders the next carrier onto a load that is back on
 * the open board.
 *
 * Behaviour is proven in scripts/_arc-expiry-race-proof.ts. These are the two
 * structural properties a DB proof cannot see: that the scope clause is present,
 * and that the single-instant invariant the race depends on still holds.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname, "../../../src");
const strip = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
const read = (rel: string) => strip(fs.readFileSync(path.join(SRC, rel), "utf8"));

describe("the direct expiry sweep does not touch cascade tenders", () => {
  const sweep = () => {
    const s = read("controllers/tenderController.ts");
    const start = s.indexOf("export async function processExpiredTenders");
    expect(start, "processExpiredTenders not found -- repoint this guard").toBeGreaterThan(-1);
    // The findMany that selects what to expire is the first one in the function.
    const body = s.slice(start, start + 1200);
    const q = body.indexOf("loadTender.findMany");
    expect(q, "the sweep no longer selects with findMany -- re-read this guard").toBeGreaterThan(-1);
    return body.slice(q, q + 400);
  };

  it("scopes to tenders with no waterfall position", () => {
    expect(
      sweep(),
      "processExpiredTenders must exclude cascade tenders with `waterfallPositionId: null`. " +
        "Without it the hourly cron races the waterfall ticker and can revert a load to " +
        "POSTED underneath an active cascade.",
    ).toMatch(/waterfallPositionId:\s*null/);
  });

  it("still selects on the states and the deadline (vacuity tripwire)", () => {
    // If the query changed shape entirely, the assertion above could pass on a
    // fragment that is no longer the selection at all.
    const q = sweep();
    expect(q).toMatch(/status:\s*\{\s*in:/);
    expect(q).toMatch(/expiresAt:\s*\{\s*lt:/);
  });
});

describe("one instant feeds both expiry clocks", () => {
  /**
   * This is the invariant the race is built on, and the reason the scope clause
   * above is sufficient rather than merely helpful.
   *
   * If a future edit gave the position a DIFFERENT deadline from its tender, the
   * two sweeps would stop being simultaneous and the interaction would change
   * shape without anything failing. Pinning the single-variable assignment makes
   * that edit visible.
   */
  const svc = () => read("services/waterfallEngineService.ts");

  it("LoadTender.expiresAt and WaterfallPosition.tenderExpiresAt come from one variable", () => {
    const s = svc();
    // One computed deadline...
    expect(s, "the single expiry variable is gone").toMatch(/const\s+expiresAt\s*=\s*new Date\(/);
    // ...written to the tender as shorthand, and to the position by name.
    expect(s, "LoadTender.expiresAt is no longer written from `expiresAt`").toMatch(/\bexpiresAt,/);
    expect(
      s,
      "WaterfallPosition.tenderExpiresAt must be assigned the SAME variable. If it " +
        "gets its own deadline the two sweeps stop being simultaneous and the " +
        "scope clause in processExpiredTenders is no longer sufficient.",
    ).toMatch(/tenderExpiresAt:\s*expiresAt\b/);
  });

  it("the cascade sweep still advances rather than only expiring", () => {
    // The whole reason the direct sweep must not touch these rows: something
    // else is going to move the cascade forward.
    const s = svc();
    const fn = s.slice(s.indexOf("export async function expireStalePositions"));
    expect(fn, "expireStalePositions no longer advances the waterfall").toContain("advanceWaterfall");
  });
});
