"use client";

// B7a (v3.8.bdd) — the cancel modal. Replaces the two window.prompt() interim
// captures (Load Board panel, Track & Trace drawer) that sent a free-text
// reason and no code, which the server has refused since v3.8.bcy.
//
// THREE THINGS THIS MODAL ENFORCES, IN THE SAME SHAPE THE SERVER DOES:
//   1. A reason CODE from the closed vocabulary — the dropdown is the shared
//      list, so it cannot offer a value the server does not know.
//   2. The fault party is DERIVED from the code and shown read-only. It decides
//      whether the carrier is marked (§9), so it is never a second control the
//      AE can set independently — two fields chosen separately are two fields
//      that disagree.
//   3. OTHER needs a note of MIN_CANCELLATION_NOTE_LENGTH. The submit button
//      is gated by cancellationInputComplete, the same predicate family the
//      server's assessCancellationInput answers, so what the button lets
//      through the server accepts.
//
// The modal does not own the request. It hands the payload to onConfirm and
// the surface decides the endpoint (PATCH status, or DELETE for an archive of
// a live load, which is a cancel plus hide). A refusal keeps the modal open
// and prints the server's own message — including the 400 details that name
// the field — so an AE never sees a silent no-op.

import { useState, useEffect } from "react";
import { X, Loader2, AlertCircle } from "lucide-react";
import {
  CANCELLATION_REASONS,
  CANCELLATION_REASON_LABELS,
  FAULT_PARTY_LABELS,
  FAULT_PARTY_CONSEQUENCE,
  MIN_CANCELLATION_NOTE_LENGTH,
  faultPartyFor,
  requiresNote,
  isCancellationReason,
  cancellationInputComplete,
  type CancellationReason,
} from "@shared/constants/cancellationReasons";

export interface CancelLoadPayload {
  cancellationReasonCode: CancellationReason;
  /** The note, trimmed; omitted when empty. Required by the server for OTHER. */
  cancellationReason?: string;
}

interface Props {
  open: boolean;
  loadNumber?: string | null;
  /**
   * "cancel" flips the status. "archive" is the Archive button on a live
   * (DRAFT) load — the server treats that as a cancellation too and demands
   * the same code, so the same modal collects it.
   */
  intent?: "cancel" | "archive";
  onClose: () => void;
  /** Resolves → the modal closes. Rejects → stays open and shows the error. */
  onConfirm: (payload: CancelLoadPayload) => Promise<unknown>;
}

/** Read the server's refusal in the shape it actually sends. */
function describeError(err: unknown): string {
  const e = err as {
    response?: { data?: { error?: string; details?: Array<{ field?: string; message?: string }> } };
    message?: string;
  };
  const details = e?.response?.data?.details;
  if (Array.isArray(details) && details.length) {
    return details.map((d) => d.message ?? d.field ?? "").filter(Boolean).join(" ");
  }
  return e?.response?.data?.error ?? e?.message ?? "The cancellation was refused.";
}

