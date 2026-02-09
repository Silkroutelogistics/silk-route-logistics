"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ArrowUp, ArrowDown, Minus, TrendingUp, Truck, Users, Clock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const REGIONS = [
  { key: "", label: "All Regions" },
  { key: "GREAT_LAKES", label: "Great Lakes" },
  { key: "UPPER_MIDWEST", label: "Upper Midwest" },
  { key: "SOUTHEAST", label: "Southeast" },
  { key: "SOUTH_CENTRAL", label: "South Central" },
  { key: "NORTHEAST", label: "Northeast" },
  { key: "WEST", label: "West" },
];

interface Lane {
  origin: string; dest: string; avgRate: number; avgRatePerMile: number;
  loadCount: number; avgTransitDays: number; topEquipment: string; trend: string;
}

interface RegionStat {
  region: string; states: string[]; loadCount: number; avgRate: number;
  avgRatePerMile: number; availableCarriers: number;
}

interface TrendPoint {
  period: string; avgRate: number; avgRatePerMile: number; loadCount: number;
}

export default function MarketTrendsPage() {
  const [region, setRegion] = useState("");
  const [selectedLane, setSelectedLane] = useState<{ origin: string; dest: string } | null>(null);
  const [granularity, setGranularity] = useState<"weekly" | "monthly">("weekly");
  const [page, setPage] = useState(1);

  const { data: regions } = useQuery({
    queryKey: ["market-regions"],
    queryFn: () => api.get<RegionStat[]>("/market/regions").then((r) => r.data),
  });

  const { data: lanesData } = useQuery({
    queryKey: ["market-lanes", region, page],
    queryFn: () => api.get<{ lanes: Lane[]; total: number; totalPages: number }>(`/market/lanes?region=${region}&page=${page}&limit=20`).then((r) => r.data),
  });

  const trendParams = selectedLane
    ? `originState=${selectedLane.origin.split(", ")[1]}&destState=${selectedLane.dest.split(", ")[1]}&granularity=${granularity}`
    : `region=${region}&granularity=${granularity}`;

  const { data: trends } = useQuery({
    queryKey: ["market-trends", region, selectedLane, granularity],
    queryFn: () => api.get<TrendPoint[]>(`/market/trends?${trendParams}`).then((r) => r.data),
  });

  const currentRegion = regions?.find((r) => r.region === region);
  const displayRegions = region ? (currentRegion ? [currentRegion] : []) : regions || [];
  const totalLoads = displayRegions.reduce((s, r) => s + r.loadCount, 0);
  const avgRPM = displayRegions.length ? displayRegions.reduce((s, r) => s + r.avgRatePerMile, 0) / displayRegions.length : 0;
  const totalCarriers = displayRegions.reduce((s, r) => s + r.availableCarriers, 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Market Trends</h1>
        <p className="text-slate-400 text-sm mt-1">Live lane data, regional analytics, and rate trends</p>
      </div>

      {/* Region Selector */}
      <div className="flex flex-wrap gap-2">
        {REGIONS.map((r) => (
          <button key={r.key} onClick={() => { setRegion(r.key); setSelectedLane(null); setPage(1); }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${region === r.key ? "bg-gold text-navy" : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"}`}>
            {r.label}
          </button>
        ))}
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <StatCard icon={<Truck className="w-5 h-5" />} label="Active Loads" value={totalLoads} />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Avg Rate/Mile" value={`$${avgRPM.toFixed(2)}`} />
        <StatCard icon={<Users className="w-5 h-5" />} label="Available Carriers" value={totalCarriers} />
        <StatCard icon={<Clock className="w-5 h-5" />} label="Avg Transit" value={`${(lanesData?.lanes?.length ? lanesData.lanes.reduce((s, l) => s + l.avgTransitDays, 0) / lanesData.lanes.length : 0).toFixed(1)} days`} />
      </div>

      {/* Top Lanes Table */}
      <div className="bg-white/5 rounded-xl border border-white/10">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-white">Top Lanes</h2>
          {selectedLane && (
            <button onClick={() => setSelectedLane(null)} className="text-xs text-gold hover:underline">Clear lane filter</button>
          )}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-left px-6 py-3 font-medium">Lane</th>
                <th className="text-right px-4 py-3 font-medium">Volume</th>
                <th className="text-right px-4 py-3 font-medium">Avg Rate</th>
                <th className="text-right px-4 py-3 font-medium">$/Mile</th>
                <th className="text-left px-4 py-3 font-medium">Top Equipment</th>
                <th className="text-center px-4 py-3 font-medium">Trend</th>
              </tr>
            </thead>
            <tbody>
              {lanesData?.lanes?.map((lane, i) => (
                <tr key={i} onClick={() => setSelectedLane({ origin: lane.origin, dest: lane.dest })}
                  className={`border-b border-white/5 cursor-pointer transition ${selectedLane?.origin === lane.origin && selectedLane?.dest === lane.dest ? "bg-gold/10" : "hover:bg-white/5"}`}>
                  <td className="px-6 py-3 text-white font-medium">{lane.origin} → {lane.dest}</td>
                  <td className="text-right px-4 py-3 text-slate-300">{lane.loadCount}</td>
                  <td className="text-right px-4 py-3 text-slate-300">${lane.avgRate.toLocaleString()}</td>
                  <td className="text-right px-4 py-3 text-slate-300">${lane.avgRatePerMile}</td>
                  <td className="px-4 py-3 text-slate-300">{lane.topEquipment}</td>
                  <td className="px-4 py-3 text-center">
                    {lane.trend === "up" && <ArrowUp className="w-4 h-4 text-green-400 inline" />}
                    {lane.trend === "down" && <ArrowDown className="w-4 h-4 text-red-400 inline" />}
                    {lane.trend === "stable" && <Minus className="w-4 h-4 text-slate-500 inline" />}
                  </td>
                </tr>
              ))}
              {(!lanesData?.lanes || lanesData.lanes.length === 0) && (
                <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No lane data available for this region</td></tr>
              )}
            </tbody>
          </table>
        </div>
        {lanesData && lanesData.totalPages > 1 && (
          <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs text-slate-500">{lanesData.total} lanes total</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-xs bg-white/5 rounded text-slate-400 disabled:opacity-30">Prev</button>
              <span className="text-xs text-slate-400 py-1">Page {page} of {lanesData.totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(lanesData.totalPages, p + 1))} disabled={page === lanesData.totalPages} className="px-3 py-1 text-xs bg-white/5 rounded text-slate-400 disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Rate Trend Chart */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white">
            Rate Trends {selectedLane ? `— ${selectedLane.origin} → ${selectedLane.dest}` : region ? `— ${REGIONS.find((r) => r.key === region)?.label}` : "— All Regions"}
          </h2>
          <div className="flex gap-2">
            <button onClick={() => setGranularity("weekly")} className={`px-3 py-1 text-xs rounded ${granularity === "weekly" ? "bg-gold text-navy" : "bg-white/5 text-slate-400"}`}>Weekly</button>
            <button onClick={() => setGranularity("monthly")} className={`px-3 py-1 text-xs rounded ${granularity === "monthly" ? "bg-gold text-navy" : "bg-white/5 text-slate-400"}`}>Monthly</button>
          </div>
        </div>
        {trends && trends.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
              <XAxis dataKey="period" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }} />
              <Line type="monotone" dataKey="avgRate" name="Avg Rate ($)" stroke="#D4A843" strokeWidth={2} dot={{ fill: "#D4A843" }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="h-[300px] flex items-center justify-center text-slate-500">No trend data available</div>
        )}
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="text-gold">{icon}</div>
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <p className="text-2xl font-bold text-white">{value}</p>
    </div>
  );
}
