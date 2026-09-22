/**
 * The one seam through which a load document is recorded — Task E1c
 * (rulings 2026-09-21, docs/audits/carrier-front-lifecycle-audit.md §6).
 *
 * Before this, POST /carrier-loads/:id/documents and POST /documents/upload
 * each recorded a load document in their own shape, and they disagreed about
 * what a POD sets in motion. The carrier route advanced AT_DELIVERY → POD_RECEIVED
 * straight past DELIVERED — its own comment says that is the common case — and
 * so `onLoadDelivered` never fired: no CarrierPay, no CPP recalc, no credit
 * update. **A carrier who uploaded the POD at delivery was never paid** (the P0).
 * The same route ran neither `onPODUploaded` nor `syncSettlementDocFlags`, so
 * even when DELIVERED was flipped first the settlement kept `dueDate: null` and
 * `docPod: false` (the P1). The AE route ran those two hooks but never
 * `onLoadDelivered`, and sent a second POD email through a second sender.
 *
 * One function, called by both routes, so there is one answer to "what does
 * recording a POD do":
 *
 *   1. the docType is validated against the LOAD allowlist (lib/documentTypes)
 *      — and, for a CARRIER actor, against the carrier-uploadable subset of it
 *      (RATE_CON is system-generated and frozen by contentHash; a carrier copy
 *      is a second, unverified record, so it is refused; AE roles keep it) —
 *      and the bytes against their claimed MIME type (magic numbers) — BEFORE
 *      any write, so a refusal stores nothing;
 *   2. the file is stored and the Document row written;
 *   3. a POD advances the load from AT_DELIVERY / LOADED / DELIVERED to
 *      POD_RECEIVED, stamping the actual-delivery time it implies;
 *   4. if that advance SKIPPED DELIVERED, `onLoadDelivered` fires here — it is
 *      the delivery event, and nothing else will ever fire it for this load.
 *      It does not fire when the load was already DELIVERED, because the flip
 *      that got it there fired it, and `onLoadDelivered` increments CPP load
 *      counts, which is not idempotent;
 *   5. `onPODUploaded` runs on every POD (the payment clock, `docPod`, invoice
 *      advance) and `syncSettlementDocFlags` on every document.
 *
 * Steps 4 and 5 are AWAITED and their failures propagate. The alternative —
 * catch, log, return 200 — is the fire-and-forget-with-log-only shape the
 * audit's P0 lived behind. A loud 500 with the loadId in error_logs beats a
 * carrier who is silently never paid; the document row is already stored, and
 * `createCarrierPayOnDelivery` is idempotent on a non-VOID row, so a repaired
 * re-run cannot double-pay.
 *
 * Route concerns stay in the routes: who may attach to this load, suspension,
 * step-up, rate limits, the login-flag, and the response shape.
 */
import path from "path";
import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { uploadFile, validateBufferSignature } from "./storageService";
import { normalizeDocType, isAllowedDocType, carrierMayUploadLoadDocType } from "../lib/documentTypes";
import { actualEventStamps } from "../lib/loadEventStamps";
import { logLoadActivity } from "./loadActivityService";
import { broadcastSSE } from "../routes/trackTraceSSE";
import { onLoadDelivered, onPODUploaded, syncSettlementDocFlags } from "./integrationService";
import { notifyAccountingOfCarrierInvoice } from "./carrierInvoiceNotifyService";
import { autoGenerateInvoice } from "./invoiceService";
import { sendPODToContact } from "./shipperLoadNotifyService";

/** A POD uploaded at any of these advances the load to POD_RECEIVED. */
export const POD_ADVANCING_STATUSES = ["AT_DELIVERY", "DELIVERED", "LOADED"] as const;

/** The statuses at which a POD counts as delivery evidence (the auto-validate rule). */
const DELIVERED_CLASS = new Set(["DELIVERED", "POD_RECEIVED", "INVOICED", "COMPLETED"]);

export class LoadDocumentRefusal extends Error {
  constructor(public readonly status: number, public readonly code: string, message: string) {
    super(message);
    this.name = "LoadDocumentRefusal";
  }
}

export interface RecordLoadDocumentInput {
  loadId: string;
  /** Raw, as the client sent it. Normalized and allow-listed here, in one place. */
  docType: unknown;
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number };
  actor: { id: string; email?: string | null; role: string };
  uploadSource: "CARRIER_PORTAL" | "AE_CONSOLE";
  notes?: string | null;
}

export interface RecordLoadDocumentResult {
  document: { id: string; docType: string; fileUrl: string; [k: string]: unknown };
  docType: string;
  status: { before: string; after: string };
  /** True when this upload was the delivery event (the load skipped DELIVERED). */
  deliveryHooksFired: boolean;
}

