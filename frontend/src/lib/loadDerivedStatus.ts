/**
 * What a load's state IS, decided once.
 *
 * WHY. Four surfaces rendered a load's state — the Load Board card, the board's
 * detail drawer, Track & Trace, and Needs Attention — and each read
 * `load.status` and mapped it to a label with its own switch. The maps drifted,
 * which is how a load could read "Booked" on one screen and sit in a "Tendered"
 * tab on another.
 *
 * More to the point, `load.status` is not the whole answer. It is the load's
 * operational stage; who holds the load and how far the paperwork has got are
 * properties of the TENDER. A load reading BOOKED whose tender was released is
 * not booked, and no amount of care in a status switch will say so.
 *
 * So this derives from BOTH, in one place, and every surface renders what it
 * returns. Nothing else maps a raw status to a label.
 */

export type TenderState =
  | "OFFERED" | "COUNTERED" | "ACCEPTED" | "RC_SENT" | "CONFIRMED"
  | "DECLINED" | "WITHDRAWN" | "EXPIRED" | "RELEASED";

/** A carrier holds the load from ACCEPTED onward. See backend lib/tenderLifecycle. */
const HOLDS_LOAD: TenderState[] = ["ACCEPTED", "RC_SENT", "CONFIRMED"];
const LIVE: TenderState[] = ["OFFERED", "COUNTERED"];

export interface DerivedStatus {
  /** Machine key. Stable; safe to switch on. */
  key: string;
  /** What a human reads. */
  label: string;
  /** Tailwind classes, so one vocabulary means one colour everywhere. */
  tone: string;
  /** True while a carrier holds the load and the rate confirmation is unsigned. */
  rcUnsigned: boolean;
}

const TONE = {
  neutral: "bg-slate-500/20 text-gray-600",
  info: "bg-[#E2EAF2] text-[#2A5B8B]",
  warn: "bg-[#FBEFD4] text-[#854F0B]",
  good: "bg-[#E6F0E9] text-[#256340] border border-[#2F7A4F]/25",
  bad: "bg-[#F6E3E3] text-[#9B2C2C]",
  active: "bg-cyan-500/20 text-cyan-700",
};

/** Everything past dispatch is the load's own stage; the tender is settled by then. */
const OPERATIONAL: Record<string, { label: string; tone: string }> = {
  DISPATCHED: { label: "Dispatched", tone: TONE.active },
  AT_PICKUP: { label: "At pickup", tone: TONE.active },
  LOADED: { label: "Loaded", tone: TONE.active },
  PICKED_UP: { label: "Picked up", tone: TONE.active },
  IN_TRANSIT: { label: "In transit", tone: TONE.active },
  AT_DELIVERY: { label: "At delivery", tone: TONE.active },
  DELIVERED: { label: "Delivered", tone: TONE.good },
  POD_RECEIVED: { label: "POD received", tone: TONE.good },
  INVOICED: { label: "Invoiced", tone: TONE.good },
  COMPLETED: { label: "Completed", tone: TONE.good },
  CANCELLED: { label: "Cancelled", tone: TONE.bad },
  TONU: { label: "TONU", tone: TONE.bad },
};

export interface DeriveInput {
  status: string;
  tenders?: Array<{ status: string }> | null;
  carrierId?: string | null;
}

/**
 * The one selector.
 *
 * Order matters and is the argument. Terminal load states win outright — a
 * cancelled load is cancelled whatever its tenders say. Then the tender, because
 * between POSTED and DISPATCHED the tender is what actually changed. Then the
 * load's own stage, for everything after dispatch where the tender is settled
 * and no longer the interesting fact.
 */
