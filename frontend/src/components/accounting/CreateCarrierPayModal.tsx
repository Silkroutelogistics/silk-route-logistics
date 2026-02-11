"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  onClose: () => void;
}

const PAYMENT_METHODS = ["ACH", "CHECK", "WIRE", "QUICKPAY", "FACTORING"] as const;

export function CreateCarrierPayModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [carrierId, setCarrierId] = useState("");
  const [loadId, setLoadId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("ACH");
  const [isQuickPay, setIsQuickPay] = useState(false);
  const [quickPayPct, setQuickPayPct] = useState("2");
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = parseFloat(amount) || 0;
  const discount = isQuickPay ? Number((parsedAmount * parseFloat(quickPayPct || "0") / 100).toFixed(2)) : 0;
  const netAmount = parsedAmount - discount;

  const create = useMutation({
    mutationFn: () =>
      api.post("/carrier-pay", {
        carrierId,
        loadId,
        amount: parsedAmount,
        paymentMethod: isQuickPay ? "QUICKPAY" : paymentMethod,
        isQuickPay,
        quickPayDiscountPct: isQuickPay ? parseFloat(quickPayPct) : undefined,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["carrier-pays"] });
      queryClient.invalidateQueries({ queryKey: ["carrier-pay-summary"] });
      onClose();
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to create carrier pay";
      setError(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!carrierId.trim() || !loadId.trim()) { setError("Carrier ID and Load ID are required"); return; }
    if (parsedAmount <= 0) { setError("Amount must be greater than 0"); return; }
    create.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-navy rounded-xl border border-white/10 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Create Carrier Pay</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition">
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Carrier ID</label>
            <input value={carrierId} onChange={(e) => setCarrierId(e.target.value)} placeholder="Enter carrier user ID"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-gold/50 focus:border-gold/50 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Load ID</label>
            <input value={loadId} onChange={(e) => setLoadId(e.target.value)} placeholder="Enter load ID"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-gold/50 focus:border-gold/50 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Amount ($)</label>
            <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-gold/50 focus:border-gold/50 outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Payment Method</label>
            <select value={isQuickPay ? "QUICKPAY" : paymentMethod} onChange={(e) => {
              if (e.target.value === "QUICKPAY") { setIsQuickPay(true); } else { setIsQuickPay(false); setPaymentMethod(e.target.value); }
            }}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold/50">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m} className="bg-navy">{m}</option>
              ))}
            </select>
          </div>

          {/* QuickPay */}
          {isQuickPay && (
            <div className="bg-gold/5 border border-gold/20 rounded-lg p-4 space-y-3">
              <p className="text-sm font-medium text-gold">QuickPay Discount</p>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs text-slate-400 mb-1">Discount %</label>
                  <input type="number" step="0.1" min="0" max="10" value={quickPayPct} onChange={(e) => setQuickPayPct(e.target.value)}
                    className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white outline-none text-sm" />
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-slate-400 mb-1">Discount</label>
                  <p className="text-lg font-bold text-red-400 py-2">-${discount.toLocaleString()}</p>
                </div>
                <div className="flex-1">
                  <label className="block text-xs text-slate-400 mb-1">Net Amount</label>
                  <p className="text-lg font-bold text-green-400 py-2">${netAmount.toLocaleString()}</p>
                </div>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-white/10 rounded-lg text-white/70 hover:bg-white/5 transition">
              Cancel
            </button>
            <button type="submit" disabled={create.isPending}
              className="flex-1 px-4 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold-light disabled:opacity-50 transition">
              {create.isPending ? "Creating..." : `Create Pay${isQuickPay ? ` ($${netAmount.toLocaleString()})` : ""}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
