"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Search, Plus, Users, DollarSign, Truck } from "lucide-react";
import { CustomerDrawer } from "./CustomerDrawer";
import type { CrmCustomer } from "./types";

/**
 * CRM board — APPROVED customers only. Lead Hunter prospects live at
 * /dashboard/lead-hunter and read the same /customers endpoint with
 * ?context=prospects. Pre-Phase-6.2 this page rendered prospects too,
 * client-side-segmented via a statusOf() helper. Audit 39de1ad
 * (Pattern A) drove the separation; the ?context=crm filter became
 * authoritative when the approve gate (POST /customers/:id/approve)
 * shipped.
 *
 * SUSPENDED / REJECTED customer surfaces are deferred to the customer
 * inactivation workflow sprint (CLAUDE.md §13.3 Item 8.1 / v3.8.l) —
 * they intentionally do NOT appear on this page.
 */

interface CustomersResponse {
  customers: CrmCustomer[];
  total: number;
}

function loadCountOf(c: CrmCustomer): number {
  return c.totalLoads ?? c._count?.loads ?? c._count?.shipments ?? 0;
}

function companyInitials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

export default function CrmPage() {
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const customersQuery = useQuery<CustomersResponse>({
    queryKey: ["crm-customers", search],
    queryFn: async () =>
      (await api.get("/customers", { params: { search, context: "crm", limit: 200 } })).data,
    refetchInterval: 60_000,
  });

  const customers = customersQuery.data?.customers ?? [];
  const totalRevenue = customers.reduce((s, c) => s + (c.totalRevenue ?? 0), 0);
  const totalLoads = customers.reduce((s, c) => s + loadCountOf(c), 0);

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-1">Approved accounts, contacts, facilities, rate agreements, and activity.</p>
        </div>
        <button
          onClick={() => setSelectedId("__new__")}
          className="flex items-center gap-2 px-4 py-2 bg-[#BA7517] hover:bg-[#8f5a11] text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard icon={<Users className="w-4 h-4" />} label="Approved customers" value={customers.length} tone="neutral" />
        <StatCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Revenue YTD"
          value={`$${Math.round(totalRevenue).toLocaleString()}`}
          tone="green"
        />
        <StatCard icon={<Truck className="w-4 h-4" />} label="Loads YTD" value={totalLoads} tone="neutral" />
      </div>

      {/* Search bar */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by company, contact, email, industry, city"
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-[#BA7517]/30"
          />
        </div>
      </div>

      {/* Customer list */}
      {customersQuery.isLoading ? (
        <div className="p-12 text-center text-gray-400">Loading…</div>
      ) : customers.length === 0 ? (
        <div className="p-12 text-center text-gray-500 border border-gray-200 rounded-lg bg-white">
          {search
            ? "No customers match your search."
            : "No approved customers yet. Prospects appear in Lead Hunter until they pass the onboarding gate."}
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg bg-white overflow-hidden divide-y divide-gray-100">
          {customers.map((c) => {
            const initials = companyInitials(c.name);
            const isSelected = selectedId === c.id;
            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full flex items-center gap-4 p-4 text-left hover:bg-gray-50 transition ${
                  isSelected ? "bg-[#FAEEDA]/30 border-l-2 border-[#BA7517]" : ""
                }`}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0 bg-[#FAEEDA] text-[#854F0B]">
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">{c.name}</span>
                    {c.type && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-blue-50 text-blue-700 uppercase">
                        {c.type}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-gray-500 truncate mt-0.5">
                    {[c.email, c.city && c.state ? `${c.city}, ${c.state}` : null, c.industry ?? c.industryType]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold text-gray-900">
                    ${Math.round(c.totalRevenue ?? 0).toLocaleString()}
                  </div>
                  <div className="text-[11px] text-gray-500">
                    {loadCountOf(c)} loads
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* Drawer */}
      <CustomerDrawer
        customerId={selectedId}
        onClose={() => setSelectedId(null)}
        onCustomerChange={() => customersQuery.refetch()}
        onSelectCustomer={(id) => setSelectedId(id)}
      />
    </div>
  );
}

function StatCard({
  icon, label, value, tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  tone: "neutral" | "green" | "amber";
}) {
  const toneCls = tone === "green" ? "text-green-700 bg-green-50"
                : tone === "amber" ? "text-amber-700 bg-amber-50"
                : "text-gray-700 bg-gray-50";
  return (
    <div className="border border-gray-200 bg-white rounded-lg p-4">
      <div className={`inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs ${toneCls}`}>
        {icon}{label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-gray-900">{value}</div>
    </div>
  );
}
