/**
 * The withdrawal notice says something true about where the application stands.
 *
 * THE TEST THAT EXISTED ASSERTED THE NOTIFIER WAS CALLED, and nothing about
 * what it said. infoRequestClosedOnTransition.test.ts mocks
 * notifyInfoRequestWithdrawn and checks the call, so the sentence inside it was
 * never read by any guard — the check ran and was not checking what its name
 * implies (§19 Sub-pattern 16). The defect it missed shipped to production: a
 * carrier written to REJECTED received an email reading "Your application is
 * back with our review team."
 *
 * So this renders the REAL template and reads the sentence out of the HTML that
 * would have been sent. A mock at this boundary would reproduce the same
 * blindness one layer down.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

vi.mock("../../../src/services/emailService", () => ({
  sendEmail: vi.fn().mockResolvedValue(undefined),
  wrap: (s: string) => s,
}));

import { sendEmail } from "../../../src/services/emailService";
import { notifyInfoRequestWithdrawn } from "../../../src/services/onboardingLifecycleService";

const mockPrisma = vi.mocked(prisma);
const mockSend = vi.mocked(sendEmail);

const BACK_TO_REVIEW = /back with our review team/i;
const OTHERS_STAND = /other open requests still stand/i;

/** The HTML body of the one email this notice sends. */
function sentHtml(): string {
  expect(mockSend, "no email was sent at all").toHaveBeenCalled();
  return String(mockSend.mock.calls[0][2]);
}

/** The in-app row's actionUrl, which is also announceOnce's dedup key. */
function actionUrl(): string {
  const call = mockPrisma.notification.create.mock.calls[0][0] as { data: { actionUrl: string } };
  return call.data.actionUrl;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockPrisma.carrierProfile.findUnique.mockResolvedValue({
    userId: "carrier-user-1",
    user: { email: "dispatch@acme.invalid" },
  } as never);
  // announceOnce dedups on (userId, actionUrl). No prior row.
  mockPrisma.notification.findFirst.mockResolvedValue(null as never);
  mockPrisma.notification.create.mockResolvedValue({} as never);
});

describe("the withdrawal notice tells the truth about the application", () => {
  it("a manual withdrawal of the last open request says the file is back in review", async () => {
    await notifyInfoRequestWithdrawn({
      carrierId: "cp-1",
      requestId: "ir-1",
      categoryLabel: "Updated Certificate of Insurance (COI)",
    });
    expect(sentHtml()).toMatch(BACK_TO_REVIEW);
  });

  it("a manual withdrawal while others are open does NOT claim the file moved", async () => {
    // cancelInfoRequest returns the status to REVIEWING only when the request it
    // closed was the last one open. With two open, nothing moved — and
    // concurrent requests are what this arc set out to enable, so this case is
    // reachable for the first time.
    await notifyInfoRequestWithdrawn({
      carrierId: "cp-1",
      requestId: "ir-1",
      categoryLabel: "Voided check (for Quick Pay setup)",
      othersStillOpen: true,
    });
    const html = sentHtml();
    expect(html).not.toMatch(BACK_TO_REVIEW);
    expect(html).toMatch(OTHERS_STAND);
  });

  for (const status of ["APPROVED", "REJECTED", "SUSPENDED"] as const) {
    it(`a ${status} status close never claims the application is back in review`, async () => {
      await notifyInfoRequestWithdrawn({
        carrierId: "cp-1",
        requestId: "ir-1",
        categoryLabel: "Updated W-9 form",
        closedByStatus: status,
      });
      const html = sentHtml();
      expect(
        html,
        `a carrier written to ${status} was told their application is back with the review team`,
      ).not.toMatch(BACK_TO_REVIEW);
      // Nor does it invent a second account of the decision — the approval and
      // rejection emails own that, and two messages disagreeing is worse than
      // one saying less.
      expect(html).not.toMatch(OTHERS_STAND);
      // What it must still say, because this is the whole point of the notice.
      expect(html).toMatch(/no longer need it/i);
    });
  }

  it("an approved carrier is not sent to the page the layout bounces them off", async () => {
    // The dashboard layout redirects APPROVED carriers away from
    // /carrier/dashboard/application-status. The arc cited that redirect as the
    // reason an approved carrier may not be ASKED, and then linked them there.
    await notifyInfoRequestWithdrawn({
      carrierId: "cp-1",
      requestId: "ir-1",
      categoryLabel: "Updated W-9 form",
      closedByStatus: "APPROVED",
    });
    expect(actionUrl()).toMatch(/^\/carrier\/dashboard\?/);
    expect(sentHtml()).not.toMatch(/carrier\/dashboard\/application-status/);
  });

  it("a rejected carrier still goes to the status page, because they are routed there", async () => {
    await notifyInfoRequestWithdrawn({
      carrierId: "cp-1",
      requestId: "ir-1",
      categoryLabel: "Updated W-9 form",
      closedByStatus: "REJECTED",
    });
    expect(actionUrl()).toMatch(/^\/carrier\/dashboard\/application-status\?/);
  });

  it("the dedup key stays unique per request whichever page it points at", () => {
    // announceOnce keys on (userId, actionUrl). Varying the path per status must
    // not collapse two requests onto one key, or the second notice is silently
    // suppressed forever.
    const keys = new Set<string>();
    for (const path of ["/carrier/dashboard", "/carrier/dashboard/application-status"]) {
      for (const id of ["ir-1", "ir-2"]) keys.add(`${path}?withdrawn=${id}`);
    }
    expect(keys.size).toBe(4);
  });
});
