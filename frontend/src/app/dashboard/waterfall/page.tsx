"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Activity, Zap, CheckCircle2, AlertTriangle, Clock, Circle } from "lucide-react";
import { BoardTable } from "./BoardTable";
import { WaterfallDrawer } from "./WaterfallDrawer";
import type { BoardTab, BoardSummary, BoardResponse, AutomationMode } from "./types";
import { MODE_LABELS } from "./types";

const TABS: { id: BoardTab; label: string }[] = [
  { id: "pending",    label: "Pending" },
  { id: "active",     label: "Active waterfalls" },
  { id: "dispatched", label: "Dispatched" },
  { id: "exhausted",  label: "Exhausted" },
];

function getSavedMode(): AutomationMode {
  if (typeof window === "undefined") return "full_auto";
  const saved = window.localStorage.getItem("srl-waterfall-mode") as AutomationMode | null;
  return saved ?? "full_auto";
}

export default function WaterfallPage() {
  const [tab, setTab] = useState<BoardTab>("active");
  const [mode, setMode] = useState<AutomationMode>(getSavedMode);
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);

  const setAndPersistMode = (m: AutomationMode) => {
    setMode(m);
    if (typeof window !== "undefined") window.localStorage.setItem("srl-waterfall-mode", m);
    // TODO: also persist to user preferences via API in a post-launch lane.
  };

  const summaryQuery = useQuery<BoardSummary>({
    queryKey: ["wf-summary"],
    queryFn: async () => (await api.get("/waterfalls/summary")).data,
    refetchInterval: 15_000,
  });

  const boardQuery = useQuery<BoardResponse>({
    queryKey: ["wf-board", tab],
    queryFn: async () => (await api.get("/waterfalls/loads", { params: { tab } })).data,
    refetchInterval: 15_000,
  });

  const loads = boardQuery.data?.loads ?? [];

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header + automation mode toggle */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Waterfall Dispatch</h1>
          <p className="text-sm text-gray-500 mt-1">
            Every load flows through The Caravan. The waterfall engine auto-tenders ranked carriers in sequence.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex border border-gray-200 rounded-lg bg-white p-0.5">
            {(["manual", "semi_auto", "full_auto"] as AutomationMode[]).map((m) => (
              <button
                key={m}
                onClick={() => setAndPersistMode(m)}
                className={`px-3 py-1.5 text-xs font-medium rounded transition ${
                  mode === m
                    ? "bg-[#FAEEDA] text-[#854F0B]"
                    : "text-gray-500 hover:text-gray-800"
                }`}
              >
                {MODE_LABELS[m]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 text-xs text-green-700">
            <span className="w-2 h-2 rounded-full bg-green-500" />
            Engine active
          </div>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard icon={<Circle className="w-4 h-4" />} label="Pending dispatch"   value={summaryQuery.data?.pending ?? 0}           tone="neutral" />
        <StatCard icon={<Zap className="w-4 h-4" />}    label="Active waterfalls"  value={summaryQuery.data?.activeWaterfalls ?? 0}  tone="amber" />
        <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Dispatched today" value={summaryQuery.data?.dispatchedToday ?? 0} tone="green" />
        <StatCard
          icon={<Activity className="w-4 h-4" />}
          label="Acceptance rate"
          value={summaryQuery.data?.acceptanceRate !== null && summaryQuery.data?.acceptanceRate !== undefined
            ? `${summaryQuery.data.acceptanceRate}%`
            : "—"}
          tone="green"
        />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Exhausted" value={summaryQuery.data?.exhausted ?? 0} tone="red" />
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition ${
              tab === t.id
                ? "border-[#BA7517] text-[#854F0B]"
                : "border-transparent text-gray-500 hover:text-gray-800"
            }`}
          >
            {t.label}
            {t.id === "exhausted" && (summaryQuery.data?.exhausted ?? 0) > 0 && (
              <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded">
                {summaryQuery.data?.exhausted}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Table */}
      {boardQuery.isLoading
        ? <div className="p-12 text-center text-gray-400">Loading…</div>
        : <BoardTable loads={loads} onRowClick={setSelectedLoadId} />}

      {/* Drawer */}
      <WaterfallDrawer loadId={selectedLoadId} onClose={() => setSelectedLoadId(null)} />
    </div>
  );
}

function StatCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone: "neutral" | "green" | "amber" | "red";
}) {
  const toneCls = tone === "green"  ? "text-green-700 bg-green-50"
                : tone === "amber"  ? "text-amber-700 bg-amber-50"
                : tone === "red"    ? "text-red-700 bg-red-50"
                : "text-gray-700 bg-gray-50";
  return (
    <div className="border border-gray-200 bg-white rounded-lg p-4">
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${toneCls}`}>
        {icon}<Clock className="w-0 h-0" />{label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}
