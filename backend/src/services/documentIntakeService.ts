/**
 * Document intake — the one place a persisted carrier document gets parsed.
 *
 * v3.8.awh. The COI reader has existed for months with exactly one entry point,
 * an admin endpoint no UI ever called, so no uploaded document was ever read.
 * The W-9 parser had no caller at all. This is the trigger that was ratified and
 * never built.
 *
 * ONE CALL SITE, NOT PER ROUTE. Documents are persisted from eight places;
 * three of them are carrier compliance documents (registration, AE console,
 * carrier portal). Each notifies this service and this service decides what to
 * do. Putting the parse in the routes would mean three copies of the confidence
 * rules, the discrepancy comparison and the failure handling, which is how the
 * suspension-reason columns and the five drawer widths happened.
 *
 * THREE PROPERTIES, each of which is a rule rather than a preference:
 *
 * 1. **A parse failure never fails the upload.** The document is the thing of
 *    value; the reading is a convenience. A carrier who uploaded a valid COI
 *    must not see an error because a model was slow, and an AE must not lose a
 *    document because a parser broke. Fire-and-forget, every path caught.
 *
 * 2. **Extracted values never overwrite typed values.** They are written to
 *    DocumentExtraction, beside the carrier's own figures, never onto
 *    CarrierProfile. Typed values are what the carrier attested to; extracted
 *    values are a second reading. When they disagree that is a finding for a
 *    human, not a fact to overwrite with.
 *
 * 3. **A failed or low-confidence parse produces a REVIEW STATE, never a silent
 *    zero and never an auto-pass.** An empty extraction that looks like a
 *    successful read of an empty document is the worst outcome available here:
 *    it would let a carrier through on a document nobody read.
 */
import { prisma } from "../config/database";
import { log } from "../lib/logger";
import { extractCOIData, type COIExtractedData } from "./coiReaderService";
import { getFileStream } from "./storageService";

/** Document types this service reads. Anything else is persisted and ignored. */
const PARSEABLE = new Set(["COI", "W9"]);

export type ExtractionStatus = "OK" | "LOW_CONFIDENCE" | "FAILED";

export interface Discrepancy {
  field: string;
  typed: string | number | null;
  extracted: string | number | null;
}

interface IntakeArgs {
  documentId: string;
  docType: string | null;
  entityType: string | null;
  entityId: string | null;
  fileUrl: string;
  fileType: string;
}

/** Read a stream into a Buffer — the reader wants bytes, storage returns a stream. */
async function toBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c));
  return Buffer.concat(chunks);
}

/** Money comparison with a tolerance — a COI saying 1,000,000 and a field saying
 *  1000000.00 are the same number, and flagging that would be noise. */
function amountsDiffer(typed: unknown, extracted: unknown): boolean {
  const t = typeof typed === "number" ? typed : Number(typed);
  const e = typeof extracted === "number" ? extracted : Number(extracted);
  if (!Number.isFinite(t) || !Number.isFinite(e)) return false;
  return Math.abs(t - e) > 0.5;
}

/** Dates differ if they land on different days. Time-of-day on a COI is noise. */
function datesDiffer(typed: Date | null | undefined, extracted: string | null): boolean {
  if (!typed || !extracted) return false;
  const e = new Date(extracted);
  if (Number.isNaN(e.getTime())) return false;
  return typed.toISOString().slice(0, 10) !== e.toISOString().slice(0, 10);
}

/**
 * Compare a COI reading against what the carrier typed at registration.
 *
 * Only fields where BOTH sides have a value are compared. A missing typed value
 * is not a disagreement — it is an unanswered question, and reporting it as a
 * discrepancy would bury the real ones.
 */
export function findCoiDiscrepancies(
  extracted: COIExtractedData,
  typed: {
    autoLiabilityAmount?: unknown;
    cargoInsuranceAmount?: unknown;
    generalLiabilityAmount?: unknown;
    workersCompAmount?: unknown;
    insuranceExpiry?: Date | null;
    companyName?: string | null;
  },
): Discrepancy[] {
  const out: Discrepancy[] = [];
  const money: [string, unknown, number | null | undefined][] = [
    ["Auto liability", typed.autoLiabilityAmount, extracted.autoLiability?.combinedSingleLimit],
    ["Cargo insurance", typed.cargoInsuranceAmount, extracted.cargoInsurance?.perOccurrence],
    ["General liability", typed.generalLiabilityAmount, extracted.generalLiability?.perOccurrence],
    ["Workers comp", typed.workersCompAmount, extracted.workersComp?.perAccident],
  ];
  for (const [field, t, e] of money) {
    if (t == null || e == null) continue;
    if (amountsDiffer(t, e)) out.push({ field, typed: Number(t), extracted: e });
  }
  if (datesDiffer(typed.insuranceExpiry, extracted.expirationDate)) {
    out.push({
      field: "Insurance expiry",
      typed: typed.insuranceExpiry ? typed.insuranceExpiry.toISOString().slice(0, 10) : null,
      extracted: extracted.expirationDate,
    });
  }
  // Named insured vs the carrier we think we are onboarding. A COI belonging to
  // a different company is the single most consequential thing a reader can
  // catch here, so it is compared loosely — punctuation and suffixes vary
  // wildly between a COI and a registration form.
  if (typed.companyName && extracted.certificateHolder) {
    const norm = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
    const a = norm(typed.companyName);
    const b = norm(extracted.certificateHolder);
    if (a && b && !b.includes(a) && !a.includes(b)) {
      out.push({ field: "Named party", typed: typed.companyName, extracted: extracted.certificateHolder });
    }
  }
  return out;
}

