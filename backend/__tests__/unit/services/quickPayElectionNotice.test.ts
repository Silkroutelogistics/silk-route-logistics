/** v3.8.asb — the Quick Pay election notice quotes a PRICE to a carrier.
 *
 *  That makes it a pricing surface, and this project has already paid for
 *  having several: four resolvers disagreed at once, one of them keyed on
 *  retired tier names (PARTNER 1.5%, on no rung of any ladder), and a carrier
 *  could be quoted one number and charged another.
 *
 *  So the assertion that matters here is not "the email renders". It is that
 *  the percentage the carrier is TOLD is the percentage settlement CHARGES, for
 *  the same tier and the same speed, resolved from the same module. If someone
 *  later hardcodes a number into that message, or the ladder moves and the
 *  message does not, these fail.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { quickPayFeePercent, standardNetDays, normalizeTier } from "../../../src/lib/quickPayPricing";

const { mockPrisma, sentEmails, createdNotifications } = vi.hoisted(() => ({
  mockPrisma: { load: { findUnique: vi.fn() }, notification: { create: vi.fn() } },
  sentEmails: [] as { to: string; subject: string; html: string }[],
  createdNotifications: [] as { userId: string; title: string; message: string }[],
}));

vi.mock("../../../src/config/database", () => ({ prisma: mockPrisma }));
vi.mock("../../../src/services/emailService", () => ({
  sendEmail: vi.fn(async (to: string, subject: string, html: string) => {
    sentEmails.push({ to, subject, html });
    return "msg-1";
  }),
  wrap: (body: string) => body,
}));

import { notifyQuickPayElectionOpen } from "../../../src/services/notificationService";

const LOAD_ID = "load-1";

function arrangeLoad(over: Record<string, unknown> = {}) {
  mockPrisma.load.findUnique.mockResolvedValue({
    id: LOAD_ID,
    referenceNumber: "SRL-121485",
    quickPaySpeed: null,
    quickPayFeePercent: null,
    carrierId: "carrier-user-1",
    carrier: {
      email: "dispatch@carrier.test",
      carrierProfile: { tier: "GOLD", quickPayEnabled: true, contactEmail: null },
    },
    ...over,
  });
  mockPrisma.notification.create.mockImplementation(async ({ data }: any) => {
    createdNotifications.push(data);
    return data;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  sentEmails.length = 0;
  createdNotifications.length = 0;
});

describe("Quick Pay election notice", () => {
  it("quotes the SAME percentages the fee resolver charges, for that carrier's tier", async () => {
    arrangeLoad();
    await notifyQuickPayElectionOpen(LOAD_ID);

    // Resolved independently here, from the module settlement uses.
    const tier = normalizeTier("GOLD");
    const sevenDay = quickPayFeePercent(tier, false); // §8 Gold 7-day = 2
    const sameDay = quickPayFeePercent(tier, true);   // §8 Gold same-day = 4
    const net = standardNetDays(tier);                // §8 Gold = 21

    expect(sevenDay).toBe(2);
    expect(sameDay).toBe(4);
    expect(net).toBe(21);

    const message = createdNotifications[0].message;
    expect(message).toContain(`${sevenDay}% for 7-day`);
    expect(message).toContain(`${sameDay}% same day`);
    expect(message).toContain(`Net-${net}`);

    const html = sentEmails[0].html;
    expect(html).toContain(`${sevenDay}%`);
    expect(html).toContain(`${sameDay}%`);
    expect(html).toContain(`Net-${net}`);
  });

  it("prices a Silver carrier at Silver's rungs, not Gold's", async () => {
    arrangeLoad({
      carrier: {
        email: "dispatch@carrier.test",
        carrierProfile: { tier: "SILVER", quickPayEnabled: true, contactEmail: null },
      },
    });
    await notifyQuickPayElectionOpen(LOAD_ID);

    const message = createdNotifications[0].message;
    expect(message).toContain(`${quickPayFeePercent("SILVER", false)}% for 7-day`); // 3
    expect(message).toContain(`${quickPayFeePercent("SILVER", true)}% same day`);   // 5
    expect(message).toContain(`Net-${standardNetDays("SILVER")}`);                  // 30
  });

  it("same-day is the 7-day rung plus the universal two points", async () => {
    arrangeLoad();
    await notifyQuickPayElectionOpen(LOAD_ID);
    const message = createdNotifications[0].message;
    // Not a restatement of the ladder: derived from the resolver, so it holds
    // if the ladder moves.
    const derived = quickPayFeePercent("GOLD", false) + 2;
    expect(quickPayFeePercent("GOLD", true)).toBe(derived);
    expect(message).toContain(`${derived}% same day`);
  });

  it("says plainly that doing nothing costs nothing", async () => {
    arrangeLoad();
    await notifyQuickPayElectionOpen(LOAD_ID);
    // Default-off is the whole point: a carrier who ignores this is not charged.
    expect(sentEmails[0].html).toContain("no fee");
    expect(createdNotifications[0].message).toContain("free");
  });

  it("stays silent for a carrier who is not in the pilot", async () => {
    arrangeLoad({
      carrier: {
        email: "dispatch@carrier.test",
        carrierProfile: { tier: "GOLD", quickPayEnabled: false, contactEmail: null },
      },
    });
    await notifyQuickPayElectionOpen(LOAD_ID);
    expect(createdNotifications).toHaveLength(0);
    expect(sentEmails).toHaveLength(0);
  });

  it("stays silent once the carrier has already chosen", async () => {
    arrangeLoad({ quickPaySpeed: "SEVEN_DAY" });
    await notifyQuickPayElectionOpen(LOAD_ID);
    expect(createdNotifications).toHaveLength(0);
  });

  it("stays silent once the fee is frozen, which is when the window shut", async () => {
    arrangeLoad({ quickPayFeePercent: 2 });
    await notifyQuickPayElectionOpen(LOAD_ID);
    expect(createdNotifications).toHaveLength(0);
  });

  it("prefers the carrier's operational contact address over the login address", async () => {
    arrangeLoad({
      carrier: {
        email: "owner@carrier.test",
        carrierProfile: { tier: "GOLD", quickPayEnabled: true, contactEmail: "dispatch@carrier.test" },
      },
    });
    await notifyQuickPayElectionOpen(LOAD_ID);
    expect(sentEmails[0].to).toBe("dispatch@carrier.test");
  });

  it("still writes the in-app notice when there is no email address at all", async () => {
    arrangeLoad({
      carrier: { email: null, carrierProfile: { tier: "GOLD", quickPayEnabled: true, contactEmail: null } },
    });
    await notifyQuickPayElectionOpen(LOAD_ID);
    expect(createdNotifications).toHaveLength(1);
    expect(sentEmails).toHaveLength(0);
  });
});
