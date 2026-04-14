"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Mail, Phone, Plus, X, Zap } from "lucide-react";
import type { CrmContact } from "../types";

interface Props {
  customerId: string;
  onChange: () => void;
}

export function ContactsTab({ customerId, onChange }: Props) {
  const [addOpen, setAddOpen] = useState(false);

  const q = useQuery<{ contacts: CrmContact[] }>({
    queryKey: ["crm-contacts", customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}/contacts`)).data,
  });

  const toggleTracking = useMutation({
    mutationFn: async ({ contactId, value }: { contactId: string; value: boolean }) =>
      (await api.patch(`/customers/${customerId}/contacts/${contactId}/tracking-link`, {
        receivesTrackingLink: value,
      })).data,
    onSuccess: () => { q.refetch(); onChange(); },
  });

  const del = useMutation({
    mutationFn: async (contactId: string) =>
      (await api.delete(`/customers/${customerId}/contacts/${contactId}`)).data,
    onSuccess: () => { q.refetch(); onChange(); },
  });

  const contacts = q.data?.contacts ?? [];

  return (
    <div className="space-y-3 text-sm">
      {contacts.length === 0 && !q.isLoading && (
        <div className="text-center py-6 text-gray-400">No contacts yet.</div>
      )}

      {contacts.map((c) => (
        <div key={c.id} className="border border-gray-200 rounded-lg p-3 bg-white">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-3 min-w-0">
              <div className="w-9 h-9 rounded-full bg-gray-100 text-gray-600 flex items-center justify-center text-xs font-semibold">
                {c.name.split(/\s+/).slice(0, 2).map((w) => w[0]).join("")}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className="font-medium text-gray-900 truncate">{c.name}</span>
                  {c.isPrimary && <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-100 text-blue-700">Primary</span>}
                  {c.isBilling && <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 text-gray-600">Billing</span>}
                  {c.receivesTrackingLink && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-[#FAEEDA] text-[#854F0B]">
                      <Zap className="w-2.5 h-2.5" /> Tracking
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
                onClick={() => del.mutate(c.id)}
                className="text-[10px] text-red-500 hover:underline"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      ))}

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
          onSaved={() => { setAddOpen(false); q.refetch(); onChange(); }}
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
    name: "", title: "", email: "", phone: "",
    isPrimary: false, isBilling: false, receivesTrackingLink: false,
  });

  const save = useMutation({
    mutationFn: async () =>
      (await api.post(`/customers/${customerId}/contacts`, form)).data,
    onSuccess: onSaved,
  });

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">New contact</h4>
        <button onClick={onClose}><X className="w-4 h-4 text-gray-400" /></button>
      </div>
      <input value={form.name}  onChange={(e) => setForm({ ...form, name: e.target.value })}  placeholder="Name *"  className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white" />
      <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Title"   className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white" />
      <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="Email"   className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white" />
      <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Phone"   className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white" />
      <div className="flex flex-wrap gap-3 text-xs">
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })} /> Primary</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.isBilling} onChange={(e) => setForm({ ...form, isBilling: e.target.checked })} /> Billing</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={form.receivesTrackingLink} onChange={(e) => setForm({ ...form, receivesTrackingLink: e.target.checked })} /> Tracking link</label>
      </div>
      <button
        disabled={!form.name || save.isPending}
        onClick={() => save.mutate()}
        className="w-full py-2 bg-[#BA7517] text-white text-sm font-medium rounded disabled:opacity-40"
      >
        {save.isPending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
