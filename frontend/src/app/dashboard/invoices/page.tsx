"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CreateInvoiceModal } from "@/components/invoices/CreateInvoiceModal";
import { cn } from "@/lib/utils";
import type { Invoice } from "@shared/types";

const statusColors: Record<string, string> = {
  DRAFT: "bg-slate-100 text-slate-600",
  SUBMITTED: "bg-blue-50 text-blue-700",
  UNDER_REVIEW: "bg-purple-50 text-purple-700",
  APPROVED: "bg-emerald-50 text-emerald-700",
  FUNDED: "bg-green-50 text-green-700",
  PAID: "bg-green-100 text-green-800",
  REJECTED: "bg-red-50 text-red-700",
};

const statusOrder = ["DRAFT", "SUBMITTED", "UNDER_REVIEW", "APPROVED", "FUNDED", "PAID"];

function PaymentTimeline({ status }: { status: string }) {
  const currentIdx = statusOrder.indexOf(status);
  return (
    <div className="flex items-center gap-1">
      {statusOrder.slice(1).map((s, i) => (
        <div key={s} className="flex items-center gap-1">
          <div className={cn("w-2 h-2 rounded-full", i < currentIdx ? "bg-green-500" : i === currentIdx ? "bg-gold" : "bg-slate-200")} />
          {i < statusOrder.length - 2 && <div className={cn("w-4 h-0.5", i < currentIdx ? "bg-green-500" : "bg-slate-200")} />}
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Invoices</h1>
        <button onClick={() => setShowCreate(true)}
          className="px-4 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold-light transition text-sm">
          Create Invoice
        </button>
      </div>

      {isLoading ? (
        <p className="text-slate-400 text-center py-12">Loading...</p>
      ) : (
        <div className="space-y-3">
          {invoices?.map((inv) => (
            <div key={inv.id} className="bg-white rounded-xl border p-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-3 mb-1">
                    <span className="font-semibold">{inv.invoiceNumber}</span>
                    <span className={cn("px-2 py-0.5 rounded-full text-xs font-medium", statusColors[inv.status] || "")}>{inv.status}</span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {inv.load ? `${inv.load.originCity}, ${inv.load.originState} → ${inv.load.destCity}, ${inv.load.destState}` : "—"}
                  </p>
                  <div className="mt-2">
                    <PaymentTimeline status={inv.status} />
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xl font-bold">${inv.amount.toLocaleString()}</p>
                  {inv.advanceAmount && (
                    <p className="text-xs text-green-600">Advanced: ${inv.advanceAmount.toLocaleString()}</p>
                  )}
                  <p className="text-xs text-slate-400">{new Date(inv.createdAt).toLocaleDateString()}</p>
                </div>
              </div>
            </div>
          ))}
          {invoices?.length === 0 && (
            <div className="bg-white rounded-xl border p-12 text-center text-slate-400">No invoices yet</div>
          )}
        </div>
      )}

      {showCreate && <CreateInvoiceModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}
