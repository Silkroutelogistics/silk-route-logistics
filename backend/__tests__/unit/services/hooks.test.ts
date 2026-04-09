import { describe, it, expect, vi, beforeEach } from "vitest";

// Isolate from hooksInit side effects
vi.mock("../../../src/config/database", () => ({
  prisma: { loadTrackingEvent: { create: vi.fn() }, systemLog: { create: vi.fn() } },
}));

describe("hooks", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it("returns blocked: false when no handlers registered for event", async () => {
    const { hooks } = await import("../../../src/lib/hooks");
    const result = await hooks.run("PreInvoiceSubmit", { invoiceId: "inv-1" });
    expect(result.blocked).toBe(false);
  });

  it("on() registers a handler and run() executes it", async () => {
    const { hooks } = await import("../../../src/lib/hooks");
    const spy = vi.fn().mockResolvedValue(undefined);
    hooks.on("PostTenderDecline", spy);
    await hooks.run("PostTenderDecline", { tenderId: "t-1" });
    expect(spy).toHaveBeenCalledWith({ tenderId: "t-1" });
  });

  it("Pre* hook can block execution", async () => {
    const { hooks } = await import("../../../src/lib/hooks");
    hooks.on("PreLoadStateChange", async () => ({ blocked: true as const, reason: "Insurance expired" }));
    const result = await hooks.run("PreLoadStateChange", { loadId: "l-1" });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("Insurance expired");
  });

  it("Pre* hook blocks on error (fail-safe)", async () => {
    const { hooks } = await import("../../../src/lib/hooks");
    hooks.on("PreCarrierAssignment", async () => { throw new Error("DB down"); });
    const result = await hooks.run("PreCarrierAssignment", { carrierId: "c-1" });
    expect(result.blocked).toBe(true);
    expect(result.reason).toBe("Internal hook error");
  });

  it("Post* hook continues on error (log and move on)", async () => {
    const { hooks } = await import("../../../src/lib/hooks");
    hooks.on("PostTenderAccept", async () => { throw new Error("Slack down"); });
    const result = await hooks.run("PostTenderAccept", { tenderId: "t-1" });
    expect(result.blocked).toBe(false);
  });
});
