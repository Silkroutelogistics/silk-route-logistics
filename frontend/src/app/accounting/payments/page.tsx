"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Search, ChevronLeft, ChevronRight, X,
  CheckCircle2,
} from "lucide-react";

interface CarrierPayment {
  id: string;
  paymentNumber: string;
  loadId: string;
  carrierId: string;
  amount: number;
  quickPayFeeAmount: number | null;
  netAmount: number | null;
  paymentTier: string | null;
  status: string;
  approvedAt: string | null;
  paidAt: string | null;
  scheduledDate: string | null;
  load: {
    referenceNumber: string;
    originCity: string;
    originState: string;
    destCity: string;
    destState: string;
  };
  carrier: { id: string; company: string | null; firstName: string; lastName: string };
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400",
  APPROVED: "bg-blue-500/20 text-blue-400",
  SCHEDULED: "bg-indigo-500/20 text-indigo-400",
  PAID: "bg-green-500/20 text-green-400",
  REJECTED: "bg-red-500/20 text-red-400",
  ON_HOLD: "bg-orange-500/20 text-orange-400",
};

const TIER_COLORS: Record<string, string> = {
  FLASH: "text-red-400",
  EXPRESS: "text-orange-400",
  PRIORITY: "text-yellow-400",
  PARTNER: "text-blue-400",
  ELITE: "text-purple-400",
  STANDARD: "text-slate-400",
};

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export default function CarrierPaymentsPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<CarrierPayment | null>(null);
  const queryClient = useQueryClient();

  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  if (statusFilter) qs.set("status", statusFilter);
  qs.set("page", String(page));

  const { data, isLoading } = useQuery({
    queryKey: ["carrier-payments", search, statusFilter, page],
    queryFn: () => api.get<{ payments: CarrierPayment[]; total: number; totalPages: number }>(`/accounting/payments?${qs}`).then(r => r.data),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/accounting/payments/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["carrier-payments"] }),
  });

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Carrier Payments</h1>
        <p className="text-sm text-slate-400 mt-1">Accounts Payable — manage carrier payment settlements</p>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search payment # or carrier..."
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
          {Object.keys(STATUS_COLORS).map(s => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      {/* Table */}
      <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Payment #</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Load</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Carrier</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Amount</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Tier</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Status</th>
              <th className="text-right text-xs text-slate-500 font-medium px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-5 py-3"><div className="h-5 bg-white/5 rounded animate-pulse" /></td></tr>
              ))
            ) : data?.payments?.length ? (
              data.payments.map((pay) => {
                return (
                  <tr key={pay.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => setSelected(pay)}>
                    <td className="px-5 py-3 text-sm text-white font-medium">{pay.paymentNumber}</td>
                    <td className="px-5 py-3 text-sm text-slate-300">{pay.load.referenceNumber}</td>
                    <td className="px-5 py-3 text-sm text-slate-300">{pay.carrier.company || `${pay.carrier.firstName} ${pay.carrier.lastName}`}</td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-white font-medium">{fmt(pay.amount)}</p>
                      {pay.quickPayFeeAmount ? <p className="text-[10px] text-yellow-400">-{fmt(pay.quickPayFeeAmount)} fee</p> : null}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs font-medium ${TIER_COLORS[pay.paymentTier || "STANDARD"]}`}>
                        {pay.paymentTier || "STANDARD"}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[pay.status]}`}>{pay.status}</span>
                    </td>
                    <td className="px-5 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      {pay.status === "PENDING" && (
                        <button
                          onClick={() => approveMutation.mutate(pay.id)}
                          className="p-1.5 rounded-lg hover:bg-green-500/20 text-green-400 transition"
                          title="Approve"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">No carrier payments found</td></tr>
            )}
          </tbody>
        </table>

        {data && data.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
            <p className="text-xs text-slate-500">{data.total} total payments</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30">
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs text-slate-400">Page {page} of {data.totalPages}</span>
              <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30">
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Slide-over */}
      {selected && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelected(null)} />
          <div className="relative w-[480px] bg-[#0f172a] border-l border-white/10 overflow-y-auto">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#0f172a] z-10">
              <h2 className="text-lg font-bold text-white">{selected.paymentNumber}</h2>
              <button onClick={() => setSelected(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between"><span className="text-xs text-slate-500">Status</span><span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[selected.status]}`}>{selected.status}</span></div>
                <div className="flex justify-between"><span className="text-xs text-slate-500">Load</span><span className="text-sm text-white">{selected.load.referenceNumber}</span></div>
                <div className="flex justify-between"><span className="text-xs text-slate-500">Carrier</span><span className="text-sm text-white">{selected.carrier.company || `${selected.carrier.firstName} ${selected.carrier.lastName}`}</span></div>
                <div className="flex justify-between"><span className="text-xs text-slate-500">Route</span><span className="text-sm text-white">{selected.load.originCity}, {selected.load.originState} → {selected.load.destCity}, {selected.load.destState}</span></div>
              </div>

              <div className="bg-white/5 rounded-xl p-4 space-y-2">
                <h3 className="text-xs text-slate-500 font-medium mb-3">PAYMENT DETAILS</h3>
                <div className="flex justify-between"><span className="text-sm text-slate-300">Gross Amount</span><span className="text-sm text-white">{fmt(selected.amount)}</span></div>
                {selected.quickPayFeeAmount ? <div className="flex justify-between"><span className="text-sm text-slate-300">Quick Pay Fee</span><span className="text-sm text-yellow-400">-{fmt(selected.quickPayFeeAmount)}</span></div> : null}
                <div className="flex justify-between pt-2 border-t border-white/10"><span className="text-sm text-white font-medium">Net Amount</span><span className="text-sm text-[#C8963E] font-bold">{fmt(selected.netAmount || selected.amount)}</span></div>
              </div>

              <div className="flex gap-2">
                {selected.status === "PENDING" && (
                  <>
                    <button
                      onClick={() => { approveMutation.mutate(selected.id); setSelected(null); }}
                      className="flex-1 py-2 bg-green-500/20 text-green-400 rounded-lg text-sm font-medium hover:bg-green-500/30 transition"
                    >
                      Approve Payment
                    </button>
                    <button className="px-4 py-2 bg-red-500/10 text-red-400 rounded-lg text-sm hover:bg-red-500/20 transition">
                      Reject
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
