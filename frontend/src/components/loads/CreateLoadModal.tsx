"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { X, ChevronRight, ChevronLeft, Check } from "lucide-react";

const EQUIPMENT_TYPES = ["Dry Van", "Reefer", "Flatbed", "Step Deck", "Car Hauler", "Power Only"];
const FREIGHT_CLASSES = ["50", "55", "60", "65", "70", "77.5", "85", "92.5", "100", "110", "125", "150", "175", "200", "250", "300", "400", "500"];
const ACCESSORIALS = ["Liftgate", "Inside Delivery", "Detention", "Lumper", "TONU", "Driver Assist", "Hazmat Fee", "Residential"];
const BOND_TYPES = ["Single Entry", "Continuous", "ISF"];
const US_STATES = [
  "AL","AK","AZ","AR","CA","CO","CT","DE","FL","GA","HI","ID","IL","IN","IA","KS","KY","LA","ME","MD",
  "MA","MI","MN","MS","MO","MT","NE","NV","NH","NJ","NM","NY","NC","ND","OH","OK","OR","PA","RI","SC",
  "SD","TN","TX","UT","VT","VA","WA","WV","WI","WY",
];
const CA_PROVINCES = ["AB","BC","MB","NB","NL","NT","NS","NU","ON","PE","QC","SK","YT"];

interface Props { open: boolean; onClose: () => void; }

