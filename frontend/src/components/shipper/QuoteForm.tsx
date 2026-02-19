"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { MapPin, Zap, Check, Loader2 } from "lucide-react";
import { api } from "@/lib/api";

/* ────── Google Maps loader (singleton) ────── */
let gMapsLoaded = false;
let gMapsLoading = false;
const gMapsQueue: (() => void)[] = [];

function loadGoogleMaps(): Promise<void> {
  if (gMapsLoaded && window.google?.maps?.places) return Promise.resolve();
  return new Promise((resolve) => {
    if (gMapsLoading) { gMapsQueue.push(resolve); return; }
    gMapsLoading = true;
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) { console.error("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY"); resolve(); return; }
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`;
    s.async = true;
    s.onload = () => { gMapsLoaded = true; gMapsLoading = false; resolve(); gMapsQueue.forEach((cb) => cb()); gMapsQueue.length = 0; };
    s.onerror = () => { gMapsLoading = false; resolve(); };
    document.head.appendChild(s);
  });
}

declare global { interface Window { google: any; } }

interface AddressParts { address: string; city: string; state: string; zip: string; }

/* ────── Address Autocomplete (light theme) ────── */
function AddressInput({ label, value, onSelect, required }: {
  label: string; value: AddressParts; onSelect: (a: AddressParts) => void; required?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<{ description: string; placeId: string }[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const autoRef = useRef<any>(null);
  const placesRef = useRef<any>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    loadGoogleMaps().then(() => {
      if (window.google?.maps?.places) {
        autoRef.current = new window.google.maps.places.AutocompleteService();
        placesRef.current = new window.google.maps.places.PlacesService(document.createElement("div"));
      }
    });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Sync display when value clears
  useEffect(() => { if (!value.address && !value.city) setQuery(""); }, [value.address, value.city]);

  const search = useCallback((q: string) => {
    if (q.length < 3 || !autoRef.current) { setResults([]); return; }
    setLoading(true);
    autoRef.current.getPlacePredictions(
      { input: q, componentRestrictions: { country: ["us", "ca"] }, types: ["address"] },
      (preds: any[] | null, status: string) => {
        if (status === "OK" && preds) {
          setResults(preds.slice(0, 5).map((p: any) => ({ description: p.description, placeId: p.place_id })));
          setOpen(true);
        } else { setResults([]); }
        setLoading(false);
      }
    );
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 300);
  };

  const handleSelect = (item: { description: string; placeId: string }) => {
    setOpen(false);
    setQuery(item.description);
    if (!placesRef.current) return;
    placesRef.current.getDetails(
      { placeId: item.placeId, fields: ["address_components", "formatted_address"] },
      (place: any, status: string) => {
        if (status !== "OK" || !place?.address_components) return;
        let streetNumber = "", route = "", city = "", state = "", zip = "";
        for (const c of place.address_components) {
          const t: string[] = c.types;
          if (t.includes("street_number")) streetNumber = c.long_name;
          if (t.includes("route")) route = c.long_name;
          if (t.includes("locality")) city = c.long_name;
          if (t.includes("sublocality_level_1") && !city) city = c.long_name;
          if (t.includes("administrative_area_level_1")) state = c.short_name;
          if (t.includes("postal_code")) zip = c.short_name;
        }
        const address = [streetNumber, route].filter(Boolean).join(" ");
        onSelect({ address, city, state, zip });
        setQuery(place.formatted_address || item.description);
      }
    );
  };

  return (
    <div className="mb-4" ref={wrapRef}>
      <label className="block text-xs font-semibold text-gray-500 mb-1.5 tracking-wide">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <div className="relative">
        <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Start typing an address..."
          className="w-full py-2.5 pl-10 pr-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C] transition-colors"
        />
        {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 animate-spin" />}
        {open && results.length > 0 && (
          <div className="absolute z-50 left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-56 overflow-y-auto">
            {results.map((r) => (
              <button key={r.placeId} type="button" onClick={() => handleSelect(r)}
                className="w-full text-left px-4 py-2.5 text-[13px] text-gray-700 hover:bg-[#C9A84C]/8 hover:text-[#0D1B2A] transition-colors border-b border-gray-100 last:border-0">
                <MapPin size={12} className="inline mr-2 text-gray-400" />{r.description}
              </button>
            ))}
            <div className="px-4 py-1.5 text-[10px] text-gray-400">Powered by Google</div>
          </div>
        )}
      </div>
      {/* Auto-populated fields (read-only display) */}
      {value.city && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          <div className="px-3 py-1.5 bg-gray-50 rounded text-xs text-gray-600 border border-gray-100">
            <span className="text-[10px] text-gray-400 block">City</span>{value.city}
          </div>
          <div className="px-3 py-1.5 bg-gray-50 rounded text-xs text-gray-600 border border-gray-100">
            <span className="text-[10px] text-gray-400 block">State</span>{value.state}
          </div>
          <div className="px-3 py-1.5 bg-gray-50 rounded text-xs text-gray-600 border border-gray-100">
            <span className="text-[10px] text-gray-400 block">ZIP</span>{value.zip || "—"}
          </div>
        </div>
      )}
    </div>
  );
}

/* ────── Main QuoteForm ────── */
export function QuoteForm() {
  const empty: AddressParts = { address: "", city: "", state: "", zip: "" };
  const [origin, setOrigin] = useState<AddressParts>(empty);
  const [dest, setDest] = useState<AddressParts>(empty);
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const upd = (k: string, v: string) => setForm((p) => ({ ...p, [k]: v }));

  const handleSubmit = async () => {
    setError("");
    // Validate required fields
    if (!origin.city || !origin.state) { setError("Origin address is required"); return; }
    if (!dest.city || !dest.state) { setError("Destination address is required"); return; }
    if (!form.qPickup) { setError("Pickup date is required"); return; }
    if (!form.qEquip) { setError("Equipment type is required"); return; }
    if (!form.qWeight) { setError("Weight is required"); return; }
    if (!form.qCommodity) { setError("Commodity is required"); return; }

    setSubmitting(true);
    try {
      await api.post("/shipper-portal/quotes", {
        originAddress: origin.address,
        originCity: origin.city,
        originState: origin.state,
        originZip: origin.zip,
        destAddress: dest.address,
        destCity: dest.city,
        destState: dest.state,
        destZip: dest.zip,
        pickupDate: form.qPickup,
        deliveryDate: form.qDelivery || null,
        equipmentType: form.qEquip,
        loadType: form.qLoadType || "Full Truckload (FTL)",
        weight: form.qWeight,
        commodity: form.qCommodity,
        specialInstructions: form.qNotes || "",
      });
      setSuccess(true);
      // Reset after 3s
      setTimeout(() => {
        setSuccess(false);
        setOrigin(empty);
        setDest(empty);
        setForm({});
      }, 3000);
    } catch (err: any) {
      setError(err.response?.data?.error || "Failed to submit quote request. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="text-center py-12">
        <div className="w-16 h-16 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-4">
          <Check size={32} className="text-emerald-600" />
        </div>
        <h3 className="text-lg font-bold text-[#0D1B2A] mb-2">Quote Request Submitted!</h3>
        <p className="text-sm text-gray-500 max-w-md mx-auto">
          Your freight quote request has been received. Our team will review your shipment details
          and provide competitive rates within minutes.
        </p>
      </div>
    );
  }

  return (
    <div>
      <h3 className="text-base font-bold text-[#0D1B2A] mb-5">Shipment Details</h3>

      {error && (
        <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-4">
        <AddressInput label="Origin Address" required value={origin} onSelect={setOrigin} />
        <AddressInput label="Destination Address" required value={dest} onSelect={setDest} />
        <FormField label="Pickup Date" required type="date" value={form.qPickup || ""} onChange={(v) => upd("qPickup", v)} min={new Date().toISOString().split("T")[0]} />
        <FormField label="Delivery Date" type="date" value={form.qDelivery || ""} onChange={(v) => upd("qDelivery", v)} min={form.qPickup || new Date().toISOString().split("T")[0]} />
        <FormField label="Equipment Type" required value={form.qEquip || ""} onChange={(v) => upd("qEquip", v)} options={["Dry Van 53'", "Reefer 53'", "Flatbed 48'", "Step Deck", "Conestoga", "Power Only"]} />
        <FormField label="Load Type" value={form.qLoadType || ""} onChange={(v) => upd("qLoadType", v)} options={["Full Truckload (FTL)", "Partial / Volume", "LTL"]} />
        <FormField label="Weight (lbs)" required value={form.qWeight || ""} onChange={(v) => upd("qWeight", v)} placeholder="42,000" />
        <FormField label="Commodity" required value={form.qCommodity || ""} onChange={(v) => upd("qCommodity", v)} placeholder="Packaged foods" />
      </div>
      <FormField label="Special Instructions" type="textarea" value={form.qNotes || ""} onChange={(v) => upd("qNotes", v)} placeholder="Temperature requirements, driver assist, appointment times, etc." />
      <div className="flex gap-3 mt-2">
        <button
          onClick={handleSubmit}
          disabled={submitting}
          className="inline-flex items-center gap-2 px-9 py-4 bg-gradient-to-br from-[#C9A84C] to-[#A88535] text-[#0D1B2A] text-[13px] font-semibold uppercase tracking-[2px] rounded shadow-[0_4px_20px_rgba(201,168,76,0.3)] hover:shadow-[0_6px_30px_rgba(201,168,76,0.45)] hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : <Zap size={16} />}
          {submitting ? "Submitting..." : "Get Instant Quote"}
        </button>
      </div>
    </div>
  );
}

/* ────── Simple FormField (unchanged) ────── */
function FormField({
  label, type = "text", value, onChange, placeholder, required, options, min,
}: {
  label: string; type?: string; value: string; onChange: (v: string) => void;
  placeholder?: string; required?: boolean; options?: string[]; min?: string;
}) {
  return (
    <div className="mb-4">
      <label className="block text-xs font-semibold text-gray-500 mb-1.5 tracking-wide">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      {options ? (
        <select value={value} onChange={(e) => onChange(e.target.value)}
          className="w-full py-2.5 pl-3.5 pr-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C] transition-colors appearance-none bg-white">
          <option value="">Select...</option>
          {options.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      ) : type === "textarea" ? (
        <textarea value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4}
          className="w-full py-2.5 px-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C] transition-colors resize-y" />
      ) : (
        <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} min={min}
          className="w-full py-2.5 pl-3.5 pr-3.5 border border-gray-200 rounded-md text-[13px] text-gray-700 outline-none focus:border-[#C9A84C] transition-colors" />
      )}
    </div>
  );
}
