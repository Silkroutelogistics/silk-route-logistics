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
 * ─── The scheme (§21.2, amended 2026-09-23, corrected 2026-09-26) ─────────
 *
 * ONE BARE NUMBER per load, carried by the load and by every core document
 * issued against it. No prefix; the invoice alone adds "I":
 *
 *     Load          5001
 *     BOL           5001
 *     Rate con      5001
 *     Invoice       5001I     so an invoice is never read as the load it bills
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
 * ─── Issued numbers are never rewritten ────────────────────────────────────
 *
 * Loads issued before the amendment keep their SRL-1214xx stems, and a document
 * already issued on one keeps its number: SRL-121485R is persisted and renders
 * as SRL-121485R. A NEW document for such a load prints its digits — 121485, or
 * 121485I for an invoice — so nothing generated from 2026-09-26 carries SRL-.
 * documentDigits() decides that from the stem itself, never a date or a flag.
 *
 * Two things keep the retired suffixes: a legacy load's supplementals
 * (SRL-121485S; supplemental numbering is an open decision) and a stem with no
 * number in it (a cuid, an RFQ- stamp), which has no digits to print.
 *
 * The namespaces cannot collide: a legacy load's digits are 121472..121497, and
 * the sequence continues at 121498 (generateLoadNumber).
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

/** The four core kinds: each renders the load's number — the invoice with "I". */
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

/**
 * The digits a NEW core document on this stem prints: a bare stem as it is, a
 * legacy SRL-<digits> stem without its prefix (SRL-121494's next invoice is
 * 121494I). Null for a stem with no number in it — a cuid, an RFQ- stamp — which
 * keeps the retired suffix scheme. Issued numbers are persisted and never
 * re-derived, so this decides only what is allocated from 2026-09-26 on.
 */
export function documentDigits(stem: string | null | undefined): string | null {
  const s = String(stem ?? "").trim();
  if (!s) return null;
  if (isBareStem(s)) return s;
  const rest = s.toUpperCase().startsWith(LEGACY_PREFIX) ? s.slice(LEGACY_PREFIX.length) : "";
  return rest && isBareStem(rest) ? rest : null;
}

/** A core document's number at revision 1: the digits, plus "I" for an invoice.
 *  A re-issue hangs off it with the separator: 121498-2, 121498I-2. */
function coreBase(digits: string, kind: DocumentKind): string {
  return kind === "INVOICE" ? `${digits}${DOCUMENT_SUFFIX.INVOICE}` : digits;
}

/** Revision of `value` against a core base, or null unless it is the base
 *  itself (revision 1) or base-separator-n with n >= 2. */
function parseCoreRevision(value: string, base: string): number | null {
  if (value === base) return 1;
  if (!value.startsWith(`${base}${CORE_REVISION_SEPARATOR}`)) return null;
  const tail = value.slice(base.length + CORE_REVISION_SEPARATOR.length);
  if (!/^[0-9]+$/.test(tail)) return null;
  const n = parseInt(tail, 10);
  return n >= 2 ? n : null; // revision 1 is the base itself, never 121498-1
}

/**
 * The prefix every number carried before the scheme was amended.
 *
 * It came back. v3.8.bik removed this constant because isBareStem had
 * superseded it as the DISCRIMINATOR — "is the stem all digits" answers which
 * scheme a stem belongs to without needing to know the prefix — and that commit
 * said it should land again with the caller that needs it. Search is that
 * caller, and it needs the opposite question: not which scheme a stem is in,
 * but how to SPELL a term in the older one.
 */
export const LEGACY_PREFIX = "SRL-";

/**
 * The legacy spelling of a search term, or null when it already carries the
 * prefix.
 *
 * Lives here rather than in the search helper because this module owns the
 * scheme, and a second place that knows numbers start with SRL- is a second
 * place that can disagree about it. The permanence guard enforces exactly that
 * — it failed on the search helper building the string itself, which is the
 * guard working rather than the guard being in the way.
 *
 * isLegacyStem is deliberately NOT the test. It asks whether a stem is all
 * digits, so it answers false for 121485I and the AE who typed the suffix off a
 * printed document without the prefix would never reach the legacy pass.
 */
export function legacySearchForm(term: string | null | undefined): string | null {
  const t = String(term ?? "").trim();
  if (!t) return null;
  if (t.toUpperCase().startsWith(LEGACY_PREFIX)) return null;
  return LEGACY_PREFIX + t;
}

