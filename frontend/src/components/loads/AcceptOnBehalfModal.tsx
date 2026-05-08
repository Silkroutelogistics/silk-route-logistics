"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Sprint 39 (Item 54) — AE accept-on-behalf modal.
 *
 * Calls POST /api/tenders/:id/accept-on-behalf which is gated to
 * ADMIN/CEO role at the backend. Reason is required (min 10 chars,
 * server enforces) and stamped into the audit log under action
 * "TENDER_ACCEPTED_ON_BEHALF" so overrides are queryable separately
 * from organic carrier accepts.
 *
 * Compliance check still runs server-side. Modal does not bypass
 * safety — if the carrier is non-compliant at accept time the
 * server returns 403 with blocked_reasons and the modal surfaces them.
 */
export function AcceptOnBehalfModal({
  tenderId,
  carrierName,
  onClose,
  onSuccess,
}: {
  tenderId: string;
  carrierName: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/tenders/${tenderId}/accept-on-behalf`, { reason });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      queryClient.invalidateQueries({ queryKey: ["load"] });
      onSuccess();
      onClose();
    },
    onError: (err: { response?: { data?: { error?: string; blocked_reasons?: string[] } }; message?: string }) => {
      const data = err.response?.data;
      const reasons = data?.blocked_reasons?.length ? ` — ${data.blocked_reasons.join(", ")}` : "";
      setError(`${data?.error || err.message || "Failed to accept tender"}${reasons}`);
    },
  });

  const canSubmit = reason.trim().length >= 10 && confirmed && !mutation.isPending;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-[#0A2540] mb-1">Accept Tender on Behalf</h2>
        <p className="text-sm text-slate-600 mb-4">Carrier: <span className="font-medium text-[#0A2540]">{carrierName}</span></p>

        <label className="block text-xs font-medium text-slate-700 mb-1">
          Reason <span className="text-red-600">*</span>
          <span className="text-slate-500 font-normal"> (min 10 chars, audit-logged)</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          placeholder="Why is this override operationally necessary?"
          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg text-[#0A2540] placeholder:text-slate-400 focus:outline-none focus:border-[#BA7517]"
        />

        <label className="flex items-start gap-2 mt-4 cursor-pointer">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(e) => setConfirmed(e.target.checked)}
            className="mt-0.5"
          />
          <span className="text-sm text-slate-700">
            I confirm this override is operationally necessary
          </span>
        </label>

        {error && (
          <div className="mt-3 p-2 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm rounded">
            <span className="font-medium">Error:</span> {error}
          </div>
        )}

        <div className="flex gap-2 mt-6">
          <button
            onClick={onClose}
            disabled={mutation.isPending}
            className="flex-1 px-4 py-2 text-sm bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => { setError(null); mutation.mutate(); }}
            disabled={!canSubmit}
            className="flex-1 px-4 py-2 text-sm bg-[#BA7517] text-white rounded-lg hover:bg-[#854F0B] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutation.isPending ? "Accepting..." : "Accept on Behalf"}
          </button>
        </div>
      </div>
    </div>
  );
}
