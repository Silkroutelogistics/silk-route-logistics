import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { validateLoadStatusTransition } from "../lib/loadStateMachine";
import { LoadStatus } from "@prisma/client";
import { createTender } from "./tenderCreationService";
import { isCarrierIneligible } from "../lib/carrierEligibility";
import { withdrawLiveTenders } from "./tenderTransitionService";

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

  // ROW 4a — declare the fan-out BEFORE the tenders exist, or createTender
  // refuses the second one. The flag is what makes simultaneous offers legal.
  await prisma.load.update({ where: { id: loadId }, data: { tenderFanout: "PARALLEL" } });
  const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);

  // Create all tenders simultaneously.
  //
  // Carrier-archive recut B2b (Phase A row C): nothing on this path asked the
  // gate — every body candidate got an offer. createTender now refuses an
  // ineligible carrier; a broadcast to several carriers must not fail as a
  // whole because one of them is blocked, so a refused candidate is SKIPPED and
  // named in the result with its codes. Anything else createTender throws still
  // fails the launch.
  const skipped: Array<{ carrierId: string; blocked_reasons: string[]; blocked_codes: unknown[] }> = [];
  const settled = await Promise.all(
    candidates.map(async (c) => {
      try {
        // v3.8.axd — through createTender, the single writer of LoadTender.
        return await createTender({
          loadId,
          carrierProfileId: c.carrierId,
          offeredRate: c.offeredRate,
          expiresAt,
          actor: { id: createdById, type: "USER" },
          reason: "broadcast",
        });
      } catch (err) {
        if (isCarrierIneligible(err)) {
          skipped.push({ carrierId: c.carrierId, blocked_reasons: err.blocked_reasons, blocked_codes: err.blocked_codes });
          return null;
        }
        throw err;
      }
    })
  );
  const tenders = settled.filter((t): t is NonNullable<typeof t> => t !== null);

  // v3.8.ake Item 159 Sprint 3 — defense-in-depth validator. Upstream
  // guard at line 28 already restricts to POSTED|TENDERED so this
  // branch only fires from those two; calling the validator here
  // makes the canonical helper authoritative on the broadcast launch
  // path. Throws (not 4xx) because this is a service function called
  // from routes/tenders.ts which already does Zod-validate + 400 on
  // failures via the standard error pipeline.
  const transition = validateLoadStatusTransition(load.status as LoadStatus, "TENDERED", "AE");
  if (!transition.allowed) {
    throw new Error(transition.reason ?? `Invalid status transition: ${load.status} → TENDERED`);
  }

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
    skipped,
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
  // v3.8.axg — WITHDRAWN, not EXPIRED. Found by the loadTenderWriters guard on
  // its first run, and it is the same mislabel class as the DECLINED one fixed
  // in v3.8.aww: a broadcast offer that loses the race did not run out of time,
  // SRL pulled it because somebody else took the load.
  //
  // EXPIRED is less obviously harmful than DECLINED — it is not counted as a
  // refusal — but it is still wrong in the numbers. analytics.ts computes
  // acceptance over `actionable = total - withdrawn`, so these rows stayed in
  // the denominator and understated how often broadcast carriers accept.
  const withdrawn = await withdrawLiveTenders({
    loadId,
    exceptTenderId: tenderId,
    reason: "load_covered",
  });

  log.info({ loadId, acceptedTenderId: tenderId, withdrawnCount: withdrawn.count }, "[Broadcast] Accepted — others withdrawn");
  return withdrawn.count;
}
