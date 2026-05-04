"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { TierBadge } from "@/components/ui/TierBadge";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { cn } from "@/lib/utils";
import {
  X,
  Search,
  TrendingUp,
  Truck,
  Clock,
  FileCheck,
  ChevronRight,
  Users,
} from "lucide-react";

// ─── Types ───────────────────────────────────────────

interface CarrierSummary {
  id: string;
  name: string;
  mc: string;
  tier: string;
  loads: number;
  onTime: number;
  claims: number;
  onTimePct: number;
  score: number;
}

interface Scorecard {
  id: string;
  onTimePickupPct: number;
  onTimeDeliveryPct: number;
  communicationScore: number;
  claimRatio: number;
  documentSubmissionTimeliness: number;
  acceptanceRate: number;
  gpsCompliancePct: number;
  overallScore: number;
  tierAtTime: string;
  bonusEarned: number;
  calculatedAt: string;
}

interface CarrierScoreDetail {
  carrierId: string;
  companyName: string;
  currentTier: string;
  currentScore: number;
  nextTierThreshold: number;
  bonusPercentage: number;
  pointsToNextTier: number;
  scorecards: Scorecard[];
}

// ─── KPI Gauge ───────────────────────────────────────

const kpiLabels: Record<string, string> = {
  onTimePickupPct: "On-Time Pickup",
  onTimeDeliveryPct: "On-Time Delivery",
  communicationScore: "Communication",
  claimRatio: "Claim Ratio (lower is better)",
  documentSubmissionTimeliness: "Doc Timeliness",
  acceptanceRate: "Acceptance Rate",
  gpsCompliancePct: "GPS Compliance",
};

