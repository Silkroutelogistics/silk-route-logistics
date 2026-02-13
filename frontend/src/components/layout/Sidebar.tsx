"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Truck, FileText, DollarSign, Settings, LogOut,
  BarChart3, TrendingUp, MessageSquare, FolderOpen, CreditCard,
  MapPin, PieChart, Users, BookOpen, UserCheck, Zap, Activity, Bell,
  Shield, Package, ClipboardList, Menu, X, ClipboardEdit, Brain, Cpu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
import { useAuthStore } from "@/hooks/useAuthStore";
import { useViewMode } from "@/hooks/useViewMode";
import { isAdmin, isCarrier, isCeo } from "@/lib/roles";
import { api } from "@/lib/api";
import { useState, useEffect } from "react";

const employeeNav = [
  { href: "/dashboard/overview", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/crm", label: "Customers", icon: Users },
  { href: "/dashboard/loads", label: "Load Board", icon: Package },
  { href: "/dashboard/carriers", label: "Carrier Pool", icon: UserCheck },
  { href: "/dashboard/tracking", label: "Track & Trace", icon: MapPin },
  { href: "/dashboard/fleet", label: "Fleet", icon: Truck },
  { href: "/dashboard/drivers", label: "Drivers", icon: Users },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/finance", label: "Finance", icon: PieChart },
  { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
  { href: "/dashboard/payables", label: "Payables", icon: CreditCard },
  { href: "/dashboard/settlements", label: "Settlements", icon: ClipboardList },
  { href: "/dashboard/market", label: "Market Intel", icon: Activity },
  { href: "/dashboard/ai-insights", label: "AI Insights", icon: Brain },
  { href: "/dashboard/sops", label: "SOPs", icon: BookOpen },
  { href: "/dashboard/edi", label: "EDI", icon: Zap },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const carrierNav = [
  { href: "/dashboard/overview", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/loads", label: "Load Board", icon: Package },
  { href: "/dashboard/scorecard", label: "Scorecard", icon: BarChart3 },
  { href: "/dashboard/revenue", label: "Revenue", icon: TrendingUp },
  { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
  { href: "/dashboard/factoring", label: "Factoring", icon: DollarSign },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/documents", label: "Documents", icon: FolderOpen },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

// AE View — Account Executive / Broker workflow
const aeViewNav = [
  { href: "/dashboard/overview", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/crm", label: "CRM", icon: Users },
  { href: "/dashboard/orders", label: "Order Builder", icon: ClipboardEdit },
  { href: "/dashboard/loads", label: "Load Board", icon: Package },
  { href: "/dashboard/carriers", label: "Carrier Pool", icon: UserCheck },
  { href: "/dashboard/tracking", label: "Track & Trace", icon: MapPin },
  { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
  { href: "/dashboard/payables", label: "Payables", icon: CreditCard },
  { href: "/dashboard/settlements", label: "Settlements", icon: ClipboardList },
  { href: "/dashboard/finance", label: "Finance", icon: PieChart },
  { href: "/dashboard/market", label: "Market Intel", icon: Activity },
  { href: "/dashboard/ai-insights", label: "AI Insights", icon: Brain },
  { href: "/dashboard/ai-costs", label: "AI Costs", icon: Cpu },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/sops", label: "SOPs", icon: BookOpen },
  { href: "/dashboard/edi", label: "EDI", icon: Zap },
  { href: "/dashboard/audit", label: "Audit Log", icon: ClipboardList },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

// Carrier View — Carrier operations workflow
const carrierViewNav = [
  { href: "/dashboard/overview", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/loads", label: "Assigned Loads", icon: Package },
  { href: "/dashboard/fleet", label: "Fleet", icon: Truck },
  { href: "/dashboard/drivers", label: "Drivers", icon: Users },
  { href: "/dashboard/scorecard", label: "Scorecard", icon: BarChart3 },
  { href: "/dashboard/revenue", label: "Revenue", icon: TrendingUp },
  { href: "/dashboard/violations", label: "DOT / Compliance", icon: Shield },
  { href: "/dashboard/documents", label: "Documents", icon: FolderOpen },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function getNav(role: string | undefined, viewMode: "ae" | "carrier") {
  if (isAdmin(role)) return viewMode === "ae" ? aeViewNav : carrierViewNav;
  if (isCarrier(role)) return carrierNav;
  return employeeNav;
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const { viewMode, setViewMode } = useViewMode();
  const carrier = isCarrier(user?.role);
  const admin = isAdmin(user?.role);
  const ceo = isCeo(user?.role);
  const broker = user?.role === "BROKER";
  const hasAccountingAccess = admin || broker || user?.role === "ACCOUNTING";
  const navItems = getNav(user?.role, viewMode);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const { data: unreadData } = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count").then((r) => r.data),
    refetchInterval: 30000,
    enabled: !!user,
  });
  const unreadCount = unreadData?.count || 0;

  const viewToggle = (admin || hasAccountingAccess) ? (
    <div className="px-5 py-3 border-b border-white/10 space-y-2">
      {admin && (
        <div className="flex items-center bg-white/5 rounded-lg p-1">
          <button
            onClick={() => setViewMode("ae")}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer",
              viewMode === "ae"
                ? "bg-gold text-navy shadow-sm"
                : "text-slate-400 hover:text-white"
            )}
          >
            AE View
          </button>
          <button
            onClick={() => setViewMode("carrier")}
            className={cn(
              "flex-1 px-3 py-1.5 rounded-md text-xs font-medium transition-all cursor-pointer",
              viewMode === "carrier"
                ? "bg-gold text-navy shadow-sm"
                : "text-slate-400 hover:text-white"
            )}
          >
            Carrier View
          </button>
        </div>
      )}
      <Link
        href="/accounting"
        className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-slate-400 hover:text-gold hover:bg-gold/10 transition"
      >
        <DollarSign className="w-3.5 h-3.5" />
        Accounting Console
      </Link>
    </div>
  ) : null;

  const sidebarContent = (
    <>
      <div className="px-5 py-5 border-b border-white/10">
        <Link href="/" className="flex items-center gap-2">
          <Logo size="sm" />
          <div>
            <span className="text-sm font-semibold text-white">Silk Route</span>
            <span className="block text-[10px] text-slate-500 leading-tight">Logistics Inc.</span>
          </div>
        </Link>
      </div>

      {user && (
        <div className="px-5 py-3 border-b border-white/10">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white font-medium truncate">
                {user.firstName} {user.lastName}
              </p>
              <p className="text-xs text-slate-500">
                {ceo ? "Chief Executive Officer"
                  : user.role === "BROKER" ? "Account Executive"
                  : user.role === "ADMIN" ? "Administrator"
                  : user.role === "DISPATCH" ? "Dispatch"
                  : user.role === "OPERATIONS" ? "Operations"
                  : user.role === "ACCOUNTING" ? "Accounting"
                  : user.role === "CARRIER" ? "Carrier"
                  : user.role?.toLowerCase()}
              </p>
            </div>
            {unreadCount > 0 && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-gold/20 rounded-full">
                <Bell className="w-3 h-3 text-gold" />
                <span className="text-[10px] font-bold text-gold">{unreadCount > 99 ? "99+" : unreadCount}</span>
              </div>
            )}
          </div>
        </div>
      )}

      {viewToggle}

      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition",
                active ? "bg-gold/10 text-gold font-medium" : "text-slate-400 hover:text-white hover:bg-white/5"
              )}
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span className="flex-1">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="px-3 py-4 border-t border-white/10">
        {carrier && (
          <div className="px-3 py-2 mb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-gold" />
              <span className="text-xs text-slate-500">Quick Pay Available</span>
            </div>
          </div>
        )}
        <button
          onClick={() => logout()}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 w-full transition">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile header bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-navy border-b border-white/10 px-4 py-3 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Logo size="sm" />
          <span className="text-sm font-semibold text-white">Silk Route</span>
        </Link>
        <button
          onClick={() => setMobileOpen(!mobileOpen)}
          className="p-2 text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition"
        >
          {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar - hidden on mobile unless open */}
      <aside
        className={cn(
          "w-64 bg-navy flex flex-col min-h-screen shrink-0 transition-transform duration-200",
          "fixed lg:sticky top-0 z-50 lg:z-auto",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {sidebarContent}
      </aside>

      {/* Spacer for mobile top bar */}
      <div className="lg:hidden h-14 shrink-0" />
    </>
  );
}
