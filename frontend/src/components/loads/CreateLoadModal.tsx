"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { X, ChevronRight, ChevronLeft, Check, MapPin, AlertTriangle } from "lucide-react";

const EQUIPMENT_TYPES = ["Dry Van", "Reefer", "Flatbed", "Step Deck", "Car Hauler", "Power Only"];
const FREIGHT_CLASSES = ["50", "55", "60", "65", "70", "77.5", "85", "92.5", "100", "110", "125", "150", "175", "200", "250", "300", "400", "500"];
const ACCESSORIALS = [
  "Detention-Pickup", "Detention-Delivery", "Lumper-Pickup", "Lumper-Delivery",
  "Liftgate", "Inside Delivery", "Inside Pickup", "Residential", "TONU",
  "Layover", "Driver Assist", "Tarping", "Hazmat Fee", "Reefer Fuel",
  "Stop-Off", "Customs/Border", "Scale Ticket", "Pallet Exchange", "Reconsignment", "Other",
];
const BOND_TYPES = ["Single Entry", "Continuous"];
const BORDER_CROSSINGS = [
  "Port Huron / Sarnia", "Detroit / Windsor", "Buffalo / Fort Erie",
  "Champlain / Lacolle", "Pacific Highway / Douglas", "Laredo / Nuevo Laredo", "Other",
];
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];
const CA_PROVINCES = ["AB","BC","MB","NB","NL","NT","NS","NU","ON","PE","QC","SK","YT"];
const NON_PERISHABLE = ["auto parts", "steel", "lumber", "paper", "electronics", "furniture", "machinery", "plastics"];

interface Props { open: boolean; onClose: () => void; }

