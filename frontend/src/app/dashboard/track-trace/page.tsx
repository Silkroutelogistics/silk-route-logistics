"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Search, Activity, AlertTriangle, Clock, CheckCircle2, PhoneCall,
} from "lucide-react";
import { BoardTable } from "./BoardTable";
import { LoadDetailDrawer } from "./LoadDetailDrawer";
import type {
  BoardTab, QuickFilter, BoardResponse, BoardSummary,
} from "./types";
import { REGIONS, EQUIPMENT_TYPES, STRIPE_LEGEND } from "./types";

const TABS: { id: BoardTab; label: string; badge?: boolean }[] = [
  { id: "needs_attention", label: "Needs attention", badge: true },
  { id: "tendered",        label: "Tendered" },
  { id: "active",          label: "Active" },
  { id: "delivered",       label: "Delivered" },
  { id: "closed",          label: "Closed" },
];

const QUICK_PILLS: { id: QuickFilter; label: string }[] = [
  { id: "all",          label: "All" },
  { id: "calls_due",    label: "Check calls due" },
  { id: "at_risk",      label: "At risk" },
  { id: "exceptions",   label: "Exceptions" },
  { id: "gps_stale",    label: "GPS stale" },
  { id: "awaiting_pod", label: "Awaiting POD" },
];

type DateRange = "today" | "yesterday" | "week" | "last7" | "month" | "all";

const dateRangeToFilter = (r: DateRange): { from?: string; to?: string } => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const iso = (d: Date) => d.toISOString();
  switch (r) {
    case "today":     return { from: iso(start), to: iso(now) };
    case "yesterday": {
      const y = new Date(start); y.setDate(y.getDate() - 1);
      return { from: iso(y), to: iso(start) };
    }
    case "week": {
      const day = start.getDay();
      const w = new Date(start); w.setDate(w.getDate() - day);
      return { from: iso(w), to: iso(now) };
    }
    case "last7": {
      const w = new Date(start); w.setDate(w.getDate() - 7);
      return { from: iso(w), to: iso(now) };
    }
    case "month": {
      const m = new Date(now.getFullYear(), now.getMonth(), 1);
      return { from: iso(m), to: iso(now) };
    }
    default: return {};
  }
};

