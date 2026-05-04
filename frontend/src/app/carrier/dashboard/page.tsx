"use client";

import { useState } from "react";
import Link from "next/link";
import { Package, Truck, Shield, DollarSign, AlertCircle, Award, Zap, Clock, ChevronRight, Calculator } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard, CarrierBadge } from "@/components/carrier";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";

// ─── Caravan Partner Program — Tier Mapping & Config (v3.7.a) ─────────────────

// Map the raw CarrierProfile.tier enum (which still exposes GUEST/NONE for
// pre-onboard rows) onto the 3 active display tiers.
const CARAVAN_TIER_MAP: Record<string, string> = {
  GUEST: "SILVER",
  NONE: "SILVER",
  SILVER: "SILVER",
  GOLD: "GOLD",
  PLATINUM: "PLATINUM",
};

const TIER_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  SILVER: { bg: "bg-slate-500/10", text: "text-slate-600", border: "border-slate-300", badge: "bg-slate-100 text-slate-600 border-slate-300" },
  GOLD: { bg: "bg-yellow-500/10", text: "text-yellow-700", border: "border-yellow-400", badge: "bg-yellow-100 text-yellow-700 border-yellow-400" },
  PLATINUM: { bg: "bg-purple-500/10", text: "text-purple-700", border: "border-purple-400", badge: "bg-purple-100 text-purple-700 border-purple-400" },
};

// v3 Quick Pay pricing — 7-day rate shown as the headline (same-day = +2%).
const TIER_BENEFITS: Record<string, { paymentTerms: string; qpSpeed: string; qpFee: string; safetyBonus: string; detentionRate: string }> = {
  SILVER:   { paymentTerms: "Net-30", qpSpeed: "7-day",  qpFee: "3.0%", safetyBonus: "—",         detentionRate: "$50/hr" },
  GOLD:     { paymentTerms: "Net-21", qpSpeed: "7-day",  qpFee: "2.0%", safetyBonus: "$150/mo",   detentionRate: "$65/hr" },
  PLATINUM: { paymentTerms: "Net-14", qpSpeed: "7-day",  qpFee: "1.0%", safetyBonus: "$300/mo",   detentionRate: "$75/hr" },
};

const MILESTONE_NAMES: Record<string, string> = {
  M1: "New Partner",
  M2: "Established",
  M3: "Reliable",
  M4: "Preferred",
  M5: "Elite",
  M6: "Legend",
};

