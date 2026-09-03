/**
 * The cancellation cascade.
 *
 * `deleteLoad` cascades deletedAt to THREE of Load's thirty-one children. Two of
 * the survivors are live surfaces, not dormant rows: a Shipment left IN_TRANSIT
 * kept runLateDetection emailing every 30 minutes, and the tracking token kept
 * the public page open — both verified against production on 2026-09-02.
 *
 * The cases that matter are the negative ones. "Cancels the shipment" is easy to
 * satisfy; "does NOT fire on a DELIVERED status change" and "does NOT touch
 * carrierId" are the ones that stop this becoming a second, quieter path for
 * releasing a carrier.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import { cascadeLoadCancellation, CASCADE_EVENT_TYPE } from "../../../src/services/cancelCascade";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
const SRC = path.resolve(__dirname, "../../../src");
const controller = fs.readFileSync(path.join(SRC, "controllers/loadController.ts"), "utf8");
const cascadeSrc = fs.readFileSync(path.join(SRC, "services/cancelCascade.ts"), "utf8");

function codeOnly(s: string): string {
  return s.replace(new RegExp("/\\*[\\s\\S]*?\\*/", "g"), "").replace(new RegExp("^[ \\t]*//.*$", "gm"), "");
}

beforeEach(() => {
  vi.clearAllMocks();
  // Explicit resolved values: clearAllMocks resets call history but NOT a queued
  // mockResolvedValue, so a count leaking from a previous case would read as
  // cascade logic (v3.8.alh).
  mockPrisma.shipment.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.load.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.shipperTrackingToken.updateMany.mockResolvedValue({ count: 0 });
  mockPrisma.loadActivity.create.mockResolvedValue(null);
});

describe("what the cascade stops", () => {
  it("cancels every shipment on the load, not just the first", async () => {
    // The status path already synced ONE shipment via findFirst. updateMany is
    // the difference: a load with two shipments left the second one running.
    mockPrisma.shipment.updateMany.mockResolvedValue({ count: 2 });
    const r = await cascadeLoadCancellation("load-1", mockPrisma);
    expect(r.shipmentsCancelled).toBe(2);
    const [arg] = mockPrisma.shipment.updateMany.mock.calls[0];
    expect(arg.where).toMatchObject({ loadId: "load-1", status: { not: "CANCELLED" } });
    expect(arg.data.status).toBe("CANCELLED");
  });

  it("nulls the public tracking token", async () => {
    mockPrisma.load.updateMany.mockResolvedValue({ count: 1 });
    const r = await cascadeLoadCancellation("load-1", mockPrisma);
    expect(r.trackingTokenCleared).toBe(true);
    const [arg] = mockPrisma.load.updateMany.mock.calls[0];
    expect(arg.where).toMatchObject({ id: "load-1", trackingToken: { not: null } });
    expect(arg.data.trackingToken).toBeNull();
  });

  it("EXPIRES shipper tracking rows rather than deleting them", async () => {
    // The record of what was issued, and to whom, outlives the link it granted.
    mockPrisma.shipperTrackingToken.updateMany.mockResolvedValue({ count: 3 });
    const r = await cascadeLoadCancellation("load-1", mockPrisma);
    expect(r.shipperTokensExpired).toBe(3);
    const [arg] = mockPrisma.shipperTrackingToken.updateMany.mock.calls[0];
    expect(arg.data.expiresAt).toBeInstanceOf(Date);
    expect(codeOnly(cascadeSrc)).not.toContain("shipperTrackingToken.deleteMany");
  });

  it("writes exactly one LoadActivity row tagged cancel_cascade", async () => {
    await cascadeLoadCancellation("load-1", mockPrisma, { reason: "test load" });
    expect(mockPrisma.loadActivity.create).toHaveBeenCalledTimes(1);
    const [arg] = mockPrisma.loadActivity.create.mock.calls[0];
    expect(arg.data.eventType).toBe(CASCADE_EVENT_TYPE);
    expect(arg.data.loadId).toBe("load-1");
    expect(arg.data.metadata).toMatchObject({ reason: "test load" });
  });
});

