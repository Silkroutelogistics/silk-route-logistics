"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AlertTriangle, Plus, X } from "lucide-react";

interface Props {
  load: any;
  loadId: string;
  onChange: () => void;
}

interface Taxonomy {
  groups: { group: string; reasons: { code: string; label: string; unitType: string }[] }[];
}

export function ExceptionsTab({ load, loadId, onChange }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [unit, setUnit] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [receiptRequested, setReceiptRequested] = useState(false);

  const taxonomy = useQuery<Taxonomy>({
    queryKey: ["exc-taxonomy"],
    queryFn: async () => (await api.get("/load-exceptions/taxonomy")).data,
    staleTime: Infinity,
  });

  const create = useMutation({
    mutationFn: async () =>
      (await api.post(`/load-exceptions/load/${loadId}`, {
        category, unitType: unit || undefined, description, receiptRequested,
      })).data,
    onSuccess: () => {
      setShowForm(false);
      setCategory(""); setDescription(""); setUnit(""); setReceiptRequested(false);
      onChange();
    },
  });

  const patch = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: string }) =>
      (await api.patch(`/load-exceptions/${id}`, { action })).data,
    onSuccess: onChange,
  });

  const exceptions = load.loadExceptions ?? [];
  const active = exceptions.filter((e: any) => e.status === "OPEN");
  const resolved = exceptions.filter((e: any) => e.status === "RESOLVED");

  const filteredReasons = taxonomy.data?.groups.flatMap((g) =>
    g.reasons
      .filter((r) => !unit || r.unitType === unit || r.unitType === "na")
      .map((r) => ({ ...r, group: g.group }))
  ) ?? [];

  return (
    <div className="space-y-4 text-sm">
      <div className="grid grid-cols-2 gap-3">
        <Card tone="red"  label="Active"   value={active.length} />
        <Card tone="gray" label="Resolved" value={resolved.length} />
      </div>

      {!showForm && (
        <button
          onClick={() => setShowForm(true)}
          className="w-full flex items-center justify-center gap-2 py-2 border-2 border-dashed border-gray-300 text-gray-500 hover:text-[#BA7517] hover:border-[#BA7517] rounded-lg transition"
        >
          <Plus className="w-4 h-4" /> Log new exception
        </button>
      )}

      {showForm && (
        <div className="border border-gray-200 rounded-lg p-4 bg-gray-50 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">New exception</h4>
            <button onClick={() => setShowForm(false)}><X className="w-4 h-4 text-gray-400" /></button>
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Truck or trailer?</label>
            <select
              value={unit} onChange={(e) => { setUnit(e.target.value); setCategory(""); }}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded bg-white"
            >
              <option value="">Not applicable</option>
              <option value="truck">Truck (power unit)</option>
              <option value="trailer">Trailer</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] text-gray-500 mb-1">Reason</label>
            <select
              value={category} onChange={(e) => setCategory(e.target.value)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded bg-white"
            >
              <option value="">Select reason…</option>
              {taxonomy.data?.groups.map((g) => {
                const reasons = g.reasons.filter((r) => !unit || r.unitType === unit || r.unitType === "na");
                if (reasons.length === 0) return null;
                return (
                  <optgroup key={g.group} label={g.group}>
                    {reasons.map((r) => <option key={r.code} value={r.code}>{r.label}</option>)}
                  </optgroup>
                );
              })}
            </select>
          </div>

          <textarea
            value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Notes" rows={3}
            className="w-full px-3 py-2 text-sm border border-gray-200 rounded bg-white"
          />

          <label className="flex items-center gap-2 text-xs text-gray-600">
            <input type="checkbox" checked={receiptRequested} onChange={(e) => setReceiptRequested(e.target.checked)} />
            Attach mechanical/repair receipt (request from carrier)
          </label>

          <button
            onClick={() => create.mutate()}
            disabled={!category || create.isPending}
            className="w-full py-2 bg-[#BA7517] hover:bg-[#8f5a11] disabled:opacity-40 text-white text-sm font-medium rounded"
          >
            {create.isPending ? "Saving…" : "Log exception"}
          </button>
        </div>
      )}

      {active.map((e: any) => (
        <div key={e.id} className="border border-red-200 bg-red-50/40 rounded-lg p-4 space-y-2">
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-red-500" />
                <span className="font-medium text-gray-900">
                  {e.unitType && e.unitType !== "na" ? `${e.unitType.charAt(0).toUpperCase()}${e.unitType.slice(1)} — ` : ""}
                  {filteredReasons.find((r) => r.code === e.category)?.label ?? e.category}
                </span>
              </div>
              <div className="text-xs text-gray-500 mt-0.5">
                Reported {new Date(e.reportedAt).toLocaleString()}
                {e.locationText && ` · ${e.locationText}`}
              </div>
            </div>
            <span className="px-2 py-0.5 text-[10px] bg-red-500 text-white rounded">OPEN</span>
          </div>
          {e.description && <p className="text-sm text-gray-700">{e.description}</p>}
          {e.repairShopName && (
            <div className="text-xs text-gray-600 border-t border-red-100 pt-2">
              <div>Shop: {e.repairShopName} {e.repairShopPhone && `· ${e.repairShopPhone}`}</div>
              {e.repairEta && <div>ETA to fix: {new Date(e.repairEta).toLocaleString()}</div>}
              {e.repairCost && <div>Cost: ${e.repairCost} ({e.repairCostResponsibility})</div>}
              <div>Receipt: {e.receiptStatus}</div>
            </div>
          )}
          <div className="flex gap-2 pt-1">
            <button
              onClick={() => patch.mutate({ id: e.id, action: "resolve" })}
              className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-white"
            >
              Mark resolved
            </button>
            {!e.shipperNotified && (
              <button
                onClick={() => patch.mutate({ id: e.id, action: "notify_shipper" })}
                className="px-3 py-1 text-xs border border-gray-300 rounded hover:bg-white"
              >
                Notify shipper
              </button>
            )}
          </div>
        </div>
      ))}

      {resolved.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-gray-500 hover:text-gray-800">Resolved ({resolved.length})</summary>
          <ul className="mt-2 space-y-1">
            {resolved.map((e: any) => (
              <li key={e.id} className="text-gray-600">
                {filteredReasons.find((r) => r.code === e.category)?.label ?? e.category} — {new Date(e.resolvedAt).toLocaleDateString()}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function Card({ tone, label, value }: { tone: "red" | "gray"; label: string; value: number }) {
  const cls = tone === "red" ? "border-red-200 bg-red-50 text-red-700" : "border-gray-200 bg-gray-50 text-gray-700";
  return (
    <div className={`border rounded-lg p-3 ${cls}`}>
      <div className="text-[11px] uppercase">{label}</div>
      <div className="text-2xl font-semibold">{value}</div>
    </div>
  );
}
