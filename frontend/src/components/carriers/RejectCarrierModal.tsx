"use client";

// v3.8.ajk — AE Reject Carrier modal.
//
// Replaces the bare confirm-only dialog. AE picks a structured reason
// from the dropdown — selection drives the reapply window preview
// inline (so AE sees "Carrier may reapply after Jun 23, 2026" before
// confirming). Optional free-form note for additional context.
//
// Submit POSTs to /api/carriers/:id/reject which calls rejectCarrier
// service: captures reason + computes reapplyEligibleAt + fires
// carrier email.

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { X, Loader2, AlertCircle } from "lucide-react";

const REASONS: Array<{ value: string; label: string; days: number | null; description: string }> = [
  { value: "MISSING_DOCUMENTS", label: "Missing required documents", days: 7, description: "Carrier can resubmit once documents are uploaded." },
  { value: "EXPIRED_INSURANCE", label: "Insurance coverage expired or insufficient", days: 30, description: "Carrier should renew insurance before reapplying." },
  { value: "AUTHORITY_NOT_ACTIVE", label: "FMCSA operating authority not active", days: 60, description: "Carrier needs to reinstate FMCSA authority." },
  { value: "SAFETY_RATING_UNSATISFACTORY", label: "Safety rating unsatisfactory", days: 90, description: "Carrier needs demonstrable improvement in safety record." },
  { value: "COMPLIANCE_VIOLATION", label: "Compliance violation", days: 60, description: "Specific violation should be cited in the note." },
  { value: "DUPLICATE_APPLICATION", label: "Duplicate application detected", days: 30, description: "Carrier already has an active or prior application." },
  { value: "FRAUD_DETECTED", label: "Fraud detected", days: null, description: "PERMANENT — no reapply allowed." },
  { value: "IDENTITY_FRAUD", label: "Identity verification failed", days: null, description: "PERMANENT — no reapply allowed." },
  { value: "OTHER", label: "Other", days: 30, description: "Please add context in the note field." },
];

interface Props {
  carrierId: string;
  carrierCompany: string;
  open: boolean;
  onClose: () => void;
}

export function RejectCarrierModal({ carrierId, carrierCompany, open, onClose }: Props) {
  const [reason, setReason] = useState<string>("MISSING_DOCUMENTS");
  const [note, setNote] = useState<string>("");
  const queryClient = useQueryClient();

  useEffect(() => {
    if (open) {
      setReason("MISSING_DOCUMENTS");
      setNote("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  const selectedReason = REASONS.find((r) => r.value === reason)!;
  const reapplyDate = selectedReason.days !== null
    ? new Date(Date.now() + selectedReason.days * 86400000).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
    : null;
  const isPermanent = selectedReason.days === null;

  const mutation = useMutation({
    mutationFn: () => api.post(`/carriers/${carrierId}/reject`, { reason, note: note.trim() || undefined }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carriers"] });
      onClose();
    },
  });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div className="bg-white rounded-xl shadow-[0_24px_48px_rgba(10,37,64,0.18)] max-w-lg w-full" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between px-6 py-4 border-b border-[rgba(10,37,64,0.10)]">
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-[#9B2C2C] uppercase mb-1">Reject Application</p>
            <h2 className="text-lg font-bold text-[#0A2540]" style={{ fontFamily: "Playfair Display, Georgia, serif" }}>
              {carrierCompany}
            </h2>
          </div>
          <button onClick={onClose} className="text-[#6B7685] hover:text-[#0A2540]" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-[#3A4A5F] uppercase tracking-wider mb-1.5">
              Reason
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#EFE6D3] rounded-lg text-sm text-[#0A2540] focus:outline-none focus:border-[#9B2C2C]"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>{r.label}</option>
              ))}
            </select>
            <p className="mt-1 text-xs text-[#6B7685]">{selectedReason.description}</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3A4A5F] uppercase tracking-wider mb-1.5">
              Optional note <span className="font-normal normal-case text-[#6B7685]">(2000 chars max)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              maxLength={2000}
              placeholder="Add context the carrier should see (e.g. which document is missing, which lane the safety issue affects)..."
              className="w-full px-3 py-2 bg-white border border-[#EFE6D3] rounded-lg text-sm text-[#0A2540] focus:outline-none focus:border-[#9B2C2C] resize-y"
            />
            <p className="mt-1 text-[11px] text-[#6B7685]">{note.length}/2000</p>
          </div>

          <div className={`border rounded-lg p-3 ${isPermanent ? "bg-[#F6E3E3] border-[#9B2C2C]/40" : "bg-[#FBEFD4] border-[#B07A1A]/30"}`}>
            <div className="flex items-start gap-2">
              <AlertCircle size={14} className={isPermanent ? "text-[#9B2C2C] mt-0.5" : "text-[#B07A1A] mt-0.5"} />
              <div>
                <p className={`text-xs font-semibold mb-0.5 ${isPermanent ? "text-[#9B2C2C]" : "text-[#B07A1A]"}`}>
                  {isPermanent ? "Permanent — no reapply allowed" : `Reapply window: ${selectedReason.days} days`}
                </p>
                {!isPermanent && reapplyDate && (
                  <p className="text-xs text-[#3A4A5F]">Carrier may reapply after <strong>{reapplyDate}</strong>.</p>
                )}
                {isPermanent && (
                  <p className="text-xs text-[#3A4A5F]">Carrier will be notified the decision is final.</p>
                )}
              </div>
            </div>
          </div>

          {mutation.isError && (
            <div className="bg-[#F6E3E3] border border-[#9B2C2C]/40 rounded-lg p-3">
              <p className="text-xs text-[#9B2C2C]">
                {((mutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error) || "Could not reject carrier. Please try again."}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[rgba(10,37,64,0.10)] flex justify-end gap-2">
          <button onClick={onClose} disabled={mutation.isPending} className="px-4 py-2 text-sm text-[#3A4A5F] hover:text-[#0A2540] disabled:opacity-50">
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="px-4 py-2 bg-[#9B2C2C] text-white rounded-lg text-sm font-semibold hover:bg-[#7a2222] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {mutation.isPending ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Rejecting…
              </>
            ) : (
              "Reject Application"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
