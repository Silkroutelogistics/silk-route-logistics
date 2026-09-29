/**
 * Item 342 (v3.8.bop) — mintOfferSignLink, the carrier's one way into an
 * offer's signing page, and the Tenders list that says which offers need it.
 *
 * Both accept doors (the tender email and the portal) mint here. It refuses
 * another carrier's tender, an offer no longer open, an offer with no issued
 * document, and a fourth link within the hour; otherwise the link lives as
 * long as the offer and the mint is audited under the channel it came from.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { mintOfferSignLink, RC_SIGN_LINK_MINTS_PER_HOUR } from "../../../src/services/rcSignLinkService";
import { getCarrierTenders } from "../../../src/controllers/tenderController";

const db = prisma as any;
const OFFER_ENDS = new Date(Date.now() + 2 * 86_400_000);

function tender(over: Record<string, unknown> = {}) {
  return { id: "t-1", loadId: "load-1", status: "OFFERED", expiresAt: OFFER_ENDS, deletedAt: null, carrier: { userId: "u-carrier" }, ...over };
}

beforeEach(() => {
  vi.clearAllMocks();
  db.loadTender.findUnique = vi.fn().mockResolvedValue(tender());
  db.rateConfirmation.findFirst = vi.fn().mockResolvedValue({ id: "rc-1" });
  db.rateConfirmation.update = vi.fn().mockResolvedValue({});
  db.auditLog.count = vi.fn().mockResolvedValue(0);
  db.auditLog.create = vi.fn().mockResolvedValue({});
});

const mint = () => mintOfferSignLink({ tenderId: "t-1", carrierUserId: "u-carrier", channel: "tender_email", ip: "1.2.3.4", userAgent: "UA" });

describe("mintOfferSignLink", () => {
  it("mints a link that lives as long as the offer, and audits the channel", async () => {
    const out = await mint();
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.link.expiresAt).toEqual(OFFER_ENDS);
    expect(out.link.path).toMatch(/^\/api\/rc-sign\/[0-9a-f]{64}$/);
    expect(db.rateConfirmation.update.mock.calls[0][0].data.signTokenExpiresAt).toEqual(OFFER_ENDS);
    expect(db.auditLog.create.mock.calls[0][0].data).toMatchObject({ userId: "u-carrier", entityId: "rc-1", action: "RC_SIGN_LINK_MINTED" });
    expect(db.auditLog.create.mock.calls[0][0].data.details.channel).toBe("tender_email");
  });

  it("refuses another carrier's tender", async () => {
    db.loadTender.findUnique = vi.fn().mockResolvedValue(tender({ carrier: { userId: "someone-else" } }));
    expect(await mint()).toEqual({ ok: false, code: "NOT_YOUR_TENDER" });
  });

  it.each([
    ["answered", { status: "ACCEPTED" }],
    ["expired", { expiresAt: new Date(Date.now() - 1000) }],
    ["deleted", { deletedAt: new Date() }],
  ])("refuses an offer that is %s", async (_label, over) => {
    db.loadTender.findUnique = vi.fn().mockResolvedValue(tender(over));
    expect(await mint()).toEqual({ ok: false, code: "OFFER_NOT_OPEN" });
    expect(db.rateConfirmation.update).not.toHaveBeenCalled();
  });

  it("refuses an offer with no issued document", async () => {
    db.rateConfirmation.findFirst = vi.fn().mockResolvedValue(null);
    expect(await mint()).toEqual({ ok: false, code: "NO_OFFER_RC" });
  });

  it("refuses past the hourly limit shared with the portal", async () => {
    db.auditLog.count = vi.fn().mockResolvedValue(RC_SIGN_LINK_MINTS_PER_HOUR);
    expect(await mint()).toEqual({ ok: false, code: "SIGN_LINK_RATE_LIMITED" });
    expect(db.rateConfirmation.update).not.toHaveBeenCalled();
  });
});

describe("the carrier's Tenders list marks the offers accepted by signing", () => {
  it("signable is true exactly for offers with an issued rate confirmation", async () => {
    db.carrierProfile.findUnique = vi.fn().mockResolvedValue({ id: "cp-1" });
    db.loadTender.findMany = vi.fn().mockResolvedValue([{ id: "t-1" }, { id: "t-2" }]);
    db.rateConfirmation.findMany = vi.fn().mockResolvedValue([{ tenderId: "t-2" }]);
    const res: any = { json: vi.fn(), status: vi.fn(() => res) };
    await getCarrierTenders({ user: { id: "u-carrier" } } as never, res);
    expect(res.json.mock.calls[0][0]).toEqual([
      { id: "t-1", signable: false },
      { id: "t-2", signable: true },
    ]);
    expect(db.rateConfirmation.findMany.mock.calls[0][0].where).toEqual({ tenderId: { in: ["t-1", "t-2"] }, status: "SENT" });
  });
});
