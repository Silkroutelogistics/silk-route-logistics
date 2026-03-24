"use client";

import { useState } from "react";
import { Download, AlertTriangle } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ShipperCard, ShipperBadge } from "@/components/shipper";
import type { InvoicesResponse } from "@/components/shipper/shipperData";

const filterOptions = ["All", "Unpaid", "Processing", "Paid"];

const DISPUTE_TYPES = ["SHORT_PAY", "WRONG_AMOUNT", "MISSING_ACCESSORIAL", "UNAUTHORIZED_DEDUCTION", "DOCUMENTATION", "OTHER"];

export default function ShipperInvoicesPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [page, setPage] = useState(1);
  const queryClient = useQueryClient();
  const [disputeInvoice, setDisputeInvoice] = useState<{ id: string; invoiceNumber: string; amount: number } | null>(null);
  const [disputeForm, setDisputeForm] = useState({ disputeType: "WRONG_AMOUNT", disputedAmount: "", description: "" });
  const [disputeSuccess, setDisputeSuccess] = useState("");

  const fileDispute = useMutation({
    mutationFn: (data: { invoiceId: string; disputeType: string; disputedAmount: number; description: string }) =>
      api.post("/shipper-portal/disputes", data),
    onSuccess: (res) => {
      setDisputeSuccess(res.data?.disputeNumber ? `Dispute ${res.data.disputeNumber} filed successfully. Our team has been notified.` : "Dispute filed successfully.");
      setDisputeForm({ disputeType: "WRONG_AMOUNT", disputedAmount: "", description: "" });
      queryClient.invalidateQueries({ queryKey: ["shipper-invoices"] });
      setTimeout(() => { setDisputeInvoice(null); setDisputeSuccess(""); }, 3000);
    },
    onError: (err: any) => {
      alert(err?.response?.data?.error || "Failed to file dispute");
    },
  });

  const exportInvoicesCSV = (invoices: any[]) => {
    const headers = ["Invoice #", "Shipment", "Amount", "Issued", "Due", "Status"];
    const rows = invoices.map((inv) => [inv.id, inv.shipment, `$${inv.amount}`, inv.issued, inv.due, inv.status]);
    const csv = [headers.join(","), ...rows.map((r) => r.map((v) => `"${v}"`).join(","))].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
    window.URL.revokeObjectURL(url);
  };

  const downloadInvoicePdf = async (invoiceId: string) => {
    try {
      const res = await api.get(`/pdf/invoice/${invoiceId}`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement("a"); a.href = url; a.download = `invoice-${invoiceId}.pdf`; a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert("Unable to download invoice PDF.");
    }
  };

  const query = new URLSearchParams();
  if (activeFilter !== "All") query.set("status", activeFilter);
  query.set("page", String(page));

  const { data, isLoading } = useQuery({
    queryKey: ["shipper-invoices", activeFilter, page],
    queryFn: () => api.get<InvoicesResponse>(`/shipper-portal/invoices?${query.toString()}`).then((r) => r.data),
  });

  const billing = data?.billing;
  const invoices = data?.invoices || [];

  return (
    <div>
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="font-serif text-2xl text-[#0D1B2A] mb-1">Freight Invoicing &amp; Payment Management</h1>
          <p className="text-[13px] text-gray-500">Track all freight invoices, carrier payments, and transportation billing history</p>
        </div>
        <button onClick={() => invoices.length > 0 && exportInvoicesCSV(invoices)}
          className="inline-flex items-center gap-1.5 text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#C9A84C]">
          <Download size={14} /> Export Statement
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <ShipperCard padding="p-5">
          <div className="text-[11px] text-gray-400 mb-1.5">Outstanding Balance</div>
          <div className="text-[28px] font-bold text-red-500">
            {isLoading ? <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" /> : `$${(billing?.outstandingBalance || 0).toLocaleString()}`}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">{billing?.unpaidCount || 0} unpaid invoices</div>
        </ShipperCard>
        <ShipperCard padding="p-5">
          <div className="text-[11px] text-gray-400 mb-1.5">YTD Total Billed</div>
          <div className="text-[28px] font-bold text-[#0D1B2A]">
            {isLoading ? <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" /> : `$${(billing?.ytdBilled || 0).toLocaleString()}`}
          </div>
        </ShipperCard>
        <ShipperCard padding="p-5">
          <div className="text-[11px] text-gray-400 mb-1.5">Avg Payment Cycle</div>
          <div className="text-[28px] font-bold text-[#0D1B2A]">
            {isLoading ? <div className="h-8 w-20 bg-gray-200 rounded animate-pulse" /> : `${billing?.avgPaymentCycleDays || 0} days`}
          </div>
          <div className="text-[11px] text-gray-400 mt-1">Net 30 terms</div>
        </ShipperCard>
      </div>

      <ShipperCard padding="p-0">
        <div className="px-5 py-4 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-[15px] font-bold text-[#0D1B2A]">Invoice History</h3>
          <div className="flex gap-1.5">
            {filterOptions.map((f) => (
              <button
                key={f}
                onClick={() => { setActiveFilter(f); setPage(1); }}
                className={`px-3 py-1 rounded-full text-[11px] font-medium ${
                  f === activeFilter ? "bg-[#0D1B2A] text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                }`}
              >{f}</button>
            ))}
          </div>
        </div>
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="bg-gray-50">
              {["Invoice #", "Shipment", "Amount", "Issued", "Due Date", "Status", "Actions"].map((h) => (
                <th key={h} className="text-left px-4 py-2.5 text-[10px] font-semibold text-gray-500 tracking-wide uppercase">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              [...Array(4)].map((_, i) => (
                <tr key={i} className="border-b border-gray-100">
                  {[...Array(7)].map((_, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-200 rounded animate-pulse w-16" /></td>
                  ))}
                </tr>
              ))
            ) : invoices.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-sm text-gray-400">No invoices found</td></tr>
            ) : (
              invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-gray-100">
                  <td className="px-4 py-3 font-semibold text-[#0D1B2A] font-mono text-[11px]">{inv.id}</td>
                  <td className="px-4 py-3 font-mono text-[11px] text-gray-600">{inv.shipment}</td>
                  <td className="px-4 py-3 font-bold text-[#0D1B2A]">${inv.amount.toLocaleString()}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{inv.issued}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">{inv.due}</td>
                  <td className="px-4 py-3"><ShipperBadge status={inv.status} /></td>
                  <td className="px-4 py-3 flex items-center gap-2">
                    <button onClick={() => downloadInvoicePdf(inv.id)}
                      className="inline-flex items-center gap-1 text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#C9A84C]">
                      <Download size={14} /> PDF
                    </button>
                    {inv.status !== "Paid" && (
                      <button onClick={() => setDisputeInvoice({ id: inv.id, invoiceNumber: inv.id, amount: inv.amount })}
                        className="inline-flex items-center gap-1 text-gray-400 text-[11px] font-semibold uppercase tracking-wider hover:text-red-500">
                        <AlertTriangle size={12} /> Dispute
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {data && data.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-gray-100 flex justify-between items-center text-xs text-gray-500">
            <span>Page {page} of {data.totalPages}</span>
            <div className="flex gap-1">
              {page > 1 && <button onClick={() => setPage(page - 1)} className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200">Prev</button>}
              {page < data.totalPages && <button onClick={() => setPage(page + 1)} className="px-3 py-1 rounded bg-gray-100 hover:bg-gray-200">Next</button>}
            </div>
          </div>
        )}
      </ShipperCard>

      {/* File Dispute Modal */}
      {disputeInvoice && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            {disputeSuccess ? (
              <div className="text-center py-4">
                <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mx-auto mb-3">
                  <AlertTriangle className="w-6 h-6 text-green-600" />
                </div>
                <p className="text-sm text-gray-700 font-medium">{disputeSuccess}</p>
              </div>
            ) : (
              <>
                <h3 className="text-lg font-semibold text-[#0D1B2A] mb-1">File a Dispute</h3>
                <p className="text-xs text-gray-500 mb-4">Invoice {disputeInvoice.invoiceNumber} — ${disputeInvoice.amount.toLocaleString()}</p>

                <div className="space-y-3">
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Dispute Type</label>
                    <select value={disputeForm.disputeType} onChange={(e) => setDisputeForm({ ...disputeForm, disputeType: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm">
                      {DISPUTE_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Disputed Amount ($)</label>
                    <input type="number" value={disputeForm.disputedAmount}
                      onChange={(e) => setDisputeForm({ ...disputeForm, disputedAmount: e.target.value })}
                      placeholder={String(disputeInvoice.amount)}
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm" />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-gray-500 uppercase tracking-wide mb-1">Description</label>
                    <textarea value={disputeForm.description}
                      onChange={(e) => setDisputeForm({ ...disputeForm, description: e.target.value })}
                      placeholder="Describe the issue with this invoice..."
                      rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm resize-none" />
                  </div>
                </div>

                <div className="flex gap-3 mt-5">
                  <button onClick={() => setDisputeInvoice(null)}
                    className="flex-1 px-4 py-2.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200">Cancel</button>
                  <button
                    onClick={() => fileDispute.mutate({
                      invoiceId: disputeInvoice.id,
                      disputeType: disputeForm.disputeType,
                      disputedAmount: parseFloat(disputeForm.disputedAmount) || disputeInvoice.amount,
                      description: disputeForm.description,
                    })}
                    disabled={!disputeForm.description.trim() || fileDispute.isPending}
                    className="flex-1 px-4 py-2.5 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 disabled:opacity-50">
                    {fileDispute.isPending ? "Filing..." : "File Dispute"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
