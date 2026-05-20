"use client";

import { useState, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Sprint 40 (Item 58) — AE compliance override modal.
 *
 * Calls POST /api/compliance/carrier/:carrierId/override-block. Backend
 * gates to ADMIN/CEO (Sprint 40 widened from ADMIN-only per Pattern 6
 * cross-sprint precedent audit — symmetric with Sprint 39 acceptOnBehalf).
 *
 * Reason required (min 10 chars, server enforces). Quota: max 2 overrides
 * per carrier per 30 days; server returns 429 on exceed. 24h expiry on
 * the resulting override record. Audit captured to auditTrail under
 * action "COMPLIANCE_OVERRIDE".
 *
 * On success the parent re-runs the compliance check; the existing amber
 * warning banner ("Active compliance override in effect") renders the
 * post-override state without new UI plumbing.
 */
export function OverrideComplianceModal({
  carrierId,
  carrierName,
  blockedReasons,
  onClose,
  onSuccess,
}: {
  carrierId: string;
  carrierName: string;
  blockedReasons: string[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: status } = useQuery<{
    recentOverrideCount: number;
    max: number;
    activeOverride: { id: string; expiresAt: string } | null;
  }>({
    queryKey: ["override-status", carrierId],
    queryFn: async () => {
      const { data } = await api.get(`/compliance/carrier/${carrierId}/override-status`);
      return data;
    },
  });

  const mutation = useMutation({
    mutationFn: async () => {
      const { data } = await api.post(`/compliance/carrier/${carrierId}/override-block`, { reason });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["override-status", carrierId] });
      onSuccess();
      onClose();
    },
    onError: (err: { response?: { data?: { error?: string }; status?: number }; message?: string }) => {
      const data = err.response?.data;
      if (err.response?.status === 429) {
        // Server-returned error text includes the canonical quota number;
        // fallback is generic since the cap is owned by the backend
        // (Sprint 64 raised 2 → 15; future tuning lives in backend
        // controllers/complianceController.ts MAX_OVERRIDES_PER_30_DAYS).
        setError(data?.error || "Override quota exhausted. Contact VP of Operations.");
      } else {
        setError(data?.error || err.message || "Failed to apply override");
      }
    },
  });

  // Reset error if user edits reason after a failed attempt
  useEffect(() => { if (error) setError(null); }, [reason]); // eslint-disable-line react-hooks/exhaustive-deps

  const remaining = status ? Math.max(0, status.max - status.recentOverrideCount) : null;
  const quotaExhausted = remaining === 0;
  const canSubmit = reason.trim().length >= 10 && confirmed && !mutation.isPending && !quotaExhausted;

  return (
    // Sprint 65 (v3.8.afm) hotfix — z-[70] so the override modal stacks
    // above the Carrier Engagement Drawer (bumped to z-[60] same sprint)
    // when both are mounted (drawer triggers modal via "Override
    // compliance block" button).
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 p-6" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-lg font-semibold text-[#0A2540] mb-1">Override Compliance Block</h2>
        <p className="text-sm text-slate-600 mb-3">Carrier: <span className="font-medium text-[#0A2540]">{carrierName}</span></p>

        {status && (
          <div className={`mb-3 p-2 rounded text-xs ${quotaExhausted ? "bg-red-50 text-red-700 border-l-4 border-red-500" : "bg-amber-50 text-amber-800"}`}>
            {quotaExhausted
              ? `Quota exhausted: ${status.recentOverrideCount} of ${status.max} overrides used in last 30 days. Contact VP of Operations.`
              : `${status.recentOverrideCount} of ${status.max} overrides used this month for this carrier`}
          </div>
        )}

        {blockedReasons.length > 0 && (
          <div className="mb-3 p-2 bg-red-50 border-l-4 border-red-500 text-red-700 text-xs rounded">
            <p className="font-medium mb-1">Compliance block reasons:</p>
            <ul className="list-disc list-inside space-y-0.5">
              {blockedReasons.map((r, i) => <li key={i}>{r}</li>)}
            </ul>
          </div>
        )}

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
            I confirm this override is operationally necessary and will expire in 24 hours
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
            data-testid="apply-override-btn"
          >
            {mutation.isPending ? "Applying..." : "Apply Override"}
          </button>
        </div>
      </div>
    </div>
  );
}
