"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuthStore } from "@/hooks/useAuthStore";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { Logo } from "@/components/ui/Logo";
import { MarcoPolo } from "@/components/MarcoPolo";
import {
  LayoutDashboard, FileText, Clock, CreditCard, Zap, CheckCircle2,
  RotateCcw, Landmark, BarChart3, FileSpreadsheet, LogOut, ChevronRight, DollarSign, Menu, X,
} from "lucide-react";

const NAV_SECTIONS = [
  {
    title: "OVERVIEW",
    items: [
      { label: "Dashboard", href: "/accounting", icon: LayoutDashboard },
    ],
  },
  {
    title: "ACCOUNTS RECEIVABLE",
    items: [
      { label: "Invoices", href: "/accounting/invoices", icon: FileText },
      { label: "Aging Report", href: "/accounting/aging", icon: Clock },
      { label: "Credit Limits", href: "/accounting/credit", icon: CreditCard },
    ],
  },
  {
    title: "ACCOUNTS PAYABLE",
    items: [
      { label: "Carrier Payments", href: "/accounting/payments", icon: DollarSign },
      { label: "Quick Pay Queue", href: "/accounting/quick-pay", icon: Zap },
      { label: "Approvals", href: "/accounting/approvals", icon: CheckCircle2 },
      { label: "Disputes", href: "/accounting/disputes", icon: RotateCcw },
    ],
  },
  {
    title: "FACTORING FUND",
    items: [
      { label: "Fund Balance", href: "/accounting/fund", icon: Landmark },
    ],
  },
  {
    title: "ANALYSIS",
    items: [
      { label: "Load P&L", href: "/accounting/pnl", icon: BarChart3 },
    ],
  },
  {
    title: "REPORTS",
    items: [
      { label: "Reports & Export", href: "/accounting/reports", icon: FileSpreadsheet },
    ],
  },
];

export default function AccountingLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, token, logout } = useAuthStore();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close sidebar on route change
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const sidebarContent = (
    <>
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/5">
        <Link href="/accounting" className="flex items-center gap-2">
          <Logo size="sm" />
          <div>
            <h1 className="text-sm font-bold text-white leading-tight">SRL Accounting</h1>
            <p className="text-[10px] text-slate-500">Financial Console</p>
          </div>
        </Link>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-5">
        {NAV_SECTIONS.map((section) => (
          <div key={section.title}>
            <h3 className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider px-2 mb-1.5">
              {section.title}
            </h3>
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const isActive = pathname === item.href || (item.href !== "/accounting" && pathname.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-all ${
                      isActive
                        ? "bg-[#C8963E]/10 text-[#C8963E] font-medium"
                        : "text-slate-400 hover:text-white hover:bg-white/5"
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span>{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* User / Back to Dashboard */}
      <div className="p-3 border-t border-white/5 space-y-2">
        <Link
          href="/dashboard/overview"
          className="flex items-center gap-2 px-2.5 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-white/5 transition"
        >
          <ChevronRight className="w-4 h-4 rotate-180" />
          <span>Back to AE Console</span>
        </Link>
        <div className="flex items-center gap-2 px-2.5 py-2">
          <div className="w-7 h-7 rounded-full bg-[#C8963E]/20 flex items-center justify-center text-xs font-bold text-[#C8963E]">
            {user?.firstName?.[0]}{user?.lastName?.[0]}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white truncate">{user?.firstName} {user?.lastName}</p>
            <p className="text-[10px] text-slate-500 truncate">
              {user?.role === "BROKER" ? "Account Executive"
                : user?.role === "ADMIN" ? "Administrator"
                : user?.role === "CEO" ? "Chief Executive Officer"
                : user?.role?.toLowerCase()}
            </p>
          </div>
          <button onClick={logout} className="text-slate-500 hover:text-red-400 transition">
            <LogOut className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <AuthGuard>
    <div className="min-h-screen bg-[#0f172a] flex">
      {/* Mobile header bar */}
      <div className="md:hidden fixed top-0 left-0 right-0 z-40 bg-[#0a1120] border-b border-white/5 px-4 py-3 flex items-center justify-between">
        <Link href="/accounting" className="flex items-center gap-2">
          <Logo size="sm" />
          <span className="text-sm font-bold text-white">SRL Accounting</span>
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
          className="md:hidden fixed inset-0 bg-black/50 z-40 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`w-64 bg-[#0a1120] border-r border-white/5 flex flex-col shrink-0 transition-transform duration-200 fixed md:sticky top-0 z-50 md:z-auto h-screen ${
          mobileOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"
        }`}
      >
        {sidebarContent}
      </aside>

      {/* Mobile spacer for fixed header */}
      <div className="md:hidden h-14 shrink-0" />

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        {children}
      </main>

      {/* Marco Polo AI Assistant */}
      <MarcoPolo isAuthenticated={true} token={token} darkMode={true} />
    </div>
    </AuthGuard>
  );
}
