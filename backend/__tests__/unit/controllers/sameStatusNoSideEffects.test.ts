/**
 * A repeat of the status a load already holds fires nothing.
 *
 * WHY. The transition validator ALLOWS same-status on both actors — asserted
 * below rather than assumed, because the whole defect rests on it. So a
 * double-submit passed straight through and every side effect ran twice. On
 * 2026-09-22 two LOADED writes 453ms apart left two check-call rows and put two
 * identical "Shipment Picked Up" emails into a customer's inbox 272ms apart.
 *
 * WHICH HANDLER. The arc brief cited loadController:880. Tracing the check-call
 * writer first showed check calls on status change are written ONLY by
 * routes/carrierLoads (the carrier portal) — loadController writes none — so
 * the observed duplicate came through the carrier endpoint. The AE handler has
 * the same hole and fires the same milestone email, so both are guarded and
 * both are covered here.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { validateLoadStatusTransition } from "../../../src/lib/loadStateMachine";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/shipperNotificationService", () => ({
  sendShipperMilestoneEmail: vi.fn().mockResolvedValue(undefined),
  sendShipperDeliveryEmail: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("../../../src/services/notificationService", () => ({
  notifyLoadStatusChange: vi.fn().mockResolvedValue(undefined),
  notifyTenderAction: vi.fn().mockResolvedValue(undefined),
}));

import { sendShipperMilestoneEmail } from "../../../src/services/shipperNotificationService";
import { updateLoadStatus } from "../../../src/controllers/loadController";

const mockPrisma = vi.mocked(prisma) as any;
const LOAD = {
  id: "load-1",
  status: "LOADED",
  posterId: "ae-1",
  carrierId: "car-1",
  referenceNumber: "SRL-121494",
  deletedAt: null,
};

function call(status: string) {
  const req = {
    params: { id: "load-1" },
    body: { status },
    user: { id: "ae-1", email: "ae@srl.test", role: "OPERATIONS", firstName: "A", lastName: "E" },
    headers: {},
  } as any;
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis() } as any;
  return { req, res, run: () => updateLoadStatus(req, res) };
}

describe("the premise: same-status is ALLOWED by the validator", () => {
  it("so nothing upstream stops a double-submit — this is why the guard exists", () => {
    for (const actor of ["AE", "CARRIER"] as const) {
      expect(
        validateLoadStatusTransition("LOADED" as any, "LOADED" as any, actor).allowed,
        `${actor} same-status`,
      ).toBe(true);
    }
  });
});

describe("AE status update — a repeat fires no side effects", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.load.findUnique.mockResolvedValue(LOAD);
    mockPrisma.load.update.mockResolvedValue(LOAD);
  });

  it("two writes 450ms apart produce ONE email and ONE status write", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ ...LOAD, status: "AT_PICKUP" });
    await call("LOADED").run();
    expect(sendShipperMilestoneEmail).toHaveBeenCalledTimes(1);
    expect(mockPrisma.load.update).toHaveBeenCalledTimes(1);

    // the second submit lands after the first has committed
    mockPrisma.load.findUnique.mockResolvedValue({ ...LOAD, status: "LOADED" });
    await call("LOADED").run();

    expect(sendShipperMilestoneEmail, "one email for one event").toHaveBeenCalledTimes(1);
    expect(mockPrisma.load.update, "one status write for one event").toHaveBeenCalledTimes(1);
  });

  it("answers 200 with the load rather than an error — a retry is not a failure", async () => {
    const c = call("LOADED");
    await c.run();
    expect(c.res.json).toHaveBeenCalledWith(expect.objectContaining({ id: "load-1" }));
    expect(c.res.status).not.toHaveBeenCalledWith(400);
    expect(c.res.status).not.toHaveBeenCalledWith(422);
  });

  it("a genuine advance still fires exactly once", async () => {
    mockPrisma.load.findUnique.mockResolvedValue({ ...LOAD, status: "LOADED" });
    await call("IN_TRANSIT").run();
    expect(sendShipperMilestoneEmail).toHaveBeenCalledTimes(1);
    expect(mockPrisma.load.update).toHaveBeenCalledTimes(1);
  });
});

describe("the carrier portal handler carries the same guard", () => {
  it("guards before the check-call write, which is the row that doubled", () => {
    const fs = require("fs") as typeof import("fs");
    const path = require("path") as typeof import("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../../src/routes/carrierLoads.ts"),
      "utf8",
    );
    const guard = src.indexOf("if (oldStatus === status) {");
    const checkCall = src.indexOf("prisma.checkCall.create");
    expect(guard, "carrier handler has the same-status guard").toBeGreaterThan(-1);
    expect(checkCall, "vacuity: the check-call write is still here").toBeGreaterThan(-1);
    expect(guard, "the guard must precede the check-call write").toBeLessThan(checkCall);
  });
});
