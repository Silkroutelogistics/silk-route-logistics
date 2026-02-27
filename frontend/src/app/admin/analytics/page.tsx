"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Package, DollarSign, Truck, Users, ArrowRight } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  AreaChart, Area, PieChart, Pie, Cell,
} from "recharts";

interface KPIs {
  totalLoads: number;
  totalRevenue: number;
  activeCarriers: number;
  activeShippers: number;
}

interface LoadsByStatus {
  status: string;
  count: number;
}

interface RevenueByMonth {
  month: string;
  revenue: number;
}

interface TopLane {
  originState: string;
  destState: string;
  loadCount: number;
  avgRate: number;
}

interface AnalyticsResponse {
  kpis: KPIs;
  loadsByStatus: LoadsByStatus[];
  revenueByMonth: RevenueByMonth[];
  topLanes: TopLane[];
}

const CHART_COLORS = ["#D4AF37", "#3B82F6", "#10B981", "#8B5CF6", "#F59E0B", "#EC4899", "#06B6D4", "#F97316"];

const tooltipFormatter = (value: number | undefined) => {
  if (value === undefined) return "";
  return value.toLocaleString();
};

const currencyFormatter = (value: number | undefined) => {
  if (value === undefined) return "";
  return `$${value.toLocaleString()}`;
};

export default function AdminAnalyticsPage() {
  const { data, isLoading } = useQuery<AnalyticsResponse>({
    queryKey: ["admin-analytics"],
    queryFn: () => api.get("/admin/analytics").then((r) => r.data),
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-slate-500 text-sm">Loading analytics...</div>
      </div>
    );
  }

  const kpis = data?.kpis;
  const kpiCards = [
    {
      label: "Total Loads",
      value: kpis?.totalLoads?.toLocaleString() ?? "0",
      icon: Package,
      color: "text-blue-400",
      bg: "bg-blue-500/10",
    },
    {
      label: "Total Revenue",
      value: `$${(kpis?.totalRevenue ?? 0).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`,
      icon: DollarSign,
      color: "text-gold",
      bg: "bg-gold/10",
    },
    {
      label: "Active Carriers",
      value: kpis?.activeCarriers?.toLocaleString() ?? "0",
      icon: Truck,
      color: "text-emerald-400",
      bg: "bg-emerald-500/10",
    },
    {
      label: "Active Shippers",
      value: kpis?.activeShippers?.toLocaleString() ?? "0",
      icon: Users,
      color: "text-purple-400",
      bg: "bg-purple-500/10",
    },
  ];

  return (
    <div className="p-6 space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-white">Platform Analytics</h1>
        <p className="text-slate-400 text-sm mt-1">Overview of platform performance and key metrics</p>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {kpiCards.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-white/5 border border-white/10 rounded-xl p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs text-slate-400 uppercase tracking-wider">{kpi.label}</span>
                <div className={`p-2 rounded-lg ${kpi.bg}`}>
                  <Icon className={`w-4 h-4 ${kpi.color}`} />
                </div>
              </div>
              <p className="text-2xl font-bold text-white">{kpi.value}</p>
            </div>
          );
        })}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Loads by Status - Horizontal Bar */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Loads by Status</h3>
          <div className="h-[300px]">
            {data?.loadsByStatus?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.loadsByStatus} layout="vertical" margin={{ left: 20, right: 20 }}>
                  <XAxis type="number" tick={{ fill: "#64748b", fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis
                    type="category"
                    dataKey="status"
                    tick={{ fill: "#94a3b8", fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={100}
                  />
                  <Tooltip
                    formatter={tooltipFormatter}
                    contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Bar dataKey="count" fill="#D4AF37" radius={[0, 4, 4, 0]} barSize={20} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data available</div>
            )}
          </div>
        </div>

        {/* Revenue Trend - Area Chart */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Revenue Trend (Last 12 Months)</h3>
          <div className="h-[300px]">
            {data?.revenueByMonth?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.revenueByMonth} margin={{ left: 10, right: 10 }}>
                  <defs>
                    <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#D4AF37" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#D4AF37" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="month" tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: "#64748b", fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip
                    formatter={currencyFormatter}
                    contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#D4AF37"
                    strokeWidth={2}
                    fill="url(#revenueGradient)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data available</div>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Lanes */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Top 5 Lanes</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-2 text-slate-400 font-medium">Lane</th>
                  <th className="text-right py-2 text-slate-400 font-medium">Loads</th>
                  <th className="text-right py-2 text-slate-400 font-medium">Avg Rate</th>
                </tr>
              </thead>
              <tbody>
                {!data?.topLanes?.length ? (
                  <tr>
                    <td colSpan={3} className="py-6 text-center text-slate-500">No data available</td>
                  </tr>
                ) : (
                  data.topLanes.map((lane, i) => (
                    <tr key={i} className="border-b border-white/5">
                      <td className="py-2.5 text-white">
                        <span className="flex items-center gap-1.5">
                          {lane.originState}
                          <ArrowRight className="w-3 h-3 text-slate-500" />
                          {lane.destState}
                        </span>
                      </td>
                      <td className="py-2.5 text-right text-slate-300">{lane.loadCount}</td>
                      <td className="py-2.5 text-right text-gold font-medium">
                        ${lane.avgRate.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Carrier Utilization - Pie Chart */}
        <div className="bg-white/5 border border-white/10 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-white mb-4">Load Distribution by Status</h3>
          <div className="h-[280px]">
            {data?.loadsByStatus?.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={data.loadsByStatus}
                    dataKey="count"
                    nameKey="status"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    innerRadius={50}
                    paddingAngle={2}
                    label={({ name, percent }: { name?: string; percent?: number }) => `${name || ""} (${((percent || 0) * 100).toFixed(0)}%)`}
                    labelLine={{ stroke: "#475569" }}
                  >
                    {data.loadsByStatus.map((_, index) => (
                      <Cell key={index} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={tooltipFormatter}
                    contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-500 text-sm">No data available</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
