"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { BarChart3, TrendingUp, TrendingDown, DollarSign, Search, ChevronLeft, ChevronRight, ArrowUpRight, ArrowDownRight } from "lucide-react";

interface LoadPnL {
  id: string;
  referenceNumber: string;
  originCity: string;
  originState: string;
  destCity: string;
  destState: string;
  customerRate: number | null;
  carrierRate: number | null;
  fuelSurcharge: number | null;
  accessorialsTotal: number | null;
  totalRevenue: number;
  totalCost: number;
  grossMargin: number;
  marginPercent: number;
  revenuePerMile: number | null;
  costPerMile: number | null;
  marginPerMile: number | null;
  distance: number | null;
  status: string;
  deliveryDate: string | null;
  carrier: string;
  customer: string;
}

interface PnLSummary {
  totalRevenue: number;
  totalCost: number;
  totalMargin: number;
  avgMarginPercent: number;
  avgRevenuePerMile: number;
  totalLoads: number;
  loads: LoadPnL[];
  totalPages: number;
}

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

export default function LoadPnLPage() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<"margin" | "revenue" | "marginPercent">("margin");

  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  qs.set("page", String(page));
  qs.set("sortBy", sortBy);

  const { data, isLoading } = useQuery<PnLSummary>({
    queryKey: ["load-pnl", search, page, sortBy],
    queryFn: () => api.get(`/accounting/pnl/loads?${qs}`).then(r => r.data),
  });

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Load P&L Analysis</h1>
        <p className="text-sm text-slate-400 mt-1">Per-load profitability breakdown</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4 mb-8">
        {[
          { label: "Total Revenue", value: fmt(data?.totalRevenue || 0), color: "text-green-400", bg: "bg-green-500/10" },
          { label: "Total Cost", value: fmt(data?.totalCost || 0), color: "text-red-400", bg: "bg-red-500/10" },
          { label: "Gross Margin", value: fmt(data?.totalMargin || 0), color: "text-[#C8963E]", bg: "bg-[#C8963E]/10" },
          { label: "Avg Margin %", value: `${(data?.avgMarginPercent || 0).toFixed(1)}%`, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Avg Rev/Mile", value: `$${(data?.avgRevenuePerMile || 0).toFixed(2)}`, color: "text-purple-400", bg: "bg-purple-500/10" },
        ].map(card => (
          <div key={card.label} className="bg-white/5 border border-white/5 rounded-xl p-4">
            <p className="text-xs text-slate-400 mb-1">{card.label}</p>
            <p className={`text-xl font-bold ${card.color}`}>{card.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search load # or customer..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C8963E]/50"
          />
        </div>
        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
          className="bg-white/5 border border-white/10 rounded-lg text-sm text-white px-3 py-2 focus:outline-none"
        >
          <option value="margin">Sort by Margin $</option>
          <option value="marginPercent">Sort by Margin %</option>
          <option value="revenue">Sort by Revenue</option>
        </select>
      </div>

      {/* P&L Table */}
      <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Load</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Route</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Customer</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Carrier</th>
              <th className="text-right text-xs text-slate-500 font-medium px-5 py-3">Revenue</th>
              <th className="text-right text-xs text-slate-500 font-medium px-5 py-3">Cost</th>
              <th className="text-right text-xs text-slate-500 font-medium px-5 py-3">Margin</th>
              <th className="text-right text-xs text-slate-500 font-medium px-5 py-3">Margin %</th>
              <th className="text-right text-xs text-slate-500 font-medium px-5 py-3">Rev/Mi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              [...Array(5)].map((_, i) => <tr key={i}><td colSpan={9} className="px-5 py-3"><div className="h-5 bg-white/5 rounded animate-pulse" /></td></tr>)
            ) : data?.loads?.length ? (
              data.loads.map(load => {
                const isProfit = load.grossMargin >= 0;
                return (
                  <tr key={load.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3 text-sm text-white font-medium">{load.referenceNumber}</td>
                    <td className="px-5 py-3 text-xs text-slate-400">{load.originCity}, {load.originState} → {load.destCity}, {load.destState}</td>
                    <td className="px-5 py-3 text-sm text-slate-300">{load.customer}</td>
                    <td className="px-5 py-3 text-sm text-slate-300">{load.carrier}</td>
                    <td className="px-5 py-3 text-sm text-green-400 text-right font-medium">{fmt(load.totalRevenue)}</td>
                    <td className="px-5 py-3 text-sm text-red-400 text-right">{fmt(load.totalCost)}</td>
                    <td className="px-5 py-3 text-right">
                      <span className={`text-sm font-bold ${isProfit ? "text-[#C8963E]" : "text-red-400"}`}>
                        {isProfit ? "+" : ""}{fmt(load.grossMargin)}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {isProfit ? <ArrowUpRight className="w-3 h-3 text-green-400" /> : <ArrowDownRight className="w-3 h-3 text-red-400" />}
                        <span className={`text-sm ${isProfit ? "text-green-400" : "text-red-400"}`}>{load.marginPercent.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-300 text-right">{load.revenuePerMile ? `$${load.revenuePerMile.toFixed(2)}` : "—"}</td>
                  </tr>
                );
              })
            ) : (
              <tr><td colSpan={9} className="px-5 py-12 text-center text-sm text-slate-500">No loads with P&L data</td></tr>
            )}
          </tbody>
        </table>

        {data && data.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
            <p className="text-xs text-slate-500">{data.totalLoads} total loads</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs text-slate-400">Page {page} of {data.totalPages}</span>
              <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
