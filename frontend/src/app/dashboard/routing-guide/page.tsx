"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Route, Plus, Search, X, Edit2, Trash2, ChevronRight, MapPin,
  Truck, DollarSign, Clock, Users, BarChart3, Hash, Shield,
  ArrowRight, GripVertical, Phone, Star, CheckCircle2, XCircle,
  ToggleLeft, ToggleRight, Calendar, Info, FileText, Layers,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { SlideDrawer } from "@/components/ui/SlideDrawer";

/* ── Types ───────────────────────────────────────────────── */

interface RoutingGuideEntry {
  id: string;
  rank: number;
  carrierId: string;
  targetRate: number | null;
  rateType: string;
  fuelSurcharge: number;
  transitDays: number | null;
  acceptanceRate: number | null;
  onTimePct: number | null;
  totalLoads: number;
  lastUsedAt: string | null;
  isActive: boolean;
  notes: string | null;
  carrier: {
    id?: string;
    companyName: string | null;
    mcNumber: string | null;
    dotNumber?: string | null;
    tier: string;
    contactName?: string | null;
    contactPhone?: string | null;
    contactEmail?: string | null;
    equipmentTypes?: string[];
    operatingRegions?: string[];
  };
}

interface RoutingGuide {
  id: string;
  name: string;
  originState: string;
  originCity: string | null;
  destState: string;
  destCity: string | null;
  equipmentType: string;
  mode: string;
  isActive: boolean;
  effectiveDate: string;
  expirationDate: string | null;
  notes: string | null;
  customerId: string | null;
  customer: { id: string; name: string } | null;
  createdBy: { firstName: string; lastName: string } | null;
  entries: RoutingGuideEntry[];
  createdAt: string;
  updatedAt: string;
}

interface GuideForm {
  name: string;
  originState: string;
  originCity: string;
  destState: string;
  destCity: string;
  equipmentType: string;
  mode: string;
  customerId: string;
  effectiveDate: string;
  expirationDate: string;
  notes: string;
}

const EMPTY_FORM: GuideForm = {
  name: "", originState: "", originCity: "", destState: "", destCity: "",
  equipmentType: "DRY_VAN", mode: "FTL", customerId: "",
  effectiveDate: new Date().toISOString().split("T")[0], expirationDate: "", notes: "",
};

const EQUIPMENT_TYPES = ["DRY_VAN", "REEFER", "FLATBED", "STEP_DECK", "POWER_ONLY", "CONESTOGA", "LOWBOY"];
const MODES = ["FTL", "LTL", "INTERMODAL"];
const US_STATES = ["AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD","MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC","SD","TN","TX","UT","VT","VA","WA","WV","WI","WY"];

const TIER_COLORS: Record<string, string> = {
  SILVER: "bg-gray-400/10 text-gray-300 border-gray-400/20",
  GOLD: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20",
};

type PanelTab = "details" | "carriers" | "performance" | "history" | "notes";

const PANEL_TABS: { key: PanelTab; icon: typeof Info; label: string }[] = [
  { key: "details", icon: Info, label: "Details" },
  { key: "carriers", icon: Truck, label: "Carriers" },
  { key: "performance", icon: BarChart3, label: "Performance" },
  { key: "history", icon: Clock, label: "History" },
  { key: "notes", icon: FileText, label: "Notes" },
];

/* ── Page ────────────────────────────────────────────────── */