function KpiGauge({
  label,
  value,
  inverted,
}: {
  label: string;
  value: number;
  inverted?: boolean;
}) {
  const pct = inverted ? Math.max(0, 100 - value) : value;
  const color =
    pct >= 95 ? "bg-green-500" : pct >= 85 ? "bg-yellow-500" : "bg-red-500";
  return (
    <div className="p-4 bg-white/5 rounded-xl border border-white/10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-slate-400">{label}</span>
        <span className="text-sm font-bold text-white">
          {value.toFixed(1)}%
        </span>
      </div>
      <div className="w-full h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${color}`}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}

// ─── Detail Panel Tabs ───────────────────────────────

type DetailTab = "kpis" | "performance" | "tenders" | "updates" | "lanes";

const detailTabs: { key: DetailTab; label: string }[] = [
  { key: "kpis", label: "KPIs" },
  { key: "performance", label: "Performance" },
  { key: "tenders", label: "Tenders" },
  { key: "updates", label: "Load Updates" },
  { key: "lanes", label: "Top Lanes" },
];

// ─── Placeholder Tab ────────────────────────────────

function PlaceholderTab({ title, icon: Icon }: { title: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-slate-500">
      <Icon className="w-10 h-10 mb-3 text-slate-600" />
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-slate-600 mt-1">Coming soon</p>
    </div>
  );
}

// ─── Score Color Helper ─────────────────────────────

function scoreColor(score: number) {
  if (score >= 95) return "text-green-400";
  if (score >= 85) return "text-yellow-400";
  if (score >= 70) return "text-orange-400";
  return "text-red-400";
}

// ─── Main Page ──────────────────────────────────────

export default function ScorecardPage() {
  const [selectedCarrierId, setSelectedCarrierId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<DetailTab>("kpis");

  // Fetch carrier list from analytics
  const { data: carriersData, isLoading: carriersLoading } = useQuery({
    queryKey: ["analytics-carriers"],
    queryFn: () =>
      api.get("/analytics/carriers", { params: { limit: 100 } }).then((r) => r.data),
  });

  // Fetch selected carrier's scorecard detail
  const { data: carrierDetail, isLoading: detailLoading } = useQuery<CarrierScoreDetail>({
    queryKey: ["carrier-score", selectedCarrierId],
    queryFn: () =>
      api.get(`/carriers/${selectedCarrierId}/score`).then((r) => r.data),
    enabled: !!selectedCarrierId,
  });

  const carriers: CarrierSummary[] = carriersData?.carriers || [];

  const filteredCarriers = carriers.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.mc.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const latest: Scorecard | undefined = carrierDetail?.scorecards?.[0];
  const history =
    carrierDetail?.scorecards
      ?.slice()
      .reverse()
      .map((s, i) => ({
        week: `W${i + 1}`,
        score: s.overallScore,
        bonus: s.bonusEarned,
      })) || [];

  function selectCarrier(id: string) {
    setSelectedCarrierId(id);
    setActiveTab("kpis");
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="px-6 pt-6 pb-4 border-b border-white/5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">
              Carrier Scorecards
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Select a carrier to view their detailed performance scorecard
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {carriers.length} carrier{carriers.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      </div>

      <div className="flex h-[calc(100vh-120px)]">
        {/* Left Panel: Carrier List */}
        <div
          className={cn(
            "border-r border-white/5 flex flex-col transition-all duration-300",
            selectedCarrierId ? "w-[420px]" : "w-full max-w-[600px]"
          )}
        >
          {/* Search */}
          <div className="p-4 border-b border-white/5">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                placeholder="Search carriers by name or MC#..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-[#C5A572]/50 focus:ring-1 focus:ring-[#C5A572]/20"
              />
            </div>
          </div>

          {/* Carrier Table Header */}
          <div className="grid grid-cols-[1fr_80px_70px_60px_60px] gap-2 px-4 py-2 text-xs text-slate-500 font-medium border-b border-white/5">
            <span>Carrier</span>
            <span className="text-center">Tier</span>
            <span className="text-right">Score</span>
            <span className="text-right">On-Time</span>
            <span className="text-right">Loads</span>
          </div>

          {/* Carrier Rows */}
          <div className="flex-1 overflow-y-auto">
            {carriersLoading ? (
              <div className="flex items-center justify-center py-16">
                <div className="w-6 h-6 border-2 border-[#C5A572] border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredCarriers.length === 0 ? (
              <div className="text-center py-16 text-slate-500 text-sm">
                {searchQuery
                  ? "No carriers match your search"
                  : "No carrier data available"}
              </div>
            ) : (
              filteredCarriers.map((c) => (
                <button
                  key={c.id}
                  onClick={() => selectCarrier(c.id)}
                  className={cn(
                    "w-full grid grid-cols-[1fr_80px_70px_60px_60px] gap-2 items-center px-4 py-3 text-left transition-colors border-b border-white/[0.03] group",
                    selectedCarrierId === c.id
                      ? "bg-[#C5A572]/10 border-l-2 border-l-[#C5A572]"
                      : "hover:bg-white/[0.03] border-l-2 border-l-transparent"
                  )}
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">
                      {c.name}
                    </p>
                    {c.mc && (
                      <p className="text-xs text-slate-500 truncate">
                        MC# {c.mc}
                      </p>
                    )}
                  </div>
                  <div className="flex justify-center">
                    <TierBadge tier={c.tier} size="sm" />
                  </div>
                  <div className="text-right">
                    <span
                      className={cn("text-sm font-semibold", scoreColor(c.score))}
                    >
                      {c.score}
                    </span>
                  </div>
                  <div className="text-right">
                    <span className="text-sm text-slate-300">
                      {c.onTimePct.toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-right flex items-center justify-end gap-1">
                    <span className="text-sm text-slate-400">{c.loads}</span>
                    <ChevronRight className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity" />
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Right Panel: Detail or Empty State */}
        {selectedCarrierId ? (
          <div className="flex-1 bg-white overflow-y-auto">
            {/* Panel Header */}
            <div className="sticky top-0 z-10 bg-white border-b border-white/5 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-[#C5A572]/20 flex items-center justify-center">
                    <Truck className="w-5 h-5 text-[#C5A572]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-3">
                      <h2 className="text-lg font-bold text-white">
                        {carrierDetail?.companyName ||
                          carriers.find((c) => c.id === selectedCarrierId)
                            ?.name ||
                          "Loading..."}
                      </h2>
                      {carrierDetail?.currentTier && (
                        <TierBadge tier={carrierDetail.currentTier} size="sm" />
                      )}
                    </div>
                    {carrierDetail && (
                      <p className="text-sm text-slate-400 mt-0.5">
                        Overall Score:{" "}
                        <span
                          className={cn(
                            "font-semibold",
                            scoreColor(carrierDetail.currentScore)
                          )}
                        >
                          {carrierDetail.currentScore.toFixed(1)}%
                        </span>
                        {carrierDetail.bonusPercentage > 0 && (
                          <span className="ml-2 text-slate-500">
                            ({carrierDetail.bonusPercentage}% bonus)
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => setSelectedCarrierId(null)}
                  className="p-2 rounded-lg hover:bg-white/5 transition-colors text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Mini Tabs */}
              <div className="flex gap-1 mt-4 -mb-[17px]">
                {detailTabs.map((tab) => (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={cn(
                      "px-4 py-2 text-sm font-medium rounded-t-lg transition-colors relative",
                      activeTab === tab.key
                        ? "text-[#C5A572] bg-white/5"
                        : "text-slate-400 hover:text-slate-300 hover:bg-white/[0.02]"
                    )}
                  >
                    {tab.label}
                    {activeTab === tab.key && (
                      <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C5A572] rounded-full" />
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Tab Content */}
            <div className="p-6">
              {detailLoading ? (
                <div className="flex items-center justify-center py-20">
                  <div className="w-6 h-6 border-2 border-[#C5A572] border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <>
                  {/* KPIs Tab */}
                  {activeTab === "kpis" && (
                    <div>
                      <h3 className="text-sm font-medium text-slate-400 mb-4">
                        Current Period KPIs
                      </h3>
                      {latest ? (
                        <div className="grid sm:grid-cols-2 gap-4">
                          {Object.entries(kpiLabels).map(([key, label]) => (
                            <KpiGauge
                              key={key}
                              label={label}
                              value={
                                latest[key as keyof Scorecard] as number
                              }
                              inverted={key === "claimRatio"}
                            />
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-16 text-slate-500 text-sm">
                          No scorecard data available for this carrier
                        </div>
                      )}
                    </div>
                  )}

                  {/* Performance Tab */}
                  {activeTab === "performance" && (
                    <div className="space-y-6">
                      {/* Score + Tier Progress */}
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-white/5 rounded-xl border border-white/10 p-5 text-center">
                          <p className="text-xs text-slate-400 mb-1.5 uppercase tracking-wide">
                            Overall Score
                          </p>
                          <p
                            className={cn(
                              "text-4xl font-bold",
                              carrierDetail
                                ? scoreColor(carrierDetail.currentScore)
                                : "text-slate-500"
                            )}
                          >
                            {carrierDetail?.currentScore?.toFixed(1) || "--"}%
                          </p>
                          <p className="text-xs text-slate-500 mt-1.5">
                            Bonus:{" "}
                            {carrierDetail?.bonusPercentage || 0}% on
                            loads
                          </p>
                        </div>
                        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
                          <p className="text-xs text-slate-400 mb-3 uppercase tracking-wide">
                            Path to Next Tier
                          </p>
                          <div className="flex items-center justify-between text-sm mb-2">
                            <span className="text-slate-300">
                              {carrierDetail?.currentTier || "--"}
                            </span>
                            <span className="font-medium text-white text-xs">
                              {carrierDetail?.pointsToNextTier?.toFixed(1) ||
                                0}{" "}
                              pts needed
                            </span>
                          </div>
                          <div className="w-full h-3 bg-white/10 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#C5A572] transition-all"
                              style={{
                                width: `${
                                  carrierDetail?.currentScore &&
                                  carrierDetail?.nextTierThreshold
                                    ? Math.min(
                                        (carrierDetail.currentScore /
                                          carrierDetail.nextTierThreshold) *
                                          100,
                                        100
                                      )
                                    : 0
                                }%`,
                              }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-slate-500 mt-1">
                            <span>
                              {carrierDetail?.currentScore?.toFixed(1) || 0}%
                            </span>
                            <span>
                              {carrierDetail?.nextTierThreshold || 100}%
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Historical Chart */}
                      <div className="bg-white/5 rounded-xl border border-white/10 p-5">
                        <h3 className="text-sm font-medium text-slate-400 mb-4">
                          Score History
                        </h3>
                        {history.length > 0 ? (
                          <ResponsiveContainer width="100%" height={220}>
                            <BarChart data={history}>
                              <XAxis
                                dataKey="week"
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: "#64748b", fontSize: 12 }}
                              />
                              <YAxis
                                domain={[60, 100]}
                                axisLine={false}
                                tickLine={false}
                                tick={{ fill: "#64748b", fontSize: 12 }}
                              />
                              <Tooltip
                                contentStyle={{
                                  background: "#1e293b",
                                  border: "1px solid rgba(255,255,255,0.1)",
                                  borderRadius: "8px",
                                  color: "#fff",
                                }}
                              />
                              <Bar
                                dataKey="score"
                                fill="#D4A843"
                                radius={[4, 4, 0, 0]}
                              />
                            </BarChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-slate-500 text-sm text-center py-12">
                            No history available for this carrier
                          </p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Tenders Tab */}
                  {activeTab === "tenders" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          { label: "Acceptance Rate", value: `${(carriers.find((c) => c.id === selectedCarrierId) as any)?.acceptanceRate?.toFixed(1) || 0}%`, color: "text-green-400" },
                          { label: "Tenders Offered", value: (carriers.find((c) => c.id === selectedCarrierId) as any)?.tendersTotal || 0, color: "text-white" },
                          { label: "Declined", value: (carriers.find((c) => c.id === selectedCarrierId) as any)?.tendersDeclined || 0, color: "text-red-400" },
                        ].map((s) => (
                          <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-center">
                            <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{s.label}</p>
                          </div>
                        ))}
                      </div>
                      <div className="bg-white/[0.03] border border-white/5 rounded-lg p-4">
                        <p className="text-xs text-slate-500 mb-2">Tender acceptance rate measures how often this carrier accepts load offers. Higher rates indicate reliability and strong lane commitment.</p>
                        <p className="text-xs text-slate-600">Data from all tenders sent to this carrier.</p>
                      </div>
                    </div>
                  )}

                  {/* Load Updates Tab */}
                  {activeTab === "updates" && (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { label: "Completed Loads", value: (carriers.find((c) => c.id === selectedCarrierId) as any)?.completedLoads || 0 },
                          { label: "Active Loads", value: (carriers.find((c) => c.id === selectedCarrierId) as any)?.activeLoads || 0 },
                        ].map((s) => (
                          <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-lg p-3 text-center">
                            <p className="text-xl font-bold text-white">{s.value}</p>
                            <p className="text-[10px] text-slate-500 mt-1">{s.label}</p>
                          </div>
                        ))}
                      </div>
                      <div className="bg-white/[0.03] border border-white/5 rounded-lg p-4">
                        <h4 className="text-xs font-medium text-slate-400 mb-2">Load Update Compliance</h4>
                        {latest && (
                          <div className="space-y-2">
                            {[
                              { label: "On-Time Pickup", value: latest.onTimePickupPct, threshold: 95 },
                              { label: "On-Time Delivery", value: latest.onTimeDeliveryPct, threshold: 95 },
                              { label: "Doc Timeliness", value: latest.documentSubmissionTimeliness, threshold: 90 },
                              { label: "GPS Compliance", value: latest.gpsCompliancePct, threshold: 90 },
                            ].map((m) => (
                              <div key={m.label} className="flex items-center gap-3">
                                <span className="text-xs text-slate-500 w-32">{m.label}</span>
                                <div className="flex-1 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${m.value >= m.threshold ? "bg-green-500" : m.value >= 80 ? "bg-yellow-500" : "bg-red-500"}`} style={{ width: `${Math.min(m.value, 100)}%` }} />
                                </div>
                                <span className={`text-xs font-medium ${m.value >= m.threshold ? "text-green-400" : "text-yellow-400"}`}>{m.value.toFixed(1)}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Top Lanes Tab */}
                  {activeTab === "lanes" && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-500">Carrier&apos;s operating regions and equipment capabilities</p>
                      {(() => {
                        const carrier = carriers.find((c) => c.id === selectedCarrierId);
                        return carrier ? (
                          <>
                            <div className="bg-white/[0.03] border border-white/5 rounded-lg p-4">
                              <h4 className="text-xs font-medium text-slate-400 mb-2">Operating Regions</h4>
                              <div className="flex flex-wrap gap-1.5">
                                {(carrier as any).regions?.length > 0
                                  ? (carrier as any).regions.map((r: string) => (
                                      <span key={r} className="px-2 py-1 bg-[#C5A572]/10 text-[#C5A572] text-[10px] rounded">{r}</span>
                                    ))
                                  : <span className="text-xs text-slate-600">No regions specified</span>
                                }
                              </div>
                            </div>
                            <div className="bg-white/[0.03] border border-white/5 rounded-lg p-4">
                              <h4 className="text-xs font-medium text-slate-400 mb-2">Equipment Types</h4>
                              <div className="flex flex-wrap gap-1.5">
                                {(carrier as any).equipment?.length > 0
                                  ? (carrier as any).equipment.map((e: string) => (
                                      <span key={e} className="px-2 py-1 bg-blue-500/10 text-blue-400 text-[10px] rounded">{e.replace(/_/g, " ")}</span>
                                    ))
                                  : <span className="text-xs text-slate-600">No equipment specified</span>
                                }
                              </div>
                            </div>
                            <div className="bg-white/[0.03] border border-white/5 rounded-lg p-4">
                              <h4 className="text-xs font-medium text-slate-400 mb-2">Revenue</h4>
                              <p className="text-lg font-bold text-white">${((carrier as any).revenue || 0).toLocaleString()}</p>
                              <p className="text-[10px] text-slate-500">Total revenue from {(carrier as any).completedLoads || 0} completed loads</p>
                            </div>
                          </>
                        ) : null;
                      })()}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        ) : (
          /* Empty State - No Carrier Selected */
          <div className="flex-1 flex items-center justify-center bg-white">
            <div className="text-center max-w-sm">
              <div className="w-24 h-24 mx-auto mb-6 rounded-2xl bg-white/[0.03] border border-white/5 flex items-center justify-center">
                <Users className="w-10 h-10 text-slate-600" />
              </div>
              <h3 className="text-lg font-semibold text-slate-300 mb-2">
                Select a Carrier
              </h3>
              <p className="text-sm text-slate-500 leading-relaxed">
                Choose a carrier from the list to view their detailed performance
                scorecard, KPI breakdown, and historical trends.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
