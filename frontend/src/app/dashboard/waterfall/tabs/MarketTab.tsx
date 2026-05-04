"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export function MarketTab({ load }: { load: any }) {
  const q = useQuery<any>({
    queryKey: ["wf-market", load.id],
    queryFn: async () => (await api.get("/market-rates", {
      params: { origin: load.originState, destination: load.destState, equipment: load.equipmentType },
    })).data,
    enabled: !!load.id,
    staleTime: 10 * 60_000,
  });

  const d = q.data;

  return (
    <div className="space-y-4 text-sm">
      {q.isLoading && <div className="text-gray-400">Pulling market intel…</div>}
      {d && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Card label="Spot rate" value={`$${d.spotRate.total.toLocaleString()}`} sub={`$${d.spotRate.perMile}/mi · 30d avg $${d.spotRate.avg30d.toLocaleString()}`} />
            <Card label="Rate range" value={`$${Math.round(d.range.low).toLocaleString()}–$${Math.round(d.range.high).toLocaleString()}`} />
            <Card label="Distance" value={`${d.distance} mi`} />
          </div>
          <div className="border border-gray-200 rounded-lg p-4 bg-white space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">Lane analytics</h3>
            <Row label="Load-to-truck ratio" value={d.loadToTruckRatio.toFixed(1)} />
            <Row label="7-day trend" value={`${d.trend7d > 0 ? "+" : ""}${d.trend7d}%`} tone={d.trend7d > 0 ? "green" : "red"} />
            <Row label="Capacity" value={d.capacity} />
            <Row label="Avg transit" value={`${d.avgTransitDays} days`} />
            <Row label="Carriers 30d" value={d.carriersOnLane30d} />
          </div>
          <div className="text-[10px] text-gray-400 text-right">{d.source}</div>
        </>
      )}
    </div>
  );
}

function Card({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-3 bg-white">
      <div className="text-[11px] uppercase text-gray-500">{label}</div>
      <div className="text-xl font-semibold text-gray-900">{value}</div>
      {sub && <div className="text-[11px] text-gray-500">{sub}</div>}
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string | number; tone?: "green" | "red" }) {
  const cls = tone === "green" ? "text-green-700" : tone === "red" ? "text-red-700" : "text-gray-900";
  return (
    <div className="flex justify-between text-sm">
      <span className="text-slate-400">{label}</span>
      <span className={cls}>{value}</span>
    </div>
  );
}
