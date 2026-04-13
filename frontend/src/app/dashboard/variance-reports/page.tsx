"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp, TrendingDown, DollarSign, BarChart3, ArrowRight,
  Search, Filter, AlertTriangle, CheckCircle2, XCircle, Hash,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const PERIOD_OPTIONS = [
  { label: "30 Days", value: 30 },
  { label: "60 Days", value: 60 },
  { label: "90 Days", value: 90 },
  { label: "180 Days", value: 180 },
  { label: "1 Year", value: 365 },
];

export default function VarianceReportsPage() {
  const [days, setDays] = useState(90);
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["variance-report", days],
    queryFn: () => api.get("/analytics/variance", { params: { days } }).then((r) => r.data),
  });

  const summary = data?.summary;
  const byLane = data?.byLane || [];
  const loads = (data?.loads || []).filter((l: any) =>
    !search || l.loadNumber?.toLowerCase().includes(search.toLowerCase()) ||
    l.originState?.toLowerCase().includes(search.toLowerCase()) ||
    l.destState?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-[#0a0e1a] p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#C9A84C]" /> Variance Reports
          </h1>
          <p className="text-sm text-gray-400 mt-1">Quoted vs actual cost analysis — detect margin leaks</p>
        </div>
        <div className="flex items-center gap-2">
          {PERIOD_OPTIONS.map((p) => (
            <button
              key={p.value}
              onClick={() => setDays(p.value)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium transition",
                days === p.value ? "bg-[#C9A84C] text-[#0F1117]" : "bg-white/5 text-gray-400 hover:bg-white/10"
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {/* Summary Stats */}
      {summary && (
        <div className="grid grid-cols-5 gap-4 mb-6">
          {[
            { label: "Total Loads", value: summary.totalLoads, icon: Hash, color: "text-white" },
            { label: "Total Variance", value: `$${summary.totalVariance?.toLocaleString()}`, icon: DollarSign, color: summary.totalVariance >= 0 ? "text-green-400" : "text-red-400" },
            { label: "Avg Variance %", value: `${summary.avgVariancePct}%`, icon: BarChart3, color: summary.avgVariancePct >= 0 ? "text-green-400" : "text-red-400" },
            { label: "Positive (Margin)", value: summary.positiveVariance, icon: TrendingUp, color: "text-green-400" },
            { label: "Negative (Leak)", value: summary.negativeVariance, icon: TrendingDown, color: "text-red-400" },
          ].map((s) => (
            <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-xl p-4">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-2">
                <s.icon className="w-3.5 h-3.5" /> {s.label}
              </div>
              <p className={cn("text-2xl font-bold", s.color)}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Top Lanes by Variance */}
      {byLane.length > 0 && (
        <div className="bg-white/[0.03] border border-white/5 rounded-xl p-5 mb-6">
          <h3 className="text-sm font-medium text-white mb-4">Top Lanes by Variance</h3>
          <div className="space-y-2">
            {byLane.slice(0, 10).map((lane: any) => (
              <div key={lane.lane} className="flex items-center gap-4 py-2 px-3 rounded-lg hover:bg-white/[0.02] transition">
                <div className="flex items-center gap-1.5 text-sm text-gray-300 w-32">
                  <span>{lane.lane.split("→")[0]}</span>
                  <ArrowRight className="w-3 h-3 text-gray-600" />
                  <span>{lane.lane.split("→")[1]}</span>
                </div>
                <div className="flex-1">
                  <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={cn("h-full rounded-full", lane.totalVariance >= 0 ? "bg-green-500/40" : "bg-red-500/40")}
                      style={{ width: `${Math.min(100, Math.abs(lane.avgVariancePct) * 5)}%` }}
                    />
                  </div>
                </div>
                <span className="text-xs text-gray-500 w-16 text-right">{lane.count} loads</span>
                <span className={cn("text-sm font-medium w-24 text-right", lane.totalVariance >= 0 ? "text-green-400" : "text-red-400")}>
                  ${Math.round(lane.totalVariance).toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Load-Level Variance */}
      <div className="bg-white/[0.03] border border-white/5 rounded-xl">
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="text-sm font-medium text-white">Load-Level Variance Detail</h3>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500" />
            <input
              value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search loads..."
              className="pl-9 pr-3 py-2 bg-white/[0.03] border border-white/10 rounded-lg text-xs text-white placeholder-gray-500 focus:border-[#C9A84C]/50 focus:outline-none w-48"
            />
          </div>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-500 text-sm">Loading...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  {["Load #", "Lane", "Equipment", "Customer", "Quoted", "Actual", "Variance", "Var %", "Date"].map((h) => (
                    <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-gray-500 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loads.slice(0, 50).map((l: any) => (
                  <tr key={l.id} className="border-b border-white/[0.03] hover:bg-white/[0.02] transition">
                    <td className="px-4 py-3 text-white font-medium">{l.loadNumber || l.referenceNumber?.slice(0, 10)}</td>
                    <td className="px-4 py-3 text-gray-400">
                      <span className="flex items-center gap-1">{l.originState} <ArrowRight className="w-3 h-3 text-gray-600" /> {l.destState}</span>
                    </td>
                    <td className="px-4 py-3 text-gray-400">{l.equipmentType?.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-gray-400 truncate max-w-[120px]">{l.customer?.name || "—"}</td>
                    <td className="px-4 py-3 text-white">${l.quotedRate?.toLocaleString()}</td>
                    <td className="px-4 py-3 text-white">${l.actualCost?.toLocaleString()}</td>
                    <td className={cn("px-4 py-3 font-medium", l.variance >= 0 ? "text-green-400" : "text-red-400")}>
                      {l.variance >= 0 ? "+" : ""}${Math.round(l.variance).toLocaleString()}
                    </td>
                    <td className={cn("px-4 py-3", l.variancePct >= 0 ? "text-green-400" : "text-red-400")}>
                      {l.variancePct >= 0 ? "+" : ""}{Math.round(l.variancePct * 10) / 10}%
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{new Date(l.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