/**
 * Called after a document row is written. Never awaited by the caller.
 *
 * Exported separately from the fire-and-forget wrapper so tests can await it;
 * production paths use `queueDocumentIntake`.
 */
export async function runDocumentIntake(args: IntakeArgs): Promise<void> {
  if (!args.docType || !PARSEABLE.has(args.docType)) return;
  if (!args.fileUrl) return; // an UPLOAD_FAILED row has nothing to read

  const base = {
    documentId: args.documentId,
    carrierProfileId: args.entityType === "CARRIER" ? args.entityId : null,
    docType: args.docType,
  };

  const record = async (
    status: ExtractionStatus,
    fields: { confidence?: string | null; extracted?: unknown; discrepancies?: unknown; error?: string | null },
  ) => {
    await prisma.documentExtraction.upsert({
      where: { documentId: args.documentId },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      create: { ...base, status, ...(fields as any) },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      update: { status, ...(fields as any) },
    });
  };

  try {
    const buf = await toBuffer(await getFileStream(args.fileUrl));

    if (args.docType === "W9") {
      // The W-9 reader is not built. Recording the intent explicitly beats
      // silently skipping: a W-9 that shows "not yet read" is honest, and a
      // W-9 that shows nothing is indistinguishable from one that was read and
      // found to contain nothing.
      await record("FAILED", { error: "W-9 reading is not implemented yet — verify the TIN by hand." });
      return;
    }

    const extracted = await extractCOIData(buf, args.fileType);

    const carrier = base.carrierProfileId
      ? await prisma.carrierProfile.findUnique({ where: { id: base.carrierProfileId } })
      : null;

    const discrepancies = carrier
      ? findCoiDiscrepancies(extracted, {
          autoLiabilityAmount: carrier.autoLiabilityAmount,
          cargoInsuranceAmount: carrier.cargoInsuranceAmount,
          generalLiabilityAmount: carrier.generalLiabilityAmount,
          workersCompAmount: carrier.workersCompAmount,
          insuranceExpiry: carrier.insuranceExpiry,
          companyName: carrier.companyName,
        })
      : [];

    // A reading nobody should act on unreviewed: the model said LOW, or it
    // returned nothing recognisable. Both mean a human looks; neither means the
    // carrier did anything wrong, and neither blocks the application.
    const emptyRead = !extracted.policyNumber && !extracted.insurerName && !extracted.expirationDate;
    const status: ExtractionStatus =
      extracted.confidence === "LOW" || emptyRead ? "LOW_CONFIDENCE" : "OK";

    await record(status, {
      confidence: extracted.confidence,
      extracted: extracted as unknown,
      discrepancies,
      error: emptyRead ? "Nothing recognisable was read from this document." : null,
    });

    log.info(
      { documentId: args.documentId, status, discrepancies: discrepancies.length },
      "[DocIntake] COI read",
    );
  } catch (err) {
    // The parse failed. The document is untouched and the upload already
    // succeeded; all that changes is that a human is asked to look.
    await record("FAILED", {
      error: err instanceof Error ? err.message.slice(0, 300) : "parse failed",
    }).catch((e) => log.error({ e }, "[DocIntake] could not even record the failure"));
    log.error({ err, documentId: args.documentId }, "[DocIntake] parse failed — flagged for review");
  }
}

/**
 * Fire-and-forget entry point for route handlers.
 *
 * Deliberately returns void and swallows everything. A caller that awaited this
 * would make an upload wait on a model, and a caller that let it throw would
 * fail an upload because a parser broke — the two outcomes rule 1 exists to
 * prevent.
 */
export function queueDocumentIntake(args: IntakeArgs): void {
  void runDocumentIntake(args).catch((err) =>
    log.error({ err, documentId: args.documentId }, "[DocIntake] intake threw outside its own handler"),
  );
}
