/**
 * Quick Pay decided WITH the offer — Item 342, owner ruling 2026-09-28 (1).
 *
 * The rate confirmation goes out with the offer and the carrier's acceptance
 * is their signature, so there is no moment after the offer at which the
 * carrier could still choose how the load is paid: the document states it.
 * Quick Pay on the load is therefore the AE's call AT OFFER, recorded when the
 * carrier has told the AE they want it, on the evidence of where they said so.
 *
 * THE SAME ELIGIBILITY AS THE CARRIER'S OWN CHOICE HAD. A carrier choosing
 * Quick Pay in the portal had to be approved into the pilot, have signed the
 * Caravan Quick Pay Agreement, and have Quick Pay on. An AE recording it for
 * them passes the same three gates, in the same order, with the same codes,
 * because the fee is charged to the same carrier on the same terms. The
 * existing on-behalf recording had NO eligibility check at all, which was the
 * gap the owner's decision (2026-09-29) closed.
 *
 * Standard terms need no election: an offer with no Quick Pay pays the tier's
 * free net days, which is the default rather than a choice anyone records.
 */

import { prisma } from "../config/database";
import { record } from "./quickPayElectionService";
import { isQuickPayPilotApproved } from "../controllers/carrierController";

export type OfferQuickPay = {
  speed: "SEVEN_DAY" | "SAME_DAY";
  evidenceType: "email_subject" | "call_timestamp" | "quo_message_id";
  evidenceRef: string;
};

const EVIDENCE = {
  email_subject: "EMAIL_SUBJECT",
  call_timestamp: "CALL_TIMESTAMP",
  quo_message_id: "QUO_MESSAGE_ID",
} as const;

export type Ineligible = { code: string; error: string };

/** Null when the carrier may be put on Quick Pay; otherwise why not. */
export async function offerQuickPayIneligibility(carrierProfileId: string): Promise<Ineligible | null> {
  if (!(await isQuickPayPilotApproved(carrierProfileId))) {
    return {
      code: "QP_PILOT_NOT_APPROVED",
      error: "This carrier is not in the Quick Pay pilot, so the load can only pay on their standard tier terms.",
    };
  }
  const signed = await prisma.carrierAgreement.findFirst({
    where: { carrierId: carrierProfileId, status: "SIGNED", templateName: "quick-pay" },
    select: { id: true },
  });
  if (!signed) {
    return {
      code: "QP_AGREEMENT_NOT_SIGNED",
      error: "This carrier has not signed the Caravan Quick Pay Agreement, so Quick Pay cannot be put on the offer.",
    };
  }
  const profile = await prisma.carrierProfile.findUnique({
    where: { id: carrierProfileId },
    select: { quickPayEnabled: true },
  });
  if (profile?.quickPayEnabled !== true) {
    return {
      code: "QP_NOT_ENABLED",
      error: "Quick Pay is turned off on this carrier's account, so it cannot be put on the offer.",
    };
  }
  return null;
}

/** Record the AE's election for the offer, on the evidence given. */
export async function recordOfferQuickPay(input: {
  tenderId: string;
  loadId: string;
  carrierProfileId: string;
  aeUserId: string;
  quickPay: OfferQuickPay;
}) {
  const profile = await prisma.carrierProfile.findUnique({
    where: { id: input.carrierProfileId },
    select: { tier: true, quickPayVersion: true },
  });
  return record({
    tenderId: input.tenderId,
    loadId: input.loadId,
    carrierProfileId: input.carrierProfileId,
    speed: input.quickPay.speed,
    tier: profile?.tier ?? null,
    decidedVia: "ON_BEHALF",
    decidedByUserId: input.aeUserId,
    evidenceType: EVIDENCE[input.quickPay.evidenceType],
    evidenceRef: input.quickPay.evidenceRef.trim(),
    quickPayVersion: profile?.quickPayVersion ?? null,
  });
}
