"use client";

import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Search, Plus, Users, CheckCircle2, DollarSign, Truck } from "lucide-react";
import { CustomerDrawer } from "./CustomerDrawer";
import type { CrmCustomer, CrmStatusFilter } from "./types";

/**
 * CRM board — replaces the v3.3 accordion-style page with a list +
 * right-side SlideDrawer pattern consistent with Carrier Pool, Track &
 * Trace, and Waterfall Dispatch (Karpathy Rule 5 — delete before add).
 */

interface CustomersResponse {
  customers: CrmCustomer[];
  total: number;
}

function statusOf(c: CrmCustomer): "active" | "prospect" | "inactive" {
  // v3.5.c — onboardingStatus is the reliable signal. Customers with
  // APPROVED onboarding are active regardless of the free-text status
  // field (some legacy records stored "Prospect" there even after
  // approval). REJECTED / SUSPENDED map to inactive.
  const onb = (c.onboardingStatus || "").toUpperCase();
  if (onb === "APPROVED") return "active";
  if (onb === "REJECTED" || onb === "SUSPENDED") return "inactive";
  if (onb === "PENDING" || onb === "UNDER_REVIEW" || onb === "DOCUMENTS_SUBMITTED") {
    // Onboarding in progress — but if they already have loads, treat
    // as active (they've been running freight even if the onboarding
    // flag was never flipped).
    if ((c.totalLoads ?? c._count?.loads ?? 0) > 0) return "active";
    return "prospect";
  }
  // Fall back to the text field for records without onboardingStatus
  const s = (c.status || "").toLowerCase();
  if (s.includes("prospect")) return "prospect";
  if (s.includes("inactive")) return "inactive";
  return "active";
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
  const [statusFilter, setStatusFilter] = useState<CrmStatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const customersQuery = useQuery<CustomersResponse>({
    queryKey: ["crm-customers", search],
    queryFn: async () =>
      (await api.get("/customers", { params: { search, limit: 200 } })).data,
    refetchInterval: 60_000,
  });

  const customers = customersQuery.data?.customers ?? [];

  // Client-side status filter (the legacy endpoint doesn't expose it
  // cleanly; keeping behavior local avoids touching the controller).
  const filtered = useMemo(() => {
    if (statusFilter === "all") return customers;
    return customers.filter((c) => statusOf(c) === statusFilter);
  }, [customers, statusFilter]);

  const counts = useMemo(() => {
    const c = { all: customers.length, active: 0, prospect: 0, inactive: 0 };
    for (const cust of customers) c[statusOf(cust)]++;
    return c;
  }, [customers]);

  const totalRevenue = customers.reduce((s, c) => s + (c.totalRevenue ?? 0), 0);
  const totalLoads = customers.reduce((s, c) => s + loadCountOf(c), 0);

  return (
    <div className="p-6 space-y-6 bg-gray-50 min-h-screen">
      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Customers</h1>
          <p className="text-sm text-gray-500 mt-1">Accounts, contacts, facilities, rate agreements, and activity.</p>
        </div>
        <button
          onClick={() => setSelectedId("__new__")}
          className="flex items-center gap-2 px-4 py-2 bg-[#BA7517] hover:bg-[#8f5a11] text-white text-sm font-medium rounded-lg"
        >
          <Plus className="w-4 h-4" /> Add Customer
        </button>
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-4 gap-3">
        <StatCard icon={<Users className="w-4 h-4" />} label="Total customers" value={counts.all} tone="neutral" />
        <StatCard icon={<CheckCircle2 className="w-4 h-4" />} label="Active" value={counts.active} tone="green" />
        <StatCard
          icon={<DollarSign className="w-4 h-4" />}
          label="Revenue YTD"
          value={`$${Math.round(totalRevenue).toLocaleString()}`}
          tone="green"
        />
        <StatCard icon={<Truck className="w-4 h-4" />} label="Loads YTD" value={totalLoads} tone="neutral" />
      </div>

      {/* Filter bar */}
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
        <div className="flex gap-2">
          {(["all", "active", "prospect", "inactive"] as CrmStatusFilter[]).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 text-xs rounded-full border transition ${
                statusFilter === s
                  ? "bg-[#FAEEDA] border-[#BA7517] text-[#854F0B] font-medium"
                  : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
              }`}
            >
              {s === "all" ? "All" : s[0].toUpperCase() + s.slice(1)} ({counts[s]})
            </button>
          ))}
        </div>
      </div>

      {/* Customer list */}
      {customersQuery.isLoading ? (
        <div className="p-12 text-center text-gray-400">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center text-gray-500 border border-gray-200 rounded-lg bg-white">
          No customers match your filters.
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg bg-white overflow-hidden divide-y divide-gray-100">
          {filtered.map((c) => {
            const status = statusOf(c);
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
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0 ${
                    status === "active" ? "bg-[#FAEEDA] text-[#854F0B]" : "bg-gray-100 text-gray-500"
                  }`}
                >
                  {initials}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-gray-900 truncate">{c.name}</span>
                    <span
                      className={`px-1.5 py-0.5 text-[10px] rounded ${
                        status === "active" ? "bg-green-100 text-green-700"
                        : status === "prospect" ? "bg-amber-100 text-amber-700"
                        : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {status}
                    </span>
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
