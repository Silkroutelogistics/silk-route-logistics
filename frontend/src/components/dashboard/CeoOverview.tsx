"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import {
  DollarSign, Users, TrendingUp, TrendingDown,
  AlertTriangle, CheckCircle2, Shield, Clock,
  ChevronRight, UserCheck, Package, BarChart3,
  FileText, Loader2, Zap, Bell,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

// ─── Helpers ───────────────────────────────────────────────────────────────────

const fmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const fmtCompact = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 });

function pctChange(current: number, previous: number): number | null {
  if (!previous) return null;
  return Math.round(((current - previous) / previous) * 100);
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const STATUS_COLORS: Record<string, string> = {
  POSTED: "bg-blue-400",
  BOOKED: "bg-purple-400",
  IN_TRANSIT: "bg-amber-400",
  DISPATCHED: "bg-amber-400",
  PICKED_UP: "bg-amber-400",
  DELIVERED: "bg-green-400",
  COMPLETED: "bg-green-400",
};

const STATUS_TEXT_COLORS: Record<string, string> = {
  POSTED: "text-blue-400",
  BOOKED: "text-purple-400",
  IN_TRANSIT: "text-amber-400",
  DELIVERED: "text-green-400",
};

// ─── Types ─────────────────────────────────────────────────────────────────────

interface Load {
  id: string;
  status: string;
  rate?: number;
  pickupDate?: string;
  deliveryDate?: string;
  actualDeliveryDate?: string;
  createdAt?: string;
  carrierId?: string | null;
}

interface Invoice {
  id: string;
  status: string;
  amount?: number;
  totalAmount?: number;
  dueDate?: string;
  createdAt?: string;
}

interface Carrier {
  id: string;
  onboardingStatus?: string;
  createdAt?: string;
  insuranceExpiry?: string;
}

// ─── Component ─────────────────────────────────────────────────────────────────

export function CeoOverview() {
  const { user } = useAuthStore();

  // Data sources
  const { data: loads, isLoading: loadsLoading } = useQuery({
    queryKey: ["ceo-loads"],
    queryFn: () => api.get("/loads?limit=200").then(r => r.data),
  });

  const { data: finance, isLoading: financeLoading } = useQuery({
    queryKey: ["ceo-finance"],
    queryFn: () => api.get("/accounting/summary?period=monthly").then(r => r.data),
  });

  const { data: customers } = useQuery({
    queryKey: ["ceo-customers"],
    queryFn: () => api.get("/customers/stats").then(r => r.data),
  });

  const { data: compliance } = useQuery({
    queryKey: ["ceo-compliance"],
    queryFn: () => api.get("/compliance/stats").then(r => r.data).catch(() => null),
  });

  const { data: carriers } = useQuery({
    queryKey: ["ceo-carriers"],
    queryFn: () => api.get("/carrier/all").then(r => r.data).catch(() => []),
  });

  const { data: invoiceData } = useQuery({
    queryKey: ["ceo-invoices"],
    queryFn: () => api.get("/invoices").then(r => r.data).catch(() => []),
  });

  const isLoading = loadsLoading || financeLoading;

  // ─── Derived Metrics ──────────────────────────────────────────────────────

  const allLoads: Load[] = loads?.loads || loads?.data || (Array.isArray(loads) ? loads : []);
  const allInvoices: Invoice[] = invoiceData?.invoices || invoiceData?.data || (Array.isArray(invoiceData) ? invoiceData : []);
  const allCarriers: Carrier[] = Array.isArray(carriers) ? carriers : (carriers?.data || carriers?.carriers || []);

  const now = new Date();
  const currentMonth = now.getMonth();
  const currentYear = now.getFullYear();
  const startOfMonth = new Date(currentYear, currentMonth, 1);
  const startOfWeek = new Date(now);
  startOfWeek.setDate(now.getDate() - now.getDay());

  // Loads this month
  const loadsThisMonth = allLoads.filter(l => {
    const d = l.pickupDate ? new Date(l.pickupDate) : (l.createdAt ? new Date(l.createdAt) : null);
    return d && d >= startOfMonth;
  });

  // Loads last month (for comparison)
  const lastMonthStart = new Date(currentYear, currentMonth - 1, 1);
  const loadsLastMonth = allLoads.filter(l => {
    const d = l.pickupDate ? new Date(l.pickupDate) : (l.createdAt ? new Date(l.createdAt) : null);
    return d && d >= lastMonthStart && d < startOfMonth;
  });

  // Revenue MTD
  const revenueMTD = finance?.revenueMTD ?? finance?.totalRevenue ?? 0;
  const avgMarginPercent = finance?.avgMarginPercent ?? finance?.marginPercent ?? 0;
  const cashBalance = finance?.cashBalance ?? 0;

  // Active carriers
  const activeCarrierCount = allCarriers.filter(c => c.onboardingStatus === "APPROVED").length || allCarriers.length;

  // Load pipeline counts
  const pipelineCounts = {
    POSTED: allLoads.filter(l => l.status === "POSTED").length,
    BOOKED: allLoads.filter(l => l.status === "BOOKED").length,
    IN_TRANSIT: allLoads.filter(l => ["IN_TRANSIT", "DISPATCHED", "PICKED_UP"].includes(l.status)).length,
    DELIVERED: allLoads.filter(l => ["DELIVERED", "COMPLETED"].includes(l.status) &&
      (() => { const d = l.deliveryDate ? new Date(l.deliveryDate) : (l.actualDeliveryDate ? new Date(l.actualDeliveryDate) : null); return d && d >= startOfMonth; })()
    ).length,
  };

  // ─── Section 3: Needs Attention ───────────────────────────────────────────

  // Overdue invoices
  const overdueInvoices = allInvoices.filter(inv => {
    if (!inv.dueDate) return false;
    const due = new Date(inv.dueDate);
    return due < now && inv.status !== "PAID" && inv.status !== "CANCELLED";
  });
  const overdueTotal = overdueInvoices.reduce((sum, inv) => sum + (inv.totalAmount || inv.amount || 0), 0);

  // Stale loads (POSTED for > 24 hours with no carrier)
  const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const staleLoads = allLoads.filter(l => {
    if (l.status !== "POSTED") return false;
    const created = l.createdAt ? new Date(l.createdAt) : null;
    return created && created < twentyFourHoursAgo;
  });

  // Expiring insurance — from compliance stats
  const expiringInsuranceCount = compliance?.expiringInsurance ?? compliance?.bySeverity?.WARNING ?? 0;

  // Pending carrier approvals
  const pendingCarrierApprovals = allCarriers.filter(c => c.onboardingStatus && c.onboardingStatus !== "APPROVED");

  // ─── Section 4: Revenue Trend ─────────────────────────────────────────────

  const revenueByMonth: { month: string; revenue: number }[] = [];
  if (finance?.monthlyTrend && Array.isArray(finance.monthlyTrend)) {
    finance.monthlyTrend.slice(-6).forEach((m: { month?: string; revenue?: number; totalRevenue?: number }) => {
      revenueByMonth.push({
        month: m.month || "",
        revenue: m.revenue || m.totalRevenue || 0,
      });
    });
  } else {
    // Fallback: derive from loads if no monthly trend data
    for (let i = 5; i >= 0; i--) {
      const m = new Date(currentYear, currentMonth - i, 1);
      const mEnd = new Date(currentYear, currentMonth - i + 1, 1);
      const monthLoads = allLoads.filter(l => {
        const d = l.pickupDate ? new Date(l.pickupDate) : null;
        return d && d >= m && d < mEnd;
      });
      const monthRev = monthLoads.reduce((s, l) => s + (l.rate || 0), 0);
      revenueByMonth.push({ month: MONTH_NAMES[m.getMonth()], revenue: monthRev });
    }
  }

  // ─── Team Metrics ─────────────────────────────────────────────────────────
  // TODO: Filter by userId when team grows

  const loadsCreatedThisWeek = allLoads.filter(l => {
    const d = l.createdAt ? new Date(l.createdAt) : null;
    return d && d >= startOfWeek;
  }).length;

  const revenueThisWeek = allLoads.filter(l => {
    const d = l.pickupDate ? new Date(l.pickupDate) : null;
    return d && d >= startOfWeek;
  }).reduce((s, l) => s + (l.rate || 0), 0);

  const newCustomersThisMonth = customers?.newThisMonth ?? customers?.activeCustomers ?? 0;

  const pendingInvoices = allInvoices.filter(inv => inv.status === "PENDING" || inv.status === "SENT");
  const pipelineValue = allLoads.filter(l => l.status === "POSTED").reduce((s, l) => s + (l.rate || 0), 0);

  const carriersOnboardedThisMonth = allCarriers.filter(c => {
    const d = c.createdAt ? new Date(c.createdAt) : null;
    return d && d >= startOfMonth;
  }).length;

  const loadsDispatchedThisWeek = allLoads.filter(l => {
    if (!["DISPATCHED", "PICKED_UP", "IN_TRANSIT", "DELIVERED", "COMPLETED"].includes(l.status)) return false;
    const d = l.createdAt ? new Date(l.createdAt) : null;
    return d && d >= startOfWeek;
  }).length;

  const deliveredLoads = allLoads.filter(l => ["DELIVERED", "COMPLETED"].includes(l.status));
  const onTimeLoads = deliveredLoads.filter(l => {
    if (!l.deliveryDate || !l.actualDeliveryDate) return true; // assume on-time if no data
    return new Date(l.actualDeliveryDate) <= new Date(l.deliveryDate);
  });
  const onTimePercent = deliveredLoads.length > 0 ? Math.round((onTimeLoads.length / deliveredLoads.length) * 100) : 100;

  const pendingTenders = allLoads.filter(l => l.status === "BOOKED" && !l.carrierId).length;
  const complianceAlerts = (compliance?.bySeverity?.CRITICAL || 0) + (compliance?.bySeverity?.WARNING || 0);

  // ─── Render ───────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="bg-gradient-to-r from-gold/20 via-gold/10 to-transparent rounded-2xl p-6 border border-gold/10 animate-pulse">
          <div className="h-8 w-64 bg-white/10 rounded mb-2" />
          <div className="h-4 w-96 bg-white/10 rounded" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white/5 rounded-xl border border-white/10 p-4 animate-pulse">
              <div className="h-4 w-12 bg-white/10 rounded mb-3" />
              <div className="h-8 w-20 bg-white/10 rounded mb-1" />
              <div className="h-3 w-16 bg-white/10 rounded" />
            </div>
          ))}
        </div>
        <div className="flex items-center justify-center py-12 text-slate-500 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading command center...
        </div>
      </div>
    );
  }

  const loadCountChange = pctChange(loadsThisMonth.length, loadsLastMonth.length);
  const marginColor = avgMarginPercent > 15 ? "text-green-400" : avgMarginPercent >= 10 ? "text-yellow-400" : "text-red-400";

  return (
    <div className="p-6 space-y-6">
      {/* ─── Header Banner ─────────────────────────────────────────────────── */}
      <div className="bg-gradient-to-r from-gold/20 via-gold/10 to-transparent rounded-2xl p-6 md:p-8 border border-gold/10">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white mb-1">
              Good {now.getHours() < 12 ? "morning" : now.getHours() < 17 ? "afternoon" : "evening"}, {user?.firstName || "Boss"}
            </h1>
            <p className="text-slate-400 text-sm">
              What happened, what&apos;s urgent, and what to focus on today.
            </p>
          </div>
          <div className="hidden md:flex items-center gap-3 text-sm text-slate-500">
            {now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
            <NotificationBell />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 1: Revenue & Financial KPIs — 6-column grid
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-6 gap-4">
        {/* 1. Revenue MTD */}
        <KpiCard
          icon={<DollarSign className="w-4 h-4" />}
          iconBg="text-green-400 bg-green-500/20"
          label="Revenue MTD"
          value={fmtCompact.format(revenueMTD)}
          trend={revenueMTD > 0 ? { direction: "up", label: "active" } : undefined}
          href="/dashboard/finance"
        />

        {/* 2. Gross Margin % */}
        <KpiCard
          icon={<TrendingUp className="w-4 h-4" />}
          iconBg={`${marginColor} ${marginColor.replace("text-", "bg-").replace("400", "500/20")}`}
          label="Gross Margin %"
          value={`${avgMarginPercent.toFixed(1)}%`}
          valueColor={marginColor}
          href="/dashboard/lane-analytics"
        />

        {/* 3. Load Count MTD */}
        <KpiCard
          icon={<Package className="w-4 h-4" />}
          iconBg="text-blue-400 bg-blue-500/20"
          label="Loads MTD"
          value={String(loadsThisMonth.length)}
          trend={loadCountChange !== null ? {
            direction: loadCountChange >= 0 ? "up" : "down",
            label: `${loadCountChange >= 0 ? "+" : ""}${loadCountChange}% vs last mo`,
          } : undefined}
          href="/dashboard/loads"
        />

        {/* 4. Active Customers */}
        <KpiCard
          icon={<Users className="w-4 h-4" />}
          iconBg="text-gold bg-gold/20"
          label="Active Customers"
          value={String(customers?.activeCustomers ?? customers?.total ?? 0)}
          href="/dashboard/crm"
        />

        {/* 5. Active Carriers */}
        <KpiCard
          icon={<UserCheck className="w-4 h-4" />}
          iconBg="text-purple-400 bg-purple-500/20"
          label="Active Carriers"
          value={String(activeCarrierCount)}
          href="/dashboard/carriers"
        />

        {/* 6. Cash Balance */}
        <KpiCard
          icon={<DollarSign className="w-4 h-4" />}
          iconBg={cashBalance < 10000 ? "text-red-400 bg-red-500/20" : "text-emerald-400 bg-emerald-500/20"}
          label="Cash Balance"
          value={fmtCompact.format(cashBalance)}
          valueColor={cashBalance < 10000 ? "text-red-400" : undefined}
          href="/accounting/fund"
        />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 2: Team Performance — 2 columns
          ═══════════════════════════════════════════════════════════════════════ */}
      {/* TODO: Filter by userId when team grows */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Sales (Wasih) */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-gold" />
            Sales (Wasih)
          </h3>
          <div className="space-y-3">
            <TeamMetricRow label="Loads Created This Week" value={String(loadsCreatedThisWeek)} />
            <TeamMetricRow label="Revenue This Week" value={fmt.format(revenueThisWeek)} />
            <TeamMetricRow label="New Customers This Month" value={String(newCustomersThisMonth)} />
            <TeamMetricRow label="Proposals Sent (Pending)" value={String(pendingInvoices.length)} />
            <TeamMetricRow label="Pipeline Value (Posted)" value={fmt.format(pipelineValue)} highlight />
          </div>
        </div>

        {/* Carrier Ops (Noor) */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <UserCheck className="w-4 h-4 text-gold" />
            Carrier Ops (Noor)
          </h3>
          <div className="space-y-3">
            <TeamMetricRow label="Carriers Onboarded This Month" value={String(carriersOnboardedThisMonth)} />
            <TeamMetricRow label="Loads Dispatched This Week" value={String(loadsDispatchedThisWeek)} />
            <TeamMetricRow label="On-Time Delivery %" value={`${onTimePercent}%`} valueColor={onTimePercent >= 90 ? "text-green-400" : "text-yellow-400"} />
            <TeamMetricRow label="Pending Tenders" value={String(pendingTenders)} />
            <TeamMetricRow label="Compliance Alerts Active" value={String(complianceAlerts)} valueColor={complianceAlerts > 0 ? "text-red-400" : "text-green-400"} />
          </div>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 3: Needs Attention — 4 action cards
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {/* Overdue Invoices */}
        <AttentionCard
          borderColor="border-red-500/40"
          bgColor="bg-red-500/5"
          icon={<FileText className="w-5 h-5 text-red-400" />}
          count={overdueInvoices.length}
          label="Overdue Invoices"
          detail={overdueTotal > 0 ? `${fmt.format(overdueTotal)} outstanding` : undefined}
          href="/accounting/aging"
        />

        {/* Stale Loads */}
        <AttentionCard
          borderColor="border-yellow-500/40"
          bgColor="bg-yellow-500/5"
          icon={<Clock className="w-5 h-5 text-yellow-400" />}
          count={staleLoads.length}
          label="Stale Loads (>24h)"
          detail="No carrier assigned"
          href="/dashboard/loads"
        />

        {/* Expiring Insurance */}
        <AttentionCard
          borderColor="border-yellow-500/40"
          bgColor="bg-yellow-500/5"
          icon={<Shield className="w-5 h-5 text-yellow-400" />}
          count={expiringInsuranceCount}
          label="Expiring Insurance"
          detail="Needs review"
          href="/dashboard/compliance"
        />

        {/* Pending Carrier Approvals */}
        <AttentionCard
          borderColor="border-blue-500/40"
          bgColor="bg-blue-500/5"
          icon={<UserCheck className="w-5 h-5 text-blue-400" />}
          count={pendingCarrierApprovals.length}
          label="Pending Approvals"
          detail="Carrier onboarding"
          href="/dashboard/carriers"
        />

        {/* Quick Pay Health */}
        <QuickPayHealthCard />
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          SECTION 4: Revenue Trend + Load Pipeline — 2 columns
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="grid md:grid-cols-2 gap-4">
        {/* Revenue Bar Chart */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-gold" />
            Revenue Trend (6 Months)
          </h3>
          {revenueByMonth.length > 0 && revenueByMonth.some(m => m.revenue > 0) ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={revenueByMonth}>
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: "#64748b", fontSize: 12 }}
                  tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}k`}
                />
                <Tooltip
                  contentStyle={{
                    background: "#1e293b",
                    border: "1px solid rgba(255,255,255,0.1)",
                    borderRadius: "8px",
                    color: "#fff",
                    fontSize: "12px",
                  }}
                  formatter={(v: number | undefined) =>
                    v != null ? [fmt.format(v), "Revenue"] : ["$0", "Revenue"]
                  }
                />
                <Bar dataKey="revenue" fill="#C9A84C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-[220px] flex items-center justify-center text-slate-500 text-sm">
              No revenue data yet
            </div>
          )}
        </div>

        {/* Load Pipeline */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <h3 className="font-semibold text-white mb-4 flex items-center gap-2">
            <Package className="w-4 h-4 text-gold" />
            Load Pipeline
          </h3>
          <div className="space-y-4 mt-2">
            {(["POSTED", "BOOKED", "IN_TRANSIT", "DELIVERED"] as const).map(status => {
              const count = pipelineCounts[status];
              const total = Object.values(pipelineCounts).reduce((a, b) => a + b, 0) || 1;
              const widthPct = Math.max(8, (count / total) * 100);
              return (
                <div key={status} className="space-y-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${STATUS_COLORS[status] || "bg-slate-400"}`} />
                      <span className="text-sm text-slate-300">
                        {status.replace(/_/g, " ")}
                      </span>
                    </div>
                    <span className={`text-lg font-bold ${STATUS_TEXT_COLORS[status] || "text-white"}`}>
                      {count}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-white/5 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${STATUS_COLORS[status] || "bg-slate-400"} transition-all duration-500`}
                      style={{ width: `${widthPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs text-slate-500">Total Active</span>
            <span className="text-sm font-semibold text-white">
              {pipelineCounts.POSTED + pipelineCounts.BOOKED + pipelineCounts.IN_TRANSIT} loads
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Sub-components ────────────────────────────────────────────────────────────

function KpiCard({
  icon,
  iconBg,
  label,
  value,
  valueColor,
  trend,
  href,
}: {
  icon: React.ReactNode;
  iconBg: string;
  label: string;
  value: string;
  valueColor?: string;
  trend?: { direction: "up" | "down"; label: string };
  href?: string;
}) {
  const content = (
    <>
      <div className="flex items-center justify-between mb-2">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${iconBg}`}>
          {icon}
        </div>
        {trend && (
          <span className={`flex items-center gap-0.5 text-xs ${trend.direction === "up" ? "text-green-400" : "text-red-400"}`}>
            {trend.direction === "up" ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {trend.label}
          </span>
        )}
      </div>
      <p className={`text-2xl font-bold ${valueColor || "text-white"}`}>{value}</p>
      <p className="text-xs text-slate-400 mt-0.5">{label}</p>
    </>
  );
  if (href) {
    return (
      <Link href={href} className="bg-white/5 border border-white/10 rounded-xl p-4 hover:bg-white/[0.08] hover:border-gold/20 transition-all cursor-pointer block">
        {content}
      </Link>
    );
  }
  return <div className="bg-white/5 border border-white/10 rounded-xl p-4">{content}</div>;
}

function TeamMetricRow({
  label,
  value,
  highlight,
  valueColor,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  valueColor?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-400">{label}</span>
      <span className={`text-sm font-semibold ${valueColor || (highlight ? "text-gold" : "text-white")}`}>
        {value}
      </span>
    </div>
  );
}

function AttentionCard({
  borderColor,
  bgColor,
  icon,
  count,
  label,
  detail,
  href,
}: {
  borderColor: string;
  bgColor: string;
  icon: React.ReactNode;
  count: number;
  label: string;
  detail?: string;
  href: string;
}) {
  const isEmpty = count === 0;
  return (
    <Link href={href}
      className={`${isEmpty ? "bg-white/5 border-white/10 hover:bg-white/[0.07]" : `${bgColor} ${borderColor} hover:brightness-110`} border rounded-xl p-4 flex flex-col justify-between cursor-pointer transition-all block`}>
      <div>
        <div className="flex items-center justify-between mb-2">
          {isEmpty ? <CheckCircle2 className="w-5 h-5 text-green-400" /> : icon}
          <span className={`text-2xl font-bold ${isEmpty ? "text-green-400" : "text-white"}`}>
            {count}
          </span>
        </div>
        <p className="text-sm text-white font-medium">{label}</p>
        {detail && !isEmpty && (
          <p className="text-xs text-slate-400 mt-0.5">{detail}</p>
        )}
        {isEmpty && (
          <p className="text-xs text-green-400/70 mt-0.5">All clear</p>
        )}
      </div>
      {!isEmpty && (
        <span className="flex items-center gap-1 text-xs text-gold mt-3">
          View <ChevronRight className="w-3 h-3" />
        </span>
      )}
    </Link>
  );
}

function QuickPayHealthCard() {
  const { data: qpData } = useQuery({
    queryKey: ["ceo-quickpay-health"],
    queryFn: () => api.get("/accounting/quickpay-health").then(r => r.data).catch(() => null),
  });

  const totalCapital = qpData?.totalCapital ?? 70000;
  const deployed = qpData?.deployed ?? 0;
  const available = totalCapital - deployed;
  const deployedPct = totalCapital > 0 ? Math.round((deployed / totalCapital) * 100) : 0;

  let statusColor = "text-green-400";
  let statusBg = "bg-green-500/20";
  let statusLabel = "GREEN";
  let warning: string | null = null;

  if (available < 20000) {
    statusColor = "text-red-400";
    statusBg = "bg-red-500/20";
    statusLabel = "RED";
    warning = "All QP Paused";
  } else if (available < 30000) {
    statusColor = "text-yellow-400";
    statusBg = "bg-yellow-500/20";
    statusLabel = "YELLOW";
    warning = "Bronze Paused";
  }

  return (
    <div className={`${available < 20000 ? "bg-red-500/5 border-red-500/40" : available < 30000 ? "bg-yellow-500/5 border-yellow-500/40" : "bg-white/5 border-white/10"} border rounded-xl p-4 flex flex-col justify-between`}>
      <div>
        <div className="flex items-center justify-between mb-2">
          <Zap className={`w-5 h-5 ${statusColor}`} />
          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${statusBg} ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <p className="text-sm text-white font-medium">Quick Pay Health</p>
        <p className="text-xs text-slate-400 mt-1">
          Available: <span className="font-semibold text-white">{new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(available)}</span>
        </p>
        <p className="text-xs text-slate-400 mt-0.5">
          Deployed: {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(deployed)} ({deployedPct}%)
        </p>
        {warning && (
          <p className={`text-xs font-semibold mt-1.5 ${statusColor}`}>
            {warning}
          </p>
        )}
      </div>
      <Link
        href="/accounting/fund"
        className="flex items-center gap-1 text-xs text-gold mt-3 hover:text-gold/80 transition"
      >
        Details <ChevronRight className="w-3 h-3" />
      </Link>
    </div>
  );
}

function NotificationBell() {
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const { data: unreadData } = useQuery({
    queryKey: ["unread-count"],
    queryFn: () => api.get<{ count: number }>("/notifications/unread-count").then((r) => r.data),
    refetchInterval: 30000,
  });
  const unreadCount = unreadData?.count || 0;

  const { data: notifs } = useQuery({
    queryKey: ["recent-notifications-ceo"],
    queryFn: () => api.get("/notifications?limit=8").then((r) => r.data),
    enabled: open,
  });

  const markAllRead = useCallback(() => {
    api.patch("/notifications/read-all").then(() => {
      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
      queryClient.invalidateQueries({ queryKey: ["recent-notifications-ceo"] });
    }).catch(() => {});
  }, [queryClient]);

  return (
    <div className="relative">
      <button onClick={() => setOpen((p) => !p)}
        className="relative w-10 h-10 flex items-center justify-center rounded-xl transition cursor-pointer"
        style={{ background: "var(--srl-bg-surface)", border: "1px solid var(--srl-border)" }}>
        <Bell className="w-5 h-5" style={{ color: unreadCount > 0 ? "var(--srl-gold)" : "var(--srl-text-muted)" }} />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full text-[10px] text-white font-bold flex items-center justify-center px-1">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-[99]" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-80 rounded-xl shadow-2xl z-[100] overflow-hidden"
            style={{ background: "var(--srl-bg-surface)", border: "1px solid var(--srl-border)" }}>
            <div className="px-4 py-3 flex items-center justify-between" style={{ borderBottom: "1px solid var(--srl-border-subtle)" }}>
              <span className="text-sm font-semibold" style={{ color: "var(--srl-text)" }}>Notifications</span>
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-xs cursor-pointer" style={{ color: "var(--srl-gold)" }}>Mark all read</button>
              )}
            </div>
            <div className="max-h-80 overflow-y-auto">
              {Array.isArray(notifs) && notifs.length > 0 ? notifs.map((n: { id: string; title: string; message: string; readAt: string | null; actionUrl?: string; createdAt: string }) => (
                <button key={n.id} onClick={() => {
                  // Mark as read
                  if (!n.readAt) {
                    api.patch(`/notifications/${n.id}/read`).then(() => {
                      queryClient.invalidateQueries({ queryKey: ["unread-count"] });
                      queryClient.invalidateQueries({ queryKey: ["recent-notifications-ceo"] });
                    }).catch(() => {});
                  }
                  setOpen(false);
                  if (n.actionUrl) {
                    let url = n.actionUrl;
                    // Normalize legacy paths
                    if (url.includes("/ae/") || url.includes(".html")) {
                      url = "/dashboard/overview";
                    }
                    // URLs with entity UUIDs may point to deleted records — strip to list page
                    const path = url.split("?")[0];
                    const hasEntityId = /\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(path);
                    if (hasEntityId) {
                      const listPath = path.replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "");
                      router.push(listPath.startsWith("/dashboard") ? listPath : "/dashboard/overview");
                    } else {
                      router.push(url);
                    }
                  }
                }}
                  className="w-full text-left px-4 py-3 transition cursor-pointer"
                  style={{ borderBottom: "1px solid var(--srl-border-subtle)", background: !n.readAt ? "var(--srl-gold-muted)" : "transparent" }}>
                  <p className="text-xs font-medium" style={{ color: !n.readAt ? "var(--srl-text)" : "var(--srl-text-secondary)" }}>{n.title}</p>
                  <p className="text-[11px] mt-0.5 line-clamp-2" style={{ color: "var(--srl-text-muted)" }}>{n.message}</p>
                  <p className="text-[10px] mt-1" style={{ color: "var(--srl-text-muted)" }}>{new Date(n.createdAt).toLocaleString()}</p>
                </button>
              )) : (
                <div className="px-4 py-8 text-center text-xs" style={{ color: "var(--srl-text-muted)" }}>No notifications</div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
