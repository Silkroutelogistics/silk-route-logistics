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
 * the stem, so the RC rendered RC-SRL-SRL-121488 on every page header of every
 * Rate Confirmation. The last two ignore loadNumber, so one load could print two
 * different identifiers on two documents.
 *
 * ─── The scheme (§21.2, amended 2026-09-23) ────────────────────────────────
 *
 * ONE BARE NUMBER per load, carried by the load and by every core document
 * issued against it. No prefix, no suffix:
 *
 *     Load          5001
 *     BOL           5001
 *     Rate con      5001
 *     Invoice       5001
 *     CarrierPay    5001      the load's settlement
 *
 * The number is the point of reference: quoting 5001 names the load and every
 * document on it without having to say which. The retired suffix scheme existed
 * so one load's documents sorted together; one number does that better, because
 * there is nothing left to sort.
 *
 * Only a SUPPLEMENTAL for a missed accessorial takes a letter, assigned by
 * accessorial type from ACCESSORIAL_LETTER below — 5001A for a lumper, 5001B for
 * pickup detention. That constant is the ONLY place a letter is assigned; a
 * second assignment site is how two types come to share a letter.
 *
 * ─── Legacy numbers are never rewritten ────────────────────────────────────
 *
 * Loads issued before the amendment keep their SRL-1214xx stems AND their
 * B/R/I/S/P suffixes, so SRL-121485R still renders as SRL-121485R. Everything
 * below branches on isLegacyStem() rather than on a date or a feature flag: the
 * stem itself says which scheme it belongs to, which is the only signal that
 * cannot drift out of step with the data.
 *
 * The two namespaces cannot collide. The legacy one is prefixed and the new one
 * is not, so a new 5001B and a legacy SRL-121495B are distinct strings.
 *
 * ─── Re-issues, and why a core re-issue needs a separator ──────────────────
 *
 * A re-issue is a NEW row for the same load (see rateConfirmationController), and
 * rateConNumber / srlDocNumber / srlBolNumber are each @unique. Under the retired
 * scheme the revision hung off the suffix letter: R, then R2. A bare core number
 * has no letter to hang it on, and appending a bare digit is NOT safe — 5001
 * followed by 2 is 50012, which is load 50012's own number.
 *
 * So a core re-issue takes a hyphen: 5001, then 5001-2, then 5001-3. The hyphen
 * cannot occur in a bare load number, so it delimits unambiguously in both
 * directions — when reading a number and when scanning for the next free one.
 *
 * OPEN DECISION, flagged rather than taken quietly: the rulings of 2026-09-23
 * answer the six questions the Phase A scoping raised and do not reach this one,
 * because it only arises once core documents lose their distinguishing suffix.
 * 5001-2 is this module's answer and is the minimum the @unique columns will
 * accept; a different separator is a one-line change to CORE_REVISION_SEPARATOR.
 *
 * A supplemental needs no separator: its letter already delimits the digits, so
 * 5001A then 5001A2 is unambiguous by the same argument that made SRL-121485R2
 * unambiguous.
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

/** The four core kinds: every one of them renders the bare load number. */
const CORE_KINDS: ReadonlySet<DocumentKind> = new Set<DocumentKind>([
  "BOL",
  "RATE_CONFIRMATION",
  "INVOICE",
  "SETTLEMENT",
]);

/** Retired-scheme suffix letters. Applied ONLY to a legacy stem, and kept so
 *  numbers issued before 2026-09-23 still read and parse exactly as issued.
 *  "P" for the settlement so it could not collide with the supplemental's "S". */
export const DOCUMENT_SUFFIX: Record<DocumentKind, string> = {
  BOL: "B",
  RATE_CONFIRMATION: "R",
  INVOICE: "I",
  SUPPLEMENTAL_INVOICE: "S",
  SETTLEMENT: "P",
};

/** The retired series prefix. Retained because search still resolves it and
 *  documents still print it; it is NOT the scheme discriminator — see
 *  isBareStem, which is, and see why the prefix cannot be. */
export const LEGACY_PREFIX = "SRL-";

/** Separates a core re-issue's revision from the bare number. Cannot occur in a
 *  bare load number, which is what makes 5001-2 unambiguous against load 50012. */
export const CORE_REVISION_SEPARATOR = "-";

