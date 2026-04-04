"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Plus, Search, ChevronDown, ChevronRight, X,
  Edit2, Pause, Trash2, DollarSign, Clock, Users, TrendingUp,
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

/* ── Page ────────────────────────────────────────────────── */

export default function ContractRatesPage() {
  const queryClient = useQueryClient();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<RateForm>(EMPTY_FORM);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["contract-rates"] }),
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

  const rates = (data?.rates ?? []).filter((r) => {
    if (filterStatus !== "ALL" && r.status !== filterStatus) return false;
    if (filterEquipment !== "ALL" && r.equipmentType !== filterEquipment) return false;
    if (filterCustomer && !r.customerName.toLowerCase().includes(filterCustomer.toLowerCase())) return false;
    return true;
  });

  const stats = data?.stats;

  const statusColor: Record<string, string> = {
    ACTIVE: "bg-green-500/20 text-green-400",
    DRAFT: "bg-slate-500/20 text-slate-400",
    EXPIRED: "bg-red-500/20 text-red-400",
    SUSPENDED: "bg-yellow-500/20 text-yellow-400",
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileText className="w-7 h-7 text-gold" />
            Contract Rate Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage negotiated rates with shippers</p>
        </div>
        <button
          onClick={() => { setEditId(null); setForm(EMPTY_FORM); setDrawerOpen(true); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy rounded-lg text-sm font-medium hover:bg-gold/90 transition"
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
            className="bg-white/5 border border-white/10 rounded-lg pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-gold/50 focus:outline-none w-56"
          />
        </div>
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-gold/50 focus:outline-none">
          {STATUSES.map((s) => <option key={s} value={s} className="bg-[#1a1a2e]">{s === "ALL" ? "All Statuses" : s}</option>)}
        </select>
        <select value={filterEquipment} onChange={(e) => setFilterEquipment(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-gold/50 focus:outline-none">
          <option value="ALL" className="bg-[#1a1a2e]">All Equipment</option>
          {EQUIPMENT_TYPES.map((e) => <option key={e} value={e} className="bg-[#1a1a2e]">{e.replace(/_/g, " ")}</option>)}
        </select>
      </div>

      {/* Table */}
      {isLoading ? (
        <LoadingSpinner />
      ) : (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="w-8" />
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-left px-4 py-3 font-medium">Lane</th>
                <th className="text-left px-4 py-3 font-medium">Equipment</th>
                <th className="text-right px-4 py-3 font-medium">Rate/Mile</th>
                <th className="text-right px-4 py-3 font-medium">Flat Rate</th>
                <th className="text-left px-4 py-3 font-medium">Effective</th>
                <th className="text-left px-4 py-3 font-medium">Expiry</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rates.map((r) => (
                <RateRow
                  key={r.id}
                  rate={r}
                  expanded={expandedId === r.id}
                  onToggle={() => setExpandedId(expandedId === r.id ? null : r.id)}
                  statusColor={statusColor}
                  onEdit={() => openEdit(r)}
                  onSuspend={() => suspendMutation.mutate(r.id)}
                  onDelete={() => { if (confirm("Delete this rate?")) deleteMutation.mutate(r.id); }}
                />
              ))}
              {rates.length === 0 && (
                <tr><td colSpan={10} className="px-6 py-12 text-center text-slate-500">No contract rates found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Slide Drawer */}
      {drawerOpen && (
        <>
          <div className="fixed inset-0 bg-black/50 z-40" onClick={closeDrawer} />
          <div className="fixed right-0 top-0 bottom-0 w-full max-w-lg bg-[#1a1a2e] border-l border-white/10 z-50 overflow-y-auto">
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
                  onChange={(e) => setForm({ ...form, customerSearch: e.target.value })}
                  placeholder="Search customer..."
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-gold/50 focus:outline-none"
                />
                {customers?.customers?.length > 0 && form.customerSearch.length >= 2 && !form.customerId && (
                  <div className="mt-1 bg-[#2d2d44] rounded-lg border border-white/10 max-h-40 overflow-y-auto">
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
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-gold/50 focus:outline-none">
                  {EQUIPMENT_TYPES.map((e) => <option key={e} value={e} className="bg-[#1a1a2e]">{e.replace(/_/g, " ")}</option>)}
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
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-gold/50 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Expiry Date</label>
                  <input type="date" value={form.expiryDate} onChange={(e) => setForm({ ...form, expiryDate: e.target.value })}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-gold/50 focus:outline-none" />
                </div>
              </div>

              <FormField label="Volume Commitment (loads/month)" value={form.volumeCommitment} onChange={(v) => setForm({ ...form, volumeCommitment: v })} placeholder="20" />

              <div>
                <label className="block text-xs text-slate-400 mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={3}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-gold/50 focus:outline-none resize-none" />
              </div>

              <button onClick={handleSave} disabled={saveMutation.isPending}
                className="w-full px-4 py-2.5 bg-gold text-navy rounded-lg text-sm font-medium hover:bg-gold/90 transition disabled:opacity-50">
                {saveMutation.isPending ? "Saving..." : editId ? "Update Rate" : "Create Rate"}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */

function RateRow({ rate, expanded, onToggle, statusColor, onEdit, onSuspend, onDelete }: {
  rate: ContractRate; expanded: boolean; onToggle: () => void;
  statusColor: Record<string, string>; onEdit: () => void; onSuspend: () => void; onDelete: () => void;
}) {
  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/[0.02] transition">
        <td className="pl-3">
          <button onClick={onToggle} className="text-slate-500 hover:text-white">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="px-4 py-3 text-white text-xs">{rate.customerName}</td>
        <td className="px-4 py-3 text-slate-300 text-xs font-mono">{rate.originState} → {rate.destState}</td>
        <td className="px-4 py-3 text-slate-300 text-xs">{rate.equipmentType.replace(/_/g, " ")}</td>
        <td className="px-4 py-3 text-right text-white text-xs">{rate.ratePerMile != null ? `$${rate.ratePerMile.toFixed(2)}` : "—"}</td>
        <td className="px-4 py-3 text-right text-white text-xs">{rate.flatRate != null ? `$${rate.flatRate.toLocaleString()}` : "—"}</td>
        <td className="px-4 py-3 text-slate-400 text-xs">{new Date(rate.effectiveDate).toLocaleDateString()}</td>
        <td className="px-4 py-3 text-slate-400 text-xs">{new Date(rate.expiryDate).toLocaleDateString()}</td>
        <td className="px-4 py-3">
          <span className={cn("px-2 py-0.5 rounded text-xs", statusColor[rate.status] ?? "bg-white/10 text-white")}>{rate.status}</span>
        </td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            <button onClick={onEdit} className="text-slate-400 hover:text-gold transition" title="Edit"><Edit2 className="w-3.5 h-3.5" /></button>
            <button onClick={onSuspend} className="text-slate-400 hover:text-yellow-400 transition" title="Suspend"><Pause className="w-3.5 h-3.5" /></button>
            <button onClick={onDelete} className="text-slate-400 hover:text-red-400 transition" title="Delete"><Trash2 className="w-3.5 h-3.5" /></button>
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-white/[0.02]">
          <td colSpan={10} className="px-8 py-4">
            <div className="grid sm:grid-cols-4 gap-4 text-xs">
              <div><span className="text-slate-500">Volume Commitment</span><p className="text-white mt-0.5">{rate.volumeCommitment ?? "—"} loads/month</p></div>
              <div><span className="text-slate-500">Fuel Surcharge</span><p className="text-white mt-0.5">{rate.fuelSurchargePercent != null ? `${rate.fuelSurchargePercent}%` : "—"}</p></div>
              <div><span className="text-slate-500">Created By</span><p className="text-white mt-0.5">{rate.createdBy ?? "—"}</p></div>
              <div><span className="text-slate-500">Notes</span><p className="text-white mt-0.5">{rate.notes ?? "—"}</p></div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: typeof DollarSign; label: string; value: string | number; color: string }) {
  const colorMap: Record<string, string> = {
    gold: "text-gold bg-gold/10", green: "text-green-400 bg-green-500/10",
    yellow: "text-yellow-400 bg-yellow-500/10", blue: "text-blue-400 bg-blue-500/10",
  };
  return (
    <div className="bg-white/5 rounded-xl border border-white/10 p-4">
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
        className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-gold/50 focus:outline-none" />
    </div>
  );
}

function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="w-8 h-8 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />
    </div>
  );
}
