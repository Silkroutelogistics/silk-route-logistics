"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { RotateCcw, Search, X, ChevronLeft, ChevronRight, Plus, MessageSquare, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface Dispute {
  id: string;
  disputeNumber: string;
  disputeType: string;
  status: string;
  disputedAmount: number;
  description: string;
  resolutionNotes: string | null;
  createdAt: string;
  resolvedAt: string | null;
  carrierPayment: {
    paymentNumber: string;
    netAmount: number;
    status: string;
    carrier: { id: string; firstName: string; lastName: string; company: string | null };
    load: { referenceNumber: string; originCity: string; originState: string; destCity: string; destState: string };
  };
  filedBy: { id: string; firstName: string; lastName: string };
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-red-500/20 text-red-400",
  UNDER_REVIEW: "bg-yellow-500/20 text-yellow-400",
  RESOLVED: "bg-green-500/20 text-green-400",
  ESCALATED: "bg-purple-500/20 text-purple-400",
  CLOSED: "bg-slate-500/20 text-slate-400",
};

const TYPE_LABELS: Record<string, string> = {
  RATE_DISCREPANCY: "Rate Discrepancy",
  DAMAGE_CLAIM: "Damage Claim",
  SERVICE_FAILURE: "Service Failure",
  BILLING_ERROR: "Billing Error",
  DETENTION: "Detention",
  ACCESSORIAL: "Accessorial",
  OTHER: "Other",
};

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export default function DisputesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Dispute | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [newDispute, setNewDispute] = useState({ loadRef: "", type: "RATE_DISCREPANCY", amount: "", description: "" });
  const [resolutionNotes, setResolutionNotes] = useState("");
  const [investigationNotes, setInvestigationNotes] = useState("");
  const [proposedResolution, setProposedResolution] = useState("");
  const [proposedAmount, setProposedAmount] = useState("");
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  if (statusFilter) qs.set("status", statusFilter);
  qs.set("page", String(page));

  const { data, isLoading } = useQuery({
    queryKey: ["disputes", search, statusFilter, page],
    queryFn: () => api.get<{ disputes: Dispute[]; total: number; totalPages: number }>(`/accounting/disputes?${qs}`).then(r => r.data),
  });

  const createMutation = useMutation({
    mutationFn: (body: { loadReferenceNumber: string; type: string; amount: number; description: string }) =>
      api.post("/accounting/disputes", body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["disputes"] }); setShowCreate(false); },
    onError: () => toast("Operation failed", "error"),
  });

  // Arc 3 Phase 3 — this button was broken, not merely unpolished. It POSTed to
  // /disputes/:id/resolve and the only route is a PUT, so every click 404'd; and
  // it sent { resolution } where the controller reads { resolutionNotes }, so
  // even with the right verb the notes would have been dropped on the floor.
  // Verb and body now match accountingController.resolveDispute. `approved`
  // distinguishes approving the dispute from denying it — the controller reads
  // `approved !== false`, so it must be sent explicitly to deny.
  const resolveMutation = useMutation({
    mutationFn: ({ id, resolutionNotes: notes, approved }: { id: string; resolutionNotes: string; approved: boolean }) =>
      api.put(`/accounting/disputes/${id}/resolve`, { resolutionNotes: notes, approved }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["disputes"] }); setSelected(null); setResolutionNotes(""); },
    onError: (e: any) => toast(e?.response?.data?.error || "Operation failed", "error"),
  });

  // The other two thirds of the dispute workflow. Both controllers have existed
  // since the disputes backend was built and neither had ever been reachable
  // (orphan-endpoint-triage.md, MISSING-UI). Without them a dispute could only
  // jump straight from OPEN to resolved, so the INVESTIGATING state the
  // controller enforces was unreachable from the console.
  const investigateMutation = useMutation({
    mutationFn: ({ id, investigationNotes }: { id: string; investigationNotes: string }) =>
      api.put(`/accounting/disputes/${id}/investigate`, { investigationNotes }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["disputes"] }); setInvestigationNotes(""); },
    onError: (e: any) => toast(e?.response?.data?.error || "Operation failed", "error"),
  });

  const proposeMutation = useMutation({
    mutationFn: ({ id, proposedResolution, proposedAmount }: { id: string; proposedResolution: string; proposedAmount?: number }) =>
      api.put(`/accounting/disputes/${id}/propose`, { proposedResolution, proposedAmount }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["disputes"] }); setProposedResolution(""); setProposedAmount(""); },
    onError: (e: any) => toast(e?.response?.data?.error || "Operation failed", "error"),
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Disputes</h1>
          <p className="text-sm text-slate-400 mt-1">Track and resolve payment disputes</p>
        </div>
        <button
          onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-[#C8963E] text-[#0A2540] rounded-lg text-sm font-medium hover:bg-[#B8862E] transition flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> New Dispute
        </button>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search dispute # or load..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C8963E]/50"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-white/5 border border-white/10 rounded-lg text-sm text-white px-3 py-2 focus:outline-none"
        >
          <option value="">All Statuses</option>
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
        </select>
      </div>

      <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Dispute #</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Load</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Type</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Raised By</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Amount</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Status</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Date</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              [...Array(3)].map((_, i) => <tr key={i}><td colSpan={7} className="px-5 py-3"><div className="h-5 bg-white/5 rounded animate-pulse" /></td></tr>)
            ) : data?.disputes?.length ? (
              data.disputes.map(d => (
                <tr key={d.id} className="hover:bg-[#0F1117] cursor-pointer" onClick={() => setSelected(d)}>
                  <td className="px-5 py-3 text-sm text-white font-medium">{d.disputeNumber}</td>
                  <td className="px-5 py-3 text-sm text-slate-300">{d.carrierPayment?.load?.referenceNumber || "—"}</td>
                  <td className="px-5 py-3 text-sm text-slate-300">{TYPE_LABELS[d.disputeType] || d.disputeType}</td>
                  <td className="px-5 py-3 text-sm text-slate-300">{d.filedBy ? `${d.filedBy.firstName} ${d.filedBy.lastName}` : "—"}</td>
                  <td className="px-5 py-3 text-sm text-white font-medium">{fmt(d.disputedAmount)}</td>
                  <td className="px-5 py-3"><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[d.status]}`}>{d.status.replace("_", " ")}</span></td>
                  <td className="px-5 py-3 text-xs text-slate-400">{new Date(d.createdAt).toLocaleDateString()}</td>
                </tr>
              ))
            ) : (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">No disputes found</td></tr>
            )}
          </tbody>
        </table>

        {data && data.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
            <p className="text-xs text-slate-500">{data.total} total disputes</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs text-slate-400">Page {page} of {data.totalPages}</span>
              <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>

      {/* Create Dispute Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowCreate(false)} />
          <div className="relative bg-[#0F1117] border border-white/10 rounded-2xl w-[480px] p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">New Dispute</h2>
              <button onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Load Reference #</label>
                <input value={newDispute.loadRef} onChange={e => setNewDispute(v => ({ ...v, loadRef: e.target.value }))} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C8963E]/50" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Dispute Type</label>
                <select value={newDispute.type} onChange={e => setNewDispute(v => ({ ...v, type: e.target.value }))} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none">
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Disputed Amount ($)</label>
                <input type="number" value={newDispute.amount} onChange={e => setNewDispute(v => ({ ...v, amount: e.target.value }))} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C8963E]/50" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Description</label>
                <textarea value={newDispute.description} onChange={e => setNewDispute(v => ({ ...v, description: e.target.value }))} rows={3} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C8963E]/50 resize-none" />
              </div>
              <button
                onClick={() => createMutation.mutate({ loadReferenceNumber: newDispute.loadRef, type: newDispute.type, amount: Number(newDispute.amount), description: newDispute.description })}
                disabled={!newDispute.loadRef || !newDispute.amount || !newDispute.description || createMutation.isPending}
                className="w-full py-2.5 bg-[#C8963E] text-[#0A2540] rounded-lg text-sm font-medium hover:bg-[#B8862E] transition disabled:opacity-50"
              >
                Create Dispute
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Dispute Detail Slide-over */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className="relative w-[480px] bg-[#0F1117] border-l border-white/10 overflow-y-auto">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#0F1117] z-10">
              <h2 className="text-lg font-bold text-white">{selected.disputeNumber}</h2>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-xs text-slate-500">Status</span><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[selected.status]}`}>{selected.status.replace("_", " ")}</span></div>
                <div className="flex justify-between"><span className="text-xs text-slate-500">Type</span><span className="text-sm text-white">{TYPE_LABELS[selected.disputeType] || selected.disputeType}</span></div>
                <div className="flex justify-between"><span className="text-xs text-slate-500">Amount</span><span className="text-sm text-[#C8963E] font-bold">{fmt(selected.disputedAmount)}</span></div>
                <div className="flex justify-between"><span className="text-xs text-slate-500">Load</span><span className="text-sm text-white">{selected.carrierPayment?.load?.referenceNumber || "—"}</span></div>
                <div className="flex justify-between"><span className="text-xs text-slate-500">Filed By</span><span className="text-sm text-white">{selected.filedBy ? `${selected.filedBy.firstName} ${selected.filedBy.lastName}` : "—"}</span></div>
              </div>
              <div className="bg-white/5 rounded-xl p-4">
                <h3 className="text-xs text-slate-500 font-medium mb-2">DESCRIPTION</h3>
                <p className="text-sm text-slate-300">{selected.description}</p>
              </div>
              {selected.resolutionNotes && (
                <div className="bg-green-500/5 border border-green-500/10 rounded-xl p-4">
                  <h3 className="text-xs text-green-400 font-medium mb-2">RESOLUTION</h3>
                  <p className="text-sm text-slate-300">{selected.resolutionNotes}</p>
                </div>
              )}
              {!["CLOSED", "APPROVED", "DENIED"].includes(selected.status) ? (
                <div className="space-y-4">
                  {/* Step 1 — investigate. The controller only accepts this from
                      OPEN or INVESTIGATING, so it is hidden once the dispute has
                      moved on rather than offered and then rejected. */}
                  {["OPEN", "INVESTIGATING"].includes(selected.status) && (
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Investigation Notes</label>
                      <textarea
                        value={investigationNotes}
                        onChange={(e) => setInvestigationNotes(e.target.value)}
                        rows={2}
                        placeholder="What you found looking into this..."
                        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none resize-none mb-2 placeholder:text-slate-500"
                      />
                      <button
                        onClick={() => {
                          if (investigationNotes.trim())
                            investigateMutation.mutate({ id: selected.id, investigationNotes: investigationNotes.trim() });
                        }}
                        disabled={!investigationNotes.trim() || investigateMutation.isPending}
                        className="w-full py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-500/30 transition disabled:opacity-50"
                      >
                        {investigateMutation.isPending ? "Saving..." : "Log Investigation"}
                      </button>
                    </div>
                  )}

                  {/* Step 2 — propose. Amount is optional; the controller falls
                      back to it at resolve time when no resolutionAmount is given. */}
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Proposed Resolution</label>
                    <textarea
                      value={proposedResolution}
                      onChange={(e) => setProposedResolution(e.target.value)}
                      rows={2}
                      placeholder="What you are offering to settle this..."
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none resize-none mb-2 placeholder:text-slate-500"
                    />
                    <input
                      type="number"
                      value={proposedAmount}
                      onChange={(e) => setProposedAmount(e.target.value)}
                      placeholder="Proposed amount (optional)"
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none mb-2 placeholder:text-slate-500"
                    />
                    <button
                      onClick={() => {
                        if (!proposedResolution.trim()) return;
                        const amt = proposedAmount.trim() === "" ? undefined : Number(proposedAmount);
                        proposeMutation.mutate({
                          id: selected.id,
                          proposedResolution: proposedResolution.trim(),
                          proposedAmount: Number.isFinite(amt as number) ? (amt as number) : undefined,
                        });
                      }}
                      disabled={!proposedResolution.trim() || proposeMutation.isPending}
                      className="w-full py-2 bg-[#C8963E]/20 text-[#C8963E] rounded-lg text-sm font-medium hover:bg-[#C8963E]/30 transition disabled:opacity-50"
                    >
                      {proposeMutation.isPending ? "Saving..." : "Propose Resolution"}
                    </button>
                  </div>

                  {/* Step 3 — resolve. Approve and deny are separate buttons
                      because the controller reads `approved !== false`: a single
                      button could only ever approve, and denying a dispute would
                      have been unreachable. ADMIN/CEO only server-side. */}
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Resolution Notes</label>
                    <textarea
                      value={resolutionNotes}
                      onChange={(e) => setResolutionNotes(e.target.value)}
                      rows={3}
                      placeholder="Enter resolution notes..."
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none resize-none mb-3 placeholder:text-slate-500"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (resolutionNotes.trim())
                            resolveMutation.mutate({ id: selected.id, resolutionNotes: resolutionNotes.trim(), approved: true });
                        }}
                        disabled={!resolutionNotes.trim() || resolveMutation.isPending}
                        className="flex-1 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm font-medium hover:bg-green-500/30 transition disabled:opacity-50"
                      >
                        {resolveMutation.isPending ? "Resolving..." : "Approve"}
                      </button>
                      <button
                        onClick={() => {
                          if (resolutionNotes.trim())
                            resolveMutation.mutate({ id: selected.id, resolutionNotes: resolutionNotes.trim(), approved: false });
                        }}
                        disabled={!resolutionNotes.trim() || resolveMutation.isPending}
                        className="flex-1 py-2 bg-red-500/20 text-red-400 rounded-lg text-sm font-medium hover:bg-red-500/30 transition disabled:opacity-50"
                      >
                        Deny
                      </button>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
