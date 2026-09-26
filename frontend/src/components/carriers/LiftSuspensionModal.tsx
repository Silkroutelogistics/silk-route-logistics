"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { X, RotateCcw, AlertTriangle } from "lucide-react";
import { api } from "@/lib/api";

/**
 * LiftSuspensionModal — the AE side of POST /compliance/carrier/:id/lift-suspension.
 *
 * The way out of SUSPENDED, which did not exist: Approve and Reject both refuse
 * a suspended carrier server-side and named "lift suspension" as the remedy.
 * Lifting returns the carrier to REVIEWING and restores their portal sign-in.
 * It never approves them; that stays a separate decision through Approve.
 *
 * Shows what is being lifted (when, why, and whether a person or a sweep did
 * it), because an automatic suspension whose condition still holds comes back
 * once the carrier is approved, and an AE should know that before lifting.
 * Reason required, ≥5 characters, the same floor the suspend modal uses.
 * ADMIN / CEO / OPERATIONS, the roles that can suspend.
 */

// Display copy for AutoSuspendCause (schema.prisma). Local on purpose: this
// modal is the only place the causes are read to a person.
const CAUSE_LABEL: Record<string, string> = {
  AE_MANUAL: "Suspended by an administrator",
  FMCSA_AUTHORITY: "Automatic: FMCSA operating authority",
  FMCSA_OUT_OF_SERVICE: "Automatic: FMCSA out-of-service order",
  FMCSA_RATING: "Automatic: FMCSA safety rating",
  INSURANCE_EXPIRED: "Automatic: insurance expired",
  VETTING_CRITICAL: "Automatic: critical vetting score",
  OFAC_MATCH: "Automatic: possible OFAC sanctions match",
};

export function LiftSuspensionModal({
  carrierId, carrierName, suspendedAt, suspendReason, suspendCause, onClose, onDone,
}: {
  carrierId: string;
  carrierName: string;
  suspendedAt?: string | null;
  suspendReason?: string | null;
  suspendCause?: string | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState("");
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const lift = useMutation({
    mutationFn: async () =>
      (await api.post(`/compliance/carrier/${carrierId}/lift-suspension`, { reason: reason.trim() })).data,
    onSuccess: onDone,
    onError: (err: any) => setErrMsg(err?.response?.data?.error ?? err?.message ?? "Could not lift the suspension"),
  });
  const valid = reason.trim().length >= 5;
  const automatic = !!suspendCause && suspendCause !== "AE_MANUAL";
  const causeLabel = suspendCause ? CAUSE_LABEL[suspendCause] ?? suspendCause : "Cause not recorded";
  const when = suspendedAt
    ? new Date(suspendedAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true" aria-labelledby="lift-suspension-title">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-5 border border-gray-200">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 id="lift-suspension-title" className="text-base font-semibold text-gray-900 inline-flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-[#2F7A4F]" strokeWidth={2} />
            Lift suspension on {carrierName}
          </h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-700" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="mb-3 rounded-md border border-[#EFE6D3] bg-[#FBF7F0] p-3 text-xs text-gray-700">
          <p className="font-medium text-gray-900">
            {causeLabel}{when ? `, ${when}` : ""}
          </p>
          {suspendReason && <p className="mt-1 whitespace-pre-wrap">{suspendReason}</p>}
        </div>

        <p className="text-sm text-gray-700 mb-3">
          Lifting returns this carrier to REVIEWING and lets them sign in to the carrier portal
          again. It does not approve them: approve separately once you have checked the account.
          The carrier is emailed that the suspension is lifted. Your reason stays on the audit
          trail and is not sent to them.
        </p>

        {automatic && (
          <p className="mb-3 flex gap-2 rounded-md border border-[#B07A1A]/40 bg-[#FBEFD4] p-2.5 text-xs text-[#B07A1A]">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            <span>
              {suspendCause === "OFAC_MATCH"
                ? "Lifting this does not clear the sanctions match. No load can be tendered to this carrier until the OFAC screening review clears it."
                : "This suspension was automatic. If the condition still holds, the compliance scan will suspend the carrier again after it is approved."}
            </span>
          </p>
        )}

        <label htmlFor="lift-reason" className="block text-xs font-medium text-gray-600 mb-1">Reason (required, at least 5 characters)</label>
        <textarea
          id="lift-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. Suspended in error; FMCSA authority reinstated; needed for portal testing"
          className="w-full text-sm border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#2F7A4F]/30 focus:border-[#2F7A4F]"
        />
        {errMsg && <p role="alert" className="mt-2 text-xs text-[#9B2C2C]">{errMsg}</p>}
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-700 border border-gray-300 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => lift.mutate()}
            disabled={!valid || lift.isPending}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-[#FBF7F0] bg-[#2F7A4F] hover:bg-[#25613F] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#2F7A4F]/40"
          >
            {lift.isPending ? "Lifting…" : "Lift suspension"}
          </button>
        </div>
      </div>
    </div>
  );
}
