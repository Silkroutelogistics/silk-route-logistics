"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/hooks/useAuthStore";
import { CreateInvoiceModal } from "@/components/invoices/CreateInvoiceModal";
import { BatchActionsBar } from "@/components/invoices/BatchActionsBar";
import { cn } from "@/lib/utils";
import {
  Download, FileText, DollarSign, Clock, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronUp, Filter, TrendingUp, CreditCard, BarChart3, List,
} from "lucide-react";

interface LineItem {
  id: string;
  description: string;
  type: string;
  quantity: number;
  rate: number;
  amount: number;
  sortOrder: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  amount: number;
  status: string;
  advanceAmount: number | null;
  advanceRate: number | null;
  factoringFee: number | null;
  paidAt: string | null;
  createdAt: string;
  load?: { originCity: string; originState: string; destCity: string; destState: string; referenceNumber?: string };
  user?: { id: string; firstName: string; lastName: string; company: string | null };
  lineItems?: LineItem[];
}

interface InvoiceStats {
  total: number;
  totalAmount: number;
  paidAmount: number;
  byStatus: { status: string; _count: number; _sum: { amount: number | null } }[];
  aging: {
    current: { amount: number; count: number };
    over30: { amount: number; count: number };
    over60: { amount: number; count: number };
    over90: { amount: number; count: number };
  };
}

const statusColors: Record<string, string> = {
  DRAFT: "bg-slate-500/20 text-slate-400",
  SUBMITTED: "bg-blue-500/20 text-blue-400",
  UNDER_REVIEW: "bg-purple-500/20 text-purple-400",
  APPROVED: "bg-emerald-500/20 text-emerald-400",
  FUNDED: "bg-green-500/20 text-green-400",
  PAID: "bg-green-500/30 text-green-300",
  REJECTED: "bg-red-500/20 text-red-400",
};

const statusOrder = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED", "PAID"];

function PaymentTimeline({ status }: { status: string }) {
  const currentIdx = statusOrder.indexOf(status);
  return (
    <div className="flex items-center gap-1">
      {statusOrder.slice(1).map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div className={cn("w-2 h-2 rounded-full", i < currentIdx ? "bg-green-500" : i === currentIdx ? "bg-gold" : "bg-slate-600")} />
          {i < statusOrder.length - 2 && <div className={cn("w-4 h-0.5", i < currentIdx ? "bg-green-500" : "bg-slate-700")} />}
        </div>
      ))}
    </div>
  );
}

function AgingBar({ label, amount, count, color }: { label: string; amount: number; count: number; color: string }) {
  return (
    <div className="flex-1 bg-white/5 rounded-xl border border-white/10 p-4">
      <p className="text-xs text-slate-400 mb-1">{label}</p>
      <p className={`text-xl font-bold ${color}`}>${(amount / 1000).toFixed(1)}k</p>
      <p className="text-[10px] text-slate-500">{count} invoices</p>
    </div>
  );
}

