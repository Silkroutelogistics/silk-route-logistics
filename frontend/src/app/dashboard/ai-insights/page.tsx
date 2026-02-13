"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Brain, TrendingUp, AlertTriangle, Target, Zap, RefreshCw,
  ChevronRight, BarChart3, Shield, Activity, Clock,
} from "lucide-react";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { isAdmin } from "@/lib/roles";

type Tab = "overview" | "rates" | "carriers" | "anomalies" | "recommendations" | "learning";

export default function AIInsightsPage() {
  const [tab, setTab] = useState<Tab>("overview");
  const { user } = useAuthStore();
  const admin = isAdmin(user?.role);

  const tabs: Array<{ key: Tab; label: string; icon: typeof Brain }> = [
    { key: "overview", label: "AI Overview", icon: Brain },
    { key: "rates", label: "Rate Intel", icon: TrendingUp },
    { key: "carriers", label: "Carrier Intel", icon: Target },
    { key: "anomalies", label: "Anomalies", icon: AlertTriangle },
    { key: "recommendations", label: "Match Engine", icon: Zap },
    ...(admin ? [{ key: "learning" as Tab, label: "Learning Cycles", icon: RefreshCw }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Brain className="w-7 h-7 text-gold" />
            AI Insights
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Self-learning intelligence engine — powered by every load, rate, and carrier interaction
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white/5 rounded-xl p-1 overflow-x-auto">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition ${
                tab === t.key
                  ? "bg-gold text-navy shadow"
                  : "text-slate-400 hover:text-white hover:bg-white/5"
              }`}
            >
              <Icon className="w-4 h-4" />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && <OverviewTab />}
      {tab === "rates" && <RatesTab />}
      {tab === "carriers" && <CarriersTab />}
      {tab === "anomalies" && <AnomaliesTab />}
      {tab === "recommendations" && <RecommendationsTab />}
      {tab === "learning" && admin && <LearningTab />}
    </div>
  );
}

/* ─── Overview Tab ──────────────────────────────────────────────────────── */

function OverviewTab() {
  const { data: dashboard, isLoading } = useQuery({
    queryKey: ["ai-dashboard"],
    queryFn: () => api.get("/ai/dashboard").then((r) => r.data),
  });

  const { data: anomalies } = useQuery({
    queryKey: ["ai-anomalies-recent"],
    queryFn: () => api.get("/ai/anomalies/recent?limit=5").then((r) => r.data),
  });

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      {/* Stats Grid */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Brain} label="AI Models Active" value={dashboard?.totalModels ?? 6} color="gold" />
        <StatCard icon={BarChart3} label="Lanes Tracked" value={dashboard?.lanesTracked ?? 0} color="blue" />
        <StatCard icon={Target} label="Carriers Scored" value={dashboard?.carriersScored ?? 0} color="green" />
        <StatCard icon={AlertTriangle} label="Active Anomalies" value={anomalies?.length ?? 0} color={anomalies?.length > 0 ? "red" : "green"} />
      </div>

      {/* Two-column layout */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* Recent Learning Cycles */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <RefreshCw className="w-4 h-4 text-gold" />
            Recent Learning Cycles
          </h3>
          {dashboard?.recentCycles?.length > 0 ? (
            <div className="space-y-3">
              {dashboard.recentCycles.slice(0, 5).map((cycle: any, i: number) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <div>
                    <p className="text-sm text-white">{cycle.serviceName?.replace(/_/g, " ")}</p>
                    <p className="text-xs text-slate-500">{new Date(cycle.startedAt).toLocaleString()}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-xs px-2 py-0.5 rounded ${cycle.status === "COMPLETED" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                      {cycle.status}
                    </span>
                    <p className="text-xs text-slate-500 mt-1">{cycle.dataPointsProcessed} pts</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-slate-500 text-sm">No learning cycles yet</p>
          )}
        </div>

        {/* Active Anomalies */}
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-gold" />
            Active Anomalies
          </h3>
          {anomalies?.length > 0 ? (
            <div className="space-y-3">
              {anomalies.slice(0, 5).map((a: any) => (
                <div key={a.id} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
                  <div className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${
                    a.severity === "CRITICAL" ? "bg-red-500" : a.severity === "HIGH" ? "bg-orange-500" : "bg-yellow-500"
                  }`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-white truncate">{a.description}</p>
                    <p className="text-xs text-slate-500">{a.anomalyType} • {a.entityType}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                    a.severity === "CRITICAL" ? "bg-red-500/20 text-red-400"
                    : a.severity === "HIGH" ? "bg-orange-500/20 text-orange-400"
                    : "bg-yellow-500/20 text-yellow-400"
                  }`}>
                    {a.severity}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-green-400 text-sm">No anomalies detected</p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Rates Tab ─────────────────────────────────────────────────────────── */

function RatesTab() {
  const [origin, setOrigin] = useState("");
  const [dest, setDest] = useState("");

  const { data: market, isLoading } = useQuery({
    queryKey: ["ai-rates-market"],
    queryFn: () => api.get("/ai/rates/market").then((r) => r.data),
  });

  const { data: prediction, refetch: predict } = useQuery({
    queryKey: ["ai-rate-predict", origin, dest],
    queryFn: () => api.get(`/ai/rates/predict?originState=${origin}&destState=${dest}`).then((r) => r.data),
    enabled: false,
  });

  return (
    <div className="space-y-6">
      {/* Rate Prediction Tool */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gold" />
          Rate Prediction
        </h3>
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="block text-xs text-slate-400 mb-1">Origin State</label>
            <input
              value={origin}
              onChange={(e) => setOrigin(e.target.value.toUpperCase())}
              placeholder="IL"
              maxLength={2}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm w-20 placeholder:text-slate-600 focus:border-gold/50 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-xs text-slate-400 mb-1">Dest State</label>
            <input
              value={dest}
              onChange={(e) => setDest(e.target.value.toUpperCase())}
              placeholder="TX"
              maxLength={2}
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-white text-sm w-20 placeholder:text-slate-600 focus:border-gold/50 focus:outline-none"
            />
          </div>
          <button
            onClick={() => predict()}
            disabled={origin.length !== 2 || dest.length !== 2}
            className="px-4 py-2 bg-gold text-navy rounded-lg text-sm font-medium hover:bg-gold/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Predict Rate
          </button>
        </div>
        {prediction && (
          <div className="mt-4 grid sm:grid-cols-3 gap-4">
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-xs text-slate-400">Predicted Rate</p>
              <p className="text-2xl font-bold text-gold">${prediction.predictedRate?.toLocaleString() ?? "N/A"}</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-xs text-slate-400">Confidence</p>
              <p className="text-lg font-semibold text-white">{((prediction.confidence ?? 0) * 100).toFixed(0)}%</p>
            </div>
            <div className="bg-white/5 rounded-lg p-3">
              <p className="text-xs text-slate-400">Trend</p>
              <p className={`text-lg font-semibold ${
                prediction.trend === "RISING" ? "text-red-400" : prediction.trend === "FALLING" ? "text-green-400" : "text-slate-300"
              }`}>
                {prediction.trend ?? "UNKNOWN"} {prediction.trendPct ? `(${prediction.trendPct > 0 ? "+" : ""}${prediction.trendPct.toFixed(1)}%)` : ""}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Market Intelligence */}
      {isLoading ? <LoadingState /> : (
        <div className="grid lg:grid-cols-2 gap-6">
          <LaneTable title="Rising Lanes" lanes={market?.risingLanes} color="red" />
          <LaneTable title="Falling Lanes" lanes={market?.fallingLanes} color="green" />
        </div>
      )}
    </div>
  );
}

function LaneTable({ title, lanes, color }: { title: string; lanes: any[]; color: string }) {
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-5">
      <h3 className="text-white font-semibold mb-3">{title}</h3>
      {lanes?.length > 0 ? (
        <table className="w-full">
          <thead>
            <tr className="text-xs text-slate-500">
              <th className="text-left py-2">Lane</th>
              <th className="text-right py-2">Avg Rate</th>
              <th className="text-right py-2">Trend</th>
              <th className="text-right py-2">Samples</th>
            </tr>
          </thead>
          <tbody>
            {lanes.slice(0, 10).map((l: any, i: number) => (
              <tr key={i} className="border-t border-white/5">
                <td className="py-2 text-sm text-white">{l.laneKey}</td>
                <td className="py-2 text-sm text-right text-slate-300">${Math.round(l.avgRate).toLocaleString()}</td>
                <td className={`py-2 text-sm text-right text-${color}-400`}>
                  {l.trendPct > 0 ? "+" : ""}{l.trendPct?.toFixed(1)}%
                </td>
                <td className="py-2 text-sm text-right text-slate-500">{l.sampleSize}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-slate-500 text-sm">No data yet</p>
      )}
    </div>
  );
}

/* ─── Carriers Tab ──────────────────────────────────────────────────────── */

function CarriersTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["ai-carrier-dashboard"],
    queryFn: () => api.get("/ai/carriers/dashboard").then((r) => r.data),
  });

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-3 gap-6">
        {/* At Risk */}
        <CarrierList title="At Risk" carriers={data?.atRisk} badge="RISK" badgeColor="red" />
        {/* Top Performers */}
        <CarrierList title="Top Performers" carriers={data?.topPerformers} badge="SCORE" badgeColor="green" />
        {/* Declining */}
        <CarrierList title="Declining Performance" carriers={data?.declining} badge="TREND" badgeColor="orange" />
      </div>
    </div>
  );
}

function CarrierList({ title, carriers, badge, badgeColor }: { title: string; carriers: any[]; badge: string; badgeColor: string }) {
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-5">
      <h3 className="text-white font-semibold mb-4">{title}</h3>
      {carriers?.length > 0 ? (
        <div className="space-y-3">
          {carriers.slice(0, 8).map((c: any) => (
            <div key={c.id} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <div className="min-w-0">
                <p className="text-sm text-white truncate">{c.carrier?.companyName ?? "Unknown"}</p>
                <p className="text-xs text-slate-500">{c.carrier?.cppTier ?? "—"}</p>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded bg-${badgeColor}-500/20 text-${badgeColor}-400 shrink-0`}>
                {badge === "RISK" ? `${(c.fallOffRisk * 100).toFixed(0)}%`
                  : badge === "SCORE" ? `${c.reliabilityScore}/100`
                  : c.performanceTrend}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-slate-500 text-sm">No data</p>
      )}
    </div>
  );
}

