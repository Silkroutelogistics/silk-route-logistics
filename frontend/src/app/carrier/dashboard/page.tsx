"use client";

import { useState } from "react";
import Link from "next/link";
import { Package, Truck, Shield, DollarSign, AlertCircle, Award, Zap, Clock, ChevronRight, Calculator } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard, CarrierBadge } from "@/components/carrier";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";
import { money, perMile, carrierPay } from "@/lib/rateDisplay";

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

// v3.8.aab Sprint 24: canonical Caravan Partner Program tier palette
// per skill tokens.md. Pre-Sprint-24 used generic Tailwind slate/yellow/
// purple — off-brand. Post-Sprint-24 uses canonical SRL tokens:
//   Silver:   navy-300 (#8AA5C0) tinted bg + navy-500 (#5B7EA3) text
//   Gold:     canonical --gold (#C5A572) tinted bg + --gold-dark
//             (#BA7517) text
//   Platinum: canonical --navy (#0A2540) bg + --gold (#C5A572) text —
//             top-tier brand treatment
const TIER_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  SILVER: { bg: "bg-[#8AA5C0]/15", text: "text-[#5B7EA3]", border: "border-[#8AA5C0]/40", badge: "bg-[#8AA5C0]/15 text-[#5B7EA3] border-[#8AA5C0]/40" },
  GOLD: { bg: "bg-[#C5A572]/15", text: "text-[#BA7517]", border: "border-[#C5A572]/40", badge: "bg-[#C5A572]/15 text-[#BA7517] border-[#C5A572]/40" },
  PLATINUM: { bg: "bg-[#0A2540]", text: "text-[#C5A572]", border: "border-[#0A2540]", badge: "bg-[#0A2540] text-[#C5A572] border-[#0A2540]" },
};

// v3 Quick Pay pricing — 7-day rate shown as the headline (same-day = +2%).
// Only genuinely tier-scoped terms belong in this table. Detention was removed
// here: it is uniform platform-wide, and presenting it as a tier benefit is the
// shape CLAUDE.md §5 retired even when the number matches on every row. Safety
// bonuses are absent for the same reason — no backend honors the claim.
const TIER_BENEFITS: Record<string, { paymentTerms: string; qpSpeed: string; qpFee: string }> = {
  SILVER:   { paymentTerms: "Net-30", qpSpeed: "7-day",  qpFee: "3.0%" },
  GOLD:     { paymentTerms: "Net-21", qpSpeed: "7-day",  qpFee: "2.0%" },
  PLATINUM: { paymentTerms: "Net-14", qpSpeed: "7-day",  qpFee: "1.0%" },
};

// Accessorials, ratified 2026-08-14 (CLAUDE.md §5). Uniform across every tier
// and every equipment type. State each term COMPLETE — a bare "$50/hr" reads in
// the carrier's favour and sets up a pay dispute on the first held load. Free
// time is per stop, independent and non-cumulative; the clock starts at arrival.
const ACCESSORIAL_TERMS = [
  {
    label: "Detention",
    value: "$50/hr, all equipment",
    detail:
      "After 2 hours free at each stop, capped at $250 per stop. Free time is counted per stop and does not carry over. The clock starts when you arrive. At the cap, detention converts to layover; the two do not stack for the same hours. Not payable if you arrive outside the appointment window. Notify us 30 minutes before detention begins and again when you depart.",
  },
  {
    label: "TONU",
    value: "$200 flat",
    detail:
      "Payable when we have given you the pickup number and shipper address and cleared you to head to pickup, and we or the shipper then cancel. If you have already arrived, you must have arrived inside the appointment window. Not payable on carrier cancellation or a trailer rejected as non-compliant.",
  },
  {
    label: "Layover",
    value: "$250 per day",
    detail: "Billed per day. Detention converts to layover once it reaches the $250 per-stop cap.",
  },
  {
    label: "Lumper",
    value: "Reimbursed at cost",
    detail:
      "Front the lumper and send us the original receipt. We reimburse on that receipt. We do not issue money codes: no Comchek, no EFS, no Comdata, no fuel cards.",
  },
];

