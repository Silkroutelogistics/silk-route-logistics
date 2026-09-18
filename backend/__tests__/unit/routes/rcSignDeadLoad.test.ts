/**
 * /rc-sign/:token refuses a dead load — checked against the LOAD, not the token.
 *
 * The cascade voids a live rate confirmation and nulls its token on cancel
 * (B4a). This is the second lock on the same door: a token that is still
 * valid — minted before the cancellation, or one the cascade somehow missed —
 * must be refused because the load row says CANCELLED, TONU, or deleted. The
 * token proves who is asking; the load decides whether there is anything left
 * to sign. Before this, the route checked the token alone and would take a
 * carrier's signature on a load that no longer existed, tell them "the load is
 * confirmed", and fan the tracking link out to the customer.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "http";

vi.mock("../../../src/services/shipperLoadNotifyService", () => ({ sendTrackingLinkToCrmContacts: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/services/tenderTransitionService", () => ({ settleTender: vi.fn().mockResolvedValue({}) }));

import rcSignRouter, { loadIsDead } from "../../../src/routes/rcSign";
import { prisma } from "../../../src/config/database";
import { hashRcSignToken } from "../../../src/lib/rcSignToken";

const mockPrisma = prisma as any;

let server: Server;
let base = "";
beforeEach(async () => {
  vi.clearAllMocks();
  if (!server) {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());
    app.use("/rc-sign", rcSignRouter);
    await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
    const addr = server.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}/rc-sign`;
  }
});

const TOKEN = "still-valid-token";
function rcRow(load: { status: string; deletedAt: Date | null }) {
  return {
    id: "rc-1", loadId: "load-1",
    signTokenHash: hashRcSignToken(TOKEN), signTokenUsedAt: null,
    signTokenExpiresAt: new Date(Date.now() + 3_600_000),
    contentHash: "abc", signTokenId: "tok-1",
    load: { id: "load-1", referenceNumber: "R", loadNumber: "SRL-1", originCity: "A", originState: "AA",
      destCity: "B", destState: "BB", pickupDate: new Date(), equipmentType: "Reefer", carrierRate: 1, ...load },
  };
}

describe("loadIsDead", () => {
  it("is true for CANCELLED, TONU, and any soft-deleted load; false for a live one", () => {
    expect(loadIsDead({ status: "CANCELLED", deletedAt: null })).toBe(true);
    expect(loadIsDead({ status: "TONU", deletedAt: null })).toBe(true);
    expect(loadIsDead({ status: "BOOKED", deletedAt: new Date() })).toBe(true);
    expect(loadIsDead({ status: "BOOKED", deletedAt: null })).toBe(false);
    expect(loadIsDead({ status: "RC_SENT" as any, deletedAt: null })).toBe(false);
  });
});

describe("GET + POST /rc-sign/:token on a dead load with a still-valid token", () => {
  for (const dead of [
    { status: "CANCELLED", deletedAt: null },
    { status: "TONU", deletedAt: null },
    { status: "BOOKED", deletedAt: new Date() },
  ]) {
    const label = dead.deletedAt ? "soft-deleted" : dead.status;
    it(`GET → 409 on a ${label} load, and the page says the load is cancelled`, async () => {
      mockPrisma.rateConfirmation.findFirst.mockResolvedValue(rcRow(dead));
      const r = await fetch(`${base}/${TOKEN}`);
      expect(r.status).toBe(409);
      expect(await r.text()).toMatch(/cancelled/i);
    });

    it(`POST → 409 on a ${label} load and NOTHING is recorded`, async () => {
      mockPrisma.rateConfirmation.findFirst.mockResolvedValue(rcRow(dead));
      const r = await fetch(`${base}/${TOKEN}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ signerName: "Peace Transport", attest: "yes" }),
      });
      expect(r.status).toBe(409);
      expect(mockPrisma.rateConfirmation.update).not.toHaveBeenCalled();
      expect(mockPrisma.rateConfirmation.updateMany).not.toHaveBeenCalled();
    });
  }

  // The control that makes the 409s above meaningful: the SAME token on a LIVE
  // load reaches the form. Without this a route that 409'd everything would be
  // green (§19 Sub-pattern 16).
  it("GET → 200 with the form on a live load (control)", async () => {
    mockPrisma.rateConfirmation.findFirst.mockResolvedValue(rcRow({ status: "BOOKED", deletedAt: null }));
    const r = await fetch(`${base}/${TOKEN}`);
    expect(r.status).toBe(200);
    expect(await r.text()).toMatch(/sign/i);
  });
});
