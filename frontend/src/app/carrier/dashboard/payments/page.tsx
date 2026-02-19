"use client";

import { useState } from "react";
import { DollarSign, Zap, Calendar, TrendingUp, Download } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard, CarrierBadge } from "@/components/carrier";

const statusFilters = ["All", "PENDING", "APPROVED", "PROCESSING", "SCHEDULED", "PAID"];

export default function CarrierPaymentsPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();

  const query = new URLSearchParams();
  if (activeFilter !== "All") query.set("status", activeFilter);
  query.set("page", String(page));

  const { data: summary } = useQuery({
    queryKey: ["carrier-pay-summary"],
    queryFn: () => api.get("/carrier-payments/summary").then((r) => r.data),
  });

  const { data, isLoading } = useQuery({
    queryKey: ["carrier-payments", activeFilter, page],
    queryFn: () => api.get(`/carrier-payments?${query.toString()}`).then((r) => r.data),
  });

  const quickPayMutation = useMutation({
    mutationFn: (paymentId: string) => api.post(`/carrier-payments/${paymentId}/request-quickpay`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carrier-payments"] });
      queryClient.invalidateQueries({ queryKey: ["carrier-pay-summary"] });
    },
  });

  const payments = data?.payments || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">Payments &amp; Earnings</h1>
          <p className="text-[13px] text-gray-500">Track your payment history, pending earnings, and QuickPay options</p>
        </div>
        <button className="inline-flex items-center gap-1.5 text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#C9A84C]">
          <Download size={14} /> Export
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-emerald-500" />
            <span className="text-[11px] text-gray-400">YTD Earnings</span>
          </div>
          <div className="text-[28px] font-bold text-[#0D1B2A]">
            ${(summary?.ytdEarnings?.amount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">{summary?.ytdEarnings?.count || 0} loads</div>
        </CarrierCard>
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={16} className="text-emerald-500" />
            <span className="text-[11px] text-gray-400">Total Paid</span>
          </div>
          <div className="text-[28px] font-bold text-emerald-500">
            ${(summary?.totalPaid?.amount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">{summary?.totalPaid?.count || 0} payments</div>
        </CarrierCard>
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={16} className="text-amber-500" />
            <span className="text-[11px] text-gray-400">Pending</span>
          </div>
          <div className="text-[28px] font-bold text-amber-500">
            ${(summary?.totalPending?.amount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">{summary?.totalPending?.count || 0} pending</div>
        </CarrierCard>
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={16} className="text-violet-500" />
            <span className="text-[11px] text-gray-400">QuickPay Used</span>
          </div>
          <div className="text-[28px] font-bold text-[#0D1B2A]">
            {summary?.quickPayUsed?.count || 0}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">
            ${(summary?.quickPayUsed?.discount || 0).toLocaleString()} in fees
          </div>
        </CarrierCard>
      </div>

      {/* Filters */}
      <CarrierCard padding="p-3" className="mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {statusFilters.map((f) => (
            <button
              key={f}
              onClick={() => { setActiveFilter(f); setPage(1); }}
              className={`px-3 py-1.5 rounded-full text-[11px] font-medium ${
                f === activeFilter ? "bg-[#0D1B2A] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              }`}
            >{f}</button>
          ))}
        </div>
      </CarrierCard>

      {/* Payment Table */}
      <CarrierCard padding="p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="bg-gray-50">
                {["Payment #", "Load", "Route", "Amount", "Status", "Date", "QuickPay"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 tracking-wide uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : payments.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">No payments found</td></tr>
              ) : (
                payments.map((pay: any) => (
                  <tr key={pay.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-[11px] font-semibold text-[#0D1B2A]">{pay.paymentNumber || pay.id.slice(-8)}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-600">{pay.load?.referenceNumber || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {pay.load ? `${pay.load.originCity}, ${pay.load.originState} → ${pay.load.destCity}, ${pay.load.destState}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-bold text-[#0D1B2A]">
                      ${(pay.netAmount || pay.amount || 0).toLocaleString()}
                      {pay.quickPayDiscount > 0 && (
                        <span className="text-[10px] text-gray-400 ml-1">(-${pay.quickPayDiscount})</span>
                      )}
                    </td>
                    <td className="px-4 py-3"><CarrierBadge status={pay.status} /></td>
                    <td className="px-4 py-3 text-xs text-gray-500">
                      {pay.paidAt ? new Date(pay.paidAt).toLocaleDateString() : new Date(pay.createdAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3">
                      {pay.status === "PENDING" || pay.status === "APPROVED" ? (
                        <button
                          onClick={() => quickPayMutation.mutate(pay.id)}
                          disabled={quickPayMutation.isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-violet-500/10 text-violet-600 text-[11px] font-semibold rounded hover:bg-violet-500/20 disabled:opacity-50"
                        >
                          <Zap size={12} /> QuickPay
                        </button>
                      ) : pay.paymentMethod === "FLASH" || pay.quickPayDiscount > 0 ? (
                        <span className="text-[11px] text-violet-500 font-medium flex items-center gap-1"><Zap size={12} /> Used</span>
                      ) : (
                        <span className="text-[11px] text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && data.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex justify-between items-center text-xs text-gray-500">
            <span>Page {page} of {data.totalPages}</span>
            <div className="flex gap-1">
              {page > 1 && <button onClick={() => setPage(page - 1)} className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200">Prev</button>}
              {page < data.totalPages && <button onClick={() => setPage(page + 1)} className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200">Next</button>}
            </div>
          </div>
        )}
      </CarrierCard>

      {quickPayMutation.isError && (
        <div className="mt-3 px-4 py-2 bg-red-50 border border-red-200 rounded text-xs text-red-600">
          {(quickPayMutation.error as any)?.response?.data?.error || "QuickPay request failed"}
        </div>
      )}
    </div>
  );
}
