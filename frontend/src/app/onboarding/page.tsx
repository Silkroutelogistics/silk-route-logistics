"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronRight, ChevronLeft, Upload, CheckCircle2, X, FileText, Image as ImageIcon, MapPin, Compass } from "lucide-react";
import { cn } from "@/lib/utils";

const steps = ["Company Info", "Equipment & Regions", "Documents", "Terms", "Review"];

/* ── v3.8.ain Path 2C — Canonical chrome parity nav for /onboarding ──
   Mirrors the static-HTML `_partials/nav.html` chrome that's injected on
   /, /carriers, /shippers, /about, /contact, /track via inject-chrome.mjs
   (utilities.css `.nav` / `.nav-link` / `.nav-login-btn` rules). The
   public marketing CSS does NOT load on React routes (only globals.css
   loads — Tailwind + globals), so the visual match is rebuilt in
   Tailwind here. Navy `#0A2540` bg + 72px height + gold-dark `#BA7517`
   CTA Sign In + dropdown to AE/Carrier/Shipper login. "Carriers" link
   highlighted in gold-light `#DAC39C` since /onboarding is a carrier-
   path surface. */
function OnboardingNav() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [loginOpen, setLoginOpen] = useState(false);

  return (
    <>
      <nav className="bg-[#0A2540] border-b border-[#C5A572]/15 sticky top-0 z-50">
        <div className="max-w-[1280px] mx-auto px-6 h-[72px] flex items-center justify-between">
          {/* v3.8.aiq — logo-only per canonical _partials/nav.html parity.
              The "Silk Route Logistics" wordmark span added in v3.8.ain
              was non-canonical drift — no other public marketing nav
              carries text next to the logo. Removed entirely. */}
          <Link href="/" className="flex items-center" aria-label="Silk Route Logistics Home">
            <img src="/logo.png" alt="SRL" className="h-9 w-auto rounded-md" />
          </Link>

          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-8">
            <Link href="/shippers.html" className="text-sm font-medium text-[#FBF7F0]/90 hover:text-[#DAC39C] transition tracking-wide">Shippers</Link>
            <Link href="/carriers.html" className="text-sm font-medium text-[#DAC39C] hover:text-[#DAC39C] transition tracking-wide">Carriers</Link>
            <Link href="/about.html" className="text-sm font-medium text-[#FBF7F0]/90 hover:text-[#DAC39C] transition tracking-wide">About</Link>
            <Link href="/contact.html" className="text-sm font-medium text-[#FBF7F0]/90 hover:text-[#DAC39C] transition tracking-wide">Contact</Link>
            <Link href="/track" className="text-sm font-medium text-[#FBF7F0]/90 hover:text-[#DAC39C] transition tracking-wide">Track</Link>

            {/* Sign In dropdown — hover + click toggle, matches canonical */}
            <div
              className="relative"
              onMouseEnter={() => setLoginOpen(true)}
              onMouseLeave={() => setLoginOpen(false)}
            >
              {/* v3.8.ait — canonical parity with `.nav-login-btn`
                  in utilities.css: padding 9px 22px, no chevron icon,
                  hover-to-reveal dropdown (no click toggle visual cue
                  on the button itself). Matches /, /carriers, /shippers,
                  /about, /contact, /track nav buttons exactly. */}
              <button
                type="button"
                className="bg-[#BA7517] hover:bg-[#C5A572] text-[#FBF7F0] py-[9px] px-[22px] rounded-md text-sm font-semibold transition"
                onClick={() => setLoginOpen((v) => !v)}
                aria-haspopup="true"
                aria-expanded={loginOpen}
              >
                Sign In
              </button>
              {loginOpen && (
                <div
                  className="absolute right-0 top-full mt-2 min-w-[200px] bg-white rounded-md shadow-lg overflow-hidden"
                  role="menu"
                >
                  <Link href="/auth/login" role="menuitem" className="block px-5 py-3.5 text-sm font-medium text-[#0A2540] hover:bg-[#FBF7F0] hover:text-[#BA7517] border-b border-[#F0F0F0] transition">AE Login</Link>
                  <Link href="/carrier/login" role="menuitem" className="block px-5 py-3.5 text-sm font-medium text-[#0A2540] hover:bg-[#FBF7F0] hover:text-[#BA7517] border-b border-[#F0F0F0] transition">Carrier Login</Link>
                  <Link href="/shipper/login" role="menuitem" className="block px-5 py-3.5 text-sm font-medium text-[#0A2540] hover:bg-[#FBF7F0] hover:text-[#BA7517] transition">Shipper Login</Link>
                </div>
              )}
            </div>
          </div>

          {/* Mobile hamburger */}
          <button
            type="button"
            className="md:hidden flex flex-col gap-[5px] p-1 z-50"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
          >
            <span className={cn("block w-6 h-0.5 bg-[#FBF7F0] rounded transition", mobileOpen && "rotate-45 translate-y-[7px]")} />
            <span className={cn("block w-6 h-0.5 bg-[#FBF7F0] rounded transition", mobileOpen && "opacity-0")} />
            <span className={cn("block w-6 h-0.5 bg-[#FBF7F0] rounded transition", mobileOpen && "-rotate-45 -translate-y-[7px]")} />
          </button>
        </div>
      </nav>

      {/* Mobile menu — full-screen overlay */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 top-[72px] bg-[#0A2540] z-40 px-6 py-8 space-y-1 overflow-y-auto">
          <Link href="/shippers.html" onClick={() => setMobileOpen(false)} className="block px-4 py-3 text-base text-[#FBF7F0] hover:bg-white/5 rounded transition">Shippers</Link>
          <Link href="/carriers.html" onClick={() => setMobileOpen(false)} className="block px-4 py-3 text-base text-[#DAC39C] hover:bg-white/5 rounded transition">Carriers</Link>
          <Link href="/about.html" onClick={() => setMobileOpen(false)} className="block px-4 py-3 text-base text-[#FBF7F0] hover:bg-white/5 rounded transition">About</Link>
          <Link href="/contact.html" onClick={() => setMobileOpen(false)} className="block px-4 py-3 text-base text-[#FBF7F0] hover:bg-white/5 rounded transition">Contact</Link>
          <Link href="/track" onClick={() => setMobileOpen(false)} className="block px-4 py-3 text-base text-[#FBF7F0] hover:bg-white/5 rounded transition">Track</Link>
          <div className="pt-4 mt-4 border-t border-white/10">
            <p className="px-4 text-[10px] uppercase tracking-[0.18em] text-[#C9D2DE] mb-2">Sign In</p>
            <Link href="/auth/login" onClick={() => setMobileOpen(false)} className="block px-4 py-3 text-base text-[#FBF7F0] hover:bg-white/5 rounded transition">AE Login</Link>
            <Link href="/carrier/login" onClick={() => setMobileOpen(false)} className="block px-4 py-3 text-base text-[#FBF7F0] hover:bg-white/5 rounded transition">Carrier Login</Link>
            <Link href="/shipper/login" onClick={() => setMobileOpen(false)} className="block px-4 py-3 text-base text-[#FBF7F0] hover:bg-white/5 rounded transition">Shipper Login</Link>
          </div>
        </div>
      )}
    </>
  );
}

const equipmentOptions = ["Dry Van", "Reefer", "Flatbed", "Step Deck", "Tanker", "Intermodal", "Power Only", "Box Truck"];
const regionOptions = ["Great Lakes", "Upper Midwest", "Southeast", "Northeast", "South Central", "West", "Eastern Canada", "Western Canada", "Central Canada", "Cross-Border"];

