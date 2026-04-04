"use client";

import { useState } from "react";
import { DollarSign, Zap, Calendar, TrendingUp, Download, X, CheckCircle, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard, CarrierBadge } from "@/components/carrier";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";

const statusFilters = ["All", "PENDING", "APPROVED", "PROCESSING", "SCHEDULED", "PAID"];

const CARVAN_TIER_MAP: Record<string, string> = {
  GUEST: "BRONZE", NONE: "BRONZE", BRONZE: "BRONZE", SILVER: "SILVER", GOLD: "GOLD", PLATINUM: "GOLD",
};
const QP_FEES: Record<string, number> = { BRONZE: 3.5, SILVER: 2.5, GOLD: 1.5 };
const QP_SPEEDS: Record<string, string> = { BRONZE: "48-hour", SILVER: "24-hour", GOLD: "Same-day" };
const QP_DAYS: Record<string, number> = { BRONZE: 2, SILVER: 1, GOLD: 0 };
const FACTORING_RATE = 4.5;

export default function CarrierPaymentsPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [qpModal, setQpModal] = useState<any | null>(null);
  const [qpSuccess, setQpSuccess] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = useCarrierAuth();
  const rawTier = user?.carrierProfile?.tier || "NONE";
  const carvanTier = CARVAN_TIER_MAP[rawTier] || "BRONZE";
  const tierFeeRate = QP_FEES[carvanTier];
  const tierSpeed = QP_SPEEDS[carvanTier];
  const tierDays = QP_DAYS[carvanTier];

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
      const loadRef = qpModal?.load?.referenceNumber || "this load";
      setQpModal(null);
      setQpSuccess(`Quick Pay requested! Estimated payment in ${tierDays === 0 ? "same day" : `${tierDays} day${tierDays > 1 ? "s" : ""}`}.`);
      setTimeout(() => setQpSuccess(null), 5000);
    },
  });

  const payments = data?.payments || [];

  const exportCSV = () => {
    if (!payments.length) return;
    const headers = ["Payment #", "Load Ref", "Gross", "Discount", "Net", "Status", "Method", "Date"];
    const rows = payments.map((pay: any) => [
      pay.paymentNumber || pay.id.slice(-8),
      pay.load?.referenceNumber || "",
      pay.amount || 0,
      pay.quickPayDiscount || 0,
      pay.netAmount || pay.amount || 0,
      pay.status,
      pay.paymentMethod || "",
      pay.paidAt ? new Date(pay.paidAt).toLocaleDateString() : new Date(pay.createdAt).toLocaleDateString(),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v: any) => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `carrier-payments-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#0F1117] mb-1">Payments &amp; Earnings</h1>
          <p className="text-[13px] text-gray-500">Track your payment history, pending earnings, and QuickPay options</p>
        </div>
        <button onClick={exportCSV} className="inline-flex items-center gap-1.5 text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#C9A84C]">
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
          <div className="text-[28px] font-bold text-[#0F1117]">
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
          <div className="text-[28px] font-bold text-[#0F1117]">
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
                f === activeFilter ? "bg-[#0F1117] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
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
                    <td className="px-4 py-3 font-mono text-[11px] font-semibold text-[#0F1117]">{pay.paymentNumber || pay.id.slice(-8)}</td>
                    <td className="px-4 py-3 font-mono text-[11px] text-gray-600">{pay.load?.referenceNumber || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {pay.load ? `${pay.load.originCity}, ${pay.load.originState} → ${pay.load.destCity}, ${pay.load.destState}` : "—"}
                    </td>
                    <td className="px-4 py-3 font-bold text-[#0F1117]">
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
                          onClick={() => setQpModal(pay)}
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

      {/* Success Toast */}
      {qpSuccess && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-lg shadow-lg animate-in slide-in-from-bottom">
          <CheckCircle size={16} className="text-emerald-500 shrink-0" />
          <span className="text-sm text-emerald-700 font-medium">{qpSuccess}</span>
          <button onClick={() => setQpSuccess(null)} className="text-emerald-400 hover:text-emerald-600 ml-2">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Quick Pay Confirmation Modal */}
      {qpModal && (() => {
        const gross = qpModal.grossAmount || qpModal.amount || 0;
        const fee = Math.round(gross * (tierFeeRate / 100) * 100) / 100;
        const net = Math.round((gross - fee) * 100) / 100;
        const factoringFee = Math.round(gross * (FACTORING_RATE / 100) * 100) / 100;
        const savings = Math.round((factoringFee - fee) * 100) / 100;
        const loadRef = qpModal.load?.referenceNumber || qpModal.paymentNumber || qpModal.id.slice(-8);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setQpModal(null)} />
            <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
              <button onClick={() => setQpModal(null)} className="absolute top-4 right-4 text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>

              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-lg bg-violet-500/10 flex items-center justify-center">
                  <Zap size={20} className="text-violet-500" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#0F1117]">Request Quick Pay</h3>
                  <p className="text-[11px] text-gray-400">Load {loadRef}</p>
                </div>
              </div>

              {/* Fee Breakdown */}
              <div className="bg-gray-50 rounded-lg p-4 mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Gross Amount</span>
                  <span className="font-semibold text-[#0F1117]">${gross.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">QP Fee ({tierFeeRate}%)</span>
                  <span className="font-semibold text-red-500">-${fee.toLocaleString()}</span>
                </div>
                <div className="border-t border-gray-200 pt-2 flex justify-between text-sm">
                  <span className="font-semibold text-gray-700">Net Payment</span>
                  <span className="font-bold text-emerald-600 text-lg">${net.toLocaleString()}</span>
                </div>
              </div>

              {/* Speed */}
              <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-violet-50 rounded-lg">
                <Zap size={14} className="text-violet-500" />
                <span className="text-xs text-violet-700">
                  <strong>{tierSpeed}</strong> payment ({carvanTier} tier)
                </span>
              </div>

              {/* Factoring Comparison */}
              <div className="px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-lg mb-5">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-emerald-600 mt-0.5 shrink-0" />
                  <div className="text-xs text-emerald-700">
                    <p>With factoring you&apos;d pay ~<strong>${factoringFee.toLocaleString()}</strong> ({FACTORING_RATE}%).</p>
                    <p className="font-semibold mt-0.5">SRL Quick Pay saves you ${savings.toLocaleString()} on this payment.</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setQpModal(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => quickPayMutation.mutate(qpModal.id)}
                  disabled={quickPayMutation.isPending}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-violet-500 rounded-lg hover:bg-violet-600 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                >
                  <Zap size={14} />
                  {quickPayMutation.isPending ? "Requesting..." : "Confirm Quick Pay"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
