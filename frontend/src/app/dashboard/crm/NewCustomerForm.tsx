"use client";

import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";

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

      <Section title="Primary address">
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
          className="flex-1 py-2 border border-gray-200 text-gray-700 text-sm rounded"
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