describe("what the cascade must NOT do", () => {
  it("never writes carrierId", async () => {
    // Assignment is written by carrierAssignmentService and released by
    // carrierReleaseService, which settles the tender, voids live paper and
    // records a fall-off. Clearing it here would do a tenth of that silently and
    // mark a carrier as having fallen off a load SRL cancelled.
    await cascadeLoadCancellation("load-1", mockPrisma);
    for (const [arg] of mockPrisma.load.updateMany.mock.calls) {
      expect(JSON.stringify(arg.data)).not.toContain("carrierId");
    }
    expect(codeOnly(cascadeSrc)).not.toContain("carrierId");
  });

  it("does not delete anything — every write is an update", async () => {
    const code = codeOnly(cascadeSrc);
    expect(code).not.toContain(".delete(");
    expect(code).not.toContain(".deleteMany(");
    expect(code).toContain("updateMany"); // vacuity tripwire
  });
});

describe("idempotence", () => {
  it("a second call moves nothing, because every write is scoped to the un-cascaded state", async () => {
    mockPrisma.shipment.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    mockPrisma.load.updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    mockPrisma.shipperTrackingToken.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 0 });

    const first = await cascadeLoadCancellation("load-1", mockPrisma);
    const second = await cascadeLoadCancellation("load-1", mockPrisma);

    expect(first).toEqual({ shipmentsCancelled: 1, trackingTokenCleared: true, shipperTokensExpired: 2 });
    expect(second).toEqual({ shipmentsCancelled: 0, trackingTokenCleared: false, shipperTokensExpired: 0 });
  });

  it("the scoping that makes it idempotent is in the where clauses, not in a caller guard", async () => {
    await cascadeLoadCancellation("load-1", mockPrisma);
    expect(mockPrisma.shipment.updateMany.mock.calls[0][0].where.status).toEqual({ not: "CANCELLED" });
    expect(mockPrisma.load.updateMany.mock.calls[0][0].where.trackingToken).toEqual({ not: null });
    expect(mockPrisma.shipperTrackingToken.updateMany.mock.calls[0][0].where.expiresAt).toHaveProperty("gt");
  });
});

describe("both call paths invoke it, and only for CANCELLED", () => {
  const code = codeOnly(controller);

  it("deleteLoad calls it", () => {
    const i = code.indexOf("export async function deleteLoad");
    expect(i).toBeGreaterThan(-1);
    const body = code.slice(i, i + 2400);
    expect(body, "deleteLoad no longer cascades").toContain("cascadeLoadCancellation(");
  });

  it("deleteLoad calls it INSIDE the transaction, so a failure rolls the delete back", () => {
    const i = code.indexOf("export async function deleteLoad");
    const body = code.slice(i, i + 2400);
    const tx = body.indexOf("prisma.$transaction");
    const call = body.indexOf("cascadeLoadCancellation(");
    expect(tx).toBeGreaterThan(-1);
    expect(call).toBeGreaterThan(tx);
    // and it is handed the transaction client, not the global one
    expect(body).toContain("cascadeLoadCancellation(load.id, tx");
  });

  it("the status path calls it", () => {
    expect(code).toContain("cascadeLoadCancellation(load.id, prisma");
  });

  it('the status-path call is gated on CANCELLED, NOT on the TONU || CANCELLED branch', () => {
    // The enclosing branch is `status === "TONU" || status === "CANCELLED"`. A
    // TONU is not a cancellation: the freight was ordered and the truck was
    // real, so its shipment and tracking must not be torn down here.
    //
    // THE FIRST VERSION OF THIS CASE WAS VACUOUS AND THE INJECTION CAUGHT IT.
    // It searched the 400 characters before the call for `status ===
    // "CANCELLED"`, which the ENCLOSING branch contains — so deleting the inner
    // gate entirely still passed. Anchor on the NEAREST enclosing `if (`, not on
    // a substring that a wider condition also satisfies (§19 Sub-pattern 16).
    const call = code.indexOf("cascadeLoadCancellation(load.id, prisma");
    expect(call).toBeGreaterThan(-1);
    const before = code.slice(0, call);
    const nearestIf = before.lastIndexOf("if (");
    expect(nearestIf, "no enclosing if — the cascade is unconditional").toBeGreaterThan(-1);
    const condition = before.slice(nearestIf, before.indexOf("{", nearestIf) + 1).replace(/\s+/g, " ");
    expect(condition, "the gate immediately wrapping the cascade must test CANCELLED alone").toBe(
      'if (status === "CANCELLED") {',
    );
  });

  it("is not called anywhere else in the controller (exactly two call sites)", () => {
    const n = (code.match(/cascadeLoadCancellation\(/g) || []).length;
    expect(n, "expected exactly two call sites — deleteLoad and the CANCELLED status branch").toBe(2);
  });
});
