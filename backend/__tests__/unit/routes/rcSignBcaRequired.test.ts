/**
 * /rc-sign/:token refuses a carrier with no executed Broker-Carrier Agreement —
 * BCA Commit 2 (§14 AGREEMENT_MISSING, the backstop behind v3.8.beh's gate).
 *
 * A rate confirmation is signed UNDER the BCA. The tender gate already refuses
 * an unsigned carrier a tender (absolute), and the send path is not gated by
 * ruling D2, so the one way an unsigned carrier reaches this page is a
 * termination between accept and send. This is the last lock: the GET shows a
 * sign-first page instead of the form, the POST re-evaluates the agreement
 * INSIDE the transaction that writes the signature and, on a refusal, writes
 * nothing, consumes no token, and records the refusal as an audit row.
 *
 * Real router over HTTP; prisma mocked. The transaction client handed to the
 * route is a DISTINCT object from the global mock, so "the verdict is read
 * through the tx client" is observed by which findMany was called, not by a
 * grep for `tx` (section 19 Sub-pattern 16).
 *
 * Adversarially verified at authoring: removing the verdict from the
 * transaction (writing unconditionally) turns the three POST-refusal cases red
 * with updateMany called; reading the verdict off `prisma` instead of `tx`
 * turns the tx-client case red; dropping the GET check turns the three GET
 * cases red.
 */
import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "http";

vi.mock("../../../src/services/shipperLoadNotifyService", () => ({ sendTrackingLinkToCrmContacts: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../../../src/services/tenderTransitionService", () => ({ settleTender: vi.fn().mockResolvedValue({}) }));
vi.mock("../../../src/services/signatureCertificateService", () => ({
  generateSignatureCertificate: vi.fn(() => {
    const { PassThrough } = require("stream");
    const s = new PassThrough();
    setImmediate(() => s.end());
    return s;
  }),
}));
vi.mock("../../../src/services/storageService", () => ({ uploadFileToPath: vi.fn().mockResolvedValue("/uploads/x.pdf") }));

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
    app.use(express.urlencoded({ extended: false }));
    app.use(express.json());
    app.use("/rc-sign", rcSignRouter);
    await new Promise<void>((r) => { server = app.listen(0, "127.0.0.1", () => r()); });
    const addr = server.address() as { port: number };
    base = `http://127.0.0.1:${addr.port}/rc-sign`;
  }
});

const TOKEN = "live-token-for-a-live-load";
const CARRIER_USER = "u-carrier";
function rcRow() {
  return {
    id: "rc-1", loadId: "load-1", rateConNumber: "SRL-1R",
    signTokenHash: hashRcSignToken(TOKEN), signTokenUsedAt: null,
    signTokenExpiresAt: new Date(Date.now() + 3_600_000),
    contentHash: "abc", signTokenId: "tok-1", carrierRate: 4100,
    load: {
      id: "load-1", referenceNumber: "R", loadNumber: "SRL-1", originCity: "A", originState: "AA",
      destCity: "B", destState: "BB", pickupDate: new Date(), equipmentType: "Reefer", carrierRate: 4100,
      status: "BOOKED", deletedAt: null, carrierId: CARRIER_USER,
    },
  };
}
const SIGNED = { status: "SIGNED", templateName: "broker-carrier", version: "2026-06-27-v1", signedAt: new Date(), terminatedAt: null, expiresAt: null };
const ACKNOWLEDGED = { ...SIGNED, status: "ACKNOWLEDGED", signedAt: null };
const TERMINATED = { ...SIGNED, status: "TERMINATED", signedAt: new Date(Date.now() - 864e5), terminatedAt: new Date(), terminationReason: "test" };
const QP_SIGNED = { ...SIGNED, templateName: "quick-pay" };

/** A transaction client that is NOT the global mock, so the two are tellable apart. */
function txClient(agreements: unknown[]) {
  return {
    carrierProfile: { findUnique: vi.fn().mockResolvedValue({ id: "cp-1" }) },
    carrierAgreement: { findMany: vi.fn().mockResolvedValue(agreements) },
    rateConfirmation: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  };
}

function arm(globalAgreements: unknown[], txAgreements = globalAgreements) {
  mockPrisma.rateConfirmation.findFirst.mockResolvedValue(rcRow());
  mockPrisma.rateConfirmation.update.mockResolvedValue({});
  mockPrisma.carrierProfile.findUnique.mockResolvedValue({ id: "cp-1" });
  mockPrisma.carrierAgreement.findMany.mockResolvedValue(globalAgreements);
  mockPrisma.auditLog.create.mockResolvedValue({});
  mockPrisma.loadTender.findFirst.mockResolvedValue(null);
  mockPrisma.load.findUnique.mockResolvedValue({ trackingLinkAutoSend: false });
  const tx = txClient(txAgreements);
  mockPrisma.$transaction.mockImplementation(async (fn: any) => fn(tx));
  return tx;
}

