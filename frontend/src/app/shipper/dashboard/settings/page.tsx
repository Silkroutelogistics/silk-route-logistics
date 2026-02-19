"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { ShipperCard } from "@/components/shipper";

const settingsNav = ["Profile", "Users & Permissions", "Notifications", "Billing", "Integrations", "Security"];

export default function ShipperSettingsPage() {
  const [form, setForm] = useState({
    company: "Acme Manufacturing",
    mc: "MC-1234567",
    contact: "Jane Doe",
    email: "jane@acme.com",
    phone: "(555) 123-4567",
    address: "1234 Industrial Pkwy, Kalamazoo, MI 49001",
    payTerms: "Net 30",
  });
  const upd = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div>
      <h1 className="font-serif text-2xl text-[#0D1B2A] mb-6">Account Settings</h1>
      <div className="grid grid-cols-[200px_1fr] gap-6">
        {/* Settings nav */}
        <div>
          {settingsNav.map((s, i) => (
            <div key={s} className={`px-3.5 py-2.5 rounded-md cursor-pointer text-[13px] mb-0.5 ${
              i === 0 ? "bg-[#C9A84C]/10 text-[#C9A84C] font-semibold" : "text-gray-500 hover:bg-gray-100"
            }`}>{s}</div>
          ))}
        </div>

        {/* Form */}
        <ShipperCard padding="p-7">
          <h2 className="text-lg font-bold text-[#0D1B2A] mb-1">Company Profile</h2>
          <p className="text-[13px] text-gray-500 mb-6">Manage your company details and preferences</p>
          <div className="grid grid-cols-2 gap-x-4">
            <SettingsField label="Company Name" value={form.company} onChange={(v) => upd("company", v)} />
            <SettingsField label="MC / DOT #" value={form.mc} onChange={(v) => upd("mc", v)} />
            <SettingsField label="Primary Contact" value={form.contact} onChange={(v) => upd("contact", v)} />
            <SettingsField label="Email" value={form.email} onChange={(v) => upd("email", v)} />
            <SettingsField label="Phone" value={form.phone} onChange={(v) => upd("phone", v)} />
            <SettingsField label="Payment Terms" value={form.payTerms} onChange={(v) => upd("payTerms", v)} options={["Net 30", "Net 45", "Net 60"]} />
          </div>
          <SettingsField label="Address" value={form.address} onChange={(v) => upd("address", v)} />
          <div className="flex gap-3 mt-2">
            <button className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0D1B2A] text-xs font-semibold uppercase tracking-[2px] rounded shadow-[0_4px_20px_rgba(201,168,76,0.3)]">
              <Check size={14} /> Save Changes
            </button>
            <button className="px-6 py-3 text-gray-500 text-xs font-semibold uppercase tracking-[1.5px] hover:text-[#C9A84C] transition-colors">
              Cancel
            </button>
          </div>
        </ShipperCard>
      </div>
    </div>
  );
}

function SettingsField({
  label, value, onChange, options,
}: {
  label: string; value: string; onChange: (v: string) => void; options?: string[];
}) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-gray-500 mb-1.5">{label}</label>
      {options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full py-2.5 px-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C] appearance-none bg-white">
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : (
        <input value={value} onChange={(e) => onChange(e.target.value)} className="w-full py-2.5 px-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C]" />
      )}
    </div>
  );
}