export function CreateLoadModal({ open, onClose }: Props) {
  const [step, setStep] = useState(1);
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    originCity: "", originState: "", originZip: "",
    destCity: "", destState: "", destZip: "",
    pickupDate: "", deliveryDate: "", distance: "",
    equipmentType: "Dry Van", commodity: "", weight: "", pieces: "",
    length: "", width: "", height: "",
    freightClass: "", hazmat: false, tempMin: "", tempMax: "",
    customsRequired: false, bondType: "",
    rate: "", accessorials: [] as string[], specialInstructions: "",
    contactName: "", contactPhone: "",
  });

  const update = (field: string, value: string | boolean | string[]) => setForm((f) => ({ ...f, [field]: value }));

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
        status,
      };
      if (form.distance) payload.distance = parseFloat(form.distance);
      if (form.weight) payload.weight = parseFloat(form.weight);
      if (form.pieces) payload.pieces = parseInt(form.pieces);
      if (form.length) payload.length = parseFloat(form.length);
      if (form.width) payload.width = parseFloat(form.width);
      if (form.height) payload.height = parseFloat(form.height);
      if (form.freightClass) payload.freightClass = form.freightClass;
      if (form.hazmat) payload.hazmat = true;
      if (form.tempMin) payload.tempMin = parseFloat(form.tempMin);
      if (form.tempMax) payload.tempMax = parseFloat(form.tempMax);
      if (form.customsRequired) payload.customsRequired = true;
      if (form.bondType) payload.bondType = form.bondType;
      if (form.accessorials.length) payload.accessorials = form.accessorials;
      if (form.specialInstructions) payload.specialInstructions = form.specialInstructions;
      if (form.contactName) payload.contactName = form.contactName;
      if (form.contactPhone) payload.contactPhone = form.contactPhone;
      return api.post("/loads", payload);
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["loads"] }); onClose(); setStep(1); },
  });

  const ratePerMile = form.rate && form.distance ? (parseFloat(form.rate) / parseFloat(form.distance)).toFixed(2) : "--";
  const canProceed = step === 1 ? (form.originCity && form.originState && form.originZip && form.destCity && form.destState && form.destZip && form.pickupDate && form.deliveryDate)
    : step === 2 ? (form.equipmentType)
    : step === 3 ? (form.rate && parseFloat(form.rate) > 0)
    : true;

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-navy border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <h2 className="text-lg font-semibold text-white">Create Load — Step {step} of 4</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        {/* Step indicators */}
        <div className="flex px-6 py-3 gap-2">
          {["Route", "Freight", "Pricing", "Review"].map((s, i) => (
            <div key={s} className={`flex-1 text-center text-xs py-1.5 rounded ${step > i + 1 ? "bg-green-500/20 text-green-400" : step === i + 1 ? "bg-gold/20 text-gold" : "bg-white/5 text-slate-500"}`}>{s}</div>
          ))}
        </div>

        <div className="px-6 py-4 space-y-4">
          {step === 1 && (
            <>
              <h3 className="text-sm font-medium text-slate-300">Origin</h3>
              <div className="grid grid-cols-3 gap-3">
                <Input label="City" value={form.originCity} onChange={(v) => update("originCity", v)} />
                <StateSelect label="State/Province" value={form.originState} onChange={(v) => update("originState", v)} />
                <Input label="Zip/Postal" value={form.originZip} onChange={(v) => update("originZip", v)} />
              </div>
              <h3 className="text-sm font-medium text-slate-300 mt-4">Destination</h3>
              <div className="grid grid-cols-3 gap-3">
                <Input label="City" value={form.destCity} onChange={(v) => update("destCity", v)} />
                <StateSelect label="State/Province" value={form.destState} onChange={(v) => update("destState", v)} />
                <Input label="Zip/Postal" value={form.destZip} onChange={(v) => update("destZip", v)} />
              </div>
              <div className="grid grid-cols-3 gap-3 mt-4">
                <Input label="Pickup Date" value={form.pickupDate} onChange={(v) => update("pickupDate", v)} type="date" />
                <Input label="Delivery Date" value={form.deliveryDate} onChange={(v) => update("deliveryDate", v)} type="date" />
                <Input label="Distance (mi)" value={form.distance} onChange={(v) => update("distance", v)} type="number" />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <Select label="Equipment Type" value={form.equipmentType} onChange={(v) => update("equipmentType", v)} options={EQUIPMENT_TYPES} />
              <Input label="Commodity" value={form.commodity} onChange={(v) => update("commodity", v)} placeholder="e.g. Auto Parts, Frozen Foods" />
              <div className="grid grid-cols-3 gap-3">
                <Input label="Weight (lbs)" value={form.weight} onChange={(v) => update("weight", v)} type="number" />
                <Input label="Pieces" value={form.pieces} onChange={(v) => update("pieces", v)} type="number" />
                <Select label="Freight Class" value={form.freightClass} onChange={(v) => update("freightClass", v)} options={["", ...FREIGHT_CLASSES]} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <Input label="Length (ft)" value={form.length} onChange={(v) => update("length", v)} type="number" />
                <Input label="Width (ft)" value={form.width} onChange={(v) => update("width", v)} type="number" />
                <Input label="Height (ft)" value={form.height} onChange={(v) => update("height", v)} type="number" />
              </div>
              <div className="flex gap-6 mt-2">
                <Toggle label="Hazmat" checked={form.hazmat} onChange={(v) => update("hazmat", v)} />
                <Toggle label="Temperature Controlled" checked={form.tempMin !== ""} onChange={(v) => { if (!v) { update("tempMin", ""); update("tempMax", ""); } else { update("tempMin", "33"); update("tempMax", "40"); } }} />
                <Toggle label="Customs Required" checked={form.customsRequired} onChange={(v) => update("customsRequired", v)} />
              </div>
              {form.tempMin !== "" && (
                <div className="grid grid-cols-2 gap-3">
                  <Input label="Min Temp (°F)" value={form.tempMin} onChange={(v) => update("tempMin", v)} type="number" />
                  <Input label="Max Temp (°F)" value={form.tempMax} onChange={(v) => update("tempMax", v)} type="number" />
                </div>
              )}
              {form.customsRequired && (
                <Select label="Bond Type" value={form.bondType} onChange={(v) => update("bondType", v)} options={["", ...BOND_TYPES]} />
              )}
            </>
          )}

          {step === 3 && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <Input label="Rate ($)" value={form.rate} onChange={(v) => update("rate", v)} type="number" />
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
              <div className="grid grid-cols-2 gap-3">
                <Input label="Shipper Contact" value={form.contactName} onChange={(v) => update("contactName", v)} placeholder="Name" />
                <Input label="Phone" value={form.contactPhone} onChange={(v) => update("contactPhone", v)} placeholder="(xxx) xxx-xxxx" />
              </div>
            </>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <h3 className="text-sm font-medium text-gold">Review Load Details</h3>
              <div className="bg-white/5 rounded-lg p-4 space-y-2 text-sm">
                <Row label="Route" value={`${form.originCity}, ${form.originState} ${form.originZip} → ${form.destCity}, ${form.destState} ${form.destZip}`} />
                <Row label="Pickup" value={form.pickupDate} />
                <Row label="Delivery" value={form.deliveryDate} />
                <Row label="Distance" value={form.distance ? `${form.distance} mi` : "—"} />
                <Row label="Equipment" value={form.equipmentType} />
                <Row label="Commodity" value={form.commodity || "—"} />
                <Row label="Weight" value={form.weight ? `${form.weight} lbs` : "—"} />
                <Row label="Rate" value={`$${parseFloat(form.rate || "0").toLocaleString()} (${ratePerMile}/mi)`} />
                {form.hazmat && <Row label="Hazmat" value="Yes" />}
                {form.tempMin && <Row label="Temperature" value={`${form.tempMin}°F - ${form.tempMax}°F`} />}
                {form.customsRequired && <Row label="Customs" value={`Required — ${form.bondType || "TBD"}`} />}
                {form.accessorials.length > 0 && <Row label="Accessorials" value={form.accessorials.join(", ")} />}
                {form.specialInstructions && <Row label="Instructions" value={form.specialInstructions} />}
                {form.contactName && <Row label="Contact" value={`${form.contactName} ${form.contactPhone}`} />}
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
              <button onClick={() => setStep((s) => s + 1)} disabled={!canProceed}
                className="flex items-center gap-1 px-5 py-2 text-sm bg-gold text-navy font-medium rounded-lg hover:bg-gold/90 disabled:opacity-50 disabled:cursor-not-allowed">
                Next <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = "text", placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-gold/50" />
    </div>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-gold/50">
        <option value="" className="bg-navy">Select...</option>
        {options.filter(Boolean).map((o) => <option key={o} value={o} className="bg-navy">{o}</option>)}
      </select>
    </div>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <div className={`w-8 h-4 rounded-full transition ${checked ? "bg-gold" : "bg-white/10"} relative`}>
        <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all ${checked ? "left-4" : "left-0.5"}`} />
      </div>
      <span className="text-xs text-slate-400">{label}</span>
    </label>
  );
}

function StateSelect({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:outline-none focus:border-gold/50">
        <option value="" className="bg-navy">Select...</option>
        <optgroup label="US States">
          {US_STATES.map((s) => <option key={s} value={s} className="bg-navy">{s}</option>)}
        </optgroup>
        <optgroup label="Canadian Provinces">
          {CA_PROVINCES.map((p) => <option key={p} value={p} className="bg-navy">{p}</option>)}
        </optgroup>
      </select>
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
