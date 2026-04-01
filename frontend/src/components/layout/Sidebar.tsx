"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  LayoutDashboard, Truck, FileText, DollarSign, Settings, LogOut,
  BarChart3, TrendingUp, MessageSquare, FolderOpen, CreditCard,
  MapPin, PieChart, Users, BookOpen, UserCheck, Zap, Activity, Bell,
  Shield, Package, ClipboardList, Menu, X, ClipboardEdit, Brain, Cpu,
  AlertTriangle, Mail, Target, Plug, Container, Landmark,
  ChevronDown, ChevronRight, ChevronsLeft, ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "@/components/ui/Logo";
import { VersionFooter } from "@/components/ui/VersionFooter";
import { ThemeGearButton } from "@/components/ui/ThemePanel";
import { CommandPaletteTrigger } from "@/components/ui/CommandPalette";
import { useAuthStore } from "@/hooks/useAuthStore";
import { useViewMode } from "@/hooks/useViewMode";
import { isAdmin, isCarrier, isCeo } from "@/lib/roles";
import { api } from "@/lib/api";
import { useState, useEffect, useCallback } from "react";
import type { LucideIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

/* ────────────────────────────────────────────────────────── */
/*  Nav definitions                                          */
/* ────────────────────────────────────────────────────────── */

const employeeNav = [
  { href: "/dashboard/overview", label: "Dashboard", icon: LayoutDashboard },
  { href: "/dashboard/crm", label: "Customers", icon: Users },
  { href: "/dashboard/loads", label: "Load Board", icon: Package },
  { href: "/dashboard/carriers", label: "Carrier Pool", icon: UserCheck },
  { href: "/dashboard/tracking", label: "Track & Trace", icon: MapPin },
  { href: "/dashboard/fleet", label: "Fleet", icon: Truck },
  { href: "/dashboard/drivers", label: "Drivers", icon: Users },
  { href: "/dashboard/communications", label: "Communications", icon: Mail },
  { href: "/dashboard/claims", label: "Claims", icon: AlertTriangle },
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
  { href: "/carrier/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/carrier/dashboard/available-loads", label: "Find Loads", icon: Package },
  { href: "/carrier/dashboard/my-loads", label: "My Loads", icon: Truck },
  { href: "/carrier/dashboard/scorecard", label: "Scorecard & Bonuses", icon: BarChart3 },
  { href: "/carrier/dashboard/revenue", label: "Revenue", icon: TrendingUp },
  { href: "/carrier/dashboard/payments", label: "Payments", icon: DollarSign },
  { href: "/carrier/dashboard/compliance", label: "Compliance", icon: Shield },
  { href: "/carrier/dashboard/documents", label: "Documents", icon: FolderOpen },
  { href: "/carrier/dashboard/messaging", label: "Messages", icon: MessageSquare },
  { href: "/carrier/dashboard/settings", label: "Settings", icon: Settings },
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

/* ── AE grouped navigation ────────────────────────────────── */

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

const aeViewGroups: NavGroup[] = [
  {
    key: "operations",
    label: "OPERATIONS",
    items: [
      { href: "/dashboard/overview", label: "Dashboard", icon: LayoutDashboard },
      { href: "/dashboard/crm", label: "CRM", icon: Users },
      { href: "/dashboard/orders", label: "Order Builder", icon: ClipboardEdit },
      { href: "/dashboard/loads", label: "Load Board", icon: Package },
      { href: "/dashboard/tracking", label: "Track & Trace", icon: MapPin },
    ],
  },
  {
    key: "carriers",
    label: "CARRIERS",
    items: [
      { href: "/dashboard/carriers", label: "Carrier Pool", icon: Truck },
      { href: "/dashboard/fleet", label: "Fleet", icon: Container },
      { href: "/dashboard/drivers", label: "Drivers", icon: UserCheck },
    ],
  },
  {
    key: "finance",
    label: "FINANCE",
    items: [
      { href: "/dashboard/invoices", label: "Invoices", icon: FileText },
      { href: "/dashboard/payables", label: "Payables", icon: CreditCard },
      { href: "/dashboard/settlements", label: "Settlements", icon: Landmark },
      { href: "/dashboard/finance", label: "Finance", icon: DollarSign },
    ],
  },
  {
    key: "intelligence",
    label: "INTELLIGENCE",
    items: [
      { href: "/dashboard/market", label: "Market Intel", icon: TrendingUp },
      { href: "/dashboard/ai-insights", label: "AI Insights", icon: Brain },
      { href: "/dashboard/lead-hunter", label: "Lead Hunter", icon: Target },
    ],
  },
  {
    key: "communicate",
    label: "COMMUNICATE",
    items: [
      { href: "/dashboard/messages", label: "Messages", icon: MessageSquare },
      { href: "/dashboard/communications", label: "Communications", icon: Mail },
    ],
  },
  {
    key: "admin",
    label: "ADMIN",
    items: [
      { href: "/dashboard/claims", label: "Claims", icon: Shield },
      { href: "/dashboard/sops", label: "SOPs", icon: BookOpen },
      { href: "/dashboard/edi", label: "EDI", icon: Zap },
      { href: "/dashboard/audit", label: "Audit Log", icon: ClipboardList },
      { href: "/dashboard/integrations", label: "Integrations", icon: Plug },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

/* ── Helpers ──────────────────────────────────────────────── */

function getNav(role: string | undefined, viewMode: "ae" | "carrier") {
  if (isAdmin(role)) return viewMode === "ae" ? null : carrierViewNav; // null = use grouped
  if (isCarrier(role)) return carrierNav;
  return employeeNav;
}

function useLocalStorageState<T>(key: string, initial: T): [T, (v: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => {
    if (typeof window === "undefined") return initial;
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });

  const setValue = useCallback(
    (v: T | ((prev: T) => T)) => {
      setState((prev) => {
        const next = typeof v === "function" ? (v as (p: T) => T)(prev) : v;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch { /* ignore */ }
        return next;
      });
    },
    [key],
  );

  return [state, setValue];
}

/* ────────────────────────────────────────────────────────── */
/*  Sidebar component                                        */
/* ────────────────────────────────────────────────────────── */

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { user, logout } = useAuthStore();
  const { viewMode, setViewMode } = useViewMode();
  const carrier = isCarrier(user?.role);
  const admin = isAdmin(user?.role);
  const ceo = isCeo(user?.role);
  const broker = user?.role === "BROKER";
  const hasAccountingAccess = admin || broker || user?.role === "ACCOUNTING";
  const flatNav = getNav(user?.role, viewMode);
  const useGrouped = admin && viewMode === "ae";

  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useLocalStorageState("srl-sidebar-collapsed", false);
  const [collapsedGroups, setCollapsedGroups] = useLocalStorageState<Record<string, boolean>>(
    "srl-sidebar-groups",
    {},
  );

  // Close sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const toggleGroup = useCallback(
    (key: string) => {
      setCollapsedGroups((prev) => ({ ...prev, [key]: !prev[key] }));
    },
    [setCollapsedGroups],
  );

  /* ── Notifications ──────────────────────────────────────── */

  const { data: unreadData } = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count").then((r) => r.data),
    refetchInterval: 30000,
    enabled: !!user,
  });
  const unreadCount = unreadData?.count || 0;

  const handleBellClick = useCallback(() => {
    api.patch("/notifications/read-all").then(() => {
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    }).catch(() => {});
  }, [queryClient]);

  /* ── View toggle + console buttons ─────────────────────── */

  const viewToggle = (admin || hasAccountingAccess) ? (
    <div className={cn("border-b border-[#1a2d47] space-y-2", collapsed ? "px-1.5 py-2" : "px-5 py-3")}>
      {admin && !collapsed && (
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
      {admin && collapsed && (
        <button
          onClick={() => setViewMode(viewMode === "ae" ? "carrier" : "ae")}
          className="w-full flex items-center justify-center py-1.5 rounded-md text-[10px] font-bold text-gold bg-white/5 hover:bg-white/10 transition cursor-pointer"
          title={viewMode === "ae" ? "Switch to Carrier View" : "Switch to AE View"}
        >
          {viewMode === "ae" ? "AE" : "CV"}
        </button>
      )}
      {!collapsed && (
        <>
          <Link
            href="/accounting"
            className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-slate-400 hover:text-gold hover:bg-gold/10 transition"
          >
            <DollarSign className="w-3.5 h-3.5" />
            Accounting Console
          </Link>
          {admin && (
            <Link
              href="/admin/users"
              className="flex items-center justify-center gap-2 w-full px-3 py-2 rounded-lg text-xs font-medium bg-white/5 text-slate-400 hover:text-gold hover:bg-gold/10 transition mt-1"
            >
              <Shield className="w-3.5 h-3.5" />
              Admin Console
            </Link>
          )}
        </>
      )}
      {collapsed && (
        <>
          <Link
            href="/accounting"
            className="flex items-center justify-center w-full py-1.5 rounded-md text-slate-400 hover:text-gold hover:bg-gold/10 transition"
            title="Accounting Console"
          >
            <DollarSign className="w-4 h-4" />
          </Link>
          {admin && (
            <Link
              href="/admin/users"
              className="flex items-center justify-center w-full py-1.5 rounded-md text-slate-400 hover:text-gold hover:bg-gold/10 transition"
              title="Admin Console"
            >
              <Shield className="w-4 h-4" />
            </Link>
          )}
        </>
      )}
    </div>
  ) : null;

  /* ── Render a single nav link ──────────────────────────── */

  const renderNavLink = (item: NavItem) => {
    const Icon = item.icon;
    const active = pathname === item.href;
    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "group relative flex items-center gap-3 rounded-lg text-sm transition",
          collapsed ? "justify-center px-2 py-2" : "px-3 py-2",
          active
            ? "text-gold font-medium"
            : "text-slate-400 hover:text-white hover:bg-white/5"
        )}
      >
        {active && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-gold rounded-r" />
        )}
        <Icon className="w-4 h-4 shrink-0" />
        {!collapsed && <span className="flex-1">{item.label}</span>}
        {collapsed && (
          <span className="pointer-events-none absolute left-full ml-2 z-[100] whitespace-nowrap rounded bg-slate-900 px-2 py-1 text-xs text-white opacity-0 shadow-lg group-hover:opacity-100 transition-opacity">
            {item.label}
          </span>
        )}
      </Link>
    );
  };

  /* ── Grouped AE nav ────────────────────────────────────── */

  const renderGroupedNav = () => (
    <nav className="flex-1 px-2 py-3 overflow-y-auto">
      {aeViewGroups.map((group) => {
        const isCollapsed = !!collapsedGroups[group.key];
        return (
          <div key={group.key} className="mb-1">
            {!collapsed && (
              <button
                onClick={() => toggleGroup(group.key)}
                className="flex items-center gap-1 w-full text-[10px] text-slate-500 uppercase tracking-widest font-semibold px-4 mt-4 mb-1.5 hover:text-slate-300 transition cursor-pointer"
              >
                {isCollapsed ? (
                  <ChevronRight className="w-3 h-3" />
                ) : (
                  <ChevronDown className="w-3 h-3" />
                )}
                {group.label}
              </button>
            )}
            {collapsed && <div className="mt-2 mb-1 border-t border-[#1a2d47]" />}
            {(collapsed || !isCollapsed) && (
              <div className="space-y-0.5">
                {group.items.map(renderNavLink)}
              </div>
            )}
          </div>
        );
      })}
    </nav>
  );

  /* ── Flat nav (carrier / employee) ─────────────────────── */

  const renderFlatNav = () => (
    <nav className="flex-1 px-2 py-3 space-y-0.5 overflow-y-auto">
      {(flatNav || []).map(renderNavLink)}
    </nav>
  );

  /* ── Sidebar content ───────────────────────────────────── */

  const sidebarContent = (
    <>
      {/* Logo */}
      <div className={cn("border-b border-[#1a2d47]", collapsed ? "px-2 py-4" : "px-5 py-5")}>
        <Link href="/" className="flex items-center gap-2">
          <Logo size="sm" />
          {!collapsed && (
            <div>
              <span className="text-sm font-semibold text-white">Silk Route</span>
              <span className="block text-[10px] text-slate-500 leading-tight">Logistics Inc.</span>
            </div>
          )}
        </Link>
      </div>

      {/* User info */}
      {user && (
        <div className={cn("border-b border-[#1a2d47]", collapsed ? "px-1.5 py-2" : "px-5 py-3")}>
          {!collapsed ? (
            <div className="flex items-center justify-between">
              <div className="min-w-0">
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
                    : user.role === "SHIPPER" ? "Shipper"
                    : user.role?.toLowerCase()}
                </p>
              </div>
              {unreadCount > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleBellClick(); }}
                  className="flex items-center gap-1 px-2 py-0.5 bg-gold/20 rounded-full hover:bg-gold/30 transition cursor-pointer"
                  title="Mark all as read"
                >
                  <Bell className="w-3 h-3 text-gold" />
                  <span className="text-[10px] font-bold text-gold">{unreadCount > 99 ? "99+" : unreadCount}</span>
                </button>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center gap-1">
              {unreadCount > 0 && (
                <button
                  onClick={(e) => { e.stopPropagation(); handleBellClick(); }}
                  className="flex items-center justify-center w-full py-1 bg-gold/20 rounded hover:bg-gold/30 transition cursor-pointer"
                  title="Mark all as read"
                >
                  <Bell className="w-3.5 h-3.5 text-gold" />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* View toggle + console links */}
      {viewToggle}

      {/* Navigation */}
      {useGrouped ? renderGroupedNav() : renderFlatNav()}

      {/* Bottom section */}
      <div className={cn("border-t border-[#1a2d47] space-y-1", collapsed ? "px-1.5 py-3" : "px-3 py-4")}>
        {carrier && !collapsed && (
          <div className="px-3 py-2">
            <div className="flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-gold" />
              <span className="text-xs text-slate-500">Quick Pay Available</span>
            </div>
          </div>
        )}

        {/* Collapse toggle removed from here — now floating on sidebar edge */}

        {!collapsed ? (
          <>
            <CommandPaletteTrigger />
            <ThemeGearButton />
          </>
        ) : (
          <>
            <CommandPaletteTrigger />
            <ThemeGearButton />
          </>
        )}

        <button
          onClick={() => logout()}
          className={cn(
            "flex items-center gap-3 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 w-full transition",
            collapsed ? "justify-center px-2 py-2.5" : "px-3 py-2.5"
          )}
          title="Sign Out"
        >
          <LogOut className="w-4 h-4" />
          {!collapsed && <span>Sign Out</span>}
        </button>

        {!collapsed && <VersionFooter className="px-3 pt-2" />}
      </div>
    </>
  );

  /* ── Layout ─────────────────────────────────────────────── */

  return (
    <>
      {/* Mobile header bar */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-[#0c1829] border-b border-[#1a2d47] px-4 py-3 flex items-center justify-between">
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

      {/* Sidebar */}
      <aside
        className={cn(
          "bg-[#0c1829] border-r border-[#1a2d47] flex flex-col min-h-screen shrink-0 transition-all duration-200 relative",
          "fixed lg:sticky top-0 z-50 lg:z-auto",
          collapsed ? "w-[60px]" : "w-[220px]",
          mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
        )}
      >
        {sidebarContent}

        {/* Floating collapse toggle on sidebar edge */}
        <button
          onClick={() => setCollapsed((p: boolean) => !p)}
          className="hidden lg:flex absolute -right-3 top-20 w-6 h-6 items-center justify-center rounded-full bg-[#1a2d47] border border-[#2a3d57] text-slate-400 hover:text-white hover:bg-[#243a56] transition-all duration-200 shadow-lg cursor-pointer z-50"
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronsRight className="w-3 h-3" /> : <ChevronsLeft className="w-3 h-3" />}
        </button>
      </aside>

      {/* Spacer for mobile top bar */}
      <div className="lg:hidden h-14 shrink-0" />
    </>
  );
}
