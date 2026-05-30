"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertTriangle, X, Ban, RotateCcw } from "lucide-react";
import { api } from "@/lib/api";
import type { CrmCustomer } from "./types";

/**
 * Phase 6.2 Lead Hunter / CRM separation. Approve / Inactivate / Reactivate /
 * Reject controls for the AE Console customer detail surface. Pairs with the
 * POST /customers/:id/approve required-checks gate. On 422 the missing-checks
 * payload is rendered inline as an actionable checklist.
 *
 * v3.8.alr §13.3 Item 8.1 — Customer inactivation wired live. The prior
 * "Suspend" TODO modal is replaced by a real Inactivate flow (reason capture)
 * + a Reactivate path. Inactive customers are hard-blocked from new load
 * creation (loadController + withTenderController, ADMIN/CEO override).
 * "Reject" remains a TODO (distinct onboarding-stage concern, banked).
 *
 * Surface priority:
 *   1. !isActive            → red Inactive banner + reason + Reactivate
 *   2. isApproved && active → green Approved banner + Inactivate
 *   3. !isApproved && active→ Approve + Reject
 *
 * Brand tokens:
 *   success #2F7A4F / bg #E6F0E9 · warning #B07A1A / bg #FBEFD4
 *   danger  #9B2C2C / bg #F6E3E3 · gold-dark #BA7517 (CTA emphasis)
 */

interface MissingCheck {
  field: string;
  label: string;
  reason: string;
}

interface ApproveError {
  error: string;
  missing?: MissingCheck[];
}

interface Props {
  customer: CrmCustomer;
  onChange: () => void;
}

