"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ShipperCard, ShipperBadge } from "@/components/shipper";
import type { InvoicesResponse } from "@/components/shipper/shipperData";

const filterOptions = ["All", "Unpaid", "Processing", "Paid"];

export default function ShipperInvoicesPage() {
  const [activeFilter, setActiveFilter] = useState("All");
  const [page, setPage] = useState(1);

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
        <button className="inline-flex items-center gap-1.5 text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#C9A84C]">
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
                  <td className="px-4 py-3">
                    <button className="inline-flex items-center gap-1 text-gray-500 text-[11px] font-semibold uppercase tracking-wider hover:text-[#C9A84C]">
                      <Download size={14} /> PDF
                    </button>
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
    </div>
  );
}
