"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Fuel, Plus, Search, BarChart3, Activity, Layers,
  Calendar, Tag, Hash, Percent, Upload, ChevronRight,
  ToggleLeft, ToggleRight, Trash2, Edit2, X, FileSpreadsheet,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SlideDrawer } from "@/components/ui/SlideDrawer";

/* ── Types ───────────────────────────────────────────────── */

interface FuelTier {
  id?: string;
  fuelPriceMin: number;
  fuelPriceMax: number;
  surchargeRate: number;
  type: "PERCENTAGE" | "PER_MILE" | "FLAT";
}

interface FuelTable {
  id: string;
  name: string;
  type: "DOE_NATIONAL" | "CUSTOM";
  effectiveDate: string;
  expiryDate: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  tiers: FuelTier[];
}

interface FuelTableForm {
  name: string;
  type: "DOE_NATIONAL" | "CUSTOM";
  effectiveDate: string;
  expiryDate: string;
  notes: string;
  tiers: FuelTier[];
}

const EMPTY_FORM: FuelTableForm = {
  name: "",
  type: "CUSTOM",
  effectiveDate: "",
  expiryDate: "",
  notes: "",
  tiers: [{ fuelPriceMin: 0, fuelPriceMax: 0, surchargeRate: 0, type: "PERCENTAGE" }],
};

const TIER_TYPES = ["PERCENTAGE", "PER_MILE", "FLAT"] as const;

/* ── Helpers ─────────────────────────────────────────────── */

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtRate(rate: number, type: string) {
  if (type === "PERCENTAGE") return `${rate}%`;
  if (type === "PER_MILE") return `$${rate.toFixed(2)}/mi`;
  return `$${rate.toFixed(2)}`;
}

/* ── Page ────────────────────────────────────────────────── */

