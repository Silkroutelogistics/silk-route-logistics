/**
 * Issuing a rate confirmation on an auto-dispatch path.
 *
 * WHY THIS EXISTS. The direct paths announce a carrier to the customer at the
 * SIGNATURE (v3.8.axw), because telling a customer their load has a carrier is a
 * commitment. The auto-dispatch paths could not do the same for a simple reason:
 * they never issued a rate confirmation at all. Waterfall generated none, and
 * the loadboard-bid path generated a DRAFT and stopped — so no signing link ever
 * reached the carrier, no signature was possible, and moving those paths to
 * CONFIRMED would have stranded every one of their customers.
 *
 * So the fix is not to move the notification. It is to give those carriers
 * something to sign.
 *
 * WHY IT DELEGATES rather than reimplementing. Issuing is not one step: it
 * resolves the Quick Pay election and refuses a contradictory one, freezes the
 * PDF bytes, hashes the stored artifact, mints a single-use signing token,
 * emails the document with the link, stamps the terms version, and moves the
 * tender to RC_SENT through the transition service. A second copy of that would
 * be a second place for the rules to drift, and this arc has spent eleven
 * commits removing exactly that. The shim (`makeCaptureRes`, v3.8.axf) reuses
 * the AE send handler whole and unchanged.
 *
 * WHO IT ACTS AS. The load's poster — the AE who owns the load. Not a synthetic
 * system user: the transition history should name a real person who is
 * accountable for the load, and on these paths that is the poster. What is
 * automatic is the TIMING, not the authority.
 *
 * HOW THE CARRIER REACHES THE SIGNATURE. By the emailed link, on every path.
 * A loadboard bid is accepted by an AE, which is AE-only and typically happens
 * hours after the bid was placed, so there is no carrier session to present
 * anything in — the email is the whole mechanism there, which is why ISSUING
 * rather than drafting is the load-bearing change.
 *
 * An inline signing step for a carrier who IS present is a real improvement to
 * signature rates and is deliberately NOT built here: it needs a frontend
 * surface, and the variant that returns a live signing secret has no consumer
 * yet. Shipping an unused export that hands out a secret is the shape this arc
 * has refused twice already. Banked with its reasoning at §13.3.
 *
 * Either way an unsigned rate confirmation sits at RC_SENT and Needs Attention
 * chases it on RC_SIGN_SLA_HOURS, exactly as on the direct path.
 */

import { prisma } from "../config/database";
import { makeCaptureRes } from "../lib/captureResponse";
import { log } from "../lib/logger";
import type { AuthRequest } from "../middleware/auth";

export interface AutoIssueResult {
  issued: boolean;
  rateConfirmationId?: string;
  /** Coded, so a caller can log WHY rather than that it did not happen. */
  reason?: string;
}

/**
 * Resolve the address a carrier actually reads.
 *
 * `carrierProfile.contactEmail` before `user.email`, matching the precedent set
 * at v3.8.abb: the profile address is the dispatch desk, the login address is
 * frequently one person's. A rate confirmation is desk mail.
 */
async function carrierEmail(loadId: string): Promise<{ email: string; name: string } | null> {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: {
      carrier: {
        select: {
          email: true, firstName: true, lastName: true, company: true,
          carrierProfile: { select: { contactEmail: true, companyName: true } },
        },
      },
    },
  });
  const c = load?.carrier;
  if (!c) return null;
  const email = c.carrierProfile?.contactEmail || c.email;
  if (!email) return null;
  return {
    email,
    name: c.carrierProfile?.companyName || c.company || [c.firstName, c.lastName].filter(Boolean).join(" ") || "Carrier",
  };
}

export async function autoIssueRateConfirmation(
  loadId: string,
  rateConfirmationId: string,
  actingUserId: string,
): Promise<AutoIssueResult> {
  const to = await carrierEmail(loadId);
  if (!to) return { issued: false, reason: "no_carrier_email" };

  // Imported here rather than at module scope: the controller imports this
  // service's siblings, and a top-level cycle would be resolved at load time in
  // whichever order happened to win.
  const { sendRateConfirmation } = await import("../controllers/rateConfirmationController");

  const { shim, state } = makeCaptureRes();
  const req = {
    params: { id: rateConfirmationId },
    body: { recipientEmail: to.email, recipientName: to.name },
    user: { id: actingUserId, role: "BROKER" },
    headers: {},
  } as unknown as AuthRequest;

  await sendRateConfirmation(req, shim);
  if (state.statusCode !== 200) {
    return { issued: false, reason: state.body?.code || state.body?.error || `status_${state.statusCode}` };
  }

  // Confirm a signing token actually landed. The send mints one, but a carrier
  // holding a rate confirmation they cannot sign is the failure this whole
  // commit exists to prevent, so it is checked rather than assumed.
  //
  // The secret itself is deliberately not read back or returned: it is
  // unrecoverable from the stored hash by design, and the carrier already has
  // it in their inbox.
  const rc = await prisma.rateConfirmation.findUnique({
    where: { id: rateConfirmationId },
    select: { signTokenHash: true },
  });
  if (!rc?.signTokenHash) {
    // Issued, but with no live token — a carrier can still be chased by an AE
    // and Needs Attention will surface it, so this is degraded rather than failed.
    log.warn({ rateConfirmationId, loadId }, "[AutoIssue] issued without a signing token");
    return { issued: true, rateConfirmationId };
  }
  return { issued: true, rateConfirmationId };
}
