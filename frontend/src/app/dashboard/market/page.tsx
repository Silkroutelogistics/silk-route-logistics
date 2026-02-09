"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ArrowUp, ArrowDown, Minus, TrendingUp, Truck, Users, Clock,
  BarChart3, Activity, Zap, CircleDot, Fuel, Signal, Database,
} from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";

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

interface TrendPoint { period: string; avgRate: number; avgRatePerMile: number; loadCount: number; }

interface Intelligence {
  region: string; truckToLoadRatio: number; capacityIndex: string; rateTrend: string;
  spotRate: { low: number; avg: number; high: number };
  contractRate: { low: number; avg: number; high: number };
  dieselPrice: number; weekOverWeekChange: number;
}

interface RateIndex {
  equipmentType: string; spotRate: number; contractRate: number;
  fuelSurcharge: number; weekChange: number;
}

interface Integration {
  provider: string; name: string; status: string; lastSyncAt: string | null;
  rateDataAvailable: boolean; features: string[];
}

type Tab = "lanes" | "intelligence" | "integrations";

const CAPACITY_COLORS: Record<string, string> = {
  TIGHT: "text-red-400 bg-red-500/20",
  BALANCED: "text-yellow-400 bg-yellow-500/20",
  LOOSE: "text-green-400 bg-green-500/20",
};

const STATUS_COLORS: Record<string, string> = {
  ACTIVE: "bg-green-500/20 text-green-400",
  INACTIVE: "bg-slate-500/20 text-slate-400",
  PENDING: "bg-yellow-500/20 text-yellow-400",
  ERROR: "bg-red-500/20 text-red-400",
};

