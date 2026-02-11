"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { CreditCard, Search, Shield, AlertTriangle, TrendingUp, Edit3, X, Save } from "lucide-react";

interface ShipperCredit {
  id: string;
  customerId: string;
  creditLimit: number;
  currentUtilized: number;
  creditGrade: string;
  paymentTerms: string;
  avgDaysToPay: number | null;
  utilizationPercent: number;
  availableCredit: number;
  customer: { id: string; name: string; contactName?: string | null; email?: string | null; phone?: string | null; status?: string };
}

const GRADE_COLORS: Record<string, string> = {
  AAA: "text-green-400 bg-green-500/10",
  AA: "text-emerald-400 bg-emerald-500/10",
  A: "text-blue-400 bg-blue-500/10",
  BBB: "text-yellow-400 bg-yellow-500/10",
  BB: "text-orange-400 bg-orange-500/10",
  B: "text-red-400 bg-red-500/10",
  C: "text-red-600 bg-red-600/10",
  D: "text-red-800 bg-red-800/10",
};

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

export default function CreditLimitsPage() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({ creditLimit: 0, creditGrade: "", paymentTerms: "" });
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["shipper-credits", search],
    queryFn: () => api.get<{ credits: ShipperCredit[] }>(`/accounting/credit${search ? `?search=${search}` : ""}`).then(r => r.data),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...body }: { id: string; creditLimit: number; creditGrade: string; paymentTerms: string }) =>
      api.put(`/accounting/credit/${id}`, body),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["shipper-credits"] }); setEditing(null); },
  });

  const startEdit = (credit: ShipperCredit) => {
    setEditing(credit.id);
    setEditValues({ creditLimit: credit.creditLimit, creditGrade: credit.creditGrade, paymentTerms: credit.paymentTerms });
  };

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Credit Limits</h1>
        <p className="text-sm text-slate-400 mt-1">Manage shipper credit grades and payment terms</p>
      </div>

      <div className="flex items-center gap-3 mb-6">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
          <input
            type="text"
            placeholder="Search shipper..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-[#C8963E]/50"
          />
        </div>
      </div>

      <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/5">
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Shipper</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Credit Grade</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Credit Limit</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Current Balance</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Utilization</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Payment Terms</th>
              <th className="text-left text-xs text-slate-500 font-medium px-5 py-3">Avg Days to Pay</th>
              <th className="text-right text-xs text-slate-500 font-medium px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {isLoading ? (
              [...Array(3)].map((_, i) => <tr key={i}><td colSpan={8} className="px-5 py-3"><div className="h-5 bg-white/5 rounded animate-pulse" /></td></tr>)
            ) : data?.credits?.length ? (
              data.credits.map(credit => {
                const utilization = credit.utilizationPercent ?? (credit.creditLimit > 0 ? (credit.currentUtilized / credit.creditLimit) * 100 : 0);
                const isEditing = editing === credit.id;
                return (
                  <tr key={credit.id} className="hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <p className="text-sm text-white font-medium">{credit.customer.name || credit.customer.contactName || "—"}</p>
                      <p className="text-[10px] text-slate-500">{credit.customer.email || ""}</p>
                    </td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <select value={editValues.creditGrade} onChange={e => setEditValues(v => ({ ...v, creditGrade: e.target.value }))} className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white">
                          {Object.keys(GRADE_COLORS).map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                      ) : (
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${GRADE_COLORS[credit.creditGrade] || ""}`}>{credit.creditGrade}</span>
                      )}
                    </td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <input type="number" value={editValues.creditLimit} onChange={e => setEditValues(v => ({ ...v, creditLimit: Number(e.target.value) }))} className="bg-white/10 border border-white/20 rounded px-2 py-1 text-sm text-white w-28" />
                      ) : (
                        <span className="text-sm text-white">{fmt(credit.creditLimit)}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-white">{fmt(credit.currentUtilized)}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-2 bg-white/5 rounded-full overflow-hidden">
                          <div className={`h-full rounded-full ${utilization > 80 ? "bg-red-500" : utilization > 50 ? "bg-yellow-500" : "bg-green-500"}`} style={{ width: `${Math.min(100, utilization)}%` }} />
                        </div>
                        <span className={`text-xs ${utilization > 80 ? "text-red-400" : "text-slate-400"}`}>{utilization.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="px-5 py-3">
                      {isEditing ? (
                        <select value={editValues.paymentTerms} onChange={e => setEditValues(v => ({ ...v, paymentTerms: e.target.value }))} className="bg-white/10 border border-white/20 rounded px-2 py-1 text-xs text-white">
                          {["NET_15", "NET_30", "NET_45", "NET_60", "NET_90", "QUICK_PAY"].map(t => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                        </select>
                      ) : (
                        <span className="text-sm text-slate-300">{credit.paymentTerms.replace("_", " ")}</span>
                      )}
                    </td>
                    <td className="px-5 py-3 text-sm text-slate-300">{credit.avgDaysToPay ? `${credit.avgDaysToPay}d` : "—"}</td>
                    <td className="px-5 py-3 text-right">
                      {isEditing ? (
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => updateMutation.mutate({ id: credit.id, ...editValues })} className="p-1.5 rounded-lg hover:bg-green-500/20 text-green-400"><Save className="w-3.5 h-3.5" /></button>
                          <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"><X className="w-3.5 h-3.5" /></button>
                        </div>
                      ) : (
                        <button onClick={() => startEdit(credit)} className="p-1.5 rounded-lg hover:bg-white/10 text-slate-400"><Edit3 className="w-3.5 h-3.5" /></button>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr><td colSpan={8} className="px-5 py-12 text-center text-sm text-slate-500">No shipper credits found</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