export function OnboardingActionBar({ customer, onChange }: Props) {
  const [missing, setMissing] = useState<MissingCheck[] | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
  const [todoModal, setTodoModal] = useState<"reject" | null>(null);
  const [showInactivate, setShowInactivate] = useState(false);

  const approve = useMutation({
    mutationFn: async () => (await api.post(`/customers/${customer.id}/approve`)).data,
    onSuccess: () => {
      setMissing(null);
      setErrMsg(null);
      onChange();
    },
    onError: (err: any) => {
      const data: ApproveError | undefined = err?.response?.data;
      if (err?.response?.status === 422 && data?.missing) {
        setMissing(data.missing);
        setErrMsg(null);
      } else {
        setMissing(null);
        setErrMsg(data?.error ?? err?.message ?? "Approval failed");
      }
    },
  });

  const reactivate = useMutation({
    mutationFn: async () => (await api.post(`/customers/${customer.id}/reactivate`)).data,
    onSuccess: () => {
      setErrMsg(null);
      onChange();
    },
    onError: (err: any) => {
      setErrMsg(err?.response?.data?.error ?? err?.message ?? "Reactivation failed");
    },
  });

  const status = (customer.onboardingStatus ?? "PENDING").toUpperCase();
  const isApproved = status === "APPROVED";
  const isInactive = customer.isActive === false;

  // 1. Inactive — top priority regardless of onboarding status.
  if (isInactive) {
    return (
      <div className="px-6 py-3 border-b border-gray-200 bg-[#F6E3E3]/40">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-2 min-w-0">
            <Ban className="w-4 h-4 text-[#9B2C2C] shrink-0 mt-0.5" strokeWidth={2} />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-[#9B2C2C]">
                Inactive customer · blocked from new loads
              </div>
              {customer.inactivationReason && (
                <div className="text-xs text-gray-700 mt-0.5">
                  Reason: {customer.inactivationReason}
                </div>
              )}
            </div>
          </div>
          <button
            onClick={() => reactivate.mutate()}
            disabled={reactivate.isPending}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-[#2F7A4F] hover:bg-[#256340] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#2F7A4F]/40 inline-flex items-center gap-1.5 shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5" strokeWidth={2} />
            {reactivate.isPending ? "Reactivating…" : "Reactivate"}
          </button>
        </div>
        {errMsg && (
          <div className="mt-2 text-xs text-[#9B2C2C]">{errMsg}</div>
        )}
      </div>
    );
  }

  // 2. Approved + active — green banner + Inactivate.
  if (isApproved) {
    return (
      <div className="px-6 py-3 border-b border-gray-200 bg-[#E6F0E9]/40">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#2F7A4F]" strokeWidth={2} />
            <span className="text-xs text-[#2F7A4F] font-medium">Approved customer · onboarding gate cleared</span>
          </div>
          <button
            onClick={() => setShowInactivate(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-[#9B2C2C] border border-[#9B2C2C]/40 hover:bg-[#F6E3E3]/60 focus:outline-none focus:ring-2 focus:ring-[#9B2C2C]/30 inline-flex items-center gap-1.5"
          >
            <Ban className="w-3.5 h-3.5" strokeWidth={2} />
            Inactivate
          </button>
        </div>
        {errMsg && <div className="mt-2 text-xs text-[#9B2C2C]">{errMsg}</div>}
        {showInactivate && (
          <InactivateModal
            customerId={customer.id}
            customerName={customer.name}
            onClose={() => setShowInactivate(false)}
            onDone={() => { setShowInactivate(false); onChange(); }}
            onError={(m) => setErrMsg(m)}
          />
        )}
      </div>
    );
  }

  // 3. Not approved + active — Approve / Reject.
  return (
    <div className="px-6 py-3 border-b border-gray-200 bg-white">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-gray-600 font-medium">
          Onboarding status:{" "}
          <span className="text-[#B07A1A]">{status.replace(/_/g, " ")}</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => approve.mutate()}
            disabled={approve.isPending}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-[#2F7A4F] hover:bg-[#256340] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#2F7A4F]/40"
          >
            {approve.isPending ? "Approving…" : "Approve"}
          </button>
          <button
            onClick={() => setTodoModal("reject")}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-[#9B2C2C] hover:bg-[#7C2323] focus:outline-none focus:ring-2 focus:ring-[#9B2C2C]/40"
          >
            Reject
          </button>
        </div>
      </div>

      {missing && missing.length > 0 && (
        <div className="mt-3 border border-[#9B2C2C]/40 bg-[#F6E3E3]/40 rounded-md p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-4 h-4 text-[#9B2C2C] shrink-0 mt-0.5" strokeWidth={2} />
            <div className="flex-1 min-w-0">
              <div className="text-xs font-semibold text-[#9B2C2C]">Required checks not satisfied</div>
              <ul className="mt-2 space-y-1.5">
                {missing.map((m) => (
                  <li key={m.field} className="flex items-start gap-2 text-xs">
                    <XCircle className="w-3.5 h-3.5 text-[#9B2C2C] shrink-0 mt-0.5" strokeWidth={2} />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-gray-900">{m.label}</span>
                      <span className="text-gray-600"> — {m.reason}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {errMsg && !missing && (
        <div className="mt-3 border border-[#9B2C2C]/40 bg-[#F6E3E3]/40 rounded-md p-2 text-xs text-[#9B2C2C]">
          {errMsg}
        </div>
      )}

      {todoModal && <TodoModal action={todoModal} onClose={() => setTodoModal(null)} />}
    </div>
  );
}

function InactivateModal({
  customerId, customerName, onClose, onDone, onError,
}: {
  customerId: string;
  customerName: string;
  onClose: () => void;
  onDone: () => void;
  onError: (msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const inactivate = useMutation({
    mutationFn: async () => (await api.post(`/customers/${customerId}/inactivate`, { reason: reason.trim() })).data,
    onSuccess: onDone,
    onError: (err: any) => {
      onError(err?.response?.data?.error ?? err?.message ?? "Inactivation failed");
      onClose();
    },
  });
  const valid = reason.trim().length >= 5;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-5 border border-gray-200">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-base font-semibold text-gray-900">Inactivate {customerName}</h3>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-gray-700" aria-label="Close">
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-gray-700 mb-3">
          Inactivating blocks new loads from being created against this customer. Existing
          loads are unaffected. ADMIN/CEO can still override at load creation. You can
          reactivate at any time.
        </p>
        <label className="block text-xs font-medium text-gray-600 mb-1">Reason (required)</label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={3}
          maxLength={500}
          placeholder="e.g. Account closed, non-payment, dormant for 12 months…"
          className="w-full text-sm border border-gray-300 rounded-md p-2 focus:outline-none focus:ring-2 focus:ring-[#9B2C2C]/30 focus:border-[#9B2C2C]"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-700 border border-gray-300 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => inactivate.mutate()}
            disabled={!valid || inactivate.isPending}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-[#9B2C2C] hover:bg-[#7C2323] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#9B2C2C]/40"
          >
            {inactivate.isPending ? "Inactivating…" : "Inactivate customer"}
          </button>
        </div>
      </div>
    </div>
  );
}

function TodoModal({ action, onClose }: { action: "reject"; onClose: () => void }) {
  const verb = "Reject";
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-5 border border-gray-200">
        <div className="flex items-start justify-between gap-3 mb-3">
          <h3 className="text-base font-semibold text-gray-900">{verb} customer — not yet wired</h3>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-gray-700 hover:text-gray-600"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-sm text-gray-700">
          The reject transition is a distinct onboarding-stage concern, banked separately.
          To take a customer out of active use today, use <strong>Inactivate</strong> on an
          approved customer, or flip
          <code className="mx-1 px-1 py-0.5 rounded bg-gray-100 text-[#0A2540] font-mono text-[11px]">onboardingStatus</code>
          via Neon SQL editor if a pending record must be rejected immediately.
        </p>
        <div className="mt-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-[#BA7517] hover:bg-[#8f5a11] focus:outline-none focus:ring-2 focus:ring-[#BA7517]/40"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
