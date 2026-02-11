"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  DollarSign, TrendingUp, TrendingDown, Clock, CreditCard,
  ArrowUpRight, ArrowDownRight, AlertTriangle, Zap, FileText,
  CheckCircle2, RotateCcw, Landmark, BarChart3,
} from "lucide-react";

interface DashboardData {
  totalRevenue: number;
  totalExpenses: number;
  netProfit: number;
  marginPercent: number;
  outstandingAR: number;
  outstandingAP: number;
  overdueInvoices: number;
  avgDSO: number;
  quickPayVolume: number;
  quickPayFees: number;
  fundBalance: number;
  pendingApprovals: number;
  openDisputes: number;
  recentInvoices: { id: string; invoiceNumber: string; amount: number; status: string; dueDate: string; shipper: string }[];
  recentPayments: { id: string; paymentNumber: string; amount: number; status: string; carrier: string; dueDate: string }[];
}

const formatCurrency = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n);
const formatPercent = (n: number) => `${n.toFixed(1)}%`;

export default function AccountingDashboard() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data, isLoading } = useQuery<DashboardData>({
    queryKey: ["accounting-dashboard"],
    queryFn: async () => {
      const res = await api.get("/accounting/dashboard");
      const d = res.data;
      return {
        totalRevenue: d.mtdRevenue ?? 0,
        totalExpenses: d.apDue ?? 0,
        netProfit: (d.mtdRevenue ?? 0) - (d.apDue ?? 0),
        marginPercent: d.avgMarginPercent ?? 0,
        outstandingAR: d.arOutstanding ?? 0,
        outstandingAP: d.apDue ?? 0,
        overdueInvoices: d.overdueCount ?? 0,
        avgDSO: d.avgDso ?? 0,
        quickPayVolume: d.qpDisbursed ?? 0,
        quickPayFees: d.qpRevenue ?? 0,
        fundBalance: d.cashBalance ?? 0,
        pendingApprovals: d.pendingApprovals ?? 0,
        openDisputes: d.openDisputes ?? 0,
        recentInvoices: d.recentInvoices ?? [],
        recentPayments: d.recentPayments ?? [],
      } as DashboardData;
    },
  });

  const kpis = data ? [
    { label: "Total Revenue", value: formatCurrency(data.totalRevenue), icon: DollarSign, color: "text-green-400", bg: "bg-green-500/10", trend: "+12.5%", up: true },
    { label: "Net Profit", value: formatCurrency(data.netProfit), icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10", sub: formatPercent(data.marginPercent) + " margin" },
    { label: "Outstanding AR", value: formatCurrency(data.outstandingAR), icon: FileText, color: "text-blue-400", bg: "bg-blue-500/10", sub: `${data.overdueInvoices} overdue` },
    { label: "Outstanding AP", value: formatCurrency(data.outstandingAP), icon: CreditCard, color: "text-orange-400", bg: "bg-orange-500/10", sub: `${data.pendingApprovals} pending` },
    { label: "Avg DSO", value: `${data.avgDSO} days`, icon: Clock, color: "text-purple-400", bg: "bg-purple-500/10" },
    { label: "Quick Pay Volume", value: formatCurrency(data.quickPayVolume), icon: Zap, color: "text-yellow-400", bg: "bg-yellow-500/10", sub: `${formatCurrency(data.quickPayFees)} in fees` },
    { label: "Fund Balance", value: formatCurrency(data.fundBalance), icon: Landmark, color: "text-cyan-400", bg: "bg-cyan-500/10" },
    { label: "Open Disputes", value: String(data.openDisputes), icon: RotateCcw, color: "text-red-400", bg: "bg-red-500/10" },
  ] : [];

  const INVOICE_STATUS: Record<string, string> = {
    DRAFT: "bg-slate-500/20 text-slate-400",
    SENT: "bg-blue-500/20 text-blue-400",
    VIEWED: "bg-indigo-500/20 text-indigo-400",
    PARTIAL: "bg-yellow-500/20 text-yellow-400",
    PAID: "bg-green-500/20 text-green-400",
    OVERDUE: "bg-red-500/20 text-red-400",
    VOID: "bg-slate-500/20 text-slate-400",
  };

  const PAY_STATUS: Record<string, string> = {
    PENDING: "bg-yellow-500/20 text-yellow-400",
    APPROVED: "bg-blue-500/20 text-blue-400",
    SCHEDULED: "bg-indigo-500/20 text-indigo-400",
    PAID: "bg-green-500/20 text-green-400",
    REJECTED: "bg-red-500/20 text-red-400",
  };

  if (isLoading) {
    return (
      <div className="p-8">
        <div className="animate-pulse space-y-6">
          <div className="h-8 bg-white/5 rounded w-64" />
          <div className="grid grid-cols-4 gap-4">
            {[...Array(8)].map((_, i) => <div key={i} className="h-28 bg-white/5 rounded-xl" />)}
          </div>
          <div className="grid grid-cols-2 gap-6">
            <div className="h-64 bg-white/5 rounded-xl" />
            <div className="h-64 bg-white/5 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`p-8 transition-all duration-500 ${mounted ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"}`}>
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Accounting Dashboard</h1>
        <p className="text-sm text-slate-400 mt-1">Financial overview and key metrics</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {kpis.map((kpi, i) => {
          const Icon = kpi.icon;
          return (
            <div
              key={kpi.label}
              className="bg-white/5 border border-white/5 rounded-xl p-4 hover:bg-white/[0.07] transition"
              style={{ transitionDelay: `${i * 50}ms` }}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-9 h-9 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                  <Icon className={`w-4.5 h-4.5 ${kpi.color}`} />
                </div>
                <p className="text-xs text-slate-400">{kpi.label}</p>
              </div>
              <p className="text-xl font-bold text-white">{kpi.value}</p>
              {kpi.sub && <p className="text-xs text-slate-500 mt-1">{kpi.sub}</p>}
              {kpi.trend && (
                <div className="flex items-center gap-1 mt-1">
                  {kpi.up ? <ArrowUpRight className="w-3 h-3 text-green-400" /> : <ArrowDownRight className="w-3 h-3 text-red-400" />}
                  <span className={`text-xs ${kpi.up ? "text-green-400" : "text-red-400"}`}>{kpi.trend}</span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Two-Column Tables */}
      <div className="grid grid-cols-2 gap-6">
        {/* Recent Invoices */}
        <div className="bg-white/5 border border-white/5 rounded-xl">
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Recent Invoices (AR)</h2>
            <a href="/accounting/invoices" className="text-xs text-[#C8963E] hover:underline">View All</a>
          </div>
          <div className="divide-y divide-white/5">
            {data?.recentInvoices?.length ? data.recentInvoices.map((inv) => (
              <div key={inv.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-white font-medium">{inv.invoiceNumber}</p>
                  <p className="text-xs text-slate-400">{inv.shipper}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-white">{formatCurrency(inv.amount)}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${INVOICE_STATUS[inv.status] || "bg-slate-500/20 text-slate-400"}`}>
                    {inv.status}
                  </span>
                </div>
              </div>
            )) : (
              <div className="px-5 py-8 text-center text-sm text-slate-500">No invoices found</div>
            )}
          </div>
        </div>

        {/* Recent Carrier Payments */}
        <div className="bg-white/5 border border-white/5 rounded-xl">
          <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-white">Recent Carrier Payments (AP)</h2>
            <a href="/accounting/payments" className="text-xs text-[#C8963E] hover:underline">View All</a>
          </div>
          <div className="divide-y divide-white/5">
            {data?.recentPayments?.length ? data.recentPayments.map((pay) => (
              <div key={pay.id} className="px-5 py-3 flex items-center justify-between">
                <div>
                  <p className="text-sm text-white font-medium">{pay.paymentNumber}</p>
                  <p className="text-xs text-slate-400">{pay.carrier}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-white">{formatCurrency(pay.amount)}</p>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${PAY_STATUS[pay.status] || "bg-slate-500/20 text-slate-400"}`}>
                    {pay.status}
                  </span>
                </div>
              </div>
            )) : (
              <div className="px-5 py-8 text-center text-sm text-slate-500">No payments found</div>
            )}
          </div>
        </div>
      </div>

      {/* Alert Banner */}
      {data && data.overdueInvoices > 0 && (
        <div className="mt-6 bg-red-500/10 border border-red-500/20 rounded-xl px-5 py-4 flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-red-400 shrink-0" />
          <div>
            <p className="text-sm text-red-400 font-medium">{data.overdueInvoices} Overdue Invoice{data.overdueInvoices > 1 ? "s" : ""}</p>
            <p className="text-xs text-red-400/70">Review aging report and send reminders to collect outstanding payments.</p>
          </div>
          <a href="/accounting/aging" className="ml-auto text-xs text-red-400 hover:underline whitespace-nowrap">View Aging Report &rarr;</a>
        </div>
      )}
    </div>
  );
}
