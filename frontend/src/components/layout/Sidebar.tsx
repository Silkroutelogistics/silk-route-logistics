"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard, Truck, FileText, DollarSign, Settings, LogOut,
  BarChart3, TrendingUp, MessageSquare, FolderOpen,
  MapPin, PieChart, Users, BookOpen, UserCheck, ArrowLeftRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";

type ViewMode = "employee" | "carrier";

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
  const [viewMode, setViewMode] = useState<ViewMode>("employee");

  const navItems = viewMode === "employee" ? employeeNav : carrierNav;

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

      {/* View Toggle */}
      <div className="px-3 pt-4 pb-2">
        <button
          onClick={() => setViewMode(viewMode === "employee" ? "carrier" : "employee")}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition text-xs"
        >
          <ArrowLeftRight className="w-3.5 h-3.5 text-gold" />
          <span className="text-slate-300">
            {viewMode === "employee" ? "Employee View" : "Carrier View"}
          </span>
          <span className="ml-auto text-[10px] text-slate-500">Switch</span>
        </button>
      </div>

      <nav className="flex-1 px-3 py-2 space-y-1">
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
        {viewMode === "carrier" && (
          <div className="px-3 py-2 mb-3">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-gold" />
              <span className="text-xs text-slate-500">Quick Pay Available</span>
            </div>
          </div>
        )}
        <button
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 w-full transition">
          <LogOut className="w-4 h-4" /> Sign Out
        </button>
      </div>
    </aside>
  );
}
