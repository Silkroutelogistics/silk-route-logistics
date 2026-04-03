"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  FileText, Plus, X, ChevronDown, ChevronRight, Send,
  Award, Clock, Users, BarChart3, Trash2,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

/* ── Types ───────────────────────────────────────────────── */

interface RfpLane {
  id?: string;
  originState: string;
  destState: string;
  equipmentType: string;
  estimatedMonthlyVolume: number;
  responseRate?: number | null;
  awarded?: boolean;
}

interface Rfp {
  id: string;
  title: string;
  customerId: string;
  customerName: string;
  lanes: RfpLane[];
  dueDate: string;
  status: "OPEN" | "IN_REVIEW" | "AWARDED" | "EXPIRED";
  respondedCount: number;
  totalLanes: number;
  createdAt: string;
}

interface RfpForm {
  customerId: string;
  customerSearch: string;
  title: string;
  dueDate: string;
  lanes: RfpLane[];
}

const EMPTY_LANE: RfpLane = { originState: "", destState: "", equipmentType: "DRY_VAN", estimatedMonthlyVolume: 0 };
const EMPTY_FORM: RfpForm = { customerId: "", customerSearch: "", title: "", dueDate: "", lanes: [{ ...EMPTY_LANE }] };
const EQUIPMENT_TYPES = ["DRY_VAN", "REEFER", "FLATBED", "STEP_DECK", "POWER_ONLY"];

/* ── Page ────────────────────────────────────────────────── */