export default function MarketTrendsPage() {
  const [tab, setTab] = useState<Tab>("lanes");
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
    enabled: tab === "lanes",
  });

  const trendParams = selectedLane
    ? `originState=${selectedLane.origin.split(", ")[1]}&destState=${selectedLane.dest.split(", ")[1]}&granularity=${granularity}`
    : `region=${region}&granularity=${granularity}`;

  const { data: trends } = useQuery({
    queryKey: ["market-trends", region, selectedLane, granularity],
    queryFn: () => api.get<TrendPoint[]>(`/market/trends?${trendParams}`).then((r) => r.data),
    enabled: tab === "lanes",
  });

  const { data: intelligence } = useQuery({
    queryKey: ["market-intel", region || "GREAT_LAKES"],
    queryFn: () => api.get<Intelligence>(`/market/intelligence?region=${region || "GREAT_LAKES"}`).then((r) => r.data),
    enabled: tab === "intelligence",
  });

  const { data: rateIndex } = useQuery({
    queryKey: ["rate-index"],
    queryFn: () => api.get<RateIndex[]>("/market/rate-index").then((r) => r.data),
    enabled: tab === "intelligence",
  });

  const { data: integrations } = useQuery({
    queryKey: ["market-integrations"],
    queryFn: () => api.get<Integration[]>("/market/integrations").then((r) => r.data),
    enabled: tab === "integrations",
  });

  const currentRegion = regions?.find((r) => r.region === region);
  const displayRegions = region ? (currentRegion ? [currentRegion] : []) : regions || [];
  const totalLoads = displayRegions.reduce((s, r) => s + r.loadCount, 0);
  const avgRPM = displayRegions.length ? displayRegions.reduce((s, r) => s + r.avgRatePerMile, 0) / displayRegions.length : 0;
  const totalCarriers = displayRegions.reduce((s, r) => s + r.availableCarriers, 0);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Market Intelligence</h1>
          <p className="text-slate-400 text-sm mt-1">Lane analytics, rate benchmarks, and capacity insights</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1.5 px-2 py-1 bg-green-500/10 rounded text-xs text-green-400">
            <CircleDot className="w-3 h-3" /> Live Data
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 w-fit">
        {([
          { key: "lanes" as Tab, label: "Lane Analytics", icon: <BarChart3 className="w-3.5 h-3.5" /> },
          { key: "intelligence" as Tab, label: "Market Intel", icon: <Activity className="w-3.5 h-3.5" /> },
          { key: "integrations" as Tab, label: "Data Sources", icon: <Database className="w-3.5 h-3.5" /> },
        ]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition ${tab === t.key ? "bg-gold text-navy" : "text-slate-400 hover:text-white"}`}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Region Selector (shared across tabs) */}
      <div className="flex flex-wrap gap-2">
        {REGIONS.map((r) => (
          <button key={r.key} onClick={() => { setRegion(r.key); setSelectedLane(null); setPage(1); }}
            className={`px-4 py-2 rounded-full text-sm font-medium transition ${region === r.key ? "bg-gold text-navy" : "bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white"}`}>
            {r.label}
          </button>
        ))}
      </div>

      {/* ═══ LANES TAB ═══ */}
      {tab === "lanes" && (
        <>
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
              <h2 className="text-lg font-semibold text-white">Top Lanes by Volume</h2>
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
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
                    formatter={(v: number | undefined) => v !== undefined ? [`$${v}`, ""] : []} />
                  <Line type="monotone" dataKey="avgRate" name="Avg Rate ($)" stroke="#D4A843" strokeWidth={2} dot={{ fill: "#D4A843" }} />
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[300px] flex items-center justify-center text-slate-500">No trend data available</div>
            )}
          </div>
        </>
      )}

      {/* ═══ INTELLIGENCE TAB ═══ */}
      {tab === "intelligence" && (
        <>
          {intelligence && (
            <>
              {/* Market Conditions */}
              <div className="grid sm:grid-cols-4 gap-4">
                <div className="bg-white/5 rounded-xl border border-white/10 p-5">
                  <p className="text-xs text-slate-500 mb-1">Truck-to-Load Ratio</p>
                  <p className="text-2xl font-bold text-white">{intelligence.truckToLoadRatio.toFixed(1)}</p>
                  <p className="text-xs text-slate-400 mt-1">trucks per load</p>
                </div>
                <div className="bg-white/5 rounded-xl border border-white/10 p-5">
                  <p className="text-xs text-slate-500 mb-1">Capacity</p>
                  <span className={`px-2 py-1 rounded text-sm font-medium ${CAPACITY_COLORS[intelligence.capacityIndex] || ""}`}>
                    {intelligence.capacityIndex}
                  </span>
                </div>
                <div className="bg-white/5 rounded-xl border border-white/10 p-5">
                  <div className="flex items-center gap-2">
                    <Fuel className="w-4 h-4 text-amber-400" />
                    <p className="text-xs text-slate-500">Diesel Price</p>
                  </div>
                  <p className="text-2xl font-bold text-white mt-1">${intelligence.dieselPrice.toFixed(2)}</p>
                  <p className="text-xs text-slate-400">per gallon (avg)</p>
                </div>
                <div className="bg-white/5 rounded-xl border border-white/10 p-5">
                  <p className="text-xs text-slate-500 mb-1">Week/Week Change</p>
                  <div className="flex items-center gap-1">
                    {intelligence.weekOverWeekChange > 0 ? <ArrowUp className="w-4 h-4 text-green-400" /> : intelligence.weekOverWeekChange < 0 ? <ArrowDown className="w-4 h-4 text-red-400" /> : <Minus className="w-4 h-4 text-slate-500" />}
                    <span className={`text-2xl font-bold ${intelligence.weekOverWeekChange > 0 ? "text-green-400" : intelligence.weekOverWeekChange < 0 ? "text-red-400" : "text-white"}`}>
                      {Math.abs(intelligence.weekOverWeekChange).toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>

              {/* Spot vs Contract Rates */}
              <div className="grid sm:grid-cols-2 gap-4">
                <RateRangeCard title="Spot Market Rates" subtitle="$/mile, Dry Van equivalent" data={intelligence.spotRate} color="text-amber-400" />
                <RateRangeCard title="Contract Rates" subtitle="$/mile, Dry Van equivalent" data={intelligence.contractRate} color="text-blue-400" />
              </div>
            </>
          )}

          {/* National Rate Index */}
          {rateIndex && rateIndex.length > 0 && (
            <div className="bg-white/5 rounded-xl border border-white/10">
              <div className="px-6 py-4 border-b border-white/10">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <Signal className="w-5 h-5 text-gold" /> National Rate Index
                </h2>
                <p className="text-xs text-slate-500 mt-1">Composite rates across all regions (simulated until API keys configured)</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-white/10">
                      <th className="text-left px-6 py-3 font-medium">Equipment Type</th>
                      <th className="text-right px-4 py-3 font-medium">Spot $/Mile</th>
                      <th className="text-right px-4 py-3 font-medium">Contract $/Mile</th>
                      <th className="text-right px-4 py-3 font-medium">Fuel Surcharge</th>
                      <th className="text-center px-4 py-3 font-medium">Week Change</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rateIndex.map((r) => (
                      <tr key={r.equipmentType} className="border-b border-white/5">
                        <td className="px-6 py-3 text-white font-medium">{r.equipmentType}</td>
                        <td className="text-right px-4 py-3 text-amber-400 font-mono">${r.spotRate.toFixed(2)}</td>
                        <td className="text-right px-4 py-3 text-blue-400 font-mono">${r.contractRate.toFixed(2)}</td>
                        <td className="text-right px-4 py-3 text-slate-300 font-mono">${r.fuelSurcharge.toFixed(2)}</td>
                        <td className="px-4 py-3 text-center">
                          <span className={`inline-flex items-center gap-1 text-xs font-medium ${r.weekChange > 0 ? "text-green-400" : r.weekChange < 0 ? "text-red-400" : "text-slate-400"}`}>
                            {r.weekChange > 0 ? <ArrowUp className="w-3 h-3" /> : r.weekChange < 0 ? <ArrowDown className="w-3 h-3" /> : <Minus className="w-3 h-3" />}
                            {Math.abs(r.weekChange).toFixed(1)}%
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Rate Index Chart */}
          {rateIndex && rateIndex.length > 0 && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-6">
              <h3 className="font-semibold text-white mb-4">Spot vs Contract by Equipment</h3>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={rateIndex}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                  <XAxis dataKey="equipmentType" stroke="#94a3b8" tick={{ fontSize: 10 }} />
                  <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
                    formatter={(v: number | undefined) => v !== undefined ? [`$${v.toFixed(2)}`, ""] : []} />
                  <Bar dataKey="spotRate" name="Spot" fill="#D4A843" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="contractRate" name="Contract" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </>
      )}

      {/* ═══ INTEGRATIONS TAB ═══ */}
      {tab === "integrations" && (
        <>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {integrations?.map((integ) => (
              <div key={integ.provider} className="bg-white/5 rounded-xl border border-white/10 p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-gold/10 flex items-center justify-center">
                      {integ.rateDataAvailable ? <BarChart3 className="w-4 h-4 text-gold" /> : <Zap className="w-4 h-4 text-gold" />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">{integ.name}</p>
                      <p className="text-xs text-slate-500">{integ.provider}</p>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[integ.status] || ""}`}>
                    {integ.status}
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {integ.features.map((f) => (
                    <span key={f} className="px-2 py-0.5 bg-white/5 rounded text-xs text-slate-400">{f}</span>
                  ))}
                </div>
                {integ.lastSyncAt && (
                  <p className="text-xs text-slate-500">Last sync: {new Date(integ.lastSyncAt).toLocaleString()}</p>
                )}
                {integ.status === "INACTIVE" && (
                  <p className="text-xs text-amber-400">Configure API key to enable live data</p>
                )}
              </div>
            ))}
          </div>

          <div className="bg-gold/5 border border-gold/20 rounded-xl p-5">
            <h3 className="font-semibold text-gold text-sm mb-2">Data Integration Architecture</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              SRL&apos;s market intelligence engine is ready to connect to DAT RateView, Truckstop.com, and other load boards.
              When API keys are configured, the system will pull live spot rates, contract benchmarks, load-to-truck ratios,
              and capacity data. Until then, the platform uses simulated market data based on industry averages and regional patterns.
              ELD integrations (Motive, Samsara, Omnitracs) will provide real-time GPS, HOS, and compliance data when connected.
            </p>
          </div>
        </>
      )}
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

function RateRangeCard({ title, subtitle, data, color }: {
  title: string; subtitle: string; data: { low: number; avg: number; high: number }; color: string;
}) {
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-5">
      <h3 className="font-semibold text-white text-sm">{title}</h3>
      <p className="text-xs text-slate-500 mb-4">{subtitle}</p>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <p className="text-xs text-slate-500">Low</p>
          <p className="text-lg font-bold text-slate-400">${data.low.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Average</p>
          <p className={`text-lg font-bold ${color}`}>${data.avg.toFixed(2)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">High</p>
          <p className="text-lg font-bold text-slate-400">${data.high.toFixed(2)}</p>
        </div>
      </div>
      {/* Visual range bar */}
      <div className="mt-3 relative h-2 bg-white/5 rounded-full">
        <div className="absolute h-full bg-gradient-to-r from-slate-600 via-gold/50 to-slate-600 rounded-full"
          style={{ left: "10%", right: "10%" }} />
        <div className="absolute top-1/2 -translate-y-1/2 w-3 h-3 bg-gold rounded-full border-2 border-navy"
          style={{ left: "50%" }} />
      </div>
    </div>
  );
}
