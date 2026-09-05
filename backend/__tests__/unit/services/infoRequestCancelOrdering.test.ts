/**
 * cancelInfoRequest — the withdrawal notice waits for the commit.
 *
 * WHY THE ORDER MATTERS MORE THAN IT LOOKS. announceOnce keys its dedup on the
 * notification's actionUrl, and that URL embeds the requestId. So a notice sent
 * for a cancel that then FAILED does not merely arrive early — it permanently
 * suppresses the correct notice on a later successful retry. The carrier is
 * told to stop work on a request that is still open, and can never be told
 * anything about it again. An early notice is not a timing nit; it is a
 * one-shot, unrecoverable wrong answer.
 *
 * THE COMMENT THAT USED TO JUSTIFY THE OLD ORDER WAS FALSE. It read "fired
 * before the transaction returns so a caller that ignores the promise still
 * triggers it" — but an async function body runs to completion on microtasks
 * whether or not its promise is awaited, and the sole caller awaits anyway. Git
 * shows both notify calls were added in ONE commit with opposite orderings, so
 * the asymmetry with resolveInfoRequest was accidental.
 *
 * THE ORDER ASSERTION IS THE LOCK, not the not-called one. A rejecting
 * transaction distinguishes the two orderings, but a future revert would still
 * pass every guard-path case — so the happy path records the actual sequence.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";

const mockPrisma = prisma as any;

// vi.hoisted is mandatory, not stylistic. infoRequestService has a STATIC
// top-level import of onboardingLifecycleService, so a factory closing over a
// plain const declared above it hits the temporal dead zone and fails the whole
// file with "Cannot access X before initialization".
const { order, notifyWithdrawn, confirmAnswered } = vi.hoisted(() => {
  const order: string[] = [];
  return {
    order,
    notifyWithdrawn: vi.fn(async () => {
      order.push("notify");
      return true;
    }),
    confirmAnswered: vi.fn(async () => true),
  };
});

// The whole module is replaced, so BOTH exports the service imports must be
// supplied. A factory with only notifyInfoRequestWithdrawn makes
// resolveInfoRequest throw "confirmInfoRequestAnswered is not a function".
//
// Mocked rather than left real for a second reason: announceOnce calls
// prisma.notification.findFirst, which the shared setup.ts does not define. The
// real path would throw "is not a function" at the call site and read as a code
// bug — the v3.8.alh class.
vi.mock("../../../src/services/onboardingLifecycleService", () => ({
  notifyInfoRequestWithdrawn: notifyWithdrawn,
  confirmInfoRequestAnswered: confirmAnswered,
}));

// §19 Sub-pattern 20 — outbound dead by construction.
vi.mock("../../../src/services/emailService", async (orig) => {
  const actual = (await orig()) as any;
  return { ...actual, sendEmail: vi.fn() };
});

import { cancelInfoRequest } from "../../../src/services/infoRequestService";

const OPEN_REQUEST = {
  id: "ir-1",
  status: "OPEN",
  carrierId: "carrier-1",
  category: "COI_UPDATE",
  carrier: { onboardingStatus: "INFO_REQUESTED" },
};

beforeEach(() => {
  vi.clearAllMocks();
  order.length = 0;

  mockPrisma.infoRequest = { findUnique: vi.fn(), update: vi.fn(), count: vi.fn() };
  mockPrisma.infoRequest.findUnique.mockResolvedValue(OPEN_REQUEST);
  mockPrisma.infoRequest.update.mockResolvedValue({ id: "ir-1", status: "CANCELLED" });
  mockPrisma.infoRequest.count.mockResolvedValue(0);
  mockPrisma.carrierProfile.update.mockResolvedValue({});

  // $transaction in setup.ts is a bare vi.fn() with no implementation, so it
  // returns undefined and never runs its callback unless configured. Re-set
  // every test because clearAllMocks clears history, not implementations.
  mockPrisma.$transaction.mockImplementation(async (cb: any) => {
    const out = await cb(mockPrisma);
    order.push("commit");
    return out;
  });
});

describe("a successful cancel notifies, and only after the commit", () => {
  it("tells the carrier exactly once", async () => {
    await cancelInfoRequest({ requestId: "ir-1", cancelledById: "u-admin" });
    expect(notifyWithdrawn).toHaveBeenCalledTimes(1);
  });

  it("notifies AFTER the transaction commits, not before", async () => {
    // The lock. `not.toHaveBeenCalled()` under a rejecting transaction
    // distinguishes the two orderings, but every guard-path case below passes
    // under BOTH — so without this, a revert to the pre-transaction placement
    // would still go green on the happy path.
    await cancelInfoRequest({ requestId: "ir-1", cancelledById: "u-admin" });
    expect(order).toEqual(["commit", "notify"]);
  });

  it("names the withdrawn request so the carrier knows what to stop chasing", async () => {
    await cancelInfoRequest({ requestId: "ir-1", cancelledById: "u-admin" });
    expect(notifyWithdrawn).toHaveBeenCalledWith({
      carrierId: "carrier-1",
      requestId: "ir-1",
      categoryLabel: "Updated Certificate of Insurance (COI)",
    });
  });

  it("still returns the updated row", async () => {
    // The restructure moved this off a bare `return prisma.$transaction(...)`.
    // A naive move-the-block-down edit would have changed the return value.
    const out = await cancelInfoRequest({ requestId: "ir-1", cancelledById: "u-admin" });
    expect(out).toEqual({ id: "ir-1", status: "CANCELLED" });
  });
});

describe("a cancel that does not commit tells the carrier nothing", () => {
  it("sends no withdrawal notice when the transaction rejects", async () => {
    // THE REGRESSION. Under the old ordering the carrier was told to stop work
    // on a request that is still open — and because the dedup keys on this
    // requestId, they could never be told about it again.
    mockPrisma.$transaction.mockRejectedValueOnce(new Error("commit failed"));

    await expect(
      cancelInfoRequest({ requestId: "ir-1", cancelledById: "u-admin" }),
    ).rejects.toThrow("commit failed");

    // Deterministic without a promise flush: vi.fn() records its invocation
    // synchronously, and only resolution is deferred. There is no
    // flushPromises idiom in this codebase and this does not need one.
    expect(notifyWithdrawn).not.toHaveBeenCalled();
  });

  it("sends nothing when the request does not exist", async () => {
    mockPrisma.infoRequest.findUnique.mockResolvedValue(null);

    await expect(
      cancelInfoRequest({ requestId: "nope", cancelledById: "u-admin" }),
    ).rejects.toThrow("Info request not found");

    expect(notifyWithdrawn).not.toHaveBeenCalled();
  });

  it("sends nothing when the request was already cancelled", async () => {
    // Under the old ordering this case was already safe — the guard throws
    // above the notify. Kept because it is the state a double-click produces,
    // and a second withdrawal notice would be the same unrecoverable dedup burn.
    mockPrisma.infoRequest.findUnique.mockResolvedValue({ ...OPEN_REQUEST, status: "CANCELLED" });

    await expect(
      cancelInfoRequest({ requestId: "ir-1", cancelledById: "u-admin" }),
    ).rejects.toThrow("Only open requests can be cancelled");

    expect(notifyWithdrawn).not.toHaveBeenCalled();
  });
});

describe("the fixture exercises what it claims to", () => {
  it("actually runs the transaction body", async () => {
    // Vacuity tripwire. $transaction ships as a bare vi.fn(); if the
    // implementation above were dropped, the callback would never run, the
    // service would resolve to undefined, and "notify after commit" would pass
    // for the wrong reason — nothing having happened at all.
    await cancelInfoRequest({ requestId: "ir-1", cancelledById: "u-admin" });
    expect(mockPrisma.infoRequest.update).toHaveBeenCalledTimes(1);
    expect(order).toContain("commit");
  });
});
