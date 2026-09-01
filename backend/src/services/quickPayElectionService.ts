/**
 * The single writer of `QuickPayElection`.
 *
 * WHAT THIS ROW IS, AND WHAT IT IS NOT. It is the RECORD OF THE DECISION: who
 * chose a Quick Pay speed for one tender, when, and through what channel.
 * `Load.quickPaySpeed` and `Load.quickPayFeePercent` remain the FROZEN
 * PROJECTION that the charge path and the rate confirmation read, and they are
 * not written here. Two rows holding "what was elected" would be the
 * dual-source drift this codebase has repeatedly had to unpick (dual suspension
 * columns, dual onboarding status, `Load.rate`).
 *
 * WHY A SINGLE WRITER. Before this, the per-load money decision appeared on the
 * Load with no record of who made it. If a carrier disputes a 3% deduction, the
 * BCA, the Quick Pay Agreement and the rate confirmation can each produce a
 * name, an IP, a user agent and a timestamp; the deduction itself could produce
 * nothing. Funnelling every write through one function is what makes the
 * provenance non-optional rather than something each caller remembers.
 *
 * THE FEE IS PRICED HERE, NOT PASSED IN. `feePercent` is resolved from the
 * carrier tier at DECISION time, so a later tier move cannot silently reprice a
 * decision the carrier already made. A caller supplying a fee could disagree
 * with the ladder in §8, and the ladder is the thing that is LOCKED.
 */
import { Prisma, QuickPaySpeed, QuickPayDecisionChannel, TenderEvidenceType } from "@prisma/client";
import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { quickPayFeePercent } from "../lib/quickPayPricing";

/** Accepts a transaction client so an election can be recorded atomically with an accept. */
type Db = Prisma.TransactionClient | typeof prisma;

export interface RecordElectionInput {
  tenderId: string;
  loadId: string;
  carrierProfileId: string;
  /** What the carrier chose. STANDARD is a real choice, not an absence of one. */
  speed: QuickPaySpeed;
  /** Prices the election. Read from CarrierProfile.tier by the caller. */
  tier: string | null | undefined;
  decidedVia: QuickPayDecisionChannel;
  /** The AE, on ON_BEHALF only. Null everywhere else, so "who decided" needs no inference. */
  decidedByUserId?: string | null;
  evidenceType?: TenderEvidenceType | null;
  evidenceRef?: string | null;
  signerIp?: string | null;
  signerUserAgent?: string | null;
  /**
   * The Quick Pay Agreement version the carrier was attested against, from
   * CarrierProfile.quickPayVersion. Recorded at decision time so the row says
   * which text the election was made under rather than which text is current
   * when it is read back (§16 #2 will replace that body).
   */
  quickPayVersion?: string | null;
}

export type RecordElectionResult =
  | { ok: true; electionId: string; speed: QuickPaySpeed; feePercent: number; superseded: boolean }
  | { ok: false; code: string; error: string; details?: { field: string; message: string }[] };

/**
 * The evidence refusal, worded and shaped to match `acceptTenderOnBehalf`
 * (v3.8.axq) exactly. An AE recording a decision made somewhere SRL cannot see
 * has to point at something a person can go and read, and a fee election is the
 * same class of act as an acceptance — so it gets the same contract rather than
 * a second one that drifts.
 */
const EVIDENCE_REQUIRED = {
  code: "EVIDENCE_REQUIRED",
  error:
    "Electing Quick Pay for a carrier needs evidence they chose it: evidenceType " +
    "(email_subject | call_timestamp | quo_message_id) and evidenceRef.",
};

/** STANDARD is free by §8 and is never priced off the ladder. */
export function feeForSpeed(speed: QuickPaySpeed, tier: string | null | undefined): number {
  if (speed === "STANDARD") return 0;
  return quickPayFeePercent(tier, speed === "SAME_DAY");
}

/**
 * Record an election. Supersedes a live one on the same tender rather than
 * refusing it: before the rate confirmation is issued the window is open, and a
 * carrier changing their mind is a legitimate act rather than an error. The
 * superseded row is VOIDED, never deleted — the question a dispute asks is what
 * was chosen and when, and a deleted row answers nothing.
 *
 * The window itself is enforced by the CALLER (the election step only runs
 * before the RC renders), not here. This function records; it does not police
 * when recording is allowed.
 */
