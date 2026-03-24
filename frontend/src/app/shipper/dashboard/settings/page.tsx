"use client";

import { useState, useEffect } from "react";
import { Check, Loader2 } from "lucide-react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { ShipperCard } from "@/components/shipper";

const settingsNav = ["Profile", "Users & Permissions", "Notifications", "Billing", "Integrations", "Security"];

interface ProfileData {
  name: string;
  email: string;
  phone: string;
  company?: string;
  address?: string;
}

export default function ShipperSettingsPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [form, setForm] = useState({
    company: "",
    mc: "",
    contact: "",
    email: "",
    phone: "",
    address: "",
    payTerms: "Net 30",
  });
  const [originalForm, setOriginalForm] = useState(form);

  // Fetch profile data
  const { data: profile } = useQuery({
    queryKey: ["shipper-profile"],
    queryFn: () => api.get<ProfileData>("/auth/profile").then((r) => r.data),
  });

  // Populate form from profile
  useEffect(() => {
    if (profile) {
      const populated = {
        company: profile.company || "",
        mc: form.mc,
        contact: profile.name || "",
        email: profile.email || "",
        phone: profile.phone || "",
        address: profile.address || "",
        payTerms: form.payTerms,
      };
      setForm(populated);
      setOriginalForm(populated);
    }
  }, [profile]);

  const upd = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const saveMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.patch("/auth/profile", {
        name: data.contact,
        email: data.email,
        phone: data.phone,
        company: data.company,
        address: data.address,
      }),
    onSuccess: () => {
      setOriginalForm(form);
    },
  });

  const handleSave = () => {
    saveMutation.mutate(form);
  };

  const handleCancel = () => {
    setForm(originalForm);
  };

  const isDirty = JSON.stringify(form) !== JSON.stringify(originalForm);

  return (
    <div>
      <h1 className="font-serif text-2xl text-[#0D1B2A] mb-6">Account Settings</h1>
      <div className="grid grid-cols-[200px_1fr] gap-6">
        {/* Settings nav */}
        <div>
          {settingsNav.map((s, i) => (
            <div
              key={s}
              onClick={() => setActiveTab(i)}
              className={`px-3.5 py-2.5 rounded-md cursor-pointer text-[13px] mb-0.5 ${
                i === activeTab ? "bg-[#C9A84C]/10 text-[#C9A84C] font-semibold" : "text-gray-500 hover:bg-gray-100"
              }`}
            >{s}</div>
          ))}
        </div>

        {/* Form */}
        {activeTab === 0 && (
          <ShipperCard padding="p-7">
            <h2 className="text-lg font-bold text-[#0D1B2A] mb-1">Company Profile</h2>
            <p className="text-[13px] text-gray-500 mb-6">Manage your company details and preferences</p>

            {saveMutation.isSuccess && (
              <div className="mb-4 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-md text-[13px] text-emerald-700">
                Settings saved successfully.
              </div>
            )}
            {saveMutation.isError && (
              <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-md text-[13px] text-red-700">
                Failed to save settings. Please try again.
              </div>
            )}

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
              <button
                onClick={handleSave}
                disabled={saveMutation.isPending || !isDirty}
                className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0D1B2A] text-xs font-semibold uppercase tracking-[2px] rounded shadow-[0_4px_20px_rgba(201,168,76,0.3)] disabled:opacity-50"
              >
                {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save Changes
              </button>
              <button
                onClick={handleCancel}
                disabled={!isDirty}
                className="px-6 py-3 text-gray-500 text-xs font-semibold uppercase tracking-[1.5px] hover:text-[#C9A84C] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
            </div>
          </ShipperCard>
        )}

        {activeTab !== 0 && (
          <ShipperCard padding="p-7">
            <h2 className="text-lg font-bold text-[#0D1B2A] mb-1">{settingsNav[activeTab]}</h2>
            <p className="text-[13px] text-gray-500">This section is coming soon.</p>
          </ShipperCard>
        )}
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
