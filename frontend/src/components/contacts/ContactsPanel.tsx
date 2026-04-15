"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Mail, Phone, Plus, X, Zap, Ban } from "lucide-react";
import { api } from "@/lib/api";

export type ContactSalesRole =
  | "DECISION_MAKER"
  | "CHAMPION"
  | "GATEKEEPER"
  | "TECHNICAL"
  | "BILLING"
  | "OTHER";

export interface ContactRow {
  id: string;
  name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  isPrimary: boolean;
  isBilling: boolean;
  receivesTrackingLink: boolean;
  salesRole: ContactSalesRole | null;
  introducedVia: string | null;
  doNotContact: boolean;
}

interface Props {
  customerId: string;
  /** Called after any mutation so the parent can invalidate its own queries */
  onChange?: () => void;
}

const SALES_ROLE_BADGE: Record<ContactSalesRole, { label: string; cls: string }> = {
  DECISION_MAKER: { label: "Decision-maker", cls: "bg-purple-100 text-purple-700" },
  CHAMPION:       { label: "Champion",       cls: "bg-green-100 text-green-700" },
  GATEKEEPER:     { label: "Gatekeeper",     cls: "bg-gray-100 text-gray-700" },
  TECHNICAL:      { label: "Technical",      cls: "bg-blue-100 text-blue-700" },
  BILLING:        { label: "Billing",        cls: "bg-amber-100 text-amber-700" },
  OTHER:          { label: "Other",          cls: "bg-gray-100 text-gray-600" },
};

const SALES_ROLE_OPTIONS: { value: ContactSalesRole | ""; label: string }[] = [
  { value: "",               label: "— no role —" },
  { value: "DECISION_MAKER", label: "Decision-maker" },
  { value: "CHAMPION",       label: "Champion" },
  { value: "GATEKEEPER",     label: "Gatekeeper" },
  { value: "TECHNICAL",      label: "Technical" },
  { value: "BILLING",        label: "Billing" },
  { value: "OTHER",          label: "Other" },
];