export async function record(input: RecordElectionInput, db: Db = prisma): Promise<RecordElectionResult> {
  const onBehalf = input.decidedVia === "ON_BEHALF";
  const type = input.evidenceType ?? null;
  const ref = input.evidenceRef?.trim() || null;

  if (onBehalf && (!type || !ref)) {
    const details: { field: string; message: string }[] = [];
    if (!type) details.push({ field: "evidenceType", message: "Required" });
    if (!ref) details.push({ field: "evidenceRef", message: "Required" });
    return { ok: false, ...EVIDENCE_REQUIRED, details };
  }

  // Evidence on a carrier-made decision would assert that somebody vouched for
  // a choice the carrier made themselves, which is worse than no evidence: it
  // reads, in an audit, as an AE having been involved.
  if (!onBehalf && (type || ref)) {
    return {
      ok: false,
      code: "EVIDENCE_NOT_APPLICABLE",
      error:
        "Evidence belongs only on an ON_BEHALF election. A carrier who chose for " +
        "themselves is their own evidence.",
    };
  }

  if (onBehalf && !input.decidedByUserId) {
    return {
      ok: false,
      code: "DECIDER_REQUIRED",
      error: "An ON_BEHALF election has to name the AE who recorded it.",
    };
  }

  const feePercent = feeForSpeed(input.speed, input.tier);

  // Void-then-insert in one transaction, so the partial unique index
  // (one ELECTED row per tender) can never see two live rows even briefly.
  const run = async (tx: Db) => {
    const superseded = await tx.quickPayElection.updateMany({
      where: { tenderId: input.tenderId, status: "ELECTED" },
      data: { status: "VOIDED", voidedAt: new Date(), voidedReason: "superseded" },
    });
    const created = await tx.quickPayElection.create({
      data: {
        tenderId: input.tenderId,
        loadId: input.loadId,
        carrierProfileId: input.carrierProfileId,
        speed: input.speed,
        feePercent,
        decidedVia: input.decidedVia,
        decidedByUserId: onBehalf ? input.decidedByUserId! : null,
        evidenceType: type,
        evidenceRef: ref,
        signerIp: input.signerIp ?? null,
        signerUserAgent: input.signerUserAgent ?? null,
        quickPayVersion: input.quickPayVersion ?? null,
      },
      select: { id: true },
    });
    return { id: created.id, superseded: superseded.count > 0 };
  };

  // `prisma.$transaction` only when we were handed the root client. Opening a
  // nested transaction on a caller transaction client is not supported and
  // would throw at runtime rather than at compile time.
  const isRoot = db === prisma;
  const out = isRoot ? await prisma.$transaction((tx) => run(tx)) : await run(db);

  log.info(
    { tenderId: input.tenderId, speed: input.speed, feePercent, decidedVia: input.decidedVia, superseded: out.superseded },
    "[QuickPayElection] recorded",
  );
  return { ok: true, electionId: out.id, speed: input.speed, feePercent, superseded: out.superseded };
}

/**
 * Void the live election on a tender. Called when the tender it belongs to
 * stops governing: a release, a counter-reject, or a rate change.
 *
 * Never deletes. Returns how many rows moved so a caller can log it, and is
 * safe to call on a tender that never had one.
 */
export async function voidForTender(tenderId: string, reason: string, db: Db = prisma): Promise<number> {
  const res = await db.quickPayElection.updateMany({
    where: { tenderId, status: "ELECTED" },
    data: { status: "VOIDED", voidedAt: new Date(), voidedReason: reason },
  });
  return res.count;
}

/** The live election for a tender, or null. The read `sendRateConfirmation` uses. */
export async function liveElectionForTender(tenderId: string, db: Db = prisma) {
  return db.quickPayElection.findFirst({
    where: { tenderId, status: "ELECTED" },
    orderBy: { decidedAt: "desc" },
    select: { id: true, speed: true, feePercent: true, decidedVia: true, decidedAt: true, decidedByUserId: true, quickPayVersion: true },
  });
}
