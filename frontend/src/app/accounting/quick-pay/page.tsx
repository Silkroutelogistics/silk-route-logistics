"use client";

import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Zap, Search, Clock, DollarSign, ChevronLeft, ChevronRight, CheckCircle2, X, AlertTriangle } from "lucide-react";
import { useToast } from "@/components/ui/Toast";

interface QuickPayRequest {
  id: string;
  paymentNumber: string;
  loadId: string;
  amount: number;
  quickPayFeeAmount: number;
  quickPayFeePercent?: number | null;
  netAmount: number;
  paymentTier: string;
  status: string;
  createdAt: string;
  slaHours: number;
  slaDeadline: string;
  hoursRemaining: number;
  isOverdue: boolean;
  load: { referenceNumber: string; originCity: string; originState: string; destCity: string; destState: string };
  carrier: {
    id: string;
    company: string | null;
    firstName: string;
    lastName: string;
    // v3.8.aaa Sprint 23: canonical Caravan Partner Program tier
    // (Silver/Gold/Platinum) per memory #7. Resolved from
    // CarrierProfile.tier on the backend include.
    carrierProfile?: { tier: string } | null;
  };
}

// v3.8.aab Sprint 24: canonical SRL palette per skill tokens.md.
// Sprint 23 shipped this constant with Tailwind slate/yellow/purple —
// structurally correct (canonical tier names) but visually off-brand.
// Sprint 24 swaps to canonical SRL tokens (navy-300 silver, --gold,
// --gold-dark, --navy). Coherent progression: Sprint 23 = right NAMES,
// Sprint 24 = right COLORS.
const CARAVAN_TIER_BADGE: Record<string, { label: string; bg: string; text: string }> = {
  SILVER:   { label: "Silver",   bg: "bg-[#8AA5C0]/15", text: "text-[#5B7EA3]" },
  GOLD:     { label: "Gold",     bg: "bg-[#C5A572]/15", text: "text-[#BA7517]" },
  PLATINUM: { label: "Platinum", bg: "bg-[#0A2540]",     text: "text-[#C5A572]" },
  GUEST:    { label: "Guest",    bg: "bg-slate-600/20",  text: "text-slate-400" },
  NONE:     { label: "—",        bg: "bg-white/5",       text: "text-slate-500" },
};

// v3.8.aaa Sprint 23: legacy PaymentTier enum → canonical payment-speed
// label. The legacy 5-tier encoded payment SPEED only; canonical Caravan
// Partner Program model encodes tier × speed orthogonally. This map shows
// the speed dimension of legacy records on the AE Console UI without
// touching the underlying PaymentTier enum (data model split deferred to
// separate sprint per directive decision #5). Backend SLA hours stay
// legacy-encoded per directive decision #4 — operational deadlines
// preserved for AE workflow.
const SPEED_LABEL: Record<string, { label: string; color: string }> = {
  FLASH:    { label: "Same-Day",      color: "text-slate-300" },
  EXPRESS:  { label: "Same-Day",      color: "text-slate-300" },
  PRIORITY: { label: "7-Day Quick Pay", color: "text-slate-400" },
  PARTNER:  { label: "7-Day Quick Pay", color: "text-slate-400" },
  ELITE:    { label: "7-Day Quick Pay", color: "text-slate-400" },
  STANDARD: { label: "Standard",      color: "text-slate-500" },
};

// Canonical Caravan Partner Program rate matrix per memory #7 + CLAUDE.md
// §8 + frontend/public/carriers.html line 217-649. Reference for the
// legend bar at the top of the QP queue page.
const CARAVAN_RATE_MATRIX: Array<{ tier: string; standard: string; sevenDay: string; sameDay: string }> = [
  { tier: "Silver",   standard: "Net-30", sevenDay: "3%", sameDay: "5%" },
  { tier: "Gold",     standard: "Net-21", sevenDay: "2%", sameDay: "4%" },
  { tier: "Platinum", standard: "Net-14", sevenDay: "1%", sameDay: "3%" },
];

