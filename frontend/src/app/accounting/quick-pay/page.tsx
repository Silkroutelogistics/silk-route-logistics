"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Zap, Search, Clock, DollarSign, ChevronLeft, ChevronRight, CheckCircle2, X } from "lucide-react";

interface QuickPayRequest {
  id: string;
  paymentNumber: string;
  loadId: string;
  amount: number;
  quickPayFee: number;
  netAmount: number;
  paymentTier: string;
  status: string;
  requestedAt: string;
  load: { referenceNumber: string; originCity: string; originState: string; destCity: string; destState: string };
  carrier: { user: { company: string | null; firstName: string; lastName: string }; srcppTier: string | null };
}

const TIER_INFO: Record<string, { label: string; fee: string; days: string; color: string }> = {
  FLASH: { label: "Flash", fee: "5%", days: "Same Day", color: "text-red-400" },
  EXPRESS: { label: "Express", fee: "3.5%", days: "+3 Days", color: "text-orange-400" },
  PRIORITY: { label: "Priority", fee: "2%", days: "+7 Days", color: "text-yellow-400" },
  PARTNER: { label: "Partner", fee: "1.5%", days: "+7 Days", color: "text-blue-400" },
  ELITE: { label: "Elite", fee: "0%", days: "+14 Days", color: "text-purple-400" },
};

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export default function QuickPayQueuePage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["quick-pay-queue", page],
    queryFn: () => api.get<{ requests: QuickPayRequest[]; total: number; totalPages: number; totalFees: number }>(`/accounting/payments/queue?page=${page}`).then(r => r.data),
  });

  const processMutation = useMutation({
    mutationFn: (id: string) => api.post(`/accounting/payments/${id}/approve`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["quick-pay-queue"] }),
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Zap className="w-6 h-6 text-yellow-400" /> Quick Pay Queue
          </h1>
          <p className="text-sm text-slate-400 mt-1">Process expedited carrier payments from the factoring fund</p>
        </div>
        {data && (
          <div className="text-right">
            <p className="text-xs text-slate-400">Total Pending Fees</p>
            <p className="text-lg font-bold text-[#C8963E]">{fmt(data.totalFees)}</p>
          </div>
        )}
      </div>

      {/* Tier Legend */}
      <div className="flex items-center gap-4 mb-6 bg-white/5 border border-white/5 rounded-xl px-5 py-3">
        <span className="text-xs text-slate-500">Payment Tiers:</span>
        {Object.entries(TIER_INFO).map(([key, info]) => (
          <div key={key} className="flex items-center gap-1.5">
            <span className={`text-xs font-bold ${info.color}`}>{info.label}</span>
            <span className="text-[10px] text-slate-500">{info.fee} / {info.days}</span>
          </div>
        ))}
      </div>

      {/* Queue Table */}
      <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Payment #</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Load</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Carrier</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Tier</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Gross</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Fee</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Net</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Requested</th>
              <th className="text-right text-xs text-slate-500 font-medium px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              [...Array(5)].map((_, i) => <tr key={i}><td colSpan={9} className="px-5 py-3"><div className="h-5 bg-white/5 rounded animate-pulse" /></td></tr>)
            ) : data?.requests?.length ? (
              data.requests.map(req => {
                const tierInfo = TIER_INFO[req.paymentTier] || TIER_INFO.FLASH;
                return (
                  <tr key={req.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3 text-sm text-white font-medium">{req.paymentNumber}</td>
                    <td className="px-5 py-3 text-sm text-slate-300">{req.load.referenceNumber}</td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-slate-300">{req.carrier.user.company || `${req.carrier.user.firstName} ${req.carrier.user.lastName}`}</p>
                      {req.carrier.srcppTier && <p className="text-[10px] text-[#C8963E]">{req.carrier.srcppTier} Tier</p>}
                    </td>
                    <td className="px-5 py-3"><span className={`text-xs font-bold ${tierInfo.color}`}>{tierInfo.label}</span></td>
                    <td className="px-5 py-3 text-sm text-white">{fmt(req.amount)}</td>
                    <td className="px-5 py-3 text-sm text-yellow-400">-{fmt(req.quickPayFee)}</td>
                    <td className="px-5 py-3 text-sm text-green-400 font-medium">{fmt(req.netAmount)}</td>
                    <td className="px-5 py-3 text-xs text-slate-400">{new Date(req.requestedAt).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right">
                      <button
                        onClick={() => processMutation.mutate(req.id)}
                        disabled={processMutation.isPending}
                        className="px-3 py-1.5 bg-[#C8963E]/20 text-[#C8963E] rounded-lg text-xs font-medium hover:bg-[#C8963E]/30 transition disabled:opacity-50"
                      >
                        Process
                      </button>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr><td colSpan={9} className="px-5 py-12 text-center text-sm text-slate-500">No quick pay requests in queue</td></tr>
            )}
          </tbody>
        </table>

        {data && data.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
            <p className="text-xs text-slate-500">{data.total} total requests</p>
            <div className="flex items-center gap-2">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
              <span className="text-xs text-slate-400">Page {page} of {data.totalPages}</span>
              <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
