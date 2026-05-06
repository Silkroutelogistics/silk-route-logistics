"use client";

import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  Search, FileText, Send, Download, ChevronLeft, ChevronRight,
  Clock, DollarSign, AlertTriangle, CheckCircle2, X, Ban,
  Receipt, ListOrdered, History, Paperclip, StickyNote,
} from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import type { Invoice } from "@/types/entities";
import { cn } from "@/lib/utils";
import { decodeHtmlEntities } from "@/lib/htmlEntities";

/* ── Constants ────────────────────────────────────────────── */

const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-slate-500/20 text-slate-400",
  SENT: "bg-blue-500/20 text-blue-400",
  VIEWED: "bg-indigo-500/20 text-indigo-400",
  PARTIAL: "bg-yellow-500/20 text-yellow-400",
  PAID: "bg-green-500/20 text-green-400",
  OVERDUE: "bg-red-500/20 text-red-400",
  VOID: "bg-slate-500/20 text-slate-400",
};

const STATUS_PILL_STYLES: Record<string, { active: string; inactive: string }> = {
  "": { active: "bg-white/10 text-white", inactive: "bg-white/5 text-slate-400 hover:bg-white/10" },
  DRAFT: { active: "bg-slate-500/30 text-slate-300", inactive: "bg-white/5 text-slate-500 hover:bg-white/10" },
  SENT: { active: "bg-blue-500/30 text-blue-300", inactive: "bg-white/5 text-slate-500 hover:bg-white/10" },
  PARTIAL: { active: "bg-yellow-500/30 text-yellow-300", inactive: "bg-white/5 text-slate-500 hover:bg-white/10" },
  PAID: { active: "bg-green-500/30 text-green-300", inactive: "bg-white/5 text-slate-500 hover:bg-white/10" },
  OVERDUE: { active: "bg-red-500/30 text-red-300", inactive: "bg-white/5 text-slate-500 hover:bg-white/10" },
  VOID: { active: "bg-slate-500/30 text-slate-300", inactive: "bg-white/5 text-slate-500 hover:bg-white/10" },
};

type DetailTab = "summary" | "lineItems" | "timeline" | "documents" | "notes";

const DETAIL_TABS: { key: DetailTab; label: string; icon: typeof Receipt }[] = [
  { key: "summary", label: "Summary", icon: Receipt },
  { key: "lineItems", label: "Line Items", icon: ListOrdered },
  { key: "timeline", label: "Timeline", icon: History },
  { key: "documents", label: "Documents", icon: Paperclip },
  { key: "notes", label: "Notes", icon: StickyNote },
];

const fmt = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

const fmtDate = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";

const fmtDateTime = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";

function customerName(inv: Invoice): string {
  // Decode legacy HTML-escaped values (pre-v3.8.d.2 sanitizeInput
  // middleware bug). Customer table not in v3.8.d.2's loads-table
  // decode script scope; defensive frontend decode applied here.
  const raw =
    inv.load?.customer?.name ||
    inv.user?.company ||
    `${inv.user?.firstName || ""} ${inv.user?.lastName || ""}`.trim() ||
    "—";
  return decodeHtmlEntities(raw);
}

/* ── Main Component ───────────────────────────────────────── */

