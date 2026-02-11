"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Landmark, TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight, Plus, X, ChevronLeft, ChevronRight } from "lucide-react";

interface FundData {
  balance: number;
  totalDeposits: number;
  totalWithdrawals: number;
  totalQuickPayFees: number;
  monthlyIncome: number;
  transactions: {
    id: string;
    type: string;
    amount: number;
    description: string;
    balanceAfter: number;
    createdAt: string;
  }[];
  totalTransactions: number;
  totalPages: number;
}

const fmt = (n: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 0 }).format(n);

const TYPE_COLORS: Record<string, { color: string; icon: "up" | "down" }> = {
  DEPOSIT: { color: "text-green-400", icon: "up" },
  WITHDRAWAL: { color: "text-red-400", icon: "down" },
  QUICK_PAY_FEE: { color: "text-yellow-400", icon: "up" },
  QUICK_PAY_DISBURSEMENT: { color: "text-orange-400", icon: "down" },
  INTEREST: { color: "text-cyan-400", icon: "up" },
  ADJUSTMENT: { color: "text-purple-400", icon: "up" },
};

export default function FundBalancePage() {
  const [page, setPage] = useState(1);
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositDesc, setDepositDesc] = useState("");
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<FundData>({
    queryKey: ["factoring-fund", page],
    queryFn: async () => {
      const [balRes, txRes] = await Promise.all([
        api.get("/accounting/fund/balance"),
        api.get(`/accounting/fund/transactions?page=${page}`),
      ]);
      return { ...balRes.data, ...txRes.data } as FundData;
    },
  });

  const depositMutation = useMutation({
    mutationFn: (body: { amount: number; description: string }) => api.post("/accounting/fund/adjustment", { ...body, type: "DEPOSIT" }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["factoring-fund"] }); setShowDeposit(false); setDepositAmount(""); setDepositDesc(""); },
  });

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Landmark className="w-6 h-6 text-cyan-400" /> Factoring Fund
          </h1>
          <p className="text-sm text-slate-400 mt-1">Quick Pay fund balance and transaction history</p>
        </div>
        <button
          onClick={() => setShowDeposit(true)}
          className="px-4 py-2 bg-[#C8963E] text-white rounded-lg text-sm font-medium hover:bg-[#B8862E] transition flex items-center gap-2"
        >
          <Plus className="w-4 h-4" /> Add Deposit
        </button>
      </div>

      {/* Balance Cards */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        <div className="bg-gradient-to-br from-cyan-500/10 to-blue-500/10 border border-cyan-500/20 rounded-xl p-5">
          <p className="text-xs text-cyan-400/70 mb-1">Fund Balance</p>
          <p className="text-3xl font-bold text-white">{fmt(data?.balance || 0)}</p>
        </div>
        <div className="bg-white/5 border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <ArrowUpRight className="w-3 h-3 text-green-400" />
            <p className="text-xs text-slate-400">Total Deposits</p>
          </div>
          <p className="text-xl font-bold text-green-400">{fmt(data?.totalDeposits || 0)}</p>
        </div>
        <div className="bg-white/5 border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <ArrowDownRight className="w-3 h-3 text-red-400" />
            <p className="text-xs text-slate-400">Total Disbursements</p>
          </div>
          <p className="text-xl font-bold text-red-400">{fmt(data?.totalWithdrawals || 0)}</p>
        </div>
        <div className="bg-white/5 border border-white/5 rounded-xl p-5">
          <div className="flex items-center gap-2 mb-1">
            <DollarSign className="w-3 h-3 text-yellow-400" />
            <p className="text-xs text-slate-400">Quick Pay Fees Earned</p>
          </div>
          <p className="text-xl font-bold text-yellow-400">{fmt(data?.totalQuickPayFees || 0)}</p>
        </div>
      </div>

      {/* Transaction History */}
      <div className="bg-white/5 border border-white/5 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-white">Transaction History</h2>
        </div>
        <div className="divide-y divide-white/5">
          {isLoading ? (
            [...Array(5)].map((_, i) => <div key={i} className="px-5 py-3"><div className="h-5 bg-white/5 rounded animate-pulse" /></div>)
          ) : data?.transactions?.length ? (
            data.transactions.map(tx => {
              const info = TYPE_COLORS[tx.type] || { color: "text-slate-400", icon: "up" as const };
              return (
                <div key={tx.id} className="px-5 py-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg ${info.icon === "up" ? "bg-green-500/10" : "bg-red-500/10"} flex items-center justify-center`}>
                      {info.icon === "up" ? <ArrowUpRight className={`w-4 h-4 ${info.color}`} /> : <ArrowDownRight className={`w-4 h-4 ${info.color}`} />}
                    </div>
                    <div>
                      <p className="text-sm text-white">{tx.description}</p>
                      <p className="text-[10px] text-slate-500">{tx.type.replace(/_/g, " ")} • {new Date(tx.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-sm font-medium ${info.icon === "up" ? "text-green-400" : "text-red-400"}`}>
                      {info.icon === "up" ? "+" : "-"}{fmt(Math.abs(tx.amount))}
                    </p>
                    <p className="text-[10px] text-slate-500">Bal: {fmt(tx.balanceAfter)}</p>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="px-5 py-12 text-center text-sm text-slate-500">No transactions yet</div>
          )}
        </div>

        {data && data.totalPages > 1 && (
          <div className="px-5 py-3 border-t border-white/5 flex items-center justify-center gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"><ChevronLeft className="w-4 h-4" /></button>
            <span className="text-xs text-slate-400">Page {page} of {data.totalPages}</span>
            <button onClick={() => setPage(p => Math.min(data.totalPages, p + 1))} disabled={page === data.totalPages} className="p-1 rounded hover:bg-white/10 text-slate-400 disabled:opacity-30"><ChevronRight className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      {/* Deposit Modal */}
      {showDeposit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => setShowDeposit(false)} />
          <div className="relative bg-[#0f172a] border border-white/10 rounded-2xl w-[400px] p-6">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-bold text-white">Add Fund Deposit</h2>
              <button onClick={() => setShowDeposit(false)} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Amount ($)</label>
                <input type="number" value={depositAmount} onChange={e => setDepositAmount(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C8963E]/50" placeholder="10000" />
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Description</label>
                <input value={depositDesc} onChange={e => setDepositDesc(e.target.value)} className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-[#C8963E]/50" placeholder="Monthly fund replenishment" />
              </div>
              <button
                onClick={() => depositMutation.mutate({ amount: Number(depositAmount), description: depositDesc || "Manual deposit" })}
                disabled={!depositAmount || Number(depositAmount) <= 0 || depositMutation.isPending}
                className="w-full py-2.5 bg-[#C8963E] text-white rounded-lg text-sm font-medium hover:bg-[#B8862E] transition disabled:opacity-50"
              >
                Deposit {depositAmount ? fmt(Number(depositAmount)) : "$0"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
