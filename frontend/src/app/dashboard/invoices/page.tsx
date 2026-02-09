"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CreateInvoiceModal } from "@/components/invoices/CreateInvoiceModal";
import { cn } from "@/lib/utils";
import { Download, FileText } from "lucide-react";
import type { Invoice } from "@shared/types";

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

export default function InvoicesPage() {
  const [showCreate, setShowCreate] = useState(false);
  const { data: invoices, isLoading } = useQuery({
    queryKey: ["invoices"],
    queryFn: () => api.get<Invoice[]>("/invoices").then((r) => r.data),
  });

  const downloadPdf = async (invoiceId: string, invoiceNumber: string) => {
    const res = await api.get(`/pdf/invoice/${invoiceId}`, { responseType: "blob" });
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoiceNumber}.pdf`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Invoices</h1>
          <p className="text-slate-400 text-sm mt-1">{invoices?.length || 0} total invoices</p>
        </div>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold/90 transition text-sm">
          Create Invoice
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-400 text-center py-12">Loading...</p>
      ) : (
        <div className="space-y-3">
          {invoices?.map((inv) => (
            <div key={inv.id} className="bg-white/5 rounded-xl border border-white/10 p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <FileText className="w-4 h-4 text-gold" />
                    <span className="font-semibold text-white">{inv.invoiceNumber}</span>
                    <span className={cn("px-2 py-0.5 rounded text-xs font-medium", statusColors[inv.status] || "")}>{inv.status.replace(/_/g, " ")}</span>
                  </div>
                  <p className="text-sm text-slate-400">
                    {inv.load ? `${inv.load.originCity}, ${inv.load.originState} → ${inv.load.destCity}, ${inv.load.destState}` : "—"}
                  </p>
                  <div className="mt-2">
                    <PaymentTimeline status={inv.status} />
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-xl font-bold text-gold">${inv.amount.toLocaleString()}</p>
                    {inv.advanceAmount && (
                      <p className="text-xs text-green-400">Advanced: ${inv.advanceAmount.toLocaleString()}</p>
                    )}
                    <p className="text-xs text-slate-500">{new Date(inv.createdAt).toLocaleDateString()}</p>
                  </div>
                  <button
                    onClick={() => downloadPdf(inv.id, inv.invoiceNumber)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-white/10 text-white rounded-lg text-xs hover:bg-white/20 transition"
                    title="Download PDF"
                  >
                    <Download className="w-3.5 h-3.5" /> PDF
                  </button>
                </div>
              </div>
            </div>
          ))}
          {invoices?.length === 0 && (
            <div className="bg-white/5 rounded-xl border border-white/10 p-12 text-center text-slate-500">No invoices yet</div>
          )}
        </div>
      )}

      {showCreate && <CreateInvoiceModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
