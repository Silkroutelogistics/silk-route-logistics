"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ClipboardEdit, Search, MapPin, Package, DollarSign, CheckCircle,
  Download, ExternalLink, ChevronDown, AlertTriangle, Thermometer, Globe, Loader2,
} from "lucide-react";

interface Customer {
  id: string; name: string; contactName: string | null; email: string | null;
  phone: string | null; address: string | null; city: string | null; state: string | null; zip: string | null;
}

const EQUIPMENT_TYPES = ["Dry Van", "Reefer", "Flatbed", "Step Deck", "Car Hauler", "Tanker", "Lowboy", "Conestoga"];
const FREIGHT_CLASSES = ["50", "55", "60", "65", "70", "77.5", "85", "92.5", "100", "110", "125", "150", "175", "200", "250", "300", "400", "500"];

const initialForm = {
  customerId: "",
  originAddress: "", originCity: "", originState: "", originZip: "",
  destAddress: "", destCity: "", destState: "", destZip: "",
  pickupDate: "", deliveryDate: "",
  distance: "",
  equipmentType: "Dry Van",
  commodity: "", weight: "", pieces: "",
  freightClass: "", length: "", width: "", height: "",
  hazmat: false, tempMin: "", tempMax: "", customsRequired: false,
  rate: "", accessorials: [] as string[],
  specialInstructions: "", contactName: "", contactPhone: "",
  notes: "",
};