export default function RfpPage() {
  const queryClient = useQueryClient();
  const [showNew, setShowNew] = useState(false);
  const [form, setForm] = useState<RfpForm>({ ...EMPTY_FORM });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [respondId, setRespondId] = useState<string | null>(null);
  const [responseLaneRates, setResponseLaneRates] = useState<Record<string, string>>({});
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterStatus, setFilterStatus] = useState<string>("ALL");

  const { data, isLoading } = useQuery({
    queryKey: ["rfps"],
    queryFn: () => api.get<{ rfps: Rfp[]; stats: { openCount: number; pendingResponses: number; awardedThisQuarter: number; totalLaneVolume: number } }>("/rfps").then((r) => r.data),
  });

  const { data: customers } = useQuery({
    queryKey: ["customers-search", form.customerSearch],
    queryFn: () => api.get(`/customers?search=${form.customerSearch}&limit=10`).then((r) => r.data),
    enabled: form.customerSearch.length >= 2,
  });

  const createMutation = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.post("/rfps", payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rfps"] }); setShowNew(false); setForm({ ...EMPTY_FORM }); },
  });

  const respondMutation = useMutation({
    mutationFn: ({ id, rates }: { id: string; rates: Record<string, number> }) =>
      api.post(`/rfps/${id}/respond`, { laneRates: rates }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["rfps"] }); setRespondId(null); setResponseLaneRates({}); },
  });

  const awardMutation = useMutation({
    mutationFn: (id: string) => api.post(`/rfps/${id}/award`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["rfps"] }),
  });

  function addLane() {
    setForm({ ...form, lanes: [...form.lanes, { ...EMPTY_LANE }] });
  }
  function removeLane(idx: number) {
    setForm({ ...form, lanes: form.lanes.filter((_, i) => i !== idx) });
  }
  function updateLane(idx: number, key: keyof RfpLane, value: string | number) {
    const updated = form.lanes.map((lane, i) =>
      i === idx ? { ...lane, [key]: value } : lane
    );
    setForm({ ...form, lanes: updated });
  }

  function handleCreate() {
    createMutation.mutate({
      customerId: form.customerId,
      title: form.title,
      dueDate: form.dueDate,
      lanes: form.lanes.map((l) => ({
        originState: l.originState,
        destState: l.destState,
        equipmentType: l.equipmentType,
        estimatedMonthlyVolume: Number(l.estimatedMonthlyVolume),
      })),
    });
  }

  function handleRespond(rfpId: string) {
    const rates: Record<string, number> = {};
    Object.entries(responseLaneRates).forEach(([key, val]) => {
      if (val) rates[key] = parseFloat(val);
    });
    respondMutation.mutate({ id: rfpId, rates });
  }

  const rfps = (data?.rfps ?? []).filter((r) => {
    if (filterStatus !== "ALL" && r.status !== filterStatus) return false;
    if (filterCustomer && !r.customerName.toLowerCase().includes(filterCustomer.toLowerCase())) return false;
    return true;
  });

  const stats = data?.stats;

  const statusColor: Record<string, string> = {
    OPEN: "bg-blue-500/20 text-blue-400",
    IN_REVIEW: "bg-yellow-500/20 text-yellow-400",
    AWARDED: "bg-green-500/20 text-green-400",
    EXPIRED: "bg-red-500/20 text-red-400",
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-3">
            <FileText className="w-7 h-7 text-gold" />
            RFP &amp; Bid Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage shipper RFPs, responses, and awards</p>
        </div>
        <button
          onClick={() => { setShowNew(true); setForm({ ...EMPTY_FORM }); }}
          className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy rounded-lg text-sm font-medium hover:bg-gold/90 transition"
        >
          <Plus className="w-4 h-4" /> New RFP
        </button>
      </div>

      {/* KPIs */}
      <div className="grid sm:grid-cols-4 gap-4">
        <KpiCard icon={FileText} label="Open RFPs" value={stats?.openCount ?? 0} color="blue" />
        <KpiCard icon={Clock} label="Pending Responses" value={stats?.pendingResponses ?? 0} color="yellow" />
        <KpiCard icon={Award} label="Awarded This Quarter" value={stats?.awardedThisQuarter ?? 0} color="green" />
        <KpiCard icon={BarChart3} label="Total Lane Volume" value={stats?.totalLaneVolume ?? 0} color="gold" />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <input
          value={filterCustomer}
          onChange={(e) => setFilterCustomer(e.target.value)}
          placeholder="Search customer..."
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-gold/50 focus:outline-none w-56"
        />
        <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
          className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-gold/50 focus:outline-none">
          <option value="ALL" className="bg-[#0f172a]">All Statuses</option>
          <option value="OPEN" className="bg-[#0f172a]">Open</option>
          <option value="IN_REVIEW" className="bg-[#0f172a]">In Review</option>
          <option value="AWARDED" className="bg-[#0f172a]">Awarded</option>
          <option value="EXPIRED" className="bg-[#0f172a]">Expired</option>
        </select>
      </div>

      {/* Table */}
      {isLoading ? <LoadingSpinner /> : (
        <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-slate-400 border-b border-white/10">
                <th className="w-8" />
                <th className="text-left px-4 py-3 font-medium">RFP Title</th>
                <th className="text-left px-4 py-3 font-medium">Customer</th>
                <th className="text-center px-4 py-3 font-medium">Lanes</th>
                <th className="text-left px-4 py-3 font-medium">Due Date</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
                <th className="text-center px-4 py-3 font-medium">Responded/Total</th>
                <th className="text-right px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rfps.map((rfp) => (
                <RfpRow
                  key={rfp.id}
                  rfp={rfp}
                  expanded={expandedId === rfp.id}
                  onToggle={() => setExpandedId(expandedId === rfp.id ? null : rfp.id)}
                  statusColor={statusColor}
                  onRespond={() => {
                    setRespondId(rfp.id);
                    const rates: Record<string, string> = {};
                    rfp.lanes.forEach((l) => { if (l.id) rates[l.id] = l.responseRate?.toString() ?? ""; });
                    setResponseLaneRates(rates);
                  }}
                  onAward={() => { if (confirm("Award this RFP? Contract rates will be created.")) awardMutation.mutate(rfp.id); }}
                />
              ))}
              {rfps.length === 0 && (
                <tr><td colSpan={8} className="px-6 py-12 text-center text-slate-500">No RFPs found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* New RFP Modal */}
      {showNew && (
        <Modal onClose={() => setShowNew(false)} title="New RFP">
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-slate-400 mb-1">Customer</label>
              <input value={form.customerSearch} onChange={(e) => setForm({ ...form, customerSearch: e.target.value })}
                placeholder="Search customer..." className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-gold/50 focus:outline-none" />
              {customers?.customers?.length > 0 && form.customerSearch.length >= 2 && !form.customerId && (
                <div className="mt-1 bg-[#1a2d47] rounded-lg border border-white/10 max-h-32 overflow-y-auto">
                  {customers.customers.map((c: { id: string; companyName: string }) => (
                    <button key={c.id} onClick={() => setForm({ ...form, customerId: c.id, customerSearch: c.companyName })}
                      className="w-full text-left px-3 py-2 text-sm text-white hover:bg-white/10">{c.companyName}</button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">RFP Title</label>
              <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })}
                placeholder="Q2 2026 Midwest Lanes" className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-600 focus:border-gold/50 focus:outline-none" />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Due Date</label>
              <input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
                className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:border-gold/50 focus:outline-none" />
            </div>

            {/* Lanes */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-slate-400">Lanes</label>
                <button onClick={addLane} className="text-xs text-gold hover:underline flex items-center gap-1"><Plus className="w-3 h-3" /> Add Lane</button>
              </div>
              <div className="space-y-2">
                {form.lanes.map((lane, idx) => (
                  <div key={idx} className="flex gap-2 items-center bg-white/5 rounded-lg p-2">
                    <input value={lane.originState} onChange={(e) => updateLane(idx, "originState", e.target.value.toUpperCase())}
                      placeholder="TX" maxLength={2} className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white w-14 focus:border-gold/50 focus:outline-none" />
                    <span className="text-slate-500 text-xs">→</span>
                    <input value={lane.destState} onChange={(e) => updateLane(idx, "destState", e.target.value.toUpperCase())}
                      placeholder="FL" maxLength={2} className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white w-14 focus:border-gold/50 focus:outline-none" />
                    <select value={lane.equipmentType} onChange={(e) => updateLane(idx, "equipmentType", e.target.value)}
                      className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white flex-1 focus:border-gold/50 focus:outline-none">
                      {EQUIPMENT_TYPES.map((e) => <option key={e} value={e} className="bg-[#0f172a]">{e.replace(/_/g, " ")}</option>)}
                    </select>
                    <input value={lane.estimatedMonthlyVolume || ""} onChange={(e) => updateLane(idx, "estimatedMonthlyVolume", e.target.value)}
                      placeholder="Vol" className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white w-16 focus:border-gold/50 focus:outline-none" />
                    {form.lanes.length > 1 && (
                      <button onClick={() => removeLane(idx)} className="text-slate-500 hover:text-red-400"><Trash2 className="w-3.5 h-3.5" /></button>
                    )}
                  </div>
                ))}
              </div>
            </div>

            <button onClick={handleCreate} disabled={createMutation.isPending}
              className="w-full px-4 py-2.5 bg-gold text-navy rounded-lg text-sm font-medium hover:bg-gold/90 transition disabled:opacity-50">
              {createMutation.isPending ? "Creating..." : "Create RFP"}
            </button>
          </div>
        </Modal>
      )}

      {/* Respond Modal */}
      {respondId && (
        <Modal onClose={() => { setRespondId(null); setResponseLaneRates({}); }} title="Respond to RFP">
          <div className="space-y-4">
            <p className="text-sm text-slate-400">Enter your rate per mile for each lane:</p>
            {data?.rfps?.find((r) => r.id === respondId)?.lanes.map((lane) => (
              <div key={lane.id} className="flex items-center gap-3 bg-white/5 rounded-lg p-3">
                <span className="text-xs text-white font-mono">{lane.originState} → {lane.destState}</span>
                <span className="text-xs text-slate-500">{lane.equipmentType.replace(/_/g, " ")}</span>
                <div className="flex-1" />
                <div className="flex items-center gap-1">
                  <span className="text-xs text-slate-400">$/mi</span>
                  <input
                    value={responseLaneRates[lane.id ?? ""] ?? ""}
                    onChange={(e) => setResponseLaneRates({ ...responseLaneRates, [lane.id ?? ""]: e.target.value })}
                    placeholder="2.85"
                    className="bg-white/5 border border-white/10 rounded px-2 py-1.5 text-xs text-white w-20 focus:border-gold/50 focus:outline-none"
                  />
                </div>
              </div>
            ))}
            <button onClick={() => handleRespond(respondId)} disabled={respondMutation.isPending}
              className="w-full px-4 py-2.5 bg-gold text-navy rounded-lg text-sm font-medium hover:bg-gold/90 transition disabled:opacity-50">
              {respondMutation.isPending ? "Submitting..." : "Submit Response"}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ── Sub-components ──────────────────────────────────────── */

function RfpRow({ rfp, expanded, onToggle, statusColor, onRespond, onAward }: {
  rfp: Rfp; expanded: boolean; onToggle: () => void;
  statusColor: Record<string, string>; onRespond: () => void; onAward: () => void;
}) {
  return (
    <>
      <tr className="border-b border-white/5 hover:bg-white/[0.02] transition">
        <td className="pl-3">
          <button onClick={onToggle} className="text-slate-500 hover:text-white">
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </button>
        </td>
        <td className="px-4 py-3 text-white text-xs font-medium">{rfp.title}</td>
        <td className="px-4 py-3 text-slate-300 text-xs">{rfp.customerName}</td>
        <td className="px-4 py-3 text-center text-white text-xs">{rfp.totalLanes}</td>
        <td className="px-4 py-3 text-slate-400 text-xs">{new Date(rfp.dueDate).toLocaleDateString()}</td>
        <td className="px-4 py-3">
          <span className={cn("px-2 py-0.5 rounded text-xs", statusColor[rfp.status] ?? "bg-white/10 text-white")}>{rfp.status.replace(/_/g, " ")}</span>
        </td>
        <td className="px-4 py-3 text-center text-xs text-slate-300">{rfp.respondedCount}/{rfp.totalLanes}</td>
        <td className="px-4 py-3 text-right">
          <div className="flex items-center justify-end gap-2">
            {(rfp.status === "OPEN" || rfp.status === "IN_REVIEW") && (
              <button onClick={onRespond} className="flex items-center gap-1 text-xs text-gold hover:underline">
                <Send className="w-3.5 h-3.5" /> Respond
              </button>
            )}
            {rfp.status === "IN_REVIEW" && (
              <button onClick={onAward} className="flex items-center gap-1 text-xs text-green-400 hover:underline">
                <Award className="w-3.5 h-3.5" /> Award
              </button>
            )}
          </div>
        </td>
      </tr>
      {expanded && (
        <tr className="bg-white/[0.02]">
          <td colSpan={8} className="px-8 py-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500">
                  <th className="text-left py-1">Lane</th>
                  <th className="text-left py-1">Equipment</th>
                  <th className="text-right py-1">Monthly Vol</th>
                  <th className="text-right py-1">Response Rate</th>
                  <th className="text-center py-1">Awarded</th>
                </tr>
              </thead>
              <tbody>
                {rfp.lanes.map((lane, idx) => (
                  <tr key={idx} className="border-t border-white/5">
                    <td className="py-2 text-white font-mono">{lane.originState} → {lane.destState}</td>
                    <td className="py-2 text-slate-300">{lane.equipmentType.replace(/_/g, " ")}</td>
                    <td className="py-2 text-right text-slate-300">{lane.estimatedMonthlyVolume}</td>
                    <td className="py-2 text-right text-white">{lane.responseRate != null ? `$${lane.responseRate.toFixed(2)}/mi` : "—"}</td>
                    <td className="py-2 text-center">{lane.awarded ? <span className="text-green-400">Yes</span> : <span className="text-slate-500">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: typeof FileText; label: string; value: string | number; color: string }) {
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

function Modal({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-[#0f172a] rounded-xl border border-white/10 w-full max-w-xl max-h-[85vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        {children}
      </div>
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
