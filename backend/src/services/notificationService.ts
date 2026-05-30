import { prisma } from "../config/database";
import { log } from "../lib/logger";
import {
  sendTenderOfferedEmail,
  sendTenderAcceptedEmail,
  sendTenderAcceptedConfirmationEmail,
  sendTenderDeclinedEmail,
  sendTenderCounteredEmail,
  sendTenderExpiredEmail,
  sendBidAcceptedEmail,
  sendBidDeclinedEmail,
} from "./emailService";
import { mintTenderActionToken, tenderActionUrl } from "../lib/tenderActionToken";

// Sprint 54 (v3.8.acc) Item 7 — operations@ alias is CC'd on every
// AE-facing tender-accept email so the team has a shared audit trail
// of bookings without depending on AE staff to forward individually.
const OPERATIONS_CC = "operations@silkroutelogistics.ai";

// Notification types aligned with application events
export type NotificationType =
  | "LOAD_STATUS"
  | "TENDER_RECEIVED"
  | "TENDER_ACCEPTED"
  | "TENDER_DECLINED"
  | "PAYMENT_RECEIVED"
  | "PAYMENT_APPROVED"
  | "INVOICE_SENT"
  | "INVOICE_PAID"
  | "DOCUMENT_UPLOADED"
  | "MESSAGE_RECEIVED"
  | "SYSTEM_ALERT"
  | "DISPUTE_FILED"
  | "DISPUTE_RESOLVED"
  | "CHECK_CALL_DUE"
  | "CREDIT_ALERT"
  | "LOAD_UPDATE"
  | "PASSWORD_EXPIRY"
  | "POD_RECEIVED";

/**
 * Create a single notification for a user.
 */
export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  message: string,
  data?: { actionUrl?: string; link?: string }
) {
  return prisma.notification.create({
    data: {
      userId,
      type,
      title,
      message,
      actionUrl: data?.actionUrl ?? null,
      link: data?.link ?? null,
    },
  });
}

/**
 * Notify the carrier and the poster when a load's status changes.
 */
export async function notifyLoadStatusChange(loadId: string, newStatus: string) {
  const load = await prisma.load.findUnique({
    where: { id: loadId },
    select: {
      id: true,
      referenceNumber: true,
      posterId: true,
      carrierId: true,
      originCity: true,
      originState: true,
      destCity: true,
      destState: true,
    },
  });

  if (!load) {
    log.warn(`[NotificationService] Load ${loadId} not found`);
    return;
  }

  const lane = `${load.originCity}, ${load.originState} → ${load.destCity}, ${load.destState}`;
  const statusLabel = newStatus.replace(/_/g, " ");
  const title = "Load Status Updated";
  const message = `Load ${load.referenceNumber} (${lane}) is now ${statusLabel}.`;
  const actionUrl = "/dashboard/loads";

  const recipients: string[] = [load.posterId];
  if (load.carrierId) {
    recipients.push(load.carrierId);
  }

  await Promise.all(
    recipients.map((userId) =>
      createNotification(userId, "LOAD_STATUS", title, message, { actionUrl })
    )
  );
}

/**
 * Notify relevant parties when a tender is offered, accepted, declined, countered, or expires.
 *
 * Sprint 45a (v3.8.abb) — Extended to fan out via Resend email in addition
 * to in-app Notification records. Establishes the canonical pattern for the
 * notification fan-out class (§13.3 Item 86 — 18 of 19 NotificationType
 * enum values still lack email path; retrofit candidate Sprint 50+).
 *
 * Carrier email source (Q3, Pattern 6 sub-rule c gated): primary
 * carrierProfile.contactEmail, fallback user.email — same fallback chain
 * used at chameleonDetectionService.ts:48, identityVerificationService.ts:356,
 * waterfallEngineService.ts:299.
 *
 * Reply-To: operations@silkroutelogistics.ai (Q1) — handled inside each
 * sendTenderXxxEmail per call.
 *
 * Action coverage:
 *   OFFERED   — carrier in-app + carrier email with AE CC
 *   ACCEPTED  — AE in-app + AE email
 *   DECLINED  — AE in-app + AE email (declineReason currently always
 *               undefined — LoadTender schema has no declineReason field;
 *               §13.3 Item 90 LOG OPEN tracks adding it)
 *   EXPIRED   — AE in-app + AE email (Sprint 45b cron handler will fire
 *               this action when tender.expiresAt < now and status=OFFERED)
 *   COUNTERED — AE in-app only (counter-tender email deferred to Sprint
 *               45b alongside expiry handling — §13.3 Item 89 LOG OPEN)
 */
