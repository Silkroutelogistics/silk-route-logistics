"use client";

import { useState } from "react";
import { MapPin, Zap } from "lucide-react";

export function QuoteForm() {
  const [form, setForm] = useState<Record<string, string>>({});
  const upd = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div>
      <h3 className="text-base font-bold text-[#0D1B2A] mb-5">Shipment Details</h3>
      <div className="grid grid-cols-2 gap-x-4">
        <FormField label="Origin City, State" required icon={<MapPin size={16} />} value={form.qOrigin || ""} onChange={(v) => upd("qOrigin", v)} placeholder="Kalamazoo, MI" />
        <FormField label="Destination City, State" required icon={<MapPin size={16} />} value={form.qDest || ""} onChange={(v) => upd("qDest", v)} placeholder="Chicago, IL" />
        <FormField label="Pickup Date" required type="date" value={form.qPickup || ""} onChange={(v) => upd("qPickup", v)} />
        <FormField label="Delivery Date" type="date" value={form.qDelivery || ""} onChange={(v) => upd("qDelivery", v)} />
        <FormField label="Equipment Type" required value={form.qEquip || ""} onChange={(v) => upd("qEquip", v)} options={["Dry Van 53'", "Reefer 53'", "Flatbed 48'", "Step Deck", "Conestoga", "Power Only"]} />
        <FormField label="Load Type" value={form.qLoadType || ""} onChange={(v) => upd("qLoadType", v)} options={["Full Truckload (FTL)", "Partial / Volume", "LTL"]} />
        <FormField label="Weight (lbs)" required value={form.qWeight || ""} onChange={(v) => upd("qWeight", v)} placeholder="42,000" />
        <FormField label="Commodity" required value={form.qCommodity || ""} onChange={(v) => upd("qCommodity", v)} placeholder="Packaged foods" />
      </div>
      <FormField label="Special Instructions" type="textarea" value={form.qNotes || ""} onChange={(v) => upd("qNotes", v)} placeholder="Temperature requirements, driver assist, appointment times, etc." />
      <div className="flex gap-3 mt-2">
        <button className="inline-flex items-center gap-2 px-9 py-4 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0D1B2A] text-[13px] font-semibold uppercase tracking-[2px] rounded shadow-[0_4px_20px_rgba(201,168,76,0.3)] hover:shadow-[0_6px_30px_rgba(201,168,76,0.45)] hover:-translate-y-0.5 transition-all">
          <Zap size={16} /> Get Instant Quote
        </button>
        <button className="px-9 py-4 border border-gray-200 text-gray-500 text-[13px] font-semibold uppercase tracking-[2px] rounded hover:text-[#C9A84C] hover:border-[#C9A84C] transition-all">
          Save as Template
        </button>
      </div>
    </div>
  );
}

function FormField({
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  required,
  options,
  icon,
}: {
  label: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  icon?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-gray-500 mb-1.5 tracking-wide">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</div>}
        {options ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            className={`w-full py-2.5 ${icon ? "pl-10" : "pl-3.5"} pr-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C] transition-colors appearance-none bg-white`}
          >
            <option value="">Select...</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : type === "textarea" ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            rows={4}
            className="w-full py-2.5 px-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C] transition-colors resize-y"
          />
        ) : (
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder={placeholder}
            className={`w-full py-2.5 ${icon ? "pl-10" : "pl-3.5"} pr-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C] transition-colors`}
          />
        )}
      </div>
    </div>
  );
}
