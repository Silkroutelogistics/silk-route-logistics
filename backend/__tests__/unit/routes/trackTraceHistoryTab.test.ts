/**
 * v3.8.bkg — Track & Trace History tab.
 *
 * The four board tabs leave CANCELLED, TONU, DRAFT/PLANNED/POSTED and fully
 * closed-out delivered loads on NO tab, and search only looks inside the
 * current tab — so a customer's cancelled or TONU loads could not be listed or
 * found anywhere an AE works. History is every live load, by name, and a
 * finished load no longer shows a live-GPS badge off its last ping.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import express from "express";
import type { Server } from "http";

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-ae", email: "ae@srl.test", role: "ADMIN" };
      next();
    },
  };
});

import trackTraceRouter from "../../../src/routes/trackTraceBoard";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;
let server: Server;
let base = "";

const row = (status: string, extra: Record<string, unknown> = {}) => ({
  id: `ld-${status}`, loadNumber: `SRL-${status}`, referenceNumber: "REF", status,
  originCity: "Northlake", originState: "TX", destCity: "Hebron", destState: "KY",
  pickupDate: new Date("2026-09-18T12:00:00Z"), deliveryDate: new Date("2026-09-21T12:00:00Z"),
  equipmentType: "Dry Van 53'", temperatureControlled: false, urgencyLevel: null,
  podVerified: false, customerInvoiced: false, carrierSettled: false,
  customer: { id: "cust-bee", name: "Beekeepers" }, carrier: null, shipperFacility: null,
  loadStops: [], loadExceptions: [], checkCallSchedules: [],
  // A ping two minutes old: would read "live" on an active load.
  trackingEvents: [{ latitude: 32.9, longitude: -97.2, createdAt: new Date(Date.now() - 120_000), locationCity: "Northlake", locationState: "TX" }],
  ...extra,
});

beforeEach(async () => {
  vi.clearAllMocks();
  if (!server) {
    const app = express();
    app.use(express.json());
    app.use("/track-trace", trackTraceRouter);
    await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/track-trace`;
  }
  mockPrisma.load.findMany.mockResolvedValue([row("CANCELLED"), row("TONU"), row("COMPLETED"), row("IN_TRANSIT")]);
});
afterAll(() => server?.close());

const whereOf = () => JSON.stringify(mockPrisma.load.findMany.mock.calls[0][0].where);

describe("GET /track-trace/loads?tab=history", () => {
  it("applies no status filter — cancelled, TONU and closed-out loads are all listed", async () => {
    const r = await fetch(`${base}/loads?tab=history&shipperId=cust-bee`);
    expect(r.status).toBe(200);
    const w = whereOf();
    expect(w).not.toContain("\"status\"");
    expect(w).toContain("\"customerId\":\"cust-bee\"");
    expect(w).toContain("\"deletedAt\":null");
    const body = await r.json();
    expect(body.loads.map((l: any) => l.status).sort()).toEqual(["CANCELLED", "COMPLETED", "IN_TRANSIT", "TONU"]);
  });

  it("the Active tab still filters by status (unchanged)", async () => {
    await fetch(`${base}/loads?tab=active`);
    expect(whereOf()).toContain("\"status\"");
  });

  it("a finished load shows no GPS badge; an in-transit one still does", async () => {
    const body = await (await fetch(`${base}/loads?tab=history`)).json();
    const gps = Object.fromEntries(body.loads.map((l: any) => [l.status, l.gpsStatus]));
    expect(gps.CANCELLED).toBe("none");
    expect(gps.TONU).toBe("none");
    expect(gps.COMPLETED).toBe("none");
    expect(gps.IN_TRANSIT).toBe("live"); // vacuity: the badge still works where it should
  });
});

it("History is a named branch, not the accident of an unmatched tab (source guard)", async () => {
  // The status-filter assertion above passes against the pre-History router too,
  // because an unmatched tab already fell through to "no status filter". This is
  // what fails if the named branch is removed.
  const fs = await import("fs");
  const path = await import("path");
  const src = fs.readFileSync(path.join(__dirname, "../../../src/routes/trackTraceBoard.ts"), "utf8");
  expect(src).toMatch(/tab === "history"/);
});
