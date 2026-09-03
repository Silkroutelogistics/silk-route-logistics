"use client";

import { Trophy, TrendingUp, Award, Target, CheckCircle2, Circle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard } from "@/components/carrier";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

// Caravan Partner Program 3-tier (v3.7.a). Silver is Day-1 entry tier.
//
// There is deliberately NO score-to-tier threshold table here. Score-based
// promotion was retired in v3.8.aii; tiers advance on the locked loads /
// on-time / tenure gate (CLAUDE.md §10). A "GOLD: 90" style map on a carrier
// surface publishes a gate that does not exist. Do not reintroduce one.
const TIERS = ["SILVER", "GOLD", "PLATINUM"] as const;

// Pay ladder per CLAUDE.md §8 (LOCKED). 7-day Quick Pay is the headline rate;
// same-day is a universal +2% at every tier.
const TIER_PAY: Record<string, string> = {
  SILVER: "Net-30 · QP 3%",
  GOLD: "Net-21 · QP 2%",
  PLATINUM: "Net-14 · QP 1%",
};

const TIER_COLORS: Record<string, string> = {
  PLATINUM: "bg-[#0A2540] text-[#C5A572] border-[#0A2540]",
  GOLD: "bg-[#FAEEDA] text-[#BA7517] border-[#C5A572]",
  SILVER: "bg-[#E2EAF2] text-[#5B7EA3] border-[#8AA5C0]",
};

// Map the raw enum value onto display tiers
const CARAVAN_TIER_MAP: Record<string, string> = {
  GUEST: "SILVER", NONE: "SILVER",
  SILVER: "SILVER", GOLD: "GOLD", PLATINUM: "PLATINUM",
};

const KPI_LABELS: Record<string, string> = {
  onTimePickupPct: "On-Time Pickup",
  onTimeDeliveryPct: "On-Time Delivery",
  communicationScore: "Communication",
  claimRatio: "Claim Ratio",
  documentSubmissionTimeliness: "Doc Timeliness",
  acceptanceRate: "Acceptance Rate",
  // Published factor name is "Tracking compliance" (CLAUDE.md §9) — location
  // visibility from any source, not GPS only. DB column name is unchanged.
  gpsCompliancePct: "Tracking Compliance",
};

// ─── Milestone Definitions ────────────────────────────────────────────────────

// Locked launch model (CLAUDE.md §10). Four states: Silver entry, Gold,
// Platinum, Founding recognition. Each transition is an AND of cumulative
// loads since joining, on-time percentage, and tenure days. IDs are the
// CarrierMilestone Prisma enum values so this ladder and
// caravanService.checkMilestoneAdvancement cannot drift apart.
//
// Retired and absent by design: safety bonuses (no SafetyScore tracking or
// payout backend exists), referral requirements, "3 active lanes", the
// "QP fee eases 0.5%" step (no half-point exists in §8), and the M2_PROVEN /
// M3_RELIABLE gates. Those two enum values survive only on pre-reconciliation
// rows and normalize to the entry state.
interface MilestoneDef {
  id: string;
  badge: string;
  name: string;
  description: string;
  loadsRequired: number;
  onTimePctRequired: number;
  daysRequired: number;
  reward: string;
}

const MILESTONES: MilestoneDef[] = [
  { id: "M1_FIRST_LOAD", badge: "Silver",   name: "New Partner", description: "Silver tier, active from day one", loadsRequired: 0,  onTimePctRequired: 0,  daysRequired: 0,   reward: "Net-30 standard pay, 7-day Quick Pay at 3%" },
  { id: "M4_PARTNER",    badge: "Gold",     name: "Partner",     description: "Gold gate cleared",                loadsRequired: 12, onTimePctRequired: 97, daysRequired: 90,  reward: "Net-21 standard pay, 7-day Quick Pay at 2%" },
  { id: "M5_CORE",       badge: "Platinum", name: "Core",        description: "Platinum gate cleared",            loadsRequired: 20, onTimePctRequired: 98, daysRequired: 120, reward: "Net-14 standard pay, 7-day Quick Pay at 1%, priority freight access" },
  { id: "M6_FOUNDING",   badge: "Founding", name: "Founding",    description: "Recognition on top of Platinum",   loadsRequired: 30, onTimePctRequired: 98, daysRequired: 180, reward: "1% Quick Pay locked permanently. Tier stays Platinum." },
];

// Legacy and short-form milestone ids seen on older rows and payloads.
const MILESTONE_ALIASES: Record<string, string> = {
  M1: "M1_FIRST_LOAD", M2: "M1_FIRST_LOAD", M3: "M1_FIRST_LOAD",
  M2_PROVEN: "M1_FIRST_LOAD", M3_RELIABLE: "M1_FIRST_LOAD",
  M4: "M4_PARTNER", M5: "M5_CORE", M6: "M6_FOUNDING",
};

