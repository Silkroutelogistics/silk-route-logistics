import { prisma } from "../config/database";

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
  | "CREDIT_ALERT";

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
    console.warn(`[NotificationService] Load ${loadId} not found`);
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
 * Notify relevant parties when a tender is offered, accepted, declined, or countered.
 */
export async function notifyTenderAction(
  tenderId: string,
  action: "OFFERED" | "ACCEPTED" | "DECLINED" | "COUNTERED"
) {
  const tender = await prisma.loadTender.findUnique({
    where: { id: tenderId },
    include: {
      load: {
        select: {
          referenceNumber: true,
          posterId: true,
          originCity: true,
          originState: true,
          destCity: true,
          destState: true,
        },
      },
      carrier: {
        select: {
          userId: true,
        },
      },
    },
  });

  if (!tender) {
    console.warn(`[NotificationService] Tender ${tenderId} not found`);
    return;
  }

  const lane = `${tender.load.originCity}, ${tender.load.originState} → ${tender.load.destCity}, ${tender.load.destState}`;
  const ref = tender.load.referenceNumber;
  const carrierUserId = tender.carrier.userId;
  const posterId = tender.load.posterId;

  switch (action) {
    case "OFFERED":
      await createNotification(
        carrierUserId,
        "TENDER_RECEIVED",
        "New Tender Received",
        `You have received a tender for load ${ref} (${lane}) at $${tender.offeredRate.toLocaleString()}.`,
        { actionUrl: "/dashboard/tenders" }
      );
      break;

    case "ACCEPTED":
      await createNotification(
        posterId,
        "TENDER_ACCEPTED",
        "Tender Accepted",
        `Your tender for load ${ref} (${lane}) has been accepted at $${tender.offeredRate.toLocaleString()}.`,
        { actionUrl: "/dashboard/loads" }
      );
      break;

    case "DECLINED":
      await createNotification(
        posterId,
        "TENDER_DECLINED",
        "Tender Declined",
        `Your tender for load ${ref} (${lane}) has been declined by the carrier.`,
        { actionUrl: "/dashboard/loads" }
      );
      break;

    case "COUNTERED":
      await createNotification(
        posterId,
        "TENDER_RECEIVED",
        "Tender Counter Offer",
        `The carrier has countered your tender for load ${ref} (${lane}) with a rate of $${(tender.counterRate ?? tender.offeredRate).toLocaleString()}.`,
        { actionUrl: "/dashboard/tenders" }
      );
      break;
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
    console.warn(`[NotificationService] Payment ${paymentId} not found`);
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
    console.warn(`[NotificationService] Invoice ${invoiceId} not found`);
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
    console.warn(`[NotificationService] Dispute ${disputeId} not found`);
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
    console.warn("[NotificationService] No active admins found for credit alert");
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
