"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
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

const TIME_OPTIONS = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, "0");
  const m = i % 2 === 0 ? "00" : "30";
  return `${h}:${m}`;
});

const EQUIPMENT_TYPES = ["Dry Van", "Reefer", "Flatbed", "Step Deck", "Car Hauler", "Tanker", "Lowboy", "Conestoga"];
const FREIGHT_CLASSES = ["50", "55", "60", "65", "70", "77.5", "85", "92.5", "100", "110", "125", "150", "175", "200", "250", "300", "400", "500"];

const COMMODITY_CLASS_MAP: Record<string, string> = {
  "auto parts": "85", "automotive": "85", "car parts": "85",
  "electronics": "92.5", "computers": "92.5", "technology": "92.5",
  "furniture": "125", "household": "125", "home goods": "125",
  "food": "70", "beverage": "70", "groceries": "70", "produce": "70",
  "retail": "70", "retail goods": "70", "general merchandise": "70", "consumer goods": "77.5",
  "health": "92.5", "beauty": "92.5", "cosmetics": "92.5", "supplements": "92.5",
  "paper": "55", "packaging": "55", "corrugated": "55", "cardboard": "55",
  "chemicals": "60", "chemical": "60",
  "machinery": "85", "equipment": "85", "industrial": "85",
  "clothing": "77.5", "apparel": "77.5", "textiles": "77.5",
  "building materials": "65", "lumber": "65", "construction": "65",
  "pharmaceuticals": "92.5", "medical": "92.5", "healthcare": "92.5",
  "plastic": "55", "plastics": "55", "resin": "55",
  "metal": "65", "steel": "65", "aluminum": "65",
  "glass": "85", "bottles": "85",
  "tile": "60", "ceramic": "60", "stone": "60",
  "frozen food": "100", "frozen": "100", "ice cream": "100",
  "dry goods": "60",
  "pet food": "70", "animal feed": "60",
};

interface AddressBookEntry {
  name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  phone: string;
  updatedAt: number;
}

const ADDRESS_BOOK_KEY = "srl-address-book";
const MAX_ADDRESS_ENTRIES = 50;

