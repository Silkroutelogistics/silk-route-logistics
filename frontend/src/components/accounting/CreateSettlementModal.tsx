"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  onClose: () => void;
}

export function CreateSettlementModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [carrierId, setCarrierId] = useState("");
  const [period, setPeriod] = useState<"WEEKLY" | "BIWEEKLY">("WEEKLY");
  const [periodStart, setPeriodStart] = useState("");
  const [periodEnd, setPeriodEnd] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: () =>
      api.post("/settlements", {
        carrierId,
        period,
        periodStart: new Date(periodStart).toISOString(),
        periodEnd: new Date(periodEnd).toISOString(),
        notes: notes || undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["settlements"] });
      onClose();
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to create settlement";
      setError(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!carrierId.trim()) { setError("Carrier ID is required"); return; }
    if (!periodStart || !periodEnd) { setError("Period start and end dates are required"); return; }
    if (new Date(periodStart) >= new Date(periodEnd)) { setError("Start date must be before end date"); return; }
    create.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-navy rounded-xl border border-white/10 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Create Settlement</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition">
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Carrier ID</label>
            <input value={carrierId} onChange={(e) => setCarrierId(e.target.value)} placeholder="Enter carrier user ID"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-gold/50 focus:border-gold/50 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Period Type</label>
            <div className="flex gap-2">
              {(["WEEKLY", "BIWEEKLY"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setPeriod(p)}
                  className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${period === p ? "bg-gold/20 text-gold border border-gold/30" : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"}`}>
                  {p === "WEEKLY" ? "Weekly" : "Biweekly"}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Period Start</label>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold/50" />
            </div>
            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Period End</label>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold/50" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Notes (optional)</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Settlement notes..."
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-gold/50 focus:border-gold/50 outline-none resize-none" />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-white/10 rounded-lg text-white/70 hover:bg-white/5 transition">
              Cancel
            </button>
            <button type="submit" disabled={create.isPending}
              className="flex-1 px-4 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold-light disabled:opacity-50 transition">
              {create.isPending ? "Creating..." : "Create Settlement"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
