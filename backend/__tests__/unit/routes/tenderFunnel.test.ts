/**
 * GET /analytics/tender-funnel — the parts sum to total, through the real route.
 *
 * Lifecycle-gaps B3a (#7). v3.8.awx fixed this funnel once by adding WITHDRAWN;
 * v3.8.axt/axu then added RC_SENT and CONFIRMED and the parts stopped summing a
 * second time, because `accepted` counted ACCEPTED alone and a signed tender
 * fell into no bucket. This drives the real router over HTTP with the prisma
 * client mocked, so what is asserted is the JSON an AE's page reads.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "http";

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-ceo", email: "ceo@srl.test", role: "CEO" };
      next();
    },
  };
});

import analyticsRouter from "../../../src/routes/analytics";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;

let server: Server;
let base = "";
beforeEach(async () => {
  vi.clearAllMocks();
  if (!server) {
    const app = express();
    app.use(express.json());
    app.use("/analytics", analyticsRouter);
    await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
    const addr = server.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}/analytics`;
  }
});

const now = new Date();
const row = (status: string, over: Record<string, unknown> = {}) => ({
  status, declineReason: null, offeredRate: 1000, counterRate: null,
  createdAt: now, respondedAt: null, expiresAt: new Date(now.getTime() + 24 * 3600_000),
  load: { equipmentType: "Reefer" }, carrier: { cppTier: "SILVER" },
  ...over,
});

describe("GET /analytics/tender-funnel", () => {
  it("the funnel's parts sum to total when signed and released tenders are present", async () => {
    mockPrisma.loadTender.findMany.mockResolvedValue([
      row("ACCEPTED"), row("RC_SENT"), row("CONFIRMED"), row("RELEASED"),
      row("DECLINED", { declineReason: "Rate too low" }), row("COUNTERED"), row("EXPIRED"), row("OFFERED"),
      row("WITHDRAWN"), row("WITHDRAWN"),
    ]);
    const res = await fetch(`${base}/tender-funnel?days=90`);
    expect(res.status).toBe(200);
    const body = await res.json();
    const f = body.funnel;
    expect(f.total).toBe(10);
    expect(f.accepted + f.declined + f.countered + f.expired + f.pending + f.withdrawn, "parts must sum to total").toBe(f.total);
    // A carrier who accepted and signed is accepted here too.
    expect(f.accepted).toBe(4);
    expect(f.acceptedByStage).toEqual({ accepted: 1, rcSent: 1, confirmed: 1, released: 1 });
    // Denominators exclude the two withdrawals: 4 accepted of 8 judged.
    expect(body.conversion.acceptanceRateOfTotal).toBe(50);
    // Of the 6 who answered (4 accepted + declined + countered), 4 accepted.
    expect(body.conversion.acceptanceRateOfResponded).toBe(67);
  });

  it("the per-group buckets count a signed tender as accepted, not as nothing", async () => {
    mockPrisma.loadTender.findMany.mockResolvedValue([
      row("CONFIRMED", { load: { equipmentType: "Dry Van" } }),
      row("DECLINED", { load: { equipmentType: "Dry Van" } }),
    ]);
    const res = await fetch(`${base}/tender-funnel`);
    const body = await res.json();
    const dryVan = body.byEquipment.find((b: { key: string }) => b.key === "Dry Van");
    expect(dryVan).toBeTruthy();
    expect(dryVan.accepted).toBe(1);
    expect(dryVan.acceptanceRate).toBe(50);
  });

  it("an empty window reports zeros, never NaN", async () => {
    mockPrisma.loadTender.findMany.mockResolvedValue([]);
    const body = await (await fetch(`${base}/tender-funnel`)).json();
    expect(body.funnel.total).toBe(0);
    expect(body.conversion.acceptanceRateOfTotal).toBe(0);
    expect(body.conversion.acceptanceRateOfResponded).toBe(0);
  });
});