export async function notifyTenderAction(
  tenderId: string,
  action: "OFFERED" | "ACCEPTED" | "DECLINED" | "COUNTERED" | "EXPIRED",
  options?: { rcId?: string },
) {
  const tender = await prisma.loadTender.findUnique({
    where: { id: tenderId },
    include: {
      load: {
        select: {
          id: true,
          referenceNumber: true,
          posterId: true,
          originCity: true,
          originState: true,
          destCity: true,
          destState: true,
          equipmentType: true,
          weight: true,
          distance: true,
          pickupDate: true,
          deliveryDate: true,
          poster: {
            select: { email: true, firstName: true },
          },
        },
      },
      carrier: {
        select: {
          userId: true,
          contactEmail: true,
          companyName: true,
          user: {
            select: { email: true, firstName: true, lastName: true, company: true },
          },
        },
      },
    },
  });

  if (!tender) {
    log.warn(`[NotificationService] Tender ${tenderId} not found`);
    return;
  }

  const lane = `${tender.load.originCity}, ${tender.load.originState} → ${tender.load.destCity}, ${tender.load.destState}`;
  const ref = tender.load.referenceNumber;
  const carrierUserId = tender.carrier.userId;
  const posterId = tender.load.posterId;

  // Sprint 45a — resolve email surfaces for fan-out
  const carrierEmail = tender.carrier.contactEmail ?? tender.carrier.user.email;
  const aeEmail = tender.load.poster?.email;
  const carrierName =
    tender.carrier.companyName ??
    tender.carrier.user.company ??
    `${tender.carrier.user.firstName} ${tender.carrier.user.lastName}`.trim();
  const originName = `${tender.load.originCity}, ${tender.load.originState}`;
  const destName = `${tender.load.destCity}, ${tender.load.destState}`;
  const miles = tender.load.distance ?? null;
  // D5 — Lane economics: $/mile (broker industry standard). Compute only
  // when distance is non-null and positive.
  const dollarsPerMile = miles && miles > 0 ? tender.offeredRate / miles : null;
  // Transit estimate: industry-standard 500 mi/day single-driver pace.
  const transitDays = miles && miles > 0 ? miles / 500 : null;

  switch (action) {
    case "OFFERED":
      await createNotification(
        carrierUserId,
        "TENDER_RECEIVED",
        "New Tender Received",
        `You have received a tender for load ${ref} (${lane}) at $${tender.offeredRate.toLocaleString()}.`,
        { actionUrl: "/carrier/dashboard/tenders" }
      );
      if (carrierEmail) {
        // v3.8.als Item 142 — mint magic-link accept/decline tokens so the
        // carrier can act from the email without logging in. Only when the
        // carrier has a linked User.id (the token embeds it as the actor);
        // absent → email falls back to the log-in button.
        let acceptUrl: string | undefined;
        let declineUrl: string | undefined;
        if (carrierUserId) {
          acceptUrl = tenderActionUrl(mintTenderActionToken({ tenderId: tender.id, action: "accept", carrierUserId }));
          declineUrl = tenderActionUrl(mintTenderActionToken({ tenderId: tender.id, action: "decline", carrierUserId }));
        }
        try {
          await sendTenderOfferedEmail({
            to: carrierEmail,
            cc: aeEmail ?? undefined,
            ref,
            originName,
            destName,
            rate: tender.offeredRate,
            expiresAt: tender.expiresAt,
            equipment: tender.load.equipmentType,
            weight: tender.load.weight,
            milesEstimate: miles,
            transitDays,
            dollarsPerMile,
            acceptUrl,
            declineUrl,
          });
        } catch (err) {
          log.error({ err, tenderId, carrierEmail }, "[NotificationService] sendTenderOfferedEmail failed");
        }
      } else {
        log.warn({ tenderId, carrierUserId }, "[NotificationService] OFFERED: no carrier email available; in-app only");
      }
      break;

    case "ACCEPTED":
      // Sprint Phase 2 (v3.8.acd) — deep-link to auto-draft RC review
      // surface when rcId is provided by the caller. Falls back to the
      // generic Track & Trace deep-link when no auto-RC was generated
      // (e.g., auto-RC throw → AE still gets the notification, just
      // without the RC anchor).
      await createNotification(
        posterId,
        "TENDER_ACCEPTED",
        "Tender Accepted",
        `Your tender for load ${ref} (${lane}) has been accepted at $${tender.offeredRate.toLocaleString()}.`,
        { actionUrl: options?.rcId ? `/dashboard/rate-confirmations/${options.rcId}` : "/dashboard/track-trace" }
      );
      // Sprint 54 (v3.8.acc) Item 7 — fan out BOTH emails: AE-facing
      // (cc operations@) for audit trail + carrier-facing confirmation
      // so the accept click produces tangible feedback. Pre-Sprint-54
      // only AE got the email; carriers had to poll the portal to see
      // their accept took.
      if (aeEmail) {
        try {
          await sendTenderAcceptedEmail({
            to: aeEmail,
            cc: OPERATIONS_CC,
            ref,
            originName,
            destName,
            carrierName,
            rate: tender.offeredRate,
          });
        } catch (err) {
          log.error({ err, tenderId, aeEmail }, "[NotificationService] sendTenderAcceptedEmail failed");
        }
      }
      if (carrierEmail) {
        try {
          await sendTenderAcceptedConfirmationEmail({
            to: carrierEmail,
            ref,
            originName,
            destName,
            carrierName,
            rate: tender.offeredRate,
            pickupDate: tender.load.pickupDate ? new Date(tender.load.pickupDate).toLocaleDateString() : null,
            deliveryDate: tender.load.deliveryDate ? new Date(tender.load.deliveryDate).toLocaleDateString() : null,
          });
        } catch (err) {
          log.error({ err, tenderId, carrierEmail }, "[NotificationService] sendTenderAcceptedConfirmationEmail failed");
        }
      } else {
        log.warn({ tenderId, carrierUserId }, "[NotificationService] ACCEPTED: no carrier email available; in-app only");
      }
      break;

    case "DECLINED":
      await createNotification(
        posterId,
        "TENDER_DECLINED",
        "Tender Declined",
        `Your tender for load ${ref} (${lane}) has been declined by the carrier.`,
        { actionUrl: "/dashboard/loads" }
      );
      if (aeEmail) {
        try {
          await sendTenderDeclinedEmail({
            to: aeEmail,
            ref,
            loadId: tender.load.id,
            originName,
            destName,
            carrierName,
            rate: tender.offeredRate,
            // v3.8.ajz Item 90 CLOSED — LoadTender.declineReason now persisted
            // by declineTender controller from the carrier-portal categorized
            // dropdown (carrier/dashboard/tenders/page.tsx:16-24). Email
            // template at sendTenderDeclinedEmail conditionally renders the
            // reason row per D4 ratification — undefined gracefully omits it
            // for pre-ajz declines that have null in the column.
            declineReason: tender.declineReason ?? undefined,
          });
        } catch (err) {
          log.error({ err, tenderId, aeEmail }, "[NotificationService] sendTenderDeclinedEmail failed");
        }
      }
      break;

    case "EXPIRED":
      await createNotification(
        posterId,
        "LOAD_UPDATE",
        "Tender Expired",
        `Tender to ${carrierName} for load ${ref} (${lane}) expired without a response.`,
        { actionUrl: "/dashboard/loads" }
      );
      if (aeEmail) {
        try {
          await sendTenderExpiredEmail({
            to: aeEmail,
            ref,
            loadId: tender.load.id,
            originName,
            destName,
            carrierName,
            rate: tender.offeredRate,
          });
        } catch (err) {
          log.error({ err, tenderId, aeEmail }, "[NotificationService] sendTenderExpiredEmail failed");
        }
      }
      break;

    case "COUNTERED":
      // v3.8.aka Item 89 CLOSED — Counter-tender email now fires alongside
      // the in-app Notification. AE-facing (poster of the tender), shows
      // offered vs countered with delta + delta-percent context so the
      // AE can decide inbox-side whether to accept, re-counter, or
      // decline. Counter UI on carrier side doesn't exist today (Item
      // 144 banked); when it ships, this email path will already be
      // wired so the AE workflow is end-to-end on day 1.
      await createNotification(
        posterId,
        "TENDER_RECEIVED",
        "Tender Counter Offer",
        `The carrier has countered your tender for load ${ref} (${lane}) with a rate of $${(tender.counterRate ?? tender.offeredRate).toLocaleString()}.`,
        { actionUrl: "/dashboard/tenders" }
      );
      if (aeEmail && tender.counterRate != null) {
        try {
          await sendTenderCounteredEmail({
            to: aeEmail,
            ref,
            loadId: tender.load.id,
            originName,
            destName,
            carrierName,
            offeredRate: tender.offeredRate,
            counterRate: tender.counterRate,
          });
        } catch (err) {
          log.error({ err, tenderId, aeEmail }, "[NotificationService] sendTenderCounteredEmail failed");
        }
      } else if (!aeEmail) {
        log.warn({ tenderId, posterId }, "[NotificationService] COUNTERED: no AE email available; in-app only");
      } else {
        // counterRate null — defensive; counterTender controller validates
        // counterRate via counterTenderSchema (positive number required)
        // before this fires, so this branch is unreachable from the live
        // path. Logged in case a future code path skips validation.
        log.warn({ tenderId, posterId }, "[NotificationService] COUNTERED: counterRate is null; email skipped");
      }
      break;
  }
}