export default function InvoicesPage() {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const isEmployee = ["ADMIN", "CEO", "BROKER", "DISPATCH", "OPERATIONS", "ACCOUNTING"].includes(user?.role || "");
  const [showCreate, setShowCreate] = useState(false);
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: invoiceData, isLoading } = useQuery({
    queryKey: ["invoices", isEmployee ? "all" : "mine", statusFilter],
    queryFn: () => {
      if (isEmployee) {
        const params = new URLSearchParams();
        if (statusFilter !== "ALL") params.set("status", statusFilter);
        params.set("limit", "100");
        return api.get<{ invoices: Invoice[]; total: number }>(`/invoices/all?${params}`).then((r) => r.data);
      }
      return api.get<Invoice[]>("/invoices").then((r) => ({ invoices: r.data, total: r.data.length }));
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["invoice-stats"],
    queryFn: () => api.get<InvoiceStats>("/invoices/stats").then((r) => r.data),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      api.patch(`/invoices/${id}/status`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["invoice-stats"] });
    },
  });

  const invoices = invoiceData?.invoices || [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === invoices.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(invoices.map((i) => i.id));
    }
  };

  const downloadPdf = async (invoiceId: string, invoiceNumber: string) => {
    const res = await api.get(`/pdf/invoice/${invoiceId}`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoiceNumber}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const headers = "Invoice #,Status,Amount,Advance,Carrier,Lane,Date\n";
    const rows = invoices.map((inv) =>
      `${inv.invoiceNumber},${inv.status},${inv.amount},${inv.advanceAmount || 0},${inv.user?.company || inv.user?.firstName || ""},${inv.load ? `${inv.load.originCity} ${inv.load.originState} → ${inv.load.destCity} ${inv.load.destState}` : ""},${new Date(inv.createdAt).toLocaleDateString()}`
    ).join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const daysSince = (dateStr: string) => Math.ceil((Date.now() - new Date(dateStr).getTime()) / 86400000);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Invoices</h1>
          <p className="text-slate-400 text-sm mt-1">{invoiceData?.total || 0} total invoices</p>
        </div>
        <div className="flex gap-2">
          {isEmployee && (
            <button onClick={exportCSV}
              className="px-3 py-2 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20 transition flex items-center gap-1.5">
              <Download className="w-4 h-4" /> Export CSV
            </button>
          )}
          <button onClick={() => setShowCreate(true)}
            className="px-4 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold/90 transition text-sm">
            Create Invoice
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      {stats && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-white/5 rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-gold/10 flex items-center justify-center">
                <FileText className="w-5 h-5 text-gold" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">{stats.total}</p>
                <p className="text-xs text-slate-400">Total Invoices</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                <DollarSign className="w-5 h-5 text-green-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">${((stats.totalAmount) / 1000).toFixed(1)}k</p>
                <p className="text-xs text-slate-400">Total Invoiced</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-blue-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">${((stats.paidAmount) / 1000).toFixed(1)}k</p>
                <p className="text-xs text-slate-400">Total Paid</p>
              </div>
            </div>
          </div>
          <div className="bg-white/5 rounded-xl border border-white/10 p-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <TrendingUp className="w-5 h-5 text-yellow-400" />
              </div>
              <div>
                <p className="text-2xl font-bold text-white">${(((stats.totalAmount - stats.paidAmount)) / 1000).toFixed(1)}k</p>
                <p className="text-xs text-slate-400">Outstanding</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* AR Aging */}
      {stats && isEmployee && (
        <div>
          <h2 className="text-sm font-semibold text-slate-300 mb-3 flex items-center gap-2">
            <BarChart3 className="w-4 h-4" /> Accounts Receivable Aging
          </h2>
          <div className="flex gap-3">
            <AgingBar label="Current (0-30)" amount={stats.aging.current.amount} count={stats.aging.current.count} color="text-green-400" />
            <AgingBar label="31-60 Days" amount={stats.aging.over30.amount} count={stats.aging.over30.count} color="text-yellow-400" />
            <AgingBar label="61-90 Days" amount={stats.aging.over60.amount} count={stats.aging.over60.count} color="text-orange-400" />
            <AgingBar label="90+ Days" amount={stats.aging.over90.amount} count={stats.aging.over90.count} color="text-red-400" />
          </div>
        </div>
      )}

      {/* Status Filter Pills */}
      <div className="flex flex-wrap gap-2 items-center">
        {isEmployee && invoices.length > 0 && (
          <label className="flex items-center gap-2 mr-2 cursor-pointer">
            <input
              type="checkbox"
              checked={selectedIds.length === invoices.length && invoices.length > 0}
              onChange={toggleSelectAll}
              className="w-4 h-4 rounded border-white/20 bg-white/5 text-gold focus:ring-gold/50 accent-[#D4A843]"
            />
            <span className="text-xs text-slate-400">All</span>
          </label>
        )}
        {["ALL", ...statusOrder, "REJECTED"].map((s) => {
          const count = s === "ALL" ? invoices.length : invoices.filter((i) => i.status === s).length;
          return (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition ${statusFilter === s ? "bg-gold/20 text-gold border border-gold/30" : "bg-white/5 text-slate-400 border border-white/10 hover:bg-white/10"}`}>
              {s === "ALL" ? "All" : s.replace(/_/g, " ")} {count > 0 && <span className="ml-1 text-[10px] opacity-70">({count})</span>}
            </button>
          );
        })}
      </div>

      {/* Invoice List */}
      {isLoading ? (
        <p className="text-slate-400 text-center py-12">Loading...</p>
      ) : (
        <div className="space-y-3">
          {invoices.map((inv) => {
            const age = daysSince(inv.createdAt);
            const isOverdue = age > 30 && !["PAID", "REJECTED", "DRAFT"].includes(inv.status);
            const lineItemCount = inv.lineItems?.length || 0;
            return (
              <div key={inv.id} className={`bg-white/5 rounded-xl border overflow-hidden ${isOverdue ? "border-red-500/30" : selectedIds.includes(inv.id) ? "border-gold/40" : "border-white/10"}`}>
                <div className="flex items-start">
                  {/* Checkbox */}
                  {isEmployee && (
                    <div className="p-5 pr-0 flex items-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(inv.id)}
                        onChange={() => toggleSelect(inv.id)}
                        className="w-4 h-4 rounded border-white/20 bg-white/5 text-gold focus:ring-gold/50 accent-[#D4A843]"
                      />
                    </div>
                  )}
                  <button onClick={() => setExpanded(expanded === inv.id ? null : inv.id)}
                    className="flex-1 text-left p-5 hover:bg-white/5 transition">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-1 flex-wrap">
                          <FileText className="w-4 h-4 text-gold shrink-0" />
                          <span className="font-semibold text-white">{inv.invoiceNumber}</span>
                          <span className={cn("px-2 py-0.5 rounded text-xs font-medium", statusColors[inv.status] || "")}>{inv.status.replace(/_/g, " ")}</span>
                          {isOverdue && (
                            <span className="px-2 py-0.5 rounded text-xs bg-red-500/20 text-red-400 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> {age} days
                            </span>
                          )}
                          {lineItemCount > 0 && (
                            <span className="px-2 py-0.5 rounded text-xs bg-blue-500/10 text-blue-400 flex items-center gap-1">
                              <List className="w-3 h-3" /> {lineItemCount} items
                            </span>
                          )}
                          {inv.load?.referenceNumber && (
                            <span className="text-xs text-slate-500">Ref: {inv.load.referenceNumber}</span>
                          )}
                        </div>
                        <p className="text-sm text-slate-400">
                          {inv.load ? `${inv.load.originCity}, ${inv.load.originState} → ${inv.load.destCity}, ${inv.load.destState}` : "—"}
                        </p>
                        {inv.user && isEmployee && (
                          <p className="text-xs text-slate-500 mt-0.5">{inv.user.company || `${inv.user.firstName} ${inv.user.lastName}`}</p>
                        )}
                        <div className="mt-2"><PaymentTimeline status={inv.status} /></div>
                      </div>
                      <div className="flex items-center gap-4 shrink-0">
                        <div className="text-right">
                          <p className="text-xl font-bold text-gold">${inv.amount.toLocaleString()}</p>
                          {inv.advanceAmount && <p className="text-xs text-green-400">Advanced: ${inv.advanceAmount.toLocaleString()}</p>}
                          <p className="text-xs text-slate-500">{new Date(inv.createdAt).toLocaleDateString()}</p>
                        </div>
                        {expanded === inv.id ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                      </div>
                    </div>
                  </button>
                </div>

                {expanded === inv.id && (
                  <div className="border-t border-white/10 p-5 bg-white/[0.02] space-y-4">
                    {/* Line Items Table */}
                    {inv.lineItems && inv.lineItems.length > 0 && (
                      <div>
                        <p className="text-slate-500 font-semibold uppercase tracking-wider text-xs mb-2">Line Items</p>
                        <div className="bg-white/5 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="text-slate-400 border-b border-white/10">
                                <th className="text-left px-3 py-2 font-medium">Description</th>
                                <th className="text-left px-3 py-2 font-medium">Type</th>
                                <th className="text-right px-3 py-2 font-medium">Qty</th>
                                <th className="text-right px-3 py-2 font-medium">Rate</th>
                                <th className="text-right px-3 py-2 font-medium">Amount</th>
                              </tr>
                            </thead>
                            <tbody>
                              {inv.lineItems.map((li) => (
                                <tr key={li.id} className="border-b border-white/5">
                                  <td className="px-3 py-2 text-white">{li.description}</td>
                                  <td className="px-3 py-2 text-slate-400">{li.type.replace(/_/g, " ")}</td>
                                  <td className="px-3 py-2 text-right text-white">{li.quantity}</td>
                                  <td className="px-3 py-2 text-right text-white">${li.rate.toLocaleString()}</td>
                                  <td className="px-3 py-2 text-right text-gold font-medium">${li.amount.toLocaleString()}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    <div className="grid sm:grid-cols-3 gap-4 text-xs">
                      <div className="space-y-1.5">
                        <p className="text-slate-500 font-semibold uppercase tracking-wider">Invoice Details</p>
                        <div className="bg-white/5 rounded-lg p-3 space-y-1">
                          <div className="flex justify-between"><span className="text-slate-500">Amount</span><span className="text-white">${inv.amount.toLocaleString()}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">Factoring Fee</span><span className="text-white">{inv.factoringFee ? `$${inv.factoringFee.toLocaleString()}` : "—"}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">Advance Rate</span><span className="text-white">{inv.advanceRate ? `${inv.advanceRate}%` : "—"}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">Advance Amount</span><span className="text-white">{inv.advanceAmount ? `$${inv.advanceAmount.toLocaleString()}` : "—"}</span></div>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-slate-500 font-semibold uppercase tracking-wider">Timeline</p>
                        <div className="bg-white/5 rounded-lg p-3 space-y-1">
                          <div className="flex justify-between"><span className="text-slate-500">Created</span><span className="text-white">{new Date(inv.createdAt).toLocaleDateString()}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">Age</span><span className={isOverdue ? "text-red-400" : "text-white"}>{age} days</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">Paid At</span><span className="text-white">{inv.paidAt ? new Date(inv.paidAt).toLocaleDateString() : "—"}</span></div>
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <p className="text-slate-500 font-semibold uppercase tracking-wider">Load Info</p>
                        <div className="bg-white/5 rounded-lg p-3 space-y-1">
                          <div className="flex justify-between"><span className="text-slate-500">Reference</span><span className="text-white">{inv.load?.referenceNumber || "—"}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">Origin</span><span className="text-white">{inv.load ? `${inv.load.originCity}, ${inv.load.originState}` : "—"}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">Dest</span><span className="text-white">{inv.load ? `${inv.load.destCity}, ${inv.load.destState}` : "—"}</span></div>
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 pt-2 border-t border-white/10">
                      <button onClick={() => downloadPdf(inv.id, inv.invoiceNumber)}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20 transition">
                        <Download className="w-3.5 h-3.5" /> Download PDF
                      </button>
                      {isEmployee && inv.status === "SUBMITTED" && (
                        <button onClick={() => updateStatus.mutate({ id: inv.id, status: "UNDER_REVIEW" })}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-500/20 text-purple-400 rounded-lg text-xs hover:bg-purple-500/30 transition">
                          <Clock className="w-3.5 h-3.5" /> Mark Under Review
                        </button>
                      )}
                      {isEmployee && inv.status === "UNDER_REVIEW" && (
                        <button onClick={() => updateStatus.mutate({ id: inv.id, status: "APPROVED" })}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs hover:bg-green-500/30 transition">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Approve
                        </button>
                      )}
                      {isEmployee && inv.status === "APPROVED" && (
                        <button onClick={() => updateStatus.mutate({ id: inv.id, status: "FUNDED" })}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs hover:bg-blue-500/30 transition">
                          <DollarSign className="w-3.5 h-3.5" /> Mark Funded
                        </button>
                      )}
                      {isEmployee && (inv.status === "FUNDED" || inv.status === "APPROVED") && (
                        <button onClick={() => updateStatus.mutate({ id: inv.id, status: "PAID" })}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs hover:bg-green-500/30 transition">
                          <CreditCard className="w-3.5 h-3.5" /> Mark Paid
                        </button>
                      )}
                      {isEmployee && !["PAID", "REJECTED"].includes(inv.status) && (
                        <button onClick={() => updateStatus.mutate({ id: inv.id, status: "REJECTED" })}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-xs hover:bg-red-500/30 transition">
                          <AlertTriangle className="w-3.5 h-3.5" /> Reject
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {invoices.length === 0 && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center text-slate-500">No invoices found</div>
          )}
        </div>
      )}

      {/* Batch Actions */}
      {isEmployee && <BatchActionsBar selectedIds={selectedIds} onClear={() => setSelectedIds([])} invoices={invoices} />}

      {showCreate && <CreateInvoiceModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
