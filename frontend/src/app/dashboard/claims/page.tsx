"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { useToast } from "@/components/ui/Toast";
import {
  Shield, FileText, DollarSign, Clock, CheckCircle2, AlertTriangle,
  Search, ChevronDown, ChevronUp, Plus, X, Scale, Package, Minus, Timer, Receipt,
} from "lucide-react";

interface Claim {
  id: string;
  loadId: string;
  type: string;
  status: string;
  estimatedValue: number;
  resolutionAmount: number | null;
  resolutionNotes: string | null;
  description: string;
  createdAt: string;
  updatedAt: string;
  load?: { referenceNumber?: string };
  carrier?: { name?: string };
  filedBy?: { firstName: string; lastName: string };
}

interface ClaimsResponse {
  claims: Claim[];
  total: number;
}

const STATUS_COLORS: Record<string, string> = {
  FILED: "bg-blue-500/20 text-blue-400",
  UNDER_REVIEW: "bg-purple-500/20 text-purple-400",
  INVESTIGATING: "bg-yellow-500/20 text-yellow-400",
  RESOLVED: "bg-green-500/20 text-green-400",
  DENIED: "bg-red-500/20 text-red-400",
};

const TYPE_ICONS: Record<string, React.ReactNode> = {
  DAMAGE: <AlertTriangle className="w-4 h-4" />,
  SHORTAGE: <Minus className="w-4 h-4" />,
  LOSS: <Package className="w-4 h-4" />,
  DELAY: <Timer className="w-4 h-4" />,
  OVERCHARGE: <Receipt className="w-4 h-4" />,
};

function fmt(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}

