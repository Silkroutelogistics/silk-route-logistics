"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { X } from "lucide-react";
import { CrmIconTabs } from "./IconTabs";
import { ProfileTab } from "./tabs/ProfileTab";
import { ContactsTab } from "./tabs/ContactsTab";
import { LoadsTab } from "./tabs/LoadsTab";
import { RatesTab } from "./tabs/RatesTab";
import { FacilitiesTab } from "./tabs/FacilitiesTab";
import { NotesTab } from "./tabs/NotesTab";
import { DocsTab } from "./tabs/DocsTab";
import { OrdersTab } from "./tabs/OrdersTab";
import { ActivityTab } from "./tabs/ActivityTab";
import type { CrmTab, CrmCustomer } from "./types";

interface Props {
  customerId: string | null;
  onClose: () => void;
  onCustomerChange: () => void;
}

export function CustomerDrawer({ customerId, onClose, onCustomerChange }: Props) {
  const [tab, setTab] = useState<CrmTab>("profile");

  const handleKey = useCallback((e: KeyboardEvent) => {
    if (e.key === "Escape") onClose();
  }, [onClose]);

  useEffect(() => {
    if (customerId) {
      document.addEventListener("keydown", handleKey);
      document.body.style.overflow = "hidden";
      setTab("profile");
    }
    return () => {
      document.removeEventListener("keydown", handleKey);
      document.body.style.overflow = "";
    };
  }, [customerId, handleKey]);

  const query = useQuery<{ customer: CrmCustomer }>({
    queryKey: ["crm-customer", customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}`)).data,
    enabled: !!customerId && customerId !== "__new__",
  });

  if (!customerId) return null;
  const isNew = customerId === "__new__";
  const customer = query.data?.customer;

  const statusBadge = (s: string) => {
    const v = (s || "").toLowerCase();
    const cls =
      v.includes("prospect") ? "bg-amber-100 text-amber-700"
    : v.includes("inactive") ? "bg-gray-100 text-gray-600"
    : "bg-green-100 text-green-700";
    return <span className={`px-2 py-0.5 text-[11px] rounded ${cls}`}>{s || "Active"}</span>;
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute top-0 bottom-0 right-0 w-full max-w-[720px] bg-white shadow-2xl flex animate-slide-in-right"
      >
        <CrmIconTabs active={tab} onChange={setTab} />

        <div className="flex-1 flex flex-col min-w-0">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200 shrink-0">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                {isNew ? (
                  <h2 className="text-lg font-semibold text-gray-900">New Customer</h2>
                ) : (
                  <>
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-[15px] font-semibold text-gray-900 truncate">{customer?.name ?? "Loading…"}</h2>
                      {customer && statusBadge(customer.status)}
                      {customer?.type && (
                        <span className="px-2 py-0.5 text-[11px] rounded bg-blue-50 text-blue-700 uppercase">{customer.type}</span>
                      )}
                    </div>
                    {customer && (
                      <div className="text-xs text-gray-500 mt-1">
                        {[
                          customer.city && customer.state ? `${customer.city}, ${customer.state}` : null,
                          customer.industry ?? customer.industryType,
                          `Since ${new Date(customer.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </div>
                    )}
                    {customer && (
                      <div className="text-[11px] text-gray-500 mt-0.5">
                        Revenue ${Math.round(customer.totalRevenue ?? 0).toLocaleString()} ·
                        Loads {customer._count?.loads ?? customer._count?.shipments ?? 0}
                      </div>
                    )}
                  </>
                )}
              </div>
              <button
                onClick={onClose}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {isNew && (
              <div className="text-sm text-gray-500">
                New customer inline form — coming in follow-up lane. For now, use the legacy Add Customer flow.
              </div>
            )}
            {!isNew && !customer && <div className="text-sm text-gray-400">Loading…</div>}
            {!isNew && customer && (
              <>
                {tab === "profile"    && <ProfileTab    customer={customer} onChange={() => { query.refetch(); onCustomerChange(); }} />}
                {tab === "contacts"   && <ContactsTab   customerId={customer.id} onChange={() => query.refetch()} />}
                {tab === "loads"      && <LoadsTab      customerId={customer.id} />}
                {tab === "rates"      && <RatesTab      customerId={customer.id} />}
                {tab === "facilities" && <FacilitiesTab customerId={customer.id} onChange={() => query.refetch()} />}
                {tab === "notes"      && <NotesTab      customerId={customer.id} onChange={() => query.refetch()} />}
                {tab === "docs"       && <DocsTab       customerId={customer.id} onChange={() => query.refetch()} />}
                {tab === "orders"     && <OrdersTab     customerId={customer.id} />}
                {tab === "activity"   && <ActivityTab   customerId={customer.id} />}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