function getAddressBook(): AddressBookEntry[] {
  try {
    const raw = localStorage.getItem(ADDRESS_BOOK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function saveToAddressBook(entry: Omit<AddressBookEntry, "updatedAt">) {
  if (!entry.name?.trim() || !entry.city?.trim()) return;
  const book = getAddressBook();
  const existing = book.findIndex((e) => e.name.toLowerCase() === entry.name.toLowerCase());
  const record: AddressBookEntry = { ...entry, updatedAt: Date.now() };
  if (existing >= 0) {
    book[existing] = record;
  } else {
    book.unshift(record);
  }
  // Keep max entries, most recent first
  book.sort((a, b) => b.updatedAt - a.updatedAt);
  localStorage.setItem(ADDRESS_BOOK_KEY, JSON.stringify(book.slice(0, MAX_ADDRESS_ENTRIES)));
}

const initialForm = {
  customerId: "",
  shipperName: "", consigneeName: "",
  originAddress: "", originCity: "", originState: "", originZip: "", originUnit: "",
  destAddress: "", destCity: "", destState: "", destZip: "", destUnit: "",
  pickupDate: "", deliveryDate: "",
  pickupTimeStart: "", pickupTimeEnd: "", deliveryTimeStart: "", deliveryTimeEnd: "",
  distance: "",
  equipmentType: "Dry Van",
  commodity: "", weight: "", pieces: "",
  pallets: "", palletLength: "", palletWidth: "", palletHeight: "", weightPerPallet: "",
  freightClass: "", length: "", width: "", height: "",
  hazmat: false, tempMin: "", tempMax: "", customsRequired: false,
  rate: "", accessorials: [] as string[],
  specialInstructions: "", contactName: "", contactPhone: "",
  notes: "",
};

export default function OrderBuilderPage() {
  const searchParams = useSearchParams();
  const [form, setForm] = useState(initialForm);
  const [showOriginUnit, setShowOriginUnit] = useState(false);
  const [showDestUnit, setShowDestUnit] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [tempControlled, setTempControlled] = useState(false);
  const [success, setSuccess] = useState<{ id: string; ref: string; status: string } | null>(null);
  const [prefilledFromUrl, setPrefilledFromUrl] = useState(false);
  const [distanceAutoFilled, setDistanceAutoFilled] = useState(false);
  const [distanceManual, setDistanceManual] = useState(false);
  const [suggestedClass, setSuggestedClass] = useState("");
  const [palletRows, setPalletRows] = useState([{ qty: "", l: "48", w: "40", h: "48", weight: "" }]);
  const [showErrors, setShowErrors] = useState(false);
  const [showShipperBook, setShowShipperBook] = useState(false);
  const [showConsigneeBook, setShowConsigneeBook] = useState(false);
  const shipperBookRef = useRef<HTMLDivElement>(null);
  const consigneeBookRef = useRef<HTMLDivElement>(null);
  const distanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // FIX 2: Auto-calculate distance when origin+dest are filled (zip or city+state)
  useEffect(() => {
    if (distanceManual) return;
    const hasOrigin = (form.originZip.length >= 5) || (form.originCity && form.originState);
    const hasDest = (form.destZip.length >= 5) || (form.destCity && form.destState);
    if (!hasOrigin || !hasDest) return;

    if (distanceTimerRef.current) clearTimeout(distanceTimerRef.current);
    distanceTimerRef.current = setTimeout(() => {
      const origin = encodeURIComponent(form.originCity + "," + form.originState);
      const dest = encodeURIComponent(form.destCity + "," + form.destState);
      // Try mileage API first, fallback to loads/distance endpoint
      api.get<{ miles: number }>(`/mileage/calculate?origin=${origin}&destination=${dest}`)
        .then((res) => {
          if (res.data?.miles && !distanceManual) {
            setForm((f) => ({ ...f, distance: String(Math.round(res.data.miles)) }));
            setDistanceAutoFilled(true);
          }
        })
        .catch(() => {
          // Fallback: try loads/distance endpoint
          api.get<{ distance?: number; miles?: number }>(`/loads/distance?originZip=${form.originZip}&destZip=${form.destZip}`)
            .then((res) => {
              const miles = res.data?.miles || res.data?.distance;
              if (miles && !distanceManual) {
                setForm((f) => ({ ...f, distance: String(Math.round(miles)) }));
                setDistanceAutoFilled(true);
              }
            })
            .catch(() => {});
        });
    }, 500);
    return () => { if (distanceTimerRef.current) clearTimeout(distanceTimerRef.current); };
  }, [form.originZip, form.destZip, form.originCity, form.originState, form.destCity, form.destState, form.originAddress, form.destAddress, distanceManual]);

  // FIX 3: Auto-suggest freight class from commodity (fuzzy partial match)
  useEffect(() => {
    const commodity = form.commodity.trim().toLowerCase();
    if (!commodity || commodity.length < 2) { setSuggestedClass(""); return; }
    // Try exact match first
    let matched = COMMODITY_CLASS_MAP[commodity];
    // Then try partial match — if any key contains the typed word or typed word contains any key
    if (!matched) {
      for (const [key, val] of Object.entries(COMMODITY_CLASS_MAP)) {
        if (key.includes(commodity) || commodity.includes(key)) {
          matched = val;
          break;
        }
      }
    }
    // Then try matching individual words
    if (!matched) {
      const words = commodity.split(/\s+/);
      for (const word of words) {
        if (word.length < 3) continue;
        for (const [key, val] of Object.entries(COMMODITY_CLASS_MAP)) {
          if (key.includes(word) || word.includes(key)) {
            matched = val;
            break;
          }
        }
        if (matched) break;
      }
    }
    if (matched) {
      setSuggestedClass(matched);
      if (!form.freightClass) {
        setForm((f) => ({ ...f, freightClass: matched }));
      }
    } else {
      setSuggestedClass("");
    }
  }, [form.commodity]);

  // Auto-suggest freight class from weight + pallet dimensions (density-based)
  useEffect(() => {
    if (suggestedClass) return; // commodity-based suggestion takes priority
    if (form.weight && form.palletLength && form.palletWidth && form.palletHeight && form.pallets) {
      const totalWeight = parseFloat(form.weight);
      const L = parseFloat(form.palletLength);
      const W = parseFloat(form.palletWidth);
      const H = parseFloat(form.palletHeight);
      const pallets = parseInt(form.pallets);
      if (totalWeight > 0 && L > 0 && W > 0 && H > 0 && pallets > 0) {
        // Density = weight / cubic feet. Convert inches to feet for volume.
        const cubicFeetPerPallet = (L / 12) * (W / 12) * (H / 12);
        const totalCubicFeet = cubicFeetPerPallet * pallets;
        const density = totalWeight / totalCubicFeet; // lbs per cubic foot
        // NMFC density-based class ranges
        let densityClass = "";
        if (density >= 50) densityClass = "50";
        else if (density >= 35) densityClass = "55";
        else if (density >= 30) densityClass = "60";
        else if (density >= 22.5) densityClass = "65";
        else if (density >= 15) densityClass = "70";
        else if (density >= 13.5) densityClass = "77.5";
        else if (density >= 12) densityClass = "85";
        else if (density >= 10.5) densityClass = "92.5";
        else if (density >= 9) densityClass = "100";
        else if (density >= 8) densityClass = "110";
        else if (density >= 7) densityClass = "125";
        else if (density >= 6) densityClass = "150";
        else if (density >= 5) densityClass = "175";
        else if (density >= 4) densityClass = "200";
        else if (density >= 3) densityClass = "250";
        else if (density >= 2) densityClass = "300";
        else if (density >= 1) densityClass = "400";
        else densityClass = "500";
        if (densityClass && !form.freightClass) {
          setSuggestedClass(densityClass);
          setForm((f) => ({ ...f, freightClass: densityClass }));
        }
      }
    }
  }, [form.weight, form.palletLength, form.palletWidth, form.palletHeight, form.pallets, suggestedClass]);

  // Auto-calculate weight + pieces + first pallet dims from palletRows
  useEffect(() => {
    let totalWeight = 0;
    let totalPieces = 0;
    let firstL = "", firstW = "", firstH = "";
    let firstQty = "";
    for (const row of palletRows) {
      const qty = parseInt(row.qty) || 0;
      const w = parseFloat(row.weight) || 0;
      totalWeight += qty * w;
      totalPieces += qty;
      if (!firstL && row.l) { firstL = row.l; firstW = row.w; firstH = row.h; firstQty = row.qty; }
    }
    if (totalWeight > 0) setForm((f) => ({ ...f, weight: String(Math.round(totalWeight)) }));
    if (totalPieces > 0) setForm((f) => ({ ...f, pieces: String(totalPieces) }));
    // Sync first row to the legacy single-pallet fields for density calculation
    if (firstQty) setForm((f) => ({ ...f, pallets: firstQty, palletLength: firstL, palletWidth: firstW, palletHeight: firstH, weightPerPallet: palletRows[0]?.weight || "" }));
  }, [palletRows]);

  // Legacy: Auto-calculate weight from single pallets and weight per pallet (kept for backward compat)
  useEffect(() => {
    if (form.pallets && form.weightPerPallet) {
      const total = parseInt(form.pallets) * parseFloat(form.weightPerPallet);
      if (!isNaN(total)) setForm(f => ({ ...f, weight: String(Math.round(total)) }));
    }
    if (form.pallets && !form.pieces) {
      setForm(f => ({ ...f, pieces: form.pallets }));
    }
  }, [form.pallets, form.weightPerPallet]);

  const { data: customersData } = useQuery({
    queryKey: ["customers-search", customerSearch],
    queryFn: () => api.get<{ customers: Customer[] }>(`/customers?search=${customerSearch}&limit=10`).then((r) => r.data),
    enabled: customerSearch.length > 0,
  });

  // Auto-select customer from URL params (e.g., from CRM "Create Load" button)
  useEffect(() => {
    if (prefilledFromUrl) return;
    const urlCustomerId = searchParams.get("customerId");
    const urlCustomerName = searchParams.get("customerName");
    if (urlCustomerId && urlCustomerName) {
      setCustomerSearch(urlCustomerName);
      setForm((f) => ({ ...f, customerId: urlCustomerId }));
      setSelectedCustomer({ id: urlCustomerId, name: urlCustomerName, contactName: null, email: null, phone: null, address: null, city: null, state: null, zip: null });
      setPrefilledFromUrl(true);
      // Also fetch the full customer to populate contact info
      api.get<Customer>(`/customers/${urlCustomerId}`).then((res) => {
        const c = res.data;
        setSelectedCustomer(c);
        setForm((f) => ({ ...f, customerId: c.id, contactName: c.contactName || f.contactName, contactPhone: c.phone || f.contactPhone }));
      }).catch(() => {});
    }
  }, [searchParams, prefilledFromUrl]);

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
        originUnit: form.originUnit || undefined,
        destAddress: form.destAddress || undefined,
        destCity: form.destCity,
        destState: form.destState,
        destZip: form.destZip,
        destUnit: form.destUnit || undefined,
        pickupDate: form.pickupDate,
        deliveryDate: form.deliveryDate,
        pickupTimeStart: form.pickupTimeStart || undefined,
        pickupTimeEnd: form.pickupTimeEnd || undefined,
        deliveryTimeStart: form.deliveryTimeStart || undefined,
        deliveryTimeEnd: form.deliveryTimeEnd || undefined,
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
      if (form.shipperName) payload.shipperName = form.shipperName;
      if (form.consigneeName) payload.consigneeName = form.consigneeName;

      return api.post("/loads", payload).then((r) => r.data);
    },
    onSuccess: (data, status) => {
      // Auto-save origin + destination to address book
      if (form.shipperName || form.originCity) {
        saveToAddressBook({
          name: form.shipperName || `${form.originCity}, ${form.originState}`,
          address: form.originAddress,
          city: form.originCity,
          state: form.originState,
          zip: form.originZip,
          phone: form.contactPhone || "",
        });
      }
      if (form.consigneeName || form.destCity) {
        saveToAddressBook({
          name: form.consigneeName || `${form.destCity}, ${form.destState}`,
          address: form.destAddress,
          city: form.destCity,
          state: form.destState,
          zip: form.destZip,
          phone: "",
        });
      }
      setSuccess({ id: data.id, ref: data.referenceNumber, status });
    },
  });

  const isValid = form.originCity && form.originState && form.originZip
    && form.destCity && form.destState && form.destZip
    && form.pickupDate && form.deliveryDate
    && form.equipmentType && form.rate;

  const requiredFields = ["originCity", "originState", "originZip", "destCity", "destState", "destZip", "pickupDate", "deliveryDate", "rate"] as const;
  const firstErrorField = showErrors ? requiredFields.find((f) => !form[f]) : null;
  const fieldError = (name: typeof requiredFields[number]) => showErrors && !form[name];
  const errorBorder = (name: typeof requiredFields[number]) => fieldError(name) ? "border-red-500" : "border-white/10";
  const isFirstError = (name: typeof requiredFields[number]) => firstErrorField === name;

  const selectCustomer = (c: Customer) => {
    setSelectedCustomer(c);
    setCustomerSearch(c.name);
    setForm((f) => ({ ...f, customerId: c.id, contactName: c.contactName || "", contactPhone: c.phone || "" }));
    setShowCustomerDropdown(false);
  };

  const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://api.silkroutelogistics.ai/api";

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

      {showErrors && !isValid && (
        <div className="bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2 flex items-center gap-2 text-sm text-red-400">
          <AlertTriangle className="w-4 h-4" /> Please fill in all required fields highlighted below
        </div>
      )}

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
            <div className="absolute z-10 top-full mt-1 w-full rounded-lg max-h-48 overflow-y-auto"
              style={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(0,0,0,0.12)" }}>
              {customersData.customers.map((c) => (
                <button key={c.id} onClick={() => selectCustomer(c)}
                  className="w-full text-left px-3 py-2.5 text-sm transition cursor-pointer hover:!bg-amber-50"
                  style={{ color: "#1e293b", borderBottom: "1px solid #f1f5f9", backgroundColor: "#fff" }}>
                  <span className="font-semibold" style={{ color: "#0f172a" }}>{c.name}</span>
                  <span style={{ color: "#64748b", marginLeft: "8px" }}>— {c.contactName || "No contact"}</span>
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
            {/* Shipper / Pickup Facility Name with Address Book */}
            <div className="relative" ref={shipperBookRef}>
              <label className="text-xs text-slate-500 mb-1 block">Shipper / Pickup Facility Name</label>
              <input
                value={form.shipperName}
                onChange={(e) => { setForm((f) => ({ ...f, shipperName: e.target.value })); setShowShipperBook(true); }}
                onFocus={() => setShowShipperBook(true)}
                onBlur={() => setTimeout(() => setShowShipperBook(false), 200)}
                placeholder='e.g. "Graphic Packaging - Kalamazoo Plant"'
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-gold/50"
              />
              {showShipperBook && (() => {
                const q = form.shipperName.toLowerCase();
                const matches = getAddressBook().filter((e) => !q || e.name.toLowerCase().includes(q)).slice(0, 8);
                if (matches.length === 0) return null;
                return (
                  <div className="absolute z-20 top-full mt-1 w-full rounded-lg max-h-48 overflow-y-auto"
                    style={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(0,0,0,0.12)" }}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">Saved Locations</div>
                    {matches.map((entry, i) => (
                      <button key={i} onClick={() => {
                        setForm((f) => ({ ...f, shipperName: entry.name, originAddress: entry.address, originCity: entry.city, originState: entry.state, originZip: entry.zip }));
                        if (entry.phone) setForm((f) => ({ ...f, contactPhone: entry.phone }));
                        setShowShipperBook(false);
                      }}
                        className="w-full text-left px-3 py-2 text-sm transition cursor-pointer hover:!bg-amber-50"
                        style={{ color: "#1e293b", borderBottom: "1px solid #f1f5f9", backgroundColor: "#fff" }}>
                        <span className="font-semibold" style={{ color: "#0f172a" }}>{entry.name}</span>
                        <span style={{ color: "#64748b", marginLeft: "8px", fontSize: "12px" }}>{entry.city}, {entry.state} {entry.zip}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
            <AddressAutocomplete
              label="Search origin address..."
              onSelect={(addr) => { setForm((f) => ({ ...f, originAddress: addr.address, originCity: addr.city, originState: addr.state, originZip: addr.zip, originUnit: addr.unit || f.originUnit })); if (addr.unit) setShowOriginUnit(true); }}
              value={{ address: form.originAddress, city: form.originCity, state: form.originState, zip: form.originZip }}
            />
            {(showOriginUnit || form.originUnit) ? (
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Unit / Suite #</label>
                <input
                  value={form.originUnit}
                  onChange={(e) => setForm((f) => ({ ...f, originUnit: e.target.value }))}
                  placeholder="e.g. Suite 200, Unit 4B, Apt 12"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-gold/50"
                />
              </div>
            ) : (
              <button type="button" onClick={() => setShowOriginUnit(true)}
                className="mt-1.5 text-xs text-gold hover:text-gold/80 font-medium">
                + Add Unit / Suite #
              </button>
            )}
            <input value={form.originAddress} onChange={(e) => setForm((f) => ({ ...f, originAddress: e.target.value }))}
              placeholder="Street Address" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            <div {...(isFirstError("originCity") ? { "data-error": "true" } : {})}>
              <input value={form.originCity} onChange={(e) => setForm((f) => ({ ...f, originCity: e.target.value }))}
                placeholder="City *" className={`w-full px-3 py-2 bg-white/5 border ${errorBorder("originCity")} rounded-lg text-sm text-white focus:outline-none focus:border-gold/50`} />
              {fieldError("originCity") && <p className="text-xs text-red-400 mt-0.5">Required</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div {...(isFirstError("originState") ? { "data-error": "true" } : {})}>
                <input value={form.originState} onChange={(e) => setForm((f) => ({ ...f, originState: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="State/Prov (e.g. MI, ON) *" maxLength={2} className={`w-full px-3 py-2 bg-white/5 border ${errorBorder("originState")} rounded-lg text-sm text-white focus:outline-none focus:border-gold/50`} />
                {fieldError("originState") && <p className="text-xs text-red-400 mt-0.5">Required</p>}
              </div>
              <div {...(isFirstError("originZip") ? { "data-error": "true" } : {})}>
                <input value={form.originZip} onChange={(e) => setForm((f) => ({ ...f, originZip: e.target.value }))}
                  placeholder="ZIP/Postal *" className={`w-full px-3 py-2 bg-white/5 border ${errorBorder("originZip")} rounded-lg text-sm text-white focus:outline-none focus:border-gold/50`} />
                {fieldError("originZip") && <p className="text-xs text-red-400 mt-0.5">Required</p>}
              </div>
            </div>
            <div {...(isFirstError("pickupDate") ? { "data-error": "true" } : {})}>
              <input type="date" value={form.pickupDate} onChange={(e) => setForm((f) => ({ ...f, pickupDate: e.target.value }))}
                className={`w-full px-3 py-2 bg-white/5 border ${errorBorder("pickupDate")} rounded-lg text-sm text-white focus:outline-none focus:border-gold/50 [color-scheme:dark]`} />
              {fieldError("pickupDate") && <p className="text-xs text-red-400 mt-0.5">Required</p>}
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Pickup Window</label>
              <div className="grid grid-cols-2 gap-2">
                <select value={form.pickupTimeStart} onChange={(e) => setForm((f) => ({ ...f, pickupTimeStart: e.target.value }))}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50 cursor-pointer">
                  <option value="" style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>Start</option>
                  {TIME_OPTIONS.map(t => <option key={t} value={t} style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>{t}</option>)}
                </select>
                <select value={form.pickupTimeEnd} onChange={(e) => setForm((f) => ({ ...f, pickupTimeEnd: e.target.value }))}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50 cursor-pointer">
                  <option value="" style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>End</option>
                  {TIME_OPTIONS.map(t => <option key={t} value={t} style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>
          <div className="space-y-3">
            <p className="text-xs text-slate-500 font-medium">DESTINATION</p>
            {/* Consignee / Delivery Facility Name with Address Book */}
            <div className="relative" ref={consigneeBookRef}>
              <label className="text-xs text-slate-500 mb-1 block">Consignee / Delivery Facility Name</label>
              <input
                value={form.consigneeName}
                onChange={(e) => { setForm((f) => ({ ...f, consigneeName: e.target.value })); setShowConsigneeBook(true); }}
                onFocus={() => setShowConsigneeBook(true)}
                onBlur={() => setTimeout(() => setShowConsigneeBook(false), 200)}
                placeholder='e.g. "Walmart DC #6078"'
                className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-gold/50"
              />
              {showConsigneeBook && (() => {
                const q = form.consigneeName.toLowerCase();
                const matches = getAddressBook().filter((e) => !q || e.name.toLowerCase().includes(q)).slice(0, 8);
                if (matches.length === 0) return null;
                return (
                  <div className="absolute z-20 top-full mt-1 w-full rounded-lg max-h-48 overflow-y-auto"
                    style={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(0,0,0,0.12)" }}>
                    <div className="px-3 py-1.5 text-[10px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">Saved Locations</div>
                    {matches.map((entry, i) => (
                      <button key={i} onClick={() => {
                        setForm((f) => ({ ...f, consigneeName: entry.name, destAddress: entry.address, destCity: entry.city, destState: entry.state, destZip: entry.zip }));
                        setShowConsigneeBook(false);
                      }}
                        className="w-full text-left px-3 py-2 text-sm transition cursor-pointer hover:!bg-amber-50"
                        style={{ color: "#1e293b", borderBottom: "1px solid #f1f5f9", backgroundColor: "#fff" }}>
                        <span className="font-semibold" style={{ color: "#0f172a" }}>{entry.name}</span>
                        <span style={{ color: "#64748b", marginLeft: "8px", fontSize: "12px" }}>{entry.city}, {entry.state} {entry.zip}</span>
                      </button>
                    ))}
                  </div>
                );
              })()}
            </div>
            <AddressAutocomplete
              label="Search destination address..."
              onSelect={(addr) => { setForm((f) => ({ ...f, destAddress: addr.address, destCity: addr.city, destState: addr.state, destZip: addr.zip, destUnit: addr.unit || f.destUnit })); if (addr.unit) setShowDestUnit(true); }}
              value={{ address: form.destAddress, city: form.destCity, state: form.destState, zip: form.destZip }}
            />
            {(showDestUnit || form.destUnit) ? (
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Unit / Suite #</label>
                <input
                  value={form.destUnit}
                  onChange={(e) => setForm((f) => ({ ...f, destUnit: e.target.value }))}
                  placeholder="e.g. Suite 200, Unit 4B, Apt 12"
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-gold/50"
                />
              </div>
            ) : (
              <button type="button" onClick={() => setShowDestUnit(true)}
                className="mt-1.5 text-xs text-gold hover:text-gold/80 font-medium">
                + Add Unit / Suite #
              </button>
            )}
            <input value={form.destAddress} onChange={(e) => setForm((f) => ({ ...f, destAddress: e.target.value }))}
              placeholder="Street Address" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
            <div {...(isFirstError("destCity") ? { "data-error": "true" } : {})}>
              <input value={form.destCity} onChange={(e) => setForm((f) => ({ ...f, destCity: e.target.value }))}
                placeholder="City *" className={`w-full px-3 py-2 bg-white/5 border ${errorBorder("destCity")} rounded-lg text-sm text-white focus:outline-none focus:border-gold/50`} />
              {fieldError("destCity") && <p className="text-xs text-red-400 mt-0.5">Required</p>}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div {...(isFirstError("destState") ? { "data-error": "true" } : {})}>
                <input value={form.destState} onChange={(e) => setForm((f) => ({ ...f, destState: e.target.value.toUpperCase().slice(0, 2) }))}
                  placeholder="State/Prov (e.g. IL, ON) *" maxLength={2} className={`w-full px-3 py-2 bg-white/5 border ${errorBorder("destState")} rounded-lg text-sm text-white focus:outline-none focus:border-gold/50`} />
                {fieldError("destState") && <p className="text-xs text-red-400 mt-0.5">Required</p>}
              </div>
              <div {...(isFirstError("destZip") ? { "data-error": "true" } : {})}>
                <input value={form.destZip} onChange={(e) => setForm((f) => ({ ...f, destZip: e.target.value }))}
                  placeholder="ZIP/Postal *" className={`w-full px-3 py-2 bg-white/5 border ${errorBorder("destZip")} rounded-lg text-sm text-white focus:outline-none focus:border-gold/50`} />
                {fieldError("destZip") && <p className="text-xs text-red-400 mt-0.5">Required</p>}
              </div>
            </div>
            <div {...(isFirstError("deliveryDate") ? { "data-error": "true" } : {})}>
              <input type="date" value={form.deliveryDate} onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))}
                className={`w-full px-3 py-2 bg-white/5 border ${errorBorder("deliveryDate")} rounded-lg text-sm text-white focus:outline-none focus:border-gold/50 [color-scheme:dark]`} />
              {fieldError("deliveryDate") && <p className="text-xs text-red-400 mt-0.5">Required</p>}
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Delivery Window</label>
              <div className="grid grid-cols-2 gap-2">
                <select value={form.deliveryTimeStart} onChange={(e) => setForm((f) => ({ ...f, deliveryTimeStart: e.target.value }))}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50 cursor-pointer">
                  <option value="" style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>Start</option>
                  {TIME_OPTIONS.map(t => <option key={t} value={t} style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>{t}</option>)}
                </select>
                <select value={form.deliveryTimeEnd} onChange={(e) => setForm((f) => ({ ...f, deliveryTimeEnd: e.target.value }))}
                  className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50 cursor-pointer">
                  <option value="" style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>End</option>
                  {TIME_OPTIONS.map(t => <option key={t} value={t} style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>{t}</option>)}
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <input value={form.distance} onChange={(e) => { setForm((f) => ({ ...f, distance: e.target.value })); setDistanceManual(true); setDistanceAutoFilled(false); }}
            placeholder="Distance (miles)" type="number"
            className="w-full md:w-48 px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          {distanceAutoFilled && <span className="text-xs text-green-400 bg-green-400/10 px-2 py-0.5 rounded font-medium">Calculated</span>}
        </div>
      </div>

      {/* Section 3: Freight */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-5 space-y-4">
        <h2 className="text-sm font-semibold text-gold uppercase tracking-wider flex items-center gap-2">
          <Package className="w-4 h-4" /> Freight Details
        </h2>
        {/* Row 1: Equipment Type | Commodity | Freight Class */}
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Equipment Type</label>
            <select value={form.equipmentType} onChange={(e) => { setForm((f) => ({ ...f, equipmentType: e.target.value })); if (e.target.value === "Reefer") setTempControlled(true); }}
              className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50 cursor-pointer">
              {EQUIPMENT_TYPES.map((t) => <option key={t} value={t} style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>{t}</option>)}
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
              <option value="" style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>Select class</option>
              {FREIGHT_CLASSES.map((c) => <option key={c} value={c} style={{ backgroundColor: "#0f172a", color: "#f8fafc" }}>Class {c}</option>)}
            </select>
            {suggestedClass && (
              <p className="text-xs text-gold mt-1">Auto-suggested: Class {suggestedClass} based on commodity</p>
            )}
          </div>
        </div>

        {/* Pallet Rows — multiple rows with + button */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs text-slate-500 font-medium">PALLET DETAILS</label>
            <button type="button" onClick={() => setPalletRows((p) => [...p, { qty: "", l: "48", w: "40", h: "48", weight: "" }])}
              className="text-xs text-gold hover:text-gold/80 font-medium flex items-center gap-1 cursor-pointer">
              + Add Pallet Type
            </button>
          </div>
          <div className="grid grid-cols-[1fr_1.5fr_1fr_auto] gap-2 text-[10px] text-slate-500 px-1">
            <span>Qty</span><span>Size (L × W × H) in</span><span>Weight/Pallet (lbs)</span><span></span>
          </div>
          {palletRows.map((row, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_1.5fr_1fr_auto] gap-2 items-center">
              <input value={row.qty} onChange={(e) => { const r = [...palletRows]; r[idx] = { ...r[idx], qty: e.target.value }; setPalletRows(r); }}
                placeholder="26" type="number" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
              <div className="flex items-center gap-1">
                <input value={row.l} onChange={(e) => { const r = [...palletRows]; r[idx] = { ...r[idx], l: e.target.value }; setPalletRows(r); }}
                  placeholder="48" type="number" className="w-full px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white text-center focus:outline-none focus:border-gold/50" />
                <span className="text-slate-500 text-xs shrink-0">×</span>
                <input value={row.w} onChange={(e) => { const r = [...palletRows]; r[idx] = { ...r[idx], w: e.target.value }; setPalletRows(r); }}
                  placeholder="40" type="number" className="w-full px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white text-center focus:outline-none focus:border-gold/50" />
                <span className="text-slate-500 text-xs shrink-0">×</span>
                <input value={row.h} onChange={(e) => { const r = [...palletRows]; r[idx] = { ...r[idx], h: e.target.value }; setPalletRows(r); }}
                  placeholder="48" type="number" className="w-full px-2 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white text-center focus:outline-none focus:border-gold/50" />
              </div>
              <input value={row.weight} onChange={(e) => { const r = [...palletRows]; r[idx] = { ...r[idx], weight: e.target.value }; setPalletRows(r); }}
                placeholder="1500" type="number" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
              {palletRows.length > 1 && (
                <button type="button" onClick={() => setPalletRows((p) => p.filter((_, i) => i !== idx))}
                  className="text-red-400 hover:text-red-300 text-xs cursor-pointer px-1">✕</button>
              )}
              {palletRows.length <= 1 && <div />}
            </div>
          ))}
        </div>

        {/* Total Weight + Pieces (auto-calculated from all pallet rows) */}
        <div className="grid md:grid-cols-3 gap-3">
          <div>
            <label className="text-xs text-slate-500 mb-1 block flex items-center gap-2">
              Total Weight (lbs)
              {palletRows.some(r => r.qty && r.weight) && <span className="text-[10px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded font-medium">Calculated</span>}
            </label>
            <input value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
              placeholder="Weight (lbs)" type="number" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
          <div>
            <label className="text-xs text-slate-500 mb-1 block">Total Pieces / Pallets</label>
            <input value={form.pieces} onChange={(e) => setForm((f) => ({ ...f, pieces: e.target.value }))}
              placeholder="Pieces" type="number" className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          </div>
        </div>

        {/* Row 4: Truck Dimensions */}
        <div className="grid md:grid-cols-3 gap-3">
          <input value={form.length} onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))}
            placeholder="Truck Length (ft)" type="number" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          <input value={form.width} onChange={(e) => setForm((f) => ({ ...f, width: e.target.value }))}
            placeholder="Truck Width (ft)" type="number" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
          <input value={form.height} onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))}
            placeholder="Truck Height (ft)" type="number" className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-gold/50" />
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
          <div {...(isFirstError("rate") ? { "data-error": "true" } : {})}>
            <label className="text-xs text-slate-500 mb-1 block">Rate ($) *</label>
            <input value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
              placeholder="e.g. 1800" type="number" className={`w-full px-3 py-2 bg-white/5 border ${errorBorder("rate")} rounded-lg text-sm text-white focus:outline-none focus:border-gold/50`} />
            {fieldError("rate") && <p className="text-xs text-red-400 mt-0.5">Required</p>}
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
          onClick={() => {
            if (!isValid) {
              setShowErrors(true);
              setTimeout(() => {
                const firstError = document.querySelector('[data-error="true"]');
                firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 50);
              return;
            }
            createLoad.mutate("POSTED");
          }}
          disabled={createLoad.isPending}
          className="flex-1 px-6 py-3 bg-gold text-navy font-semibold rounded-lg hover:bg-gold/90 disabled:opacity-50 transition cursor-pointer"
        >
          {createLoad.isPending ? "Creating..." : "Post to Load Board"}
        </button>
        <button
          onClick={() => {
            if (!isValid) {
              setShowErrors(true);
              setTimeout(() => {
                const firstError = document.querySelector('[data-error="true"]');
                firstError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
              }, 50);
              return;
            }
            createLoad.mutate("DRAFT");
          }}
          disabled={createLoad.isPending}
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

interface AddrParts { address: string; city: string; state: string; zip: string; unit?: string; }

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
        <div className="absolute z-50 top-full mt-1 w-full rounded-lg max-h-48 overflow-y-auto"
          style={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(0,0,0,0.12)" }}>
          {results.map((r) => (
            <button key={r.placeId} onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 text-sm transition truncate hover:!bg-amber-50"
              style={{ color: "#334155", backgroundColor: "#fff" }}>
              <MapPin className="w-3 h-3 inline mr-1.5 text-[#C9A84C]" />{r.description}
            </button>
          ))}
          <div className="px-3 py-1 text-[9px] text-right" style={{ color: "#94a3b8" }}>Powered by Google</div>
        </div>
      )}
    </div>
  );
}
