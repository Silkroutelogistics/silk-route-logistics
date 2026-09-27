// Sprint 45a (v3.8.abb) — Item 80 close. Regression lock for the
// notifyTenderAction email-call shape: each action variant must produce
// the right Notification record AND call the right sendTenderXxxEmail
// with the right argument shape.
//
// Why this exists: E2E B6.5g asserts the in-app Notification row is
// created, but RESEND_API_KEY is unset in the E2E env so the email path
// silently falls into the no-API logging branch (emailService.ts:55-57).
// Email shape (subject, recipient, cc, replyTo, body fields) is locked
// here at the unit boundary instead.

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the email module BEFORE importing notificationService so the
// imports inside notificationService.ts resolve to the mocks.
vi.mock("../../../src/services/emailService", () => ({
  sendTenderOfferedEmail: vi.fn().mockResolvedValue("email-id-offered"),
  sendTenderAcceptedEmail: vi.fn().mockResolvedValue("email-id-accepted"),
  sendTenderDeclinedEmail: vi.fn().mockResolvedValue("email-id-declined"),
  sendTenderExpiredEmail: vi.fn().mockResolvedValue("email-id-expired"),
  sendTenderCounteredEmail: vi.fn().mockResolvedValue("email-id-countered"),
  sendTenderAcceptedConfirmationEmail: vi.fn().mockResolvedValue("email-id-confirmation"),
}));

// Item 329 — the staff-copy test reads the REAL offer template, which sends
// through Resend inside its own module, so Resend is mocked and given a key.
// Every other test here mocks emailService outright and never reaches it.
const resendSend = vi.hoisted(() => vi.fn(async () => ({ data: { id: "re-test" }, error: null })));
vi.mock("resend", () => ({ Resend: class { emails = { send: resendSend }; } }));
vi.mock("../../../src/config/env", () => ({
  env: { JWT_SECRET: "test-secret-key-for-vitest", RESEND_API_KEY: "re_test", EMAIL_FROM: "noreply@test.com" },
}));

import { notifyTenderAction } from "../../../src/services/notificationService";
import {
  sendTenderOfferedEmail,
  sendTenderAcceptedEmail,
  sendTenderDeclinedEmail,
  sendTenderExpiredEmail,
  sendTenderCounteredEmail,
} from "../../../src/services/emailService";
import { prisma } from "../../../src/config/database";

const mockPrisma = vi.mocked(prisma);

// Tender fixture matching the prisma.loadTender.findUnique include shape
// in notifyTenderAction (load with poster, carrier with user).
function makeTender(overrides: any = {}): any {
  return {
    id: "tender-123",
    loadId: "load-abc",
    carrierId: "carrier-profile-1",
    status: "OFFERED",
    offeredRate: 4500,
    counterRate: null,
    expiresAt: new Date("2026-05-11T00:00:00Z"),
    respondedAt: null,
    createdAt: new Date(),
    deletedAt: null,
    waterfallPositionId: null,
    load: {
      id: "load-abc",
      referenceNumber: "L7492033667",
      posterId: "ae-user-1",
      originCity: "San Diego",
      originState: "CA",
      destCity: "Northlake",
      destState: "TX",
      equipmentType: "Dry Van 53'",
      weight: 25040,
      distance: 1352,
      poster: {
        id: "ae-user-1",
        email: "whaider@silkroutelogistics.ai",
        firstName: "Wasi",
        role: "BROKER",
      },
      customer: null,
    },
    carrier: {
      userId: "carrier-user-1",
      contactEmail: "dispatch@integrityexpress.example",
      companyName: "Integrity Express Logistics LLC",
      user: {
        email: "fallback@integrityexpress.example",
        firstName: "Carrier",
        lastName: "Owner",
        company: "Integrity Express",
      },
    },
    ...overrides,
  };
}

