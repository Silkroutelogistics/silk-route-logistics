"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Truck, Users, TrendingUp, BarChart3, Shield, Star,
  ChevronRight, AlertTriangle, CheckCircle2, Clock, Award,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";

interface Carrier {
  carrierId: string;
  company: string;
  tier: string;
  equipmentTypes: string[];
  safetyScore: number | null;
  onTimeDelivery: number | null;
  totalLoads: number;
  isActive: boolean;
}

const TIER_COLORS: Record<string, { text: string; bg: string }> = {
  PLATINUM: { text: "text-purple-300", bg: "bg-purple-500/20" },
  GOLD: { text: "text-yellow-300", bg: "bg-yellow-500/20" },
  SILVER: { text: "text-slate-300", bg: "bg-slate-400/20" },
  BRONZE: { text: "text-orange-300", bg: "bg-orange-500/20" },
};

export function CarrierFleetOverview() {
  const { user } = useAuthStore();

  const { data: carrierData } = useQuery({
    queryKey: ["fleet-carriers"],
    queryFn: () => api.get<{ carriers: Carrier[]; total: number }>("/carrier/all").then(r => r.data),
  });

  const { data: fleetData } = useQuery({
    queryKey: ["fleet-overview"],
    queryFn: () => api.get("/fleet/overview").then(r => r.data).catch(() => null),
  });

  const { data: complianceData } = useQuery({
    queryKey: ["fleet-compliance"],
    queryFn: () => api.get("/compliance/stats").then(r => r.data).catch(() => null),
  });

  const carriers = carrierData?.carriers || [];
  const totalCarriers = carrierData?.total || carriers.length;
  const activeCarriers = carriers.filter(c => c.isActive).length;

  // Tier breakdown
  const tierCounts: Record<string, number> = { PLATINUM: 0, GOLD: 0, SILVER: 0, BRONZE: 0 };
  carriers.forEach(c => {
    const tier = c.tier || "BRONZE";
    if (tierCounts[tier] !== undefined) tierCounts[tier]++;
  });

  // Safety & performance averages
  const withScores = carriers.filter(c => c.safetyScore !== null);
  const avgSafety = withScores.length > 0
    ? withScores.reduce((s, c) => s + (c.safetyScore || 0), 0) / withScores.length
    : 0;

  const withOtd = carriers.filter(c => c.onTimeDelivery !== null);
  const avgOtd = withOtd.length > 0
    ? withOtd.reduce((s, c) => s + (c.onTimeDelivery || 0), 0) / withOtd.length
    : 0;

  const totalLoads = carriers.reduce((s, c) => s + (c.totalLoads || 0), 0);

  // Equipment distribution
  const equipmentCounts: Record<string, number> = {};
  carriers.forEach(c => {
    (c.equipmentTypes || []).forEach(eq => {
      equipmentCounts[eq] = (equipmentCounts[eq] || 0) + 1;
    });
  });

  const kpis = [
    { label: "Total Carriers", value: totalCarriers, icon: Users, color: "text-blue-400", bg: "bg-blue-500/10" },
    { label: "Active Carriers", value: activeCarriers, icon: Truck, color: "text-green-400", bg: "bg-green-500/10" },
    { label: "Avg Safety Score", value: avgSafety > 0 ? `${avgSafety.toFixed(0)}%` : "—", icon: Shield, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "Avg On-Time Delivery", value: avgOtd > 0 ? `${avgOtd.toFixed(0)}%` : "—", icon: Clock, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { label: "Total Loads Hauled", value: totalLoads.toLocaleString(), icon: TrendingUp, color: "text-[#C8963E]", bg: "bg-[#C8963E]/10" },
    { label: "Compliance Alerts", value: complianceData?.activeAlerts ?? "—", icon: AlertTriangle, color: "text-red-400", bg: "bg-red-500/10" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-500/10 to-purple-500/10 rounded-2xl p-6 border border-blue-500/10">
        <h1 className="text-2xl font-bold text-white mb-1">Carrier Fleet Overview</h1>
        <p className="text-slate-400 text-sm">Performance summary across all carriers in the SRL network</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-3 gap-4">
        {kpis.map(kpi => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-white/5 border border-white/5 rounded-xl p-4 hover:bg-white/[0.07] transition">
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-9 h-9 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                  <Icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
                <p className="text-xs text-slate-400">{kpi.label}</p>
              </div>
              <p className="text-xl font-bold text-white">{kpi.value}</p>
            </div>
          );
        })}
      </div>

      {/* Two Column: Tier Breakdown + Equipment Distribution */}
      <div className="grid grid-cols-2 gap-6">
        {/* SRCPP Tier Breakdown */}
        <div className="bg-white/5 border border-white/5 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Award className="w-4 h-4 text-[#C8963E]" /> SRCPP Tier Distribution
          </h2>
          <div className="space-y-3">
            {Object.entries(tierCounts).map(([tier, count]) => {
              const pct = totalCarriers > 0 ? (count / totalCarriers) * 100 : 0;
              const colors = TIER_COLORS[tier] || TIER_COLORS.BRONZE;
              return (
                <div key={tier} className="flex items-center gap-3">
                  <span className={`text-xs font-bold w-20 ${colors.text}`}>{tier}</span>
                  <div className="flex-1 h-6 bg-white/5 rounded-lg overflow-hidden relative">
                    <div
                      className={`h-full ${colors.bg} rounded-lg transition-all duration-500`}
                      style={{ width: `${Math.max(pct, count > 0 ? 5 : 0)}%` }}
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-white font-medium">
                      {count} carrier{count !== 1 ? "s" : ""}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Equipment Types */}
        <div className="bg-white/5 border border-white/5 rounded-xl p-5">
          <h2 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
            <Truck className="w-4 h-4 text-blue-400" /> Equipment Capabilities
          </h2>
          {Object.keys(equipmentCounts).length > 0 ? (
            <div className="space-y-2">
              {Object.entries(equipmentCounts)
                .sort((a, b) => b[1] - a[1])
                .slice(0, 8)
                .map(([eq, count]) => (
                  <div key={eq} className="flex items-center justify-between py-1.5">
                    <span className="text-sm text-slate-300">{eq}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-slate-400">{count} carrier{count !== 1 ? "s" : ""}</span>
                    </div>
                  </div>
                ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">No equipment data available</p>
          )}
        </div>
      </div>

      {/* Carrier Table */}
      <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white">Carrier Pool</h2>
          <Link href="/dashboard/carriers" className="text-xs text-[#C8963E] hover:underline flex items-center gap-1">
            View All <ChevronRight className="w-3 h-3" />
          </Link>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Carrier</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Tier</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Equipment</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Safety</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Loads</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {carriers.length > 0 ? (
              carriers.slice(0, 10).map(c => {
                const tierColor = TIER_COLORS[c.tier || "BRONZE"] || TIER_COLORS.BRONZE;
                return (
                  <tr key={c.carrierId} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3 text-sm text-white font-medium">{c.company || "Unknown"}</td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${tierColor.bg} ${tierColor.text}`}>
                        {c.tier || "BRONZE"}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">{(c.equipmentTypes || []).join(", ") || "—"}</td>
                    <td className="px-5 py-3">
                      {c.safetyScore !== null ? (
                        <span className={`text-sm font-medium ${c.safetyScore >= 80 ? "text-green-400" : c.safetyScore >= 60 ? "text-yellow-400" : "text-red-400"}`}>
                          {c.safetyScore}%
                        </span>
                      ) : (
                        <span className="text-xs text-slate-500">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-300">{c.totalLoads || 0}</td>
                    <td className="px-5 py-3">
                      {c.isActive ? (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-green-500/20 text-green-400">Active</span>
                      ) : (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-500/20 text-slate-400">Inactive</span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">No carriers in the network yet</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
