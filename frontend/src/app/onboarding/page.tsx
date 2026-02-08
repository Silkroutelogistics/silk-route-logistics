"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, ChevronLeft, Upload } from "lucide-react";
import { api } from "@/lib/api";
import { FileUpload } from "@/components/ui/FileUpload";
import { cn } from "@/lib/utils";

const steps = ["Company Info", "Equipment & Regions", "Documents", "Terms", "Review"];

const equipmentOptions = ["Dry Van", "Reefer", "Flatbed", "Step Deck", "Tanker", "Intermodal", "Power Only", "Box Truck"];
const regionOptions = ["Northeast", "Southeast", "Midwest", "Southwest", "West", "Northwest", "National"];

interface FormData {
  firstName: string; lastName: string; email: string; password: string;
  company: string; phone: string; mcNumber: string; dotNumber: string;
  equipmentTypes: string[]; operatingRegions: string[];
  agreeTerms: boolean;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>({
    firstName: "", lastName: "", email: "", password: "",
    company: "", phone: "", mcNumber: "", dotNumber: "",
    equipmentTypes: [], operatingRegions: [],
    agreeTerms: false,
  });

  const set = (field: keyof FormData, value: unknown) => setForm((p) => ({ ...p, [field]: value }));
  const toggleArray = (field: "equipmentTypes" | "operatingRegions", val: string) => {
    const arr = form[field];
    set(field, arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  };

  const canNext = () => {
    if (step === 0) return form.firstName && form.lastName && form.email && form.password.length >= 8 && form.company;
    if (step === 1) return form.equipmentTypes.length > 0 && form.operatingRegions.length > 0;
    if (step === 3) return form.agreeTerms;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const { agreeTerms: _, ...regData } = form;
      const { data } = await api.post("/carrier/register", regData);
      localStorage.setItem("token", data.token);

      if (files.length > 0) {
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f));
        await api.post("/carrier/documents", fd, { headers: { "Content-Type": "multipart/form-data" } });
      }
      router.push("/dashboard/overview");
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Registration failed";
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-navy text-white px-6 py-4">
        <span className="text-xl font-bold text-gold">SRL</span>
        <span className="ml-2 text-sm text-slate-300">Carrier Registration</span>
      </nav>

