"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Search, FileText, Send, Eye, Download, Filter, ChevronLeft, ChevronRight,
  Plus, Clock, DollarSign, AlertTriangle, CheckCircle2, X,
} from "lucide-react";

interface Invoice {
  id: string;
  invoiceNumber: string;
  loadId: string;
  amount: number;
  lineHaulAmount: number | null;
  fuelSurchargeAmount: number | null;
  accessorialsAmount: number | null;
  status: string;
  dueDate: string;
  paidDate: string | null;
  paidAmount: number | null;
  createdAt: string;
  load: {
    referenceNumber: string;
    originCity: string;
    originState: string;
    destCity: string;
    destState: string;
    poster: { company: string | null; firstName: string; lastName: string };
  };
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-500/20 text-slate-400",
  SENT: "bg-blue-500/20 text-blue-400",
  VIEWED: "bg-indigo-500/20 text-indigo-400",
  PARTIAL: "bg-yellow-500/20 text-yellow-400",
  PAID: "bg-green-500/20 text-green-400",
  OVERDUE: "bg-red-500/20 text-red-400",
  VOID: "bg-slate-500/20 text-slate-400",
};

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const queryClient = useQueryClient();

  const qs = new URLSearchParams();
  if (search) qs.set("search", search);
  if (statusFilter) qs.set("status", statusFilter);
  qs.set("page", String(page));

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", search, statusFilter, page],
    queryFn: () => api.get<{ invoices: Invoice[]; total: number; totalPages: number }>(`/accounting/invoices?${qs}`).then(r => r.data),
  });

  const sendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/accounting/invoices/${id}/send`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => api.post(`/accounting/invoices/${id}/void`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });

  const markPaidMutation = useMutation({
    mutationFn: ({ id, amount, method }: { id: string; amount: number; method: string }) =>
      api.put(`/accounting/invoices/${id}/mark-paid`, { paidAmount: amount, paymentMethod: method }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["invoices"] }),
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Invoices</h1>
          <p className="text-sm text-slate-400 mt-1">Accounts Receivable — manage customer invoices</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search invoice # or customer..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C8963E]/50"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="bg-white/5 border border-white/10 rounded-lg text-sm text-white px-3 py-2 focus:outline-none focus:ring-1 focus:ring-[#C8963E]/50"
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
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Invoice #</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Load</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Customer</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Amount</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Due Date</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Status</th>
              <th className="text-right text-xs text-slate-500 font-medium px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              [...Array(5)].map((_, i) => (
                <tr key={i}><td colSpan={7} className="px-5 py-3"><div className="h-5 bg-white/5 rounded animate-pulse" /></td></tr>
              ))
            ) : data?.invoices?.length ? (
              data.invoices.map((inv) => {
                const isOverdue = inv.status !== "PAID" && inv.status !== "VOID" && new Date(inv.dueDate) < new Date();
                return (
                  <tr key={inv.id} className="hover:bg-white/[0.02] cursor-pointer" onClick={() => setSelectedInvoice(inv)}>
                    <td className="px-5 py-3 text-sm text-white font-medium">{inv.invoiceNumber}</td>
                    <td className="px-5 py-3 text-sm text-slate-300">{inv.load.referenceNumber}</td>
                    <td className="px-5 py-3 text-sm text-slate-300">{inv.load.poster.company || `${inv.load.poster.firstName} ${inv.load.poster.lastName}`}</td>
                    <td className="px-5 py-3 text-sm text-white font-medium">{fmt(inv.amount)}</td>
                    <td className="px-5 py-3 text-sm">
                      <span className={isOverdue ? "text-red-400" : "text-slate-300"}>
                        {new Date(inv.dueDate).toLocaleDateString()}
                      </span>
                      {isOverdue && <AlertTriangle className="inline w-3 h-3 text-red-400 ml-1" />}
                    </td>
                    <td className="px-5 py-3">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[isOverdue && inv.status !== "PAID" ? "OVERDUE" : inv.status] || STATUS_COLORS.DRAFT}`}>
                        {isOverdue && inv.status !== "PAID" && inv.status !== "VOID" ? "OVERDUE" : inv.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                        {inv.status === "DRAFT" && (
                          <button
                            onClick={() => sendMutation.mutate(inv.id)}
                            className="p-1.5 rounded-lg hover:bg-white/10 text-blue-400 transition"
                            title="Send Invoice"
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 transition" title="Download PDF">
                          <Download className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr><td colSpan={7} className="px-5 py-12 text-center text-sm text-slate-500">No invoices found</td></tr>
            )}
          </tbody>
        </table>

        {/* Pagination */}
        {data && data.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between">
            <p className="text-xs text-slate-500">{data.total} total invoices</p>
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

      {/* Invoice Detail Slide-over */}
      {selectedInvoice && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-black/50" onClick={() => setSelectedInvoice(null)} />
          <div className="relative w-[480px] bg-[#0f172a] border-l border-white/10 overflow-y-auto">
            <div className="px-6 py-4 border-b border-white/5 flex items-center justify-between sticky top-0 bg-[#0f172a] z-10">
              <h2 className="text-lg font-bold text-white">{selectedInvoice.invoiceNumber}</h2>
              <button onClick={() => setSelectedInvoice(null)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500">Status</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_COLORS[selectedInvoice.status]}`}>{selectedInvoice.status}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500">Load</span>
                  <span className="text-sm text-white">{selectedInvoice.load.referenceNumber}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500">Customer</span>
                  <span className="text-sm text-white">{selectedInvoice.load.poster.company || `${selectedInvoice.load.poster.firstName} ${selectedInvoice.load.poster.lastName}`}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500">Route</span>
                  <span className="text-sm text-white">{selectedInvoice.load.originCity}, {selectedInvoice.load.originState} → {selectedInvoice.load.destCity}, {selectedInvoice.load.destState}</span>
                </div>
              </div>

              <div className="bg-white/5 rounded-xl p-4 space-y-2">
                <h3 className="text-xs text-slate-500 font-medium mb-3">AMOUNT BREAKDOWN</h3>
                {selectedInvoice.lineHaulAmount && (
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-300">Line Haul</span>
                    <span className="text-sm text-white">{fmt(selectedInvoice.lineHaulAmount)}</span>
                  </div>
                )}
                {selectedInvoice.fuelSurchargeAmount && (
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-300">Fuel Surcharge</span>
                    <span className="text-sm text-white">{fmt(selectedInvoice.fuelSurchargeAmount)}</span>
                  </div>
                )}
                {selectedInvoice.accessorialsAmount && (
                  <div className="flex justify-between">
                    <span className="text-sm text-slate-300">Accessorials</span>
                    <span className="text-sm text-white">{fmt(selectedInvoice.accessorialsAmount)}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-white/10 flex justify-between">
                  <span className="text-sm text-white font-medium">Total</span>
                  <span className="text-sm text-[#C8963E] font-bold">{fmt(selectedInvoice.amount)}</span>
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500">Due Date</span>
                  <span className="text-sm text-white">{new Date(selectedInvoice.dueDate).toLocaleDateString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-xs text-slate-500">Created</span>
                  <span className="text-sm text-white">{new Date(selectedInvoice.createdAt).toLocaleDateString()}</span>
                </div>
                {selectedInvoice.paidDate && (
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Paid Date</span>
                    <span className="text-sm text-green-400">{new Date(selectedInvoice.paidDate).toLocaleDateString()}</span>
                  </div>
                )}
                {selectedInvoice.paidAmount !== null && (
                  <div className="flex justify-between">
                    <span className="text-xs text-slate-500">Paid Amount</span>
                    <span className="text-sm text-green-400">{fmt(selectedInvoice.paidAmount)}</span>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                {selectedInvoice.status === "DRAFT" && (
                  <button
                    onClick={() => { sendMutation.mutate(selectedInvoice.id); setSelectedInvoice(null); }}
                    className="flex-1 py-2 bg-blue-500/20 text-blue-400 rounded-lg text-sm font-medium hover:bg-blue-500/30 transition flex items-center justify-center gap-2"
                  >
                    <Send className="w-4 h-4" /> Send Invoice
                  </button>
                )}
                {selectedInvoice.status !== "PAID" && selectedInvoice.status !== "VOID" && (
                  <button
                    onClick={() => { voidMutation.mutate(selectedInvoice.id); setSelectedInvoice(null); }}
                    className="px-4 py-2 bg-red-500/10 text-red-400 rounded-lg text-sm hover:bg-red-500/20 transition"
                  >
                    Void
                  </button>
                )}
                <button className="px-4 py-2 bg-white/5 text-slate-400 rounded-lg text-sm hover:bg-white/10 transition flex items-center gap-2">
                  <Download className="w-4 h-4" /> PDF
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
