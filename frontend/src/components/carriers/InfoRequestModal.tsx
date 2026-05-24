"use client";

// v3.8.ajh — AE Console "Request Info" modal.
//
// Opens from the carrier detail surface action bar. AE picks a category
// (industry-standard templates) → the message textarea pre-fills with
// a sensible default → AE customizes or sends as-is. Submit creates an
// InfoRequest on the backend; service layer auto-flips carrier status
// PENDING/REVIEWING → INFO_REQUESTED + sends carrier email.

import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { X, Send, Loader2 } from "lucide-react";

// Mirror of backend InfoRequestCategory enum + default templates.
// Keeping the labels + templates inline matches the AE-fast workflow
// (instant pre-fill, no API round-trip to fetch the template list).
const CATEGORIES: Array<{ value: string; label: string; template: string }> = [
  {
    value: "COI_UPDATE",
    label: "Updated Certificate of Insurance (COI)",
    template: "Please provide an updated Certificate of Insurance. The COI on file expires soon or appears to be missing required coverage. SRL must be listed as Certificate Holder.",
  },
  {
    value: "W9_UPDATE",
    label: "Updated W-9 form",
    template: "Please provide a current W-9 form. Federal tax ID information is required for payment processing.",
  },
  {
    value: "AUTHORITY_LETTER",
    label: "FMCSA Authority Letter",
    template: "Please provide a current copy of your FMCSA Operating Authority letter.",
  },
  {
    value: "SAFETY_CLARIFICATION",
    label: "Safety record clarification",
    template: "We need clarification on a recent safety record entry. Please describe the circumstances and any corrective actions taken.",
  },
  {
    value: "EIN_VERIFICATION",
    label: "EIN/TIN verification",
    template: "Please confirm your EIN/TIN. We need this to verify your business identity against IRS records.",
  },
  {
    value: "VOIDED_CHECK",
    label: "Voided check (for Quick Pay setup)",
    template: "Please provide a voided business check from the account where you would like Quick Pay deposits sent.",
  },
  {
    value: "ADDRESS_PROOF",
    label: "Proof of address",
    template: "Please provide proof of business address (utility bill, lease agreement, or business license dated within the last 90 days).",
  },
  {
    value: "REFERENCES",
    label: "References from prior brokers",
    template: "Please provide contact information (name + phone) for 2-3 brokers you have hauled for in the last 90 days.",
  },
  {
    value: "OTHER",
    label: "Other (custom message)",
    template: "",
  },
];

interface Props {
  carrierId: string;
  carrierCompany: string;
  open: boolean;
  onClose: () => void;
}

export function InfoRequestModal({ carrierId, carrierCompany, open, onClose }: Props) {
  const [category, setCategory] = useState<string>("COI_UPDATE");
  const [message, setMessage] = useState<string>(CATEGORIES[0].template);
  const [messageEdited, setMessageEdited] = useState(false);
  const queryClient = useQueryClient();

  // Reset on open/close
  useEffect(() => {
    if (open) {
      setCategory("COI_UPDATE");
      setMessage(CATEGORIES[0].template);
      setMessageEdited(false);
    }
  }, [open]);

  // ESC + click-outside close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  // Auto-fill template when category changes, unless AE has edited the message.
  // Preserves manual edits across category picks (e.g. AE writes a custom message,
  // toggles category to verify the new label appears, doesn't lose their text).
  function onCategoryChange(newCategory: string) {
    setCategory(newCategory);
    if (!messageEdited) {
      const entry = CATEGORIES.find((c) => c.value === newCategory);
      setMessage(entry?.template || "");
    }
  }

  const mutation = useMutation({
    mutationFn: () => api.post("/info-requests", { carrierId, category, message }),
    onSuccess: () => {
      // Invalidate carriers list + this carrier's info-requests list so
      // the new request appears immediately + the status pill updates.
      queryClient.invalidateQueries({ queryKey: ["carriers"] });
      queryClient.invalidateQueries({ queryKey: ["info-requests", carrierId] });
      onClose();
    },
  });

  if (!open) return null;

  const canSubmit = message.trim().length >= 10 && !mutation.isPending;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[200] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-[0_24px_48px_rgba(10,37,64,0.18)] max-w-lg w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between px-6 py-4 border-b border-[rgba(10,37,64,0.10)]">
          <div>
            <p className="text-[11px] font-semibold tracking-widest text-[#BA7517] uppercase mb-1">Request Info</p>
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
              Category
            </label>
            <select
              value={category}
              onChange={(e) => onCategoryChange(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-[#EFE6D3] rounded-lg text-sm text-[#0A2540] focus:outline-none focus:border-[#BA7517]"
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-[#3A4A5F] uppercase tracking-wider mb-1.5">
              Message to carrier
            </label>
            <textarea
              value={message}
              onChange={(e) => { setMessage(e.target.value); setMessageEdited(true); }}
              rows={6}
              maxLength={2000}
              className="w-full px-3 py-2 bg-white border border-[#EFE6D3] rounded-lg text-sm text-[#0A2540] focus:outline-none focus:border-[#BA7517] resize-y"
              placeholder="Explain what you need from the carrier and why..."
            />
            <p className="mt-1 text-[11px] text-[#6B7685]">
              {message.length}/2000 · minimum 10 characters
            </p>
          </div>

          <div className="bg-[#FBF7F0] border border-[#EFE6D3] rounded-lg p-3">
            <p className="text-[11px] font-semibold text-[#BA7517] uppercase tracking-wider mb-1">What happens next</p>
            <ul className="text-xs text-[#3A4A5F] space-y-0.5">
              <li>Carrier receives an email with your message + portal link</li>
              <li>Application status flips to <strong>INFO_REQUESTED</strong></li>
              <li>When carrier responds, you receive an email + status returns to <strong>REVIEWING</strong></li>
            </ul>
          </div>

          {mutation.isError && (
            <div className="bg-[#F6E3E3] border border-[#9B2C2C]/40 rounded-lg p-3">
              <p className="text-xs text-[#9B2C2C]">
                {((mutation.error as { response?: { data?: { error?: string } } })?.response?.data?.error) || "Could not create info request. Please try again."}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[rgba(10,37,64,0.10)] flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={mutation.isPending}
            className="px-4 py-2 text-sm text-[#3A4A5F] hover:text-[#0A2540] disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!canSubmit}
            className="px-4 py-2 bg-[#BA7517] text-[#FBF7F0] rounded-lg text-sm font-semibold hover:bg-[#854F0B] disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
          >
            {mutation.isPending ? (
              <>
                <Loader2 size={14} className="animate-spin" />
                Sending…
              </>
            ) : (
              <>
                <Send size={14} />
                Send Request
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