/**
 * v3.8.alp Item 51.b — loadboard-bid accept/decline fan-out.
 *
 * Parallel to notifyTenderAction but keyed on LoadBid (the carrier's own
 * offer on an open loadboard load) rather than LoadTender. Recommendation
 * (a) from §13.3 Item 51.b: a dedicated helper rather than overloading
 * notifyTenderAction with a polymorphic { tenderId | bidId } arg, so the
 * two model shapes stay cleanly separated.
 *
 * Note: LoadBid.carrierId is a User.id (per the submission convention at
 * routes/loadBids.ts), NOT a CarrierProfile.id — so the carrier user is
 * looked up directly by id. Acceptance DISPATCHES the load (loadboard is
 * the auto-pilot path per CLAUDE.md §2 dispatch divergence table), which
 * is reflected in the carrier-facing email copy.
 */
export async function notifyBidAction(
  bidId: string,
  action: "ACCEPTED" | "DECLINED",
) {
  const bid = await prisma.loadBid.findUnique({
    where: { id: bidId },
    include: {
      load: {
        select: {
          referenceNumber: true,
          originCity: true,
          originState: true,
          destCity: true,
          destState: true,
          pickupDate: true,
          deliveryDate: true,
        },
      },
    },
  });

  if (!bid) {
    log.warn(`[NotificationService] Bid ${bidId} not found`);
    return;
  }

  const carrierUser = await prisma.user.findUnique({
    where: { id: bid.carrierId },
    select: {
      email: true,
      firstName: true,
      lastName: true,
      company: true,
      carrierProfile: { select: { contactEmail: true, companyName: true } },
    },
  });

  if (!carrierUser) {
    log.warn(`[NotificationService] Bid ${bidId} carrier user ${bid.carrierId} not found`);
    return;
  }

  const ref = bid.load.referenceNumber;
  const lane = `${bid.load.originCity}, ${bid.load.originState} → ${bid.load.destCity}, ${bid.load.destState}`;
  const originName = `${bid.load.originCity}, ${bid.load.originState}`;
  const destName = `${bid.load.destCity}, ${bid.load.destState}`;
  const carrierEmail = carrierUser.carrierProfile?.contactEmail ?? carrierUser.email;
  const carrierName =
    carrierUser.carrierProfile?.companyName ??
    carrierUser.company ??
    `${carrierUser.firstName} ${carrierUser.lastName}`.trim();
  const bidRate = Number(bid.bidRate);

  if (action === "ACCEPTED") {
    await createNotification(
      bid.carrierId,
      "TENDER_ACCEPTED",
      "Bid Accepted — Load Dispatched",
      `Your bid for load ${ref} (${lane}) was accepted at $${bidRate.toLocaleString()}. The load is dispatched in your name.`,
      { actionUrl: "/carrier/dashboard/my-loads" }
    );
    if (carrierEmail) {
      try {
        await sendBidAcceptedEmail({
          to: carrierEmail,
          ref,
          originName,
          destName,
          carrierName,
          rate: bidRate,
          pickupDate: bid.load.pickupDate ? new Date(bid.load.pickupDate).toLocaleDateString() : null,
          deliveryDate: bid.load.deliveryDate ? new Date(bid.load.deliveryDate).toLocaleDateString() : null,
        });
      } catch (err) {
        log.error({ err, bidId, carrierEmail }, "[NotificationService] sendBidAcceptedEmail failed");
      }
    } else {
      log.warn({ bidId, carrierUserId: bid.carrierId }, "[NotificationService] bid ACCEPTED: no carrier email; in-app only");
    }
  } else {
    await createNotification(
      bid.carrierId,
      "LOAD_UPDATE",
      "Bid Not Selected",
      `Your bid for load ${ref} (${lane}) was not selected this time.`,
      { actionUrl: "/carrier/dashboard/loadboard" }
    );
    if (carrierEmail) {
      try {
        await sendBidDeclinedEmail({
          to: carrierEmail,
          ref,
          originName,
          destName,
          carrierName,
        });
      } catch (err) {
        log.error({ err, bidId, carrierEmail }, "[NotificationService] sendBidDeclinedEmail failed");
      }
    } else {
      log.warn({ bidId, carrierUserId: bid.carrierId }, "[NotificationService] bid DECLINED: no carrier email; in-app only");
    }
  }
}

