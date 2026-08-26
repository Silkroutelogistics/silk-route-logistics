/**
 * An activity write can join the caller's transaction.
 *
 * This service used to construct its own `new PrismaClient()`. A private client
 * opens its own connection, so a write issued from inside
 * `prisma.$transaction(...)` committed on a DIFFERENT connection and survived
 * the rollback — structurally, not occasionally. The feed would show a status
 * change for a transition the database had thrown away.
 *
 * Nothing does that today. Every call site is outside a transaction, and
 * withTenderController's is deliberately post-commit and documented as such.
 * So this guards a CAPABILITY rather than fixing a live outage, and the honest
 * framing matters: what it prevents is the next refactor wrapping a multi-write
 * handler in a transaction without noticing the activity row is not in it.
 *
 * The assertions below fail against the private-client version — not because
 * they inspect which client is imported, but because they pass a transaction
 * client in and check the write went there (§19 Sub-pattern 16: exercise the
 * boundary, do not assert that a string appears in a file).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { prisma } from "../../../src/config/database";
import { logLoadActivity, logLoadTransition } from "../../../src/services/loadActivityService";

const mockPrisma = vi.mocked(prisma);

/** Stand-in for what `prisma.$transaction(async (tx) => …)` hands a caller. */
function makeTx() {
  return {
    loadActivity: { create: vi.fn().mockResolvedValue({ id: "act-tx" }) },
    systemLog: { create: vi.fn().mockResolvedValue({ id: "sys-tx" }) },
  } as any;
}

describe("logLoadActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.loadActivity.create.mockResolvedValue({ id: "act-shared" } as any);
    mockPrisma.systemLog.create.mockResolvedValue({ id: "sys-shared" } as any);
  });

  it("writes through the shared client when no transaction is given", () => {
    logLoadActivity({ loadId: "L1", eventType: "load_created", description: "created" });
    expect(mockPrisma.loadActivity.create).toHaveBeenCalledTimes(1);
  });

  it("writes through the caller's transaction when one is given", async () => {
    const tx = makeTx();
    await logLoadActivity({ loadId: "L1", eventType: "load_created", description: "created" }, tx);

    // THE POINT. A private client could not do this at all.
    expect(tx.loadActivity.create, "the write must land on the caller's tx").toHaveBeenCalledTimes(1);
    expect(
      mockPrisma.loadActivity.create,
      "and must NOT also go out on the shared client, which would survive a rollback",
    ).not.toHaveBeenCalled();
  });

  it("carries the same row shape either way", async () => {
    const tx = makeTx();
    await logLoadActivity({ loadId: "L9", eventType: "pod_uploaded", description: "POD in" }, tx);
    expect(tx.loadActivity.create.mock.calls[0][0].data).toMatchObject({
      loadId: "L9",
      eventType: "pod_uploaded",
      actorType: "SYSTEM",
    });
  });
});

describe("logLoadTransition", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrisma.loadActivity.create.mockResolvedValue({ id: "act-shared" } as any);
    mockPrisma.systemLog.create.mockResolvedValue({ id: "sys-shared" } as any);
  });

  it("puts the activity row on the transaction", async () => {
    const tx = makeTx();
    await logLoadTransition({ loadId: "L2", from: "POSTED", to: "TENDERED" }, tx);
    expect(tx.loadActivity.create).toHaveBeenCalledTimes(1);
  });

  it("keeps the SystemLog mirror OFF the transaction", async () => {
    // Deliberate, and the reason is easy to get wrong. In Postgres a failed
    // statement aborts the whole transaction; the mirror's `catch` cannot undo
    // that, so a swallowed failure here would kill the CALLER's writes and
    // surface somewhere unrelated. Out-of-band observability must not be able
    // to take down the thing it observes.
    const tx = makeTx();
    await logLoadTransition({ loadId: "L2", from: "POSTED", to: "TENDERED" }, tx);

    expect(tx.systemLog.create, "the mirror must not ride the caller's tx").not.toHaveBeenCalled();
    expect(mockPrisma.systemLog.create, "it goes out on the shared client").toHaveBeenCalledTimes(1);
  });

  it("a failing mirror does not fail the transition", async () => {
    const tx = makeTx();
    mockPrisma.systemLog.create.mockRejectedValueOnce(new Error("systemLog down"));
    await expect(
      logLoadTransition({ loadId: "L3", from: "BOOKED", to: "DISPATCHED" }, tx),
    ).resolves.not.toThrow();
    expect(tx.loadActivity.create, "the activity row still landed").toHaveBeenCalledTimes(1);
  });
});