function scoreColor(s: number) {
  return s >= 80 ? "text-[#2F7A4F]" : s >= 60 ? "text-[#B07A1A]" : "text-[#9B2C2C]";
}
function barColor(v: number, invert = false) {
  if (invert) return v < 5 ? "bg-[#2F7A4F]" : v < 10 ? "bg-[#B07A1A]" : "bg-[#9B2C2C]";
  return v > 90 ? "bg-[#2F7A4F]" : v > 75 ? "bg-[#B07A1A]" : "bg-[#9B2C2C]";
}
function ringStroke(s: number) {
  return s >= 80 ? "#2F7A4F" : s >= 60 ? "#B07A1A" : "#9B2C2C";
}
function getMilestoneIndex(id: string): number {
  const key = MILESTONE_ALIASES[id] ?? id;
  const idx = MILESTONES.findIndex(m => m.id === key);
  return idx >= 0 ? idx : 0;
}

export default function ScorecardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["carrier-scorecard"],
    queryFn: () => api.get("/carrier/scorecard").then((r) => r.data),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-700 text-sm">Loading scorecard...</div>
  );
  if (!data) return (
    <div className="flex items-center justify-center h-64 text-gray-700 text-sm">No scorecard data available.</div>
  );

  // pointsToNextTier / nextTierThreshold are still returned by the API but are
  // deliberately not read: they are score-to-tier values, and score does not
  // promote a carrier (CLAUDE.md §10).
  const { currentScore, currentTier: rawTier, bonusPercentage, metrics, history, bonuses } = data;
  const currentTier = CARAVAN_TIER_MAP[rawTier] || "SILVER";

  const circumference = 2 * Math.PI * 54;
  const strokeDash = (currentScore / 100) * circumference;

  const totalBonus = (bonuses || []).reduce((s: number, b: { amount: number }) => s + b.amount, 0);
  const chartData = (history || []).slice(-12).map((h: { calculatedAt: string; overallScore: number }, i: number) => ({
    week: `W${i + 1}`,
    score: h.overallScore,
  }));

  // Milestone data
  const currentMilestoneId = data.milestone || "M1_FIRST_LOAD";
  const currentMilestoneIdx = getMilestoneIndex(currentMilestoneId);
  const currentMilestone = MILESTONES[currentMilestoneIdx] || MILESTONES[0];
  const nextMilestoneObj = currentMilestoneIdx < MILESTONES.length - 1 ? MILESTONES[currentMilestoneIdx + 1] : null;
  const milestoneLoads = data.milestoneLoads ?? data.totalLoads ?? 0;
  const milestoneOnTimePct = metrics?.onTimeDeliveryPct ?? 0;
  const milestoneDaysActive = data.daysActive ?? 0;
  const loadsToNext = nextMilestoneObj ? Math.max(nextMilestoneObj.loadsRequired - milestoneLoads, 0) : 0;
  const loadsProgress = nextMilestoneObj ? Math.min((milestoneLoads / nextMilestoneObj.loadsRequired) * 100, 100) : 100;

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Trophy className="w-6 h-6 text-[#BA7517]" />
        <div>
          <h1 className="font-serif font-bold text-2xl text-[#0A2540]">Performance Scorecard</h1>
          <p className="text-[13px] text-gray-500">Track your metrics, tier status, milestones, and bonus earnings</p>
        </div>
        <span className={`ml-auto px-3 py-1 rounded-full text-xs font-semibold border ${TIER_COLORS[currentTier] || TIER_COLORS.SILVER}`}>
          {currentTier}
        </span>
      </div>

      {/* Score Hero + Tier Progress */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <CarrierCard className="flex flex-col items-center justify-center">
          <svg width="140" height="140" className="-rotate-90">
            <circle cx="70" cy="70" r="54" fill="none" stroke="#e5e7eb" strokeWidth="10" />
            <circle cx="70" cy="70" r="54" fill="none" stroke={ringStroke(currentScore)}
              strokeWidth="10" strokeLinecap="round" strokeDasharray={circumference}
              strokeDashoffset={circumference - strokeDash} className="transition-all duration-700" />
          </svg>
          <div className="text-center -mt-[94px] mb-8">
            <span className={`text-4xl font-bold ${scoreColor(currentScore)}`}>{currentScore}</span>
            <span className="text-gray-700 text-sm">/100</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">{currentTier} Tier &middot; {bonusPercentage}% Bonus Rate</p>
        </CarrierCard>

        {/* Pay ladder. Not a score bar: score does not move a carrier between
            tiers. The gate is loads + on-time + tenure, shown under Milestones. */}
        <CarrierCard>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-[#BA7517]" />
            <h2 className="font-semibold text-[#0A2540] text-sm">Pay Ladder</h2>
          </div>
          <div className="grid grid-cols-3 gap-2 mb-3">
            {TIERS.map((t) => (
              <div key={t}
                className={`rounded-lg border px-2 py-2.5 text-center ${
                  t === currentTier ? TIER_COLORS[t] : "bg-[#F5EEE0] text-gray-500 border-[#EFE6D3]"
                }`}>
                <div className="text-[11px] font-bold">{t}</div>
                <div className="text-[10px] mt-0.5 whitespace-nowrap">{TIER_PAY[t]}</div>
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-600 leading-relaxed">
            For carriers in the Quick Pay pilot, same-day is available on any load at every tier, at your tier fee plus 2%.
          </p>
          <div className="mt-3 pt-3 border-t border-[#F5EEE0]">
            <p className="text-xs text-gray-600 leading-relaxed">
              Your Compass Score measures service quality. It does not move your tier on its own.
              Tiers advance on completed loads, on-time percentage, and time with SRL. The exact
              gate is below.
            </p>
          </div>
        </CarrierCard>
      </div>

      {/* ─── Milestones Section ────────────────────────────────────────────────── */}
      <CarrierCard className="mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-[#BA7517]" />
          <h2 className="font-semibold text-[#0A2540] text-sm">Milestones</h2>
          <span className={`ml-auto px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${TIER_COLORS[currentTier] || TIER_COLORS.SILVER}`}>
            {currentMilestone.name}
          </span>
        </div>

        {/* Current Milestone Badge */}
        <div className="bg-[#FAEEDA] border border-[#C5A572]/40 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-full bg-[#FAEEDA] flex items-center justify-center">
              <span className="text-[10px] font-bold text-[#BA7517] text-center leading-tight">{currentMilestone.badge}</span>
            </div>
            <div>
              <div className="text-sm font-bold text-[#0A2540]">{currentMilestone.name}</div>
              <div className="text-xs text-gray-500">{currentMilestone.description}</div>
            </div>
          </div>
        </div>

        {/* Progress to Next Milestone */}
        {nextMilestoneObj && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-[#0A2540]">Progress to {nextMilestoneObj.badge}</span>
              <span className="text-[11px] text-gray-700">{milestoneLoads}/{nextMilestoneObj.loadsRequired} loads</span>
            </div>
            <div className="h-3 bg-[#F5EEE0] rounded-full overflow-hidden">
              <div className="h-full bg-[#BA7517] rounded-full transition-all duration-700"
                style={{ width: `${loadsProgress}%` }} />
            </div>
            <p className="text-[11px] text-gray-700 mt-1">{loadsToNext} more load{loadsToNext !== 1 ? "s" : ""} needed</p>
          </div>
        )}

        {/* Requirements Checklist */}
        {nextMilestoneObj && (
          <div className="mb-4">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#BA7517] mb-2">Requirements for {nextMilestoneObj.badge}</h3>
            <p className="text-[11px] text-gray-600 mb-2 leading-relaxed">All three are required. Loads count from the day you joined.</p>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {milestoneLoads >= nextMilestoneObj.loadsRequired ? (
                  <CheckCircle2 size={16} className="text-[#2F7A4F] flex-shrink-0" />
                ) : (
                  <Circle size={16} className="text-gray-500 flex-shrink-0" />
                )}
                <span className={`text-xs ${milestoneLoads >= nextMilestoneObj.loadsRequired ? "text-[#2F7A4F]" : "text-gray-600"}`}>
                  {nextMilestoneObj.loadsRequired} completed loads ({milestoneLoads} done)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {milestoneOnTimePct >= nextMilestoneObj.onTimePctRequired ? (
                  <CheckCircle2 size={16} className="text-[#2F7A4F] flex-shrink-0" />
                ) : (
                  <Circle size={16} className="text-gray-500 flex-shrink-0" />
                )}
                <span className={`text-xs ${milestoneOnTimePct >= nextMilestoneObj.onTimePctRequired ? "text-[#2F7A4F]" : "text-gray-600"}`}>
                  {nextMilestoneObj.onTimePctRequired}%+ on-time delivery (currently {milestoneOnTimePct.toFixed(1)}%)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {milestoneDaysActive >= nextMilestoneObj.daysRequired ? (
                  <CheckCircle2 size={16} className="text-[#2F7A4F] flex-shrink-0" />
                ) : (
                  <Circle size={16} className="text-gray-500 flex-shrink-0" />
                )}
                <span className={`text-xs ${milestoneDaysActive >= nextMilestoneObj.daysRequired ? "text-[#2F7A4F]" : "text-gray-600"}`}>
                  {nextMilestoneObj.daysRequired} days active ({milestoneDaysActive} days so far)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Milestone Rewards Preview */}
        {nextMilestoneObj && (
          <div className="bg-[#E6F0E9] border border-[#2F7A4F]/30 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Award size={14} className="text-[#2F7A4F] flex-shrink-0" />
              <span className="text-xs font-semibold text-[#2F7A4F]">
                At {nextMilestoneObj.badge}: {nextMilestoneObj.reward}
              </span>
            </div>
          </div>
        )}

        {/* Milestone Timeline */}
        <div className="mt-4 pt-4 border-t border-[#F5EEE0]">
          <div className="flex items-center justify-between">
            {MILESTONES.map((m, i) => {
              const isCompleted = i < currentMilestoneIdx;
              const isCurrent = i === currentMilestoneIdx;
              return (
                <div key={m.id} className="flex flex-col items-center flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                    isCompleted ? "bg-[#BA7517] border-[#C5A572] text-[#FBF7F0]" :
                    isCurrent ? "bg-white border-[#C5A572] text-[#BA7517]" :
                    "bg-gray-50 border-[#EFE6D3] text-gray-400"
                  }`}>
                    {i + 1}
                  </div>
                  <span className={`text-[9px] mt-1 text-center leading-tight ${isCurrent ? "font-bold text-[#0A2540]" : "text-gray-400"}`}>
                    {m.badge}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </CarrierCard>

      {/* KPI Gauges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
        {Object.entries(KPI_LABELS).map(([key, label]) => {
          const val = metrics?.[key] ?? 0;
          const isInverted = key === "claimRatio";
          return (
            <CarrierCard key={key} padding="p-4">
              <p className="text-[11px] text-gray-500 mb-1 truncate">{label}</p>
              <p className="text-xl font-bold text-[#0A2540]">{typeof val === "number" ? val.toFixed(1) : val}%</p>
              <div className="h-1.5 bg-[#F5EEE0] rounded-full mt-2 overflow-hidden">
                <div className={`h-full rounded-full transition-all ${barColor(val, isInverted)}`}
                  style={{ width: `${Math.min(isInverted ? 100 - val * 5 : val, 100)}%` }} />
              </div>
            </CarrierCard>
          );
        })}
      </div>

      {/* History Chart */}
      {chartData.length > 1 && (
        <CarrierCard className="mb-4">
          <div className="flex items-center gap-2 mb-3">
            <Award className="w-4 h-4 text-[#BA7517]" />
            <h2 className="font-semibold text-[#0A2540] text-sm">Score History</h2>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number | undefined) => [v, "Score"]}
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb" }} />
                <Line type="monotone" dataKey="score" stroke="#BA7517" strokeWidth={2}
                  dot={{ r: 3, fill: "#BA7517" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CarrierCard>
      )}

      {/* Bonus Tracker */}
      {bonuses && bonuses.length > 0 && (
        <CarrierCard>
          <h2 className="font-semibold text-[#0A2540] text-sm mb-3">Bonus Tracker</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-700 uppercase border-b border-[#F5EEE0]">
                  <th className="text-left py-2 font-medium">Period</th>
                  <th className="text-left py-2 font-medium">Type</th>
                  <th className="text-right py-2 font-medium">Amount</th>
                  <th className="text-center py-2 font-medium">Status</th>
                  <th className="text-left py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {bonuses.map((b: { period: string; type: string; amount: number; status: string; description: string }, i: number) => (
                  <tr key={i} className="border-b border-[#F5EEE0]">
                    <td className="py-2 text-gray-600">{b.period}</td>
                    <td className="py-2 text-[#0A2540] font-medium">{b.type}</td>
                    <td className="py-2 text-right font-semibold text-[#0A2540]">${b.amount.toLocaleString()}</td>
                    <td className="py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        b.status === "PAID" ? "bg-[#E6F0E9] text-[#2F7A4F]" : "bg-[#FBEFD4] text-[#B07A1A]"
                      }`}>{b.status}</span>
                    </td>
                    <td className="py-2 text-gray-500 text-xs">{b.description}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 text-[#0A2540]" colSpan={2}>Total</td>
                  <td className="py-2 text-right text-[#BA7517]">${totalBonus.toLocaleString()}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          </div>
        </CarrierCard>
      )}
    </div>
  );
}