/**
 * Notify the carrier when a payment is approved, paid, or rejected.
 */
export async function notifyPaymentEvent(
  paymentId: string,
  event: "APPROVED" | "PAID" | "REJECTED"
) {
  const payment = await prisma.carrierPay.findUnique({
    where: { id: paymentId },
    select: {
      id: true,
      paymentNumber: true,
      carrierId: true,
      netAmount: true,
      load: {
        select: {
          referenceNumber: true,
        },
      },
    },
  });

  if (!payment) {
    log.warn(`[NotificationService] Payment ${paymentId} not found`);
    return;
  }

  const ref = payment.load.referenceNumber;
  const amount = `$${payment.netAmount.toLocaleString()}`;

  const typeMap: Record<string, NotificationType> = {
    APPROVED: "PAYMENT_APPROVED",
    PAID: "PAYMENT_RECEIVED",
    REJECTED: "SYSTEM_ALERT",
  };

  const titleMap: Record<string, string> = {
    APPROVED: "Payment Approved",
    PAID: "Payment Received",
    REJECTED: "Payment Rejected",
  };

  const messageMap: Record<string, string> = {
    APPROVED: `Payment of ${amount} for load ${ref} has been approved and is being processed.`,
    PAID: `Payment of ${amount} for load ${ref} has been sent. Reference: ${payment.paymentNumber ?? "N/A"}.`,
    REJECTED: `Payment for load ${ref} has been rejected. Please contact support for details.`,
  };

  await createNotification(
    payment.carrierId,
    typeMap[event],
    titleMap[event],
    messageMap[event],
    { actionUrl: "/dashboard/payments" }
  );
}