export function ContactsPanel({ customerId, onChange }: Props) {
  const [addOpen, setAddOpen] = useState(false);

  const q = useQuery<{ contacts: ContactRow[] }>({
    queryKey: ["customer-contacts", customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}/contacts`)).data,
  });

  const toggleTracking = useMutation({
    mutationFn: async ({ contactId, value }: { contactId: string; value: boolean }) =>
      (await api.patch(`/customers/${customerId}/contacts/${contactId}/tracking-link`, {
        receivesTrackingLink: value,
      })).data,
    onSuccess: () => { q.refetch(); onChange?.(); },
  });

  const toggleDnc = useMutation({
    mutationFn: async ({ contactId, value }: { contactId: string; value: boolean }) =>
      (await api.patch(`/customers/${customerId}/contacts/${contactId}`, {
        doNotContact: value,
      })).data,
    onSuccess: () => { q.refetch(); onChange?.(); },
  });

  const del = useMutation({
    mutationFn: async (contactId: string) =>
      (await api.delete(`/customers/${customerId}/contacts/${contactId}`)).data,
    onSuccess: () => { q.refetch(); onChange?.(); },
  });

  const contacts = q.data?.contacts ?? [];

  return (
    <div className="space-y-3 text-sm">
      {contacts.length === 0 && !q.isLoading && !addOpen && (
        <div className="text-center py-6 text-gray-400 text-xs">No contacts yet.</div>
      )}

      {contacts.map((c) => {
        const roleBadge = c.salesRole ? SALES_ROLE_BADGE[c.salesRole] : null;
        const initials = c.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();
        return (
          <div
            key={c.id}
            className={`border rounded-lg p-3 ${
              c.doNotContact
                ? "bg-red-50/40 border-red-200/80 opacity-75"
                : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold ${
                  c.doNotContact ? "bg-red-100 text-red-600" : "bg-gray-100 text-gray-600"
                }`}>
                  {initials || "?"}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className={`font-medium truncate ${
                      c.doNotContact ? "text-gray-500 line-through" : "text-gray-900"
                    }`}>
                      {c.name}
                    </span>
                    {c.isPrimary && <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700">Primary</span>}
                    {c.isBilling && <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 text-gray-600">Billing</span>}
                    {roleBadge && (
                      <span className={`px-1.5 py-0.5 text-[10px] rounded font-semibold ${roleBadge.cls}`}>
                        {roleBadge.label}
                      </span>
                    )}
                    {c.receivesTrackingLink && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-[#FAEEDA] text-[#854F0B]">
                        <Zap className="w-2.5 h-2.5" strokeWidth={2} /> Tracking
                      </span>
                    )}
                    {c.doNotContact && (
                      <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-red-100 text-red-700 font-semibold">
                        <Ban className="w-2.5 h-2.5" strokeWidth={2} /> Do Not Contact
                      </span>
                    )}
                  </div>
                  {c.title && <div className="text-xs text-gray-500">{c.title}</div>}
                  {c.email && (
                    <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                      <Mail className="w-3 h-3" /> {c.email}
                    </div>
                  )}
                  {c.phone && (
                    <div className="text-xs text-gray-500 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {c.phone}
                    </div>
                  )}
                  {c.introducedVia && (
                    <div className="text-[11px] text-gray-400 mt-1 italic">via {c.introducedVia}</div>
                  )}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1 shrink-0">
                <button
                  onClick={() => toggleTracking.mutate({ contactId: c.id, value: !c.receivesTrackingLink })}
                  className={`px-2 py-1 text-[10px] rounded transition ${
                    c.receivesTrackingLink
                      ? "bg-[#FAEEDA] text-[#854F0B] border border-[#BA7517]/40"
                      : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
                  }`}
                  title={c.receivesTrackingLink ? "Remove tracking tag" : "Tag for tracking link emails"}
                >
                  {c.receivesTrackingLink ? "★ Tracking on" : "☆ Tag for tracking"}
                </button>
                <button
                  onClick={() => toggleDnc.mutate({ contactId: c.id, value: !c.doNotContact })}
                  className={`px-2 py-1 text-[10px] rounded transition ${
                    c.doNotContact
                      ? "bg-red-100 text-red-700 border border-red-300"
                      : "bg-white text-gray-500 border border-gray-200 hover:border-gray-300"
                  }`}
                  title={c.doNotContact ? "Remove do-not-contact flag" : "Mark as do-not-contact"}
                >
                  {c.doNotContact ? "🚫 DNC on" : "DNC"}
                </button>
                <button
                  onClick={() => del.mutate(c.id)}
                  className="text-[10px] text-red-500 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {!addOpen ? (
        <button
          onClick={() => setAddOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-300 text-gray-500 hover:text-[#BA7517] hover:border-[#BA7517] rounded-lg transition"
        >
          <Plus className="w-4 h-4" /> Add contact
        </button>
      ) : (
        <AddContactForm
          customerId={customerId}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); q.refetch(); onChange?.(); }}
        />
      )}

      <div className="p-3 text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg">
        <strong>Tracking tag:</strong> contacts tagged &ldquo;Tracking&rdquo; automatically receive shipper tracking
        links when a load for this customer is dispatched.
      </div>
    </div>
  );
}

function AddContactForm({
  customerId, onClose, onSaved,
}: { customerId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "",
    title: "",
    email: "",
    phone: "",
    isPrimary: false,
    isBilling: false,
    receivesTrackingLink: false,
    doNotContact: false,
    salesRole: "" as ContactSalesRole | "",
    introducedVia: "",
  });

  const save = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: form.name,
        title: form.title || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        isPrimary: form.isPrimary,
        isBilling: form.isBilling,
        receivesTrackingLink: form.receivesTrackingLink,
        doNotContact: form.doNotContact,
        salesRole: form.salesRole || null,
        introducedVia: form.introducedVia || null,
      };
      return (await api.post(`/customers/${customerId}/contacts`, payload)).data;
    },
    onSuccess: onSaved,
  });

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-medium text-gray-900">New contact</h4>
        <button onClick={onClose} aria-label="Cancel"><X className="w-4 h-4 text-gray-400" /></button>
      </div>
      <input value={form.name}  onChange={(e) => setForm({ ...form, name: e.target.value })}  placeholder="Name *" className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:border-[#BA7517]" />
      <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title"   className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:border-[#BA7517]" />
      <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email"   className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:border-[#BA7517]" />
      <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone"   className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:border-[#BA7517]" />

      <div>
        <label className="text-[10px] text-gray-500 uppercase tracking-wider">Sales Role</label>
        <select
          value={form.salesRole}
          onChange={(e) => setForm({ ...form, salesRole: e.target.value as ContactSalesRole | "" })}
          className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:border-[#BA7517]"
        >
          {SALES_ROLE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      <input
        value={form.introducedVia}
        onChange={(e) => setForm({ ...form, introducedVia: e.target.value })}
        placeholder='Introduced via (e.g. "TMC 2026", "LinkedIn", "Referral — Acme")'
        maxLength={120}
        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white focus:outline-none focus:border-[#BA7517]"
      />

      <div className="flex flex-wrap gap-3 text-xs pt-1">
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })} /> Primary</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.isBilling} onChange={(e) => setForm({ ...form, isBilling: e.target.checked })} /> Billing</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.receivesTrackingLink} onChange={(e) => setForm({ ...form, receivesTrackingLink: e.target.checked })} /> Tracking link</label>
        <label className="flex items-center gap-1 text-red-600"><input type="checkbox" checked={form.doNotContact} onChange={(e) => setForm({ ...form, doNotContact: e.target.checked })} /> Do not contact</label>
      </div>

      <button
        disabled={!form.name || save.isPending}
        onClick={() => save.mutate()}
        className="w-full py-2 bg-[#BA7517] text-white text-sm font-medium rounded hover:bg-[#9a5f12] disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        {save.isPending ? "Saving…" : "Save contact"}
      </button>
    </div>
  );
}