export default function OrderBuilderPage() {
  const [form, setForm] = useState(initialForm);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [tempControlled, setTempControlled] = useState(false);
  const [success, setSuccess] = useState<{ id: string; ref: string; status: string } | null>(null);

  const { data: customersData } = useQuery({
    queryKey: ["customers-search", customerSearch],
    queryFn: () => api.get<{ customers: Customer[] }>(`/customers?search=${customerSearch}&limit=10`).then((r) => r.data),
    enabled: customerSearch.length > 0,
  });

  const ratePerMile = form.rate && form.distance
    ? (parseFloat(form.rate) / parseFloat(form.distance)).toFixed(2)
    : "—";

  const createLoad = useMutation({
    mutationFn: (status: "DRAFT" | "POSTED") => {
      const payload: Record<string, unknown> = {
        originAddress: form.originAddress || undefined,
        originCity: form.originCity,
        originState: form.originState,
        originZip: form.originZip,
        destAddress: form.destAddress || undefined,
        destCity: form.destCity,
        destState: form.destState,
        destZip: form.destZip,
        pickupDate: form.pickupDate,
        deliveryDate: form.deliveryDate,
        equipmentType: form.equipmentType,
        rate: parseFloat(form.rate),
        status,
      };
      if (form.customerId) payload.customerId = form.customerId;
      if (form.commodity) payload.commodity = form.commodity;
      if (form.weight) payload.weight = parseFloat(form.weight);
      if (form.pieces) payload.pieces = parseInt(form.pieces);
      if (form.distance) payload.distance = parseFloat(form.distance);
      if (form.freightClass) payload.freightClass = form.freightClass;
      if (form.length) payload.length = parseFloat(form.length);
      if (form.width) payload.width = parseFloat(form.width);
      if (form.height) payload.height = parseFloat(form.height);
      if (form.hazmat) payload.hazmat = true;
      if (form.tempMin) payload.tempMin = parseFloat(form.tempMin);
      if (form.tempMax) payload.tempMax = parseFloat(form.tempMax);
      if (form.customsRequired) payload.customsRequired = true;
      if (form.accessorials.length > 0) payload.accessorials = form.accessorials;
      if (form.specialInstructions) payload.specialInstructions = form.specialInstructions;
      if (form.contactName) payload.contactName = form.contactName;
      if (form.contactPhone) payload.contactPhone = form.contactPhone;
      if (form.notes) payload.notes = form.notes;

      return api.post("/loads", payload).then((r) => r.data);
    },
    onSuccess: (data, status) => {
      setSuccess({ id: data.id, ref: data.referenceNumber, status });
    },
  });

  const isValid = form.originCity && form.originState && form.originZip
    && form.destCity && form.destState && form.destZip
    && form.pickupDate && form.deliveryDate
    && form.equipmentType && form.rate;

  const selectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerSearch(c.name);
    setForm((f) => ({ ...f, customerId: c.id, contactName: c.contactName || "", contactPhone: c.phone || "" }));
    setShowCustomerDropdown(false);
  };

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";

  if (success) {
    return (
      <div className="p-6 max-w-2xl mx-auto">
        <div className="bg-white/5 border border-green-500/30 rounded-2xl p-8 text-center space-y-4">
          <CheckCircle className="w-12 h-12 text-green-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Order Created Successfully</h2>
          <p className="text-slate-400">
            Reference: <span className="text-gold font-mono">{success.ref}</span>
            <span className="ml-2 px-2 py-0.5 rounded text-xs bg-gold/20 text-gold">
              {success.status === "POSTED" ? "Posted to Load Board" : "Draft"}
            </span>
          </p>
          <div className="flex items-center justify-center gap-3 pt-4">
            <a
              href={`${apiBase}/pdf/bol-load/${success.id}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 px-4 py-2.5 bg-gold text-navy font-medium rounded-lg text-sm hover:bg-gold/90"
            >
              <Download className="w-4 h-4" /> Download BOL
            </a>
            <a
              href="/dashboard/loads"
              className="flex items-center gap-2 px-4 py-2.5 bg-white/10 text-white rounded-lg text-sm hover:bg-white/20"
            >
              <ExternalLink className="w-4 h-4" /> View on Load Board
            </a>
          </div>
          <button onClick={() => { setSuccess(null); setForm(initialForm); setSelectedCustomer(null); setCustomerSearch(""); }}
            className="text-sm text-slate-400 hover:text-white mt-2">
            Create Another Order
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <ClipboardEdit className="w-6 h-6 text-gold" /> Order Builder
        </h1>
        <p className="text-slate-400 text-sm mt-1">Create a new load order and post to the load board</p>
      </div>

      {/* Section 1: Customer */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gold uppercase tracking-wider flex items-center gap-2">
          <Search className="w-4 h-4" /> Customer
        </h2>
        <div className="relative">
          <input
            value={customerSearch}
            onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
            onFocus={() => setShowCustomerDropdown(true)}
            placeholder="Search customers..."
            className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50"
          />
          {showCustomerDropdown && customersData?.customers && customersData.customers.length > 0 && (
            <div className="absolute z-10 top-full mt-1 w-full bg-navy border border-white/20 rounded-lg max-h-48 overflow-y-auto shadow-xl">
              {customersData.customers.map((c) => (
                <button key={c.id} onClick={() => selectCustomer(c)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-white/10 text-white transition cursor-pointer">
                  <span className="font-medium">{c.name}</span>
                  {c.contactName && <span className="text-slate-400 ml-2">— {c.contactName}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedCustomer && (
          <div className="text-xs text-slate-400 bg-white/5 rounded-lg p-3">
            <span className="text-white font-medium">{selectedCustomer.name}</span>
            {selectedCustomer.city && <span className="ml-2">{selectedCustomer.city}, {selectedCustomer.state}</span>}
            {selectedCustomer.phone && <span className="ml-2">| {selectedCustomer.phone}</span>}
          </div>
        )}
      </div>

      {/* Section 2: Route */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gold uppercase tracking-wider flex items-center gap-2">
          <MapPin className="w-4 h-4" /> Route
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <p className="text-xs text-slate-500 font-medium">ORIGIN</p>
            <AddressAutocomplete
              label="Search origin address..."
              onSelect={(addr) => setForm((f) => ({ ...f, originAddress: addr.address, originCity: addr.city, originState: addr.state, originZip: addr.zip }))}
              value={{ address: form.originAddress, city: form.originCity, state: form.originState, zip: form.originZip }}
            />
            <input value={form.originAddress} onChange={(e) => setForm((f) => ({ ...f, originAddress: e.target.value }))}
              placeholder="Street Address" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            <input value={form.originCity} onChange={(e) => setForm((f) => ({ ...f, originCity: e.target.value }))}
              placeholder="City" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            <div className="grid grid-cols-2 gap-2">
              <input value={form.originState} onChange={(e) => setForm((f) => ({ ...f, originState: e.target.value.toUpperCase().slice(0, 2) }))}
                placeholder="State/Prov (e.g. MI, ON)" maxLength={2} className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
              <input value={form.originZip} onChange={(e) => setForm((f) => ({ ...f, originZip: e.target.value }))}
                placeholder="ZIP/Postal" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            </div>
            <input type="date" value={form.pickupDate} onChange={(e) => setForm((f) => ({ ...f, pickupDate: e.target.value }))}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50 [color-scheme:dark]" />
          </div>
          <div className="space-y-3">
            <p className="text-xs text-slate-500 font-medium">DESTINATION</p>
            <AddressAutocomplete
              label="Search destination address..."
              onSelect={(addr) => setForm((f) => ({ ...f, destAddress: addr.address, destCity: addr.city, destState: addr.state, destZip: addr.zip }))}
              value={{ address: form.destAddress, city: form.destCity, state: form.destState, zip: form.destZip }}
            />
            <input value={form.destAddress} onChange={(e) => setForm((f) => ({ ...f, destAddress: e.target.value }))}
              placeholder="Street Address" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            <input value={form.destCity} onChange={(e) => setForm((f) => ({ ...f, destCity: e.target.value }))}
              placeholder="City" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            <div className="grid grid-cols-2 gap-2">
              <input value={form.destState} onChange={(e) => setForm((f) => ({ ...f, destState: e.target.value.toUpperCase().slice(0, 2) }))}
                placeholder="State/Prov (e.g. IL, ON)" maxLength={2} className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
              <input value={form.destZip} onChange={(e) => setForm((f) => ({ ...f, destZip: e.target.value }))}
                placeholder="ZIP/Postal" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            </div>
            <input type="date" value={form.deliveryDate} onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50 [color-scheme:dark]" />
          </div>
        </div>
        <input value={form.distance} onChange={(e) => setForm((f) => ({ ...f, distance: e.target.value }))}
          placeholder="Distance (miles)" type="number"
          className="w-full md:w-48 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
      </div>

      {/* Section 3: Freight */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gold uppercase tracking-wider flex items-center gap-2">
          <Package className="w-4 h-4" /> Freight Details
        </h2>
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Equipment Type</label>
            <select value={form.equipmentType} onChange={(e) => { setForm((f) => ({ ...f, equipmentType: e.target.value })); if (e.target.value === "Reefer") setTempControlled(true); }}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50 cursor-pointer">
              {EQUIPMENT_TYPES.map((t) => <option key={t} value={t} className="bg-navy">{t}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Commodity</label>
            <input value={form.commodity} onChange={(e) => setForm((f) => ({ ...f, commodity: e.target.value }))}
              placeholder="e.g. Auto Parts" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Freight Class</label>
            <select value={form.freightClass} onChange={(e) => setForm((f) => ({ ...f, freightClass: e.target.value }))}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50 cursor-pointer">
              <option value="" className="bg-navy">Select class</option>
              {FREIGHT_CLASSES.map((c) => <option key={c} value={c} className="bg-navy">Class {c}</option>)}
            </select>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <input value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
            placeholder="Weight (lbs)" type="number" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          <input value={form.pieces} onChange={(e) => setForm((f) => ({ ...f, pieces: e.target.value }))}
            placeholder="Pieces" type="number" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <input value={form.length} onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))}
            placeholder="Length (ft)" type="number" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          <input value={form.width} onChange={(e) => setForm((f) => ({ ...f, width: e.target.value }))}
            placeholder="Width (ft)" type="number" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          <input value={form.height} onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))}
            placeholder="Height (ft)" type="number" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
        </div>

        {/* Toggles */}
        <div className="flex flex-wrap gap-4 pt-2">
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={form.hazmat} onChange={(e) => setForm((f) => ({ ...f, hazmat: e.target.checked }))}
              className="rounded border-white/20 bg-white/5 text-gold focus:ring-gold" />
            <AlertTriangle className="w-4 h-4 text-yellow-500" /> Hazmat
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={tempControlled || form.equipmentType === "Reefer"}
              onChange={(e) => { setTempControlled(e.target.checked); if (!e.target.checked) setForm((f) => ({ ...f, tempMin: "", tempMax: "" })); }}
              className="rounded border-white/20 bg-white/5 text-gold focus:ring-gold" />
            <Thermometer className="w-4 h-4 text-blue-400" /> Temp-Controlled
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" checked={form.customsRequired} onChange={(e) => setForm((f) => ({ ...f, customsRequired: e.target.checked }))}
              className="rounded border-white/20 bg-white/5 text-gold focus:ring-gold" />
            <Globe className="w-4 h-4 text-green-400" /> Customs Required
          </label>
        </div>

        {(tempControlled || form.equipmentType === "Reefer" || form.tempMin || form.tempMax) && (
          <div className="grid grid-cols-2 gap-3">
            <input value={form.tempMin} onChange={(e) => setForm((f) => ({ ...f, tempMin: e.target.value }))}
              placeholder="Min Temp (°F)" type="number" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            <input value={form.tempMax} onChange={(e) => setForm((f) => ({ ...f, tempMax: e.target.value }))}
              placeholder="Max Temp (°F)" type="number" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
        )}
      </div>

      {/* Section 4: Rate & Pricing */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gold uppercase tracking-wider flex items-center gap-2">
          <DollarSign className="w-4 h-4" /> Rate & Pricing
        </h2>
        <div className="grid md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Rate ($)</label>
            <input value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
              placeholder="e.g. 1800" type="number" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
          <div className="bg-white/5 rounded-lg p-3 text-center">
            <p className="text-xs text-slate-500">Rate / Mile</p>
            <p className="text-lg font-bold text-gold">${ratePerMile}</p>
          </div>
        </div>

        <textarea value={form.specialInstructions} onChange={(e) => setForm((f) => ({ ...f, specialInstructions: e.target.value }))}
          placeholder="Special instructions..." rows={3}
          className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />

        <div className="grid md:grid-cols-2 gap-3">
          <input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
            placeholder="Contact name" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          <input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
            placeholder="Contact phone" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
        </div>
      </div>

      {/* Submit Buttons */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => createLoad.mutate("POSTED")}
          disabled={!isValid || createLoad.isPending}
          className="flex-1 px-6 py-3 bg-gold text-navy font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50 transition cursor-pointer"
        >
          {createLoad.isPending ? "Creating..." : "Post to Load Board"}
        </button>
        <button
          onClick={() => createLoad.mutate("DRAFT")}
          disabled={!isValid || createLoad.isPending}
          className="px-6 py-3 bg-white/10 text-white font-medium rounded-lg hover:bg-white/20 disabled:opacity-50 transition cursor-pointer"
        >
          Save Draft
        </button>
      </div>

      {createLoad.isError && (
        <p className="text-red-400 text-sm">Failed to create order. Please check all required fields.</p>
      )}
    </div>
  );
}

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

interface AddrParts { address: string; city: string; state: string; zip: string; }

function AddressAutocomplete({ label, value, onSelect }: {
  label: string; value: AddrParts; onSelect: (a: AddrParts) => void;
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
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-gold" />
        <input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder={label}
          className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-gold/50"
        />
        {loading && <Loader2 className="absolute right-3 top-2.5 w-4 h-4 text-gold animate-spin" />}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-[#1e293b] border border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {results.map((r) => (
            <button key={r.placeId} onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition truncate">
              <MapPin className="w-3 h-3 inline mr-1.5 text-gold" />{r.description}
            </button>
          ))}
          <div className="px-3 py-1 text-[9px] text-slate-600 text-right">Powered by Google</div>
        </div>
      )}
    </div>
  );
}