/**
 * Notify the load poster when an invoice is sent or paid.
 */
export async function notifyInvoiceEvent(
  invoiceId: string,
  event: "SENT" | "PAID"
) {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    select: {
      id: true,
      invoiceNumber: true,
      amount: true,
      load: {
        select: {
          referenceNumber: true,
          posterId: true,
        },
      },
    },
  });

  if (!invoice) {
    log.warn(`[NotificationService] Invoice ${invoiceId} not found`);
    return;
  }

  const ref = invoice.load.referenceNumber;
  const amount = `$${invoice.amount.toLocaleString()}`;
  const posterId = invoice.load.posterId;

  const typeMap: Record<string, NotificationType> = {
    SENT: "INVOICE_SENT",
    PAID: "INVOICE_PAID",
  };

  const titleMap: Record<string, string> = {
    SENT: "Invoice Received",
    PAID: "Invoice Paid",
  };

  const messageMap: Record<string, string> = {
    SENT: `Invoice ${invoice.invoiceNumber} for ${amount} has been submitted for load ${ref}.`,
    PAID: `Invoice ${invoice.invoiceNumber} for load ${ref} has been marked as paid.`,
  };

  await createNotification(
    posterId,
    typeMap[event],
    titleMap[event],
    messageMap[event],
    { actionUrl: "/dashboard/invoices" }
  );
}

