"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Truck, FileText, DollarSign, Settings, LogOut,
  BarChart3, TrendingUp, MessageSquare, FolderOpen,
  MapPin, PieChart, Users, BookOpen, UserCheck, Zap, Activity, Bell,
  Shield, Package, ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
import { useAuthStore } from "@/hooks/useAuthStore";
import { isAdmin, isCarrier, isCeo } from "@/lib/roles";
import { api } from "@/lib/api";

// AE/Broker workflow: Customers → Loads → Carriers → Dispatch/Track → Finance → Comms
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
  { href: "/dashboard/market", label: "Market Intel", icon: Activity },
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

// CEO/Admin: Full access — everything organized by workflow
const adminNav = [
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
  { href: "/dashboard/market", label: "Market Intel", icon: Activity },
  { href: "/dashboard/compliance", label: "Compliance", icon: Shield },
  { href: "/dashboard/scorecard", label: "Carrier Scorecards", icon: BarChart3 },
  { href: "/dashboard/revenue", label: "Carrier Revenue", icon: TrendingUp },
  { href: "/dashboard/documents", label: "Documents", icon: FolderOpen },
  { href: "/dashboard/factoring", label: "Factoring", icon: DollarSign },
  { href: "/dashboard/sops", label: "SOPs", icon: BookOpen },
  { href: "/dashboard/edi", label: "EDI", icon: Zap },
  { href: "/dashboard/audit", label: "Audit Log", icon: ClipboardList },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

function getNav(role: string | undefined) {
  if (isAdmin(role)) return adminNav;
  if (isCarrier(role)) return carrierNav;
  return employeeNav;
}

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const carrier = isCarrier(user?.role);
  const ceo = isCeo(user?.role);
  const navItems = getNav(user?.role);

  const { data: unreadData } = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count").then((r) => r.data),
    refetchInterval: 30000,
    enabled: !!user,
  });
  const unreadCount = unreadData?.count || 0;

  return (
    <aside className="w-64 bg-navy flex flex-col min-h-screen">
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
              <p className="text-xs text-slate-500 capitalize">
                {ceo ? "Chief Executive Officer" : user.role?.toLowerCase()}
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
    </aside>
  );
}