const post = (body = { signerName: "Peace Transport", attest: "yes" }) =>
  fetch(`${base}/${TOKEN}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("GET — the sign-first page instead of the form", () => {
  it("no BCA rows at all → 409, says to sign the agreement, links the activation page, and says the link is still good", async () => {
    arm([]);
    const r = await fetch(`${base}/${TOKEN}`);
    expect(r.status).toBe(409);
    const html = await r.text();
    expect(html).toMatch(/Sign the Broker-Carrier Agreement first/);
    expect(html).toContain("/carrier/dashboard/activation");
    expect(html).toMatch(/link is still good/);
    expect(html).not.toMatch(/name="signerName"/);
  });

  it("the registration click-wrap (ACKNOWLEDGED) and a signed Quick Pay row do NOT count", async () => {
    arm([ACKNOWLEDGED, QP_SIGNED]);
    const r = await fetch(`${base}/${TOKEN}`);
    expect(r.status).toBe(409);
    expect(await r.text()).toMatch(/Sign the Broker-Carrier Agreement first/);
  });

  it("a TERMINATED agreement → 409 with its own copy, pointing at operations@", async () => {
    arm([TERMINATED]);
    const r = await fetch(`${base}/${TOKEN}`);
    expect(r.status).toBe(409);
    const html = await r.text();
    expect(html).toMatch(/terminated/i);
    expect(html).toContain("operations@silkroutelogistics.ai");
    expect(html).not.toMatch(/Sign the Broker-Carrier Agreement first/);
  });

  it("control: a SIGNED row of ANY version reaches the form (D1)", async () => {
    arm([SIGNED]);
    const r = await fetch(`${base}/${TOKEN}`);
    expect(r.status).toBe(200);
    expect(await r.text()).toMatch(/name="signerName"/);
  });
});

describe("POST — refused inside the transaction: no write, no token consumed, one audit row", () => {
  it("MISSING → 409, updateMany never called, RC_SIGN_REFUSED written against the carrier with reason BCA_REQUIRED", async () => {
    const tx = arm([]);
    const r = await post();
    expect(r.status).toBe(409);
    expect(await r.text()).toMatch(/Sign the Broker-Carrier Agreement first/);
    expect(tx.rateConfirmation.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.rateConfirmation.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.rateConfirmation.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).toHaveBeenCalledTimes(1);
    const row = mockPrisma.auditLog.create.mock.calls[0][0].data;
    expect(row).toMatchObject({ userId: CARRIER_USER, action: "RC_SIGN_REFUSED", entity: "Security" });
    expect(row.details).toMatchObject({ reason: "BCA_REQUIRED", rateConfirmationId: "rc-1", loadId: "load-1" });
  });

  it("TERMINATED → 409, nothing written, audit reason AGREEMENT_TERMINATED", async () => {
    const tx = arm([TERMINATED]);
    const r = await post();
    expect(r.status).toBe(409);
    expect(await r.text()).toContain("operations@silkroutelogistics.ai");
    expect(tx.rateConfirmation.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create.mock.calls[0][0].data.details.reason).toBe("AGREEMENT_TERMINATED");
  });

  it("the verdict is read through the TRANSACTION client, not the global one", async () => {
    // The tx client says SIGNED; the global mock says nothing at all. If the
    // route read the global client it would refuse; it must sign.
    const tx = arm([], [SIGNED]);
    const r = await post();
    expect(r.status).toBe(200);
    expect(tx.carrierAgreement.findMany).toHaveBeenCalledTimes(1);
    expect(tx.carrierProfile.findUnique).toHaveBeenCalledTimes(1);
    expect(mockPrisma.carrierAgreement.findMany).not.toHaveBeenCalled();
    expect(tx.rateConfirmation.updateMany).toHaveBeenCalledTimes(1);
  });

  it("control: SIGNED → 200 'Signed', the scoped write runs once inside the transaction, no audit refusal", async () => {
    const tx = arm([SIGNED]);
    const r = await post();
    expect(r.status).toBe(200);
    expect(await r.text()).toMatch(/Signed/);
    expect(tx.rateConfirmation.updateMany).toHaveBeenCalledTimes(1);
    expect(tx.rateConfirmation.updateMany.mock.calls[0][0].where).toEqual({ id: "rc-1", signTokenUsedAt: null });
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  it("a load with no carrier is MISSING (nobody to bind): 409, no write, and no audit row because there is no user to hang it on", async () => {
    const tx = arm([SIGNED]);
    mockPrisma.rateConfirmation.findFirst.mockResolvedValue({ ...rcRow(), load: { ...rcRow().load, carrierId: null } });
    const r = await post();
    expect(r.status).toBe(409);
    expect(tx.rateConfirmation.updateMany).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });
});
