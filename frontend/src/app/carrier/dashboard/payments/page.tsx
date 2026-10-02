"use client";

import { useState } from "react";
import { DollarSign, Zap, Calendar, TrendingUp, Download, X, CheckCircle, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CarrierCard, CarrierBadge } from "@/components/carrier";
import { statusDisplay } from "@/lib/carrierStatus";
import { BTN } from "@/lib/carrierUi";
import { useCarrierAuth } from "@/hooks/useCarrierAuth";

// carrier-portal-upgrade G11: the three states that mean something is wrong with
// a carrier's pay now have chips of their own. Labels come from lib/carrierStatus.
const statusFilters = ["All", "PENDING", "APPROVED", "PROCESSING", "SCHEDULED", "PAID", "ON_HOLD", "DISPUTED", "REJECTED"];

// Caravan Partner Program (v3.7.a) — 3 tiers. Silver is Day-1 entry.
// v3 QP pricing: Silver 3%/7-day (5% same-day), Gold 2%/7-day (4% same-day),
// Platinum 1%/7-day (3% same-day). Same-day is a +2% universal premium.
const CARAVAN_TIER_MAP: Record<string, string> = {
  GUEST: "SILVER", NONE: "SILVER", SILVER: "SILVER", GOLD: "GOLD", PLATINUM: "PLATINUM",
};
const QP_FEES: Record<string, number> = { SILVER: 3.0, GOLD: 2.0, PLATINUM: 1.0 };
const QP_DAYS: Record<string, number> = { SILVER: 7, GOLD: 7, PLATINUM: 7 };
const FACTORING_RATE = 4.5;

// v3.8.asb — the carrier's Quick Pay pilot standing, from
// GET /carrier-auth/activation-status. Optional throughout so a frontend
// deployed ahead of the backend degrades to the account flag rather than
// crashing on a missing field.
interface QuickPayStanding {
  quickPay: {
    enabled: boolean;
    signed: boolean;
    pilotStatus?: "PENDING" | "APPROVED" | "DECLINED" | "WITHDRAWN" | null;
    pilotReason?: string | null;
  };
}

