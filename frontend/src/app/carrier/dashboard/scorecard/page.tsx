"use client";

import { Trophy, TrendingUp, Award, Star, Target, CheckCircle2, Circle } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard } from "@/components/carrier";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const TIERS = ["BRONZE", "SILVER", "GOLD"] as const;
const TIER_THRESHOLDS: Record<string, number> = { BRONZE: 0, SILVER: 60, GOLD: 80 };
const TIER_COLORS: Record<string, string> = {
  GOLD: "bg-yellow-100 text-yellow-700 border-yellow-300",
  SILVER: "bg-gray-100 text-gray-600 border-gray-300",
  BRONZE: "bg-orange-100 text-orange-700 border-orange-300",
};

// Legacy tier mapping
const CARVAN_TIER_MAP: Record<string, string> = {
  GUEST: "BRONZE", NONE: "BRONZE", BRONZE: "BRONZE",
  SILVER: "SILVER", GOLD: "GOLD", PLATINUM: "GOLD",
};

const KPI_LABELS: Record<string, string> = {
  onTimePickupPct: "On-Time Pickup",
  onTimeDeliveryPct: "On-Time Delivery",
  communicationScore: "Communication",
  claimRatio: "Claim Ratio",
  documentSubmissionTimeliness: "Doc Timeliness",
  acceptanceRate: "Acceptance Rate",
  gpsCompliancePct: "GPS Compliance",
};

// ─── Milestone Definitions ────────────────────────────────────────────────────

interface MilestoneDef {
  id: string;
  name: string;
  description: string;
  loadsRequired: number;
  onTimePctRequired: number;
  daysRequired: number;
  reward: string;
}

const MILESTONES: MilestoneDef[] = [
  { id: "M1", name: "New Partner", description: "Welcome to the Carvan program", loadsRequired: 0, onTimePctRequired: 0, daysRequired: 0, reward: "Quick Pay access at 3.5% fee" },
  { id: "M2", name: "Established", description: "Building trust with consistent loads", loadsRequired: 10, onTimePctRequired: 90, daysRequired: 30, reward: "Priority load board access" },
  { id: "M3", name: "Reliable", description: "Proven track record of reliability", loadsRequired: 30, onTimePctRequired: 93, daysRequired: 60, reward: "QP fee drops 0.5%, detention rate +$5/hr" },
  { id: "M4", name: "Preferred", description: "First-look freight on preferred lanes", loadsRequired: 60, onTimePctRequired: 95, daysRequired: 90, reward: "Eligible for Silver tier upgrade" },
  { id: "M5", name: "Elite", description: "Top performer in the network", loadsRequired: 100, onTimePctRequired: 97, daysRequired: 180, reward: "Safety bonus unlocked, dedicated lanes" },
  { id: "M6", name: "Legend", description: "The highest honor in the Carvan", loadsRequired: 200, onTimePctRequired: 98, daysRequired: 365, reward: "Gold tier, same-day QP at 1.5%, $300/mo safety bonus" },
];

function scoreColor(s: number) {
  return s >= 80 ? "text-green-600" : s >= 60 ? "text-yellow-600" : "text-red-500";
}
function barColor(v: number, invert = false) {
  if (invert) return v < 5 ? "bg-green-500" : v < 10 ? "bg-yellow-500" : "bg-red-500";
  return v > 90 ? "bg-green-500" : v > 75 ? "bg-yellow-500" : "bg-red-500";
}
function ringStroke(s: number) {
  return s >= 80 ? "#16a34a" : s >= 60 ? "#ca8a04" : "#ef4444";
}
function benchmarkLabel(s: number) {
  if (s >= 90) return "Top 5%";
  if (s >= 80) return "Top 15%";
  if (s >= 70) return "Top 30%";
  if (s >= 60) return "Top 50%";
  return "Below average";
}

function getMilestoneIndex(id: string): number {
  return MILESTONES.findIndex(m => m.id === id);
}

