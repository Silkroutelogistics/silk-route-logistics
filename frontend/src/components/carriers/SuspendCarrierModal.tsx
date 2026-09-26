"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, Ban } from "lucide-react";
import { api } from "@/lib/api";

/**
 * SuspendCarrierModal — lifecycle-gaps B5b (finding #23).
 *
 * The AE side of POST /compliance/carrier/:id/suspend, which existed since
 * v3.8.bbu with no caller. Suspension is the end state for a carrier with
 * history — every tender refused, every record kept — and the reason is
 * REQUIRED (≥5 chars, the server refuses less), because "suspended by an
 * administrator" with nothing after it tells the next reader nothing.
 * ADMIN / CEO / OPERATIONS (decision 5).
 */
export function SuspendCarrierModal({
  carrierId, carrierName, onClose, onDone,
}: {
  carrierId: string;
  carrierName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const suspend = useMutation({
    mutationFn: async () => (await api.post(`/compliance/carrier/${carrierId}/suspend`, { reason: reason.trim() })).data,
    onSuccess: onDone,
    onError: (err: any) => setErrMsg(err?.response?.data?.error ?? err?.message ?? "Suspension failed"),
  });
  const valid = reason.trim().length >= 5;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-5 border border-gray-200">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-base font-semibold text-gray-900 inline-flex items-center gap-2">
            <Ban className="w-4 h-4 text-[#9B2C2C]" strokeWidth={2} />
            Suspend {carrierName}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-700" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-gray-700 mb-3">
          Suspension blocks every new tender to this carrier and keeps every record. Loads already
          in flight stay with them and are paid normally. It is never lifted automatically: an
          administrator lifts it with Lift suspension, which returns the carrier to review.
        </p>
        <label htmlFor="suspend-reason" className="block text-xs font-medium text-gray-600 mb-1">Reason (required, at least 5 characters)</label>
        <textarea
          id="suspend-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. Repeated no-shows on booked loads, insurance lapsed and not renewed…"
          className="w-full text-sm border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#9B2C2C]/30 focus:border-[#9B2C2C]"
        />
        {errMsg && <p role="alert" className="mt-2 text-xs text-[#9B2C2C]">{errMsg}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-700 border border-gray-300 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => suspend.mutate()}
            disabled={!valid || suspend.isPending}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-[#FBF7F0] bg-[#9B2C2C] hover:bg-[#7C2323] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#9B2C2C]/40"
          >
            {suspend.isPending ? "Suspending…" : "Suspend carrier"}
          </button>
        </div>
      </div>
    </div>
  );
}
