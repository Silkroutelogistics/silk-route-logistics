"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertTriangle, X } from "lucide-react";
import { api } from "@/lib/api";
import type { CrmCustomer } from "./types";

/**
 * Phase 6.2 Lead Hunter / CRM separation. Approve / Suspend / Reject
 * buttons for the AE Console customer detail surface. Pairs with the
 * POST /customers/:id/approve required-checks gate. On 422 the missing-
 * checks payload is rendered inline as an actionable checklist.
 *
 * Suspend / Reject open TODO modals — no backend transition exists yet.
 * Tracked under CLAUDE.md §13.3 Item 8.1 (v3.8.l customer inactivation).
 *
 * Brand tokens:
 *   success #2F7A4F / bg #E6F0E9
 *   warning #B07A1A / bg #FBEFD4
 *   danger  #9B2C2C / bg #F6E3E3
 *   gold-dark #BA7517 (CTA emphasis)
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
  const [todoModal, setTodoModal] = useState<"suspend" | "reject" | null>(null);

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

  const status = (customer.onboardingStatus ?? "PENDING").toUpperCase();
  const isApproved = status === "APPROVED";

  if (isApproved) {
    return (
      <div className="px-6 py-3 border-b border-gray-200 bg-[#E6F0E9]/40 flex items-center gap-2">
        <CheckCircle2 className="w-4 h-4 text-[#2F7A4F]" strokeWidth={2} />
        <span className="text-xs text-[#2F7A4F] font-medium">Approved customer · onboarding gate cleared</span>
      </div>
    );
  }

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
            onClick={() => setTodoModal("suspend")}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-[#B07A1A] hover:bg-[#8E6315] focus:outline-none focus:ring-2 focus:ring-[#B07A1A]/40"
          >
            Suspend
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

function TodoModal({ action, onClose }: { action: "suspend" | "reject"; onClose: () => void }) {
  const verb = action === "suspend" ? "Suspend" : "Reject";
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
          The {verb.toLowerCase()} transition is not implemented yet. Customer inactivation
          is scoped under CLAUDE.md §13.3 Item 8.1 (v3.8.l). Until that ships, flip
          <code className="mx-1 px-1 py-0.5 rounded bg-gray-100 text-[#0A2540] font-mono text-[11px]">onboardingStatus</code>
          via Neon SQL editor if a record needs to be {action === "suspend" ? "suspended" : "rejected"} immediately.
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
