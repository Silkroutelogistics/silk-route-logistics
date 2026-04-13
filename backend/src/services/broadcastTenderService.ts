import { prisma } from "../config/database";
import { log } from "../lib/logger";

export interface BroadcastCandidate {
  carrierId: string;
  carrierUserId: string;
  companyName: string;
  offeredRate: number;
}

interface LaunchBroadcastInput {
  loadId: string;
  candidates: BroadcastCandidate[];
  expirationMinutes: number;
  createdById: string;
}

/**
 * Broadcast tendering: send tender offers to ALL candidates simultaneously.
 * First carrier to accept wins. All other tenders expire.
 */
export async function launchBroadcast(input: LaunchBroadcastInput) {
  const { loadId, candidates, expirationMinutes, createdById } = input;

  // Verify load exists and is in valid state
  const load = await prisma.load.findUnique({ where: { id: loadId } });
  if (!load) throw new Error("Load not found");
  if (!["POSTED", "TENDERED"].includes(load.status)) {
    throw new Error(`Cannot broadcast tender for load in ${load.status} status`);
  }

  const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

  // Create all tenders simultaneously
  const tenders = await Promise.all(
    candidates.map((c) =>
      prisma.loadTender.create({
        data: {
          loadId,
          carrierId: c.carrierId,
          offeredRate: c.offeredRate,
          status: "OFFERED",
          expiresAt,
        },
      })
    )
  );

  // Update load status
  await prisma.load.update({
    where: { id: loadId },
    data: {
      status: "TENDERED",
      tenderedAt: new Date(),
      tenderedById: createdById,
    },
  });

  log.info({ loadId, candidateCount: candidates.length, expiresAt }, "[Broadcast] Launched");

  return {
    loadId,
    mode: "BROADCAST",
    tenderCount: tenders.length,
    expiresAt,
    tenders: tenders.map((t) => ({
      id: t.id,
      carrierId: t.carrierId,
      offeredRate: t.offeredRate,
      status: t.status,
    })),
  };
}

/**
 * When a broadcast tender is accepted, expire all other tenders for the same load.
 */
export async function handleBroadcastAcceptance(tenderId: string, loadId: string) {
  // Expire all other OFFERED tenders for this load
  const expired = await prisma.loadTender.updateMany({
    where: {
      loadId,
      id: { not: tenderId },
      status: "OFFERED",
    },
    data: { status: "EXPIRED" },
  });

  log.info({ loadId, acceptedTenderId: tenderId, expiredCount: expired.count }, "[Broadcast] Accepted — others expired");
  return expired.count;
}
