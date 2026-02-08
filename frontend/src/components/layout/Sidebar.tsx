"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Truck, FileText, DollarSign, Settings, LogOut,
  BarChart3, TrendingUp, MessageSquare, FolderOpen,
  MapPin, PieChart, Users, BookOpen, UserCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
import { useAuthStore } from "@/hooks/useAuthStore";
import { isCarrier } from "@/lib/roles";

const employeeNav = [
  { href: "/dashboard/overview", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/tracking", label: "Track & Trace", icon: MapPin },
  { href: "/dashboard/finance", label: "Financial Analytics", icon: PieChart },
  { href: "/dashboard/crm", label: "CRM", icon: Users },
  { href: "/dashboard/sops", label: "SOP Library", icon: BookOpen },
  { href: "/dashboard/drivers", label: "Driver Management", icon: UserCheck },
  { href: "/dashboard/loads", label: "Load Board", icon: Truck },
  { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const carrierNav = [
  { href: "/dashboard/overview", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/loads", label: "Load Board", icon: Truck },
  { href: "/dashboard/scorecard", label: "Scorecard", icon: BarChart3 },
  { href: "/dashboard/revenue", label: "Revenue", icon: TrendingUp },
  { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
  { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
  { href: "/dashboard/documents", label: "Documents", icon: FolderOpen },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuthStore();
  const carrier = isCarrier(user?.role);
  const navItems = carrier ? carrierNav : employeeNav;

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
          <p className="text-sm text-white font-medium truncate">
            {user.firstName} {user.lastName}
          </p>
          <p className="text-xs text-slate-500 capitalize">{user.role?.toLowerCase()}</p>
        </div>
      )}

      <nav className="flex-1 px-3 py-3 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link key={item.href} href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition",
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
