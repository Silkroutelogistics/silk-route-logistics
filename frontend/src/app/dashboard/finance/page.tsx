"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DollarSign, TrendingUp, CreditCard, CheckCircle2 } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface FinanceSummary {
  totalRevenue: number; totalExpenses: number; netProfit: number; invoiceCount: number;
  monthlyData: { month: string; revenue: number; expenses: number }[];
}
interface ARItem {
  id: string; invoiceNumber: string; amount: number; status: string; createdAt: string;
  user?: { company: string | null; firstName: string; lastName: string };
  load?: { originCity: string; originState: string; destCity: string; destState: string };
}

export default function FinancePage() {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState("monthly");

  const { data: summary } = useQuery({
    queryKey: ["finance-summary", period],
    queryFn: () => api.get<FinanceSummary>(`/accounting/summary?period=${period}`).then((r) => r.data),
  });

  const { data: receivables } = useQuery({
    queryKey: ["finance-ar"],
    queryFn: () => api.get<{ invoices: ARItem[]; aging: Record<string, number> }>("/accounting/receivable").then((r) => r.data),
  });

  const { data: payables } = useQuery({
    queryKey: ["finance-ap"],
    queryFn: () => api.get<{ invoices: ARItem[]; total: number }>("/accounting/payable").then((r) => r.data),
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => api.patch(`/accounting/invoices/${id}/pay`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["finance-ar"] }); queryClient.invalidateQueries({ queryKey: ["finance-summary"] }); },
  });

  const totalRevenue = summary?.totalRevenue || 0;
  const totalExpenses = summary?.totalExpenses || 0;
  const profit = summary?.netProfit || (totalRevenue - totalExpenses);
  const totalAR = receivables?.invoices?.reduce((s, i) => s + i.amount, 0) || 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Financial Analytics</h1>
        <div className="flex gap-1 bg-white/5 rounded-lg p-1">
          {["monthly", "quarterly", "ytd"].map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 rounded text-xs font-medium transition ${period === p ? "bg-gold text-navy" : "text-slate-400 hover:text-white"}`}>
              {p === "ytd" ? "YTD" : p.charAt(0).toUpperCase() + p.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="grid sm:grid-cols-4 gap-4">
        <StatCard icon={<DollarSign className="w-5 h-5" />} label="Total Revenue" value={`$${(totalRevenue / 1000).toFixed(0)}K`} color="text-green-400" />
        <StatCard icon={<DollarSign className="w-5 h-5" />} label="Total Expenses" value={`$${(totalExpenses / 1000).toFixed(0)}K`} color="text-red-400" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Net Profit" value={`$${(profit / 1000).toFixed(0)}K`} color="text-blue-400" />
        <StatCard icon={<CreditCard className="w-5 h-5" />} label="Accounts Receivable" value={`$${(totalAR / 1000).toFixed(1)}K`} color="text-amber-400" />
      </div>

      {/* Revenue Chart */}
      {summary?.monthlyData && summary.monthlyData.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-6">
          <h2 className="font-semibold text-white mb-4">Revenue vs Expenses</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={summary.monthlyData}>
              <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }} formatter={(v: number | undefined) => v != null ? `$${v.toLocaleString()}` : ""} />
              <Bar dataKey="revenue" fill="#D4A843" radius={[4, 4, 0, 0]} name="Revenue" />
              <Bar dataKey="expenses" fill="#94A3B8" radius={[4, 4, 0, 0]} name="Expenses" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* AR Aging */}
      <div className="bg-white/5 rounded-xl border border-white/10">
        <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
          <h2 className="font-semibold text-white">Accounts Receivable</h2>
          {receivables?.aging && (
            <div className="flex gap-3 text-xs">
              {Object.entries(receivables.aging).map(([bucket, amount]) => (
                <span key={bucket} className="text-slate-400">{bucket}: ${((amount as number) / 1000).toFixed(1)}K</span>
              ))}
            </div>
          )}
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-white/10">
              <th className="text-left px-6 py-3 font-medium">Invoice</th>
              <th className="text-left px-4 py-3 font-medium">Customer</th>
              <th className="text-right px-4 py-3 font-medium">Amount</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="text-right px-4 py-3 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {receivables?.invoices?.map((inv) => (
              <tr key={inv.id} className="border-b border-white/5">
                <td className="px-6 py-3 text-white font-mono text-xs">{inv.invoiceNumber}</td>
                <td className="px-4 py-3 text-slate-300">{inv.user?.company || `${inv.user?.firstName} ${inv.user?.lastName}`}</td>
                <td className="px-4 py-3 text-right text-white">${inv.amount.toLocaleString()}</td>
                <td className="px-4 py-3"><span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs">{inv.status}</span></td>
                <td className="px-4 py-3 text-right">
                  <button onClick={() => markPaid.mutate(inv.id)} className="text-xs text-gold hover:underline flex items-center gap-1 ml-auto">
                    <CheckCircle2 className="w-3 h-3" /> Mark Paid
                  </button>
                </td>
              </tr>
            ))}
            {(!receivables?.invoices || receivables.invoices.length === 0) && (
              <tr><td colSpan={5} className="px-6 py-8 text-center text-slate-500">No outstanding receivables</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* AP Summary */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        <h2 className="font-semibold text-white mb-4">Accounts Payable</h2>
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="p-4 bg-white/5 rounded-lg">
            <p className="text-sm text-slate-400">Carrier Payments Due</p>
            <p className="text-xl font-bold text-white mt-1">${((payables?.total || 0) / 1000).toFixed(1)}K</p>
            <p className="text-xs text-slate-500 mt-1">{payables?.invoices?.length || 0} invoices pending</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="text-gold">{icon}</div>
        <span className="text-sm text-slate-400">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
    </div>
  );
}