export function deriveLoadStatus(load: DeriveInput): DerivedStatus {
  const tenders = (load.tenders ?? []) as Array<{ status: string }>;
  const has = (set: TenderState[]) => tenders.some((t) => set.includes(t.status as TenderState));

  // 1. Terminal load states are not negotiable.
  if (load.status === "CANCELLED" || load.status === "TONU") {
    const o = OPERATIONAL[load.status];
    return { key: load.status, label: o.label, tone: o.tone, rcUnsigned: false };
  }

  // 2. Past dispatch, the load's own stage is the interesting fact.
  if (OPERATIONAL[load.status]) {
    const o = OPERATIONAL[load.status];
    return { key: load.status, label: o.label, tone: o.tone, rcUnsigned: false };
  }

  // 3. Between POSTED and BOOKED, the tender is what moved.
  if (tenders.some((t) => t.status === "CONFIRMED")) {
    return { key: "CONFIRMED", label: "Confirmed", tone: TONE.good, rcUnsigned: false };
  }
  if (tenders.some((t) => t.status === "RC_SENT")) {
    return { key: "RC_SENT", label: "RC sent — unsigned", tone: TONE.warn, rcUnsigned: true };
  }
  if (tenders.some((t) => t.status === "ACCEPTED")) {
    // Accepted but no rate confirmation out yet. Still unsigned, and still the
    // AE's move — which is why this reads as a state rather than as "Booked".
    return { key: "ACCEPTED", label: "Accepted — RC pending", tone: TONE.warn, rcUnsigned: true };
  }
  if (has(["COUNTERED"])) {
    return { key: "COUNTERED", label: "Countered — your move", tone: TONE.warn, rcUnsigned: false };
  }
  if (has(["OFFERED"])) {
    return { key: "OFFERED", label: "Tendered", tone: TONE.info, rcUnsigned: false };
  }

  // 4. A carrier with no tender at all: direct assignment.
  if (load.carrierId) {
    return { key: "ASSIGNED", label: "Assigned", tone: TONE.info, rcUnsigned: false };
  }

  // 5. Nothing live. Say WHY it is on the board rather than only that it is —
  //    "Posted" and "offers expired" look identical otherwise, and they are not.
  if (tenders.length > 0 && !has(LIVE) && !has(HOLDS_LOAD)) {
    return { key: "NEEDS_CARRIER", label: "Needs carrier", tone: TONE.warn, rcUnsigned: false };
  }
  if (load.status === "DRAFT") {
    return { key: "DRAFT", label: "Draft", tone: TONE.neutral, rcUnsigned: false };
  }
  return { key: "POSTED", label: "Posted", tone: TONE.info, rcUnsigned: false };
}

/* ------------------------------------------------------------------ */
/*  What an AE may do, by tender state                                 */
/* ------------------------------------------------------------------ */

export type TenderAction =
  | "WITHDRAW" | "ACCEPT_COUNTER" | "REJECT_COUNTER"
  | "RELEASE" | "RESEND_RC" | "VIEW_RC";

/**
 * The matrix, as ratified.
 *
 * A settled tender offers nothing: there is no acting on a decline, an expiry
 * or a withdrawal, and a released tender's load is already back on the board
 * with its own live tender to act on instead.
 *
 * RELEASE is absent from CONFIRMED here because it is conditional — pre-pickup
 * only — and a conditional entry in a flat map is a lie the caller has to know
 * to correct. `actionsFor` takes the load stage and applies it.
 */
const ACTIONS_BY_TENDER_STATE: Record<TenderState, TenderAction[]> = {
  OFFERED: ["WITHDRAW"],
  COUNTERED: ["ACCEPT_COUNTER", "REJECT_COUNTER"],
  ACCEPTED: ["RELEASE", "RESEND_RC"],
  RC_SENT: ["RELEASE", "RESEND_RC", "VIEW_RC"],
  CONFIRMED: ["VIEW_RC"],
  DECLINED: [],
  WITHDRAWN: [],
  EXPIRED: [],
  RELEASED: [],
};

/** Once the truck has been to the shipper, taking the carrier off is not a button. */
const PRE_PICKUP = ["POSTED", "TENDERED", "CONFIRMED", "BOOKED", "DISPATCHED"];

export function actionsFor(tenderStatus: string, loadStatus: string): TenderAction[] {
  const base = ACTIONS_BY_TENDER_STATE[tenderStatus as TenderState] ?? [];
  if (tenderStatus === "CONFIRMED" && PRE_PICKUP.includes(loadStatus)) {
    return ["RELEASE", ...base];
  }
  return base;
}

