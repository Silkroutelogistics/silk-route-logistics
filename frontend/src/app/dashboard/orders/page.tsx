"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useMutation } from "@tanstack/react-query";
import { api } from "@/lib/api";
import {
  ClipboardEdit, Search, MapPin, Package, DollarSign, CheckCircle,
  Download, ExternalLink, ChevronDown, AlertTriangle, Thermometer, Globe, Loader2,
  Plus, X, ArrowUp, ArrowDown, Hash, FileText,
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

interface Stop {
  id: string;
  type: "Pickup" | "Delivery";
  facilityName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  appointmentDate: string;
  appointmentTime: string;
}

let stopIdCounter = 0;
const makeStop = (type: "Pickup" | "Delivery"): Stop => ({
  id: `stop-${++stopIdCounter}`,
  type,
  facilityName: "",
  address: "",
  city: "",
  state: "",
  zip: "",
  appointmentDate: "",
  appointmentTime: "",
});

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
  // Reference & Handling fields
  poNumbers: [] as string[],
  bolNumber: "",
  appointmentNumber: "",
  nmfcCode: "",
  declaredValue: "",
  loadingType: "LIVE",
  stackable: false,
  turnable: false,
  dockAssignment: "",
  driverInstructions: "",
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
  const [poInput, setPoInput] = useState("");
  const [stops, setStops] = useState<Stop[]>([makeStop("Pickup"), makeStop("Delivery")]);
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

  // Sync stops → origin/destination fields
  useEffect(() => {
    const pickups = stops.filter((s) => s.type === "Pickup");
    const deliveries = stops.filter((s) => s.type === "Delivery");
    const firstPickup = pickups[0];
    const lastDelivery = deliveries[deliveries.length - 1];
    if (firstPickup && firstPickup.city) {
      setForm((f) => ({
        ...f,
        originAddress: firstPickup.address || f.originAddress,
        originCity: firstPickup.city || f.originCity,
        originState: firstPickup.state || f.originState,
        originZip: firstPickup.zip || f.originZip,
        shipperName: firstPickup.facilityName || f.shipperName,
        pickupDate: firstPickup.appointmentDate || f.pickupDate,
      }));
    }
    if (lastDelivery && lastDelivery.city) {
      setForm((f) => ({
        ...f,
        destAddress: lastDelivery.address || f.destAddress,
        destCity: lastDelivery.city || f.destCity,
        destState: lastDelivery.state || f.destState,
        destZip: lastDelivery.zip || f.destZip,
        consigneeName: lastDelivery.facilityName || f.consigneeName,
        deliveryDate: lastDelivery.appointmentDate || f.deliveryDate,
      }));
    }
  }, [stops]);

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
      // Reference & Handling fields
      if (form.poNumbers.length > 0) payload.poNumbers = form.poNumbers;
      if (form.bolNumber) payload.bolNumber = form.bolNumber;
      if (form.appointmentNumber) payload.appointmentNumber = form.appointmentNumber;
      if (form.nmfcCode) payload.nmfcCode = form.nmfcCode;
      if (form.declaredValue) payload.declaredValue = parseFloat(form.declaredValue);
      if (form.loadingType !== "LIVE") payload.loadingType = form.loadingType;
      else payload.loadingType = form.loadingType;
      if (form.stackable) payload.stackable = true;
      if (form.turnable) payload.turnable = true;
      if (form.dockAssignment) payload.dockAssignment = form.dockAssignment;
      if (form.driverInstructions) payload.driverInstructions = form.driverInstructions;
      // Multi-stop
      if (stops.length > 0) {
        payload.stops = stops.map((s, i) => ({
          sequence: i + 1,
          type: s.type.toUpperCase(),
          facilityName: s.facilityName || undefined,
          address: s.address || undefined,
          city: s.city || undefined,
          state: s.state || undefined,
          zip: s.zip || undefined,
          appointmentDate: s.appointmentDate || undefined,
          appointmentTime: s.appointmentTime || undefined,
        }));
      }

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
          <button onClick={() => { setSuccess(null); setForm(initialForm); setSelectedCustomer(null); setCustomerSearch(""); setStops([makeStop("Pickup"), makeStop("Delivery")]); setPoInput(""); }}
            className="text-sm text-slate-400 hover:text-white mt-2">
            Create Another Order
          </button>
        </div>
      </div>
    );
  }

  /* ── Shared compact input classes ── */
  const inp = "px-2.5 py-1.5 bg-white/5 border border-white/10 rounded text-xs text-white focus:outline-none focus:border-gold/50";
  const inpErr = (name: typeof requiredFields[number]) => `px-2.5 py-1.5 bg-white/5 border ${errorBorder(name)} rounded text-xs text-white focus:outline-none focus:border-gold/50`;
  const lbl = "text-[10px] text-slate-500 uppercase tracking-wider";
  const secHdr = "text-[11px] text-[#C9A84C] font-semibold uppercase tracking-wider";
  const sel = `${inp} cursor-pointer`;
  const optStyle = { backgroundColor: "#0f172a", color: "#f8fafc" } as const;

  return (
    <div className="p-3 h-[calc(100vh-48px)] flex flex-col max-w-[1600px] mx-auto">
      {/* ─── HEADER BAR ─── */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <ClipboardEdit className="w-5 h-5 text-gold" />
          <h1 className="text-base font-bold text-white">Order Builder</h1>
          <span className="text-xs text-slate-500 ml-1">Create a new load</span>
          {showErrors && !isValid && (
            <span className="ml-3 flex items-center gap-1 text-[10px] text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-0.5">
              <AlertTriangle className="w-3 h-3" /> Fill required fields
            </span>
          )}
          {createLoad.isError && <span className="ml-2 text-[10px] text-red-400">Failed to create order</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!isValid) { setShowErrors(true); setTimeout(() => { const el = document.querySelector('[data-error="true"]'); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50); return; }
              createLoad.mutate("POSTED");
            }}
            disabled={createLoad.isPending}
            className="bg-[#C9A84C] text-[#0f172a] px-4 py-2 rounded-lg text-xs font-semibold hover:bg-[#C9A84C]/90 disabled:opacity-50 transition cursor-pointer"
          >
            {createLoad.isPending ? "Creating..." : "Post to Load Board"}
          </button>
          <button
            onClick={() => {
              if (!isValid) { setShowErrors(true); setTimeout(() => { const el = document.querySelector('[data-error="true"]'); el?.scrollIntoView({ behavior: 'smooth', block: 'center' }); }, 50); return; }
              createLoad.mutate("DRAFT");
            }}
            disabled={createLoad.isPending}
            className="bg-white/10 text-white px-4 py-2 rounded-lg text-xs font-semibold hover:bg-white/20 disabled:opacity-50 transition cursor-pointer"
          >
            Save Draft
          </button>
        </div>
      </div>

      {/* ─── MAIN FORM: single card, 3-column grid ─── */}
      <div className="bg-white/[0.03] border border-white/10 rounded-xl flex-1 min-h-0 overflow-y-auto">
        <div className="grid grid-cols-[25%_45%_30%] h-full min-h-0">

          {/* ════════ LEFT COLUMN: Customer + Freight ════════ */}
          <div className="border-r border-white/5 p-3 space-y-3 overflow-y-auto">
            {/* CUSTOMER */}
            <div className="space-y-1.5">
              <p className={secHdr}>Customer</p>
              <div className="relative">
                <input
                  value={customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setShowCustomerDropdown(true); }}
                  onFocus={() => setShowCustomerDropdown(true)}
                  placeholder="Search customers..."
                  className={`w-full ${inp}`}
                />
                {showCustomerDropdown && customersData?.customers && customersData.customers.length > 0 && (
                  <div className="absolute z-10 top-full mt-1 w-full rounded-lg max-h-48 overflow-y-auto"
                    style={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(0,0,0,0.12)" }}>
                    {customersData.customers.map((c) => (
                      <button key={c.id} onClick={() => selectCustomer(c)}
                        className="w-full text-left px-2.5 py-1.5 text-xs transition cursor-pointer hover:!bg-amber-50"
                        style={{ color: "#1e293b", borderBottom: "1px solid #f1f5f9", backgroundColor: "#fff" }}>
                        <span className="font-semibold" style={{ color: "#0f172a" }}>{c.name}</span>
                        <span style={{ color: "#64748b", marginLeft: "6px" }}>- {c.contactName || "No contact"}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {selectedCustomer && (
                <div className="text-[10px] text-slate-400 bg-white/5 rounded px-2 py-1">
                  <span className="text-white font-medium">{selectedCustomer.name}</span>
                  {selectedCustomer.city && <span className="ml-1">{selectedCustomer.city}, {selectedCustomer.state}</span>}
                  {selectedCustomer.phone && <span className="ml-1">| {selectedCustomer.phone}</span>}
                </div>
              )}
            </div>

            <div className="border-b border-white/5" />

            {/* FREIGHT */}
            <div className="space-y-1.5">
              <p className={secHdr}>Freight</p>
              <div>
                <span className={lbl}>Equip</span>
                <select value={form.equipmentType} onChange={(e) => { setForm((f) => ({ ...f, equipmentType: e.target.value })); if (e.target.value === "Reefer") setTempControlled(true); }}
                  className={`w-full ${sel}`}>
                  {EQUIPMENT_TYPES.map((t) => <option key={t} value={t} style={optStyle}>{t}</option>)}
                </select>
              </div>
              <div>
                <span className={lbl}>Commodity</span>
                <input value={form.commodity} onChange={(e) => setForm((f) => ({ ...f, commodity: e.target.value }))}
                  placeholder="e.g. Auto Parts" className={`w-full ${inp}`} />
              </div>
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span className={lbl}>Class</span>
                  <select value={form.freightClass} onChange={(e) => setForm((f) => ({ ...f, freightClass: e.target.value }))}
                    className={`w-full ${sel}`}>
                    <option value="" style={optStyle}>--</option>
                    {FREIGHT_CLASSES.map((c) => <option key={c} value={c} style={optStyle}>{c}</option>)}
                  </select>
                  {suggestedClass && <span className="text-[9px] text-gold">Auto: {suggestedClass}</span>}
                </div>
                <div>
                  <span className={lbl}>NMFC</span>
                  <input value={form.nmfcCode} onChange={(e) => setForm((f) => ({ ...f, nmfcCode: e.target.value }))}
                    placeholder="70-3" className={`w-full ${inp}`} />
                </div>
              </div>

              {/* Pallet rows compact */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className={lbl}>Pallets</span>
                  <button type="button" onClick={() => setPalletRows((p) => [...p, { qty: "", l: "48", w: "40", h: "48", weight: "" }])}
                    className="text-[10px] text-gold hover:text-gold/80 font-medium cursor-pointer">+ Add Type</button>
                </div>
                {palletRows.map((row, idx) => (
                  <div key={idx} className="flex items-center gap-1">
                    <input value={row.qty} onChange={(e) => { const r = [...palletRows]; r[idx] = { ...r[idx], qty: e.target.value }; setPalletRows(r); }}
                      placeholder="Qty" type="number" className={`w-10 ${inp} text-center`} />
                    <span className="text-slate-600 text-[9px]">plt</span>
                    <input value={row.l} onChange={(e) => { const r = [...palletRows]; r[idx] = { ...r[idx], l: e.target.value }; setPalletRows(r); }}
                      placeholder="L" type="number" className={`w-9 ${inp} text-center`} />
                    <span className="text-slate-600 text-[9px]">x</span>
                    <input value={row.w} onChange={(e) => { const r = [...palletRows]; r[idx] = { ...r[idx], w: e.target.value }; setPalletRows(r); }}
                      placeholder="W" type="number" className={`w-9 ${inp} text-center`} />
                    <span className="text-slate-600 text-[9px]">x</span>
                    <input value={row.h} onChange={(e) => { const r = [...palletRows]; r[idx] = { ...r[idx], h: e.target.value }; setPalletRows(r); }}
                      placeholder="H" type="number" className={`w-9 ${inp} text-center`} />
                    <span className="text-slate-600 text-[9px]">in</span>
                    <input value={row.weight} onChange={(e) => { const r = [...palletRows]; r[idx] = { ...r[idx], weight: e.target.value }; setPalletRows(r); }}
                      placeholder="lbs" type="number" className={`w-14 ${inp} text-center`} />
                    {palletRows.length > 1 && (
                      <button type="button" onClick={() => setPalletRows((p) => p.filter((_, i) => i !== idx))}
                        className="text-red-400 hover:text-red-300 text-[10px] cursor-pointer">x</button>
                    )}
                  </div>
                ))}
              </div>

              {/* Totals row */}
              <div className="grid grid-cols-2 gap-1.5">
                <div>
                  <span className={`${lbl} flex items-center gap-1`}>
                    Wt (lbs)
                    {palletRows.some(r => r.qty && r.weight) && <span className="text-[8px] text-green-400 bg-green-400/10 px-1 rounded">Calc</span>}
                  </span>
                  <input value={form.weight} onChange={(e) => setForm((f) => ({ ...f, weight: e.target.value }))}
                    placeholder="Total" type="number" className={`w-full ${inp}`} />
                </div>
                <div>
                  <span className={lbl}>Pieces</span>
                  <input value={form.pieces} onChange={(e) => setForm((f) => ({ ...f, pieces: e.target.value }))}
                    placeholder="Pcs" type="number" className={`w-full ${inp}`} />
                </div>
              </div>

              {/* Truck dims */}
              <div>
                <span className={lbl}>Truck L x W x H (ft)</span>
                <div className="flex items-center gap-1">
                  <input value={form.length} onChange={(e) => setForm((f) => ({ ...f, length: e.target.value }))}
                    placeholder="L" type="number" className={`flex-1 ${inp} text-center`} />
                  <span className="text-slate-600 text-[9px]">x</span>
                  <input value={form.width} onChange={(e) => setForm((f) => ({ ...f, width: e.target.value }))}
                    placeholder="W" type="number" className={`flex-1 ${inp} text-center`} />
                  <span className="text-slate-600 text-[9px]">x</span>
                  <input value={form.height} onChange={(e) => setForm((f) => ({ ...f, height: e.target.value }))}
                    placeholder="H" type="number" className={`flex-1 ${inp} text-center`} />
                </div>
              </div>

              {/* Toggles */}
              <div className="flex flex-wrap gap-x-3 gap-y-1">
                <label className="flex items-center gap-1 text-[10px] text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={form.hazmat} onChange={(e) => setForm((f) => ({ ...f, hazmat: e.target.checked }))}
                    className="rounded border-white/20 bg-white/5 text-gold focus:ring-gold w-3 h-3" />
                  Hazmat
                </label>
                <label className="flex items-center gap-1 text-[10px] text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={tempControlled || form.equipmentType === "Reefer"}
                    onChange={(e) => { setTempControlled(e.target.checked); if (!e.target.checked) setForm((f) => ({ ...f, tempMin: "", tempMax: "" })); }}
                    className="rounded border-white/20 bg-white/5 text-gold focus:ring-gold w-3 h-3" />
                  Temp
                </label>
                <label className="flex items-center gap-1 text-[10px] text-slate-300 cursor-pointer">
                  <input type="checkbox" checked={form.customsRequired} onChange={(e) => setForm((f) => ({ ...f, customsRequired: e.target.checked }))}
                    className="rounded border-white/20 bg-white/5 text-gold focus:ring-gold w-3 h-3" />
                  Customs
                </label>
              </div>

              {(tempControlled || form.equipmentType === "Reefer" || form.tempMin || form.tempMax) && (
                <div className="grid grid-cols-2 gap-1.5">
                  <input value={form.tempMin} onChange={(e) => setForm((f) => ({ ...f, tempMin: e.target.value }))}
                    placeholder="Min °F" type="number" className={`w-full ${inp}`} />
                  <input value={form.tempMax} onChange={(e) => setForm((f) => ({ ...f, tempMax: e.target.value }))}
                    placeholder="Max °F" type="number" className={`w-full ${inp}`} />
                </div>
              )}
            </div>
          </div>

          {/* ════════ CENTER COLUMN: Route + Reference & Handling + Stops ════════ */}
          <div className="border-r border-white/5 p-3 space-y-3 overflow-y-auto">
            {/* ROUTE — side by side origin/dest */}
            <p className={secHdr}>Route</p>
            <div className="grid grid-cols-2 gap-3">
              {/* ORIGIN */}
              <div className="space-y-1.5">
                <span className={lbl}>Origin</span>
                {/* Shipper name with address book */}
                <div className="relative" ref={shipperBookRef}>
                  <input
                    value={form.shipperName}
                    onChange={(e) => { setForm((f) => ({ ...f, shipperName: e.target.value })); setShowShipperBook(true); }}
                    onFocus={() => setShowShipperBook(true)}
                    onBlur={() => setTimeout(() => setShowShipperBook(false), 200)}
                    placeholder="Shipper name"
                    className={`w-full ${inp} placeholder:text-slate-600`}
                  />
                  {showShipperBook && (() => {
                    const q = form.shipperName.toLowerCase();
                    const matches = getAddressBook().filter((e) => !q || e.name.toLowerCase().includes(q)).slice(0, 8);
                    if (matches.length === 0) return null;
                    return (
                      <div className="absolute z-20 top-full mt-1 w-full rounded-lg max-h-40 overflow-y-auto"
                        style={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(0,0,0,0.12)" }}>
                        <div className="px-2 py-1 text-[9px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">Saved</div>
                        {matches.map((entry, i) => (
                          <button key={i} onClick={() => {
                            setForm((f) => ({ ...f, shipperName: entry.name, originAddress: entry.address, originCity: entry.city, originState: entry.state, originZip: entry.zip }));
                            if (entry.phone) setForm((f) => ({ ...f, contactPhone: entry.phone }));
                            setShowShipperBook(false);
                          }}
                            className="w-full text-left px-2 py-1.5 text-[11px] transition cursor-pointer hover:!bg-amber-50"
                            style={{ color: "#1e293b", borderBottom: "1px solid #f1f5f9", backgroundColor: "#fff" }}>
                            <span className="font-semibold" style={{ color: "#0f172a" }}>{entry.name}</span>
                            <span style={{ color: "#64748b", marginLeft: "4px", fontSize: "10px" }}>{entry.city}, {entry.state}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <AddressAutocomplete
                  label="Search address..."
                  onSelect={(addr) => { setForm((f) => ({ ...f, originAddress: addr.address, originCity: addr.city, originState: addr.state, originZip: addr.zip, originUnit: addr.unit || f.originUnit })); if (addr.unit) setShowOriginUnit(true); }}
                  value={{ address: form.originAddress, city: form.originCity, state: form.originState, zip: form.originZip }}
                />
                {(showOriginUnit || form.originUnit) && (
                  <input value={form.originUnit} onChange={(e) => setForm((f) => ({ ...f, originUnit: e.target.value }))}
                    placeholder="Unit / Suite #" className={`w-full ${inp}`} />
                )}
                {!showOriginUnit && !form.originUnit && (
                  <button type="button" onClick={() => setShowOriginUnit(true)} className="text-[9px] text-gold hover:text-gold/80 font-medium">+ Unit</button>
                )}
                <input value={form.originAddress} onChange={(e) => setForm((f) => ({ ...f, originAddress: e.target.value }))}
                  placeholder="Street" className={`w-full ${inp}`} />
                <div className="flex gap-1" {...(isFirstError("originCity") ? { "data-error": "true" } : {})}>
                  <input value={form.originCity} onChange={(e) => setForm((f) => ({ ...f, originCity: e.target.value }))}
                    placeholder="City*" className={`flex-1 ${inpErr("originCity")}`} />
                  <input value={form.originState} onChange={(e) => setForm((f) => ({ ...f, originState: e.target.value.toUpperCase().slice(0, 2) }))}
                    placeholder="ST*" maxLength={2} className={`w-10 ${inpErr("originState")} text-center`}
                    {...(isFirstError("originState") ? { "data-error": "true" } : {})} />
                  <input value={form.originZip} onChange={(e) => setForm((f) => ({ ...f, originZip: e.target.value }))}
                    placeholder="ZIP*" className={`w-16 ${inpErr("originZip")}`}
                    {...(isFirstError("originZip") ? { "data-error": "true" } : {})} />
                </div>
                <div className="flex gap-1 items-center" {...(isFirstError("pickupDate") ? { "data-error": "true" } : {})}>
                  <span className="text-[9px] text-slate-500 shrink-0">PU:</span>
                  <input type="date" value={form.pickupDate} onChange={(e) => setForm((f) => ({ ...f, pickupDate: e.target.value }))}
                    className={`flex-1 ${inpErr("pickupDate")} [color-scheme:dark]`} />
                </div>
                <div className="flex gap-1 items-center">
                  <select value={form.pickupTimeStart} onChange={(e) => setForm((f) => ({ ...f, pickupTimeStart: e.target.value }))}
                    className={`flex-1 ${sel}`}>
                    <option value="" style={optStyle}>Start</option>
                    {TIME_OPTIONS.map(t => <option key={t} value={t} style={optStyle}>{t}</option>)}
                  </select>
                  <span className="text-[9px] text-slate-500">to</span>
                  <select value={form.pickupTimeEnd} onChange={(e) => setForm((f) => ({ ...f, pickupTimeEnd: e.target.value }))}
                    className={`flex-1 ${sel}`}>
                    <option value="" style={optStyle}>End</option>
                    {TIME_OPTIONS.map(t => <option key={t} value={t} style={optStyle}>{t}</option>)}
                  </select>
                </div>
              </div>

              {/* DESTINATION */}
              <div className="space-y-1.5">
                <span className={lbl}>Destination</span>
                <div className="relative" ref={consigneeBookRef}>
                  <input
                    value={form.consigneeName}
                    onChange={(e) => { setForm((f) => ({ ...f, consigneeName: e.target.value })); setShowConsigneeBook(true); }}
                    onFocus={() => setShowConsigneeBook(true)}
                    onBlur={() => setTimeout(() => setShowConsigneeBook(false), 200)}
                    placeholder="Consignee name"
                    className={`w-full ${inp} placeholder:text-slate-600`}
                  />
                  {showConsigneeBook && (() => {
                    const q = form.consigneeName.toLowerCase();
                    const matches = getAddressBook().filter((e) => !q || e.name.toLowerCase().includes(q)).slice(0, 8);
                    if (matches.length === 0) return null;
                    return (
                      <div className="absolute z-20 top-full mt-1 w-full rounded-lg max-h-40 overflow-y-auto"
                        style={{ backgroundColor: "#fff", border: "1px solid #e2e8f0", boxShadow: "0 10px 25px rgba(0,0,0,0.12)" }}>
                        <div className="px-2 py-1 text-[9px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-50 border-b border-slate-100">Saved</div>
                        {matches.map((entry, i) => (
                          <button key={i} onClick={() => {
                            setForm((f) => ({ ...f, consigneeName: entry.name, destAddress: entry.address, destCity: entry.city, destState: entry.state, destZip: entry.zip }));
                            setShowConsigneeBook(false);
                          }}
                            className="w-full text-left px-2 py-1.5 text-[11px] transition cursor-pointer hover:!bg-amber-50"
                            style={{ color: "#1e293b", borderBottom: "1px solid #f1f5f9", backgroundColor: "#fff" }}>
                            <span className="font-semibold" style={{ color: "#0f172a" }}>{entry.name}</span>
                            <span style={{ color: "#64748b", marginLeft: "4px", fontSize: "10px" }}>{entry.city}, {entry.state}</span>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
                <AddressAutocomplete
                  label="Search address..."
                  onSelect={(addr) => { setForm((f) => ({ ...f, destAddress: addr.address, destCity: addr.city, destState: addr.state, destZip: addr.zip, destUnit: addr.unit || f.destUnit })); if (addr.unit) setShowDestUnit(true); }}
                  value={{ address: form.destAddress, city: form.destCity, state: form.destState, zip: form.destZip }}
                />
                {(showDestUnit || form.destUnit) && (
                  <input value={form.destUnit} onChange={(e) => setForm((f) => ({ ...f, destUnit: e.target.value }))}
                    placeholder="Unit / Suite #" className={`w-full ${inp}`} />
                )}
                {!showDestUnit && !form.destUnit && (
                  <button type="button" onClick={() => setShowDestUnit(true)} className="text-[9px] text-gold hover:text-gold/80 font-medium">+ Unit</button>
                )}
                <input value={form.destAddress} onChange={(e) => setForm((f) => ({ ...f, destAddress: e.target.value }))}
                  placeholder="Street" className={`w-full ${inp}`} />
                <div className="flex gap-1" {...(isFirstError("destCity") ? { "data-error": "true" } : {})}>
                  <input value={form.destCity} onChange={(e) => setForm((f) => ({ ...f, destCity: e.target.value }))}
                    placeholder="City*" className={`flex-1 ${inpErr("destCity")}`} />
                  <input value={form.destState} onChange={(e) => setForm((f) => ({ ...f, destState: e.target.value.toUpperCase().slice(0, 2) }))}
                    placeholder="ST*" maxLength={2} className={`w-10 ${inpErr("destState")} text-center`}
                    {...(isFirstError("destState") ? { "data-error": "true" } : {})} />
                  <input value={form.destZip} onChange={(e) => setForm((f) => ({ ...f, destZip: e.target.value }))}
                    placeholder="ZIP*" className={`w-16 ${inpErr("destZip")}`}
                    {...(isFirstError("destZip") ? { "data-error": "true" } : {})} />
                </div>
                <div className="flex gap-1 items-center" {...(isFirstError("deliveryDate") ? { "data-error": "true" } : {})}>
                  <span className="text-[9px] text-slate-500 shrink-0">DEL:</span>
                  <input type="date" value={form.deliveryDate} onChange={(e) => setForm((f) => ({ ...f, deliveryDate: e.target.value }))}
                    className={`flex-1 ${inpErr("deliveryDate")} [color-scheme:dark]`} />
                </div>
                <div className="flex gap-1 items-center">
                  <select value={form.deliveryTimeStart} onChange={(e) => setForm((f) => ({ ...f, deliveryTimeStart: e.target.value }))}
                    className={`flex-1 ${sel}`}>
                    <option value="" style={optStyle}>Start</option>
                    {TIME_OPTIONS.map(t => <option key={t} value={t} style={optStyle}>{t}</option>)}
                  </select>
                  <span className="text-[9px] text-slate-500">to</span>
                  <select value={form.deliveryTimeEnd} onChange={(e) => setForm((f) => ({ ...f, deliveryTimeEnd: e.target.value }))}
                    className={`flex-1 ${sel}`}>
                    <option value="" style={optStyle}>End</option>
                    {TIME_OPTIONS.map(t => <option key={t} value={t} style={optStyle}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Distance */}
            <div className="flex items-center gap-2">
              <span className={`${lbl} shrink-0`}>Distance:</span>
              <input value={form.distance} onChange={(e) => { setForm((f) => ({ ...f, distance: e.target.value })); setDistanceManual(true); setDistanceAutoFilled(false); }}
                placeholder="mi" type="number" className={`w-20 ${inp}`} />
              {distanceAutoFilled && <span className="text-[9px] text-green-400">Calc</span>}
            </div>

            <div className="border-b border-white/5" />

            {/* REFERENCE & HANDLING */}
            <p className={secHdr}>Reference &amp; Handling</p>
            <div className="grid grid-cols-3 gap-1.5">
              {/* PO Numbers */}
              <div>
                <span className={lbl}>PO#</span>
                {form.poNumbers.length > 0 && (
                  <div className="flex flex-wrap gap-1 mb-1">
                    {form.poNumbers.map((po, i) => (
                      <span key={i} className="flex items-center gap-0.5 px-1.5 py-0 bg-gold/10 text-gold text-[10px] rounded-full">
                        {po}
                        <button type="button" onClick={() => setForm((f) => ({ ...f, poNumbers: f.poNumbers.filter((_, j) => j !== i) }))}
                          className="hover:text-red-400 cursor-pointer"><X className="w-2.5 h-2.5" /></button>
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-0.5">
                  <input value={poInput} onChange={(e) => setPoInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && poInput.trim()) { e.preventDefault(); setForm((f) => ({ ...f, poNumbers: [...f.poNumbers, poInput.trim()] })); setPoInput(""); } }}
                    placeholder="PO-001" className={`flex-1 min-w-0 ${inp}`} />
                  <button type="button" onClick={() => { if (poInput.trim()) { setForm((f) => ({ ...f, poNumbers: [...f.poNumbers, poInput.trim()] })); setPoInput(""); } }}
                    className="px-1.5 py-1 bg-gold/20 text-gold rounded hover:bg-gold/30 transition cursor-pointer" title="Add PO">
                    <Plus className="w-3 h-3" />
                  </button>
                </div>
              </div>
              <div>
                <span className={lbl}>BOL</span>
                <input value={form.bolNumber} onChange={(e) => setForm((f) => ({ ...f, bolNumber: e.target.value }))}
                  placeholder="BOL-XXX" className={`w-full ${inp}`} />
              </div>
              <div>
                <span className={lbl}>Appt #</span>
                <input value={form.appointmentNumber} onChange={(e) => setForm((f) => ({ ...f, appointmentNumber: e.target.value }))}
                  placeholder="APT-XXX" className={`w-full ${inp}`} />
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1.5 items-end">
              <div>
                <span className={lbl}>Load</span>
                <select value={form.loadingType} onChange={(e) => setForm((f) => ({ ...f, loadingType: e.target.value }))}
                  className={`w-full ${sel}`}>
                  <option value="LIVE" style={optStyle}>Live</option>
                  <option value="DROP" style={optStyle}>Drop</option>
                  <option value="DROP_HOOK" style={optStyle}>Drop&Hook</option>
                </select>
              </div>
              <label className="flex items-center gap-1 text-[10px] text-slate-300 cursor-pointer py-1.5">
                <input type="checkbox" checked={form.stackable} onChange={(e) => setForm((f) => ({ ...f, stackable: e.target.checked }))}
                  className="rounded border-white/20 bg-white/5 text-gold focus:ring-gold w-3 h-3" />
                Stack
              </label>
              <label className="flex items-center gap-1 text-[10px] text-slate-300 cursor-pointer py-1.5">
                <input type="checkbox" checked={form.turnable} onChange={(e) => setForm((f) => ({ ...f, turnable: e.target.checked }))}
                  className="rounded border-white/20 bg-white/5 text-gold focus:ring-gold w-3 h-3" />
                Turn
              </label>
              <div>
                <span className={lbl}>Value $</span>
                <input value={form.declaredValue} onChange={(e) => setForm((f) => ({ ...f, declaredValue: e.target.value }))}
                  placeholder="50000" type="number" className={`w-full ${inp}`} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <div>
                <span className={lbl}>Dock</span>
                <input value={form.dockAssignment} onChange={(e) => setForm((f) => ({ ...f, dockAssignment: e.target.value }))}
                  placeholder="Dock 12" className={`w-full ${inp}`} />
              </div>
              <div>
                <span className={lbl}>Driver Instr.</span>
                <input value={form.driverInstructions} onChange={(e) => setForm((f) => ({ ...f, driverInstructions: e.target.value }))}
                  placeholder="Call 30min before" className={`w-full ${inp}`} />
              </div>
            </div>

            <div className="border-b border-white/5" />

            {/* STOPS */}
            <div className="flex items-center justify-between">
              <p className={secHdr}>Stops</p>
              <button type="button" onClick={() => setStops((prev) => [...prev, makeStop(prev.length === 0 ? "Pickup" : "Delivery")])}
                className="text-[10px] text-gold hover:text-gold/80 font-medium cursor-pointer flex items-center gap-0.5">
                <Plus className="w-3 h-3" /> Add
              </button>
            </div>
            {/* Stop header */}
            <div className="grid grid-cols-[20px_60px_1fr_1fr_90px_70px_20px_20px] gap-1 text-[9px] text-slate-500 uppercase tracking-wider">
              <span>#</span><span>Type</span><span>Facility</span><span>City,ST,ZIP</span><span>Date</span><span>Time</span><span></span><span></span>
            </div>
            {stops.map((stop, idx) => (
              <div key={stop.id} className="grid grid-cols-[20px_60px_1fr_1fr_90px_70px_20px_20px] gap-1 items-center">
                <span className="text-[10px] text-slate-500 font-mono text-center">{idx + 1}</span>
                <select value={stop.type} onChange={(e) => { const u = [...stops]; u[idx] = { ...u[idx], type: e.target.value as "Pickup" | "Delivery" }; setStops(u); }}
                  className={`${sel} px-1`}>
                  <option value="Pickup" style={optStyle}>PU</option>
                  <option value="Delivery" style={optStyle}>DL</option>
                </select>
                <div className="relative">
                  <input value={stop.facilityName} onChange={(e) => { const u = [...stops]; u[idx] = { ...u[idx], facilityName: e.target.value }; setStops(u); }}
                    placeholder="Facility" className={`w-full ${inp}`} list={`stop-book-${idx}`} onFocus={() => {}} />
                  <datalist id={`stop-book-${idx}`}>
                    {getAddressBook().slice(0, 10).map((e, i) => (
                      <option key={i} value={e.name}>{e.city}, {e.state} {e.zip}</option>
                    ))}
                  </datalist>
                </div>
                <div className="flex gap-0.5">
                  <input value={stop.city} onChange={(e) => { const u = [...stops]; u[idx] = { ...u[idx], city: e.target.value }; setStops(u); }}
                    placeholder="City" className={`flex-1 min-w-0 ${inp}`} />
                  <input value={stop.state} onChange={(e) => { const u = [...stops]; u[idx] = { ...u[idx], state: e.target.value.toUpperCase().slice(0, 2) }; setStops(u); }}
                    placeholder="ST" maxLength={2} className={`w-8 ${inp} text-center`} />
                  <input value={stop.zip} onChange={(e) => { const u = [...stops]; u[idx] = { ...u[idx], zip: e.target.value }; setStops(u); }}
                    placeholder="ZIP" className={`w-12 ${inp}`} />
                </div>
                <input type="date" value={stop.appointmentDate} onChange={(e) => { const u = [...stops]; u[idx] = { ...u[idx], appointmentDate: e.target.value }; setStops(u); }}
                  className={`${inp} [color-scheme:dark]`} />
                <select value={stop.appointmentTime} onChange={(e) => { const u = [...stops]; u[idx] = { ...u[idx], appointmentTime: e.target.value }; setStops(u); }}
                  className={`${sel}`}>
                  <option value="" style={optStyle}>--</option>
                  {TIME_OPTIONS.map((t) => <option key={t} value={t} style={optStyle}>{t}</option>)}
                </select>
                <div className="flex flex-col">
                  {idx > 0 && (
                    <button type="button" onClick={() => { const u = [...stops]; [u[idx - 1], u[idx]] = [u[idx], u[idx - 1]]; setStops(u); }}
                      className="text-slate-500 hover:text-white transition cursor-pointer" title="Move up">
                      <ArrowUp className="w-2.5 h-2.5" />
                    </button>
                  )}
                  {idx < stops.length - 1 && (
                    <button type="button" onClick={() => { const u = [...stops]; [u[idx], u[idx + 1]] = [u[idx + 1], u[idx]]; setStops(u); }}
                      className="text-slate-500 hover:text-white transition cursor-pointer" title="Move down">
                      <ArrowDown className="w-2.5 h-2.5" />
                    </button>
                  )}
                </div>
                <div>
                  {stops.length > 2 && (
                    <button type="button" onClick={() => setStops((prev) => prev.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-300 transition cursor-pointer" title="Remove">
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
            ))}
            <button type="button" onClick={() => setStops((prev) => [...prev, makeStop("Delivery")])}
              className="w-full py-1 border border-dashed border-white/10 rounded text-[10px] text-slate-400 hover:text-gold hover:border-gold/30 transition cursor-pointer">
              + Add Stop
            </button>
          </div>

          {/* ════════ RIGHT COLUMN: Rate + Contact + Instructions ════════ */}
          <div className="p-3 space-y-3 overflow-y-auto">
            <p className={secHdr}>Rate &amp; Pricing</p>
            <div {...(isFirstError("rate") ? { "data-error": "true" } : {})}>
              <span className={lbl}>Rate ($)*</span>
              <input value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))}
                placeholder="1800" type="number" className={`w-full ${inpErr("rate")}`} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-slate-500">$/mi:</span>
              <span className="text-sm font-bold text-gold">${ratePerMile}</span>
            </div>

            <div className="border-b border-white/5" />

            <p className={secHdr}>Contact</p>
            <div>
              <span className={lbl}>Name</span>
              <input value={form.contactName} onChange={(e) => setForm((f) => ({ ...f, contactName: e.target.value }))}
                placeholder="Contact name" className={`w-full ${inp}`} />
            </div>
            <div>
              <span className={lbl}>Phone</span>
              <input value={form.contactPhone} onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                placeholder="Contact phone" className={`w-full ${inp}`} />
            </div>

            <div className="border-b border-white/5" />

            <p className={secHdr}>Instructions</p>
            <textarea value={form.specialInstructions} onChange={(e) => setForm((f) => ({ ...f, specialInstructions: e.target.value }))}
              placeholder="Special instructions..." rows={4}
              className={`w-full ${inp} resize-none`} />

            <div>
              <span className={lbl}>Notes</span>
              <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Internal notes..." rows={3}
                className={`w-full ${inp} resize-none`} />
            </div>
          </div>

        </div>
      </div>
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
