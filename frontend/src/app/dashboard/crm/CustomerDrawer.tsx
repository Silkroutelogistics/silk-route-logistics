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
import { NewCustomerForm } from "./NewCustomerForm";
import { OnboardingActionBar } from "./OnboardingActionBar";
import type { CrmTab, CrmCustomer } from "./types";

interface Props {
  customerId: string | null;
  onClose: () => void;
  onCustomerChange: () => void;
  onSelectCustomer?: (id: string) => void;
}

export function CustomerDrawer({ customerId, onClose, onCustomerChange, onSelectCustomer }: Props) {
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

  // Legacy /customers/:id returns the customer unwrapped (controller does
  // res.json({ ...customer, totalShipments, totalRevenue, ... })), so we
  // type the query against the customer shape directly.
  const query = useQuery<CrmCustomer>({
    queryKey: ["crm-customer", customerId],
    queryFn: async () => (await api.get(`/customers/${customerId}`)).data,
    enabled: !!customerId && customerId !== "__new__",
  });

  if (!customerId) return null;
  const isNew = customerId === "__new__";
  const customer = query.data;

  // Header status badge keys off onboardingStatus (the canonical signal),
  // not the free-form `status` text field. APPROVED = success, REJECTED /
  // SUSPENDED = danger, everything else (PENDING / UNDER_REVIEW /
  // DOCUMENTS_SUBMITTED) reads as warning. Uses brand status palette per
  // srl-brand-design tokens.
  const statusBadge = (onb: string | undefined) => {
    const v = (onb ?? "PENDING").toUpperCase();
    let cls = "bg-[#FBEFD4] text-[#B07A1A]";
    let label = v.replace(/_/g, " ");
    if (v === "APPROVED") {
      cls = "bg-[#E6F0E9] text-[#2F7A4F]";
      label = "APPROVED";
    } else if (v === "REJECTED" || v === "SUSPENDED") {
      cls = "bg-[#F6E3E3] text-[#9B2C2C]";
    }
    return <span className={`px-2 py-0.5 text-[10px] tracking-wide rounded ${cls}`}>{label}</span>;
  };

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute top-0 bottom-0 right-0 w-full max-w-[720px] bg-white shadow-2xl flex animate-slide-in-right"
      >
        {/* Tab bar is meaningless in __new__ mode (no customer record yet to view
            contacts/loads/rates/etc. against). Hide it so clicking tabs is not a
            no-op. Pre-existing bug from 9d0f311; surfaced after Phase 6.2 forced
            empty CRM → new-customer-flow exposure. */}
        {!isNew && <CrmIconTabs active={tab} onChange={setTab} />}

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
                      {customer && statusBadge(customer.onboardingStatus)}
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
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-700 hover:text-gray-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Onboarding gate — Approve / Suspend / Reject. Only renders for
              existing customers; hidden on the New Customer form. */}
          {!isNew && customer && (
            <OnboardingActionBar
              customer={customer}
              onChange={() => { query.refetch(); onCustomerChange(); }}
            />
          )}

          {/* Content */}
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {isNew && (
              <NewCustomerForm
                onCreated={(newId) => {
                  onCustomerChange();
                  if (onSelectCustomer) onSelectCustomer(newId);
                }}
                onCancel={onClose}
              />
            )}
            {!isNew && !customer && <div className="text-sm text-gray-700">Loading…</div>}
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