/* ─── Anomalies Tab ─────────────────────────────────────────────────────── */

function AnomaliesTab() {
  const { data: anomalies, isLoading } = useQuery({
    queryKey: ["ai-anomalies"],
    queryFn: () => api.get("/ai/anomalies/recent?limit=50").then((r) => r.data),
  });

  if (isLoading) return <LoadingState />;

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-5">
      <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-gold" />
        Anomaly Log
      </h3>
      {anomalies?.length > 0 ? (
        <div className="space-y-2">
          {anomalies.map((a: any) => (
            <div key={a.id} className="flex items-start gap-3 p-3 bg-white/5 rounded-lg">
              <div className={`mt-1 w-2.5 h-2.5 rounded-full shrink-0 ${
                a.severity === "CRITICAL" ? "bg-red-500" : a.severity === "HIGH" ? "bg-orange-500" : a.severity === "MEDIUM" ? "bg-yellow-500" : "bg-blue-500"
              }`} />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-white">{a.description}</p>
                <div className="flex gap-3 mt-1">
                  <span className="text-xs text-slate-500">{a.entityType}</span>
                  <span className="text-xs text-slate-500">{a.anomalyType}</span>
                  <span className="text-xs text-slate-500">{new Date(a.createdAt).toLocaleString()}</span>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded shrink-0 ${
                a.severity === "CRITICAL" ? "bg-red-500/20 text-red-400"
                : a.severity === "HIGH" ? "bg-orange-500/20 text-orange-400"
                : a.severity === "MEDIUM" ? "bg-yellow-500/20 text-yellow-400"
                : "bg-blue-500/20 text-blue-400"
              }`}>
                {a.severity}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8">
          <Shield className="w-10 h-10 text-green-400 mx-auto mb-3" />
          <p className="text-green-400 font-medium">All Clear</p>
          <p className="text-slate-500 text-sm mt-1">No anomalies detected</p>
        </div>
      )}
    </div>
  );
}

/* ─── Recommendations Tab ───────────────────────────────────────────────── */

function RecommendationsTab() {
  const { data, isLoading } = useQuery({
    queryKey: ["ai-recommendation-perf"],
    queryFn: () => api.get("/ai/recommendations/performance").then((r) => r.data),
  });

  if (isLoading) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Target} label="Total Recommendations" value={data?.total ?? 0} color="blue" />
        <StatCard icon={Zap} label="Accepted" value={data?.accepted ?? 0} color="green" />
        <StatCard icon={Activity} label="Hit Rate" value={`${((data?.hitRate ?? 0) * 100).toFixed(1)}%`} color="gold" />
        <StatCard icon={BarChart3} label="Avg Match Score" value={data?.avgMatchScore ?? 0} color="purple" />
      </div>

      <div className="bg-white/5 rounded-xl border border-white/10 p-5">
        <h3 className="text-white font-semibold mb-4">Recommendation Outcomes (Last 30 Days)</h3>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold text-green-400">{data?.accepted ?? 0}</p>
            <p className="text-xs text-slate-500">Accepted</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-400">{data?.rejected ?? 0}</p>
            <p className="text-xs text-slate-500">Rejected</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-400">{data?.ignored ?? 0}</p>
            <p className="text-xs text-slate-500">Ignored</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-yellow-400">{data?.pending ?? 0}</p>
            <p className="text-xs text-slate-500">Pending</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Learning Tab (Admin Only) ─────────────────────────────────────────── */

function LearningTab() {
  const queryClient = useQueryClient();

  const { data: status, isLoading } = useQuery({
    queryKey: ["ai-training-status"],
    queryFn: () => api.get("/ai/learning/status").then((r) => r.data),
  });

  const { mutate: triggerLearning, isPending } = useMutation({
    mutationFn: (service: string) => api.post(`/ai/learn/${service}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ai-training-status"] });
    },
  });

  if (isLoading) return <LoadingState />;

  const services = [
    { key: "rates", label: "Rate Intelligence", desc: "Retrain rate prediction models" },
    { key: "carriers", label: "Carrier Intelligence", desc: "Update carrier scoring models" },
    { key: "lanes", label: "Lane Optimizer", desc: "Recalculate lane analytics" },
    { key: "customers", label: "Customer Intelligence", desc: "Update customer insights" },
    { key: "compliance", label: "Compliance Forecast", desc: "Refresh compliance predictions" },
    { key: "all", label: "Full Training Cycle", desc: "Run all learning services" },
  ];

  return (
    <div className="space-y-6">
      {/* Service Status */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-5">
        <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4 text-gold" />
          Service Status
        </h3>
        <div className="space-y-2">
          {status?.serviceStatus?.map((s: any) => (
            <div key={s.service} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
              <div>
                <p className="text-sm text-white capitalize">{s.service?.replace(/_/g, " ")}</p>
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  Last: {s.lastRun ? new Date(s.lastRun).toLocaleString() : "Never"}
                </p>
              </div>
              <div className="text-right">
                <span className={`text-xs px-2 py-0.5 rounded ${s.status === "COMPLETED" ? "bg-green-500/20 text-green-400" : "bg-yellow-500/20 text-yellow-400"}`}>
                  {s.status}
                </span>
                <p className="text-xs text-slate-500 mt-1">{s.dataPoints} data points</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Manual Triggers */}
      <div className="bg-white/5 rounded-xl border border-white/10 p-5">
        <h3 className="text-white font-semibold mb-4">Manual Training Triggers</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {services.map((s) => (
            <button
              key={s.key}
              onClick={() => triggerLearning(s.key)}
              disabled={isPending}
              className="flex items-center gap-3 p-3 bg-white/5 rounded-lg border border-white/10 hover:border-gold/30 hover:bg-gold/5 transition text-left disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 text-gold shrink-0 ${isPending ? "animate-spin" : ""}`} />
              <div>
                <p className="text-sm text-white font-medium">{s.label}</p>
                <p className="text-xs text-slate-500">{s.desc}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ─── Shared Components ─────────────────────────────────────────────────── */

function StatCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    gold: "text-gold bg-gold/10",
    blue: "text-blue-400 bg-blue-500/10",
    green: "text-green-400 bg-green-500/10",
    red: "text-red-400 bg-red-500/10",
    purple: "text-purple-400 bg-purple-500/10",
    orange: "text-orange-400 bg-orange-500/10",
  };

  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg ${colorMap[color] ?? colorMap.gold}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <p className="text-xs text-slate-400">{label}</p>
          <p className="text-xl font-bold text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
    </div>
  );
}