export default function InvoicesPage() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [detailTab, setDetailTab] = useState<DetailTab>("summary");
  const [confirmPayId, setConfirmPayId] = useState<{
    id: string;
    invoiceNumber: string;
    amount: number;
  } | null>(null);

  const queryClient = useQueryClient();
  const { toast } = useToast();

  const qs = useMemo(() => {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (statusFilter) p.set("status", statusFilter);
    p.set("page", String(page));
    return p.toString();
  }, [search, statusFilter, page]);

  const { data, isLoading } = useQuery({
    queryKey: ["invoices", search, statusFilter, page],
    queryFn: () =>
      api
        .get<{ invoices: Invoice[]; total: number; totalPages: number }>(
          `/accounting/invoices?${qs}`
        )
        .then((r) => r.data),
  });

  /* ── Mutations ───────────────────────────────────────── */

  const sendMutation = useMutation({
    mutationFn: (id: string) => api.post(`/accounting/invoices/${id}/send`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      toast("Invoice sent", "success");
    },
    onError: () => toast("Operation failed", "error"),
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => api.post(`/accounting/invoices/${id}/void`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setSelectedInvoice(null);
      toast("Invoice voided", "success");
    },
    onError: () => toast("Operation failed", "error"),
  });

  const markPaidMutation = useMutation({
    mutationFn: ({
      id,
      amount,
      method,
    }: {
      id: string;
      amount: number;
      method: string;
    }) =>
      api.put(`/accounting/invoices/${id}/mark-paid`, {
        paidAmount: amount,
        paymentMethod: method,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      setConfirmPayId(null);
      toast("Invoice marked as paid", "success");
    },
    onError: () => toast("Operation failed", "error"),
  });

  /* ── Status counts for pills ─────────────────────────── */

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    if (data?.invoices) {
      for (const inv of data.invoices) {
        const isOverdue =
          inv.status !== "PAID" &&
          inv.status !== "VOID" &&
          inv.dueDate &&
          new Date(inv.dueDate) < new Date();
        const key = isOverdue ? "OVERDUE" : inv.status;
        counts[key] = (counts[key] || 0) + 1;
      }
    }
    return counts;
  }, [data?.invoices]);

  const panelOpen = selectedInvoice !== null;

  /* ── Helpers ─────────────────────────────────────────── */

  function isOverdue(inv: Invoice) {
    return (
      inv.status !== "PAID" &&
      inv.status !== "VOID" &&
      inv.dueDate &&
      new Date(inv.dueDate) < new Date()
    );
  }

  function displayStatus(inv: Invoice) {
    return isOverdue(inv) ? "OVERDUE" : inv.status;
  }

  function handleRowClick(inv: Invoice) {
    if (selectedInvoice?.id === inv.id) {
      setSelectedInvoice(null);
    } else {
      setSelectedInvoice(inv);
      setDetailTab("summary");
    }
  }

  /* ── Render ──────────────────────────────────────────── */

  return (
    <div className="h-full flex flex-col bg-[#0F1117]">
      {/* Header */}
      <div className="px-8 pt-8 pb-0">
        <div className="flex items-center justify-between mb-5">
          <div>
            <h1 className="text-2xl font-bold text-white">Invoices</h1>
            <p className="text-sm text-slate-400 mt-1">
              Accounts Receivable — manage customer invoices
            </p>
          </div>
        </div>

        {/* Search + Status Pills */}
        <div className="flex items-center gap-3 mb-5">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              placeholder="Search invoice # or customer..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C8963E]/50"
            />
          </div>
        </div>

        {/* Status filter pills */}
        <div className="flex items-center gap-2 mb-5 overflow-x-auto pb-1">
          {[
            { key: "", label: "All" },
            { key: "DRAFT", label: "Draft" },
            { key: "SENT", label: "Sent" },
            { key: "PARTIAL", label: "Partial" },
            { key: "PAID", label: "Paid" },
            { key: "OVERDUE", label: "Overdue" },
            { key: "VOID", label: "Void" },
          ].map((s) => {
            const isActive = statusFilter === s.key;
            const pillStyle = STATUS_PILL_STYLES[s.key] || STATUS_PILL_STYLES[""];
            const count = s.key === "" ? data?.total : statusCounts[s.key];
            return (
              <button
                key={s.key}
                onClick={() => {
                  setStatusFilter(s.key);
                  setPage(1);
                }}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition whitespace-nowrap",
                  isActive ? pillStyle.active : pillStyle.inactive
                )}
              >
                {s.label}
                {count !== undefined && count > 0 && (
                  <span
                    className={cn(
                      "text-[10px] px-1.5 py-0.5 rounded-full min-w-[18px] text-center",
                      isActive ? "bg-white/10" : "bg-white/5"
                    )}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Split Layout */}
      <div className="flex-1 flex min-h-0 px-8 pb-8 gap-0">
        {/* Left: Invoice List */}
        <div
          className={cn(
            "flex flex-col min-h-0 transition-all duration-300",
            panelOpen ? "w-[45%]" : "w-full"
          )}
        >
          <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden flex flex-col min-h-0 flex-1">
            <div className="overflow-y-auto flex-1">
              <table className="w-full">
                <thead className="sticky top-0 bg-[#0F1117] z-10">
                  <tr className="border-b border-white/5">
                    <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">
                      Invoice #
                    </th>
                    <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">
                      Customer
                    </th>
                    <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">
                      Amount
                    </th>
                    {!panelOpen && (
                      <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">
                        Due Date
                      </th>
                    )}
                    <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {isLoading ? (
                    [...Array(8)].map((_, i) => (
                      <tr key={i}>
                        <td colSpan={panelOpen ? 4 : 5} className="px-5 py-3">
                          <div className="h-5 bg-white/5 rounded animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : data?.invoices?.length ? (
                    data.invoices.map((inv) => {
                      const selected = selectedInvoice?.id === inv.id;
                      const overdue = isOverdue(inv);
                      return (
                        <tr
                          key={inv.id}
                          onClick={() => handleRowClick(inv)}
                          className={cn(
                            "cursor-pointer transition-colors",
                            selected
                              ? "bg-[#C5A572]/10 border-l-2 border-l-[#C5A572]"
                              : "hover:bg-white/[0.03]"
                          )}
                        >
                          <td className="px-5 py-3">
                            <span className="text-sm text-white font-medium">
                              {inv.invoiceNumber}
                            </span>
                            {panelOpen && inv.load?.referenceNumber && (
                              <span className="block text-[11px] text-slate-500 mt-0.5">
                                {inv.load.referenceNumber}
                              </span>
                            )}
                          </td>
                          <td className="px-5 py-3 text-sm text-slate-300 truncate max-w-[160px]">
                            {customerName(inv)}
                          </td>
                          <td className="px-5 py-3 text-sm text-white font-medium tabular-nums">
                            {fmt(inv.amount)}
                          </td>
                          {!panelOpen && (
                            <td className="px-5 py-3 text-sm">
                              <span className={overdue ? "text-red-400" : "text-slate-300"}>
                                {fmtDate(inv.dueDate)}
                              </span>
                              {overdue && (
                                <AlertTriangle className="inline w-3 h-3 text-red-400 ml-1" />
                              )}
                            </td>
                          )}
                          <td className="px-5 py-3">
                            <span
                              className={cn(
                                "text-xs px-2 py-0.5 rounded-full",
                                STATUS_COLORS[displayStatus(inv)] || STATUS_COLORS.DRAFT
                              )}
                            >
                              {displayStatus(inv)}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td
                        colSpan={panelOpen ? 4 : 5}
                        className="px-5 py-16 text-center text-sm text-slate-500"
                      >
                        No invoices found
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {data && data.totalPages > 1 && (
              <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between shrink-0">
                <p className="text-xs text-slate-500">{data.total} total</p>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs text-slate-400">
                    {page} / {data.totalPages}
                  </span>
                  <button
                    onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                    disabled={page === data.totalPages}
                    className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right: Detail Panel */}
        {panelOpen && selectedInvoice && (
          <div className="w-[55%] pl-4 flex flex-col min-h-0 animate-in slide-in-from-right-4 duration-200">
            <div className="bg-[#0c1021] border border-white/5 rounded-xl flex flex-col min-h-0 flex-1 overflow-hidden">
              {/* Panel Header */}
              <div className="px-5 py-4 border-b border-white/5 shrink-0">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div>
                      <h2 className="text-lg font-bold text-white">
                        {selectedInvoice.invoiceNumber}
                      </h2>
                      <p className="text-sm text-[#C5A572] font-semibold">
                        {fmt(selectedInvoice.amount)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "text-xs px-2.5 py-1 rounded-full font-medium",
                        STATUS_COLORS[displayStatus(selectedInvoice)] || STATUS_COLORS.DRAFT
                      )}
                    >
                      {displayStatus(selectedInvoice)}
                    </span>
                  </div>
                  <button
                    onClick={() => setSelectedInvoice(null)}
                    className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400 hover:text-white transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Action Buttons */}
                <div className="flex items-center gap-2">
                  {selectedInvoice.status === "DRAFT" && (
                    <button
                      onClick={() => sendMutation.mutate(selectedInvoice.id)}
                      disabled={sendMutation.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-400 rounded-lg text-xs font-medium hover:bg-blue-500/30 transition disabled:opacity-50"
                    >
                      <Send className="w-3 h-3" />
                      {sendMutation.isPending ? "Sending..." : "Send"}
                    </button>
                  )}
                  {selectedInvoice.status !== "PAID" &&
                    selectedInvoice.status !== "VOID" && (
                      <>
                        <button
                          onClick={() =>
                            setConfirmPayId({
                              id: selectedInvoice.id,
                              invoiceNumber: selectedInvoice.invoiceNumber,
                              amount: selectedInvoice.amount,
                            })
                          }
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-green-500/20 text-green-400 rounded-lg text-xs font-medium hover:bg-green-500/30 transition"
                        >
                          <DollarSign className="w-3 h-3" /> Mark Paid
                        </button>
                        <button
                          onClick={() => voidMutation.mutate(selectedInvoice.id)}
                          disabled={voidMutation.isPending}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-400 rounded-lg text-xs font-medium hover:bg-red-500/20 transition disabled:opacity-50"
                        >
                          <Ban className="w-3 h-3" /> Void
                        </button>
                      </>
                    )}
                  <button className="flex items-center gap-1.5 px-3 py-1.5 bg-white/5 text-slate-400 rounded-lg text-xs font-medium hover:bg-white/10 transition ml-auto">
                    <Download className="w-3 h-3" /> PDF
                  </button>
                </div>
              </div>

              {/* Mini Tabs */}
              <div className="flex items-center gap-0 px-5 border-b border-white/5 shrink-0">
                {DETAIL_TABS.map((tab) => {
                  const Icon = tab.icon;
                  const active = detailTab === tab.key;
                  return (
                    <button
                      key={tab.key}
                      onClick={() => setDetailTab(tab.key)}
                      className={cn(
                        "flex items-center gap-1.5 px-3 py-2.5 text-xs font-medium transition border-b-2 -mb-px",
                        active
                          ? "text-[#C5A572] border-[#C5A572]"
                          : "text-slate-500 border-transparent hover:text-slate-300"
                      )}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              {/* Tab Content */}
              <div className="flex-1 overflow-y-auto p-5">
                {detailTab === "summary" && (
                  <SummaryTab invoice={selectedInvoice} />
                )}
                {detailTab === "lineItems" && (
                  <LineItemsTab invoice={selectedInvoice} />
                )}
                {detailTab === "timeline" && (
                  <TimelineTab invoice={selectedInvoice} />
                )}
                {detailTab === "documents" && <DocumentsTab />}
                {detailTab === "notes" && (
                  <NotesTab invoice={selectedInvoice} />
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mark Paid Confirmation Modal */}
      {confirmPayId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 "
            onClick={() => setConfirmPayId(null)}
          />
          <div className="relative bg-[#0c1021] border border-white/10 rounded-2xl w-[420px] p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white">Confirm Payment</h2>
              <button
                onClick={() => setConfirmPayId(null)}
                className="text-slate-400 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-300 mb-6">
              Mark invoice{" "}
              <span className="text-white font-medium">
                {confirmPayId.invoiceNumber}
              </span>{" "}
              as paid for{" "}
              <span className="text-[#C5A572] font-bold">
                {fmt(confirmPayId.amount)}
              </span>
              ?
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmPayId(null)}
                className="flex-1 py-2.5 bg-white/5 text-slate-400 rounded-lg text-sm hover:bg-white/10 transition"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  markPaidMutation.mutate({
                    id: confirmPayId.id,
                    amount: confirmPayId.amount,
                    method: "BANK_TRANSFER",
                  })
                }
                disabled={markPaidMutation.isPending}
                className="flex-1 py-2.5 bg-green-500/20 text-green-400 rounded-lg text-sm font-medium hover:bg-green-500/30 transition disabled:opacity-50"
              >
                {markPaidMutation.isPending ? "Processing..." : "Confirm Paid"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Tab Components ──────────────────────────────────────── */

function SummaryTab({ invoice }: { invoice: Invoice }) {
  const route =
    invoice.load
      ? `${invoice.load.originCity}, ${invoice.load.originState} → ${invoice.load.destCity}, ${invoice.load.destState}`
      : "—";

  return (
    <div className="space-y-5">
      {/* Key details grid */}
      <div className="grid grid-cols-2 gap-4">
        <DetailField label="Invoice #" value={invoice.invoiceNumber} />
        <DetailField label="Load Ref" value={invoice.load?.referenceNumber || "—"} />
        <DetailField label="Customer" value={customerName(invoice)} />
        <DetailField label="Route" value={route} />
        <DetailField label="Total Amount" value={fmt(invoice.amount)} highlight />
        <DetailField label="Due Date" value={fmtDate(invoice.dueDate)} warn={!!invoice.dueDate && new Date(invoice.dueDate) < new Date() && invoice.status !== "PAID" && invoice.status !== "VOID"} />
        <DetailField label="Created" value={fmtDate(invoice.createdAt)} />
        <DetailField
          label="Payment Method"
          value={invoice.paidAt ? "Bank Transfer" : "—"}
        />
      </div>

      {/* Payment info */}
      {(invoice.paidAt || invoice.paidAmount) && (
        <div className="bg-green-500/5 border border-green-500/10 rounded-lg p-4">
          <h4 className="text-xs text-green-400 font-medium mb-2">
            PAYMENT RECEIVED
          </h4>
          <div className="grid grid-cols-2 gap-3">
            {invoice.paidAmount !== null && invoice.paidAmount !== undefined && (
              <DetailField label="Paid Amount" value={fmt(invoice.paidAmount)} />
            )}
            {invoice.paidAt && (
              <DetailField label="Paid Date" value={fmtDate(invoice.paidAt)} />
            )}
            {invoice.paidDate && !invoice.paidAt && (
              <DetailField label="Paid Date" value={fmtDate(invoice.paidDate)} />
            )}
          </div>
        </div>
      )}

      {/* Amount breakdown */}
      {(invoice.lineHaulAmount || invoice.fuelSurchargeAmount || invoice.accessorialsAmount) && (
        <div className="bg-white/[0.03] rounded-lg p-4">
          <h4 className="text-xs text-slate-500 font-medium mb-3">
            AMOUNT BREAKDOWN
          </h4>
          <div className="space-y-2">
            {invoice.lineHaulAmount != null && invoice.lineHaulAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Line Haul</span>
                <span className="text-sm text-white tabular-nums">
                  {fmt(invoice.lineHaulAmount)}
                </span>
              </div>
            )}
            {invoice.fuelSurchargeAmount != null && invoice.fuelSurchargeAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Fuel Surcharge</span>
                <span className="text-sm text-white tabular-nums">
                  {fmt(invoice.fuelSurchargeAmount)}
                </span>
              </div>
            )}
            {invoice.accessorialsAmount != null && invoice.accessorialsAmount > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Accessorials</span>
                <span className="text-sm text-white tabular-nums">
                  {fmt(invoice.accessorialsAmount)}
                </span>
              </div>
            )}
            {invoice.factoringFee != null && invoice.factoringFee > 0 && (
              <div className="flex justify-between">
                <span className="text-sm text-slate-400">Factoring Fee</span>
                <span className="text-sm text-red-400 tabular-nums">
                  -{fmt(invoice.factoringFee)}
                </span>
              </div>
            )}
            <div className="pt-2 border-t border-white/10 flex justify-between">
              <span className="text-sm text-white font-medium">Total</span>
              <span className="text-sm text-[#C5A572] font-bold tabular-nums">
                {fmt(invoice.amount)}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function LineItemsTab({ invoice }: { invoice: Invoice }) {
  const lineItems = invoice.lineItems;

  // Fallback: construct from breakdown fields if no lineItems array
  const items = lineItems?.length
    ? lineItems
    : [
        invoice.lineHaulAmount && {
          type: "LINE_HAUL",
          description: "Line Haul",
          amount: invoice.lineHaulAmount,
          quantity: 1,
          rate: invoice.lineHaulAmount,
        },
        invoice.fuelSurchargeAmount && {
          type: "FUEL_SURCHARGE",
          description: "Fuel Surcharge",
          amount: invoice.fuelSurchargeAmount,
          quantity: 1,
          rate: invoice.fuelSurchargeAmount,
        },
        invoice.accessorialsAmount && {
          type: "ACCESSORIAL",
          description: "Accessorials",
          amount: invoice.accessorialsAmount,
          quantity: 1,
          rate: invoice.accessorialsAmount,
        },
      ].filter(Boolean) as {
        type: string;
        description: string;
        amount: number;
        quantity: number;
        rate: number;
      }[];

  if (!items.length) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-slate-500">
        <ListOrdered className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">No line items available</p>
      </div>
    );
  }

  return (
    <div>
      <table className="w-full">
        <thead>
          <tr className="border-b border-white/5">
            <th className="text-left text-xs text-slate-500 font-medium py-2 pr-3">
              Type
            </th>
            <th className="text-left text-xs text-slate-500 font-medium py-2 pr-3">
              Description
            </th>
            <th className="text-right text-xs text-slate-500 font-medium py-2 pr-3">
              Qty
            </th>
            <th className="text-right text-xs text-slate-500 font-medium py-2 pr-3">
              Rate
            </th>
            <th className="text-right text-xs text-slate-500 font-medium py-2">
              Amount
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {items.map((item, i) => (
            <tr key={i}>
              <td className="py-2.5 pr-3">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 font-medium uppercase">
                  {item.type.replace(/_/g, " ")}
                </span>
              </td>
              <td className="py-2.5 pr-3 text-sm text-slate-300">
                {item.description}
              </td>
              <td className="py-2.5 pr-3 text-sm text-slate-400 text-right tabular-nums">
                {item.quantity}
              </td>
              <td className="py-2.5 pr-3 text-sm text-slate-400 text-right tabular-nums">
                {fmt(item.rate)}
              </td>
              <td className="py-2.5 text-sm text-white text-right font-medium tabular-nums">
                {fmt(item.amount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-white/10">
            <td colSpan={4} className="py-2.5 text-sm text-white font-medium text-right pr-3">
              Total
            </td>
            <td className="py-2.5 text-sm text-[#C5A572] font-bold text-right tabular-nums">
              {fmt(invoice.amount)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function TimelineTab({ invoice }: { invoice: Invoice }) {
  // Construct timeline from available date fields
  const events: { label: string; date: string | null; status: string; done: boolean }[] = [
    {
      label: "Invoice Created",
      date: invoice.createdAt,
      status: "DRAFT",
      done: true,
    },
    {
      label: "Invoice Sent",
      date: invoice.status !== "DRAFT" ? invoice.createdAt : null, // approximate — real sentAt would be ideal
      status: "SENT",
      done: ["SENT", "VIEWED", "PARTIAL", "PAID"].includes(invoice.status),
    },
    {
      label: "Payment Received",
      date: invoice.paidAt || invoice.paidDate || null,
      status: "PAID",
      done: invoice.status === "PAID",
    },
  ];

  if (invoice.status === "VOID") {
    events.push({
      label: "Invoice Voided",
      date: null,
      status: "VOID",
      done: true,
    });
  }

  return (
    <div className="space-y-0">
      {events.map((event, i) => {
        const isLast = i === events.length - 1;
        return (
          <div key={i} className="flex gap-3">
            {/* Vertical line + dot */}
            <div className="flex flex-col items-center">
              <div
                className={cn(
                  "w-2.5 h-2.5 rounded-full mt-1 shrink-0",
                  event.done
                    ? event.status === "VOID"
                      ? "bg-red-400"
                      : event.status === "PAID"
                      ? "bg-green-400"
                      : "bg-[#C5A572]"
                    : "bg-white/10 border border-white/20"
                )}
              />
              {!isLast && (
                <div
                  className={cn(
                    "w-px flex-1 min-h-[32px]",
                    event.done ? "bg-white/10" : "bg-white/5"
                  )}
                />
              )}
            </div>
            {/* Content */}
            <div className="pb-5">
              <p
                className={cn(
                  "text-sm font-medium",
                  event.done ? "text-white" : "text-slate-500"
                )}
              >
                {event.label}
              </p>
              <p className="text-xs text-slate-500 mt-0.5">
                {event.date ? fmtDateTime(event.date) : "Pending"}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DocumentsTab() {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-500">
      <Paperclip className="w-8 h-8 mb-2 opacity-40" />
      <p className="text-sm font-medium">No documents attached</p>
      <p className="text-xs mt-1 text-slate-400">
        BOL, POD, and rate confirmations will appear here
      </p>
    </div>
  );
}

function NotesTab({ invoice }: { invoice: Invoice }) {
  // Placeholder — notes would come from API when available
  return (
    <div className="flex flex-col items-center justify-center py-12 text-slate-500">
      <StickyNote className="w-8 h-8 mb-2 opacity-40" />
      <p className="text-sm font-medium">No notes</p>
      <p className="text-xs mt-1 text-slate-400">
        Internal notes for invoice {invoice.invoiceNumber}
      </p>
    </div>
  );
}

/* ── Shared Components ───────────────────────────────────── */

function DetailField({
  label,
  value,
  highlight,
  warn,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  warn?: boolean;
}) {
  return (
    <div>
      <p className="text-[11px] text-slate-500 mb-0.5">{label}</p>
      <p
        className={cn(
          "text-sm",
          highlight
            ? "text-[#C5A572] font-semibold"
            : warn
            ? "text-red-400 font-medium"
            : "text-white"
        )}
      >
        {value}
      </p>
    </div>
  );
}
