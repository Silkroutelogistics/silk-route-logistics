"use client";

import { Download, X } from "lucide-react";

interface Props {
  selectedIds: string[];
  onClear: () => void;
  invoices: { id: string; invoiceNumber: string; amount: number; status: string; createdAt: string; load?: { originCity: string; originState: string; destCity: string; destState: string } }[];
}

// v3.8.bnr — ruling 2026-09-27, 6: an invoice's status is not set from a
// request, so the batch Approve / Mark Paid / Reject buttons are gone. The
// batch Mark Paid wrote PAID with no amount and credited no fund.
export function BatchActionsBar({ selectedIds, onClear, invoices }: Props) {
  const exportSelected = () => {
    const selected = invoices.filter((i) => selectedIds.includes(i.id));
    const headers = "Invoice #,Status,Amount,Lane,Date\n";
    const rows = selected
      .map(
        (inv) =>
          `${inv.invoiceNumber},${inv.status},${inv.amount},${inv.load ? `${inv.load.originCity} ${inv.load.originState} → ${inv.load.destCity} ${inv.load.destState}` : ""},${new Date(inv.createdAt).toLocaleDateString()}`
      )
      .join("\n");
    const blob = new Blob([headers + rows], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `invoices-batch-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (selectedIds.length === 0) return null;

  return (
    <div className="sticky bottom-4 mx-auto max-w-3xl bg-navy/95 backdrop-blur-md border border-gold/30 rounded-xl px-5 py-3 shadow-2xl flex items-center gap-4 z-30">
      <span className="text-sm text-white font-medium shrink-0">
        {selectedIds.length} selected
      </span>

      <div className="flex-1 flex items-center gap-2 flex-wrap">
        <button
          onClick={exportSelected}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20 transition"
        >
          <Download className="w-3.5 h-3.5" /> Export CSV
        </button>
      </div>

      <button onClick={onClear} className="p-1 hover:bg-white/10 rounded transition">
        <X className="w-4 h-4 text-slate-400" />
      </button>
    </div>
  );
}
