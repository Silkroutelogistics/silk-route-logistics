"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Truck, DollarSign, TrendingUp, BarChart3, ChevronRight, Bell } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { TierBadge } from "@/components/ui/TierBadge";

export function CarrierOverview() {
  const { user } = useAuthStore();

  const { data: dashboard } = useQuery({
    queryKey: ["carrier-dashboard"],
    queryFn: () => api.get("/carrier/dashboard").then((r) => r.data),
  });

  const { data: scorecard } = useQuery({
    queryKey: ["carrier-scorecard"],
    queryFn: () => api.get("/carrier/scorecard").then((r) => r.data),
  });

  const trendData = scorecard?.scorecards
    ?.slice()
    .reverse()
    .map((s: { overallScore: number; calculatedAt: string }, i: number) => ({
      week: `W${i + 1}`,
      score: s.overallScore,
    })) || [];

  const stats = [
    { label: "Active Loads", value: dashboard?.stats?.activeLoads ?? "—", icon: Truck, color: "text-blue-400 bg-blue-500/20" },
    { label: "Weekly Revenue", value: dashboard?.stats?.weeklyRevenue ? `$${dashboard.stats.weeklyRevenue.toLocaleString()}` : "$0", icon: DollarSign, color: "text-green-400 bg-green-500/20" },
    { label: "Monthly Revenue", value: dashboard?.stats?.monthlyRevenue ? `$${dashboard.stats.monthlyRevenue.toLocaleString()}` : "$0", icon: TrendingUp, color: "text-purple-400 bg-purple-500/20" },
    { label: "Tier Score", value: dashboard?.stats?.currentScore ? `${dashboard.stats.currentScore}%` : "—", icon: BarChart3, color: "text-amber-400 bg-amber-500/20" },
  ];

  const quickActions = [
    { label: "Find Loads", href: "/dashboard/loads" },
    { label: "Upload Documents", href: "/dashboard/documents" },
    { label: "View Scorecard", href: "/dashboard/scorecard" },
    { label: "Submit Invoice", href: "/dashboard/invoices" },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="bg-gradient-to-r from-gold/20 to-transparent rounded-2xl p-6 md:p-8 border border-gold/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white mb-1">
            Welcome back, {user?.firstName || "Carrier"}
          </h1>
          <p className="text-slate-400 text-sm">Here&apos;s your performance overview</p>
        </div>
        {dashboard?.carrier?.tier && <TierBadge tier={dashboard.carrier.tier} size="lg" />}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white/5 rounded-xl border border-white/10 p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-sm text-slate-400">{s.label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{s.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white/5 rounded-xl border border-white/10 p-6">
          <h2 className="font-semibold text-white mb-4">Performance Trend</h2>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trendData}>
                <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                <YAxis domain={[70, 100]} axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
                <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }} />
                <Line type="monotone" dataKey="score" stroke="#D4A843" strokeWidth={2.5} dot={{ fill: "#D4A843", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-slate-500 text-sm">No scorecard data yet</div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-white/5 rounded-xl border border-white/10 p-5">
            <h3 className="font-semibold text-sm text-white mb-3">Quick Actions</h3>
            <div className="space-y-1">
              {quickActions.map((a) => (
                <Link key={a.href} href={a.href}
                  className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition text-sm text-slate-300">
                  {a.label} <ChevronRight className="w-4 h-4 text-slate-600" />
                </Link>
              ))}
            </div>
          </div>

          <div className="bg-white/5 rounded-xl border border-white/10 p-5">
            <h3 className="font-semibold text-sm text-white mb-3">Recent Activity</h3>
            <div className="space-y-3">
              {dashboard?.recentNotifications?.slice(0, 4).map((n: { id: string; title: string; message: string; readAt: string | null }) => (
                <div key={n.id} className="flex items-start gap-3">
                  <Bell className={`w-4 h-4 mt-0.5 shrink-0 ${n.readAt ? "text-slate-600" : "text-gold"}`} />
                  <div>
                    <p className="text-sm font-medium text-white">{n.title}</p>
                    <p className="text-xs text-slate-500 line-clamp-1">{n.message}</p>
                  </div>
                </div>
              ))}
              {!dashboard?.recentNotifications?.length && (
                <p className="text-sm text-slate-500">No recent activity</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
