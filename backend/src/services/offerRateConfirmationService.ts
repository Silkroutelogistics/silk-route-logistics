/**
 * Issuing the rate confirmation WITH the offer — Item 342, owner ruling
 * 2026-09-28: the RC is issued with the tender, and the carrier's acceptance
 * is the signature.
 *
 * WHICH PATHS. The two direct offers, where an AE picked this carrier: the
 * Load Board tender and the Carrier Engagement Drawer. Waterfall and
 * load-board bids keep issuing at accept (ruling 3, 2026-09-29) — nobody is
 * choosing a carrier at the moment of offer, and a broadcast would mint one
 * document per offered carrier.
 *
 * WHAT ISSUING AT OFFER DOES, AND DOES NOT. It drafts the document for the
 * tender's carrier, freezes the bytes, hashes them, allocates the number,
 * countersigns, and mints a signing token that lives exactly as long as the
 * offer. It does NOT write anything onto the load and does not move the tender:
 * an offer can die, and a load must never carry a fee or a document a declined
 * carrier was offered. Both happen at the signature (routes/rcSign).
 *
 * NO SECOND EMAIL. The carrier's one email is the tender offer; its Accept
 * button opens the review-and-sign page through the tender-action link, which
 * mints a fresh signing link on the way (routes/tenderAction). Two emails for
 * one offer, each with a button, is the confusion this ruling set out to end.
 *
 * WHY IT DELEGATES. Issuing is the AE send handler — the election, the refusal
 * of a contradictory one, the render, the hash, the countersignature, the terms
 * version, the token. A second copy is a second place for those rules to drift,
 * so it runs that handler through the capture shim, as the auto-dispatch paths
 * do (rateConfirmationAutoIssue).
 *
 * NEVER FATAL. An offer that goes out without its document falls back to the
 * accept-then-sign flow: a tender with no issued RC is accepted as before and
 * drafts at accept. That is a slower path for the carrier, not a broken one.
 */

import { prisma } from "../config/database";
import { makeCaptureRes } from "../lib/captureResponse";
import { log } from "../lib/logger";
import type { AuthRequest } from "../middleware/auth";
import { autoGenerateRateConfirmation } from "./autoRateConfirmationService";

export interface OfferIssueResult {
  issued: boolean;
  rateConfirmationId?: string;
  reason?: string;
}

export async function issueRateConfirmationAtOffer(
  tenderId: string,
  actingUserId: string,
): Promise<OfferIssueResult> {
  const tender = await prisma.loadTender.findUnique({
    where: { id: tenderId },
    select: {
      id: true,
      loadId: true,
      status: true,
      carrier: {
        select: {
          contactEmail: true,
          companyName: true,
          user: { select: { email: true } },
        },
      },
    },
  });
  if (!tender) return { issued: false, reason: "tender_not_found" };
  if (tender.status !== "OFFERED") return { issued: false, reason: `tender_${tender.status.toLowerCase()}` };

  const recipientEmail = tender.carrier.contactEmail || tender.carrier.user?.email;
  if (!recipientEmail) return { issued: false, reason: "no_carrier_email" };

  const draft = await autoGenerateRateConfirmation(tender.loadId, tender.id, actingUserId);
  if (!draft) return { issued: false, reason: "draft_failed" };
  if (draft.status !== "DRAFT") return { issued: true, rateConfirmationId: draft.id };

  // Imported here, not at module scope: the controller imports services this
  // module sits beside, and a top-level cycle resolves in load order.
  const { sendRateConfirmation } = await import("../controllers/rateConfirmationController");
  const { shim, state } = makeCaptureRes();
  const req = {
    params: { id: draft.id },
    body: { recipientEmail, recipientName: tender.carrier.companyName ?? "Carrier" },
    user: { id: actingUserId, role: "BROKER" },
    headers: {},
    issueAtOffer: true,
  } as unknown as AuthRequest;

  await sendRateConfirmation(req, shim);
  if (state.statusCode !== 200) {
    const reason = state.body?.code || state.body?.error || `status_${state.statusCode}`;
    log.warn({ tenderId, rateConfirmationId: draft.id, reason }, "[OfferRC] issue at offer refused — the offer falls back to accept-then-sign");
    return { issued: false, rateConfirmationId: draft.id, reason };
  }
  return { issued: true, rateConfirmationId: draft.id };
}
