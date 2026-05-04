"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MapPin, Plus, X, Star } from "lucide-react";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";
import type { CrmFacility } from "../types";

interface Props {
  customerId: string;
  onChange: () => void;
}

export function FacilitiesTab({ customerId, onChange }: Props) {
  const [addOpen, setAddOpen] = useState(false);

  const q = useQuery<{ facilities: CrmFacility[] }>({
    queryKey: ["crm-facilities", customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}/facilities`)).data,
  });

  const del = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/customers/${customerId}/facilities/${id}`)).data,
    onSuccess: () => { q.refetch(); onChange(); },
  });

  const facilities = q.data?.facilities ?? [];

  return (
    <div className="space-y-3 text-sm">
      {facilities.length === 0 && !q.isLoading && (
        <div className="text-center py-6 text-gray-400">No facilities yet.</div>
      )}

      {facilities.map((f) => (
        <div key={f.id} className="border border-gray-200 rounded-lg p-3 bg-white">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <MapPin className="w-3.5 h-3.5 text-[#BA7517] shrink-0" />
                <span className="font-medium text-gray-900 truncate">{f.name}</span>
                {f.isPrimary && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] rounded bg-[#FAEEDA] text-[#BA7517]">
                    <Star className="w-2.5 h-2.5" /> Primary {f.facilityType === "pickup" ? "PU" : f.facilityType === "delivery" ? "DEL" : ""}
                  </span>
                )}
                {!f.isPrimary && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-gray-100 text-gray-600 uppercase">{f.facilityType}</span>
                )}
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                {[f.address, f.city && `${f.city}, ${f.state} ${f.zip ?? ""}`].filter(Boolean).join(" · ")}
              </div>
              {f.contactName && (
                <div className="text-[11px] text-gray-500">
                  {f.contactName}{f.contactPhone && ` · ${f.contactPhone}`}
                </div>
              )}
              <div className="text-[11px] text-gray-500 mt-1 flex flex-wrap gap-2">
                <span className="uppercase">{f.loadType}</span>
                {f.estimatedLoadTimeMinutes && <span>· {f.estimatedLoadTimeMinutes}m est</span>}
                {f.appointmentRequired && <span>· Appt required</span>}
                {f.dockInfo && <span>· {f.dockInfo}</span>}
              </div>
              {f.specialInstructions && (
                <div className="text-xs text-gray-700 mt-1 border-l-2 border-gray-200 pl-2">
                  {f.specialInstructions}
                </div>
              )}
            </div>
            <button
              onClick={() => del.mutate(f.id)}
              className="text-[10px] text-red-500 hover:underline shrink-0"
            >
              Remove
            </button>
          </div>
        </div>
      ))}

      {!addOpen ? (
        <button
          onClick={() => setAddOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-300 text-gray-500 hover:text-[#BA7517] hover:border-[#BA7517] rounded-lg transition"
        >
          <Plus className="w-4 h-4" /> Add facility
        </button>
      ) : (
        <AddFacilityForm
          customerId={customerId}
          onClose={() => setAddOpen(false)}
          onSaved={() => { setAddOpen(false); q.refetch(); onChange(); }}
        />
      )}

      <div className="p-3 text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg">
        Facilities auto-populate in Order Builder when this customer is selected. Dock info and instructions flow to the carrier via tender.
      </div>
    </div>
  );
}

function AddFacilityForm({
  customerId, onClose, onSaved,
}: { customerId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: "", address: "", city: "", state: "", zip: "",
    facilityType: "both" as "pickup" | "delivery" | "both",
    isPrimary: false,
    contactName: "", contactPhone: "", contactEmail: "",
    loadType: "live" as "live" | "drop",
    estimatedLoadTimeMinutes: "",
    appointmentRequired: false,
    appointmentInstructions: "",
    dockInfo: "",
    lumperInfo: "",
    specialInstructions: "",
  });

  const save = useMutation({
    mutationFn: async () =>
      (await api.post(`/customers/${customerId}/facilities`, {
        ...form,
        estimatedLoadTimeMinutes: form.estimatedLoadTimeMinutes ? parseInt(form.estimatedLoadTimeMinutes) : undefined,
      })).data,
    onSuccess: onSaved,
  });

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">New facility</h4>
        <button onClick={onClose}><X className="w-4 h-4 text-gray-700" /></button>
      </div>
      <In placeholder="Facility name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
      <AddressAutocomplete
        label="Start typing an address…"
        theme="light"
        value={{ address: form.address, city: form.city, state: form.state, zip: form.zip }}
        onSelect={(parts) =>
          setForm({
            ...form,
            address: parts.address,
            city: parts.city,
            state: parts.state,
            zip: parts.zip,
          })
        }
      />
      <div className="grid grid-cols-3 gap-2">
        <In placeholder="City" value={form.city} onChange={(v) => setForm({ ...form, city: v })} />
        <In placeholder="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} />
        <In placeholder="Zip" value={form.zip} onChange={(v) => setForm({ ...form, zip: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Select value={form.facilityType} onChange={(v) => setForm({ ...form, facilityType: v as any })}>
          <option value="both">Both pickup/delivery</option>
          <option value="pickup">Pickup only</option>
          <option value="delivery">Delivery only</option>
        </Select>
        <Select value={form.loadType} onChange={(v) => setForm({ ...form, loadType: v as any })}>
          <option value="live">Live load</option>
          <option value="drop">Drop / preload</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <In placeholder="Contact name" value={form.contactName} onChange={(v) => setForm({ ...form, contactName: v })} />
        <In placeholder="Contact phone" value={form.contactPhone} onChange={(v) => setForm({ ...form, contactPhone: v })} />
      </div>
      <In placeholder="Est. load time (min)" value={form.estimatedLoadTimeMinutes} onChange={(v) => setForm({ ...form, estimatedLoadTimeMinutes: v })} />
      <In placeholder="Dock info" value={form.dockInfo} onChange={(v) => setForm({ ...form, dockInfo: v })} />
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={form.isPrimary} onChange={(e) => setForm({ ...form, isPrimary: e.target.checked })} /> Mark as primary
      </label>
      <label className="flex items-center gap-2 text-xs text-gray-600">
        <input type="checkbox" checked={form.appointmentRequired} onChange={(e) => setForm({ ...form, appointmentRequired: e.target.checked })} /> Appointment required
      </label>
      {form.appointmentRequired && (
        <textarea
          value={form.appointmentInstructions}
          onChange={(e) => setForm({ ...form, appointmentInstructions: e.target.value })}
          placeholder="Appointment instructions"
          rows={2}
          className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
        />
      )}
      <textarea
        value={form.lumperInfo}
        onChange={(e) => setForm({ ...form, lumperInfo: e.target.value })}
        placeholder="Lumper info (if any)"
        rows={2}
        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
      />
      <textarea
        value={form.specialInstructions}
        onChange={(e) => setForm({ ...form, specialInstructions: e.target.value })}
        placeholder="Special instructions"
        rows={3}
        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
      />
      <button
        disabled={!form.name || save.isPending}
        onClick={() => save.mutate()}
        className="w-full py-2 bg-[#BA7517] text-white text-sm font-medium rounded disabled:opacity-40"
      >
        {save.isPending ? "Saving…" : "Save facility"}
      </button>
    </div>
  );
}

function In({ placeholder, value, onChange }: { placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <input
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
    />
  );
}

function Select({ value, onChange, children }: { value: string; onChange: (v: string) => void; children: React.ReactNode }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-2 py-1.5 text-sm border border-gray-200 rounded bg-white"
    >
      {children}
    </select>
  );
}
