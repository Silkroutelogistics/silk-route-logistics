"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";
import { api } from "@/lib/api";
import { FileUpload } from "@/components/ui/FileUpload";

interface CreateInvoiceModalProps {
  onClose: () => void;
}

export function CreateInvoiceModal({ onClose }: CreateInvoiceModalProps) {
  const queryClient = useQueryClient();
  const [loadId, setLoadId] = useState("");
  const [amount, setAmount] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);

  const createInvoice = useMutation({
    mutationFn: async () => {
      const { data: invoice } = await api.post("/invoices", {
        loadId,
        amount: parseFloat(amount),
      });

      if (files.length > 0) {
        const formData = new FormData();
        files.forEach((f) => formData.append("files", f));
        formData.append("invoiceId", invoice.id);
        if (loadId) formData.append("loadId", loadId);
        await api.post("/documents", formData, {
          headers: { "Content-Type": "multipart/form-data" },
        });
      }

      return invoice;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      onClose();
    },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to create invoice";
      setError(message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!loadId.trim()) {
      setError("Load ID is required");
      return;
    }
    if (!amount || parseFloat(amount) <= 0) {
      setError("Amount must be greater than 0");
      return;
    }

    createInvoice.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-navy rounded-xl border border-white/10 w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Create Invoice</h2>
          <button onClick={onClose} className="p-1 hover:bg-white/10 rounded transition">
            <X className="w-5 h-5 text-white/60" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Load ID</label>
            <input
              value={loadId}
              onChange={(e) => setLoadId(e.target.value)}
              placeholder="Enter the load ID"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-gold/50 focus:border-gold/50 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Invoice Amount ($)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:ring-2 focus:ring-gold/50 focus:border-gold/50 outline-none"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-white/70 mb-2">
              Supporting Documents (BOL, POD)
            </label>
            <FileUpload files={files} onChange={setFiles} maxFiles={5} />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-white/10 rounded-lg text-white/70 hover:bg-white/5 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createInvoice.isPending}
              className="flex-1 px-4 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold-light disabled:opacity-50 transition"
            >
              {createInvoice.isPending ? "Creating..." : "Create Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
