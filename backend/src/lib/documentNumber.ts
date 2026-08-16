import { prisma } from "../config/database";

/**
 * Load numbers and the document numbers derived from them.
 *
 * ONE anchor, one derivation rule, one allocator. Before this module there were
 * three creators of loads (two of which skipped numbering entirely) and three
 * different rules for rendering "the load's identifier", in one file:
 *
 *   pdfService.ts:409   load.loadNumber || load.referenceNumber   -> BOL-SRL-121485
 *   pdfService.ts:1633  fd.referenceNumber || load.referenceNumber -> RC-SRL-SRL-121485
 *   pdfService.ts:2550  fd.referenceNumber || load.referenceNumber -> SRL-121485
 *
 * The middle one double-prefixed in production: referenceNumber already carries
 * the "SRL-" stem, so `RC-SRL-${ref}` rendered RC-SRL-SRL-121488 on every page
 * header of every Rate Confirmation. The last two ignore loadNumber, so one load
 * could print two different identifiers on two documents.
 *
 * ─── The scheme ────────────────────────────────────────────────────────────
 *
 * SUFFIX on a shared stem, never a prefix. The stem is the load number, so every
 * document for one load sorts together in any system that sorts a text column —
 * which is the entire point, and what a prefix scheme (BOL-…, RC-…) destroys.
 *
 *     Load          SRL-121485      the anchor
 *     BOL           SRL-121485B
 *     Rate con      SRL-121485R
 *     Invoice       SRL-121485I
 *     Supplemental  SRL-121485S     accessorial-only invoice
 *     Settlement    SRL-121485P     P for pay, so it cannot collide with S
 *
 * This is the Bison Transport convention (load 5789854, invoice 5789854A,
 * accessorials 5789854S) carried onto the SRL stem. The SRL- prefix stays so a
 * carrier hauling for several brokers can tell whose paper they are holding.
 *
 * ─── Re-issues ─────────────────────────────────────────────────────────────
 *
 * A re-issue takes a numeric revision: SRL-121485R2, then R3. Revision 1 has no
 * digit, so the common case reads clean. Numbers are NEVER reused: in a dispute
 * the document has to say on its face which version the carrier signed.
 *
 * Every column these land in is @unique, so reuse would throw anyway. That is
 * load-bearing rather than incidental — see withDocumentNumber, which uses the
 * constraint as the arbiter between two AEs re-issuing at the same moment.
 *
 * ─── Allocate at creation, never at render ─────────────────────────────────
 *
 * Renderers READ (documentNumberFor). Creators ALLOCATE (withDocumentNumber).
 * Regenerating a PDF must produce the same number it produced last time, which
 * is the whole reason these are persisted rather than derived at render.
 *
 * There is also a hard mechanical reason the renderer cannot allocate:
 * generateEnhancedRateConfirmation is synchronous and scripts/verify-rc-matrix.ts
 * drives it with plain fixture objects and no database. A DB write in the render
 * path would force it async and break that gate.
 */

export type DocumentKind =
  | "BOL"
  | "RATE_CONFIRMATION"
  | "INVOICE"
  | "SUPPLEMENTAL_INVOICE"
  | "SETTLEMENT";

/** Suffix letters. "P" for the settlement so it cannot collide with the
 *  supplemental invoice's "S". */
export const DOCUMENT_SUFFIX: Record<DocumentKind, string> = {
  BOL: "B",
  RATE_CONFIRMATION: "R",
  INVOICE: "I",
  SUPPLEMENTAL_INVOICE: "S",
  SETTLEMENT: "P",
};

/** The shape every derivation needs off a load. Deliberately structural rather
 *  than the Prisma type: renderers are handed plain fixture objects by
 *  scripts/verify-rc-matrix.ts and by pdfController's ad-hoc BOL payload. */
export interface LoadStemSource {
  loadNumber?: string | null;
  referenceNumber?: string | null;
}

/**
 * THE derivation rule for a load's identifier. One rule, one place.
 *
 * Precedence is `loadNumber` then `referenceNumber`, and the reason is that they
 * are not two names for the same thing:
 *
 *   loadNumber      written ONLY by generateLoadNumber, from the Postgres
 *                   sequence. When set it is always a real SRL- stem.
 *   referenceNumber @unique @default(cuid()). It gets the SRL- number on the
 *                   canonical path, but historically it also absorbed a cuid
 *                   (email-to-load) or an RFQ-<base36> stamp (shipper portal)
 *                   from creators that never called the generator.
 *
 * So loadNumber is authoritative when present and referenceNumber is the legacy
 * fallback, which is exactly the pdfService.ts:409 rule — the BOL had it right
 * and the other two sites had it wrong.
 *
 * Rate Confirmation formData carries its own `referenceNumber` and the two RC
 * sites preferred it. That is dropped here on purpose: formData is an
 * AE-editable snapshot, so honouring it lets the RC print a different identifier
 * than the BOL for the same freight. The stem comes from the load record.
 */
export function resolveLoadStem(load: LoadStemSource | null | undefined): string | null {
  const stem = load?.loadNumber || load?.referenceNumber;
  return stem ? String(stem).trim() || null : null;
}

/** `SRL-121485` + RATE_CONFIRMATION + rev 2 -> `SRL-121485R2`. Revision 1 omits
 *  the digit so the common case reads clean. */
export function formatDocumentNumber(stem: string, kind: DocumentKind, revision = 1): string {
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error(`Invalid document revision ${revision}: must be an integer >= 1`);
  }
  return `${stem}${DOCUMENT_SUFFIX[kind]}${revision === 1 ? "" : revision}`;
}

