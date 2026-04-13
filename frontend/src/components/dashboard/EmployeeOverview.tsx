"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Truck, DollarSign, Users, FileText, ChevronRight, Bell, MapPin, PieChart, Activity, MessageSquare, AlertCircle, CheckCheck } from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";

export function EmployeeOverview() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();

  const markRead = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: () => api.patch("/notifications/read-all"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
    },
  });

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
    { label: "Active Loads", value: activeLoads, icon: Truck, color: "text-blue-400 bg-blue-500/20", href: "/dashboard/loads" },
    { label: "Total Revenue", value: totalRevenue, icon: DollarSign, color: "text-green-400 bg-green-500/20", href: "/dashboard/finance" },
    { label: "Customers", value: partnerCarriers, icon: Users, color: "text-purple-400 bg-purple-500/20", href: "/dashboard/crm" },
    { label: "Pending Invoices", value: pendingInvoices, icon: FileText, color: "text-amber-400 bg-amber-500/20", href: "/dashboard/invoices" },
  ];

  // Needs Attention counts
  const pendingTenders = loadsData?.loads?.filter((l: { status: string; createdAt: string }) =>
    l.status === "POSTED" && new Date(l.createdAt).getTime() < Date.now() - 4 * 60 * 60 * 1000
  ).length ?? 0;

  const overdueInvoices = Array.isArray(invoices)
    ? invoices.filter((i: { status: string; dueDate?: string }) =>
        i.status !== "PAID" && i.dueDate && new Date(i.dueDate) < new Date()
      ).length
    : 0;

  const expiringInsurance = 0; // derived from compliance stats if available

  const unreadMessages = Array.isArray(notifications)
    ? notifications.filter((n: { readAt: string | null }) => !n.readAt).length
    : 0;

  const attentionItems = [
    { label: "Pending Tenders", count: pendingTenders, href: "/dashboard/loads", borderColor: "border-l-yellow-500", textColor: "text-yellow-400" },
    { label: "Overdue Invoices", count: overdueInvoices, href: "/accounting/aging", borderColor: "border-l-red-500", textColor: "text-red-400" },
    { label: "Expiring Insurance", count: expiringInsurance, href: "/dashboard/compliance", borderColor: "border-l-red-500", textColor: "text-red-400" },
    { label: "Unread Messages", count: unreadMessages, href: "/dashboard/messages", borderColor: "border-l-blue-500", textColor: "text-blue-400" },
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
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              {new Date().getHours() < 12 ? "Good morning" : new Date().getHours() < 17 ? "Good afternoon" : "Good evening"}, {user?.firstName || "Team"}
            </h1>
            <p className="text-slate-400 text-sm">Operations Hub &mdash; Silk Route Logistics &middot; {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
          </div>
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg border border-white/10 text-xs text-slate-500">
            <kbd className="px-1.5 py-0.5 bg-white/10 rounded text-[10px] font-mono">&#8984;K</kbd>
            <span>Quick actions</span>
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <a key={s.label} href={s.href} className="bg-white/5 rounded-xl border border-white/10 p-5 hover:border-gold/30 transition block no-underline">
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${s.color}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <span className="text-sm text-slate-400">{s.label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{s.value}</p>
            </a>
          );
        })}
      </div>

      {/* Needs Attention */}
      <div>
        <h2 className="text-sm font-semibold text-white mb-4">Needs Attention</h2>
        <div className="grid grid-cols-4 gap-4">
          {attentionItems.map((item) => (
            <Link key={item.label} href={item.href}
              className={`bg-white/5 border border-white/10 rounded-xl p-4 border-l-4 ${item.borderColor} hover:bg-white/[0.08] transition block no-underline`}>
              <div className="flex items-center justify-between mb-2">
                <AlertCircle className={`w-4 h-4 ${item.textColor}`} />
                <span className={`text-xs ${item.textColor} hover:underline`}>View &rarr;</span>
              </div>
              <p className={`text-2xl font-bold ${item.textColor}`}>{item.count}</p>
              <p className="text-xs text-slate-400 mt-1">{item.label}</p>
            </Link>
          ))}
        </div>
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
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-sm text-white">Recent Activity</h3>
              <div className="flex items-center gap-3">
                {notifications?.some((n: { readAt: string | null }) => !n.readAt) && (
                  <button onClick={() => markAllRead.mutate()} className="text-xs text-slate-400 hover:text-gold flex items-center gap-1 transition">
                    <CheckCheck className="w-3 h-3" /> Mark all read
                  </button>
                )}
                <Link href="/dashboard/audit" className="text-xs text-gold hover:text-gold/80 no-underline">View all</Link>
              </div>
            </div>
            <div className="space-y-3">
              {notifications?.slice(0, 6).map((n: { id: string; title: string; message: string; readAt: string | null; actionUrl?: string; createdAt?: string }) => (
                <Link key={n.id} href={(() => {
                    let url = n.actionUrl || (n as any).link || "/dashboard/overview";
                    if (!url || url === "#" || url === "null") url = "/dashboard/overview";
                    if (url.includes("/ae/") || url.includes(".html")) url = "/dashboard/overview";
                    if (!url.startsWith("/dashboard") && !url.startsWith("/accounting") && !url.startsWith("/admin")) url = "/dashboard/overview";
                    const path = url.split("?")[0];
                    const hasEntityId = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path);
                    if (hasEntityId) {
                      const listPath = path.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "");
                      return listPath.startsWith("/dashboard") ? listPath : "/dashboard/overview";
                    }
                    return url;
                  })()}
                  onClick={() => { if (!n.readAt) markRead.mutate(n.id); }}
                  className={`flex items-start gap-3 no-underline rounded-lg p-2 -m-1 transition ${n.readAt ? "opacity-60 hover:opacity-80" : "hover:bg-white/5 bg-[#161921]"}`}>
                  <div className="relative shrink-0 mt-0.5">
                    <Bell className={`w-4 h-4 ${n.readAt ? "text-slate-600" : "text-gold"}`} />
                    {!n.readAt && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-gold rounded-full" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-sm font-medium ${n.readAt ? "text-slate-400" : "text-white"}`}>{n.title}</p>
                    <p className="text-xs text-slate-500 line-clamp-1">{n.message}</p>
                  </div>
                </Link>
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
