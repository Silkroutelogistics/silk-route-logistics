import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("features config", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it("returns defaults when no env vars set", async () => {
    const { features } = await import("../../../src/config/features");
    expect(features.compassEngine).toBe(true);
    expect(features.fmcsaVetting).toBe(true);
    expect(features.emailSequences).toBe(false);
    expect(features.waterfallTendering).toBe(false);
  });

  it("respects SRL_FEATURE_* env overrides", async () => {
    process.env.SRL_FEATURE_EMAIL_SEQUENCES = "true";
    process.env.SRL_FEATURE_COMPASS_ENGINE = "false";
    const { features } = await import("../../../src/config/features");
    expect(features.emailSequences).toBe(true);
    expect(features.compassEngine).toBe(false);
  });

  it("treats '1' as true", async () => {
    process.env.SRL_FEATURE_WATERFALL_TENDERING = "1";
    const { features } = await import("../../../src/config/features");
    expect(features.waterfallTendering).toBe(true);
  });

  it("treats any other value as false", async () => {
    process.env.SRL_FEATURE_WATERFALL_TENDERING = "yes";
    const { features } = await import("../../../src/config/features");
    expect(features.waterfallTendering).toBe(false);
  });

  it("isFeatureEnabled returns correct boolean", async () => {
    const { isFeatureEnabled } = await import("../../../src/config/features");
    expect(isFeatureEnabled("compassEngine")).toBe(true);
    expect(isFeatureEnabled("emailSequences")).toBe(false);
  });
});
