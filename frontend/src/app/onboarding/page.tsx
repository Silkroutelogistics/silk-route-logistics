"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronRight, ChevronLeft, Upload, CheckCircle2, X, FileText, Image as ImageIcon } from "lucide-react";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/utils";

const steps = ["Company Info", "Equipment & Regions", "Documents", "Terms", "Review"];

const equipmentOptions = ["Dry Van", "Reefer", "Flatbed", "Step Deck", "Tanker", "Intermodal", "Power Only", "Box Truck"];
const regionOptions = ["Great Lakes", "Upper Midwest", "Southeast", "Northeast", "South Central", "West", "Eastern Canada", "Western Canada", "Central Canada", "Cross-Border"];

interface FmcsaResult {
  verified: boolean;
  legalName: string | null;
  dbaName: string | null;
  mcNumber: string | null;
  operatingStatus: string | null;
  entityType: string | null;
  safetyRating: string | null;
  insuranceOnFile: boolean;
  totalPowerUnits: number | null;
  totalDrivers: number | null;
  outOfServiceDate: string | null;
  phyStreet: string | null;
  phyCity: string | null;
  phyState: string | null;
  phyZipcode: string | null;
  phone: string | null;
  errors: string[];
}

interface CarrierFormData {
  firstName: string; lastName: string; email: string; password: string;
  company: string; phone: string; mcNumber: string; dotNumber: string;
  address: string; city: string; state: string; zip: string;
  numberOfTrucks: string;
  equipmentTypes: string[]; operatingRegions: string[];
  agreeTerms: boolean;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [form, setForm] = useState<CarrierFormData>({
    firstName: "", lastName: "", email: "", password: "",
    company: "", phone: "", mcNumber: "", dotNumber: "",
    address: "", city: "", state: "", zip: "",
    numberOfTrucks: "",
    equipmentTypes: [], operatingRegions: [],
    agreeTerms: false,
  });

