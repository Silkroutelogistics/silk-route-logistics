"use client";

import { Trophy, TrendingUp, Award, Star } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard } from "@/components/carrier";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

const TIERS = ["GUEST", "BRONZE", "SILVER", "GOLD", "PLATINUM"] as const;
const TIER_THRESHOLDS: Record<string, number> = { GUEST: 0, BRONZE: 60, SILVER: 70, GOLD: 80, PLATINUM: 90 };
const TIER_COLORS: Record<string, string> = {
  PLATINUM: "bg-purple-100 text-purple-700 border-purple-300",
  GOLD: "bg-yellow-100 text-yellow-700 border-yellow-300",
  SILVER: "bg-gray-100 text-gray-600 border-gray-300",
  BRONZE: "bg-orange-100 text-orange-700 border-orange-300",
  GUEST: "bg-slate-100 text-slate-600 border-slate-300",
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

  const { currentScore, currentTier, bonusPercentage, pointsToNextTier, nextTier, metrics, history, bonuses } = data;
  const tierIdx = TIERS.indexOf(currentTier as typeof TIERS[number]);
  const currentThreshold = TIER_THRESHOLDS[currentTier] || 0;
  const nextThreshold = nextTier ? TIER_THRESHOLDS[nextTier] : 100;
  const progressInTier = nextTier ? ((currentScore - currentThreshold) / (nextThreshold - currentThreshold)) * 100 : 100;
  const circumference = 2 * Math.PI * 54;
  const strokeDash = (currentScore / 100) * circumference;

  const totalBonus = (bonuses || []).reduce((s: number, b: { amount: number }) => s + b.amount, 0);
  const chartData = (history || []).slice(-12).map((h: { calculatedAt: string; overallScore: number }, i: number) => ({
    week: `W${i + 1}`,
    score: h.overallScore,
  }));

  return (
    <div>
      <div className="mb-6 flex items-center gap-3">
        <Trophy className="w-6 h-6 text-[#C9A84C]" />
        <div>
          <h1 className="font-serif text-2xl text-[#0D1B2A]">Performance Scorecard</h1>
          <p className="text-[13px] text-gray-500">Track your metrics, tier status, and bonus earnings</p>
        </div>
        <span className={`ml-auto px-3 py-1 rounded-full text-xs font-semibold border ${TIER_COLORS[currentTier] || TIER_COLORS.GUEST}`}>
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
            <h2 className="font-semibold text-[#0D1B2A] text-sm">Tier Progress</h2>
          </div>
          <div className="relative h-3 bg-gray-100 rounded-full mb-2 overflow-hidden">
            {TIERS.map((t, i) => (
              <div key={t} className="absolute top-0 h-full border-r border-white/60"
                style={{ left: `${TIER_THRESHOLDS[t]}%` }} />
            ))}
            <div className="h-full bg-[#C9A84C] rounded-full transition-all duration-500"
              style={{ width: `${currentScore}%` }} />
          </div>
          <div className="flex justify-between text-[10px] text-gray-400 mb-3">
            {TIERS.map((t) => <span key={t}>{t} ({TIER_THRESHOLDS[t]})</span>)}
          </div>
          {nextTier ? (
            <p className="text-sm text-gray-600">{pointsToNextTier} points to <span className="font-semibold text-[#0D1B2A]">{nextTier}</span></p>
          ) : (
            <p className="text-sm text-green-600 font-medium">Maximum tier achieved!</p>
          )}
          {/* Benchmark */}
          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center gap-2">
            <Star className="w-4 h-4 text-[#C9A84C]" />
            <p className="text-sm text-gray-600">
              Your score: <span className="font-semibold text-[#0D1B2A]">{currentScore}</span> &mdash; <span className="font-semibold text-[#C9A84C]">{benchmarkLabel(currentScore)}</span> of SRL carriers
            </p>
          </div>
        </CarrierCard>
      </div>

      {/* KPI Gauges */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-4">
        {Object.entries(KPI_LABELS).map(([key, label]) => {
          const val = metrics?.[key] ?? 0;
          const isInverted = key === "claimRatio";
          return (
            <CarrierCard key={key} padding="p-4">
              <p className="text-[11px] text-gray-500 mb-1 truncate">{label}</p>
              <p className="text-xl font-bold text-[#0D1B2A]">{typeof val === "number" ? val.toFixed(1) : val}%</p>
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
            <h2 className="font-semibold text-[#0D1B2A] text-sm">Score History</h2>
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
          <h2 className="font-semibold text-[#0D1B2A] text-sm mb-3">Bonus Tracker</h2>
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
                    <td className="py-2 text-[#0D1B2A] font-medium">{b.type}</td>
                    <td className="py-2 text-right font-semibold text-[#0D1B2A]">${b.amount.toLocaleString()}</td>
                    <td className="py-2 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${
                        b.status === "PAID" ? "bg-green-50 text-green-700" : "bg-yellow-50 text-yellow-700"
                      }`}>{b.status}</span>
                    </td>
                    <td className="py-2 text-gray-500 text-xs">{b.description}</td>
                  </tr>
                ))}
                <tr className="font-semibold">
                  <td className="py-2 text-[#0D1B2A]" colSpan={2}>Total</td>
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
