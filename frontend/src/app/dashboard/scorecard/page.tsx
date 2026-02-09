"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TierBadge } from "@/components/ui/TierBadge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

interface Scorecard {
  id: string;
  onTimePickupPct: number; onTimeDeliveryPct: number;
  communicationScore: number; claimRatio: number;
  documentSubmissionTimeliness: number; acceptanceRate: number;
  gpsCompliancePct: number; overallScore: number;
  tierAtTime: string; bonusEarned: number; calculatedAt: string;
}

const kpiLabels: Record<string, string> = {
  onTimePickupPct: "On-Time Pickup", onTimeDeliveryPct: "On-Time Delivery",
  communicationScore: "Communication", claimRatio: "Claim Ratio (lower is better)",
  documentSubmissionTimeliness: "Doc Timeliness", acceptanceRate: "Acceptance Rate",
  gpsCompliancePct: "GPS Compliance",
};

function KpiGauge({ label, value, inverted }: { label: string; value: number; inverted?: boolean }) {
  const pct = inverted ? Math.max(0, 100 - value) : value;
  const color = pct >= 95 ? "bg-green-500" : pct >= 85 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-400">{label}</span>
        <span className="text-sm font-bold text-white">{value.toFixed(1)}%</span>
      </div>
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(pct, 100)}%` }} />
      </div>
    </div>
  );
}

export default function ScorecardPage() {
  const { data } = useQuery({
    queryKey: ["carrier-scorecard"],
    queryFn: () => api.get("/carrier/scorecard").then((r) => r.data),
  });

  const latest: Scorecard | undefined = data?.scorecards?.[0];
  const history = data?.scorecards?.slice().reverse().map((s: Scorecard, i: number) => ({
    week: `W${i + 1}`, score: s.overallScore, bonus: s.bonusEarned,
  })) || [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Performance Scorecard</h1>
        {data?.currentTier && <TierBadge tier={data.currentTier} size="lg" />}
      </div>

      {/* Overall Score & Path to Next Tier */}
      <div className="grid md:grid-cols-2 gap-6">
        <div className="bg-white/5 rounded-xl border border-white/10 p-6 text-center">
          <p className="text-sm text-slate-400 mb-2">Overall Score</p>
          <p className="text-5xl font-bold text-gold">{data?.currentScore?.toFixed(1) || "—"}%</p>
          <p className="text-sm text-slate-500 mt-2">Bonus: {data?.bonusPercentage || 0}% on all loads</p>
        </div>
        <div className="bg-white/5 rounded-xl border border-white/10 p-6">
          <p className="text-sm text-slate-400 mb-3">Path to Next Tier</p>
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-slate-300">{data?.currentTier || "—"}</span>
            <span className="font-medium text-white">{data?.pointsToNextTier?.toFixed(1) || 0} pts needed</span>
          </div>
          <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
            <div className="h-full rounded-full bg-gold transition-all"
              style={{ width: `${data?.currentScore && data?.nextTierThreshold ? Math.min((data.currentScore / data.nextTierThreshold) * 100, 100) : 0}%` }} />
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>{data?.currentScore?.toFixed(1) || 0}%</span>
            <span>{data?.nextTierThreshold || 100}%</span>
          </div>
        </div>
      </div>

      {/* KPIs */}
      {latest && (
        <div>
          <h2 className="font-semibold text-white mb-3">Current Period KPIs</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Object.entries(kpiLabels).map(([key, label]) => (
              <KpiGauge key={key} label={label}
                value={latest[key as keyof Scorecard] as number}
                inverted={key === "claimRatio"} />
            ))}
          </div>
        </div>
      )}

      {/* Historical Chart */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-6">
        <h2 className="font-semibold text-white mb-4">Score History</h2>
        {history.length > 0 ? (
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={history}>
              <XAxis dataKey="week" axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
              <YAxis domain={[60, 100]} axisLine={false} tickLine={false} tick={{ fill: "#64748b", fontSize: 12 }} />
              <Tooltip contentStyle={{ background: "#1e293b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: "8px", color: "#fff" }} />
              <Bar dataKey="score" fill="#D4A843" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-slate-500 text-sm text-center py-12">No history available</p>
        )}
      </div>
    </div>
  );
}
