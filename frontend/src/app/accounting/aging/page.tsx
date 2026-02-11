"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Clock, AlertTriangle, DollarSign, TrendingUp } from "lucide-react";

interface AgingBucket {
  label: string;
  count: number;
  amount: number;
  color: string;
  bg: string;
}

interface AgingData {
  buckets: AgingBucket[];
  totalOutstanding: number;
  totalOverdue: number;
  details: {
    id: string;
    invoiceNumber: string;
    customer: string;
    amount: number;
    dueDate: string;
    daysOverdue: number;
    bucket: string;
  }[];
}

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const DEFAULT_BUCKETS: AgingBucket[] = [
  { label: "Current", count: 0, amount: 0, color: "text-green-400", bg: "bg-green-500" },
  { label: "1-30 Days", count: 0, amount: 0, color: "text-yellow-400", bg: "bg-yellow-500" },
  { label: "31-60 Days", count: 0, amount: 0, color: "text-orange-400", bg: "bg-orange-500" },
  { label: "61-90 Days", count: 0, amount: 0, color: "text-red-400", bg: "bg-red-500" },
  { label: "90+ Days", count: 0, amount: 0, color: "text-red-600", bg: "bg-red-700" },
];

export default function AgingReportPage() {
  const { data, isLoading } = useQuery<AgingData>({
    queryKey: ["aging-report"],
    queryFn: () => api.get("/accounting/invoices/aging").then(r => r.data),
  });

  const buckets = data?.buckets || DEFAULT_BUCKETS;
  const maxAmount = Math.max(...buckets.map(b => b.amount), 1);

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Aging Report</h1>
        <p className="text-sm text-slate-400 mt-1">Accounts Receivable aging analysis</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        <div className="bg-white/5 border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-blue-500/10 flex items-center justify-center"><DollarSign className="w-4 h-4 text-blue-400" /></div>
            <span className="text-xs text-slate-400">Total Outstanding</span>
          </div>
          <p className="text-2xl font-bold text-white">{fmt(data?.totalOutstanding || 0)}</p>
        </div>
        <div className="bg-white/5 border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-red-500/10 flex items-center justify-center"><AlertTriangle className="w-4 h-4 text-red-400" /></div>
            <span className="text-xs text-slate-400">Total Overdue</span>
          </div>
          <p className="text-2xl font-bold text-red-400">{fmt(data?.totalOverdue || 0)}</p>
        </div>
        <div className="bg-white/5 border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center"><TrendingUp className="w-4 h-4 text-purple-400" /></div>
            <span className="text-xs text-slate-400">Avg Days Outstanding</span>
          </div>
          <p className="text-2xl font-bold text-white">{data ? Math.round((data.details.reduce((s, d) => s + Math.max(0, d.daysOverdue), 0)) / Math.max(data.details.length, 1)) : 0} days</p>
        </div>
      </div>

      {/* Aging Buckets Visual */}
      <div className="bg-white/5 border border-white/5 rounded-xl p-6 mb-8">
        <h2 className="text-sm font-semibold text-white mb-6">Aging Distribution</h2>
        <div className="space-y-4">
          {buckets.map((bucket) => (
            <div key={bucket.label} className="flex items-center gap-4">
              <div className="w-24 text-sm text-slate-300 shrink-0">{bucket.label}</div>
              <div className="flex-1 h-8 bg-white/5 rounded-lg overflow-hidden relative">
                <div
                  className={`h-full ${bucket.bg} rounded-lg transition-all duration-500`}
                  style={{ width: `${(bucket.amount / maxAmount) * 100}%`, minWidth: bucket.amount > 0 ? "2%" : "0" }}
                />
                {bucket.amount > 0 && (
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white font-medium">
                    {fmt(bucket.amount)}
                  </span>
                )}
              </div>
              <div className="w-16 text-right text-xs text-slate-400">{bucket.count} inv.</div>
            </div>
          ))}
        </div>
      </div>

      {/* Detail Table */}
      <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">Overdue Invoices</h2>
        </div>
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Invoice #</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Customer</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Amount</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Due Date</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Days Overdue</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Bucket</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              [...Array(3)].map((_, i) => <tr key={i}><td colSpan={6} className="px-5 py-3"><div className="h-5 bg-white/5 rounded animate-pulse" /></td></tr>)
            ) : data?.details?.filter(d => d.daysOverdue > 0).length ? (
              data.details.filter(d => d.daysOverdue > 0).map(inv => (
                <tr key={inv.id} className="hover:bg-white/[0.02]">
                  <td className="px-5 py-3 text-sm text-white font-medium">{inv.invoiceNumber}</td>
                  <td className="px-5 py-3 text-sm text-slate-300">{inv.customer}</td>
                  <td className="px-5 py-3 text-sm text-white">{fmt(inv.amount)}</td>
                  <td className="px-5 py-3 text-sm text-slate-300">{new Date(inv.dueDate).toLocaleDateString()}</td>
                  <td className="px-5 py-3">
                    <span className={`text-sm font-medium ${inv.daysOverdue > 60 ? "text-red-400" : inv.daysOverdue > 30 ? "text-orange-400" : "text-yellow-400"}`}>
                      {inv.daysOverdue}d
                    </span>
                  </td>
                  <td className="px-5 py-3 text-sm text-slate-400">{inv.bucket}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={6} className="px-5 py-12 text-center text-sm text-slate-500">No overdue invoices</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