interface FmcsaResult {
  verified: boolean;
  legalName: string | null;
  dbaName: string | null;
  mcNumber: string | null;
  dotNumber: string | null;
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

interface InsuranceLineData {
  provider: string;
  policy: string;
  amount: string;
  expiry: string;
}

interface CarrierFormData {
  firstName: string; lastName: string; email: string; password: string;
  company: string; phone: string; mcNumber: string; dotNumber: string;
  address: string; city: string; state: string; zip: string; unit: string;
  numberOfTrucks: string; ein: string;
  equipmentTypes: string[]; operatingRegions: string[];
  agreeTerms: boolean;
  // Extended insurance fields
  autoLiability: InsuranceLineData;
  cargoInsurance: InsuranceLineData;
  generalLiability: InsuranceLineData;
  workersComp: InsuranceLineData;
  additionalInsuredSRL: boolean;
  waiverOfSubrogation: boolean;
  thirtyDayCancellationNotice: boolean;
  // Insurance agent contact
  insuranceAgentName: string;
  insuranceAgentEmail: string;
  insuranceAgentPhone: string;
  insuranceAgencyName: string;
}

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showUnit, setShowUnit] = useState(false);
  const emptyInsLine: InsuranceLineData = { provider: "", policy: "", amount: "", expiry: "" };
  const [form, setForm] = useState<CarrierFormData>({
    firstName: "", lastName: "", email: "", password: "",
    company: "", phone: "", mcNumber: "", dotNumber: "",
    address: "", city: "", state: "", zip: "", unit: "",
    numberOfTrucks: "", ein: "",
    equipmentTypes: [], operatingRegions: [],
    agreeTerms: false,
    autoLiability: { ...emptyInsLine },
    cargoInsurance: { ...emptyInsLine },
    generalLiability: { ...emptyInsLine },
    workersComp: { ...emptyInsLine },
    additionalInsuredSRL: false,
    waiverOfSubrogation: false,
    thirtyDayCancellationNotice: false,
    insuranceAgentName: "",
    insuranceAgentEmail: "",
    insuranceAgentPhone: "",
    insuranceAgencyName: "",
  });

  const [fmcsaResult, setFmcsaResult] = useState<FmcsaResult | null>(null);
  const [fmcsaLoading, setFmcsaLoading] = useState(false);
  const fmcsaTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-fill form fields from FMCSA data
  const applyFmcsaData = useCallback((data: FmcsaResult) => {
    setFmcsaResult(data);
    if (data.legalName) set("company", data.legalName);
    if (data.mcNumber) set("mcNumber", data.mcNumber);
    if (data.dotNumber) set("dotNumber", data.dotNumber);
    if (data.totalPowerUnits) set("numberOfTrucks", String(data.totalPowerUnits));
    if (data.phyStreet) set("address", data.phyStreet);
    if (data.phyCity) set("city", data.phyCity);
    if (data.phyState) set("state", data.phyState);
    if (data.phyZipcode) set("zip", data.phyZipcode);
    if (data.phone) set("phone", data.phone);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Debounced FMCSA auto-lookup when DOT# is 5+ digits
  const lookupFmcsa = useCallback((dot: string) => {
    if (fmcsaTimer.current) clearTimeout(fmcsaTimer.current);
    setFmcsaResult(null);
    if (!dot || dot.length < 5 || !/^\d+$/.test(dot)) return;
    setFmcsaLoading(true);
    fmcsaTimer.current = setTimeout(async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!apiUrl) { setFmcsaLoading(false); return; }
        const res = await fetch(`${apiUrl}/carrier/fmcsa-lookup/${dot}`);
        if (res.ok) {
          const data = await res.json();
          applyFmcsaData(data);
        }
      } catch { /* silently fail — user can still proceed */ }
      setFmcsaLoading(false);
    }, 300);
  }, [applyFmcsaData]);

  // Debounced FMCSA reverse lookup when MC# is entered
  const lookupByMc = useCallback((mc: string) => {
    if (fmcsaTimer.current) clearTimeout(fmcsaTimer.current);
    const mcNum = mc.replace(/^MC-?/i, "").trim();
    if (!mcNum || mcNum.length < 3 || !/^\d+$/.test(mcNum)) return;
    // Don't lookup if DOT is already filled and verified
    if (fmcsaResult?.verified) return;
    setFmcsaLoading(true);
    fmcsaTimer.current = setTimeout(async () => {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        if (!apiUrl) { setFmcsaLoading(false); return; }
        const res = await fetch(`${apiUrl}/carrier/fmcsa-mc-lookup/${mcNum}`);
        if (res.ok) {
          const data = await res.json();
          if (data.verified || data.legalName) {
            applyFmcsaData(data);
          }
        }
      } catch { /* silently fail */ }
      setFmcsaLoading(false);
    }, 400);
  }, [applyFmcsaData, fmcsaResult?.verified]);

  const set = (field: keyof CarrierFormData, value: unknown) => setForm((p) => ({ ...p, [field]: value }));
  const toggleArray = (field: "equipmentTypes" | "operatingRegions", val: string) => {
    const arr = form[field];
    set(field, arr.includes(val) ? arr.filter((v) => v !== val) : [...arr, val]);
  };

  const canNext = () => {
    if (step === 0) return form.firstName && form.lastName && form.email && form.password.length >= 8 && form.company && form.phone.length >= 10 && form.mcNumber.trim() && form.dotNumber.length >= 5 && /^\d+$/.test(form.dotNumber) && form.address && form.city && form.state && form.zip;
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

      const { agreeTerms: _, unit: _u,
        autoLiability, cargoInsurance, generalLiability, workersComp,
        additionalInsuredSRL, waiverOfSubrogation, thirtyDayCancellationNotice,
        numberOfTrucks: numTrucksStr,
        ...regData } = form;
      const insurancePayload: Record<string, unknown> = {};
      if (autoLiability.provider) insurancePayload.autoLiabilityProvider = autoLiability.provider;
      if (autoLiability.amount) insurancePayload.autoLiabilityAmount = parseFloat(autoLiability.amount);
      if (autoLiability.policy) insurancePayload.autoLiabilityPolicy = autoLiability.policy;
      if (autoLiability.expiry) insurancePayload.autoLiabilityExpiry = autoLiability.expiry;
      if (cargoInsurance.provider) insurancePayload.cargoInsuranceProvider = cargoInsurance.provider;
      if (cargoInsurance.amount) insurancePayload.cargoInsuranceAmount = parseFloat(cargoInsurance.amount);
      if (cargoInsurance.policy) insurancePayload.cargoInsurancePolicy = cargoInsurance.policy;
      if (cargoInsurance.expiry) insurancePayload.cargoInsuranceExpiry = cargoInsurance.expiry;
      if (generalLiability.provider) insurancePayload.generalLiabilityProvider = generalLiability.provider;
      if (generalLiability.amount) insurancePayload.generalLiabilityAmount = parseFloat(generalLiability.amount);
      if (generalLiability.policy) insurancePayload.generalLiabilityPolicy = generalLiability.policy;
      if (generalLiability.expiry) insurancePayload.generalLiabilityExpiry = generalLiability.expiry;
      if (workersComp.provider) insurancePayload.workersCompProvider = workersComp.provider;
      if (workersComp.amount) insurancePayload.workersCompAmount = parseFloat(workersComp.amount);
      if (workersComp.policy) insurancePayload.workersCompPolicy = workersComp.policy;
      if (workersComp.expiry) insurancePayload.workersCompExpiry = workersComp.expiry;
      insurancePayload.additionalInsuredSRL = additionalInsuredSRL;
      insurancePayload.waiverOfSubrogation = waiverOfSubrogation;
      insurancePayload.thirtyDayCancellationNotice = thirtyDayCancellationNotice;
      if (form.insuranceAgentName) insurancePayload.insuranceAgentName = form.insuranceAgentName;
      if (form.insuranceAgentEmail) insurancePayload.insuranceAgentEmail = form.insuranceAgentEmail;
      if (form.insuranceAgentPhone) insurancePayload.insuranceAgentPhone = form.insuranceAgentPhone;
      if (form.insuranceAgencyName) insurancePayload.insuranceAgencyName = form.insuranceAgencyName;
      const res = await fetch(`${apiUrl}/carrier/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...regData,
          ...insurancePayload,
          ...(numTrucksStr ? { numberOfTrucks: parseInt(numTrucksStr) } : {}),
        }),
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
      <div className="min-h-screen bg-[#FBF7F0]">
        {/* v3.8.ain Path 2C — Canonical chrome on success screen. */}
        <OnboardingNav />

        <div className="max-w-2xl mx-auto px-6 py-12">
          {/* Success Header */}
          <div className="bg-white rounded-2xl shadow-sm border p-8 text-center mb-6">
            <div className="w-20 h-20 bg-green-50 rounded-full flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-10 h-10 text-green-700" />
            </div>
            <h2 className="text-2xl font-bold mb-2">Application Submitted Successfully</h2>
            <p className="text-slate-500 text-sm">
              A confirmation email has been sent to <strong className="text-slate-700">{form.email}</strong>
            </p>
          </div>

          {/* Application Summary */}
          <div className="bg-white rounded-2xl shadow-sm border p-8 mb-6">
            <h3 className="text-lg font-bold mb-4">Application Summary</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-slate-700 text-xs uppercase tracking-wide mb-1">Company</p>
                <p className="font-medium">{form.company}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-slate-700 text-xs uppercase tracking-wide mb-1">Contact</p>
                <p className="font-medium">{form.firstName} {form.lastName}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-slate-700 text-xs uppercase tracking-wide mb-1">DOT Number</p>
                <p className="font-medium">{form.dotNumber}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-slate-700 text-xs uppercase tracking-wide mb-1">MC Number</p>
                <p className="font-medium">{form.mcNumber || "—"}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-slate-700 text-xs uppercase tracking-wide mb-1">Equipment</p>
                <p className="font-medium">{form.equipmentTypes.join(", ")}</p>
              </div>
              <div className="p-3 bg-slate-50 rounded-lg">
                <p className="text-slate-700 text-xs uppercase tracking-wide mb-1">Regions</p>
                <p className="font-medium">{form.operatingRegions.join(", ")}</p>
              </div>
            </div>
            {fmcsaResult?.verified && (
              <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-sm">
                <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0" />
                <span className="text-green-800">FMCSA Authority Verified — {fmcsaResult.operatingStatus}</span>
              </div>
            )}
          </div>

          {/* What Happens Next */}
          <div className="bg-white rounded-2xl shadow-sm border p-8 mb-6">
            <h3 className="text-lg font-bold mb-5">What Happens Next</h3>
            <div className="space-y-5">
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-green-700 text-[#FBF7F0] rounded-full flex items-center justify-center text-sm font-bold shrink-0">1</div>
                <div>
                  <p className="font-semibold text-sm">Compass Engine Verification</p>
                  <p className="text-slate-500 text-sm">The Compass Engine is already running its 35-point check against your FMCSA authority, insurance amounts, safety record, authority age, and OFAC status.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-gold/20 text-gold rounded-full flex items-center justify-center text-sm font-bold shrink-0">2</div>
                <div>
                  <p className="font-semibold text-sm">Team Review</p>
                  <p className="text-slate-500 text-sm">A carrier relations specialist will review your application. We may reach out for additional documentation.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-8 h-8 bg-slate-200 text-slate-500 rounded-full flex items-center justify-center text-sm font-bold shrink-0">3</div>
                <div>
                  <p className="font-semibold text-sm">Approval &amp; Portal Access</p>
                  <p className="text-slate-500 text-sm">Once approved, you&#39;ll receive login credentials and can start browsing available loads immediately.</p>
                </div>
              </div>
            </div>
            <div className="mt-6 p-4 bg-amber-50 border border-amber-200 rounded-lg text-sm">
              <p className="text-amber-800"><strong>Typical review time:</strong> most carriers cleared within a few business days. Authority age, insurance verification, and document review drive the timeline.</p>
            </div>
          </div>

          {/* Actions — canonical CTA register (gold-dark Call + ghost Email). */}
          <div className="bg-white border-t-2 border-[#BA7517] rounded-2xl shadow-sm border-l border-r border-b border-[#EFE6D3] p-8 text-center">
            <p className="text-[#3A4A5F] text-sm mb-5">Questions about your application?</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a href="tel:+12692206760" className="px-6 py-3 bg-[#BA7517] text-[#FBF7F0] font-semibold rounded-md hover:bg-[#C5A572] transition text-sm shadow-sm">
                Call (269) 220-6760
              </a>
              <a href="mailto:operations@silkroutelogistics.ai" className="px-6 py-3 border border-[#EFE6D3] text-[#0A2540] font-medium rounded-md hover:bg-[#FBF7F0] hover:border-[#C5A572] transition text-sm">
                Email Operations Team
              </a>
            </div>
            <div className="mt-5 pt-5 border-t border-[#EFE6D3]">
              <Link href="/" className="text-[#BA7517] text-sm font-medium hover:underline">
                Return to Homepage
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FBF7F0]">
      {/* v3.8.ain Path 2C — Canonical chrome parity (replaces the custom
          single-link nav from v3.8.ail). Now matches /, /carriers,
          /shippers, /about, /contact, /track. */}
      <OnboardingNav />

      {/* v3.8.ain Path 2C — Carrier Registration eyebrow header.
          Surfaces the page-context cue ("you are inside the carrier
          onboarding flow") that the old custom-nav subtitle carried,
          but now sits BELOW the canonical chrome instead of inside
          it. Cream-tinted strip with gold-dark eyebrow + Playfair
          italic micro-title, paralleling Card A on Step 0. */}
      {/* v3.8.ait — eyebrow strip Sign In affordance removed.
          The canonical nav above already provides Sign In via the
          gold-dark CTA dropdown (AE/Carrier/Shipper). The eyebrow
          strip's "Already registered? Sign In" link was a second
          Sign In affordance in a different visual register (plain
          underlined text vs the canonical CTA button), creating
          visual inconsistency. Removed entirely; the eyebrow strip
          now carries only the page-context cue (program eyebrow +
          Carrier Registration H1). */}
      <div className="bg-[#F5EEE0] border-b border-[#EFE6D3]">
        <div className="max-w-3xl mx-auto px-6 py-5">
          <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#BA7517] mb-1">Caravan Partner Program</p>
          <h1 className="font-serif italic font-semibold text-xl sm:text-2xl text-[#0A2540] leading-tight">Carrier Registration</h1>
        </div>
      </div>

      {/* Progress — brass-accented step indicator. Filled green check
          rings on completed steps, gold-dark on active, cream-2 hairline
          ring on pending. Connector dashes use --gold tint for visual
          continuity with the Caravan Journey animation on /carriers. */}
      <div className="max-w-3xl mx-auto px-6 pt-8">
        <div className="flex items-center justify-between mb-8">
          {steps.map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1 last:flex-initial">
              <div className="flex items-center gap-2 shrink-0">
                <div className={cn(
                  "w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition border-2 shrink-0",
                  i < step
                    ? "bg-[#2F7A4F] text-[#FBF7F0] border-[#2F7A4F]"
                    : i === step
                    ? "bg-[#BA7517] text-[#FBF7F0] border-[#BA7517] shadow-[0_0_0_4px_rgba(186,117,23,0.12)]"
                    : "bg-white text-[#A7AEB8] border-[#EFE6D3]"
                )}>
                  {i < step ? <Check className="w-4 h-4" /> : i + 1}
                </div>
                <span className={cn(
                  "hidden sm:inline text-xs font-medium tracking-wide whitespace-nowrap",
                  i === step ? "text-[#0A2540]" : i < step ? "text-[#3A4A5F]" : "text-[#A7AEB8]"
                )}>{s}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={cn(
                  "flex-1 h-px mx-2 transition",
                  i < step ? "bg-[#2F7A4F]/40" : "bg-[#EFE6D3]"
                )} />
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-6 pb-12">
        {/* v3.8.aip — Step 0 entry surface. Card A (Welcome) + Card B
            (What you'll need) + a single "Full Caravan Partner Program
            details →" link to /carriers. Prior v3.8.ain rendering also
            carried a navy panel surfacing the tier economics + an
            advancement paragraph + a Compass Engine vetting paragraph
            — all stripped here. The page is now an apply-and-submit
            surface; program details live on /carriers (the canonical
            Caravan Partner Program marketing page). */}
        {step === 0 && (
          <>
            {/* Card A — Welcome (cream-2 #F5EEE0 + gold-dark top hairline) */}
            <div className="bg-[#F5EEE0] border-t-2 border-[#BA7517] rounded-2xl shadow-sm border-l border-r border-b border-[#EFE6D3] p-6 mb-5">
              <p className="text-xs uppercase tracking-[0.2em] font-semibold text-[#BA7517] mb-2">Caravan Partner Program</p>
              <h2 className="font-serif italic font-semibold text-2xl text-[#0A2540] mb-3">Welcome to the Caravan.</h2>
              <p className="text-sm text-[#3A4A5F] leading-relaxed">
                Apply to join Silk Route Logistics as a Caravan Partner. Complete the five steps below to submit your application.
              </p>
            </div>

            {/* Card B — What you'll need (white) */}
            <div className="bg-white rounded-2xl shadow-sm border p-6 mb-5">
              <h3 className="text-lg font-semibold text-[#0A2540] mb-4">What you&apos;ll need</h3>
              <div className="grid sm:grid-cols-2 gap-x-6 gap-y-3 mb-4">
                {[
                  "DOT# or MC# (auto-populates the rest from FMCSA)",
                  "Insurance: Auto Liability $1M+ / Cargo $100K+ / GL $1M+",
                  "W-9 form (PDF/JPEG/PNG, max 10MB each)",
                  "Active FMCSA Authority (MC/DOT, 18+ months of operating history)",
                  "Voided check (for Quick Pay direct deposit setup)",
                ].map((item, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-[#2F7A4F] mt-0.5 shrink-0" />
                    <span className="text-sm text-[#3A4A5F]">{item}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[#6B7685] italic">
                Most company-info fields auto-populate from FMCSA when you enter your DOT number. The other documents upload on Step 3.
              </p>
            </div>

            {/* v3.8.aip — Single replacement for the retired navy panel.
                Program details (pay terms, advancement criteria, Compass
                Score formula, milestone framework) live on /carriers, the
                canonical Caravan Partner Program marketing page. Styled
                to match the cream-tinted eyebrow strip register elsewhere
                on this page (gold-dark eyebrow link, underline accent). */}
            <div className="mb-5">
              {/* v3.8.air — anchor specifically to #caravan (the Caravan
                  Partner Program section on /carriers.html with the
                  three tier cards), not the page top. The bare
                  /carriers.html link in v3.8.aip dropped the carrier
                  near "Where Carriers Come First" header — they had
                  to scroll past the hero + commitments + Compass
                  Score formula to reach the tier system. The fragment
                  anchor lands them on the actual program details. */}
              <a
                href="/carriers.html#caravan"
                className="inline-flex items-center gap-2 text-sm font-semibold text-[#BA7517] hover:text-[#C5A572] transition group"
              >
                <span className="text-[10px] uppercase tracking-[0.22em] font-semibold">Caravan Partner Program</span>
                <span aria-hidden="true" className="text-[#C5A572]">·</span>
                <span className="underline decoration-[#C5A572]/40 underline-offset-2 group-hover:decoration-[#C5A572]">Full program details →</span>
              </a>
            </div>
          </>
        )}

        {/* v3.8.ain Path 2C — Form panel with gold-dark top accent
            matching the Caravan Partner Program / commitment-card-flip
            register on /carriers. */}
        <div className="bg-white border-t-2 border-[#BA7517] rounded-2xl shadow-sm border-l border-r border-b border-[#EFE6D3] p-8">
          {error && <div className="mb-6 p-4 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-lg text-sm">{error}</div>}

          {/* Step 0: Company Info */}
          {step === 0 && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-[#EFE6D3]">
                <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#BA7517] mb-1.5">Step 1 of 5</p>
                <h2 className="font-serif italic font-semibold text-2xl text-[#0A2540] mb-2">Company Information</h2>
                <p className="text-sm text-[#3A4A5F] leading-relaxed">Enter your DOT or MC number to auto-populate your company details from FMCSA.</p>
              </div>

              {/* v3.8.ait — DOT + MC only at the top (2-col). # of Trucks
                  moved to Step 2 (Equipment & Regions); Phone * moved
                  to the bottom contact block alongside Email. Both
                  fields trigger FMCSA auto-lookup that bidirectionally
                  populates the other — keeping them as 2 distinct
                  inputs (rather than a dropdown) preserves the
                  bidirectional fill UX. */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#0A2540] mb-1">DOT Number *</label>
                  <input value={form.dotNumber} onChange={(e) => { const v = e.target.value.replace(/\D/g, ""); set("dotNumber", v); lookupFmcsa(v); }} className={cn("w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none", form.dotNumber && form.dotNumber.length < 5 ? "border-red-300" : fmcsaResult?.verified ? "border-green-400" : fmcsaResult && !fmcsaResult.verified ? "border-red-400" : "")} placeholder="e.g. 1234567" />
                  {form.dotNumber && form.dotNumber.length < 5 && (
                    <p className="text-xs text-red-500 mt-1">DOT number must be at least 5 digits</p>
                  )}
                  {fmcsaLoading && <p className="text-xs text-slate-500 mt-1 animate-pulse">Verifying with FMCSA...</p>}
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0A2540] mb-1">MC Number *</label>
                  <input value={form.mcNumber} onChange={(e) => { set("mcNumber", e.target.value); lookupByMc(e.target.value); }} className={cn("w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none", fmcsaResult?.verified && form.mcNumber ? "border-green-400" : "")} placeholder="MC-156588" />
                </div>
                {/* v3.8.air — EIN input removed (W-9 PDF is the canonical
                    Federal Tax ID source). Form-state field `ein` retained
                    as empty default for backend payload compatibility. */}
              </div>

              {/* FMCSA Verification Result — shown immediately after DOT/MC */}
              {fmcsaResult && (
                <div className={cn("p-4 rounded-lg border text-sm", fmcsaResult.verified ? "bg-green-50 border-green-200" : "bg-red-50 border-red-200")}>
                  <div className="flex items-center gap-2 mb-2">
                    {fmcsaResult.verified ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-red-500 flex items-center justify-center text-[#FBF7F0] text-xs font-bold">!</div>
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
                <p className="text-xs text-slate-700 mb-4">{fmcsaResult?.verified ? "Fields below have been auto-populated from FMCSA. You may edit if needed." : "Fill in your company details below."}</p>
              </div>

              {/* Company details — auto-populated from FMCSA */}
              <div>
                <label className="block text-sm font-medium text-[#0A2540] mb-1">Company Name *</label>
                <input value={form.company} onChange={(e) => set("company", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0A2540] mb-1">Address</label>
                <AddressAutocomplete
                  value={form.address}
                  onChange={(v) => set("address", v)}
                  onSelect={(addr) => {
                    set("address", addr.street);
                    set("city", addr.city);
                    set("state", addr.state);
                    set("zip", addr.zip);
                    if (addr.unit) { set("unit", addr.unit); setShowUnit(true); }
                  }}
                  placeholder="Start typing an address..."
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none"
                />
                {(showUnit || form.unit) ? (
                  <div className="mt-2">
                    <label className="block text-xs font-medium text-slate-500 mb-1">Unit / Suite #</label>
                    <input
                      value={form.unit}
                      onChange={(e) => set("unit", e.target.value)}
                      placeholder="e.g. Suite 200, Unit 4B, Apt 12"
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none placeholder:text-gray-400"
                    />
                  </div>
                ) : (
                  <button type="button" onClick={() => setShowUnit(true)}
                    className="mt-1.5 text-xs text-amber-600 hover:text-amber-500 font-medium">
                    + Add Unit / Suite #
                  </button>
                )}
              </div>
              <div className="grid sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#0A2540] mb-1">City</label>
                  <input value={form.city} onChange={(e) => set("city", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0A2540] mb-1">State / Province</label>
                  <input value={form.state} onChange={(e) => set("state", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" placeholder="ON / IL / etc." />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0A2540] mb-1">ZIP / Postal Code</label>
                  <input value={form.zip} onChange={(e) => set("zip", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
                </div>
              </div>

              {/* Personal / account info */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#0A2540] mb-1">First Name *</label>
                  <input value={form.firstName} onChange={(e) => set("firstName", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0A2540] mb-1">Last Name *</label>
                  <input value={form.lastName} onChange={(e) => set("lastName", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
                </div>
              </div>
              {/* v3.8.ait — Email + Phone paired as contact details
                  (phone moved from the Step 1 top grid per directive). */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-[#0A2540] mb-1">Email *</label>
                  <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-[#0A2540] mb-1">Phone *</label>
                  <input type="tel" value={form.phone} onChange={(e) => set("phone", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" placeholder="(555) 123-4567" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-[#0A2540] mb-1">Password * (min 8 chars)</label>
                <input type="password" value={form.password} onChange={(e) => set("password", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" />
              </div>
            </div>
          )}

          {/* Step 1: Equipment & Regions */}
          {step === 1 && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-[#EFE6D3]">
                <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#BA7517] mb-1.5">Step 2 of 5</p>
                <h2 className="font-serif italic font-semibold text-2xl text-[#0A2540] mb-2">Equipment &amp; Operating Regions</h2>
                <p className="text-sm text-[#3A4A5F] leading-relaxed">Tell us your fleet size, what you haul, and where you run. The Compass Engine uses all three to match lanes.</p>
              </div>
              {/* v3.8.ait — # of Trucks moved here from Step 1 top grid.
                  Fleet size is fleet info; it belongs in the equipment
                  section, not in company identity. */}
              <div className="max-w-xs">
                <label className="block text-sm font-semibold text-[#0A2540] mb-1.5">Fleet Size <span className="text-[#6B7685] font-normal">(# of Trucks)</span></label>
                <input type="number" value={form.numberOfTrucks} onChange={(e) => set("numberOfTrucks", e.target.value)} className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-gold outline-none" placeholder="e.g. 5" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#0A2540] mb-3">Equipment Types <span className="text-[#BA7517]">*</span></label>
                <div className="flex flex-wrap gap-2">
                  {equipmentOptions.map((eq) => (
                    <button key={eq} type="button" onClick={() => toggleArray("equipmentTypes", eq)}
                      className={cn("px-4 py-2.5 rounded-lg text-sm border transition font-medium",
                        form.equipmentTypes.includes(eq)
                          ? "bg-[#FAEEDA] border-[#BA7517] text-[#BA7517]"
                          : "bg-white border-[#EFE6D3] text-[#3A4A5F] hover:border-[#C5A572] hover:bg-[#FBF7F0]"
                      )}>{eq}</button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[#0A2540] mb-3">Operating Regions <span className="text-[#BA7517]">*</span> <span className="text-[#6B7685] font-normal">(US &amp; Canada)</span></label>
                <div className="flex flex-wrap gap-2">
                  {regionOptions.map((r) => (
                    <button key={r} type="button" onClick={() => toggleArray("operatingRegions", r)}
                      className={cn("px-4 py-2.5 rounded-lg text-sm border transition font-medium",
                        form.operatingRegions.includes(r)
                          ? "bg-[#FAEEDA] border-[#BA7517] text-[#BA7517]"
                          : "bg-white border-[#EFE6D3] text-[#3A4A5F] hover:border-[#C5A572] hover:bg-[#FBF7F0]"
                      )}>{r}</button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Step 2: Documents & Insurance */}
          {step === 2 && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-[#EFE6D3]">
                <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#BA7517] mb-1.5">Step 3 of 5</p>
                <h2 className="font-serif italic font-semibold text-2xl text-[#0A2540] mb-2">Insurance &amp; Documents</h2>
                <p className="text-sm text-[#3A4A5F] leading-relaxed">Coverage minimums: Auto Liability $1M, Motor Cargo $100K, General Liability $1M. Workers&apos; Comp as required by law.</p>
              </div>

              {/* Insurance Information Section */}
              <div className="p-6 rounded-xl border border-[#EFE6D3] bg-[#FBF7F0]">
                <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#BA7517] mb-4">Insurance Information</p>

                {/* Auto Liability */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-slate-700">Auto Liability</span>
                    <span className="text-[10px] text-slate-700">Required: $1,000,000 minimum</span>
                    {form.autoLiability.amount && parseFloat(form.autoLiability.amount) < 1000000 && (
                      <span className="text-[10px] text-red-500 font-semibold">Below minimum</span>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-4 gap-3">
                    <input placeholder="Provider Name" value={form.autoLiability.provider} onChange={(e) => setForm((p) => ({ ...p, autoLiability: { ...p.autoLiability, provider: e.target.value } }))} className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                    <input placeholder="Policy Number" value={form.autoLiability.policy} onChange={(e) => setForm((p) => ({ ...p, autoLiability: { ...p.autoLiability, policy: e.target.value } }))} className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                    <input type="number" placeholder="Coverage Amount $" value={form.autoLiability.amount} onChange={(e) => setForm((p) => ({ ...p, autoLiability: { ...p.autoLiability, amount: e.target.value } }))} className={cn("px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none", form.autoLiability.amount && parseFloat(form.autoLiability.amount) < 1000000 ? "border-red-300 bg-red-50" : "")} />
                    <input type="date" value={form.autoLiability.expiry} onChange={(e) => setForm((p) => ({ ...p, autoLiability: { ...p.autoLiability, expiry: e.target.value } }))} className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                  </div>
                </div>

                {/* Motor Cargo Insurance */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-slate-700">Motor Cargo Insurance</span>
                    <span className="text-[10px] text-slate-700">Required: $100,000 minimum</span>
                    {form.cargoInsurance.amount && parseFloat(form.cargoInsurance.amount) < 100000 && (
                      <span className="text-[10px] text-red-500 font-semibold">Below minimum</span>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-4 gap-3">
                    <input placeholder="Provider Name" value={form.cargoInsurance.provider} onChange={(e) => setForm((p) => ({ ...p, cargoInsurance: { ...p.cargoInsurance, provider: e.target.value } }))} className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                    <input placeholder="Policy Number" value={form.cargoInsurance.policy} onChange={(e) => setForm((p) => ({ ...p, cargoInsurance: { ...p.cargoInsurance, policy: e.target.value } }))} className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                    <input type="number" placeholder="Coverage Amount $" value={form.cargoInsurance.amount} onChange={(e) => setForm((p) => ({ ...p, cargoInsurance: { ...p.cargoInsurance, amount: e.target.value } }))} className={cn("px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none", form.cargoInsurance.amount && parseFloat(form.cargoInsurance.amount) < 100000 ? "border-red-300 bg-red-50" : "")} />
                    <input type="date" value={form.cargoInsurance.expiry} onChange={(e) => setForm((p) => ({ ...p, cargoInsurance: { ...p.cargoInsurance, expiry: e.target.value } }))} className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                  </div>
                </div>

                {/* General Liability */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-slate-700">General Liability</span>
                    <span className="text-[10px] text-slate-700">Required: $1,000,000 minimum</span>
                    {form.generalLiability.amount && parseFloat(form.generalLiability.amount) < 1000000 && (
                      <span className="text-[10px] text-red-500 font-semibold">Below minimum</span>
                    )}
                  </div>
                  <div className="grid sm:grid-cols-4 gap-3">
                    <input placeholder="Provider Name" value={form.generalLiability.provider} onChange={(e) => setForm((p) => ({ ...p, generalLiability: { ...p.generalLiability, provider: e.target.value } }))} className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                    <input placeholder="Policy Number" value={form.generalLiability.policy} onChange={(e) => setForm((p) => ({ ...p, generalLiability: { ...p.generalLiability, policy: e.target.value } }))} className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                    <input type="number" placeholder="Coverage Amount $" value={form.generalLiability.amount} onChange={(e) => setForm((p) => ({ ...p, generalLiability: { ...p.generalLiability, amount: e.target.value } }))} className={cn("px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none", form.generalLiability.amount && parseFloat(form.generalLiability.amount) < 1000000 ? "border-red-300 bg-red-50" : "")} />
                    <input type="date" value={form.generalLiability.expiry} onChange={(e) => setForm((p) => ({ ...p, generalLiability: { ...p.generalLiability, expiry: e.target.value } }))} className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                  </div>
                </div>

                {/* Workers' Compensation */}
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-sm font-semibold text-slate-700">Workers&#39; Compensation</span>
                    <span className="text-[10px] text-slate-700">Required by law</span>
                  </div>
                  <div className="grid sm:grid-cols-4 gap-3">
                    <input placeholder="Provider Name" value={form.workersComp.provider} onChange={(e) => setForm((p) => ({ ...p, workersComp: { ...p.workersComp, provider: e.target.value } }))} className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                    <input placeholder="Policy Number" value={form.workersComp.policy} onChange={(e) => setForm((p) => ({ ...p, workersComp: { ...p.workersComp, policy: e.target.value } }))} className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                    <input type="number" placeholder="Coverage Amount $" value={form.workersComp.amount} onChange={(e) => setForm((p) => ({ ...p, workersComp: { ...p.workersComp, amount: e.target.value } }))} className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                    <input type="date" value={form.workersComp.expiry} onChange={(e) => setForm((p) => ({ ...p, workersComp: { ...p.workersComp, expiry: e.target.value } }))} className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                  </div>
                </div>

                {/* Insurance Checkboxes */}
                <div className="flex flex-wrap gap-6 pt-3 border-t border-slate-200">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.additionalInsuredSRL} onChange={(e) => set("additionalInsuredSRL", e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-gold focus:ring-gold" />
                    <span className="text-xs text-slate-700">Silk Route Logistics Inc. is listed as Additional Insured</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.waiverOfSubrogation} onChange={(e) => set("waiverOfSubrogation", e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-gold focus:ring-gold" />
                    <span className="text-xs text-slate-700">Waiver of Subrogation is included</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" checked={form.thirtyDayCancellationNotice} onChange={(e) => set("thirtyDayCancellationNotice", e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-gold focus:ring-gold" />
                    <span className="text-xs text-slate-700">30-day cancellation notice provision included</span>
                  </label>
                </div>

                {/* Insurance Agent Contact */}
                <div className="pt-4 border-t border-[#EFE6D3] mt-4">
                  <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#BA7517] mb-3">Insurance Agent Contact (for verification)</p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <input placeholder="Agent Name" value={form.insuranceAgentName} onChange={(e) => set("insuranceAgentName", e.target.value)}
                      className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                    <input placeholder="Agent Email" type="email" value={form.insuranceAgentEmail} onChange={(e) => set("insuranceAgentEmail", e.target.value)}
                      className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                    <input placeholder="Agent Phone" value={form.insuranceAgentPhone} onChange={(e) => set("insuranceAgentPhone", e.target.value)}
                      className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                    <input placeholder="Agency Name" value={form.insuranceAgencyName} onChange={(e) => set("insuranceAgencyName", e.target.value)}
                      className="px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-gold outline-none" />
                  </div>
                </div>
              </div>

              {/* Document Upload Section */}
              <div className="pt-2">
                <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#BA7517] mb-1.5">Upload Documents</p>
                <p className="text-sm text-[#3A4A5F] mb-4">PDF, JPEG, or PNG accepted (max 10MB each). Click each card to upload.</p>
              </div>
              <div className="grid gap-4">
                {[
                  { key: "w9", label: "W-9 Form", desc: "Required for tax reporting" },
                  { key: "insurance", label: "Insurance Certificate", desc: "Auto liability, cargo, and general liability" },
                  { key: "authority", label: "Authority Letter / Operating Authority", desc: "Active FMCSA authority — 18+ months of operating history required" },
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
                          <CheckCircle2 className="w-5 h-5 text-green-700 shrink-0" />
                        ) : (
                          <Upload className="w-5 h-5 text-gold shrink-0" />
                        )}
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium block">{doc.label}</span>
                          {docFile ? (
                            <span className="text-xs text-green-600 truncate block">{docFile.name} ({(docFile.size / 1024).toFixed(0)} KB)</span>
                          ) : (
                            <span className="text-xs text-slate-700 block">{doc.desc}</span>
                          )}
                        </div>
                        {docFile && (
                          <button type="button" onClick={(e) => { e.preventDefault(); setFiles(files.filter((f) => (f as any).__docType !== doc.key)); }}
                            className="p-1 hover:bg-red-50 rounded transition shrink-0">
                            <X className="w-4 h-4 text-red-700" />
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
                <Upload className="w-6 h-6 text-slate-700 mx-auto mb-2" />
                <p className="text-sm font-medium text-slate-600">Drop additional files here or click to browse</p>
                <p className="text-xs text-slate-700 mt-1">Any other supporting documents</p>
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
                      {file.type === "application/pdf" ? <FileText className="w-5 h-5 text-red-700 shrink-0" /> : <ImageIcon className="w-5 h-5 text-blue-700 shrink-0" />}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate">{file.name}</p>
                        <p className="text-xs text-slate-700">{(file.size / 1024).toFixed(0)} KB</p>
                      </div>
                      <button type="button" onClick={() => setFiles(files.filter((_, j) => j !== files.indexOf(file)))}
                        className="p-1 hover:bg-red-50 rounded transition">
                        <X className="w-4 h-4 text-red-700" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Step 3: Terms */}
          {step === 3 && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-[#EFE6D3]">
                <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#BA7517] mb-1.5">Step 4 of 5</p>
                <h2 className="font-serif italic font-semibold text-2xl text-[#0A2540] mb-2">Terms &amp; Agreement</h2>
                <p className="text-sm text-[#3A4A5F] leading-relaxed">Click-through onboarding agreement. Standalone Broker-Carrier Agreement + Caravan Quick Pay Agreement v2 supersede where executed.</p>
              </div>
              <div className="p-5 rounded-xl bg-[#FBF7F0] border border-[#EFE6D3] max-h-80 overflow-y-auto text-sm text-[#3A4A5F] leading-relaxed space-y-4">
                <p className="font-bold text-slate-800 text-base">Silk Route Logistics — Carrier Transportation Agreement</p>
                <p>This Carrier Transportation Agreement (&quot;Agreement&quot;) is entered into between Silk Route Logistics Inc. (&quot;Broker&quot;) and the undersigned motor carrier (&quot;Carrier&quot;). By completing registration, Carrier agrees to the following terms and conditions:</p>

                <p className="font-semibold text-slate-800 mt-3">1. Authority & Compliance</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Carrier shall maintain valid operating authority (MC/DOT) issued by the FMCSA at all times during the term of this Agreement.</li>
                  <li>Carrier shall comply with all applicable federal, state, provincial, and local laws, including FMCSA regulations, DOT requirements, FMCSA safety regulations (49 CFR Parts 382-399), and applicable Canadian provincial/territorial regulations.</li>
                  <li>Carrier shall maintain a &quot;Satisfactory&quot; or better safety rating with the FMCSA. If Carrier&apos;s rating is downgraded to &quot;Conditional&quot; or &quot;Unsatisfactory,&quot; Carrier shall notify Broker within 24 hours.</li>
                  <li>Carrier shall maintain valid Safety Fitness Certificate for Canadian interprovincial operations where applicable.</li>
                </ul>

                <p className="font-semibold text-slate-800 mt-3">2. Insurance Requirements</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Carrier shall maintain at minimum: (a) Commercial Auto Liability — $1,000,000 per occurrence; (b) Motor Cargo/Freight Insurance — $100,000 per occurrence; (c) General Liability — $1,000,000 per occurrence; (d) Workers&apos; Compensation — as required by applicable law.</li>
                  <li>Carrier shall name Silk Route Logistics Inc. as an additional insured and certificate holder on all policies.</li>
                  <li>Carrier shall provide certificates of insurance prior to hauling any loads and shall provide updated certificates upon renewal or policy change.</li>
                  <li>Carrier shall provide Broker with 30 days&apos; written notice prior to cancellation, non-renewal, or material modification of any insurance policy.</li>
                </ul>

                <p className="font-semibold text-slate-800 mt-3">3. Independent Contractor Relationship</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Carrier is an independent contractor and not an employee, agent, or partner of Broker. Nothing in this Agreement creates an employer-employee relationship.</li>
                  <li>Carrier retains full control over drivers, equipment, routes, and methods of transportation, subject to shipper requirements.</li>
                  <li>Carrier is solely responsible for all taxes, including self-employment tax, income tax withholding, and unemployment insurance for its employees and drivers.</li>
                </ul>

                <p className="font-semibold text-slate-800 mt-3">4. Load Acceptance & Transportation</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Carrier has the right to accept or reject any load tendered by Broker. Once accepted, Carrier is obligated to complete the transportation as agreed.</li>
                  <li>Carrier shall not double-broker, co-broker, or assign any load to a third party without prior written consent from Broker.</li>
                  <li>Carrier shall provide accurate and timely updates on load status, location, and any delays or exceptions.</li>
                  <li>Carrier shall comply with ELD mandates and GPS tracking requirements while transporting loads arranged by Broker.</li>
                </ul>

                <p className="font-semibold text-slate-800 mt-3">5. Documentation & Payment</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Carrier shall submit all required documentation, including Bill of Lading (BOL), Proof of Delivery (POD), and lumper receipts, within 24 hours of delivery.</li>
                  <li>Standard payment terms and per-load Quick Pay options are as established in the Caravan Partner Program (published at silkroutelogistics.ai/carriers), from receipt of complete and accurate documentation unless otherwise agreed in writing.</li>
                  <li>Optional per-load Quick Pay is available without requiring a factoring contract; published fees apply per the Caravan Partner Program.</li>
                  <li>Carrier shall submit a completed W-9 form prior to receiving any payment.</li>
                  <li>Rates shall be as agreed upon in each individual rate confirmation/load tender.</li>
                </ul>

                <p className="font-semibold text-slate-800 mt-3">6. Cargo Claims & Liability</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Carrier assumes full liability for loss, damage, or delay to cargo from the time of pickup to delivery, pursuant to the Carmack Amendment (49 U.S.C. § 14706) for domestic shipments.</li>
                  <li>Carrier shall notify Broker immediately upon discovery of any cargo loss, damage, shortage, or delay.</li>
                  <li>Carrier shall cooperate fully in the investigation and processing of all cargo claims.</li>
                  <li>Carrier shall indemnify and hold Broker harmless from any claims, damages, or liabilities arising from Carrier&apos;s performance or failure to perform under this Agreement.</li>
                </ul>

                <p className="font-semibold text-slate-800 mt-3">7. Caravan Partner Program & Performance Tracking</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Carrier acknowledges that Broker tracks performance metrics through the Compass Engine, including on-time pickup/delivery, communication responsiveness, claims ratio, documentation timeliness, GPS compliance, and acceptance rate.</li>
                  <li>Carrier&apos;s placement within the Caravan Partner Program is determined by the performance criteria, advancement thresholds, and program economics published at silkroutelogistics.ai/carriers, which the carrier acknowledges as the authoritative reference for program structure.</li>
                  <li>Advancement within the Caravan Partner Program is performance-based per the criteria published at silkroutelogistics.ai/carriers; thresholds are calibrated to current operating volume and may be revisited.</li>
                  <li>Broker reserves the right to modify program criteria with 30 days&apos; notice.</li>
                </ul>

                <p className="font-semibold text-slate-800 mt-3">8. Confidentiality</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Carrier shall not disclose Broker&apos;s customer information, rates, or business practices to any third party.</li>
                  <li>Carrier shall not solicit or conduct business directly with any shipper/customer introduced through Broker for a period of 12 months after the last load transported.</li>
                </ul>

                <p className="font-semibold text-slate-800 mt-3">9. Termination</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Either party may terminate this Agreement with 30 days&apos; written notice.</li>
                  <li>Broker may terminate immediately if Carrier&apos;s operating authority is revoked, insurance lapses, or Carrier breaches any material term of this Agreement.</li>
                  <li>Termination does not relieve Carrier of obligations for loads already in transit or payment obligations already incurred.</li>
                </ul>

                <p className="font-semibold text-slate-800 mt-3">10. Governing Law & Dispute Resolution</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>This Agreement shall be governed by federal transportation law (49 U.S.C. § 14101(b)) and, to the extent not preempted, the laws of the State of Michigan.</li>
                  <li>Any dispute arising under this Agreement shall first be subject to mediation. If mediation fails, disputes shall be resolved by binding arbitration with venue in Kalamazoo County, Michigan.</li>
                  <li>The prevailing party in any dispute shall be entitled to recover reasonable attorney&apos;s fees and costs.</li>
                </ul>

                <p className="font-semibold text-slate-800 mt-3">11. Data Privacy & Consent</p>
                <ul className="list-disc ml-5 space-y-1">
                  <li>Carrier consents to Broker collecting, storing, and processing Carrier&apos;s business information, FMCSA data, insurance records, and performance data for operational purposes.</li>
                  <li>Broker shall handle Carrier&apos;s data in accordance with its Privacy Policy and applicable data protection laws.</li>
                  <li>Carrier consents to automated FMCSA compliance monitoring, safety scoring, and OFAC screening.</li>
                </ul>

                <p className="text-xs text-slate-700 mt-4 italic">Last updated: May 2026. Silk Route Logistics Inc. reserves the right to update these terms with 30 days&apos; notice to registered carriers. When the standalone Broker-Carrier Agreement and Caravan Quick Pay Agreement v2 are executed between Broker and Carrier, those agreements will govern over this onboarding click-through where they conflict.</p>
              </div>
              <label className="flex items-center gap-3 cursor-pointer p-4 rounded-lg border border-[#EFE6D3] bg-white hover:bg-[#FBF7F0] transition">
                <input type="checkbox" checked={form.agreeTerms}
                  onChange={(e) => set("agreeTerms", e.target.checked)}
                  className="w-5 h-5 rounded border-[#C5A572] text-[#BA7517] focus:ring-[#BA7517]" />
                <span className="text-sm font-medium text-[#0A2540]">I agree to the Carrier Terms &amp; Conditions</span>
              </label>
            </div>
          )}

          {/* Step 4: Review */}
          {step === 4 && (
            <div className="space-y-6">
              <div className="pb-4 border-b border-[#EFE6D3]">
                <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#BA7517] mb-1.5">Step 5 of 5</p>
                <h2 className="font-serif italic font-semibold text-2xl text-[#0A2540] mb-2">Review Your Application</h2>
                <p className="text-sm text-[#3A4A5F] leading-relaxed">Confirm everything looks right before submission. The Compass Engine begins its 35-point check immediately on submit.</p>
              </div>
              <div className="grid gap-3">
                <div className="p-4 rounded-lg bg-[#FBF7F0] border border-[#EFE6D3]">
                  <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#BA7517] mb-1.5">Contact</p>
                  <p className="font-semibold text-[#0A2540]">{form.firstName} {form.lastName}</p>
                  <p className="text-sm text-[#3A4A5F]">{form.email} {form.phone && `| ${form.phone}`}</p>
                </div>
                <div className="p-4 rounded-lg bg-[#FBF7F0] border border-[#EFE6D3]">
                  <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#BA7517] mb-1.5">Company</p>
                  <p className="font-semibold text-[#0A2540]">{form.company}</p>
                  <p className="text-sm text-[#3A4A5F]">
                    {form.address && `${form.address}, `}{form.unit && `${form.unit}, `}{form.city && `${form.city}, `}{form.state} {form.zip}
                  </p>
                  <p className="text-sm text-[#3A4A5F] mt-1">
                    DOT: {form.dotNumber}{form.mcNumber && ` | MC: ${form.mcNumber}`}
                    {form.numberOfTrucks && ` | Trucks: ${form.numberOfTrucks}`}
                    {fmcsaResult?.verified && <span className="ml-2 text-[#2F7A4F] font-semibold">FMCSA Verified</span>}
                  </p>
                </div>
                <div className="p-4 rounded-lg bg-[#FBF7F0] border border-[#EFE6D3]">
                  <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#BA7517] mb-1.5">Equipment</p>
                  <p className="text-sm text-[#0A2540]">{form.equipmentTypes.join(", ")}</p>
                </div>
                <div className="p-4 rounded-lg bg-[#FBF7F0] border border-[#EFE6D3]">
                  <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#BA7517] mb-1.5">Operating Regions</p>
                  <p className="text-sm text-[#0A2540]">{form.operatingRegions.join(", ")}</p>
                </div>
                {/* Insurance Summary in Review */}
                {(form.autoLiability.provider || form.cargoInsurance.provider || form.generalLiability.provider || form.workersComp.provider) && (
                  <div className="p-4 rounded-lg bg-[#FBF7F0] border border-[#EFE6D3]">
                    <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#BA7517] mb-2">Insurance</p>
                    <div className="space-y-1 text-sm">
                      {form.autoLiability.provider && (
                        <p><span className="font-medium">Auto Liability:</span> {form.autoLiability.provider} | {form.autoLiability.policy} | ${Number(form.autoLiability.amount).toLocaleString()} | Exp: {form.autoLiability.expiry}</p>
                      )}
                      {form.cargoInsurance.provider && (
                        <p><span className="font-medium">Cargo:</span> {form.cargoInsurance.provider} | {form.cargoInsurance.policy} | ${Number(form.cargoInsurance.amount).toLocaleString()} | Exp: {form.cargoInsurance.expiry}</p>
                      )}
                      {form.generalLiability.provider && (
                        <p><span className="font-medium">General Liab:</span> {form.generalLiability.provider} | {form.generalLiability.policy} | ${Number(form.generalLiability.amount).toLocaleString()} | Exp: {form.generalLiability.expiry}</p>
                      )}
                      {form.workersComp.provider && (
                        <p><span className="font-medium">Workers Comp:</span> {form.workersComp.provider} | {form.workersComp.policy} | ${Number(form.workersComp.amount).toLocaleString()} | Exp: {form.workersComp.expiry}</p>
                      )}
                      <div className="flex flex-wrap gap-3 mt-2 text-xs text-[#3A4A5F]">
                        {form.additionalInsuredSRL && <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-[#2F7A4F]" /> Additional Insured</span>}
                        {form.waiverOfSubrogation && <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-[#2F7A4F]" /> Waiver of Subrogation</span>}
                        {form.thirtyDayCancellationNotice && <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-[#2F7A4F]" /> 30-Day Notice</span>}
                      </div>
                    </div>
                  </div>
                )}
                <div className="p-4 rounded-lg bg-[#FBF7F0] border border-[#EFE6D3]">
                  <p className="text-[10px] uppercase tracking-[0.22em] font-semibold text-[#BA7517] mb-1.5">Documents</p>
                  {files.length > 0 ? (
                    <ul className="text-sm space-y-1.5">
                      {files.map((f, i) => (
                        <li key={i} className="flex items-center gap-2 text-[#0A2540]">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#2F7A4F] shrink-0" />
                          <span>{(f as any).__docType ? `${(f as any).__docType.toUpperCase()}: ` : ""}{f.name}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="text-sm text-[#6B7685] italic">No documents uploaded yet</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Navigation — gold-dark CTA matching .nav-login-btn canonical
              and the Sign In button in OnboardingNav above. */}
          <div className="flex justify-between items-center mt-8 pt-6 border-t border-[#EFE6D3]">
            <button onClick={() => setStep(step - 1)} disabled={step === 0}
              className="flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium text-[#3A4A5F] hover:text-[#0A2540] hover:bg-[#FBF7F0] rounded-lg disabled:opacity-30 disabled:hover:bg-transparent transition">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
            {step < 4 ? (
              <button onClick={() => setStep(step + 1)} disabled={!canNext()}
                className="flex items-center gap-1.5 px-6 py-2.5 bg-[#BA7517] text-[#FBF7F0] font-semibold text-sm rounded-md hover:bg-[#C5A572] disabled:opacity-40 disabled:hover:bg-[#BA7517] transition shadow-sm">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={submitting}
                className="px-8 py-2.5 bg-[#BA7517] text-[#FBF7F0] font-semibold text-sm rounded-md hover:bg-[#C5A572] disabled:opacity-50 disabled:hover:bg-[#BA7517] transition shadow-sm">
                {submitting ? "Submitting..." : "Submit Application"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Google Places AddressAutocomplete (AutocompleteService pattern) ── */
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

interface ParsedAddr { street: string; city: string; state: string; zip: string; unit?: string; }

function AddressAutocomplete({ value, onChange, onSelect, placeholder, className }: {
  value: string; onChange: (v: string) => void; onSelect: (a: ParsedAddr) => void;
  placeholder?: string; className?: string;
}) {
  const [query, setQuery] = useState(value || "");
  const [results, setResults] = useState<{ description: string; placeId: string }[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const autocompleteRef = useRef<any>(null); // eslint-disable-line
  const placesRef = useRef<any>(null); // eslint-disable-line

  useEffect(() => {
    loadGoogleMaps().then(() => {
      if ((window as any).google?.maps?.places) {
        autocompleteRef.current = new (window as any).google.maps.places.AutocompleteService();
        placesRef.current = new (window as any).google.maps.places.PlacesService(document.createElement("div"));
      }
    });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowDropdown(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => { if (!value) setQuery(""); }, [value]);

  const search = useCallback((q: string) => {
    if (q.length < 3 || !autocompleteRef.current) { setResults([]); return; }
    setLoading(true);
    autocompleteRef.current.getPlacePredictions(
      { input: q, componentRestrictions: { country: ["us", "ca", "mx"] }, types: ["address"] },
      (predictions: any[] | null, status: string) => { // eslint-disable-line
        if (status === "OK" && predictions) {
          setResults(predictions.slice(0, 5).map((p: any) => ({ description: p.description, placeId: p.place_id }))); // eslint-disable-line
          setShowDropdown(true);
        } else { setResults([]); }
        setLoading(false);
      }
    );
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    onChange(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (item: { description: string; placeId: string }) => {
    setShowDropdown(false);
    setQuery(item.description);
    if (!placesRef.current) return;
    placesRef.current.getDetails(
      { placeId: item.placeId, fields: ["address_components", "formatted_address"] },
      (place: any, status: string) => { // eslint-disable-line
        if (status !== "OK" || !place?.address_components) return;
        let streetNumber = "", route = "", city = "", state = "", zip = "", unit = "";
        for (const c of place.address_components) {
          const t: string[] = c.types;
          if (t.includes("street_number")) streetNumber = c.long_name;
          if (t.includes("route")) route = c.long_name;
          if (t.includes("locality")) city = c.long_name;
          if (t.includes("sublocality_level_1") && !city) city = c.long_name;
          if (t.includes("administrative_area_level_1")) state = c.short_name;
          if (t.includes("postal_code")) zip = c.short_name;
          if (t.includes("subpremise")) unit = c.long_name;
        }
        const street = [streetNumber, route].filter(Boolean).join(" ");
        onSelect({ street, city, state, zip, unit });
        setQuery(place.formatted_address || item.description);
      }
    );
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-amber-500" />
        <input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          placeholder={placeholder}
          className={className ? `pl-9 ${className}` : "w-full pl-9 pr-3 py-2 bg-[#0F1117] border border-white/10 rounded-lg text-white text-sm placeholder:text-slate-400 focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/20"}
          autoComplete="off"
        />
        {loading && <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />}
      </div>
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-[#0F1117] border border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {results.map((r) => (
            <button key={r.placeId} onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2.5 text-sm text-slate-300 hover:bg-white/5 hover:text-white transition truncate">
              <MapPin className="w-3.5 h-3.5 inline mr-2 text-amber-500" />{r.description}
            </button>
          ))}
          <div className="px-3 py-1 text-[9px] text-slate-500 text-right">Powered by Google</div>
        </div>
      )}
    </div>
  );
}
