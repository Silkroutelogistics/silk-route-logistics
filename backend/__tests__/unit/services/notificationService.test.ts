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
}));

import { notifyTenderAction } from "../../../src/services/notificationService";
import {
  sendTenderOfferedEmail,
  sendTenderAcceptedEmail,
  sendTenderDeclinedEmail,
  sendTenderExpiredEmail,
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
        email: "whaider@silkroutelogistics.ai",
        firstName: "Wasi",
      },
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

      // Email: carrier primary, AE CC
      expect(sendTenderOfferedEmail).toHaveBeenCalledTimes(1);
      expect(sendTenderOfferedEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "dispatch@integrityexpress.example",
          cc: "whaider@silkroutelogistics.ai",
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
      expect(sendTenderOfferedEmail).not.toHaveBeenCalled();
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