export default function CarrierOverviewPage() {
  const { user } = useCarrierAuth();
  const profile = user?.carrierProfile;

  const rawTier = profile?.tier || "NONE";
  const caravanTier = CARAVAN_TIER_MAP[rawTier] || "SILVER";
  const tierStyle = TIER_COLORS[caravanTier];
  const benefits = TIER_BENEFITS[caravanTier];

  const { data: myLoads } = useQuery({
    queryKey: ["carrier-my-loads-dash"],
    queryFn: () => api.get("/carrier-loads/my-loads?limit=5").then((r) => r.data),
  });

  const { data: available } = useQuery({
    queryKey: ["carrier-available-dash"],
    queryFn: () => api.get("/carrier-loads/available?limit=5").then((r) => r.data),
  });

  const { data: paymentSummary } = useQuery({
    queryKey: ["carrier-payments-summary"],
    queryFn: () => api.get("/carrier-payments/summary").then((r) => r.data),
  });

  const { data: compliance } = useQuery({
    queryKey: ["carrier-compliance-dash"],
    queryFn: () => api.get("/carrier-compliance/overview").then((r) => r.data),
  });

  const { data: scorecard } = useQuery({
    queryKey: ["carrier-scorecard-dash"],
    queryFn: () => api.get("/carrier/scorecard").then((r) => r.data).catch(() => null),
  });

  const activeLoads = myLoads?.loads?.filter((l: any) => !["DELIVERED", "POD_RECEIVED", "COMPLETED", "CANCELLED"].includes(l.status)) || [];
  const recentLoads = myLoads?.loads || [];
  const availableLoads = available?.loads || [];
  const alerts = compliance?.alerts || [];
  const criticalAlerts = compliance?.alertsSummary?.critical || 0;

  // Milestone data from scorecard or defaults
  const currentMilestone = scorecard?.milestone || "M1";
  const milestoneLoads = scorecard?.milestoneLoads || 0;
  const milestoneTarget = scorecard?.milestoneTarget || 10;
  const milestoneProgress = milestoneTarget > 0 ? Math.min((milestoneLoads / milestoneTarget) * 100, 100) : 0;
  const nextMilestone = scorecard?.nextMilestone || "M2";

  // QP Savings Calculator state
  const [calcAmount, setCalcAmount] = useState(15000);
  const tierFeePercent = parseFloat(benefits.qpFee) || 3.5;
  const factoringRate = 4.5;
  const calcFactoringCost = Math.round(calcAmount * (factoringRate / 100));
  const calcQPCost = Math.round(calcAmount * (tierFeePercent / 100));
  const calcMonthlySavings = calcFactoringCost - calcQPCost;
  const calcAnnualSavings = calcMonthlySavings * 12;

  // Quick Pay data from payment summary or defaults
  const qpBalance = paymentSummary?.quickPay?.availableBalance ?? 0;
  const qpUsedThisMonth = paymentSummary?.quickPay?.usedThisMonth ?? 0;
  const qpMonthlyLimit = paymentSummary?.quickPay?.monthlyLimit ?? 5000;
  const qpUsagePercent = qpMonthlyLimit > 0 ? Math.min((qpUsedThisMonth / qpMonthlyLimit) * 100, 100) : 0;

  return (
    <div>
      <div className="mb-6">
        <h1 className="font-serif text-2xl text-[#0F1117] mb-1">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ""}
        </h1>
        <p className="text-[13px] text-gray-500">
          {profile?.companyName || user?.company || "Carrier Portal"} &middot; MC-{profile?.mcNumber || "\u2014"}
        </p>
      </div>

      {/* Caravan Tier Badge + Milestone */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        {/* Tier Badge */}
        <CarrierCard padding="p-5" className={`!border-2 ${tierStyle.border}`}>
          <div className="flex items-center gap-3 mb-3">
            <div className={`w-12 h-12 rounded-xl ${tierStyle.bg} flex items-center justify-center`}>
              <Award size={24} className={tierStyle.text} />
            </div>
            <div>
              <div className="text-[11px] text-gray-700 font-medium uppercase tracking-wider">Caravan Tier</div>
              <span className={`inline-block mt-0.5 px-3 py-1 rounded-full text-sm font-bold border ${tierStyle.badge}`}>
                {caravanTier}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <div className={`w-6 h-6 rounded-md ${tierStyle.bg} flex items-center justify-center`}>
              <span className="text-[10px] font-bold text-gray-500">{currentMilestone}</span>
            </div>
            <span className="text-xs text-gray-500">{MILESTONE_NAMES[currentMilestone] || currentMilestone}</span>
            <span className="text-[10px] text-gray-700 ml-auto">{milestoneLoads}/{milestoneTarget} loads to {nextMilestone}</span>
          </div>
          <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-[#C9A84C] rounded-full transition-all duration-500" style={{ width: `${milestoneProgress}%` }} />
          </div>
          <Link href="/carrier/dashboard/scorecard" className="text-[11px] text-[#BA7517] font-semibold mt-2.5 inline-flex items-center gap-1 hover:underline">
            View Scorecard <ChevronRight size={12} />
          </Link>
        </CarrierCard>

        {/* Quick Pay Status */}
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Zap size={20} className="text-emerald-700" />
            </div>
            <div>
              <div className="text-[11px] text-gray-700 font-medium">Quick Pay</div>
              <div className="text-[22px] font-bold text-[#0F1117]">${qpBalance.toLocaleString()}</div>
            </div>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-700">Fee Rate</span>
              <span className="font-semibold text-[#0F1117]">{benefits.qpFee}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Speed</span>
              <span className="font-semibold text-[#0F1117]">{benefits.qpSpeed}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Monthly Usage</span>
              <span className="font-semibold text-[#0F1117]">${qpUsedThisMonth.toLocaleString()} / ${qpMonthlyLimit.toLocaleString()}</span>
            </div>
            <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${qpUsagePercent > 80 ? "bg-red-500" : qpUsagePercent > 50 ? "bg-yellow-500" : "bg-emerald-500"}`} style={{ width: `${qpUsagePercent}%` }} />
            </div>
          </div>
        </CarrierCard>

        {/* Your Tier Benefits */}
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Award size={16} className="text-[#BA7517]" />
            <span className="text-[13px] font-bold text-[#0F1117]">Your Tier Benefits</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-700">Payment Terms</span>
              <span className="font-semibold text-[#0F1117]">{benefits.paymentTerms}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Quick Pay Speed</span>
              <span className="font-semibold text-[#0F1117]">{benefits.qpSpeed}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Quick Pay Fee</span>
              <span className="font-semibold text-[#0F1117]">{benefits.qpFee}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Safety Bonus</span>
              <span className="font-semibold text-emerald-600">{benefits.safetyBonus}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Detention Rate</span>
              <span className="font-semibold text-[#0F1117]">{benefits.detentionRate}</span>
            </div>
          </div>
        </CarrierCard>
      </div>

      {/* QP Savings Calculator */}
      <CarrierCard padding="p-5" className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Calculator size={16} className="text-emerald-700" />
          <span className="text-[13px] font-bold text-[#0F1117]">Quick Pay Savings Calculator</span>
        </div>
        <div className="mb-3">
          <label className="text-[11px] text-gray-700 font-medium block mb-1">Average Monthly Invoice Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 text-sm">$</span>
            <input
              type="number"
              value={calcAmount}
              onChange={(e) => setCalcAmount(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full pl-7 pr-3 py-2 border border-gray-200 rounded-lg text-sm text-[#0F1117] font-semibold focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]"
            />
          </div>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-center px-3 py-2 bg-red-50 rounded-lg">
            <span className="text-red-600">With factoring ({factoringRate}%)</span>
            <span className="font-bold text-red-600">-${calcFactoringCost.toLocaleString()}/mo</span>
          </div>
          <div className="flex justify-between items-center px-3 py-2 bg-violet-50 rounded-lg">
            <span className="text-violet-600">With SRL Quick Pay ({tierFeePercent}%)</span>
            <span className="font-bold text-violet-600">-${calcQPCost.toLocaleString()}/mo</span>
          </div>
          <div className="flex justify-between items-center px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg">
            <span className="font-semibold text-emerald-700">You save</span>
            <span className="font-bold text-emerald-600">${calcMonthlySavings.toLocaleString()}/mo (${calcAnnualSavings.toLocaleString()}/yr)</span>
          </div>
        </div>
      </CarrierCard>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
              <Truck size={20} className="text-blue-500" />
            </div>
            <div>
              <div className="text-[11px] text-gray-700 font-medium">Active Loads</div>
              <div className="text-[28px] font-bold text-[#0F1117]">{activeLoads.length}</div>
            </div>
          </div>
        </CarrierCard>
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <Package size={20} className="text-emerald-700" />
            </div>
            <div>
              <div className="text-[11px] text-gray-700 font-medium">Available Loads</div>
              <div className="text-[28px] font-bold text-[#0F1117]">{available?.total || 0}</div>
            </div>
          </div>
        </CarrierCard>
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <DollarSign size={20} className="text-amber-700" />
            </div>
            <div>
              <div className="text-[11px] text-gray-700 font-medium">Pending Pay</div>
              <div className="text-[28px] font-bold text-[#0F1117]">
                ${(paymentSummary?.totalPending?.amount || 0).toLocaleString()}
              </div>
            </div>
          </div>
        </CarrierCard>
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
              <Shield size={20} className="text-violet-500" />
            </div>
            <div>
              <div className="text-[11px] text-gray-700 font-medium">Compliance</div>
              <div className="text-[28px] font-bold text-[#0F1117]">
                {criticalAlerts > 0 ? (
                  <span className="text-red-500">{criticalAlerts} Alert{criticalAlerts > 1 ? "s" : ""}</span>
                ) : (
                  <span className="text-emerald-700">Good</span>
                )}
              </div>
            </div>
          </div>
        </CarrierCard>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-4 gap-3 mb-6">
        {[
          { icon: Package, label: "Find Loads", href: "/carrier/dashboard/available-loads" },
          { icon: Truck, label: "My Loads", href: "/carrier/dashboard/my-loads" },
          { icon: Shield, label: "Compliance", href: "/carrier/dashboard/compliance" },
          { icon: DollarSign, label: "Payments", href: "/carrier/dashboard/payments" },
        ].map((a, i) => (
          <Link key={i} href={a.href}>
            <CarrierCard hover padding="p-4">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[#C9A84C]/10 flex items-center justify-center">
                  <a.icon size={18} className="text-[#BA7517]" />
                </div>
                <span className="text-[13px] font-semibold text-[#0F1117]">{a.label}</span>
              </div>
            </CarrierCard>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* My Active Loads */}
        <CarrierCard padding="p-0">
          <div className="px-5 py-4 flex justify-between items-center border-b border-gray-100">
            <h3 className="text-[15px] font-bold text-[#0F1117]">My Active Loads</h3>
            <Link href="/carrier/dashboard/my-loads" className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#BA7517]">
              View All
            </Link>
          </div>
          {recentLoads.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-gray-700">No loads assigned yet</div>
          ) : (
            recentLoads.slice(0, 5).map((load: Record<string, any>) => (
              <div key={load.id} className="px-5 py-3 border-b border-gray-100 flex justify-between items-center hover:bg-gray-50">
                <div>
                  <div className="text-xs font-mono font-semibold text-[#0F1117]">{load.referenceNumber}</div>
                  <div className="text-[11px] text-gray-700">
                    {load.originCity}, {load.originState} &rarr; {load.destCity}, {load.destState}
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <span className="text-xs font-bold text-[#0F1117]">${(load.carrierRate || load.rate || 0).toLocaleString()}</span>
                  <CarrierBadge status={load.status} />
                </div>
              </div>
            ))
          )}
        </CarrierCard>

        {/* Available Loads */}
        <CarrierCard padding="p-0">
          <div className="px-5 py-4 flex justify-between items-center border-b border-gray-100">
            <h3 className="text-[15px] font-bold text-[#0F1117]">Available Loads</h3>
            <Link href="/carrier/dashboard/available-loads" className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#BA7517]">
              View All
            </Link>
          </div>
          {availableLoads.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-gray-700">No available loads right now</div>
          ) : (
            availableLoads.slice(0, 5).map((load: Record<string, any>) => (
              <div key={load.id} className="px-5 py-3 border-b border-gray-100 flex justify-between items-center hover:bg-gray-50">
                <div>
                  <div className="text-xs font-mono font-semibold text-[#0F1117]">{load.referenceNumber}</div>
                  <div className="text-[11px] text-gray-700">
                    {load.originCity}, {load.originState} &rarr; {load.destCity}, {load.destState}
                  </div>
                  <div className="text-[10px] text-gray-700 mt-0.5">{load.equipmentType} &middot; {load.weight ? `${Number(load.weight).toLocaleString()} lbs` : "\u2014"}</div>
                </div>
                <span className="text-xs font-bold text-[#BA7517]">${(load.carrierRate || load.rate || 0).toLocaleString()}</span>
              </div>
            ))
          )}
        </CarrierCard>
      </div>

      {/* Compliance Alerts */}
      {alerts.length > 0 && (
        <CarrierCard padding="p-4" className="!bg-amber-500/[0.06] !border-amber-500/20">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={16} className="text-amber-700" />
            <span className="text-xs font-bold text-amber-700">Compliance Alerts</span>
          </div>
          {alerts.slice(0, 3).map((a: any, i: number) => (
            <div key={i} className="text-xs text-gray-600 leading-relaxed mb-1">{a.message || a.type}</div>
          ))}
          <Link href="/carrier/dashboard/compliance" className="text-[11px] text-[#BA7517] font-semibold mt-2 inline-block">
            View All &rarr;
          </Link>
        </CarrierCard>
      )}
    </div>
  );
}
