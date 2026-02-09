"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Zap, ChevronDown, ChevronUp } from "lucide-react";

interface EDITransaction {
  id: string;
  transactionSet: string;
  direction: string;
  loadId: string | null;
  carrierId: string | null;
  rawPayload: string;
  status: string;
  errorMessage: string | null;
  createdAt: string;
  processedAt: string | null;
  load?: { referenceNumber: string } | null;
}

const TRANSACTION_TYPES = [
  { value: "", label: "All Types" },
  { value: "204", label: "204 — Load Tender" },
  { value: "990", label: "990 — Response" },
  { value: "214", label: "214 — Status Update" },
  { value: "210", label: "210 — Invoice" },
];

const STATUS_COLORS: Record<string, string> = {
  PENDING: "bg-yellow-500/20 text-yellow-400",
  SENT: "bg-blue-500/20 text-blue-400",
  RECEIVED: "bg-green-500/20 text-green-400",
  ACKNOWLEDGED: "bg-green-500/20 text-green-400",
  ERROR: "bg-red-500/20 text-red-400",
};

export default function EDIPage() {
  const [typeFilter, setTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [page, setPage] = useState(1);

  const { data } = useQuery({
    queryKey: ["edi-transactions", typeFilter, statusFilter, page],
    queryFn: () => api.get<{ transactions: EDITransaction[]; total: number; totalPages: number }>(
      `/edi/transactions?transactionSet=${typeFilter}&status=${statusFilter}&page=${page}&limit=20`
    ).then((r) => r.data),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2"><Zap className="w-6 h-6 text-gold" /> EDI Transactions</h1>
          <p className="text-slate-400 text-sm mt-1">Electronic Data Interchange activity log — 204, 990, 214, 210</p>
        </div>
      </div>

      <div className="flex gap-3">
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
          {TRANSACTION_TYPES.map((t) => <option key={t.value} value={t.value} className="bg-[#0f172a]">{t.label}</option>)}
        </select>
        <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
          className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white">
          <option value="" className="bg-[#0f172a]">All Statuses</option>
          {["PENDING", "SENT", "RECEIVED", "ACKNOWLEDGED", "ERROR"].map((s) => <option key={s} value={s} className="bg-[#0f172a]">{s}</option>)}
        </select>
      </div>

      <div className="bg-white/5 rounded-xl border border-white/10">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-slate-400 border-b border-white/10">
              <th className="text-left px-6 py-3 font-medium">Date</th>
              <th className="text-left px-4 py-3 font-medium">Type</th>
              <th className="text-left px-4 py-3 font-medium">Direction</th>
              <th className="text-left px-4 py-3 font-medium">Load Ref#</th>
              <th className="text-left px-4 py-3 font-medium">Status</th>
              <th className="w-10"></th>
            </tr>
          </thead>
          <tbody>
            {data?.transactions?.map((t) => (
              <>
                <tr key={t.id} onClick={() => setExpanded(expanded === t.id ? null : t.id)}
                  className="border-b border-white/5 cursor-pointer hover:bg-white/5 transition">
                  <td className="px-6 py-3 text-slate-300">{new Date(t.createdAt).toLocaleString()}</td>
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 bg-white/10 rounded text-white font-mono text-xs">{t.transactionSet}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-300">{t.direction === "OUTBOUND" ? "↑ Out" : "↓ In"}</td>
                  <td className="px-4 py-3 text-slate-300">{t.load?.referenceNumber || "—"}</td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${STATUS_COLORS[t.status] || "bg-white/10 text-white"}`}>{t.status}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-400">{expanded === t.id ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}</td>
                </tr>
                {expanded === t.id && (
                  <tr key={`${t.id}-payload`}>
                    <td colSpan={6} className="px-6 py-4 bg-black/20">
                      <pre className="text-xs text-slate-300 overflow-x-auto whitespace-pre-wrap font-mono bg-black/30 p-4 rounded-lg">
                        {JSON.stringify(JSON.parse(t.rawPayload), null, 2)}
                      </pre>
                      {t.errorMessage && <p className="text-red-400 text-xs mt-2">Error: {t.errorMessage}</p>}
                    </td>
                  </tr>
                )}
              </>
            ))}
            {(!data?.transactions || data.transactions.length === 0) && (
              <tr><td colSpan={6} className="px-6 py-8 text-center text-slate-500">No EDI transactions found</td></tr>
            )}
          </tbody>
        </table>
        {data && data.totalPages > 1 && (
          <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between">
            <span className="text-xs text-slate-500">{data.total} transactions</span>
            <div className="flex gap-2">
              <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1} className="px-3 py-1 text-xs bg-white/5 rounded text-slate-400 disabled:opacity-30">Prev</button>
              <span className="text-xs text-slate-400 py-1">Page {page} of {data.totalPages}</span>
              <button onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} className="px-3 py-1 text-xs bg-white/5 rounded text-slate-400 disabled:opacity-30">Next</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
