"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CreateCarrierPayModal } from "@/components/accounting/CreateCarrierPayModal";
import { cn } from "@/lib/utils";
import {
  DollarSign, CreditCard, Clock, CheckCircle2, Zap,
  ChevronDown, ChevronUp, Download, Plus, Truck,
} from "lucide-react";

interface CarrierPay {
  id: string;
  amount: number;
  quickPayDiscount: number | null;
  netAmount: number;
  status: string;
  paymentMethod: string | null;
  checkNumber: string | null;
  referenceNumber: string | null;
  scheduledDate: string | null;
  paidAt: string | null;
  notes: string | null;
  createdAt: string;
  carrier?: { id: string; firstName: string; lastName: string; company: string | null };
  load?: { referenceNumber: string; originCity: string; originState: string; destCity: string; destState: string };
}

interface Summary {
  totalOwed: number;
  totalPaid: number;
  totalScheduled: number;
  quickPaySavings: number;
}

const statusColors: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400",
  SCHEDULED: "bg-blue-500/20 text-blue-400",
  PROCESSING: "bg-purple-500/20 text-purple-400",
  PAID: "bg-green-500/20 text-green-400",
  VOID: "bg-red-500/20 text-red-400",
};

const statusFilters = ["ALL", "PENDING", "SCHEDULED", "PROCESSING", "PAID", "VOID"];

