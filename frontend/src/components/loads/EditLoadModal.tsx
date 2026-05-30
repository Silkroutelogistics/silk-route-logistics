"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";

/**
 * v3.8.alu §13.3 Item 3 — EditLoadModal (post-conversion load edit UI).
 *
 * The backend PUT /loads/:id (loadController.updateLoad) has existed with
 * full capability — auth (poster/employee), a status guard blocking
 * COMPLETED/CANCELLED/TONU, a customerId-lock on INVOICED/COMPLETED/
 * POD_RECEIVED, and ~30 editable fields — but had ZERO frontend callers.
 * AEs could only cancel+recreate, hit the API directly, or edit the DB when
 * a customer changed a PO / weight / window / commodity post-conversion.
 *
 * This is a focused FLAT form (not the 4-step CreateLoadModal wizard) over
 * the fields AEs most commonly change after a load is live. The backend is
 * authoritative on what's allowed; the frontend only mirrors the terminal-
 * status gate (the Edit button is hidden for COMPLETED/CANCELLED/TONU) and
 * sends createLoadSchema.partial()-compatible field subset. Margin fields
 * (customer/carrier rate) are gated to margin-roles via canSeeMargin.
 */

interface EditableLoad {
  id: string;
  status: string;
  originCity: string;
  originState: string;
  originZip?: string;
  originCompany?: string | null;
  destCity: string;
  destState: string;
  destZip?: string;
  destCompany?: string | null;
  weight: number | null;
  pieces?: number;
  equipmentType: string;
  commodity: string | null;
  freightClass?: string;
  customerRate?: number;
  carrierRate?: number;
  pickupDate: string;
  deliveryDate?: string;
  pickupTimeStart?: string;
  pickupTimeEnd?: string;
  deliveryTimeStart?: string;
  deliveryTimeEnd?: string;
  specialInstructions?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  load: EditableLoad;
  canSeeMargin: boolean;
}

const EQUIPMENT = ["Dry Van", "Reefer", "Flatbed", "Step Deck", "Power Only", "Hotshot", "Box Truck", "Other"];

// YYYY-MM-DD for <input type="date"> from an ISO string (or "").
function dateInput(iso?: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return d.toISOString().slice(0, 10);
}

