"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { X, ChevronDown, ChevronUp } from "lucide-react";
import { api } from "@/lib/api";
import { FileUpload } from "@/components/ui/FileUpload";
import { createInvoiceSchema } from "@/lib/schemas";
import { InvoiceLineItemsEditor, LineItem } from "./InvoiceLineItemsEditor";

interface CreateInvoiceModalProps {
  onClose: () => void;
}

export function CreateInvoiceModal({ onClose }: CreateInvoiceModalProps) {
  const queryClient = useQueryClient();
  const [loadId, setLoadId] = useState("");
  const [amount, setAmount] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showLineItems, setShowLineItems] = useState(false);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);

  const lineItemTotal = lineItems.reduce((s, i) => s + i.amount, 0);

  const createInvoice = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        loadId,
        amount: lineItems.length > 0 ? lineItemTotal : parseFloat(amount),
      };
      if (lineItems.length > 0) {
        payload.lineItems = lineItems.map((li, idx) => ({
          description: li.description,
          type: li.type,
          quantity: li.quantity,
          rate: li.rate,
          amount: li.amount,
          sortOrder: idx,
        }));
      }

      const { data: invoice } = await api.post("/invoices", payload);

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
      queryClient.invalidateQueries({ queryKey: ["invoice-stats"] });
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

    const finalAmount = lineItems.length > 0 ? lineItemTotal : parseFloat(amount || "0");
    const parsed = createInvoiceSchema.safeParse({ loadId, amount: finalAmount });
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }

    createInvoice.mutate();
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Create Invoice</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded transition">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error && <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm">{error}</div>}

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-1">Load ID</label>
            <input
              value={loadId}
              onChange={(e) => setLoadId(e.target.value)}
              placeholder="Enter the load ID"
              className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
            />
          </div>

          {!showLineItems && (
            <div>
              <label className="block text-sm font-medium text-gray-500 mb-1">Invoice Amount ($)</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"
              />
            </div>
          )}

          {/* Line Items Collapsible */}
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowLineItems(!showLineItems)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition text-sm font-medium text-gray-500"
            >
              <span>Line Items {lineItems.length > 0 && `(${lineItems.length})`}</span>
              {showLineItems ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>
            {showLineItems && (
              <div className="p-4 border-t border-gray-200">
                <InvoiceLineItemsEditor items={lineItems} onChange={setLineItems} />
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-500 mb-2">
              Supporting Documents (BOL, POD)
            </label>
            <FileUpload files={files} onChange={setFiles} maxFiles={5} />
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-gray-200 rounded-lg text-gray-500 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createInvoice.isPending}
              className="flex-1 px-4 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold-light disabled:opacity-50 transition"
            >
              {createInvoice.isPending ? "Creating..." : lineItems.length > 0 ? `Create Invoice ($${lineItemTotal.toLocaleString()})` : "Create Invoice"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
