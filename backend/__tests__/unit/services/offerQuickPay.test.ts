/**
 * Item 342 (v3.8.boq) — Quick Pay decided with the offer.
 *
 * The AE records it at offer on evidence, behind the same three gates the
 * carrier's own portal choice had (pilot, signed agreement, switched on), and
 * before anything is written; the election is recorded before the rate
 * confirmation is issued, so the document prints it.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const record = vi.hoisted(() => vi.fn().mockResolvedValue({ ok: true, electionId: "e-1" }));
vi.mock("../../../src/services/quickPayElectionService", async (orig) => ({ ...((await orig()) as object), record }));
const pilot = vi.hoisted(() => vi.fn().mockResolvedValue(true));
vi.mock("../../../src/controllers/carrierController", () => ({ isQuickPayPilotApproved: pilot }));

import { prisma } from "../../../src/config/database";
import { offerQuickPayIneligibility, recordOfferQuickPay } from "../../../src/services/offerQuickPayService";
import { createTenderSchema } from "../../../src/validators/tender";

const db = prisma as any;
const QP = { speed: "SAME_DAY" as const, evidenceType: "call_timestamp" as const, evidenceRef: " 2026-09-29 10:14 " };

beforeEach(() => {
  vi.clearAllMocks();
  pilot.mockResolvedValue(true);
  db.carrierAgreement.findFirst = vi.fn().mockResolvedValue({ id: "qp-1" });
  db.carrierProfile.findUnique = vi.fn().mockResolvedValue({ quickPayEnabled: true, tier: "GOLD", quickPayVersion: "v2" });
});

describe("the three gates", () => {
  it("an eligible carrier passes", async () => {
    expect(await offerQuickPayIneligibility("cp-1")).toBeNull();
  });
  it("not in the pilot", async () => {
    pilot.mockResolvedValue(false);
    expect((await offerQuickPayIneligibility("cp-1"))?.code).toBe("QP_PILOT_NOT_APPROVED");
  });
  it("no signed Caravan Quick Pay Agreement", async () => {
    db.carrierAgreement.findFirst = vi.fn().mockResolvedValue(null);
    expect((await offerQuickPayIneligibility("cp-1"))?.code).toBe("QP_AGREEMENT_NOT_SIGNED");
    expect(db.carrierAgreement.findFirst.mock.calls[0][0].where).toMatchObject({ carrierId: "cp-1", status: "SIGNED", templateName: "quick-pay" });
  });
  it("Quick Pay switched off", async () => {
    db.carrierProfile.findUnique = vi.fn().mockResolvedValue({ quickPayEnabled: false });
    expect((await offerQuickPayIneligibility("cp-1"))?.code).toBe("QP_NOT_ENABLED");
  });
});

describe("the record", () => {
  it("is ON_BEHALF, names the AE, and carries the evidence typed and trimmed", async () => {
    await recordOfferQuickPay({ tenderId: "t-1", loadId: "load-1", carrierProfileId: "cp-1", aeUserId: "ae-1", quickPay: QP });
    expect(record.mock.calls[0][0]).toMatchObject({
      tenderId: "t-1", loadId: "load-1", carrierProfileId: "cp-1", speed: "SAME_DAY", tier: "GOLD",
      decidedVia: "ON_BEHALF", decidedByUserId: "ae-1", evidenceType: "CALL_TIMESTAMP", evidenceRef: "2026-09-29 10:14",
      quickPayVersion: "v2",
    });
  });
});

describe("the offer's validator", () => {
  const base = { carrierId: "cp-1", offeredRate: 4100, expiresAt: new Date().toISOString() };
  it("accepts an offer with no Quick Pay", () => {
    expect(createTenderSchema.safeParse(base).success).toBe(true);
  });
  it("requires evidence with a paid speed", () => {
    expect(createTenderSchema.safeParse({ ...base, quickPay: { speed: "SEVEN_DAY" } }).success).toBe(false);
    expect(createTenderSchema.safeParse({ ...base, quickPay: QP }).success).toBe(true);
  });
  it("has no STANDARD election: standard terms are the default, not a choice to record", () => {
    expect(createTenderSchema.safeParse({ ...base, quickPay: { ...QP, speed: "STANDARD" } }).success).toBe(false);
  });
});

describe("createTender records and gates in the right order", () => {
  const fs = require("fs");
  const path = require("path");
  const src = fs.readFileSync(path.resolve(__dirname, "../../../src/controllers/tenderController.ts"), "utf8");
  const fn = src.slice(src.indexOf("export async function createTender"), src.indexOf("export async function acceptTender"));
  it("gates before the tender is written", () => {
    expect(fn.indexOf("offerQuickPayIneligibility(carrierId)")).toBeGreaterThan(-1);
    expect(fn.indexOf("offerQuickPayIneligibility(carrierId)")).toBeLessThan(fn.indexOf("await createTenderRow("));
  });
  it("records before the rate confirmation is issued", () => {
    expect(fn.indexOf("recordOfferQuickPay(")).toBeGreaterThan(-1);
    expect(fn.indexOf("recordOfferQuickPay(")).toBeLessThan(fn.indexOf("issueRateConfirmationAtOffer("));
  });
});
