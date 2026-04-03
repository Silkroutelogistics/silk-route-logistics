"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  DollarSign, TrendingUp, Zap, Users, Percent, BarChart3,
  Activity, Shield, ArrowUpRight, Target,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from "recharts";

type Period = "MTD" | "QTD" | "YTD";

export default function QuickPayRevenuePage() {
  const [period, setPeriod] = useState<Period>("YTD");

  const { data: revenue, isLoading: revLoading } = useQuery({
    queryKey: ["qp-revenue"],
    queryFn: () => api.get("/accounting/quickpay-revenue").then((r) => r.data),
  });

  const { data: health, isLoading: healthLoading } = useQuery({
    queryKey: ["qp-health"],
    queryFn: () => api.get("/accounting/quickpay-health").then((r) => r.data),
  });

  const isLoading = revLoading || healthLoading;

  // Period-aware fee display
  const displayFees = period === "MTD" ? revenue?.feesThisMonth
    : period === "QTD" ? Math.round((revenue?.feesYTD ?? 0) * 0.33)
    : revenue?.feesYTD;

  const statusColors: Record<string, string> = {
    HEALTHY: "bg-emerald-500",
    WARNING: "bg-amber-500",
    CRITICAL: "bg-red-500",
    PAUSED: "bg-red-700",
  };

  const statusTextColors: Record<string, string> = {
    HEALTHY: "text-emerald-400",
    WARNING: "text-amber-400",
    CRITICAL: "text-red-400",
    PAUSED: "text-red-500",
  };

  const tierColors: Record<string, { bg: string; text: string; border: string }> = {
    BRONZE: { bg: "bg-orange-500/10", text: "text-orange-400", border: "border-orange-500/20" },
    SILVER: { bg: "bg-slate-400/10", text: "text-slate-300", border: "border-slate-400/20" },
    GOLD: { bg: "bg-yellow-500/10", text: "text-yellow-400", border: "border-yellow-500/20" },
  };

  // Circular gauge SVG
  const deployedPct = health?.deployedPercent ?? 0;
  const gaugeRadius = 54;
  const gaugeCircumference = 2 * Math.PI * gaugeRadius;
  const gaugeOffset = gaugeCircumference - (deployedPct / 100) * gaugeCircumference;

  const chartFormatter = (value: number | undefined) => {
    if (value === undefined) return "$0";
    return `$${value.toLocaleString()}`;
  };

  return (
    <div className="p-6 lg:p-8 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white">Quick Pay Revenue</h1>
          <p className="text-sm text-slate-400 mt-1">SRL capital deployment and QP fee income tracking</p>
        </div>
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {(["MTD", "QTD", "YTD"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-semibold transition ${
                period === p
                  ? "bg-[#C8963E] text-white"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              {p}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-6 gap-4 mb-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="bg-white/5 rounded-xl p-5 animate-pulse h-28" />
          ))}
        </div>
      ) : (
        <>
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
            {[
              { label: "Total Fees Earned", value: `$${(revenue?.totalFeesEarned ?? 0).toLocaleString()}`, icon: DollarSign, color: "text-emerald-400" },
              { label: "Fees This Month", value: `$${(revenue?.feesThisMonth ?? 0).toLocaleString()}`, icon: TrendingUp, color: "text-blue-400" },
              { label: "QP Volume", value: `$${(revenue?.totalQPVolume ?? 0).toLocaleString()}`, icon: Zap, color: "text-violet-400" },
              { label: "Carrier Adoption", value: `${revenue?.carrierAdoption ?? 0}%`, icon: Users, color: "text-amber-400" },
              { label: "ROI on Capital", value: `${revenue?.roiOnCapital ?? 0}%`, icon: ArrowUpRight, color: "text-emerald-400" },
              { label: "Avg Fee Rate", value: `${revenue?.avgFeeRate ?? 0}%`, icon: Percent, color: "text-slate-300" },
            ].map((kpi) => (
              <div key={kpi.label} className="bg-white/5 border border-white/5 rounded-xl p-5">
                <div className="flex items-center gap-2 mb-2">
                  <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                  <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold">{kpi.label}</span>
                </div>
                <div className={`text-xl font-bold ${kpi.color}`}>{kpi.value}</div>
              </div>
            ))}
          </div>

          {/* Capital Health + Revenue Chart */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
            {/* Capital Health Widget */}
            <div className="bg-white/5 border border-white/5 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">Capital Health</h3>
                <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                  statusColors[health?.status ?? "HEALTHY"]
                } text-white`}>
                  {health?.status}
                </span>
              </div>

              <div className="flex justify-center mb-4">
                <div className="relative">
                  <svg width="140" height="140" viewBox="0 0 140 140">
                    <circle cx="70" cy="70" r={gaugeRadius} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="10" />
                    <circle
                      cx="70" cy="70" r={gaugeRadius}
                      fill="none"
                      stroke={deployedPct > 80 ? "#ef4444" : deployedPct > 60 ? "#f59e0b" : "#10b981"}
                      strokeWidth="10"
                      strokeDasharray={gaugeCircumference}
                      strokeDashoffset={gaugeOffset}
                      strokeLinecap="round"
                      transform="rotate(-90 70 70)"
                      className="transition-all duration-700"
                    />
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-2xl font-bold text-white">{deployedPct}%</span>
                    <span className="text-[10px] text-slate-500">Deployed</span>
                  </div>
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Capital</span>
                  <span className="font-semibold text-white">${(health?.totalCapital ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Deployed</span>
                  <span className="font-semibold text-amber-400">${(health?.deployed ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Available</span>
                  <span className="font-semibold text-emerald-400">${(health?.available ?? 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Pending Requests</span>
                  <span className="font-semibold text-white">{health?.pendingRequests ?? 0}</span>
                </div>
                {health?.bronzePaused && (
                  <div className="mt-2 px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-400 text-[11px]">
                    Bronze QP paused — capital &gt;80% deployed
                  </div>
                )}
                {health?.allQPPaused && (
                  <div className="mt-2 px-3 py-1.5 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-[11px]">
                    All Quick Pay paused — capital &gt;95% deployed
                  </div>
                )}
              </div>
            </div>

            {/* Revenue Bar Chart */}
            <div className="bg-white/5 border border-white/5 rounded-xl p-6 lg:col-span-2">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white">Monthly QP Fee Revenue</h3>
                <div className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-slate-500" />
                  <span className="text-[11px] text-slate-500">Last 12 months</span>
                </div>
              </div>
              <div className="h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={revenue?.monthlyBreakdown ?? []} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                    <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v: number) => `$${v}`} />
                    <Tooltip
                      contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", fontSize: "12px" }}
                      labelStyle={{ color: "#fff", fontWeight: 600 }}
                      formatter={chartFormatter}
                    />
                    <Bar dataKey="fees" radius={[4, 4, 0, 0]}>
                      {(revenue?.monthlyBreakdown ?? []).map((_: unknown, index: number) => (
                        <Cell key={`cell-${index}`} fill={index === (revenue?.monthlyBreakdown?.length ?? 0) - 1 ? "#C8963E" : "#475569"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Tier Breakdown */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            {(["BRONZE", "SILVER", "GOLD"] as const).map((tier) => {
              const data = revenue?.byTier?.[tier];
              const style = tierColors[tier];
              return (
                <div key={tier} className={`${style.bg} border ${style.border} rounded-xl p-5`}>
                  <div className="flex items-center gap-2 mb-3">
                    <Shield className={`w-4 h-4 ${style.text}`} />
                    <span className={`text-sm font-bold ${style.text}`}>{tier} Tier</span>
                  </div>
                  <div className="space-y-2 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Fees Earned</span>
                      <span className="font-semibold text-white">${(data?.fees ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Volume</span>
                      <span className="font-semibold text-white">${(data?.volume ?? 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">QP Count</span>
                      <span className="font-semibold text-white">{data?.count ?? 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Avg Fee Rate</span>
                      <span className={`font-semibold ${style.text}`}>{data?.avgFee ?? 0}%</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Savings Comparison + Projected Revenue */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Savings Comparison */}
            <div className="bg-white/5 border border-white/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Activity className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-white">Carrier Savings vs Factoring</h3>
              </div>
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-4 mb-4">
                <div className="text-center">
                  <div className="text-[11px] text-emerald-400 font-semibold uppercase tracking-wider mb-1">Total Carrier Savings</div>
                  <div className="text-3xl font-bold text-emerald-400">
                    ${(revenue?.savingsVsFactoring?.carrierSavingsTotal ?? 0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-1">
                    ${revenue?.savingsVsFactoring?.carrierSavingsPerLoad ?? 0} saved per load
                  </div>
                </div>
              </div>
              <div className="space-y-3 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Industry Factoring Rate</span>
                  <span className="font-semibold text-red-400">{revenue?.savingsVsFactoring?.avgFactoringRate ?? 4.5}%</span>
                </div>
                <div className="h-2 bg-red-500/20 rounded-full overflow-hidden">
                  <div className="h-full bg-red-500 rounded-full" style={{ width: `${(revenue?.savingsVsFactoring?.avgFactoringRate ?? 4.5) * 20}%` }} />
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">SRL Quick Pay Rate</span>
                  <span className="font-semibold text-emerald-400">{revenue?.savingsVsFactoring?.avgSrlRate ?? 2.1}%</span>
                </div>
                <div className="h-2 bg-emerald-500/20 rounded-full overflow-hidden">
                  <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${(revenue?.savingsVsFactoring?.avgSrlRate ?? 2.1) * 20}%` }} />
                </div>
              </div>
            </div>

            {/* Projected Annual Revenue */}
            <div className="bg-white/5 border border-white/5 rounded-xl p-6">
              <div className="flex items-center gap-2 mb-4">
                <Target className="w-4 h-4 text-[#C8963E]" />
                <h3 className="text-sm font-bold text-white">Projected Annual Revenue</h3>
              </div>
              <div className="text-center mb-4">
                <div className="text-4xl font-bold text-[#C8963E]">
                  ${(revenue?.projectedAnnual ?? 0).toLocaleString()}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">Annualized from {period} trend</div>
              </div>

              {/* Target bar */}
              <div className="mb-4">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-slate-400">Progress to Year 1 Target</span>
                  <span className="text-white font-semibold">${(revenue?.feesYTD ?? 0).toLocaleString()} / $12,000</span>
                </div>
                <div className="h-3 bg-white/5 rounded-full overflow-hidden relative">
                  <div
                    className="h-full bg-gradient-to-r from-[#C8963E] to-[#e8b84a] rounded-full transition-all duration-700"
                    style={{ width: `${Math.min(((revenue?.feesYTD ?? 0) / 12000) * 100, 100)}%` }}
                  />
                  {/* Target marker */}
                  <div className="absolute top-0 bottom-0 w-0.5 bg-white/40" style={{ left: "100%" }} />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-slate-400 mb-1">Volume This Month</div>
                  <div className="font-bold text-white">${(revenue?.qpVolumeThisMonth ?? 0).toLocaleString()}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-slate-400 mb-1">Avg Days to Recoup</div>
                  <div className="font-bold text-white">{revenue?.avgDaysToRecoup ?? 0} days</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-slate-400 mb-1">Fees Last Month</div>
                  <div className="font-bold text-white">${(revenue?.feesLastMonth ?? 0).toLocaleString()}</div>
                </div>
                <div className="bg-white/5 rounded-lg p-3">
                  <div className="text-slate-400 mb-1">Period Fees ({period})</div>
                  <div className="font-bold text-[#C8963E]">${(displayFees ?? 0).toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