/**
 * THE accessorial type -> letter map (§21.2, ruling 1 of 2026-09-23).
 *
 * THIS IS THE ONLY PLACE A LETTER IS ASSIGNED. Reading it elsewhere is fine;
 * assigning one elsewhere is what the permanence guard refuses, because two
 * assignment sites is how two accessorial types come to share a letter and two
 * supplementals on one load become the same document.
 *
 * "I" IS SKIPPED DELIBERATELY. It reads as a 1 in a hand-written or faxed
 * reference, on exactly the kind of document a lumper receipt gets stapled to.
 * N-Z are unused: 12 types fit in 12 letters with room left over.
 *
 * Keys are the AccessorialType enum members in schema.prisma. A member added
 * there without a letter here is a compile error at the call site rather than a
 * silent fallback, which is the point.
 */
export const ACCESSORIAL_LETTER = {
  LUMPER: "A",
  DETENTION_PU: "B",
  DETENTION_DEL: "C",
  TONU: "D",
  LAYOVER: "E",
  HAZMAT: "F",
  DEADHEAD: "G",
  DRIVER_ASSIST: "H",
  REEFER_FUEL: "J",
  INSIDE_DELIVERY: "K",
  LIFTGATE: "L",
  PALLET_EXCHANGE: "M",
} as const;

export type AccessorialLetterType = keyof typeof ACCESSORIAL_LETTER;

/**
 * A NEW stem is all digits and nothing else: 5001.
 *
 * THE DISCRIMINATOR IS "IS IT A BARE NUMBER", NOT "DOES IT START WITH SRL-",
 * and the difference is not cosmetic. There are FOUR stem shapes in the data,
 * not two: the SRL-1214xx series, a 25-character cuid absorbed by email-to-load,
 * an RFQ-<base36> stamp absorbed by the shipper portal, and the new bare number.
 * Only the last one belongs to the amended scheme. Testing for the SRL- prefix
 * would class the cuid and RFQ- stems as new and stop parsing the suffixes their
 * documents were actually issued with — silently, on exactly the loads whose
 * numbering was already irregular.
 *
 * Phrased this way the rule fails safe: a stem is only treated as new when it
 * could not possibly be anything else, and every other shape keeps the behaviour
 * it already had.
 */
export function isBareStem(stem: string): boolean {
  return new RegExp("^[0-9]+$").test(stem);
}

/** True for a stem issued under the retired suffix-on-a-stem scheme, which is
 *  everything that is not a bare number. */
export function isLegacyStem(stem: string): boolean {
  return !isBareStem(stem);
}

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
 *                   sequence. When set it is always a real stem.
 *   referenceNumber @unique @default(cuid()). It gets the number on the
 *                   canonical path, but historically it also absorbed a cuid
 *                   (email-to-load) or an RFQ-<base36> stamp (shipper portal)
 *                   from creators that never called the generator.
 *
 * So loadNumber is authoritative when present and referenceNumber is the legacy
 * fallback, which is exactly the pdfService.ts:409 rule — the BOL had it right
 * and the other two sites had it wrong.
 *
 * Rate Confirmation formData carries its own referenceNumber and the two RC
 * sites preferred it. That is dropped here on purpose: formData is an
 * AE-editable snapshot, so honouring it lets the RC print a different identifier
 * than the BOL for the same freight. The stem comes from the load record.
 */
export function resolveLoadStem(load: LoadStemSource | null | undefined): string | null {
  const stem = load?.loadNumber || load?.referenceNumber;
  return stem ? String(stem).trim() || null : null;
}

/**
 * What a CORE document prints.
 *
 *   bare   5001        + revision 2 -> 5001-2
 *   legacy SRL-121485  + RATE_CONFIRMATION, revision 2 -> SRL-121485R2
 *
 * Revision 1 omits its marker entirely so the common case reads clean, under
 * both schemes.
 *
 * SUPPLEMENTAL_INVOICE on a bare stem is refused here rather than guessed at: it
 * needs an accessorial type to pick its letter, so it has its own function.
 * Silently returning the bare number would make a supplemental indistinguishable
 * from the invoice it supplements.
 */
export function formatDocumentNumber(stem: string, kind: DocumentKind, revision = 1): string {
  if (!Number.isInteger(revision) || revision < 1) {
    throw new Error(`Invalid document revision ${revision}: must be an integer >= 1`);
  }
  if (isLegacyStem(stem)) {
    return `${stem}${DOCUMENT_SUFFIX[kind]}${revision === 1 ? "" : revision}`;
  }
  if (kind === "SUPPLEMENTAL_INVOICE") {
    throw new Error(
      `A supplemental on bare stem ${stem} needs an accessorial type: use formatSupplementalNumber()`,
    );
  }
  return revision === 1 ? stem : `${stem}${CORE_REVISION_SEPARATOR}${revision}`;
}

