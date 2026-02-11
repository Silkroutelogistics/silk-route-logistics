"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  DollarSign, TrendingUp, CreditCard, CheckCircle2, Clock,
  ArrowDownRight, ArrowUpRight, Download, FileText, Truck,
  PieChart as PieChartIcon, BarChart3,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

// ---- Types ----
interface FinanceSummary {
  totalRevenue: number; totalExpenses: number; netProfit: number; invoiceCount: number;
  monthlyData: { month: string; revenue: number; expenses: number }[];
}
interface ARItem {
  id: string; invoiceNumber: string; amount: number; status: string; createdAt: string;
  user?: { company: string | null; firstName: string; lastName: string };
  load?: { originCity: string; originState: string; destCity: string; destState: string };
}
interface AgingDetail {
  invoices: ARItem[]; bucket: string; total: number; count: number;
}
interface MarginItem {
  loadId: string; referenceNumber: string; customerRate: number; carrierCost: number;
  grossMargin: number; marginPercent: number;
  originCity: string; originState: string; destCity: string; destState: string;
}
interface MarginAnalysis {
  loads: MarginItem[]; averageMargin: number; totalProfit: number; totalRevenue: number;
}
interface PLData {
  revenue: number; carrierPay: number; factoringFees: number; netProfit: number;
  monthly: { month: string; revenue: number; carrierPay: number; factoringFees: number; netProfit: number }[];
}
interface PaymentEvent {
  id: string; type: "received" | "sent"; amount: number; date: string;
  reference: string; entity: string;
}
interface PayablesSummary {
  totalOwed: number; totalPaid: number; totalScheduled: number; quickPaySavings: number;
}

const TABS = ["Overview", "Receivables", "Payables", "Margins", "P&L", "Payments"] as const;
type Tab = (typeof TABS)[number];

const CHART_COLORS = ["#D4A843", "#94A3B8", "#22C55E", "#3B82F6", "#EF4444", "#A855F7"];

// ---- Main Component ----
export default function FinancePage() {
  const [tab, setTab] = useState<Tab>("Overview");
  const [period, setPeriod] = useState("monthly");

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

      {/* Tab bar */}
      <div className="flex gap-1 bg-white/5 rounded-lg p-1 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${tab === t ? "bg-gold/20 text-gold border border-gold/30" : "text-slate-400 hover:text-white hover:bg-white/5"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && <OverviewTab period={period} />}
      {tab === "Receivables" && <ReceivablesTab />}
      {tab === "Payables" && <PayablesTab />}
      {tab === "Margins" && <MarginsTab />}
      {tab === "P&L" && <PLTab period={period} />}
      {tab === "Payments" && <PaymentsTab />}
    </div>
  );
}

