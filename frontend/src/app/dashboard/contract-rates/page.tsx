"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Plus, Search, X, Edit2, Pause, Trash2,
  DollarSign, Clock, Users, TrendingUp, ArrowRight,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/* ── Types ───────────────────────────────────────────────── */

interface ContractRate {
  id: string;
  customerId: string;
  customerName: string;
  originState: string;
  destState: string;
  equipmentType: string;
  ratePerMile: number | null;
  flatRate: number | null;
  fuelSurchargePercent: number | null;
  effectiveDate: string;
  expiryDate: string;
  status: "ACTIVE" | "DRAFT" | "EXPIRED" | "SUSPENDED";
  volumeCommitment: number | null;
  notes: string | null;
  createdBy: string | null;
}

interface RateForm {
  customerId: string;
  customerSearch: string;
  originState: string;
  destState: string;
  equipmentType: string;
  ratePerMile: string;
  flatRate: string;
  fuelSurchargePercent: string;
  effectiveDate: string;
  expiryDate: string;
  volumeCommitment: string;
  notes: string;
}

const EMPTY_FORM: RateForm = {
  customerId: "", customerSearch: "", originState: "", destState: "",
  equipmentType: "DRY_VAN", ratePerMile: "", flatRate: "",
  fuelSurchargePercent: "", effectiveDate: "", expiryDate: "",
  volumeCommitment: "", notes: "",
};

const EQUIPMENT_TYPES = ["DRY_VAN", "REEFER", "FLATBED", "STEP_DECK", "POWER_ONLY"];
const STATUSES = ["ALL", "ACTIVE", "DRAFT", "EXPIRED", "SUSPENDED"] as const;

type DetailTab = "details" | "history" | "notes";

/* ── Page ────────────────────────────────────────────────── */

