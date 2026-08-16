"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";

interface Props {
  onClose: () => void;
}

// QUICKPAY is deliberately not offered here.
//
// This modal used to carry a free-text "Discount %" box defaulted to 2 — the
// GOLD rate, which is wrong for the Silver carrier this desk will onboard
// first — and posted it straight through to /carrier-pay, where it was applied
// with no pilot check, no signed-agreement check and no per-load election. That
// is a second way to price Quick Pay, sitting beside the §8 ladder, and two
// ladders is how they diverge.
//
// A Quick Pay settlement is now created by the delivery pricing path off the
// fee frozen on the load's rate confirmation. If a Quick Pay row has to be
// raised by hand, the fee still comes from the ladder behind the pilot gate —
// the backend derives it and refuses if the carrier is not entitled to one.
const PAYMENT_METHODS = ["ACH", "CHECK", "WIRE", "FACTORING"] as const;

export function CreateCarrierPayModal({ onClose }: Props) {
  const queryClient = useQueryClient();
  const [carrierId, setCarrierId] = useState("");
  const [loadId, setLoadId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<string>("ACH");
  const [error, setError] = useState<string | null>(null);

  const parsedAmount = parseFloat(amount) || 0;

  const create = useMutation({
    mutationFn: () =>
      api.post("/carrier-pay", {
        carrierId,
        loadId,
        amount: parsedAmount,
        paymentMethod,
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
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white outline-none focus:ring-2 focus:ring-gold/50 focus:border-gold/50">
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m} className="bg-navy">{m}</option>
              ))}
            </select>
            <p className="mt-1.5 text-xs text-slate-400">
              Pays the full amount. A Quick Pay fee comes from the tier ladder on the load&apos;s rate confirmation, not
              from this form.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose}
              className="flex-1 px-4 py-2 border border-white/10 rounded-lg text-white/70 hover:bg-white/5 transition">
              Cancel
            </button>
            <button type="submit" disabled={create.isPending}
              className="flex-1 px-4 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold-light disabled:opacity-50 transition">
              {create.isPending ? "Creating..." : `Create Pay${parsedAmount > 0 ? ` ($${parsedAmount.toLocaleString()})` : ""}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