export default function TrackTracePage() {
  const [tab, setTab] = useState<BoardTab>("active");
  const [search, setSearch] = useState("");
  const [region, setRegion] = useState("");
  const [equipment, setEquipment] = useState("");
  const [carrierId, setCarrierId] = useState("");
  const [shipperId, setShipperId] = useState("");
  const [dateRange, setDateRange] = useState<DateRange>("all");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);

  const dateFilter = useMemo(() => dateRangeToFilter(dateRange), [dateRange]);

  const summaryQuery = useQuery<BoardSummary>({
    queryKey: ["tt-summary"],
    queryFn: async () => (await api.get("/track-trace/summary")).data,
    refetchInterval: 30_000,
  });

  const boardQuery = useQuery<BoardResponse>({
    queryKey: ["tt-board", tab, search, region, equipment, carrierId, shipperId, dateFilter, quickFilter],
    queryFn: async () => {
      const params: Record<string, string> = { tab, quickFilter };
      if (search) params.search = search;
      if (region) params.region = region;
      if (equipment) params.equipment = equipment;
      if (carrierId) params.carrierId = carrierId;
      if (shipperId) params.shipperId = shipperId;
      if (dateFilter.from) params.dateFrom = dateFilter.from;
      if (dateFilter.to)   params.dateTo   = dateFilter.to;
      return (await api.get("/track-trace/loads", { params })).data;
    },
    refetchInterval: 30_000,
  });

  const loads = boardQuery.data?.loads ?? [];
  const counts = boardQuery.data?.counts;

  const carriersQuery = useQuery<{ carriers: { id: string; name: string }[] }>({
    queryKey: ["tt-carriers-list"],
    queryFn: async () => (await api.get("/carriers?limit=500&fields=id,company")).data,
    staleTime: 5 * 60_000,
  });

  const shippersQuery = useQuery<{ customers: { id: string; name: string }[] }>({
    queryKey: ["tt-shippers-list"],
    queryFn: async () => (await api.get("/customers?limit=500")).data,
    staleTime: 5 * 60_000,
  });

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Track &amp; Trace</h1>
          <p className="text-sm text-gray-500 mt-1">Real-time board for every active load.</p>
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-5 gap-3">
        <StatCard icon={<Activity className="w-4 h-4" />} label="Active loads"    value={summaryQuery.data?.active ?? 0}       tone="neutral" />
        <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="On time"     value={summaryQuery.data?.onTime ?? 0}       tone="green" />
        <StatCard icon={<Clock className="w-4 h-4" />} label="At risk"            value={summaryQuery.data?.atRisk ?? 0}       tone="amber" />
        <StatCard icon={<AlertTriangle className="w-4 h-4" />} label="Exceptions" value={summaryQuery.data?.exceptions ?? 0}   tone="red" />
        <StatCard icon={<PhoneCall className="w-4 h-4" />} label="Check calls due" value={summaryQuery.data?.checkCallsDue ?? 0} tone="amber" />
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
            {t.badge && (counts?.exceptions ?? 0) > 0 && tab !== t.id && (
              <span className="ml-2 inline-block px-1.5 py-0.5 text-[10px] bg-red-500 text-white rounded">{counts?.exceptions}</span>
            )}
          </button>
        ))}
      </div>

      {/* Filter bar */}
      <div className="grid grid-cols-6 gap-3">
        <div className="relative col-span-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search load#, BOL, PO…"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#BA7517]/30"
          />
        </div>
        <FilterSelect value={region} onChange={setRegion} placeholder="All regions">
          {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
        </FilterSelect>
        <FilterSelect value={equipment} onChange={setEquipment} placeholder="All equipment">
          {EQUIPMENT_TYPES.map((e) => <option key={e} value={e}>{e}</option>)}
        </FilterSelect>
        <FilterSelect value={carrierId} onChange={setCarrierId} placeholder="All carriers">
          {(carriersQuery.data?.carriers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </FilterSelect>
        <FilterSelect value={shipperId} onChange={setShipperId} placeholder="All shippers">
          {(shippersQuery.data?.customers ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </FilterSelect>
        <FilterSelect value={dateRange} onChange={(v) => setDateRange(v as DateRange)} placeholder="All dates">
          <option value="today">Today</option>
          <option value="yesterday">Yesterday</option>
          <option value="week">This week</option>
          <option value="last7">Last 7 days</option>
          <option value="month">This month</option>
          <option value="all">All dates</option>
        </FilterSelect>
      </div>

      {/* Quick pills + legend */}
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {QUICK_PILLS.map((p) => {
            const count =
              p.id === "all"          ? counts?.all :
              p.id === "calls_due"    ? counts?.callsDue :
              p.id === "at_risk"      ? counts?.atRisk :
              p.id === "exceptions"   ? counts?.exceptions :
              p.id === "gps_stale"    ? counts?.gpsStale :
              p.id === "awaiting_pod" ? counts?.awaitingPod : 0;
            const active = quickFilter === p.id;
            return (
              <button
                key={p.id}
                onClick={() => setQuickFilter(p.id)}
                className={`px-3 py-1.5 text-xs rounded-full border transition ${
                  active
                    ? "bg-[#FAEEDA] border-[#BA7517] text-[#854F0B] font-medium"
                    : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {p.label}{count !== undefined ? ` (${count})` : ""}
              </button>
            );
          })}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          {STRIPE_LEGEND.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span className={`w-1 h-4 rounded-sm ${s.color}`} />
              {s.label}
            </span>
          ))}
        </div>
      </div>

      {/* Table */}
      {boardQuery.isLoading
        ? <div className="p-12 text-center text-gray-400">Loading…</div>
        : <BoardTable loads={loads} onRowClick={setSelectedLoadId} />}

      {/* Detail drawer */}
      <LoadDetailDrawer
        loadId={selectedLoadId}
        onClose={() => setSelectedLoadId(null)}
      />
    </div>
  );
}

function StatCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "neutral" | "green" | "amber" | "red";
}) {
  const toneCls = tone === "green"  ? "text-green-700 bg-green-50"
                : tone === "amber"  ? "text-amber-700 bg-amber-50"
                : tone === "red"    ? "text-red-700 bg-red-50"
                : "text-gray-700 bg-gray-50";
  return (
    <div className="border border-gray-200 bg-white rounded-lg p-4">
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${toneCls}`}>
        {icon}{label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}

function FilterSelect({
  value, onChange, placeholder, children,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  children: React.ReactNode;
}) {
  return (
    <select
      value={value} onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg bg-white text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#BA7517]/30"
    >
      <option value="">{placeholder}</option>
      {children}
    </select>
  );
}
