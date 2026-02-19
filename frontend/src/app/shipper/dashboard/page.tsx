"use client";

import Link from "next/link";
import { Plus, Truck, File, MessageSquare } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ShipperCard, ShipperBadge, Sparkline, SpendChart } from "@/components/shipper";
import type { DashboardResponse } from "@/components/shipper/shipperData";

export default function ShipperOverviewPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["shipper-dashboard"],
    queryFn: () => api.get<DashboardResponse>("/shipper-portal/dashboard").then((r) => r.data),
  });

  const kpis = [
    { label: "Active Shipments", value: data ? String(data.kpis.activeShipments) : "—", color: "#3B82F6", spark: data?.spendTrend.slice(-6).map((s) => s.spend) || [] },
    { label: "Month Spend", value: data ? `$${data.kpis.monthSpend.toLocaleString()}` : "—", color: "#10B981", spark: data?.spendTrend.slice(-6).map((s) => s.spend) || [] },
    { label: "On-Time Rate", value: data ? `${data.kpis.onTimePercent}%` : "—", color: "#10B981", spark: [] },
    { label: "Open Quotes", value: data ? String(data.kpis.openQuotes) : "—", color: "#8B5CF6", spark: [] },
  ];

  const spendValues = data?.spendTrend.map((s) => s.spend) || [];
  const spendLabels = data?.spendTrend.map((s) => s.month.charAt(0)) || [];

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">Good morning</h1>
        <p className="text-[13px] text-gray-500">Here&apos;s your freight management overview</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {kpis.map((kpi, i) => (
          <ShipperCard key={i} padding="p-5">
            <div className="flex justify-between items-start">
              <div>
                <div className="text-[11px] text-gray-400 font-medium mb-1.5">{kpi.label}</div>
                <div className="text-[28px] font-bold text-[#0D1B2A]">
                  {isLoading ? <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" /> : kpi.value}
                </div>
              </div>
              {kpi.spark.length > 0 && <Sparkline data={kpi.spark} color={kpi.color} />}
            </div>
          </ShipperCard>
        ))}
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { icon: Plus, label: "New Quote", href: "/shipper/dashboard/quote" },
          { icon: Truck, label: "Track Shipment", href: "/shipper/dashboard/tracking" },
          { icon: File, label: "View Documents", href: "/shipper/dashboard/documents" },
          { icon: MessageSquare, label: "Message Rep", href: "/shipper/dashboard/messages" },
        ].map((a, i) => (
          <Link key={i} href={a.href}>
            <ShipperCard hover padding="p-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center">
                  <a.icon size={18} className="text-[#C9A84C]" />
                </div>
                <span className="text-[13px] font-semibold text-[#0D1B2A]">{a.label}</span>
              </div>
            </ShipperCard>
          </Link>
        ))}
      </div>

      {/* Recent Shipments Table */}
      <ShipperCard padding="p-0" className="mb-6">
        <div className="px-5 py-4 flex justify-between items-center border-b border-gray-100">
          <h3 className="text-[15px] font-bold text-[#0D1B2A]">Recent Shipments</h3>
          <Link href="/shipper/dashboard/shipments" className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#C9A84C]">
            View All
          </Link>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-gray-50">
                {["ID", "Route", "Status", "Carrier", "Equipment", "Rate", "ETA"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[11px] font-semibold text-gray-500 tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(3)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse w-20" /></td>
                    ))}
                  </tr>
                ))
              ) : (
                (data?.recentShipments || []).map((s) => (
                  <tr key={s.id} className="border-b border-gray-100 hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-3 font-semibold text-[#0D1B2A] font-mono text-xs">{s.id}</td>
                    <td className="px-4 py-3">
                      <div className="text-xs text-gray-700">{s.origin}</div>
                      <div className="text-[11px] text-gray-400">&rarr; {s.dest}</div>
                    </td>
                    <td className="px-4 py-3"><ShipperBadge status={s.status} /></td>
                    <td className="px-4 py-3 text-gray-600 text-xs">{s.carrier}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{s.equipment}</td>
                    <td className="px-4 py-3 font-semibold text-[#0D1B2A]">${s.rate.toLocaleString()}</td>
                    <td className={`px-4 py-3 text-xs ${s.eta === "Delayed" ? "text-red-500 font-semibold" : "text-gray-500"}`}>{s.eta}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </ShipperCard>

      {/* Bottom Grid */}
      <div className="grid grid-cols-2 gap-4">
        {/* Spend Trend */}
        <ShipperCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0D1B2A] mb-4">Monthly Spend Trend</h3>
          {spendValues.length > 0 ? (
            <SpendChart data={spendValues} labels={spendLabels} highlightLast height={100} />
          ) : (
            <div className="h-[100px] flex items-center justify-center text-xs text-gray-400">No data yet</div>
          )}
        </ShipperCard>

        {/* Open Quotes */}
        <ShipperCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0D1B2A] mb-4">Open Quotes</h3>
          {(data?.openQuotes || []).length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-400">No open quotes</div>
          ) : (
            (data?.openQuotes || []).map((q) => (
              <div key={q.id} className="py-3 border-b border-gray-100 flex justify-between items-center">
                <div>
                  <div className="text-xs font-semibold text-[#0D1B2A]">{q.origin} &rarr; {q.dest}</div>
                  <div className="text-[11px] text-gray-400">{q.id} &middot; {q.equipment} &middot; {q.distance}</div>
                </div>
                <div className="text-right">
                  <div className="text-[13px] font-bold text-[#0D1B2A]">{q.rate}</div>
                  <ShipperBadge status={q.status} />
                </div>
              </div>
            ))
          )}
          <Link href="/shipper/dashboard/quote" className="inline-flex items-center gap-1.5 mt-3 text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#C9A84C]">
            <Plus size={14} /> New Quote
          </Link>
        </ShipperCard>
      </div>
    </div>
  );
}
