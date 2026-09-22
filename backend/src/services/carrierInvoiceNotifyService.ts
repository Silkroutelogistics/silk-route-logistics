/**
 * Ruling 4 (2026-09-21): when a carrier's INVOICE lands on a load, accounting
 * is told -- by email to ACCOUNTING_EMAIL AND by an in-app row for every
 * ACCOUNTING-role user. The email carries the load ref, the carrier's name,
 * the CarrierPay amount and an auth-gated settlement link. No attachment,
 * no bank or tax data.
 *
 * Fired by the load-document seam (services/loadDocumentService) once per
 * INVOICE document, after the settlement doc-flag sync -- so by the time
 * accounting opens the settlement, docCarrierInvoice already reads true on
 * it. The E5 approval gate (lib/carrierPayInvoiceGate) is what then lets the
 * settlement move.
 *
 * ONCE PER DOCUMENT, BY CONSTRUCTION. The seam is called once per upload and
 * a Document row is created once, so this fires once per invoice. The in-app
 * rows carry the document id in their link and are deduped on it as
 * belt-and-braces (the onboardingLifecycleService announceOnce shape); a
 * carrier who uploads a corrected invoice produces a new row, which is right
 * -- it is a new document accounting has to look at.
 *
 * WHY NO ATTACHMENT. The invoice is reached inside the console, behind
 * AuthGuard, by id. Mailing the bytes puts a document that names the
 * carrier's remit-to details into an inbox that is forwarded, searched and
 * retained outside the platform's access rules.
 *
 * Never throws: a notification failure must not fail the upload that
 * triggered it. The seam's own result is the record that the document
 * landed.
 */
import { prisma } from "../config/database";
import { sendEmail, wrap } from "./emailService";
import { ACCOUNTING_EMAIL } from "../config/authority";
import { log } from "../lib/logger";

const PORTAL_BASE = "https://silkroutelogistics.ai";

export interface CarrierInvoiceNotifyResult {
  /** Whether the accounting email was handed to the transport. */
  emailed: boolean;
  /** In-app rows created (one per active ACCOUNTING user not already told about this document). */
  rows: number;
  /** Why nothing happened, when nothing did. */
  skipped?: "LOAD_NOT_FOUND" | "ERROR";
}

/** The settlement, from the accounting console. Auth-gated by the console's AuthGuard; the id is not a secret. */
export function settlementLinkFor(loadId: string, documentId: string): string {
  return `/dashboard/settlements?load=${encodeURIComponent(loadId)}&invoice=${encodeURIComponent(documentId)}`;
}

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export async function notifyAccountingOfCarrierInvoice(loadId: string, documentId: string): Promise<CarrierInvoiceNotifyResult> {
  try {
    const load = await prisma.load.findUnique({
      where: { id: loadId },
      select: {
        id: true, referenceNumber: true, loadNumber: true,
        originCity: true, originState: true, destCity: true, destState: true,
        carrier: { select: { firstName: true, lastName: true, company: true, carrierProfile: { select: { companyName: true } } } },
      },
    });
    if (!load) return { emailed: false, rows: 0, skipped: "LOAD_NOT_FOUND" };

    // The amount the carrier is owed: the live settlement's net, when one has
    // been prepared. An invoice can arrive before delivery, in which case the
    // settlement does not exist yet and the email says so rather than
    // printing a number from somewhere else.
    const pay = await prisma.carrierPay.findFirst({
      where: { loadId, status: { not: "VOID" } },
      orderBy: { createdAt: "desc" },
      select: { id: true, netAmount: true, status: true },
    });

    const ref = load.loadNumber ?? load.referenceNumber;
    const carrierName = load.carrier?.carrierProfile?.companyName
      ?? load.carrier?.company
      ?? ([load.carrier?.firstName, load.carrier?.lastName].filter(Boolean).join(" ") || null)
      ?? "the carrier";
    const lane = `${load.originCity}, ${load.originState} to ${load.destCity}, ${load.destState}`;
    const link = settlementLinkFor(load.id, documentId);
    const amountLine = pay
      ? `${money(pay.netAmount)} (settlement ${pay.status.toLowerCase()})`
      : "settlement not yet prepared";

    // In-app: every active ACCOUNTING user, once per document.
    const accountants = await prisma.user.findMany({
      where: { role: "ACCOUNTING", isActive: true },
      select: { id: true },
    });
    let rows = 0;
    for (const u of accountants) {
      const already = await prisma.notification.findFirst({ where: { userId: u.id, actionUrl: link }, select: { id: true } });
      if (already) continue;
      await prisma.notification.create({
        data: {
          userId: u.id,
          type: "DOCUMENT_UPLOADED",
          title: `Carrier invoice received: ${ref}`,
          message: `${carrierName} sent their invoice for ${ref}. Carrier pay ${amountLine}.`,
          actionUrl: link,
        },
      });
      rows++;
    }

    // Email: the four facts the ruling names, and nothing else.
    const subject = `Carrier invoice received for load ${ref}`;
    const html = wrap(`
      <h2 style="font-family:'Playfair Display',Georgia,serif;color:#0A2540;margin:0 0 12px">Carrier invoice received</h2>
      <p style="color:#0A2540;margin:0 0 16px">The carrier's invoice for this load is on file. The settlement can be reviewed and approved in the console.</p>
      <table style="border-collapse:collapse;width:100%;font-size:14px;color:#0A2540">
        <tr><td style="padding:6px 0;color:#6B7685;width:140px">Load</td><td style="padding:6px 0"><strong>${esc(ref)}</strong> &middot; ${esc(lane)}</td></tr>
        <tr><td style="padding:6px 0;color:#6B7685">Carrier</td><td style="padding:6px 0">${esc(carrierName)}</td></tr>
        <tr><td style="padding:6px 0;color:#6B7685">Carrier pay</td><td style="padding:6px 0">${esc(amountLine)}</td></tr>
      </table>
      <p style="margin:20px 0 0">
        <a href="${PORTAL_BASE}${link}" style="display:inline-block;background:#BA7517;color:#FFFFFF;padding:12px 24px;text-decoration:none;border-radius:6px;font-weight:bold">Open the settlement</a>
      </p>
      <p style="color:#6B7685;font-size:12px;margin-top:16px">The invoice itself is not attached. Open the settlement in the console to view it; the link requires an SRL sign-in.</p>
    `);

    let emailed = false;
    try {
      await sendEmail(ACCOUNTING_EMAIL, subject, html);
      emailed = true;
    } catch (err) {
      log.error({ err, loadId, documentId }, "[CarrierInvoice] accounting email failed (non-fatal)");
    }

    log.info({ loadId, documentId, rows, emailed }, "[CarrierInvoice] accounting notified");
    return { emailed, rows };
  } catch (err) {
    log.error({ err, loadId, documentId }, "[CarrierInvoice] notify failed (non-fatal)");
    return { emailed: false, rows: 0, skipped: "ERROR" };
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