describe("notifyTenderAction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (mockPrisma.notification.create as any).mockResolvedValue({});
  });

  describe("OFFERED", () => {
    it("creates TENDER_RECEIVED notification for carrier and sends OFFERED email with AE CC", async () => {
      (mockPrisma.loadTender.findUnique as any).mockResolvedValue(makeTender());

      await notifyTenderAction("tender-123", "OFFERED");

      // In-app: TENDER_RECEIVED for carrier
      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "carrier-user-1",
            type: "TENDER_RECEIVED",
            actionUrl: "/carrier/dashboard/tenders",
          }),
        }),
      );

      // Email (Item 329): the carrier's copy carries the one-click links and no
      // CC; the AE gets a separate copy without them.
      expect(sendTenderOfferedEmail).toHaveBeenCalledTimes(2);
      const [carrierCopy, staffCopy] = (sendTenderOfferedEmail as any).mock.calls.map((c: any[]) => c[0]);
      expect(carrierCopy.acceptUrl).toContain("/api/tender-action/");
      expect(carrierCopy).not.toHaveProperty("cc");
      expect(staffCopy).toMatchObject({
        to: "whaider@silkroutelogistics.ai",
        audience: "ae",
        carrierName: "Integrity Express Logistics LLC",
      });
      expect(staffCopy.acceptUrl).toBeUndefined();
      expect(staffCopy.declineUrl).toBeUndefined();
      expect(carrierCopy).toEqual(
        expect.objectContaining({
          to: "dispatch@integrityexpress.example",
          ref: "L7492033667",
          originName: "San Diego, CA",
          destName: "Northlake, TX",
          rate: 4500,
          equipment: "Dry Van 53'",
          weight: 25040,
          milesEstimate: 1352,
          // D5 — Lane economics: $/mile + transit days
          dollarsPerMile: 4500 / 1352,
          transitDays: 1352 / 500,
        }),
      );
    });

    it("falls back to user.email when carrierProfile.contactEmail is null (Q3 sub-rule c chain)", async () => {
      (mockPrisma.loadTender.findUnique as any).mockResolvedValue(
        makeTender({
          carrier: {
            userId: "carrier-user-1",
            contactEmail: null, // primary missing
            companyName: "Integrity Express Logistics LLC",
            user: {
              email: "fallback@integrityexpress.example",
              firstName: "Carrier",
              lastName: "Owner",
              company: "Integrity Express",
            },
          },
        }),
      );

      await notifyTenderAction("tender-123", "OFFERED");

      expect(sendTenderOfferedEmail).toHaveBeenCalledWith(
        expect.objectContaining({ to: "fallback@integrityexpress.example" }),
      );
    });

    it("skips email send when neither contactEmail nor user.email is present (defensive)", async () => {
      (mockPrisma.loadTender.findUnique as any).mockResolvedValue(
        makeTender({
          carrier: {
            userId: "carrier-user-1",
            contactEmail: null,
            companyName: "X",
            user: { email: "", firstName: "X", lastName: "Y", company: null },
          },
        }),
      );

      await notifyTenderAction("tender-123", "OFFERED");

      expect(mockPrisma.notification.create).toHaveBeenCalled();
      // Only the AE's own copy goes out; nothing is sent to the missing carrier address.
      expect(sendTenderOfferedEmail).toHaveBeenCalledTimes(1);
      expect(sendTenderOfferedEmail).toHaveBeenCalledWith(expect.objectContaining({ audience: "ae" }));
    });

    it("omits transit/$/mile when distance is null (no fabricated economics)", async () => {
      (mockPrisma.loadTender.findUnique as any).mockResolvedValue(
        makeTender({
          load: {
            ...makeTender().load,
            distance: null,
          },
        }),
      );

      await notifyTenderAction("tender-123", "OFFERED");

      expect(sendTenderOfferedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          milesEstimate: null,
          dollarsPerMile: null,
          transitDays: null,
        }),
      );
    });
  });

  describe("ACCEPTED", () => {
    it("creates TENDER_ACCEPTED notification for AE poster and sends ACCEPTED email", async () => {
      (mockPrisma.loadTender.findUnique as any).mockResolvedValue(makeTender({ status: "ACCEPTED" }));

      await notifyTenderAction("tender-123", "ACCEPTED");

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "ae-user-1",
            type: "TENDER_ACCEPTED",
            actionUrl: "/dashboard/track-trace",
          }),
        }),
      );

      expect(sendTenderAcceptedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "whaider@silkroutelogistics.ai",
          ref: "L7492033667",
          carrierName: "Integrity Express Logistics LLC",
          rate: 4500,
        }),
      );
    });
  });

  describe("DECLINED", () => {
    it("creates TENDER_DECLINED notification for AE and sends DECLINED email with declineReason undefined (Item 90)", async () => {
      (mockPrisma.loadTender.findUnique as any).mockResolvedValue(makeTender({ status: "DECLINED" }));

      await notifyTenderAction("tender-123", "DECLINED");

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "ae-user-1",
            type: "TENDER_DECLINED",
          }),
        }),
      );

      expect(sendTenderDeclinedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "whaider@silkroutelogistics.ai",
          ref: "L7492033667",
          loadId: "load-abc",
          carrierName: "Integrity Express Logistics LLC",
          // Item 90 LOG OPEN: LoadTender schema has no declineReason field;
          // always undefined until added.
          declineReason: undefined,
        }),
      );
    });
  });

  describe("EXPIRED", () => {
    it("creates LOAD_UPDATE notification and sends EXPIRED email (defensive for Sprint 45b cron)", async () => {
      (mockPrisma.loadTender.findUnique as any).mockResolvedValue(makeTender({ status: "OFFERED" }));

      await notifyTenderAction("tender-123", "EXPIRED");

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "ae-user-1",
            type: "LOAD_UPDATE",
            title: "Tender Expired",
          }),
        }),
      );

      expect(sendTenderExpiredEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "whaider@silkroutelogistics.ai",
          ref: "L7492033667",
          carrierName: "Integrity Express Logistics LLC",
        }),
      );
    });
  });

  describe("COUNTERED", () => {
    it("creates in-app notification only — no email (Sprint 45b deferred per Item 89)", async () => {
      (mockPrisma.loadTender.findUnique as any).mockResolvedValue(
        makeTender({ status: "COUNTERED", counterRate: 4800 }),
      );

      await notifyTenderAction("tender-123", "COUNTERED");

      expect(mockPrisma.notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: "ae-user-1", type: "TENDER_RECEIVED" }),
        }),
      );

      // No tender email functions called for COUNTERED in Sprint 45a
      expect(sendTenderOfferedEmail).not.toHaveBeenCalled();
      expect(sendTenderAcceptedEmail).not.toHaveBeenCalled();
      expect(sendTenderDeclinedEmail).not.toHaveBeenCalled();
      expect(sendTenderExpiredEmail).not.toHaveBeenCalled();
    });
  });

  describe("missing tender", () => {
    it("logs warning and returns early — no notification, no email", async () => {
      (mockPrisma.loadTender.findUnique as any).mockResolvedValue(null);

      await notifyTenderAction("nonexistent", "OFFERED");

      expect(mockPrisma.notification.create).not.toHaveBeenCalled();
      expect(sendTenderOfferedEmail).not.toHaveBeenCalled();
    });
  });
});

