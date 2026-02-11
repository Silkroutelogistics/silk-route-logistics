"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CreateSettlementModal } from "@/components/accounting/CreateSettlementModal";
import { cn } from "@/lib/utils";
import {
  DollarSign, CheckCircle2, Clock, FileText,
  ChevronDown, ChevronUp, Download, Plus, Truck,
} from "lucide-react";

interface CarrierPayInSettlement {
  id: string;
  amount: number;
  quickPayDiscount: number | null;
  netAmount: number;
  status: string;
  load?: { referenceNumber: string; originCity: string; originState: string; destCity: string; destState: string; pickupDate: string | null; deliveryDate: string | null };
}

interface Settlement {
  id: string;
  settlementNumber: string;
  grossPay: number;
  deductions: number;
  netSettlement: number;
  status: string;
  period: string;
  periodStart: string;
  periodEnd: string;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  carrier?: { id: string; firstName: string; lastName: string; company: string | null };
  carrierPays?: CarrierPayInSettlement[];
  _count?: { carrierPays: number };
}

const statusColors: Record<string, string> = {
  DRAFT: "bg-slate-500/20 text-slate-400",
  FINALIZED: "bg-blue-500/20 text-blue-400",
  PAID: "bg-green-500/20 text-green-400",
};

export default function SettlementsPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Settlement | null>(null);

  const { data: settlements, isLoading } = useQuery({
    queryKey: ["settlements", statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      params.set("limit", "100");
      return api.get<{ settlements: Settlement[]; total: number }>(`/settlements?${params}`).then((r) => r.data);
    },
  });

  const finalize = useMutation({
    mutationFn: (id: string) => api.patch(`/settlements/${id}/finalize`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["settlements"] }); },
  });

  const markPaid = useMutation({
    mutationFn: (id: string) => api.patch(`/settlements/${id}/pay`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["settlements"] }); },
  });

  const loadDetail = async (id: string) => {
    if (detail?.id === id) { setDetail(null); return; }
    const { data } = await api.get<Settlement>(`/settlements/${id}`);
    setDetail(data);
  };

  const downloadPdf = async (settlementId: string, settlementNumber: string) => {
    const res = await api.get(`/pdf/settlement/${settlementId}`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${settlementNumber}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const list = settlements?.settlements || [];

  const totalGross = list.reduce((s, stl) => s + stl.grossPay, 0);
  const totalPaid = list.filter((s) => s.status === "PAID").reduce((s, stl) => s + stl.netSettlement, 0);
  const totalPending = list.filter((s) => s.status !== "PAID").reduce((s, stl) => s + stl.netSettlement, 0);
  const avgSettlement = list.length > 0 ? totalGross / list.length : 0;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Carrier Settlements</h1>
          <p className="text-slate-400 text-sm mt-1">{settlements?.total || 0} total settlements</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold/90 transition text-sm flex items-center gap-1.5">
          <Plus className="w-4 h-4" /> New Settlement
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-gold" /></div>
            <div><p className="text-2xl font-bold text-white">${(totalGross / 1000).toFixed(1)}k</p><p className="text-xs text-slate-400">Total Gross</p></div>
          </div>
        </div>
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-green-400" /></div>
            <div><p className="text-2xl font-bold text-white">${(totalPaid / 1000).toFixed(1)}k</p><p className="text-xs text-slate-400">Total Paid</p></div>
          </div>
        </div>
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center"><Clock className="w-5 h-5 text-yellow-400" /></div>
            <div><p className="text-2xl font-bold text-white">${(totalPending / 1000).toFixed(1)}k</p><p className="text-xs text-slate-400">Pending</p></div>
          </div>
        </div>
        <div className="bg-white/5 rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center"><FileText className="w-5 h-5 text-blue-400" /></div>
            <div><p className="text-2xl font-bold text-white">${(avgSettlement / 1000).toFixed(1)}k</p><p className="text-xs text-slate-400">Avg Settlement</p></div>
          </div>
        </div>
      </div>

      {/* Status Filter */}
      <div className="flex gap-2">
        {["ALL", "DRAFT", "FINALIZED", "PAID"].map((s) => {
          const count = s === "ALL" ? list.length : list.filter((stl) => stl.status === s).length;
          return (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === s ? "bg-gold/20 text-gold border border-gold/30" : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"}`}>
              {s === "ALL" ? "All" : s} {count > 0 && <span className="ml-1 text-[10px] opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Settlement List */}
      {isLoading ? (
        <p className="text-slate-400 text-center py-12">Loading...</p>
      ) : (
        <div className="space-y-3">
          {list.map((stl) => {
            const isExpanded = detail?.id === stl.id;
            return (
              <div key={stl.id} className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                <button onClick={() => loadDetail(stl.id)} className="w-full text-left p-5 hover:bg-white/5 transition">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <FileText className="w-4 h-4 text-gold shrink-0" />
                        <span className="font-semibold text-white">{stl.settlementNumber}</span>
                        <span className={cn("px-2 py-0.5 rounded text-xs font-medium", statusColors[stl.status] || "")}>{stl.status}</span>
                        <span className="text-xs text-slate-500">{stl.period}</span>
                      </div>
                      <p className="text-sm text-slate-400 flex items-center gap-1">
                        <Truck className="w-3.5 h-3.5" />
                        {stl.carrier?.company || `${stl.carrier?.firstName} ${stl.carrier?.lastName}`}
                      </p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {new Date(stl.periodStart).toLocaleDateString()} — {new Date(stl.periodEnd).toLocaleDateString()}
                        {stl._count && <span className="ml-2">({stl._count.carrierPays} loads)</span>}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-xl font-bold text-gold">${stl.netSettlement.toLocaleString()}</p>
                        {stl.deductions > 0 && <p className="text-xs text-red-400">-${stl.deductions.toLocaleString()} ded.</p>}
                        <p className="text-xs text-slate-500">Gross: ${stl.grossPay.toLocaleString()}</p>
                      </div>
                      {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>
                </button>

                {isExpanded && detail && (
                  <div className="border-t border-white/10 p-5 bg-white/[0.02] space-y-4">
                    {/* Loads Table */}
                    {detail.carrierPays && detail.carrierPays.length > 0 && (
                      <div>
                        <p className="text-xs text-slate-500 font-semibold uppercase tracking-wider mb-2">Included Loads</p>
                        <div className="bg-white/5 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-slate-400 border-b border-white/10">
                                <th className="text-left px-3 py-2 font-medium">Ref #</th>
                                <th className="text-left px-3 py-2 font-medium">Route</th>
                                <th className="text-left px-3 py-2 font-medium">Pickup</th>
                                <th className="text-left px-3 py-2 font-medium">Delivery</th>
                                <th className="text-right px-3 py-2 font-medium">Gross Pay</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.carrierPays.map((cp) => (
                                <tr key={cp.id} className="border-b border-white/5">
                                  <td className="px-3 py-2 text-white font-mono">{cp.load?.referenceNumber || "—"}</td>
                                  <td className="px-3 py-2 text-slate-300">
                                    {cp.load ? `${cp.load.originCity}, ${cp.load.originState} → ${cp.load.destCity}, ${cp.load.destState}` : "—"}
                                  </td>
                                  <td className="px-3 py-2 text-slate-400">{cp.load?.pickupDate ? new Date(cp.load.pickupDate).toLocaleDateString() : "—"}</td>
                                  <td className="px-3 py-2 text-slate-400">{cp.load?.deliveryDate ? new Date(cp.load.deliveryDate).toLocaleDateString() : "—"}</td>
                                  <td className="px-3 py-2 text-right text-white">${cp.amount.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Deductions */}
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div className="bg-white/5 rounded-lg p-3 text-xs space-y-1">
                        <p className="text-slate-500 font-semibold uppercase tracking-wider mb-2">Summary</p>
                        <div className="flex justify-between"><span className="text-slate-500">Gross Pay</span><span className="text-white">${detail.grossPay.toLocaleString()}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Deductions</span><span className="text-red-400">-${detail.deductions.toLocaleString()}</span></div>
                        <div className="flex justify-between border-t border-white/10 pt-1 mt-1"><span className="text-slate-500 font-semibold">Net Settlement</span><span className="text-gold font-bold">${detail.netSettlement.toLocaleString()}</span></div>
                      </div>
                      <div className="bg-white/5 rounded-lg p-3 text-xs space-y-1">
                        <p className="text-slate-500 font-semibold uppercase tracking-wider mb-2">Details</p>
                        <div className="flex justify-between"><span className="text-slate-500">Period</span><span className="text-white">{detail.period}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Created</span><span className="text-white">{new Date(detail.createdAt).toLocaleDateString()}</span></div>
                        <div className="flex justify-between"><span className="text-slate-500">Paid At</span><span className="text-white">{detail.paidAt ? new Date(detail.paidAt).toLocaleDateString() : "—"}</span></div>
                      </div>
                    </div>

                    {detail.notes && <p className="text-xs text-slate-400 italic">{detail.notes}</p>}

                    {/* Actions */}
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                      <button onClick={() => downloadPdf(stl.id, stl.settlementNumber)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20 transition">
                        <Download className="w-3.5 h-3.5" /> Download PDF
                      </button>
                      {stl.status === "DRAFT" && (
                        <button onClick={() => finalize.mutate(stl.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs hover:bg-blue-500/30 transition">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Finalize
                        </button>
                      )}
                      {stl.status === "FINALIZED" && (
                        <button onClick={() => markPaid.mutate(stl.id)}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs hover:bg-green-500/30 transition">
                          <DollarSign className="w-3.5 h-3.5" /> Mark Paid
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {list.length === 0 && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center text-slate-500">No settlements found</div>
          )}
        </div>
      )}

      {showCreate && <CreateSettlementModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
