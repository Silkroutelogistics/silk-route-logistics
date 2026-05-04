"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Map, DollarSign, Package, TrendingUp, ArrowRight, Hash,
  Truck, BarChart3,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

// US State abbreviation → rough center coords for simple dot map
const STATE_POSITIONS: Record<string, [number, number]> = {
  AL: [32.8, -86.8], AK: [64, -153], AZ: [34.3, -111.7], AR: [34.8, -92.2], CA: [37.2, -119.5],
  CO: [39, -105.5], CT: [41.6, -72.7], DE: [39, -75.5], FL: [28.6, -82.4], GA: [32.7, -83.5],
  HI: [20.5, -157], ID: [44.4, -114.6], IL: [40, -89.2], IN: [39.8, -86.2], IA: [42, -93.5],
  KS: [38.5, -98.3], KY: [37.8, -85.7], LA: [31, -92], ME: [45.4, -69.2], MD: [39.3, -76.6],
  MA: [42.2, -71.8], MI: [44.3, -84.5], MN: [46.3, -94.3], MS: [32.7, -89.7], MO: [38.4, -92.5],
  MT: [47, -109.6], NE: [41.5, -99.8], NV: [39.5, -116.9], NH: [43.7, -71.6], NJ: [40.2, -74.7],
  NM: [34.5, -106], NY: [42.9, -75.5], NC: [35.6, -79.8], ND: [47.4, -100.5], OH: [40.4, -82.8],
  OK: [35.6, -97.5], OR: [44, -120.5], PA: [40.9, -77.8], RI: [41.7, -71.5], SC: [34, -81],
  SD: [44.4, -100.2], TN: [35.9, -86.4], TX: [31.5, -99.3], UT: [39.3, -111.7], VT: [44, -72.7],
  VA: [37.5, -78.9], WA: [47.4, -120.5], WV: [38.6, -80.6], WI: [44.5, -89.8], WY: [43, -107.6],
};

const PERIOD_OPTIONS = [
  { label: "90 Days", value: 90 },
  { label: "180 Days", value: 180 },
  { label: "1 Year", value: 365 },
];

