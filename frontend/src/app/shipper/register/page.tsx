"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ArrowRight, MapPin, User } from "lucide-react";

const steps = ["Company Info", "Shipping Profile", "Preferences", "Review"];

export default function ShipperRegisterPage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<Record<string, string>>({});
  const router = useRouter();
  const upd = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <div className="bg-[#F8F5ED] min-h-screen">
      {/* Nav */}
      <nav className="bg-[#0D1B2A] px-6 h-14 flex items-center justify-between">
        <Link href="/shipper" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#C9A84C] to-[#A88535] flex items-center justify-center text-[13px] font-extrabold text-[#0D1B2A]">SR</div>
          <span className="font-serif text-sm text-white tracking-[1px]">SILK ROUTE LOGISTICS</span>
        </Link>
        <Link href="/shipper/login" className="text-gray-300 text-[11px] font-semibold uppercase tracking-[1.5px] hover:text-[#C9A84C] transition-colors">
          Already have an account? Log In
        </Link>
      </nav>

      <div className="max-w-[640px] mx-auto px-6 py-12">
        {/* Progress Steps */}
        <div className="flex items-center justify-center mb-12">
          {steps.map((s, i) => (
            <div key={i} className="flex items-center">
              <div className="flex flex-col items-center gap-1.5">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[13px] font-bold transition-all ${
                  step > i + 1 ? "bg-emerald-500 text-white" : step === i + 1 ? "bg-[#C9A84C] text-white" : "bg-gray-200 text-gray-400"
                }`}>
                  {step > i + 1 ? <Check size={16} /> : i + 1}
                </div>
                <span className={`text-[10px] ${step === i + 1 ? "text-[#0D1B2A] font-semibold" : "text-gray-400"}`}>{s}</span>
              </div>
              {i < 3 && <div className={`w-12 h-0.5 mx-2 mb-5 transition-all ${step > i + 1 ? "bg-emerald-500" : "bg-gray-200"}`} />}
            </div>
          ))}
        </div>

        {/* Card */}
        <div className="bg-white rounded-md border border-gray-200 p-9">
          {step === 1 && (
            <>
              <h2 className="font-serif text-2xl text-[#0D1B2A] mb-1">Company Information</h2>
              <p className="text-[13px] text-gray-500 mb-7">Tell us about your business so we can tailor your experience.</p>
              <div className="grid grid-cols-2 gap-x-4">
                <Field label="Company Name" required value={form.company} onChange={(v) => upd("company", v)} placeholder="Acme Manufacturing" />
                <Field label="Industry" required value={form.industry} onChange={(v) => upd("industry", v)} options={["CPG / Consumer Goods", "Food & Beverage", "Manufacturing", "Retail / E-Commerce", "Automotive", "Chemical", "Agriculture", "Construction", "Pharmaceutical", "Other"]} />
                <Field label="MC/DOT # (if applicable)" value={form.mc} onChange={(v) => upd("mc", v)} placeholder="MC-XXXXXX" />
                <Field label="Annual Freight Spend" value={form.spend} onChange={(v) => upd("spend", v)} options={["Under $100K", "$100K - $500K", "$500K - $1M", "$1M - $5M", "$5M+"]} />
              </div>
              <Field label="Company Address" required value={form.address} onChange={(v) => upd("address", v)} placeholder="123 Industrial Pkwy, City, ST ZIP" icon={<MapPin size={16} />} />
              <div className="grid grid-cols-2 gap-x-4">
                <Field label="Primary Contact Name" required value={form.contact} onChange={(v) => upd("contact", v)} placeholder="Jane Doe" icon={<User size={16} />} />
                <Field label="Title / Role" value={form.title} onChange={(v) => upd("title", v)} placeholder="Logistics Manager" />
                <Field label="Email" required type="email" value={form.email} onChange={(v) => upd("email", v)} placeholder="jane@company.com" />
                <Field label="Phone" required value={form.phone} onChange={(v) => upd("phone", v)} placeholder="(555) 123-4567" />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="font-serif text-2xl text-[#0D1B2A] mb-1">Shipping Profile</h2>
              <p className="text-[13px] text-gray-500 mb-7">Help us understand your freight needs to optimize your experience.</p>
              <div className="grid grid-cols-2 gap-x-4">
                <Field label="Avg. Monthly Shipments" required value={form.volume} onChange={(v) => upd("volume", v)} options={["1-10", "11-50", "51-100", "101-500", "500+"]} />
                <Field label="Primary Equipment Type" value={form.equipment} onChange={(v) => upd("equipment", v)} options={["Dry Van", "Reefer", "Flatbed", "Step Deck", "LTL", "Intermodal", "Multiple"]} />
                <Field label="Primary Origin Region" value={form.origin} onChange={(v) => upd("origin", v)} placeholder="e.g., Midwest, Southeast" icon={<MapPin size={16} />} />
                <Field label="Primary Destination Region" value={form.dest} onChange={(v) => upd("dest", v)} placeholder="e.g., East Coast, National" icon={<MapPin size={16} />} />
              </div>
              <Field label="Commodity Type" value={form.commodity} onChange={(v) => upd("commodity", v)} placeholder="e.g., Packaged food, Auto parts, Electronics" />
              <Field label="Special Requirements" type="textarea" value={form.requirements} onChange={(v) => upd("requirements", v)} placeholder="Temperature control, team drivers, hazmat, oversized, etc." />
              <div className="grid grid-cols-2 gap-x-4">
                <Field label="Average Shipment Weight" value={form.weight} onChange={(v) => upd("weight", v)} placeholder="e.g., 40,000 lbs" />
                <Field label="TMS / ERP System" value={form.tms} onChange={(v) => upd("tms", v)} options={["None", "SAP", "Oracle", "Blue Yonder", "MercuryGate", "Kuebix", "Other"]} helpText="For future EDI/API integration" />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="font-serif text-2xl text-[#0D1B2A] mb-1">Preferences &amp; Security</h2>
              <p className="text-[13px] text-gray-500 mb-7">Set up your portal access and notification preferences.</p>
              <div className="grid grid-cols-2 gap-x-4">
                <Field label="Portal Username" required value={form.username} onChange={(v) => upd("username", v)} placeholder="jane.doe" icon={<User size={16} />} />
                <Field label="Create Password" required type="password" value={form.password} onChange={(v) => upd("password", v)} placeholder="Min 8 chars, 1 uppercase, 1 number" />
              </div>
              <Field label="Payment Terms Preference" value={form.payTerms} onChange={(v) => upd("payTerms", v)} options={["Net 30", "Net 45", "Net 60", "Prepaid"]} />
              <div className="mb-5">
                <label className="block text-xs font-semibold text-gray-500 mb-2.5">Notification Preferences</label>
                {["Shipment status updates (email)", "Shipment status updates (SMS)", "Quote responses", "Invoice & payment alerts", "Weekly analytics digest", "Market rate alerts for my lanes"].map((n, i) => (
                  <label key={i} className="flex items-center gap-2.5 py-2 cursor-pointer text-[13px] text-gray-600">
                    <input type="checkbox" defaultChecked={i < 4} className="accent-[#C9A84C]" />
                    {n}
                  </label>
                ))}
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <h2 className="font-serif text-2xl text-[#0D1B2A] mb-1">Review &amp; Submit</h2>
              <p className="text-[13px] text-gray-500 mb-7">Please confirm your details before creating your account.</p>
              {[
                ["Company", form.company],
                ["Industry", form.industry],
                ["Contact", form.contact],
                ["Email", form.email],
                ["Phone", form.phone],
                ["Volume", form.volume],
                ["Equipment", form.equipment],
                ["Origin", form.origin],
                ["Destination", form.dest],
              ].map(([k, v], i) => (
                <div key={i} className={`flex justify-between py-2.5 ${i < 8 ? "border-b border-gray-100" : ""}`}>
                  <span className="text-[13px] text-gray-500">{k}</span>
                  <span className="text-[13px] font-semibold text-[#0D1B2A]">{v || "—"}</span>
                </div>
              ))}
              <div className="mt-6 p-4 bg-[#C9A84C]/[0.08] rounded-lg border border-[#C9A84C]/20">
                <label className="flex gap-2.5 cursor-pointer text-[13px] text-gray-600 leading-relaxed">
                  <input type="checkbox" className="accent-[#C9A84C] mt-0.5" />
                  I agree to Silk Route Logistics&apos; Terms of Service and Privacy Policy. I authorize SRL to manage freight transportation services on my behalf.
                </label>
              </div>
            </>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between mt-7 gap-3">
            {step > 1 ? (
              <button onClick={() => setStep(step - 1)} className="px-4 py-2 text-gray-500 text-[11px] font-semibold uppercase tracking-[1.5px] hover:text-[#C9A84C] transition-colors">
                Back
              </button>
            ) : <div />}
            {step < 4 ? (
              <button onClick={() => setStep(step + 1)} className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0D1B2A] text-xs font-semibold uppercase tracking-[2px] rounded shadow-[0_4px_20px_rgba(201,168,76,0.3)] hover:-translate-y-0.5 transition-all">
                <ArrowRight size={16} /> Continue
              </button>
            ) : (
              <button onClick={() => router.push("/shipper/dashboard")} className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0D1B2A] text-xs font-semibold uppercase tracking-[2px] rounded shadow-[0_4px_20px_rgba(201,168,76,0.3)] hover:-translate-y-0.5 transition-all">
                <Check size={16} /> Create Account &amp; Enter Portal
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label, type = "text", value, onChange, placeholder, required, options, icon, helpText,
}: {
  label: string; type?: string; value?: string; onChange: (v: string) => void; placeholder?: string; required?: boolean; options?: string[]; icon?: React.ReactNode; helpText?: string;
}) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-gray-500 mb-1.5 tracking-wide">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        {icon && <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">{icon}</div>}
        {options ? (
          <select value={value || ""} onChange={(e) => onChange(e.target.value)} className={`w-full py-2.5 ${icon ? "pl-10" : "pl-3.5"} pr-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C] transition-colors appearance-none bg-white`}>
            <option value="">Select...</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : type === "textarea" ? (
          <textarea value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4} className="w-full py-2.5 px-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C] transition-colors resize-y" />
        ) : (
          <input type={type} value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={`w-full py-2.5 ${icon ? "pl-10" : "pl-3.5"} pr-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C] transition-colors`} />
        )}
      </div>
      {helpText && <div className="text-[11px] text-gray-400 mt-1">{helpText}</div>}
    </div>
  );
}