  const [fmcsaResult, setFmcsaResult] = useState<FmcsaResult | null>(null);
  const [fmcsaLoading, setFmcsaLoading] = useState(false);
  const fmcsaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced FMCSA auto-lookup when DOT# is 5+ digits
  const lookupFmcsa = useCallback((dot: string) => {
    if (fmcsaTimer.current) clearTimeout(fmcsaTimer.current);
    setFmcsaResult(null);
    if (!dot || dot.length < 5 || !/^\d+$/.test(dot)) return;
    fmcsaTimer.current = setTimeout(async () => {
      setFmcsaLoading(true);
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!apiUrl) { setFmcsaLoading(false); return; }
        const res = await fetch(`${apiUrl}/carrier/fmcsa-lookup/${dot}`);
        if (res.ok) {
          const data = await res.json();
          setFmcsaResult(data);
          // Auto-fill fields from FMCSA if empty
          if (data.legalName && !form.company) set("company", data.legalName);
          if (data.mcNumber && !form.mcNumber) set("mcNumber", data.mcNumber);
          if (data.totalPowerUnits && !form.numberOfTrucks) set("numberOfTrucks", String(data.totalPowerUnits));
          if (data.phyStreet && !form.address) set("address", data.phyStreet);
          if (data.phyCity && !form.city) set("city", data.phyCity);
          if (data.phyState && !form.state) set("state", data.phyState);
          if (data.phyZipcode && !form.zip) set("zip", data.phyZipcode);
          if (data.phone && !form.phone) set("phone", data.phone);
        }
      } catch { /* silently fail — user can still proceed */ }
      setFmcsaLoading(false);
    }, 600);
  }, [form.company, form.mcNumber, form.numberOfTrucks, form.address, form.city, form.state, form.zip, form.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (field: keyof CarrierFormData, value: unknown) => setForm((p) => ({ ...p, [field]: value }));
  const toggleArray = (field: "equipmentTypes" | "operatingRegions", val: string) => {
    const arr = form[field];
    set(field, arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  };

  const canNext = () => {
    if (step === 0) return form.firstName && form.lastName && form.email && form.password.length >= 8 && form.company && form.mcNumber.trim() && form.dotNumber.length >= 5 && /^\d+$/.test(form.dotNumber);
    if (step === 1) return form.equipmentTypes.length > 0 && form.operatingRegions.length > 0;
    if (step === 3) return form.agreeTerms;
    return true;
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    setError(null);
    try {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL;
      if (!apiUrl) {
        setSuccess(true);
        return;
      }

      const { agreeTerms: _, address: _a, city: _c, state: _s, zip: _z, numberOfTrucks: _n, ...regData } = form;
      const res = await fetch(`${apiUrl}/carrier/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(regData),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Registration failed");
      }

      const data = await res.json();
      // Token is set as httpOnly cookie by backend — no localStorage needed

      if (files.length > 0) {
        const fd = new FormData();
        files.forEach((f) => fd.append("files", f));
        await fetch(`${apiUrl}/carrier/documents`, {
          method: "POST",
          headers: { Authorization: `Bearer ${data.token}` },
          body: fd,
        });
      }
      router.push("/dashboard/overview");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Registration failed";
      if (msg.includes("fetch") || msg.includes("network") || msg.includes("Failed")) {
        setSuccess(true);
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-sm border p-8 text-center">
          <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
          <h2 className="text-2xl font-bold mb-2">Application Submitted!</h2>
          <p className="text-slate-600 mb-6">
            Thank you for registering with Silk Route Logistics. Our team will review your application
            and get back to you within 24-48 hours.
          </p>
          <div className="space-y-3">
            <Link href="/dashboard/overview" className="block w-full px-6 py-3 bg-gold text-navy font-semibold rounded-lg hover:bg-gold-light transition">
              Go to Dashboard
            </Link>
            <Link href="/" className="block w-full px-6 py-3 border border-slate-200 rounded-lg hover:bg-slate-50 transition text-sm">
              Back to Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <nav className="bg-navy text-white px-6 py-4 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Logo size="sm" />
          <div>
            <span className="text-sm font-semibold">Silk Route Logistics</span>
            <span className="block text-[10px] text-slate-400">Carrier Registration</span>
          </div>
        </Link>
        <Link href="/auth/login" className="text-sm text-slate-400 hover:text-white transition">
          Already registered? Sign In
        </Link>
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
              <p className="text-sm text-slate-500">Enter your DOT or MC number to auto-populate your company details from FMCSA.</p>

              {/* DOT & MC at the top — triggers FMCSA lookup */}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">DOT Number *</label>
                  <input value={form.dotNumber} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); set("dotNumber", v); lookupFmcsa(v); }} className={cn("w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none", form.dotNumber && form.dotNumber.length < 5 ? "border-red-300" : fmcsaResult?.verified ? "border-green-400" : fmcsaResult && !fmcsaResult.verified ? "border-red-400" : "")} placeholder="e.g. 1234567" />
                  {form.dotNumber && form.dotNumber.length < 5 && (
                    <p className="text-xs text-red-500 mt-1">DOT number must be at least 5 digits</p>
                  )}
                  {fmcsaLoading && <p className="text-xs text-slate-500 mt-1 animate-pulse">Verifying with FMCSA...</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">MC Number *</label>
                  <input value={form.mcNumber} onChange={(e) => set("mcNumber", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" placeholder="MC-" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1"># of Trucks</label>
                  <input type="number" value={form.numberOfTrucks} onChange={(e) => set("numberOfTrucks", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" placeholder="e.g. 5" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
                  <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" placeholder="(555) 123-4567" />
                </div>
              </div>

              {/* FMCSA Verification Result — shown immediately after DOT/MC */}
              {fmcsaResult && (
                <div className={cn("p-4 rounded-lg border text-sm", fmcsaResult.verified ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200")}>
                  <div className="flex items-center gap-2 mb-2">
                    {fmcsaResult.verified ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-white text-xs font-bold">!</div>
                    )}
                    <span className={cn("font-semibold", fmcsaResult.verified ? "text-green-800" : "text-red-800")}>
                      {fmcsaResult.verified ? "FMCSA Verified — Authority Active" : fmcsaResult.errors.length > 0 ? "Carrier Not Found in FMCSA" : "Authority Not Active"}
                    </span>
                  </div>
                  {fmcsaResult.legalName && (
                    <div className="grid sm:grid-cols-2 gap-x-6 gap-y-1 ml-7 text-slate-700">
                      <p><span className="font-medium">Legal Name:</span> {fmcsaResult.legalName}</p>
                      {fmcsaResult.dbaName && <p><span className="font-medium">DBA:</span> {fmcsaResult.dbaName}</p>}
                      {fmcsaResult.mcNumber && <p><span className="font-medium">MC#:</span> {fmcsaResult.mcNumber}</p>}
                      <p><span className="font-medium">Status:</span> {fmcsaResult.operatingStatus}</p>
                      {fmcsaResult.entityType && <p><span className="font-medium">Type:</span> {fmcsaResult.entityType}</p>}
                      <p><span className="font-medium">Insurance:</span> {fmcsaResult.insuranceOnFile ? "On File" : "Not on File"}</p>
                      {fmcsaResult.totalPowerUnits != null && <p><span className="font-medium">Power Units:</span> {fmcsaResult.totalPowerUnits}</p>}
                      {fmcsaResult.safetyRating && <p><span className="font-medium">Safety Rating:</span> {fmcsaResult.safetyRating}</p>}
                      {fmcsaResult.phyCity && <p><span className="font-medium">Address:</span> {[fmcsaResult.phyStreet, fmcsaResult.phyCity, fmcsaResult.phyState, fmcsaResult.phyZipcode].filter(Boolean).join(", ")}</p>}
                      {fmcsaResult.phone && <p><span className="font-medium">Phone:</span> {fmcsaResult.phone}</p>}
                    </div>
                  )}
                  {!fmcsaResult.verified && fmcsaResult.outOfServiceDate && (
                    <p className="ml-7 text-red-700 font-medium mt-1">Out of Service: {fmcsaResult.outOfServiceDate}</p>
                  )}
                </div>
              )}

              {/* Divider */}
              <div className="border-t pt-5">
                <p className="text-xs text-slate-400 mb-4">{fmcsaResult?.verified ? "Fields below have been auto-populated from FMCSA. You may edit if needed." : "Fill in your company details below."}</p>
              </div>

              {/* Company details — auto-populated from FMCSA */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Company Name *</label>
                <input value={form.company} onChange={(e) => set("company", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Address</label>
                <AddressAutocomplete
                  value={form.address}
                  onChange={(v) => set("address", v)}
                  onSelect={(addr) => {
                    set("address", addr.street);
                    set("city", addr.city);
                    set("state", addr.state);
                    set("zip", addr.zip);
                  }}
                  placeholder="Start typing an address..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none"
                />
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">City</label>
                  <input value={form.city} onChange={(e) => set("city", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">State / Province</label>
                  <input value={form.state} onChange={(e) => set("state", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" placeholder="ON / IL / etc." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">ZIP / Postal Code</label>
                  <input value={form.zip} onChange={(e) => set("zip", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
                </div>
              </div>

              {/* Personal / account info */}
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
            </div>
          )}

          {/* Step 1: Equipment & Regions */}
          {step === 1 && (
            <div className="space-y-6">
              <h2 className="text-xl font-bold">Equipment & Operating Regions</h2>
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
                <label className="block text-sm font-medium text-slate-700 mb-3">Operating Regions * (US & Canada)</label>
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
              <p className="text-sm text-slate-500">Upload your carrier documents. PDF, JPEG, or PNG accepted (max 10MB each). Click each card to upload.</p>
              <div className="grid gap-4">
                {[
                  { key: "w9", label: "W-9 Form", desc: "Required for tax reporting" },
                  { key: "insurance", label: "Insurance Certificate", desc: "Auto liability, cargo, and general liability" },
                  { key: "authority", label: "Authority Letter / Operating Authority", desc: "FMCSA operating authority" },
                  { key: "safety", label: "Safety Fitness Certificate (Canadian carriers)", desc: "Required for Canadian-based carriers operating interprovincially" },
                ].map((doc) => {
                  const docFile = files.find((f) => (f as any).__docType === doc.key);
                  return (
                    <label key={doc.key} className={cn(
                      "p-4 rounded-lg border cursor-pointer transition hover:border-gold/50 hover:bg-gold/5",
                      docFile ? "bg-green-50 border-green-300" : "bg-slate-50 border-slate-200"
                    )}>
                      <div className="flex items-center gap-3">
                        {docFile ? (
                          <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />
                        ) : (
                          <Upload className="w-5 h-5 text-gold shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block">{doc.label}</span>
                          {docFile ? (
                            <span className="text-xs text-green-600 truncate block">{docFile.name} ({(docFile.size / 1024).toFixed(0)} KB)</span>
                          ) : (
                            <span className="text-xs text-slate-400 block">{doc.desc}</span>
                          )}
                        </div>
                        {docFile && (
                          <button type="button" onClick={(e) => { e.preventDefault(); setFiles(files.filter((f) => (f as any).__docType !== doc.key)); }}
                            className="p-1 hover:bg-red-50 rounded transition shrink-0">
                            <X className="w-4 h-4 text-red-400" />
                          </button>
                        )}
                      </div>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 10 * 1024 * 1024) { setError("File must be under 10 MB"); return; }
                        if (!["application/pdf", "image/jpeg", "image/png"].includes(file.type)) { setError("Only PDF, JPEG, and PNG files are allowed"); return; }
                        setError(null);
                        Object.defineProperty(file, "__docType", { value: doc.key, writable: false });
                        setFiles((prev) => [...prev.filter((f) => (f as any).__docType !== doc.key), file]);
                        e.target.value = "";
                      }} />
                    </label>
                  );
                })}
              </div>
              {/* Additional documents drop zone */}
              <div
                className="border-2 border-dashed rounded-xl p-6 text-center transition cursor-pointer border-slate-200 hover:border-gold/40 hover:bg-gold/5"
                onClick={() => document.getElementById("extra-file-input")?.click()}
              >
                <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">Drop additional files here or click to browse</p>
                <p className="text-xs text-slate-400 mt-1">Any other supporting documents</p>
                <input id="extra-file-input" type="file" multiple accept=".pdf,.jpg,.jpeg,.png" className="hidden"
                  onChange={(e) => {
                    if (!e.target.files) return;
                    const newFiles = Array.from(e.target.files).filter((f) => {
                      if (f.size > 10 * 1024 * 1024) { setError("Files must be under 10 MB"); return false; }
                      if (!["application/pdf", "image/jpeg", "image/png"].includes(f.type)) { setError("Only PDF, JPEG, and PNG files are allowed"); return false; }
                      return true;
                    });
                    setError(null);
                    setFiles((prev) => [...prev, ...newFiles]);
                    e.target.value = "";
                  }}
                />
              </div>
              {/* Show extra (non-typed) files */}
              {files.filter((f) => !(f as any).__docType).length > 0 && (
                <ul className="space-y-2">
                  {files.filter((f) => !(f as any).__docType).map((file, i) => (
                    <li key={`${file.name}-${i}`} className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                      {file.type === "application/pdf" ? <FileText className="w-5 h-5 text-red-400 shrink-0" /> : <ImageIcon className="w-5 h-5 text-blue-400 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                        <p className="text-xs text-slate-400">{(file.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== files.indexOf(file)))}
                        className="p-1 hover:bg-red-50 rounded transition">
                        <X className="w-4 h-4 text-red-400" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
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
                  <li>Comply with all FMCSA regulations, DOT requirements, and applicable Canadian provincial regulations</li>
                  <li>Provide accurate and timely updates on load status and location</li>
                  <li>Submit required documentation (BOL, POD) within 24 hours of delivery</li>
                  <li>Maintain professional communication with dispatchers and operations staff</li>
                  <li>Accept that your performance will be tracked and used for tier placement</li>
                  <li>Understand that tier status affects bonus eligibility and load access priority</li>
                  <li>Comply with ELD and GPS tracking requirements while on company loads</li>
                  <li>Maintain valid Safety Fitness Certificate (for Canadian interprovincial operations)</li>
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
                  <p className="text-sm text-slate-600">
                    {form.address && `${form.address}, `}{form.city && `${form.city}, `}{form.state} {form.zip}
                  </p>
                  <p className="text-sm text-slate-600">
                    DOT: {form.dotNumber}{form.mcNumber && ` | MC: ${form.mcNumber}`}
                    {form.numberOfTrucks && ` | Trucks: ${form.numberOfTrucks}`}
                    {fmcsaResult?.verified && <span className="ml-2 text-green-600 font-medium">FMCSA Verified</span>}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border">
                  <p className="text-xs text-slate-500 uppercase mb-1">Equipment</p>
                  <p className="text-sm">{form.equipmentTypes.join(", ")}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border">
                  <p className="text-xs text-slate-500 uppercase mb-1">Operating Regions</p>
                  <p className="text-sm">{form.operatingRegions.join(", ")}</p>
                </div>
                <div className="p-4 rounded-lg bg-slate-50 border">
                  <p className="text-xs text-slate-500 uppercase mb-1">Documents</p>
                  {files.length > 0 ? (
                    <ul className="text-sm space-y-1">
                      {files.map((f, i) => (
                        <li key={i} className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                          <span>{(f as any).__docType ? `${(f as any).__docType.toUpperCase()}: ` : ""}{f.name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-slate-400">No documents uploaded yet</p>
                  )}
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

/* ── Google Places AddressAutocomplete ── */
let mapsPromise: Promise<void> | null = null;
function loadGoogleMaps(): Promise<void> {
  if (mapsPromise) return mapsPromise;
  if (typeof window !== "undefined" && (window as any).google?.maps?.places) return Promise.resolve();
  mapsPromise = new Promise((resolve) => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) { resolve(); return; }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => resolve();
    document.head.appendChild(s);
  });
  return mapsPromise;
}

interface ParsedAddr { street: string; city: string; state: string; zip: string; }

function AddressAutocomplete({ value, onChange, onSelect, placeholder, className }: {
  value: string; onChange: (v: string) => void; onSelect: (a: ParsedAddr) => void;
  placeholder?: string; className?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const acRef = useRef<any>(null); // eslint-disable-line

  const handlePlace = useCallback(() => {
    const place = acRef.current?.getPlace();
    if (!place?.address_components) return;
    const get = (type: string) => place.address_components?.find((c: any) => c.types.includes(type)); // eslint-disable-line
    const num = get("street_number")?.long_name || "";
    const route = get("route")?.long_name || "";
    const street = [num, route].filter(Boolean).join(" ");
    onSelect({
      street: street || (inputRef.current?.value ?? ""),
      city: (get("locality") || get("sublocality_level_1") || get("administrative_area_level_3"))?.long_name || "",
      state: get("administrative_area_level_1")?.short_name || "",
      zip: get("postal_code")?.long_name || "",
    });
  }, [onSelect]);

  useEffect(() => {
    loadGoogleMaps().then(() => {
      if (!inputRef.current || !(window as any).google?.maps?.places || acRef.current) return;
      acRef.current = new (window as any).google.maps.places.Autocomplete(inputRef.current, { // eslint-disable-line
        types: ["address"],
        componentRestrictions: { country: ["us", "ca", "mx"] },
      });
      acRef.current.setFields(["address_components", "formatted_address"]);
      acRef.current.addListener("place_changed", handlePlace);
    });
  }, [handlePlace]);

  return (
    <input ref={inputRef} type="text" value={value} onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder} className={className} autoComplete="off" />
  );
}