export default function RoutingGuidePage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterEquipment, setFilterEquipment] = useState("ALL");
  const [filterActive, setFilterActive] = useState<string>("true");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<PanelTab>("details");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<GuideForm>(EMPTY_FORM);

  // ── Queries ──────────────────────────────────────────────
  const { data, isLoading } = useQuery({
    queryKey: ["routing-guides", search, filterEquipment, filterActive],
    queryFn: () => api.get("/routing-guides", {
      params: {
        search: search || undefined,
        equipmentType: filterEquipment !== "ALL" ? filterEquipment : undefined,
        isActive: filterActive !== "ALL" ? filterActive : undefined,
        limit: 50,
      },
    }).then((r) => r.data),
  });

  const { data: stats } = useQuery({
    queryKey: ["routing-guides-stats"],
    queryFn: () => api.get("/routing-guides/stats").then((r) => r.data),
  });

  const { data: selectedGuide } = useQuery({
    queryKey: ["routing-guide", selectedId],
    queryFn: () => api.get(`/routing-guides/${selectedId}`).then((r) => r.data),
    enabled: !!selectedId,
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-list"],
    queryFn: () => api.get("/customers", { params: { limit: 200 } }).then((r) => r.data?.customers || r.data?.items || []),
  });

  const { data: carriers } = useQuery({
    queryKey: ["carriers-for-routing"],
    queryFn: () => api.get("/carriers", { params: { limit: 200, status: "APPROVED" } }).then((r) => r.data?.carriers || r.data?.items || r.data || []),
  });

  // ── Mutations ────────────────────────────────────────────
  const saveMut = useMutation({
    mutationFn: (d: any) => editingId
      ? api.patch(`/routing-guides/${editingId}`, d).then((r) => r.data)
      : api.post("/routing-guides", d).then((r) => r.data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routing-guides"] });
      queryClient.invalidateQueries({ queryKey: ["routing-guides-stats"] });
      setDrawerOpen(false);
      setEditingId(null);
      setForm(EMPTY_FORM);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/routing-guides/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routing-guides"] });
      queryClient.invalidateQueries({ queryKey: ["routing-guides-stats"] });
      setSelectedId(null);
    },
  });

  const toggleMut = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/routing-guides/${id}`, { isActive }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["routing-guides"] });
      queryClient.invalidateQueries({ queryKey: ["routing-guide"] });
    },
  });

  // ── Handlers ─────────────────────────────────────────────
  const openCreate = () => { setForm(EMPTY_FORM); setEditingId(null); setDrawerOpen(true); };
  const openEdit = (g: RoutingGuide) => {
    setForm({
      name: g.name, originState: g.originState, originCity: g.originCity || "",
      destState: g.destState, destCity: g.destCity || "", equipmentType: g.equipmentType,
      mode: g.mode, customerId: g.customerId || "",
      effectiveDate: g.effectiveDate?.split("T")[0] || "",
      expirationDate: g.expirationDate?.split("T")[0] || "", notes: g.notes || "",
    });
    setEditingId(g.id);
    setDrawerOpen(true);
  };

  const handleSave = () => {
    if (!form.name || !form.originState || !form.destState) return;
    saveMut.mutate({ ...form, customerId: form.customerId || undefined, expirationDate: form.expirationDate || undefined });
  };

  const guides: RoutingGuide[] = data?.items || [];
  const selected = selectedGuide as RoutingGuide | undefined;

  // ── Render ───────────────────────────────────────────────
  return (
    <div className="flex h-[calc(100vh-64px)] ">
      {/* ── Left: List ──────────────────────────────────── */}
      <div className={cn("flex flex-col border-r border-white/5 transition-all duration-300", selectedId ? "w-[45%]" : "w-full")}>
        {/* Header */}
        <div className="p-6 border-b border-white/5">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-xl font-semibold text-white flex items-center gap-2">
                <Route className="w-5 h-5 text-[#C5A572]" /> Routing Guide
              </h1>
              <p className="text-sm text-gray-400 mt-1">Manage carrier priority lists per lane for automated tendering</p>
            </div>
            <button onClick={openCreate} className="flex items-center gap-2 px-4 py-2.5 bg-[#C5A572] text-[#0F1117] rounded-lg font-medium text-sm hover:bg-[#d4b65c] transition">
              <Plus className="w-4 h-4" /> New Guide
            </button>
          </div>

          {/* Stats */}
          {stats && (
            <div className="grid grid-cols-4 gap-3 mb-5">
              {[
                { label: "Total Guides", value: stats.total, icon: Layers },
                { label: "Active", value: stats.active, icon: CheckCircle2 },
                { label: "With Carriers", value: stats.withEntries, icon: Users },
                { label: "Coverage", value: `${stats.coverageRate}%`, icon: BarChart3 },
              ].map((s) => (
                <div key={s.label} className="bg-white/[0.03] border border-white/5 rounded-lg p-3">
                  <div className="flex items-center gap-2 text-gray-400 text-xs mb-1">
                    <s.icon className="w-3.5 h-3.5" /> {s.label}
                  </div>
                  <p className="text-lg font-semibold text-white">{s.value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
              <input
                value={search} onChange={(e) => setSearch(e.target.value)}
                placeholder="Search lanes, cities..."
                className="w-full pl-10 pr-4 py-2.5 bg-white/[0.03] border border-gray-200 rounded-lg text-sm text-white placeholder-gray-500 focus:border-blue-400 focus:outline-none transition"
              />
            </div>
            <select value={filterEquipment} onChange={(e) => setFilterEquipment(e.target.value)} className="bg-white/[0.03] border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:border-blue-400 focus:outline-none">
              <option value="ALL">All Equipment</option>
              {EQUIPMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
            </select>
            <select value={filterActive} onChange={(e) => setFilterActive(e.target.value)} className="bg-white/[0.03] border border-gray-200 rounded-lg px-3 py-2.5 text-sm text-gray-300 focus:border-blue-400 focus:outline-none">
              <option value="ALL">All Status</option>
              <option value="true">Active</option>
              <option value="false">Inactive</option>
            </select>
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-gray-500 text-sm">Loading...</div>
          ) : guides.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-gray-500 text-sm">
              <Route className="w-8 h-8 mb-2 opacity-30" />
              <p>No routing guides found</p>
              <button onClick={openCreate} className="mt-2 text-[#C5A572] text-xs hover:underline">Create your first guide</button>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {guides.map((g) => (
                <div
                  key={g.id}
                  onClick={() => { setSelectedId(g.id); setPanelTab("details"); }}
                  className={cn(
                    "flex items-center gap-4 px-6 py-4 cursor-pointer transition-all hover:bg-white/[0.02]",
                    selectedId === g.id && "bg-white/[0.04] border-l-2 border-[#C5A572]"
                  )}
                >
                  {/* Lane */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-medium text-white truncate">{g.name}</span>
                      {!g.isActive && <span className="text-[10px] px-1.5 py-0.5 bg-red-500/10 text-red-400 rounded">Inactive</span>}
                    </div>
                    <div className="flex items-center gap-1.5 text-xs text-gray-400">
                      <MapPin className="w-3 h-3" />
                      <span>{g.originCity || g.originState}</span>
                      <ArrowRight className="w-3 h-3 text-slate-400" />
                      <span>{g.destCity || g.destState}</span>
                      <span className="mx-1 text-slate-400">·</span>
                      <Truck className="w-3 h-3" />
                      <span>{g.equipmentType.replace("_", " ")}</span>
                    </div>
                  </div>

                  {/* Carrier count */}
                  <div className="text-center">
                    <p className="text-sm font-medium text-white">{g.entries?.length || 0}</p>
                    <p className="text-[10px] text-gray-500">Carriers</p>
                  </div>

                  {/* Mode */}
                  <span className="text-[10px] px-2 py-1 bg-gray-100 text-gray-400 rounded">{g.mode}</span>

                  {/* Customer */}
                  {g.customer && (
                    <span className="text-xs text-gray-400 truncate max-w-[100px]">{g.customer.name}</span>
                  )}

                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Right: Detail Panel (Cerry-style) ──────────── */}
      {selectedId && selected && (
        <div className="flex-1 flex flex-col bg-white overflow-hidden">
          {/* Panel Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
            <div>
              <h2 className="text-base font-semibold text-[#0A2540]">{selected.name}</h2>
              <div className="flex items-center gap-2 text-xs text-gray-700 mt-0.5">
                <MapPin className="w-3 h-3" />
                {selected.originCity ? `${selected.originCity}, ${selected.originState}` : selected.originState}
                <ArrowRight className="w-3 h-3 text-gray-600" />
                {selected.destCity ? `${selected.destCity}, ${selected.destState}` : selected.destState}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toggleMut.mutate({ id: selected.id, isActive: !selected.isActive })} className="p-1.5 rounded-lg hover:bg-gray-50 transition" title={selected.isActive ? "Deactivate" : "Activate"}>
                {selected.isActive ? <ToggleRight className="w-5 h-5 text-green-700" /> : <ToggleLeft className="w-5 h-5 text-gray-500" />}
              </button>
              <button onClick={() => openEdit(selected)} className="p-1.5 rounded-lg hover:bg-gray-50 transition"><Edit2 className="w-4 h-4 text-gray-700" /></button>
              <button onClick={() => { if (confirm("Delete this routing guide?")) deleteMut.mutate(selected.id); }} className="p-1.5 rounded-lg hover:bg-gray-50 transition"><Trash2 className="w-4 h-4 text-gray-700" /></button>
              <button onClick={() => setSelectedId(null)} className="p-1.5 rounded-lg hover:bg-gray-50 transition"><X className="w-4 h-4 text-gray-700" /></button>
            </div>
          </div>

          {/* Mini Tabs */}
          <div className="flex border-b border-white/5">
            {PANEL_TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setPanelTab(t.key)}
                className={cn(
                  "flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-all border-b-2",
                  panelTab === t.key
                    ? "border-[#C5A572] text-[#C5A572]"
                    : "border-transparent text-gray-500 hover:text-gray-300"
                )}
              >
                <t.icon className="w-3.5 h-3.5" /> {t.label}
              </button>
            ))}
          </div>

          {/* Panel Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {panelTab === "details" && (
              <div className="space-y-6">
                {/* Meta grid */}
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: "Equipment", value: selected.equipmentType.replace("_", " "), icon: Truck },
                    { label: "Mode", value: selected.mode, icon: Layers },
                    { label: "Customer", value: selected.customer?.name || "All Customers", icon: Users },
                    { label: "Carriers", value: `${selected.entries?.length || 0} ranked`, icon: Hash },
                    { label: "Effective", value: selected.effectiveDate ? new Date(selected.effectiveDate).toLocaleDateString() : "—", icon: Calendar },
                    { label: "Expires", value: selected.expirationDate ? new Date(selected.expirationDate).toLocaleDateString() : "No expiry", icon: Clock },
                  ].map((item) => (
                    <div key={item.label} className="bg-white/[0.02] border border-white/5 rounded-lg p-3">
                      <div className="flex items-center gap-1.5 text-gray-500 text-[10px] uppercase tracking-wider mb-1">
                        <item.icon className="w-3 h-3" /> {item.label}
                      </div>
                      <p className="text-sm text-[#0A2540]">{item.value}</p>
                    </div>
                  ))}
                </div>

                {selected.notes && (
                  <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                    <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Notes</p>
                    <p className="text-sm text-gray-700">{selected.notes}</p>
                  </div>
                )}
              </div>
            )}

            {panelTab === "carriers" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm text-gray-700">{selected.entries?.length || 0} carriers in priority order</p>
                </div>
                {(selected.entries || []).map((entry, i) => (
                  <div key={entry.id} className={cn("bg-white/[0.02] border rounded-lg p-4 transition", entry.isActive ? "border-white/5" : "border-red-500/10 opacity-50")}>
                    <div className="flex items-center gap-3">
                      {/* Rank badge */}
                      <div className={cn(
                        "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0",
                        i === 0 ? "bg-[#C5A572]/20 text-[#C5A572]" : i === 1 ? "bg-gray-400/20 text-gray-300" : "bg-gray-100 text-gray-400"
                      )}>
                        {entry.rank}
                      </div>

                      {/* Carrier info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-[#0A2540]">{entry.carrier.companyName || "Unknown"}</span>
                          <span className={cn("text-[10px] px-1.5 py-0.5 rounded border", TIER_COLORS[entry.carrier.tier] || "bg-gray-100 text-gray-400 border-gray-200")}>{entry.carrier.tier}</span>
                        </div>
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                          {entry.carrier.mcNumber && <span>MC# {entry.carrier.mcNumber}</span>}
                          {entry.carrier.contactPhone && (
                            <span className="flex items-center gap-1"><Phone className="w-3 h-3" /> {entry.carrier.contactPhone}</span>
                          )}
                        </div>
                      </div>

                      {/* Rate */}
                      {entry.targetRate && (
                        <div className="text-right">
                          <p className="text-sm font-medium text-[#0A2540]">${entry.targetRate.toLocaleString()}</p>
                          <p className="text-[10px] text-gray-500">{entry.rateType === "PER_MILE" ? "/mi" : "flat"}</p>
                        </div>
                      )}
                    </div>

                    {/* Performance row */}
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-white/5">
                      {[
                        { label: "Accept Rate", value: entry.acceptanceRate ? `${entry.acceptanceRate}%` : "—" },
                        { label: "On-Time", value: entry.onTimePct ? `${entry.onTimePct}%` : "—" },
                        { label: "Total Loads", value: entry.totalLoads.toString() },
                        { label: "Transit", value: entry.transitDays ? `${entry.transitDays}d` : "—" },
                        { label: "Last Used", value: entry.lastUsedAt ? new Date(entry.lastUsedAt).toLocaleDateString() : "Never" },
                      ].map((m) => (
                        <div key={m.label} className="text-center">
                          <p className="text-[10px] text-gray-500">{m.label}</p>
                          <p className="text-xs text-gray-700">{m.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}

                {(!selected.entries || selected.entries.length === 0) && (
                  <div className="text-center py-8 text-gray-500 text-sm">
                    <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    No carriers assigned yet
                  </div>
                )}
              </div>
            )}

            {panelTab === "performance" && (
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { label: "Avg Accept Rate", value: selected.entries?.length ? `${Math.round(selected.entries.reduce((s, e) => s + (e.acceptanceRate || 0), 0) / selected.entries.length)}%` : "—" },
                    { label: "Avg On-Time", value: selected.entries?.length ? `${Math.round(selected.entries.reduce((s, e) => s + (e.onTimePct || 0), 0) / selected.entries.length)}%` : "—" },
                    { label: "Total Loads", value: selected.entries?.reduce((s, e) => s + e.totalLoads, 0).toString() || "0" },
                  ].map((m) => (
                    <div key={m.label} className="bg-white/[0.02] border border-white/5 rounded-lg p-4 text-center">
                      <p className="text-2xl font-bold text-[#0A2540]">{m.value}</p>
                      <p className="text-xs text-gray-500 mt-1">{m.label}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  <p className="text-xs text-gray-500 mb-3">Carrier Ranking Effectiveness</p>
                  <p className="text-sm text-gray-700">Performance metrics will auto-populate as loads flow through this routing guide and carriers accept/deliver shipments.</p>
                </div>
              </div>
            )}

            {panelTab === "history" && (
              <div className="space-y-3">
                <div className="flex items-start gap-3 py-2 border-b border-white/5">
                  <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-2 shrink-0" />
                  <div>
                    <p className="text-xs text-[#0A2540]">Created</p>
                    <p className="text-[10px] text-gray-500">
                      {new Date(selected.createdAt).toLocaleString()} by {selected.createdBy?.firstName} {selected.createdBy?.lastName}
                    </p>
                  </div>
                </div>
                {selected.updatedAt !== selected.createdAt && (
                  <div className="flex items-start gap-3 py-2 border-b border-white/5">
                    <div className="w-1.5 h-1.5 rounded-full bg-[#C5A572] mt-2 shrink-0" />
                    <div>
                      <p className="text-xs text-[#0A2540]">Last Updated</p>
                      <p className="text-[10px] text-gray-500">{new Date(selected.updatedAt).toLocaleString()}</p>
                    </div>
                  </div>
                )}
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-3 mt-4">
                  <p className="text-[10px] text-gray-500">Carriers: {selected.entries?.length || 0} ranked</p>
                  <p className="text-[10px] text-gray-500">Status: {selected.isActive ? "Active" : "Inactive"}</p>
                  <p className="text-[10px] text-gray-500">Effective: {new Date(selected.effectiveDate).toLocaleDateString()}</p>
                </div>
              </div>
            )}

            {panelTab === "notes" && (
              <div className="space-y-4">
                <div className="bg-white/[0.02] border border-white/5 rounded-lg p-4">
                  <p className="text-sm text-gray-700">{selected.notes || "No notes added"}</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── SlideDrawer: Create/Edit Guide ────────────── */}
      <SlideDrawer open={drawerOpen} onClose={() => { setDrawerOpen(false); setEditingId(null); }} title={editingId ? "Edit Routing Guide" : "New Routing Guide"}>
        <div className="space-y-5">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Guide Name</label>
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Dallas → LA Dry Van" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none" />
          </div>

          {/* Origin / Dest */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Origin State</label>
              <select value={form.originState} onChange={(e) => setForm({ ...form, originState: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none">
                <option value="">Select...</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Origin City</label>
              <input value={form.originCity} onChange={(e) => setForm({ ...form, originCity: e.target.value })} placeholder="Optional" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Dest State</label>
              <select value={form.destState} onChange={(e) => setForm({ ...form, destState: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none">
                <option value="">Select...</option>
                {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Dest City</label>
              <input value={form.destCity} onChange={(e) => setForm({ ...form, destCity: e.target.value })} placeholder="Optional" className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none" />
            </div>
          </div>

          {/* Equipment / Mode */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Equipment Type</label>
              <select value={form.equipmentType} onChange={(e) => setForm({ ...form, equipmentType: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none">
                {EQUIPMENT_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Mode</label>
              <select value={form.mode} onChange={(e) => setForm({ ...form, mode: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none">
                {MODES.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          {/* Customer */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Customer (optional — leave empty for all)</label>
            <select value={form.customerId} onChange={(e) => setForm({ ...form, customerId: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none">
              <option value="">All Customers</option>
              {(customers || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Effective Date</label>
              <input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-400 mb-1.5">Expiration Date</label>
              <input type="date" value={form.expirationDate} onChange={(e) => setForm({ ...form, expirationDate: e.target.value })} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-gray-400 mb-1.5">Notes</label>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3} className="w-full px-3 py-2.5 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:border-blue-400 focus:outline-none resize-none" />
          </div>

          {/* Save */}
          <div className="flex gap-3 pt-2">
            <button onClick={() => { setDrawerOpen(false); setEditingId(null); }} className="flex-1 px-4 py-2.5 border border-gray-200 text-slate-400 rounded-lg text-sm hover:bg-gray-50 transition">Cancel</button>
            <button onClick={handleSave} disabled={saveMut.isPending || !form.name || !form.originState || !form.destState} className="flex-1 px-4 py-2.5 bg-[#C5A572] text-[#0F1117] rounded-lg font-medium text-sm hover:bg-[#d4b65c] transition disabled:opacity-50">
              {saveMut.isPending ? "Saving..." : editingId ? "Update" : "Create"}
            </button>
          </div>
        </div>
      </SlideDrawer>
    </div>
  );
}