export default function GeoSpendPage() {
  const [days, setDays] = useState(180);
  const [mapType, setMapType] = useState<"origin" | "dest">("origin");

  const { data, isLoading } = useQuery({
    queryKey: ["geo-spend", days],
    queryFn: () => api.get("/analytics/geo-spend", { params: { days } }).then((r) => r.data),
  });

  const summary = data?.summary;
  const stateData = mapType === "origin" ? (data?.byOriginState || []) : (data?.byDestState || []);
  const topLanes = data?.topLanes || [];

  // Normalize for bubble sizing
  const maxSpend = Math.max(...stateData.map((s: any) => s.spend), 1);

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <Map className="w-5 h-5 text-[#C5A572]" /> Geographic Spend Analysis
          </h1>
          <p className="text-sm text-gray-400 mt-1">Spending breakdown by state with cost-per-unit metrics</p>
        </div>
        <div className="flex items-center gap-2">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition",
                days === p.value ? "bg-[#C5A572] text-[#0F1117]" : "bg-white/5 text-gray-400 hover:bg-white/10"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[
            { label: "Total Spend", value: `$${summary.totalSpend?.toLocaleString()}`, icon: DollarSign },
            { label: "Spend per Load", value: `$${summary.spendPerLoad?.toLocaleString()}`, icon: Package },
            { label: "Spend per Pound", value: summary.spendPerPound ? `$${summary.spendPerPound}` : "—", icon: BarChart3 },
            { label: "Spend per Mile", value: summary.spendPerMile ? `$${summary.spendPerMile}` : "—", icon: Truck },
            { label: "Total Loads", value: summary.totalLoads?.toLocaleString(), icon: Hash },
          ].map((s) => (
            <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                <s.icon className="w-3.5 h-3.5" /> {s.label}
              </div>
              <p className="text-2xl font-bold text-white">{s.value}</p>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-6 mb-6">
        {/* State Spend Map (simplified bubble map) */}
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-medium text-white">Spend by {mapType === "origin" ? "Pickup" : "Dropoff"} State</h3>
            <div className="flex items-center bg-white/5 rounded-lg p-0.5">
              {(["origin", "dest"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setMapType(t)}
                  className={cn(
                    "px-3 py-1 rounded-md text-xs font-medium transition",
                    mapType === t ? "bg-[#C5A572] text-[#0F1117]" : "text-gray-400 hover:text-white"
                  )}
                >
                  {t === "origin" ? "Pickup" : "Dropoff"}
                </button>
              ))}
            </div>
          </div>

          {/* State grid as a heatmap alternative */}
          <div className="grid grid-cols-10 gap-1.5">
            {stateData.sort((a: any, b: any) => b.spend - a.spend).map((s: any) => {
              const intensity = Math.max(0.1, s.spend / maxSpend);
              return (
                <div
                  key={s.state}
                  className="relative group"
                  title={`${s.state}: $${s.spend.toLocaleString()} (${s.count} loads)`}
                >
                  <div
                    className="w-full aspect-square rounded-md flex items-center justify-center text-[9px] font-bold transition-transform hover:scale-110 cursor-default"
                    style={{ backgroundColor: `rgba(201, 168, 76, ${intensity})`, color: intensity > 0.5 ? "#0F1117" : "#C9A84C" }}
                  >
                    {s.state}
                  </div>
                  {/* Tooltip */}
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-10">
                    <div className="bg-[#1a1f35] border border-white/10 rounded-lg px-3 py-2 text-xs whitespace-nowrap shadow-xl">
                      <p className="text-white font-medium">{s.state}</p>
                      <p className="text-gray-400">${s.spend.toLocaleString()} · {s.count} loads</p>
                      <p className="text-gray-500">Avg: ${s.avgRate.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Legend */}
          <div className="flex items-center justify-between mt-4">
            <span className="text-[10px] text-gray-500">Low Spend</span>
            <div className="flex-1 mx-3 h-2 rounded-full" style={{ background: "linear-gradient(to right, rgba(201,168,76,0.1), rgba(201,168,76,1))" }} />
            <span className="text-[10px] text-gray-500">High Spend</span>
          </div>
        </div>

        {/* State Ranking Table */}
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5">
          <h3 className="text-sm font-medium text-white mb-4">State Ranking</h3>
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {stateData.sort((a: any, b: any) => b.spend - a.spend).slice(0, 20).map((s: any, i: number) => (
              <div key={s.state} className="flex items-center gap-3 py-2 px-3 rounded-lg hover:bg-white/[0.02] transition">
                <span className="text-[10px] text-slate-400 w-4">{i + 1}</span>
                <span className="text-sm text-white font-medium w-8">{s.state}</span>
                <div className="flex-1">
                  <div className="h-1.5 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full bg-[#C5A572]/60 rounded-full" style={{ width: `${(s.spend / maxSpend) * 100}%` }} />
                  </div>
                </div>
                <span className="text-xs text-gray-500 w-12 text-right">{s.count}</span>
                <span className="text-sm text-white w-24 text-right">${s.spend.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Top Lanes */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl">
        <div className="px-5 py-4 border-b border-white/5">
          <h3 className="text-sm font-medium text-white">Top Lanes by Spending</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-white/5">
                {["Lane", "Loads", "Total Spend", "Carrier Cost", "Avg Rate", "Avg Distance", "Spend/Mile"].map((h) => (
                  <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-gray-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {topLanes.map((l: any) => (
                <tr key={`${l.origin}-${l.dest}`} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                  <td className="px-4 py-3 text-white">
                    <span className="flex items-center gap-1.5">{l.origin} <ArrowRight className="w-3 h-3 text-slate-400" /> {l.dest}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-400">{l.count}</td>
                  <td className="px-4 py-3 text-white font-medium">${l.spend.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-400">${l.carrierCost.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-400">${l.avgRate.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-400">{l.avgDistance} mi</td>
                  <td className="px-4 py-3 text-gray-400">{l.spendPerMile ? `$${l.spendPerMile}` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
