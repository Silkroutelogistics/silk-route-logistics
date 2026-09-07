/**
 * Confirming a driver's code proves the handset on the load.
 *
 * Arc 19 built this service and its two routes, and nothing in the carrier
 * portal ever called them (the audit's "UI controls promising behaviour no
 * code grants" lens, inverted: a backend nothing could reach). The panel that
 * reaches them is the next commit; this pins what it will get back.
 *
 * Phase 0 of the mandatory-ELD arc.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../../src/config/database", () => ({
  prisma: {
    load: { findUnique: vi.fn(), update: vi.fn() },
    driverPhoneVerification: { findFirst: vi.fn(), update: vi.fn(), create: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => Promise.all(ops)),
  },
}));
vi.mock("../../../src/services/openPhoneService", () => ({ sendSMS: vi.fn().mockResolvedValue({ ok: true }) }));
vi.mock("../../../src/services/smsComplianceService", () => ({ recordReconsent: vi.fn().mockResolvedValue(undefined) }));

import { prisma } from "../../../src/config/database";
import { sendSMS } from "../../../src/services/openPhoneService";
import { recordReconsent } from "../../../src/services/smsComplianceService";
import {
  startDriverVerification,
  confirmDriverVerification,
  DRIVER_SMS_CONSENT_TEXT,
} from "../../../src/services/driverVerificationService";

const db = prisma as unknown as {
  load: { findUnique: ReturnType<typeof vi.fn>; update: ReturnType<typeof vi.fn> };
  driverPhoneVerification: {
    findFirst: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  $transaction: ReturnType<typeof vi.fn>;
};

const PHONE = "+12692206760";
const future = () => new Date(Date.now() + 5 * 60_000);

describe("startDriverVerification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("normalises the number, records a six-digit code and texts it", async () => {
    db.load.findUnique.mockResolvedValue({ id: "L1", referenceNumber: "SRL-1", driverPhoneVerified: null, driverPhoneVerifiedAt: null });
    const r = await startDriverVerification({ loadId: "L1", phone: "(269) 220-6760", driverName: "Sam Tran" });
    expect(r).toEqual({ ok: true, phone: PHONE });
    const created = db.driverPhoneVerification.create.mock.calls[0][0].data;
    expect(created.phone).toBe(PHONE);
    expect(created.code).toMatch(/^\d{6}$/);
    expect(sendSMS).toHaveBeenCalledWith(PHONE, expect.stringContaining(created.code));
    // The load carries the name and the normalised number before the code is proven.
    expect(db.load.update.mock.calls[0][0].data).toMatchObject({ driverName: "Sam Tran", driverPhone: PHONE });
  });

  it("refuses a number that is not a US mobile", async () => {
    const r = await startDriverVerification({ loadId: "L1", phone: "12" });
    expect(r.ok).toBe(false);
    expect(db.driverPhoneVerification.create).not.toHaveBeenCalled();
  });

  it("does not re-text a number already proven on this load", async () => {
    db.load.findUnique.mockResolvedValue({ id: "L1", referenceNumber: "SRL-1", driverPhoneVerified: PHONE, driverPhoneVerifiedAt: new Date() });
    const r = await startDriverVerification({ loadId: "L1", phone: PHONE });
    expect(r).toEqual({ ok: true, phone: PHONE, alreadyVerified: true });
    expect(sendSMS).not.toHaveBeenCalled();
  });
});

describe("confirmDriverVerification", () => {
  beforeEach(() => vi.clearAllMocks());

  it("the right code sets driverPhoneVerified on the load, with consent, in one transaction", async () => {
    db.driverPhoneVerification.findFirst.mockResolvedValue({ id: "V1", phone: PHONE, code: "123456", attempts: 0, expiresAt: future() });
    const r = await confirmDriverVerification({ loadId: "L1", code: "123456", consented: true });
    expect(r.ok).toBe(true);
    expect(r.verifiedAt).toBeInstanceOf(Date);
    expect(db.$transaction).toHaveBeenCalledTimes(1);
    const loadWrite = db.load.update.mock.calls[0][0];
    expect(loadWrite.where).toEqual({ id: "L1" });
    expect(loadWrite.data.driverPhoneVerified).toBe(PHONE);
    expect(loadWrite.data.driverPhoneVerifiedAt).toBeInstanceOf(Date);
    expect(loadWrite.data.driverConsentText).toBe(DRIVER_SMS_CONSENT_TEXT);
    expect(recordReconsent).toHaveBeenCalledWith(PHONE);
  });

  it("a wrong code counts an attempt and proves nothing", async () => {
    db.driverPhoneVerification.findFirst.mockResolvedValue({ id: "V1", phone: PHONE, code: "123456", attempts: 0, expiresAt: future() });
    const r = await confirmDriverVerification({ loadId: "L1", code: "000000", consented: true });
    expect(r.ok).toBe(false);
    expect(db.driverPhoneVerification.update.mock.calls[0][0].data).toEqual({ attempts: { increment: 1 } });
    expect(db.load.update).not.toHaveBeenCalled();
  });

  it("no consent, no verification, no database read", async () => {
    const r = await confirmDriverVerification({ loadId: "L1", code: "123456", consented: false });
    expect(r.ok).toBe(false);
    expect(db.driverPhoneVerification.findFirst).not.toHaveBeenCalled();
  });

  it("an expired code is refused", async () => {
    db.driverPhoneVerification.findFirst.mockResolvedValue({ id: "V1", phone: PHONE, code: "123456", attempts: 0, expiresAt: new Date(Date.now() - 1000) });
    const r = await confirmDriverVerification({ loadId: "L1", code: "123456", consented: true });
    expect(r.ok).toBe(false);
    expect(db.load.update).not.toHaveBeenCalled();
  });
});
