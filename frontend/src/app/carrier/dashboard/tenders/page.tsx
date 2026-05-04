"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Clock, MapPin, AlertTriangle, CheckCircle2 } from "lucide-react";

const DECLINE_REASONS = [
  "No capacity / all trucks committed",
  "Rate too low",
  "Lane doesn't work for us",
  "Equipment not available",
  "Dates don't work",
  "Already committed to another load",
  "Other",
];

interface ActiveTender {
  positionId: string;
  position: number;
  offeredRate: number;
  tenderExpiresAt: string;
  waterfallId: string;
  load: {
    id: string;
    loadNumber: string | null;
    referenceNumber: string;
    originCity: string | null;
    originState: string | null;
    destCity: string | null;
    destState: string | null;
    equipmentType: string;
    pickupDate: string;
    deliveryDate: string;
    distance: number | null;
    weight: number | null;
    commodity: string | null;
  };
}

// Countdown widget shared with the AE drawer
function Countdown({ expiresAt }: { expiresAt: string }) {
  const [remaining, setRemaining] = useState(() =>
    Math.max(0, new Date(expiresAt).getTime() - Date.now())
  );
  useEffect(() => {
    const id = setInterval(() => {
      setRemaining(Math.max(0, new Date(expiresAt).getTime() - Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, [expiresAt]);
  const m = Math.floor(remaining / 60000);
  const s = Math.floor((remaining % 60000) / 1000);
  const cls = m < 5 ? "text-red-400" : m < 10 ? "text-amber-400" : "text-gold";
  return (
    <span className={`font-mono font-semibold tabular-nums text-2xl ${cls}`}>
      {remaining === 0 ? "Expired" : `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`}
    </span>
  );
}

export default function CarrierTendersPage() {
  const [declining, setDeclining] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  // Carrier portal poll — the spec is static export so SSE isn't
  // available. 10s polling is acceptable given the 20-min window.
  const activeTendersQuery = useQuery<{ tenders: ActiveTender[] }>({
    queryKey: ["carrier-tenders"],
    queryFn: async () => (await api.get("/carrier-tenders/active")).data,
    refetchInterval: 10_000,
  });

  const accept = useMutation({
    mutationFn: async (positionId: string) =>
      (await api.post(`/waterfalls/tenders/${positionId}/accept`)).data,
    onSuccess: () => activeTendersQuery.refetch(),
  });

  const decline = useMutation({
    mutationFn: async ({ positionId, reason }: { positionId: string; reason: string }) =>
      (await api.post(`/waterfalls/tenders/${positionId}/decline`, { reason })).data,
    onSuccess: () => {
      setDeclining(null);
      setReason("");
      activeTendersQuery.refetch();
    },
  });

  const tenders = activeTendersQuery.data?.tenders ?? [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-semibold text-[#0A2540]">Active tenders</h1>
        <p className="text-sm text-slate-700 mt-1">
          Respond within 20 minutes or the tender will expire and cascade to the next carrier.
        </p>
      </div>

      {tenders.length === 0 && !activeTendersQuery.isLoading && (
        <div className="p-12 text-center text-slate-500 bg-white/5 border border-white/10 rounded-xl">
          No active tenders right now.
        </div>
      )}

      {tenders.map((t) => {
        const isDeclining = declining === t.positionId;
        return (
          <div key={t.positionId} className="bg-white/5 border border-white/10 rounded-xl p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl font-semibold text-[#0A2540]">
                    Load {t.load.loadNumber ?? t.load.referenceNumber}
                  </h2>
                  <span className="px-2 py-0.5 text-xs rounded bg-[#FAEEDA] text-[#854F0B] font-medium">
                    Position #{t.position}
                  </span>
                </div>
                <div className="mt-2 text-sm text-slate-500 flex items-center gap-1">
                  <MapPin className="w-4 h-4 text-gold" />
                  {t.load.originCity}, {t.load.originState} → {t.load.destCity}, {t.load.destState}
                  {t.load.distance && ` · ${Math.round(t.load.distance).toLocaleString()} mi`}
                </div>
                <div className="mt-1 text-xs text-slate-700">
                  {t.load.equipmentType} · {t.load.weight ? `${t.load.weight} lbs` : ""}
                  {t.load.commodity && ` · ${t.load.commodity}`}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[10px] text-slate-500 uppercase">Rate</div>
                <div className="text-2xl font-semibold text-gold">
                  ${Number(t.offeredRate).toLocaleString()}
                </div>
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
              <div>
                <div className="text-slate-500 uppercase text-[10px]">Pickup</div>
                <div className="text-slate-700">{new Date(t.load.pickupDate).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-slate-500 uppercase text-[10px]">Delivery</div>
                <div className="text-slate-700">{new Date(t.load.deliveryDate).toLocaleDateString()}</div>
              </div>
              <div>
                <div className="text-slate-500 uppercase text-[10px]">Time left</div>
                <Countdown expiresAt={t.tenderExpiresAt} />
              </div>
            </div>

            {!isDeclining && (
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => accept.mutate(t.positionId)}
                  disabled={accept.isPending}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-green-600 hover:bg-green-700 text-white font-semibold rounded disabled:opacity-40"
                >
                  <CheckCircle2 className="w-4 h-4" /> Accept
                </button>
                <button
                  onClick={() => setDeclining(t.positionId)}
                  className="flex-1 flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 text-slate-200 font-semibold rounded border border-white/10"
                >
                  <AlertTriangle className="w-4 h-4" /> Decline
                </button>
              </div>
            )}

            {isDeclining && (
              <div className="mt-5 space-y-2">
                <label className="block text-xs text-slate-700">Decline reason (required)</label>
                <select
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded text-sm text-white"
                >
                  <option value="">Select a reason…</option>
                  {DECLINE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={() => decline.mutate({ positionId: t.positionId, reason })}
                    disabled={!reason || decline.isPending}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded disabled:opacity-40"
                  >
                    {decline.isPending ? "Declining…" : "Confirm decline"}
                  </button>
                  <button
                    onClick={() => { setDeclining(null); setReason(""); }}
                    className="flex-1 py-2 bg-white/5 text-slate-300 text-sm font-medium rounded border border-white/10"
                  >
                    Back
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      <div className="text-[11px] text-slate-500 text-center pt-2">
        <Clock className="w-3 h-3 inline mr-1" />
        Tenders refresh every 10 seconds.
      </div>
    </div>
  );
}