      {/* Progress */}
      <div className="max-w-3xl mx-auto px-6 pt-8">
        <div className="flex items-center justify-between mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition",
                i < step ? "bg-green-500 text-white" : i === step ? "bg-gold text-navy" : "bg-slate-200 text-slate-500"
              )}>
                {i < step ? <Check className="w-4 h-4" /> : i + 1}
              </div>
              <span className="hidden sm:inline text-sm text-slate-600">{s}</span>
              {i < steps.length - 1 && <div className="w-8 md:w-16 h-px bg-slate-200 mx-1" />}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pb-12">
        <div className="bg-white rounded-2xl shadow-sm border p-8">
          {error && <div className="mb-6 p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}

          {/* Step 0: Company Info */}
          {step === 0 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold">Company Information</h2>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">First Name *</label>
                  <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Last Name *</label>
                  <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company Name *</label>
                <input value={form.company} onChange={(e) => set("company", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
              </div>
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Email *</label>
                  <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Password * (min 8 chars)</label>
                  <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
                </div>
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input value={form.phone} onChange={(e) => set("phone", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">MC Number</label>
                  <input value={form.mcNumber} onChange={(e) => set("mcNumber", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" placeholder="MC-" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">DOT Number</label>
                  <input value={form.dotNumber} onChange={(e) => set("dotNumber", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" placeholder="DOT-" />
                </div>
              </div>
            </div>
          )}

          {/* Step 1: Equipment & Regions */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Equipment & Regions</h2>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">Equipment Types *</label>
                <div className="flex flex-wrap gap-2">
                  {equipmentOptions.map((eq) => (
                    <button key={eq} type="button" onClick={() => toggleArray("equipmentTypes", eq)}
                      className={cn("px-4 py-2 rounded-lg text-sm border transition",
                        form.equipmentTypes.includes(eq) ? "bg-gold/10 border-gold text-gold font-medium" : "border-slate-200 text-slate-600 hover:border-slate-300"
                      )}>{eq}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-3">Operating Regions *</label>
                <div className="flex flex-wrap gap-2">
                  {regionOptions.map((r) => (
                    <button key={r} type="button" onClick={() => toggleArray("operatingRegions", r)}
                      className={cn("px-4 py-2 rounded-lg text-sm border transition",
                        form.operatingRegions.includes(r) ? "bg-gold/10 border-gold text-gold font-medium" : "border-slate-200 text-slate-600 hover:border-slate-300"
                      )}>{r}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Documents */}
          {step === 2 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold">Document Upload</h2>
              <p className="text-sm text-slate-500">Upload your W-9, Insurance Certificate, and Authority Letter. PDF, JPEG, or PNG.</p>
              <div className="grid gap-4">
                <div className="p-4 rounded-lg bg-slate-50 border">
                  <div className="flex items-center gap-3 mb-1">
                    <Upload className="w-4 h-4 text-gold" />
                    <span className="text-sm font-medium">W-9 Form</span>
                  </div>
                  <p className="text-xs text-slate-400 ml-7">Required for tax reporting</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border">
                  <div className="flex items-center gap-3 mb-1">
                    <Upload className="w-4 h-4 text-gold" />
                    <span className="text-sm font-medium">Insurance Certificate</span>
                  </div>
                  <p className="text-xs text-slate-400 ml-7">Auto liability, cargo, and general liability</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border">
                  <div className="flex items-center gap-3 mb-1">
                    <Upload className="w-4 h-4 text-gold" />
                    <span className="text-sm font-medium">Authority Letter</span>
                  </div>
                  <p className="text-xs text-slate-400 ml-7">FMCSA operating authority</p>
                </div>
              </div>
              <FileUpload files={files} onChange={setFiles} maxFiles={5} />
            </div>
          )}

          {/* Step 3: Terms */}
          {step === 3 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold">Terms & Agreement</h2>
              <div className="p-4 rounded-lg bg-slate-50 border max-h-64 overflow-y-auto text-sm text-slate-600 leading-relaxed">
                <p className="font-semibold mb-2">Silk Route Logistics Carrier Agreement</p>
                <p className="mb-2">By registering as a carrier on the Silk Route Logistics platform, you agree to:</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Maintain valid operating authority and insurance coverage at all times</li>
                  <li>Comply with all FMCSA regulations and DOT requirements</li>
                  <li>Provide accurate and timely updates on load status and location</li>
                  <li>Submit required documentation (BOL, POD) within 24 hours of delivery</li>
                  <li>Maintain professional communication with brokers and shippers</li>
                  <li>Accept that your performance will be tracked and used for tier placement</li>
                  <li>Understand that tier status affects bonus eligibility and load access priority</li>
                </ul>
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" checked={form.agreeTerms}
                  onChange={(e) => set("agreeTerms", e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-gold focus:ring-gold" />
                <span className="text-sm text-slate-700">I agree to the Carrier Terms & Conditions</span>
              </label>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-5">
              <h2 className="text-xl font-bold">Review Your Application</h2>
              <div className="grid gap-4">
                <div className="p-4 rounded-lg bg-slate-50 border">
                  <p className="text-xs text-slate-500 uppercase mb-1">Contact</p>
                  <p className="font-medium">{form.firstName} {form.lastName}</p>
                  <p className="text-sm text-slate-600">{form.email} {form.phone && `| ${form.phone}`}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border">
                  <p className="text-xs text-slate-500 uppercase mb-1">Company</p>
                  <p className="font-medium">{form.company}</p>
                  <p className="text-sm text-slate-600">{form.mcNumber && `MC: ${form.mcNumber}`} {form.dotNumber && `| DOT: ${form.dotNumber}`}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border">
                  <p className="text-xs text-slate-500 uppercase mb-1">Equipment</p>
                  <p className="text-sm">{form.equipmentTypes.join(", ")}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border">
                  <p className="text-xs text-slate-500 uppercase mb-1">Regions</p>
                  <p className="text-sm">{form.operatingRegions.join(", ")}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border">
                  <p className="text-xs text-slate-500 uppercase mb-1">Documents</p>
                  <p className="text-sm">{files.length > 0 ? `${files.length} file(s) uploaded` : "No documents uploaded yet"}</p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation */}
          <div className="flex justify-between mt-8 pt-6 border-t">
            <button onClick={() => setStep(step - 1)} disabled={step === 0}
              className="flex items-center gap-1 px-5 py-2 text-slate-600 hover:text-slate-900 disabled:opacity-30 transition">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            {step < 4 ? (
              <button onClick={() => setStep(step + 1)} disabled={!canNext()}
                className="flex items-center gap-1 px-6 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold-light disabled:opacity-40 transition">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={submitting}
                className="px-8 py-2 bg-gold text-navy font-semibold rounded-lg hover:bg-gold-light disabled:opacity-50 transition">
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