/**
 * An invoice number and its retired twin are ONE number (RECONCILE 2026-09-26):
 * SRL-121494I is 121494I, SRL-121494I2 is 121494I-2. The prefix was dropped for
 * every invoice, legacy and new, so a number issued in the retired form still
 * occupies its bare form, and no two invoices may carry the same one. Both
 * spellings for an invoice on a load's digits; the value alone for anything else
 * (INV-…, a supplemental, a numberless stem's …I).
 */
export function invoiceNumberTwins(value: string): string[] {
  const v = String(value ?? "").trim();
  const legacy = v.toUpperCase().startsWith(LEGACY_PREFIX);
  const m = (legacy ? /^([0-9]+)I([0-9]*)$/ : /^([0-9]+)I(?:-([0-9]+))?$/).exec(legacy ? v.slice(LEGACY_PREFIX.length) : v);
  const rev = m ? (m[2] ? parseInt(m[2], 10) : 1) : 0;
  if (!m || (m[2] && rev < 2)) return [v];
  const bare = coreBase(m[1], "INVOICE") + (rev === 1 ? "" : `${CORE_REVISION_SEPARATOR}${rev}`);
  return [bare, `${LEGACY_PREFIX}${m[1]}${DOCUMENT_SUFFIX.INVOICE}${rev === 1 ? "" : rev}`];
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

/** The load number a NEW document prints when it names the freight: the digits
 *  when the load has them, else the stem. So a rate confirmation generated now
 *  for SRL-121494 names the load 121494, the number on its BOL and rate con.
 *  Allocation still keys on resolveLoadStem. */
export function printedLoadNumber(load: LoadStemSource | null | undefined): string | null {
  const stem = resolveLoadStem(load);
  return stem ? documentDigits(stem) ?? stem : null;
}

/**
 * What a CORE document prints.
 *
 *   bare   121498  RATE_CONFIRMATION -> 121498,  revision 2 -> 121498-2
 *   bare   121498  INVOICE           -> 121498I, revision 2 -> 121498I-2
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
  const digits = kind === "SUPPLEMENTAL_INVOICE" ? null : documentDigits(stem);
  if (digits === null) {
    if (isLegacyStem(stem)) {
      return `${stem}${DOCUMENT_SUFFIX[kind]}${revision === 1 ? "" : revision}`;
    }
    throw new Error(
      `A supplemental on bare stem ${stem} needs an accessorial type: use formatSupplementalNumber()`,
    );
  }
  const base = coreBase(digits, kind);
  return revision === 1 ? base : `${base}${CORE_REVISION_SEPARATOR}${revision}`;
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

  const digits = kind === "SUPPLEMENTAL_INVOICE" ? null : documentDigits(stem);
  if (digits !== null) {
    const rev = parseCoreRevision(value, coreBase(digits, kind));
    // A bare stem never had the retired form, so a miss is final for it.
    if (rev !== null || isBareStem(stem)) return rev;
  } else if (isBareStem(stem)) {
    return null; // a supplemental on a bare stem has its own parser
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

// ─── Download filenames ─────────────────────────────────────────────────────

/**
 * THE filename rule (§21.2): the number first, then what the document is.
 *
 *     5001_BOL.pdf   5001_Rate_Confirmation.pdf   5001A_Lumper.pdf
 *
 * NUMBER FIRST IS THE WHOLE POINT, and it is the same argument the numbering
 * scheme itself rests on. A customer saving four documents for one load wants
 * them adjacent in the folder; a TYPE- prefix (BOL-5001.pdf, RC-5001.pdf) sorts
 * them by type across every load they have ever saved, which is the one ordering
 * nobody wants. The download folder is where a customer actually meets the
 * string, so it is not a lesser surface than the document body.
 *
 * Underscores rather than spaces or hyphens: a space forces quoting in
 * Content-Disposition and breaks naive shell and email clients, and a hyphen is
 * already load-bearing as the core revision separator (5001-2), so reusing it
 * here would make 5001-2_Invoice.pdf ambiguous to read.
 */
export function documentFilename(documentNumber: string, label: string, extension = "pdf"): string {
  return `${documentNumber}_${label}.${extension}`;
}

/** Filename label per core kind. SUPPLEMENTAL_INVOICE is absent deliberately:
 *  a supplemental is labelled by its accessorial type, not by the word
 *  "supplemental" — 5001A_Lumper.pdf says what was charged. */
export const DOCUMENT_FILENAME_LABEL: Record<Exclude<DocumentKind, "SUPPLEMENTAL_INVOICE">, string> = {
  BOL: "BOL",
  RATE_CONFIRMATION: "Rate_Confirmation",
  INVOICE: "Invoice",
  SETTLEMENT: "Settlement",
};

/**
 * Next load number from the Postgres sequence.
 *
 * Lifted out of loadController so the two creators that bypassed it can call it:
 * a sequence with more than one path to it is not a sequence. Every load,
 * however it is created, now gets the bare number.
 *
 * THE SERIES CONTINUES FROM THE LAST LEGACY LOAD (§21.2, ruled 2026-09-26).
 * SRL-121497 was the last number issued under the prefixed scheme, so the next
 * load is 121498 — bare, no prefix — then 121499. There is no second series.
 * 5001 and 5002, issued in between, keep their numbers and have no bearing on
 * what comes next.
 *
 * START WITH only applies where the sequence does not exist yet (IF NOT
 * EXISTS): a fresh CI database, a local container. Production's sequence does
 * exist, and after 5001 and 5002 it sits at 5002, so it is moved by
 * scripts/restart-load-number-sequence.ts — a production write, run
 * deliberately. THIS FUNCTION NEVER MOVES THE SEQUENCE.
 *
 * FLOOR, NOT LIFT. A number below LOAD_NUMBER_FLOOR is refused, not issued. On a
 * database whose sequence was never moved that number would be 5003, and a load
 * number is printed on the BOL and the rate confirmation, where it cannot be
 * taken back once a carrier or shipper holds it. Refusing costs one failed load
 * creation with the fix named in the error; issuing costs a document number
 * outside the series, permanently. The refused draw burns its value, which was
 * below the floor and so could never be issued anyway.
 *
 * nextval() is non-transactional by design, so a rolled-back create burns a
 * number. That is correct and deliberate — gaps are free, collisions are not.
 */
export const LAST_LEGACY_LOAD_NUMBER = 121497;
export const LOAD_NUMBER_FLOOR = LAST_LEGACY_LOAD_NUMBER + 1;

export async function generateLoadNumber(client: any = prisma): Promise<string> {
  // Idempotent; static SQL, no user input. The literal is LOAD_NUMBER_FLOOR —
  // a test holds the two equal.
  await client.$executeRaw`CREATE SEQUENCE IF NOT EXISTS load_number_seq START WITH 121498`;
  const result = await client.$queryRaw<{ nextval: bigint }[]>`SELECT nextval('load_number_seq') as nextval`;
  if (!result || result.length === 0) {
    throw new Error("Failed to generate load number: sequence returned no result");
  }
  const n = Number(result[0].nextval);
  if (n < LOAD_NUMBER_FLOOR) {
    throw new Error(
      `load_number_seq issued ${n}, below ${LOAD_NUMBER_FLOOR}. Loads continue from the last ` +
        `legacy number (${LAST_LEGACY_LOAD_NUMBER}) and this database's sequence has not been moved: ` +
        `run scripts/restart-load-number-sequence.ts. No load was created.`,
    );
  }
  return String(n);
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

  const digits = CORE_KINDS.has(kind) ? documentDigits(stem) : null;
  if (digits !== null) {
    const base = coreBase(digits, kind);
    // An invoice issued in the retired form occupies its bare twin (see
    // invoiceNumberTwins): after SRL-121494I the next invoice is 121494I-2. Other
    // kinds count only the base's own form.
    const retired = kind === "INVOICE" && isLegacyStem(stem) ? `${stem}${DOCUMENT_SUFFIX.INVOICE}` : null;
    const rows = await client[model].findMany({
      where: {
        OR: [
          { [field]: base },
          { [field]: { startsWith: `${base}${CORE_REVISION_SEPARATOR}` } },
          ...(retired ? [{ [field]: { startsWith: retired } }] : []),
        ],
      },
      select: { [field]: true },
    });
    let max = 0;
    for (const row of rows || []) {
      const v = row?.[field];
      const rev = typeof v !== "string" ? null : retired ? parseDocumentRevision(v, stem, kind) : parseCoreRevision(v, base);
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
