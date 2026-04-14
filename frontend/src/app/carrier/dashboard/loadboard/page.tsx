"use client";

import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { MapPin, DollarSign, X } from "lucide-react";

interface BoardLoad {
  id: string;
  loadNumber: string | null;
  referenceNumber: string;
  visibility: string;
  originCity: string | null;
  originState: string | null;
  destCity: string | null;
  destState: string | null;
  equipmentType: string;
  weight: number | null;
  commodity: string | null;
  distance: number | null;
  pickupDate: string;
  deliveryDate: string;
  carrierRate: number | null;
  rate: number;
}

export default function LoadboardPage() {
  const [bidFor, setBidFor] = useState<BoardLoad | null>(null);
  const [bidRate, setBidRate] = useState("");
  const [notes, setNotes] = useState("");

  const loadsQuery = useQuery<{ loads: BoardLoad[] }>({
    queryKey: ["carrier-loadboard"],
    queryFn: async () => (await api.get("/loadboard")).data,
    refetchInterval: 30_000,
  });

  const submitBid = useMutation({
    mutationFn: async () => {
      if (!bidFor) return;
      return (await api.post(`/loads/${bidFor.id}/bids`, {
        bidRate: parseFloat(bidRate),
        notes: notes || undefined,
      })).data;
    },
    onSuccess: () => {
      setBidFor(null); setBidRate(""); setNotes("");
      loadsQuery.refetch();
    },
  });

  const loads = loadsQuery.data?.loads ?? [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-white">Load Board</h1>
        <p className="text-sm text-slate-400 mt-1">
          Browse available loads from The Caravan. Submit a bid to book.
        </p>
      </div>

      {loads.length === 0 && !loadsQuery.isLoading && (
        <div className="p-12 text-center text-slate-500 bg-white/5 border border-white/10 rounded-xl">
          No loads available right now.
        </div>
      )}

      <div className="space-y-2">
        {loads.map((l) => (
          <div key={l.id} className="bg-white/5 border border-white/10 rounded-lg p-4 flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-white">{l.loadNumber ?? l.referenceNumber}</span>
                {l.visibility === "reserved" && (
                  <span className="px-1.5 py-0.5 text-[10px] rounded bg-indigo-500/20 text-indigo-300">Reserved</span>
                )}
              </div>
              <div className="mt-1 text-sm text-slate-300 flex items-center gap-1">
                <MapPin className="w-3 h-3 text-gold" />
                {l.originCity}, {l.originState} → {l.destCity}, {l.destState}
                {l.distance && ` · ${Math.round(l.distance).toLocaleString()} mi`}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {l.equipmentType}
                {l.weight && ` · ${l.weight} lbs`}
                {l.commodity && ` · ${l.commodity}`}
                {" · PU "}{new Date(l.pickupDate).toLocaleDateString()}
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-[10px] text-slate-500 uppercase">Posted rate</div>
              <div className="text-lg font-semibold text-gold">
                ${Number(l.carrierRate ?? l.rate ?? 0).toLocaleString()}
              </div>
              <button
                onClick={() => { setBidFor(l); setBidRate(String(l.carrierRate ?? l.rate ?? "")); }}
                className="mt-1 px-3 py-1 text-xs bg-[#C9A84C] text-[#0F1117] font-semibold rounded hover:bg-[#C9A84C]/90"
              >
                Bid
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Bid modal */}
      {bidFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
          <div className="bg-[#161921] border border-white/10 rounded-xl p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">Submit bid</h2>
              <button onClick={() => setBidFor(null)} className="p-1 hover:bg-white/10 rounded">
                <X className="w-4 h-4 text-slate-400" />
              </button>
            </div>

            <div className="text-sm text-slate-300 mb-4">
              Load {bidFor.loadNumber ?? bidFor.referenceNumber}
              <div className="text-xs text-slate-500 mt-0.5">
                {bidFor.originCity}, {bidFor.originState} → {bidFor.destCity}, {bidFor.destState}
              </div>
            </div>

            <label className="block text-xs text-slate-400 mb-1">Your bid rate ($)</label>
            <div className="relative">
              <DollarSign className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
              <input
                type="number"
                value={bidRate}
                onChange={(e) => setBidRate(e.target.value)}
                className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded text-white"
              />
            </div>

            <label className="block text-xs text-slate-400 mb-1 mt-3">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-white text-sm"
            />

            <div className="mt-4 flex gap-2">
              <button
                onClick={() => submitBid.mutate()}
                disabled={!bidRate || submitBid.isPending}
                className="flex-1 py-2 bg-[#C9A84C] text-[#0F1117] font-semibold rounded disabled:opacity-40"
              >
                {submitBid.isPending ? "Submitting…" : "Submit bid"}
              </button>
              <button
                onClick={() => setBidFor(null)}
                className="flex-1 py-2 bg-white/5 text-slate-300 rounded border border-white/10"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
