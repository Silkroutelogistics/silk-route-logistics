// The health response must carry a readable build identity.
//
// Before this, /api/health reported version "1.0.0" from package.json, which
// never changes. Confirming a deploy meant correlating the reported uptime
// against the time of a push — arithmetic that cannot distinguish "the deploy
// landed" from "the service restarted a minute later for its own reasons".
//
// These pin the contract the deploy check now depends on. If someone drops a
// field or stops reading RENDER_GIT_COMMIT, verification silently reverts to
// inference, and that failure is invisible from the outside — the endpoint keeps
// returning 200 either way.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  vi.resetModules();
  // Explicit: no runner variables unless a test sets one. Leaving a value from
  // the ambient environment would make these pass or fail by accident.
  delete process.env.RENDER_GIT_COMMIT;
  delete process.env.GIT_COMMIT;
  delete process.env.SOURCE_VERSION;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("buildInfo", () => {
  it("returns the fields the deploy check reads", async () => {
    const { buildInfo } = await import("../../../src/lib/buildInfo");
    const info = buildInfo();
    expect(info).toHaveProperty("sha");
    expect(info).toHaveProperty("bootedAt");
    expect(info).toHaveProperty("version");
  });

  it("reads the deployed commit from RENDER_GIT_COMMIT", async () => {
    process.env.RENDER_GIT_COMMIT = "4ab1065f9c3d2e1a0b7f6e5d4c3b2a1908070605";
    const { buildInfo } = await import("../../../src/lib/buildInfo");
    // Short form, because that is what gets compared against
    // `git rev-parse --short HEAD`.
    expect(buildInfo().sha).toBe("4ab1065f");
  });

  it("accepts the other runners' variable names", async () => {
    process.env.GIT_COMMIT = "abcdef1234567890";
    const { buildInfo } = await import("../../../src/lib/buildInfo");
    expect(buildInfo().sha).toBe("abcdef12");
  });

  it('reports "local" when nothing injected a commit', async () => {
    // Honest rather than misleading: a blank or fabricated SHA would make a
    // local process look like a deploy.
    const { buildInfo } = await import("../../../src/lib/buildInfo");
    expect(buildInfo().sha).toBe("local");
  });

  it("holds bootedAt fixed across calls", async () => {
    // The whole point: a value that can be compared against a deploy time.
    // Recomputing it per request would answer nothing that `uptime` does not.
    const { buildInfo } = await import("../../../src/lib/buildInfo");
    const a = buildInfo().bootedAt;
    await new Promise((r) => setTimeout(r, 15));
    expect(buildInfo().bootedAt).toBe(a);
  });

  it("emits bootedAt as a parseable ISO instant", async () => {
    const { buildInfo } = await import("../../../src/lib/buildInfo");
    const t = Date.parse(buildInfo().bootedAt);
    expect(Number.isNaN(t)).toBe(false);
    expect(buildInfo().bootedAt).toBe(new Date(t).toISOString());
  });

  it("keeps version, so existing consumers of the health payload do not break", async () => {
    const { buildInfo } = await import("../../../src/lib/buildInfo");
    expect(buildInfo().version).toBe("1.0.0");
  });
});