/**
 * What a SUPPLEMENTAL prints: 5001A, then 5001A2 for a second lumper charge on
 * the same load.
 *
 * A legacy stem keeps the retired scheme's single "S" and ignores the type,
 * because that is what was issued and issued numbers are not rewritten. The type
 * is still required by the signature so a caller cannot drift into thinking
 * legacy supplementals were ever type-coded.
 */
export function formatSupplementalNumber(
  stem: string,
  type: AccessorialLetterType,
  occurrence = 1,
): string {
  if (!Number.isInteger(occurrence) || occurrence < 1) {
    throw new Error(`Invalid supplemental occurrence ${occurrence}: must be an integer >= 1`);
  }
  const letter = isLegacyStem(stem)
    ? DOCUMENT_SUFFIX.SUPPLEMENTAL_INVOICE
    : ACCESSORIAL_LETTER[type];
  if (!letter) {
    throw new Error(`No letter assigned for accessorial type ${type} — add it to ACCESSORIAL_LETTER`);
  }
  return `${stem}${letter}${occurrence === 1 ? "" : occurrence}`;
}

/**
 * Revision encoded in `value`, or null if it is not a core document number for
 * this stem and kind.
 *
 * Parsed against a KNOWN stem rather than by pattern-matching the whole string.
 * A legacy stem can be a 25-character cuid containing letters, so a general
 * trailing-letter-plus-digits pattern cannot tell the suffix from the stem's own
 * last character. Anchoring on the stem removes the ambiguity entirely — and on
 * a bare stem it is what keeps 5001 from matching 50012.
 */
export function parseDocumentRevision(
  value: string | null | undefined,
  stem: string,
  kind: DocumentKind,
): number | null {
  if (!value) return null;

  if (!isLegacyStem(stem)) {
    if (kind === "SUPPLEMENTAL_INVOICE") return null; // has its own parser
    if (value === stem) return 1;
    if (!value.startsWith(`${stem}${CORE_REVISION_SEPARATOR}`)) return null;
    const tail = value.slice(stem.length + CORE_REVISION_SEPARATOR.length);
    if (!/^[0-9]+$/.test(tail)) return null;
    const n = parseInt(tail, 10);
    return n >= 2 ? n : null; // revision 1 is the bare number, never 5001-1
  }

  const prefix = `${stem}${DOCUMENT_SUFFIX[kind]}`;
  if (!value.startsWith(prefix)) return null;
  const tail = value.slice(prefix.length);
  if (tail === "") return 1;
  if (!/^[0-9]+$/.test(tail)) return null;
  const n = parseInt(tail, 10);
  return n >= 1 ? n : null;
}

/** Occurrence encoded in a supplemental number, or null if it is not one for
 *  this stem and type. Same stem-anchored argument as parseDocumentRevision. */
export function parseSupplementalOccurrence(
  value: string | null | undefined,
  stem: string,
  type: AccessorialLetterType,
): number | null {
  if (!value) return null;
  const letter = isLegacyStem(stem)
    ? DOCUMENT_SUFFIX.SUPPLEMENTAL_INVOICE
    : ACCESSORIAL_LETTER[type];
  const prefix = `${stem}${letter}`;
  if (!value.startsWith(prefix)) return null;
  const tail = value.slice(prefix.length);
  if (tail === "") return 1;
  if (!/^[0-9]+$/.test(tail)) return null;
  const n = parseInt(tail, 10);
  return n >= 1 ? n : null;
}

/**
 * What a renderer prints. Persisted number wins; otherwise derive revision 1
 * from the stem so documents predating this module still render a sane
 * identifier instead of a bare cuid.
 *
 * The persisted-wins rule is what keeps legacy documents intact through the
 * amendment: SRL-121485R is already in the column and is returned untouched.
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
  if (!stem) return null;
  if (kind === "SUPPLEMENTAL_INVOICE" && !isLegacyStem(stem)) return null; // needs a type
  return formatDocumentNumber(stem, kind);
}

// ─── Load number ────────────────────────────────────────────────────────────

/**
 * Next load number from the Postgres sequence.
 *
 * Lifted out of loadController so the two creators that bypassed it can call it:
 * a sequence with more than one path to it is not a sequence. Every load,
 * however it is created, now gets the bare number.
 *
 * START WITH 5001 is the amended series (§21.2). IF NOT EXISTS means the clause
 * only applies where the sequence does not yet exist — a fresh CI database, a new
 * container — which is exactly the case this has to be right for. Production was
 * moved to 5001 by ALTER on 2026-09-23 and is unaffected by this line.
 *
 * nextval() is non-transactional by design, so a rolled-back create burns a
 * number. That is correct and deliberate — gaps are free, collisions are not.
 */
