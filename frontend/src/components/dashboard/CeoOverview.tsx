"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import {
  Truck, DollarSign, Users, FileText, TrendingUp, Shield,
  AlertTriangle, CheckCircle2, Activity, ChevronRight,
  BarChart3, MapPin, UserCheck, Package,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

const COLORS = ["#D4A843", "#3b82f6", "#8b5cf6", "#10b981", "#f59e0b", "#ef4444"];

export function CeoOverview() {
  const { user } = useAuthStore();

  const { data: loads } = useQuery({
    queryKey: ["ceo-loads"],
    queryFn: () => api.get("/loads?limit=100").then(r => r.data),
  });

  const { data: finance } = useQuery({
    queryKey: ["ceo-finance"],
    queryFn: () => api.get("/accounting/summary?period=monthly").then(r => r.data),
  });

  const { data: customers } = useQuery({
    queryKey: ["ceo-customers"],
    queryFn: () => api.get("/customers/stats").then(r => r.data),
  });

  const { data: drivers } = useQuery({
    queryKey: ["ceo-drivers"],
    queryFn: () => api.get("/drivers/stats").then(r => r.data),
  });

  const { data: carriers } = useQuery({
    queryKey: ["ceo-carriers"],
    queryFn: () => api.get("/market/capacity").then(r => r.data),
  });

  const { data: compliance } = useQuery({
    queryKey: ["ceo-compliance"],
    queryFn: () => api.get("/compliance/stats").then(r => r.data).catch(() => null),
  });

  const { data: fleet } = useQuery({
    queryKey: ["ceo-fleet"],
    queryFn: () => api.get("/fleet/overview").then(r => r.data).catch(() => null),
  });

  const { data: regions } = useQuery({
    queryKey: ["ceo-regions"],
    queryFn: () => api.get("/market/regions").then(r => r.data),
  });

  // Computed KPIs
  const totalLoads = loads?.total || 0;
  const activeLoads = loads?.loads?.filter((l: { status: string }) =>
    ["POSTED", "BOOKED", "DISPATCHED", "PICKED_UP", "IN_TRANSIT"].includes(l.status)
  ).length || 0;
  const deliveredLoads = loads?.loads?.filter((l: { status: string }) =>
    ["DELIVERED", "COMPLETED"].includes(l.status)
  ).length || 0;
  const totalRevenue = finance?.totalRevenue || 0;
  const totalCarriers = carriers?.total || 0;
  const totalCustomers = customers?.total || 0;
  const totalDrivers = drivers?.totalDrivers || 0;
  const criticalAlerts = compliance?.bySeverity?.CRITICAL || 0;
  const warningAlerts = compliance?.bySeverity?.WARNING || 0;

  // Load status distribution for pie chart
  const statusCounts: Record<string, number> = {};
  loads?.loads?.forEach((l: { status: string }) => {
    statusCounts[l.status] = (statusCounts[l.status] || 0) + 1;
  });
  const statusData = Object.entries(statusCounts).map(([name, value]) => ({ name: name.replace(/_/g, " "), value }));

  // Revenue by region
  const regionData = Array.isArray(regions) ? regions.map((r: { region: string; loadCount: number; avgRate: number }) => ({
    region: r.region.replace(/_/g, " ").split(" ").map((w: string) => w[0] + w.slice(1).toLowerCase()).join(" "),
    loads: r.loadCount,
    avgRate: r.avgRate,
  })).filter((r: { loads: number }) => r.loads > 0) : [];

  const kpis = [
    { label: "Total Revenue", value: `$${(totalRevenue / 1000).toFixed(0)}K`, icon: DollarSign, color: "text-green-400 bg-green-500/20", trend: "+12%" },
    { label: "Active Loads", value: activeLoads, icon: Package, color: "text-blue-400 bg-blue-500/20" },
    { label: "Partner Carriers", value: totalCarriers, icon: UserCheck, color: "text-purple-400 bg-purple-500/20" },
    { label: "Customers", value: totalCustomers, icon: Users, color: "text-gold bg-gold/20" },
    { label: "Fleet Trucks", value: fleet?.totalTrucks || 0, icon: Truck, color: "text-cyan-400 bg-cyan-500/20" },
    { label: "Drivers", value: totalDrivers, icon: Users, color: "text-orange-400 bg-orange-500/20" },
    { label: "Delivered", value: deliveredLoads, icon: CheckCircle2, color: "text-emerald-400 bg-emerald-500/20" },
    { label: "Compliance Alerts", value: criticalAlerts + warningAlerts, icon: criticalAlerts > 0 ? AlertTriangle : Shield, color: criticalAlerts > 0 ? "text-red-400 bg-red-500/20" : "text-green-400 bg-green-500/20" },
  ];

  const quickLinks = [
    { label: "Load Board", href: "/dashboard/loads", icon: Package, desc: "Create & manage loads" },
    { label: "Carrier Pool", href: "/dashboard/carriers", icon: UserCheck, desc: `${totalCarriers} carriers in network` },
    { label: "Fleet", href: "/dashboard/fleet", icon: Truck, desc: `${fleet?.totalTrucks || 0} trucks, ${fleet?.totalTrailers || 0} trailers` },
    { label: "Financials", href: "/dashboard/finance", icon: DollarSign, desc: "Revenue & accounting" },
    { label: "Market Intel", href: "/dashboard/market", icon: Activity, desc: "Lane rates & trends" },
    { label: "Compliance", href: "/dashboard/compliance", icon: Shield, desc: `${criticalAlerts} critical alerts` },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* CEO Welcome Banner */}
      <div className="bg-gradient-to-r from-gold/20 via-gold/10 to-transparent rounded-2xl p-6 md:p-8 border border-gold/10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              CEO Dashboard
            </h1>
            <p className="text-slate-400 text-sm">
              Welcome back, {user?.firstName}. Here&apos;s your operations overview.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-2 text-sm">
            <span className="text-slate-500">{new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</span>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi) => {
          const Icon = kpi.icon;
          return (
            <div key={kpi.label} className="bg-white/5 rounded-xl border border-white/10 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${kpi.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
                {kpi.trend && (
                  <span className="flex items-center gap-0.5 text-xs text-green-400">
                    <TrendingUp className="w-3 h-3" /> {kpi.trend}
                  </span>
                )}
              </div>
              <p className="text-2xl font-bold text-white">{kpi.value}</p>
              <p className="text-xs text-slate-500 mt-0.5">{kpi.label}</p>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Charts Column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Load Status Distribution */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-6">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-gold" /> Load Distribution
            </h2>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                {statusData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                      <Pie data={statusData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                        {statusData.map((_: unknown, i: number) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff", fontSize: "12px" }} />
                    </PieChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-[200px] flex items-center justify-center text-slate-500 text-sm">No data</div>
                )}
              </div>
              <div className="flex flex-col justify-center space-y-2">
                {statusData.map((s: { name: string; value: number }, i: number) => (
                  <div key={s.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      <span className="text-sm text-slate-300">{s.name}</span>
                    </div>
                    <span className="text-sm font-medium text-white">{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Revenue by Region */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-6">
            <h2 className="font-semibold text-white mb-4 flex items-center gap-2">
              <MapPin className="w-4 h-4 text-gold" /> Revenue by Region
            </h2>
            {regionData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={regionData}>
                  <XAxis dataKey="region" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 11 }} angle={-20} textAnchor="end" height={60} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`} />
                  <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }} formatter={(v: number | undefined) => v != null ? [`$${v.toLocaleString()}`, "Avg Rate"] : ""} />
                  <Bar dataKey="avgRate" fill="#D4A843" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[250px] flex items-center justify-center text-slate-500 text-sm">No regional data</div>
            )}
          </div>
        </div>

        {/* Right Sidebar */}
        <div className="space-y-6">
          {/* Quick Navigation */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-5">
            <h3 className="font-semibold text-sm text-white mb-3">Command Center</h3>
            <div className="space-y-1">
              {quickLinks.map((link) => {
                const Icon = link.icon;
                return (
                  <Link key={link.href} href={link.href}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition">
                    <div className="flex items-center gap-3">
                      <Icon className="w-4 h-4 text-slate-400" />
                      <div>
                        <p className="text-sm text-white">{link.label}</p>
                        <p className="text-[10px] text-slate-500">{link.desc}</p>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </Link>
                );
              })}
            </div>
          </div>

          {/* Carrier Tier Breakdown */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-5">
            <h3 className="font-semibold text-sm text-white mb-3 flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-gold" /> Carrier Network
            </h3>
            {carriers?.carriers && (
              <div className="space-y-2">
                {["PLATINUM", "GOLD", "SILVER", "BRONZE"].map((tier) => {
                  const count = carriers.carriers.filter((c: { tier: string }) => c.tier === tier).length;
                  const pct = carriers.total > 0 ? (count / carriers.total) * 100 : 0;
                  const colors: Record<string, string> = { PLATINUM: "bg-purple-500", GOLD: "bg-yellow-500", SILVER: "bg-slate-400", BRONZE: "bg-orange-500" };
                  return (
                    <div key={tier}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-slate-400">{tier}</span>
                        <span className="text-white font-medium">{count}</span>
                      </div>
                      <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${colors[tier]}`} style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Fleet Status */}
          {fleet && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-5">
              <h3 className="font-semibold text-sm text-white mb-3 flex items-center gap-2">
                <Truck className="w-4 h-4 text-gold" /> Fleet Status
              </h3>
              <div className="grid grid-cols-2 gap-3">
                <MiniStat label="Active Trucks" value={fleet.trucksByStatus?.ACTIVE || 0} color="text-green-400" />
                <MiniStat label="In Shop" value={(fleet.trucksByStatus?.IN_SHOP || 0) + (fleet.trailersByStatus?.IN_SHOP || 0)} color="text-yellow-400" />
                <MiniStat label="Drivers Available" value={drivers?.available || 0} color="text-blue-400" />
                <MiniStat label="On Route" value={drivers?.onRoute || 0} color="text-orange-400" />
              </div>
            </div>
          )}

          {/* Compliance Summary */}
          {compliance && (
            <div className={`bg-white/5 rounded-xl border p-5 ${criticalAlerts > 0 ? "border-red-500/30" : "border-white/10"}`}>
              <h3 className="font-semibold text-sm text-white mb-3 flex items-center gap-2">
                <Shield className="w-4 h-4 text-gold" /> Compliance
              </h3>
              <div className="space-y-2">
                {criticalAlerts > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-red-500/10 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-red-400" />
                    <span className="text-sm text-red-400 font-medium">{criticalAlerts} critical</span>
                  </div>
                )}
                {warningAlerts > 0 && (
                  <div className="flex items-center gap-2 p-2 bg-yellow-500/10 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-yellow-400" />
                    <span className="text-sm text-yellow-400">{warningAlerts} warnings</span>
                  </div>
                )}
                {criticalAlerts === 0 && warningAlerts === 0 && (
                  <div className="flex items-center gap-2 p-2 bg-green-500/10 rounded-lg">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <span className="text-sm text-green-400">All clear</span>
                  </div>
                )}
              </div>
              <Link href="/dashboard/compliance" className="block text-xs text-gold mt-3 hover:text-gold/80">
                View compliance center &rarr;
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="text-center p-2 bg-white/5 rounded-lg">
      <p className={`text-lg font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-slate-500">{label}</p>
    </div>
  );
}
