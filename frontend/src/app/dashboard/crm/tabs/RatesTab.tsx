"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Plus, X } from "lucide-react";

interface ContractRate {
  id: string;
  originState: string;
  destState: string;
  equipmentType: string;
  rate: number;
  flatRate: number | null;
  fuelSurcharge: number;
  effectiveDate: string;
  expirationDate: string;
  status: "ACTIVE" | "EXPIRED" | "DRAFT" | "SUSPENDED";
  volume: number | null;
  notes: string | null;
}

/**
 * Reuses the existing /api/contract-rates endpoint — no new table.
 * ContractRate already covers everything the spec's
 * customer_rate_agreements asked for.
 */
export function RatesTab({ customerId }: { customerId: string }) {
  const [addOpen, setAddOpen] = useState(false);

  const q = useQuery<{ rates: ContractRate[] }>({
    queryKey: ["crm-rates", customerId],
    queryFn: async () =>
      (await api.get("/contract-rates", { params: { customerId } })).data,
  });

  const rates = q.data?.rates ?? [];

  return (
    <div className="space-y-3 text-sm">
      {rates.length === 0 && !q.isLoading && (
        <div className="text-center py-6 text-gray-400">No rate agreements yet.</div>
      )}

      {rates.map((r) => {
        const statusCls =
          r.status === "ACTIVE" ? "bg-green-100 text-green-700"
        : r.status === "EXPIRED" ? "bg-gray-100 text-gray-600"
        : r.status === "DRAFT" ? "bg-amber-100 text-amber-700"
        : "bg-red-100 text-red-700";
        return (
          <div key={r.id} className="border border-gray-200 rounded-lg p-3 bg-white">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-medium text-gray-900">
                  {r.originState} → {r.destState} ({r.equipmentType})
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {r.flatRate ? `$${r.flatRate.toLocaleString()} flat` : `$${r.rate.toFixed(2)}/mi`}
                  {r.fuelSurcharge > 0 && ` · FSC ${r.fuelSurcharge}%`}
                  {r.volume && ` · ${r.volume} loads/mo target`}
                </div>
              </div>
              <span className={`px-2 py-0.5 text-[10px] rounded ${statusCls}`}>{r.status}</span>
            </div>
            <div className="text-[11px] text-gray-500 mt-1">
              {new Date(r.effectiveDate).toLocaleDateString()} → {new Date(r.expirationDate).toLocaleDateString()}
            </div>
            {r.notes && <div className="text-xs text-gray-600 mt-1">{r.notes}</div>}
          </div>
        );
      })}

      {!addOpen ? (
        <button
          onClick={() => setAddOpen(true)}
          className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-300 text-gray-500 hover:text-[#BA7517] hover:border-[#BA7517] rounded-lg transition"
        >
          <Plus className="w-4 h-4" /> Add agreement
        </button>
      ) : (
        <AddRateForm customerId={customerId} onClose={() => setAddOpen(false)} onSaved={() => { setAddOpen(false); q.refetch(); }} />
      )}

      <div className="p-3 text-[11px] text-blue-700 bg-blue-50 border border-blue-100 rounded-lg">
        Rates auto-fill in Order Builder when this customer + lane is selected.
      </div>
    </div>
  );
}

function AddRateForm({
  customerId, onClose, onSaved,
}: { customerId: string; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    originState: "", destState: "", equipmentType: "Dry Van",
    rate: "", flatRate: "", fuelSurcharge: "0",
    effectiveDate: new Date().toISOString().slice(0, 10),
    expirationDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    notes: "",
  });

  const save = useMutation({
    mutationFn: async () =>
      (await api.post("/contract-rates", {
        customerId,
        originState: form.originState.toUpperCase(),
        destState: form.destState.toUpperCase(),
        equipmentType: form.equipmentType,
        rate: parseFloat(form.rate) || 0,
        flatRate: form.flatRate ? parseFloat(form.flatRate) : undefined,
        fuelSurcharge: parseFloat(form.fuelSurcharge) || 0,
        effectiveDate: form.effectiveDate,
        expirationDate: form.expirationDate,
        notes: form.notes || undefined,
        status: "ACTIVE",
      })).data,
    onSuccess: onSaved,
  });

  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="font-medium">New rate agreement</h4>
        <button onClick={onClose}><X className="w-4 h-4 text-gray-700" /></button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <In label="Origin state" value={form.originState} onChange={(v) => setForm({ ...form, originState: v })} />
        <In label="Dest state"   value={form.destState}   onChange={(v) => setForm({ ...form, destState: v })} />
        <In label="Equipment"    value={form.equipmentType} onChange={(v) => setForm({ ...form, equipmentType: v })} />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <In label="Rate/mile" value={form.rate} onChange={(v) => setForm({ ...form, rate: v })} />
        <In label="Flat rate" value={form.flatRate} onChange={(v) => setForm({ ...form, flatRate: v })} />
        <In label="FSC %"     value={form.fuelSurcharge} onChange={(v) => setForm({ ...form, fuelSurcharge: v })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <In label="Effective" type="date" value={form.effectiveDate}  onChange={(v) => setForm({ ...form, effectiveDate: v })} />
        <In label="Expires"   type="date" value={form.expirationDate} onChange={(v) => setForm({ ...form, expirationDate: v })} />
      </div>
      <textarea
        value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })}
        placeholder="Notes" rows={2}
        className="w-full px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
      />
      <button
        disabled={!form.originState || !form.destState || save.isPending}
        onClick={() => save.mutate()}
        className="w-full py-2 bg-[#BA7517] text-white text-sm font-medium rounded disabled:opacity-40"
      >
        {save.isPending ? "Saving…" : "Save agreement"}
      </button>
    </div>
  );
}

function In({ label, value, onChange, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void; type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-0.5 px-2 py-1.5 text-xs border border-gray-200 rounded bg-white"
      />
    </label>
  );
}
