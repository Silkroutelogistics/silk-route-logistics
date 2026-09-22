// Ruling 6 (2026-09-21): the paperwork a carrier owes on a load, stated ONCE.
//
// Two readers, one rule. The carrier's paperwork panel (E4, My Loads) renders
// these slots with a state each; the settlement gate (E5, CarrierPay
// PREPARED -> APPROVED) refuses on the same definitions. Consumed by the
// frontend via the @shared alias and by the backend via rootDir + include, the
// bridge shared/constants/infoRequestCategories.ts uses — because a required
// set the panel shows and the gate enforces must be the same set, and two
// hand-kept copies of it are the way they stop being.
//
// The ruling, verbatim: "Required paperwork: SIGNED_BOL_DEL or POD, plus
// INVOICE; TEMP_LOG required on reefer; RECEIPT_LUMPER/RECEIPT_SCALE optional;
// SIGNED_BOL_PU accepted from AT_PICKUP, not required."
//
// The doc-type STRINGS are the settlement vocabulary in
// backend/src/lib/documentTypes.ts (SETTLEMENT_DOC_TYPES); a test there holds
// PAPERWORK_DOC_TYPES equal to it, so a word added on either side without the
// other fails the suite.

export type PaperworkDocType =
  | "SIGNED_BOL_PU"
  | "SIGNED_BOL_DEL"
  | "POD"
  | "INVOICE"
  | "TEMP_LOG"
  | "RECEIPT_LUMPER"
  | "RECEIPT_SCALE";

export const PAPERWORK_DOC_TYPES: readonly PaperworkDocType[] = [
  "SIGNED_BOL_PU",
  "SIGNED_BOL_DEL",
  "POD",
  "INVOICE",
  "TEMP_LOG",
  "RECEIPT_LUMPER",
  "RECEIPT_SCALE",
];

/** The words a carrier sees for each type, in the upload picker and the panel. */
export const PAPERWORK_DOC_LABELS: Readonly<Record<PaperworkDocType, string>> = {
  SIGNED_BOL_PU: "Signed BOL (pickup)",
  SIGNED_BOL_DEL: "Signed BOL (delivery)",
  POD: "Proof of delivery",
  INVOICE: "Carrier invoice",
  TEMP_LOG: "Reefer temperature log",
  RECEIPT_LUMPER: "Lumper receipt",
  RECEIPT_SCALE: "Scale ticket",
};

export type PaperworkSlotKey = "PICKUP_BOL" | "DELIVERY_PROOF" | "INVOICE" | "TEMP_LOG" | "LUMPER" | "SCALE";

/**
 * The load statuses a paperwork slot can be gated on, in pipeline order.
 * Only the ranks matter; a status not listed here (DRAFT, POSTED, the
 * terminals) is "before everything", so nothing is accepted on it.
 */
const STATUS_RANK: Readonly<Record<string, number>> = {
  CONFIRMED: 0,
  BOOKED: 1,
  DISPATCHED: 2,
  AT_PICKUP: 3,
  LOADED: 4,
  PICKED_UP: 4,
  IN_TRANSIT: 5,
  AT_DELIVERY: 6,
  DELIVERED: 7,
  POD_RECEIVED: 8,
  INVOICED: 9,
  COMPLETED: 10,
};

export interface PaperworkSlotDef {
  key: PaperworkSlotKey;
  label: string;
  /** Any ONE of these satisfies the slot. */
  accepts: readonly PaperworkDocType[];
  /**
   * The earliest load status at which an upload into this slot is accepted.
   * The ruling names exactly one such gate (SIGNED_BOL_PU from AT_PICKUP);
   * every other slot is open from the moment the panel exists.
   */
  notBefore: string;
}

const SLOTS: readonly PaperworkSlotDef[] = [
  { key: "PICKUP_BOL", label: "Signed BOL at pickup", accepts: ["SIGNED_BOL_PU"], notBefore: "AT_PICKUP" },
  { key: "DELIVERY_PROOF", label: "Proof of delivery", accepts: ["SIGNED_BOL_DEL", "POD"], notBefore: "CONFIRMED" },
  { key: "INVOICE", label: "Carrier invoice", accepts: ["INVOICE"], notBefore: "CONFIRMED" },
  { key: "TEMP_LOG", label: "Reefer temperature log", accepts: ["TEMP_LOG"], notBefore: "CONFIRMED" },
  { key: "LUMPER", label: "Lumper receipt", accepts: ["RECEIPT_LUMPER"], notBefore: "CONFIRMED" },
  { key: "SCALE", label: "Scale ticket", accepts: ["RECEIPT_SCALE"], notBefore: "CONFIRMED" },
];

