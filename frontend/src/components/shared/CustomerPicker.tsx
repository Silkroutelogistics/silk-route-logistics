"use client";

import { useState } from "react";
import { Search } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

/**
 * Sprint 59 (v3.8.acj) Item 176 — Shared customer search + selection.
 *
 * Extracted from Order Builder (frontend/src/app/dashboard/orders/page.tsx)
 * so the Carrier Engagement Drawer can reuse the same picker. Component
 * is purely controlled — search + dropdown UI only. Auto-fill side
 * effects (facility load, contact prefill, notes merge into special
 * instructions) stay in the parent because they vary by surface:
 *   - Order Builder: full cascade (notes → specialInstructions, etc.)
 *   - Drawer Mode 1: lighter cascade (just facility seed for lane fields)
 *
 * Customer status filter: context=crm restricts results to
 * onboardingStatus=APPROVED — Lead Hunter prospects can't be picked.
 * Mirrors the existing /api/customers query behavior.
 */

export interface CustomerSummary {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  contactName: string | null;
  status: string;
  industry: string | null;
  city: string | null;
  state: string | null;
  creditLimit: number | null;
  creditStatus: string;
  paymentTerms: string | null;
  _count?: { shipments?: number; loads?: number };
}

export interface CustomerPickerProps {
  value: CustomerSummary | null;
  onChange: (customer: CustomerSummary | null) => void;
  /** Render in cream-themed surface (Order Builder) vs navy-themed (Drawer). Default cream. */
  surface?: "cream" | "navy";
  placeholder?: string;
}

export function CustomerPicker({ value, onChange, surface = "cream", placeholder }: CustomerPickerProps) {
  const [search, setSearch] = useState(value?.name ?? "");
  const [showDropdown, setShowDropdown] = useState(false);

  const query = useQuery<{ customers: CustomerSummary[] }>({
    queryKey: ["customer-picker-search", search],
    queryFn: async () =>
      (await api.get("/customers", { params: { search, context: "crm", limit: 10 } })).data,
    enabled: search.length >= 2 && !value,
    staleTime: 30_000,
  });

  const handleSelect = (c: CustomerSummary) => {
    setSearch(c.name);
    setShowDropdown(false);
    onChange(c);
  };

  const handleClear = () => {
    setSearch("");
    setShowDropdown(false);
    onChange(null);
  };

  const isNavy = surface === "navy";
  const inputCls = isNavy
    ? "w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-400"
    : "w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-lg text-sm text-slate-900 placeholder:text-slate-400";

  if (value) {
    return (
      <div className="rounded-lg border border-[#BA7517] bg-[#FAEEDA]/30 p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="w-10 h-10 rounded-lg bg-[#FAEEDA] text-[#BA7517] flex items-center justify-center text-sm font-bold shrink-0">
              {value.name.split(" ").slice(0, 2).map((w) => w[0]).join("")}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900 truncate">{value.name}</div>
              <div className="text-[11px] text-slate-600 mt-0.5 truncate">
                {[value.industry, value.paymentTerms, value.creditLimit ? `Credit $${value.creditLimit.toLocaleString()}` : null]
                  .filter(Boolean).join(" · ")}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClear}
            className="text-[11px] text-slate-500 hover:text-slate-900 shrink-0"
          >
            Change
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
      <input
        type="text"
        value={search}
        onChange={(e) => { setSearch(e.target.value); setShowDropdown(true); }}
        onFocus={() => setShowDropdown(true)}
        placeholder={placeholder ?? "Search customers by name, email, industry…"}
        className={inputCls}
      />
      {showDropdown && (query.data?.customers?.length ?? 0) > 0 && (
        <div className="absolute z-20 top-full mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-xl max-h-72 overflow-y-auto">
          {query.data!.customers.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => handleSelect(c)}
              className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm text-slate-900 font-medium truncate">{c.name}</div>
                  <div className="text-[11px] text-slate-500 truncate">
                    {[c.city && c.state ? `${c.city}, ${c.state}` : null, c.industry].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 shrink-0">
                  {c._count?.loads ?? c._count?.shipments ?? 0} loads
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
