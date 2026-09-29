/**
 * Item 342 (v3.8.bop) — both accept doors open the review-and-sign page when
 * the offer went out with its rate confirmation.
 *
 * The tender email's Accept (routes/tenderAction) keeps GET side-effect free:
 * it says accepting is signing and offers one button; the POST mints a fresh
 * link and 303s to the signing page, books nothing, and does NOT burn the
 * email's token, since nothing has been accepted yet. The portal's Accept
 * (POST /carrier-tenders/:id/sign-link) does the same from a session. An offer
 * with no issued document keeps the old accept.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import request from "supertest";
import express from "express";
import { prisma } from "../../../src/config/database";
import { mintTenderActionToken } from "../../../src/lib/tenderActionToken";

vi.mock("../../../src/middleware/auth", async (orig) => {
  const actual = (await orig()) as any;
  return {
    ...actual,
    authenticate: (req: any, _res: any, next: any) => {
      req.user = { id: "u-carrier", email: "c@srl.invalid", role: "CARRIER" };
      next();
    },
  };
});
vi.mock("../../../src/controllers/tenderController", () => ({
  acceptTender: vi.fn(async (_req: unknown, res: any) => res.status(200).json({ ok: true })),
  declineTender: vi.fn(async (_req: unknown, res: any) => res.status(200).json({ ok: true })),
}));
const mintOfferSignLink = vi.hoisted(() => vi.fn());
vi.mock("../../../src/services/rcSignLinkService", async (orig) => ({
  ...((await orig()) as object),
  mintOfferSignLink,
}));

import { acceptTender } from "../../../src/controllers/tenderController";
import tenderActionRoutes from "../../../src/routes/tenderAction";
import carrierTenderRoutes from "../../../src/routes/carrierTenders";

const db = prisma as any;
db.tokenBlacklist.createMany = vi.fn().mockResolvedValue({ count: 1 });
db.tokenBlacklist.update = vi.fn().mockResolvedValue({});

const app = express();
app.use(express.urlencoded({ extended: true }));
app.use("/api/tender-action", tenderActionRoutes);
app.use("/api/carrier-tenders", carrierTenderRoutes);

const TENDER = {
  id: "t1", status: "OFFERED", offeredRate: 2400,
  carrier: { userId: "u-carrier", companyName: "Acme Carrier" },
  load: { referenceNumber: "SRL-1", originCity: "Kalamazoo", originState: "MI", destCity: "Dallas", destState: "TX" },
};
const acceptLink = () => mintTenderActionToken({ tenderId: "t1", action: "accept", carrierUserId: "u-carrier" });
const LINK = { ok: true, link: { path: "/api/rc-sign/abc123", url: "x", token: "abc123", tokenId: "tok", expiresAt: new Date() }, rateConfirmationId: "rc-1", loadId: "load-1" };

beforeEach(() => {
  vi.clearAllMocks();
  db.loadTender.findUnique.mockResolvedValue(TENDER);
  db.tokenBlacklist.findUnique.mockResolvedValue(null);
  db.rateConfirmation.findFirst.mockResolvedValue({ id: "rc-1" });
  mintOfferSignLink.mockResolvedValue(LINK);
});

describe("the tender email's Accept, for an offer issued with its RC", () => {
  it("GET says accepting is signing and mints nothing", async () => {
    const res = await request(app).get(`/api/tender-action/${acceptLink()}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain("Accepting this load is signing its rate confirmation");
    expect(res.text).toContain("Review and sign");
    expect(mintOfferSignLink).not.toHaveBeenCalled();
  });

  it("POST mints a link and lands on the signing page; books nothing, burns nothing", async () => {
    const res = await request(app).post(`/api/tender-action/${acceptLink()}`);
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe("/api/rc-sign/abc123");
    expect(mintOfferSignLink.mock.calls[0][0]).toMatchObject({ tenderId: "t1", carrierUserId: "u-carrier", channel: "tender_email" });
    expect(acceptTender).not.toHaveBeenCalled();
    expect(db.tokenBlacklist.createMany).not.toHaveBeenCalled();
  });

  it("an offer that closed in between is refused, not booked", async () => {
    mintOfferSignLink.mockResolvedValue({ ok: false, code: "OFFER_NOT_OPEN" });
    const res = await request(app).post(`/api/tender-action/${acceptLink()}`);
    expect(res.status).toBe(409);
    expect(res.text).toContain("nothing to sign");
    expect(acceptTender).not.toHaveBeenCalled();
  });

  it("an offer with no issued RC keeps the old accept", async () => {
    db.rateConfirmation.findFirst.mockResolvedValue(null);
    const res = await request(app).post(`/api/tender-action/${acceptLink()}`);
    expect(res.status).toBe(200);
    expect(acceptTender).toHaveBeenCalledTimes(1);
    expect(mintOfferSignLink).not.toHaveBeenCalled();
  });
});

describe("the portal's Accept: POST /carrier-tenders/:id/sign-link", () => {
  it("mints for the session's carrier and 303s to the signing page", async () => {
    const res = await request(app).post("/api/carrier-tenders/t1/sign-link");
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe("/api/rc-sign/abc123");
    expect(mintOfferSignLink.mock.calls[0][0]).toMatchObject({ tenderId: "t1", carrierUserId: "u-carrier", channel: "portal" });
  });

  it("says why when there is nothing to sign", async () => {
    mintOfferSignLink.mockResolvedValue({ ok: false, code: "NO_OFFER_RC" });
    const res = await request(app).post("/api/carrier-tenders/t1/sign-link");
    expect(res.status).toBe(409);
    expect(res.text).toContain("Nothing to sign yet");
  });

  it("rate-limited is a 429 that says so", async () => {
    mintOfferSignLink.mockResolvedValue({ ok: false, code: "SIGN_LINK_RATE_LIMITED" });
    const res = await request(app).post("/api/carrier-tenders/t1/sign-link");
    expect(res.status).toBe(429);
    expect(res.text).toContain("Too many signing links");
  });
});
