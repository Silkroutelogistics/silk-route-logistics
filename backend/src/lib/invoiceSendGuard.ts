/**
 * One customer invoice per load goes out. Everything after it is a supplemental.
 *
 * WHY. On 2026-09-26 the four Beekeepers invoices turned out to have been sent
 * by hand while the system still held its own DRAFT for three of the loads.
 * Nothing stopped a send of a second BASE invoice for a load whose first had
 * already gone, and a customer's AP holding two invoices for one load is the
 * shape that gets a load paid twice, or not at all while they ask which.
 *
 * THE RULE. A BASE invoice may not be sent, or flipped to SENT, while another
 * BASE invoice on the same load is already SENT or later. A SUPPLEMENTAL is
 * exempt: it is a separate document for a charge the base never carried, and
 * sending one after the base is its whole purpose (v3.8.asb). Re-sending the
 * SAME invoice is refused by the send route's own status check.
 *
 * "SENT or later" is every status after a document has left SRL, including
 * PAID and OVERDUE. VOID, REJECTED, DRAFT and SUBMITTED are not.
 */
import { prisma } from "../config/database";

export const SENT_OR_LATER = ["SENT", "PARTIAL", "UNDER_REVIEW", "APPROVED", "FUNDED", "PAID", "OVERDUE"] as const;

export interface PriorSent { id: string; invoiceNumber: string; srlDocNumber: string | null; status: string }

/** The BASE invoice already sent on this load, if sending `invoiceId` would be a second one. */
export async function priorSentBaseInvoice(
  loadId: string,
  invoiceId: string,
  invoiceKind: string | null | undefined,
  client: any = prisma,
): Promise<PriorSent | null> {
  if (invoiceKind === "SUPPLEMENTAL") return null;
  return client.invoice.findFirst({
    where: {
      loadId,
      id: { not: invoiceId },
      invoiceKind: "BASE",
      deletedAt: null,
      status: { in: [...SENT_OR_LATER] },
    },
    select: { id: true, invoiceNumber: true, srlDocNumber: true, status: true },
  });
}

export function priorSentMessage(p: PriorSent): string {
  return `An invoice for this load has already been sent (${p.srlDocNumber ?? p.invoiceNumber}, ${p.status}). A second one is not sent; bill anything further as a supplemental.`;
}
