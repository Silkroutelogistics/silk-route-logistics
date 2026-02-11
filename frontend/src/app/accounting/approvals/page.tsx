"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CheckCircle2, XCircle, Clock, DollarSign, FileText, Search, ChevronLeft, ChevronRight } from "lucide-react";

interface PendingApproval {
  id: string;
  paymentNumber: string;
  amount: number;
  quickPayFee: number | null;
  netAmount: number | null;
  paymentTier: string | null;
  bolReceived: boolean;
  podReceived: boolean;
  rateConSigned: boolean;
  carrierInvoiceReceived: boolean;
  createdAt: string;
  load: { referenceNumber: string; originCity: string; originState: string; destCity: string; destState: string; deliveryDate: string | null };
  carrier: { user: { company: string | null; firstName: string; lastName: string } };
}

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export default function ApprovalsPage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["pending-approvals", page],
    queryFn: () => api.get<{ approvals: PendingApproval[]; total: number; totalPages: number; totalAmount: number }>(`/accounting/payments?status=PENDING&page=${page}`).then(r => r.data),
  });

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.post(`/accounting/payments/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pending-approvals"] }),
  });

  const rejectMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/accounting/payments/${id}/reject`, { reason }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["pending-approvals"] }),
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Payment Approvals</h1>
          <p className="text-sm text-slate-400 mt-1">Review and approve carrier payment settlements</p>
        </div>
        {data && (
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xs text-slate-400">Pending Approvals</p>
              <p className="text-lg font-bold text-[#C8963E]">{data.total}</p>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400">Total Amount</p>
              <p className="text-lg font-bold text-white">{fmt(data.totalAmount)}</p>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {isLoading ? (
          [...Array(3)].map((_, i) => <div key={i} className="h-28 bg-white/5 rounded-xl animate-pulse" />)
        ) : data?.approvals?.length ? (
          data.approvals.map(item => {
            const docsComplete = item.bolReceived && item.podReceived && item.rateConSigned;
            const docCount = [item.bolReceived, item.podReceived, item.rateConSigned, item.carrierInvoiceReceived].filter(Boolean).length;
            return (
              <div key={item.id} className="bg-white/5 border border-white/5 rounded-xl p-5">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h3 className="text-sm font-bold text-white">{item.paymentNumber}</h3>
                      <span className="text-xs text-slate-500">•</span>
                      <span className="text-xs text-slate-400">{item.load.referenceNumber}</span>
                      {item.paymentTier && item.paymentTier !== "STANDARD" && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-yellow-500/10 text-yellow-400 font-medium">{item.paymentTier}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-4 text-xs text-slate-400">
                      <span>{item.carrier.user.company || `${item.carrier.user.firstName} ${item.carrier.user.lastName}`}</span>
                      <span>{item.load.originCity}, {item.load.originState} → {item.load.destCity}, {item.load.destState}</span>
                      {item.load.deliveryDate && <span>Delivered: {new Date(item.load.deliveryDate).toLocaleDateString()}</span>}
                    </div>
                  </div>

                  <div className="text-right ml-6">
                    <p className="text-lg font-bold text-white">{fmt(item.amount)}</p>
                    {item.quickPayFee ? (
                      <p className="text-xs text-yellow-400">Fee: -{fmt(item.quickPayFee)} → Net: {fmt(item.netAmount || item.amount)}</p>
                    ) : null}
                  </div>
                </div>

                <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500">Documents ({docCount}/4):</span>
                    {[
                      { label: "BOL", done: item.bolReceived },
                      { label: "POD", done: item.podReceived },
                      { label: "Rate Con", done: item.rateConSigned },
                      { label: "Invoice", done: item.carrierInvoiceReceived },
                    ].map(d => (
                      <span key={d.label} className={`text-[10px] px-2 py-0.5 rounded-full ${d.done ? "bg-green-500/10 text-green-400" : "bg-slate-500/10 text-slate-500"}`}>
                        {d.label}
                      </span>
                    ))}
                    {!docsComplete && <span className="text-[10px] text-orange-400">(Incomplete docs)</span>}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => rejectMutation.mutate({ id: item.id, reason: "Rejected by accounting" })}
                      disabled={rejectMutation.isPending}
                      className="px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-xs hover:bg-red-500/20 transition disabled:opacity-50"
                    >
                      Reject
                    </button>
                    <button
                      onClick={() => approveMutation.mutate(item.id)}
                      disabled={approveMutation.isPending}
                      className="px-4 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/30 transition disabled:opacity-50"
                    >
                      Approve
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        ) : (
          <div className="bg-white/5 border border-white/5 rounded-xl p-12 text-center">
            <CheckCircle2 className="w-10 h-10 text-green-400 mx-auto mb-3" />
            <p className="text-sm text-slate-400">All caught up! No pending approvals.</p>
          </div>
        )}
      </div>

      {data && data.totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
          <span className="text-xs text-slate-400">Page {page} of {data.totalPages}</span>
          <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
        </div>
      )}
    </div>
  );
}