export async function generateLoadNumber(client: any = prisma): Promise<string> {
  // Idempotent; static SQL, no user input.
  await client.$executeRaw`CREATE SEQUENCE IF NOT EXISTS load_number_seq START WITH 5001`;
  const result = await client.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('load_number_seq') as nextval`;
  if (!result || result.length === 0) {
    throw new Error("Failed to generate load number: sequence returned no result");
  }
  return String(Number(result[0].nextval));
}

// ─── Allocation ─────────────────────────────────────────────────────────────

/** Where each kind's number is persisted. INVOICE and SUPPLEMENTAL_INVOICE share
 *  a column and are separated by the supplemental's letter. */
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
 * THE SCAN IS NOT A BARE startsWith, AND THAT IS THE WHOLE POINT ON A BARE STEM.
 * Under the retired scheme the suffix letter always followed the stem's digits,
 * so SRL-121485I could not prefix-match a document on stem SRL-1214851. A bare
 * core number has no letter, so startsWith("5001") would match 50012 — load
 * 50012's own number — and the allocator would skip revisions because of a
 * completely unrelated load.
 *
 * So a bare core scan matches the exact number OR the number followed by the
 * revision separator, and nothing else. A supplemental keeps the prefix scan,
 * because its letter restores the delimiter.
 *
 * Read-then-write, so on its own this races. withDocumentNumber closes that.
 */
export async function nextDocumentNumber(
  kind: DocumentKind,
  stem: string,
  client: any = prisma,
): Promise<string> {
  const { model, field } = STORAGE[kind];

  if (!isLegacyStem(stem) && CORE_KINDS.has(kind)) {
    const rows = await client[model].findMany({
      where: {
        OR: [{ [field]: stem }, { [field]: { startsWith: `${stem}${CORE_REVISION_SEPARATOR}` } }],
      },
      select: { [field]: true },
    });
    let max = 0;
    for (const row of rows || []) {
      const rev = parseDocumentRevision(row?.[field], stem, kind);
      if (rev !== null && rev > max) max = rev;
    }
    return formatDocumentNumber(stem, kind, max + 1);
  }

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

/** Lowest unused occurrence for a supplemental of this type on this stem. */
export async function nextSupplementalNumber(
  stem: string,
  type: AccessorialLetterType,
  client: any = prisma,
): Promise<string> {
  const { model, field } = STORAGE.SUPPLEMENTAL_INVOICE;
  const letter = isLegacyStem(stem)
    ? DOCUMENT_SUFFIX.SUPPLEMENTAL_INVOICE
    : ACCESSORIAL_LETTER[type];
  const rows = await client[model].findMany({
    where: { [field]: { startsWith: `${stem}${letter}` } },
    select: { [field]: true },
  });
  let max = 0;
  for (const row of rows || []) {
    const occ = parseSupplementalOccurrence(row?.[field], stem, type);
    if (occ !== null && occ > max) max = occ;
  }
  return formatSupplementalNumber(stem, type, max + 1);
}

/**
 * Allocate a document number, run `build` with it, and retry on a unique-
 * constraint violation with a freshly computed number.
 *
 * This is how two AEs re-issuing the same Rate Confirmation at the same instant
 * are kept apart. Both scan, both compute 5001-2, both write; Postgres admits one
 * and rejects the other with P2002; the loser rescans, now sees 5001-2 taken, and
 * takes 5001-3. The @unique constraint is the arbiter, so correctness does not
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

/** withDocumentNumber for a supplemental, which allocates by accessorial type. */
export async function withSupplementalNumber<T>(
  stem: string,
  type: AccessorialLetterType,
  build: (documentNumber: string) => Promise<T>,
  attempts = 6,
  client: any = prisma,
): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const documentNumber = await nextSupplementalNumber(stem, type, client);
    try {
      return await build(documentNumber);
    } catch (e: any) {
      lastErr = e;
      if (e?.code === "P2002" && i < attempts - 1) continue;
      throw e;
    }
  }
  throw lastErr ?? new Error(`Failed to allocate a unique supplemental number for ${stem}`);
}
