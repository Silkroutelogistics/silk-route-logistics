/**
 * Item 330 — the tender magic link.
 *
 * GET used to act, so anything that fetched the link acted: a mail scanner, a
 * link preview, a carrier opening the email only to look. In September all nine
 * accepts came through this link and four landed within 60 seconds of the offer
 * email. These tests drive the real router over HTTP: GET must change nothing,
 * POST acts, and a used token cannot act a second time.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import jwt from "jsonwebtoken";
import { prisma } from "../../../src/config/database";
import { mintTenderActionToken } from "../../../src/lib/tenderActionToken";

vi.mock("../../../src/controllers/tenderController", () => ({
  acceptTender: vi.fn(async (_req: unknown, res: any) => res.status(200).json({ ok: true })),
  declineTender: vi.fn(async (_req: unknown, res: any) => res.status(200).json({ ok: true })),
}));
import { acceptTender, declineTender } from "../../../src/controllers/tenderController";
import tenderActionRoutes from "../../../src/routes/tenderAction";

const db = prisma as any;
// The shared mock has no createMany; attach it here rather than alias another method.
db.tokenBlacklist.createMany = vi.fn();

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use("/api/tender-action", tenderActionRoutes);

const TENDER = {
  id: "t1",
  status: "OFFERED",
  offeredRate: 2400,
  carrier: { userId: "u-carrier", companyName: "Acme Carrier" },
  load: { referenceNumber: "SRL-1", originCity: "Kalamazoo", originState: "MI", destCity: "Dallas", destState: "TX" },
};
const link = (action: "accept" | "decline") =>
  mintTenderActionToken({ tenderId: "t1", action, carrierUserId: "u-carrier" });

beforeEach(() => {
  vi.clearAllMocks();
  db.loadTender.findUnique.mockResolvedValue(TENDER);
  // Answers like the unique index on tokenHash: the first insert of a hash wins.
  const claimed = new Set<string>();
  db.tokenBlacklist.createMany.mockImplementation(async ({ data }: any) => {
    if (claimed.has(data[0].tokenHash)) return { count: 0 };
    claimed.add(data[0].tokenHash);
    return { count: 1 };
  });
});

describe("GET /api/tender-action/:token", () => {
  it.each(["accept", "decline"] as const)("renders a confirm page for %s and changes nothing", async (action) => {
    const token = link(action);
    const res = await request(app).get(`/api/tender-action/${token}`);
    expect(res.status).toBe(200);
    expect(acceptTender).not.toHaveBeenCalled();
    expect(declineTender).not.toHaveBeenCalled();
    expect(db.tokenBlacklist.createMany).not.toHaveBeenCalled();
    // The route was reached and rendered its form, so the three checks above are not vacuous.
    expect(res.text).toContain(`<form method="POST" action="/api/tender-action/${token}">`);
    expect(res.text).toContain("$2,400.00");
  });
});

describe("POST /api/tender-action/:token", () => {
  it("acts once, as the carrier the token names", async () => {
    const res = await request(app).post(`/api/tender-action/${link("accept")}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("Tender accepted");
    expect(acceptTender).toHaveBeenCalledTimes(1);
    expect(declineTender).not.toHaveBeenCalled();
    const [req] = (acceptTender as any).mock.calls[0];
    expect(req.params.id).toBe("t1");
    expect(req.user).toMatchObject({ id: "u-carrier", role: "CARRIER" });
  });

  it("does not act a second time on the same token", async () => {
    const token = link("decline");
    await request(app).post(`/api/tender-action/${token}`);
    const again = await request(app).post(`/api/tender-action/${token}`);
    expect(again.status).toBe(409);
    expect(again.text).toContain("already used");
    expect(declineTender).toHaveBeenCalledTimes(1);
  });

  it("keeps the claim for as long as the token verifies", async () => {
    const token = link("accept");
    await request(app).post(`/api/tender-action/${token}`);
    const { data } = db.tokenBlacklist.createMany.mock.calls[0][0];
    expect(data[0].expiresAt.getTime()).toBe((jwt.decode(token) as { exp: number }).exp * 1000);
    expect(data[0].tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(data[0].tokenHash).not.toContain(token);
  });
});
