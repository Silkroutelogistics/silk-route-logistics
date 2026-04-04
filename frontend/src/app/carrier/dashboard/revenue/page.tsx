"use client";

import { useState, useMemo } from "react";
import { DollarSign, TrendingUp, Truck, MapPin, CreditCard } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { api } from "@/lib/api";
import { CarrierCard } from "@/components/carrier";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";

type Period = "weekly" | "monthly" | "ytd";

export default function CarrierRevenuePage() {
  const [period, setPeriod] = useState<Period>("monthly");
  const { user } = useCarrierAuth();

  const { data: rev } = useQuery({
    queryKey: ["carrier-revenue", period],
    queryFn: () => api.get(`/carrier/revenue?period=${period === "ytd" ? "monthly" : period}`).then((r) => r.data),
  });

  const { data: paySum } = useQuery({
    queryKey: ["carrier-pay-summary"],
    queryFn: () => api.get("/carrier-payments/summary").then((r) => r.data),
  });

  const invoices: any[] = rev?.invoices || [];

  const chartData = useMemo(() => {
    const groups: Record<string, number> = {};
    invoices.forEach((inv: any) => {
      const d = new Date(inv.createdAt);
      const key = period === "weekly"
        ? `W${Math.ceil(d.getDate() / 7)} ${d.toLocaleString("default", { month: "short" })}`
        : d.toLocaleString("default", { month: "short", year: "2-digit" });
      groups[key] = (groups[key] || 0) + (inv.amount || 0);
    });
    return Object.entries(groups).map(([name, revenue]) => ({ name, revenue }));
  }, [invoices, period]);

  const topLanes = useMemo(() => {
    const lanes: Record<string, { lane: string; revenue: number; count: number }> = {};
    invoices.filter((i: any) => i.status === "PAID" || i.status === "APPROVED").forEach((inv: any) => {
      if (!inv.load) return;
      const key = `${inv.load.originState}-${inv.load.destState}`;
      if (!lanes[key]) lanes[key] = { lane: `${inv.load.originState} → ${inv.load.destState}`, revenue: 0, count: 0 };
      lanes[key].revenue += inv.amount || 0;
      lanes[key].count += 1;
    });
    return Object.values(lanes).sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  }, [invoices]);

  const fmt = (n: number | undefined) => `$${(n || 0).toLocaleString()}`;

  return (
    <div>
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#0F1117] mb-1">Revenue &amp; Earnings</h1>
          <p className="text-[13px] text-gray-500">Track revenue performance across your loads</p>
        </div>
        <div className="flex bg-gray-100 rounded-lg p-0.5">
          {(["weekly", "monthly", "ytd"] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={`px-4 py-1.5 rounded-md text-[11px] font-semibold uppercase tracking-wider transition-all ${
                p === period ? "bg-white text-[#0F1117] shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >{p === "ytd" ? "YTD" : p.charAt(0).toUpperCase() + p.slice(1)}</button>
          ))}
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {[
          { icon: DollarSign, color: "text-[#C9A84C]", label: "Total Revenue", value: fmt(rev?.totalRevenue) },
          { icon: Truck, color: "text-blue-500", label: "Total Loads", value: String(rev?.totalLoads || 0) },
          { icon: TrendingUp, color: "text-emerald-500", label: "Avg Per Load", value: fmt(rev?.avgPerLoad) },
          { icon: CreditCard, color: "text-violet-500", label: "YTD Earnings", value: fmt(paySum?.ytdEarnings?.amount) },
        ].map((kpi) => (
          <CarrierCard key={kpi.label} padding="p-5">
            <div className="flex items-center gap-2 mb-2">
              <kpi.icon size={16} className={kpi.color} />
              <span className="text-[11px] text-gray-400 uppercase tracking-wide">{kpi.label}</span>
            </div>
            <div className="text-[28px] font-bold text-[#0F1117]">{kpi.value}</div>
          </CarrierCard>
        ))}
      </div>

      {/* Revenue Chart */}
      <CarrierCard className="mb-6" padding="p-5">
        <h2 className="text-sm font-semibold text-[#0F1117] mb-4">Revenue Over Time</h2>
        {chartData.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-12">No revenue data for this period</p>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#9ca3af" }} />
              <YAxis tick={{ fontSize: 11, fill: "#9ca3af" }} tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(value: number | undefined) => [`$${(value || 0).toLocaleString()}`, "Revenue"]} />
              <Bar dataKey="revenue" fill="#C9A84C" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CarrierCard>

      <div className="grid grid-cols-3 gap-4 mb-6">
        {/* Revenue Breakdown Table */}
        <div className="col-span-2">
          <CarrierCard padding="p-0">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-[#0F1117]">Revenue Breakdown</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="bg-gray-50">
                    {["Load Ref#", "Route", "Amount", "Status", "Date"].map((h) => (
                      <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 tracking-wide uppercase">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {invoices.length === 0 ? (
                    <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-400">No invoices found</td></tr>
                  ) : invoices.slice(0, 15).map((inv: any, i: number) => (
                    <tr key={i} className="border-b border-gray-100 hover:bg-gray-50">
                      <td className="px-4 py-2.5 font-mono text-[11px] font-semibold text-[#0F1117]">{inv.load?.referenceNumber || "—"}</td>
                      <td className="px-4 py-2.5 text-xs text-gray-600">
                        {inv.load ? `${inv.load.originCity}, ${inv.load.originState} → ${inv.load.destCity}, ${inv.load.destState}` : "—"}
                      </td>
                      <td className="px-4 py-2.5 font-bold text-[#0F1117]">${(inv.amount || 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          inv.status === "PAID" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"
                        }`}>{inv.status}</span>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-gray-500">{new Date(inv.createdAt).toLocaleDateString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CarrierCard>
        </div>

        {/* Right Column */}
        <div className="space-y-4">
          {/* Top Lanes */}
          <CarrierCard padding="p-4">
            <div className="flex items-center gap-2 mb-3">
              <MapPin size={14} className="text-[#C9A84C]" />
              <h2 className="text-sm font-semibold text-[#0F1117]">Top Lanes</h2>
            </div>
            {topLanes.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-4">No lane data yet</p>
            ) : topLanes.map((lane, i) => (
              <div key={i} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                <div>
                  <div className="text-[12px] font-semibold text-[#0F1117]">{lane.lane}</div>
                  <div className="text-[10px] text-gray-400">{lane.count} loads</div>
                </div>
                <div className="text-[13px] font-bold text-[#C9A84C]">{fmt(lane.revenue)}</div>
              </div>
            ))}
          </CarrierCard>

          {/* Payment Summary */}
          <CarrierCard padding="p-4">
            <div className="flex items-center gap-2 mb-3">
              <CreditCard size={14} className="text-[#C9A84C]" />
              <h2 className="text-sm font-semibold text-[#0F1117]">Payment Summary</h2>
            </div>
            {[
              { label: "Pending Pay", value: fmt(paySum?.totalPending?.amount), color: "text-amber-500" },
              { label: "Paid This Month", value: fmt(paySum?.totalPaid?.amount), color: "text-emerald-500" },
              { label: "QuickPay Savings", value: fmt(paySum?.quickPaySavings || paySum?.quickPayUsed?.discount), color: "text-violet-500" },
            ].map((item) => (
              <div key={item.label} className="flex justify-between items-center py-2 border-b border-gray-50 last:border-0">
                <span className="text-[12px] text-gray-500">{item.label}</span>
                <span className={`text-[13px] font-bold ${item.color}`}>{item.value}</span>
              </div>
            ))}
          </CarrierCard>
        </div>
      </div>
    </div>
  );
}