export default function FuelTablesPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerMode, setDrawerMode] = useState<"create" | "csv">("create");
  const [form, setForm] = useState<FuelTableForm>({ ...EMPTY_FORM });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<"details" | "tiers" | "notes">("details");
  const [csvContent, setCsvContent] = useState("");
  const [csvTableId, setCsvTableId] = useState<string | null>(null);
  const [lookupPrice, setLookupPrice] = useState("");
  const [lookupResult, setLookupResult] = useState<{ surchargeRate: number; type: string } | null>(null);

  /* ── Queries ────────────────────────────────────────────── */

  const { data: tables = [], isLoading } = useQuery({
    queryKey: ["fuel-tables"],
    queryFn: () => api.get<FuelTable[]>("/fuel-tables").then((r) => r.data),
  });

  const selectedTable = tables.find((t) => t.id === selectedId) ?? null;

  const { data: detailData } = useQuery({
    queryKey: ["fuel-tables", selectedId],
    queryFn: () => api.get<FuelTable>(`/fuel-tables/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  const detail = detailData ?? selectedTable;

  /* ── Mutations ──────────────────────────────────────────── */

  const createMutation = useMutation({
    mutationFn: (payload: FuelTableForm) => api.post("/fuel-tables", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fuel-tables"] });
      closeDrawer();
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/fuel-tables/${id}`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["fuel-tables"] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/fuel-tables/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fuel-tables"] });
      if (selectedId === deleteMutation.variables) setSelectedId(null);
    },
  });

  const csvMutation = useMutation({
    mutationFn: ({ id, csv }: { id: string; csv: string }) =>
      api.post(`/fuel-tables/${id}/import-csv`, { csvContent: csv }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fuel-tables"] });
      closeDrawer();
    },
  });

  /* ── Drawer helpers ─────────────────────────────────────── */

  function closeDrawer() {
    setDrawerOpen(false);
    setForm({ ...EMPTY_FORM });
    setCsvContent("");
    setCsvTableId(null);
  }

  function openCreate() {
    setDrawerMode("create");
    setForm({ ...EMPTY_FORM });
    setDrawerOpen(true);
  }

  function openCsvImport(tableId: string) {
    setDrawerMode("csv");
    setCsvTableId(tableId);
    setCsvContent("");
    setDrawerOpen(true);
  }

  function addTier() {
    setForm((f) => ({
      ...f,
      tiers: [...f.tiers, { fuelPriceMin: 0, fuelPriceMax: 0, surchargeRate: 0, type: "PERCENTAGE" }],
    }));
  }

  function updateTier(idx: number, field: keyof FuelTier, value: string | number) {
    setForm((f) => {
      const tiers = [...f.tiers];
      tiers[idx] = { ...tiers[idx], [field]: value };
      return { ...f, tiers };
    });
  }

  function removeTier(idx: number) {
    setForm((f) => ({ ...f, tiers: f.tiers.filter((_, i) => i !== idx) }));
  }

  function handleCreate() {
    createMutation.mutate({
      ...form,
      tiers: form.tiers.map((t) => ({
        ...t,
        fuelPriceMin: Number(t.fuelPriceMin),
        fuelPriceMax: Number(t.fuelPriceMax),
        surchargeRate: Number(t.surchargeRate),
      })),
    });
  }

  async function handleLookup() {
    if (!lookupPrice) return;
    try {
      const res = await api.get(`/fuel-tables/lookup?fuelPrice=${lookupPrice}`);
      setLookupResult(res.data);
    } catch {
      setLookupResult(null);
    }
  }

  /* ── Derived data ───────────────────────────────────────── */

  const filtered = tables.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const totalTables = tables.length;
  const activeTables = tables.filter((t) => t.isActive).length;
  const avgTierCount = totalTables > 0
    ? Math.round(tables.reduce((sum, t) => sum + (t.tiers?.length ?? 0), 0) / totalTables)
    : 0;

  /* ── Stat Card ──────────────────────────────────────────── */

  function StatCard({ icon: Icon, label, value, accent }: {
    icon: typeof Fuel; label: string; value: string | number; accent?: boolean;
  }) {
    return (
      <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5">
        <div className="flex items-center gap-3 mb-2">
          <div className={cn(
            "w-9 h-9 rounded-lg flex items-center justify-center",
            accent ? "bg-[#C9A84C]/10 text-[#C9A84C]" : "bg-gray-100 text-white/50"
          )}>
            <Icon className="w-4 h-4" />
          </div>
          <span className="text-xs text-white/40 uppercase tracking-wider">{label}</span>
        </div>
        <p className={cn("text-2xl font-semibold", accent ? "text-[#C9A84C]" : "text-white")}>
          {value}
        </p>
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────────── */

  return (
    <div className="min-h-screen bg-[#0a0e1a] text-white">
      <div className="max-w-[1600px] mx-auto px-6 py-8">

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Fuel className="w-6 h-6 text-[#C9A84C]" />
              Fuel Surcharge Tables
            </h1>
            <p className="text-sm text-white/40 mt-1">
              Manage fuel surcharge schedules and tier-based pricing
            </p>
          </div>
          <button
            onClick={openCreate}
            className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#C9A84C] text-black font-medium text-sm hover:bg-[#d4b85e] transition"
          >
            <Plus className="w-4 h-4" />
            New Table
          </button>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <StatCard icon={Layers} label="Total Tables" value={totalTables} />
          <StatCard icon={Activity} label="Active" value={activeTables} accent />
          <StatCard icon={BarChart3} label="Avg Tier Count" value={avgTierCount} />
        </div>

        {/* Quick Lookup */}
        <div className="rounded-xl border border-white/5 bg-white/[0.03] p-5 mb-8">
          <h3 className="text-sm font-medium text-white/60 mb-3 flex items-center gap-2">
            <Search className="w-4 h-4" />
            Quick Rate Lookup
          </h3>
          <div className="flex items-center gap-3">
            <div className="relative flex-1 max-w-xs">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30 text-sm">$</span>
              <input
                type="number"
                step="0.01"
                placeholder="Fuel price (e.g. 3.50)"
                value={lookupPrice}
                onChange={(e) => setLookupPrice(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleLookup()}
                className="w-full pl-7 pr-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-white text-sm placeholder:text-white/20 focus:outline-none focus:border-blue-400"
              />
            </div>
            <button
              onClick={handleLookup}
              className="px-4 py-2 rounded-lg bg-gray-100 border border-gray-200 text-sm text-white/70 hover:bg-gray-100 transition"
            >
              Lookup
            </button>
            {lookupResult && (
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-[#C9A84C]/10 border border-[#C9A84C]/20">
                <Percent className="w-4 h-4 text-[#C9A84C]" />
                <span className="text-sm font-medium text-[#C9A84C]">
                  {fmtRate(lookupResult.surchargeRate, lookupResult.type)}
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Search + List */}
        <div className="flex gap-6">
          {/* Left: Table List */}
          <div className={cn("flex-1 min-w-0", selectedId && "max-w-[55%]")}>
            {/* Search bar */}
            <div className="relative mb-4">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
              <input
                placeholder="Search tables..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-gray-100 border border-gray-200 text-sm text-white placeholder:text-white/20 focus:outline-none focus:border-blue-400"
              />
            </div>

            {isLoading ? (
              <div className="text-center py-20 text-white/30 text-sm">Loading fuel tables...</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-20 text-white/30 text-sm">
                {search ? "No tables match your search" : "No fuel surcharge tables yet"}
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((table) => (
                  <div
                    key={table.id}
                    onClick={() => {
                      setSelectedId(table.id);
                      setDetailTab("details");
                    }}
                    className={cn(
                      "rounded-xl border p-4 cursor-pointer transition group",
                      selectedId === table.id
                        ? "border-[#C9A84C]/30 bg-[#C9A84C]/5"
                        : "border-white/5 bg-white/[0.03] hover:border-gray-200 hover:bg-gray-50"
                    )}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-9 h-9 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                          <Fuel className="w-4 h-4 text-white/40" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-medium text-white truncate">{table.name}</h3>
                          <div className="flex items-center gap-3 mt-1">
                            <span className={cn(
                              "text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider",
                              table.type === "DOE_NATIONAL"
                                ? "bg-blue-500/10 text-blue-400"
                                : "bg-purple-500/10 text-purple-400"
                            )}>
                              {table.type === "DOE_NATIONAL" ? "DOE National" : "Custom"}
                            </span>
                            <span className="text-xs text-white/30">
                              {fmtDate(table.effectiveDate)}
                            </span>
                            <span className="text-xs text-white/30">
                              {table.tiers?.length ?? 0} tiers
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        {/* Active toggle */}
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleMutation.mutate({ id: table.id, isActive: !table.isActive });
                          }}
                          className="p-1"
                          title={table.isActive ? "Active" : "Inactive"}
                        >
                          {table.isActive ? (
                            <ToggleRight className="w-6 h-6 text-emerald-400" />
                          ) : (
                            <ToggleLeft className="w-6 h-6 text-white/20" />
                          )}
                        </button>
                        <ChevronRight className={cn(
                          "w-4 h-4 transition",
                          selectedId === table.id ? "text-[#C9A84C]" : "text-white/20 group-hover:text-white/40"
                        )} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: Detail Panel */}
          {selectedId && detail && (
            <div className="w-[45%] shrink-0">
              <div className="rounded-xl border border-white/5 bg-white/[0.03] overflow-hidden sticky top-6">
                {/* Detail header */}
                <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-white">{detail.name}</h2>
                    <span className={cn(
                      "text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wider mt-1 inline-block",
                      detail.type === "DOE_NATIONAL"
                        ? "bg-blue-500/10 text-blue-400"
                        : "bg-purple-500/10 text-purple-400"
                    )}>
                      {detail.type === "DOE_NATIONAL" ? "DOE National" : "Custom"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => openCsvImport(detail.id)}
                      className="p-2 rounded-lg hover:bg-gray-50 text-white/40 hover:text-white/70 transition"
                      title="Import CSV"
                    >
                      <Upload className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        if (confirm("Delete this fuel table?")) deleteMutation.mutate(detail.id);
                      }}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-white/40 hover:text-red-400 transition"
                      title="Delete"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setSelectedId(null)}
                      className="p-2 rounded-lg hover:bg-gray-50 text-white/40 hover:text-white/70 transition"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Mini tabs */}
                <div className="flex border-b border-white/5">
                  {(["details", "tiers", "notes"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setDetailTab(tab)}
                      className={cn(
                        "flex-1 py-2.5 text-xs font-medium uppercase tracking-wider transition",
                        detailTab === tab
                          ? "text-[#C9A84C] border-b-2 border-[#C9A84C]"
                          : "text-white/30 hover:text-white/50"
                      )}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                {/* Tab content */}
                <div className="p-5 max-h-[60vh] overflow-y-auto">
                  {detailTab === "details" && (
                    <div className="grid grid-cols-2 gap-4">
                      <DetailField icon={Tag} label="Type" value={detail.type === "DOE_NATIONAL" ? "DOE National" : "Custom"} />
                      <DetailField icon={Activity} label="Status" value={detail.isActive ? "Active" : "Inactive"} accent={detail.isActive} />
                      <DetailField icon={Calendar} label="Effective" value={fmtDate(detail.effectiveDate)} />
                      <DetailField icon={Calendar} label="Expires" value={fmtDate(detail.expiryDate)} />
                      <DetailField icon={Hash} label="Tiers" value={String(detail.tiers?.length ?? 0)} />
                      <DetailField icon={Calendar} label="Created" value={fmtDate(detail.createdAt)} />
                    </div>
                  )}

                  {detailTab === "tiers" && (
                    <div>
                      {!detail.tiers || detail.tiers.length === 0 ? (
                        <p className="text-sm text-white/30 text-center py-8">No tiers defined</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="text-white/40 text-[11px] uppercase tracking-wider">
                                <th className="text-left pb-3 font-medium">Min Price</th>
                                <th className="text-left pb-3 font-medium">Max Price</th>
                                <th className="text-left pb-3 font-medium">Rate</th>
                                <th className="text-left pb-3 font-medium">Type</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-white/5">
                              {detail.tiers.map((tier, i) => (
                                <tr key={i} className="text-white/70">
                                  <td className="py-2.5">${tier.fuelPriceMin.toFixed(2)}</td>
                                  <td className="py-2.5">${tier.fuelPriceMax.toFixed(2)}</td>
                                  <td className="py-2.5 text-[#C9A84C] font-medium">
                                    {fmtRate(tier.surchargeRate, tier.type)}
                                  </td>
                                  <td className="py-2.5">
                                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-white/50 uppercase">
                                      {tier.type}
                                    </span>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )}

                  {detailTab === "notes" && (
                    <div>
                      {detail.notes ? (
                        <p className="text-sm text-white/60 whitespace-pre-wrap">{detail.notes}</p>
                      ) : (
                        <p className="text-sm text-white/30 text-center py-8">No notes</p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── SlideDrawer: Create Table ────────────────────────── */}
      <SlideDrawer
        open={drawerOpen && drawerMode === "create"}
        onClose={closeDrawer}
        title="New Fuel Surcharge Table"
        width="max-w-xl"
      >
        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Table Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Q2 2026 DOE Schedule"
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]"
            />
          </div>

          {/* Type */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value as FuelTableForm["type"] }))}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]"
            >
              <option value="DOE_NATIONAL">DOE National</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Effective Date</label>
              <input
                type="date"
                value={form.effectiveDate}
                onChange={(e) => setForm((f) => ({ ...f, effectiveDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Expiry Date</label>
              <input
                type="date"
                value={form.expiryDate}
                onChange={(e) => setForm((f) => ({ ...f, expiryDate: e.target.value }))}
                className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C]"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Optional notes..."
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] resize-none"
            />
          </div>

          {/* Tiers */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-sm font-medium text-gray-700">Surcharge Tiers</label>
              <button
                onClick={addTier}
                className="text-xs text-[#C9A84C] hover:text-[#d4b85e] font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Add Tier
              </button>
            </div>
            <div className="space-y-3">
              {form.tiers.map((tier, idx) => (
                <div key={idx} className="flex items-center gap-2 p-3 rounded-lg bg-gray-50 border border-gray-100">
                  <div className="flex-1 grid grid-cols-4 gap-2">
                    <div>
                      <label className="text-[10px] text-gray-400 uppercase">Min $</label>
                      <input
                        type="number"
                        step="0.01"
                        value={tier.fuelPriceMin}
                        onChange={(e) => updateTier(idx, "fuelPriceMin", e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#C9A84C]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 uppercase">Max $</label>
                      <input
                        type="number"
                        step="0.01"
                        value={tier.fuelPriceMax}
                        onChange={(e) => updateTier(idx, "fuelPriceMax", e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#C9A84C]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 uppercase">Rate</label>
                      <input
                        type="number"
                        step="0.01"
                        value={tier.surchargeRate}
                        onChange={(e) => updateTier(idx, "surchargeRate", e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#C9A84C]"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-gray-400 uppercase">Type</label>
                      <select
                        value={tier.type}
                        onChange={(e) => updateTier(idx, "type", e.target.value)}
                        className="w-full px-2 py-1.5 rounded border border-gray-200 text-sm focus:outline-none focus:border-[#C9A84C]"
                      >
                        {TIER_TYPES.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  {form.tiers.length > 1 && (
                    <button
                      onClick={() => removeTier(idx)}
                      className="p-1 text-gray-400 hover:text-red-500 transition shrink-0"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button
            onClick={handleCreate}
            disabled={!form.name || !form.effectiveDate || createMutation.isPending}
            className="w-full py-2.5 rounded-lg bg-[#C9A84C] text-black font-medium text-sm hover:bg-[#d4b85e] transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {createMutation.isPending ? "Creating..." : "Create Table"}
          </button>

          {createMutation.isError && (
            <p className="text-sm text-red-500 text-center">
              {(createMutation.error as any)?.response?.data?.message || "Failed to create table"}
            </p>
          )}
        </div>
      </SlideDrawer>

      {/* ── SlideDrawer: CSV Import ──────────────────────────── */}
      <SlideDrawer
        open={drawerOpen && drawerMode === "csv"}
        onClose={closeDrawer}
        title="Import CSV Tiers"
        width="max-w-lg"
      >
        <div className="space-y-5">
          <div className="rounded-lg bg-blue-50 border border-blue-100 p-4">
            <p className="text-sm text-blue-700">
              Paste CSV content with columns: <code className="font-mono bg-blue-100 px-1 rounded">fuelPriceMin, fuelPriceMax, surchargeRate, type</code>
            </p>
            <p className="text-xs text-blue-500 mt-1">
              Type values: PERCENTAGE, PER_MILE, or FLAT
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">CSV Content</label>
            <textarea
              value={csvContent}
              onChange={(e) => setCsvContent(e.target.value)}
              rows={12}
              placeholder={`fuelPriceMin,fuelPriceMax,surchargeRate,type\n3.00,3.25,8.5,PERCENTAGE\n3.26,3.50,10.0,PERCENTAGE\n3.51,3.75,11.5,PERCENTAGE`}
              className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-[#C9A84C]/30 focus:border-[#C9A84C] resize-none"
            />
          </div>

          <button
            onClick={() => {
              if (csvTableId && csvContent.trim()) {
                csvMutation.mutate({ id: csvTableId, csv: csvContent });
              }
            }}
            disabled={!csvContent.trim() || csvMutation.isPending}
            className="w-full py-2.5 rounded-lg bg-[#C9A84C] text-black font-medium text-sm hover:bg-[#d4b85e] transition disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            <FileSpreadsheet className="w-4 h-4" />
            {csvMutation.isPending ? "Importing..." : "Import Tiers"}
          </button>

          {csvMutation.isError && (
            <p className="text-sm text-red-500 text-center">
              {(csvMutation.error as any)?.response?.data?.message || "Import failed"}
            </p>
          )}

          {csvMutation.isSuccess && (
            <p className="text-sm text-emerald-600 text-center">Tiers imported successfully</p>
          )}
        </div>
      </SlideDrawer>
    </div>
  );
}

/* ── Detail Field Component ───────────────────────────────── */

function DetailField({ icon: Icon, label, value, accent }: {
  icon: typeof Fuel; label: string; value: string; accent?: boolean;
}) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-3.5 h-3.5 text-white/30" />
        <span className="text-[10px] text-white/30 uppercase tracking-wider font-medium">{label}</span>
      </div>
      <p className={cn("text-sm font-medium", accent ? "text-emerald-400" : "text-white/80")}>
        {value}
      </p>
    </div>
  );
}
