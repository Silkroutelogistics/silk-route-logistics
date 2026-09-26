"use client";

import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, XCircle, AlertTriangle, X, Ban, RotateCcw, Mail } from "lucide-react";
import { api } from "@/lib/api";
import type { CrmCustomer } from "./types";

/**
 * Phase 6.2 Lead Hunter / CRM separation. Approve / Inactivate / Reactivate /
 * Inactivate controls for the AE Console customer detail surface. Pairs with the
 * POST /customers/:id/approve required-checks gate. On 422 the missing-checks
 * payload is rendered inline as an actionable checklist.
 *
 * v3.8.alr §13.3 Item 8.1 — Customer inactivation wired live. The prior
 * "Suspend" TODO modal is replaced by a real Inactivate flow (reason capture)
 * + a Reactivate path. Inactive customers are hard-blocked from new load
 * creation (loadController + withTenderController, ADMIN/CEO override).
 * B5a (lifecycle-gaps, finding #17): Inactivate is offered on EVERY active
 * customer regardless of onboarding status. The "Reject" stub that told the AE
 * to flip a column in the Neon SQL editor is gone — a control that promises
 * behaviour no code grants is worse than no control.
 *
 * Surface priority:
 *   1. !isActive            → red Inactive banner + reason + Reactivate
 *   2. isApproved && active → green Approved banner + Inactivate
 *   3. !isApproved && active→ Approve + Inactivate
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

interface InviteContact {
  id: string;
  name: string;
  title?: string | null;
  email?: string | null;
  doNotContact?: boolean;
}

interface Props {
  customer: CrmCustomer;
  onChange: () => void;
}

export function OnboardingActionBar({ customer, onChange }: Props) {
  const [missing, setMissing] = useState<MissingCheck[] | null>(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);
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

  const [inviteMsg, setInviteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  // v3.8.bjv — the invite goes to a contact the AE picks from the live contact
  // list. Nothing is inferred from the customer record: a contact deleted from
  // the list cannot be offered, and the server refuses any id not on the list.
  const [pickerOpen, setPickerOpen] = useState(false);
  const [contactId, setContactId] = useState<string>("");
  const contactsQ = useQuery<{ contacts: InviteContact[] }>({
    queryKey: ["customer-contacts", customer.id],
    queryFn: async () => (await api.get(`/customers/${customer.id}/contacts`)).data,
    enabled: pickerOpen,
  });
  const eligible = (contactsQ.data?.contacts ?? []).filter((c) => !!c.email?.trim() && !c.doNotContact);
  const portalInvite = useMutation({
    mutationFn: async (cid: string) =>
      (await api.post(`/customers/${customer.id}/send-portal-invite`, { contactId: cid })).data,
    onSuccess: (d: any) => {
      setPickerOpen(false);
      setContactId("");
      setInviteMsg({ ok: true, text: `Portal invite sent to ${d?.sentTo ?? "the contact"}.` });
      onChange();
    },
    onError: (err: any) =>
      setInviteMsg({ ok: false, text: err?.response?.data?.error ?? err?.message ?? "Could not send the invite." }),
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
          <div className="flex gap-2">
            {/* v3.8.aqs — no linked portal login yet: offer to invite them to set one up. */}
            {!customer.userId && (
              <button
                onClick={() => { setInviteMsg(null); setContactId(""); setPickerOpen((o) => !o); }}
                disabled={portalInvite.isPending}
                className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-[#BA7517] hover:bg-[#8f5a11] disabled:opacity-50 focus:outline-none focus:ring-2 focus:ring-[#BA7517]/40 inline-flex items-center gap-1.5"
              >
                <Mail className="w-3.5 h-3.5" strokeWidth={2} />
                {portalInvite.isPending ? "Sending…" : "Send portal invite"}
              </button>
            )}
            <button
              onClick={() => setShowInactivate(true)}
              className="px-3 py-1.5 text-xs font-medium rounded-md text-[#9B2C2C] border border-[#9B2C2C]/40 hover:bg-[#F6E3E3]/60 focus:outline-none focus:ring-2 focus:ring-[#9B2C2C]/30 inline-flex items-center gap-1.5"
            >
              <Ban className="w-3.5 h-3.5" strokeWidth={2} />
              Inactivate
            </button>
          </div>
        </div>
        {pickerOpen && !customer.userId && (
          <div className="mt-3 rounded-md border border-gray-200 bg-white p-3">
            <div className="text-xs font-medium text-gray-700 mb-2">Send the portal invite to which contact?</div>
            {contactsQ.isLoading ? (
              <div className="text-xs text-gray-500">Loading contacts…</div>
            ) : contactsQ.isError ? (
              <div className="text-xs text-[#9B2C2C]">Could not load the contact list. No invite was sent.</div>
            ) : eligible.length === 0 ? (
              <div className="text-xs text-[#9B2C2C]">
                No contact on this customer&apos;s list has an email and is cleared to contact. Add one on the
                Contacts tab first. No invite was sent.
              </div>
            ) : (
              <div className="flex items-center gap-2 flex-wrap">
                <select
                  value={contactId}
                  onChange={(e) => setContactId(e.target.value)}
                  className="text-xs border border-gray-300 rounded-md px-2 py-1.5 min-w-[260px] bg-white text-gray-800"
                  aria-label="Invite recipient"
                >
                  <option value="">Choose a contact…</option>
                  {eligible.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}{c.title ? ` (${c.title})` : ""} · {c.email}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => contactId && portalInvite.mutate(contactId)}
                  disabled={!contactId || portalInvite.isPending}
                  className="px-3 py-1.5 text-xs font-medium rounded-md text-white bg-[#BA7517] hover:bg-[#8f5a11] disabled:opacity-50"
                >
                  {portalInvite.isPending ? "Sending…" : "Send invite"}
                </button>
                <button
                  onClick={() => setPickerOpen(false)}
                  className="px-3 py-1.5 text-xs font-medium rounded-md text-gray-600 border border-gray-300 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}
        {inviteMsg && (
          <div className={`mt-2 text-xs ${inviteMsg.ok ? "text-[#2F7A4F]" : "text-[#9B2C2C]"}`}>{inviteMsg.text}</div>
        )}
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

  // 3. Not approved + active — Approve / Inactivate (B5a: every active customer).
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
            onClick={() => setShowInactivate(true)}
            className="px-3 py-1.5 text-xs font-medium rounded-md text-[#9B2C2C] border border-[#9B2C2C]/40 hover:bg-[#F6E3E3]/60 focus:outline-none focus:ring-2 focus:ring-[#9B2C2C]/30 inline-flex items-center gap-1.5"
          >
            <Ban className="w-3.5 h-3.5" strokeWidth={2} />
            Inactivate
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
