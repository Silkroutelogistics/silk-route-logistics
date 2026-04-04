"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  BarChart3, TrendingUp, TrendingDown, MapPin, X, ArrowUp, ArrowDown,
  Minus, Activity, DollarSign, Layers,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from "recharts";

/* ── Types ───────────────────────────────────────────────── */

interface LaneSummary {
  originState: string;
  destState: string;
  volume: number;
  revenue: number;
  avgRate: number;
  marginPercent: number;
  trend: "UP" | "DOWN" | "FLAT";
}

interface LaneDetail {
  rateHistory: { date: string; rate: number }[];
  topCarriers: { name: string; loads: number; onTime: number }[];
  topShippers: { name: string; loads: number; revenue: number }[];
  seasonalPattern: { month: string; volume: number }[];
}

interface MarginByEquipment {
  equipmentType: string;
  avgMargin: number;
  volume: number;
}

interface MarginByCustomer {
  customerName: string;
  avgMargin: number;
  revenue: number;
  loads: number;
}

interface HeatmapCell {
  originState: string;
  destState: string;
  volume: number;
}

type Tab = "lanes" | "margins" | "heatmap";

/* ── Page ────────────────────────────────────────────────── */

export default function LaneAnalyticsPage() {
  const [tab, setTab] = useState<Tab>("lanes");
  const [period, setPeriod] = useState("90D");
  const [selectedLane, setSelectedLane] = useState<{ origin: string; dest: string } | null>(null);

  const { data: laneData, isLoading } = useQuery({
    queryKey: ["lane-analytics", period],
    queryFn: () => api.get<{
      lanes: LaneSummary[];
      stats: { totalLanes: number; avgMargin: number; topLaneVolume: number; revenuePerMileAvg: number };
    }>(`/analytics/lanes?period=${period}`).then((r) => r.data),
  });

  const { data: marginData } = useQuery({
    queryKey: ["lane-margins", period],
    queryFn: () => api.get<{
      byEquipment: MarginByEquipment[];
      byCustomer: MarginByCustomer[];
    }>(`/analytics/margins?period=${period}`).then((r) => r.data),
    enabled: tab === "margins",
  });

  const { data: heatmapData } = useQuery({
    queryKey: ["lane-heatmap", period],
    queryFn: () => api.get<{ cells: HeatmapCell[]; originStates: string[]; destStates: string[] }>(`/analytics/lane-heatmap?period=${period}`).then((r) => r.data),
    enabled: tab === "heatmap",
  });

  const { data: laneDetail } = useQuery({
    queryKey: ["lane-detail", selectedLane?.origin, selectedLane?.dest],
    queryFn: () => api.get<LaneDetail>(`/analytics/lanes/${selectedLane!.origin}/${selectedLane!.dest}`).then((r) => r.data),
    enabled: !!selectedLane,
  });

  const stats = laneData?.stats;
  const tabs: Array<{ key: Tab; label: string }> = [
    { key: "lanes", label: "Top Lanes" },
    { key: "margins", label: "Margin Analysis" },
    { key: "heatmap", label: "Heatmap" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <MapPin className="w-7 h-7 text-gold" />
            Lane Intelligence
          </h1>
          <p className="text-slate-400 text-sm mt-1">Deep analytics on lane performance, margins, and volume patterns</p>
        </div>
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {["30D", "90D", "YTD"].map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={cn("px-3 py-1.5 rounded text-xs font-medium transition", period === p ? "bg-gold text-navy" : "text-slate-400 hover:text-white")}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid sm:grid-cols-4 gap-4">
        <KpiCard icon={Layers} label="Total Lanes Active" value={stats?.totalLanes ?? 0} color="blue" />
        <KpiCard icon={TrendingUp} label="Avg Margin %" value={`${(stats?.avgMargin ?? 0).toFixed(1)}%`} color="green" />
        <KpiCard icon={BarChart3} label="Top Lane Volume" value={stats?.topLaneVolume ?? 0} color="gold" />
        <KpiCard icon={DollarSign} label="Revenue/Mile Avg" value={`$${(stats?.revenuePerMileAvg ?? 0).toFixed(2)}`} color="purple" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={cn("px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition",
              tab === t.key ? "bg-gold/20 text-gold border border-gold/30" : "text-slate-400 hover:text-white hover:bg-white/5")}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {isLoading ? <LoadingSpinner /> : (
        <>
          {tab === "lanes" && <TopLanesTab lanes={laneData?.lanes ?? []} onSelect={(o, d) => setSelectedLane({ origin: o, dest: d })} />}
          {tab === "margins" && <MarginsTab data={marginData} />}
          {tab === "heatmap" && <HeatmapTab data={heatmapData} />}
        </>
      )}

      {/* Lane Detail Slide-out */}
      {selectedLane && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={() => setSelectedLane(null)} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-[#1a1a2e] border-l border-white/10 z-50 overflow-y-auto">
            <div className="p-6 space-y-6">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">
                  {selectedLane.origin} → {selectedLane.dest}
                </h2>
                <button onClick={() => setSelectedLane(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>

              {laneDetail ? (
                <>
                  {/* Rate History */}
                  {laneDetail.rateHistory?.length > 0 && (
                    <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                      <h3 className="text-sm font-semibold text-white mb-3">Rate History</h3>
                      <ResponsiveContainer width="100%" height={200}>
                        <LineChart data={laneDetail.rateHistory}>
                          <XAxis dataKey="date" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                          <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `$${v}`} />
                          <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
                            formatter={(v: number | undefined) => v != null ? `$${v.toFixed(2)}` : ""} />
                          <Line type="monotone" dataKey="rate" stroke="#D4A843" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}

                  {/* Top Carriers */}
                  {laneDetail.topCarriers?.length > 0 && (
                    <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                      <h3 className="text-sm font-semibold text-white mb-3">Top Carriers</h3>
                      <div className="space-y-2">
                        {laneDetail.topCarriers.map((c, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-white">{c.name}</span>
                            <div className="flex gap-4">
                              <span className="text-slate-400">{c.loads} loads</span>
                              <span className="text-green-400">{c.onTime}% OT</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top Shippers */}
                  {laneDetail.topShippers?.length > 0 && (
                    <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                      <h3 className="text-sm font-semibold text-white mb-3">Top Shippers</h3>
                      <div className="space-y-2">
                        {laneDetail.topShippers.map((s, i) => (
                          <div key={i} className="flex items-center justify-between text-xs">
                            <span className="text-white">{s.name}</span>
                            <div className="flex gap-4">
                              <span className="text-slate-400">{s.loads} loads</span>
                              <span className="text-gold">${s.revenue.toLocaleString()}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Seasonal Pattern */}
                  {laneDetail.seasonalPattern?.length > 0 && (
                    <div className="bg-white/5 rounded-xl border border-white/10 p-4">
                      <h3 className="text-sm font-semibold text-white mb-3">Seasonal Pattern</h3>
                      <ResponsiveContainer width="100%" height={150}>
                        <BarChart data={laneDetail.seasonalPattern}>
                          <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                          <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} />
                          <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }} />
                          <Bar dataKey="volume" fill="#D4A843" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </>
              ) : (
                <LoadingSpinner />
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Tab Components ──────────────────────────────────────── */

function TopLanesTab({ lanes, onSelect }: { lanes: LaneSummary[]; onSelect: (o: string, d: string) => void }) {
  const TrendIcon = ({ trend }: { trend: string }) =>
    trend === "UP" ? <ArrowUp className="w-3.5 h-3.5 text-green-400" />
    : trend === "DOWN" ? <ArrowDown className="w-3.5 h-3.5 text-red-400" />
    : <Minus className="w-3.5 h-3.5 text-slate-400" />;

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-slate-400 border-b border-white/10">
            <th className="text-left px-4 py-3 font-medium">Lane</th>
            <th className="text-right px-4 py-3 font-medium">Volume</th>
            <th className="text-right px-4 py-3 font-medium">Revenue</th>
            <th className="text-right px-4 py-3 font-medium">Avg Rate</th>
            <th className="text-right px-4 py-3 font-medium">Margin %</th>
            <th className="text-center px-4 py-3 font-medium">Trend</th>
          </tr>
        </thead>
        <tbody>
          {lanes.map((lane, i) => (
            <tr key={i} className="border-b border-white/5 hover:bg-white/[0.02] cursor-pointer transition"
              onClick={() => onSelect(lane.originState, lane.destState)}>
              <td className="px-4 py-3 text-white font-mono text-xs">{lane.originState} → {lane.destState}</td>
              <td className="px-4 py-3 text-right text-slate-300 text-xs">{lane.volume}</td>
              <td className="px-4 py-3 text-right text-white text-xs">${lane.revenue.toLocaleString()}</td>
              <td className="px-4 py-3 text-right text-white text-xs">${lane.avgRate.toFixed(2)}</td>
              <td className={cn("px-4 py-3 text-right text-xs font-bold",
                lane.marginPercent < 10 ? "text-red-400" : lane.marginPercent < 20 ? "text-yellow-400" : "text-green-400")}>
                {lane.marginPercent.toFixed(1)}%
              </td>
              <td className="px-4 py-3 text-center"><TrendIcon trend={lane.trend} /></td>
            </tr>
          ))}
          {lanes.length === 0 && (
            <tr><td colSpan={6} className="px-6 py-12 text-center text-slate-500">No lane data available</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function MarginsTab({ data }: { data: { byEquipment: MarginByEquipment[]; byCustomer: MarginByCustomer[] } | undefined }) {
  if (!data) return <LoadingSpinner />;

  return (
    <div className="space-y-6">
      {/* Bar Chart: Margin by Equipment */}
      {data.byEquipment?.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-6">
          <h3 className="text-sm font-semibold text-white mb-4">Margin by Equipment Type</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.byEquipment}>
              <XAxis dataKey="equipmentType" stroke="#94a3b8" tick={{ fontSize: 10 }}
                tickFormatter={(v: string) => v.replace(/_/g, " ")} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 10 }} tickFormatter={(v: number) => `${v}%`} />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
                formatter={(v: number | undefined) => v != null ? `${v.toFixed(1)}%` : ""} />
              <Bar dataKey="avgMargin" fill="#D4A843" radius={[4, 4, 0, 0]} name="Avg Margin %" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Customer Margin Table */}
      {data.byCustomer?.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <div className="px-6 py-4 border-b border-white/10">
            <h3 className="text-sm font-semibold text-white">Margin by Customer</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-right px-4 py-3 font-medium">Avg Margin</th>
                <th className="text-right px-4 py-3 font-medium">Revenue</th>
                <th className="text-right px-4 py-3 font-medium">Loads</th>
              </tr>
            </thead>
            <tbody>
              {data.byCustomer.map((c, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="px-4 py-3 text-white text-xs">{c.customerName}</td>
                  <td className={cn("px-4 py-3 text-right text-xs font-bold",
                    c.avgMargin < 10 ? "text-red-400" : c.avgMargin < 20 ? "text-yellow-400" : "text-green-400")}>
                    {c.avgMargin.toFixed(1)}%
                  </td>
                  <td className="px-4 py-3 text-right text-white text-xs">${c.revenue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-slate-300 text-xs">{c.loads}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function HeatmapTab({ data }: { data: { cells: HeatmapCell[]; originStates: string[]; destStates: string[] } | undefined }) {
  if (!data) return <LoadingSpinner />;
  if (!data.originStates?.length || !data.destStates?.length) {
    return <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center text-slate-500">No heatmap data available</div>;
  }

  const cellMap = new Map<string, number>();
  let maxVol = 0;
  data.cells.forEach((c) => {
    cellMap.set(`${c.originState}-${c.destState}`, c.volume);
    if (c.volume > maxVol) maxVol = c.volume;
  });

  function cellColor(vol: number): string {
    if (vol === 0) return "bg-white/5";
    const intensity = maxVol > 0 ? vol / maxVol : 0;
    if (intensity > 0.75) return "bg-gold/60";
    if (intensity > 0.5) return "bg-gold/40";
    if (intensity > 0.25) return "bg-gold/20";
    return "bg-gold/10";
  }

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-6 overflow-x-auto">
      <h3 className="text-sm font-semibold text-white mb-4">State-to-State Volume Heatmap</h3>
      <table className="text-xs">
        <thead>
          <tr>
            <th className="px-2 py-1 text-slate-500">Origin \ Dest</th>
            {data.destStates.map((d) => (
              <th key={d} className="px-2 py-1 text-slate-400 text-center">{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.originStates.map((o) => (
            <tr key={o}>
              <td className="px-2 py-1 text-slate-400 font-medium">{o}</td>
              {data.destStates.map((d) => {
                const vol = cellMap.get(`${o}-${d}`) ?? 0;
                return (
                  <td key={d} className={cn("px-2 py-1 text-center rounded", cellColor(vol))} title={`${o}→${d}: ${vol}`}>
                    <span className="text-white/80">{vol || ""}</span>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Shared Components ───────────────────────────────────── */

function KpiCard({ icon: Icon, label, value, color }: { icon: typeof BarChart3; label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    gold: "text-gold bg-gold/10", green: "text-green-400 bg-green-500/10",
    blue: "text-blue-400 bg-blue-500/10", purple: "text-purple-400 bg-purple-500/10",
  };
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", colorMap[color] ?? colorMap.gold)}><Icon className="w-5 h-5" /></div>
        <div>
          <p className="text-xs text-slate-400">{label}</p>
          <p className="text-xl font-bold text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
    </div>
  );
}
