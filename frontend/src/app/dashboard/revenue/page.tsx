"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";

const periods = [
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "ytd", label: "YTD" },
];

export default function RevenuePage() {
  const [period, setPeriod] = useState("monthly");

  const { data } = useQuery({
    queryKey: ["carrier-revenue", period],
    queryFn: () => api.get(`/carrier/revenue?period=${period}`).then((r) => r.data),
  });

  const chartData = data?.invoices?.reduce((acc: Record<string, number>[], inv: { amount: number; createdAt: string }) => {
    const d = new Date(inv.createdAt);
    const label = period === "weekly"
      ? `${d.getMonth() + 1}/${d.getDate()}`
      : d.toLocaleString("default", { month: "short" });
    const existing = acc.find((a) => String(a.period) === label);
    if (existing) existing.revenue += inv.amount;
    else acc.push({ period: label as any, revenue: inv.amount });
    return acc;
  }, []) || [];

  const stats = [
    { label: "Total Revenue", value: `$${(data?.totalRevenue || 0).toLocaleString()}`, color: "text-green-400" },
    { label: "Avg Per Load", value: `$${Math.round(data?.avgPerLoad || 0).toLocaleString()}`, color: "text-blue-400" },
    { label: "Total Bonuses", value: `$${(data?.totalBonuses || 0).toLocaleString()}`, color: "text-gold" },
    { label: "Loads Completed", value: data?.loadCount || 0, color: "text-white" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Revenue</h1>
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {periods.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition ${
                period === p.key ? "bg-gold text-navy" : "text-slate-400 hover:text-white"
              }`}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white/5 rounded-xl border border-white/10 p-5">
            <p className="text-sm text-slate-400">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        <h2 className="font-semibold text-white mb-4">Revenue by Period</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <XAxis dataKey="period" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }} formatter={(v: number | undefined) => v != null ? `$${v.toLocaleString()}` : ""} />
              <Bar dataKey="revenue" fill="#D4A843" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-500 text-sm text-center py-12">No revenue data for this period</p>
        )}
      </div>

      {/* Breakdown Table */}
      <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/10">
          <h2 className="font-semibold text-white">Revenue Breakdown</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-white/10">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Invoice</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Route</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Status</th>
              <th className="text-left px-4 py-3 font-medium text-slate-400">Date</th>
            </tr>
          </thead>
          <tbody>
            {data?.invoices?.map((inv: { id: string; invoiceNumber: string; amount: number; status: string; createdAt: string; load?: { originCity: string; originState: string; destCity: string; destState: string } }) => (
              <tr key={inv.id} className="border-b border-white/5 last:border-0">
                <td className="px-4 py-3 font-medium text-white font-mono text-xs">{inv.invoiceNumber}</td>
                <td className="px-4 py-3 text-slate-400">{inv.load ? `${inv.load.originCity}, ${inv.load.originState} → ${inv.load.destCity}, ${inv.load.destState}` : "—"}</td>
                <td className="px-4 py-3 font-medium text-gold">${inv.amount.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                    inv.status === "PAID" ? "bg-green-500/20 text-green-400" :
                    inv.status === "FUNDED" ? "bg-blue-500/20 text-blue-400" :
                    "bg-yellow-500/20 text-yellow-400"
                  }`}>{inv.status}</span>
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(inv.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {!data?.invoices?.length && (
              <tr><td colSpan={5} className="text-center py-8 text-slate-500">No invoices for this period</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