/** What the rule needs to know about the load. */
export interface PaperworkLoad {
  status: string;
  equipmentType?: string | null;
  temperatureControlled?: boolean | null;
}

/**
 * A reefer load owes a temperature log. Two signals, either suffices: the
 * flag the Order Builder sets, or the equipment string ("Reefer", "Reefer 53'",
 * "REEFER" from the email parser). A load that is neither is not a reefer,
 * whatever the commodity says.
 */
export function isReeferLoad(load: Pick<PaperworkLoad, "equipmentType" | "temperatureControlled">): boolean {
  if (load.temperatureControlled === true) return true;
  return /reefer|refrigerat/i.test(load.equipmentType ?? "");
}

/** Is the load at a status where paperwork can be taken at all? False on DRAFT/POSTED and the terminals. */
export function paperworkOpenAt(status: string): boolean {
  return STATUS_RANK[status] !== undefined;
}

/** The earliest status a paperwork type is accepted at, or null for a type this rule does not govern. */
export function paperworkNotBefore(docType: string): string | null {
  const slot = SLOTS.find((s) => (s.accepts as readonly string[]).includes(docType));
  return slot ? slot.notBefore : null;
}

/** Is `docType` accepted on a load at `status`? The one ruling-named gate lives here. */
export function paperworkAccepts(docType: string, status: string): boolean {
  const slot = SLOTS.find((s) => (s.accepts as readonly string[]).includes(docType));
  if (!slot) return false;
  const have = STATUS_RANK[status];
  const need = STATUS_RANK[slot.notBefore];
  return have !== undefined && need !== undefined && have >= need;
}

/** The slot definitions for a load: which are required, and whether the reefer slot shows at all. */
export function paperworkSlotsFor(load: PaperworkLoad): Array<PaperworkSlotDef & { required: boolean }> {
  const reefer = isReeferLoad(load);
  return SLOTS.filter((s) => s.key !== "TEMP_LOG" || reefer).map((s) => ({
    ...s,
    required: s.key === "DELIVERY_PROOF" || s.key === "INVOICE" || (s.key === "TEMP_LOG" && reefer),
  }));
}

export type PaperworkSlotState = "MISSING" | "UPLOADED" | "VERIFIED" | "REJECTED";

/** The shape of a Document row the rule reads. Status is the AE's verdict (PENDING/VERIFIED/REJECTED). */
export interface PaperworkDoc {
  id: string;
  docType: string | null;
  status: string;
  fileName?: string | null;
  notes?: string | null;
  createdAt?: string | Date | null;
}

export interface PaperworkSlot extends PaperworkSlotDef {
  required: boolean;
  state: PaperworkSlotState;
  /** Every document on the load whose type this slot accepts, newest first. */
  documents: PaperworkDoc[];
  /** The AE's note on the newest rejection, when the state is REJECTED. */
  rejectionNote: string | null;
  /** Whether an upload into this slot is accepted at the load's current status. */
  open: boolean;
}

/**
 * The panel's rows. State precedence: a VERIFIED document wins, then any
 * PENDING one (the AE has it), then a REJECTED one (the carrier must replace
 * it, and the note says why), else MISSING. A rejected upload is not
 * "uploaded": the checklist would read as satisfied while the AE is waiting
 * for a replacement.
 */
export function paperworkSlots(load: PaperworkLoad, documents: readonly PaperworkDoc[]): PaperworkSlot[] {
  return paperworkSlotsFor(load).map((def) => {
    const docs = documents
      .filter((d) => d.docType && (def.accepts as readonly string[]).includes(d.docType))
      .slice()
      .sort((a, b) => time(b.createdAt) - time(a.createdAt));
    let state: PaperworkSlotState = "MISSING";
    let rejectionNote: string | null = null;
    if (docs.some((d) => d.status === "VERIFIED")) state = "VERIFIED";
    else if (docs.some((d) => d.status === "PENDING")) state = "UPLOADED";
    else if (docs.some((d) => d.status === "REJECTED")) {
      state = "REJECTED";
      rejectionNote = docs.find((d) => d.status === "REJECTED")?.notes ?? null;
    }
    return {
      ...def,
      state,
      documents: docs,
      rejectionNote,
      open: def.accepts.some((t) => paperworkAccepts(t, load.status)),
    };
  });
}

/** Required slots with nothing usable on them (MISSING or REJECTED). */
export function paperworkMissing(slots: readonly PaperworkSlot[]): PaperworkSlot[] {
  return slots.filter((s) => s.required && (s.state === "MISSING" || s.state === "REJECTED"));
}

function time(v: string | Date | null | undefined): number {
  if (!v) return 0;
  const t = v instanceof Date ? v.getTime() : Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}
