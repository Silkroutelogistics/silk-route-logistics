"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

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
    { label: "Total Revenue", value: `$${(data?.totalRevenue || 0).toLocaleString()}` },
    { label: "Avg Per Load", value: `$${Math.round(data?.avgPerLoad || 0).toLocaleString()}` },
    { label: "Total Bonuses", value: `$${(data?.totalBonuses || 0).toLocaleString()}` },
    { label: "Loads Completed", value: data?.loadCount || 0 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Revenue</h1>
        <div className="flex bg-slate-100 rounded-lg p-1">
          {periods.map((p) => (
            <button key={p.key} onClick={() => setPeriod(p.key)}
              className={cn("px-4 py-1.5 rounded-md text-sm font-medium transition",
                period === p.key ? "bg-white shadow-sm text-navy" : "text-slate-500 hover:text-slate-700"
              )}>{p.label}</button>
          ))}
        </div>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border p-5">
            <p className="text-sm text-slate-500">{s.label}</p>
            <p className="text-2xl font-bold mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-white rounded-xl border p-6">
        <h2 className="font-semibold mb-4">Revenue by Period</h2>
        {chartData.length > 0 ? (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData}>
              <XAxis dataKey="period" axisLine={false} tickLine={false} />
              <YAxis axisLine={false} tickLine={false} tickFormatter={(v: any) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v: any) => `$${v.toLocaleString()}`} />
              <Bar dataKey="revenue" fill="#D4A843" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-400 text-sm text-center py-12">No revenue data for this period</p>
        )}
      </div>

      {/* Breakdown Table */}
      <div className="bg-white rounded-xl border overflow-hidden">
        <div className="px-5 py-4 border-b">
          <h2 className="font-semibold">Revenue Breakdown</h2>
        </div>
        <table className="w-full text-sm">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Invoice</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Route</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Amount</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Status</th>
              <th className="text-left px-4 py-3 font-medium text-slate-600">Date</th>
            </tr>
          </thead>
          <tbody>
            {data?.invoices?.map((inv: { id: string; invoiceNumber: string; amount: number; status: string; createdAt: string; load?: { originCity: string; originState: string; destCity: string; destState: string } }) => (
              <tr key={inv.id} className="border-b last:border-0">
                <td className="px-4 py-3 font-medium">{inv.invoiceNumber}</td>
                <td className="px-4 py-3 text-slate-600">{inv.load ? `${inv.load.originCity}, ${inv.load.originState} → ${inv.load.destCity}, ${inv.load.destState}` : "—"}</td>
                <td className="px-4 py-3 font-medium">${inv.amount.toLocaleString()}</td>
                <td className="px-4 py-3">
                  <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium",
                    inv.status === "PAID" ? "bg-green-50 text-green-700" :
                    inv.status === "FUNDED" ? "bg-blue-50 text-blue-700" :
                    "bg-yellow-50 text-yellow-700"
                  )}>{inv.status}</span>
                </td>
                <td className="px-4 py-3 text-slate-500">{new Date(inv.createdAt).toLocaleDateString()}</td>
              </tr>
            ))}
            {!data?.invoices?.length && (
              <tr><td colSpan={5} className="text-center py-8 text-slate-400">No invoices for this period</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
