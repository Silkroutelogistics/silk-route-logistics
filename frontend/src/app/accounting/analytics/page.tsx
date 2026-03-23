"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BarChart3, TrendingUp, DollarSign, Clock, Download, Truck, Users, MapPin } from "lucide-react";
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, PieChart, Pie } from "recharts";

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);
const pct = (n: number) => `${n.toFixed(1)}%`;

const PERIODS = ["This Week", "This Month", "This Quarter", "YTD"] as const;
const TABS = ["Revenue & Margin", "Cash Flow", "AR Analysis", "AP Analysis", "Profitability", "Export"] as const;
const COLORS = { gold: "#c8a951", blue: "#3b82f6", green: "#22c55e", red: "#ef4444" };

export default function FinancialAnalyticsPage() {
  const [period, setPeriod] = useState<string>("This Quarter");
  const [tab, setTab] = useState<string>("Revenue & Margin");
  const [profView, setProfView] = useState<"lane" | "carrier" | "shipper">("lane");

  const { data: kpi } = useQuery({ queryKey: ["acct-dash"], queryFn: () => api.get("/accounting/dashboard").then(r => r.data) });
  const { data: loadPnl } = useQuery({ queryKey: ["acct-loads"], queryFn: () => api.get("/accounting/pnl/loads?page=1&limit=100").then(r => r.data) });
  const { data: lanes } = useQuery({ queryKey: ["acct-lanes"], queryFn: () => api.get("/accounting/pnl/lanes").then(r => r.data) });
  const { data: carriers } = useQuery({ queryKey: ["acct-carriers"], queryFn: () => api.get("/accounting/pnl/carriers").then(r => r.data) });
  const { data: shippers } = useQuery({ queryKey: ["acct-shippers"], queryFn: () => api.get("/accounting/pnl/shippers").then(r => r.data) });
  const { data: arAging } = useQuery({ queryKey: ["acct-ar-aging"], queryFn: () => api.get("/accounting/invoices/aging").then(r => r.data) });
  const { data: apAging } = useQuery({ queryKey: ["acct-ap-aging"], queryFn: () => api.get("/accounting/payments/aging").then(r => r.data) });
  const { data: fundPerf } = useQuery({ queryKey: ["acct-fund-perf"], queryFn: () => api.get("/accounting/fund/performance").then(r => r.data) });

  // Build monthly revenue chart from load data
  const monthlyChart = (() => {
    if (!loadPnl?.loads) return [];
    const byMonth: Record<string, { revenue: number; cost: number }> = {};
    for (const l of loadPnl.loads as any[]) {
      const d = l.deliveryDate || l.createdAt;
      if (!d) continue;
      const mo = d.slice(0, 7);
      if (!byMonth[mo]) byMonth[mo] = { revenue: 0, cost: 0 };
      byMonth[mo].revenue += l.totalRevenue || 0;
      byMonth[mo].cost += l.totalCost || 0;
    }
    return Object.entries(byMonth).sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ month: m, ...v }));
  })();

  // AR aging buckets
  const arBuckets = (() => {
    if (!arAging?.summary) return [];
    const s = arAging.summary;
    return [
      { label: "Current", amount: s.current || 0, count: arAging.buckets?.current?.invoices?.length || 0, color: COLORS.green },
      { label: "1-30 Days", amount: s["1-30"] || 0, count: arAging.buckets?.["1-30"]?.invoices?.length || 0, color: "#eab308" },
      { label: "31-60 Days", amount: s["31-60"] || 0, count: arAging.buckets?.["31-60"]?.invoices?.length || 0, color: "#f97316" },
      { label: "61-90 Days", amount: s["61-90"] || 0, count: arAging.buckets?.["61-90"]?.invoices?.length || 0, color: COLORS.red },
      { label: "90+ Days", amount: s["90+"] || 0, count: arAging.buckets?.["90+"]?.invoices?.length || 0, color: "#dc2626" },
    ];
  })();

  // AP aging buckets
  const apBuckets = (() => {
    if (!apAging?.summary) return [];
    const s = apAging.summary;
    return [
      { label: "Current", amount: s.current || 0, count: apAging.buckets?.current?.payments?.length || apAging.buckets?.current?.invoices?.length || 0, color: COLORS.green },
      { label: "1-30 Days", amount: s["1-30"] || 0, count: apAging.buckets?.["1-30"]?.payments?.length || 0, color: "#eab308" },
      { label: "31-60 Days", amount: s["31-60"] || 0, count: apAging.buckets?.["31-60"]?.payments?.length || 0, color: "#f97316" },
      { label: "61-90 Days", amount: s["61-90"] || 0, count: apAging.buckets?.["61-90"]?.payments?.length || 0, color: COLORS.red },
      { label: "90+ Days", amount: s["90+"] || 0, count: apAging.buckets?.["90+"]?.payments?.length || 0, color: "#dc2626" },
    ];
  })();

  const handleExport = async (type: string) => {
    try {
      const res = await api.post("/accounting/export", { type }, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href = url; a.download = `${type}-export.csv`; a.click();
      window.URL.revokeObjectURL(url);
    } catch { /* noop */ }
  };

  const KpiCard = ({ label, value, icon: Icon, color }: { label: string; value: string; icon: any; color: string }) => (
    <div className="bg-white/5 border border-white/10 rounded-xl p-5">
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${color}`} />
        <span className="text-xs text-slate-400">{label}</span>
      </div>
      <p className={`text-xl font-bold ${color}`}>{value}</p>
    </div>
  );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-gold" /> Financial Analytics
          </h1>
          <p className="text-sm text-slate-400 mt-1">Comprehensive financial performance insights</p>
        </div>
        <div className="flex gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
          {PERIODS.map(p => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-xs rounded-md transition ${period === p ? "bg-gold/20 text-gold font-medium" : "text-slate-400 hover:text-white"}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 border-b border-white/10 pb-px">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium transition border-b-2 -mb-px ${tab === t ? "border-gold text-gold" : "border-transparent text-slate-400 hover:text-white"}`}>
            {t}
          </button>
        ))}
      </div>

      {/* Revenue & Margin */}
      {tab === "Revenue & Margin" && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <KpiCard label="Quarter Revenue" value={fmt(kpi?.qpRevenue || kpi?.mtdRevenue || 0)} icon={DollarSign} color="text-green-400" />
            <KpiCard label="Avg Margin" value={pct(kpi?.avgMargin || loadPnl?.avgMarginPercent || 0)} icon={TrendingUp} color="text-gold" />
            <KpiCard label="Total Loads" value={String(loadPnl?.totalLoads || 0)} icon={Truck} color="text-blue-400" />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-medium text-white mb-4">Revenue vs Carrier Cost by Month</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={monthlyChart}>
                <XAxis dataKey="month" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
                  formatter={(v: number | undefined) => v != null ? fmt(v) : "$0"} />
                <Bar dataKey="revenue" name="Revenue" fill={COLORS.gold} radius={[4, 4, 0, 0]} />
                <Bar dataKey="cost" name="Carrier Cost" fill={COLORS.blue} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-medium text-white mb-3">Margin Distribution</h3>
            <table className="w-full text-sm">
              <thead><tr className="text-slate-400 border-b border-white/10">
                <th className="text-left py-2">Load #</th><th className="text-left py-2">Lane</th>
                <th className="text-right py-2">Revenue</th><th className="text-right py-2">Cost</th>
                <th className="text-right py-2">Margin</th><th className="text-right py-2">Margin %</th>
              </tr></thead>
              <tbody>
                {(loadPnl?.loads || []).slice(0, 10).map((l: any) => (
                  <tr key={l.id} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2 text-white font-mono text-xs">{l.referenceNumber}</td>
                    <td className="py-2 text-slate-300 text-xs">{l.originCity}, {l.originState} → {l.destCity}, {l.destState}</td>
                    <td className="py-2 text-right text-green-400">{fmt(l.totalRevenue)}</td>
                    <td className="py-2 text-right text-red-400">{fmt(l.totalCost)}</td>
                    <td className="py-2 text-right text-gold">{fmt(l.grossMargin)}</td>
                    <td className={`py-2 text-right ${l.marginPercent >= 15 ? "text-green-400" : l.marginPercent >= 0 ? "text-yellow-400" : "text-red-400"}`}>
                      {pct(l.marginPercent)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Cash Flow */}
      {tab === "Cash Flow" && (
        <div className="space-y-6">
          <div className="grid grid-cols-3 gap-4">
            <KpiCard label="Fund Balance" value={fmt(kpi?.cashBalance || 0)} icon={DollarSign} color="text-green-400" />
            <KpiCard label="AR Outstanding" value={fmt(kpi?.arOutstanding || 0)} icon={TrendingUp} color="text-gold" />
            <KpiCard label="AP Due" value={fmt(kpi?.apDue || 0)} icon={Clock} color="text-red-400" />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-medium text-white mb-4">Fund Performance Over Time</h3>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={Array.isArray(fundPerf) ? fundPerf : fundPerf?.data || []}>
                <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} />
                <YAxis tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
                  formatter={(v: number | undefined) => v != null ? fmt(v) : "$0"} />
                <Line type="monotone" dataKey="balance" stroke={COLORS.gold} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="inflow" stroke={COLORS.green} strokeWidth={1.5} dot={false} />
                <Line type="monotone" dataKey="outflow" stroke={COLORS.red} strokeWidth={1.5} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* AR Analysis */}
      {tab === "AR Analysis" && (
        <div className="space-y-6">
          <div className="grid grid-cols-5 gap-4">
            {arBuckets.map(b => (
              <div key={b.label} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1">{b.label}</p>
                <p className="text-lg font-bold text-white">{fmt(b.amount)}</p>
                <p className="text-xs text-slate-500 mt-1">{b.count} invoices</p>
                <div className="mt-2 h-1 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ backgroundColor: b.color, width: `${arAging?.summary?.grandTotal ? (b.amount / arAging.summary.grandTotal) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-medium text-white mb-4">AR Aging Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart layout="vertical" data={arBuckets}>
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} width={90} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
                  formatter={(v: number | undefined) => v != null ? fmt(v) : "$0"} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {arBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* AP Analysis */}
      {tab === "AP Analysis" && (
        <div className="space-y-6">
          <div className="grid grid-cols-5 gap-4">
            {apBuckets.map(b => (
              <div key={b.label} className="bg-white/5 border border-white/10 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-1">{b.label}</p>
                <p className="text-lg font-bold text-white">{fmt(b.amount)}</p>
                <p className="text-xs text-slate-500 mt-1">{b.count} payments</p>
                <div className="mt-2 h-1 rounded-full bg-white/10"><div className="h-full rounded-full" style={{ backgroundColor: b.color, width: `${apAging?.summary?.grandTotal ? (b.amount / apAging.summary.grandTotal) * 100 : 0}%` }} /></div>
              </div>
            ))}
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-5">
            <h3 className="text-sm font-medium text-white mb-4">AP Aging Distribution</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart layout="vertical" data={apBuckets}>
                <XAxis type="number" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="label" tick={{ fill: "#94a3b8", fontSize: 12 }} axisLine={false} width={90} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#fff" }}
                  formatter={(v: number | undefined) => v != null ? fmt(v) : "$0"} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]}>
                  {apBuckets.map((b, i) => <Cell key={i} fill={b.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Profitability */}
      {tab === "Profitability" && (
        <div className="space-y-6">
          <div className="flex gap-2">
            {([["lane", "By Lane", MapPin], ["carrier", "By Carrier", Truck], ["shipper", "By Shipper", Users]] as const).map(([key, label, Icon]) => (
              <button key={key} onClick={() => setProfView(key)}
                className={`flex items-center gap-1.5 px-4 py-2 text-sm rounded-lg transition ${profView === key ? "bg-gold/20 text-gold" : "bg-white/5 text-slate-400 hover:text-white"}`}>
                <Icon className="w-4 h-4" /> {label}
              </button>
            ))}
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead><tr className="text-slate-400 border-b border-white/10 bg-white/5">
                <th className="text-left py-3 px-4">{profView === "lane" ? "Lane" : profView === "carrier" ? "Carrier" : "Shipper"}</th>
                <th className="text-right py-3 px-4">Revenue</th><th className="text-right py-3 px-4">Cost</th>
                <th className="text-right py-3 px-4">Margin</th><th className="text-right py-3 px-4">Margin %</th>
                <th className="text-right py-3 px-4">Loads</th>
              </tr></thead>
              <tbody>
                {(profView === "lane" ? lanes : profView === "carrier" ? carriers : shippers)?.slice?.(0, 15)?.map((r: any, i: number) => (
                  <tr key={i} className="border-b border-white/5 hover:bg-white/5">
                    <td className="py-2.5 px-4 text-white text-xs">{r.lane || r.carrier || r.shipper || r.name || "—"}</td>
                    <td className="py-2.5 px-4 text-right text-green-400">{fmt(r.totalRevenue || r.revenue || 0)}</td>
                    <td className="py-2.5 px-4 text-right text-red-400">{fmt(r.totalCost || r.cost || 0)}</td>
                    <td className="py-2.5 px-4 text-right text-gold">{fmt(r.totalMargin || r.margin || r.grossMargin || 0)}</td>
                    <td className={`py-2.5 px-4 text-right ${(r.marginPercent || r.avgMarginPercent || 0) >= 15 ? "text-green-400" : "text-yellow-400"}`}>
                      {pct(r.marginPercent || r.avgMarginPercent || 0)}
                    </td>
                    <td className="py-2.5 px-4 text-right text-slate-300">{r.loadCount || r.loads || r.totalLoads || "—"}</td>
                  </tr>
                )) || <tr><td colSpan={6} className="py-8 text-center text-slate-500">No data available</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Export */}
      {tab === "Export" && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { type: "load-pnl", label: "Load P&L Report", desc: "Per-load profitability data" },
            { type: "lane-profitability", label: "Lane Profitability", desc: "Revenue and margins by lane" },
            { type: "carrier-profitability", label: "Carrier Profitability", desc: "Performance by carrier" },
            { type: "shipper-profitability", label: "Shipper Profitability", desc: "Revenue by shipper" },
            { type: "ar-aging", label: "AR Aging Report", desc: "Accounts receivable aging" },
            { type: "ap-aging", label: "AP Aging Report", desc: "Accounts payable aging" },
            { type: "weekly-report", label: "Weekly Report", desc: "Weekly financial summary" },
            { type: "monthly-report", label: "Monthly Report", desc: "Monthly financial summary" },
            { type: "fund-performance", label: "Fund Performance", desc: "Factoring fund history" },
          ].map(e => (
            <button key={e.type} onClick={() => handleExport(e.type)}
              className="bg-white/5 border border-white/10 rounded-xl p-5 text-left hover:bg-white/10 transition group">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-white">{e.label}</span>
                <Download className="w-4 h-4 text-slate-500 group-hover:text-gold transition" />
              </div>
              <p className="text-xs text-slate-400">{e.desc}</p>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
