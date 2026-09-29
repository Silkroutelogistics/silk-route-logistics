/**
 * Item 342 (v3.8.bon) — signing a rate confirmation issued WITH the offer is
 * accepting the offer.
 *
 * Nobody is on the load yet, so the signer is the tender's carrier. The route
 * checks the agreement, claims the token, runs the accept path whole through
 * acceptTender (viaSignature), then records the signature; a refused accept
 * releases the claim so the link stays good. Real router over HTTP; prisma
 * and the accept controller mocked.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "http";

vi.mock("../../../src/services/shipperLoadNotifyService", () => ({ sendTrackingLinkToCrmContacts: vi.fn().mockResolvedValue(undefined) }));
const settleTender = vi.hoisted(() => vi.fn().mockResolvedValue({ count: 1 }));
vi.mock("../../../src/services/tenderTransitionService", () => ({ settleTender }));
vi.mock("../../../src/services/signatureCertificateService", () => ({
  generateSignatureCertificate: vi.fn(() => {
    const { PassThrough } = require("stream");
    const s = new PassThrough();
    setImmediate(() => s.end());
    return s;
  }),
}));
vi.mock("../../../src/services/storageService", () => ({ uploadFileToPath: vi.fn().mockResolvedValue("/uploads/x.pdf") }));
vi.mock("../../../src/services/integrationService", () => ({ syncSettlementDocFlags: vi.fn(async () => ({ updated: true })) }));
const acceptTender = vi.hoisted(() => vi.fn());
vi.mock("../../../src/controllers/tenderController", () => ({ acceptTender }));
const freeze = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("../../../src/services/rateConfirmationFreezeService", () => ({ freezeIssuedRateConfirmationOntoLoad: freeze }));

import rcSignRouter from "../../../src/routes/rcSign";
import { prisma } from "../../../src/config/database";
import { hashRcSignToken } from "../../../src/lib/rcSignToken";

const mockPrisma = prisma as any;
let server: Server;
let base = "";

const TOKEN = "offer-token";
function rcRow() {
  return {
    id: "rc-1", loadId: "load-1", tenderId: "t-1", rateConNumber: "121500",
    signTokenHash: hashRcSignToken(TOKEN), signTokenUsedAt: null,
    signTokenExpiresAt: new Date(Date.now() + 3_600_000),
    contentHash: "abc", signTokenId: "tok-1", carrierRate: 4100, totalCharges: 4100, fuelSurcharge: 0,
    formData: { quickPayFeePercent: 3, quickPaySpeed: "SEVEN_DAY" },
    load: {
      id: "load-1", referenceNumber: "R", loadNumber: "121500", originCity: "A", originState: "AA",
      destCity: "B", destState: "BB", pickupDate: new Date(), equipmentType: "Reefer", carrierRate: 4100,
      status: "TENDERED", deletedAt: null, carrierId: null,
    },
  };
}
const SIGNED_BCA = { status: "SIGNED", templateName: "broker-carrier", version: "v", signedAt: new Date(), terminatedAt: null, expiresAt: null };
let tx: any;

function arm(opts: { agreements?: unknown[]; expiresAt?: Date; claim?: number } = {}) {
  mockPrisma.rateConfirmation.findFirst.mockResolvedValue(rcRow());
  mockPrisma.rateConfirmation.update.mockResolvedValue({});
  mockPrisma.rateConfirmation.updateMany.mockResolvedValue({ count: opts.claim ?? 1 });
  mockPrisma.loadTender.findUnique.mockResolvedValue({
    id: "t-1", status: "OFFERED", expiresAt: opts.expiresAt ?? new Date(Date.now() + 86_400_000), carrier: { userId: "u-carrier" },
  });
  mockPrisma.loadTender.findFirst.mockResolvedValue(null);
  mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1" });
  mockPrisma.carrierAgreement.findMany.mockResolvedValue(opts.agreements ?? [SIGNED_BCA]);
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.load.findUnique.mockResolvedValue({ trackingLinkAutoSend: false });
  tx = {
    carrierProfile: { findUnique: vi.fn().mockResolvedValue({ id: "cp-1" }) },
    carrierAgreement: { findMany: vi.fn().mockResolvedValue(opts.agreements ?? [SIGNED_BCA]) },
    rateConfirmation: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    load: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
}
const post = () =>
  fetch(`${base}/${TOKEN}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signerName: "Peace Transport", attest: "yes" }),
  });

beforeEach(async () => {
  vi.clearAllMocks();
  acceptTender.mockImplementation(async (_req: any, res: any) => { res.status(200).json({ id: "t-1", status: "ACCEPTED" }); });
  if (!server) {
    const app = express();
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());
    app.use("/rc-sign", rcSignRouter);
    await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/rc-sign`;
  }
});

describe("the form says signing accepts the load", () => {
  it("checks the TENDER's carrier's agreement and labels the button accept-and-sign", async () => {
    arm();
    const r = await fetch(`${base}/${TOKEN}`);
    expect(r.status).toBe(200);
    const html = await r.text();
    expect(html).toMatch(/Signing also accepts this load/);
    expect(html).toMatch(/Accept load and sign/);
    expect(mockPrisma.carrierProfile.findUnique).toHaveBeenCalledWith({ where: { userId: "u-carrier" }, select: { id: true } });
  });

  it("an offer past its expiry has nothing to sign", async () => {
    arm({ expiresAt: new Date(Date.now() - 1000) });
    const r = await fetch(`${base}/${TOKEN}`);
    expect(r.status).toBe(410);
    expect(await r.text()).toMatch(/This offer has expired/);
  });
});

describe("POST — one act: accept, then sign", () => {
  it("claims the token, accepts through acceptTender, signs, freezes the load, and confirms the tender", async () => {
    arm();
    const r = await post();
    expect(r.status).toBe(200);
    expect(await r.text()).toMatch(/booked in your name/);

    const claim = mockPrisma.rateConfirmation.updateMany.mock.calls[0][0];
    expect(claim.where).toMatchObject({ id: "rc-1", signTokenUsedAt: null, signTokenHash: hashRcSignToken(TOKEN) });

    const acceptReq = acceptTender.mock.calls[0][0];
    expect(acceptReq.params.id).toBe("t-1");
    expect(acceptReq.user).toMatchObject({ id: "u-carrier", role: "CARRIER" });
    expect(acceptReq.viaSignature).toEqual({ rateConfirmationId: "rc-1" });

    // The signature write is scoped to the claim this request made.
    const signWrite = tx.rateConfirmation.updateMany.mock.calls[0][0];
    expect(signWrite.where.signTokenUsedAt).toBeInstanceOf(Date);
    expect(signWrite.data).toMatchObject({ signed: true, status: "SIGNED", signerName: "Peace Transport" });

    expect(freeze).toHaveBeenCalledWith({ loadId: "load-1", rateConfirmationId: "rc-1", quickPayFeePercent: 3, quickPaySpeed: "SEVEN_DAY" });
    await new Promise((r2) => setTimeout(r2, 20));
    expect(settleTender.mock.calls.map((c: any[]) => [c[0].from, c[0].to])).toEqual([
      ["ACCEPTED", "RC_SENT"],
      ["RC_SENT", "CONFIRMED"],
    ]);
  });

  it("a refused accept releases the claim, signs nothing and freezes nothing", async () => {
    arm();
    acceptTender.mockImplementation(async (_req: any, res: any) => { res.status(403).json({ error: "Carrier is no longer compliant" }); });
    const r = await post();
    expect(r.status).toBe(409);
    expect(await r.text()).toMatch(/Carrier is no longer compliant/);
    const release = mockPrisma.rateConfirmation.updateMany.mock.calls[1][0];
    expect(release.data).toEqual({ signTokenUsedAt: null });
    expect(mockPrisma.$transaction).not.toHaveBeenCalled();
    expect(freeze).not.toHaveBeenCalled();
  });

  it("no executed agreement: refused before anything is claimed or accepted", async () => {
    arm({ agreements: [] });
    const r = await post();
    expect(r.status).toBe(409);
    expect(acceptTender).not.toHaveBeenCalled();
    expect(mockPrisma.rateConfirmation.updateMany).not.toHaveBeenCalled();
  });

  it("a second submission that loses the claim accepts nothing", async () => {
    arm({ claim: 0 });
    const r = await post();
    expect(r.status).toBe(409);
    expect(await r.text()).toMatch(/This rate confirmation is signed/);
    expect(acceptTender).not.toHaveBeenCalled();
  });

  it("an expired offer is refused before the accept", async () => {
    arm({ expiresAt: new Date(Date.now() - 1000) });
    const r = await post();
    expect(r.status).toBe(410);
    expect(acceptTender).not.toHaveBeenCalled();
  });
});