export function EditLoadModal({ open, onClose, load, canSeeMargin }: Props) {
  const queryClient = useQueryClient();
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState(() => ({
    originCity: load.originCity ?? "",
    originState: load.originState ?? "",
    originZip: load.originZip ?? "",
    originCompany: load.originCompany ?? "",
    destCity: load.destCity ?? "",
    destState: load.destState ?? "",
    destZip: load.destZip ?? "",
    destCompany: load.destCompany ?? "",
    weight: load.weight != null ? String(load.weight) : "",
    pieces: load.pieces != null ? String(load.pieces) : "",
    equipmentType: load.equipmentType ?? "",
    commodity: load.commodity ?? "",
    freightClass: load.freightClass ?? "",
    customerRate: load.customerRate != null ? String(load.customerRate) : "",
    carrierRate: load.carrierRate != null ? String(load.carrierRate) : "",
    pickupDate: dateInput(load.pickupDate),
    deliveryDate: dateInput(load.deliveryDate),
    pickupTimeStart: load.pickupTimeStart ?? "",
    pickupTimeEnd: load.pickupTimeEnd ?? "",
    deliveryTimeStart: load.deliveryTimeStart ?? "",
    deliveryTimeEnd: load.deliveryTimeEnd ?? "",
    specialInstructions: load.specialInstructions ?? "",
  }));

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      // Build a partial payload — only non-empty scalar fields. Numbers
      // coerced; dates sent as ISO; empty strings omitted so we never blank
      // a field the AE didn't touch.
      const p: Record<string, unknown> = {};
      const str = (k: keyof typeof form) => { const v = form[k].trim(); if (v) p[k] = v; };
      const num = (k: keyof typeof form) => { const v = form[k].trim(); if (v) { const n = Number(v); if (!isNaN(n)) p[k] = n; } };
      str("originCity"); str("originState"); str("originZip"); str("originCompany");
      str("destCity"); str("destState"); str("destZip"); str("destCompany");
      num("weight"); num("pieces"); str("equipmentType"); str("commodity"); str("freightClass");
      if (canSeeMargin) { num("customerRate"); num("carrierRate"); }
      if (form.pickupDate) p.pickupDate = new Date(form.pickupDate).toISOString();
      if (form.deliveryDate) p.deliveryDate = new Date(form.deliveryDate).toISOString();
      str("pickupTimeStart"); str("pickupTimeEnd"); str("deliveryTimeStart"); str("deliveryTimeEnd");
      // specialInstructions: allow clearing → send even when empty.
      p.specialInstructions = form.specialInstructions;
      return (await api.put(`/loads/${load.id}`, p)).data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["load", load.id] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      onClose();
    },
    onError: (e: any) => {
      setErr(e?.response?.data?.error ?? e?.message ?? "Failed to save changes");
    },
  });

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-[55] flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-900">Edit Load</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="px-6 py-4 space-y-5">
          {err && (
            <div className="bg-[#F6E3E3] border border-[#9B2C2C]/40 text-[#9B2C2C] text-sm rounded-md px-3 py-2">{err}</div>
          )}

          <Section title="Route">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Origin company"><Inp value={form.originCompany} onChange={(v) => set("originCompany", v)} /></Field>
              <Field label="Dest company"><Inp value={form.destCompany} onChange={(v) => set("destCompany", v)} /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Origin city"><Inp value={form.originCity} onChange={(v) => set("originCity", v)} /></Field>
              <Field label="State"><Inp value={form.originState} onChange={(v) => set("originState", v)} /></Field>
              <Field label="Zip"><Inp value={form.originZip} onChange={(v) => set("originZip", v)} /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Dest city"><Inp value={form.destCity} onChange={(v) => set("destCity", v)} /></Field>
              <Field label="State"><Inp value={form.destState} onChange={(v) => set("destState", v)} /></Field>
              <Field label="Zip"><Inp value={form.destZip} onChange={(v) => set("destZip", v)} /></Field>
            </div>
          </Section>

          <Section title="Schedule">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Pickup date"><Inp type="date" value={form.pickupDate} onChange={(v) => set("pickupDate", v)} /></Field>
              <Field label="PU window start"><Inp type="time" value={form.pickupTimeStart} onChange={(v) => set("pickupTimeStart", v)} /></Field>
              <Field label="PU window end"><Inp type="time" value={form.pickupTimeEnd} onChange={(v) => set("pickupTimeEnd", v)} /></Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Delivery date"><Inp type="date" value={form.deliveryDate} onChange={(v) => set("deliveryDate", v)} /></Field>
              <Field label="DEL window start"><Inp type="time" value={form.deliveryTimeStart} onChange={(v) => set("deliveryTimeStart", v)} /></Field>
              <Field label="DEL window end"><Inp type="time" value={form.deliveryTimeEnd} onChange={(v) => set("deliveryTimeEnd", v)} /></Field>
            </div>
          </Section>

          <Section title="Freight">
            <div className="grid grid-cols-3 gap-3">
              <Field label="Weight (lbs)"><Inp type="number" value={form.weight} onChange={(v) => set("weight", v)} /></Field>
              <Field label="Pieces"><Inp type="number" value={form.pieces} onChange={(v) => set("pieces", v)} /></Field>
              <Field label="Freight class"><Inp value={form.freightClass} onChange={(v) => set("freightClass", v)} /></Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Equipment">
                <select value={form.equipmentType} onChange={(e) => set("equipmentType", e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#BA7517]/30 focus:border-[#BA7517]">
                  <option value="">Select…</option>
                  {EQUIPMENT.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </Field>
              <Field label="Commodity"><Inp value={form.commodity} onChange={(v) => set("commodity", v)} /></Field>
            </div>
          </Section>

          {canSeeMargin && (
            <Section title="Financials">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Customer rate ($)"><Inp type="number" value={form.customerRate} onChange={(v) => set("customerRate", v)} /></Field>
                <Field label="Carrier rate ($)"><Inp type="number" value={form.carrierRate} onChange={(v) => set("carrierRate", v)} /></Field>
              </div>
            </Section>
          )}

          <Section title="Special instructions">
            <textarea
              value={form.specialInstructions}
              onChange={(e) => set("specialInstructions", e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#BA7517]/30 focus:border-[#BA7517]"
            />
          </Section>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 text-sm font-medium rounded-md text-gray-700 border border-gray-300 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={() => { setErr(null); save.mutate(); }}
            disabled={save.isPending}
            className="px-4 py-2 text-sm font-medium rounded-md text-white bg-[#BA7517] hover:bg-[#8f5a11] disabled:opacity-50"
          >
            {save.isPending ? "Saving…" : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-[#BA7517]">{title}</div>
      {children}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Inp({ value, onChange, type = "text" }: { value: string; onChange: (v: string) => void; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#BA7517]/30 focus:border-[#BA7517]"
    />
  );
}
