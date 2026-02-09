"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Truck, DollarSign, Users, FileText, ChevronRight, Bell, MapPin, PieChart, Activity, MessageSquare } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";

export function EmployeeOverview() {
  const { user } = useAuthStore();

  const { data: loadsData } = useQuery({
    queryKey: ["loads-active"],
    queryFn: () => api.get("/loads").then((r) => r.data),
  });

  const { data: invoices } = useQuery({
    queryKey: ["invoices-all"],
    queryFn: () => api.get("/invoices").then((r) => r.data),
  });

  const { data: notifications } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get("/notifications").then((r) => r.data),
  });

  const { data: financeSummary } = useQuery({
    queryKey: ["finance-summary"],
    queryFn: () => api.get("/accounting/summary?period=monthly").then((r) => r.data),
  });

  const { data: customersData } = useQuery({
    queryKey: ["customers-stats"],
    queryFn: () => api.get("/customers/stats").then((r) => r.data),
  });

  const activeLoads = loadsData?.loads?.filter((l: { status: string }) =>
    ["POSTED", "BOOKED", "IN_TRANSIT", "DISPATCHED"].includes(l.status)
  ).length ?? "—";

  const pendingInvoices = Array.isArray(invoices)
    ? invoices.filter((i: { status: string }) => ["SUBMITTED", "UNDER_REVIEW"].includes(i.status)).length
    : "—";

  const totalRevenue = financeSummary?.totalRevenue
    ? `$${(financeSummary.totalRevenue / 1000).toFixed(0)}K`
    : "$0";

  const partnerCarriers = customersData?.total ?? "—";

  const stats = [
    { label: "Active Loads", value: activeLoads, icon: Truck, color: "text-blue-400 bg-blue-500/20" },
    { label: "Total Revenue", value: totalRevenue, icon: DollarSign, color: "text-green-400 bg-green-500/20" },
    { label: "Customers", value: partnerCarriers, icon: Users, color: "text-purple-400 bg-purple-500/20" },
    { label: "Pending Invoices", value: pendingInvoices, icon: FileText, color: "text-amber-400 bg-amber-500/20" },
  ];

  const quickActions = [
    { label: "Track Shipments", href: "/dashboard/tracking", icon: MapPin },
    { label: "View Financials", href: "/dashboard/finance", icon: PieChart },
    { label: "Load Board", href: "/dashboard/loads", icon: Truck },
    { label: "Market Trends", href: "/dashboard/market", icon: Activity },
    { label: "Manage CRM", href: "/dashboard/crm", icon: Users },
    { label: "Messages", href: "/dashboard/messages", icon: MessageSquare },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="bg-gradient-to-r from-gold/20 to-transparent rounded-2xl p-6 md:p-8 border border-gold/10">
        <h1 className="text-2xl font-bold text-white mb-1">
          Welcome back, {user?.firstName || "Team"}
        </h1>
        <p className="text-slate-400 text-sm">Operations Hub &mdash; Silk Route Logistics</p>
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
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Loads */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-white">Recent Loads</h2>
              <Link href="/dashboard/loads" className="text-xs text-gold hover:text-gold/80">View all</Link>
            </div>
            <div className="space-y-3">
              {loadsData?.loads?.slice(0, 5).map((load: { id: string; referenceNumber: string; originCity: string; originState: string; destCity: string; destState: string; status: string; rate: number }) => (
                <div key={load.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 hover:bg-white/10 transition">
                  <div>
                    <p className="text-sm font-medium text-white">{load.originCity}, {load.originState} &rarr; {load.destCity}, {load.destState}</p>
                    <p className="text-xs text-slate-500">{load.referenceNumber} &middot; <span className={
                      load.status === "POSTED" ? "text-blue-400" :
                      load.status === "BOOKED" ? "text-purple-400" :
                      load.status === "DELIVERED" ? "text-green-400" :
                      "text-slate-400"
                    }>{load.status}</span></p>
                  </div>
                  <span className="text-sm font-semibold text-gold">${load.rate.toLocaleString()}</span>
                </div>
              ))}
              {!loadsData?.loads?.length && (
                <p className="text-sm text-slate-500">No loads yet</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white/5 rounded-xl border border-white/10 p-5">
            <h3 className="font-semibold text-sm text-white mb-3">Quick Actions</h3>
            <div className="space-y-1">
              {quickActions.map((a) => {
                const Icon = a.icon;
                return (
                  <Link key={a.href} href={a.href}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-white/5 transition text-sm">
                    <span className="flex items-center gap-2 text-slate-300">
                      <Icon className="w-4 h-4 text-slate-500" /> {a.label}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-600" />
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="bg-white/5 rounded-xl border border-white/10 p-5">
            <h3 className="font-semibold text-sm text-white mb-3">Recent Activity</h3>
            <div className="space-y-3">
              {notifications?.slice(0, 4).map((n: { id: string; title: string; message: string; readAt: string | null }) => (
                <div key={n.id} className="flex items-start gap-3">
                  <Bell className={`w-4 h-4 mt-0.5 shrink-0 ${n.readAt ? "text-slate-600" : "text-gold"}`} />
                  <div>
                    <p className="text-sm font-medium text-white">{n.title}</p>
                    <p className="text-xs text-slate-500 line-clamp-1">{n.message}</p>
                  </div>
                </div>
              ))}
              {!notifications?.length && (
                <p className="text-sm text-slate-500">No recent activity</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