export default function ContractRatesPage() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<RateForm>(EMPTY_FORM);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<DetailTab>("details");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");
  const [filterEquipment, setFilterEquipment] = useState<string>("ALL");

  const { data, isLoading } = useQuery({
    queryKey: ["contract-rates"],
    queryFn: () => api.get<{ rates: ContractRate[]; stats: { totalActive: number; expiringIn30: number; totalCustomers: number; avgRatePerMile: number } }>("/contract-rates").then((r) => r.data),
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-search", form.customerSearch],
    queryFn: () => api.get(`/customers?search=${form.customerSearch}&limit=10`).then((r) => r.data),
    enabled: form.customerSearch.length >= 2,
  });

  const saveMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      editId ? api.patch(`/contract-rates/${editId}`, payload) : api.post("/contract-rates", payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-rates"] });
      closeDrawer();
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/contract-rates/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract-rates"] });
      if (selectedId === deleteMutation.variables) setSelectedId(null);
    },
  });

  const suspendMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/contract-rates/${id}`, { status: "SUSPENDED" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contract-rates"] }),
  });

  function closeDrawer() {
    setDrawerOpen(false);
    setEditId(null);
    setForm(EMPTY_FORM);
  }

  function openEdit(rate: ContractRate) {
    setEditId(rate.id);
    setForm({
      customerId: rate.customerId,
      customerSearch: rate.customerName,
      originState: rate.originState,
      destState: rate.destState,
      equipmentType: rate.equipmentType,
      ratePerMile: rate.ratePerMile?.toString() ?? "",
      flatRate: rate.flatRate?.toString() ?? "",
      fuelSurchargePercent: rate.fuelSurchargePercent?.toString() ?? "",
      effectiveDate: rate.effectiveDate?.slice(0, 10) ?? "",
      expiryDate: rate.expiryDate?.slice(0, 10) ?? "",
      volumeCommitment: rate.volumeCommitment?.toString() ?? "",
      notes: rate.notes ?? "",
    });
    setDrawerOpen(true);
  }

  function handleSave() {
    saveMutation.mutate({
      customerId: form.customerId,
      originState: form.originState,
      destState: form.destState,
      equipmentType: form.equipmentType,
      ratePerMile: form.ratePerMile ? parseFloat(form.ratePerMile) : null,
      flatRate: form.flatRate ? parseFloat(form.flatRate) : null,
      fuelSurchargePercent: form.fuelSurchargePercent ? parseFloat(form.fuelSurchargePercent) : null,
      effectiveDate: form.effectiveDate,
      expiryDate: form.expiryDate,
      volumeCommitment: form.volumeCommitment ? parseInt(form.volumeCommitment) : null,
      notes: form.notes || null,
    });
  }

  const rates = useMemo(() => (data?.rates ?? []).filter((r) => {
    if (filterStatus !== "ALL" && r.status !== filterStatus) return false;
    if (filterEquipment !== "ALL" && r.equipmentType !== filterEquipment) return false;
    if (filterCustomer && !r.customerName.toLowerCase().includes(filterCustomer.toLowerCase())) return false;
    return true;
  }), [data?.rates, filterStatus, filterEquipment, filterCustomer]);

  const stats = data?.stats;
  const selectedRate = useMemo(() => rates.find((r) => r.id === selectedId) ?? null, [rates, selectedId]);
  const panelOpen = selectedRate !== null;

  const statusColor: Record<string, string> = {
    ACTIVE: "bg-green-500/20 text-green-400",
    DRAFT: "bg-slate-500/20 text-slate-400",
    EXPIRED: "bg-red-500/20 text-red-400",
    SUSPENDED: "bg-yellow-500/20 text-yellow-400",
  };

  return (
    <div className="p-6 space-y-6 bg-[#0a0e1a] min-h-screen">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileText className="w-7 h-7 text-[#C9A84C]" />
            Contract Rate Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage negotiated rates with shippers</p>
        </div>
        <button
          onClick={() => { setEditId(null); setForm(EMPTY_FORM); setDrawerOpen(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#C9A84C] text-[#0a0e1a] rounded-lg text-sm font-medium hover:bg-[#C9A84C]/90 transition"
        >
          <Plus className="w-4 h-4" /> New Rate
        </button>
      </div>

      {/* KPIs */}
      <div className="grid sm:grid-cols-4 gap-4">
        <KpiCard icon={DollarSign} label="Total Active Rates" value={stats?.totalActive ?? 0} color="green" />
        <KpiCard icon={Clock} label="Expiring in 30 Days" value={stats?.expiringIn30 ?? 0} color="yellow" />
        <KpiCard icon={Users} label="Customers w/ Contracts" value={stats?.totalCustomers ?? 0} color="blue" />
        <KpiCard icon={TrendingUp} label="Avg Rate/Mile" value={`$${(stats?.avgRatePerMile ?? 0).toFixed(2)}`} color="gold" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            value={filterCustomer}
            onChange={(e) => setFilterCustomer(e.target.value)}
            placeholder="Search customer..."
            className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#C9A84C]/50 focus:outline-none w-56"
          />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#C9A84C]/50 focus:outline-none">
          {STATUSES.map((s) => <option key={s} value={s} className="bg-[#0F1117]">{s === "ALL" ? "All Statuses" : s}</option>)}
        </select>
        <select value={filterEquipment} onChange={(e) => setFilterEquipment(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#C9A84C]/50 focus:outline-none">
          <option value="ALL" className="bg-[#0F1117]">All Equipment</option>
          {EQUIPMENT_TYPES.map((e) => <option key={e} value={e} className="bg-[#0F1117]">{e.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {/* Split Layout: List + Detail Panel */}
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="flex gap-0 items-start">
          {/* Left: Table */}
          <div className={cn(
            "transition-all duration-300 ease-in-out overflow-hidden",
            panelOpen ? "w-[45%] min-w-0" : "w-full"
          )}>
            <div className="bg-white/5 rounded-xl border border-white/5 overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-slate-400 border-b border-white/5">
                    <th className="text-left px-4 py-3 font-medium">Customer</th>
                    <th className="text-left px-4 py-3 font-medium">Lane</th>
                    <th className="text-left px-4 py-3 font-medium">Equipment</th>
                    <th className="text-right px-4 py-3 font-medium">Rate/Mile</th>
                    <th className="text-right px-4 py-3 font-medium">Flat Rate</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                    {!panelOpen && <th className="text-left px-4 py-3 font-medium">Effective</th>}
                    {!panelOpen && <th className="text-left px-4 py-3 font-medium">Expiry</th>}
                  </tr>
                </thead>
                <tbody>
                  {rates.map((r) => (
                    <tr
                      key={r.id}
                      onClick={() => { setSelectedId(r.id); setActiveTab("details"); }}
                      className={cn(
                        "border-b border-white/5 cursor-pointer transition-colors",
                        selectedId === r.id
                          ? "bg-[#C9A84C]/10 border-l-2 border-l-[#C9A84C]"
                          : "hover:bg-white/[0.03]"
                      )}
                    >
                      <td className="px-4 py-3 text-white text-xs font-medium truncate max-w-[140px]">{r.customerName}</td>
                      <td className="px-4 py-3 text-slate-300 text-xs font-mono whitespace-nowrap">
                        {r.originState} <ArrowRight className="w-3 h-3 inline text-slate-500" /> {r.destState}
                      </td>
                      <td className="px-4 py-3 text-slate-300 text-xs">{r.equipmentType.replace(/_/g, " ")}</td>
                      <td className="px-4 py-3 text-right text-white text-xs">{r.ratePerMile != null ? `$${r.ratePerMile.toFixed(2)}` : "—"}</td>
                      <td className="px-4 py-3 text-right text-white text-xs">{r.flatRate != null ? `$${r.flatRate.toLocaleString()}` : "—"}</td>
                      <td className="px-4 py-3">
                        <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium", statusColor[r.status] ?? "bg-white/10 text-white")}>{r.status}</span>
                      </td>
                      {!panelOpen && <td className="px-4 py-3 text-slate-400 text-xs">{new Date(r.effectiveDate).toLocaleDateString()}</td>}
                      {!panelOpen && <td className="px-4 py-3 text-slate-400 text-xs">{new Date(r.expiryDate).toLocaleDateString()}</td>}
                    </tr>
                  ))}
                  {rates.length === 0 && (
                    <tr><td colSpan={panelOpen ? 6 : 8} className="px-6 py-12 text-center text-slate-500">No contract rates found</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Right: Detail Panel */}
          {panelOpen && selectedRate && (
            <div className="w-[55%] min-w-0 ml-4 transition-all duration-300 ease-in-out">
              <div className="bg-[#0c1021] rounded-xl border border-white/5 overflow-hidden">
                {/* Panel Header */}
                <div className="px-5 pt-5 pb-4 border-b border-white/5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center gap-2 text-lg font-semibold text-white">
                        <span className="font-mono">{selectedRate.originState}</span>
                        <ArrowRight className="w-4 h-4 text-[#C9A84C]" />
                        <span className="font-mono">{selectedRate.destState}</span>
                      </div>
                      <span className={cn("px-2 py-0.5 rounded text-[10px] font-medium shrink-0", statusColor[selectedRate.status] ?? "bg-white/10 text-white")}>
                        {selectedRate.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => openEdit(selectedRate)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-[#C9A84C] hover:bg-white/5 transition"
                        title="Edit"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => suspendMutation.mutate(selectedRate.id)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-yellow-400 hover:bg-white/5 transition"
                        title="Suspend"
                      >
                        <Pause className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => { if (confirm("Delete this rate?")) deleteMutation.mutate(selectedRate.id); }}
                        className="p-1.5 rounded-md text-slate-400 hover:text-red-400 hover:bg-white/5 transition"
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="w-px h-5 bg-white/10 mx-1" />
                      <button
                        onClick={() => setSelectedId(null)}
                        className="p-1.5 rounded-md text-slate-400 hover:text-white hover:bg-white/5 transition"
                        title="Close"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-slate-400 mt-1 truncate">{selectedRate.customerName}</p>

                  {/* Mini Tabs */}
                  <div className="flex gap-5 mt-4 -mb-4 border-b border-white/5">
                    {(["details", "history", "notes"] as const).map((tab) => (
                      <button
                        key={tab}
                        onClick={() => setActiveTab(tab)}
                        className={cn(
                          "pb-2.5 text-xs font-medium capitalize transition-colors relative",
                          activeTab === tab
                            ? "text-[#C9A84C]"
                            : "text-slate-500 hover:text-slate-300"
                        )}
                      >
                        {tab}
                        {activeTab === tab && (
                          <span className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#C9A84C] rounded-full" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tab Content */}
                <div className="p-5 max-h-[calc(100vh-420px)] overflow-y-auto">
                  {activeTab === "details" && (
                    <DetailsTab rate={selectedRate} />
                  )}
                  {activeTab === "history" && (
                    <HistoryTab rateId={selectedRate.id} />
                  )}
                  {activeTab === "notes" && (
                    <NotesTab notes={selectedRate.notes} />
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Slide Drawer for Create/Edit */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={closeDrawer} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-[#0F1117] border-l border-white/10 z-50 overflow-y-auto">
            <div className="p-6 space-y-5">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">{editId ? "Edit Rate" : "New Contract Rate"}</h2>
                <button onClick={closeDrawer} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
              </div>

              {/* Customer Search */}
              <div>
                <label className="block text-xs text-slate-400 mb-1">Customer</label>
                <input
                  value={form.customerSearch}
                  onChange={(e) => setForm({ ...form, customerSearch: e.target.value, customerId: "" })}
                  placeholder="Search customer..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#C9A84C]/50 focus:outline-none"
                />
                {customers?.customers?.length > 0 && form.customerSearch.length >= 2 && !form.customerId && (
                  <div className="mt-1 bg-[#2A2F42] rounded-lg border border-white/10 max-h-40 overflow-y-auto">
                    {customers.customers.map((c: { id: string; companyName: string }) => (
                      <button key={c.id} onClick={() => setForm({ ...form, customerId: c.id, customerSearch: c.companyName })}
                        className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10 transition">
                        {c.companyName}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Origin State" value={form.originState} onChange={(v) => setForm({ ...form, originState: v.toUpperCase() })} placeholder="TX" maxLength={2} />
                <FormField label="Dest State" value={form.destState} onChange={(v) => setForm({ ...form, destState: v.toUpperCase() })} placeholder="FL" maxLength={2} />
              </div>

              <div>
                <label className="block text-xs text-slate-400 mb-1">Equipment Type</label>
                <select value={form.equipmentType} onChange={(e) => setForm({ ...form, equipmentType: e.target.value })}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#C9A84C]/50 focus:outline-none">
                  {EQUIPMENT_TYPES.map((e) => <option key={e} value={e} className="bg-[#0F1117]">{e.replace(/_/g, " ")}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField label="Rate/Mile ($)" value={form.ratePerMile} onChange={(v) => setForm({ ...form, ratePerMile: v })} placeholder="2.85" />
                <FormField label="Flat Rate ($)" value={form.flatRate} onChange={(v) => setForm({ ...form, flatRate: v })} placeholder="3500" />
              </div>

              <FormField label="Fuel Surcharge (%)" value={form.fuelSurchargePercent} onChange={(v) => setForm({ ...form, fuelSurchargePercent: v })} placeholder="15" />

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Effective Date</label>
                  <input type="date" value={form.effectiveDate} onChange={(e) => setForm({ ...form, effectiveDate: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#C9A84C]/50 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Expiry Date</label>
                  <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-[#C9A84C]/50 focus:outline-none" />
                </div>
              </div>

              <FormField label="Volume Commitment (loads/month)" value={form.volumeCommitment} onChange={(v) => setForm({ ...form, volumeCommitment: v })} placeholder="20" />

              <div>
                <label className="block text-xs text-slate-400 mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#C9A84C]/50 focus:outline-none resize-none" />
              </div>

              <button onClick={handleSave} disabled={saveMutation.isPending}
                className="w-full px-4 py-2.5 bg-[#C9A84C] text-[#0a0e1a] rounded-lg text-sm font-medium hover:bg-[#C9A84C]/90 transition disabled:opacity-50">
                {saveMutation.isPending ? "Saving..." : editId ? "Update Rate" : "Create Rate"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Detail Panel Tab Content ────────────────────────────── */

function DetailsTab({ rate }: { rate: ContractRate }) {
  const daysUntilExpiry = Math.ceil(
    (new Date(rate.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
  );

  return (
    <div className="space-y-4">
      {/* Rate Info Cards */}
      <div className="grid grid-cols-2 gap-3">
        <InfoCard label="Rate per Mile" value={rate.ratePerMile != null ? `$${rate.ratePerMile.toFixed(2)}` : "N/A"} />
        <InfoCard label="Flat Rate" value={rate.flatRate != null ? `$${rate.flatRate.toLocaleString()}` : "N/A"} />
        <InfoCard label="Fuel Surcharge" value={rate.fuelSurchargePercent != null ? `${rate.fuelSurchargePercent}%` : "N/A"} />
        <InfoCard label="Volume Commitment" value={rate.volumeCommitment != null ? `${rate.volumeCommitment} loads/mo` : "N/A"} />
      </div>

      {/* Lane & Equipment */}
      <div className="rounded-lg bg-white/[0.03] border border-white/5 p-4 space-y-3">
        <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Lane Details</h4>
        <div className="grid grid-cols-2 gap-y-3 text-xs">
          <div>
            <span className="text-slate-500">Origin</span>
            <p className="text-white mt-0.5 font-mono">{rate.originState}</p>
          </div>
          <div>
            <span className="text-slate-500">Destination</span>
            <p className="text-white mt-0.5 font-mono">{rate.destState}</p>
          </div>
          <div>
            <span className="text-slate-500">Equipment</span>
            <p className="text-white mt-0.5">{rate.equipmentType.replace(/_/g, " ")}</p>
          </div>
          <div>
            <span className="text-slate-500">Customer</span>
            <p className="text-white mt-0.5 truncate">{rate.customerName}</p>
          </div>
        </div>
      </div>

      {/* Dates */}
      <div className="rounded-lg bg-white/[0.03] border border-white/5 p-4 space-y-3">
        <h4 className="text-[10px] uppercase tracking-wider text-slate-500 font-medium">Contract Period</h4>
        <div className="grid grid-cols-2 gap-y-3 text-xs">
          <div>
            <span className="text-slate-500">Effective Date</span>
            <p className="text-white mt-0.5">{new Date(rate.effectiveDate).toLocaleDateString()}</p>
          </div>
          <div>
            <span className="text-slate-500">Expiry Date</span>
            <p className="text-white mt-0.5">{new Date(rate.expiryDate).toLocaleDateString()}</p>
          </div>
          <div className="col-span-2">
            <span className="text-slate-500">Days Until Expiry</span>
            <p className={cn("mt-0.5 font-medium", daysUntilExpiry <= 30 ? "text-yellow-400" : daysUntilExpiry <= 0 ? "text-red-400" : "text-green-400")}>
              {daysUntilExpiry > 0 ? `${daysUntilExpiry} days` : "Expired"}
            </p>
          </div>
        </div>
      </div>

      {/* Created By */}
      {rate.createdBy && (
        <div className="text-xs text-slate-500 pt-1">
          Created by: <span className="text-slate-400">{rate.createdBy}</span>
        </div>
      )}
    </div>
  );
}

function HistoryTab({ rateId }: { rateId: string }) {
  const { data } = useQuery({
    queryKey: ["rate-history", rateId],
    queryFn: () => api.get(`/audit?entityType=ContractRate&entityId=${rateId}&limit=20`).then((r) => r.data),
    enabled: !!rateId,
  });
  const entries = data?.entries || [];
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <Clock className="w-8 h-8 text-slate-600 mb-3" />
        <p className="text-sm text-slate-400">No changes recorded yet</p>
        <p className="text-xs text-slate-600 mt-1">Rate changes, status transitions, and user actions will appear here.</p>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      {entries.map((e: any) => (
        <div key={e.id} className="flex items-start gap-3 py-2 border-b border-white/5 last:border-0">
          <div className="w-1.5 h-1.5 rounded-full bg-[#C9A84C] mt-2 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-white">{e.action} {e.field ? `— ${e.field}` : ""}</p>
            {e.oldValue && <p className="text-[10px] text-slate-500">From: {e.oldValue} → {e.newValue}</p>}
            <p className="text-[10px] text-slate-600">{new Date(e.performedAt).toLocaleString()} by {e.performedBy?.firstName} {e.performedBy?.lastName}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function NotesTab({ notes }: { notes: string | null }) {
  if (!notes) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <FileText className="w-8 h-8 text-slate-600 mb-3" />
        <p className="text-sm text-slate-400">No notes</p>
        <p className="text-xs text-slate-600 mt-1">Add notes when editing this rate.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 p-4">
      <p className="text-sm text-slate-300 leading-relaxed whitespace-pre-wrap">{notes}</p>
    </div>
  );
}

/* ── Shared Sub-components ───────────────────────────────── */

function InfoCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-white/[0.03] border border-white/5 p-3">
      <p className="text-[10px] uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-sm font-semibold text-white mt-1">{value}</p>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: typeof DollarSign; label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    gold: "text-[#C9A84C] bg-[#C9A84C]/10", green: "text-green-400 bg-green-500/10",
    yellow: "text-yellow-400 bg-yellow-500/10", blue: "text-blue-400 bg-blue-500/10",
  };
  return (
    <div className="bg-white/5 rounded-xl border border-white/5 p-4">
      <div className="flex items-center gap-3">
        <div className={cn("p-2 rounded-lg", colorMap[color] ?? colorMap.gold)}><Icon className="w-5 h-5" /></div>
        <div>
          <p className="text-xs text-slate-400">{label}</p>
          <p className="text-xl font-bold text-white">{value}</p>
        </div>
      </div>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, maxLength }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; maxLength?: number;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} maxLength={maxLength}
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-[#C9A84C]/50 focus:outline-none" />
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-2 border-[#C9A84C]/30 border-t-[#C9A84C] rounded-full animate-spin" />
    </div>
  );
}