export function CreateLoadModal({ open, onClose }: Props) {
  const [step, setStep] = useState(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [attempted, setAttempted] = useState<Record<number, boolean>>({});
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    originCity: "", originState: "", originZip: "",
    destCity: "", destState: "", destZip: "",
    pickupDate: "", deliveryDate: "", distance: "",
    shipmentType: "DOMESTIC" as "DOMESTIC" | "CROSS_BORDER",
    borderCrossingPoint: "", customsBrokerName: "", customsBrokerPhone: "",
    bondType: "", parsPapsNumber: "",
    equipmentType: "Dry Van", commodity: "", weight: "", pieces: "",
    length: "", width: "", height: "",
    freightClass: "",
    hazmat: false, hazmatUnNumber: "", hazmatClass: "", hazmatPlacardRequired: false, hazmatEmergencyContact: "",
    temperatureControlled: false, tempMin: "", tempMax: "", tempContinuousMonitoring: false,
    customsRequired: false,
    rate: "", accessorials: [] as string[], specialInstructions: "",
    contactName: "", contactPhone: "", contactEmail: "",
  });

  const [distanceLoading, setDistanceLoading] = useState(false);
  const [distanceAuto, setDistanceAuto] = useState(false);
  const distanceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const update = (field: string, value: string | boolean | string[]) => {
    setForm((f) => ({ ...f, [field]: value }));
    // Clear error for this field when user types
    if (errors[field]) {
      setErrors((e) => { const n = { ...e }; delete n[field]; return n; });
    }
  };

  const [distanceError, setDistanceError] = useState("");

  // Auto-calculate distance when both addresses are complete
  useEffect(() => {
    const { originCity, originState, originZip, destCity, destState, destZip } = form;
    if (!originCity || !originState || !originZip || !destCity || !destState || !destZip) return;

    if (distanceTimerRef.current) clearTimeout(distanceTimerRef.current);
    distanceTimerRef.current = setTimeout(async () => {
      setDistanceLoading(true);
      setDistanceError("");
      try {
        const res = await api.get("/loads/distance", { params: { originCity, originState, originZip, destCity, destState, destZip } });
        if (res.data.distanceMiles) {
          setForm((f) => ({ ...f, distance: String(res.data.distanceMiles) }));
          setDistanceAuto(true);
        } else {
          setDistanceError("Could not calculate");
        }
      } catch {
        setDistanceError("Auto-calc failed");
      }
      setDistanceLoading(false);
    }, 500);

    return () => { if (distanceTimerRef.current) clearTimeout(distanceTimerRef.current); };
  }, [form.originCity, form.originState, form.originZip, form.destCity, form.destState, form.destZip]);

  // Cross-border auto-enables customs
  useEffect(() => {
    if (form.shipmentType === "CROSS_BORDER" && !form.customsRequired) {
      update("customsRequired", true);
    }
  }, [form.shipmentType]);

  const toggleAccessorial = (a: string) => {
    setForm((f) => ({
      ...f,
      accessorials: f.accessorials.includes(a) ? f.accessorials.filter((x) => x !== a) : [...f.accessorials, a],
    }));
  };

  const mutation = useMutation({
    mutationFn: (status: string) => {
      const payload: Record<string, unknown> = {
        originCity: form.originCity, originState: form.originState, originZip: form.originZip,
        destCity: form.destCity, destState: form.destState, destZip: form.destZip,
        pickupDate: form.pickupDate, deliveryDate: form.deliveryDate,
        equipmentType: form.equipmentType, commodity: form.commodity || undefined,
        rate: parseFloat(form.rate),
        customerRate: parseFloat(form.rate),
        status,
        shipmentType: form.shipmentType,
      };
      if (form.distance) payload.distance = parseFloat(form.distance);
      if (form.weight) payload.weight = parseFloat(form.weight);
      if (form.pieces) payload.pieces = parseInt(form.pieces);
      if (form.length) payload.length = parseFloat(form.length);
      if (form.width) payload.width = parseFloat(form.width);
      if (form.height) payload.height = parseFloat(form.height);
      if (form.freightClass) payload.freightClass = form.freightClass;
      if (form.hazmat) {
        payload.hazmat = true;
        if (form.hazmatUnNumber) payload.hazmatUnNumber = form.hazmatUnNumber;
        if (form.hazmatClass) payload.hazmatClass = form.hazmatClass;
        payload.hazmatPlacardRequired = form.hazmatPlacardRequired;
        if (form.hazmatEmergencyContact) payload.hazmatEmergencyContact = form.hazmatEmergencyContact;
      }
      if (form.temperatureControlled) {
        payload.temperatureControlled = true;
        if (form.tempMin) payload.tempMin = parseFloat(form.tempMin);
        if (form.tempMax) payload.tempMax = parseFloat(form.tempMax);
        payload.tempContinuousMonitoring = form.tempContinuousMonitoring;
      }
      if (form.customsRequired) {
        payload.customsRequired = true;
        if (form.borderCrossingPoint) payload.borderCrossingPoint = form.borderCrossingPoint;
        if (form.customsBrokerName) payload.customsBrokerName = form.customsBrokerName;
        if (form.customsBrokerPhone) payload.customsBrokerPhone = form.customsBrokerPhone;
        if (form.bondType) payload.bondType = form.bondType;
        if (form.parsPapsNumber) payload.parsPapsNumber = form.parsPapsNumber;
      }
      if (form.accessorials.length) payload.accessorials = form.accessorials;
      if (form.specialInstructions) payload.specialInstructions = form.specialInstructions;
      if (form.contactName) payload.contactName = form.contactName;
      if (form.contactPhone) payload.contactPhone = form.contactPhone;
      if (form.contactEmail) payload.contactEmail = form.contactEmail;
      return api.post("/loads", payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["loads"] }); onClose(); setStep(1); },
    onError: (err: unknown) => {
      const message = (err as { response?: { data?: { error?: string } } })?.response?.data?.error || "Failed to create load";
      setErrors({ submit: message });
    },
  });

  const ratePerMile = form.rate && form.distance ? (parseFloat(form.rate) / parseFloat(form.distance)).toFixed(2) : "--";

  // Validation
  const validateStep = (s: number): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (s === 1) {
      if (!form.originCity) errs.originCity = "Required";
      if (!form.originState) errs.originState = "Required";
      if (!form.originZip) errs.originZip = "Required";
      if (!form.destCity) errs.destCity = "Required";
      if (!form.destState) errs.destState = "Required";
      if (!form.destZip) errs.destZip = "Required";
      if (!form.pickupDate) errs.pickupDate = "Required";
      else if (form.pickupDate < new Date().toISOString().split("T")[0]) errs.pickupDate = "Cannot be in the past";
      if (!form.deliveryDate) errs.deliveryDate = "Required";
      else if (form.deliveryDate < form.pickupDate) errs.deliveryDate = "Must be after pickup";
    } else if (s === 2) {
      if (!form.equipmentType) errs.equipmentType = "Required";
      if (!form.commodity) errs.commodity = "Required";
      if (!form.weight) errs.weight = "Required";
    } else if (s === 3) {
      if (!form.rate || parseFloat(form.rate) <= 0) errs.rate = "Required";
      if (!form.contactName) errs.contactName = "Required";
      if (!form.contactPhone) errs.contactPhone = "Required";
    }
    return errs;
  };

  const canProceed = Object.keys(validateStep(step)).length === 0;

  const handleNext = () => {
    const errs = validateStep(step);
    setAttempted((a) => ({ ...a, [step]: true }));
    if (Object.keys(errs).length > 0) {
      setErrors(errs);
      return;
    }
    setErrors({});
    setStep((s) => s + 1);
  };

  // Soft warning for reefer + non-perishable
  const showReeferWarning = form.equipmentType === "Reefer" && form.commodity &&
    NON_PERISHABLE.some((np) => form.commodity.toLowerCase().includes(np));

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Create Load — Step {step} of 4</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Step indicators - completed steps clickable */}
        <div className="flex px-6 py-3 gap-2">
          {["Route", "Freight", "Pricing", "Review"].map((s, i) => (
            <button
              key={s}
              onClick={() => { if (i + 1 < step) setStep(i + 1); }}
              disabled={i + 1 > step}
              className={`flex-1 text-center text-xs py-1.5 rounded transition ${
                step > i + 1 ? "bg-green-500/20 text-green-400 cursor-pointer hover:bg-green-500/30"
                : step === i + 1 ? "bg-gold/20 text-gold"
                : "bg-white/5 text-slate-500 cursor-not-allowed"
              }`}
            >
              {step > i + 1 && <Check className="w-3 h-3 inline mr-1" />}{s}
            </button>
          ))}
        </div>

        <div className="px-6 py-4 space-y-4">
          {step === 1 && (
            <>
              <h3 className="text-sm font-medium text-slate-300">Origin</h3>
              <AddressAutocomplete
                label="Search address..."
                onSelect={(addr) => { update("originCity", addr.city); update("originState", addr.state); update("originZip", addr.zip); }}
              />
              <div className="grid grid-cols-3 gap-3">
                <Input label="City" value={form.originCity} onChange={(v) => update("originCity", v)} required error={attempted[1] ? errors.originCity : undefined} />
                <StateSelect label="State/Province" value={form.originState} onChange={(v) => update("originState", v)} required error={attempted[1] ? errors.originState : undefined} />
                <Input label="Zip/Postal" value={form.originZip} onChange={(v) => update("originZip", v)} required error={attempted[1] ? errors.originZip : undefined} />
              </div>
              <h3 className="text-sm font-medium text-slate-300 mt-4">Destination</h3>
              <AddressAutocomplete
                label="Search address..."
                onSelect={(addr) => { update("destCity", addr.city); update("destState", addr.state); update("destZip", addr.zip); }}
              />
              <div className="grid grid-cols-3 gap-3">
                <Input label="City" value={form.destCity} onChange={(v) => update("destCity", v)} required error={attempted[1] ? errors.destCity : undefined} />
                <StateSelect label="State/Province" value={form.destState} onChange={(v) => update("destState", v)} required error={attempted[1] ? errors.destState : undefined} />
                <Input label="Zip/Postal" value={form.destZip} onChange={(v) => update("destZip", v)} required error={attempted[1] ? errors.destZip : undefined} />
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                <Input label="Pickup Date" value={form.pickupDate} onChange={(v) => update("pickupDate", v)} type="date" required error={attempted[1] ? errors.pickupDate : undefined} min={new Date().toISOString().split("T")[0]} />
                <Input label="Delivery Date" value={form.deliveryDate} onChange={(v) => update("deliveryDate", v)} type="date" required error={attempted[1] ? errors.deliveryDate : undefined} min={form.pickupDate || new Date().toISOString().split("T")[0]} />
                <div className="relative">
                  <Input label="Distance (mi)" value={form.distance} onChange={(v) => { update("distance", v); setDistanceAuto(false); setDistanceError(""); }} type="number" />
                  {distanceLoading && <div className="absolute right-3 top-7 w-4 h-4 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />}
                  {distanceAuto && form.distance && !distanceLoading && <span className="absolute right-3 top-7 text-[10px] text-green-400 font-medium">Auto</span>}
                  {distanceError && !distanceLoading && !distanceAuto && <span className="absolute right-3 top-7 text-[10px] text-amber-400">{distanceError}</span>}
                </div>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              {/* Shipment Type */}
              <div>
                <label className="block text-xs text-slate-400 mb-2">Shipment Type</label>
                <div className="flex gap-3">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="shipmentType"
                      checked={form.shipmentType === "DOMESTIC"}
                      onChange={() => update("shipmentType", "DOMESTIC")}
                      className="accent-[#C8963E]"
                    />
                    <span className="text-sm text-slate-300">Domestic</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="shipmentType"
                      checked={form.shipmentType === "CROSS_BORDER"}
                      onChange={() => update("shipmentType", "CROSS_BORDER")}
                      className="accent-[#C8963E]"
                    />
                    <span className="text-sm text-slate-300">Cross Border (USA ↔ Canada)</span>
                  </label>
                </div>
              </div>

              {/* Cross-border fields */}
              {form.shipmentType === "CROSS_BORDER" && (
                <div className="bg-blue-500/5 border border-blue-500/20 rounded-lg p-4 space-y-3">
                  <h4 className="text-xs font-medium text-blue-400">Cross-Border Details</h4>
                  <Select label="Border Crossing Point" value={form.borderCrossingPoint} onChange={(v) => update("borderCrossingPoint", v)} options={BORDER_CROSSINGS} />
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Customs Broker Name" value={form.customsBrokerName} onChange={(v) => update("customsBrokerName", v)} />
                    <Input label="Customs Broker Phone" value={form.customsBrokerPhone} onChange={(v) => update("customsBrokerPhone", v)} />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Select label="Bond Type" value={form.bondType} onChange={(v) => update("bondType", v)} options={["", ...BOND_TYPES]} />
                    <Input label="PARS/PAPS Number" value={form.parsPapsNumber} onChange={(v) => update("parsPapsNumber", v)} />
                  </div>
                </div>
              )}

              <Select label="Equipment Type" value={form.equipmentType} onChange={(v) => update("equipmentType", v)} options={EQUIPMENT_TYPES} required error={attempted[2] ? errors.equipmentType : undefined} />
              <Input label="Commodity" value={form.commodity} onChange={(v) => update("commodity", v)} placeholder="e.g. Auto Parts, Frozen Foods" required error={attempted[2] ? errors.commodity : undefined} />

              {showReeferWarning && (
                <div className="flex items-center gap-2 p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <AlertTriangle className="w-4 h-4 text-yellow-400 shrink-0" />
                  <span className="text-xs text-yellow-400">Reefer selected but commodity appears non-perishable. Double-check equipment type.</span>
                </div>
              )}

              <div className="grid grid-cols-3 gap-3">
                <Input label="Weight (lbs)" value={form.weight} onChange={(v) => update("weight", v)} type="number" required error={attempted[2] ? errors.weight : undefined} />
                <Input label="Pieces" value={form.pieces} onChange={(v) => update("pieces", v)} type="number" />
                <Select label="Freight Class" value={form.freightClass} onChange={(v) => update("freightClass", v)} options={["", ...FREIGHT_CLASSES]} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Length (ft)" value={form.length} onChange={(v) => update("length", v)} type="number" />
                <Input label="Width (ft)" value={form.width} onChange={(v) => update("width", v)} type="number" />
                <Input label="Height (ft)" value={form.height} onChange={(v) => update("height", v)} type="number" />
              </div>

              {/* Toggle buttons - fixed with proper onClick */}
              <div className="flex flex-wrap gap-4 mt-2">
                <Toggle label="Hazmat" checked={form.hazmat} onChange={(v) => update("hazmat", v)} />
                <Toggle label="Temperature Controlled" checked={form.temperatureControlled} onChange={(v) => {
                  update("temperatureControlled", v);
                  if (v) { update("tempMin", "33"); update("tempMax", "40"); }
                  else { update("tempMin", ""); update("tempMax", ""); }
                }} />
                <Toggle label="Customs Required" checked={form.customsRequired} onChange={(v) => update("customsRequired", v)} />
              </div>

              {/* Hazmat details */}
              {form.hazmat && (
                <div className="bg-red-500/5 border border-red-500/20 rounded-lg p-4 space-y-3">
                  <h4 className="text-xs font-medium text-red-400">Hazmat Details</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="UN Number" value={form.hazmatUnNumber} onChange={(v) => update("hazmatUnNumber", v)} placeholder="UN1234" />
                    <Input label="Hazmat Class" value={form.hazmatClass} onChange={(v) => update("hazmatClass", v)} placeholder="e.g. Class 3" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Emergency Contact Phone" value={form.hazmatEmergencyContact} onChange={(v) => update("hazmatEmergencyContact", v)} />
                    <div className="flex items-end pb-2">
                      <Toggle label="Placard Required" checked={form.hazmatPlacardRequired} onChange={(v) => update("hazmatPlacardRequired", v)} />
                    </div>
                  </div>
                </div>
              )}

              {/* Temperature details */}
              {form.temperatureControlled && (
                <div className="bg-cyan-500/5 border border-cyan-500/20 rounded-lg p-4 space-y-3">
                  <h4 className="text-xs font-medium text-cyan-400">Temperature Requirements</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <Input label="Min Temp (°F)" value={form.tempMin} onChange={(v) => update("tempMin", v)} type="number" />
                    <Input label="Max Temp (°F)" value={form.tempMax} onChange={(v) => update("tempMax", v)} type="number" />
                  </div>
                  <Toggle label="Continuous Monitoring" checked={form.tempContinuousMonitoring} onChange={(v) => update("tempContinuousMonitoring", v)} />
                </div>
              )}

              {/* Customs details (when not cross-border but manually enabled) */}
              {form.customsRequired && form.shipmentType !== "CROSS_BORDER" && (
                <Select label="Bond Type" value={form.bondType} onChange={(v) => update("bondType", v)} options={["", ...BOND_TYPES]} />
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Customer Rate ($)" value={form.rate} onChange={(v) => update("rate", v)} type="number" required error={attempted[3] ? errors.rate : undefined} />
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Rate/Mile</label>
                  <div className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm">${ratePerMile}</div>
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-2">Accessorials</label>
                <div className="flex flex-wrap gap-2">
                  {ACCESSORIALS.map((a) => (
                    <button key={a} onClick={() => toggleAccessorial(a)}
                      className={`px-3 py-1.5 text-xs rounded-full border transition ${form.accessorials.includes(a) ? "bg-gold/20 border-gold text-gold" : "border-white/10 text-slate-400 hover:border-white/30"}`}>
                      {a}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-400 mb-1">Special Instructions</label>
                <textarea value={form.specialInstructions} onChange={(e) => update("specialInstructions", e.target.value)}
                  className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm min-h-[80px] focus:outline-none focus:border-gold/50" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Shipper Contact" value={form.contactName} onChange={(v) => update("contactName", v)} placeholder="Name" required error={attempted[3] ? errors.contactName : undefined} />
                <Input label="Phone" value={form.contactPhone} onChange={(v) => update("contactPhone", v)} placeholder="(xxx) xxx-xxxx" required error={attempted[3] ? errors.contactPhone : undefined} />
                <Input label="Email" value={form.contactEmail} onChange={(v) => update("contactEmail", v)} placeholder="email@example.com" />
              </div>
            </>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gold">Review Load Details</h3>
              {errors.submit && <div className="p-3 bg-red-500/10 border border-red-500/20 text-red-400 rounded-lg text-sm">{errors.submit}</div>}

              {/* Route Details */}
              <div className="bg-white/5 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-slate-400 uppercase">Route Details</h4>
                  <button onClick={() => setStep(1)} className="text-xs text-gold hover:underline">Edit</button>
                </div>
                <Row label="Route" value={`${form.originCity}, ${form.originState} ${form.originZip} → ${form.destCity}, ${form.destState} ${form.destZip}`} />
                <Row label="Pickup" value={form.pickupDate} />
                <Row label="Delivery" value={form.deliveryDate} />
                <Row label="Distance" value={form.distance ? `${form.distance} mi` : "—"} />
                {form.shipmentType === "CROSS_BORDER" && (
                  <>
                    <Row label="Type" value="Cross Border" />
                    {form.borderCrossingPoint && <Row label="Border Crossing" value={form.borderCrossingPoint} />}
                  </>
                )}
              </div>

              {/* Freight Details */}
              <div className="bg-white/5 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-slate-400 uppercase">Freight Details</h4>
                  <button onClick={() => setStep(2)} className="text-xs text-gold hover:underline">Edit</button>
                </div>
                <Row label="Equipment" value={form.equipmentType} />
                <Row label="Commodity" value={form.commodity || "—"} />
                <Row label="Weight" value={form.weight ? `${form.weight} lbs` : "—"} />
                {form.hazmat && <Row label="Hazmat" value={`Yes${form.hazmatClass ? ` — ${form.hazmatClass}` : ""}`} />}
                {form.temperatureControlled && <Row label="Temperature" value={`${form.tempMin}°F - ${form.tempMax}°F`} />}
                {form.customsRequired && <Row label="Customs" value={`Required${form.bondType ? ` — ${form.bondType}` : ""}`} />}
              </div>

              {/* Pricing & Contact */}
              <div className="bg-white/5 rounded-lg p-4 space-y-2 text-sm">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-medium text-slate-400 uppercase">Pricing & Contact</h4>
                  <button onClick={() => setStep(3)} className="text-xs text-gold hover:underline">Edit</button>
                </div>
                <Row label="Rate" value={`$${parseFloat(form.rate || "0").toLocaleString()} (${ratePerMile}/mi)`} />
                {form.accessorials.length > 0 && <Row label="Accessorials" value={form.accessorials.join(", ")} />}
                {form.specialInstructions && <Row label="Instructions" value={form.specialInstructions} />}
                {form.contactName && <Row label="Contact" value={`${form.contactName} ${form.contactPhone}${form.contactEmail ? ` — ${form.contactEmail}` : ""}`} />}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between">
          {step > 1 ? (
            <button onClick={() => setStep((s) => s - 1)} className="flex items-center gap-1 text-sm text-slate-400 hover:text-white">
              <ChevronLeft className="w-4 h-4" /> Back
            </button>
          ) : <div />}
          <div className="flex gap-3">
            {step === 4 ? (
              <>
                <button onClick={() => mutation.mutate("DRAFT")} disabled={mutation.isPending}
                  className="px-4 py-2 text-sm bg-white/10 text-white rounded-lg hover:bg-white/20 disabled:opacity-50">Save Draft</button>
                <button onClick={() => mutation.mutate("POSTED")} disabled={mutation.isPending}
                  className="flex items-center gap-2 px-5 py-2 text-sm bg-gold text-navy font-medium rounded-lg hover:bg-gold/90 disabled:opacity-50">
                  <Check className="w-4 h-4" /> Post to Load Board
                </button>
              </>
            ) : (
              <button onClick={handleNext}
                className="flex items-center gap-1 px-5 py-2 text-sm font-medium rounded-lg transition bg-gold text-navy hover:bg-gold/90">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder, required, error, min }: {
  label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean; error?: string; min?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} min={min}
        className={`w-full px-3 py-2 bg-white/5 border rounded-lg text-white text-sm focus:outline-none focus:border-gold/50 ${error ? "border-red-500/50" : "border-white/10"}`} />
      {error && <p className="text-red-400 text-[10px] mt-0.5">{error}</p>}
    </div>
  );
}

function Select({ label, value, onChange, options, required, error }: {
  label: string; value: string; onChange: (v: string) => void; options: string[]; required?: boolean; error?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 bg-white/5 border rounded-lg text-white text-sm focus:outline-none focus:border-gold/50 ${error ? "border-red-500/50" : "border-white/10"}`}>
        <option value="" className="bg-navy">Select...</option>
        {options.filter(Boolean).map((o) => <option key={o} value={o} className="bg-navy">{o}</option>)}
      </select>
      {error && <p className="text-red-400 text-[10px] mt-0.5">{error}</p>}
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange(!checked); }}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onChange(!checked); } }}
      className="flex items-center gap-2 cursor-pointer group select-none"
    >
      <div className={`w-9 h-5 rounded-full transition-colors duration-200 relative ${checked ? "bg-green-500" : "bg-slate-600"}`}>
        <div className={`w-3.5 h-3.5 rounded-full bg-white absolute top-[3px] transition-all duration-200 shadow-sm ${checked ? "left-[18px]" : "left-[3px]"}`} />
      </div>
      <span className={`text-xs transition ${checked ? "text-white" : "text-slate-400 group-hover:text-slate-300"}`}>{label}</span>
    </div>
  );
}

function StateSelect({ label, value, onChange, required, error }: {
  label: string; value: string; onChange: (v: string) => void; required?: boolean; error?: string;
}) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">
        {label}
        {required && <span className="text-red-400 ml-0.5">*</span>}
      </label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className={`w-full px-3 py-2 bg-white/5 border rounded-lg text-white text-sm focus:outline-none focus:border-gold/50 ${error ? "border-red-500/50" : "border-white/10"}`}>
        <option value="" className="bg-navy">Select...</option>
        <optgroup label="US States">
          {US_STATES.map((s) => <option key={s} value={s} className="bg-navy">{s}</option>)}
        </optgroup>
        <optgroup label="Canadian Provinces">
          {CA_PROVINCES.map((p) => <option key={p} value={p} className="bg-navy">{p}</option>)}
        </optgroup>
      </select>
      {error && <p className="text-red-400 text-[10px] mt-0.5">{error}</p>}
    </div>
  );
}

interface AddressResult { city: string; state: string; zip: string; display: string; }

function AddressAutocomplete({ label, onSelect }: { label: string; onSelect: (addr: AddressResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AddressResult[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) setShowDropdown(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const search = useCallback(async (q: string) => {
    if (q.length < 3) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(q)}&format=json&addressdetails=1&limit=5&countrycodes=us,ca`,
        { headers: { "Accept-Language": "en" } }
      );
      const data = await res.json();
      const parsed: AddressResult[] = data
        .filter((r: any) => r.address && (r.address.city || r.address.town || r.address.village || r.address.county))
        .map((r: any) => {
          const a = r.address;
          const city = a.city || a.town || a.village || a.county || "";
          const state = a["ISO3166-2-lvl4"]?.split("-")[1] || a.state_code || a.state || "";
          const zip = a.postcode || "";
          return { city, state: state.toUpperCase().slice(0, 2), zip, display: r.display_name };
        });
      setResults(parsed);
      setShowDropdown(parsed.length > 0);
    } catch { setResults([]); }
    setLoading(false);
  }, []);

  const handleChange = (val: string) => {
    setQuery(val);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => search(val), 350);
  };

  const handleSelect = (addr: AddressResult) => {
    onSelect(addr);
    setQuery(addr.display.split(",").slice(0, 2).join(",").trim());
    setShowDropdown(false);
  };

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <MapPin className="absolute left-3 top-2.5 w-4 h-4 text-gold" />
        <input
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setShowDropdown(true)}
          placeholder={label}
          className="w-full pl-9 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-gold/50"
        />
        {loading && <div className="absolute right-3 top-2.5 w-4 h-4 border-2 border-gold/30 border-t-gold rounded-full animate-spin" />}
      </div>
      {showDropdown && results.length > 0 && (
        <div className="absolute z-50 top-full mt-1 w-full bg-[#1e293b] border border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto">
          {results.map((r, i) => (
            <button key={i} onClick={() => handleSelect(r)}
              className="w-full text-left px-3 py-2 text-sm text-slate-300 hover:bg-white/10 hover:text-white transition truncate">
              <span className="text-gold font-medium">{r.city}, {r.state}</span>
              {r.zip && <span className="text-slate-500"> {r.zip}</span>}
              <span className="text-slate-600 block text-xs truncate">{r.display}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-slate-400">{label}</span>
      <span className="text-white text-right max-w-[60%]">{value}</span>
    </div>
  );
}