/**
 * Revision number encoded in `value`, or null if it is not a document number for
 * this stem and kind.
 *
 * Parsed against a KNOWN stem rather than by pattern-matching the whole string.
 * A legacy stem can be a 25-character cuid containing letters, so a general
 * `^(.*)([BRISP])(\d*)$` cannot tell the suffix from the stem's own last
 * character. Anchoring on the stem removes the ambiguity entirely.
 */
export function parseDocumentRevision(
  value: string | null | undefined,
  stem: string,
  kind: DocumentKind,
): number | null {
  if (!value) return null;
  const prefix = `${stem}${DOCUMENT_SUFFIX[kind]}`;
  if (!value.startsWith(prefix)) return null;
  const tail = value.slice(prefix.length);
  if (tail === "") return 1;
  if (!/^\d+$/.test(tail)) return null;
  const n = parseInt(tail, 10);
  return n >= 1 ? n : null;
}

/**
 * What a renderer prints. Persisted number wins; otherwise derive revision 1
 * from the stem so documents predating this module still render a sane
 * identifier instead of a bare cuid.
 *
 * Returns null only when the load has no stem at all, which after the numbering
 * fix in loadController/shipperPortalController/emailToLoadService cannot happen
 * for a newly created load.
 */
export function documentNumberFor(
  persisted: string | null | undefined,
  load: LoadStemSource | null | undefined,
  kind: DocumentKind,
): string | null {
  if (persisted) return persisted;
  const stem = resolveLoadStem(load);
  return stem ? formatDocumentNumber(stem, kind) : null;
}

// ─── Load number ────────────────────────────────────────────────────────────

/**
 * Next load number from the Postgres sequence.
 *
 * Lifted out of loadController so the two creators that bypassed it can call it:
 * a sequence with more than one path to it is not a sequence. Every load,
 * however it is created, now gets SRL-{seq}.
 *
 * nextval() is non-transactional by design, so a rolled-back create burns a
 * number. That is correct and deliberate — gaps are free, collisions are not.
 */
export async function generateLoadNumber(client: any = prisma): Promise<string> {
  // Idempotent; static SQL, no user input.
  await client.$executeRaw`CREATE SEQUENCE IF NOT EXISTS load_number_seq START WITH 121472`;
  const result = await client.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('load_number_seq') as nextval`;
  if (!result || result.length === 0) {
    throw new Error("Failed to generate load number: sequence returned no result");
  }
  return `SRL-${Number(result[0].nextval)}`;
}

// ─── Allocation ─────────────────────────────────────────────────────────────

/** Where each kind's number is persisted. INVOICE and SUPPLEMENTAL_INVOICE share
 *  a column and are separated by their suffix letter, which is why the scan is a
 *  startsWith on the full `stem + letter` prefix and not on the stem alone. */
interface KindStorage {
  model: string;
  field: string;
}

const STORAGE: Record<DocumentKind, KindStorage> = {
  BOL: { model: "load", field: "srlBolNumber" },
  RATE_CONFIRMATION: { model: "rateConfirmation", field: "rateConNumber" },
  INVOICE: { model: "invoice", field: "srlDocNumber" },
  SUPPLEMENTAL_INVOICE: { model: "invoice", field: "srlDocNumber" },
  SETTLEMENT: { model: "carrierPay", field: "srlDocNumber" },
};

/**
 * Lowest unused revision for this stem and kind.
 *
 * Scans on `startsWith: stem + suffixLetter`. The letter is load-bearing: a scan
 * on the stem alone would return every kind's numbers, and for INVOICE it would
 * also return the SUPPLEMENTAL numbers that share the column. There is no
 * cross-stem bleed either, because the letter always follows the stem's digits —
 * `SRL-121485I` cannot prefix-match a document on stem `SRL-1214851`.
 *
 * Read-then-write, so on its own this races. withDocumentNumber closes that.
 */
export async function nextDocumentNumber(
  kind: DocumentKind,
  stem: string,
  client: any = prisma,
): Promise<string> {
  const { model, field } = STORAGE[kind];
  const prefix = `${stem}${DOCUMENT_SUFFIX[kind]}`;

  const rows = await client[model].findMany({
    where: { [field]: { startsWith: prefix } },
    select: { [field]: true },
  });

  let max = 0;
  for (const row of rows || []) {
    const rev = parseDocumentRevision(row?.[field], stem, kind);
    if (rev !== null && rev > max) max = rev;
  }
  return formatDocumentNumber(stem, kind, max + 1);
}

/**
 * Allocate a document number, run `build` with it, and retry on a unique-
 * constraint violation with a freshly computed number.
 *
 * This is how two AEs re-issuing the same Rate Confirmation at the same instant
 * are kept apart. Both scan, both compute R2, both write; Postgres admits one
 * and rejects the other with P2002; the loser rescans, now sees R2 taken, and
 * takes R3. The @unique constraint is the arbiter, so correctness does not
 * depend on the scan being race-free — which it cannot be.
 *
 * Same shape as createInvoiceWithRetry in lib/invoiceNumber.ts, deliberately:
 * that idiom is already load-bearing here and a second, different concurrency
 * story for the same class of problem would be a liability.
 *
 * Bounded at 6 attempts. Exhausting it rethrows the last error rather than
 * silently returning an unnumbered document.
 */
export async function withDocumentNumber<T>(
  kind: DocumentKind,
  stem: string,
  build: (documentNumber: string) => Promise<T>,
  attempts = 6,
  client: any = prisma,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const documentNumber = await nextDocumentNumber(kind, stem, client);
    try {
      return await build(documentNumber);
    } catch (e: any) {
      lastErr = e;
      if (e?.code === "P2002" && i < attempts - 1) continue; // number taken — rescan and retry
      throw e;
    }
  }
  throw lastErr ?? new Error(`Failed to allocate a unique ${kind} document number for ${stem}`);
}