// CarrierMilestone Prisma enum values. The locked launch model (CLAUDE.md §10)
// has four states: Silver entry, Gold, Platinum, Founding recognition.
// M2_PROVEN and M3_RELIABLE are inert legacy values kept for pre-reconciliation
// rows; caravanService normalizes them to M1_FIRST_LOAD, so they show as the
// entry state here rather than as gates a carrier has to clear.
const MILESTONE_NAMES: Record<string, string> = {
  M1_FIRST_LOAD: "New Partner",
  M2_PROVEN: "New Partner",
  M3_RELIABLE: "New Partner",
  M4_PARTNER: "Partner",
  M5_CORE: "Core",
  M6_FOUNDING: "Founding",
};

// Tolerate the short forms older payloads used.
const MILESTONE_ALIASES: Record<string, string> = {
  M1: "M1_FIRST_LOAD", M2: "M1_FIRST_LOAD", M3: "M1_FIRST_LOAD",
  M4: "M4_PARTNER", M5: "M5_CORE", M6: "M6_FOUNDING",
};

function milestoneLabel(id: string): string {
  const key = MILESTONE_ALIASES[id] ?? id;
  return MILESTONE_NAMES[key] ?? key;
}

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

  // Milestone data from scorecard or defaults. Defaults are the real entry
  // state and the real first gate (12 loads toward Gold per CLAUDE.md §10) —
  // the old 10-loads-to-"M2" default published a gate that does not exist.
  const currentMilestone = scorecard?.milestone || "M1_FIRST_LOAD";
  const milestoneLoads = scorecard?.milestoneLoads || 0;
  const milestoneTarget = scorecard?.milestoneTarget || 12;
  const milestoneProgress = milestoneTarget > 0 ? Math.min((milestoneLoads / milestoneTarget) * 100, 100) : 0;
  const nextMilestone = scorecard?.nextMilestone || "M4_PARTNER";

  // QP Savings Calculator state
  const [calcAmount, setCalcAmount] = useState(15000);
  // Fallback is the Silver entry rate. 3.5% is not a published Quick Pay fee.
  const tierFeePercent = parseFloat(benefits.qpFee) || 3;
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
        <h1 className="font-serif font-bold text-2xl text-[#0A2540] mb-1">
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
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#BA7517]">Caravan Tier</div>
              <span className={`inline-block mt-0.5 px-3 py-1 rounded-full text-sm font-bold border ${tierStyle.badge}`}>
                {caravanTier}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-2">
            <span className="text-xs text-gray-500">{milestoneLabel(currentMilestone)}</span>
            <span className="text-[10px] text-gray-700 ml-auto">{milestoneLoads}/{milestoneTarget} loads toward {milestoneLabel(nextMilestone)}</span>
          </div>
          <div className="h-1.5 bg-[#F5EEE0] rounded-full mt-2 overflow-hidden">
            <div className="h-full bg-[#BA7517] rounded-full transition-all duration-500" style={{ width: `${milestoneProgress}%` }} />
          </div>
          <Link href="/carrier/dashboard/scorecard" className="text-[11px] text-[#BA7517] font-semibold mt-2.5 inline-flex items-center gap-1 hover:underline">
            View Scorecard <ChevronRight size={12} />
          </Link>
        </CarrierCard>

        {/* Quick Pay Status */}
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-lg bg-[#E6F0E9] flex items-center justify-center">
              <Zap size={20} className="text-[#2F7A4F]" />
            </div>
            <div>
              <div className="text-[11px] text-gray-700 font-medium">Quick Pay</div>
              <div className="text-[22px] font-bold text-[#0A2540]">${qpBalance.toLocaleString()}</div>
            </div>
          </div>
          <div className="space-y-1.5 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-700">Fee Rate</span>
              <span className="font-semibold text-[#0A2540]">{benefits.qpFee}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Speed</span>
              <span className="font-semibold text-[#0A2540]">{benefits.qpSpeed}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-700">Monthly Usage</span>
              <span className="font-semibold text-[#0A2540]">${qpUsedThisMonth.toLocaleString()} / ${qpMonthlyLimit.toLocaleString()}</span>
            </div>
            <div className="h-1.5 bg-[#F5EEE0] rounded-full overflow-hidden">
              <div className={`h-full rounded-full transition-all ${qpUsagePercent > 80 ? "bg-[#9B2C2C]" : qpUsagePercent > 50 ? "bg-[#B07A1A]" : "bg-[#2F7A4F]"}`} style={{ width: `${qpUsagePercent}%` }} />
            </div>
          </div>
        </CarrierCard>

        {/* Your Tier Benefits */}
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-2 mb-3">
            <Award size={16} className="text-[#BA7517]" />
            <span className="text-[13px] font-bold text-[#0A2540]">Your Tier Benefits</span>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-gray-700">Payment Terms</span>
              <span className="font-semibold text-[#0A2540]">{benefits.paymentTerms}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Quick Pay Speed</span>
              <span className="font-semibold text-[#0A2540]">{benefits.qpSpeed}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-700">Quick Pay Fee</span>
              <span className="font-semibold text-[#0A2540]">{benefits.qpFee}</span>
            </div>
          </div>
          <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
            Same-day Quick Pay is available on any load at every tier, at your tier fee plus 2%.
          </p>
        </CarrierCard>
      </div>

      {/* Accessorial terms — uniform at every tier, stated in full */}
      <CarrierCard padding="p-5" className="mb-6">
        <div className="flex items-center gap-2 mb-1">
          <Clock size={16} className="text-[#BA7517]" />
          <span className="text-[13px] font-bold text-[#0A2540]">Accessorial Terms</span>
        </div>
        <p className="text-[11px] text-gray-500 mb-4">
          The same at every tier and on every equipment type.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {ACCESSORIAL_TERMS.map((t) => (
            <div key={t.label} className="border border-[#EFE6D3] rounded-lg p-3.5">
              <div className="flex items-baseline justify-between gap-3 mb-1.5">
                <span className="text-xs font-bold text-[#0A2540]">{t.label}</span>
                <span className="text-xs font-semibold text-[#BA7517] text-right">{t.value}</span>
              </div>
              <p className="text-[11px] text-gray-600 leading-relaxed">{t.detail}</p>
            </div>
          ))}
        </div>
      </CarrierCard>

      {/* QP Savings Calculator */}
      <CarrierCard padding="p-5" className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <Calculator size={16} className="text-[#2F7A4F]" />
          <span className="text-[13px] font-bold text-[#0A2540]">Quick Pay Savings Calculator</span>
        </div>
        <div className="mb-3">
          <label className="text-[11px] text-gray-700 font-medium block mb-1">Average Monthly Invoice Amount</label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-700 text-sm">$</span>
            <input
              type="number"
              value={calcAmount}
              onChange={(e) => setCalcAmount(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full pl-7 pr-3 py-2 border border-[#EFE6D3] rounded-lg text-sm text-[#0A2540] font-semibold focus:outline-none focus:ring-2 focus:ring-[#BA7517]/15 focus:border-[#BA7517]"
            />
          </div>
        </div>
        <div className="space-y-2 text-xs">
          <div className="flex justify-between items-center px-3 py-2 bg-[#F6E3E3] rounded-lg">
            <span className="text-[#9B2C2C]">With factoring ({factoringRate}%)</span>
            <span className="font-bold text-[#9B2C2C]">-${calcFactoringCost.toLocaleString()}/mo</span>
          </div>
          <div className="flex justify-between items-center px-3 py-2 bg-[#FAEEDA] rounded-lg">
            <span className="text-[#BA7517]">With SRL Quick Pay ({tierFeePercent}%)</span>
            <span className="font-bold text-[#BA7517]">-${calcQPCost.toLocaleString()}/mo</span>
          </div>
          <div className="flex justify-between items-center px-3 py-2.5 bg-[#E6F0E9] border border-[#2F7A4F]/30 rounded-lg">
            <span className="font-semibold text-[#2F7A4F]">You save</span>
            <span className="font-bold text-[#2F7A4F]">${calcMonthlySavings.toLocaleString()}/mo (${calcAnnualSavings.toLocaleString()}/yr)</span>
          </div>
        </div>
      </CarrierCard>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E2EAF2] flex items-center justify-center">
              <Truck size={20} className="text-[#2A5B8B]" />
            </div>
            <div>
              <div className="text-[11px] text-gray-700 font-medium">Active Loads</div>
              <div className="text-[28px] font-bold text-[#0A2540]">{activeLoads.length}</div>
            </div>
          </div>
        </CarrierCard>
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E6F0E9] flex items-center justify-center">
              <Package size={20} className="text-[#2F7A4F]" />
            </div>
            <div>
              <div className="text-[11px] text-gray-700 font-medium">Available Loads</div>
              <div className="text-[28px] font-bold text-[#0A2540]">{available?.total || 0}</div>
            </div>
          </div>
        </CarrierCard>
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#FBEFD4] flex items-center justify-center">
              <DollarSign size={20} className="text-[#B07A1A]" />
            </div>
            <div>
              <div className="text-[11px] text-gray-700 font-medium">Pending Pay</div>
              <div className="text-[28px] font-bold text-[#0A2540]">
                ${(paymentSummary?.totalPending?.amount || 0).toLocaleString()}
              </div>
            </div>
          </div>
        </CarrierCard>
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-[#E2EAF2] flex items-center justify-center">
              <Shield size={20} className="text-[#2A5B8B]" />
            </div>
            <div>
              <div className="text-[11px] text-gray-700 font-medium">Compliance</div>
              <div className="text-[28px] font-bold text-[#0A2540]">
                {criticalAlerts > 0 ? (
                  <span className="text-[#9B2C2C]">{criticalAlerts} Alert{criticalAlerts > 1 ? "s" : ""}</span>
                ) : (
                  <span className="text-[#2F7A4F]">Good</span>
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
                <div className="w-9 h-9 rounded-lg bg-[#FAEEDA] flex items-center justify-center">
                  <a.icon size={18} className="text-[#BA7517]" />
                </div>
                <span className="text-[13px] font-semibold text-[#0A2540]">{a.label}</span>
              </div>
            </CarrierCard>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        {/* My Active Loads */}
        <CarrierCard padding="p-0">
          <div className="px-5 py-4 flex justify-between items-center border-b border-[#F5EEE0]">
            <h3 className="text-[15px] font-bold text-[#0A2540]">My Active Loads</h3>
            <Link href="/carrier/dashboard/my-loads" className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#BA7517]">
              View All
            </Link>
          </div>
          {recentLoads.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-gray-700">No loads assigned yet</div>
          ) : (
            recentLoads.slice(0, 5).map((load: Record<string, any>) => (
              <div key={load.id} className="px-5 py-3 border-b border-[#F5EEE0] flex justify-between items-center hover:bg-gray-50">
                <div>
                  <div className="text-xs font-mono font-semibold text-[#0A2540]">{load.referenceNumber}</div>
                  <div className="text-[11px] text-gray-700">
                    {load.originCity}, {load.originState} &rarr; {load.destCity}, {load.destState}
                  </div>
                </div>
                <div className="text-right flex items-center gap-3">
                  <span className="text-xs font-bold text-[#0A2540]">{money(carrierPay(load))}</span>
                  <CarrierBadge status={load.status} />
                </div>
              </div>
            ))
          )}
        </CarrierCard>

        {/* Available Loads */}
        <CarrierCard padding="p-0">
          <div className="px-5 py-4 flex justify-between items-center border-b border-[#F5EEE0]">
            <h3 className="text-[15px] font-bold text-[#0A2540]">Available Loads</h3>
            <Link href="/carrier/dashboard/available-loads" className="text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#BA7517]">
              View All
            </Link>
          </div>
          {availableLoads.length === 0 ? (
            <div className="px-5 py-8 text-center text-xs text-gray-700">No available loads right now</div>
          ) : (
            availableLoads.slice(0, 5).map((load: Record<string, any>) => (
              <div key={load.id} className="px-5 py-3 border-b border-[#F5EEE0] flex justify-between items-center hover:bg-gray-50">
                <div>
                  <div className="text-xs font-mono font-semibold text-[#0A2540]">{load.referenceNumber}</div>
                  <div className="text-[11px] text-gray-700">
                    {load.originCity}, {load.originState} &rarr; {load.destCity}, {load.destState}
                  </div>
                  <div className="text-[10px] text-gray-700 mt-0.5">{load.equipmentType} &middot; {load.weight ? `${Number(load.weight).toLocaleString()} lbs` : "\u2014"}</div>
                </div>
                <span className="text-xs font-bold text-[#BA7517]">{money(carrierPay(load))}</span>
              </div>
            ))
          )}
        </CarrierCard>
      </div>

      {/* Compliance Alerts */}
      {alerts.length > 0 && (
        <CarrierCard padding="p-4" className="!bg-[#FBEFD4] !border-[#B07A1A]/30">
          <div className="flex items-center gap-2 mb-2">
            <AlertCircle size={16} className="text-[#B07A1A]" />
            <span className="text-xs font-bold text-[#B07A1A]">Compliance Alerts</span>
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
