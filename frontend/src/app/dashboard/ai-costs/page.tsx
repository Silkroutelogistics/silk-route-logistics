"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  DollarSign, TrendingUp, Cpu, AlertTriangle, BarChart3,
  PieChart, Clock, Activity, Zap,
} from "lucide-react";
import { api } from "@/lib/api";

export default function AICostsPage() {
  const [days, setDays] = useState(30);

  const { data: costs, isLoading } = useQuery({
    queryKey: ["ai-costs", days],
    queryFn: () => api.get(`/ai/costs/summary?days=${days}`).then((r) => r.data),
  });

  const { data: budget } = useQuery({
    queryKey: ["ai-budget"],
    queryFn: () => api.get("/ai/costs/budget").then((r) => r.data),
  });

  const { data: today } = useQuery({
    queryKey: ["ai-costs-today"],
    queryFn: () => api.get("/ai/costs/today").then((r) => r.data),
    refetchInterval: 60000,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <Cpu className="w-7 h-7 text-gold" />
            AI Cost Monitor
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Track AI API usage, costs, and budget across all providers
          </p>
        </div>
        <div className="flex gap-2">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              onClick={() => setDays(d)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${
                days === d ? "bg-gold text-navy" : "bg-white/5 text-slate-400 hover:text-white"
              }`}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Top Stats */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <CostCard
              icon={DollarSign}
              label="Today's Spend"
              value={`$${today?.costUsd?.toFixed(2) ?? "0.00"}`}
              sub={`${today?.calls ?? 0} calls`}
              color="gold"
            />
            <CostCard
              icon={TrendingUp}
              label={`${days}-Day Total`}
              value={`$${costs?.totalCost?.toFixed(2) ?? "0.00"}`}
              sub={`${costs?.totalCalls ?? 0} API calls`}
              color="blue"
            />
            <CostCard
              icon={Activity}
              label="Success Rate"
              value={`${((costs?.successRate ?? 1) * 100).toFixed(1)}%`}
              sub={`Avg ${costs?.avgLatency ?? 0}ms latency`}
              color="green"
            />
            <CostCard
              icon={AlertTriangle}
              label="Monthly Budget"
              value={`${budget?.percentUsed?.toFixed(0) ?? 0}%`}
              sub={`$${budget?.monthlySpend?.toFixed(2) ?? "0"} / $${budget?.monthlyBudget ?? 100}`}
              color={budget?.percentUsed > 75 ? "red" : budget?.percentUsed > 50 ? "orange" : "green"}
            />
          </div>

          {/* Budget Alert */}
          {budget?.percentUsed > 75 && (
            <div className={`p-4 rounded-xl border ${
              budget.percentUsed > 90
                ? "bg-red-500/10 border-red-500/30"
                : "bg-orange-500/10 border-orange-500/30"
            }`}>
              <div className="flex items-center gap-3">
                <AlertTriangle className={`w-5 h-5 ${budget.percentUsed > 90 ? "text-red-400" : "text-orange-400"}`} />
                <div>
                  <p className={`text-sm font-medium ${budget.percentUsed > 90 ? "text-red-400" : "text-orange-400"}`}>
                    {budget.recommendation}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Projected monthly: ${budget.projectedMonthly?.toFixed(2)}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Charts Grid */}
          <div className="grid lg:grid-cols-2 gap-6">
            {/* By Provider */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-5">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <PieChart className="w-4 h-4 text-gold" />
                Cost by Provider
              </h3>
              {costs?.byProvider?.length > 0 ? (
                <div className="space-y-3">
                  {costs.byProvider.map((p: any) => (
                    <div key={p.provider} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${
                          p.provider === "openai" ? "bg-green-400" : "bg-purple-400"
                        }`} />
                        <span className="text-sm text-white capitalize">{p.provider}</span>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-medium text-white">${p.cost.toFixed(2)}</span>
                        <span className="text-xs text-slate-500 ml-2">{p.calls} calls</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No usage data</p>
              )}
            </div>

            {/* By Model */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-5">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Cpu className="w-4 h-4 text-gold" />
                Cost by Model
              </h3>
              {costs?.byModel?.length > 0 ? (
                <div className="space-y-3">
                  {costs.byModel.map((m: any) => (
                    <div key={m.model} className="flex items-center justify-between">
                      <div className="min-w-0">
                        <p className="text-sm text-white truncate">{m.model}</p>
                        <p className="text-xs text-slate-500">{m.calls} calls • avg {m.avgLatency}ms</p>
                      </div>
                      <span className="text-sm font-medium text-white shrink-0">${m.cost.toFixed(2)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No usage data</p>
              )}
            </div>

            {/* By Query Type */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-5">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <Zap className="w-4 h-4 text-gold" />
                Cost by Feature
              </h3>
              {costs?.byQueryType?.length > 0 ? (
                <div className="space-y-3">
                  {costs.byQueryType.map((q: any) => (
                    <div key={q.queryType} className="flex items-center justify-between">
                      <span className="text-sm text-white capitalize">{q.queryType?.replace(/_/g, " ")}</span>
                      <div className="text-right">
                        <span className="text-sm font-medium text-white">${q.cost.toFixed(2)}</span>
                        <span className="text-xs text-slate-500 ml-2">{q.calls}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No usage data</p>
              )}
            </div>

            {/* Daily Trend */}
            <div className="bg-white/5 rounded-xl border border-white/10 p-5">
              <h3 className="text-white font-semibold mb-4 flex items-center gap-2">
                <BarChart3 className="w-4 h-4 text-gold" />
                Daily Cost Trend
              </h3>
              {costs?.dailyCosts?.length > 0 ? (
                <div className="space-y-1">
                  {costs.dailyCosts.slice(-14).map((d: any) => {
                    const maxCost = Math.max(...costs.dailyCosts.map((x: any) => x.cost), 0.01);
                    const pct = (d.cost / maxCost) * 100;
                    return (
                      <div key={d.date} className="flex items-center gap-2">
                        <span className="text-xs text-slate-500 w-16 shrink-0">{d.date.slice(5)}</span>
                        <div className="flex-1 bg-white/5 rounded-full h-4 overflow-hidden">
                          <div
                            className="bg-gold/60 h-full rounded-full transition-all"
                            style={{ width: `${Math.max(2, pct)}%` }}
                          />
                        </div>
                        <span className="text-xs text-slate-400 w-14 text-right">${d.cost.toFixed(2)}</span>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-slate-500 text-sm">No daily data</p>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CostCard({ icon: Icon, label, value, sub, color }: {
  icon: any; label: string; value: string; sub: string; color: string;
}) {
  const colorMap: Record<string, string> = {
    gold: "text-gold bg-gold/10",
    blue: "text-blue-400 bg-blue-500/10",
    green: "text-green-400 bg-green-500/10",
    red: "text-red-400 bg-red-500/10",
    orange: "text-orange-400 bg-orange-500/10",
    purple: "text-purple-400 bg-purple-500/10",
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
          <p className="text-xs text-slate-500">{sub}</p>
        </div>
      </div>
    </div>
  );
}