// ---- Overview Tab ----
function OverviewTab({ period }: { period: string }) {
  const queryClient = useQueryClient();

  const { data: summary } = useQuery({
    queryKey: ["finance-summary", period],
    queryFn: () => api.get<FinanceSummary>(`/accounting/summary?period=${period}`).then((r) => r.data),
  });

  const { data: receivables } = useQuery({
    queryKey: ["finance-ar"],
    queryFn: () => api.get<{ invoices: ARItem[]; aging: Record<string, number> }>("/accounting/receivable").then((r) => r.data),
  });

  const { data: payablesSummary } = useQuery({
    queryKey: ["carrier-pay-summary"],
    queryFn: () => api.get<PayablesSummary>("/carrier-pay/summary").then((r) => r.data),
  });

  const totalRevenue = summary?.totalRevenue || 0;
  const totalExpenses = summary?.totalExpenses || 0;
  const profit = summary?.netProfit || (totalRevenue - totalExpenses);
  const totalAR = receivables?.invoices?.reduce((s, i) => s + i.amount, 0) || 0;

  return (
    <div className="space-y-6">
      {/* KPIs */}
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

      {/* Mini Aging + Payables */}
      <div className="grid sm:grid-cols-2 gap-4">
        {receivables?.aging && (
          <div className="bg-white/5 rounded-xl border border-white/10 p-5">
            <h3 className="font-semibold text-white mb-3 text-sm flex items-center gap-2"><BarChart3 className="w-4 h-4 text-gold" /> AR Aging</h3>
            <div className="space-y-2">
              {Object.entries(receivables.aging).map(([bucket, amount]) => {
                const max = Math.max(...Object.values(receivables.aging).map(Number));
                const pct = max > 0 ? (Number(amount) / max) * 100 : 0;
                return (
                  <div key={bucket} className="flex items-center gap-3 text-xs">
                    <span className="w-16 text-slate-400">{bucket}</span>
                    <div className="flex-1 bg-white/5 rounded-full h-2"><div className="bg-gold/60 rounded-full h-2" style={{ width: `${pct}%` }} /></div>
                    <span className="w-16 text-right text-white">${((amount as number) / 1000).toFixed(1)}K</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <h3 className="font-semibold text-white mb-3 text-sm flex items-center gap-2"><Truck className="w-4 h-4 text-gold" /> Carrier Payables</h3>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between"><span className="text-slate-400">Outstanding</span><span className="text-yellow-400 font-bold">${((payablesSummary?.totalOwed || 0) / 1000).toFixed(1)}K</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Scheduled</span><span className="text-blue-400">${((payablesSummary?.totalScheduled || 0) / 1000).toFixed(1)}K</span></div>
            <div className="flex justify-between"><span className="text-slate-400">Paid</span><span className="text-green-400">${((payablesSummary?.totalPaid || 0) / 1000).toFixed(1)}K</span></div>
            <div className="flex justify-between"><span className="text-slate-400">QuickPay Savings</span><span className="text-gold">${((payablesSummary?.quickPaySavings || 0) / 1000).toFixed(1)}K</span></div>
          </div>
        </div>
      </div>

      {/* Top Outstanding */}
      {receivables?.invoices && receivables.invoices.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <h3 className="font-semibold text-white mb-3 text-sm">Top Outstanding Invoices</h3>
          <div className="space-y-2">
            {receivables.invoices.slice(0, 5).map((inv) => (
              <div key={inv.id} className="flex items-center justify-between text-xs bg-white/5 rounded-lg px-3 py-2">
                <div>
                  <span className="text-white font-mono">{inv.invoiceNumber}</span>
                  <span className="text-slate-500 ml-2">{inv.user?.company || `${inv.user?.firstName} ${inv.user?.lastName}`}</span>
                </div>
                <span className="text-gold font-bold">${inv.amount.toLocaleString()}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Receivables Tab ----
function ReceivablesTab() {
  const queryClient = useQueryClient();
  const [selectedBucket, setSelectedBucket] = useState<string | null>(null);

  const { data: receivables } = useQuery({
    queryKey: ["finance-ar"],
    queryFn: () => api.get<{ invoices: ARItem[]; aging: Record<string, number> }>("/accounting/receivable").then((r) => r.data),
  });

  const { data: agingDetail } = useQuery({
    queryKey: ["aging-detail", selectedBucket],
    queryFn: () => api.get<AgingDetail>(`/accounting/aging/${selectedBucket}`).then((r) => r.data),
    enabled: !!selectedBucket,
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => api.patch(`/accounting/invoices/${id}/pay`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["finance-ar"] });
      queryClient.invalidateQueries({ queryKey: ["aging-detail"] });
    },
  });

  const bucketColors: Record<string, string> = {
    "0-30": "text-green-400 border-green-500/30",
    "31-60": "text-yellow-400 border-yellow-500/30",
    "61-90": "text-orange-400 border-orange-500/30",
    "90+": "text-red-400 border-red-500/30",
  };

  const exportCSV = (items: ARItem[]) => {
    const headers = "Invoice #,Customer,Amount,Status,Created\n";
    const rows = items.map((inv) =>
      `${inv.invoiceNumber},${inv.user?.company || `${inv.user?.firstName} ${inv.user?.lastName}`},${inv.amount},${inv.status},${new Date(inv.createdAt).toLocaleDateString()}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `receivables-${selectedBucket || "all"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Aging Buckets */}
      <div className="grid sm:grid-cols-4 gap-4">
        {receivables?.aging && Object.entries(receivables.aging).map(([bucket, amount]) => (
          <button key={bucket} onClick={() => setSelectedBucket(selectedBucket === bucket ? null : bucket)}
            className={cn("bg-white/5 rounded-xl border p-5 text-left transition hover:bg-white/10",
              selectedBucket === bucket ? bucketColors[bucket] || "border-white/10" : "border-white/10")}>
            <p className="text-xs text-slate-400 mb-1">{bucket} Days</p>
            <p className={cn("text-2xl font-bold", (bucketColors[bucket] || "text-white").split(" ")[0])}>${((amount as number) / 1000).toFixed(1)}K</p>
            <p className="text-[10px] text-slate-500 mt-1">Click to view details</p>
          </button>
        ))}
      </div>

      {/* Detail */}
      {selectedBucket && agingDetail && (
        <div className="bg-white/5 rounded-xl border border-white/10">
          <div className="px-6 py-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-semibold text-white text-sm">{selectedBucket} Days — {agingDetail.count} invoices (${(agingDetail.total / 1000).toFixed(1)}K)</h3>
            <button onClick={() => exportCSV(agingDetail.invoices)} className="flex items-center gap-1.5 text-xs text-gold hover:underline">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
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
              {agingDetail.invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-white/5">
                  <td className="px-6 py-3 text-white font-mono text-xs">{inv.invoiceNumber}</td>
                  <td className="px-4 py-3 text-slate-300 text-xs">{inv.user?.company || `${inv.user?.firstName} ${inv.user?.lastName}`}</td>
                  <td className="px-4 py-3 text-right text-white">${inv.amount.toLocaleString()}</td>
                  <td className="px-4 py-3"><span className="px-2 py-0.5 bg-yellow-500/20 text-yellow-400 rounded text-xs">{inv.status}</span></td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => markPaid.mutate(inv.id)} className="text-xs text-gold hover:underline flex items-center gap-1 ml-auto">
                      <CheckCircle2 className="w-3 h-3" /> Mark Paid
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Full AR Table */}
      {!selectedBucket && (
        <div className="bg-white/5 rounded-xl border border-white/10">
          <div className="px-6 py-4 border-b border-white/10">
            <h3 className="font-semibold text-white text-sm">All Outstanding Receivables</h3>
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
                  <td className="px-4 py-3 text-slate-300 text-xs">{inv.user?.company || `${inv.user?.firstName} ${inv.user?.lastName}`}</td>
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
      )}
    </div>
  );
}

// ---- Payables Tab ----
function PayablesTab() {
  const { data: summary } = useQuery({
    queryKey: ["carrier-pay-summary"],
    queryFn: () => api.get<PayablesSummary>("/carrier-pay/summary").then((r) => r.data),
  });

  const pieData = summary ? [
    { name: "Outstanding", value: summary.totalOwed, color: "#EAB308" },
    { name: "Scheduled", value: summary.totalScheduled, color: "#3B82F6" },
    { name: "Paid", value: summary.totalPaid, color: "#22C55E" },
  ].filter((d) => d.value > 0) : [];

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-4 gap-4">
        <StatCard icon={<DollarSign className="w-5 h-5" />} label="Outstanding" value={`$${((summary?.totalOwed || 0) / 1000).toFixed(1)}K`} color="text-yellow-400" />
        <StatCard icon={<Clock className="w-5 h-5" />} label="Scheduled" value={`$${((summary?.totalScheduled || 0) / 1000).toFixed(1)}K`} color="text-blue-400" />
        <StatCard icon={<CheckCircle2 className="w-5 h-5" />} label="Paid" value={`$${((summary?.totalPaid || 0) / 1000).toFixed(1)}K`} color="text-green-400" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="QuickPay Savings" value={`$${((summary?.quickPaySavings || 0) / 1000).toFixed(1)}K`} color="text-gold" />
      </div>

      {pieData.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-6">
          <h3 className="font-semibold text-white mb-4 text-sm">Payment Distribution</h3>
          <div className="flex items-center gap-8">
            <ResponsiveContainer width={200} height={200}>
              <PieChart>
                <Pie data={pieData} dataKey="value" cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={4}>
                  {pieData.map((entry, idx) => (
                    <Cell key={idx} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }} formatter={(v: number | undefined) => v != null ? `$${v.toLocaleString()}` : ""} />
              </PieChart>
            </ResponsiveContainer>
            <div className="space-y-2">
              {pieData.map((d) => (
                <div key={d.name} className="flex items-center gap-2 text-sm">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: d.color }} />
                  <span className="text-slate-400">{d.name}:</span>
                  <span className="text-white font-medium">${(d.value / 1000).toFixed(1)}K</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="bg-white/5 rounded-xl border border-white/10 p-5 text-center">
        <p className="text-slate-400 text-sm">For full payables management, visit the <a href="/dashboard/payables" className="text-gold hover:underline">Payables page</a>.</p>
      </div>
    </div>
  );
}

// ---- Margins Tab ----
function MarginsTab() {
  const { data: margins } = useQuery({
    queryKey: ["margin-analysis"],
    queryFn: () => api.get<MarginAnalysis>("/accounting/margins").then((r) => r.data),
  });

  const loads = margins?.loads || [];
  const marginBuckets = [
    { label: "<10%", count: loads.filter((l) => l.marginPercent < 10).length, color: "text-red-400" },
    { label: "10-20%", count: loads.filter((l) => l.marginPercent >= 10 && l.marginPercent < 20).length, color: "text-yellow-400" },
    { label: "20-30%", count: loads.filter((l) => l.marginPercent >= 20 && l.marginPercent < 30).length, color: "text-green-400" },
    { label: "30%+", count: loads.filter((l) => l.marginPercent >= 30).length, color: "text-emerald-400" },
  ];

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-3 gap-4">
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Avg Margin" value={`${(margins?.averageMargin || 0).toFixed(1)}%`} color="text-gold" />
        <StatCard icon={<DollarSign className="w-5 h-5" />} label="Total Profit" value={`$${((margins?.totalProfit || 0) / 1000).toFixed(1)}K`} color="text-green-400" />
        <StatCard icon={<FileText className="w-5 h-5" />} label="Loads Analyzed" value={`${loads.length}`} color="text-blue-400" />
      </div>

      {/* Distribution */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-5">
        <h3 className="font-semibold text-white mb-3 text-sm">Margin Distribution</h3>
        <div className="grid grid-cols-4 gap-3">
          {marginBuckets.map((b) => (
            <div key={b.label} className="bg-white/5 rounded-lg p-3 text-center">
              <p className={`text-2xl font-bold ${b.color}`}>{b.count}</p>
              <p className="text-xs text-slate-400 mt-1">{b.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Per-Load Table */}
      {loads.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10">
          <div className="px-6 py-4 border-b border-white/10">
            <h3 className="font-semibold text-white text-sm">Per-Load Margin Analysis</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-slate-400 border-b border-white/10">
                  <th className="text-left px-4 py-3 font-medium">Load</th>
                  <th className="text-left px-4 py-3 font-medium">Route</th>
                  <th className="text-right px-4 py-3 font-medium">Customer Rate</th>
                  <th className="text-right px-4 py-3 font-medium">Carrier Cost</th>
                  <th className="text-right px-4 py-3 font-medium">Margin</th>
                  <th className="text-right px-4 py-3 font-medium">Margin %</th>
                </tr>
              </thead>
              <tbody>
                {loads.map((l) => (
                  <tr key={l.loadId} className={cn("border-b border-white/5", l.marginPercent < 10 ? "bg-red-500/5" : "")}>
                    <td className="px-4 py-3 text-white font-mono text-xs">{l.referenceNumber}</td>
                    <td className="px-4 py-3 text-slate-300 text-xs">{l.originCity}, {l.originState} → {l.destCity}, {l.destState}</td>
                    <td className="px-4 py-3 text-right text-white">${l.customerRate.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-white">${l.carrierCost.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-green-400">${l.grossMargin.toLocaleString()}</td>
                    <td className={cn("px-4 py-3 text-right font-bold", l.marginPercent < 10 ? "text-red-400" : l.marginPercent < 20 ? "text-yellow-400" : "text-green-400")}>
                      {l.marginPercent.toFixed(1)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- P&L Tab ----
function PLTab({ period }: { period: string }) {
  const { data: pl } = useQuery({
    queryKey: ["pl-data", period],
    queryFn: () => api.get<PLData>(`/accounting/pl?period=${period}`).then((r) => r.data),
  });

  const exportCSV = () => {
    if (!pl?.monthly) return;
    const headers = "Month,Revenue,Carrier Pay,Factoring Fees,Net Profit\n";
    const rows = pl.monthly.map((m) => `${m.month},${m.revenue},${m.carrierPay},${m.factoringFees},${m.netProfit}`).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pl-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid sm:grid-cols-4 gap-4">
        <StatCard icon={<ArrowDownRight className="w-5 h-5" />} label="Revenue" value={`$${((pl?.revenue || 0) / 1000).toFixed(1)}K`} color="text-green-400" />
        <StatCard icon={<ArrowUpRight className="w-5 h-5" />} label="Carrier Pay" value={`$${((pl?.carrierPay || 0) / 1000).toFixed(1)}K`} color="text-red-400" />
        <StatCard icon={<DollarSign className="w-5 h-5" />} label="Factoring Fees" value={`$${((pl?.factoringFees || 0) / 1000).toFixed(1)}K`} color="text-orange-400" />
        <StatCard icon={<TrendingUp className="w-5 h-5" />} label="Net Profit" value={`$${((pl?.netProfit || 0) / 1000).toFixed(1)}K`} color="text-blue-400" />
      </div>

      {/* Monthly Breakdown Chart */}
      {pl?.monthly && pl.monthly.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-white text-sm">P&L Breakdown</h3>
            <button onClick={exportCSV} className="flex items-center gap-1.5 text-xs text-gold hover:underline">
              <Download className="w-3.5 h-3.5" /> Export CSV
            </button>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={pl.monthly}>
              <XAxis dataKey="month" stroke="#94a3b8" tick={{ fontSize: 11 }} />
              <YAxis stroke="#94a3b8" tick={{ fontSize: 11 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip contentStyle={{ backgroundColor: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }} formatter={(v: number | undefined) => v != null ? `$${v.toLocaleString()}` : ""} />
              <Bar dataKey="revenue" fill="#22C55E" radius={[4, 4, 0, 0]} name="Revenue" />
              <Bar dataKey="carrierPay" fill="#EF4444" radius={[4, 4, 0, 0]} name="Carrier Pay" />
              <Bar dataKey="netProfit" fill="#3B82F6" radius={[4, 4, 0, 0]} name="Net Profit" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Monthly Table */}
      {pl?.monthly && pl.monthly.length > 0 && (
        <div className="bg-white/5 rounded-xl border border-white/10">
          <div className="px-6 py-4 border-b border-white/10">
            <h3 className="font-semibold text-white text-sm">Monthly Breakdown</h3>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="text-left px-6 py-3 font-medium">Month</th>
                <th className="text-right px-4 py-3 font-medium">Revenue</th>
                <th className="text-right px-4 py-3 font-medium">Carrier Pay</th>
                <th className="text-right px-4 py-3 font-medium">Factoring</th>
                <th className="text-right px-4 py-3 font-medium">Net Profit</th>
              </tr>
            </thead>
            <tbody>
              {pl.monthly.map((m) => (
                <tr key={m.month} className="border-b border-white/5">
                  <td className="px-6 py-3 text-white">{m.month}</td>
                  <td className="px-4 py-3 text-right text-green-400">${m.revenue.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-red-400">${m.carrierPay.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-orange-400">${m.factoringFees.toLocaleString()}</td>
                  <td className="px-4 py-3 text-right text-blue-400 font-bold">${m.netProfit.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---- Payments Tab ----
function PaymentsTab() {
  const [typeFilter, setTypeFilter] = useState<"all" | "received" | "sent">("all");

  const { data: payments } = useQuery({
    queryKey: ["payment-history"],
    queryFn: () => api.get<{ payments: PaymentEvent[] }>("/accounting/payment-history").then((r) => r.data),
  });

  const items = (payments?.payments || []).filter((p) => typeFilter === "all" || p.type === typeFilter);

  return (
    <div className="space-y-6">
      <div className="flex gap-2">
        {(["all", "received", "sent"] as const).map((f) => (
          <button key={f} onClick={() => setTypeFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${typeFilter === f ? "bg-gold/20 text-gold border border-gold/30" : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"}`}>
            {f === "all" ? "All" : f === "received" ? "Received" : "Sent"}
          </button>
        ))}
      </div>

      <div className="space-y-2">
        {items.map((p) => (
          <div key={p.id} className={cn("bg-white/5 rounded-xl border border-white/10 p-4 flex items-center justify-between",
            p.type === "received" ? "border-l-2 border-l-green-500" : "border-l-2 border-l-amber-500")}>
            <div className="flex items-center gap-3">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center",
                p.type === "received" ? "bg-green-500/10" : "bg-amber-500/10")}>
                {p.type === "received"
                  ? <ArrowDownRight className="w-4 h-4 text-green-400" />
                  : <ArrowUpRight className="w-4 h-4 text-amber-400" />}
              </div>
              <div>
                <p className="text-sm text-white font-medium">{p.reference}</p>
                <p className="text-xs text-slate-400">{p.entity}</p>
              </div>
            </div>
            <div className="text-right">
              <p className={cn("text-lg font-bold", p.type === "received" ? "text-green-400" : "text-amber-400")}>
                {p.type === "received" ? "+" : "-"}${p.amount.toLocaleString()}
              </p>
              <p className="text-xs text-slate-500">{new Date(p.date).toLocaleDateString()}</p>
            </div>
          </div>
        ))}
        {items.length === 0 && (
          <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center text-slate-500">No payment history found</div>
        )}
      </div>
    </div>
  );
}

// ---- Shared StatCard ----
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
