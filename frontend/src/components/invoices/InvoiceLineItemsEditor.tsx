"use client";

import { Plus, Trash2 } from "lucide-react";

const LINE_ITEM_TYPES = ["LINEHAUL", "FUEL_SURCHARGE", "ACCESSORIAL", "DETENTION", "LUMPER", "OTHER"] as const;

export interface LineItem {
  description: string;
  type: (typeof LINE_ITEM_TYPES)[number];
  quantity: number;
  rate: number;
  amount: number;
}

interface Props {
  items: LineItem[];
  onChange: (items: LineItem[]) => void;
}

export function InvoiceLineItemsEditor({ items, onChange }: Props) {
  const addRow = () => {
    onChange([...items, { description: "", type: "LINEHAUL", quantity: 1, rate: 0, amount: 0 }]);
  };

  const removeRow = (idx: number) => {
    onChange(items.filter((_, i) => i !== idx));
  };

  const updateRow = (idx: number, field: keyof LineItem, value: string | number) => {
    const updated = items.map((item, i) => {
      if (i !== idx) return item;
      const next = { ...item, [field]: value };
      if (field === "quantity" || field === "rate") {
        next.amount = Number((next.quantity * next.rate).toFixed(2));
      }
      return next;
    });
    onChange(updated);
  };

  const total = items.reduce((s, i) => s + i.amount, 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_120px_60px_80px_80px_32px] gap-2 text-xs text-slate-400 font-medium px-1">
        <span>Description</span>
        <span>Type</span>
        <span>Qty</span>
        <span>Rate</span>
        <span>Amount</span>
        <span />
      </div>

      {items.map((item, idx) => (
        <div key={idx} className="grid grid-cols-[1fr_120px_60px_80px_80px_32px] gap-2 items-center">
          <input
            value={item.description}
            onChange={(e) => updateRow(idx, "description", e.target.value)}
            placeholder="Description"
            className="px-2 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white placeholder-white/30 outline-none focus:border-gold/50"
          />
          <select
            value={item.type}
            onChange={(e) => updateRow(idx, "type", e.target.value)}
            className="px-2 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white outline-none focus:border-gold/50"
          >
            {LINE_ITEM_TYPES.map((t) => (
              <option key={t} value={t} className="bg-navy">
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
          <input
            type="number"
            min="0"
            step="1"
            value={item.quantity}
            onChange={(e) => updateRow(idx, "quantity", Number(e.target.value))}
            className="px-2 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white outline-none focus:border-gold/50 text-center"
          />
          <input
            type="number"
            min="0"
            step="0.01"
            value={item.rate || ""}
            onChange={(e) => updateRow(idx, "rate", Number(e.target.value))}
            placeholder="0.00"
            className="px-2 py-1.5 bg-white/5 border border-white/10 rounded text-sm text-white placeholder-white/30 outline-none focus:border-gold/50 text-right"
          />
          <span className="text-sm text-gold font-medium text-right pr-1">
            ${item.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
          </span>
          <button
            type="button"
            onClick={() => removeRow(idx)}
            className="p-1 hover:bg-red-500/20 text-slate-500 hover:text-red-400 rounded transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}

      <button
        type="button"
        onClick={addRow}
        className="flex items-center gap-1.5 text-xs text-gold hover:text-gold/80 transition px-1"
      >
        <Plus className="w-3.5 h-3.5" /> Add Line Item
      </button>

      {items.length > 0 && (
        <div className="flex justify-end pt-2 border-t border-white/10">
          <div className="text-right">
            <span className="text-xs text-slate-400 mr-3">Total:</span>
            <span className="text-lg font-bold text-gold">
              ${total.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
