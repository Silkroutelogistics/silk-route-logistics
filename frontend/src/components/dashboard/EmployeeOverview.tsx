"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Truck, DollarSign, Users, FileText, ChevronRight, Bell, MapPin, PieChart } from "lucide-react";
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

  const activeLoads = loadsData?.loads?.filter((l: { status: string }) =>
    ["POSTED", "BOOKED", "IN_TRANSIT", "DISPATCHED"].includes(l.status)
  ).length ?? "—";

  const pendingInvoices = Array.isArray(invoices)
    ? invoices.filter((i: { status: string }) => ["SUBMITTED", "UNDER_REVIEW"].includes(i.status)).length
    : "—";

  const stats = [
    { label: "Active Loads", value: activeLoads, icon: Truck, color: "text-blue-600 bg-blue-50" },
    { label: "Total Revenue", value: "$—", icon: DollarSign, color: "text-green-600 bg-green-50" },
    { label: "Partner Carriers", value: "—", icon: Users, color: "text-purple-600 bg-purple-50" },
    { label: "Pending Invoices", value: pendingInvoices, icon: FileText, color: "text-amber-600 bg-amber-50" },
  ];

  const quickActions = [
    { label: "Track Shipments", href: "/dashboard/tracking", icon: MapPin },
    { label: "View Financials", href: "/dashboard/finance", icon: PieChart },
    { label: "Load Board", href: "/dashboard/loads", icon: Truck },
    { label: "Manage CRM", href: "/dashboard/crm", icon: Users },
  ];

  return (
    <div className="space-y-6">
      <div className="bg-navy rounded-2xl p-6 md:p-8 text-white">
        <h1 className="text-2xl font-bold mb-1">
          Welcome back, {user?.firstName || "Team"}
        </h1>
        <p className="text-slate-300 text-sm">Operations Hub &mdash; Silk Route Logistics</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="bg-white rounded-xl border p-5">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-sm text-slate-500">{s.label}</span>
              </div>
              <p className="text-2xl font-bold">{s.value}</p>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Loads */}
          <div className="bg-white rounded-xl border p-6">
            <h2 className="font-semibold mb-4">Recent Loads</h2>
            <div className="space-y-3">
              {loadsData?.loads?.slice(0, 5).map((load: { id: string; referenceNumber: string; originCity: string; originState: string; destCity: string; destState: string; status: string; rate: number }) => (
                <div key={load.id} className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition">
                  <div>
                    <p className="text-sm font-medium">{load.originCity}, {load.originState} &rarr; {load.destCity}, {load.destState}</p>
                    <p className="text-xs text-slate-500">{load.referenceNumber} &middot; {load.status}</p>
                  </div>
                  <span className="text-sm font-semibold">${load.rate.toLocaleString()}</span>
                </div>
              ))}
              {!loadsData?.loads?.length && (
                <p className="text-sm text-slate-400">No loads yet</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-sm mb-3">Quick Actions</h3>
            <div className="space-y-2">
              {quickActions.map((a) => {
                const Icon = a.icon;
                return (
                  <Link key={a.href} href={a.href}
                    className="flex items-center justify-between p-3 rounded-lg hover:bg-slate-50 transition text-sm">
                    <span className="flex items-center gap-2">
                      <Icon className="w-4 h-4 text-slate-400" /> {a.label}
                    </span>
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="bg-white rounded-xl border p-5">
            <h3 className="font-semibold text-sm mb-3">Recent Activity</h3>
            <div className="space-y-3">
              {notifications?.slice(0, 4).map((n: { id: string; title: string; message: string; readAt: string | null }) => (
                <div key={n.id} className="flex items-start gap-3">
                  <Bell className={`w-4 h-4 mt-0.5 shrink-0 ${n.readAt ? "text-slate-300" : "text-gold"}`} />
                  <div>
                    <p className="text-sm font-medium">{n.title}</p>
                    <p className="text-xs text-slate-500 line-clamp-1">{n.message}</p>
                  </div>
                </div>
              ))}
              {!notifications?.length && (
                <p className="text-sm text-slate-400">No recent activity</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
