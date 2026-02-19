"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ShipperCard, SpendChart } from "@/components/shipper";
import type { AnalyticsResponse } from "@/components/shipper/shipperData";

const periods = ["7D", "30D", "90D", "YTD"];
const periodMap: Record<string, string> = { "7D": "7d", "30D": "30d", "90D": "90d", "YTD": "ytd" };

export default function ShipperAnalyticsPage() {
  const [activePeriod, setActivePeriod] = useState("30D");

  const { data, isLoading } = useQuery({
    queryKey: ["shipper-analytics", activePeriod],
    queryFn: () => api.get<AnalyticsResponse>(`/shipper-portal/analytics?period=${periodMap[activePeriod]}`).then((r) => r.data),
  });

  const metrics = data?.metrics;
  const topLanes = data?.topLanes || [];
  const carriers = data?.carrierScorecard || [];
  const maxLaneSpend = topLanes.length > 0 ? topLanes[0].spend : 1;

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">Transportation Analytics &amp; Insights</h1>
          <p className="text-[13px] text-gray-500">Data-driven freight intelligence for your supply chain</p>
        </div>
        <div className="flex gap-2">
          {periods.map((p) => (
            <button
              key={p}
              onClick={() => setActivePeriod(p)}
              className={`px-3.5 py-1.5 rounded-md text-xs font-medium border ${
                p === activePeriod ? "bg-[#0D1B2A] text-white border-[#0D1B2A]" : "text-gray-500 border-gray-200 hover:border-gray-300"
              }`}
            >{p}</button>
          ))}
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-3 gap-4 mb-5">
        {[
          { label: "Total Shipments", value: metrics ? String(metrics.totalShipments) : "—" },
          { label: "Avg Cost/Mile", value: metrics ? `$${metrics.avgCostPerMile.toFixed(2)}` : "—" },
          { label: "Avg Transit Time", value: metrics ? `${metrics.avgTransitDays} days` : "—" },
        ].map((m, i) => (
          <ShipperCard key={i} padding="p-5">
            <div className="text-[11px] text-gray-400 mb-1.5">{m.label}</div>
            <div className="text-[28px] font-bold text-[#0D1B2A] mb-1">
              {isLoading ? <div className="h-8 w-16 bg-gray-200 rounded animate-pulse" /> : m.value}
            </div>
          </ShipperCard>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-2 gap-4 mb-5">
        <ShipperCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0D1B2A] mb-5">Spend by Month</h3>
          {data ? (
            <SpendChart
              data={data.spendByMonth}
              labels={data.months}
              height={140}
              showValues
              colorFn={(_, i) =>
                i === data.spendByMonth.length - 1
                  ? "linear-gradient(to top, #0D1B2A, #C9A84C)"
                  : "linear-gradient(to top, #0D1B2A, #1B2D45)"
              }
            />
          ) : (
            <div className="h-[140px] flex items-center justify-center text-xs text-gray-400">Loading...</div>
          )}
        </ShipperCard>
        <ShipperCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0D1B2A] mb-5">On-Time Performance</h3>
          {data ? (
            <SpendChart
              data={data.onTimeByMonth}
              labels={data.months}
              height={140}
              showValues={false}
              colorFn={(v) => (v >= 97 ? "#10B981" : v >= 95 ? "#F59E0B" : "#EF4444")}
            />
          ) : (
            <div className="h-[140px] flex items-center justify-center text-xs text-gray-400">Loading...</div>
          )}
        </ShipperCard>
      </div>

      {/* Lanes & Carriers */}
      <div className="grid grid-cols-2 gap-4">
        <ShipperCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0D1B2A] mb-4">Top Lanes by Spend</h3>
          {topLanes.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-400">No lane data yet</div>
          ) : (
            topLanes.map((l, i) => (
              <div key={i} className={`py-2.5 ${i < topLanes.length - 1 ? "border-b border-gray-100" : ""}`}>
                <div className="flex justify-between mb-1.5">
                  <span className="text-xs font-semibold text-[#0D1B2A]">{l.lane}</span>
                  <span className="text-xs font-bold text-[#0D1B2A]">${l.spend.toLocaleString()}</span>
                </div>
                <div className="bg-gray-100 rounded h-[5px] overflow-hidden">
                  <div className="h-full bg-[#C9A84C] rounded" style={{ width: `${Math.round((l.spend / maxLaneSpend) * 100)}%` }} />
                </div>
                <div className="text-[10px] text-gray-400 mt-1">{l.loads} loads</div>
              </div>
            ))
          )}
        </ShipperCard>
        <ShipperCard padding="p-5">
          <h3 className="text-sm font-bold text-[#0D1B2A] mb-4">Carrier Scorecard</h3>
          {carriers.length === 0 ? (
            <div className="py-6 text-center text-xs text-gray-400">No carrier data yet</div>
          ) : (
            carriers.map((c, i) => (
              <div key={i} className={`flex justify-between items-center py-2.5 ${i < carriers.length - 1 ? "border-b border-gray-100" : ""}`}>
                <div>
                  <div className="text-[13px] font-semibold text-[#0D1B2A]">{c.name}</div>
                  <div className="text-[11px] text-gray-400">{c.loads} loads &middot; {c.otd}% on-time</div>
                </div>
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  c.otd >= 97 ? "bg-emerald-500/15 text-emerald-500" : c.otd >= 93 ? "bg-amber-500/15 text-amber-500" : "bg-red-500/15 text-red-500"
                }`}>{c.score}</span>
              </div>
            ))
          )}
        </ShipperCard>
      </div>
    </div>
  );
}
