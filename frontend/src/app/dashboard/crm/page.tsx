"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { Search, Plus, Users, DollarSign, Truck } from "lucide-react";
import { CustomerDrawer } from "./CustomerDrawer";
import type { CrmCustomer } from "./types";

/**
 * CRM board. Two views over one endpoint:
 *
 *   Approved         ?context=crm         onboardingStatus = APPROVED
 *   Pending approval ?context=onboarding  not approved AND status = "Active"
 *
 * Pre-Phase-6.2 this page rendered prospects too, client-side-segmented via a
 * statusOf() helper. Audit 39de1ad (Pattern A) drove the separation; the
 * ?context=crm filter became authoritative when the approve gate
 * (POST /customers/:id/approve) shipped.
 *
 * The Pending view exists because that separation left a hole: Add Customer
 * creates a customer at onboardingStatus PENDING (the Prisma default), so the
 * page that owns the button could not show what the button made. The customer
 * was created, correctly gated, and invisible. Approved stays the default — an
 * unapproved customer still must not be tendered freight, which is the whole
 * point of the gate — but it is now findable while an AE works it.
 *
 * Lead Hunter is at /dashboard/lead-hunter. It passes NO context and therefore
 * sees every row. An earlier version of this comment said it passed
 * ?context=prospects; no file has ever done that.
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

type CrmView = "approved" | "onboarding";

export default function CrmPage() {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<CrmView>("approved");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const context = view === "approved" ? "crm" : "onboarding";

  const customersQuery = useQuery<CustomersResponse>({
    queryKey: ["crm-customers", context, search],
    queryFn: async () =>
      (await api.get("/customers", { params: { search, context, limit: 200 } })).data,
    refetchInterval: 60_000,
  });

  // Count only, so the Pending tab carries its number while Approved is on
  // screen. Deliberately unsearched: the badge answers "is anything waiting on
  // me", and a search box should not be able to change that answer.
  const pendingCountQuery = useQuery<CustomersResponse>({
    queryKey: ["crm-customers-pending-count"],
    queryFn: async () =>
      (await api.get("/customers", { params: { context: "onboarding", limit: 1 } })).data,
    refetchInterval: 60_000,
  });
  const pendingCount = pendingCountQuery.data?.total ?? 0;

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

      {/* View toggle. Approved is the default and is what the rest of the
          console consumes — the shared CustomerPicker and Order Builder both
          pass context=crm — so switching here changes what this page lists and
          nothing about who can be tendered a load. */}
      <div className="flex gap-1 p-1 bg-white border border-gray-200 rounded-lg w-fit">
        <ViewTab active={view === "approved"} onClick={() => setView("approved")} label="Approved" />
        <ViewTab
          active={view === "onboarding"}
          onClick={() => setView("onboarding")}
          label="Pending approval"
          count={pendingCount}
        />
      </div>

      {/* Summary stat cards */}
      <div className="grid grid-cols-3 gap-3">
        <StatCard
          icon={<Users className="w-4 h-4" />}
          label={view === "approved" ? "Approved customers" : "Pending approval"}
          value={customers.length}
          tone="neutral"
        />
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
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-700" />
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
        <div className="p-12 text-center text-gray-700">Loading…</div>
      ) : customers.length === 0 ? (
        <div className="p-12 text-center text-gray-500 border border-gray-200 rounded-lg bg-white">
          {search
            ? "No customers match your search."
            : view === "onboarding"
            ? "Nothing waiting on approval. A new customer lands here until it clears the TIN, credit and contract checks."
            : "No approved customers yet. Add one, or check Pending approval — a new customer stays there until it clears the gate."}
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
                <div className="w-10 h-10 rounded-lg flex items-center justify-center text-sm font-semibold shrink-0 bg-[#FAEEDA] text-[#BA7517]">
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
                    {view === "onboarding" && (
                      <span className="px-1.5 py-0.5 text-[10px] rounded bg-[#FBEFD4] text-[#B07A1A] uppercase">
                        {(c.onboardingStatus ?? "PENDING").replace(/_/g, " ")}
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
        onCustomerChange={() => {
          customersQuery.refetch();
          pendingCountQuery.refetch();
        }}
        onSelectCustomer={(id) => setSelectedId(id)}
        onCreated={() => setView("onboarding")}
      />
    </div>
  );
}

function ViewTab({
  active, onClick, label, count,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count?: number;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={active}
      className={`px-3 py-1.5 text-sm rounded-md transition flex items-center gap-2 ${
        active ? "bg-[#FAEEDA] text-[#854F0B] font-medium" : "text-gray-500 hover:bg-gray-50"
      }`}
    >
      {label}
      {count !== undefined && count > 0 && (
        <span
          className={`px-1.5 py-0.5 text-[10px] rounded-full ${
            active ? "bg-[#BA7517] text-white" : "bg-[#FBEFD4] text-[#B07A1A]"
          }`}
        >
          {count}
        </span>
      )}
    </button>
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