export default function ScorecardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["carrier-scorecard"],
    queryFn: () => api.get("/carrier/scorecard").then((r) => r.data),
  });

  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">Loading scorecard...</div>
  );
  if (!data) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm">No scorecard data available.</div>
  );

  const { currentScore, currentTier: rawTier, bonusPercentage, pointsToNextTier, nextTier: rawNextTier, metrics, history, bonuses } = data;
  const currentTier = CARVAN_TIER_MAP[rawTier] || "BRONZE";
  const nextTier = rawNextTier ? (CARVAN_TIER_MAP[rawNextTier] || rawNextTier) : null;

  const currentThreshold = TIER_THRESHOLDS[currentTier] || 0;
  const nextThreshold = nextTier ? (TIER_THRESHOLDS[nextTier] || 100) : 100;
  const circumference = 2 * Math.PI * 54;
  const strokeDash = (currentScore / 100) * circumference;

  const totalBonus = (bonuses || []).reduce((s: number, b: { amount: number }) => s + b.amount, 0);
  const chartData = (history || []).slice(-12).map((h: { calculatedAt: string; overallScore: number }, i: number) => ({
    week: `W${i + 1}`,
    score: h.overallScore,
  }));

  // Milestone data
  const currentMilestoneId = data.milestone || "M1";
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
        <Trophy className="w-6 h-6 text-[#C9A84C]" />
        <div>
          <h1 className="font-serif text-2xl text-[#0F1117]">Performance Scorecard</h1>
          <p className="text-[13px] text-gray-500">Track your metrics, tier status, milestones, and bonus earnings</p>
        </div>
        <span className={`ml-auto px-3 py-1 rounded-full text-xs font-semibold border ${TIER_COLORS[currentTier] || TIER_COLORS.BRONZE}`}>
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
            <span className="text-gray-400 text-sm">/100</span>
          </div>
          <p className="text-sm text-gray-500 mt-1">{currentTier} Tier &middot; {bonusPercentage}% Bonus Rate</p>
        </CarrierCard>

        <CarrierCard>
          <div className="flex items-center gap-2 mb-3">
            <TrendingUp className="w-4 h-4 text-[#C9A84C]" />
            <h2 className="font-semibold text-[#0F1117] text-sm">Tier Progress</h2>
          </div>
          <div className="relative h-3 bg-gray-100 rounded-full mb-2 overflow-hidden">
            {TIERS.map((t) => (
              <div key={t} className="absolute top-0 h-full border-r border-white/60"
                style={{ left: `${TIER_THRESHOLDS[t]}%` }} />
            ))}
            <div className="h-full bg-[#C9A84C] rounded-full transition-all duration-500"
              style={{ width: `${currentScore}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mb-3">
            {TIERS.map((t) => <span key={t}>{t} ({TIER_THRESHOLDS[t]})</span>)}
          </div>
          {nextTier && nextTier !== currentTier ? (
            <p className="text-sm text-gray-600">{pointsToNextTier} points to <span className="font-semibold text-[#0F1117]">{nextTier}</span></p>
          ) : (
            <p className="text-sm text-green-600 font-medium">Maximum tier achieved!</p>
          )}
          {/* Benchmark */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2">
            <Star className="w-4 h-4 text-[#C9A84C]" />
            <p className="text-sm text-gray-600">
              Your score: <span className="font-semibold text-[#0F1117]">{currentScore}</span> &mdash; <span className="font-semibold text-[#C9A84C]">{benchmarkLabel(currentScore)}</span> of SRL carriers
            </p>
          </div>
        </CarrierCard>
      </div>

      {/* ─── Milestones Section ────────────────────────────────────────────────── */}
      <CarrierCard className="mb-4">
        <div className="flex items-center gap-2 mb-4">
          <Target className="w-5 h-5 text-[#C9A84C]" />
          <h2 className="font-semibold text-[#0F1117] text-sm">Milestones</h2>
          <span className={`ml-auto px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${TIER_COLORS[currentTier] || TIER_COLORS.BRONZE}`}>
            {currentMilestone.id}: {currentMilestone.name}
          </span>
        </div>

        {/* Current Milestone Badge */}
        <div className="bg-[#C9A84C]/5 border border-[#C9A84C]/15 rounded-xl p-4 mb-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-11 h-11 rounded-full bg-[#C9A84C]/20 flex items-center justify-center">
              <span className="text-sm font-bold text-[#C9A84C]">{currentMilestone.id}</span>
            </div>
            <div>
              <div className="text-sm font-bold text-[#0F1117]">{currentMilestone.name}</div>
              <div className="text-xs text-gray-500">{currentMilestone.description}</div>
            </div>
          </div>
        </div>

        {/* Progress to Next Milestone */}
        {nextMilestoneObj && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs font-semibold text-[#0F1117]">Progress to {nextMilestoneObj.id}: {nextMilestoneObj.name}</span>
              <span className="text-[11px] text-gray-400">{milestoneLoads}/{nextMilestoneObj.loadsRequired} loads</span>
            </div>
            <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
              <div className="h-full bg-gradient-to-r from-[#C9A84C] to-[#D4AF37] rounded-full transition-all duration-700"
                style={{ width: `${loadsProgress}%` }} />
            </div>
            <p className="text-[11px] text-gray-400 mt-1">{loadsToNext} more load{loadsToNext !== 1 ? "s" : ""} needed</p>
          </div>
        )}

        {/* Requirements Checklist */}
        {nextMilestoneObj && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Requirements for {nextMilestoneObj.id}</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                {milestoneLoads >= nextMilestoneObj.loadsRequired ? (
                  <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
                ) : (
                  <Circle size={16} className="text-gray-300 flex-shrink-0" />
                )}
                <span className={`text-xs ${milestoneLoads >= nextMilestoneObj.loadsRequired ? "text-green-600" : "text-gray-600"}`}>
                  {nextMilestoneObj.loadsRequired} completed loads ({milestoneLoads} done)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {milestoneOnTimePct >= nextMilestoneObj.onTimePctRequired ? (
                  <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
                ) : (
                  <Circle size={16} className="text-gray-300 flex-shrink-0" />
                )}
                <span className={`text-xs ${milestoneOnTimePct >= nextMilestoneObj.onTimePctRequired ? "text-green-600" : "text-gray-600"}`}>
                  {nextMilestoneObj.onTimePctRequired}%+ on-time delivery (currently {milestoneOnTimePct.toFixed(1)}%)
                </span>
              </div>
              <div className="flex items-center gap-2">
                {milestoneDaysActive >= nextMilestoneObj.daysRequired ? (
                  <CheckCircle2 size={16} className="text-green-500 flex-shrink-0" />
                ) : (
                  <Circle size={16} className="text-gray-300 flex-shrink-0" />
                )}
                <span className={`text-xs ${milestoneDaysActive >= nextMilestoneObj.daysRequired ? "text-green-600" : "text-gray-600"}`}>
                  {nextMilestoneObj.daysRequired} days active ({milestoneDaysActive} days so far)
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Milestone Rewards Preview */}
        {nextMilestoneObj && (
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
            <div className="flex items-center gap-2">
              <Award size={14} className="text-emerald-600 flex-shrink-0" />
              <span className="text-xs font-semibold text-emerald-700">
                At {nextMilestoneObj.id}: {nextMilestoneObj.reward}
              </span>
            </div>
          </div>
        )}

        {/* Milestone Timeline */}
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="flex items-center justify-between">
            {MILESTONES.map((m, i) => {
              const isCompleted = i < currentMilestoneIdx;
              const isCurrent = i === currentMilestoneIdx;
              return (
                <div key={m.id} className="flex flex-col items-center flex-1">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border-2 ${
                    isCompleted ? "bg-[#C9A84C] border-[#C9A84C] text-white" :
                    isCurrent ? "bg-white border-[#C9A84C] text-[#C9A84C]" :
                    "bg-gray-50 border-gray-200 text-gray-400"
                  }`}>
                    {m.id}
                  </div>
                  <span className={`text-[9px] mt-1 text-center leading-tight ${isCurrent ? "font-bold text-[#0F1117]" : "text-gray-400"}`}>
                    {m.name}
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
              <p className="text-xl font-bold text-[#0F1117]">{typeof val === "number" ? val.toFixed(1) : val}%</p>
              <div className="h-1.5 bg-gray-100 rounded-full mt-2 overflow-hidden">
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
            <Award className="w-4 h-4 text-[#C9A84C]" />
            <h2 className="font-semibold text-[#0F1117] text-sm">Score History</h2>
          </div>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <XAxis dataKey="week" tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                <Tooltip formatter={(v: number | undefined) => [v, "Score"]}
                  contentStyle={{ fontSize: 12, borderRadius: 6, border: "1px solid #e5e7eb" }} />
                <Line type="monotone" dataKey="score" stroke="#C9A84C" strokeWidth={2}
                  dot={{ r: 3, fill: "#C9A84C" }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CarrierCard>
      )}

      {/* Bonus Tracker */}
      {bonuses && bonuses.length > 0 && (
        <CarrierCard>
          <h2 className="font-semibold text-[#0F1117] text-sm mb-3">Bonus Tracker</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] text-gray-400 uppercase border-b border-gray-100">
                  <th className="text-left py-2 font-medium">Period</th>
                  <th className="text-left py-2 font-medium">Type</th>
                  <th className="text-right py-2 font-medium">Amount</th>
                  <th className="text-center py-2 font-medium">Status</th>
                  <th className="text-left py-2 font-medium">Description</th>
                </tr>
              </thead>
              <tbody>
                {bonuses.map((b: { period: string; type: string; amount: number; status: string; description: string }, i: number) => (
                  <tr key={i} className="border-b border-gray-50">
                    <td className="py-2 text-gray-600">{b.period}</td>
                    <td className="py-2 text-[#0F1117] font-medium">{b.type}</td>
                    <td className="py-2 text-right font-semibold text-[#0F1117]">${b.amount.toLocaleString()}</td>
                    <td className="py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        b.status === "PAID" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
                      }`}>{b.status}</span>
                    </td>
                    <td className="py-2 text-gray-500 text-xs">{b.description}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 text-[#0F1117]" colSpan={2}>Total</td>
                  <td className="py-2 text-right text-[#C9A84C]">${totalBonus.toLocaleString()}</td>
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