// Item 329 — a load the shipper posted in their portal has the SHIPPER as its
// poster. Every tender email and in-app row went to the poster, so the shipper
// received the carrier's rate and name, and was CC'd on the carrier's offer with
// its one-click accept and decline links.
describe("Item 329: a shipper-posted load", () => {
  const SHIPPER = { id: "shipper-user-1", email: "logistics@shipper.example", firstName: "Sam", role: "SHIPPER" };
  const REP = { id: "rep-user-1", email: "rep@silkroutelogistics.ai", role: "ACCOUNT_EXECUTIVE", isActive: true };
  const shipperLoad = (accountRep: typeof REP | null) =>
    makeTender({ counterRate: 4800, load: { ...makeTender().load, posterId: SHIPPER.id, poster: SHIPPER, customer: { accountRep } } });
  const emailsSent = () =>
    [sendTenderOfferedEmail, sendTenderAcceptedEmail, sendTenderDeclinedEmail, sendTenderExpiredEmail, sendTenderCounteredEmail]
      .flatMap((fn: any) => fn.mock.calls.map((c: any[]) => c[0]));
  const inAppUsers = () => (mockPrisma.notification.create as any).mock.calls.map((c: any[]) => c[0].data.userId);

  beforeEach(() => {
    vi.clearAllMocks();
    (mockPrisma.notification.create as any).mockResolvedValue({});
  });

  it.each(["OFFERED", "ACCEPTED", "DECLINED", "EXPIRED", "COUNTERED"] as const)(
    "%s reaches the account rep, never the shipper, and only the carrier gets a link",
    async (action) => {
      (mockPrisma.loadTender.findUnique as any).mockResolvedValue(shipperLoad(REP));
      await notifyTenderAction("tender-123", action);
      const sent = emailsSent();
      expect(sent.map((e) => e.to)).toContain(REP.email);
      for (const e of sent) {
        expect([e.to, e.cc].flat()).not.toContain(SHIPPER.email);
        if (e.to !== "dispatch@integrityexpress.example") expect(e.acceptUrl ?? e.declineUrl).toBeUndefined();
      }
      expect(inAppUsers()).not.toContain(SHIPPER.id);
    },
  );

  it("with no active staff on the load, staff mail goes to operations@ once and no one gets an in-app row", async () => {
    (mockPrisma.loadTender.findUnique as any).mockResolvedValue(shipperLoad({ ...REP, isActive: false }));
    await notifyTenderAction("tender-123", "ACCEPTED");
    const [mail] = (sendTenderAcceptedEmail as any).mock.calls.map((c: any[]) => c[0]);
    expect(mail.to).toBe("operations@silkroutelogistics.ai");
    expect(mail.cc).toBeUndefined();
    expect(inAppUsers()).toEqual([]);
  });

  it("the staff copy's real template carries no action link, even when links are passed", async () => {
    const real = await vi.importActual<typeof import("../../../src/services/emailService")>(
      "../../../src/services/emailService",
    );
    const offer = {
      ref: "L1", originName: "Lebanon, NH", destName: "North Lake, TX", rate: 4500,
      expiresAt: new Date("2026-05-11T00:00:00Z"), equipment: "Reefer",
      acceptUrl: "https://api.silkroutelogistics.ai/api/tender-action/ACCEPT-TOKEN",
      declineUrl: "https://api.silkroutelogistics.ai/api/tender-action/DECLINE-TOKEN",
    };
    await real.sendTenderOfferedEmail({ ...offer, to: "dispatch@carrier.example" });
    await real.sendTenderOfferedEmail({ ...offer, to: REP.email, audience: "ae", carrierName: "Acme" });
    const [carrierMail, staffMail] = resendSend.mock.calls.map((c: any[]) => c[0]);
    expect(carrierMail.html).toContain("ACCEPT-TOKEN"); // the control: the same template does render links
    for (const s of ["ACCEPT-TOKEN", "DECLINE-TOKEN", "/carrier/login"]) expect(staffMail.html).not.toContain(s);
    expect(staffMail.cc).toBeUndefined();
    expect(staffMail.subject).toMatch(/^Tender sent: L1 /);
  }, 30_000); // loads the real emailService and @sentry/node, seconds on a busy box
});