function formatType(t: string) {
  return t.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

export default function ClaimsPage() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuthStore();

  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNewModal, setShowNewModal] = useState(false);
  const [resolveTarget, setResolveTarget] = useState<Claim | null>(null);

  // New claim form
  const [newForm, setNewForm] = useState({ loadId: "", type: "DAMAGE", estimatedValue: "", description: "" });
  // Resolve form
  const [resolveForm, setResolveForm] = useState({ resolutionNotes: "", resolutionAmount: "" });

  const queryParams = new URLSearchParams({ page: String(page), limit: "20" });
  if (statusFilter) queryParams.set("status", statusFilter);
  if (typeFilter) queryParams.set("type", typeFilter);

  const { data, isLoading } = useQuery({
    queryKey: ["claims", statusFilter, typeFilter, page],
    queryFn: () => api.get<ClaimsResponse>(`/claims?${queryParams}`).then(r => r.data),
  });

  const claims = data?.claims || [];
  const total = data?.total || 0;

  const filed = claims.filter(c => c.status === "FILED").length;
  const underReview = claims.filter(c => c.status === "UNDER_REVIEW").length;
  const investigating = claims.filter(c => c.status === "INVESTIGATING").length;
  const resolved = claims.filter(c => c.status === "RESOLVED").length;
  const totalValue = claims.reduce((s, c) => s + c.estimatedValue, 0);

  const filtered = search
    ? claims.filter(c => (c.load?.referenceNumber || c.loadId).toLowerCase().includes(search.toLowerCase()))
    : claims;

  const createMutation = useMutation({
    mutationFn: (body: { loadId: string; type: string; estimatedValue: number; description: string }) =>
      api.post("/claims", body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      toast("Claim filed successfully", "success");
      setShowNewModal(false);
      setNewForm({ loadId: "", type: "DAMAGE", estimatedValue: "", description: "" });
    },
    onError: () => toast("Failed to file claim", "error"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/claims/${id}`, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["claims"] });
      toast("Claim updated", "success");
      setResolveTarget(null);
      setResolveForm({ resolutionNotes: "", resolutionAmount: "" });
    },
    onError: () => toast("Failed to update claim", "error"),
  });

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Claims Management</h1>
          <p className="text-sm text-slate-400 mt-1">Track and resolve freight claims across all shipments</p>
        </div>
        <button onClick={() => setShowNewModal(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90">
          <Plus className="w-4 h-4" /> New Claim
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid sm:grid-cols-3 lg:grid-cols-6 gap-4">
        {[
          { label: "Total Claims", value: total, icon: <FileText className="w-5 h-5" />, color: "text-slate-300" },
          { label: "Filed", value: filed, icon: <Clock className="w-5 h-5" />, color: "text-blue-400" },
          { label: "Under Review", value: underReview, icon: <Scale className="w-5 h-5" />, color: "text-purple-400" },
          { label: "Investigating", value: investigating, icon: <Search className="w-5 h-5" />, color: "text-yellow-400" },
          { label: "Resolved", value: resolved, icon: <CheckCircle2 className="w-5 h-5" />, color: "text-green-400" },
          { label: "Est. Value", value: fmt(totalValue), icon: <DollarSign className="w-5 h-5" />, color: "text-gold" },
        ].map(k => (
          <div key={k.label} className="bg-white/5 border border-white/10 rounded-xl p-4">
            <div className={`${k.color} mb-2`}>{k.icon}</div>
            <p className="text-xs text-slate-500">{k.label}</p>
            <p className="text-lg font-bold text-white">{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-white/5 border border-white/10 text-sm text-white rounded-lg px-3 py-2">
          <option value="">All Statuses</option>
          {["FILED", "UNDER_REVIEW", "INVESTIGATING", "RESOLVED", "DENIED"].map(s => (
            <option key={s} value={s}>{formatType(s)}</option>
          ))}
        </select>
        <select value={typeFilter} onChange={e => { setTypeFilter(e.target.value); setPage(1); }}
          className="bg-white/5 border border-white/10 text-sm text-white rounded-lg px-3 py-2">
          <option value="">All Types</option>
          {["DAMAGE", "SHORTAGE", "LOSS", "DELAY", "OVERCHARGE"].map(t => (
            <option key={t} value={t}>{formatType(t)}</option>
          ))}
        </select>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search load ref#..."
            className="w-full bg-white/5 border border-white/10 text-sm text-white rounded-lg pl-9 pr-3 py-2" />
        </div>
      </div>

      {/* Table */}
      <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-slate-400">
              <th className="text-left p-3">Date Filed</th>
              <th className="text-left p-3">Load Ref#</th>
              <th className="text-left p-3">Type</th>
              <th className="text-left p-3">Carrier</th>
              <th className="text-right p-3">Est. Value</th>
              <th className="text-left p-3">Status</th>
              <th className="text-right p-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={7} className="p-8 text-center text-slate-500">Loading claims...</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="p-8 text-center text-slate-500">No claims found</td></tr>
            ) : filtered.map(c => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02] group">
                <td className="p-3 text-slate-300">{new Date(c.createdAt).toLocaleDateString()}</td>
                <td className="p-3 text-gold font-mono text-xs">{c.load?.referenceNumber || c.loadId.slice(0, 8)}</td>
                <td className="p-3"><span className="flex items-center gap-1.5 text-slate-300">{TYPE_ICONS[c.type]}{formatType(c.type)}</span></td>
                <td className="p-3 text-slate-300">{c.carrier?.name || "—"}</td>
                <td className="p-3 text-right text-white font-medium">{fmt(c.estimatedValue)}</td>
                <td className="p-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[c.status] || "bg-slate-500/20 text-slate-400"}`}>
                    {formatType(c.status)}
                  </span>
                </td>
                <td className="p-3 text-right space-x-2">
                  {(c.status === "FILED" || c.status === "UNDER_REVIEW") && (
                    <button onClick={() => updateMutation.mutate({ id: c.id, body: { status: "INVESTIGATING" } })}
                      className="text-xs px-2 py-1 rounded bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30">Investigate</button>
                  )}
                  {c.status === "INVESTIGATING" && (
                    <button onClick={() => { setResolveTarget(c); setResolveForm({ resolutionNotes: "", resolutionAmount: "" }); }}
                      className="text-xs px-2 py-1 rounded bg-green-500/20 text-green-400 hover:bg-green-500/30">Resolve</button>
                  )}
                  <button onClick={() => setExpanded(expanded === c.id ? null : c.id)}
                    className="text-xs px-2 py-1 rounded bg-white/5 text-slate-400 hover:bg-white/10">
                    {expanded === c.id ? <ChevronUp className="w-3 h-3 inline" /> : <ChevronDown className="w-3 h-3 inline" />}
                  </button>
                </td>
              </tr>
            ))}
            {/* Expanded detail row rendered separately */}
            {filtered.map(c => expanded === c.id && (
              <tr key={`${c.id}-detail`} className="bg-white/[0.02]">
                <td colSpan={7} className="p-4 space-y-2 text-sm">
                  <p className="text-slate-400"><span className="text-slate-500">Description:</span> {c.description}</p>
                  {c.resolutionNotes && <p className="text-slate-400"><span className="text-slate-500">Resolution:</span> {c.resolutionNotes}</p>}
                  {c.resolutionAmount != null && <p className="text-slate-400"><span className="text-slate-500">Resolution Amount:</span> {fmt(c.resolutionAmount)}</p>}
                  {c.filedBy && <p className="text-slate-500">Filed by: {c.filedBy.firstName} {c.filedBy.lastName}</p>}
                  <p className="text-slate-600 text-xs">Updated: {new Date(c.updatedAt).toLocaleString()}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {total > 20 && (
        <div className="flex justify-center gap-2">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}
            className="px-3 py-1.5 text-sm rounded bg-white/5 text-slate-400 hover:bg-white/10 disabled:opacity-40">Prev</button>
          <span className="px-3 py-1.5 text-sm text-slate-500">Page {page}</span>
          <button disabled={page * 20 >= total} onClick={() => setPage(p => p + 1)}
            className="px-3 py-1.5 text-sm rounded bg-white/5 text-slate-400 hover:bg-white/10 disabled:opacity-40">Next</button>
        </div>
      )}

      {/* New Claim Modal */}
      {showNewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1e293b] border border-white/10 rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">File New Claim</h2>
              <button onClick={() => setShowNewModal(false)}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
            </div>
            <input placeholder="Load ID" value={newForm.loadId} onChange={e => setNewForm(p => ({ ...p, loadId: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
            <select value={newForm.type} onChange={e => setNewForm(p => ({ ...p, type: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white">
              {["DAMAGE", "SHORTAGE", "LOSS", "DELAY", "OVERCHARGE"].map(t => <option key={t} value={t}>{formatType(t)}</option>)}
            </select>
            <input type="number" placeholder="Estimated Value ($)" value={newForm.estimatedValue}
              onChange={e => setNewForm(p => ({ ...p, estimatedValue: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
            <textarea placeholder="Describe the claim..." rows={3} value={newForm.description}
              onChange={e => setNewForm(p => ({ ...p, description: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none" />
            <button disabled={!newForm.loadId || !newForm.estimatedValue || createMutation.isPending}
              onClick={() => createMutation.mutate({ loadId: newForm.loadId, type: newForm.type, estimatedValue: Number(newForm.estimatedValue), description: newForm.description })}
              className="w-full py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
              {createMutation.isPending ? "Filing..." : "File Claim"}
            </button>
          </div>
        </div>
      )}

      {/* Resolve Modal */}
      {resolveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className="bg-[#1e293b] border border-white/10 rounded-xl p-6 w-full max-w-md space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Resolve Claim</h2>
              <button onClick={() => setResolveTarget(null)}><X className="w-5 h-5 text-slate-400 hover:text-white" /></button>
            </div>
            <p className="text-sm text-slate-400">Claim for load {resolveTarget.load?.referenceNumber || resolveTarget.loadId.slice(0, 8)} — Est. {fmt(resolveTarget.estimatedValue)}</p>
            <input type="number" placeholder="Resolution Amount ($)" value={resolveForm.resolutionAmount}
              onChange={e => setResolveForm(p => ({ ...p, resolutionAmount: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white" />
            <textarea placeholder="Resolution notes..." rows={3} value={resolveForm.resolutionNotes}
              onChange={e => setResolveForm(p => ({ ...p, resolutionNotes: e.target.value }))}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white resize-none" />
            <button disabled={!resolveForm.resolutionAmount || updateMutation.isPending}
              onClick={() => updateMutation.mutate({ id: resolveTarget.id, body: { status: "RESOLVED", resolutionNotes: resolveForm.resolutionNotes, resolutionAmount: Number(resolveForm.resolutionAmount) } })}
              className="w-full py-2.5 bg-green-600 text-white font-medium rounded-lg text-sm hover:bg-green-500 disabled:opacity-50">
              {updateMutation.isPending ? "Saving..." : "Mark Resolved"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