/**
 * The subset with an endpoint behind it today.
 *
 * The matrix above is the RATIFIED spec and stays complete; this is what is
 * wired. Rendering a button with nothing behind it teaches an AE to distrust
 * the row it sits in, and filtering here rather than trimming the matrix keeps
 * the spec readable as a spec.
 *
 * As of v3.8 commit 11f the two lists agree: the rate-confirmation actions got
 * their endpoints, so nothing in the ratified matrix is filtered out any more.
 * The filter stays because the NEXT action to be ratified will need it.
 */
export const WIRED_ACTIONS: TenderAction[] = [
  "WITHDRAW", "ACCEPT_COUNTER", "REJECT_COUNTER", "RELEASE",
  // v3.8 commit 11f — the rate-confirmation lifecycle landed, so these two
  // stop being filtered out. They were held back deliberately rather than
  // rendered dead: a button that does nothing teaches an AE to distrust the
  // row it sits in.
  "RESEND_RC", "VIEW_RC",
];

/** Why a carrier came off. Mirrors RELEASE_REASONS in carrierReleaseService. */
export const RELEASE_REASONS = [
  "carrier_fell_off", "compliance_lapse", "rate_dispute", "customer_cancel", "srl_error",
];

export const ACTION_LABEL: Record<TenderAction, string> = {
  WITHDRAW: "Withdraw offer",
  ACCEPT_COUNTER: "Accept counter",
  REJECT_COUNTER: "Reject counter",
  RELEASE: "Release carrier",
  RESEND_RC: "Resend rate confirmation",
  VIEW_RC: "View rate confirmation",
};

/* ------------------------------------------------------------------ */
/*  Carrier-facing wording                                             */
/* ------------------------------------------------------------------ */

/**
 * What a carrier is told about a tender that ended.
 *
 * "Load covered" rather than "Withdrawn" is the point of the whole
 * DECLINED/WITHDRAWN split: the carrier did not refuse anything and must not be
 * shown language that reads as though they did. Their own decline still reads
 * as a decline, because it was.
 */
export function carrierTenderLabel(status: string, statusReason?: string | null): string {
  if (status === "WITHDRAWN") {
    switch (statusReason) {
      case "load_covered": return "Load covered";
      case "counter_rejected": return "Counter not accepted";
      case "load_cancelled": return "Load cancelled";
      case "position_skipped": return "Offer closed";
      case "compliance_block": return "Could not be confirmed";
      default: return "Offer withdrawn";
    }
  }
  if (status === "RELEASED") {
    // A release is not one event to a carrier. Coming off a load because their
    // insurance lapsed, because the customer cancelled, and because SRL made a
    // mistake are three different things — and only the first is theirs. The
    // srl_error case says so plainly rather than leaving them to assume fault:
    // that reason records NO fall-off against them, and the wording should not
    // contradict the record.
    switch (statusReason) {
      case "carrier_fell_off": return "You released this load";
      case "compliance_lapse": return "Released — compliance";
      case "rate_dispute": return "Released — rate dispute";
      case "customer_cancel": return "Load cancelled by customer";
      case "srl_error": return "Released by SRL";
      default: return "Released";
    }
  }
  if (status === "EXPIRED") return "Offer expired";
  if (status === "DECLINED") return "You declined";
  if (status === "RC_SENT") return "Rate confirmation sent";
  if (status === "CONFIRMED") return "Confirmed";
  if (status === "COUNTERED") return "Counter sent";
  if (status === "ACCEPTED") return "Accepted";
  return "Offered";
}

/** Needs Attention reasons, in words an AE can act on. */
export const ATTENTION_LABEL: Record<string, string> = {
  EXPIRED_NO_LIVE_TENDER: "Offers expired — no carrier",
  RC_UNSIGNED_PAST_SLA: "Rate confirmation unsigned",
  RECENTLY_RELEASED: "Carrier released",
  COUNTER_AWAITING_AE: "Counter awaiting your answer",
};

/**
 * Where the proof of an on-behalf acceptance lives.
 *
 * Short labels because the reference itself is the useful half -- an AE
 * scanning the row wants to see the subject line or the timestamp, not the
 * word describing what kind of thing it is.
 */
export const EVIDENCE_LABEL: Record<string, string> = {
  EMAIL_SUBJECT: "email",
  CALL_TIMESTAMP: "call",
  QUO_MESSAGE_ID: "Quo",
};