function feePercentLabel(req: QuickPayRequest): string {
  if (typeof req.quickPayFeePercent === "number" && req.quickPayFeePercent > 0) {
    return `${req.quickPayFeePercent}%`;
  }
  // Fallback: derive from fee amount over gross when API omits the field
  if (req.amount > 0 && req.quickPayFeeAmount >= 0) {
    const pct = (req.quickPayFeeAmount / req.amount) * 100;
    return `${pct.toFixed(1)}%`;
  }
  return "—";
}

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export default function QuickPayQueuePage() {
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["quick-pay-queue", page],
    queryFn: () => api.get<{ queue: QuickPayRequest[]; total: number; totalPages: number }>(`/accounting/payments/queue?page=${page}`).then(r => r.data),
  });

  const processMutation = useMutation({
    mutationFn: (id: string) => api.post(`/accounting/payments/${id}/approve`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["quick-pay-queue"] }); queryClient.invalidateQueries({ queryKey: ["factoring-fund"] }); },
    onError: () => toast("Operation failed", "error"),
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
            <p className="text-xs text-slate-400">Queue Total</p>
            <p className="text-lg font-bold text-[#C8963E]">{data.total} requests</p>
          </div>
        )}
      </div>

      {/* Caravan Partner Program rate matrix (canonical per memory #7) */}
      <div className="mb-6 bg-white/5 border border-white/5 rounded-xl px-5 py-3">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-white">Caravan Partner Program</span>
          <span className="text-[10px] text-slate-500">Tier × Speed rate matrix</span>
        </div>
        <div className="grid grid-cols-4 gap-3 text-xs">
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Tier</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Standard</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">7-Day QP</div>
          <div className="text-[10px] uppercase tracking-wider text-slate-500">Same-Day</div>
          {CARAVAN_RATE_MATRIX.map((r) => {
            const badge = CARAVAN_TIER_BADGE[r.tier.toUpperCase()];
            return (
              <React.Fragment key={r.tier}>
                <div>
                  <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${badge.bg} ${badge.text}`}>{r.tier}</span>
                </div>
                <div className="text-slate-300">{r.standard}</div>
                <div className="text-slate-300">{r.sevenDay}</div>
                <div className="text-slate-300">{r.sameDay}</div>
              </React.Fragment>
            );
          })}
        </div>
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
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Speed</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Gross</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Fee</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Net</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">SLA</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Requested</th>
              <th className="text-right text-xs text-slate-500 font-medium px-5 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              [...Array(5)].map((_, i) => <tr key={i}><td colSpan={11} className="px-5 py-3"><div className="h-5 bg-white/5 rounded animate-pulse" /></td></tr>)
            ) : data?.queue?.length ? (
              data.queue.map(req => {
                // v3.8.aaa Sprint 23: canonical Caravan Partner Program tier
                // (Silver/Gold/Platinum) from CarrierProfile.tier; speed label
                // derived from legacy PaymentTier enum.
                const caravanTier = req.carrier.carrierProfile?.tier || "NONE";
                const tierBadge = CARAVAN_TIER_BADGE[caravanTier] || CARAVAN_TIER_BADGE.NONE;
                const speed = SPEED_LABEL[req.paymentTier] || SPEED_LABEL.STANDARD;
                return (
                  <tr key={req.id} className="hover:bg-[#0F1117]">
                    <td className="px-5 py-3 text-sm text-white font-medium">{req.paymentNumber}</td>
                    <td className="px-5 py-3 text-sm text-slate-300">{req.load.referenceNumber}</td>
                    <td className="px-5 py-3">
                      <p className="text-sm text-slate-300">{req.carrier.company || `${req.carrier.firstName} ${req.carrier.lastName}`}</p>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium ${tierBadge.bg} ${tierBadge.text}`}>{tierBadge.label}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs ${speed.color}`}>{speed.label}</span>
                    </td>
                    <td className="px-5 py-3 text-sm text-white">{fmt(req.amount)}</td>
                    <td className="px-5 py-3 text-sm text-yellow-400">-{fmt(req.quickPayFeeAmount)} <span className="text-[10px] text-slate-500">({feePercentLabel(req)})</span></td>
                    <td className="px-5 py-3 text-sm text-green-400 font-medium">{fmt(req.netAmount)}</td>
                    <td className="px-5 py-3">
                      {req.isOverdue ? (
                        <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 font-medium">
                          <AlertTriangle className="w-3 h-3" /> OVERDUE
                        </span>
                      ) : (
                        <span className={`text-xs font-medium ${req.hoursRemaining > 12 ? "text-green-400" : req.hoursRemaining >= 2 ? "text-yellow-400" : "text-red-400"}`}>
                          {req.hoursRemaining.toFixed(1)}h left
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-xs text-slate-400">{new Date(req.createdAt).toLocaleString()}</td>
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
              <tr><td colSpan={11} className="px-5 py-12 text-center text-sm text-slate-500">No quick pay requests in queue</td></tr>
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