export default function PayablesPage() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  const { data: summary } = useQuery({
    queryKey: ["carrier-pay-summary"],
    queryFn: () => api.get<Summary>("/carrier-pay/summary").then((r) => r.data),
  });

  const { data: payData, isLoading } = useQuery({
    queryKey: ["carrier-pays", statusFilter],
    queryFn: () => {
      const params = new URLSearchParams();
      if (statusFilter !== "ALL") params.set("status", statusFilter);
      params.set("limit", "100");
      return api.get<{ carrierPays: CarrierPay[]; total: number }>(`/carrier-pay?${params}`).then((r) => r.data);
    },
  });

  const updatePay = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Record<string, unknown> }) => api.patch(`/carrier-pay/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carrier-pays"] });
      queryClient.invalidateQueries({ queryKey: ["carrier-pay-summary"] });
    },
  });

  const batchUpdate = useMutation({
    mutationFn: (action: string) => api.post("/carrier-pay/batch", { ids: selectedIds, action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carrier-pays"] });
      queryClient.invalidateQueries({ queryKey: ["carrier-pay-summary"] });
      setSelectedIds([]);
    },
  });

  const pays = payData?.carrierPays || [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const exportCSV = () => {
    const headers = "Carrier,Load Ref,Amount,Discount,Net,Status,Method,Date\n";
    const rows = pays.map((p) =>
      `${p.carrier?.company || `${p.carrier?.firstName} ${p.carrier?.lastName}`},${p.load?.referenceNumber || ""},${p.amount},${p.quickPayDiscount || 0},${p.netAmount},${p.status},${p.paymentMethod || ""},${new Date(p.createdAt).toLocaleDateString()}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payables-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Carrier Payables</h1>
          <p className="text-slate-400 text-sm mt-1">{payData?.total || 0} total payments</p>
        </div>
        <div className="flex gap-2">
          <button onClick={exportCSV} className="px-3 py-2 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 transition flex items-center gap-1.5">
            <Download className="w-4 h-4" /> Export
          </button>
          <button onClick={() => setShowCreate(true)} className="px-4 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold/90 transition text-sm flex items-center gap-1.5">
            <Plus className="w-4 h-4" /> New Payment
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      {summary && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/5 rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center"><DollarSign className="w-5 h-5 text-yellow-400" /></div>
              <div><p className="text-2xl font-bold text-white">${(summary.totalOwed / 1000).toFixed(1)}k</p><p className="text-xs text-slate-400">Outstanding</p></div>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center"><Clock className="w-5 h-5 text-blue-400" /></div>
              <div><p className="text-2xl font-bold text-white">${(summary.totalScheduled / 1000).toFixed(1)}k</p><p className="text-xs text-slate-400">Scheduled</p></div>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center"><CheckCircle2 className="w-5 h-5 text-green-400" /></div>
              <div><p className="text-2xl font-bold text-white">${(summary.totalPaid / 1000).toFixed(1)}k</p><p className="text-xs text-slate-400">Paid This Month</p></div>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center"><Zap className="w-5 h-5 text-gold" /></div>
              <div><p className="text-2xl font-bold text-white">${(summary.quickPaySavings / 1000).toFixed(1)}k</p><p className="text-xs text-slate-400">QuickPay Savings</p></div>
            </div>
          </div>
        </div>
      )}

      {/* Status Filter */}
      <div className="flex flex-wrap gap-2">
        {statusFilters.map((s) => {
          const count = s === "ALL" ? pays.length : pays.filter((p) => p.status === s).length;
          return (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === s ? "bg-gold/20 text-gold border border-gold/30" : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"}`}>
              {s === "ALL" ? "All" : s} {count > 0 && <span className="ml-1 text-[10px] opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Pays List */}
      {isLoading ? (
        <p className="text-slate-400 text-center py-12">Loading...</p>
      ) : (
        <div className="space-y-3">
          {pays.map((pay) => (
            <div key={pay.id} className={cn("bg-white/5 rounded-xl border overflow-hidden", selectedIds.includes(pay.id) ? "border-gold/40" : "border-white/10")}>
              <div className="flex items-start">
                <div className="p-5 pr-0 flex items-center">
                  <input type="checkbox" checked={selectedIds.includes(pay.id)} onChange={() => toggleSelect(pay.id)}
                    className="w-4 h-4 rounded border-white/20 bg-white/5 accent-[#D4A843]" />
                </div>
                <button onClick={() => setExpanded(expanded === pay.id ? null : pay.id)} className="flex-1 text-left p-5 hover:bg-white/5 transition">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-1 flex-wrap">
                        <Truck className="w-4 h-4 text-gold shrink-0" />
                        <span className="font-semibold text-white">{pay.carrier?.company || `${pay.carrier?.firstName} ${pay.carrier?.lastName}`}</span>
                        <span className={cn("px-2 py-0.5 rounded text-xs font-medium", statusColors[pay.status] || "")}>{pay.status}</span>
                        {pay.quickPayDiscount && pay.quickPayDiscount > 0 && (
                          <span className="px-2 py-0.5 rounded text-xs bg-gold/10 text-gold flex items-center gap-1"><Zap className="w-3 h-3" /> QuickPay</span>
                        )}
                        {pay.paymentMethod && <span className="text-xs text-slate-500">{pay.paymentMethod}</span>}
                      </div>
                      <p className="text-sm text-slate-400">
                        {pay.load ? `${pay.load.referenceNumber} — ${pay.load.originCity}, ${pay.load.originState} → ${pay.load.destCity}, ${pay.load.destState}` : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-4 shrink-0">
                      <div className="text-right">
                        <p className="text-xl font-bold text-gold">${pay.netAmount.toLocaleString()}</p>
                        {pay.quickPayDiscount && pay.quickPayDiscount > 0 && (
                          <p className="text-xs text-red-400">-${pay.quickPayDiscount.toLocaleString()} disc.</p>
                        )}
                        <p className="text-xs text-slate-500">{new Date(pay.createdAt).toLocaleDateString()}</p>
                      </div>
                      {expanded === pay.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                    </div>
                  </div>
                </button>
              </div>

              {expanded === pay.id && (
                <div className="border-t border-white/10 p-5 bg-white/[0.02] space-y-4">
                  <div className="grid sm:grid-cols-3 gap-4 text-xs">
                    <div className="bg-white/5 rounded-lg p-3 space-y-1">
                      <p className="text-slate-500 font-semibold uppercase tracking-wider mb-2">Payment Details</p>
                      <div className="flex justify-between"><span className="text-slate-500">Gross</span><span className="text-white">${pay.amount.toLocaleString()}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Discount</span><span className="text-red-400">{pay.quickPayDiscount ? `-$${pay.quickPayDiscount.toLocaleString()}` : "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Net</span><span className="text-gold font-bold">${pay.netAmount.toLocaleString()}</span></div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 space-y-1">
                      <p className="text-slate-500 font-semibold uppercase tracking-wider mb-2">Method</p>
                      <div className="flex justify-between"><span className="text-slate-500">Method</span><span className="text-white">{pay.paymentMethod || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Check #</span><span className="text-white">{pay.checkNumber || "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Ref #</span><span className="text-white">{pay.referenceNumber || "—"}</span></div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-3 space-y-1">
                      <p className="text-slate-500 font-semibold uppercase tracking-wider mb-2">Dates</p>
                      <div className="flex justify-between"><span className="text-slate-500">Created</span><span className="text-white">{new Date(pay.createdAt).toLocaleDateString()}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Scheduled</span><span className="text-white">{pay.scheduledDate ? new Date(pay.scheduledDate).toLocaleDateString() : "—"}</span></div>
                      <div className="flex justify-between"><span className="text-slate-500">Paid</span><span className="text-white">{pay.paidAt ? new Date(pay.paidAt).toLocaleDateString() : "—"}</span></div>
                    </div>
                  </div>
                  {pay.notes && <p className="text-xs text-slate-400 italic">{pay.notes}</p>}
                  <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                    {pay.status === "PENDING" && (
                      <button onClick={() => updatePay.mutate({ id: pay.id, data: { status: "SCHEDULED" } })}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs hover:bg-blue-500/30 transition">
                        <Clock className="w-3.5 h-3.5" /> Schedule
                      </button>
                    )}
                    {(pay.status === "SCHEDULED" || pay.status === "PROCESSING") && (
                      <button onClick={() => updatePay.mutate({ id: pay.id, data: { status: "PAID" } })}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs hover:bg-green-500/30 transition">
                        <CheckCircle2 className="w-3.5 h-3.5" /> Mark Paid
                      </button>
                    )}
                    {pay.status !== "PAID" && pay.status !== "VOID" && (
                      <button onClick={() => updatePay.mutate({ id: pay.id, data: { status: "VOID" } })}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30 transition">
                        Void
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
          {pays.length === 0 && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center text-slate-500">No carrier payments found</div>
          )}
        </div>
      )}

      {/* Batch Actions */}
      {selectedIds.length > 0 && (
        <div className="sticky bottom-4 mx-auto max-w-3xl bg-navy/95 backdrop-blur-md border border-gold/30 rounded-xl px-5 py-3 shadow-2xl flex items-center gap-4 z-30">
          <span className="text-sm text-white font-medium">{selectedIds.length} selected</span>
          <div className="flex-1 flex items-center gap-2">
            <button onClick={() => batchUpdate.mutate("SCHEDULE")} disabled={batchUpdate.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs hover:bg-blue-500/30 transition disabled:opacity-50">
              <Clock className="w-3.5 h-3.5" /> Schedule
            </button>
            <button onClick={() => batchUpdate.mutate("PAY")} disabled={batchUpdate.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs hover:bg-green-500/30 transition disabled:opacity-50">
              <CheckCircle2 className="w-3.5 h-3.5" /> Mark Paid
            </button>
          </div>
          <button onClick={() => setSelectedIds([])} className="text-xs text-slate-400 hover:text-white transition">Clear</button>
        </div>
      )}

      {showCreate && <CreateCarrierPayModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