export async function recordLoadDocument(input: RecordLoadDocumentInput): Promise<RecordLoadDocumentResult> {
  const docType = normalizeDocType(input.docType) ?? "OTHER";
  if (!isAllowedDocType(docType, "LOAD")) {
    throw new LoadDocumentRefusal(400, "UNKNOWN_DOC_TYPE", `Unknown document type "${docType}"`);
  }
  if (input.actor.role === "CARRIER" && !carrierMayUploadLoadDocType(docType)) {
    throw new LoadDocumentRefusal(
      400,
      "DOC_TYPE_NOT_CARRIER_UPLOADABLE",
      `"${docType}" is issued by SRL and cannot be uploaded from the carrier portal. The signed rate confirmation is already on file.`,
    );
  }
  if (!validateBufferSignature(input.file.buffer, input.file.mimetype)) {
    throw new LoadDocumentRefusal(
      400,
      "FILE_CONTENT_MISMATCH",
      `File "${input.file.originalname}" content does not match its file type. Upload rejected.`,
    );
  }

  const load = await prisma.load.findUnique({
    where: { id: input.loadId },
    select: {
      id: true,
      status: true,
      referenceNumber: true,
      posterId: true,
      destCompany: true,
      actualPickupDatetime: true,
      actualDeliveryDatetime: true,
      customer: { select: { contactName: true } },
    },
  });
  if (!load) throw new LoadDocumentRefusal(404, "LOAD_NOT_FOUND", "Load not found");

  const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
  const ext = path.extname(input.file.originalname).toLowerCase();
  const fileUrl = await uploadFile(input.file.buffer, `documents/${uniqueSuffix}${ext}`, input.file.mimetype);

  const document = await prisma.document.create({
    data: {
      loadId: load.id,
      docType,
      fileName: input.file.originalname,
      fileUrl,
      fileType: input.file.mimetype || "application/octet-stream",
      fileSize: input.file.size,
      entityType: "LOAD",
      entityId: load.id,
      userId: input.actor.id,
      uploadSource: input.uploadSource,
      status: "PENDING",
      notes: input.notes ?? null,
    },
  });

  await logLoadActivity({
    loadId: load.id,
    eventType: "doc_uploaded",
    description: `${docType} uploaded by ${input.uploadSource === "CARRIER_PORTAL" ? "carrier" : "SRL"}`,
    actorType: input.uploadSource === "CARRIER_PORTAL" ? "CARRIER" : "USER",
    actorId: input.actor.id,
    actorName: input.actor.email ?? undefined,
    metadata: { documentId: document.id, docType },
  });
  broadcastSSE({ type: "board_refresh", loadId: load.id, data: { reason: "doc_uploaded" } });

  const before = load.status;
  let after = before;
  let deliveryHooksFired = false;

  if (docType === "POD") {
    after = (POD_ADVANCING_STATUSES as readonly string[]).includes(before) ? "POD_RECEIVED" : before;
    // The old AE path's auto-validate rule: a POD on a delivered load with a
    // named consignee is delivery evidence. Kept for the data (podSigned has no
    // reader today — recorded, not removed); the email below is the one sender.
    const autoValidated = DELIVERED_CLASS.has(after) && !!(load.destCompany || load.customer?.contactName);
    await prisma.load.update({
      where: { id: load.id },
      data: {
        podUrl: fileUrl,
        podReceivedAt: new Date(),
        status: after,
        ...(autoValidated ? { podSigned: true } : {}),
        // A POD that advances without DELIVERED having been flipped is the
        // delivery fallback for the on-time score. Never overwrites a real stamp.
        ...actualEventStamps(after, load),
      },
    });

    // THE P0. An ADVANCE to POD_RECEIVED that did not pass through DELIVERED
    // means the DELIVERED flip — the only other thing that fires the delivery
    // event — never happened for this load. Fire it now, once. Two guards, both
    // load-bearing: the load must have moved IN THIS CALL (a second POD at
    // POD_RECEIVED is not a delivery — the first test draft fired here and the
    // unit test caught it), and it must not have come FROM DELIVERED (that flip
    // already fired it). onLoadDelivered increments CPP counts; twice is wrong.
    const advanced = after !== before;
    if (advanced && after === "POD_RECEIVED" && before !== "DELIVERED") {
      await onLoadDelivered(load.id);
      deliveryHooksFired = true;
    }

    // THE P1. The payment clock starts when documentation arrives (QP §5), and
    // docPod flips — on every POD, whichever route carried it.
    await onPODUploaded(load.id);

    if (after === "POD_RECEIVED") {
      // Idempotent on an existing invoice; non-blocking so the upload stays fast.
      autoGenerateInvoice(load.id).catch((e: unknown) =>
        log.error({ err: e, loadId: load.id }, "[LoadDocument] autoGenerateInvoice failed (non-fatal)"),
      );
    }

    if (load.posterId && load.posterId !== input.actor.id) {
      await prisma.notification.create({
        data: {
          userId: load.posterId,
          type: "LOAD",
          title: "POD Received",
          message: `POD uploaded for load ${load.referenceNumber}`,
          actionUrl: "/dashboard/loads",
        },
      });
    }

    // One POD email, through the Item 8.3 recipient resolver. The AE route used
    // to send a second one through a second sender to the same people.
    sendPODToContact(load.id).catch((e) => log.error({ err: e, loadId: load.id }, "[ShipperNotify] POD"));
  }

  // Recomputed from what exists, so a re-upload or a second document of the
  // same type is free. Also runs inside onLoadDelivered; idempotent.
  await syncSettlementDocFlags(load.id);

  // Ruling 4 (E5): accounting is told when the carrier's invoice lands --
  // email to ACCOUNTING_EMAIL and an in-app row per ACCOUNTING user. After
  // the sync, so the settlement already reads docCarrierInvoice when they
  // open it. Once per document by construction (this seam runs once per
  // upload); fire-and-forget and never throws, like the POD email above.
  if (docType === "INVOICE") void notifyAccountingOfCarrierInvoice(load.id, document.id);

  return { document: document as RecordLoadDocumentResult["document"], docType, status: { before, after }, deliveryHooksFired };
}
