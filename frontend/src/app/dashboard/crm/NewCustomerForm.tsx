"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { AddressAutocomplete } from "@/components/ui/AddressAutocomplete";

interface Props {
  onCreated: (customerId: string) => void;
  onCancel: () => void;
}

const CUSTOMER_TYPES = [
  { value: "SHIPPER",      label: "Shipper" },
  { value: "BROKER",       label: "Broker" },
  { value: "MANUFACTURER", label: "Manufacturer" },
  { value: "DISTRIBUTOR",  label: "Distributor" },
  { value: "RETAILER",     label: "Retailer" },
  { value: "GOVERNMENT",   label: "Government" },
  { value: "OTHER",        label: "Other" },
];

const PAY_TERMS = ["Net 15", "Net 30", "Net 45", "Net 60", "Net 90"];

export function NewCustomerForm({ onCreated, onCancel }: Props) {
  const [form, setForm] = useState({
    name: "",
    type: "SHIPPER",
    industry: "",
    contactName: "",
    email: "",
    phone: "",
    address: "",
    city: "",
    state: "",
    zip: "",
    billingAddress: "",
    billingCity: "",
    billingState: "",
    billingZip: "",
    sameBilling: true,
    creditLimit: "",
    paymentTerms: "Net 30",
    taxId: "",
  });
  const [error, setError] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        name: form.name.trim(),
        type: form.type,
        industry: form.industry || undefined,
        contactName: form.contactName || undefined,
        email: form.email || undefined,
        phone: form.phone || undefined,
        address: form.address || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        zip: form.zip || undefined,
        creditLimit: form.creditLimit ? parseFloat(form.creditLimit) : undefined,
        paymentTerms: form.paymentTerms,
        taxId: form.taxId || undefined,
      };
      if (form.sameBilling) {
        payload.billingAddress = form.address || undefined;
        payload.billingCity = form.city || undefined;
        payload.billingState = form.state || undefined;
        payload.billingZip = form.zip || undefined;
      } else {
        payload.billingAddress = form.billingAddress || undefined;
        payload.billingCity = form.billingCity || undefined;
        payload.billingState = form.billingState || undefined;
        payload.billingZip = form.billingZip || undefined;
      }
      const { data } = await api.post("/customers", payload);
      return data;
    },
    onSuccess: (data) => {
      const newId = data?.id ?? data?.customer?.id;
      if (newId) onCreated(newId);
    },
    onError: (err: any) => {
      setError(err?.response?.data?.error ?? "Failed to create customer");
    },
  });

  const canSubmit = form.name.trim().length > 0 && !create.isPending;

  return (
    <div className="space-y-4 text-sm">
      <Section title="Company">
        <Input label="Company name *" value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
        <Select label="Type" value={form.type} onChange={(v) => setForm({ ...form, type: v })}>
          {CUSTOMER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </Select>
        <Input label="Industry" value={form.industry} onChange={(v) => setForm({ ...form, industry: v })} />
      </Section>

      <Section title="Primary contact">
        <Input label="Contact name" value={form.contactName} onChange={(v) => setForm({ ...form, contactName: v })} />
        <Input label="Email" type="email" value={form.email} onChange={(v) => setForm({ ...form, email: v })} />
        <Input label="Phone" value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} />
      </Section>

      {/* Google Places lookup fills Street / City / State / Zip in one action.
          The four fields stay editable underneath on purpose: Places does not
          know every dock, and an AE must be able to correct or hand-enter one
          it gets wrong. Same shape as the CRM Facilities tab. */}
      <Section title="Primary address">
        <div className="col-span-2">
          <AddressAutocomplete
            label="Start typing an address…"
            theme="light"
            value={{ address: form.address, city: form.city, state: form.state, zip: form.zip }}
            onSelect={(p) =>
              setForm((f) => ({ ...f, address: p.address, city: p.city, state: p.state, zip: p.zip }))
            }
          />
        </div>
        <Input label="Street" value={form.address} onChange={(v) => setForm({ ...form, address: v })} wide />
        <div className="grid grid-cols-3 gap-2 col-span-2">
          <Input label="City"  value={form.city}  onChange={(v) => setForm({ ...form, city: v })} />
          <Input label="State" value={form.state} onChange={(v) => setForm({ ...form, state: v })} />
          <Input label="Zip"   value={form.zip}   onChange={(v) => setForm({ ...form, zip: v })} />
        </div>
      </Section>

      <label className="flex items-center gap-2 text-xs text-slate-400">
        <input
          type="checkbox"
          checked={form.sameBilling}
          onChange={(e) => setForm({ ...form, sameBilling: e.target.checked })}
        />
        Billing address same as primary
      </label>

      {!form.sameBilling && (
        <Section title="Billing address">
          <div className="col-span-2">
            <AddressAutocomplete
              label="Start typing a billing address…"
              theme="light"
              value={{
                address: form.billingAddress,
                city: form.billingCity,
                state: form.billingState,
                zip: form.billingZip,
              }}
              onSelect={(p) =>
                setForm((f) => ({
                  ...f,
                  billingAddress: p.address,
                  billingCity: p.city,
                  billingState: p.state,
                  billingZip: p.zip,
                }))
              }
            />
          </div>
          <Input label="Street" value={form.billingAddress} onChange={(v) => setForm({ ...form, billingAddress: v })} wide />
          <div className="grid grid-cols-3 gap-2 col-span-2">
            <Input label="City"  value={form.billingCity}  onChange={(v) => setForm({ ...form, billingCity: v })} />
            <Input label="State" value={form.billingState} onChange={(v) => setForm({ ...form, billingState: v })} />
            <Input label="Zip"   value={form.billingZip}   onChange={(v) => setForm({ ...form, billingZip: v })} />
          </div>
        </Section>
      )}

      <Section title="Financial">
        <Input label="Credit limit ($)" type="number" value={form.creditLimit} onChange={(v) => setForm({ ...form, creditLimit: v })} />
        <Select label="Payment terms" value={form.paymentTerms} onChange={(v) => setForm({ ...form, paymentTerms: v })}>
          {PAY_TERMS.map((t) => <option key={t} value={t}>{t}</option>)}
        </Select>
        <Input label="Tax ID" value={form.taxId} onChange={(v) => setForm({ ...form, taxId: v })} />
      </Section>

      {/* Said before the click, not discovered after it. A new customer is
          created PENDING and the Approved list is APPROVED-only, so without
          this the AE saves, closes the drawer, and cannot find the record. */}
      <div className="text-[11px] text-[#B07A1A] bg-[#FBEFD4] border border-[#B07A1A]/30 rounded px-3 py-2">
        Saved as <strong>Pending approval</strong>. It stays there — and cannot be
        tendered a load — until the TIN, credit check and signed contract are on
        file and you approve it from this drawer.
      </div>

      {error && <div className="text-xs text-red-600">{error}</div>}

      <div className="flex gap-2 pt-2">
        <button
          disabled={!canSubmit}
          onClick={() => create.mutate()}
          className="flex-1 py-2 bg-[#BA7517] hover:bg-[#8f5a11] text-white text-sm font-medium rounded disabled:opacity-40"
        >
          {create.isPending ? "Creating…" : "Create customer"}
        </button>
        <button
          onClick={onCancel}
          className="flex-1 py-2 border border-gray-200 text-slate-400 text-sm rounded"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2">{title}</h3>
      <div className="grid grid-cols-2 gap-3 border border-gray-200 rounded-lg p-4 bg-gray-50">
        {children}
      </div>
    </div>
  );
}

function Input({
  label, value, onChange, type = "text", wide,
}: {
  label: string; value: string; onChange: (v: string) => void; type?: string; wide?: boolean;
}) {
  return (
    <label className={`block ${wide ? "col-span-2" : ""}`}>
      <span className="text-[11px] text-gray-500">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
      />
    </label>
  );
}

function Select({
  label, value, onChange, children,
}: {
  label: string; value: string; onChange: (v: string) => void; children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-[11px] text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full mt-0.5 px-3 py-1.5 text-sm border border-gray-200 rounded bg-white"
      >
        {children}
      </select>
    </label>
  );
}
