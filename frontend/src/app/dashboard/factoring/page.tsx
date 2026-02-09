"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DollarSign, ArrowRight, CheckCircle2, Clock, AlertCircle, Zap } from "lucide-react";

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  factoringFee: number | null;
  advanceRate: number | null;
  advanceAmount: number | null;
  createdAt: string;
  paidAt: string | null;
  load?: {
    referenceNumber: string;
    originCity: string;
    originState: string;
    destCity: string;
    destState: string;
  } | null;
}

const FACTORING_FEE_PCT = 3;
const ADVANCE_RATE_PCT = 97;

const STATUS_COLORS: Record<string, string> = {
  SUBMITTED: "bg-blue-500/20 text-blue-400",
  APPROVED: "bg-emerald-500/20 text-emerald-400",
  FUNDED: "bg-green-500/20 text-green-400",
  PAID: "bg-green-500/20 text-green-400",
  REJECTED: "bg-red-500/20 text-red-400",
  DRAFT: "bg-slate-500/20 text-slate-400",
  UNDER_REVIEW: "bg-purple-500/20 text-purple-400",
};

export default function FactoringPage() {
  const queryClient = useQueryClient();
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);

  const { data: invoices } = useQuery({
    queryKey: ["factoring-invoices"],
    queryFn: () => api.get<Invoice[]>("/invoices").then((r) => r.data),
  });

  const submitForFactoring = useMutation({
    mutationFn: (id: string) => api.patch(`/invoices/${id}`, {
      status: "APPROVED",
      factoringFee: selectedInvoice ? selectedInvoice.amount * (FACTORING_FEE_PCT / 100) : 0,
      advanceRate: ADVANCE_RATE_PCT,
      advanceAmount: selectedInvoice ? selectedInvoice.amount * (ADVANCE_RATE_PCT / 100) : 0,
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["factoring-invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setSelectedInvoice(null);
    },
  });

  const eligible = invoices?.filter((i) => i.status === "SUBMITTED" || i.status === "UNDER_REVIEW") || [];
  const factored = invoices?.filter((i) => i.status === "APPROVED" || i.status === "FUNDED" || i.status === "PAID") || [];
  const totalAdvanced = factored.reduce((s, i) => s + (i.advanceAmount || 0), 0);
  const totalFees = factored.reduce((s, i) => s + (i.factoringFee || 0), 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Freight Factoring</h1>
        <p className="text-slate-400 text-sm mt-1">Get paid faster — up to {ADVANCE_RATE_PCT}% advance within 24 hours</p>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-4 gap-4">
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-gold"><Zap className="w-5 h-5" /></div>
            <span className="text-sm text-slate-400">Eligible Invoices</span>
          </div>
          <p className="text-2xl font-bold text-white">{eligible.length}</p>
        </div>
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-gold"><DollarSign className="w-5 h-5" /></div>
            <span className="text-sm text-slate-400">Total Advanced</span>
          </div>
          <p className="text-2xl font-bold text-green-400">${totalAdvanced.toLocaleString()}</p>
        </div>
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-gold"><Clock className="w-5 h-5" /></div>
            <span className="text-sm text-slate-400">Factoring Fees</span>
          </div>
          <p className="text-2xl font-bold text-amber-400">${totalFees.toLocaleString()}</p>
        </div>
        <div className="bg-white/5 rounded-xl border border-white/10 p-5">
          <div className="flex items-center gap-3 mb-2">
            <div className="text-gold"><CheckCircle2 className="w-5 h-5" /></div>
            <span className="text-sm text-slate-400">Factored Loads</span>
          </div>
          <p className="text-2xl font-bold text-white">{factored.length}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Eligible Invoices */}
        <div className="lg:col-span-2 space-y-4">
          <h2 className="font-semibold text-white">Eligible for Factoring</h2>
          {eligible.length === 0 ? (
            <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center">
              <CheckCircle2 className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500">No invoices pending factoring</p>
            </div>
          ) : (
            <div className="space-y-3">
              {eligible.map((inv) => (
                <button key={inv.id} onClick={() => setSelectedInvoice(inv)}
                  className={`w-full text-left bg-white/5 rounded-xl border p-5 transition ${selectedInvoice?.id === inv.id ? "border-gold" : "border-white/10 hover:border-white/20"}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-white font-mono">{inv.invoiceNumber}</p>
                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[inv.status] || ""}`}>{inv.status}</span>
                      </div>
                      {inv.load && (
                        <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                          {inv.load.originCity}, {inv.load.originState} <ArrowRight className="w-3 h-3" /> {inv.load.destCity}, {inv.load.destState}
                          <span className="text-slate-500 ml-2">({inv.load.referenceNumber})</span>
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-white">${inv.amount.toLocaleString()}</p>
                      <p className="text-xs text-slate-500">{new Date(inv.createdAt).toLocaleDateString()}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Factored History */}
          {factored.length > 0 && (
            <>
              <h2 className="font-semibold text-white mt-6">Factored Invoices</h2>
              <div className="bg-white/5 rounded-xl border border-white/10 overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-slate-400 border-b border-white/10">
                      <th className="text-left px-5 py-3 font-medium">Invoice</th>
                      <th className="text-right px-5 py-3 font-medium">Amount</th>
                      <th className="text-right px-5 py-3 font-medium">Fee ({FACTORING_FEE_PCT}%)</th>
                      <th className="text-right px-5 py-3 font-medium">Advanced</th>
                      <th className="text-left px-5 py-3 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {factored.map((inv) => (
                      <tr key={inv.id} className="border-b border-white/5">
                        <td className="px-5 py-3 text-white font-mono text-xs">{inv.invoiceNumber}</td>
                        <td className="px-5 py-3 text-right text-white">${inv.amount.toLocaleString()}</td>
                        <td className="px-5 py-3 text-right text-amber-400">${(inv.factoringFee || 0).toLocaleString()}</td>
                        <td className="px-5 py-3 text-right text-green-400">${(inv.advanceAmount || 0).toLocaleString()}</td>
                        <td className="px-5 py-3">
                          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_COLORS[inv.status] || ""}`}>{inv.status}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {/* Factoring Calculator */}
        <div>
          {selectedInvoice ? (
            <div className="bg-white/5 rounded-xl border border-white/10 p-5 space-y-4 sticky top-6">
              <h3 className="font-semibold text-white text-sm">Factoring Breakdown</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-slate-400">Invoice</span>
                  <span className="text-white font-mono">{selectedInvoice.invoiceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Invoice Amount</span>
                  <span className="text-white font-bold">${selectedInvoice.amount.toLocaleString()}</span>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Factoring Fee ({FACTORING_FEE_PCT}%)</span>
                    <span className="text-amber-400">-${(selectedInvoice.amount * FACTORING_FEE_PCT / 100).toFixed(2)}</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Advance Rate</span>
                  <span className="text-white">{ADVANCE_RATE_PCT}%</span>
                </div>
                <div className="border-t border-white/10 pt-3">
                  <div className="flex justify-between">
                    <span className="text-slate-400 font-medium">You Receive</span>
                    <span className="text-green-400 font-bold text-lg">${(selectedInvoice.amount * ADVANCE_RATE_PCT / 100).toFixed(2)}</span>
                  </div>
                </div>
              </div>
              <div className="bg-gold/10 border border-gold/20 rounded-lg p-3 text-xs text-gold">
                Funds deposited within 24 hours of approval
              </div>
              <button onClick={() => submitForFactoring.mutate(selectedInvoice.id)}
                disabled={submitForFactoring.isPending}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90 disabled:opacity-50">
                <Zap className="w-4 h-4" /> Submit for Factoring
              </button>
            </div>
          ) : (
            <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center">
              <DollarSign className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm text-slate-500">Select an invoice to see factoring breakdown</p>
            </div>
          )}

          {/* How It Works */}
          <div className="bg-white/5 rounded-xl border border-white/10 p-5 mt-4">
            <h3 className="font-semibold text-white text-sm mb-3">How It Works</h3>
            <div className="space-y-3">
              {[
                { step: "1", title: "Submit Invoice", desc: "Select an eligible invoice from your completed loads" },
                { step: "2", title: "Instant Approval", desc: `We verify and approve with a ${FACTORING_FEE_PCT}% fee` },
                { step: "3", title: "Get Paid", desc: `Receive ${ADVANCE_RATE_PCT}% advance within 24 hours` },
              ].map((s) => (
                <div key={s.step} className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-gold/20 text-gold flex items-center justify-center text-xs font-bold shrink-0">{s.step}</div>
                  <div>
                    <p className="text-sm text-white font-medium">{s.title}</p>
                    <p className="text-xs text-slate-400">{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
