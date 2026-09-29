/**
 * v3.8.boh — the carrier reads the document they are signing, and it is the
 * same document every other door serves.
 *
 * The signing page used to say "review the rate confirmation attached to the
 * email that brought you here". A carrier who arrives from the portal's Sign
 * button never got that email. GET /rc-sign/:token/document serves the stored,
 * hashed artifact through the same token, and refuses rather than re-renders
 * when that artifact cannot be read: a fresh render would be a different
 * document from the one the link signs.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "http";
import { Readable } from "stream";

const storage = vi.hoisted(() => ({ getFileStream: vi.fn(), uploadFileToPath: vi.fn().mockResolvedValue("/uploads/x.pdf") }));
vi.mock("../../../src/services/storageService", () => storage);
const pdf = vi.hoisted(() => ({ generateEnhancedRateConfirmation: vi.fn() }));
vi.mock("../../../src/services/pdfService", () => pdf);
vi.mock("../../../src/services/shipperLoadNotifyService", () => ({ sendTrackingLinkToCrmContacts: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/services/tenderTransitionService", () => ({ settleTender: vi.fn().mockResolvedValue({}) }));

import rcSignRouter from "../../../src/routes/rcSign";
import { prisma } from "../../../src/config/database";
import { hashRcSignToken } from "../../../src/lib/rcSignToken";

const mockPrisma = prisma as any;
let server: Server;
let base = "";
beforeEach(async () => {
  vi.clearAllMocks();
  if (!server) {
    const app = express();
    app.use("/rc-sign", rcSignRouter);
    await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}/rc-sign`;
  }
  mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1" });
  mockPrisma.carrierAgreement.findMany.mockResolvedValue([
    { status: "SIGNED", templateName: "broker-carrier", version: "2026-06-27-v1", signedAt: new Date(), terminatedAt: null, expiresAt: null },
  ]);
});

const TOKEN = "live-token";
const BYTES = Buffer.from("%PDF-1.7 the issued rate confirmation");
function rcRow(over: Record<string, unknown> = {}, load: Record<string, unknown> = {}) {
  return {
    id: "rc-1", loadId: "load-1", rateConNumber: "SRL-121488R",
    signTokenHash: hashRcSignToken(TOKEN), signTokenUsedAt: null,
    signTokenExpiresAt: new Date(Date.now() + 3_600_000),
    pdfUrl: "rate-confirmations/rc-rc-1-abc.pdf", contentHash: "abc123",
    signTokenId: "tok-1", carrierRate: 400, totalCharges: 710,
    load: {
      id: "load-1", referenceNumber: "R", loadNumber: "SRL-121488", originCity: "Irving", originState: "TX",
      destCity: "Northlake", destState: "TX", pickupDate: new Date("2026-09-27T00:00:00Z"), equipmentType: "Dry Van",
      carrierRate: 400, status: "BOOKED", deletedAt: null, carrierId: "u-carrier", ...load,
    },
    ...over,
  };
}

describe("GET /rc-sign/:token/document", () => {
  it("serves the stored, hashed bytes inline", async () => {
    mockPrisma.rateConfirmation.findFirst.mockResolvedValue(rcRow());
    storage.getFileStream.mockResolvedValue(Readable.from([BYTES]));
    const r = await fetch(`${base}/${TOKEN}/document`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/pdf");
    expect(r.headers.get("content-disposition")).toMatch(/^inline; filename="SRL-121488R\.pdf"/);
    expect(r.headers.get("x-srl-content-hash")).toBe("abc123");
    expect(Buffer.from(await r.arrayBuffer()).equals(BYTES)).toBe(true);
    expect(storage.getFileStream).toHaveBeenCalledWith("rate-confirmations/rc-rc-1-abc.pdf");
    expect(pdf.generateEnhancedRateConfirmation).not.toHaveBeenCalled();
  });

  it("never re-renders when the stored copy cannot be read", async () => {
    mockPrisma.rateConfirmation.findFirst.mockResolvedValue(rcRow());
    storage.getFileStream.mockRejectedValue(new Error("object store down"));
    const r = await fetch(`${base}/${TOKEN}/document`);
    expect(r.status).toBe(503);
    expect(await r.text()).toMatch(/Do not sign until you have read it/);
    expect(pdf.generateEnhancedRateConfirmation).not.toHaveBeenCalled();
  });

  it("refuses an RC with no stored artifact rather than inventing one", async () => {
    mockPrisma.rateConfirmation.findFirst.mockResolvedValue(rcRow({ pdfUrl: null, contentHash: null }));
    const r = await fetch(`${base}/${TOKEN}/document`);
    expect(r.status).toBe(503);
    expect(storage.getFileStream).not.toHaveBeenCalled();
    expect(pdf.generateEnhancedRateConfirmation).not.toHaveBeenCalled();
  });

  it("holds the same locks as the form: a used token, an expired one, a dead load", async () => {
    mockPrisma.rateConfirmation.findFirst.mockResolvedValue(rcRow({ signTokenUsedAt: new Date() }));
    expect((await fetch(`${base}/${TOKEN}/document`)).status).toBe(409);
    mockPrisma.rateConfirmation.findFirst.mockResolvedValue(rcRow({ signTokenExpiresAt: new Date(Date.now() - 1000) }));
    expect((await fetch(`${base}/${TOKEN}/document`)).status).toBe(410);
    mockPrisma.rateConfirmation.findFirst.mockResolvedValue(rcRow({}, { status: "CANCELLED" }));
    expect((await fetch(`${base}/${TOKEN}/document`)).status).toBe(409);
    mockPrisma.rateConfirmation.findFirst.mockResolvedValue(null);
    expect((await fetch(`${base}/nope/document`)).status).toBe(404);
    expect(storage.getFileStream).not.toHaveBeenCalled();
  });
});

describe("GET /rc-sign/:token (the form)", () => {
  it("links the document it signs, and does not point at an email the carrier may not have", async () => {
    mockPrisma.rateConfirmation.findFirst.mockResolvedValue(rcRow());
    const html = await (await fetch(`${base}/${TOKEN}`)).text();
    expect(html).toContain(`href="/api/rc-sign/${TOKEN}/document"`);
    expect(html).not.toMatch(/attached to the email/);
    expect(html).toContain("abc123"); // the fingerprint of what is being signed
  });

  it("states the rate confirmation's total, not the line haul alone", async () => {
    mockPrisma.rateConfirmation.findFirst.mockResolvedValue(rcRow());
    const html = await (await fetch(`${base}/${TOKEN}`)).text();
    expect(html).toContain("<strong>$710</strong>");
    expect(html).not.toContain("<strong>$400</strong>");
  });

  it("takes an older RC's FSC back out of the total it shows (v3.8.boi)", async () => {
    // FSC is internal. An RC whose totalCharges includes one must show the
    // carrier the same total the document prints: line haul plus accessorials.
    mockPrisma.rateConfirmation.findFirst.mockResolvedValue(rcRow({ totalCharges: 710, fuelSurcharge: 110 }));
    const html = await (await fetch(`${base}/${TOKEN}`)).text();
    expect(html).toContain("<strong>$600</strong>");
    expect(html).not.toContain("<strong>$710</strong>");
  });
});