export default function CarrierPaymentsPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [page, setPage] = useState(1);
  const [qpModal, setQpModal] = useState<any | null>(null);
  const [qpSuccess, setQpSuccess] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const { user } = useCarrierAuth();
  const rawTier = user?.carrierProfile?.tier || "NONE";
  const caravanTier = CARAVAN_TIER_MAP[rawTier] || "SILVER";
  const tierFeeRate = QP_FEES[caravanTier];
  const tierDays = QP_DAYS[caravanTier];

  // v3.8.asb — Quick Pay is a pilot, so the per-payment control is gated on
  // the carrier's standing, not just on the load.
  //
  // POST /carrier-payments/:id/request-quickpay refuses on three separate
  // conditions and this page previously checked only the third:
  //   403 QP_AGREEMENT_NOT_SIGNED  no SIGNED quick-pay CarrierAgreement
  //   403 QP_NOT_ENABLED           quickPayEnabled is not true
  //   422 QP_NOT_ELECTED_ON_LOAD   no fee recorded on the load
  // A carrier approved into the pilot but not yet signed, or one withdrawn
  // from it, would see a button and be refused by it. Both halves are checked
  // here now so the button appears only when the request can actually succeed.
  const { data: standing } = useQuery<QuickPayStanding>({
    queryKey: ["carrier-activation"],
    queryFn: () => api.get("/carrier-auth/activation-status").then((r) => r.data),
    staleTime: 60_000,
  });
  const qpOn = standing?.quickPay?.enabled === true && standing?.quickPay?.signed === true;
  const pilotStatus = standing?.quickPay?.pilotStatus ?? null;
  // What to tell a carrier whose loads carry no Quick Pay control. Keyed to the
  // state that actually applies, because "not available" is four different
  // conversations and only one of them is something they can act on.
  const pilotNotice: { tone: "info" | "warn"; text: string; cta?: { label: string; href: string } } | null = qpOn
    ? null
    : standing?.quickPay?.enabled === true && standing?.quickPay?.signed !== true
      ? {
          tone: "warn",
          text: "Quick Pay is on for your account but the Caravan Quick Pay Agreement is not signed, so no load can be funded early yet.",
          cta: { label: "Read and sign", href: "/carrier/dashboard/activation" },
        }
      : pilotStatus === "APPROVED"
        ? {
            tone: "warn",
            text: "You are approved for the Quick Pay pilot. Read and sign the Caravan Quick Pay Agreement and Quick Pay turns on for your loads.",
            cta: { label: "Read and sign", href: "/carrier/dashboard/activation" },
          }
        : pilotStatus === "PENDING"
          ? {
              tone: "info",
              text: "Your request to join the Quick Pay pilot is with our team. Until it is decided your loads pay your standard tier terms, at no fee.",
            }
          : pilotStatus === "DECLINED"
            ? {
                tone: "info",
                text: "Your Quick Pay pilot request was not approved, so these loads pay your standard tier terms at no fee. Your rep can look again if something has changed.",
                cta: { label: "See the reason", href: "/carrier/dashboard/activation" },
              }
            : pilotStatus === "WITHDRAWN"
              ? {
                  tone: "info",
                  text: "Quick Pay has been withdrawn from your account. Loads already funded under Quick Pay keep their fee and payment date; everything else pays your standard tier terms at no fee.",
                  cta: { label: "See the reason", href: "/carrier/dashboard/activation" },
                }
              : {
                  tone: "info",
                  text: "Quick Pay is running as a limited pilot and you are not in it, so these loads pay your standard tier terms at no fee. Standard pay is free at every tier.",
                };

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
      setQpSuccess(`Quick Pay requested. Estimated payment in ${tierDays === 0 ? "same day" : `${tierDays} day${tierDays > 1 ? "s" : ""}`}.`);
      setTimeout(() => setQpSuccess(null), 5000);
    },
  });

  const payments = data?.payments || [];

  const exportCSV = () => {
    if (!payments.length) return;
    const headers = ["Payment #", "Load Ref", "Gross", "Discount", "Net", "Status", "Method", "Date"];
    const rows = payments.map((pay: Record<string, any>) => [
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
          <h1 className="font-serif font-bold text-2xl text-[#0A2540] mb-1">Payments &amp; Earnings</h1>
          <p className="text-[13px] text-[#5B6B7D]">Track your payment history, pending earnings, and QuickPay options</p>
        </div>
        <button onClick={exportCSV} className="inline-flex items-center gap-1.5 text-[#5B6B7D] text-[11px] font-semibold uppercase tracking-wider hover:text-[#BA7517]">
          <Download size={14} /> Export
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-2 mb-2">
            <TrendingUp size={16} className="text-[#2F7A4F]" />
            <span className="text-[11px] text-[#3A4A5F]">YTD Earnings</span>
          </div>
          <div className="text-[28px] font-bold text-[#0A2540]">
            ${(summary?.ytdEarnings?.amount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-[#3A4A5F] mt-1">{summary?.ytdEarnings?.count || 0} loads</div>
        </CarrierCard>
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-2 mb-2">
            <DollarSign size={16} className="text-[#2F7A4F]" />
            <span className="text-[11px] text-[#3A4A5F]">Total Paid</span>
          </div>
          <div className="text-[28px] font-bold text-[#2F7A4F]">
            ${(summary?.totalPaid?.amount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-[#3A4A5F] mt-1">{summary?.totalPaid?.count || 0} payments</div>
        </CarrierCard>
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-2 mb-2">
            <Calendar size={16} className="text-[#B07A1A]" />
            <span className="text-[11px] text-[#3A4A5F]">Pending</span>
          </div>
          <div className="text-[28px] font-bold text-[#B07A1A]">
            ${(summary?.totalPending?.amount || 0).toLocaleString()}
          </div>
          <div className="text-[11px] text-[#3A4A5F] mt-1">{summary?.totalPending?.count || 0} pending</div>
        </CarrierCard>
        <CarrierCard padding="p-5">
          <div className="flex items-center gap-2 mb-2">
            <Zap size={16} className="text-[#BA7517]" />
            <span className="text-[11px] text-[#3A4A5F]">QuickPay Used</span>
          </div>
          <div className="text-[28px] font-bold text-[#0A2540]">
            {summary?.quickPayUsed?.count || 0}
          </div>
          <div className="text-[11px] text-[#3A4A5F] mt-1">
            ${(summary?.quickPayUsed?.discount || 0).toLocaleString()} in fees
          </div>
        </CarrierCard>
      </div>

      {/* v3.8.asb — Quick Pay pilot standing. Explains the empty QuickPay
          column instead of leaving a carrier to guess why the control they
          were told about is not there. */}
      {pilotNotice && (
        <div
          className={`mb-4 flex flex-wrap items-center gap-2 px-4 py-2.5 rounded-lg border text-[12px] ${
            pilotNotice.tone === "warn"
              ? "bg-[#FBEFD4]/60 border-[#B07A1A]/30 text-[#B07A1A]"
              : "bg-[#F5EEE0] border-[#EFE6D3] text-[#3A4A5F]"
          }`}
        >
          <Zap size={14} className="shrink-0" />
          <span>{pilotNotice.text}</span>
          {pilotNotice.cta && (
            <a href={pilotNotice.cta.href} className="font-semibold underline hover:no-underline">
              {pilotNotice.cta.label}
            </a>
          )}
        </div>
      )}

      {/* Filters */}
      <CarrierCard padding="p-3" className="mb-4">
        <div className="flex gap-1.5 flex-wrap">
          {statusFilters.map((f) => (
            <button
              key={f}
              onClick={() => { setActiveFilter(f); setPage(1); }}
              aria-pressed={f === activeFilter}
              className={`min-h-[44px] px-3 rounded-full text-[12px] font-medium transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517] ${
                f === activeFilter ? "bg-[#0A2540] text-[#FBF7F0]" : "bg-[#F5EEE0] text-[#3A4A5F] hover:bg-[#EFE6D3]"
              }`}
            >{f === "All" ? f : statusDisplay("pay", f).label}</button>
          ))}
        </div>
      </CarrierCard>

      {/* Payment Table */}
      <CarrierCard padding="p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-[13px] block md:table">
            <thead className="hidden md:table-header-group">
              <tr className="bg-[#FBF7F0]">
                {["Payment #", "Load", "Route", "Amount", "Status", "Date", "QuickPay"].map((h) => (
                  <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-[#5B6B7D] tracking-wide uppercase whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="block md:table-row-group">
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <tr key={i} className="block md:table-row p-3 md:p-0 border-b border-[#F5EEE0]">
                    {[...Array(7)].map((_, j) => (
                      <td key={j} className="block md:table-cell px-0 py-1 md:px-4 md:py-3"><div className="h-4 bg-[#F5EEE0] rounded animate-pulse motion-reduce:animate-none w-16" /></td>
                    ))}
                  </tr>
                ))
              ) : payments.length === 0 ? (
                <tr className="block md:table-row"><td colSpan={7} className="block md:table-cell px-4 py-12 text-center text-sm text-[#3A4A5F]">{activeFilter === "All" ? "No payments yet. Pay for each load appears here once it is delivered and its paperwork is in." : "No payments with this status. Choose All to see every payment."}</td></tr>
              ) : (
                payments.map((pay: Record<string, any>) => (
                  <tr key={pay.id} className="block md:table-row p-3 md:p-0 border-b border-[#F5EEE0] hover:bg-[#FBF7F0]">
                    <td data-label="Payment" className="block md:table-cell px-0 py-1 md:px-4 md:py-3 before:content-[attr(data-label)] before:block before:text-[10px] before:uppercase before:tracking-wide before:text-[#5B6B7D] md:before:content-none font-mono text-[11px] font-semibold text-[#0A2540]">{pay.paymentNumber || pay.id.slice(-8)}</td>
                    <td data-label="Load" className="block md:table-cell px-0 py-1 md:px-4 md:py-3 before:content-[attr(data-label)] before:block before:text-[10px] before:uppercase before:tracking-wide before:text-[#5B6B7D] md:before:content-none font-mono text-[11px] text-[#3A4A5F]">
                      {/* E6 — a payment row names its load; the load is one click away. */}
                      {pay.load?.id ? (
                        <a href={`/carrier/dashboard/my-loads?load=${encodeURIComponent(pay.load.id)}`} data-testid="payment-load-link" className="inline-flex min-h-[44px] items-center text-[#0A2540] underline hover:text-[#854F0B] rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517]">
                          {pay.load.referenceNumber || pay.load.id}
                        </a>
                      ) : "Not set"}
                    </td>
                    <td data-label="Route" className="block md:table-cell px-0 py-1 md:px-4 md:py-3 before:content-[attr(data-label)] before:block before:text-[10px] before:uppercase before:tracking-wide before:text-[#5B6B7D] md:before:content-none text-xs text-[#3A4A5F]">
                      {pay.load ? `${pay.load.originCity}, ${pay.load.originState} → ${pay.load.destCity}, ${pay.load.destState}` : "Not set"}
                    </td>
                    <td data-label="Amount" className="block md:table-cell px-0 py-1 md:px-4 md:py-3 before:content-[attr(data-label)] before:block before:text-[10px] before:uppercase before:tracking-wide before:text-[#5B6B7D] md:before:content-none font-bold text-[#0A2540]">
                      ${(pay.netAmount || pay.amount || 0).toLocaleString()}
                      {pay.quickPayDiscount > 0 && (
                        <span className="text-[10px] text-[#3A4A5F] ml-1">(-${pay.quickPayDiscount})</span>
                      )}
                    </td>
                    <td data-label="Status" className="block md:table-cell px-0 py-1 md:px-4 md:py-3 before:content-[attr(data-label)] before:block before:text-[10px] before:uppercase before:tracking-wide before:text-[#5B6B7D] md:before:content-none"><CarrierBadge kind="pay" status={pay.status} /></td>
                    <td data-label="Date" className="block md:table-cell px-0 py-1 md:px-4 md:py-3 before:content-[attr(data-label)] before:block before:text-[10px] before:uppercase before:tracking-wide before:text-[#5B6B7D] md:before:content-none text-xs text-[#5B6B7D]">
                      {pay.paidAt ? new Date(pay.paidAt).toLocaleDateString() : new Date(pay.createdAt).toLocaleDateString()}
                    </td>
                    <td data-label="Quick Pay" className="block md:table-cell px-0 py-1 md:px-4 md:py-3 before:content-[attr(data-label)] before:block before:text-[10px] before:uppercase before:tracking-wide before:text-[#5B6B7D] md:before:content-none">
                      {/* The control is shown only when the load carries a recorded
                          Quick Pay election. The backend requires one and 422s
                          QP_NOT_ELECTED_ON_LOAD without it, so an ungated button
                          offers the carrier something that can never succeed.
                          Auto-generated rate confirmations record no election
                          today, which is most loads.

                          v3.8.asb — `qpOn` added. The load half was already
                          checked; the ACCOUNT half was not, so an approved
                          carrier who had not signed, or one withdrawn from the
                          pilot, still got a button that 403s. Both halves now
                          match the three conditions the endpoint enforces. */}
                      {qpOn &&
                       (pay.status === "PENDING" || pay.status === "APPROVED") &&
                       typeof pay.load?.quickPayFeePercent === "number" &&
                       pay.load.quickPayFeePercent > 0 ? (
                        <button
                          onClick={() => setQpModal(pay)}
                          disabled={quickPayMutation.isPending}
                          className="inline-flex min-h-[44px] items-center gap-1 px-3 bg-[#FAEEDA] text-[#854F0B] text-[12px] font-semibold rounded hover:bg-[#F3E3C4] disabled:opacity-50 transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA7517]"
                        >
                          <Zap size={12} /> QuickPay
                        </button>
                      ) : pay.paymentMethod === "FLASH" || pay.quickPayDiscount > 0 ? (
                        <span className="text-[11px] text-[#BA7517] font-medium flex items-center gap-1"><Zap size={12} /> Used</span>
                      ) : (
                        <span className="text-[11px] text-[#3A4A5F]">Not used</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {data && data.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-[#F5EEE0] flex justify-between items-center text-xs text-[#5B6B7D]">
            <span>Page {page} of {data.totalPages}</span>
            <div className="flex gap-1">
              {page > 1 && <button onClick={() => setPage(page - 1)} className={BTN.secondary}>Previous</button>}
              {page < data.totalPages && <button onClick={() => setPage(page + 1)} className={BTN.secondary}>Next</button>}
            </div>
          </div>
        )}
      </CarrierCard>

      {quickPayMutation.isError && (
        <div className="mt-3 px-4 py-2 bg-[#F6E3E3] border border-[#9B2C2C]/30 rounded text-xs text-[#9B2C2C]">
          {(quickPayMutation.error as any)?.response?.data?.error || "QuickPay request failed"}
        </div>
      )}

      {/* Success Toast */}
      {qpSuccess && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 bg-[#E6F0E9] border border-[#2F7A4F]/30 rounded-lg shadow-lg animate-in slide-in-from-bottom">
          <CheckCircle size={16} className="text-[#2F7A4F] shrink-0" />
          <span className="text-sm text-[#2F7A4F] font-medium">{qpSuccess}</span>
          <button onClick={() => setQpSuccess(null)} className="text-[#2F7A4F] hover:text-[#2F7A4F] ml-2">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Quick Pay Confirmation Modal */}
      {qpModal && (() => {
        const gross = qpModal.grossAmount || qpModal.amount || 0;
        // v3.8.asb — price from the fee RECORDED ON THE LOAD, never re-derived
        // from the tier ladder. Quick Pay Agreement §3: "a load is priced by
        // the Quick Pay speed recorded on that load when its rate confirmation
        // was issued, and by nothing else", and carrierPayments.ts reads
        // load.quickPayFeePercent for exactly that reason. Deriving it here
        // from the carrier's CURRENT tier showed a number the settlement would
        // not match the moment a carrier advanced a tier, or whenever a
        // per-load override was in play. The button only renders when this is
        // a positive number, so the fallback is unreachable and defensive.
        const recordedPct: number =
          typeof qpModal.load?.quickPayFeePercent === "number" ? qpModal.load.quickPayFeePercent : tierFeeRate;
        const fee = Math.round(gross * (recordedPct / 100) * 100) / 100;
        const net = Math.round((gross - fee) * 100) / 100;
        const factoringFee = Math.round(gross * (FACTORING_RATE / 100) * 100) / 100;
        const savings = Math.round((factoringFee - fee) * 100) / 100;
        const loadRef = qpModal.load?.referenceNumber || qpModal.paymentNumber || qpModal.id.slice(-8);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/50 " onClick={() => setQpModal(null)} />
            <div className="relative bg-white rounded-xl shadow-2xl max-w-md w-full p-6">
              <button onClick={() => setQpModal(null)} className="absolute top-4 right-4 text-[#3A4A5F] hover:text-[#3A4A5F]">
                <X size={18} />
              </button>

              <div className="flex items-center gap-2 mb-4">
                <div className="w-10 h-10 rounded-lg bg-[#FAEEDA] flex items-center justify-center">
                  <Zap size={20} className="text-[#BA7517]" />
                </div>
                <div>
                  <h3 className="text-[15px] font-bold text-[#0A2540]">Request Quick Pay</h3>
                  <p className="text-[11px] text-[#3A4A5F]">Load {loadRef}</p>
                </div>
              </div>

              {/* Fee Breakdown */}
              <div className="bg-[#F5EEE0] rounded-lg p-4 mb-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-[#5B6B7D]">Gross Amount</span>
                  <span className="font-semibold text-[#0A2540]">${gross.toLocaleString()}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-[#5B6B7D]">QP Fee ({recordedPct}%)</span>
                  <span className="font-semibold text-[#9B2C2C]">-${fee.toLocaleString()}</span>
                </div>
                <div className="border-t border-[#EFE6D3] pt-2 flex justify-between text-sm">
                  <span className="font-semibold text-[#3A4A5F]">Net Payment</span>
                  <span className="font-bold text-[#2F7A4F] text-lg">${net.toLocaleString()}</span>
                </div>
              </div>

              {/* v3.8.asb — states the fee recorded on this load, not the tier
                  ladder. The speed itself is not on this payload, so it is not
                  claimed here; the agreement points the carrier at their rep,
                  and the settlement itemises what was actually charged. */}
              <div className="flex items-center gap-2 mb-4 px-3 py-2 bg-[#FAEEDA] rounded-lg">
                <Zap size={14} className="text-[#BA7517]" />
                <span className="text-xs text-[#BA7517]">
                  <strong>{recordedPct}%</strong> recorded on this load when we issued its rate confirmation
                  {caravanTier ? <> · {caravanTier} tier</> : null}
                </span>
              </div>

              {/* Factoring Comparison */}
              <div className="px-3 py-2.5 bg-[#E6F0E9] border border-[#2F7A4F]/30 rounded-lg mb-5">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={14} className="text-[#2F7A4F] mt-0.5 shrink-0" />
                  <div className="text-xs text-[#2F7A4F]">
                    <p>With factoring you would pay ~<strong>${factoringFee.toLocaleString()}</strong> ({FACTORING_RATE}%).</p>
                    <p className="font-semibold mt-0.5">SRL Quick Pay saves you ${savings.toLocaleString()} on this payment.</p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setQpModal(null)}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-[#3A4A5F] bg-gray-100 rounded-lg hover:bg-gray-200 transition"
                >
                  Cancel
                </button>
                <button
                  onClick={() => quickPayMutation.mutate(qpModal.id)}
                  disabled={quickPayMutation.isPending}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-[#FBF7F0] bg-[#BA7517] rounded-lg hover:bg-[#854F0B] transition disabled:opacity-50 flex items-center justify-center gap-1.5"
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