/**
 * Notify parties involved when a dispute is filed or resolved.
 */
export async function notifyDisputeEvent(
  disputeId: string,
  event: "FILED" | "RESOLVED"
) {
  const dispute = await prisma.paymentDispute.findUnique({
    where: { id: disputeId },
    select: {
      id: true,
      disputeNumber: true,
      disputedAmount: true,
      status: true,
      resolutionAmount: true,
      filedById: true,
      resolvedById: true,
      carrierId: true,
      carrierPayment: {
        select: {
          carrierId: true,
          load: {
            select: {
              referenceNumber: true,
              posterId: true,
            },
          },
        },
      },
    },
  });

  if (!dispute) {
    log.warn(`[NotificationService] Dispute ${disputeId} not found`);
    return;
  }

  const ref = dispute.carrierPayment.load.referenceNumber;
  const disputeLabel = dispute.disputeNumber ?? disputeId.slice(0, 8);
  const carrierId = dispute.carrierId ?? dispute.carrierPayment.carrierId;
  const posterId = dispute.carrierPayment.load.posterId;

  if (event === "FILED") {
    // Notify the poster that a dispute has been filed against their load
    await createNotification(
      posterId,
      "DISPUTE_FILED",
      "Dispute Filed",
      `Dispute ${disputeLabel} has been filed for load ${ref} — disputed amount: $${dispute.disputedAmount.toLocaleString()}.`,
      { actionUrl: "/dashboard/disputes" }
    );

    // If the filer is not the carrier, also notify the carrier
    if (dispute.filedById !== carrierId) {
      await createNotification(
        carrierId,
        "DISPUTE_FILED",
        "Dispute Filed",
        `Dispute ${disputeLabel} has been filed regarding load ${ref}.`,
        { actionUrl: "/dashboard/disputes" }
      );
    }
  }

  if (event === "RESOLVED") {
    const resolutionMsg = dispute.resolutionAmount != null
      ? ` Resolution amount: $${dispute.resolutionAmount.toLocaleString()}.`
      : "";

    const recipients = new Set([carrierId, posterId]);

    await Promise.all(
      Array.from(recipients).map((userId) =>
        createNotification(
          userId,
          "DISPUTE_RESOLVED",
          "Dispute Resolved",
          `Dispute ${disputeLabel} for load ${ref} has been resolved (${dispute.status}).${resolutionMsg}`,
          { actionUrl: "/dashboard/disputes" }
        )
      )
    );
  }
}

/**
 * Notify all admins when a shipper's credit limit is exceeded or at risk.
 */
export async function notifyCreditAlert(shipperId: string, message: string) {
  const admins = await prisma.user.findMany({
    where: { role: "ADMIN", isActive: true },
    select: { id: true },
  });

  if (admins.length === 0) {
    log.warn("[NotificationService] No active admins found for credit alert");
    return;
  }

  await Promise.all(
    admins.map((admin) =>
      createNotification(
        admin.id,
        "CREDIT_ALERT",
        "Credit Limit Alert",
        message,
        { actionUrl: "/dashboard/credit" }
      )
    )
  );
}
