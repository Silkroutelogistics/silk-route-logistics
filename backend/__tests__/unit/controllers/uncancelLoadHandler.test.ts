/**
 * PUT /loads/:id/uncancel — the edge.
 *
 * The decision is proven in uncancelPolicy.test.ts and the restore in
 * uncancelLoad.test.ts. What is left is the three things only the handler does:
 * answer HTTP, record the lifecycle row, and tell the carrier.
 *
 * THE ROUTE'S OWN SHAPE IS ASSERTED FROM SOURCE, not assumed. A handler can be
 * perfect and unreachable, or reachable by the wrong role -- and the role gate
 * is the ratified half of this feature, so "ADMIN and CEO only" is checked
 * where it is declared rather than inferred from the handler passing its own
 * internal check.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { uncancelLoadHandler } from "../../../src/controllers/loadController";
import { prisma } from "../../../src/config/database";
import * as uncancelService from "../../../src/services/uncancelLoad";
import * as lifecycle from "../../../src/lib/lifecycleAudit";

const mockPrisma = prisma as any;

const REPORT = {
  restoredTo: "DISPATCHED",
  shipmentsRestored: 1,
  trackingLinkRestored: true,
  shipperTokensRestored: 1,
  tendersRestored: 1,
  carrierPaysRestored: 1,
  shipperCreditRestored: true,
  rateConfirmationsToReissue: [{ id: "rc1", status: "SENT" }],
};

function mockReqRes(body: Record<string, unknown>, role = "ADMIN") {
  return {
    req: {
      body,
      params: { id: "load-1" },
      query: {},
      headers: {},
      user: { id: "u1", role, email: "a@x", firstName: "A", lastName: "Admin" },
    } as any,
    res: { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any,
  };
}

beforeEach(() => {
  // clearAllMocks, NOT restoreAllMocks. restoreAllMocks uninstalls every spy
  // in the worker including the ones __tests__/setup.ts installs, and vitest
  // reuses a worker across files -- so this file passed alone and killed the
  // worker when it ran alongside others, surfacing as ERR_IPC_CHANNEL_CLOSED
  // with no test result. That reads exactly like the §13.3 Item 300 tinypool
  // flake and was not: bisecting by excluding this one file made the suite
  // green. Every other suite here uses clearAllMocks; this one was the outlier.
  vi.clearAllMocks();
  mockPrisma.load.findUnique.mockResolvedValue({
    id: "load-1",
    status: "CANCELLED",
    referenceNumber: "SRL-121500",
    carrierId: "carrier-user-1",
    cancellationReasonCode: "SHIPPER_FREIGHT_NOT_READY",
  });
  mockPrisma.notification.findFirst.mockResolvedValue(null);
  mockPrisma.notification.create.mockResolvedValue({});
  vi.spyOn(lifecycle, "recordLifecycleEvent").mockResolvedValue(undefined as never);
});

describe("the endpoint — v3.8.biz", () => {
  it("reverses and answers with the report", async () => {
    vi.spyOn(uncancelService, "uncancelLoad").mockResolvedValue({ ok: true, report: REPORT } as never);
    const { req, res } = mockReqRes({ reason: "shipper re-confirmed the pickup" });

    await uncancelLoadHandler(req, res);

    expect(res.status).not.toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true, restoredTo: "DISPATCHED" }));
  });

  it("passes the caller's ROLE through, so the service checks it too", async () => {
    // Defence in depth: the route gate protects the route, and the rule belongs
    // to the act. A handler that dropped the role would leave the service
    // deciding on undefined.
    const spy = vi.spyOn(uncancelService, "uncancelLoad").mockResolvedValue({ ok: true, report: REPORT } as never);
    const { req, res } = mockReqRes({ reason: "shipper re-confirmed the pickup" }, "CEO");
    await uncancelLoadHandler(req, res);
    expect(spy.mock.calls[0][0].actorRole).toBe("CEO");
    expect(spy.mock.calls[0][0].reason).toBe("shipper re-confirmed the pickup");
  });

  it("answers 409 with the code when the policy refuses, and writes nothing", async () => {
    vi.spyOn(uncancelService, "uncancelLoad").mockResolvedValue({
      ok: false, code: "UNCANCEL_WINDOW_EXPIRED", message: "the window has closed",
    } as never);
    const { req, res } = mockReqRes({ reason: "too late to matter" });

    await uncancelLoadHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith({ error: "the window has closed", code: "UNCANCEL_WINDOW_EXPIRED" });
    expect(lifecycle.recordLifecycleEvent).not.toHaveBeenCalled();
    expect(mockPrisma.notification.create, "told a carrier about a reversal that was refused").not.toHaveBeenCalled();
  });

  it("404s an unknown load without calling the service", async () => {
    mockPrisma.load.findUnique.mockResolvedValue(null);
    const spy = vi.spyOn(uncancelService, "uncancelLoad");
    const { req, res } = mockReqRes({ reason: "a perfectly good reason" });
    await uncancelLoadHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(spy).not.toHaveBeenCalled();
  });

  it("records the lifecycle row on the same trail as the cancel", async () => {
    vi.spyOn(uncancelService, "uncancelLoad").mockResolvedValue({ ok: true, report: REPORT } as never);
    const { req, res } = mockReqRes({ reason: "shipper re-confirmed the pickup" });

    await uncancelLoadHandler(req, res);

    expect(lifecycle.recordLifecycleEvent).toHaveBeenCalledTimes(1);
    const [ev] = (lifecycle.recordLifecycleEvent as any).mock.calls[0];
    expect(ev.actionDetail).toBe("LOAD_UNCANCELLED");
    expect(ev.entityType).toBe("Load");
    expect(ev.entityName).toBe("SRL-121500");
    expect(ev.reason).toBe("shipper re-confirmed the pickup");
    expect(ev.previous.status).toBe("CANCELLED");
    expect(ev.new.status).toBe("DISPATCHED");
    expect(ev.actor.userId).toBe("u1");
  });
});

describe("the carrier notice — in-app only", () => {
  it("tells the carrier, and links to the load", async () => {
    vi.spyOn(uncancelService, "uncancelLoad").mockResolvedValue({ ok: true, report: REPORT } as never);
    const { req, res } = mockReqRes({ reason: "shipper re-confirmed the pickup" });

    await uncancelLoadHandler(req, res);
    await new Promise((r) => setImmediate(r)); // it is fire-and-forget

    expect(mockPrisma.notification.create).toHaveBeenCalledTimes(1);
    const [arg] = mockPrisma.notification.create.mock.calls[0];
    expect(arg.data.userId).toBe("carrier-user-1");
    expect(arg.data.actionUrl).toContain("load-1");
    expect(arg.data.message).toContain("SRL-121500");
  });

  it("does not send a second identical notice on a second reversal", async () => {
    // A load can be cancelled and reversed more than once; the link carries the
    // load id, so it is the natural key for the dedup.
    mockPrisma.notification.findFirst.mockResolvedValue({ id: "n1" });
    vi.spyOn(uncancelService, "uncancelLoad").mockResolvedValue({ ok: true, report: REPORT } as never);
    const { req, res } = mockReqRes({ reason: "shipper re-confirmed the pickup" });

    await uncancelLoadHandler(req, res);
    await new Promise((r) => setImmediate(r));

    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it("sends nothing when no carrier holds the load", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({
      id: "load-1", status: "CANCELLED", referenceNumber: "SRL-121500",
      carrierId: null, cancellationReasonCode: null,
    });
    vi.spyOn(uncancelService, "uncancelLoad").mockResolvedValue({ ok: true, report: REPORT } as never);
    const { req, res } = mockReqRes({ reason: "shipper re-confirmed the pickup" });

    await uncancelLoadHandler(req, res);
    await new Promise((r) => setImmediate(r));

    expect(mockPrisma.notification.create).not.toHaveBeenCalled();
  });

  it("a notice that fails does not fail a reversal that already committed", async () => {
    mockPrisma.notification.findFirst.mockRejectedValue(new Error("notification store down"));
    vi.spyOn(uncancelService, "uncancelLoad").mockResolvedValue({ ok: true, report: REPORT } as never);
    const { req, res } = mockReqRes({ reason: "shipper re-confirmed the pickup" });

    await expect(uncancelLoadHandler(req, res)).resolves.toBeUndefined();
    await new Promise((r) => setImmediate(r));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});

describe("the route, read from source", () => {
  const route = fs.readFileSync(path.resolve(__dirname, "../../../src/routes/loads.ts"), "utf8");
  const decl = route.slice(route.indexOf('"/:id/uncancel"'));
  const block = decl.slice(0, decl.indexOf(");") + 2);

  it("finds the route at all (vacuity tripwire)", () => {
    expect(route).toContain('"/:id/uncancel"');
    expect(block.length, "the slice found nothing — the scanner is broken, not the route").toBeGreaterThan(40);
  });

  it("is PUT, not POST — a second call refuses rather than reversing twice", () => {
    const before = route.slice(0, route.indexOf('"/:id/uncancel"'));
    expect(before.trimEnd().endsWith("router.put(")).toBe(true);
  });

  it("is ADMIN and CEO only", () => {
    expect(block).toContain('authorize("ADMIN", "CEO")');
    for (const role of ["BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING", "CARRIER", "SHIPPER"]) {
      expect(block, "the uncancel route admits " + role).not.toContain('"' + role + '"');
    }
  });

  it("validates the body and writes an audit row", () => {
    expect(block).toContain("validateBody(uncancelLoadSchema)");
    expect(block).toContain('auditLog("UPDATE", "Load")');
  });
});
