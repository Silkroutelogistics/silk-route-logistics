"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import { FileSpreadsheet, Download, Calendar, Filter, BarChart3, FileText, DollarSign, Truck, Clock, TrendingUp } from "lucide-react";

interface ReportConfig {
  id: string;
  label: string;
  description: string;
  icon: typeof FileSpreadsheet;
  color: string;
  bg: string;
  endpoint: string;
  params: { key: string; label: string; type: "date" | "select"; options?: string[] }[];
}

const REPORTS: ReportConfig[] = [
  {
    id: "revenue", label: "Revenue Report", description: "Revenue breakdown by customer, lane, and period",
    icon: DollarSign, color: "text-green-400", bg: "bg-green-500/10",
    endpoint: "/accounting/reports/revenue",
    params: [
      { key: "startDate", label: "Start Date", type: "date" },
      { key: "endDate", label: "End Date", type: "date" },
    ],
  },
  {
    id: "expense", label: "Expense Report", description: "Carrier payments, Quick Pay fees, and operational costs",
    icon: TrendingUp, color: "text-red-400", bg: "bg-red-500/10",
    endpoint: "/accounting/reports/expenses",
    params: [
      { key: "startDate", label: "Start Date", type: "date" },
      { key: "endDate", label: "End Date", type: "date" },
    ],
  },
  {
    id: "aging", label: "AR Aging Summary", description: "Accounts receivable aging by bucket with customer detail",
    icon: Clock, color: "text-orange-400", bg: "bg-orange-500/10",
    endpoint: "/accounting/reports/aging-summary",
    params: [],
  },
  {
    id: "carrier-settlement", label: "Carrier Settlement", description: "All carrier payments for a period with tier and fee detail",
    icon: Truck, color: "text-blue-400", bg: "bg-blue-500/10",
    endpoint: "/accounting/reports/carrier-settlement",
    params: [
      { key: "startDate", label: "Start Date", type: "date" },
      { key: "endDate", label: "End Date", type: "date" },
    ],
  },
  {
    id: "margin", label: "Margin Analysis", description: "Per-load margin analysis with lane and carrier breakdown",
    icon: BarChart3, color: "text-purple-400", bg: "bg-purple-500/10",
    endpoint: "/accounting/reports/margin",
    params: [
      { key: "startDate", label: "Start Date", type: "date" },
      { key: "endDate", label: "End Date", type: "date" },
    ],
  },
  {
    id: "fund-statement", label: "Fund Statement", description: "Factoring fund activity with deposits, disbursements, and fees",
    icon: FileText, color: "text-cyan-400", bg: "bg-cyan-500/10",
    endpoint: "/accounting/reports/fund-statement",
    params: [
      { key: "startDate", label: "Start Date", type: "date" },
      { key: "endDate", label: "End Date", type: "date" },
    ],
  },
];

export default function ReportsPage() {
  const [selectedReport, setSelectedReport] = useState<string | null>(null);
  const [params, setParams] = useState<Record<string, string>>({});
  const [downloading, setDownloading] = useState(false);

  const report = REPORTS.find(r => r.id === selectedReport);

  const handleDownload = async (format: "csv" | "pdf") => {
    if (!report) return;
    setDownloading(true);
    try {
      const qs = new URLSearchParams({ ...params, format });
      const response = await api.get(`${report.endpoint}?${qs}`, { responseType: "blob" });
      const blob = new Blob([response.data]);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${report.id}-report.${format}`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      // Silently handle — the API might not support export yet
    }
    setDownloading(false);
  };

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">Reports & Export</h1>
        <p className="text-sm text-slate-400 mt-1">Generate and download financial reports</p>
      </div>

      {/* Report Grid */}
      <div className="grid grid-cols-3 gap-4 mb-8">
        {REPORTS.map(r => {
          const Icon = r.icon;
          const isSelected = selectedReport === r.id;
          return (
            <button
              key={r.id}
              onClick={() => { setSelectedReport(r.id); setParams({}); }}
              className={`text-left p-5 rounded-xl border transition ${
                isSelected
                  ? "bg-[#C8963E]/10 border-[#C8963E]/30"
                  : "bg-white/5 border-white/5 hover:bg-white/[0.07]"
              }`}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`w-9 h-9 rounded-lg ${r.bg} flex items-center justify-center`}>
                  <Icon className={`w-4.5 h-4.5 ${r.color}`} />
                </div>
                <h3 className="text-sm font-semibold text-white">{r.label}</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">{r.description}</p>
            </button>
          );
        })}
      </div>

      {/* Report Parameters & Download */}
      {report && (
        <div className="bg-white/5 border border-white/5 rounded-xl p-6">
          <h2 className="text-sm font-semibold text-white mb-4">Configure: {report.label}</h2>

          {report.params.length > 0 && (
            <div className="flex items-end gap-4 mb-6">
              {report.params.map(p => (
                <div key={p.key} className="flex-1 max-w-xs">
                  <label className="text-xs text-slate-400 mb-1 block">{p.label}</label>
                  {p.type === "date" ? (
                    <input
                      type="date"
                      value={params[p.key] || ""}
                      onChange={e => setParams(v => ({ ...v, [p.key]: e.target.value }))}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C8963E]/50"
                    />
                  ) : (
                    <select
                      value={params[p.key] || ""}
                      onChange={e => setParams(v => ({ ...v, [p.key]: e.target.value }))}
                      className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none"
                    >
                      <option value="">All</option>
                      {p.options?.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-3">
            <button
              onClick={() => handleDownload("csv")}
              disabled={downloading}
              className="px-5 py-2.5 bg-[#C8963E] text-white rounded-lg text-sm font-medium hover:bg-[#B8862E] transition flex items-center gap-2 disabled:opacity-50"
            >
              <Download className="w-4 h-4" /> Download CSV
            </button>
            <button
              onClick={() => handleDownload("pdf")}
              disabled={downloading}
              className="px-5 py-2.5 bg-white/10 text-white rounded-lg text-sm font-medium hover:bg-white/15 transition flex items-center gap-2 disabled:opacity-50"
            >
              <FileSpreadsheet className="w-4 h-4" /> Download PDF
            </button>
          </div>
        </div>
      )}

      {!selectedReport && (
        <div className="bg-white/5 border border-white/5 rounded-xl p-12 text-center">
          <FileSpreadsheet className="w-10 h-10 text-slate-500 mx-auto mb-3" />
          <p className="text-sm text-slate-400">Select a report type above to configure and download</p>
        </div>
      )}
    </div>
  );
}
