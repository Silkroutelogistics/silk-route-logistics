/**
 * Item 342 (v3.8.boo) — the rate confirmation is issued WITH a direct offer.
 *
 * issueRateConfirmationAtOffer drafts for the tender's carrier and runs the AE
 * send handler with issueAtOffer, so the document is frozen, hashed, numbered
 * and signable for exactly as long as the offer. The send handler's offer mode
 * (no email, no load freeze, link bound to the offer) is pinned structurally
 * below and exercised over the wire by E2E; the link lifetime is behavioural.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";

const draft = vi.hoisted(() => vi.fn());
vi.mock("../../../src/services/autoRateConfirmationService", () => ({ autoGenerateRateConfirmation: draft }));
const send = vi.hoisted(() => vi.fn());
vi.mock("../../../src/controllers/rateConfirmationController", () => ({ sendRateConfirmation: send }));

import { prisma } from "../../../src/config/database";
import { issueRateConfirmationAtOffer } from "../../../src/services/offerRateConfirmationService";
import { rotateRcSignToken } from "../../../src/services/rcSignLinkService";

const mockPrisma = prisma as any;

function tender(status = "OFFERED", contactEmail: string | null = "dispatch@carrier.test") {
  return { id: "t-1", loadId: "load-1", status, carrier: { contactEmail, companyName: "Peace Transport", user: { email: "login@carrier.test" } } };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.loadTender.findUnique = vi.fn().mockResolvedValue(tender());
  draft.mockResolvedValue({ id: "rc-1", status: "DRAFT" });
  send.mockImplementation(async (_req: any, res: any) => { res.status(200).json({ success: true }); });
});

describe("issueRateConfirmationAtOffer", () => {
  it("drafts for the tender and issues it through the send handler, in offer mode, to the dispatch desk", async () => {
    const out = await issueRateConfirmationAtOffer("t-1", "ae-1");
    expect(out).toEqual({ issued: true, rateConfirmationId: "rc-1" });
    expect(draft).toHaveBeenCalledWith("load-1", "t-1", "ae-1");
    const req = send.mock.calls[0][0];
    expect(req.params.id).toBe("rc-1");
    expect(req.issueAtOffer).toBe(true);
    expect(req.body.recipientEmail).toBe("dispatch@carrier.test");
  });

  it("falls back to the login address when the profile has no desk address", async () => {
    mockPrisma.loadTender.findUnique = vi.fn().mockResolvedValue(tender("OFFERED", null));
    await issueRateConfirmationAtOffer("t-1", "ae-1");
    expect(send.mock.calls[0][0].body.recipientEmail).toBe("login@carrier.test");
  });

  it("issues nothing for an offer that is no longer open", async () => {
    mockPrisma.loadTender.findUnique = vi.fn().mockResolvedValue(tender("DECLINED"));
    const out = await issueRateConfirmationAtOffer("t-1", "ae-1");
    expect(out).toEqual({ issued: false, reason: "tender_declined" });
    expect(draft).not.toHaveBeenCalled();
  });

  it("does not issue twice: an RC already out is reported, not re-sent", async () => {
    draft.mockResolvedValue({ id: "rc-1", status: "SENT" });
    const out = await issueRateConfirmationAtOffer("t-1", "ae-1");
    expect(out.issued).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });

  it("a refused send leaves the offer to accept-then-sign, and says why", async () => {
    send.mockImplementation(async (_req: any, res: any) => { res.status(422).json({ code: "QP_FEE_ABOVE_LADDER" }); });
    const out = await issueRateConfirmationAtOffer("t-1", "ae-1");
    expect(out).toEqual({ issued: false, rateConfirmationId: "rc-1", reason: "QP_FEE_ABOVE_LADDER" });
  });
});

describe("the signing link lives as long as the offer", () => {
  it("takes the offer's expiry when given one", async () => {
    mockPrisma.rateConfirmation.update = vi.fn().mockResolvedValue({});
    const offerEnds = new Date(Date.now() + 5 * 86_400_000);
    const link = await rotateRcSignToken("rc-1", mockPrisma, { expiresAt: offerEnds });
    expect(link.expiresAt).toEqual(offerEnds);
    expect(mockPrisma.rateConfirmation.update.mock.calls[0][0].data.signTokenExpiresAt).toEqual(offerEnds);
  });

  it("keeps the signing SLA otherwise", async () => {
    mockPrisma.rateConfirmation.update = vi.fn().mockResolvedValue({});
    const link = await rotateRcSignToken("rc-1", mockPrisma);
    const hours = (link.expiresAt.getTime() - Date.now()) / 3_600_000;
    expect(hours).toBeGreaterThan(0);
    expect(hours).toBeLessThan(48);
  });
});

describe("the send handler's offer mode", () => {
  const src = fs.readFileSync(path.resolve(__dirname, "../../../src/controllers/rateConfirmationController.ts"), "utf8");
  const code = src.split(/\r?\n/).filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  const fn = code.slice(code.indexOf("export async function sendRateConfirmation"), code.indexOf("export async function downloadRateConfirmationPdf"));

  it("prices the document on the open offer's election", () => {
    expect(fn).toMatch(/const governingTender = offerTender \?\?/);
  });
  it("binds the link to the offer's expiry", () => {
    expect(fn).toContain("rotateRcSignToken(rc.id, prisma, { expiresAt: offerTender?.expiresAt ?? null })");
  });
  it("sends no second email when issued with the offer", () => {
    expect(fn).toMatch(/if \(!issueAtOffer\) await sendRateConfirmationEmail\(/);
  });
  it("freezes nothing onto the load while the offer is open", () => {
    expect(fn).toMatch(/if \(!offerTender\) await freezeIssuedRateConfirmationOntoLoad\(/);
  });
});
