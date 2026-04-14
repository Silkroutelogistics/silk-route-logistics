"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { MapPin, Loader2 } from "lucide-react";

/**
 * Shared Google Places address autocomplete.
 *
 * Consumers:
 *  - Order Builder (dark theme) — pickup/delivery address fields
 *  - CRM Facilities tab (light theme) — facility address
 *
 * Single source of truth for the Google Maps loader, geocode parsing,
 * and debounce/result UX. Pass `theme="light"` in light-themed panels
 * so the input colors match.
 */

// ─── Google Maps loader (singleton) ─────────────────────────
let gMapsLoaded = false;
let gMapsLoading = false;
const gMapsQueue: (() => void)[] = [];

function loadGoogleMaps(): Promise<void> {
  if (gMapsLoaded && typeof window !== "undefined" && (window as any).google?.maps?.places) return Promise.resolve();
  return new Promise((resolve) => {
    if (typeof window === "undefined") { resolve(); return; }
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

export interface AddrParts {
  address: string;
  city: string;
  state: string;
  zip: string;
  unit?: string;
}

interface Props {
  label: string;
  value: AddrParts;
  onSelect: (a: AddrParts) => void;
  theme?: "dark" | "light";
}

export function AddressAutocomplete({ label, value, onSelect, theme = "dark" }: Props) {
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
      if (typeof window !== "undefined" && (window as any).google?.maps?.places) {
        autoRef.current = new (window as any).google.maps.places.AutocompleteService();
        placesRef.current = new (window as any).google.maps.places.PlacesService(document.createElement("div"));
      }
    });
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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
        const address = [streetNumber, route].filter(Boolean).join(" ");
        onSelect({ address, city, state, zip, unit });
        setQuery(place.formatted_address || item.description);
      }
    );
  };

  const inputCls = theme === "light"
    ? "w-full pl-9 pr-3 py-2 bg-white border border-gray-200 rounded-lg text-gray-900 text-sm focus:outline-none focus:ring-2 focus:ring-[#BA7517]/30"
    : "w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-gold/50";
  const iconCls = theme === "light" ? "absolute left-3 top-2.5 w-4 h-4 text-[#BA7517]" : "absolute left-3 top-2.5 w-4 h-4 text-gold";
  const spinnerCls = theme === "light" ? "absolute right-3 top-2.5 w-4 h-4 text-[#BA7517] animate-spin" : "absolute right-3 top-2.5 w-4 h-4 text-gold animate-spin";

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <MapPin className={iconCls} />
        <input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={label}
          className={inputCls}
        />
        {loading && <Loader2 className={spinnerCls} />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full rounded-lg max-h-48 overflow-y-auto"
          style={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(0,0,0,0.12)" }}>
          {results.map((r) => (
            <button key={r.placeId} onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 text-sm transition truncate hover:!bg-amber-50"
              style={{ color: "#334155", backgroundColor: "#fff" }}>
              <MapPin className="w-3 h-3 inline mr-1.5 text-[#C9A84C]" />{r.description}
            </button>
          ))}
          <div className="px-3 py-1 text-[10px] lg:text-[9px] text-right" style={{ color: "#94a3b8" }}>Powered by Google</div>
        </div>
      )}
    </div>
  );
}