export function CancelLoadModal({ open, loadNumber, intent = "cancel", onClose, onConfirm }: Props) {
  const [reason, setReason] = useState<CancellationReason | "">("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setNote("");
      setError(null);
      setSubmitting(false);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  if (!open) return null;

  const faultParty = reason ? faultPartyFor(reason) : null;
  const noteRequired = !!reason && requiresNote(reason);
  const complete = cancellationInputComplete(reason, note);
  const trimmedNote = note.trim();
  const isArchive = intent === "archive";

  async function submit() {
    if (!complete || !isCancellationReason(reason) || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm({
        cancellationReasonCode: reason,
        ...(trimmedNote ? { cancellationReason: trimmedNote } : {}),
      });
      onClose();
    } catch (err) {
      setError(describeError(err));
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cancel-load-title"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-[0_24px_48px_rgba(10,37,64,0.18)] max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-[rgba(10,37,64,0.10)]">
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-[#9B2C2C] uppercase mb-1">
              {isArchive ? "Archive load" : "Cancel load"}
            </p>
            <h2 id="cancel-load-title" className="text-lg font-bold text-[#0A2540] font-serif">
              {loadNumber || "This load"}
            </h2>
          </div>
          <button onClick={onClose} className="text-[#6B7685] hover:text-[#0A2540]" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label htmlFor="cancel-reason" className="block text-xs font-semibold text-[#3A4A5F] uppercase tracking-wider mb-1.5">
              Reason
            </label>
            <select
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value as CancellationReason | "")}
              className="w-full px-3 py-2 bg-white border border-[#EFE6D3] rounded-lg text-sm text-[#0A2540] focus:outline-none focus:border-[#9B2C2C]"
            >
              <option value="">Choose a reason…</option>
              {CANCELLATION_REASONS.map((r) => (
                <option key={r} value={r}>
                  {CANCELLATION_REASON_LABELS[r]}
                </option>
              ))}
            </select>
          </div>

          {/* Derived, read-only. There is deliberately no control here. */}
          <div
            data-testid="fault-party"
            className={`border rounded-lg p-3 ${
              faultParty === "CARRIER" ? "bg-[#F6E3E3] border-[#9B2C2C]/40" : "bg-[#FBF7F0] border-[#EFE6D3]"
            }`}
          >
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className={`mt-0.5 ${faultParty === "CARRIER" ? "text-[#9B2C2C]" : "text-[#6B7685]"}`} />
              <div>
                <p className="text-xs font-semibold text-[#0A2540] mb-0.5">
                  Fault party: {faultParty ? FAULT_PARTY_LABELS[faultParty] : "—"}
                </p>
                <p className="text-xs text-[#3A4A5F]">
                  {faultParty ? FAULT_PARTY_CONSEQUENCE[faultParty] : "Decided by the reason. Choose one to see who is marked."}
                </p>
              </div>
            </div>
          </div>

          <div>
            <label htmlFor="cancel-note" className="block text-xs font-semibold text-[#3A4A5F] uppercase tracking-wider mb-1.5">
              Note{" "}
              <span className="font-normal normal-case text-[#6B7685]">
                {noteRequired ? `(required — at least ${MIN_CANCELLATION_NOTE_LENGTH} characters)` : "(optional)"}
              </span>
            </label>
            <textarea
              id="cancel-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder={
                noteRequired
                  ? "What happened? The carrier and the record both read this."
                  : "Anything the carrier or a later reader should know."
              }
              className="w-full px-3 py-2 bg-white border border-[#EFE6D3] rounded-lg text-sm text-[#0A2540] focus:outline-none focus:border-[#9B2C2C] resize-y"
            />
            <p className="mt-1 text-[11px] text-[#6B7685]">
              {noteRequired && trimmedNote.length < MIN_CANCELLATION_NOTE_LENGTH
                ? `${trimmedNote.length}/${MIN_CANCELLATION_NOTE_LENGTH} minimum`
                : `${note.length}/2000`}
            </p>
          </div>

          <p className="text-xs text-[#3A4A5F]">
            {isArchive
              ? "The load is cancelled with this reason and removed from the board. Nothing is deleted; its records stay on file."
              : "The carrier is notified, live paperwork is voided, and credit holds are reversed."}
          </p>

          {error && (
            <div role="alert" className="bg-[#F6E3E3] border border-[#9B2C2C]/40 rounded-lg p-3">
              <p className="text-xs text-[#9B2C2C]">{error}</p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[rgba(10,37,64,0.10)] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm text-[#3A4A5F] hover:text-[#0A2540] disabled:opacity-50"
          >
            Keep load
          </button>
          <button
            onClick={submit}
            disabled={!complete || submitting}
            className="px-4 py-2 bg-[#9B2C2C] text-white rounded-lg text-sm font-semibold hover:bg-[#7a2222] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                {isArchive ? "Archiving…" : "Cancelling…"}
              </>
            ) : isArchive ? (
              "Archive load"
            ) : (
              "Cancel load"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
